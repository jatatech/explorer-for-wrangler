import { copyFile, mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { FontAssetType, generateFonts } from "fantasticon";
import sharp from "sharp";

const projectRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const sourceIcon = join(projectRoot, "media", "explorer-for-wrangler.svg");
const outputDir = join(projectRoot, "media");
const glyphName = "explorer-for-wrangler";
const marketplaceIcon = join(outputDir, `${glyphName}.png`);

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

export async function generateMarketplaceIcon() {
  const source = await readFile(sourceIcon, "utf8");
  const foreground = await sharp(Buffer.from(source.replaceAll("currentColor", "#ffffff")))
    .resize(176, 176, { fit: "contain" })
    .png()
    .toBuffer();
  const background = Buffer.from(`
    <svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 256 256">
      <rect width="256" height="256" rx="48" fill="#1f2937"/>
      <path d="M0 198 C62 162 133 237 256 165 V256 H0 Z" fill="#f6821f"/>
    </svg>
  `);

  await sharp(background)
    .composite([{ input: foreground, left: 40, top: 28 }])
    .png()
    .toFile(marketplaceIcon);
}

export async function generateIconAssets() {
  await Promise.all([generateIconFont(), generateMarketplaceIcon()]);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await generateIconAssets();
}
