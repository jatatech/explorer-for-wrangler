import * as vscode from "vscode";
import type { WranglerProject } from "./model";
import type { WranglerTreeProvider } from "./tree";

export class WranglerStatusBar implements vscode.Disposable {
  private readonly item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 50);
  private readonly disposables: vscode.Disposable[] = [this.item];
  private project?: WranglerProject;

  constructor(private readonly provider: WranglerTreeProvider) {
    this.item.name = "Wrangler Project";
    this.item.command = "wranglerExplorer.statusMenu";
    this.disposables.push(
      vscode.window.onDidChangeActiveTextEditor(() => this.refresh()),
      provider.onDidChangeTreeData(() => this.refresh())
    );
    this.refresh();
  }

  dispose(): void {
    for (const disposable of this.disposables) disposable.dispose();
  }

  getProject(): WranglerProject | undefined { return this.project; }

  refresh(): void {
    const editor = vscode.window.activeTextEditor;
    this.project = editor ? this.provider.getProjectForUri(editor.document.uri) : undefined;
    if (!this.project) {
      this.item.hide();
      return;
    }

    const environment = this.provider.getEnvironment(this.project);
    const auth = this.provider.getAuthStatus(this.project);
    const authIndicator = auth?.state === "error" || auth?.state === "loggedOut" ? " $(warning)" : "";
    this.item.text = `$(explorer-for-wrangler) ${this.project.name} · ${environment ?? "top level"}${authIndicator}`;
    this.item.tooltip = statusTooltip(this.project, environment, auth);
    this.item.show();
  }
}

function statusTooltip(
  project: WranglerProject,
  environment: string | undefined,
  auth: ReturnType<WranglerTreeProvider["getAuthStatus"]>
): vscode.MarkdownString {
  const tooltip = new vscode.MarkdownString(undefined, true);
  tooltip.appendMarkdown(`**Explorer for Wrangler**\n\n`);
  tooltip.appendMarkdown(`Project: \`${project.name}\`  \n`);
  tooltip.appendMarkdown(`Environment: \`${environment ?? "top level"}\`  \n`);
  tooltip.appendMarkdown(`Authentication: ${auth?.label ?? "Checking…"}  \n`);
  if (auth?.executable) {
    const version = auth.executable.version ? ` ${auth.executable.version}` : "";
    tooltip.appendMarkdown(`Wrangler: ${auth.executable.source}${version}`);
  }
  tooltip.isTrusted = false;
  return tooltip;
}
