/**
 * Browser interaction checks on the built export, in one foreground command:
 *   npx vite-node tests/make-fixture.ts test/scratch/fx.json
 *   IMD_PLAYWRIGHT=/path/to/playwright/index.mjs node tests/e2e.mjs test/scratch/fx.json test/scratch/e2e
 * Serves dist/ on a local port and opens it in Chromium at 390, 1440 and 320 wide: home, Add a project, an old link,
 * Overview key facts, Record, Activity labels and the Contribute forms. Every chain read (JSON-RPC)
 * and every api.imd.fun read is answered from the fixture, which holds an old page, a sources result, a panel
 * answer, a rebuild of the first two, and a sources result and an edit completed after the rebuild.
 */
import { createServer } from "node:http";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { extname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const fx = JSON.parse(await readFile(resolve(process.argv[2] ?? "test/scratch/fx.json"), "utf8"));
const out = resolve(process.argv[3] ?? "test/scratch/e2e");
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

/** opts: fx (a variant fixture), failBlockNumber (an RPC error), delayLogs (ms before eth_getLogs answers). */
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
    return route.fulfill({ status: 404, body: "" });
  });
}

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
    check(`${W} a subject shows its name, one_line, counts and when it changed`, /IMD/.test(item) && /imd\.fun/.test(item) && /\d+ proofs?/.test(item) && /\d+ statements?/.test(item) && /\d+ claims?/.test(item) && /Changed /.test(item), item.replace(/\n/g, " | "));
    check(`${W} the title is On the record (test)`, (await page.title()) === "On the record (test)");
    check(`${W} a subject shows its logo, checked and shown as a data: URL at 28 pixels`, await page.evaluate(() => { const i = document.querySelector(".subjects .subject img.logo"); return !!i && i.getAttribute("src")?.startsWith("data:image/png;base64,") && i.getBoundingClientRect().width === 28; }));
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
    const steps = await page.$$eval(".steps li", (ls) => ls.map((l) => l.textContent?.replace(/\s+/g, " ").trim()));
    check(`${W} How it works: three numbered cards below the list`, steps.length === 3 && steps[0] === "1. Add: a project, a batch of links, or an edit to a summary." && steps[1] === "2. The swarm checks: a research job reads the sources; a panel of agents answers single yes or no questions." && steps[2] === "3. Everyone reads: a short summary on top, every line and its source underneath." && await page.evaluate(() => (document.querySelector(".home-list").compareDocumentPosition(document.querySelector(".how")) & Node.DOCUMENT_POSITION_FOLLOWING) > 0), JSON.stringify(steps));
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
    const offer = await page.waitForSelector(".offer", { timeout: 5000 }).then(() => page.locator(".offer").innerText(), () => "");
    check(`${W} no page yet: the price and one research job, directly under the bar`, /No page yet for https:\/\/www\.Example\.com\/about\. Adding one costs 0\.5 IMD and starts one research job\./.test(offer) && (await page.locator("#offer-chain").count()) === 0, offer);
    await page.click("text=Add this project");
    const dlg = await page.waitForSelector('[role="dialog"]', { timeout: 5000 }).then(() => true, () => false);
    const body = dlg ? await page.locator("pre.body").innerText() : "";
    check(`${W} Add this project opens the first-rebuild dialog for the link's host`, dlg && /Create the page of example\.com/.test(await page.locator("#pay-title").innerText()));
    check(`${W} its tag carries the subject and it asks for the page and the logo`, /"subject": "example\.com"/.test(body) && /"kind": "add"/.test(body) && /"name": "logo"/.test(body) && /"mediaType": "image\/png"/.test(body), body.slice(0, 300));
    check(`${W} its objective names the project`, body.includes("one subject: the project at example.com.") && body.includes("Start from the earlier results: none."));
    if (dlg) await page.keyboard.press("Escape");
    // An address: the optional chain picker.
    await page.fill("#lookup", "0x1111111111111111111111111111111111111111");
    await page.click(".btn-lookup");
    await page.waitForSelector("#offer-chain", { timeout: 5000 }).catch(() => {});
    await page.selectOption("#offer-chain", "8453");
    await page.click("text=Add this project");
    const d2 = await page.waitForSelector('[role="dialog"]', { timeout: 5000 }).then(() => true, () => false);
    const b2 = d2 ? await page.locator("pre.body").innerText() : "";
    check(`${W} an address with a chain picked gets its chain:address rebuild`, d2 && /"subject": "8453:0x1111111111111111111111111111111111111111"/.test(b2) && b2.includes("one subject: the project whose main contract is 0x1111111111111111111111111111111111111111 on chain 8453."), b2.slice(0, 200));
    if (d2) await page.keyboard.press("Escape");
    // A subject that exists opens.
    await page.fill("#lookup", "IMD.fun");
    await page.click(".btn-lookup");
    await page.waitForFunction(() => location.hash === "#/s/imd.fun", null, { timeout: 5000 }).catch(() => {});
    check(`${W} Look it up opens a subject that exists`, (await page.evaluate(() => location.hash)) === "#/s/imd.fun");
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
      check(`${W} key facts sit under the name, above the summary, full width`, k.y > h1.y && k.y + k.height <= s.y + 1 && k.width >= main.width - 2 * 16 - 2, JSON.stringify({ k, s }));
      check(`${W} key facts come directly after the one_line, with the actions below the summary`, await page.evaluate(() => {
        const lead = document.querySelector("main .lead");
        const actions = document.querySelector("main .tab > .row-actions");
        const summary = document.querySelector(".summary");
        return lead?.nextElementSibling?.classList.contains("overview") && document.querySelector(".overview .facts-col")?.firstElementChild?.classList.contains("keyfacts") && !!actions && !!summary && (summary.compareDocumentPosition(actions) & Node.DOCUMENT_POSITION_FOLLOWING) > 0;
      }));
      check(`${W} every key fact row has a status badge`, (await page.locator(".keyfacts .badge").count()) >= 1);
      const kfRows = await page.$$eval(".keyfacts tbody tr", (trs) => trs.map((tr) => ({ label: tr.querySelector("th")?.textContent?.trim() ?? "", badges: [...tr.querySelectorAll(".badge")].map((b) => b.textContent?.trim() ?? "") })));
      const row = (l) => kfRows.find((r) => r.label === l)?.badges ?? [];
      check(`${W} one badge per row; the Website row shows only its channel's label, Own domain`, row("Website").join() === "Own domain" && kfRows.every((r) => r.badges.length === 1), JSON.stringify(kfRows));
      check(`${W} the logo shows at 40 pixels beside the name, from the checked file`, await page.evaluate(() => { const i = document.querySelector(".title-row img.logo"); return !!i && i.getAttribute("src")?.startsWith("data:image/png;base64,") && i.getBoundingClientRect().width === 40; }));
      const rel = await page.locator(".related").innerText().catch(() => "");
      check(`${W} Related under Key facts: each with its relation; a subject on the site links to its page, else Add this project`, /Ethereum Name Service/.test(rel) && /names its agents/.test(rel) && (await page.locator('.related a[href="#/s/imd.fun"]').count()) === 0 && (await page.locator('.related a[href="#/add/ens.domains"]').count()) === 1, rel);
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
    await page.waitForSelector(".section-toggle", { timeout: 30000 });
    const rec = await page.locator("main").innerText();
    check(`${W} panel answers list at the bottom of Record`, (await page.locator("#panel-answers").count()) === 1);
    check(`${W} Record shows its sections`, /What it does|Money|On chain/.test(rec));
    const toggles = await page.$$eval(".section-toggle", (bs) => bs.map((b) => [b.getAttribute("aria-expanded"), b.textContent]));
    check(`${W} sections start closed, each with its name and counts of proofs, statements and claims`, toggles.length > 0 && toggles.every(([x, s]) => x === "false" && /\d+ proofs?, \d+ statements?, \d+ claims?/.test(s)) && (await page.locator(".lines .row").count()) === 0, JSON.stringify(toggles));
    const rp = await page.locator("#repeats").innerText().catch(() => "");
    check(`${W} the repeat check warns and lists the lines`, /^1 line repeats another line/.test(rp) && /L1/.test(rp) && /L4/.test(rp), rp);
    await page.locator(".section-toggle", { hasText: "What it does" }).click();
    check(`${W} a section opens`, (await page.locator(".lines .row").count()) >= 1);
    await page.fill("#record-search", "a forum");
    check(`${W} the search finds a line by its speaker`, (await page.locator(".lines .row").count()) === 1 && /imd is a swarm of agents/.test(await page.locator(".lines").innerText()));
    await page.fill("#record-search", "");
    await page.locator(".section-toggle", { hasText: "What it does" }).click();
    await page.check("text=Only lines that are confirmed or contradicted");
    const settled = await page.$$eval(".lines .row .row-text, .fact-table .row-text", (rs) => rs.map((r) => r.textContent));
    check(`${W} the filter keeps only confirmed or contradicted lines`, settled.length === 2 && settled.includes("A post says a job costs 5 IMD.") && settled.includes("Seat supply"), JSON.stringify(settled));
    await page.locator(".fact-table .row-toggle").first().click();
    check(`${W} a line with history shows its earlier readings`, /Earlier readings\s*Block 26,400,000: 1,500/.test(await page.locator(".fact-details").innerText().catch(() => "")));
    check(`${W} no horizontal scroll on Record`, (await overflow(page)) <= 0, await wideOf(page));
    if (width === 390) await page.screenshot({ path: join(out, `390-record.png`), fullPage: true });

    // Activity labels
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
    const rb = await page.locator("#rebuild").innerText();
    check(`${W} the rebuild says the files the page dropped lines from are listed again`, /dropped lines, so 2 files they came from are listed again/.test(rb), rb.slice(0, 600));
    const objective = await page.locator("#rebuild .objective").textContent();
    check(`${W} the rebuild objective marks both files reconsider, numbered after the results`, /\[F4\] https:\/\/api\.imd\.fun\/artifacts\/[0-9a-f]{64} \(reconsider dropped lines\); \[F5\] https:\/\/api\.imd\.fun\/artifacts\/[0-9a-f]{64} \(reconsider dropped lines\); \[A1\]/.test(objective ?? "") && /For files marked reconsider/.test(objective ?? "") && !/at most 40 lines/.test(objective ?? ""), (objective ?? "").slice(-1400, -900));
    check(`${W} the three IMD presets are gone`, !/Check: The docs price/.test(await page.locator("main").innerText()));
    await page.check('input[value="contract"]');
    await page.fill("#q-address", "0x0000eC93127BAA929E58E97dd0095A2BFb38ec1D");
    await page.fill("#q-signature", "totalSupply()");
    await page.fill("#q-value", "2000");
    await page.click("text=Review the question");
    await page.waitForSelector('[role="dialog"]');
    const ob = await page.locator("pre.body").innerText();
    check(`${W} a contract question ends with the filed-under sentence and has no tag`, /return 2000\? This question is filed under the record of imd\.fun\./.test(ob) && !/"tag"/.test(ob));
    await page.keyboard.press("Escape");
    await page.check('input[value="page"]');
    await page.click("text=Review the question");
    check(`${W} the web page form asks for its fields`, (await page.locator("#q-url-err").count()) === 1 && (await page.locator("#q-text-err").count()) === 1);
    check(`${W} no horizontal scroll on Contribute`, (await overflow(page)) <= 0, await wideOf(page));

    // Sources: every channel with its label, and the key under them.
    await page.goto(base + "#/s/imd.fun/sources");
    await page.waitForSelector(".channels-block", { timeout: 30000 });
    const ch = await page.locator(".channels-block").innerText();
    check(`${W} Sources labels the channel on the subject's domain Own domain and explains the three labels`, /Own domain/.test(ch) && /Verified on chain:/.test(ch) && /Not verified:/.test(ch) && !/Confirmed on chain|Names the contract|not confirmed/i.test(ch), ch.slice(0, 300));
    check(`${W} the legend is the brief's sentence`, ch.includes("Lines published on Own domain or Verified on chain channels show as statements; everything else is a claim."));

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
    const b137 = d137 ? await page.locator("pre.body").innerText() : "";
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
    check(`${W} Panel answers is the last section of Record`, await page.evaluate(() => { const p = document.querySelector("#panel-answers"); return !!p && p.nextElementSibling === null && p.parentElement?.classList.contains("tab"); }));
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
    await page.waitForSelector("#panel-answers", { timeout: 30000 }).catch(() => {});
    check("390: oracle only: Record lists the panel answer", (await page.locator("#panel-answers .panel-row").count()) === 1);
    await ctx.close();
  }
  {
    const { ctx, page } = await variantPage({ fx: fx.variants.person });
    await page.goto(base);
    await page.waitForSelector(".subjects .subject", { timeout: 30000 });
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
    await page.waitForSelector("text=Unable to read the chain", { timeout: 60000 });
    await page.click("text=Try again");
    await page.waitForSelector("text=Try again", { timeout: 60000 });
    check("390: failed read: no 'No projects yet'", !/No projects yet/.test(await page.locator("main").innerText()));
    await page.fill("#lookup", "imd.fun");
    await page.click(".btn-lookup");
    await page.waitForSelector(".offer", { timeout: 5000 }).catch(() => {});
    if (await page.locator(".offer").count()) await page.click("text=Add this project");
    await page.waitForTimeout(300);
    check("390: failed read: no rebuild review, retry guidance instead", (await page.locator('[role="dialog"]').count()) === 0 && /The project list could not be read\. Try again before reviewing a rebuild\./.test(await page.locator("main").innerText()));
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
