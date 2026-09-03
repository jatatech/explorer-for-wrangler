export function withEnvironment(args: readonly string[], environment?: string): string[] {
  return environment ? [...args, "--env", environment] : [...args];
}

export const PROJECT_ACTIONS = [
  { command: "explorerForWrangler.dev", label: "Start Dev Server", icon: "debug-start", description: "wrangler dev" },
  { command: "explorerForWrangler.deploy", label: "Deploy", icon: "cloud-upload", description: "wrangler deploy" },
  { command: "explorerForWrangler.deployDryRun", label: "Deploy Dry Run", icon: "beaker", description: "validate without deploying" },
  { command: "explorerForWrangler.tail", label: "Tail Logs", icon: "output", description: "stream live Worker logs" },
  { command: "explorerForWrangler.types", label: "Generate Types", icon: "symbol-interface", description: "update binding types" },
  { command: "explorerForWrangler.checkStartup", label: "Check Startup", icon: "dashboard", description: "profile Worker startup" }
] as const;

export const D1_MIGRATION_ACTIONS = [
  { command: "explorerForWrangler.d1CreateMigration", label: "Create Migration", icon: "new-file", description: "create a versioned SQL migration" },
  { command: "explorerForWrangler.d1ListLocal", label: "Pending — Local", icon: "list-unordered", description: "inspect unapplied local migrations" },
  { command: "explorerForWrangler.d1ApplyLocal", label: "Apply — Local", icon: "play", description: "apply pending migrations locally" },
  { command: "explorerForWrangler.d1ListPreview", label: "Pending — Preview", icon: "list-unordered", description: "inspect unapplied preview migrations" },
  { command: "explorerForWrangler.d1ApplyPreview", label: "Apply — Preview", icon: "play", description: "apply pending migrations to preview" },
  { command: "explorerForWrangler.d1ListRemote", label: "Pending — Remote", icon: "list-unordered", description: "inspect unapplied remote migrations" },
  { command: "explorerForWrangler.d1ApplyRemote", label: "Apply — Remote", icon: "cloud-upload", description: "apply pending migrations to production" }
] as const;

export const DEPLOYED_WORKER_ACTIONS = [
  { command: "explorerForWrangler.openDashboard", label: "Open Cloudflare Dashboard", icon: "link-external", description: "open this Worker in the dashboard" },
  { command: "explorerForWrangler.deploymentStatus", label: "Deployment Status", icon: "pulse", description: "current production state" },
  { command: "explorerForWrangler.deployments", label: "Deployments", icon: "cloud", description: "list recent deployments" },
  { command: "explorerForWrangler.versions", label: "Versions", icon: "history", description: "list deployed versions" },
  { command: "explorerForWrangler.secrets", label: "Secrets", icon: "lock", description: "list Worker secret names" },
  { command: "explorerForWrangler.putSecret", label: "Add Secret", icon: "key", description: "enter value securely in terminal" }
] as const;

export const WRANGLER_ACTIONS = [
  { command: "explorerForWrangler.login", label: "Log In", icon: "sign-in", description: "open Wrangler's Cloudflare login flow" },
  { command: "explorerForWrangler.logout", label: "Log Out", icon: "sign-out", description: "remove Wrangler's active login" },
  { command: "explorerForWrangler.whoami", label: "Who Am I?", icon: "account", description: "show full Wrangler account details" }
] as const;

export const UPDATE_WRANGLER_ACTION = {
  command: "explorerForWrangler.updateWrangler", label: "Update Wrangler", icon: "cloud-download", description: "update the project-local installation"
} as const;

export const INSTALL_PROJECT_WRANGLER_ACTION = {
  command: "explorerForWrangler.install", label: "Install Wrangler in Project", icon: "package", description: "add a project-local dev dependency"
} as const;

export const CATALOG_ACTIONS = [
  { command: "explorerForWrangler.listD1", label: "D1 Databases", icon: "database", description: "list account databases" },
  { command: "explorerForWrangler.listR2", label: "R2 Buckets", icon: "archive", description: "list account buckets" },
  { command: "explorerForWrangler.listKv", label: "KV Namespaces", icon: "key", description: "list account namespaces" },
  { command: "explorerForWrangler.listQueues", label: "Queues", icon: "list-ordered", description: "list account queues" },
  { command: "explorerForWrangler.listVectorize", label: "Vectorize Indexes", icon: "symbol-array", description: "list account indexes" },
  { command: "explorerForWrangler.listHyperdrive", label: "Hyperdrive", icon: "database", description: "list configurations" },
  { command: "explorerForWrangler.listWorkflows", label: "Workflows", icon: "run-all", description: "list workflows" },
  { command: "explorerForWrangler.listPipelines", label: "Pipelines", icon: "server-process", description: "list pipelines" },
  { command: "explorerForWrangler.listContainers", label: "Containers", icon: "package", description: "list containers" },
  { command: "explorerForWrangler.listSecretStores", label: "Secrets Stores", icon: "lock", description: "list account stores" }
] as const;
