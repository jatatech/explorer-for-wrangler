import * as path from "node:path";
import * as vscode from "vscode";
import type { AuthService } from "./auth";
import type { RemoteResourceService } from "./remote";
import { CATALOG_ACTIONS, CORE_ACTIONS, REMOTE_ACTIONS } from "./commands";
import { resourceGroups } from "./config";
import { discoverProjects } from "./discovery";
import type { AuthStatus, CloudflareResource, ProjectAction, ResourceGroup, WranglerOperation, WranglerProject } from "./model";

type Node = ProjectNode | SectionNode | ActionNode | AuthNode | OperationNode | EnvironmentNode | GroupNode | ResourceNode | MessageNode;

interface ProjectNode { type: "project"; project: WranglerProject }
interface SectionNode { type: "section"; project: WranglerProject; section: "actions" | "account" | "catalog" | "environments" | "resources" }
interface ActionNode { type: "action"; project: WranglerProject; action: ProjectAction }
interface AuthNode { type: "auth"; project: WranglerProject; status: AuthStatus }
interface OperationNode { type: "operation"; project: WranglerProject; operation: WranglerOperation }
interface EnvironmentNode { type: "environment"; project: WranglerProject; environment?: string }
interface GroupNode { type: "group"; project: WranglerProject; group: ResourceGroup }
export interface ResourceNode { type: "resource"; project: WranglerProject; resource: CloudflareResource }
interface MessageNode { type: "message"; label: string; icon: string }

export class WranglerTreeProvider implements vscode.TreeDataProvider<Node> {
  private readonly changed = new vscode.EventEmitter<Node | undefined | void>();
  readonly onDidChangeTreeData = this.changed.event;
  private projects: WranglerProject[] = [];
  private readonly auth = new Map<string, AuthStatus>();
  private readonly operations = new Map<string, WranglerOperation>();
  private readonly remoteGroups = new Map<string, ResourceGroup[]>();
  private readonly remoteErrors = new Map<string, string[]>();
  private readonly remoteLoading = new Set<string>();

  constructor(private readonly state: vscode.Memento, private readonly authService: AuthService, private readonly remoteService: RemoteResourceService) {}

  async refresh(): Promise<void> {
    this.projects = await discoverProjects();
    for (const project of this.projects) {
      this.auth.set(project.configUri.toString(), { state: "checking", label: "Checking authentication…" });
    }
    this.changed.fire();
    void Promise.all(this.projects.map((project) => this.refreshAuth(project)));
  }

  getProjects(): readonly WranglerProject[] { return this.projects; }

  refreshTree(): void { this.changed.fire(); }

  findProject(configUri: string): WranglerProject | undefined {
    return this.projects.find((project) => project.configUri.toString() === configUri);
  }

  getAuthStatus(project: WranglerProject): AuthStatus | undefined {
    return this.auth.get(project.configUri.toString());
  }

  getProjectForUri(uri: vscode.Uri): WranglerProject | undefined {
    return this.projects
      .filter((project) => {
        const relative = path.relative(project.rootUri.fsPath, uri.fsPath);
        return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
      })
      .sort((a, b) => b.rootUri.fsPath.length - a.rootUri.fsPath.length)[0];
  }

  setOperation(operation: WranglerOperation): void {
    const current = this.operations.get(operation.projectKey);
    if (current && current.startedAt > operation.startedAt) return;
    this.operations.set(operation.projectKey, operation);
    this.changed.fire();
  }

  async refreshRemote(project: WranglerProject): Promise<void> {
    const key = project.configUri.toString();
    if (this.remoteLoading.has(key)) {
      void vscode.window.showInformationMessage(`Account resources for ${project.name} are already refreshing.`);
      return;
    }
    this.remoteLoading.add(key);
    this.changed.fire();
    try {
      const discovered = await this.remoteService.discover(project, this.getEnvironment(project));
      this.remoteGroups.set(key, discovered.groups);
      this.remoteErrors.set(key, discovered.errors);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.remoteErrors.set(key, [message]);
      void vscode.window.showErrorMessage(`Could not refresh account resources for ${project.name}: ${message}`);
    } finally {
      this.remoteLoading.delete(key);
      this.changed.fire();
    }
  }

  async refreshAuth(project: WranglerProject): Promise<void> {
    this.auth.set(project.configUri.toString(), { state: "checking", label: "Checking authentication…" });
    this.changed.fire();
    const status = await this.authService.check(project);
    this.auth.set(project.configUri.toString(), status);
    this.changed.fire();
  }

  getEnvironment(project: WranglerProject): string | undefined {
    return this.state.get<string>(environmentKey(project));
  }

  async setEnvironment(project: WranglerProject, environment?: string): Promise<void> {
    await this.state.update(environmentKey(project), environment);
    this.changed.fire();
  }

