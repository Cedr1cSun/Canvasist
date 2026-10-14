// Captures screenshots of `npm run demo` (made-up data only) with Edge.
// Usage: node capture.mjs <outDir>
import fs from "node:fs";
import path from "node:path";

import { chromium } from "playwright-core";

const out = process.argv[2];
fs.mkdirSync(out, { recursive: true });
const BASE = "http://localhost:1430/";
// A Wednesday afternoon, so every group has something in it.
const NOW = new Date("2026-10-14T14:20:00");

const browser = await chromium.launch({ channel: "msedge", headless: true });

async function open({ lang, dark = false, query = "" }) {
  const context = await browser.newContext({
    viewport: { width: 440, height: 760 },
    deviceScaleFactor: 2,
    colorScheme: dark ? "dark" : "light",
    locale: lang,
  });
  const page = await context.newPage();
  await page.clock.setFixedTime(NOW);
  await page.goto(`${BASE}?lang=${lang}${query}`);
  await page.waitForSelector(".assignment, .connect, .settings", { timeout: 15000 });
  await page.waitForTimeout(1500); // let the first refresh finish
  return { context, page };
}

async function shot(page, name) {
  await page.screenshot({ path: path.join(out, name) });
  console.log("saved", name);
}

for (const lang of ["en", "zh-CN"]) {
  const tag = lang === "en" ? "en" : "zh";
  for (const dark of [false, true]) {
    const { context, page } = await open({ lang, dark });
    await shot(page, `list-${tag}${dark ? "-dark" : ""}.png`);
    if (!dark) {
      // Row menu of an open assignment.
      await page.locator(".assignment", { hasText: "Project 2" }).locator("button[aria-haspopup]").click();
      await page.waitForTimeout(300);
      await shot(page, `menu-${tag}.png`);
      await page.keyboard.press("Escape");
      // Settings.
      await page.locator(".header__actions button").last().click();
      await page.waitForSelector(".settings");
      await page.waitForTimeout(300);
      await shot(page, `settings-${tag}.png`);
    }
    await context.close();
  }
  const { context, page } = await open({ lang, query: "&signedOut" });
  await shot(page, `connect-${tag}.png`);
  await context.close();
}

await browser.close();
