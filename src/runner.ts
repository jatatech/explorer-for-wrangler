import * as fs from "node:fs";
import * as path from "node:path";
import * as vscode from "vscode";
import { withEnvironment } from "./commands";
import { detectPackageManager, installWranglerCommand } from "./packageManager";
import type { WranglerExecutable, WranglerProject } from "./model";

export class WranglerRunner {
  async run(project: WranglerProject, args: readonly string[], environment?: string, label?: string): Promise<void> {
    const executable = await this.resolveOrPrompt(project);
    if (!executable) return;
    const task = this.createTask(project, executable.command, withEnvironment(args, environment), label ?? args.join(" "));
    await vscode.tasks.executeTask(task);
  }

  async resolveOrPrompt(project: WranglerProject): Promise<WranglerExecutable | undefined> {
    const executable = await this.resolve(project);
    if (!executable) {
      const choice = await vscode.window.showWarningMessage(
        `Wrangler was not found in ${project.name} or on the system PATH.`,
        "Install in Project",
        "Configure Path",
        "Cancel"
      );
      if (choice === "Install in Project") {
        await this.install(project);
      } else if (choice === "Configure Path") {
        await vscode.commands.executeCommand("workbench.action.openSettings", "wranglerExplorer.wranglerPath");
      }
      return undefined;
    }
    return executable;
  }

  async resolve(project: WranglerProject): Promise<WranglerExecutable | undefined> {
    return this.resolveForFolder(project.workspaceFolder, project.rootUri);
  }

  async resolveForFolder(folder: vscode.WorkspaceFolder, cwd = folder.uri): Promise<WranglerExecutable | undefined> {
    const configuration = vscode.workspace.getConfiguration("wranglerExplorer", cwd);
    const configured = configuration.get<string>("wranglerPath", "").trim();
    if (configured) {
      const expanded = configured.startsWith("~")
        ? path.join(process.env.HOME ?? process.env.USERPROFILE ?? "", configured.slice(1))
        : configured;
      if (path.isAbsolute(expanded) && fs.existsSync(expanded)) {
        return { command: expanded, source: "configured" };
      }
    }

    const local = findLocalWrangler(cwd.fsPath, folder.uri.fsPath);
    const preferLocal = configuration.get<boolean>("preferLocalWrangler", true);
    if (preferLocal && local) return { command: local, source: "local" };
    if (await commandExists("wrangler", cwd.fsPath)) return { command: "wrangler", source: "system" };
    if (local) return { command: local, source: "local" };
    return undefined;
  }

  async install(project: WranglerProject): Promise<void> {
    const detected = detectPackageManager(project.rootUri.fsPath, project.workspaceFolder.uri.fsPath);
    await this.installInFolder(project.workspaceFolder, vscode.Uri.file(detected.root));
  }

  async installInFolder(folder: vscode.WorkspaceFolder, cwd = folder.uri): Promise<void> {
    const detected = detectPackageManager(cwd.fsPath, folder.uri.fsPath);
    const [command, args] = installWranglerCommand(detected.manager);
    await vscode.tasks.executeTask(this.createFolderTask(folder, vscode.Uri.file(detected.root), command, args, "Install Wrangler"));
  }

  async runInFolder(folder: vscode.WorkspaceFolder, args: readonly string[], label: string): Promise<void> {
    const executable = await this.resolveForFolder(folder);
    if (!executable) {
      const choice = await vscode.window.showWarningMessage("Wrangler is not available in this workspace folder.", "Install Locally", "Configure Path");
      if (choice === "Install Locally") await this.installInFolder(folder);
      if (choice === "Configure Path") await vscode.commands.executeCommand("workbench.action.openSettings", "wranglerExplorer.wranglerPath");
      return;
    }
    await vscode.tasks.executeTask(this.createFolderTask(folder, folder.uri, executable.command, args, label));
  }

  createExternalTask(folder: vscode.WorkspaceFolder, cwd: vscode.Uri, command: string, args: readonly string[], label: string): vscode.Task {
    return this.createFolderTask(folder, cwd, command, args, label);
  }

  private createTask(project: WranglerProject, command: string, args: readonly string[], label: string): vscode.Task {
    return this.createFolderTask(project.workspaceFolder, project.rootUri, command, args, label, project.configUri.toString());
  }

  private createFolderTask(
    folder: vscode.WorkspaceFolder,
    cwd: vscode.Uri,
    command: string,
    args: readonly string[],
    label: string,
    project = cwd.toString()
  ): vscode.Task {
    const execution = new vscode.ShellExecution(command, [...args], { cwd: cwd.fsPath });
    const task = new vscode.Task(
      { type: "wrangler", project, command: args.join(" ") },
      folder,
      label,
      "Explorer for Wrangler",
      execution
    );
    const revealSetting = vscode.workspace
      .getConfiguration("wranglerExplorer")
      .get<"always" | "silent" | "never">("revealTaskTerminal", "always");
    task.presentationOptions = {
      reveal: revealSetting === "always"
        ? vscode.TaskRevealKind.Always
        : revealSetting === "silent"
          ? vscode.TaskRevealKind.Silent
          : vscode.TaskRevealKind.Never,
      panel: vscode.TaskPanelKind.Dedicated,
      showReuseMessage: false,
      clear: false
    };
    return task;
  }
}

function findLocalWrangler(start: string, boundary: string): string | undefined {
  const binary = process.platform === "win32" ? "wrangler.cmd" : "wrangler";
  let current = start;
  while (current.startsWith(boundary)) {
    const candidate = path.join(current, "node_modules", ".bin", binary);
    if (fs.existsSync(candidate)) return candidate;
    if (current === boundary) break;
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return undefined;
}

async function commandExists(command: string, cwd: string): Promise<boolean> {
  const childProcess = await import("node:child_process");
  return new Promise((resolve) => {
    const child = childProcess.spawn(command, ["--version"], {
      cwd,
      shell: process.platform === "win32",
      stdio: "ignore"
    });
    const timer = setTimeout(() => child.kill(), 5_000);
    child.once("error", () => { clearTimeout(timer); resolve(false); });
    child.once("exit", (code) => { clearTimeout(timer); resolve(code === 0); });
  });
}
