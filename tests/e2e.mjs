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
      if ((m = /^\/artifacts\/([0-9a-f]{64})$/.exec(url.pathname)))
        return fx.files[m[1]] ? route.fulfill({ status: 200, headers: { "access-control-allow-origin": "*" }, body: fx.files[m[1]] }) : json({}, 404);
      if (/^\/oracle\/requests\//.test(url.pathname)) return json({ id: fx.oracleId, status: "completed", panelSize: 5, jobId: "job-6", agreement: { agreed: 5, answer: true } });
    }
    return route.fulfill({ status: 404, body: "" });
  });
}

const browser = await chromium.launch({ headless: true });
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
    const search = await page.locator("#search").boundingBox();
    const addBtn = await page.locator(width >= 832 ? "#add-title" : ".add-jump").boundingBox();
    check(`${W} search and Add a project are on the first screen`, search && addBtn && search.y + search.height < 844 && addBtn.y + addBtn.height < 844, JSON.stringify({ search, addBtn }));
    await page.fill("#search", "zzz-nothing");
    check(`${W} search filters the list`, (await page.locator(".subjects .subject").count()) === 0 && /No project matches/.test(await page.locator(".home-list").innerText()));
    await page.fill("#search", "imd");
    check(`${W} search finds by name or id`, (await page.locator(".subjects .subject").count()) === 1);
    // Add a project: validation, then the Rebuild dialog with the subject's tag and <SUBJECT>.
    await page.click("text=Review the first rebuild");
    check(`${W} an empty form asks for a domain`, /Write the project's domain/.test(await page.locator("#add").innerText()));
    await page.fill("#add-domain", "https://www.Example.com/about");
    await page.fill("#add-address", "0x1111111111111111111111111111111111111111");
    await page.selectOption("#add-chain", "8453");
    check(`${W} the form shows the page it will make`, /#\/s\/example\.com/.test(await page.locator("#add-id").innerText()));
    await page.click("text=Review the first rebuild");
    const dlg = await page.waitForSelector('[role="dialog"]', { timeout: 5000 }).then(() => true, () => false);
    const body = dlg ? await page.locator("pre.body").innerText() : "";
    check(`${W} Add opens the Rebuild dialog for that subject`, dlg && /Create the page of example\.com/.test(await page.locator("#pay-title").innerText()));
    check(`${W} its tag carries the subject`, /"subject": "example\.com"/.test(body) && /"kind": "add"/.test(body), body.slice(0, 120));
    check(`${W} its objective names the project and contract`, body.includes("one subject: the project at example.com, whose main contract is 0x1111111111111111111111111111111111111111 on chain 8453.") && body.includes("Start from the earlier results: none."));
    if (dlg) await page.keyboard.press("Escape");
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
        return lead?.nextElementSibling?.classList.contains("overview") && document.querySelector(".overview")?.firstElementChild?.classList.contains("keyfacts") && !!actions && !!summary && (summary.compareDocumentPosition(actions) & Node.DOCUMENT_POSITION_FOLLOWING) > 0;
      }));
      check(`${W} every key fact row has a status badge`, (await page.locator(".keyfacts .badge").count()) >= 1);
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
    await page.waitForSelector(".lines", { timeout: 30000 });
    const rec = await page.locator("main").innerText();
    check(`${W} panel answers list at the bottom of Record`, (await page.locator("#panel-answers").count()) === 1);
    check(`${W} Record shows lines`, /What it does|Money|On chain/.test(rec));

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
    check(`${W} no script errors`, errors.length === 0, errors.join(" | "));
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
