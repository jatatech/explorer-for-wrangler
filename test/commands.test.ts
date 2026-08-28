import { describe, expect, it } from "vitest";
import { withEnvironment } from "../src/commands";

describe("Wrangler command arguments", () => {
  it("does not add an environment for top-level config", () => {
    expect(withEnvironment(["deploy"])).toEqual(["deploy"]);
  });

  it("adds the selected environment as separate arguments", () => {
    expect(withEnvironment(["d1", "migrations", "apply", "DB", "--remote"], "staging"))
      .toEqual(["d1", "migrations", "apply", "DB", "--remote", "--env", "staging"]);
  });
});
