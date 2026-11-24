/** Revision 14: the reviewer's findings on payment, Key facts rows, speakers, accounts, history and line details. */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { Hex } from "viem";
import { sentHref } from "../src/App";
import { artifactUrl, priorText } from "../src/bodies";
import { accountsOf, keyFacts, speakersOf, withPatches } from "../src/keyfacts";
import { firstRecordedOf } from "../src/model";
import { parsePage, type Line } from "../src/page";
import { DECLINED, Payment, REVERTED, type PayDeps } from "../src/payFlow";
import { followAdmission, receiptStatus, waitForReceipt } from "../src/receipt";
import { whyLabel } from "../src/Record";
import { routeOf } from "../src/route";
import type { Activity } from "../src/useActivity";

const H = ("0x" + "ab".repeat(32)) as Hex;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
function deps(over: Partial<PayDeps> = {}, log: string[] = []): PayDeps {
  return {
    readPrice: async () => 5n,
    allowance: async () => 10n,
    approve: async () => {
      log.push("approve");
      return H;
    },
    request: async () => {
      log.push("request");
      return H;
    },
    receipt: async () => "success",
    running: () => false,
    ...over,
  };
}

describe("payment waits for its receipt and runs once (d21492e7, 1c4d99d2)", () => {
  it("a reverted request receipt is an error with the stated sentence, never sent", async () => {
    const out = await new Payment().pay(5n, deps({ receipt: async () => "reverted" }), () => undefined);
    expect(out).toEqual({ kind: "error", message: REVERTED });
    expect(REVERTED).toBe("The transaction reverted before IMD received the request.");
  });
  it("a successful receipt is sent, after the confirming step", async () => {
    const steps: string[] = [];
    const out = await new Payment().pay(5n, deps(), (s) => steps.push(s));
    expect(out).toMatchObject({ kind: "sent", hash: H, amount: 5n });
    expect(steps).toEqual(["checking", "sending", "confirming"]);
  });
  it("a double click during a slow price read sends one request", async () => {
    const log: string[] = [];
    const p = new Payment();
    const d = deps({ readPrice: () => sleep(40).then(() => 5n) }, log);
    const [a, b] = await Promise.all([p.pay(5n, d, () => undefined), p.pay(5n, d, () => undefined)]);
    expect(b).toBeNull();
    expect(a).toMatchObject({ kind: "sent" });
    expect(log).toEqual(["request"]);
  });
  it("stays busy while the wallet is open; a 4001 rejection ends it with the declined sentence", async () => {
    const p = new Payment();
    let reject: (e: unknown) => void = () => undefined;
    const run = p.pay(5n, deps({ request: () => new Promise<Hex>((_, rj) => (reject = rj)) }), () => undefined);
    await sleep(5);
    expect(p.busy).toBe(true); // the dialog's Escape and Close check this and do nothing
    reject(Object.assign(new Error("User rejected the request."), { code: 4001 }));
    expect(await run).toEqual({ kind: "error", message: DECLINED });
    expect(p.busy).toBe(false);
  });
  it("a changed price asks for a new review and clears the guard", async () => {
    const p = new Payment();
    expect(await p.pay(4n, deps(), () => undefined)).toEqual({ kind: "price", price: 5n });
    expect(p.busy).toBe(false);
  });
  it("the dialog keeps every close path behind the guard (source)", () => {
    const src = readFileSync("src/App.tsx", "utf8");
    expect(src).toContain("holdFocus(ref.current, () => closeRef.current())");
    expect(src).toMatch(/const close = \(\) => \{\s*if \(!payment\.current\.busy && !busy\) onClose\(\);/);
    // The tray is cleared and the pending state starts only after a sent outcome.
    expect(src.indexOf("ask.afterSent?.()")).toBeGreaterThan(src.indexOf('if (out.kind === "error")'));
  });
  it("receipts: status parsing and polling over several sources", async () => {
    expect([receiptStatus({ status: "0x1" }), receiptStatus({ status: "0x0" }), receiptStatus(null)]).toEqual(["success", "reverted", null]);
    let n = 0;
    const slow = async () => (++n < 3 ? null : { status: "0x0" });
    const broken = async () => {
      throw new Error("down");
    };
    expect(await waitForReceipt(H, [broken, slow], { interval: 1 })).toBe("reverted");
    expect(n).toBe(3);
  });
});

describe("the job link reaches the toast while it shows (8141f9e2)", () => {
  it("reads the admission at once and calls back as soon as the job id appears", async () => {
    const t0 = Date.now();
    let reads = 0;
    const got = await new Promise<{ id: string; ms: number }>((res) =>
      followAdmission(H, (id) => res({ id, ms: Date.now() - t0 }), { interval: 20, read: async () => (++reads < 3 ? { jobId: null, done: false } : { jobId: "fixture-job-50", done: true }) }),
    );
    expect(got.id).toBe("fixture-job-50");
    expect(reads).toBe(3);
    expect(got.ms).toBeLessThan(1000);
  });
  it("stops on cancel and on a terminal answer", async () => {
    let reads = 0;
    const stop = followAdmission(H, () => undefined, { interval: 5, read: async () => (reads++, { jobId: null, done: false }) });
    await sleep(30);
    stop();
    const at = reads;
    await sleep(30);
    expect(reads).toBe(at);
    let ended = 0;
    followAdmission(H, () => undefined, { interval: 5, read: async () => (ended++, { jobId: null, done: true }) });
    await sleep(30);
    expect(ended).toBe(1);
  });
  it("sentHref prefers the looked-up job id over the transaction", () => {
    expect(sentHref(H, [], {})).toContain("etherscan.io/tx/");
    expect(sentHref(H, [], { [H.toLowerCase()]: "fixture-job-50" })).toBe("https://explorer.imd.fun/jobs/fixture-job-50");
    const src = readFileSync("src/App.tsx", "utf8");
    expect(src).toContain("}, [lookFor]);"); // keyed by the hashes only, not restarted by unrelated renders
    expect(src).toContain("}, [waitingJob]);");
  });
});

const uni = parsePage(readFileSync("tests/fixtures/uniswap-page.json", "utf8"), "uniswap.org");
const src = (l: Line) => uni.sources.find((s) => s.id === l.sources[0])?.ref ?? "";
const uniRows = keyFacts(uni, (id) => uni.lines.find((l) => l.id === id), uni.lines, src).rows;
const row = (label: string) => uniRows.find((r) => r.label === label)!;

describe("every Key facts row of the result is kept (680b06fc)", () => {
  it("Uniswap keeps all 17 infobox rows", () => {
    expect(uni.infobox).toHaveLength(17);
    expect(uniRows.map((r) => r.label)).toEqual(expect.arrayContaining(["Governance delay", "Fee-release threshold"]));
  });
});

describe("speaker lists in by are read (b7c11fe5)", () => {
  it("a by list keeps every name in order, once", () => {
    const p = parsePage(JSON.stringify({ subject: { name: "X" }, lines: [{ id: "L1", section: "people", text: "t", kind: "claim", by: ["Ann", "Bo", "ann"], sources: [] }] }));
    expect(p.lines[0]!.by).toBe("Ann; Bo");
  });
  it("Uniswap's Contributors names Uniswap Labs; Founder names Hayden Adams", () => {
    const c = row("Contributors");
    expect(c.speakers).toEqual(["Project domain", "Uniswap Labs", "Blog"]);
    expect(c.badge?.text).toMatch(/\+2$/);
    expect(speakersOf(row("Founder or creator").lines, src)[0]).toBe("Hayden Adams");
  });
});

describe("Official accounts from older values link each account with its own tie (62dcc4ad)", () => {
  it("Uniswap: three X handles matched to the result's channels", () => {
    const a = row("Official accounts").accounts;
    expect(a.map((x) => [x.name, x.url])).toEqual([
      ["@Uniswap on X", "https://x.com/Uniswap"],
      ["@UniswapBuilders on X", "https://x.com/UniswapBuilders"],
      ["@UniswapAuctions on X", "https://x.com/UniswapAuctions"],
    ]);
    expect(a.every((x) => x.status?.text === "Not verified")).toBe(true); // tie none in the result
  });
  it("Zora: seven values with profile URLs and tie linked", () => {
    const linked = (label: string, url: string) => ({ label, url, tie: "linked" });
    const channels = [
      { label: "Website", url: "https://zora.co/", tie: "strong" },
      linked("X @zora", "https://x.com/zora"),
      linked("X @zoradevs", "https://x.com/zoradevs"),
      linked("X @zorasupport", "https://x.com/zorasupport"),
      linked("Farcaster zora", "https://warpcast.com/zora"),
      linked("Instagram", "https://www.instagram.com/our.zora/"),
      linked("TikTok", "https://www.tiktok.com/@zora"),
      linked("GitHub ourzora", "https://github.com/ourzora"),
    ];
    const values = ["X @zora (https://x.com/zora)", "X @zoradevs (https://x.com/zoradevs)", "X @zorasupport (https://x.com/zorasupport)", "Farcaster zora (https://warpcast.com/zora)", "Instagram our.zora (https://www.instagram.com/our.zora/)", "TikTok @zora (https://www.tiktok.com/@zora)", "GitHub ourzora (https://github.com/ourzora)"];
    const p = parsePage(JSON.stringify({ subject: { name: "Zora", channels }, infobox: [{ label: "Official accounts", value: "X, Farcaster, Instagram, TikTok, GitHub", values, lines: [] }], lines: [] }), "zora.co");
    const r = keyFacts(p, () => undefined, []).rows[0]!;
    expect(r.accounts).toHaveLength(7);
    expect(r.accounts.every((x) => x.url.startsWith("https://"))).toBe(true);
    expect(r.accounts.map((x) => x.name)).toContain("ourzora on GitHub");
    expect(r.accounts.map((x) => x.name)).toContain("@zora on X");
    expect(r.status?.text).toBe("Linked from own site");
    expect(r.accounts.every((x) => !/\(/.test(x.name))).toBe(true);
    expect(accountsOf(channels.map((c) => ({ ...c, tie: c.tie as "linked" })), "X: @zora, @zoradevs", "zora.co").map((x) => x.status?.text)).toEqual(["Linked from own site", "Linked from own site"]);
  });
});

describe("patch history keeps what the row displayed (8d364fc6)", () => {
  it("a listed row's earlier entry is its list, newest first", () => {
    const p = parsePage(JSON.stringify({ subject: { name: "IMD" }, infobox: [{ label: "Contributors", value: "Two founding engineers", values: ["Alice Rao", "Bob Lee"], lines: [] }], lines: [] }), "imd.fun");
    const rows = keyFacts(p, () => undefined, []).rows;
    const out = withPatches(rows, new Map([["contributors", [{ value: "Alice Rao", lines: [], payer: "0xa", at: 1_795_000_000 }, { value: "Carol Chen", lines: [], payer: "0xb", at: 1_795_100_000 }]]]), []);
    const h = out[0]!.history!;
    expect(h.map((x) => x.value)).toEqual(["Alice Rao", "Alice Rao; Bob Lee"]);
    expect(h[1]!.values).toEqual(["Alice Rao", "Bob Lee"]);
    expect(h.map((x) => x.by)).toEqual(["0xb", "0xa"]);
  });
});

describe("First recorded follows a line back through earlier jobs (e107c42b)", () => {
  it("C1 from F1:B1, B1 from F1:A1: the 19 Nov date", () => {
    const hash = (c: string) => c.repeat(64);
    const mk = (fileHash: string, doneTime: number, lines: { id: string; from: string[] }[], priorHash: string | null): Pick<Activity, "fileHash" | "doneTime" | "page" | "req"> => ({
      fileHash,
      doneTime,
      page: { lines: lines.map((l) => ({ id: l.id, from: l.from })) } as never,
      req: { bodyJson: { objective: priorHash ? `Rebuild. Start from the earlier results: ${priorText({ files: [artifactUrl(priorHash)], answers: [] })}. Fetch each file.` : "" } } as never,
    });
    const d19 = Date.UTC(2026, 10, 19) / 1000;
    const d20 = Date.UTC(2026, 10, 20) / 1000;
    const items = [mk(hash("1"), d19, [{ id: "A1", from: [] }], null), mk(hash("2"), d20, [{ id: "B1", from: ["F1:A1"] }], hash("1"))];
    expect(firstRecordedOf("F1:B1", [{ n: 1, hash: hash("2") }], items)).toBe(d19);
    // Earlier evidence missing: the nearest date found.
    expect(firstRecordedOf("F1:B1", [{ n: 1, hash: hash("2") }], items.slice(1))).toBe(d20);
    expect(firstRecordedOf("F9:Z1", [{ n: 1, hash: hash("2") }], items)).toBeNull();
  });
});

describe("line details and Related chips (8ea292e5, 116d7508)", () => {
  it("a downgraded statement gets one plain sentence; the technical note is not in it", () => {
    const t = whyLabel({ kind: "claim", marked: "statement", by: "Reporter", channel: null }, "IMD", "imd.fun", "https://reporter.example/beta");
    expect(t).toBe("Reporter made this claim on reporter.example, outside IMD's verified channels.");
    expect(t.split(/\.\s/)).toHaveLength(1);
    const rec = readFileSync("src/Record.tsx", "utf8");
    expect(rec).toContain("<dd>{checked}</dd>");
  });
  it("a related identifier with no route still offers Add this project, to the empty lookup", () => {
    expect(routeOf("#/add/")).toMatchObject({ subject: null, add: "" });
    const rec = readFileSync("src/Record.tsx", "utf8");
    expect(rec).not.toContain('<span className="rel-chip">');
    // Revision 21: only an entry with a domain of its own offers it.
    expect(rec).toMatch(/\{!c\.found && c\.addable && \(/);
  });
});
