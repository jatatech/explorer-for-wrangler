import * as path from "node:path";
import * as TOML from "@iarna/toml";
import { parse, printParseErrorCode, type ParseError } from "jsonc-parser";
import type { CloudflareResource, ResourceGroup, ResourceKind, WranglerConfig } from "./model";

function asRecord(value: unknown): WranglerConfig {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as WranglerConfig)
    : {};
}

function asArray(value: unknown): WranglerConfig[] {
  return Array.isArray(value) ? value.map(asRecord) : [];
}

function text(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

export function parseWranglerConfig(filename: string, contents: string): WranglerConfig {
  if (path.extname(filename).toLowerCase() === ".toml") {
    return asRecord(TOML.parse(contents));
  }

  const errors: ParseError[] = [];
  const result = parse(contents, errors, { allowTrailingComma: true, disallowComments: false });
  if (errors.length > 0) {
    const first = errors[0]!;
    throw new Error(`${printParseErrorCode(first.error)} at offset ${first.offset}`);
  }
  return asRecord(result);
}

export function environments(config: WranglerConfig): string[] {
  return Object.keys(asRecord(config.env)).sort((a, b) => a.localeCompare(b));
}

export function configForEnvironment(config: WranglerConfig, environment?: string): WranglerConfig {
  if (!environment) {
    return config;
  }
  const selected = asRecord(asRecord(config.env)[environment]);
  return { ...config, ...selected, env: config.env };
}

export function workerName(config: WranglerConfig, environment?: string): string | undefined {
  const scoped = configForEnvironment(config, environment);
  return text(scoped.name);
}

function resource(
  kind: ResourceKind,
  entry: WranglerConfig,
  bindingKeys: string[],
  nameKeys: string[],
  idKeys: string[] = []
): CloudflareResource | undefined {
  const binding = bindingKeys.map((key) => text(entry[key])).find(Boolean);
  const name = nameKeys.map((key) => text(entry[key])).find(Boolean) ?? binding;
  if (!binding || !name) {
    return undefined;
  }
  return {
    kind,
    binding,
    name,
    id: idKeys.map((key) => text(entry[key])).find(Boolean)
  };
}

function collect(
  config: WranglerConfig,
  key: string,
  kind: ResourceKind,
  bindingKeys: string[],
  nameKeys: string[],
  idKeys: string[] = []
): CloudflareResource[] {
  return asArray(config[key])
    .map((entry) => resource(kind, entry, bindingKeys, nameKeys, idKeys))
    .filter((item): item is CloudflareResource => item !== undefined);
}

export function resourceGroups(config: WranglerConfig, environment?: string): ResourceGroup[] {
  const scoped = configForEnvironment(config, environment);
  const queueConfig = asRecord(scoped.queues);
  const durableObjects = asRecord(scoped.durable_objects);
  const definitions: ResourceGroup[] = [
    {
      kind: "d1",
      label: "D1 Databases",
      icon: "database",
      resources: collect(scoped, "d1_databases", "d1", ["binding"], ["database_name", "binding"], ["database_id"])
    },
    {
      kind: "r2",
      label: "R2 Buckets",
      icon: "archive",
      resources: collect(scoped, "r2_buckets", "r2", ["binding"], ["bucket_name", "binding"])
    },
    {
      kind: "kv",
      label: "KV Namespaces",
      icon: "key",
      resources: collect(scoped, "kv_namespaces", "kv", ["binding"], ["binding"], ["id"])
    },
    {
      kind: "queue",
      label: "Queues",
      icon: "list-ordered",
      resources: [
        ...collect(queueConfig, "producers", "queue", ["binding"], ["queue", "binding"]),
        ...collect(queueConfig, "consumers", "queue", ["queue"], ["queue"])
      ]
    },
    {
      kind: "durable-object",
      label: "Durable Objects",
      icon: "symbol-class",
      resources: collect(durableObjects, "bindings", "durable-object", ["name"], ["class_name", "name"])
    },
    {
      kind: "vectorize",
      label: "Vectorize Indexes",
      icon: "symbol-array",
      resources: collect(scoped, "vectorize", "vectorize", ["binding"], ["index_name", "binding"])
    },
    {
      kind: "hyperdrive",
      label: "Hyperdrive",
      icon: "database",
      resources: collect(scoped, "hyperdrive", "hyperdrive", ["binding"], ["binding"], ["id"])
    },
    {
      kind: "workflow",
      label: "Workflows",
      icon: "run-all",
      resources: collect(scoped, "workflows", "workflow", ["binding"], ["name", "binding"])
    },
    {
      kind: "pipeline",
      label: "Pipelines",
      icon: "server-process",
      resources: collect(scoped, "pipelines", "pipeline", ["binding"], ["pipeline", "binding"])
    },
    {
      kind: "secrets-store",
      label: "Secrets Store",
      icon: "lock",
      resources: collect(scoped, "secrets_store_secrets", "secrets-store", ["binding"], ["secret_name", "binding"], ["store_id"])
    }
  ];
  return definitions.filter((group) => group.resources.length > 0);
}
