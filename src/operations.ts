import { spawn } from "node:child_process";
import * as vscode from "vscode";
import { withEnvironment } from "./commands";
import type { WranglerOperation, WranglerProject, WranglerResult } from "./model";
import type { WranglerRunner } from "./runner";

export interface OperationOptions {
  environment?: string;
  progress?: boolean;
  revealOutput?: boolean;
  notifySuccess?: boolean;
}

export class WranglerOperations implements vscode.Disposable {
  private readonly changed = new vscode.EventEmitter<WranglerOperation>();
  readonly onDidChange = this.changed.event;
  private readonly recent = new Map<string, WranglerOperation>();

  constructor(
    private readonly runner: WranglerRunner,
    private readonly output: vscode.OutputChannel
  ) {}

  dispose(): void { this.changed.dispose(); }

  getRecent(project: WranglerProject): WranglerOperation | undefined {
    return this.recent.get(project.configUri.toString());
  }

  showOutput(): void { this.output.show(true); }

  clearOutput(): void { this.output.clear(); }

  async run(
    project: WranglerProject,
    args: readonly string[],
    label: string,
    options: OperationOptions = {}
  ): Promise<WranglerResult | undefined> {
    const executable = await this.runner.resolveOrPrompt(project);
    if (!executable) return undefined;
    const clearBeforeCommand = vscode.workspace
      .getConfiguration("wranglerExplorer", project.configUri)
      .get<boolean>("clearOutputBeforeCommand", false);
    if (clearBeforeCommand) this.clearOutput();
    const scopedArgs = withEnvironment(args, options.environment);
    const operation: WranglerOperation = {
      projectKey: project.configUri.toString(),
      label,
      state: "running",
      startedAt: Date.now(),
      detail: `${executable.source} Wrangler`
    };
    this.update(operation);
    this.output.appendLine("");
    this.output.appendLine(`[${new Date().toLocaleTimeString()}] ${project.name}: ${label}`);
    this.output.appendLine(`> wrangler ${scopedArgs.join(" ")}`);

    let result: WranglerResult;
    if (options.progress) {
      result = await vscode.window.withProgress(
        { location: vscode.ProgressLocation.Notification, title: `${label} — ${project.name}`, cancellable: true },
        (_progress, token) => this.execute(executable.command, scopedArgs, project, token)
      );
    } else {
      result = await this.execute(executable.command, scopedArgs, project);
    }

    const state = result.cancelled ? "cancelled" : result.code === 0 ? "succeeded" : "failed";
    this.update({ ...operation, state, finishedAt: Date.now(), detail: exitDetail(result) });

    if (options.revealOutput) this.showOutput();
    if (state === "succeeded" && options.notifySuccess !== false) {
      const choice = await vscode.window.showInformationMessage(`${label} completed.`, "Show Output");
      if (choice === "Show Output") this.showOutput();
    } else if (state === "failed") {
      const choice = await vscode.window.showErrorMessage(`${label} failed.`, "Show Output", "Open Terminal");
      if (choice === "Show Output") this.showOutput();
      if (choice === "Open Terminal") await this.runner.run(project, args, options.environment, label);
    } else if (state === "cancelled") {
      const choice = await vscode.window.showInformationMessage(`${label} cancelled.`, "Show Output");
      if (choice === "Show Output") this.showOutput();
    }
    return result;
  }

  private execute(
    command: string,
    args: string[],
    project: WranglerProject,
    token?: vscode.CancellationToken
  ): Promise<WranglerResult> {
    return new Promise((resolve) => {
      let stdout = "";
      let stderr = "";
      let cancelled = false;
      let settled = false;
      const finish = (result: WranglerResult) => {
        if (!settled) {
          settled = true;
          resolve(result);
        }
      };
      const child = spawn(command, args, {
        cwd: project.rootUri.fsPath,
        shell: process.platform === "win32",
        env: { ...process.env, NO_COLOR: "1" }
      });
      const cancellation = token?.onCancellationRequested(() => {
        cancelled = true;
        child.kill();
      });
      child.stdout?.on("data", (chunk: Buffer) => {
        const value = chunk.toString();
        stdout += value;
        this.output.append(value);
      });
      child.stderr?.on("data", (chunk: Buffer) => {
        const value = chunk.toString();
        stderr += value;
        this.output.append(value);
      });
      child.once("error", (error) => {
        cancellation?.dispose();
        this.output.appendLine(error.message);
        finish({ code: null, stdout, stderr: `${stderr}${error.message}`, cancelled });
      });
      child.once("close", (code) => {
        cancellation?.dispose();
        this.output.appendLine(`\nProcess finished with exit code ${code ?? "unknown"}.`);
        finish({ code, stdout, stderr, cancelled });
      });
    });
  }

  private update(operation: WranglerOperation): void {
    const current = this.recent.get(operation.projectKey);
    if (current && current.startedAt > operation.startedAt) return;
    this.recent.set(operation.projectKey, operation);
    this.changed.fire(operation);
  }
}

function exitDetail(result: WranglerResult): string {
  if (result.cancelled) return "cancelled";
  return result.code === 0 ? "completed" : `exit code ${result.code ?? "unknown"}`;
}
