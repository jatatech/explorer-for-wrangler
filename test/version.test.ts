import { describe, expect, it } from "vitest";
import { isNewerVersion, normalizeWranglerVersion } from "../src/version";

describe("Wrangler version checks", () => {
  it("normalizes Wrangler CLI output", () => {
    expect(normalizeWranglerVersion("⛅️ wrangler 4.60.0")).toBe("4.60.0");
    expect(normalizeWranglerVersion("wrangler v4.61.1-beta.2")).toBe("4.61.1-beta.2");
    expect(normalizeWranglerVersion("Wrangler unavailable")).toBeUndefined();
  });

  it("only reports a strictly newer semantic version", () => {
    expect(isNewerVersion("4.60.0", "4.61.0")).toBe(true);
    expect(isNewerVersion("4.60.0", "4.60.0")).toBe(false);
    expect(isNewerVersion("4.61.0", "4.60.0")).toBe(false);
    expect(isNewerVersion("4.61.0-beta.2", "4.61.0")).toBe(true);
  });
});
