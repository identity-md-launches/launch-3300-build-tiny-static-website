/** Reading checks at 320, 390 and 1440 wide. See harness.mjs. */
import { launch, mock, serve } from "./harness.mjs";
import { mkdir } from "node:fs/promises";
await mkdir("test/scratch/shots", { recursive: true });
const s = await serve(); const b = await launch();
const ok = (n, v, d = "") => console.log(v ? "PASS" : "FAIL", n, d);
const open = async (w, opts = {}, h = 844) => { const ctx = await b.newContext({ viewport: { width: w, height: h }, permissions: ["clipboard-read", "clipboard-write"] }); await mock(ctx, opts); const p = await ctx.newPage(); p.on("pageerror", (e) => console.log("ERR", e.message)); p.on("console", (m) => m.type() === "error" && !/Failed to load resource/.test(m.text()) && console.log("CONSOLE", m.text().slice(0, 200))); return p; };
const settled = async (p) => { await p.waitForSelector(".subject", { timeout: 150000 }); await p.waitForFunction(() => { const t = document.querySelector(".totals-line"); return t && /proofs/.test(t.textContent); }, null, { timeout: 120000 }); };
// Home at three widths
for (const w of [390, 320, 1440]) {
  const p = await open(w); const seen = [];
  await p.exposeFunction("__t", (t) => { if (seen.at(-1) !== t) seen.push(t); });
  await p.addInitScript(() => setInterval(() => { const t = document.querySelector(".totals-line"); if (t) window.__t(t.textContent); }, 60));
  await p.goto(s.base); await settled(p); await p.waitForTimeout(300);
  console.log("totals seen", JSON.stringify(seen));
  ok(`home ${w} no overflow`, (await p.evaluate(() => document.documentElement.scrollWidth)) <= w);
  const r = await p.evaluate(() => { const q = (x) => document.querySelector(x).getBoundingClientRect(); const i = document.querySelector("#lookup"); const c = document.createElement("canvas").getContext("2d"); const cs = getComputedStyle(i); c.font = `${cs.fontSize} ${cs.fontFamily}`; return { conn: q(".top-row button").right, btn: [q(".btn-lookup").top, q(".btn-lookup").bottom, q(".btn-lookup").right], ex: [q(".example-link").top, q(".example-link").bottom, q(".example-link").left], hint: c.measureText(i.placeholder).width, room: i.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight), phf: getComputedStyle(i, "::placeholder").fontSize, cards: [...document.querySelectorAll(".example-text")].map((x) => x.textContent), from: document.querySelector(".example-from")?.innerText }; });
  console.log(w, JSON.stringify(r));
  await p.screenshot({ path: `test/scratch/shots/home-${w}.png` }); await p.context().close();
}
// five subjects: key facts at 320, console, overflow
for (const id of ["imd.fun", "zora.co", "uniswap.org", "ens.domains", "imdusd.com"]) {
  const p = await open(320); await p.goto(`${s.base}#/s/${id}`); await p.waitForSelector(".keyfacts", { timeout: 120000 });
  const m = await p.$(".kf-more"); if (m) await m.click();
  const o = await p.evaluate(() => { const hit = (a, b) => a.left < b.right - 0.5 && b.left < a.right - 0.5 && a.top < b.bottom - 0.5 && b.top < a.bottom - 0.5; const bad = []; for (const r of document.querySelectorAll(".kf-row")) { const bs = [...r.querySelectorAll(".badge,.pencil")].map((x) => x.getBoundingClientRect()); for (const c of r.querySelectorAll(".addr-link,.copy-icon,.tok-chain")) for (const x of bs) if (hit(c.getBoundingClientRect(), x)) bad.push(r.innerText.slice(0, 40)); const th = r.querySelector("th"); if (hit(th.getBoundingClientRect(), r.querySelector(".kf-badge").getBoundingClientRect())) bad.push("label under badge"); for (const x of r.querySelectorAll("th, th *")) for (const b of bs) if (hit(x.getBoundingClientRect(), b)) bad.push("label/badge " + th.innerText); const v = r.querySelector(".kf-value"); if (v.scrollWidth > v.clientWidth) bad.push("overflow " + r.innerText.slice(0, 40)); } return { bad, w: document.documentElement.scrollWidth }; });
  ok(`key facts 320 ${id}`, !o.bad.length && o.w <= 320, JSON.stringify(o));
  for (const t of await p.locator(".kf-row").all()) { const x = (await t.innerText()).replace(/\s*\n\s*/g, " / "); if (/^(Main contract|Contracts|Chains|Supply|Official|Deployed|Controlled)/.test(x)) console.log("   ", x.slice(0, 330)); }
  console.log("    banner:", await p.locator(".disputed-note").allInnerTexts());
  if (id === "imd.fun") await p.evaluate(() => (document.querySelector(".top").style.position = "static")), await p.locator(".keyfacts").screenshot({ path: "test/scratch/shots/kf-320.png" });
  await p.context().close();
}
// Activity and proof details on imd.fun
{
  const p = await open(390); await p.goto(`${s.base}#/s/imd.fun/activity`); await p.waitForSelector(".act", { timeout: 120000 });
  const a = p.locator(".act", { has: p.locator('a[href*="e75885b2"]') }); console.log((await a.innerText()).slice(0, 2400)); await a.screenshot({ path: "test/scratch/shots/act.png" });
  console.log("not read:", await p.locator(".rejected").count(), "next rebuild:", await p.getByText("next rebuild").count());
  await p.goto(`${s.base}#/s/imd.fun/record`); await p.waitForSelector(".section-toggle"); await p.locator(".section-toggle", { hasText: "On chain" }).click();
  await p.evaluate(() => document.querySelector(".top").style.position = "static"); const row = p.locator(".fact-row", { hasText: "Job price" }).first(); console.log("ROW", (await row.innerText()).replace(/\n/g, " / ")); await row.locator(".row-toggle").click();
  const d = p.locator(".fact-details").first(); console.log((await d.innerText()).slice(0, 1500)); ok("pre blocks", (await d.locator("pre").count()) >= 1); await d.locator(".rerun .copy").first().click(); ok("copied", (await p.evaluate(() => navigator.clipboard.readText())) === (await d.locator("pre").first().innerText())); await d.screenshot({ path: "test/scratch/shots/fact.png" });
  console.log("values:", (await p.locator('td[data-label="Value"]').allInnerTexts()).join(" | ").slice(0, 900));
  await p.locator(".section-toggle", { hasText: "What it does" }).click();
  const l = p.locator("li.row", { hasText: "IMD describes itself as a network of AI agents that people can hire" }).first(); console.log((await l.innerText()).replace(/\n/g, " / ").slice(0, 400)); await l.locator(".row-toggle").first().click(); await l.screenshot({ path: "test/scratch/shots/line.png" }); ok("no chips", (await p.locator(".chip").count()) === 0);
  ok("record 390 no overflow", (await p.evaluate(() => document.documentElement.scrollWidth)) <= 390);
  await p.context().close();
}
await b.close(); s.close();
