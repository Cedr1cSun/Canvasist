// Records the "star an assignment" flow in demo mode (made-up data) as a GIF.
// Usage: node gif.mjs <out.gif> <lang>
import fs from "node:fs";
import gifenc from "gifenc";
const { GIFEncoder, quantize, applyPalette } = gifenc;
import { PNG } from "pngjs";

import { chromium } from "playwright-core";

const [outFile, lang = "en"] = process.argv.slice(2);
const NOW = new Date("2026-10-14T14:20:00");
const browser = await chromium.launch({ channel: "msedge", headless: true });
const context = await browser.newContext({
  viewport: { width: 440, height: 640 },
  deviceScaleFactor: 1.5,
  locale: lang,
});
const page = await context.newPage();
await page.clock.setFixedTime(NOW);
await page.goto(`http://localhost:1430/?lang=${lang}`);
await page.waitForSelector(".assignment");
await page.waitForTimeout(1500); // let the first refresh finish

const frames = [];
async function frame(holdMs) {
  frames.push({ png: PNG.sync.read(await page.screenshot()), holdMs });
}

const starLabel = lang === "en" ? "Mark as important" : "标为重要";
await frame(1800);
const row = page.locator(".assignment", { hasText: "Project 2" });
await row.locator("button[aria-haspopup]").click();
await page.waitForTimeout(250);
await frame(1300);
await page.getByRole("menuitem", { name: starLabel }).hover();
await page.waitForTimeout(150);
await frame(700);
await page.getByRole("menuitem", { name: starLabel }).click();
await page.mouse.move(5, 5);
await page.waitForTimeout(400);
await frame(2600);
await browser.close();

const { width, height } = frames[0].png;
const gif = GIFEncoder();
for (const { png, holdMs } of frames) {
  const palette = quantize(png.data, 256);
  gif.writeFrame(applyPalette(png.data, palette), width, height, { palette, delay: holdMs });
}
gif.finish();
fs.writeFileSync(outFile, gif.bytes());
console.log(`saved ${outFile}: ${frames.length} frames, ${width}x${height}, ${(gif.bytes().length / 1024).toFixed(0)} KB`);
