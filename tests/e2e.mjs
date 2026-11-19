// Interaction checks on the built export. Serves dist/ under /preview/, mocks the RPC and api.imd.fun with fixtures.
// Usage: IMD_PLAYWRIGHT=/path/to/playwright/index.mjs node tests/e2e.mjs [outDir]
import { createServer } from "node:http";
import { readFileSync, existsSync, mkdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { extname, join } from "node:path";
import { encodeAbiParameters, keccak256, pad, stringToHex, toHex } from "viem";

const { chromium } = await import(process.env.IMD_PLAYWRIGHT || "playwright");
const out = process.argv[2] || "test/scratch/e2e";
mkdirSync(out, { recursive: true });
const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".png": "image/png" };
const server = createServer((req, res) => {
  const p = decodeURIComponent(req.url.split("?")[0]).replace(/^\/preview\/?/, "") || "index.html";
  const f = join("dist", p);
  if (!req.url.startsWith("/preview") || !existsSync(f)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { "content-type": types[extname(f)] || "application/octet-stream" });
  res.end(readFileSync(f));
}).listen(0);
const base = `http://localhost:${server.address().port}/preview/`;

const T_REQ = "0x1c521a43c9b0f72a335bc80a6918abce08af7949ebbd1c41fe2a576074379063";
const T_DONE = "0xd4ad2d2ef4e8ea9995103f34e322dbefb2534f3a52984a308f7db8e257b76fa1";
const objective = readFileSync("templates/research.txt", "utf8").trim();
const page = JSON.stringify({
  subject: { type: "project", name: "IMD", one_line: "A network of AI agents paid in IMD, with its record on Ethereum.", channels: [{ label: "imd.fun", url: "https://imd.fun", tie: "strong" }, { label: "X account", url: "https://x.com/example", tie: "weak" }] },
  lines: [
    { id: "l1", section: "money", text: "A job costs 0.5 IMD.", kind: "statement", by: "imd.fun", sources: ["s1"], quote: "0.5 $IMD buys a job, a launch or an oracle question." },
    { id: "l2", section: "what_it_does", text: "<b>Agents</b> build and review software.", kind: "claim", by: "a blog", sources: ["s2"], quote: "agents that build" },
    { id: "l3", section: "on_chain", text: "The seat collection has 2,000 tokens.", kind: "proof", sources: ["s1"], rerun: "totalSupply() on chain 1 at block 26445600" },
    { id: "l4", section: "history", text: "A job cost 1 IMD.", kind: "claim", by: "a forum post", sources: ["s2"], quote: "it cost 1 IMD" },
  ],
  differs: [{ lines: ["l1", "l4"], why: "The two prices cannot both hold." }],
  open_questions: ["Who operates the oracle signer?"],
  sources: [{ id: "s1", ref: "https://imd.fun/docs/", type: "web", read_at: "2026-11-19T10:00:00Z", could_open: true }, { id: "s2", ref: "javascript:alert(1)", type: "post", read_at: "2026-11-19T10:05:00Z", could_open: false }],
});
const pageHash = createHash("sha256").update(page).digest("hex");
const mkReq = (i, action, body, block) => ({
  address: "0xa43e6f75ee006411f79ac1c84120606c2330de82",
  topics: [T_REQ, keccak256(toHex("req" + i)), pad("0x00856bd495941f3b95da5b7e374c76d822c9059e"), pad(stringToHex(action), { dir: "right" })],
  data: encodeAbiParameters([{ type: "bytes" }, { type: "address" }, { type: "bytes4" }, { type: "address" }, { type: "uint256" }], [stringToHex(JSON.stringify(body)), "0x0000000000000000000000000000000000000000", "0x00000000", "0xd34a99bc0f67ae1bbd63c660e6d0b0dd03e263b7", 500000000000000000n]),
  blockNumber: toHex(block), transactionHash: keccak256(toHex("tx" + i)), logIndex: "0x1",
});
const mkDone = (i, status, h, uri) => ({ address: "0xa43e6f75ee006411f79ac1c84120606c2330de82", topics: [T_DONE, keccak256(toHex("req" + i))], data: encodeAbiParameters([{ type: "uint8" }, { type: "bytes32" }, { type: "string" }, { type: "bool" }], [status, h, uri, false]), blockNumber: toHex(26445800), transactionHash: keccak256(toHex("done" + i)), logIndex: "0x0" });
const tag = (kind) => ({ app: "rec-test-1", kind });
const reqs = [
  mkReq(1, "job.open@job-1", { tag: tag("add"), skill: "research-report", outputs: [{ name: "page", path: "artifacts/page.json", mediaType: "application/json" }], objective }, 26445610),
  mkReq(2, "oracle.request@oracle-1", { tag: tag("statement"), v: 1, question: "Does the web page at https://imd.fun/docs/ state that hiring the swarm for a job costs 0.5 IMD?", chainId: 1, window: { hours: 24 }, answerType: "bool", evidence: "panel", panelSize: 5, quorum: 4, validForSeconds: 86400 }, 26445620),
  mkReq(3, "oracle.request@oracle-1", { tag: tag("proof"), v: 1, question: "Pending question?", chainId: 1, window: { hours: 24 }, answerType: "bool", panelSize: 5, quorum: 4, validForSeconds: 86400 }, 26445630),
  mkReq(4, "oracle.request@oracle-1", { tag: tag("claim"), v: 1, question: "Refused question?", chainId: 1, answerType: "bool", panelSize: 5, quorum: 4, validForSeconds: 86400 }, 26445640),
  mkReq(5, "oracle.request@oracle-1", { tag: { app: "someone-else", kind: "x" }, v: 1, question: "Not ours" }, 26445650),
];
const dones = [mkDone(1, 0, keccak256(toHex("r")), "ipfs://bafyfixture/result.json"), mkDone(2, 0, keccak256(toHex("o")), "https://api.imd.fun/oracle/requests/11111111-2222-3333-4444-555555555555/attestation"), mkDone(4, 1, pad(stringToHex("body_invalid"), { dir: "right" }), "")];

