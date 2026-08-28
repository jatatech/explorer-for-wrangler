import { describe, expect, it } from "vitest";
import { REMOTE_RESOURCE_SPECS, parseJsonOutput, resourcesFromResult, rowsFromOutput } from "../src/structured";

describe("structured Wrangler output", () => {
  it("finds JSON after Wrangler informational output", () => {
    expect(parseJsonOutput("wrangler 4\n[{\"name\":\"cache\"}]"))
      .toEqual([{ name: "cache" }]);
  });

  it("normalizes box-drawing tables", () => {
    expect(rowsFromOutput("│ name │ id │\n│ jobs │ queue-id │"))
      .toEqual([{ name: "jobs", id: "queue-id" }]);
  });

  it("normalizes Wrangler labelled resource blocks", () => {
    expect(rowsFromOutput("Listing buckets...\nname: assets\ncreation_date: 2026-01-01\n\nname: logs\ncreation_date: 2026-02-01"))
      .toEqual([
        { name: "assets", creation_date: "2026-01-01" },
        { name: "logs", creation_date: "2026-02-01" }
      ]);
  });

  it("maps remote records into explorer resources", () => {
    const spec = REMOTE_RESOURCE_SPECS.find((item) => item.kind === "d1")!;
    const resources = resourcesFromResult(spec, {
      code: 0,
      stdout: JSON.stringify([{ name: "app-db", uuid: "db-id" }]),
      stderr: "",
      cancelled: false
    });
    expect(resources[0]).toMatchObject({ kind: "d1", name: "app-db", id: "db-id", source: "remote" });
  });

  it("discovers every account resource type exposed by the explorer", () => {
    expect(REMOTE_RESOURCE_SPECS.map((spec) => spec.label)).toEqual([
      "D1 Databases", "R2 Buckets", "KV Namespaces", "Queues", "Vectorize Indexes", "Hyperdrive",
      "Workflows", "Pipelines", "Containers", "Secrets Stores"
    ]);
  });
});
