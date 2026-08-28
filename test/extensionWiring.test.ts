import * as fs from "node:fs";
import * as path from "node:path";
import { describe, expect, it } from "vitest";

const root = path.resolve(__dirname, "..");
const manifest = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8")) as {
  contributes: {
    commands: Array<{ command: string }>;
    menus: Record<string, Array<{ command: string }>>;
    views: Record<string, Array<{ id: string; name: string; visibility?: string }>>;
  };
};
const source = fs.readFileSync(path.join(root, "src", "extension.ts"), "utf8");

describe("extension command wiring", () => {
  it("registers every contributed command exactly once", () => {
    const contributed = manifest.contributes.commands.map((entry) => entry.command);
    const registered = [...source.matchAll(/register\("([^"]+)"/g)].map((match) => match[1]!);
    expect(new Set(contributed).size).toBe(contributed.length);
    expect(new Set(registered).size).toBe(registered.length);
    expect(registered.sort()).toEqual(contributed.sort());
  });

  it("only references contributed commands from extension menus", () => {
    const contributed = new Set(manifest.contributes.commands.map((entry) => entry.command));
    const menuCommands = Object.values(manifest.contributes.menus).flat().map((entry) => entry.command);
    expect(menuCommands.filter((command) => !contributed.has(command))).toEqual([]);
  });

  it("does not duplicate view-title actions", () => {
    const titleCommands = manifest.contributes.menus["view/title"]!.map((entry) => entry.command);
    expect(new Set(titleCommands).size).toBe(titleCommands.length);
  });

  it("contributes account resources as a separate collapsed view", () => {
    expect(manifest.contributes.views.explorerForWrangler).toContainEqual({
      id: "explorerForWrangler.accountResources",
      name: "Cloudflare Account Resources",
      visibility: "collapsed"
    });
  });
});
