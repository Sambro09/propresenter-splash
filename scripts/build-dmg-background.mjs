#!/usr/bin/env node
// Rasterizes the DMG installer background artwork (Water Caustics) into the
// PNGs that electron-builder embeds in the .dmg. The design source of truth is
// build/dmg-background/dmg-background-water-caustics.html — edit that, then
// re-run this script to regenerate the assets.
//
//   node scripts/build-dmg-background.mjs
//
// Output (electron-builder auto-combines these into a Retina TIFF at build time):
//   build/background.png      660 x 400   (@1x — also sets the DMG window size)
//   build/background@2x.png   1320 x 800  (@2x — Retina)
//
// macOS only: relies on a Chromium-based browser for rendering and `sips` for
// the @1x downscale. Both are a given on the machines that build the .dmg.
import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const source = join(repoRoot, 'build', 'dmg-background', 'dmg-background-water-caustics.html');
const at1x = join(repoRoot, 'build', 'background.png');
const at2x = join(repoRoot, 'build', 'background@2x.png');

// Content-area size in points, straight from the design handoff (Artwork Spec).
const WIDTH = 660;
const HEIGHT = 400;

if (!existsSync(source)) {
  console.error(`Design source not found: ${source}`);
  process.exit(1);
}

function findBrowser() {
  const candidates = [
    process.env.CHROME_BIN,
    process.env.PUPPETEER_EXECUTABLE_PATH,
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser',
    '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge'
  ].filter(Boolean);
  return candidates.find(existsSync);
}

const browser = findBrowser();
if (!browser) {
  console.error('No Chromium-based browser found. Install Google Chrome, or set CHROME_BIN to a browser executable.');
  process.exit(1);
}

// Render at 2x device pixels: a 660x400 window captured at DPR 2 -> 1320x800.
const render = spawnSync(
  browser,
  [
    '--headless=new',
    '--disable-gpu',
    '--hide-scrollbars',
    '--force-device-scale-factor=2',
    `--window-size=${WIDTH},${HEIGHT}`,
    '--default-background-color=00000000',
    `--screenshot=${at2x}`,
    pathToFileURL(source).href
  ],
  { encoding: 'utf8', timeout: 60_000 }
);

if (render.status !== 0 || !existsSync(at2x)) {
  console.error('Browser failed to render the background.');
  if (render.stderr) console.error(render.stderr.trim());
  process.exit(render.status ?? 1);
}

// Downscale the Retina capture to the @1x rep. sips -z takes height then width.
const downscale = spawnSync('sips', ['-z', String(HEIGHT), String(WIDTH), at2x, '--out', at1x], {
  encoding: 'utf8'
});

if (downscale.status !== 0) {
  console.error('sips failed to produce the @1x background.');
  if (downscale.stderr) console.error(downscale.stderr.trim());
  process.exit(downscale.status ?? 1);
}

console.log(`Wrote ${at1x} (${WIDTH}x${HEIGHT})`);
console.log(`Wrote ${at2x} (${WIDTH * 2}x${HEIGHT * 2})`);
