# Changelog

## 0.3.0

- Added native empty-state onboarding when no Wrangler project is detected
- Added local installation, Create Cloudflare, basic initialization, dashboard import, and config-only setup flows
- Added explicit project-local Wrangler updates while leaving system/configured installations externally managed
- Added workspace-folder selection for multi-root setup
- Added a custom status-bar glyph generated from the Activity Bar SVG during builds

## 0.2.1

- Added a manual **Clear Output** action
- Added the opt-in `wranglerExplorer.clearOutputBeforeCommand` setting

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
