import type { CloudflareResource, ResourceKind, WranglerResult } from "./model";

export interface RemoteResourceSpec {
  kind: ResourceKind;
  label: string;
  icon: string;
  args: string[];
  nameKeys: string[];
  idKeys: string[];
}

export const REMOTE_RESOURCE_SPECS: readonly RemoteResourceSpec[] = [
  { kind: "d1", label: "D1 Databases", icon: "database", args: ["d1", "list", "--json"], nameKeys: ["name", "database_name"], idKeys: ["uuid", "id", "database_id"] },
  { kind: "r2", label: "R2 Buckets", icon: "archive", args: ["r2", "bucket", "list"], nameKeys: ["name", "bucket_name"], idKeys: [] },
  { kind: "kv", label: "KV Namespaces", icon: "key", args: ["kv", "namespace", "list"], nameKeys: ["title", "name"], idKeys: ["id"] },
  { kind: "queue", label: "Queues", icon: "list-ordered", args: ["queues", "list"], nameKeys: ["name", "queue_name"], idKeys: ["id", "queue_id"] },
  { kind: "vectorize", label: "Vectorize Indexes", icon: "symbol-array", args: ["vectorize", "list", "--json"], nameKeys: ["name"], idKeys: ["id"] },
  { kind: "hyperdrive", label: "Hyperdrive", icon: "database", args: ["hyperdrive", "list"], nameKeys: ["name"], idKeys: ["id"] },
  { kind: "workflow", label: "Workflows", icon: "run-all", args: ["workflows", "list", "--per-page", "100"], nameKeys: ["name", "workflow_name"], idKeys: ["id", "workflow_id"] },
  { kind: "pipeline", label: "Pipelines", icon: "server-process", args: ["pipelines", "list", "--per-page", "100", "--json"], nameKeys: ["name"], idKeys: ["id"] }
] as const;

export function parseJsonOutput(output: string): unknown | undefined {
  const trimmed = output.trim();
  if (!trimmed) return undefined;
  try { return JSON.parse(trimmed); } catch { /* Wrangler may prefix informational lines. */ }
  for (let index = 0; index < trimmed.length; index += 1) {
    if (trimmed[index] !== "[" && trimmed[index] !== "{") continue;
    try { return JSON.parse(trimmed.slice(index)); } catch { /* keep scanning */ }
  }
  return undefined;
}

export function rowsFromOutput(output: string): Record<string, unknown>[] {
  const parsed = parseJsonOutput(output);
  if (Array.isArray(parsed)) return parsed.filter(isRecord);
  if (isRecord(parsed)) {
    for (const key of ["results", "result", "items", "databases", "buckets", "namespaces", "queues", "indexes", "configs", "workflows", "pipelines"]) {
      const value = parsed[key];
      if (Array.isArray(value)) return value.filter(isRecord);
    }
    return [parsed];
  }
  return parseTable(output);
}

export function resourcesFromResult(spec: RemoteResourceSpec, result: WranglerResult): CloudflareResource[] {
  if (result.code !== 0) return [];
  return rowsFromOutput(result.stdout).flatMap((row) => {
    const name = firstString(row, spec.nameKeys);
    if (!name) return [];
    const id = firstString(row, spec.idKeys);
    return [{ kind: spec.kind, name, binding: name, id, source: "remote" as const, details: row }];
  });
}

function parseTable(output: string): Record<string, unknown>[] {
  const lines = output.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const tableLines = lines.filter((line) => line.includes("│"));
  if (tableLines.length >= 2) {
    const cells = tableLines.map((line) => line.split("│").map((cell) => cell.trim()).filter(Boolean));
    const headers = cells[0]?.map(normalizeKey) ?? [];
    return cells.slice(1).filter((row) => row.length === headers.length).map((row) =>
      Object.fromEntries(headers.map((header, index) => [header, row[index]]))
    );
  }
  const labelled = parseLabelledBlocks(output);
  if (labelled.length > 0) return labelled;
  const plain = lines.filter((line) => !/^[┌┐└┘├┤─+|=\s]+$/.test(line));
  if (plain.length < 2) return [];
  const headers = plain[0]?.split(/\s{2,}/).map(normalizeKey) ?? [];
  return plain.slice(1).map((line) => line.split(/\s{2,}/)).filter((row) => row.length === headers.length).map((row) =>
    Object.fromEntries(headers.map((header, index) => [header, row[index]]))
  );
}

function parseLabelledBlocks(output: string): Record<string, unknown>[] {
  const blocks = output.split(/\r?\n\s*\r?\n/);
  return blocks.flatMap((block) => {
    const entries = block.split(/\r?\n/).map((line) => /^\s*([^:]+):\s*(.+)\s*$/.exec(line)).filter((match): match is RegExpExecArray => Boolean(match));
    if (entries.length === 0) return [];
    return [Object.fromEntries(entries.map((match) => [normalizeKey(match[1]!), match[2]!.trim()]))];
  });
}

function normalizeKey(value: string): string { return value.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, ""); }
function firstString(row: Record<string, unknown>, keys: readonly string[]): string | undefined {
  for (const key of keys) {
    const value = row[key] ?? row[normalizeKey(key)];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return undefined;
}
function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }
