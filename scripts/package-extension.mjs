import { mkdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createVSIX } from "@vscode/vsce";

const projectRoot = resolve(import.meta.dirname, "..");
const manifest = JSON.parse(await readFile(resolve(projectRoot, "package.json"), "utf8"));
const outputDir = resolve(projectRoot, "build");
const packagePath = resolve(outputDir, `${manifest.name}-${manifest.version}.vsix`);

await mkdir(outputDir, { recursive: true });
await createVSIX({
  cwd: projectRoot,
  dependencies: false,
  packagePath
});
