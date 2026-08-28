import { describe, expect, it } from "vitest";
import { DEPLOYED_WORKER_ACTIONS, PROJECT_ACTIONS, withEnvironment, WRANGLER_ACTIONS } from "../src/commands";

describe("Wrangler command arguments", () => {
  it("does not add an environment for top-level config", () => {
    expect(withEnvironment(["deploy"])).toEqual(["deploy"]);
  });

  it("adds the selected environment as separate arguments", () => {
    expect(withEnvironment(["d1", "migrations", "apply", "DB", "--remote"], "staging"))
      .toEqual(["d1", "migrations", "apply", "DB", "--remote", "--env", "staging"]);
  });

  it("separates project, deployed Worker, and Wrangler actions", () => {
    expect(PROJECT_ACTIONS.map((action) => action.label)).toEqual([
      "Start Dev Server", "Deploy", "Deploy Dry Run", "Tail Logs", "Generate Types", "Check Startup"
    ]);
    expect(DEPLOYED_WORKER_ACTIONS.map((action) => action.label)).toEqual([
      "Open Cloudflare Dashboard", "Deployment Status", "Deployments", "Versions", "Secrets", "Add Secret"
    ]);
    expect(WRANGLER_ACTIONS.map((action) => action.label)).toEqual([
      "Log In", "Log Out", "Who Am I?", "Update Wrangler"
    ]);
  });
});
