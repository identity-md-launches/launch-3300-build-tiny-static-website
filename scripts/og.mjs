/**
 * Renders scripts/og.html to public/og.png at 1200 × 630 (the share image index.html names). Run from the repository
 * root with Playwright and a Chromium installed outside it, then `npm run build` copies it into dist/:
 *   IMD_PLAYWRIGHT=/path/to/playwright/index.mjs node scripts/og.mjs
 */
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
const { chromium } = await import(process.env.IMD_PLAYWRIGHT ? pathToFileURL(process.env.IMD_PLAYWRIGHT).href : "playwright");
const b = await chromium.launch({ args: ["--no-sandbox"] });
const p = await b.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
await p.goto(pathToFileURL(resolve("scripts/og.html")).href);
const fits = await p.evaluate(() => [...document.querySelectorAll("h1, p, ul, .site")].every((e) => e.getBoundingClientRect().right <= 1200 && e.getBoundingClientRect().bottom <= 630));
if (!fits) throw new Error("og.html overflows 1200 × 630");
await p.screenshot({ path: "public/og.png", clip: { x: 0, y: 0, width: 1200, height: 630 } });
await b.close();
console.log("wrote public/og.png");
