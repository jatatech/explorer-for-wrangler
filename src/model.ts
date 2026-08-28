import type * as vscode from "vscode";

export type WranglerConfig = Record<string, unknown>;

export interface WranglerProject {
  configUri: vscode.Uri;
  rootUri: vscode.Uri;
  workspaceFolder: vscode.WorkspaceFolder;
  config: WranglerConfig;
  name: string;
  environments: string[];
  parseError?: string;
}

export type ResourceKind =
  | "d1"
  | "r2"
  | "kv"
  | "queue"
  | "durable-object"
  | "vectorize"
  | "hyperdrive"
  | "workflow"
  | "pipeline"
  | "container"
  | "secrets-store";

export interface CloudflareResource {
  kind: ResourceKind;
  binding: string;
  name: string;
  id?: string;
  source?: "config" | "remote";
  details?: Record<string, unknown>;
}

export interface ResourceGroup {
  kind: ResourceKind;
  label: string;
  icon: string;
  resources: CloudflareResource[];
}

export interface ProjectAction {
  command: string;
  label: string;
  icon: string;
  description?: string;
}

export type WranglerSource = "configured" | "local" | "system";

export interface WranglerExecutable {
  command: string;
  source: WranglerSource;
  version?: string;
}

export interface AuthStatus {
  state: "checking" | "loggedIn" | "loggedOut" | "unavailable" | "error";
  label: string;
  detail?: string;
  executable?: WranglerExecutable;
  accounts?: Array<{ id: string; name: string }>;
}

export interface WranglerOperation {
  projectKey: string;
  label: string;
  state: "running" | "succeeded" | "failed" | "cancelled";
  startedAt: number;
  finishedAt?: number;
  detail?: string;
  command?: string;
}

export interface WranglerResult {
  code: number | null;
  stdout: string;
  stderr: string;
  cancelled: boolean;
}
