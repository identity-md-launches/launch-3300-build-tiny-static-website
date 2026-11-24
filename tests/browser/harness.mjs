/**
 * Browser checks on the built export against the live record: serves dist/, opens it in Chromium and answers every
 * request the page makes from the public addresses it names (each read once and kept for the run), or from the
 * script's own answer. Run from the repository root, with Playwright and a Chromium installed outside it:
 *   IMD_PLAYWRIGHT=/path/to/playwright/index.mjs node tests/browser/read.mjs   (Home, Key facts, Activity, Record)
 *   IMD_PLAYWRIGHT=/path/to/playwright/index.mjs node tests/browser/pay.mjs    (prices, approval, stale cache; no real wallet)
 * Screenshots go to test/scratch/shots/.
 */
import { createServer } from "node:http";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { createHash } from "node:crypto";
import { extname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
export const { chromium } = await import(process.env.IMD_PLAYWRIGHT ? pathToFileURL(process.env.IMD_PLAYWRIGHT).href : "playwright");
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".png": "image/png", ".md": "text/markdown", ".txt": "text/plain" };
/** Answers are kept on disk for the run, so each address is read once. */
const C = await mkdtemp(join(tmpdir(), "swarmpedia-reads-")) + "/";
export async function serve(dir = "dist") {
  const root = resolve(dir);
  const s = createServer(async (req, res) => {
    const rel = decodeURIComponent(new URL(req.url, "http://x").pathname.slice(1)) || "index.html";
    try { res.writeHead(200, { "content-type": TYPES[extname(rel)] ?? "application/octet-stream" }).end(await readFile(join(root, rel))); } catch { res.writeHead(404).end(); }
  });
  await new Promise((r) => s.listen(0, "127.0.0.1", r));
  return { base: `http://127.0.0.1:${s.address().port}/`, close: () => s.close() };
}
const key = (x) => createHash("sha256").update(x).digest("hex");
async function cached(k, run) {
  const f = C + key(k);
  try { return JSON.parse(await readFile(f, "utf8")); } catch {}
  const v = await run();
  if (v.ok) await writeFile(f, JSON.stringify(v));
  return v;
}
const ins = new Map();
for (const p of JSON.parse(await readFile("src/instructions.published.json", "utf8"))) ins.set(p.file, await readFile("public/instructions/" + p.file));
/** opts.rpc(call) may return undefined (default) or a promise of {result}|{error}. */
export async function mock(ctx, opts = {}) {
  await ctx.route(/^https?:\/\/(?!127\.0\.0\.1)/, async (route) => {
    const req = route.request(); const url = new URL(req.url());
    const cors = { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "*" };
    if (req.method() === "OPTIONS") return route.fulfill({ status: 204, headers: cors });
    const pd = req.postData() ?? "";
    if (req.method() === "POST" && pd.includes("jsonrpc")) {
      const body = JSON.parse(pd); const list = Array.isArray(body) ? body : [body];
      const out = await Promise.all(list.map(async (c) => {
        const o = opts.rpc ? await opts.rpc(c) : undefined;
        if (o !== undefined) return { jsonrpc: "2.0", id: c.id, ...o };
        const r = await cached("rpc" + c.method + JSON.stringify(c.params), async () => {
          const x = await fetch(url.href, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: c.method, params: c.params }) }).then((r) => r.json()).catch((e) => ({ error: { code: -1, message: String(e) } }));
          return { ok: !x.error, body: x };
        });
        return { ...r.body, id: c.id };
      }));
      return route.fulfill({ status: 200, headers: { ...cors, "content-type": "application/json" }, body: JSON.stringify(Array.isArray(body) ? out : out[0]) });
    }
    if (opts.http) { const o = await opts.http(url, req); if (o) return route.fulfill({ ...o, headers: { ...cors, ...(o.headers ?? {}) } }); }
    const fn = url.searchParams.get("filename");
    if (fn && ins.has(fn)) return route.fulfill({ status: 200, headers: { ...cors, "content-type": "text/plain" }, body: ins.get(fn) });
    const r = await cached(req.method() + url.href, async () => {
      try { const x = await fetch(url.href); const b = Buffer.from(await x.arrayBuffer()); return { ok: x.ok, status: x.status, type: x.headers.get("content-type"), b64: b.toString("base64") }; } catch (e) { return { ok: false, status: 502, b64: "" }; }
    });
    return route.fulfill({ status: r.status, headers: { ...cors, "content-type": r.type ?? "" }, body: Buffer.from(r.b64, "base64") });
  });
}
export async function launch() { return chromium.launch({ args: ["--no-sandbox"] }); }
export const SUBJECTS = ["imd.fun", "zora.co", "imdusd.com", "ens.domains", "uniswap.org"];
