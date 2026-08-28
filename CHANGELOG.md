# Changelog

## 0.6.0

- Reorganized project trees into Environment, Project Actions, Configured Bindings, Deployed Worker, and Wrangler sections
- Moved account-wide resource discovery into a separate Cloudflare Account Resources view that is collapsed by default

## 0.5.0

- Made resource rows selection-only and added consistent inline detail/browser actions
- Added in-memory duplicate-execution guards for bounded commands, refreshes, interactive tasks, and reusable webview panels; all guards reset on extension activation
- Replaced raw JSON detail/results output with typed field and table rendering, including D1 `data_types`
- Routed read-only lists and details to structured webviews while retaining operational logs in the Output Channel
- Added a title-bar and Status Bar menu shortcut to the extension settings

## 0.4.1

- Moved commands, views, context keys, and settings to the unique `explorerForWrangler` namespace so the extension can coexist with the legacy `wrangler-explorer` extension without duplicate actions or activation failures
- Added live Extension Host coverage that verifies every contributed command is registered

## 0.4.0

- Added remote account-resource discovery and refresh in the Explorer tree
- Added deployment/version tables, details, and confirmed rollback flows
- Added KV key browsing, R2 object-key navigation, and a D1 query/results panel
- Added Queue, Vectorize, Hyperdrive, Workflow, and Pipeline context actions
- Added interactive task status and structured Wrangler diagnostics
- Added environment-aware Cloudflare Dashboard deep links for Workers

## 0.3.0

- Added native empty-state onboarding when no Wrangler project is detected
- Added local installation, Create Cloudflare, basic initialization, dashboard import, and config-only setup flows
- Added explicit project-local Wrangler updates while leaving system/configured installations externally managed
- Added workspace-folder selection for multi-root setup
- Added a custom status-bar glyph generated from the Activity Bar SVG during builds

## 0.2.1

- Added a manual **Clear Output** action
- Added the opt-in `explorerForWrangler.clearOutputBeforeCommand` setting

## 0.2.0

- Added an Explorer for Wrangler Output Channel for bounded command logs
- Added cancellable progress and outcome notifications for deploys and migrations
- Added a contextual Status Bar project and environment selector
- Added per-project recent-operation state to the Explorer
- Kept interactive and continuous commands in VS Code task terminals

## 0.1.1

- Fixed extension activation by bundling `jsonc-parser` from its ESM entry point
- Added a packaged-runtime smoke test for activation exports and unresolved dependencies

## 0.1.0

- Initial Wrangler project explorer
- Core Worker actions and environment selection
- Configured Cloudflare resource discovery
- D1 migration and R2 inspection commands
- Interactive secret management
