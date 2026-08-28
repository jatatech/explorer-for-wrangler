import * as vscode from "vscode";
import { AuthService } from "./auth";
import { WranglerOperations, type OperationOptions } from "./operations";
import { D1QueryPanel, showCollection, showStructuredDetail, StorageBrowser } from "./panels";
import { RemoteResourceService } from "./remote";
import { WranglerRunner } from "./runner";
import { SetupService } from "./setup";
import { WranglerStatusBar } from "./statusBar";
import { AccountResourcesTreeProvider, WranglerTreeProvider, type ResourceNode } from "./tree";
import type { WranglerOperation, WranglerProject } from "./model";
import { parseJsonOutput, rowsFromOutput } from "./structured";
import { workerName } from "./config";
import { WranglerVersionService } from "./version";

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  const runner = new WranglerRunner();
  const setup = new SetupService(runner);
  const output = vscode.window.createOutputChannel("Explorer for Wrangler");
  const diagnostics = vscode.languages.createDiagnosticCollection("wrangler");
  const operations = new WranglerOperations(runner, output, diagnostics);
  const remote = new RemoteResourceService(operations);
  const versions = new WranglerVersionService(context.globalState);
  const provider = new WranglerTreeProvider(context.workspaceState, new AuthService(runner, versions));
  const accountProvider = new AccountResourcesTreeProvider(provider, remote);
  const view = vscode.window.createTreeView("explorerForWrangler.projects", { treeDataProvider: provider, showCollapseAll: true });
  const accountView = vscode.window.createTreeView("explorerForWrangler.accountResources", { treeDataProvider: accountProvider, showCollapseAll: true });
  const statusBar = new WranglerStatusBar(provider);
  context.subscriptions.push(view, accountView, accountProvider, output, diagnostics, runner, operations, statusBar);
  context.subscriptions.push(operations.onDidChange((operation) => provider.setOperation(operation)));
  context.subscriptions.push(operations.onDidBusyChange(() => provider.refreshTree()));

  const register = (command: string, callback: (...args: any[]) => unknown) => {
    context.subscriptions.push(vscode.commands.registerCommand(command, callback));
  };
  const pickProject = async (candidate?: WranglerProject | string): Promise<WranglerProject | undefined> => {
    if (typeof candidate === "string") return provider.findProject(candidate);
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
  const showProjectData = (args: string[], title: string) => async (candidate?: WranglerProject) => {
    const project = await pickProject(candidate);
    if (!project) return;
    const result = await operations.run(project, args, title, { environment: provider.getEnvironment(project), progress: true, notifySuccess: false });
    if (result?.code !== 0) return;
    const parsed = parseJsonOutput(result.stdout);
    const rows = parsed === undefined ? rowsFromOutput(result.stdout) : [];
    showStructuredDetail(`${title} — ${project.name}`, parsed ?? (rows.length ? rows : { output: result.stdout.trim() }), [], `${project.configUri.toString()}:data:${args.join("\u0000")}`);
  };
  const refreshAll = async () => {
    await provider.refresh();
    await setup.refreshContext(provider.getProjects().length > 0);
  };

  register("explorerForWrangler.refresh", () => refreshAll());
  register("explorerForWrangler.showOutput", () => operations.showOutput());
  register("explorerForWrangler.clearOutput", () => operations.clearOutput());
  register("explorerForWrangler.configure", () =>
    vscode.commands.executeCommand("workbench.action.openSettings", "@ext:explorer-for-wrangler.explorer-for-wrangler"));
  register("explorerForWrangler.refreshRemote", async (candidate?: WranglerProject) => {
    if (candidate?.configUri) {
      await accountProvider.refresh(candidate);
      return;
    }
    await accountProvider.refreshAll();
  });
  register("explorerForWrangler.statusMenu", async () => {
    const project = statusBar.getProject() ?? await pickProject();
    if (!project) return;
    const auth = provider.getAuthStatus(project);
    const choices: Array<{ label: string; description?: string; command: string }> = [
      ...(provider.getProjects().length > 1
        ? [{ label: "$(folder) Switch Project", description: project.name, command: "explorerForWrangler.switchProject" }]
        : []),
      { label: "$(settings) Switch Environment", description: provider.getEnvironment(project) ?? "top level", command: "explorerForWrangler.selectEnvironment" },
      { label: "$(file-code) Open Wrangler Configuration", command: "explorerForWrangler.openConfig" },
      { label: "$(link-external) Open Cloudflare Dashboard", command: "explorerForWrangler.openDashboard" },
      { label: "$(refresh) Refresh Authentication", description: auth?.label, command: "explorerForWrangler.refreshAuth" },
      ...(auth?.executable?.source === "local" && auth.executable.updateAvailable
        ? [{ label: "$(cloud-download) Update Wrangler", description: `${auth.executable.version} → ${auth.executable.latestVersion}`, command: "explorerForWrangler.updateWrangler" }]
        : []),
      ...(auth?.executable?.source === "system"
        ? [{ label: "$(package) Install Wrangler in Project", description: "add a project-local dev dependency", command: "explorerForWrangler.install" }]
        : []),
      auth?.state === "loggedIn"
        ? { label: "$(sign-out) Log Out", command: "explorerForWrangler.logout" }
        : { label: "$(sign-in) Log In", command: "explorerForWrangler.login" },
      { label: "$(debug-start) Start Dev Server", command: "explorerForWrangler.dev" },
      { label: "$(cloud-upload) Deploy", command: "explorerForWrangler.deploy" },
      { label: "$(output) Show Wrangler Output", command: "explorerForWrangler.showOutput" },
      { label: "$(clear-all) Clear Wrangler Output", command: "explorerForWrangler.clearOutput" },
      { label: "$(settings-gear) Configure Explorer", command: "explorerForWrangler.configure" },
      { label: "$(list-tree) Open Explorer for Wrangler", command: "explorerForWrangler.projects.focus" }
    ];
    const selected = await vscode.window.showQuickPick(choices, { title: `${project.name} — Wrangler` });
    if (selected) await vscode.commands.executeCommand(selected.command, project);
  });
  register("explorerForWrangler.switchProject", async () => {
    const projects = provider.getProjects();
    const selected = await vscode.window.showQuickPick(
      projects.map((project) => ({ label: project.name, description: project.configUri.fsPath, project })),
      { title: "Switch Wrangler project", placeHolder: "Open a project configuration" }
    );
    if (selected) await vscode.window.showTextDocument(selected.project.configUri);
  });
  register("explorerForWrangler.openConfig", async (candidate?: WranglerProject) => {
    const project = await pickProject(candidate);
    if (!project) return;
    await vscode.window.showTextDocument(project.configUri);
  });
  register("explorerForWrangler.selectEnvironment", async (candidate?: WranglerProject, direct?: string, fromTree = false) => {
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
  register("explorerForWrangler.install", async (candidate?: WranglerProject) => {
    const project = await pickProject(candidate);
    if (project) await runner.install(project);
  });
  register("explorerForWrangler.updateWrangler", async (candidate?: WranglerProject) => {
    const project = await pickProject(candidate);
    if (project) await setup.updateWrangler(project);
  });
  register("explorerForWrangler.setupInstall", () => setup.installLocal());
  register("explorerForWrangler.setupConfigurePath", () => setup.configureExecutable());
  register("explorerForWrangler.setupCreate", () => setup.createProject());
  register("explorerForWrangler.setupInit", () => setup.initializeHere());
  register("explorerForWrangler.setupImport", () => setup.importFromDashboard());
  register("explorerForWrangler.setupAddConfig", () => setup.addConfig());
  register("explorerForWrangler.dev", runTerminal(["dev"], "Start Dev Server"));
  register("explorerForWrangler.deploy", runCaptured(["deploy"], "Deploy", { progress: true }));
  register("explorerForWrangler.deployDryRun", runCaptured(["deploy", "--dry-run"], "Deploy Dry Run", { progress: true }));
  register("explorerForWrangler.tail", runTerminal(["tail"], "Tail Logs"));
  register("explorerForWrangler.types", runCaptured(["types"], "Generate Types"));
  register("explorerForWrangler.checkStartup", runCaptured(["check", "startup"], "Check Startup", { revealOutput: true, notifySuccess: false }));
  register("explorerForWrangler.openDashboard", async (candidate?: WranglerProject) => {
    const project = await pickProject(candidate);
    if (!project) return;
    const name = workerName(project.config, provider.getEnvironment(project));
    if (!name) {
      await vscode.window.showErrorMessage("This Wrangler configuration does not define a Worker name for the selected environment.");
      return;
    }
    const accounts = provider.getAuthStatus(project)?.accounts ?? [];
    const account = accounts.length === 1 ? accounts[0] : await vscode.window.showQuickPick(accounts.map((item) => ({ label: item.name, description: item.id, item })), { title: "Select the Cloudflare account" }).then((choice) => choice?.item);
    const path = account
      ? `/${encodeURIComponent(account.id)}/workers/services/view/${encodeURIComponent(name)}/production`
      : `/?to=/:account/workers/services/view/${encodeURIComponent(name)}/production`;
    await vscode.env.openExternal(vscode.Uri.parse(`https://dash.cloudflare.com${path}`));
  });
  register("explorerForWrangler.whoami", runCaptured(["whoami"], "Authentication Status", { revealOutput: true, notifySuccess: false }));
  register("explorerForWrangler.refreshAuth", async (candidate?: WranglerProject) => {
    const project = await pickProject(candidate);
    if (project) await provider.refreshAuth(project);
  });
  register("explorerForWrangler.login", async (candidate?: WranglerProject) => {
    const project = await pickProject(candidate);
    if (!project) return;
    await runner.run(project, ["login"], undefined, "Log In to Cloudflare");
  });
  register("explorerForWrangler.logout", async (candidate?: WranglerProject) => {
    const project = await pickProject(candidate);
    if (!project) return;
    const confirmed = await vscode.window.showWarningMessage(
      "Log Wrangler out of Cloudflare on this machine? This may affect other projects using the same credentials.",
      { modal: true },
      "Log out"
    );
    if (confirmed) await runner.run(project, ["logout"], undefined, "Log Out of Cloudflare");
  });
  register("explorerForWrangler.versions", async (candidate?: WranglerProject) => {
    const project = await pickProject(candidate);
    if (!project) return;
    await showCollection(project, operations, ["versions", "list"], `Versions — ${project.name}`, provider.getEnvironment(project), async (row) => {
      const id = recordId(row, ["id", "version_id"]);
      if (id) await vscode.commands.executeCommand("explorerForWrangler.versionDetail", project.configUri.toString(), id);
    });
  });
  register("explorerForWrangler.deployments", async (candidate?: WranglerProject) => {
    const project = await pickProject(candidate);
    if (!project) return;
    await showCollection(project, operations, ["deployments", "list"], `Deployments — ${project.name}`, provider.getEnvironment(project), async (row) => {
      const version = deploymentVersion(row);
      const deployment = recordId(row, ["id", "deployment_id", "deploymentId"]) ?? version ?? "selected";
      showStructuredDetail(`Deployment — ${project.name}`, row, version ? [{ command: "explorerForWrangler.rollback", label: `Rollback to ${version}`, args: [project.configUri.toString(), version] }] : [], `${project.configUri.toString()}:deployment:${deployment}`);
    });
  });
  register("explorerForWrangler.versionDetail", async (candidate: WranglerProject | string, versionId: string) => {
    const project = await pickProject(candidate);
    if (!project) return;
    const result = await operations.run(project, ["versions", "view", versionId, "--json"], `Version ${versionId}`, { environment: provider.getEnvironment(project), progress: true, notifySuccess: false });
    if (result?.code === 0) {
      const parsed = parseJsonOutput(result.stdout);
      const rows = parsed === undefined ? rowsFromOutput(result.stdout) : [];
      showStructuredDetail(`Version ${versionId}`, parsed ?? (rows.length ? rows : { output: result.stdout.trim() }), [{ command: "explorerForWrangler.rollback", label: "Rollback to this version", args: [project.configUri.toString(), versionId] }], `${project.configUri.toString()}:version:${versionId}`);
    }
  });
  register("explorerForWrangler.rollback", async (candidate: WranglerProject | string, versionId: string) => {
    const project = await pickProject(candidate);
    if (!project || !versionId) return;
    const confirmed = await vscode.window.showWarningMessage(`Roll back ${project.name} to version ${versionId}? This changes production traffic.`, { modal: true }, "Roll back");
    if (!confirmed) return;
    const message = await vscode.window.showInputBox({ title: "Rollback reason", prompt: "Optional reason recorded with the deployment" });
    const args = ["rollback", versionId, ...(message ? ["--message", message] : []), "--yes"];
    await operations.run(project, args, `Rollback to ${versionId}`, { environment: provider.getEnvironment(project), progress: true });
  });
  register("explorerForWrangler.deploymentStatus", showProjectData(["deployments", "status", "--json"], "Deployment Status"));
  register("explorerForWrangler.secrets", showProjectData(["secret", "list", "--format", "json"], "Secrets"));
  register("explorerForWrangler.listD1", showProjectData(["d1", "list", "--json"], "D1 Databases"));
  register("explorerForWrangler.listR2", showProjectData(["r2", "bucket", "list"], "R2 Buckets"));
  register("explorerForWrangler.listKv", showProjectData(["kv", "namespace", "list"], "KV Namespaces"));
  register("explorerForWrangler.listQueues", showProjectData(["queues", "list"], "Queues"));
  register("explorerForWrangler.listVectorize", showProjectData(["vectorize", "list", "--json"], "Vectorize Indexes"));
  register("explorerForWrangler.listHyperdrive", showProjectData(["hyperdrive", "list"], "Hyperdrive Configurations"));
  register("explorerForWrangler.listWorkflows", showProjectData(["workflows", "list", "--per-page", "100"], "Workflows"));
  register("explorerForWrangler.listPipelines", showProjectData(["pipelines", "list", "--per-page", "100", "--json"], "Pipelines"));
  register("explorerForWrangler.listContainers", showProjectData(["containers", "list"], "Containers"));
  register("explorerForWrangler.listSecretStores", showProjectData(["secrets-store", "store", "list"], "Secrets Stores"));
  register("explorerForWrangler.putSecret", async (candidate?: WranglerProject) => {
    const project = await pickProject(candidate);
    if (!project) return;
    const name = await vscode.window.showInputBox({
      title: "Add Worker secret",
      prompt: "Secret name (the value will be requested securely by Wrangler in the terminal)",
      validateInput: validateIdentifier
    });
    if (name) await runner.run(project, ["secret", "put", name], provider.getEnvironment(project), `Add Secret ${name}`);
  });
  register("explorerForWrangler.resourceDetails", (node: ResourceNode) => {
    const args = resourceDetailArgs(node);
    if (args) return showResourceDetail(node, operations, args, provider.getEnvironment(node.project));
    showStructuredDetail(node.resource.name, {
      type: node.resource.kind,
      name: node.resource.name,
      binding: node.resource.binding,
      id: node.resource.id,
      source: node.resource.source ?? "config",
      ...node.resource.details
    }, [], resourcePanelKey(node));
  });
  register("explorerForWrangler.d1Info", (node: ResourceNode) =>
    vscode.commands.executeCommand("explorerForWrangler.resourceDetails", node));
  register("explorerForWrangler.d1CreateMigration", async (node: ResourceNode) => {
    const name = await vscode.window.showInputBox({ title: "Create D1 migration", prompt: "Migration name", validateInput: validateMigrationName });
    if (name) await operations.run(node.project, ["d1", "migrations", "create", node.resource.name, name], `Create D1 Migration: ${name}`, { environment: provider.getEnvironment(node.project) });
  });
  register("explorerForWrangler.d1ApplyLocal", (node: ResourceNode) =>
    operations.run(node.project, ["d1", "migrations", "apply", node.resource.name, "--local"], `Apply D1 Locally: ${node.resource.name}`, { environment: provider.getEnvironment(node.project), progress: true }));
  register("explorerForWrangler.d1ApplyRemote", async (node: ResourceNode) => {
    const confirmed = await vscode.window.showWarningMessage(
      `Apply pending migrations to remote D1 database “${node.resource.name}”?`,
      { modal: true },
      "Apply migrations"
    );
    if (confirmed) await operations.run(node.project, ["d1", "migrations", "apply", node.resource.name, "--remote"], `Apply D1 Remotely: ${node.resource.name}`, { environment: provider.getEnvironment(node.project), progress: true });
  });
  register("explorerForWrangler.r2Info", (node: ResourceNode) =>
    vscode.commands.executeCommand("explorerForWrangler.resourceDetails", node));
  register("explorerForWrangler.kvBrowse", (node: ResourceNode) => StorageBrowser.showKv(node.project, node.resource, operations, provider.getEnvironment(node.project)));
  register("explorerForWrangler.r2Browse", (node: ResourceNode) => StorageBrowser.showR2(node.project, node.resource, operations, provider.getEnvironment(node.project)));
  register("explorerForWrangler.d1Query", (node: ResourceNode) => D1QueryPanel.show(node.project, node.resource, operations, provider.getEnvironment(node.project)));
  register("explorerForWrangler.queueInfo", (node: ResourceNode) => vscode.commands.executeCommand("explorerForWrangler.resourceDetails", node));
  register("explorerForWrangler.queuePause", (node: ResourceNode) => confirmedAction(node, operations, ["queues", "pause-delivery", node.resource.name], `Pause delivery for queue “${node.resource.name}”?`, "Pause delivery", provider.getEnvironment(node.project)));
  register("explorerForWrangler.queueResume", (node: ResourceNode) => confirmedAction(node, operations, ["queues", "resume-delivery", node.resource.name], `Resume delivery for queue “${node.resource.name}”?`, "Resume delivery", provider.getEnvironment(node.project)));
  register("explorerForWrangler.queuePurge", (node: ResourceNode) => confirmedAction(node, operations, ["queues", "purge", node.resource.name, "--force"], `Permanently purge all messages from queue “${node.resource.name}”?`, "Purge queue", provider.getEnvironment(node.project)));
  register("explorerForWrangler.vectorizeInfo", (node: ResourceNode) => vscode.commands.executeCommand("explorerForWrangler.resourceDetails", node));
  register("explorerForWrangler.vectorizeVectors", (node: ResourceNode) => showResourceCollection(node, operations, ["vectorize", "list-vectors", node.resource.name, "--count", "100", "--json"], provider.getEnvironment(node.project)));
  register("explorerForWrangler.hyperdriveInfo", (node: ResourceNode) => vscode.commands.executeCommand("explorerForWrangler.resourceDetails", node));
  register("explorerForWrangler.workflowInfo", (node: ResourceNode) => vscode.commands.executeCommand("explorerForWrangler.resourceDetails", node));
  register("explorerForWrangler.workflowInstances", (node: ResourceNode) => showResourceCollection(node, operations, ["workflows", "instances", "list", node.resource.name, "--per-page", "100"], provider.getEnvironment(node.project)));
  register("explorerForWrangler.workflowTrigger", async (node: ResourceNode) => {
    const params = await vscode.window.showInputBox({ title: `Trigger ${node.resource.name}`, prompt: "Optional JSON parameters", value: "{}", validateInput: validateJson });
    if (params === undefined) return;
    const confirmed = await vscode.window.showWarningMessage(`Trigger remote workflow “${node.resource.name}”?`, { modal: true }, "Trigger workflow");
    if (confirmed) await operations.run(node.project, ["workflows", "trigger", node.resource.name, params], `Trigger Workflow: ${node.resource.name}`, { environment: provider.getEnvironment(node.project), progress: true });
  });
  register("explorerForWrangler.pipelineInfo", (node: ResourceNode) => vscode.commands.executeCommand("explorerForWrangler.resourceDetails", node));
  register("explorerForWrangler.copyResourceName", async (node: ResourceNode) => {
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
  const taskOperations = new Map<vscode.TaskExecution, WranglerOperation>();
  context.subscriptions.push(vscode.tasks.onDidStartTask((event) => {
    if (event.execution.task.definition.type !== "wrangler") return;
    const projectKey = event.execution.task.definition.project;
    if (typeof projectKey !== "string") return;
    const operation: WranglerOperation = {
      projectKey,
      label: event.execution.task.name,
      state: "running",
      startedAt: Date.now(),
      detail: "interactive Wrangler task",
      command: typeof event.execution.task.definition.command === "string" ? event.execution.task.definition.command : undefined
    };
    taskOperations.set(event.execution, operation);
    provider.setOperation(operation);
  }));
  context.subscriptions.push(vscode.tasks.onDidEndTaskProcess((event) => {
    const operation = taskOperations.get(event.execution);
    if (!operation) return;
    taskOperations.delete(event.execution);
    provider.setOperation({
      ...operation,
      state: event.exitCode === 0 ? "succeeded" : "failed",
      finishedAt: Date.now(),
      detail: event.exitCode === 0 ? "completed" : `exit code ${event.exitCode ?? "unknown"}`
    });
  }));
  context.subscriptions.push(vscode.workspace.onDidChangeConfiguration((event) => {
    if (event.affectsConfiguration("explorerForWrangler.wranglerPath") || event.affectsConfiguration("explorerForWrangler.preferLocalWrangler")) {
      void refreshAll();
    }
  }));
  context.subscriptions.push(vscode.workspace.onDidChangeWorkspaceFolders(() => { void refreshAll(); }));
  const legacy = vscode.extensions.getExtension("wrangler-explorer.wrangler-explorer");
  if (legacy && !context.globalState.get<boolean>("legacyExtensionNoticeShown")) {
    await context.globalState.update("legacyExtensionNoticeShown", true);
    const choice = await vscode.window.showWarningMessage(
      "The legacy Wrangler Explorer extension is also installed. This version can coexist with it, but VS Code will show both Explorer views until the legacy extension is disabled or uninstalled.",
      "Show Legacy Extension"
    );
    if (choice === "Show Legacy Extension") {
      await vscode.commands.executeCommand("workbench.extensions.search", "@id:wrangler-explorer.wrangler-explorer");
    }
  }
  await refreshAll();
}

export function deactivate(): void {}

function validateIdentifier(value: string): string | undefined {
  return /^[A-Za-z_][A-Za-z0-9_]*$/.test(value) ? undefined : "Use letters, digits, and underscores; do not start with a digit.";
}

function validateMigrationName(value: string): string | undefined {
  return /^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(value) ? undefined : "Use letters, digits, hyphens, and underscores.";
}

function validateJson(value: string): string | undefined {
  try { JSON.parse(value); return undefined; } catch { return "Enter valid JSON."; }
}

function recordId(row: Record<string, unknown>, keys: string[]): string | undefined {
  for (const key of keys) if (typeof row[key] === "string") return row[key] as string;
  return undefined;
}

function deploymentVersion(row: Record<string, unknown>): string | undefined {
  const direct = recordId(row, ["version_id", "versionId"]);
  if (direct) return direct;
  const versions = row.versions;
  if (!Array.isArray(versions)) return undefined;
  const full = versions.find((item) => typeof item === "object" && item !== null && ((item as Record<string, unknown>).percentage === 100 || (item as Record<string, unknown>).traffic === 100));
  return full && typeof full === "object" ? recordId(full as Record<string, unknown>, ["version_id", "versionId", "id"]) : undefined;
}

async function showResourceDetail(node: ResourceNode, operations: WranglerOperations, args: string[], environment?: string): Promise<void> {
  const result = await operations.run(node.project, args, `${node.resource.name} Details`, { environment, progress: true, notifySuccess: false });
  if (result?.code !== 0) return;
  const parsed = parseJsonOutput(result.stdout);
  const rows = parsed === undefined ? rowsFromOutput(result.stdout) : [];
  const value = parsed ?? (rows.length > 0 ? rows : { output: result.stdout.trim() });
  showStructuredDetail(node.resource.name, value, [], resourcePanelKey(node));
}

function resourceDetailArgs(node: ResourceNode): string[] | undefined {
  const target = node.resource.id ?? node.resource.name;
  switch (node.resource.kind) {
    case "d1": return ["d1", "info", node.resource.name, "--json"];
    case "r2": return ["r2", "bucket", "info", node.resource.name, "--json"];
    case "queue": return ["queues", "info", node.resource.name];
    case "vectorize": return ["vectorize", "get", node.resource.name, "--json"];
    case "hyperdrive": return ["hyperdrive", "get", target];
    case "workflow": return ["workflows", "describe", node.resource.name];
    case "pipeline": return ["pipelines", "get", target, "--json"];
    default: return undefined;
  }
}

function resourcePanelKey(node: ResourceNode): string {
  return `${node.project.configUri.toString()}:resource:${node.resource.kind}:${node.resource.id ?? node.resource.name}`;
}

async function showResourceCollection(node: ResourceNode, operations: WranglerOperations, args: string[], environment?: string): Promise<void> {
  const result = await operations.run(node.project, args, `${node.resource.name} Items`, { environment, progress: true, notifySuccess: false });
  if (result?.code === 0) showStructuredDetail(node.resource.name, rowsFromOutput(result.stdout));
}

async function confirmedAction(node: ResourceNode, operations: WranglerOperations, args: string[], prompt: string, confirmation: string, environment?: string): Promise<void> {
  const confirmed = await vscode.window.showWarningMessage(prompt, { modal: true }, confirmation);
  if (confirmed) await operations.run(node.project, args, `${confirmation}: ${node.resource.name}`, { environment, progress: true });
}
