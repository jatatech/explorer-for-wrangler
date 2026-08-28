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
  private readonly busyChanged = new vscode.EventEmitter<string>();
  readonly onDidBusyChange = this.busyChanged.event;
  private readonly recent = new Map<string, WranglerOperation>();
  private readonly inFlight = new Map<string, Promise<WranglerResult | undefined>>();

  constructor(
    private readonly runner: WranglerRunner,
    private readonly output: vscode.OutputChannel,
    private readonly diagnostics?: vscode.DiagnosticCollection
  ) {}

  dispose(): void {
    this.inFlight.clear();
    this.changed.dispose();
    this.busyChanged.dispose();
  }

  getRecent(project: WranglerProject): WranglerOperation | undefined {
    return this.recent.get(project.configUri.toString());
  }

  showOutput(): void { this.output.show(true); }

  clearOutput(): void { this.output.clear(); }

  isBusy(project: WranglerProject, args: readonly string[], environment?: string): boolean {
    return this.inFlight.has(operationKey(project, args, environment));
  }

  async run(
    project: WranglerProject,
    args: readonly string[],
    label: string,
    options: OperationOptions = {}
  ): Promise<WranglerResult | undefined> {
    const key = operationKey(project, args, options.environment);
    if (this.inFlight.has(key)) {
      void vscode.window.showInformationMessage(`${label} is already running.`);
      return undefined;
    }
    const pending = this.runUnlocked(project, args, label, options);
    this.inFlight.set(key, pending);
    this.busyChanged.fire(project.configUri.toString());
    try {
      return await pending;
    } finally {
      this.inFlight.delete(key);
      this.busyChanged.fire(project.configUri.toString());
    }
  }

  private async runUnlocked(
    project: WranglerProject,
    args: readonly string[],
    label: string,
    options: OperationOptions
  ): Promise<WranglerResult | undefined> {
    const executable = await this.runner.resolveOrPrompt(project);
    if (!executable) return undefined;
    const clearBeforeCommand = vscode.workspace
      .getConfiguration("explorerForWrangler", project.configUri)
      .get<boolean>("clearOutputBeforeCommand", false);
    if (clearBeforeCommand) this.clearOutput();
    const scopedArgs = withEnvironment(args, options.environment);
    const operation: WranglerOperation = {
      projectKey: project.configUri.toString(),
      label,
      state: "running",
      startedAt: Date.now(),
      detail: `${executable.source} Wrangler`,
      command: scopedArgs.join(" ")
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
    this.updateDiagnostics(project, result);

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

  async capture(project: WranglerProject, args: readonly string[], environment?: string): Promise<WranglerResult | undefined> {
    const key = operationKey(project, args, environment);
    if (this.inFlight.has(key)) return undefined;
    const pending = (async () => {
      const executable = await this.runner.resolve(project);
      if (!executable) return undefined;
      return this.execute(executable.command, withEnvironment(args, environment), project);
    })();
    this.inFlight.set(key, pending);
    this.busyChanged.fire(project.configUri.toString());
    try {
      return await pending;
    } finally {
      this.inFlight.delete(key);
      this.busyChanged.fire(project.configUri.toString());
    }
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

  private updateDiagnostics(project: WranglerProject, result: WranglerResult): void {
    if (!this.diagnostics) return;
    const byUri = new Map<string, { uri: vscode.Uri; diagnostics: vscode.Diagnostic[] }>();
    for (const line of `${result.stderr}\n${result.stdout}`.split(/\r?\n/)) {
      const match = /(?:^|\s)([^:\s][^:]*):(\d+):(\d+)\s*[-:]?\s*(warning|error)?\s*:?[\s]*(.+)$/i.exec(line.trim());
      const severity = /warn/i.test(match?.[4] ?? line) ? vscode.DiagnosticSeverity.Warning : vscode.DiagnosticSeverity.Error;
      const file = match?.[1];
      const uri = file && !file.includes(" ") ? vscode.Uri.joinPath(project.rootUri, file) : project.configUri;
      const lineNumber = Math.max(0, Number(match?.[2] ?? 1) - 1);
      const column = Math.max(0, Number(match?.[3] ?? 1) - 1);
      const message = (match?.[5] ?? line).trim();
      if (!message || (!match && result.code === 0)) continue;
      const key = uri.toString();
      const bucket = byUri.get(key) ?? { uri, diagnostics: [] };
      bucket.diagnostics.push(new vscode.Diagnostic(new vscode.Range(lineNumber, column, lineNumber, column + 1), message, severity));
      byUri.set(key, bucket);
    }
    this.diagnostics.clear();
    for (const { uri, diagnostics } of byUri.values()) this.diagnostics.set(uri, diagnostics.slice(0, 100));
  }
}

export function operationKey(project: WranglerProject, args: readonly string[], environment?: string): string {
  return JSON.stringify([project.configUri.toString(), environment ?? "", ...args]);
}

function exitDetail(result: WranglerResult): string {
  if (result.cancelled) return "cancelled";
  return result.code === 0 ? "completed" : `exit code ${result.code ?? "unknown"}`;
}
