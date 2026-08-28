export function withEnvironment(args: readonly string[], environment?: string): string[] {
  return environment ? [...args, "--env", environment] : [...args];
}

export const CORE_ACTIONS = [
  { command: "wranglerExplorer.dev", label: "Start Dev Server", icon: "debug-start", description: "wrangler dev" },
  { command: "wranglerExplorer.deploy", label: "Deploy", icon: "cloud-upload", description: "wrangler deploy" },
  { command: "wranglerExplorer.deployDryRun", label: "Deploy Dry Run", icon: "beaker", description: "validate without deploying" },
  { command: "wranglerExplorer.tail", label: "Tail Logs", icon: "output", description: "stream live Worker logs" },
  { command: "wranglerExplorer.types", label: "Generate Types", icon: "symbol-interface", description: "update binding types" },
  { command: "wranglerExplorer.checkStartup", label: "Check Startup", icon: "dashboard", description: "profile Worker startup" }
] as const;

export const REMOTE_ACTIONS = [
  { command: "wranglerExplorer.login", label: "Log In", icon: "sign-in", description: "open Wrangler's Cloudflare login flow" },
  { command: "wranglerExplorer.logout", label: "Log Out", icon: "sign-out", description: "remove Wrangler's active login" },
  { command: "wranglerExplorer.whoami", label: "Who Am I?", icon: "account", description: "show full Wrangler account details" },
  { command: "wranglerExplorer.updateWrangler", label: "Update Wrangler", icon: "cloud-download", description: "update a project-local installation" },
  { command: "wranglerExplorer.deploymentStatus", label: "Deployment Status", icon: "pulse", description: "current production state" },
  { command: "wranglerExplorer.deployments", label: "Deployments", icon: "cloud", description: "list recent deployments" },
  { command: "wranglerExplorer.versions", label: "Versions", icon: "history", description: "list deployed versions" },
  { command: "wranglerExplorer.secrets", label: "Secrets", icon: "lock", description: "list secret names" },
  { command: "wranglerExplorer.putSecret", label: "Add Secret", icon: "key", description: "enter value securely in terminal" }
] as const;

export const CATALOG_ACTIONS = [
  { command: "wranglerExplorer.listD1", label: "D1 Databases", icon: "database", description: "list account databases" },
  { command: "wranglerExplorer.listR2", label: "R2 Buckets", icon: "archive", description: "list account buckets" },
  { command: "wranglerExplorer.listKv", label: "KV Namespaces", icon: "key", description: "list account namespaces" },
  { command: "wranglerExplorer.listQueues", label: "Queues", icon: "list-ordered", description: "list account queues" },
  { command: "wranglerExplorer.listVectorize", label: "Vectorize Indexes", icon: "symbol-array", description: "list account indexes" },
  { command: "wranglerExplorer.listHyperdrive", label: "Hyperdrive", icon: "database", description: "list configurations" },
  { command: "wranglerExplorer.listWorkflows", label: "Workflows", icon: "run-all", description: "list workflows" },
  { command: "wranglerExplorer.listPipelines", label: "Pipelines", icon: "server-process", description: "list pipelines" },
  { command: "wranglerExplorer.listContainers", label: "Containers", icon: "package", description: "list containers" },
  { command: "wranglerExplorer.listSecretStores", label: "Secrets Stores", icon: "lock", description: "list account stores" }
] as const;
