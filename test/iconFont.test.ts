import * as fs from "node:fs";
import * as path from "node:path";
import { describe, expect, it } from "vitest";

const projectRoot = process.cwd();

describe("status-bar icon font", () => {
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
});