async function mock(ctx, { empty = false } = {}) {
  const rpc = async (route) => {
    const body = route.request().postDataJSON();
    const one = (b) => {
      const ok = (result) => ({ jsonrpc: "2.0", id: b.id, result });
      if (b.method === "eth_blockNumber") return ok(toHex(26446000));
      if (b.method === "eth_chainId") return ok("0x1");
      if (b.method === "eth_getBlockByNumber") return ok({ timestamp: toHex(1795000000 + parseInt(b.params[0], 16) % 1000 * 12), number: b.params[0] });
      if (b.method === "eth_getLogs") {
        const t = b.params[0].topics;
        if (empty) return ok([]);
        if (t[0] === T_REQ) return ok(reqs);
        if (t[0] === T_DONE) return ok(dones.filter((d) => t[1].includes(d.topics[1])));
        return ok([]);
      }
      if (b.method === "eth_call") {
        if (b.params[0].to?.toLowerCase() === "0xa43e6f75ee006411f79ac1c84120606c2330de82") return ok(pad(toHex(500000000000000000n)));
        return { jsonrpc: "2.0", id: b.id, error: { code: 3, message: "execution reverted" } };
      }
      return { jsonrpc: "2.0", id: b.id, error: { code: -32601, message: "no" } };
    };
    await route.fulfill({ contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: JSON.stringify(Array.isArray(body) ? body.map(one) : one(body)) });
  };
  for (const host of ["https://gateway.tenderly.co/**", "https://ethereum-rpc.publicnode.com/**", "https://rpc.mevblocker.io/**", "https://*.merkle.io/**", "https://eth.merkle.io/**"]) await ctx.route(host, rpc);
  await ctx.route("https://api.imd.fun/**", async (route) => {
    const u = new URL(route.request().url());
    const json = (o, status = 200) => route.fulfill({ status, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: JSON.stringify(o) });
    const tx = u.pathname.match(/^\/intake\/1\/(0x[0-9a-f]+)$/)?.[1];
    if (tx) {
      const i = reqs.findIndex((r) => r.transactionHash === tx);
      const r = reqs[i];
      const result = i === 0 ? { kind: "job", jobId: "aaaaaaaa-0000-0000-0000-000000000001" } : i === 1 ? { kind: "oracle", jobId: "bbbbbbbb-0000-0000-0000-000000000002", requestId: "11111111-2222-3333-4444-555555555555" } : null;
      return json({ chainId: 1, transactionHash: tx, entries: [{ requestId: r.topics[1], state: "completed", admission: result ? { result } : null }] });
    }
    if (u.pathname === "/jobs/aaaaaaaa-0000-0000-0000-000000000001/result") return json({ jobId: "aaaaaaaa-0000-0000-0000-000000000001", files: [{ name: "page", path: "artifacts/page.json", hash: pageHash, url: `https://api.imd.fun/artifacts/${pageHash}` }] });
    if (u.pathname === `/artifacts/${pageHash}`) return route.fulfill({ status: 200, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: page });
    if (u.pathname.startsWith("/oracle/requests/11111111")) return json({ id: "11111111-2222-3333-4444-555555555555", status: "attested", panelSize: 5, jobId: "bbbbbbbb-0000-0000-0000-000000000002", agreement: { agreed: 4, answer: "true" } });
    return json({ error: "not_found" }, 404);
  });
}

