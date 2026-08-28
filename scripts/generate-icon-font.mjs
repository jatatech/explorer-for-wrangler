import { copyFile, mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { FontAssetType, generateFonts } from "fantasticon";

const projectRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const sourceIcon = join(projectRoot, "media", "explorer-for-wrangler.svg");
const outputDir = join(projectRoot, "media");
const glyphName = "explorer-for-wrangler";

export async function generateIconFont() {
  const inputDir = await mkdtemp(join(tmpdir(), "explorer-for-wrangler-icon-"));

  try {
    await mkdir(outputDir, { recursive: true });
    await copyFile(sourceIcon, join(inputDir, basename(sourceIcon)));
    await generateFonts({
      inputDir,
      outputDir,
      name: glyphName,
      fontTypes: [FontAssetType.WOFF],
      assetTypes: [],
      codepoints: { [glyphName]: 0xe001 },
      fontHeight: 1000,
      descent: 0,
      normalize: true,
      round: 1
    }, true);
  } finally {
    await rm(inputDir, { recursive: true, force: true });
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await generateIconFont();
}
