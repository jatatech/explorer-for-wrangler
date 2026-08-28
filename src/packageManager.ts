import * as fs from "node:fs";
import * as path from "node:path";

export type PackageManager = "npm" | "pnpm" | "yarn" | "bun";

export function detectPackageManager(start: string, boundary = start): { manager: PackageManager; root: string } {
  let current = start;
  while (true) {
    if (fs.existsSync(path.join(current, "pnpm-lock.yaml"))) return { manager: "pnpm", root: current };
    if (fs.existsSync(path.join(current, "yarn.lock"))) return { manager: "yarn", root: current };
    if (fs.existsSync(path.join(current, "bun.lock")) || fs.existsSync(path.join(current, "bun.lockb"))) return { manager: "bun", root: current };
    if (fs.existsSync(path.join(current, "package-lock.json"))) return { manager: "npm", root: current };
    if (current === boundary) break;
    const parent = path.dirname(current);
    if (parent === current || !current.startsWith(boundary)) break;
    current = parent;
  }
  return { manager: "npm", root: start };
}

export function installWranglerCommand(manager: PackageManager): [string, string[]] {
  switch (manager) {
    case "pnpm": return ["pnpm", ["add", "-D", "wrangler@latest"]];
    case "yarn": return ["yarn", ["add", "-D", "wrangler@latest"]];
    case "bun": return ["bun", ["add", "-d", "wrangler@latest"]];
    case "npm": return ["npm", ["install", "-D", "wrangler@latest"]];
  }
}

export function createCloudflareCommand(manager: PackageManager, name: string): [string, string[]] {
  switch (manager) {
    case "pnpm": return ["pnpm", ["create", "cloudflare@latest", name]];
    case "yarn": return ["yarn", ["create", "cloudflare", name]];
    case "bun": return ["bun", ["create", "cloudflare@latest", name]];
    case "npm": return ["npm", ["create", "cloudflare@latest", "--", name]];
  }
}
