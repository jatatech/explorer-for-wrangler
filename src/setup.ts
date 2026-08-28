import * as path from "node:path";
import * as vscode from "vscode";
import { createCloudflareCommand, detectPackageManager, installWranglerCommand } from "./packageManager";
import type { WranglerProject } from "./model";
import type { WranglerRunner } from "./runner";

export class SetupService {
  constructor(private readonly runner: WranglerRunner) {}

  async refreshContext(hasProjects: boolean): Promise<void> {
    await vscode.commands.executeCommand("setContext", "explorerForWrangler.hasProjects", hasProjects);
    const folders = vscode.workspace.workspaceFolders ?? [];
    await vscode.commands.executeCommand("setContext", "explorerForWrangler.hasWorkspaceFolders", folders.length > 0);
    const available = !hasProjects && (await Promise.all(folders.map((folder) => this.runner.resolveForFolder(folder)))).some(Boolean);
    await vscode.commands.executeCommand("setContext", "explorerForWrangler.hasWrangler", available);
  }

  async installLocal(): Promise<void> {
    const folder = await pickWorkspaceFolder();
    if (folder) await this.runner.installInFolder(folder);
  }

  async configureExecutable(): Promise<void> {
    await vscode.commands.executeCommand("workbench.action.openSettings", "explorerForWrangler.wranglerPath");
  }

  async createProject(): Promise<void> {
    const folder = await pickWorkspaceFolder();
    if (!folder) return;
    const name = await vscode.window.showInputBox({
      title: "Create Cloudflare Worker project",
      prompt: "New project folder name",
      placeHolder: "my-worker",
      validateInput: validateWorkerName
    });
    if (!name) return;
    const { manager } = detectPackageManager(folder.uri.fsPath);
    const [command, args] = createCloudflareCommand(manager, name);
    await this.runner.runExternalTask(folder, folder.uri, command, args, "Create Cloudflare Project");
  }

  async initializeHere(): Promise<void> {
    const folder = await pickWorkspaceFolder();
    if (!folder) return;
    const confirmed = await vscode.window.showWarningMessage(
      `Initialize a basic Worker in “${folder.name}”? Wrangler may create or modify project files.`,
      { modal: true },
      "Initialize"
    );
    if (confirmed) await this.runner.runInFolder(folder, ["init"], "Initialize Wrangler Project");
  }

  async importFromDashboard(): Promise<void> {
    const folder = await pickWorkspaceFolder();
    if (!folder) return;
    const worker = await vscode.window.showInputBox({
      title: "Import Worker from Cloudflare",
      prompt: "Dashboard Worker name",
      validateInput: validateWorkerName
    });
    if (worker) await this.runner.runInFolder(folder, ["init", "--from-dash", worker], "Import Worker from Dashboard");
  }

  async addConfig(): Promise<void> {
    const folder = await pickWorkspaceFolder();
    if (!folder) return;
    const configUri = vscode.Uri.joinPath(folder.uri, "wrangler.jsonc");
    if (await exists(configUri)) {
      await vscode.window.showInformationMessage(`${configUri.fsPath} already exists.`);
      await vscode.window.showTextDocument(configUri);
      return;
    }
    const name = await vscode.window.showInputBox({
      title: "Add Wrangler configuration",
      prompt: "Worker name",
      value: path.basename(folder.uri.fsPath).toLowerCase().replace(/[^a-z0-9-]+/g, "-"),
      validateInput: validateWorkerName
    });
    if (!name) return;
    const main = await vscode.window.showInputBox({
      title: "Add Wrangler configuration",
      prompt: "Worker entry point",
      value: "src/index.ts",
      validateInput: (value) => value.trim() ? undefined : "Enter an entry-point path."
    });
    if (!main) return;
    const confirmed = await vscode.window.showInformationMessage(
      `Create wrangler.jsonc in “${folder.name}”? No source files will be changed.`,
      { modal: true },
      "Create Configuration"
    );
    if (!confirmed) return;
    const config = {
      $schema: "./node_modules/wrangler/config-schema.json",
      name,
      main: main.trim(),
      compatibility_date: new Date().toISOString().slice(0, 10)
    };
    await vscode.workspace.fs.writeFile(configUri, new TextEncoder().encode(`${JSON.stringify(config, null, 2)}\n`));
    await vscode.window.showTextDocument(configUri);
  }

  async updateWrangler(project: WranglerProject): Promise<void> {
    const executable = await this.runner.resolve(project);
    if (!executable) {
      await this.runner.install(project);
      return;
    }
    if (executable.source !== "local") {
      await vscode.window.showInformationMessage(
        `${executable.source === "system" ? "System-wide" : "Configured"} Wrangler installations are externally managed. Update it with the tool that installed it.`
      );
      return;
    }
    const packageRoot = path.dirname(path.dirname(path.dirname(executable.command)));
    const { manager } = detectPackageManager(packageRoot);
    const [command, args] = installWranglerCommand(manager);
    const confirmed = await vscode.window.showInformationMessage(
      `Update the project-local Wrangler dependency in ${packageRoot}?`,
      { modal: true },
      "Update Wrangler"
    );
    if (confirmed) {
      const cwd = vscode.Uri.file(packageRoot);
      await this.runner.runExternalTask(project.workspaceFolder, cwd, command, args, "Update Wrangler");
    }
  }
}

async function pickWorkspaceFolder(): Promise<vscode.WorkspaceFolder | undefined> {
  const folders = vscode.workspace.workspaceFolders ?? [];
  if (folders.length === 0) {
    await vscode.window.showWarningMessage("Open a folder before setting up a Wrangler project.");
    return undefined;
  }
  if (folders.length === 1) return folders[0];
  const selected = await vscode.window.showQuickPick(
    folders.map((folder) => ({ label: folder.name, description: folder.uri.fsPath, folder })),
    { title: "Select a workspace folder" }
  );
  return selected?.folder;
}

async function exists(uri: vscode.Uri): Promise<boolean> {
  try {
    await vscode.workspace.fs.stat(uri);
    return true;
  } catch {
    return false;
  }
}

function validateWorkerName(value: string): string | undefined {
  if (!value) return "Enter a Worker name.";
  if (value.length > 63) return "Use no more than 63 characters.";
  return /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(value)
    ? undefined
    : "Use lowercase letters, digits, and internal hyphens.";
}
