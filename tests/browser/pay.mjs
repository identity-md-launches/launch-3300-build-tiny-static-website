/** Paying checks with a stand-in wallet announced by EIP-6963: nothing is sent anywhere. See harness.mjs. */
import { mkdir } from "node:fs/promises";
import { launch, mock, serve } from "./harness.mjs";
await mkdir("test/scratch/shots", { recursive: true });
const s = await serve(); const b = await launch();
const ok = (n, v, d = "") => console.log(v ? "PASS" : "FAIL", n, d);
const E18 = 10n ** 18n; const hex = (n) => "0x" + n.toString(16).padStart(64, "0");
const ADDR = "0x1111111111111111111111111111111111111111";
const mk = async (w, st) => {
  const ctx = await b.newContext({ viewport: { width: w, height: 844 } });
  await mock(ctx, { rpc: async (c) => {
    if (st.blockDelay && c.method === "eth_blockNumber") { await new Promise((r) => setTimeout(r, st.blockDelay)); return undefined; }
    const d = c.method === "eth_call" ? c.params[0].data ?? "" : "";
    if (d.startsWith("0x51102885")) { st.log.push(`price ${st.price}`); if (st.priceFail) return { error: { code: -1, message: "x" } }; if (st.priceDelay) await new Promise((r) => setTimeout(r, st.priceDelay)); return { result: hex(st.price) }; }
    if (d.startsWith("0xdd62ed3e")) return { result: hex(st.allow) };
    if (d.startsWith("0x70a08231")) return { result: hex(50n * E18) };
    if (c.method === "eth_getTransactionReceipt") { const h = c.params[0]; if (h === "0x" + "a1".repeat(32)) { if (st.afterApprove) { st.price = st.afterApprove; st.afterApprove = null; } st.allow = st.approved; } return { result: { transactionHash: h, status: "0x1", blockNumber: "0x1", blockHash: hex(1n), transactionIndex: "0x0", from: ADDR, to: ADDR, cumulativeGasUsed: "0x1", gasUsed: "0x1", logs: [], logsBloom: "0x" + "0".repeat(512), type: "0x2", effectiveGasPrice: "0x1", contractAddress: null } }; }
    return undefined;
  } });
  const p = await ctx.newPage(); p.on("pageerror", (e) => console.log("ERR", e.message));
  await p.exposeFunction("__tx", (t) => { st.log.push(t.data.startsWith("0x095ea7b3") ? `approve ${BigInt("0x" + t.data.slice(-64))}` : `request ${BigInt("0x" + t.data.slice(2 + 8 + 64 * 5, 2 + 8 + 64 * 6))}`); if (t.data.startsWith("0x095ea7b3")) { st.approved = BigInt("0x" + t.data.slice(-64)); return "0x" + "a1".repeat(32); } return "0x" + "b2".repeat(32); });
  await p.addInitScript((ADDR) => {
    const provider = { on() {}, removeListener() {}, request: async ({ method, params }) => {
      if (method === "eth_requestAccounts" || method === "eth_accounts") return [ADDR];
      if (method === "eth_chainId") return "0x1"; if (method === "net_version") return "1";
      if (method === "wallet_requestPermissions" || method === "wallet_getPermissions") return [{ parentCapability: "eth_accounts", caveats: [{ type: "restrictReturnedAccounts", value: [ADDR] }] }];
      if (method === "eth_sendTransaction") return window.__tx(params[0]);
      if (method === "eth_estimateGas") return "0x5208"; if (method === "eth_gasPrice") return "0x1";
      const r = await fetch("https://gateway.tenderly.co/public/mainnet", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }) }); const j = await r.json(); if (j.error) throw j.error; return j.result; } };
    const ann = () => dispatchEvent(new CustomEvent("eip6963:announceProvider", { detail: Object.freeze({ info: { uuid: "11111111-1111-4111-8111-111111111111", name: "Fake Wallet", icon: "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg'/>", rdns: "x.fake" }, provider }) }));
    addEventListener("eip6963:requestProvider", ann); ann();
  }, ADDR);
  return p;
};
const ready = (p) => p.waitForFunction(() => /proofs/.test(document.querySelector(".totals-line")?.textContent ?? ""), null, { timeout: 150000 });
const offer = async (p, q, leads) => { await p.fill("#lookup", q); await p.click(".btn-lookup"); await p.waitForSelector(".offer"); if (leads) await p.fill("#offer-leads", leads); };
// 1. slow, changed price: no dialog until it is read
{ const st = { price: E18 / 2n, allow: 0n, log: [] }; const p = await mk(390, st); await p.goto(s.base); await ready(p);
  await offer(p, "example.com", "https://example.com/release.\nhttps://example.com/reader's-guide"); ok("leads accepted", (await p.locator(".offer .error").count()) === 0);
  st.price = 750000000000000000n; st.priceDelay = 1500; await p.getByRole("button", { name: "Add this project" }).click(); await p.waitForTimeout(700);
  ok("no dialog while price loads", (await p.locator("[role=dialog]").count()) === 0, await p.locator(".toast").innerText());
  await p.waitForSelector("[role=dialog]", { timeout: 30000 }); const t = await p.locator("[role=dialog]").innerText(); ok("dialog opens with 0.75", /0\.75 IMD/.test(t) && !/Reading price/.test(t), t.replace(/\n/g, " | ").slice(0, 420));
  await p.screenshot({ path: "test/scratch/shots/pay.png" });
  await p.locator("[role=dialog] details summary").first().click(); ok("leads in objective", /Leads to read first: https:\/\/example\.com\/release\., https:\/\/example\.com\/reader's-guide\. Channels/.test(await p.locator("[role=dialog] pre.body").innerText()));
  // 2. connect, approve; the price moves again on inclusion
  st.priceDelay = 0; await p.locator("[role=dialog]").getByRole("button", { name: /Connect/ }).click(); await p.waitForTimeout(1500); await p.getByRole("button", { name: /Fake Wallet/ }).first().click(); await p.waitForTimeout(1500);
  for (let i = 0; i < 2; i++) { const pay = p.locator("[role=dialog]").getByRole("button", { name: /Approve and pay|^Pay/ }); if (await pay.count()) break; await p.waitForTimeout(1500); }
  st.log.length = 0; st.afterApprove = E18; const pay = p.locator("[role=dialog]").getByRole("button", { name: /Approve and pay|^Pay/ }); console.log("button:", await pay.innerText()); await pay.click(); await p.waitForFunction(() => /The price changed to/.test(document.querySelector("[role=dialog] .note")?.textContent ?? ""), null, { timeout: 30000 }).catch(() => {});
  console.log("log:", st.log.join(" → ")); ok("review again, nothing sent", !st.log.some((x) => x.startsWith("request")), (await p.locator("[role=dialog]").innerText()).replace(/\n/g, " | ").slice(-200));
  const again = p.locator("[role=dialog]").getByRole("button", { name: /Approve and pay|^Pay/ }); console.log("button:", await again.innerText()); st.log.length = 0; await again.click(); await p.waitForSelector(".send-bar", { timeout: 30000 }); console.log("log:", st.log.join(" → ")); ok("sent at the new price; dialog closed", st.log.at(-1) === `request ${E18}` && (await p.locator("[role=dialog]").count()) === 0, await p.locator(".send-bar").innerText());
  await p.waitForTimeout(1500); console.log("bar:", (await p.locator(".send-bar").innerText()).replace(/\n/g, " "));
  for (const w of [320, 360, 390, 416, 480, 560]) { await p.setViewportSize({ width: w, height: 844 }); ok(`connected header ${w}`, (await p.evaluate(() => document.documentElement.scrollWidth)) <= w && (await p.evaluate(() => Math.max(...[...document.querySelectorAll(".top-row > *")].map((x) => x.getBoundingClientRect().right)))) <= w); }
  await p.setViewportSize({ width: 390, height: 844 }); await p.screenshot({ path: "test/scratch/shots/sent.png" });
  // 3. price failure opens nothing
  await p.goto(s.base + "#/"); await p.waitForTimeout(500); st.priceFail = true; st.log.length = 0; await p.goto(s.base + "#/s/imd.fun/contribute"); await p.waitForSelector("#suggest-changes", { timeout: 60000 }); await p.waitForTimeout(3000);
  await p.locator("#suggest-changes textarea").first().fill("The fee is 0.3% and not 1% as written."); await p.locator("#suggest-changes textarea").nth(1).fill("https://example.com/reader's-guide"); const add = p.getByRole("button", { name: "Add to my changes" }); ok("apostrophe link accepted", await add.isEnabled()); await add.click(); await p.getByRole("button", { name: "Review and submit" }).click(); await p.getByRole("button", { name: "Submit", exact: true }).click(); await p.waitForSelector(".toast-error", { timeout: 60000 }); ok("no dialog without a price", (await p.locator("#pay-title").count()) === 0, await p.locator(".toast-error").innerText());
  st.priceFail = false; st.price = E18 / 4n; await p.locator(".toast-error").getByRole("button", { name: "Try again" }).click(); await p.waitForSelector("#pay-title", { timeout: 30000 }); ok("changes dialog price", /0\.25 IMD/.test(await p.locator("[role=dialog]").innerText()));
  await p.context().close(); }
// 4. stale cache
{ const st = { price: E18 / 2n, allow: 0n, log: [] }; const p = await mk(390, st); await p.goto(s.base + "agents.md"); 
  await p.goto(s.base); await ready(p);
  await p.evaluate(() => new Promise((res, rej) => { const o = indexedDB.open("imd-record"); o.onsuccess = () => { const t = o.result.transaction("scan", "readwrite"); const st = t.objectStore("scan"); const g = st.get("intake"); g.onsuccess = () => { st.put({ ...g.result, lastBlock: "26445600", requests: [], completions: [] }, "intake"); }; t.oncomplete = res; t.onerror = rej; }; }));
  st.blockDelay = 6000; await p.reload(); await p.waitForTimeout(1200); await p.fill("#lookup", "imd.fun"); await p.click(".btn-lookup"); await p.waitForTimeout(600);
  ok("stale: no offer while the scan is pending", (await p.locator(".offer").count()) === 0 && (await p.locator("[role=dialog]").count()) === 0, await p.locator(".lookup-msg").innerText());
  await p.waitForFunction(() => location.hash.includes("imd.fun"), null, { timeout: 120000 }); ok("stale: opens the page once settled", true, await p.evaluate(() => location.hash)); await p.context().close(); }
await b.close(); s.close();
