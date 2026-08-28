import * as esbuild from "esbuild";
import { generateIconAssets } from "./scripts/generate-icon-font.mjs";

const watch = process.argv.includes("--watch");
await generateIconAssets();
const context = await esbuild.context({
  entryPoints: ["src/extension.ts"],
  bundle: true,
  outfile: "dist/extension.js",
  external: ["vscode"],
  format: "cjs",
  platform: "node",
  target: "node20",
  mainFields: ["module", "main"],
  sourcemap: true,
  minify: !watch,
  logLevel: "info"
});

if (watch) {
  await context.watch();
  console.log("Watching Explorer for Wrangler sources...");
} else {
  await context.rebuild();
  await context.dispose();
}
