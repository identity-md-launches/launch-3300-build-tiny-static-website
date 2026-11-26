/**
 * Revision 35 (finding 12c82aab): measures the Summary heading before and after the first screenshot arrives, with the
 * built CSS and the markup LatestShot renders pending and loaded (tests/revision35.test.ts asserts they match). Run from
 * the repository root after npm run build: IMD_PLAYWRIGHT=/path/to/playwright/index.mjs node tests/browser/shot-shift.mjs
 * Expected: shift 0 at every width and capture shape, frame 16:9 of the column, no horizontal scroll.
 */
import { pathToFileURL } from "node:url";
const { chromium } = await import(process.env.IMD_PLAYWRIGHT ? pathToFileURL(process.env.IMD_PLAYWRIGHT).href : "playwright");
import { readFileSync, readdirSync } from "node:fs";
import { deflateSync, crc32 } from "node:zlib";
const css = readFileSync("dist/assets/" + readdirSync("dist/assets").find((f) => f.endsWith(".css")), "utf8");
function png(w, h) {
  const chunk = (t, d) => { const b = Buffer.alloc(12 + d.length); b.writeUInt32BE(d.length); b.write(t, 4); d.copy(b, 8); b.writeUInt32BE(crc32(Buffer.concat([Buffer.from(t), d])), 8 + d.length); return b; };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  const raw = Buffer.alloc((w * 3 + 1) * h); for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) raw[y * (w * 3 + 1) + 1 + x * 3] = (y * 255 / h) | 0;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}
const cap = '<figcaption class="small">The job form · <a href="https://imd.fun/jobs" target="_blank" rel="noopener noreferrer">imd.fun</a></figcaption>';
const pending = `<figure class="shot" aria-busy="true"><div class="shot-frame"></div>${cap}</figure>`;
const loaded = (src, w, h) => `<figure class="shot"><div class="shot-frame"><img src="${src}" alt="IMD: The job form" width="${w}" height="${h}" decoding="async"/></div>${cap}</figure>`;
const html = `<!doctype html><html><head><style>${css}</style></head><body><main><div class="overview"><div class="summary-col" id="col">${pending}<h2 id="sum">Summary</h2><div class="prose"><p>${"Text ".repeat(300)}</p></div></div></div></main></body></html>`;
const b = await chromium.launch();
for (const [w, h] of [[1280, 2000], [1280, 720], [1280, 400]]) for (const vw of [320, 390, 1440]) {
  const p = await b.newPage({ viewport: { width: vw, height: 844 } });
  await p.setContent(html);
  const before = await p.evaluate(() => [document.getElementById("sum").getBoundingClientRect().top, document.querySelector(".shot-frame").getBoundingClientRect().height]);
  const data = "data:image/png;base64," + png(w, h).toString("base64");
  await p.evaluate(([m]) => { document.querySelector(".shot").outerHTML = m; }, [loaded(data, w, h)]);
  await p.waitForFunction(() => document.querySelector(".shot img").complete);
  const after = await p.evaluate(() => { const i = document.querySelector(".shot img").getBoundingClientRect(); return [document.getElementById("sum").getBoundingClientRect().top, document.querySelector(".shot-frame").getBoundingClientRect().height, i.width, i.height, document.documentElement.scrollWidth]; });
  console.log(`${w}x${h} @${vw}: summary ${before[0]} -> ${after[0]} (shift ${after[0] - before[0]}), frame ${before[1]} -> ${after[1]}, img box ${after[2]}x${after[3]}, scrollWidth ${after[4]}`);
  if (vw === 390 && h === 2000) await p.screenshot({ path: "test/scratch/shots/shot-390.png" });
  await p.close();
}
await b.close();
