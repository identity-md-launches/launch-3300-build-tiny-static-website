/**
 * Browser interaction checks on the built export, in one foreground command:
 *   npx vite-node tests/make-fixture.ts test/scratch/fx.json
 *   IMD_PLAYWRIGHT=/path/to/playwright/index.mjs node tests/e2e.mjs test/scratch/fx.json test/scratch/e2e
 * Serves dist/ on a local port and opens it in Chromium at 390, 1440 and 320 wide: home, Add a project, an old link,
 * Overview key facts, Record, Activity labels and the Contribute forms. Every chain read (JSON-RPC)
 * and every api.imd.fun read is answered from the fixture, which holds an old page, a sources result, a panel
 * answer, a rebuild of the first two, and a sources result and an edit completed after the rebuild. The two
 * instruction gateways (ipfs.filebase.io, gateway.pinata.cloud) serve the current instruction files by raw CID, or
 * fail on request, to check that no pay dialog opens for a job that cannot read its instructions. It also checks the
 * remembered-wallet flag (no flag: no wallet code; flag: outline, background load, flag cleared when it fails).
 */
import { createServer } from "node:http";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { extname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const fx = JSON.parse(await readFile(resolve(process.argv[2] ?? "test/scratch/fx.json"), "utf8"));
const out = resolve(process.argv[3] ?? "test/scratch/e2e");
// The current instruction files (src/instructions.json) and the address a job fetches each from, as src/instructions.ts builds it.
const MANIFEST = JSON.parse(await readFile(new URL("../src/instructions.json", import.meta.url), "utf8"));
const RAW_INS = { rebuild: await readFile(new URL(`../public/instructions/${MANIFEST.rebuild.file}`, import.meta.url), "utf8"), changes: await readFile(new URL(`../public/instructions/${MANIFEST.changes.file}`, import.meta.url), "utf8") };
const rawCid = (hex) => { const a = "abcdefghijklmnopqrstuvwxyz234567"; let o = "b", bits = 0, v = 0; for (const x of Buffer.from("01551220" + hex, "hex")) { v = ((v << 8) | x) & 0xffff; bits += 8; while (bits >= 5) { o += a[(v >>> (bits - 5)) & 31]; bits -= 5; } } if (bits) o += a[(v << (5 - bits)) & 31]; return o; };
const INS_URL = (name) => `https://ipfs.filebase.io/ipfs/${rawCid(MANIFEST[name].sha256)}?filename=${MANIFEST[name].file}`;
/** The second address for the same raw CID ("or, if that fails, at <URL2>"), INSTRUCTIONS_FALLBACK_GATEWAY. */
const FB_URL = (name) => `https://gateway.pinata.cloud/ipfs/${rawCid(MANIFEST[name].sha256)}?filename=${MANIFEST[name].file}`;
const NAMES = (name) => `Your full instructions are the file at ${INS_URL(name)} or, if that fails, at ${FB_URL(name)}, sha256 ${MANIFEST[name].sha256}.`;
const { chromium } = await import(pathToFileURL(process.env.IMD_PLAYWRIGHT ?? "playwright").href);
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".png": "image/png", ".md": "text/markdown" };
const root = resolve("dist");
const server = createServer(async (req, res) => {
  let rel = decodeURIComponent(new URL(req.url, "http://x").pathname.slice(1)) || "index.html";
  try {
    res.writeHead(200, { "content-type": TYPES[extname(rel)] ?? "application/octet-stream" }).end(await readFile(join(root, rel)));
  } catch {
    res.writeHead(404).end();
  }
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const base = `http://127.0.0.1:${server.address().port}/`;
await mkdir(out, { recursive: true });

const results = [];
const check = (name, ok, detail = "") => {
  results.push({ name, ok: !!ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? `: ${detail}` : ""}`);
};

const rpcAnswer = (call, fx, opts) => {
  const p = call.params ?? [];
  switch (call.method) {
    case "eth_blockNumber":
      return opts.failBlockNumber ? null : "0x" + fx.head.toString(16);
    case "eth_chainId":
      return "0x1";
    case "eth_getBlockByNumber":
      return { timestamp: "0x6900f000", number: p[0] };
    case "eth_call":
      return "0x" + (500000000000000000n).toString(16).padStart(64, "0");
    case "eth_getLogs": {
      const f = p[0];
      const inRange = (l) => BigInt(l.blockNumber) >= BigInt(f.fromBlock) && BigInt(l.blockNumber) <= BigInt(f.toBlock);
      if (f.topics[0] === fx.requests[0].topics[0]) return fx.requests.filter(inRange);
      const ids = (f.topics[1] ?? []).map((x) => x.toLowerCase());
      return fx.completions.filter((c) => inRange(c) && ids.includes(c.topics[1].toLowerCase()));
    }
    default:
      return null;
  }
};

/**
 * opts: fx (a variant fixture), failBlockNumber (an RPC error), delayLogs (ms before eth_getLogs answers),
 * insDown (both instruction gateways answer 504), insFirstDown (only the first gateway, Filebase, answers 504).
 */
async function mock(page, opts = {}) {
  const f = opts.fx ?? fx;
  await page.route(/^https?:\/\/(?!127\.0\.0\.1)/, async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const json = (b, status = 200) => route.fulfill({ status, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: JSON.stringify(b) });
    if (req.method() === "OPTIONS") return route.fulfill({ status: 204, headers: { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "*" } });
    if (req.method() === "POST" && (req.postData() ?? "").includes("jsonrpc")) {
      const body = JSON.parse(req.postData());
      if (opts.delayLogs && (Array.isArray(body) ? body : [body]).some((c) => c.method === "eth_getLogs")) await new Promise((r) => setTimeout(r, opts.delayLogs));
      const one = (c) => {
        const r = rpcAnswer(c, f, opts);
        return r === null ? { jsonrpc: "2.0", id: c.id, error: { code: -32000, message: "not in fixture" } } : { jsonrpc: "2.0", id: c.id, result: r };
      };
      return json(Array.isArray(body) ? body.map(one) : one(body));
    }
    if (url.hostname === "api.imd.fun") {
      let m;
      const fx = f;
      if ((m = /^\/intake\/1\/(0x[0-9a-f]+)$/.exec(url.pathname))) return json(fx.intake[m[1]] ?? { entries: [] });
      if ((m = /^\/jobs\/([^/]+)\/result$/.exec(url.pathname))) return fx.results[m[1]] ? json(fx.results[m[1]]) : json({}, 404);
      if ((m = /^\/artifacts\/([0-9a-f]{64})$/.exec(url.pathname)) && fx.bin?.[m[1]])
        return route.fulfill({ status: 200, contentType: "image/png", headers: { "access-control-allow-origin": "*" }, body: Buffer.from(fx.bin[m[1]], "base64") });
      if ((m = /^\/artifacts\/([0-9a-f]{64})$/.exec(url.pathname)))
        return fx.files[m[1]] ? route.fulfill({ status: 200, headers: { "access-control-allow-origin": "*" }, body: fx.files[m[1]] }) : json({}, 404);
      if (/^\/oracle\/requests\//.test(url.pathname)) return json({ id: fx.oracleId, status: "completed", panelSize: 5, jobId: "job-6", agreement: { agreed: 5, answer: true } });
    }
    // The two instruction gateways: the current files by their raw CID, as Filebase and Pinata serve them.
    if (url.hostname === "ipfs.filebase.io" || url.hostname === "gateway.pinata.cloud") {
      gatewayHits.push(url.hostname);
      if (opts.insDown || (opts.insFirstDown && url.hostname === "ipfs.filebase.io")) return route.fulfill({ status: 504, headers: { "access-control-allow-origin": "*" }, body: "" });
      for (const name of ["rebuild", "changes"])
        if (url.pathname === `/ipfs/${rawCid(MANIFEST[name].sha256)}`) return route.fulfill({ status: 200, contentType: "text/plain; charset=utf-8", headers: { "access-control-allow-origin": "*" }, body: RAW_INS[name] });
    }
    return route.fulfill({ status: 404, body: "" });
  });
}
/** Every instruction-gateway request the mock answered, in order. */
const gatewayHits = [];

// IMD_CHROME: an installed Chromium or Chrome, when the Playwright build has no matching browser download.
const browser = await chromium.launch({ headless: true, ...(process.env.IMD_CHROME ? { executablePath: process.env.IMD_CHROME } : {}) });
const overflow = (page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
/** The elements that reach past the viewport, for a failed overflow check. */
const wideOf = (page) =>
  page.evaluate(() => {
    const w = document.documentElement.clientWidth;
    return [...document.querySelectorAll("body *")]
      .filter((e) => e.getBoundingClientRect().right > w + 0.5)
      .slice(0, 6)
      .map((e) => `${e.tagName.toLowerCase()}${e.id ? "#" + e.id : ""}.${String(e.className).replace(/ /g, ".")} right=${Math.round(e.getBoundingClientRect().right)}`)
      .join(", ");
  });
try {
  for (const width of [390, 1440, 320]) {
    const ctx = await browser.newContext({ viewport: { width, height: 844 } });
    const page = await ctx.newPage();
    await mock(page);
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("console", (m) => m.type() === "error" && !/Failed to load resource/.test(m.text()) && errors.push(m.text()));
    const W = `${width}:`;

    // Home
    await page.goto(base);
    const listed = await page.waitForSelector(".subjects .subject", { timeout: 60000 }).then(() => true, () => false);
    check(`${W} home lists the subjects found on chain`, listed && (await page.locator(".subjects .subject").count()) === 1);
    if (!listed) {
      await page.screenshot({ path: join(out, `${width}-home-fail.png`) });
      continue;
    }
    const item = await page.locator(".subjects .subject").first().innerText();
    // First visit: the home list reads no page file, so a subject never opened here is listed by id (job 8).
    check(`${W} first visit: a subject is listed by id, then its digest once its page file is read`, /imd\.fun/.test(item) && (/Reading its record…/.test(item) || /Changed /.test(item)), item.replace(/\n/g, " | "));
    check(`${W} the title is On the record (test)`, (await page.title()) === "On the record (test)");

    const hero = await page.evaluate(() => {
      const h1 = document.querySelector("h1");
      const lead = document.querySelector(".hero .lead");
      const inp = document.querySelector("#lookup");
      const btn = document.querySelector(".btn-lookup");
      const cs = inp && getComputedStyle(inp);
      const r = (e) => e?.getBoundingClientRect();
      return { h1: h1?.textContent, lead: lead?.textContent, center: h1 && getComputedStyle(h1).textAlign, ph: inp?.getAttribute("placeholder"), btn: btn?.textContent, h: r(inp)?.height, radius: cs?.borderTopLeftRadius, size: cs?.fontSize, bg: cs?.backgroundColor, inBottom: r(inp)?.bottom, btnBottom: r(btn)?.bottom, sameRow: Math.abs((r(inp)?.top ?? 0) - (r(btn)?.top ?? 1)) < 2 };
    });
    check(`${W} the headline and the line under it are the brief's, centred`, hero.h1 === "Look up any crypto project." && /^See what a project says, what can be proven, and where the two differ\. Every line points to its source, and a swarm of independent agents checks each one before it goes in\.$/.test(hero.lead ?? "") && hero.center === "center", JSON.stringify(hero));
    check(`${W} one bar: 56px high, 14px corners, 17px text, light grey fill, placeholder and Look it up beside it`, hero.h === 56 && hero.radius === "14px" && hero.size === "17px" && hero.bg === "rgb(236, 238, 242)" && hero.ph === "A domain or a 0x address" && hero.btn === "Look it up" && hero.sameRow, JSON.stringify(hero));
    check(`${W} the bar and its button are on the first screen`, hero.inBottom < 844 && hero.btnBottom < 844, JSON.stringify(hero));
    check(`${W} the separate search box and Add a project form are gone`, (await page.locator("#search, #add, #add-domain").count()) === 0);
    check(`${W} the small line under the bar`, /People and agents can both add\. Nothing is edited by hand\./.test(await page.locator(".hero").innerText()));
    const cards = await page.$$eval(".label-cards li", (ls) => ls.map((l) => [l.textContent?.trim(), getComputedStyle(l.querySelector(".kind")).color]));
    check(`${W} three label cards in the Record tab's colours`, cards.length === 3 && /^Proof: anyone can re-run the check and get the same answer\.$/.test(cards[0][0]) && /^Statement: the project said it, on its own channels\.$/.test(cards[1][0]) && /^Claim: someone else said it; their name is on it\.$/.test(cards[2][0]) && cards[0][1] === "rgb(20, 108, 54)" && cards[1][1] === "rgb(30, 79, 168)" && cards[2][1] === "rgb(154, 61, 0)", JSON.stringify(cards));
    const steps = await page.$$eval(".steps li", (ls) => ls.map((l) => l.textContent?.replace(/\s+/g, " ").replace(/^(\d\.)\s*/, "$1 ").trim()));
    check(`${W} How it works: three numbered cards below the list`, steps.length === 3 && steps[0] === "1. Contribute: add a project or suggest changes to its record." && steps[1] === "2. The swarm checks: a research job reads the sources; a panel of agents answers single yes or no questions." && steps[2] === "3. Everyone reads: a short summary on top, every line and its source underneath." && await page.evaluate(() => (document.querySelector(".home-list").compareDocumentPosition(document.querySelector(".how")) & Node.DOCUMENT_POSITION_FOLLOWING) > 0), JSON.stringify(steps));
    await page.fill("#lookup", "zzz-nothing");
    check(`${W} typing filters the list`, (await page.locator(".subjects .subject").count()) === 0 && /No project matches/.test(await page.locator(".home-list").innerText()));
    await page.fill("#lookup", "imd");
    check(`${W} typing finds by name or id`, (await page.locator(".subjects .subject").count()) === 1);
    await page.fill("#lookup", "");
    await page.click(".btn-lookup");
    check(`${W} an empty bar asks for a domain or address`, /Write a domain/.test(await page.locator("#lookup-err").innerText()));
    // A pasted link to a project with no page: the offer, then the first-rebuild dialog.
    await page.fill("#lookup", "https://www.Example.com/about");
    await page.press("#lookup", "Enter");
    await page.waitForSelector(".offer", { timeout: 5000 }).catch(() => null);
    await page.waitForFunction(() => /0\.5 IMD/.test(document.querySelector(".offer")?.textContent ?? ""), null, { timeout: 15000 }).catch(() => null);
    const offer = await page.locator(".offer").innerText().catch(() => "");
    check(`${W} no page yet: the price and one research job, directly under the bar`, /No page yet for https:\/\/www\.Example\.com\/about\. Adding one costs 0\.5 IMD and starts one research job\./.test(offer) && (await page.locator("#offer-chain").count()) === 0, offer);
    await page.click("text=Add this project");
    const dlg = await page.waitForSelector('[role="dialog"]', { timeout: 5000 }).then(() => true, () => false);
    const body = dlg ? await page.locator("pre.body").textContent() : "";
    check(`${W} Add this project opens the first-rebuild dialog for the link's host`, dlg && /Create the page of example\.com/.test(await page.locator("#pay-title").innerText()));
    check(`${W} its tag carries the subject and it asks for the page and the logo`, /"subject": "example\.com"/.test(body) && /"kind": "add"/.test(body) && /"name": "logo"/.test(body) && /"mediaType": "image\/png"/.test(body), body.slice(0, 300));
    // The current objective shape (job 6ef62573): the subject, the current rebuild instruction file and its hash, no prior.
    const firstObjective = (() => { try { return String(JSON.parse(body).objective ?? ""); } catch { return ""; } })();
    const firstNamed = firstObjective.includes(`${NAMES("rebuild")} `);
    check(`${W} its objective names the project, the current instruction file and its hash, with no earlier results`, firstObjective.startsWith("Write the record page for one subject: the project at example.com. ") && firstNamed && firstObjective.endsWith("Earlier results: none. Channels already known: none known."), firstObjective.slice(0, 300) + " … " + firstObjective.slice(-120));
    if (dlg) await page.keyboard.press("Escape");
    // An address: the optional chain picker.
    await page.fill("#lookup", "0x1111111111111111111111111111111111111111");
    await page.click(".btn-lookup");
    await page.waitForSelector("#offer-chain", { timeout: 5000 }).catch(() => {});
    await page.selectOption("#offer-chain", "8453");
    await page.click("text=Add this project");
    const d2 = await page.waitForSelector('[role="dialog"]', { timeout: 5000 }).then(() => true, () => false);
    const b2 = d2 ? await page.locator("pre.body").textContent() : "";
    check(`${W} an address with a chain picked gets its chain:address rebuild`, d2 && /"subject": "8453:0x1111111111111111111111111111111111111111"/.test(b2) && b2.includes("one subject: the project whose main contract is 0x1111111111111111111111111111111111111111 on chain 8453."), b2.slice(0, 200));
    if (d2) await page.keyboard.press("Escape");
    // A subject that exists opens.
    await page.fill("#lookup", "IMD.fun");
    await page.click(".btn-lookup");
    await page.waitForFunction(() => location.hash === "#/s/imd.fun", null, { timeout: 5000 }).catch(() => {});
    check(`${W} Look it up opens a subject that exists`, (await page.evaluate(() => location.hash)) === "#/s/imd.fun");
    // Docs, How it is built (F17): five boxes in one row joined by arrows pointing right from 44rem (704px), one column
    // with arrows pointing down below it.
    await page.goto(base + "#/docs");
    await page.waitForSelector(".doc-flow .doc-box", { timeout: 10000 });
    const flow = await page.evaluate(() => {
      const r = (e) => e.getBoundingClientRect();
      const boxes = [...document.querySelectorAll(".doc-flow .doc-box")].map(r);
      const arrows = [...document.querySelectorAll(".doc-flow .doc-arrow")].map(r);
      return { n: boxes.length, tops: boxes.map((b) => Math.round(b.top)), lefts: boxes.map((b) => Math.round(b.left)), arrows: arrows.map((a) => [Math.round(a.width), Math.round(a.height)]), right: Math.max(...boxes.map((b) => b.right)), vw: innerWidth };
    });
    const row = flow.n === 5 && new Set(flow.tops).size === 1 && flow.lefts.every((x, i) => i === 0 || x > flow.lefts[i - 1]) && flow.arrows.length === 4 && flow.arrows.every(([w, h]) => w > h) && flow.right <= flow.vw;
    const col = flow.n === 5 && flow.tops.every((y, i) => i === 0 || y > flow.tops[i - 1]) && flow.arrows.length === 4 && flow.arrows.every(([w, h]) => h > w);
    check(`${W} How it is built: ${width >= 704 ? "five boxes in one row, arrows pointing right" : "one column, arrows pointing down"}`, width >= 704 ? row : col, JSON.stringify(flow));
    if (width === 1440) await page.locator(".doc-flow").screenshot({ path: join(out, "1440-doc-flow.png") });
    await page.goto(base);
    await page.waitForSelector(".subjects .subject", { timeout: 30000 });
    check(`${W} no horizontal scroll on home`, (await overflow(page)) <= 0);
    if (width === 390) await page.screenshot({ path: join(out, `390-home.png`) });

    // Old link opens imd.fun
    await page.goto(base + "#record");
    await page.waitForSelector('.tabs a[aria-current="page"]:has-text("Record")', { timeout: 30000 });
    check(`${W} an old link (#record) opens imd.fun on its Record tab`, (await page.locator(".tabs a").first().getAttribute("href")) === "#/s/imd.fun/overview");

    // Overview
    await page.goto(base + "#/s/imd.fun");
    const kf = await page.waitForSelector(".keyfacts", { timeout: 30000 }).then(() => true, () => false);
    check(`${W} Overview shows key facts`, kf);
    if (kf) {
      await page.waitForSelector(".summary");
      const k = await page.locator(".keyfacts").boundingBox();
      const s = await page.locator(".summary").boundingBox();
      const h1 = await page.locator("h1").boundingBox();
      const main = await page.locator("main").boundingBox();
      // Revision 15 (A1, A2): stacked at every width, Summary, then Key facts, then Related; no side column. The
      // summary's text column is at most 760px; Key facts below it takes the overview's full width.
      const sc = await page.locator(".summary-col").boundingBox();
      const ov = await page.locator(".overview").boundingBox();
      const vw = page.viewportSize().width;
      const stacked = Math.abs(sc.x - k.x) <= 1 && k.y >= sc.y + sc.height && Math.abs(k.width - ov.width) <= 1 && sc.width <= 760.5 && (ov.width <= 760 ? Math.abs(sc.width - ov.width) <= 1 : true);
      check(`${W} the summary comes first under the name (at most 760px wide); key facts below it at full width, at every width`, sc.y > h1.y && stacked, JSON.stringify({ vw, sc, k, ov, s }));
      check(`${W} the overview holds the summary then key facts, with the actions below the summary`, await page.evaluate(() => {
        const lead = document.querySelector("main .lead");
        const actions = document.querySelector("main .tab > .ov-foot .foot-links");
        const summary = document.querySelector(".summary");
        const o = document.querySelector(".overview");
        // A reader's note ("N additions not yet merged") may sit between the one_line and the overview.
        let next = lead?.nextElementSibling;
        while (next && !next.classList.contains("overview") && /outdated|reader-note|disputes|note/.test(next.className)) next = next.nextElementSibling;
        return next === o && o?.children[0]?.classList.contains("summary-col") && o?.children[1]?.classList.contains("keyfacts") && !!actions && !!summary && (summary.compareDocumentPosition(actions) & Node.DOCUMENT_POSITION_FOLLOWING) > 0;
      }), await page.evaluate(() => JSON.stringify({ afterLead: document.querySelector("main .lead")?.nextElementSibling?.className, children: [...(document.querySelector(".overview")?.children ?? [])].map((e) => e.className) })));
      check(`${W} no instruction-format note for readers on Overview`, !/built with an older format/.test(await page.locator("main").innerText()));
      check(`${W} every key fact row has a status badge`, (await page.locator(".keyfacts .badge").count()) >= 1);
      const kfRows = await page.$$eval(".keyfacts tbody tr", (trs) => trs.map((tr) => ({ label: tr.querySelector("th")?.textContent?.trim() ?? "", badges: [...tr.querySelectorAll(".badge")].map((b) => b.textContent?.trim() ?? "") })));
      const row = (l) => kfRows.find((r) => r.label === l)?.badges ?? [];
      // Revision 16 (A2 at phone widths): every Key facts row keeps label, value and badge side by side in one table row.
      const cells = await page.$$eval(".keyfacts tbody tr.has-pencil", (trs) => trs.map((tr) => {
        const c = [tr.querySelector("th"), tr.querySelector(".kf-value"), tr.querySelector(".kf-badge"), tr.querySelector(".kf-edit")].map((e) => e.getBoundingClientRect());
        return { label: tr.querySelector("th")?.textContent?.trim(), display: getComputedStyle(tr).display, x: c.map((r) => Math.round(r.x)), top: c.map((r) => Math.round(r.top)), w: c.map((r) => Math.round(r.width)) };
      }));
      check(`${W} Key facts rows are table rows: label, value, badge and pencil side by side with the same top`, cells.length >= 4 && cells.every((r) => r.display === "table-row" && r.x[0] < r.x[1] && r.x[1] < r.x[2] && r.x[2] < r.x[3] && new Set(r.top).size === 1 && r.w[1] >= 60), JSON.stringify(cells));
      const acc = await page.$$eval(".keyfacts tbody tr", (trs) => { const tr = trs.find((t) => t.querySelector("th")?.textContent?.trim() === "Official accounts"); return tr ? { strong: [...tr.querySelectorAll(".kf-value strong")].map((b) => b.textContent), links: [...tr.querySelectorAll(".kf-value a")].map((a) => a.getAttribute("href")), text: tr.querySelector(".kf-value")?.textContent ?? "" } : null; });
      check(`${W} Official accounts entries: name in bold, then text, then the link`, !!acc && acc.strong.join("|") === "@uniswap on X|Uniswap on GitHub" && /Launch announcements/.test(acc.text) && /Smart contract releases/.test(acc.text) && acc.links.join("|") === "https://x.com/uniswap|https://github.com/Uniswap", JSON.stringify(acc));
      const contrib = await page.$$eval(".keyfacts tbody tr", (trs) => trs.find((t) => t.querySelector("th")?.textContent?.trim() === "Contributors")?.querySelector(".kf-value")?.textContent ?? "");
      check(`${W} a values entry whose text is a list shows every string after its name`, /Bridge team: Operates the bridge, Maintains the verifier/.test(contrib) && /SDK team: Maintains the SDK/.test(contrib), contrib);
      await page.locator(".keyfacts").screenshot({ path: join(out, `${width}-keyfacts.png`) });
      const key = await page.evaluate(() => ({ key: document.querySelector(".dot-key")?.textContent?.replace(/\s+/g, " ").trim() ?? "", credit: document.querySelector(".edit-credit")?.textContent?.replace(/\s+/g, " ").trim() ?? "" }));
      check(`${W} the dot key ends "Summary written from the record by a research job." with an accepted edit's credit below it`, /proven on chain\s*the project says\s*others say\s*Summary written from the record by a research job\.$/.test(key.key) && /^Edited by 0x\S+ and checked by a research job\.$/.test(key.credit), JSON.stringify(key));
      check(`${W} one badge per row; the Website row shows only its channel's label, Own domain`, row("Website").join() === "Own domain" && kfRows.every((r) => r.badges.length === 1), JSON.stringify(kfRows));
      check(`${W} the logo shows at 40 pixels (or its real size if smaller than 64) beside the name, from the checked file`, await page.evaluate(() => { const i = document.querySelector(".title-row img.logo, .title-row img.logo-real"); if (!i || !i.getAttribute("src")?.startsWith("data:image/png;base64,")) return false; const r = i.getBoundingClientRect(); return i.classList.contains("logo-real") ? r.width === i.naturalWidth && r.height === i.naturalHeight && i.parentElement.getBoundingClientRect().width >= 40 : r.width === 40; }));
      const rel = await page.locator(".related").innerText().catch(() => "");
      // Revision 13 (A2): Related at the bottom of the Overview, above the footer links; a project not on the site is a
      // chip that offers "Add this project" on click.
      const relAtBottom = await page.evaluate(() => { const r = document.querySelector(".related"), o = document.querySelector(".overview"), f = document.querySelector(".foot-links"); return !!r && !!o && !!f && (o.compareDocumentPosition(r) & Node.DOCUMENT_POSITION_FOLLOWING) > 0 && (r.compareDocumentPosition(f) & Node.DOCUMENT_POSITION_FOLLOWING) > 0; });
      const addLink = await page.locator('.related .rel-row:has-text("Ethereum Name Service") a.rel-add[href="#/add/ens.domains"]').count();
      check(`${W} Related at the bottom as a compact list, name and relation on one line; a project not on the site has a small Add this project link`, relAtBottom && /Ethereum Name Service/.test(rel) && /names its agents/.test(rel) && addLink === 1 && (await page.locator(".related .sdot, .related .badge").count()) === 0, rel);
      check(`${W} only Website and Official accounts rows show a channel label`, kfRows.filter((r) => !/^(Website|Official accounts?)$/.test(r.label)).every((r) => r.badges.every((b) => !/Own domain|Verified on chain|Not verified/.test(b))) && row("Seat supply").join() === "Proven on chain", JSON.stringify(kfRows));
      check(`${W} no old tie words anywhere on Overview`, !/Confirmed on chain|Names the contract|Not confirmed/.test(await page.locator("main").innerText()));
      check(`${W} Checked by a panel is gone from Overview`, !/Checked by a panel/.test(await page.locator("main").innerText()));
      const linked = page.locator(".keyfacts a.badge").first();
      if (await linked.count()) {
        await linked.click();
        await page.waitForSelector('.tabs a[aria-current="page"]:has-text("Record")');
        check(`${W} a badge opens the lines in Record`, /#\/s\/imd\.fun\/line-/.test(await page.evaluate(() => location.hash)));
      } else check(`${W} a badge opens the lines in Record`, false, "no linked badge");
    }
    check(`${W} no horizontal scroll on Overview`, (await overflow(page)) <= 0);
    if (width === 390) await page.screenshot({ path: join(out, `390-overview.png`) });

    // Record: panel answers at the bottom
    await page.goto(base + "#/s/imd.fun/record");
    await page.reload();
    await page.waitForSelector(".section-toggle", { timeout: 30000 });
    const rec = await page.locator("main").innerText();
    check(`${W} panel answers list at the bottom of Record`, (await page.locator("#panel-answers").count()) === 1);
    check(`${W} Record shows its sections`, /What it does|Money|On chain/.test(rec));
    const toggles = await page.$$eval(".section-toggle", (bs) => bs.map((b) => [b.getAttribute("aria-expanded"), b.textContent]));
    check(`${W} sections start closed, each with its name and counts: proven, stated, claimed, and contradicted or out of date only above zero`, toggles.length > 0 && toggles.every(([x, s]) => x === "false" && /^\D+\d+ proven, \d+ stated, \d+ claimed(, [1-9]\d* contradicted)?(, [1-9]\d* out of date)?$/.test(s ?? "")) && (await page.locator(".lines .row").count()) === 0, JSON.stringify(toggles));
    // Item 4/6: no repeat box; identical lines are one row, counted under Page upkeep, a closed row at the bottom.
    const upk = await page.evaluate(() => { const d = document.querySelector("#upkeep"); return { repeats: !!document.querySelector("#upkeep #repeats") && document.querySelectorAll("#repeats").length === 1, open: d?.open ?? null, last: d ? !d.nextElementSibling : false, title: d?.querySelector("summary")?.textContent ?? "" }; });
    check(`${W} no repeat box; Page upkeep is one closed row at the bottom`, upk.repeats && upk.open === false && upk.title.startsWith("Page upkeep") && !/\bL\d+\b|F\d+-/.test(await page.locator("main").innerText().then((t) => t.replace(/Page upkeep[\s\S]*$/, ""))), JSON.stringify(upk));
    await page.locator(".section-toggle", { hasText: "What it does" }).click();
    check(`${W} a section opens`, (await page.locator(".lines .row").count()) >= 1);
    await page.fill("#record-search", "a forum");
    check(`${W} the search finds a line by its speaker`, (await page.locator(".lines .row").count()) === 1 && /imd is a swarm of agents/i.test(await page.locator(".section .lines").innerText()) && /Also said by a forum/.test(await page.locator(".section .lines").innerText()), (await page.locator(".section .lines").innerText().catch(() => "")).replace(/\n/g, " | ").slice(0, 400));
    await page.fill("#record-search", "");
    await page.locator(".section-toggle", { hasText: "What it does" }).click();
    // Job 8: a contradicted line is ONE row led by a red Contradicted marker, with both sentences and its speaker.
    const filters = await page.$$eval(".filter .btn-filter", (bs) => bs.map((b) => b.textContent?.replace(/\s+/g, " ").trim()));
    // Brief C: All, Proven, Stated, Claimed always; Contradicted and Superseded only above zero; no Proof or Only said.
    check(`${W} filter buttons All, Proven, Stated, Claimed and Contradicted (above zero) with counts; no Proof or Only said`, filters.length === 5 && /^All\d+$/.test(filters[0]) && /^Proven\d+$/.test(filters[1]) && /^Stated\d+$/.test(filters[2]) && /^Claimed\d+$/.test(filters[3]) && /^Contradicted1$/.test(filters[4]) && !filters.some((f) => /^(Proof|Only said)/.test(f)), JSON.stringify(filters));
    await page.click(".filter .btn-filter >> text=Contradicted");
    const contra = await page.$$eval(".section .lines .row", (rs) => rs.map((r) => ({ text: r.querySelector(".row-toggle")?.textContent?.replace(/\s+/g, " ").trim(), lead: r.querySelector(".row-text > .kind")?.textContent?.trim(), color: r.querySelector(".row-text > .kind") ? getComputedStyle(r.querySelector(".row-text > .kind")).color : "" })));
    check(`${W} Contradicted: one row, red marker first, what was said and what the panel answer shows, then who said it`, contra.length === 1 && contra[0].lead === "Contradicted" && contra[0].color === "rgb(161, 35, 27)" && /Said: A post says a job costs 5 IMD\./.test(contra[0].text) && /The panel answered: /.test(contra[0].text) && /Claimed by someone$/.test(contra[0].text), JSON.stringify(contra));
    await page.locator(".section .lines .row .row-toggle").first().click();
    const det = await page.locator(".section .lines .details").innerText().catch(() => "");
    check(`${W} its details show the original quote and the panel answer`, /Original quote\s*“5 IMD”/.test(det) && /Panel answer/.test(det), det.replace(/\n/g, " | "));
    await page.locator(".section .lines .row .row-toggle").first().click();
    await page.click(".filter .btn-filter >> text=Proven");
    await page.locator(".fact-table .row-toggle").first().click();
    check(`${W} a line with history shows its earlier readings`, /Earlier readings\s*Block 26,400,000: 1,500/.test(await page.locator(".fact-details").innerText().catch(() => "")), (await page.locator(".fact-details").innerText().catch(() => "no .fact-details")).replace(/\n/g, " | ").slice(0, 500));
    check(`${W} no horizontal scroll on Record`, (await overflow(page)) <= 0, await wideOf(page));
    if (width === 390) await page.screenshot({ path: join(out, `390-record.png`), fullPage: true });

    // Activity labels
    // Back home: the subject's page was opened, so its digest (name, one_line, counts, logo) is listed (job 8).
    await page.goto(base + "#/");
    await page.waitForSelector(".subjects .subject", { timeout: 30000 });
    const item2 = await page.locator(".subjects .subject").first().innerText();
    check(`${W} after opening it, Home shows the digest: name, one_line, counts and when it changed`, /IMD/.test(item2) && /imd\.fun/.test(item2) && /\d+ contradicted/.test(item2) && /\d+ proven/.test(item2) && /\d+ stated/.test(item2) && /\d+ claimed/.test(item2) && !/proofs?\b/.test(item2) && /Changed /.test(item2), item2.replace(/\n/g, " | "));
    check(`${W} the digest's logo, kept by hash and shown as a data: URL at 28 pixels (or its real size if smaller than 64)`, await page.evaluate(() => { const i = document.querySelector(".subjects .subject img.logo, .subjects .subject img.logo-real"); if (!i || !i.getAttribute("src")?.startsWith("data:image/png;base64,")) return false; const r = i.getBoundingClientRect(); return i.classList.contains("logo-real") ? r.width === i.naturalWidth && r.height === i.naturalHeight && i.parentElement.getBoundingClientRect().width >= 28 : r.width === 28; }));
    const idb = await page.evaluate(() => new Promise((res) => { const r = indexedDB.open("imd-record"); r.onsuccess = () => { const db = r.result; const t = db.transaction(["scan", "files", "digests"]); const n = {}; let left = 3; for (const s of ["scan", "files", "digests"]) { const q = t.objectStore(s).count(); q.onsuccess = () => { n[s] = q.result; if (!--left) res(n); }; } }; r.onerror = () => res(null); }));
    const ls = await page.evaluate(() => Object.keys(localStorage).filter((k) => /:(page|lines|edit|artifact|logo):/.test(k)).length);
    check(`${W} IndexedDB holds the scan, the files and the digest; no page file in localStorage`, !!idb && idb.scan === 1 && idb.files >= 1 && idb.digests >= 1 && ls === 0, JSON.stringify({ idb, ls }));
    await page.goto(base + "#/s/imd.fun/activity");
    await page.waitForSelector(".activity .act", { timeout: 30000 });
    const act = await page.locator(".activity").innerText();
    check(`${W} Activity labels the page shown`, /Shown now/.test(act));
    check(`${W} Activity labels results named in the shown page's objective as folded in`, (act.match(/Folded into the page shown/g) ?? []).length === 2, String((act.match(/Folded into the page shown/g) ?? []).length));
    check(`${W} Activity labels later results as not yet folded in`, (act.match(/Not yet folded in: included in the next rebuild/g) ?? []).length === 2);

    // Contribute: rebuild count and the three templates
    await page.goto(base + "#/s/imd.fun/contribute");
    await page.waitForSelector("#rebuild");
    await page.waitForFunction(() => /It is given/.test(document.querySelector("#rebuild")?.textContent ?? ""), null, { timeout: 30000 }).catch(() => {});
    check(`${W} the rebuild is given F1 and the results not folded in`, /It is given 3 earlier files and 1 panel answer/.test(await page.locator("#rebuild").innerText()), (await page.locator("#rebuild").innerText()).slice(0, 300));
    // "Read the objective": the objective and the instruction file it names are two separate blocks.
    await page.locator("#rebuild summary", { hasText: "Read the objective" }).click();
    const rb = await page.locator("#rebuild").innerText();
    check(`${W} the rebuild says the files the page dropped lines from are listed again`, /dropped lines, so 2 files they came from are listed again/.test(rb), rb.slice(0, 600));
    const objective = await page.locator("#rebuild > details > .objective").textContent();
    check(`${W} the rebuild objective marks both files reconsider, numbered after the results`, /\[F4\] https:\/\/api\.imd\.fun\/artifacts\/[0-9a-f]{64} \(reconsider dropped lines\); \[F5\] https:\/\/api\.imd\.fun\/artifacts\/[0-9a-f]{64} \(reconsider dropped lines\); \[A1\]/.test(objective ?? "") && !/at most 40 lines/.test(objective ?? ""), (objective ?? "").slice(-900));
    const named = /Your full instructions are the file at (https:\/\/ipfs\.filebase\.io\/ipfs\/b[a-z2-7]{58}\?filename=rebuild-([0-9a-f]{12})\.txt) or, if that fails, at (\S+?), sha256 ([0-9a-f]{64})\./.exec(objective ?? "");
    check(`${W} the rebuild objective has the short fixed shape and names the instruction file, its second address and its hash`, !!named && /^Write the record page for one subject: /.test(objective ?? "") && named[4].startsWith(named[2]) && named[3] === FB_URL("rebuild") && (objective ?? "").length <= 7900, (objective ?? "").slice(0, 400));
    const ins = await page.locator("#rebuild .instructions").innerText();
    const links = await page.locator("#rebuild .instructions a").evaluateAll((as) => as.map((a) => a.getAttribute("href")));
    check(`${W} the instruction preview links the site's file and the address the job fetches, and shows its hash and text`, !!named && named[1] === INS_URL("rebuild") && links[0] === `./instructions/${MANIFEST.rebuild.file}` && links[1] === named[1] && ins.includes(named[4]) && named[4] === MANIFEST.rebuild.sha256 && /Instructions this job follows/.test(ins) && /For files marked reconsider/.test(ins), JSON.stringify(links) + " " + ins.slice(0, 300));
    const served = await page.evaluate(async (u) => { const r = await fetch(u); return { status: r.status, text: await r.text() }; }, links[0]);
    check(`${W} the site serves the instruction file at its named path, byte for byte`, served.status === 200 && served.text === RAW_INS.rebuild, String(served.status));
    check(`${W} the instruction preview is split into paragraphs`, (await page.locator("#rebuild .instructions .ins-text > p").count()) > 5);
    check(`${W} the three IMD presets are gone`, !/Check: The docs price/.test(await page.locator("main").innerText()));
    // Item 9: the blank form is behind "Write a question from scratch".
    check(`${W} Contribute explains the panel and offers Write a question from scratch`, /five agents answer independently, four must agree, and the answer is signed\./.test(await page.locator("main").innerText()) && /Open any line and choose Ask a panel to check it\./.test(await page.locator("main").innerText()));
    await page.click("text=Write a question from scratch");
    await page.check('input[value="contract"]');
    await page.fill("#q-address", "0x0000eC93127BAA929E58E97dd0095A2BFb38ec1D");
    await page.fill("#q-signature", "totalSupply()");
    await page.fill("#q-value", "2000");
    await page.click("text=Review the question");
    await page.waitForSelector('[role="dialog"]');
    const ob = await page.locator("pre.body").textContent();
    check(`${W} a contract question ends with the filed-under sentence and has no tag`, /return 2000\? This question is filed under the record of imd\.fun\./.test(ob) && !/"tag"/.test(ob));
    await page.keyboard.press("Escape");
    await page.check('input[value="page"]');
    await page.click("text=Review the question");
    check(`${W} the web page form asks for its fields`, (await page.locator("#q-url-err").count()) === 1 && (await page.locator("#q-text-err").count()) === 1);
    check(`${W} no horizontal scroll on Contribute`, (await overflow(page)) <= 0, await wideOf(page));

    // Review and submit → Read the full request: the changes objective names the current changes file and its hash.
    await page.evaluate(() => localStorage.setItem("imd-record:v1:changes:imd.fun", JSON.stringify([{ id: "e2e-1", type: "context", target: { kind: "line", key: "line:L1", lineId: "L1", text: "IMD is a swarm of agents." }, note: "Check how the protocol describes agent coordination.", links: ["https://imd.fun/docs/"] }])));
    await page.goto(base + "#/s/imd.fun/record");
    await page.reload();
    const trayBtn = await page.waitForSelector(".btn-tray", { timeout: 30000 }).then(() => true, () => false);
    if (trayBtn) await page.click(".btn-tray");
    const review = await page.waitForSelector(".review-read", { timeout: 10000 }).then(() => true, () => false);
    if (review) await page.click(".review-read");
    await page.waitForSelector("#review-body", { timeout: 10000 }).catch(() => {});
    const cObjective = review ? (await page.locator("#review-body > .objective").textContent()) ?? "" : "";
    const cNamed = /^Judge a visitor's proposed changes to the record of one subject: the project at imd\.fun(?:, whose main contract is 0x[0-9a-f]{40} on chain \d+)?\. Your full instructions are the file at (\S+) or, if that fails, at (\S+), sha256 ([0-9a-f]{64})\./.exec(cObjective);
    check(`${W} the changes objective names the current changes file and its hash, then the change`, !!cNamed && cNamed[1] === INS_URL("changes") && cNamed[2] === FB_URL("changes") && cNamed[3] === MANIFEST.changes.sha256 && /The changes: \(1\) type: context; target: F1:L1 /.test(cObjective) && cObjective.length <= 7900, cObjective.slice(-500));
    const cIns = review ? await page.locator("#review-ins").innerText() : "";
    const cLinks = review ? await page.locator("#review-ins a").evaluateAll((as) => as.map((a) => a.getAttribute("href"))) : [];
    check(`${W} the changes preview shows "Instructions this job follows" with the file, its hash and the fetch address`, /Instructions this job follows/.test(cIns) && cIns.includes(MANIFEST.changes.sha256) && cLinks[0] === `./instructions/${MANIFEST.changes.file}` && cLinks[1] === INS_URL("changes"), JSON.stringify(cLinks) + " " + cIns.slice(0, 200));
    if (review) await page.keyboard.press("Escape");
    await page.evaluate(() => localStorage.removeItem("imd-record:v1:changes:imd.fun"));

    // Sources: every channel with its label, and the key under them.
    await page.goto(base + "#/s/imd.fun/sources");
    await page.waitForSelector(".channels-block", { timeout: 30000 });
    const ch = await page.locator(".channels-block").innerText();
    check(`${W} Sources labels the channel on the subject's domain Own domain and explains the three labels`, /Own domain/.test(ch) && /Verified on chain:/.test(ch) && /Not verified:/.test(ch) && !/Confirmed on chain|Names the contract|not confirmed/i.test(ch), ch.slice(0, 300));
    // D10: a channel the own domain links to as its official account (tie linked) is a fourth label, and its lines are statements.
    check(`${W} the legend is the brief's sentence, with Linked from own site`, ch.includes("Lines published on Own domain, Verified on chain or Linked from own site channels show as statements; everything else is a claim.") && /Linked from own site:/.test(ch), ch.slice(0, 600));

    // Add a project on a chain the oracle list does not name (8aeb5d8b).
    await page.goto(base);
    await page.waitForSelector(".subjects .subject", { timeout: 30000 });
    await page.fill("#lookup", "0x1111111111111111111111111111111111111111");
    await page.click(".btn-lookup");
    await page.waitForSelector("#offer-chain", { timeout: 5000 }).catch(() => {});
    await page.selectOption("#offer-chain", "other");
    await page.fill("#offer-chain-other", "polygon");
    await page.click("text=Add this project");
    check(`${W} Other chain ID asks for a number`, /Write the chain ID as a number/.test(await page.locator(".offer").innerText()) && (await page.locator('[role="dialog"]').count()) === 0);
    await page.fill("#offer-chain-other", "137");
    await page.click("text=Add this project");
    const d137 = await page.waitForSelector('[role="dialog"]', { timeout: 5000 }).then(() => true, () => false);
    const b137 = d137 ? await page.locator("pre.body").textContent() : "";
    check(`${W} a chain 137 project gets its own rebuild`, d137 && /"subject": "137:0x1111111111111111111111111111111111111111"/.test(b137) && b137.includes("one subject: the project whose main contract is 0x1111111111111111111111111111111111111111 on chain 137."), b137.slice(0, 200));
    if (d137) await page.keyboard.press("Escape");
    // Related's Add this project opens the bar filled in.
    await page.goto(base + "#/add/ens.domains");
    const pre = await page.waitForSelector(".offer", { timeout: 30000 }).then(() => page.locator(".offer").innerText(), () => "");
    check(`${W} Add this project from Related fills the bar and offers the add`, (await page.inputValue("#lookup")) === "ens.domains" && /No page yet for ens\.domains/.test(pre), pre);

    // Long subject ids wrap (358e18f4).
    for (const id of ["1:0x1111111111111111111111111111111111111111", "pneumaticstatisticsandtokenregistry.example"]) {
      await page.goto(base + "#/s/" + id);
      await page.waitForSelector("#record-title");
      await page.waitForSelector(".card.empty h2:not(:has-text('Reading'))", { timeout: 30000 }).catch(() => {});
      check(`${W} no horizontal scroll on Overview of ${id}`, (await overflow(page)) <= 0, await wideOf(page));
      check(`${W} the heading keeps the full id ${id}`, (await page.locator("#record-title").innerText()).replace(/\s/g, "") === id);
    }
    if (width === 390) await page.screenshot({ path: join(out, `390-contract-subject.png`) });

    // Panel answers are the last thing on Record (3672d8cd).
    await page.goto(base + "#/s/imd.fun/record");
    await page.waitForSelector("#panel-answers", { timeout: 30000 }).catch(() => {});
    check(`${W} Page upkeep is the last section of Record, Panel answers just above it`, await page.evaluate(() => { const u = document.querySelector("#upkeep"); const p = document.querySelector("#panel-answers"); return !!u && u.nextElementSibling === null && u.parentElement?.classList.contains("tab") && (!p || p.nextElementSibling === u); }));
    check(`${W} no script errors`, errors.length === 0, errors.join(" | "));
    await ctx.close();
  }
  // Variants at 390: a panel answer with no page, a rejected person, and a failed chain read.
  const variantPage = async (opts) => {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page = await ctx.newPage();
    await mock(page, opts);
    return { ctx, page };
  };
  {
    const { ctx, page } = await variantPage({ fx: fx.variants.oracleOnly });
    await page.goto(base + "#/s/imd.fun/activity");
    await page.waitForSelector(".activity .act", { timeout: 30000 });
    check("390: oracle only: Activity shows the answer", /answer: true \(panel, 5 of 5 agreed\)/.test(await page.locator(".activity").innerText()));
    await page.goto(base + "#/s/imd.fun/record");
    await page.waitForSelector("#upkeep", { timeout: 30000 }).catch(() => {});
    // Item 21: an answer no line links to is listed only under Page upkeep (and Activity), with no kind label.
    const upkText = await page.locator("#upkeep").textContent().catch(() => "");
    check("390: oracle only: the unlinked panel answer is under Page upkeep only, without a label", (await page.locator("#panel-answers .panel-row").count()) === 0 && /5 of 5/.test(upkText ?? "") && !/\b(Proof|Statement|Claim)\b/.test(upkText ?? ""), (upkText ?? "").slice(0, 300));
    await ctx.close();
  }
  {
    const { ctx, page } = await variantPage({ fx: fx.variants.person });
    await page.goto(base);
    await page.waitForSelector(".subjects .subject", { timeout: 30000 });
    // Each row reads its result files after it appears: wait until none still says "Reading its record…".
    await page.waitForFunction(() => !/Reading its record/.test(document.querySelector(".subjects")?.textContent ?? ""), null, { timeout: 30000 }).catch(() => {});
    const home = await page.locator(".subjects").innerText();
    check("390: a found: false result is listed as No project found, with its notes, never the person's name", /person\.example/.test(home) && /No project found: The domain identifies a person, not a project\./.test(home) && !/Sample Person/.test(await page.locator("main").innerText()), home);
    check("390: a pending first page shows First page in progress", /pending\.example[\s\S]*First page in progress/.test(home), home);
    check("390: a subject with no logo shows its first letter", (await page.locator(".subjects .logo-tile").allInnerTexts()).sort().join() === "P,P");
    await page.goto(base + "#/s/person.example");
    await page.waitForSelector("#rejected", { timeout: 30000 }).catch(() => {});
    const main = await page.locator("main").innerText();
    check("390: its link shows the rejection reason, not the person", (await page.locator("#rejected").count()) === 1 && /identifies a person, not a project/.test(main) && !/Sample Person/.test(main) && (await page.locator("#record-title").innerText()) === "person.example");
    await page.goto(base + "#/s/person.example/activity");
    await page.waitForSelector(".activity .act", { timeout: 30000 });
    check("390: Activity keeps the job and its notes", /Not a project record.*identifies a person/s.test(await page.locator(".activity").innerText()));
    await page.screenshot({ path: join(out, `390-rejected-activity.png`) });
    await ctx.close();
  }
  {
    const { ctx, page } = await variantPage({ failBlockNumber: true });
    await page.goto(base);
    // Nothing cached yet: the list waits and retries on its own ("Still reading the chain…", job 9).
    await page.waitForSelector("text=No public RPC answered yet", { timeout: 60000 });
    check("390: failed read: no 'No projects yet'", !/No projects yet/.test(await page.locator("main").innerText()));
    await page.fill("#lookup", "imd.fun");
    await page.click(".btn-lookup");
    await page.waitForSelector(".offer", { timeout: 5000 }).catch(() => {});
    if (await page.locator(".offer").count()) await page.click("text=Add this project");
    await page.waitForTimeout(300);
    check("390: failed read: no rebuild review, retry guidance instead", (await page.locator('[role="dialog"]').count()) === 0 && /The project list could not be read\. Try again before reviewing a rebuild\.|Wait until the list has loaded from Ethereum\.|Still reading the projects from Ethereum\. Try again in a moment\./.test(await page.locator("main").innerText()), JSON.stringify({ dialogs: await page.locator('[role="dialog"]').count(), main: (await page.locator("main").innerText()).slice(0, 500) }));
    await ctx.close();
  }
  // C6: no pay dialog for a rebuild whose instruction file cannot be fetched; the second address is tried first.
  {
    const { ctx, page } = await variantPage({ insDown: true });
    gatewayHits.length = 0;
    await page.goto(base);
    await page.waitForSelector(".subjects .subject", { timeout: 60000 }).catch(() => {});
    await page.fill("#lookup", "https://www.Example.com/about");
    await page.click(".btn-lookup");
    await page.waitForSelector(".offer", { timeout: 10000 }).catch(() => {});
    await page.click("text=Add this project");
    const alert = await page.waitForSelector('[role="alert"]', { timeout: 40000 }).then((e) => e.innerText(), () => "");
    check("390: instructions unreachable: no pay dialog, the brief's message instead", (await page.locator('[role="dialog"]').count()) === 0 && alert.includes("The instructions for this job cannot be reached right now, so it would stop without doing the work. Try again later."), alert);
    await page.screenshot({ path: join(out, "390-instructions-unreachable.png") });
    check("390: instructions unreachable: the notice fits without horizontal scroll", (await overflow(page)) <= 0, await wideOf(page));
    check("390: instructions unreachable: both gateways were tried, Filebase first", gatewayHits[0] === "ipfs.filebase.io" && gatewayHits.includes("gateway.pinata.cloud"), JSON.stringify(gatewayHits));
    await ctx.close();
  }
  {
    const { ctx, page } = await variantPage({ insFirstDown: true });
    await page.goto(base);
    await page.waitForSelector(".subjects .subject", { timeout: 60000 }).catch(() => {});
    await page.fill("#lookup", "https://www.Example.com/about");
    await page.click(".btn-lookup");
    await page.waitForSelector(".offer", { timeout: 10000 }).catch(() => {});
    await page.click("text=Add this project");
    const dlg = await page.waitForSelector('[role="dialog"]', { timeout: 40000 }).then(() => true, () => false);
    check("390: first gateway down: the second address gives the exact bytes and the pay dialog opens", dlg && (await page.locator('[role="alert"]').count()) === 0);
    await ctx.close();
  }
  // A: the remembered wallet. No flag: no wallet code and no third party. Flag: outline, background load, then (no
  // wallet in this browser) Connect and the flag cleared.
  {
    const { ctx, page } = await variantPage({});
    const chunks = [];
    const hosts = new Set();
    page.on("request", (r) => {
      const u = new URL(r.url());
      if (/walletRuntime-/.test(u.pathname)) chunks.push(u.pathname);
      if (u.hostname !== "127.0.0.1") hosts.add(u.hostname);
    });
    await page.goto(base);
    await page.waitForSelector(".subjects .subject", { timeout: 60000 }).catch(() => {});
    await page.waitForTimeout(1000);
    check("390: no wallet flag: no wallet code is loaded on page load", chunks.length === 0 && (await page.locator("header .btn-primary", { hasText: "Connect" }).count()) === 1, JSON.stringify(chunks));
    check("390: no wallet flag: no Coinbase or other wallet host is contacted", ![...hosts].some((h) => /coinbase|walletconnect|cca-lite/.test(h)), JSON.stringify([...hosts]));
    // E14: after Home settles with no wallet, the only storage is this site's own cache: the IndexedDB database
    // "imd-record" and localStorage keys under "imd-record:". No keyval-store / analytics-db, no cookies, nothing in
    // sessionStorage.
    const store = await page.evaluate(async () => ({
      dbs: (await indexedDB.databases()).map((d) => d.name),
      local: Object.keys(localStorage),
      session: Object.keys(sessionStorage),
      cookie: document.cookie,
    }));
    const cookies = await ctx.cookies();
    check(
      "390: no wallet flag: page load creates no storage except the site's own cache (no keyval-store, analytics-db, cookies or sessionStorage)",
      store.dbs.every((n) => n === "imd-record") && store.local.every((k) => k.startsWith("imd-record:")) && store.session.length === 0 && store.cookie === "" && cookies.length === 0,
      JSON.stringify({ ...store, cookies: cookies.map((c) => c.name) }),
    );
    await ctx.close();
  }
  {
    const { ctx, page } = await variantPage({});
    const chunks = [];
    const hosts = new Set();
    await page.addInitScript(() => {
      if (!sessionStorage.getItem("e2e-flag-set")) {
        localStorage.setItem("imd-record:wallet-connected", "1");
        sessionStorage.setItem("e2e-flag-set", "1");
      }
    });
    // Hold the wallet chunk back for a moment so the outline can be seen.
    await page.route(/walletRuntime-[^/]*\.js$/, async (route) => {
      await new Promise((r) => setTimeout(r, 1500));
      await route.continue();
    });
    page.on("request", (r) => {
      const u = new URL(r.url());
      if (/walletRuntime-/.test(u.pathname)) chunks.push(u.pathname);
      if (u.hostname !== "127.0.0.1") hosts.add(u.hostname);
    });
    await page.goto(base);
    const ghost = await page.waitForSelector("header .acct-chip-ghost", { timeout: 5000 }).then(() => true, () => false);
    const connectDuring = await page.locator("header .btn-primary", { hasText: "Connect" }).count();
    check("390: wallet flag: the chip's outline shows in place of Connect while it reconnects", ghost && connectDuring === 0);
    await page.waitForSelector("header .btn-primary:has-text('Connect')", { timeout: 20000 }).catch(() => {});
    const flag = await page.evaluate(() => localStorage.getItem("imd-record:wallet-connected"));
    check("390: wallet flag: the wallet code loads in the background without a click", chunks.length >= 1, JSON.stringify(chunks));
    check("390: wallet flag: a failed silent reconnect shows Connect and clears the flag", (await page.locator("header .acct-chip-ghost").count()) === 0 && (await page.locator("header .btn-primary", { hasText: "Connect" }).count()) === 1 && flag === null, String(flag));
    check("390: wallet flag: loading the wallet code contacts no Coinbase or other wallet host", ![...hosts].some((h) => /coinbase|walletconnect|cca-lite/.test(h)), JSON.stringify([...hosts]));
    await ctx.close();
  }
  // D9: an old subject link opens the record and the address bar shows the current one.
  {
    const { ctx, page } = await variantPage({});
    await page.goto(base + "#/s/app.imd.fun/overview");
    await page.waitForSelector("#record-title", { timeout: 60000 }).catch(() => {});
    check("390: an old link #/s/app.imd.fun/overview is replaced by #/s/imd.fun/overview", new URL(page.url()).hash === "#/s/imd.fun/overview", page.url());
    await ctx.close();
  }
} finally {
  await browser.close();
  server.close();
}
const failed = results.filter((r) => !r.ok);
await writeFile(join(out, "results.json"), JSON.stringify(results, null, 2));
console.log(`${results.length - failed.length} of ${results.length} pass`);
process.exit(failed.length ? 1 : 0);