  getTreeItem(node: Node): vscode.TreeItem {
    switch (node.type) {
      case "project": return this.projectItem(node);
      case "section": return this.sectionItem(node);
      case "action": return this.actionItem(node);
      case "auth": return this.authItem(node);
      case "operation": return this.operationItem(node);
      case "environment": return this.environmentItem(node);
      case "group": return this.groupItem(node);
      case "resource": return this.resourceItem(node);
      case "message": {
        const item = new vscode.TreeItem(node.label);
        item.iconPath = new vscode.ThemeIcon(node.icon);
        return item;
      }
    }
  }

  async getChildren(node?: Node): Promise<Node[]> {
    if (!node) {
      if (this.projects.length === 0) {
        await this.refresh();
      }
      return this.projects.length > 0
        ? this.projects.map((project) => ({ type: "project", project }))
        : [];
    }
    if (node.type === "project") {
      if (node.project.parseError) {
        return [{ type: "message", label: `Invalid config: ${node.project.parseError}`, icon: "error" }];
      }
      const recent = this.operations.get(node.project.configUri.toString());
      const sections: Node[] = [
        { type: "section", project: node.project, section: "actions" },
        { type: "section", project: node.project, section: "account" },
        { type: "section", project: node.project, section: "catalog" }
      ];
      if (recent) sections.unshift({ type: "operation", project: node.project, operation: recent });
      if (node.project.environments.length > 0) {
        sections.push({ type: "section", project: node.project, section: "environments" });
      }
      if (resourceGroups(node.project.config, this.getEnvironment(node.project)).length > 0) {
        sections.push({ type: "section", project: node.project, section: "resources" });
      }
      return sections;
    }
    if (node.type === "section") {
      switch (node.section) {
        case "actions": return CORE_ACTIONS.map((action) => ({ type: "action", project: node.project, action }));
        case "account": {
          const status = this.auth.get(node.project.configUri.toString()) ?? { state: "checking" as const, label: "Checking authentication…" };
          const actions = REMOTE_ACTIONS.filter((action) =>
            (action.command !== "explorerForWrangler.login" || status.state !== "loggedIn") &&
            (action.command !== "explorerForWrangler.logout" || status.state !== "loggedOut"));
          return [
            { type: "auth", project: node.project, status },
            ...actions.map((action) => ({ type: "action" as const, project: node.project, action }))
          ];
        }
        case "catalog": {
          const key = node.project.configUri.toString();
          if (!this.remoteGroups.has(key) && !this.remoteLoading.has(key) && this.auth.get(key)?.state === "loggedIn") {
            void this.refreshRemote(node.project);
          }
          const refresh: ActionNode = { type: "action", project: node.project, action: {
            command: "explorerForWrangler.refreshRemote", label: this.remoteLoading.has(key) ? "Refreshing…" : "Refresh Account Resources", icon: this.remoteLoading.has(key) ? "sync~spin" : "refresh", description: "discover resources with Wrangler"
          } };
          const groups = (this.remoteGroups.get(key) ?? []).map((group) => ({ type: "group" as const, project: node.project, group }));
          const errors = this.remoteErrors.get(key) ?? [];
          if (groups.length > 0) return [refresh, ...groups, ...(errors.length ? [{ type: "message" as const, label: `${errors.length} resource types could not be refreshed`, icon: "warning" }] : [])];
          return [refresh, ...CATALOG_ACTIONS.map((action) => ({ type: "action" as const, project: node.project, action }))];
        }
        case "environments": return [
          { type: "environment", project: node.project, environment: undefined },
          ...node.project.environments.map((environment) => ({ type: "environment" as const, project: node.project, environment }))
        ];
        case "resources": return resourceGroups(node.project.config, this.getEnvironment(node.project))
          .map((group) => ({ type: "group", project: node.project, group }));
      }
    }
    if (node.type === "group") {
      return node.group.resources.map((resource) => ({ type: "resource", project: node.project, resource }));
    }
    return [];
  }

  private projectItem(node: ProjectNode): vscode.TreeItem {
    const item = new vscode.TreeItem(node.project.name, vscode.TreeItemCollapsibleState.Expanded);
    const environment = this.getEnvironment(node.project);
    item.description = environment ? `env: ${environment}` : "top level";
    item.tooltip = new vscode.MarkdownString(
      `**${node.project.name}**\n\nConfig: \`${path.basename(node.project.configUri.fsPath)}\`\n\nEnvironment: ${environment ?? "top level"}`
    );
    item.iconPath = new vscode.ThemeIcon(node.project.parseError ? "error" : "cloud");
    item.contextValue = "project";
    return item;
  }

  private sectionItem(node: SectionNode): vscode.TreeItem {
    const labels = { actions: "Actions", account: "Cloudflare", catalog: "Account Resources", environments: "Environment", resources: "Configured Bindings" };
    const icons = { actions: "play-circle", account: "globe", catalog: "server", environments: "settings", resources: "server-environment" };
    const item = new vscode.TreeItem(labels[node.section], vscode.TreeItemCollapsibleState.Expanded);
    item.iconPath = new vscode.ThemeIcon(icons[node.section]);
    return item;
  }

