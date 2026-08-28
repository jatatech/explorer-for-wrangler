# Explorer for Wrangler

Explorer for Wrangler puts common workflows for Wrangler, the Cloudflare® Developer Platform command-line interface, in the VS Code Activity Bar. It discovers every `wrangler.jsonc`, `wrangler.json`, and `wrangler.toml` in the workspace, reads configured bindings, and runs the project-local Wrangler version in an interactive VS Code task terminal.

> **Independent project:** This extension is not affiliated with, authorised by, sponsored by, or otherwise approved by Cloudflare, Inc. Cloudflare and Cloudflare Workers® are trademarks and/or registered trademarks of Cloudflare, Inc. in the United States and other jurisdictions. Wrangler is a product of Cloudflare, Inc.

## Features

- Multi-root and monorepo project discovery
- Explicit top-level, staging, production, or custom environment selection
- Live authentication status from `wrangler whoami`, plus login and confirmed logout actions
- Project-local, explicitly configured, and system-wide Wrangler resolution
- Buttons for `dev`, `deploy`, deploy dry-run, `tail`, `types`, and startup checks
- Authentication status, version listing, secret-name listing, and interactive secret creation
- Deployment status/history and account-level listings for D1, R2, KV, Queues, Vectorize, Hyperdrive, Workflows, Pipelines, Containers, and Secrets Store
- Configured D1, R2, KV, Queue, Durable Object, Vectorize, Hyperdrive, Workflow, Pipeline, and Secrets Store bindings
- D1 database info, migration creation, local migration apply, and confirmed remote migration apply
- R2 bucket info
- JSON, JSONC, and legacy TOML configuration support
- Native empty-state onboarding for installation, project creation, initialization, dashboard import, and config-only setup
- Contextual Status Bar project/environment state and quick actions
- Per-project recent operation state with direct access to detailed output
- Cancellable progress and completion/error notifications for bounded operations

Explorer for Wrangler delegates to Wrangler instead of reimplementing Cloudflare APIs. Authentication remains with Wrangler, and secret values are entered only into Wrangler's terminal prompt.

## Requirements

Wrangler 4 or newer can be installed in the project:

```sh
npm install -D wrangler@latest
```

Alternatively, a system-wide `wrangler` on `PATH` is supported. Resolution defaults to an explicitly configured `wranglerExplorer.wranglerPath`, then the nearest project-local `node_modules/.bin/wrangler`, then the system `PATH`. Turn off `wranglerExplorer.preferLocalWrangler` to prefer the system installation over a local one.

If Wrangler is missing, the extension offers to install it using the lockfile-detected package manager.

## Project setup

When no Wrangler configuration is found, the Explorer shows native setup actions instead of an empty tree:

- **Create a New Worker Project** runs Create Cloudflare interactively in a terminal.
- **Initialize a Basic Worker Here** runs `wrangler init` after confirming the target folder.
- **Import a Worker from the Dashboard** runs `wrangler init --from-dash`.
- **Add wrangler.jsonc Only** creates a minimal configuration without modifying source files.
- **Install Wrangler Locally** uses the workspace's detected npm, pnpm, Yarn, or Bun lockfile.
- **Configure Wrangler Executable** supports externally managed installations.

Project-local Wrangler installations can be updated explicitly from the project context menu or Status Bar menu. System-wide and configured executables are reported as externally managed rather than being modified automatically.

## Usage

1. Open a folder containing a Wrangler configuration file.
2. Select the lasso-and-clouds icon in the Activity Bar.
3. Choose an environment, then run an action or inspect a configured resource.

Remote D1 migrations require an explicit modal confirmation. Destructive resource deletion is intentionally outside the initial release.

## Command output

Explorer for Wrangler chooses its output surface according to the operation:

- `dev`, `tail`, login, logout, Wrangler installation, and secret entry use interactive task terminals.
- Deploys and D1 migration application use cancellable progress notifications.
- Bounded command logs stream to the **Explorer for Wrangler** Output Channel.
- Output is preserved by default; use **Wrangler: Clear Output** manually or enable `wranglerExplorer.clearOutputBeforeCommand` for automatic clearing.
- Success and failure notifications link to detailed output; failures can be retried in a terminal.
- The latest bounded operation remains visible beneath its project in the Explorer.
- The Status Bar follows the active editor's nearest Wrangler project and opens a quick-action menu.

## Development

```sh
npm install
npm run check-types
npm test
npm run lint
npm run package
```

Press `F5` in VS Code to launch an Extension Development Host.

The Activity Bar SVG is also the source for the custom status-bar icon. Compile, watch, test, and package commands regenerate `media/explorer-for-wrangler.woff` automatically.

## Roadmap

- Remote account resource discovery and refresh
- Deployment and version detail views with rollback flows
- KV key and R2 object browsers
- D1 query editor and results grid
- Queue, Vectorize, Hyperdrive, Workflow, and Pipeline actions
- Wrangler task status and structured diagnostics

## Security model

Commands use `ShellExecution` with separate arguments and the project-local Wrangler binary. The extension never reads or stores Cloudflare tokens or secret values. Remote mutation actions should always be visibly labeled and confirmed.