const results = [];
const check = (name, ok, detail = "") => { results.push({ name, ok, detail }); console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? " :: " + detail : ""}`); };
const browser = await chromium.launch();
try {
  for (const width of [320, 390, 1440]) {
    const ctx = await browser.newContext({ viewport: { width, height: width === 1440 ? 900 : 844 } });
    await mock(ctx);
    const pg = await ctx.newPage();
    const errors = [];
    pg.on("pageerror", (e) => errors.push(e.message));
    pg.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
    await pg.goto(base);
    await pg.getByRole("heading", { name: "Money" }).waitFor({ timeout: 20000 });
    const overflow = await pg.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    check(`${width}: no horizontal scroll`, overflow <= 0, `overflow ${overflow}px`);
    await pg.screenshot({ path: `${out}/record-${width}.png` });
    if (width !== 390) { check(`${width}: no console errors`, errors.length === 0, errors.join(" | ").slice(0, 300)); await ctx.close(); continue; }

    const h1 = await pg.locator("h1").innerText();
    check("record: subject name from page.json", h1 === "IMD", h1);
    const firstScreen = await pg.evaluate(() => { const b = [...document.querySelectorAll("button")].find((x) => /Research/.test(x.textContent)); const r = b?.getBoundingClientRect(); return r ? r.bottom <= innerHeight : false; });
    check("390: research button on first screen", firstScreen);
    const moneyRows = await pg.locator(".card", { has: pg.getByRole("heading", { name: "Money" }) }).locator(".line-text").allInnerTexts();
    check("record: differs pair shown together", moneyRows[0] === "A job costs 0.5 IMD." && moneyRows[1] === "A job cost 1 IMD.", JSON.stringify(moneyRows));
    check("record: history section holds no duplicate", (await pg.getByRole("heading", { name: "History" }).count()) === 0);
    check("record: HTML in a line renders as text", (await pg.getByText("<b>Agents</b> build and review software.").count()) === 1 && (await pg.locator(".line-text b").count()) === 0);
    check("record: claim label names who said it", (await pg.locator(".label-claim", { hasText: "a blog" }).count()) === 1);
    check("record: proof and statement labels", (await pg.locator(".label-proof").count()) >= 1 && (await pg.locator(".label-statement").count()) >= 1);
    check("record: numbered source chips link to sources", (await pg.locator('a.chip[href="#source-1"]').count()) >= 1);
    const rj = await pg.locator("a.checked", { hasText: "research job" }).first().getAttribute("href");
    check("record: research job links to explorer.imd.fun", rj === "https://explorer.imd.fun/jobs/aaaaaaaa-0000-0000-0000-000000000001", rj);
    const panelLink = await pg.locator("a.checked", { hasText: "panel, 4 of 5 agreed" }).getAttribute("href");
    check("record: panel line 'panel, 4 of 5 agreed' links to its job", panelLink === "https://explorer.imd.fun/jobs/bbbbbbbb-0000-0000-0000-000000000002", panelLink);
    check("record: Not known yet", (await pg.getByRole("heading", { name: "Not known yet" }).count()) === 1);
    check("record: javascript: source is not a link", (await pg.locator('a[href^="javascript"]').count()) === 0);
    const states = await pg.locator(".activity .state").allInnerTexts();
    check("activity: tagged requests only, newest first, with states", JSON.stringify(states) === JSON.stringify(["refused", "pending", "completed", "completed"]), JSON.stringify(states));
    check("activity: refusal reason shown", (await pg.locator(".activity", { hasText: "body_invalid" }).count()) === 1);
    check("activity: oracle answer shown", (await pg.locator(".activity", { hasText: "answer: true (4 of 5 agreed)" }).count()) === 1);

    // Pay dialog: body and amount before any wallet prompt.
    const trigger = pg.getByRole("button", { name: "Research again" });
    await trigger.click();
    const dlg = pg.getByRole("dialog", { name: "Research this page" });
    await dlg.waitFor();
    await pg.waitForFunction(() => document.querySelector(".facts dd")?.textContent?.includes("0.5 IMD"));
    const amount = await dlg.locator(".facts dd").first().innerText();
    check("pay: amount read live from priceOf", amount === "0.5 IMD (500000000000000000)", amount);
    const shown = JSON.parse(await dlg.locator("pre.body").innerText());
    check("pay: full research body shown", shown.objective === objective && shown.tag.app === "rec-test-1" && shown.tag.kind === "add");
    check("pay: no wallet means Connect, no pay button", (await dlg.getByRole("button", { name: "Connect" }).count()) === 1 && (await dlg.getByRole("button", { name: /^Pay/ }).count()) === 0);
    await pg.screenshot({ path: `${out}/pay-390.png` });
    await pg.keyboard.press("Escape");
    check("pay: Escape closes and returns focus", (await dlg.count()) === 0 && (await pg.evaluate(() => document.activeElement?.textContent)) === "Research again");

    await pg.getByRole("button", { name: /Check: The docs price a job at 5 IMD/ }).click();
    const p2 = JSON.parse(await pg.locator("pre.body").innerText());
    check("P2: one click builds the control body", p2.tag.kind === "statement" && p2.question.includes("costs 5 IMD") && p2.panelSize === 5 && p2.quorum === 4 && p2.window.hours === 24);
    await pg.getByRole("button", { name: "Close" }).click();

    await pg.getByRole("button", { name: "Review the post check" }).click();
    check("P4: invalid fields announce errors and focus the first", (await pg.locator(".error").count()) >= 3 && (await pg.evaluate(() => document.activeElement?.id)) === "p4-url");
    await pg.fill("#p4-url", "https://x.com/imd/status/1234");
    await pg.fill("#p4-handle", "@imd");
    await pg.fill("#p4-text", "the swarm has 2,000 seats");
    await pg.getByRole("button", { name: "Review the post check" }).click();
    const p4 = JSON.parse(await pg.locator("pre.body").innerText());
    check("P4: claim body with the visitor's post", p4.tag.kind === "claim" && p4.question.startsWith("Does the post at https://x.com/imd/status/1234, published by the X account @imd, state that the swarm has 2,000 seats?"));
    await pg.keyboard.press("Escape");

    await pg.fill("#free-q", "Is the IMD token contract at 0xd34a99bc0f67ae1bbd63c660e6d0b0dd03e263b7 deployed on Ethereum?");
    await pg.selectOption("#free-kind", "proof");
    await pg.getByRole("button", { name: "Review your question" }).click();
    check("free text: warning shown in the dialog", (await pg.getByRole("dialog").locator(".warn").innerText()).includes("not refunded"));
    await pg.keyboard.press("Escape");

    await pg.getByRole("button", { name: "Connect" }).click();
    const sheet = pg.getByRole("dialog", { name: "Connect a wallet" });
    const rows = await sheet.locator(".row").allInnerTexts();
    check("connect: sheet lists wallets, never 'Injected'", rows.length >= 1 && !rows.some((r) => /Injected/.test(r)), JSON.stringify(rows));
    await pg.screenshot({ path: `${out}/connect-390.png` });
    await pg.keyboard.press("Escape");
    check("390: no console errors", errors.length === 0, errors.join(" | ").slice(0, 300));
    await ctx.close();
  }
  // Empty state, and a phone browser with no wallet.
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148" });
  await mock(ctx, { empty: true });
  const pg = await ctx.newPage();
  await pg.goto(base);
  await pg.getByRole("heading", { name: "No research yet" }).waitFor({ timeout: 20000 });
  check("empty: state with Research button", (await pg.locator(".empty").getByRole("button", { name: "Research this page" }).count()) === 1);
  check("empty: activity says no requests", (await pg.getByText("No requests yet.").count()) === 1);
  await pg.screenshot({ path: `${out}/empty-390.png` });
  await pg.getByRole("button", { name: "Connect" }).click();
  const rows = await pg.getByRole("dialog").locator(".row").allInnerTexts();
  check("phone: Open in rows then Coinbase Smart Wallet", JSON.stringify(rows) === JSON.stringify(["Open in MetaMask", "Open in Coinbase Wallet", "Open in Rabby", "Open in Phantom", "Coinbase Smart Wallet"]), JSON.stringify(rows));
  await pg.screenshot({ path: `${out}/connect-phone-390.png` });
  await ctx.close();
} finally {
  await browser.close();
  server.close();
}
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
