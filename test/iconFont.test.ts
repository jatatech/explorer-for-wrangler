import * as fs from "node:fs";
import * as path from "node:path";
import { describe, expect, it } from "vitest";

const projectRoot = process.cwd();

describe("generated icon assets", () => {
  it("generates a WOFF font registered under the status-bar icon ID", () => {
    const fontPath = path.join(projectRoot, "media", "explorer-for-wrangler.woff");
    const font = fs.readFileSync(fontPath);
    const manifest = JSON.parse(fs.readFileSync(path.join(projectRoot, "package.json"), "utf8"));

    expect(font.subarray(0, 4).toString("ascii")).toBe("wOFF");
    expect(manifest.contributes.icons["explorer-for-wrangler"].default).toEqual({
      fontPath: "media/explorer-for-wrangler.woff",
      fontCharacter: "\\E001"
    });
  });

  it("generates the Marketplace PNG referenced by the manifest", () => {
    const manifest = JSON.parse(fs.readFileSync(path.join(projectRoot, "package.json"), "utf8"));
    const iconPath = path.join(projectRoot, manifest.icon);
    const icon = fs.readFileSync(iconPath);

    expect(icon.subarray(0, 8)).toEqual(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
    expect(manifest.icon).toBe("media/explorer-for-wrangler.png");
  });
});