  private actionItem(node: ActionNode): vscode.TreeItem {
    const item = new vscode.TreeItem(node.action.label);
    item.description = node.action.description;
    item.iconPath = new vscode.ThemeIcon(node.action.icon);
    item.command = { command: node.action.command, title: node.action.label, arguments: [node.project] };
    return item;
  }

  private authItem(node: AuthNode): vscode.TreeItem {
    const item = new vscode.TreeItem(node.status.label);
    item.description = node.status.detail;
    item.tooltip = node.status.detail;
    item.iconPath = new vscode.ThemeIcon(
      node.status.state === "loggedIn"
        ? "verified-filled"
        : node.status.state === "checking"
          ? "sync~spin"
          : node.status.state === "loggedOut"
            ? "warning"
            : "error"
    );
    item.contextValue = `auth.${node.status.state}`;
    item.command = { command: "explorerForWrangler.whoami", title: "Show full authentication status", arguments: [node.project] };
    return item;
  }

  private operationItem(node: OperationNode): vscode.TreeItem {
    const item = new vscode.TreeItem(operationLabel(node.operation));
    item.description = node.operation.finishedAt ? relativeTime(node.operation.finishedAt) : "running";
    item.tooltip = `${node.operation.label}: ${node.operation.detail ?? node.operation.state}. Click to show Explorer for Wrangler output.`;
    item.iconPath = new vscode.ThemeIcon(
      node.operation.state === "running"
        ? "sync~spin"
        : node.operation.state === "succeeded"
          ? "pass-filled"
          : node.operation.state === "cancelled"
            ? "circle-slash"
            : "error"
    );
    item.contextValue = "operation";
    item.command = { command: "explorerForWrangler.showOutput", title: "Show Explorer for Wrangler Output" };
    return item;
  }

  private environmentItem(node: EnvironmentNode): vscode.TreeItem {
    const active = this.getEnvironment(node.project) === node.environment;
    const label = node.environment ?? "Top level";
    const item = new vscode.TreeItem(label);
    item.description = active ? "active" : undefined;
    item.iconPath = new vscode.ThemeIcon(active ? "check" : "circle-outline");
    item.command = {
      command: "explorerForWrangler.selectEnvironment",
      title: `Use ${label}`,
      arguments: [node.project, node.environment, true]
    };
    return item;
  }

  private groupItem(node: GroupNode): vscode.TreeItem {
    const item = new vscode.TreeItem(node.group.label, vscode.TreeItemCollapsibleState.Collapsed);
    item.description = String(node.group.resources.length);
    item.iconPath = new vscode.ThemeIcon(node.group.icon);
    return item;
  }

  private resourceItem(node: ResourceNode): vscode.TreeItem {
    const item = new vscode.TreeItem(node.resource.name);
    const operation = this.operations.get(node.project.configUri.toString());
    const busy = operation?.state === "running" && operation.command?.split(/\s+/).includes(node.resource.name);
    item.description = busy ? "running" : node.resource.binding === node.resource.name ? undefined : node.resource.binding;
    item.tooltip = new vscode.MarkdownString(
      `**${node.resource.name}**\n\n${node.resource.source === "remote" ? "Remote account resource" : `Binding: \`${node.resource.binding}\``}${node.resource.id ? `\n\nID: \`${node.resource.id}\`` : ""}`
    );
    item.iconPath = new vscode.ThemeIcon(busy ? "sync~spin" : resourceIcon(node.resource.kind));
    item.contextValue = `resource.${node.resource.kind}`;
    return item;
  }
}

function environmentKey(project: WranglerProject): string {
  return `environment:${project.configUri.toString()}`;
}

function resourceIcon(kind: CloudflareResource["kind"]): string {
  switch (kind) {
    case "d1": return "database";
    case "r2": return "archive";
    case "kv": return "key";
    case "queue": return "list-ordered";
    case "durable-object": return "symbol-class";
    case "vectorize": return "symbol-array";
    case "hyperdrive": return "database";
    case "workflow": return "run-all";
    case "pipeline": return "server-process";
    case "secrets-store": return "lock";
  }
}

function operationLabel(operation: WranglerOperation): string {
  const prefix = operation.state === "running"
    ? "Running"
    : operation.state === "succeeded"
      ? "Completed"
      : operation.state === "cancelled"
        ? "Cancelled"
        : "Failed";
  return `${prefix}: ${operation.label}`;
}

function relativeTime(timestamp: number): string {
  const seconds = Math.max(0, Math.round((Date.now() - timestamp) / 1_000));
  if (seconds < 10) return "just now";
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  return `${Math.round(minutes / 60)}h ago`;
}
