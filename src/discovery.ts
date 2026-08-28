import * as path from "node:path";
import * as vscode from "vscode";
import { environments, parseWranglerConfig } from "./config";
import type { WranglerProject } from "./model";

const EXCLUDE = "**/{node_modules,.git,.wrangler,dist,build,out}/**";

export async function discoverProjects(): Promise<WranglerProject[]> {
  const configured = vscode.workspace
    .getConfiguration("wranglerExplorer")
    .get<string[]>("configFiles", ["wrangler.jsonc", "wrangler.json", "wrangler.toml"]);
  const pattern = `**/{${configured.join(",")}}`;
  const uris = await vscode.workspace.findFiles(pattern, EXCLUDE);
  const projects = await Promise.all(uris.map(loadProject));
  return projects.sort((a, b) => a.name.localeCompare(b.name));
}

async function loadProject(configUri: vscode.Uri): Promise<WranglerProject> {
  const workspaceFolder = vscode.workspace.getWorkspaceFolder(configUri);
  if (!workspaceFolder) {
    throw new Error(`No workspace folder contains ${configUri.fsPath}`);
  }
  const rootUri = vscode.Uri.file(path.dirname(configUri.fsPath));
  try {
    const bytes = await vscode.workspace.fs.readFile(configUri);
    const config = parseWranglerConfig(configUri.fsPath, new TextDecoder().decode(bytes));
    const configuredName = typeof config.name === "string" ? config.name : undefined;
    return {
      configUri,
      rootUri,
      workspaceFolder,
      config,
      name: configuredName ?? path.basename(rootUri.fsPath),
      environments: environments(config)
    };
  } catch (error) {
    return {
      configUri,
      rootUri,
      workspaceFolder,
      config: {},
      name: path.basename(rootUri.fsPath),
      environments: [],
      parseError: error instanceof Error ? error.message : String(error)
    };
  }
}
