/**
 * Browser interaction checks on the built export, in one foreground command:
 *   npx vite-node tests/make-fixture.ts test/scratch/fx.json
 *   IMD_PLAYWRIGHT=/path/to/playwright/index.mjs node tests/e2e.mjs test/scratch/fx.json test/scratch/e2e
 * Serves dist/ on a local port and opens it in Chromium at 320, 390 and 1440 wide. Every chain read (JSON-RPC)
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
try {
  for (const width of [390, 1440, 320]) {
    const ctx = await browser.newContext({ viewport: { width, height: 900 } });
    const page = await ctx.newPage();
    await mock(page);
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("console", (m) => m.type() === "error" && !/Failed to load resource/.test(m.text()) && errors.push(m.text()));
    const W = `${width}:`;
    await page.goto(base);
    const ok = await page.waitForSelector(".infobox", { timeout: 60000 }).then(() => true, () => false);
    check(`${W} Overview is the default tab and shows the key facts box`, ok && (await page.locator('.tabs a[aria-current="page"]').innerText()) === "Overview");
    if (!ok) {
      await page.screenshot({ path: join(out, `${width}-fail.png`) });
      continue;
    }
    await page.waitForSelector(".summary .sdot");
    const ib = await page.locator(".infobox").boundingBox();
    const sm = await page.locator(".summary").boundingBox();
    if (width >= 1440) check(`${W} key facts sit beside the summary`, ib.x > sm.x + sm.width - 1 && Math.abs(ib.y - sm.y) < 40, JSON.stringify({ ib, sm }));
    else check(`${W} key facts sit above the summary`, ib.y + ib.height <= sm.y + 1);
    check(`${W} key facts values are linked when they have a url`, (await page.locator('.infobox a[href="https://imd.fun/"]').count()) === 1);
    check(`${W} accepted edit is the summary, in short paragraphs, marked who edited it`, (await page.locator(".summary .prose").count()) === 2 && /Edited by 0x0085…059e, checked by a research job/.test(await page.locator(".summary").innerText()));
    check(`${W} Checked by a panel shows on Overview`, /Checked by a panel/.test(await page.locator("main").innerText()));
    if (width === 390) {
      const btn = await page.getByRole("link", { name: "Rebuild the page" }).boundingBox();
      check(`${W} the main action is on the first screen`, btn && btn.y + btn.height < 900);
      check(`${W} Overview's Rebuild is a link to the Contribute card, not a dialog`, (await page.getByRole("link", { name: "Rebuild the page" }).getAttribute("href")) === "#rebuild");
      check(`${W} the summary note is short`, /Not itself a checked line\. Dots open supporting lines\./.test(await page.locator(".summary .small").innerText()));
      check(`${W} the contribution card has no helper paragraph`, (await page.locator(".card:has(h2:text('Help build this record')) p").count()) === 0);
      // An accepted sentence resting on the page's L1 opens that line; a supported_by_source sentence whose
      // own line is also called L1 opens the edit's line, not the page's.
      const firstHref = await page.locator(".summary .prose").first().locator(".sdot").first().getAttribute("href");
      check(`${W} a supported sentence's dot opens the page line it names`, firstHref === "#line-L1", firstHref);
    }
    // A dot opens its lines in Record.
    await page.locator(".summary .sdot.kind-claim").last().click();
    await page.waitForSelector('.tabs a[aria-current="page"]:has-text("Record")');
    await page.waitForTimeout(200);
    const hash = await page.evaluate(() => location.hash);
    const opened = page.locator(`li.row[id="${hash.slice(1)}"]`);
    check(`${W} a supported_by_source dot opens the edit's own line, not page L1`, /^#line-0x[0-9a-f]+-L1$/.test(hash) && (await opened.locator(".row-toggle").getAttribute("aria-expanded")) === "true" && /Seats cost 1 ETH\./.test(await opened.innerText()), hash);
    // Record
    check(`${W} one facts table, under On chain`, (await page.locator(".fact-table").count()) === 1 && (await page.locator(".card:has(.fact-table) h2").innerText()) === "On chain");
    check(`${W} fact row reads the chain as whole words and the hex block from the re-run`, /Seat supply[\s\S]*2,000 seats[\s\S]*Ethereum, block 26,445,600/.test(await page.locator(".fact-table").innerText()), await page.locator(".fact-table").innerText());
    check(`${W} a fact row's links show while it is closed`, /Confirmed by: The docs price a job at 0\.5 IMD = true, 5 of 5/.test(await page.locator(".fact-table .settled-confirms").innerText()));
    const conf = page.locator("li.row .settled-confirms");
    const contra = page.locator("li.row .settled-contradicts");
    check(`${W} Confirmed by (green) and Contradicted by (red) under the linked line`, /Confirmed by: The seat collection has 2,000 tokens\./.test(await conf.innerText()) && /Contradicted by: The docs price a job at 0\.5 IMD = true, 5 of 5/.test(await contra.innerText()));
    const colors = await page.evaluate(() => [getComputedStyle(document.querySelector(".settled-confirms")).color, getComputedStyle(document.querySelector(".settled-contradicts")).color]);
    check(`${W} link colours`, colors[0] === "rgb(20, 108, 54)" && colors[1] === "rgb(161, 35, 27)", colors.join(" "));
    await conf.locator("a").click();
    await page.waitForTimeout(200);
    check(`${W} Confirmed by opens the proof line`, (await page.locator("tr#line-L2 .row-toggle").getAttribute("aria-expanded")) === "true");
    // The claim's checked detail no longer says nobody confirmed it; its link notes say what did.
    const claimRow = page.locator("li.row", { hasText: "A post says a job costs 5 IMD." });
    await claimRow.locator(".row-toggle").click();
    check(`${W} an expanded claim with links does not say nobody confirmed it`, !/Nobody has confirmed it/.test(await claimRow.innerText()) && /Confirmed by/.test(await claimRow.innerText()));
    check(`${W} accounting warning lists the unaccounted line`, /1 earlier line is unaccounted for[\s\S]*F2:E2 Old source two lost/.test(await page.locator(".warn-box").innerText()));
    check(`${W} Dropped in the last rebuild is closed, with each line's text and reason`, (await page.locator("details.dropped").getAttribute("open")) === null && /F2:E1x: not about the subject/.test(await page.locator("details.dropped").textContent()) && /F1:L4 “Old four”: duplicate of L1/.test(await page.locator("details.dropped").textContent()));
    check(`${W} Not known yet is on Record`, /Not known yet/.test(await page.locator("main").innerText()));
    check(`${W} added-source and edit lines join the record`, /A blog says IMD launched in 2026\./.test(await page.locator("main").innerText()) && /Seats cost 1 ETH\./.test(await page.locator("main").innerText()));
    check(`${W} folded results (the old sources line) are not shown`, !/Old source one/.test(await page.locator("main").innerText()));
    // Filter still works
    await page.locator(".btn-filter", { hasText: "Proof" }).click();
    check(`${W} Proof filter shows only proof`, (await page.locator("li.row").count()) === 0 && (await page.locator(".fact-row").count()) === 1);
    await page.locator(".btn-filter", { hasText: "All" }).click();
    // Old links
    for (const [h, tab] of [["#actions", "Contribute"], ["#add-sources", "Contribute"], ["#activity", "Activity"], ["#sources", "Sources"], ["#source-1", "Sources"]]) {
      await page.evaluate((x) => (location.hash = x), h);
      await page.waitForTimeout(150);
      check(`${W} ${h} opens ${tab}`, (await page.locator('.tabs a[aria-current="page"]').innerText()) === tab);
    }
    // Activity
    await page.evaluate(() => (location.hash = "#activity"));
    await page.waitForSelector(".verdicts");
    const act = await page.locator("#activity").innerText();
    check(`${W} Activity lists each edit sentence with its verdict and reason`, /supported by the record\s*IMD is a swarm of agents\./.test(act) && /not supported\s*It is the best swarm\.\s*Praise is always unsupported\./.test(act) && /supported by a new source/.test(act));
    check(`${W} Activity names rebuilds and what is shown`, /Page rebuild/.test(act) && /Replaced by a newer page/.test(act) && /Shown now, on top of the page/.test(act));
    check(`${W} an earlier source the rebuild did not fully account for is not called folded in`, /Completed before the page shown/.test(act) && !/Folded into/.test(act) && /2 lines in result/.test(act));
    check(`${W} an accepted verdict links the line that backs it`, /supported by the record\s*IMD is a swarm of agents\.\s*Backed by IMD is a swarm of agents\./.test(act) && (await page.locator('.verdicts a[href="#line-L1"]').count()) === 1);
    // Contribute: rebuild body
    await page.evaluate(() => (location.hash = "#contribute"));
    await page.locator("#rebuild").getByRole("button", { name: "Rebuild the page" }).click();
    await page.waitForSelector("pre.body");
    const body = await page.locator("pre.body").innerText();
    const fh = Object.keys(fx.results).length && [fx.page2, fx.src2, fx.edit];
    check(`${W} rebuild body: kind add, page.json, <PRIOR> = shown page, then later results, then panel answers`, body.includes('"kind": "add"') && body.includes("artifacts/page.json") && body.includes(`Start from the earlier results: [F1] https://api.imd.fun/artifacts/${fh[0]}; [F2] https://api.imd.fun/artifacts/${fh[1]}; [F3] https://api.imd.fun/artifacts/${fh[2]}; [A1] The docs price a job at 0.5 IMD = true, 5 of 5, https://explorer.imd.fun/jobs/job-6. Fetch each file.`));
    check(`${W} the dialog shows the full body and no wallet prompt yet`, (await page.getByRole("dialog").getByRole("button", { name: /Connect/ }).count()) >= 1);
    await page.keyboard.press("Escape");
    // Suggest an edit
    const ta = page.locator("#edit-text");
    check(`${W} the edit box holds the current summary`, (await ta.inputValue()) === "IMD is a swarm of agents.\n\nSeats cost 1 ETH.");
    await ta.fill("x".repeat(1501));
    check(`${W} over 1,500 characters is flagged`, /1,501 of 1,500 characters/.test(await page.locator("#edit-count").innerText()) && (await page.locator("#edit-count").getAttribute("class")) === "error");
    await page.locator("#suggest-edit").getByRole("button", { name: "Review the edit job" }).click();
    check(`${W} an over-long edit does not open the dialog`, (await page.getByRole("dialog").count()) === 0);
    await ta.fill("IMD runs jobs.");
    await page.locator("#suggest-edit").getByRole("button", { name: "Review the edit job" }).click();
    check(`${W} a short complete sentence opens the review`, (await page.getByRole("dialog").count()) === 1);
    await page.keyboard.press("Escape");
    await ta.fill("The string <PRIOR> is literal and <URLS> is also literal.");
    await page.locator("#edit-links").fill("https://imd.fun/docs/");
    await page.locator("#suggest-edit").getByRole("button", { name: "Review the edit job" }).click();
    const lit = await page.locator("pre.body").innerText();
    check(`${W} literal <PRIOR> and <URLS> in the text stay literal`, lit.includes("Proposed text: The string <PRIOR> is literal and <URLS> is also literal.. The record so far: [F1] https://api.imd.fun/artifacts/") && lit.includes("Extra sources from the visitor: [1] https://imd.fun/docs/."));
    await page.keyboard.press("Escape");
    await ta.fill("IMD is a swarm of agents. It has 2,000 seats.");
    await page.locator("#edit-links").fill("https://imd.fun/docs/\nhttp://bad.example\n");
    check(`${W} edit links follow the Add sources rules`, /Left out, not an https link/.test(await page.locator("#suggest-edit").innerText()));
    await page.locator("#suggest-edit").getByRole("button", { name: "Review the edit job" }).click();
    const eb = await page.locator("pre.body").innerText();
    check(`${W} edit body: tag kind edit, edit.json, text, prior and links`, eb.includes('"kind": "edit"') && eb.includes("artifacts/edit.json") && eb.includes("Proposed text: IMD is a swarm of agents. It has 2,000 seats.. The record so far: [F1] ") && eb.includes("Extra sources from the visitor: [1] https://imd.fun/docs/."));
    await page.keyboard.press("Escape");
    // Overview Edit button goes to the edit form
    await page.evaluate(() => (location.hash = "#overview"));
    await page.locator(".summary").getByRole("link", { name: "Edit" }).click();
    await page.waitForTimeout(200);
    check(`${W} the Edit button beside the summary opens the edit form`, (await page.locator('.tabs a[aria-current="page"]').innerText()) === "Contribute" && (await page.evaluate(() => document.activeElement?.id)) === "suggest-edit");
    // Overflow on every tab
    for (const t of ["overview", "record", "sources", "activity", "contribute"]) {
      await page.evaluate((x) => (location.hash = x), `#${t}`);
      await page.waitForTimeout(150);
      const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      if (t === "overview") await page.screenshot({ path: join(out, `${width}-overview.png`) });
      if (t === "record") await page.screenshot({ path: join(out, `${width}-record.png`), fullPage: true });
      check(`${W} no horizontal scroll on ${t}`, over <= 0, `${over}px`);
    }
    const tabsFit = await page.evaluate(() => {
      const n = document.querySelector(".tabs");
      const box = n.getBoundingClientRect();
      const links = [...n.querySelectorAll("a")].map((a) => a.getBoundingClientRect());
      return { over: n.scrollWidth - n.clientWidth, clipped: links.filter((r) => r.left < box.left - 0.5 || r.right > box.right + 0.5).length, short: links.filter((r) => r.height < 44).length };
    });
    check(`${W} all five tab labels are fully visible, 44px tall, with no scrolling tab bar`, tabsFit.over <= 0 && tabsFit.clipped === 0 && tabsFit.short === 0, JSON.stringify(tabsFit));
    check(`${W} no console errors`, errors.length === 0, errors.slice(0, 3).join(" | "));
    await ctx.close();
  }
  // Scenarios at 390 wide, one context each.
  const at390 = async (opts, url = base) => {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page = await ctx.newPage();
    await mock(page, opts);
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(url);
    return { ctx, page, errors };
  };
  {
    // A malformed fragment still loads Overview.
    const { ctx, page, errors } = await at390({}, `${base}#%`);
    const ok = await page.waitForSelector("h1", { timeout: 20000 }).then(() => true, () => false);
    check("390: #% loads Overview", ok && (await page.locator('.tabs a[aria-current="page"]').innerText()) === "Overview" && errors.length === 0, errors.join(" | "));
    await ctx.close();
  }
  {
    // While the chain read is slow, Contribute's rebuild waits; once loaded it names F1-F3 and A1.
    const { ctx, page } = await at390({ delayLogs: 2000 }, `${base}#rebuild`);
    const btn = page.locator("#rebuild").getByRole("button");
    check("390: rebuild cannot be reviewed while the record is loading", (await btn.isDisabled()) && /Reading the record/.test(await btn.innerText()));
    await page.waitForSelector("#rebuild button:not([disabled])", { timeout: 30000 });
    await btn.click();
    const body = await page.locator("pre.body").innerText();
    check("390: the rebuild reviewed after loading names F1-F3 and A1", /\[F1\][\s\S]*\[F2\][\s\S]*\[F3\][\s\S]*\[A1\]/.test(body) && !/earlier results: none/.test(body));
    await ctx.close();
  }
  {
    // A failed chain read never offers the empty prior.
    const { ctx, page } = await at390({ failBlockNumber: true }, `${base}#contribute`);
    await page.waitForSelector("#rebuild .warn", { timeout: 30000 }).catch(() => {});
    const btn = page.locator("#rebuild").getByRole("button", { name: /Rebuild|Record|Reading/ });
    check("390: after an RPC error, rebuild stays disabled and Refresh is offered", (await btn.isDisabled()) && (await page.locator("#rebuild").getByRole("button", { name: "Refresh" }).count()) === 1, await page.locator("#rebuild").innerText());
    await page.locator("#edit-text").fill("IMD runs jobs.");
    await page.locator("#suggest-edit").getByRole("button", { name: "Review the edit job" }).click();
    check("390: after an RPC error, the edit is not reviewed either", (await page.getByRole("dialog").count()) === 0);
    await ctx.close();
  }
  {
    // No page job: the accepted edit is still the summary on Overview.
    const pageIds = new Set([1, 3].map((n) => "0x" + n.toString(16).padStart(64, "0")));
    const v = { ...fx, requests: fx.requests.filter((r) => !pageIds.has(r.topics[1])), completions: fx.completions.filter((c) => !pageIds.has(c.topics[1])) };
    const { ctx, page } = await at390({ fx: v });
    await page.waitForSelector(".summary", { timeout: 30000 }).catch(() => {});
    const main = await page.locator("main").innerText();
    check("390: with no page, Overview says No page yet and still shows the accepted edit", /No page yet/.test(main) && /Run a rebuild to publish the first record\./.test(main) && (await page.locator(".summary .prose").count()) === 2 && /Edited by/.test(main), main.slice(0, 300));
    check("390: with no page, the supported sentence has no dot rather than the edit's own same-id line", (await page.locator(".summary .prose").first().locator(".sdot").count()) === 0 && (await page.locator(".summary .prose").nth(1).locator(".sdot.kind-claim").count()) === 1);
    await page.screenshot({ path: join(out, "390-no-page.png") });
    await ctx.close();
  }
} finally {
  await browser.close();
  server.close();
}
await writeFile(join(out, "results.json"), JSON.stringify(results, null, 2));
const failed = results.filter((r) => !r.ok).length;
console.log(`${results.length - failed} of ${results.length} pass`);
process.exit(failed ? 1 : 0);
