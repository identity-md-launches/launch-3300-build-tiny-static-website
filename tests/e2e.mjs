/**
 * Browser interaction checks on the built export, in one foreground command.
 *   IMD_PLAYWRIGHT=/path/to/playwright/index.mjs node tests/e2e.mjs <outDir> [harnessDir]
 * Serves dist/ (and, if given, a fixture harness build) on a local port, opens it in Chromium at 390 and 1440
 * wide, walks the record's rows, filter, sources and Activity against the live chain and api.imd.fun, and
 * writes screenshots and results.json to <outDir>. The optional harness renders the same Record component with
 * fixture data that has a summary, on-chain facts, both differs levels and read_via.
 */
import { createServer } from "node:http";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { extname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const out = resolve(process.argv[2] ?? "test/scratch/e2e");
const harness = process.argv[3] ? resolve(process.argv[3]) : null;
const { chromium } = await import(pathToFileURL(process.env.IMD_PLAYWRIGHT ?? "playwright").href);
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".png": "image/png", ".md": "text/markdown", ".json": "application/json" };
const roots = { "/site/": resolve("dist"), ...(harness ? { "/harness/": harness } : {}) };
const server = createServer(async (req, res) => {
  const url = new URL(req.url, "http://x");
  const prefix = Object.keys(roots).find((p) => url.pathname.startsWith(p));
  if (!prefix) return res.writeHead(404).end();
  let rel = decodeURIComponent(url.pathname.slice(prefix.length)) || "index.html";
  if (rel.endsWith("/")) rel += "index.html";
  try {
    const body = await readFile(join(roots[prefix], rel));
    res.writeHead(200, { "content-type": TYPES[extname(rel)] ?? "application/octet-stream" }).end(body);
  } catch {
    res.writeHead(404).end();
  }
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const base = `http://127.0.0.1:${server.address().port}`;
await mkdir(out, { recursive: true });

const results = [];
const check = (name, ok, detail = "") => {
  results.push({ name, ok: !!ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? `: ${detail}` : ""}`);
};

const browser = await chromium.launch({ headless: true });
try {
  for (const width of [390, 1440]) {
    const page = await browser.newPage({ viewport: { width, height: 900 } });
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
    await page.goto(`${base}/site/`);
    // Wait for the research page itself (its channels), not only the source-job lines that can arrive first.
    const ok = await page.waitForSelector(".channels-block", { timeout: 120000 }).then(() => page.waitForSelector(".row-toggle")).then(() => true, () => false);
    check(`${width}: record rows render from live data`, ok);
    if (!ok) continue;
    const rows = await page.locator("li.row").count();
    check(`${width}: one row per line, closed by default`, rows > 0 && (await page.locator(".details").count()) === 0, `${rows} rows`);
    const first = page.locator("li.row").first();
    await first.locator(".row-text").click();
    const details = first.locator(".details");
    check(`${width}: clicking a row opens its details`, (await details.count()) === 1 && /Checked/.test(await details.innerText()) && /Added by/.test(await details.innerText()));
    await first.locator(".row-toggle").focus();
    await page.keyboard.press("Enter");
    check(`${width}: Enter on an open row closes it`, (await first.locator(".details").count()) === 0 && (await first.locator(".row-toggle").getAttribute("aria-expanded")) === "false");
    await page.keyboard.press("Enter");
    check(`${width}: Enter opens it again`, (await first.locator(".details").count()) === 1);
    const filterText = await page.locator(".filter").innerText();
    const counts = Object.fromEntries([...filterText.matchAll(/(All|Proof|Statement|Claim)\s*(\d+)/g)].map((m) => [m[1], Number(m[2])]));
    check(`${width}: filter shows All, Proof, Statement, Claim with counts`, counts.All === counts.Proof + counts.Statement + counts.Claim, JSON.stringify(counts));
    for (const k of ["Proof", "Statement", "Claim"]) {
      await page.locator(".btn-filter", { hasText: k }).click();
      const kinds = await page.locator("li.row .row-meta .kind, .fact-row").evaluateAll((els) => els.map((e) => (e.classList.contains("fact-row") ? "Proof" : e.textContent)));
      check(`${width}: filter ${k} shows only ${k} lines`, kinds.length === counts[k] && kinds.every((x) => x === k), `${kinds.length} shown`);
    }
    await page.locator(".btn-filter", { hasText: "All" }).click();
    const nums = await page.locator("ol.sources > li > .chip").allInnerTexts();
    check(`${width}: one numbered source list for research and added sources`, nums.length > 0 && nums.every((n, i) => Number(n) === i + 1) && (await page.locator("ol.sources").innerText()).includes("added by"), `${nums.length} sources`);
    const outcomes = await page.locator(".outcomes li").allInnerTexts();
    check(`${width}: Activity lists every source of a source job with its outcome`, outcomes.length > 0 && outcomes.every((t) => /\d+ lines?|could not open|read, not about this subject/.test(t)), outcomes.map((t) => t.split("\n").pop()).join(" | "));
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    check(`${width}: no horizontal scroll`, overflow <= 0, `${overflow}px`);
    const statementsOk = await page.evaluate(() => [...document.querySelectorAll("li.row")].filter((r) => r.querySelector(".kind-statement")).length);
    check(`${width}: statements present only where a tied channel published them`, statementsOk === counts.Statement);
    check(`${width}: no console or page errors`, errors.length === 0, errors.slice(0, 3).join(" | "));
    await page.screenshot({ path: join(out, `live-${width}.png`) });
    await page.locator("#record .card").nth(1).screenshot({ path: join(out, `live-${width}-section.png`) });
    await page.close();
  }

  if (harness) {
    for (const width of [390, 1440]) {
      const page = await browser.newPage({ viewport: { width, height: 900 } });
      await page.goto(`${base}/harness/`);
      await page.waitForSelector(".summary");
      check(`${width} fixture: Summary heading and note`, /Summary/.test(await page.locator(".summary h2").innerText()) && (await page.locator(".summary").innerText()).includes("Written by the research job from the lines below. Not itself a checked line."));
      await page.locator(".btn-filter", { hasText: "Claim" }).click();
      await page.locator(".summary a.chip", { hasText: "job-price" }).click();
      const target = page.locator("#line-job-price");
      check(`${width} fixture: a summary link shows all kinds, opens the line and focuses it`, (await target.locator(".details").count()) === 1 && (await page.evaluate(() => document.activeElement?.closest("li")?.id)) === "line-job-price" && (await page.locator(".btn-filter[aria-pressed=true]").innerText()).startsWith("All"));
      const conflict = await page.locator(".differs-conflict").allInnerTexts();
      const question = await page.locator(".differs-question").allInnerTexts();
      check(`${width} fixture: differs levels`, conflict.some((t) => t.startsWith("Conflicts with the line above: Two different prices")) && question.some((t) => t.startsWith("Compare with the line above: Both describe")));
      const table = page.locator(".fact-table").first();
      check(`${width} fixture: proof lines with fact show as a table`, (await table.locator("tr.fact-row").count()) === 4 && /IMD total supply/.test(await table.innerText()) && /Ethereum, block 26,445,903/.test(await table.innerText()));
      await table.locator("tr.fact-row").first().locator("td").first().click();
      const fd = await page.locator(".fact-details").first().innerText().catch(() => "");
      check(`${width} fixture: a fact row opens to the sentence and re-run steps`, /Line/.test(fd) && /Re-run/.test(fd));
      check(`${width} fixture: read via host beside a source`, (await page.locator("ol.sources").innerText()).includes("read via web.archive.org"));
      check(`${width} fixture: not-about-subject outcome`, (await page.locator(".outcomes").innerText()).includes("read, not about this subject: It is IMD Business School"));
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      check(`${width} fixture: no horizontal scroll`, overflow <= 0, `${overflow}px`);
      await page.locator(".summary").screenshot({ path: join(out, `fixture-${width}-summary.png`) });
      await page.locator(".card", { has: page.locator(".fact-table") }).screenshot({ path: join(out, `fixture-${width}-facts.png`) });
      await page.locator(".card", { has: page.locator(".differs-conflict") }).screenshot({ path: join(out, `fixture-${width}-differs.png`) });
      await page.close();
    }
  }
} finally {
  await browser.close();
  server.close();
}
await writeFile(join(out, "results.json"), JSON.stringify(results, null, 2));
const failed = results.filter((r) => !r.ok).length;
console.log(`${results.length - failed} of ${results.length} passed`);
process.exit(failed ? 1 : 0);
