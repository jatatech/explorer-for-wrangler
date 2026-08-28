import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createCloudflareCommand, detectPackageManager, installWranglerCommand } from "../src/packageManager";

const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) fs.rmSync(directory, { recursive: true, force: true });
});

describe("package-manager setup commands", () => {
  it("detects a workspace-level pnpm lockfile from a nested project", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "explorer-for-wrangler-"));
    temporaryDirectories.push(root);
    const nested = path.join(root, "apps", "worker");
    fs.mkdirSync(nested, { recursive: true });
    fs.writeFileSync(path.join(root, "pnpm-lock.yaml"), "lockfileVersion: '9.0'\n");
    expect(detectPackageManager(nested, root)).toEqual({ manager: "pnpm", root });
  });

  it("builds local installation commands", () => {
    expect(installWranglerCommand("npm")).toEqual(["npm", ["install", "-D", "wrangler@latest"]]);
    expect(installWranglerCommand("bun")).toEqual(["bun", ["add", "-d", "wrangler@latest"]]);
  });

  it("builds Create Cloudflare commands", () => {
    expect(createCloudflareCommand("npm", "my-worker"))
      .toEqual(["npm", ["create", "cloudflare@latest", "--", "my-worker"]]);
    expect(createCloudflareCommand("pnpm", "my-worker"))
      .toEqual(["pnpm", ["create", "cloudflare@latest", "my-worker"]]);
  });
});
