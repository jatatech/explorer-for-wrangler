import { describe, expect, it } from "vitest";
import { configForEnvironment, environments, parseWranglerConfig, resourceGroups } from "../src/config";

describe("Wrangler config", () => {
  it("parses JSONC and discovers environments", () => {
    const config = parseWranglerConfig("wrangler.jsonc", `{
      // comments and trailing commas are supported
      "name": "demo",
      "env": { "production": {}, "staging": {}, },
    }`);
    expect(config.name).toBe("demo");
    expect(environments(config)).toEqual(["production", "staging"]);
  });

  it("parses TOML", () => {
    const config = parseWranglerConfig("wrangler.toml", `name = "demo"\n[env.staging]\nname = "demo-staging"`);
    expect(config.name).toBe("demo");
    expect(environments(config)).toEqual(["staging"]);
  });

  it("uses environment overrides", () => {
    const config = {
      name: "demo",
      d1_databases: [{ binding: "DB", database_name: "prod" }],
      env: { staging: { d1_databases: [{ binding: "DB", database_name: "staging" }] } }
    };
    expect(configForEnvironment(config, "staging").d1_databases).toEqual([{ binding: "DB", database_name: "staging" }]);
    expect(resourceGroups(config, "staging")[0]?.resources[0]?.name).toBe("staging");
  });

  it("extracts configured resource bindings", () => {
    const groups = resourceGroups({
      d1_databases: [{ binding: "DB", database_name: "app-db", database_id: "id" }],
      r2_buckets: [{ binding: "FILES", bucket_name: "uploads" }],
      kv_namespaces: [{ binding: "CACHE", id: "kv-id" }],
      queues: { producers: [{ binding: "JOBS", queue: "jobs" }] },
      durable_objects: { bindings: [{ name: "ROOM", class_name: "Room" }] }
    });
    expect(groups.map((group) => group.kind)).toEqual(["d1", "r2", "kv", "queue", "durable-object"]);
    expect(groups[0]?.resources[0]).toEqual({ kind: "d1", binding: "DB", name: "app-db", id: "id" });
  });
});
