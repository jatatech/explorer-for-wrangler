import * as vscode from "vscode";
import { AuthService } from "./auth";
import { WranglerOperations, type OperationOptions } from "./operations";
import { WranglerRunner } from "./runner";
import { SetupService } from "./setup";
import { WranglerStatusBar } from "./statusBar";
import { WranglerTreeProvider, type ResourceNode } from "./tree";
import type { WranglerProject } from "./model";

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  const runner = new WranglerRunner();
  const setup = new SetupService(runner);
  const output = vscode.window.createOutputChannel("Explorer for Wrangler");
  const operations = new WranglerOperations(runner, output);
  const provider = new WranglerTreeProvider(context.workspaceState, new AuthService(runner));
  const view = vscode.window.createTreeView("wranglerExplorer.projects", { treeDataProvider: provider, showCollapseAll: true });
  const statusBar = new WranglerStatusBar(provider);
  context.subscriptions.push(view, output, operations, statusBar);
  context.subscriptions.push(operations.onDidChange((operation) => provider.setOperation(operation)));

  const register = (command: string, callback: (...args: any[]) => unknown) => {
    context.subscriptions.push(vscode.commands.registerCommand(command, callback));
  };
  const pickProject = async (candidate?: WranglerProject): Promise<WranglerProject | undefined> => {
    if (candidate?.configUri) return candidate;
    const projects = provider.getProjects();
    if (projects.length === 1) return projects[0];
    const selected = await vscode.window.showQuickPick(
      projects.map((project) => ({ label: project.name, description: project.configUri.fsPath, project })),
      { title: "Select a Wrangler project" }
    );
    return selected?.project;
  };
  const runTerminal = (args: readonly string[], label: string) => async (candidate?: WranglerProject) => {
    const project = await pickProject(candidate);
    if (!project) return;
    await runner.run(project, args, provider.getEnvironment(project), label);
  };
  const runCaptured = (args: readonly string[], label: string, options: OperationOptions = {}) => async (candidate?: WranglerProject) => {
    const project = await pickProject(candidate);
    if (!project) return;
    await operations.run(project, args, label, { ...options, environment: provider.getEnvironment(project) });
  };
  const refreshAll = async () => {
    await provider.refresh();
    await setup.refreshContext(provider.getProjects().length > 0);
  };

  register("wranglerExplorer.refresh", () => refreshAll());
  register("wranglerExplorer.showOutput", () => operations.showOutput());
  register("wranglerExplorer.clearOutput", () => operations.clearOutput());
  register("wranglerExplorer.statusMenu", async () => {
    const project = statusBar.getProject() ?? await pickProject();
    if (!project) return;
    const auth = provider.getAuthStatus(project);
    const choices: Array<{ label: string; description?: string; command: string }> = [
      ...(provider.getProjects().length > 1
        ? [{ label: "$(folder) Switch Project", description: project.name, command: "wranglerExplorer.switchProject" }]
        : []),
      { label: "$(settings) Switch Environment", description: provider.getEnvironment(project) ?? "top level", command: "wranglerExplorer.selectEnvironment" },
      { label: "$(file-code) Open Wrangler Configuration", command: "wranglerExplorer.openConfig" },
      { label: "$(refresh) Refresh Authentication", description: auth?.label, command: "wranglerExplorer.refreshAuth" },
      { label: "$(cloud-download) Update Wrangler", command: "wranglerExplorer.updateWrangler" },
      auth?.state === "loggedIn"
        ? { label: "$(sign-out) Log Out", command: "wranglerExplorer.logout" }
        : { label: "$(sign-in) Log In", command: "wranglerExplorer.login" },
      { label: "$(debug-start) Start Dev Server", command: "wranglerExplorer.dev" },
      { label: "$(cloud-upload) Deploy", command: "wranglerExplorer.deploy" },
      { label: "$(output) Show Wrangler Output", command: "wranglerExplorer.showOutput" },
      { label: "$(clear-all) Clear Wrangler Output", command: "wranglerExplorer.clearOutput" },
      { label: "$(list-tree) Open Explorer for Wrangler", command: "wranglerExplorer.projects.focus" }
    ];
    const selected = await vscode.window.showQuickPick(choices, { title: `${project.name} — Wrangler` });
    if (selected) await vscode.commands.executeCommand(selected.command, project);
  });
  register("wranglerExplorer.switchProject", async () => {
    const projects = provider.getProjects();
    const selected = await vscode.window.showQuickPick(
      projects.map((project) => ({ label: project.name, description: project.configUri.fsPath, project })),
      { title: "Switch Wrangler project", placeHolder: "Open a project configuration" }
    );
    if (selected) await vscode.window.showTextDocument(selected.project.configUri);
  });
  register("wranglerExplorer.openConfig", async (candidate?: WranglerProject) => {
    const project = await pickProject(candidate);
    if (!project) return;
    await vscode.window.showTextDocument(project.configUri);
  });
  register("wranglerExplorer.selectEnvironment", async (candidate?: WranglerProject, direct?: string, fromTree = false) => {
    const project = await pickProject(candidate);
    if (!project) return;
    if (fromTree) {
      await provider.setEnvironment(project, direct);
      return;
    }
    const choices = [
      { label: "Top level", value: undefined },
      ...project.environments.map((environment) => ({ label: environment, value: environment }))
    ];
    const selected = await vscode.window.showQuickPick(choices, {
      title: `Select environment for ${project.name}`,
      placeHolder: "Wrangler commands will use this environment"
    });
    if (selected) await provider.setEnvironment(project, selected.value);
  });
  register("wranglerExplorer.install", async (candidate?: WranglerProject) => {
    const project = await pickProject(candidate);
    if (project) await runner.install(project);
  });
  register("wranglerExplorer.updateWrangler", async (candidate?: WranglerProject) => {
    const project = await pickProject(candidate);
    if (project) await setup.updateWrangler(project);
  });
  register("wranglerExplorer.setupInstall", () => setup.installLocal());
  register("wranglerExplorer.setupConfigurePath", () => setup.configureExecutable());
  register("wranglerExplorer.setupCreate", () => setup.createProject());
  register("wranglerExplorer.setupInit", () => setup.initializeHere());
  register("wranglerExplorer.setupImport", () => setup.importFromDashboard());
  register("wranglerExplorer.setupAddConfig", () => setup.addConfig());
  register("wranglerExplorer.dev", runTerminal(["dev"], "Start Dev Server"));
  register("wranglerExplorer.deploy", runCaptured(["deploy"], "Deploy", { progress: true }));
  register("wranglerExplorer.deployDryRun", runCaptured(["deploy", "--dry-run"], "Deploy Dry Run", { progress: true }));
  register("wranglerExplorer.tail", runTerminal(["tail"], "Tail Logs"));
  register("wranglerExplorer.types", runCaptured(["types"], "Generate Types"));
  register("wranglerExplorer.checkStartup", runCaptured(["check", "startup"], "Check Startup", { revealOutput: true, notifySuccess: false }));
  register("wranglerExplorer.whoami", runCaptured(["whoami"], "Authentication Status", { revealOutput: true, notifySuccess: false }));
  register("wranglerExplorer.refreshAuth", async (candidate?: WranglerProject) => {
    const project = await pickProject(candidate);
    if (project) await provider.refreshAuth(project);
  });
  register("wranglerExplorer.login", async (candidate?: WranglerProject) => {
    const project = await pickProject(candidate);
    if (!project) return;
    await runner.run(project, ["login"], undefined, "Log In to Cloudflare");
  });
  register("wranglerExplorer.logout", async (candidate?: WranglerProject) => {
    const project = await pickProject(candidate);
    if (!project) return;
    const confirmed = await vscode.window.showWarningMessage(
      "Log Wrangler out of Cloudflare on this machine? This may affect other projects using the same credentials.",
      { modal: true },
      "Log out"
    );
    if (confirmed) await runner.run(project, ["logout"], undefined, "Log Out of Cloudflare");
  });
  register("wranglerExplorer.versions", runCaptured(["versions", "list"], "List Versions", { revealOutput: true, notifySuccess: false }));
  register("wranglerExplorer.deployments", runCaptured(["deployments", "list"], "List Deployments", { revealOutput: true, notifySuccess: false }));
  register("wranglerExplorer.deploymentStatus", runCaptured(["deployments", "status"], "Deployment Status", { revealOutput: true, notifySuccess: false }));
  register("wranglerExplorer.secrets", runCaptured(["secret", "list"], "List Secrets", { revealOutput: true, notifySuccess: false }));
  register("wranglerExplorer.listD1", runCaptured(["d1", "list"], "List D1 Databases", { revealOutput: true, notifySuccess: false }));
  register("wranglerExplorer.listR2", runCaptured(["r2", "bucket", "list"], "List R2 Buckets", { revealOutput: true, notifySuccess: false }));
  register("wranglerExplorer.listKv", runCaptured(["kv", "namespace", "list"], "List KV Namespaces", { revealOutput: true, notifySuccess: false }));
  register("wranglerExplorer.listQueues", runCaptured(["queues", "list"], "List Queues", { revealOutput: true, notifySuccess: false }));
  register("wranglerExplorer.listVectorize", runCaptured(["vectorize", "list"], "List Vectorize Indexes", { revealOutput: true, notifySuccess: false }));
  register("wranglerExplorer.listHyperdrive", runCaptured(["hyperdrive", "list"], "List Hyperdrive Configurations", { revealOutput: true, notifySuccess: false }));
  register("wranglerExplorer.listWorkflows", runCaptured(["workflows", "list"], "List Workflows", { revealOutput: true, notifySuccess: false }));
  register("wranglerExplorer.listPipelines", runCaptured(["pipelines", "list"], "List Pipelines", { revealOutput: true, notifySuccess: false }));
  register("wranglerExplorer.listContainers", runCaptured(["containers", "list"], "List Containers", { revealOutput: true, notifySuccess: false }));
  register("wranglerExplorer.listSecretStores", runCaptured(["secrets-store", "store", "list"], "List Secrets Stores", { revealOutput: true, notifySuccess: false }));
  register("wranglerExplorer.putSecret", async (candidate?: WranglerProject) => {
    const project = await pickProject(candidate);
    if (!project) return;
    const name = await vscode.window.showInputBox({
      title: "Add Worker secret",
      prompt: "Secret name (the value will be requested securely by Wrangler in the terminal)",
      validateInput: validateIdentifier
    });
    if (name) await runner.run(project, ["secret", "put", name], provider.getEnvironment(project), `Add Secret ${name}`);
  });
  register("wranglerExplorer.d1Info", (node: ResourceNode) =>
    operations.run(node.project, ["d1", "info", node.resource.name], `D1 Info: ${node.resource.name}`, { environment: provider.getEnvironment(node.project), revealOutput: true, notifySuccess: false }));
  register("wranglerExplorer.d1CreateMigration", async (node: ResourceNode) => {
    const name = await vscode.window.showInputBox({ title: "Create D1 migration", prompt: "Migration name", validateInput: validateMigrationName });
    if (name) await operations.run(node.project, ["d1", "migrations", "create", node.resource.name, name], `Create D1 Migration: ${name}`, { environment: provider.getEnvironment(node.project) });
  });
  register("wranglerExplorer.d1ApplyLocal", (node: ResourceNode) =>
    operations.run(node.project, ["d1", "migrations", "apply", node.resource.name, "--local"], `Apply D1 Locally: ${node.resource.name}`, { environment: provider.getEnvironment(node.project), progress: true }));
  register("wranglerExplorer.d1ApplyRemote", async (node: ResourceNode) => {
    const confirmed = await vscode.window.showWarningMessage(
      `Apply pending migrations to remote D1 database “${node.resource.name}”?`,
      { modal: true },
      "Apply migrations"
    );
    if (confirmed) await operations.run(node.project, ["d1", "migrations", "apply", node.resource.name, "--remote"], `Apply D1 Remotely: ${node.resource.name}`, { environment: provider.getEnvironment(node.project), progress: true });
  });
  register("wranglerExplorer.r2Info", (node: ResourceNode) =>
    operations.run(node.project, ["r2", "bucket", "info", node.resource.name], `R2 Info: ${node.resource.name}`, { environment: provider.getEnvironment(node.project), revealOutput: true, notifySuccess: false }));
  register("wranglerExplorer.copyResourceName", async (node: ResourceNode) => {
    await vscode.env.clipboard.writeText(node.resource.name);
    await vscode.window.showInformationMessage(`Copied ${node.resource.name}.`);
  });

  const watcher = vscode.workspace.createFileSystemWatcher("**/{wrangler.jsonc,wrangler.json,wrangler.toml}");
  watcher.onDidCreate(() => refreshAll(), undefined, context.subscriptions);
  watcher.onDidChange(() => refreshAll(), undefined, context.subscriptions);
  watcher.onDidDelete(() => refreshAll(), undefined, context.subscriptions);
  context.subscriptions.push(watcher);
  context.subscriptions.push(vscode.tasks.onDidEndTaskProcess((event) => {
    const setupTasks = ["Install Wrangler", "Update Wrangler", "Create Cloudflare Project", "Initialize Wrangler Project", "Import Worker from Dashboard"];
    if (setupTasks.includes(event.execution.task.name)) void refreshAll();
    if (![...setupTasks, "Log In to Cloudflare", "Log Out of Cloudflare", "Authentication Status"].includes(event.execution.task.name)) return;
    const configUri = event.execution.task.definition.project;
    if (typeof configUri !== "string") return;
    const project = provider.findProject(configUri);
    if (project) void provider.refreshAuth(project);
  }));
  context.subscriptions.push(vscode.workspace.onDidChangeConfiguration((event) => {
    if (event.affectsConfiguration("wranglerExplorer.wranglerPath") || event.affectsConfiguration("wranglerExplorer.preferLocalWrangler")) {
      void refreshAll();
    }
  }));
  context.subscriptions.push(vscode.workspace.onDidChangeWorkspaceFolders(() => { void refreshAll(); }));
  await refreshAll();
}

export function deactivate(): void {}

function validateIdentifier(value: string): string | undefined {
  return /^[A-Za-z_][A-Za-z0-9_]*$/.test(value) ? undefined : "Use letters, digits, and underscores; do not start with a digit.";
}

function validateMigrationName(value: string): string | undefined {
  return /^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(value) ? undefined : "Use letters, digits, hyphens, and underscores.";
}
