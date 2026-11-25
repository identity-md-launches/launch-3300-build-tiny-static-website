/** Review fixes to revision 28: lookups without record reads, rows as ready, current figures, status order, invites, questions, Tron, Docs. */
import { readdirSync, readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { addressRuns, chainOfAddress, chainTag } from "../src/addrDisplay";
import { artifactUrl, priorText } from "../src/bodies";
import { ACTIONS } from "../src/config";
import { withPublished } from "../src/digest";
import { isZoraSupply, rowFacts, EXAMPLE_FALLBACK } from "../src/Home";
import { accountsOf, inviteName, keyFacts, liveRowsFirst, type KeyRow } from "../src/keyfacts";
import { claimedContracts, isCurrent, isIndexed, leftOut, resultSig, subjectSummaries, type Digest } from "../src/model";
import { parseChanges, parsePage } from "../src/page";
import published from "../src/published.json";
import { questionsOf } from "../src/questions";
import { KeyValue } from "../src/Record";
import { figureOf, sortProjects } from "../src/sorting";
import { mergeItems, scannedActivity, type Activity } from "../src/useActivity";
import type { Completion, TaggedRequest } from "../src/chain";

const id = (n: number) => `0x${n.toString(16).padStart(64, "0")}` as `0x${string}`;
const request = (n: number, subject = "example.org", over: Partial<TaggedRequest> = {}): TaggedRequest => ({
  requestId: id(n), payer: "0x00000000000000000000000000000000000000aa", action: ACTIONS.research, body: "", bodyJson: null, kind: "add", title: "", subject, template: "", amount: 1n, blockNumber: BigInt(n), transactionHash: id(n + 1000), ...over,
});
const completion = (n: number, block = n + 1): Completion => ({ requestId: id(n), status: 0, resultHash: id(1), reason: "", uri: "", transactionHash: id(n + 2000), blockNumber: BigInt(block), logIndex: 0 });
const scan = (reqs: TaggedRequest[], done: Completion[] = []) => ({ requests: reqs, completions: new Map(done.map((c) => [c.requestId.toLowerCase(), c] as const)) });
const light = (n: number, subject: string, over: Partial<Activity> = {}): Activity => ({ ...scannedActivity(request(n, subject), completion(n)), notRead: null, filesRead: false, metaPending: false, time: n * 1000, doneTime: n * 1000 + 500, ...over });
const digest = (d: Partial<Digest> & { id: string; sig: string }): Digest => ({ type: "digest", v: 9, name: d.id, oneLine: "", counts: { all: 9, checks: 2, contradicted: 1 } as never, logoHash: null, changed: 1, hasPage: true, main: "", contracts: [], status: null, unfolded: 0, pageReq: null, failedReads: 0, logo: "none", example: null, open: 5, launched: null, ...d });

describe("rows are drawn from the scan, metadata merged as it arrives (d15d9c3c)", () => {
  const reqs = Array.from({ length: 35 }, (_, i) => request(i + 1, `p${i % 33}.org`));
  it("every subject has a row before any Intake entry is read", () => {
    const list = mergeItems(scan(reqs), new Map(), null);
    expect(list).toHaveLength(35);
    expect(subjectSummaries(list)).toHaveLength(33);
    expect(list.every((a) => a.metaPending)).toBe(true);
  });
  it("one held answer holds back only its own row's metadata", () => {
    const first = mergeItems(scan(reqs), new Map(), null);
    const got = new Map(reqs.slice(1).map((r) => [r.requestId, { ...scannedActivity(r, undefined), metaPending: false, time: 5 }] as const));
    const next = mergeItems(scan(reqs), got, first);
    expect(next.filter((a) => a.metaPending).map((a) => a.req.requestId)).toEqual([id(1)]);
    expect(mergeItems(scan(reqs), got, next)).toBe(next);
  });
  it("the open subject stays as it was until all its results are read", () => {
    const a = { ...light(1, "example.org"), filesRead: true };
    const s = scan([request(2), request(1)], [completion(1), completion(2)]);
    expect(mergeItems(s, new Map(), [a], "example.org", false)).toEqual([a]);
    const got = new Map([1, 2].map((n) => [id(n), { ...light(n, "example.org"), filesRead: true }] as const));
    expect(mergeItems(s, got, [a], "example.org", true)).toHaveLength(2);
  });
  it("a row whose time is not read yet is placed by its block and never says Changed not yet", () => {
    const old = light(100, "old.org", { time: 1_700_000_000_000, doneTime: 1_700_000_012_000 });
    const fresh = scannedActivity(request(900, "fresh.org"), undefined);
    const rows = subjectSummaries([old, fresh]);
    expect(rows.map((r) => r.id)).toEqual(["fresh.org", "old.org"]);
    expect(rows[0]).toMatchObject({ waiting: true, changed: null });
    expect(sortProjects(rows, "changed", new Map()).map((r) => r.id)).toEqual(["fresh.org", "old.org"]);
  });
  it("totals stay approximate while rows fill in", () => {
    expect(readFileSync("src/Home.tsx", "utf8")).toContain("const countsReady = !pendingReads && !filling && !unknown");
  });
});

describe("a contract lookup reads no record (20b90a54)", () => {
  const A = "0x1234567890123456789012345678901234567890";
  it("no code path on Home reads the unopened projects", () => {
    for (const f of ["src/Home.tsx", "src/App.tsx", "src/digest.ts"]) expect(readFileSync(f, "utf8")).not.toMatch(/readAll|wantAll/);
    expect(readFileSync("src/Home.tsx", "utf8")).toContain('if (parsed.kind === "address" && unindexed.length) setUnsure(');
  });
  it("a project's contracts are known from its digest's newest page only", () => {
    const list = [light(1, "a.org")];
    const d = digest({ id: "a.org", sig: resultSig(list), pageReq: id(1) });
    expect(isIndexed(undefined, list)).toBe(false);
    expect(isIndexed(d, list)).toBe(true);
    expect(isIndexed(d, [...list, light(2, "a.org")])).toBe(false);
    expect(isIndexed(d, [...list, { ...light(2, "a.org"), req: request(2, "a.org", { kind: "changes" }) }])).toBe(true);
    expect(subjectSummaries(list)[0]!.indexed).toBe(false);
  });
  it("a contract the project's own request names is found from the Intake alone", () => {
    const a = light(1, "a.org");
    a.req = request(1, "a.org", { bodyJson: { objective: `Research the project at a.org, whose main contract is ${A} on chain 8453. ` } });
    expect(claimedContracts("a.org", [a])).toEqual([{ address: A, chainId: 8453 }]);
    expect(subjectSummaries([a])[0]!.claimed).toEqual([{ address: A, chainId: 8453 }]);
  });
  it("the published records fill a first visit, only for a history that holds what they were taken from", () => {
    const list = [light(1, "a.org")];
    const p = digest({ id: "a.org", sig: id(1), name: "A" });
    expect(withPublished(new Map(), list, [p]).get("a.org")!.name).toBe("A");
    expect(withPublished(new Map(), [light(2, "a.org")], [p]).size).toBe(0);
    const mine = digest({ id: "a.org", sig: id(1), name: "mine" });
    expect(withPublished(new Map([["a.org", mine]]), list, [p]).get("a.org")!.name).toBe("mine");
    expect((published as unknown as Digest[]).length).toBe(7);
    for (const d of published as unknown as Digest[]) expect([d.v, d.hasPage, d.failedReads, d.sig.length > 0]).toEqual([9, true, 0, true]);
  });
  it("a result a full read left out never makes a digest look old", () => {
    const list = [light(1, "a.org"), light(2, "a.org")];
    const out = leftOut(list, [list[0]!]);
    expect(out).toEqual([id(2)]);
    expect(isCurrent(digest({ id: "a.org", sig: id(1) }), list)).toBe(false);
    expect(isCurrent(digest({ id: "a.org", sig: id(1), uncounted: out }), list)).toBe(true);
  });
});

describe("sorting by current figures (933946fb)", () => {
  it("a count taken before newer results awaits an update and goes after known counts", () => {
    const items = [light(1, "stale.org"), light(2, "stale.org"), light(3, "known.org"), light(4, "cold.org")];
    const ds = new Map([["stale.org", digest({ id: "stale.org", sig: id(1), open: 5 })], ["known.org", digest({ id: "known.org", sig: id(3), open: 2 })]]);
    const facts = rowFacts(items, ds);
    const rows = sortProjects(subjectSummaries(items, ds), "open", facts);
    expect(rows[0]!.id).toBe("known.org");
    const fig = (x: string, k: "open" | "launched" | "proven") => figureOf(rows.find((r) => r.id === x)!, k, facts.get(x));
    expect(fig("known.org", "open")).toBe("2 open questions");
    expect(fig("stale.org", "open")).toBe("Count awaiting update");
    expect(fig("cold.org", "open")).toBe("Count awaiting update");
    expect(fig("stale.org", "proven")).toBe("Count awaiting update");
    // A page without a Launched fact is known to have none; a date never read here is unknown.
    expect(fig("known.org", "launched")).toBe("No launch date");
    expect(fig("cold.org", "launched")).toBe("Launch date awaiting update");
    expect(sortProjects(rows, "launched", facts).map((r) => r.id)[0]).toBe("known.org");
  });
});

const job = (n: number, kind: "add" | "changes", sent: number, done: number, body: { page?: string; changes?: string; hash?: string; prior?: string[] }): Activity =>
  ({
    req: { requestId: id(n), subject: "example.org", action: ACTIONS.research, kind, blockNumber: BigInt(sent), bodyJson: body.prior ? { objective: `x. Start from the earlier results: ${priorText({ files: body.prior.map(artifactUrl), answers: [] })}. Fetch each file. y` } : null },
    completion: { blockNumber: BigInt(done), logIndex: 0 }, state: "completed", jobId: `job-${n}`, doneTime: done * 1000, time: sent * 1000, notRead: null, rejected: null, fileHash: body.hash ?? null,
    page: body.page ? parsePage(body.page, "example.org") : null, changes: body.changes ? parseChanges(body.changes) : null,
  }) as unknown as Activity;
const Q = "Does the service extend to Europe?";
const pageWith = (...qs: string[]) => JSON.stringify({ subject: { name: "Ex" }, lines: [], open_questions: qs });
const act = (op: "close" | "reword", target = Q, text = "") => JSON.stringify({ found: true, items: [], lines: [{ id: "N1", text: "It does.", kind: "statement" }], questions: [{ target, op, text, lines: ["N1"] }] });
const [H1, H2, H3] = ["a", "b", "c"].map((c) => c.repeat(64)) as [string, string, string];

describe("a rebuild never reopens an answer it was not given (86b44770)", () => {
  const first = job(1, "add", 0, 1, { page: pageWith(Q), hash: H1 });
  const answer = job(3, "changes", 1, 3, { changes: act("close"), hash: H2 });
  it("a rebuild sent before the answer completed", () => {
    for (const prior of [undefined, [H1]]) {
      const late = job(4, "add", 2, 4, { page: pageWith(Q), hash: H3, ...(prior ? { prior } : {}) });
      const s = questionsOf([first, answer, late], late);
      expect(s.open).toEqual([]);
      expect(s.all.get("job-1:q1")).toMatchObject({ state: "answered", closedAt: 3000, lines: ["N1"], by: answer });
      expect(s.byJob.get(answer.req.requestId)!.map((x) => x.op)).toEqual(["close"]);
    }
  });
  it("a rebuild sent after it that left its file out, and one rebuilt from that", () => {
    const out = job(5, "add", 4, 5, { page: pageWith(Q), hash: H3, prior: [H1] });
    const next = job(6, "add", 6, 7, { page: pageWith(Q), hash: "d".repeat(64), prior: [H3] });
    expect(questionsOf([first, answer, out, next], next).open).toEqual([]);
  });
  it("a rebuild that received the answer and still asks opens it again", () => {
    const given = job(5, "add", 4, 5, { page: pageWith(Q), hash: H3, prior: [H1, H2] });
    expect(questionsOf([first, answer, given], given).open.map((q) => q.id)).toEqual(["job-1:q1"]);
    const child = job(6, "add", 6, 7, { page: pageWith(Q), hash: "d".repeat(64), prior: [H3] });
    expect(questionsOf([first, answer, given, child], child).open.map((q) => q.id)).toEqual(["job-1:q1"]);
  });
  it("keeps a reword it was not given", () => {
    const part = job(3, "changes", 1, 3, { changes: act("reword", Q, "Does it extend to Spain?"), hash: H2 });
    const late = job(4, "add", 2, 4, { page: pageWith(Q), hash: H3, prior: [H1] });
    expect(questionsOf([first, part, late], late).open.map((q) => [q.id, q.text])).toEqual([["job-1:q1", "Does it extend to Spain?"]]);
  });
});

const page = (infobox: unknown[], contracts: unknown[] = []) => parsePage(JSON.stringify({ subject: { name: "Ex", channels: [], contracts }, infobox, lines: [] }), "example.org");
const rowsOf = (infobox: unknown[], contracts: unknown[] = []) => {
  const p = page(infobox, contracts);
  return keyFacts(p, () => undefined, p.lines).rows;
};
const html = (r: KeyRow, chain = "") => renderToStaticMarkup(createElement(KeyValue, { row: r, chain }));

describe("test and past rows (6b5ff2b5)", () => {
  it("Test networks comes after live rows, every entry tagged", () => {
    const rows = rowsOf([
      { label: "Test networks", values: [{ name: "Hoodi", text: "Operator trial", status: "test" }, { name: "Preview sandbox", text: "Closed beta" }] },
      { label: "Products", values: [{ name: "Current dashboard", text: "Live" }, { name: "Old app", text: "First version", status: "past" }] },
      { label: "Run by", value: "Example Foundation" },
    ]);
    expect(rows.map((r) => r.label)).toEqual(["Products", "Run by", "Test networks"]);
    expect(html(rows[2]!).match(/class="live-tag">test network</g)).toHaveLength(2);
    expect(html(rows[2]!).indexOf("Hoodi")).toBeLessThan(html(rows[2]!).indexOf("Preview sandbox"));
    expect(html(rows[0]!).match(/live-tag/g)).toHaveLength(1);
  });
  it("carries declared statuses through accounts, chains, tokens and lists", () => {
    const rows = rowsOf([
      { label: "Official accounts", values: [{ name: "Old", text: "", url: "https://x.com/old", status: "past" }, { name: "New", text: "", url: "https://x.com/new" }] },
      { label: "Products", values: [{ name: "Gone", text: "", status: "past" }] },
      { label: "Run by", value: "Example Foundation" },
    ]);
    expect(rows.map((r) => r.label)).toEqual(["Official accounts", "Run by", "Products"]);
    const h = html(rows[0]!);
    expect(h.indexOf("@new on X")).toBeLessThan(h.indexOf("@old on X"));
    expect(h).toContain('class="live-tag">past<');
    const blank = { url: "", note: "", lines: [], channel: null, badge: null, status: null, accounts: [], tokens: [], values: [] };
    const chains = { ...blank, label: "Chains", value: "", items: [{ name: "Base", text: "", url: "", address: "", chain: "", explorer: "", status: "past" }, { name: "Ethereum", text: "", url: "", address: "", chain: "", explorer: "" }] } as KeyRow;
    expect(html(chains)).toMatch(/Ethereum<\/li><li>Base<span class="live-tag">past/);
  });
  it("a past contract's own row goes last, before the row limit applies", () => {
    const addr = "0x1111111111111111111111111111111111111111";
    const r = (label: string, value: string) => ({ label, value, url: "", note: "", lines: [], channel: null, badge: null, status: null, accounts: [], tokens: [], values: [] }) as KeyRow;
    expect(liveRowsFirst([r("Test networks", "Hoodi"), r("Vault", addr), r("Size", "3")], (a) => (a === addr ? "past" : null)).map((x) => x.label)).toEqual(["Size", "Test networks", "Vault"]);
  });
});

describe("invite names (3f858d91)", () => {
  it("shows the supplied server or group name, else the fallback label", () => {
    const r = rowsOf([{ label: "Official accounts", values: [{ name: "Example Builders", text: "", url: "https://discord.gg/AbC123" }, { name: "Example Forum", text: "", url: "https://t.me/+D3f456" }, { name: "xyz789", text: "", url: "https://discord.gg/xyz789" }] }])[0]!;
    const names = [...html(r).matchAll(/<strong>([^<]*)<\/strong>/g)].map((m) => m[1]);
    expect(names).toEqual(["Example Builders", "Example Forum", "Discord server"]);
    expect(accountsOf([], "https://t.me/+D3f456", "example.org")[0]!.name).toBe("Telegram group");
  });
  it("a code, link or bare platform word is not a name", () => {
    for (const n of ["", "AbC123", "discord.gg/AbC123", "https://discord.com/invite/AbC123", "AbC123 on Discord", "Discord", "Discord invite", "Discord: AbC123", "Join our Discord"]) expect(inviteName(n, "https://discord.com/invite/AbC123")).toBe("Discord server");
    for (const n of ["", "+D3f456", "@+D3f456", "t.me/joinchat/D3f456"]) expect(inviteName(n, "https://t.me/+D3f456")).toBe("Telegram group");
    expect(inviteName("Example", "https://t.me/example")).toBeNull();
    expect(inviteName("Discord Builders", "https://discord.gg/AbC123")).toBe("Discord Builders");
  });
});

describe("a non-0x address on its own chain (2f1e8ee8)", () => {
  const T = "TXLAQ63Xg1NAzckPwKHvzw7CSEmLMEqcdj";
  const S = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
  it("USDT on Tron, in a project on Ethereum", () => {
    const r = rowsOf([{ label: "Integrations", value: `USDT at ${T} on Tron` }], [{ address: "0x1111111111111111111111111111111111111111", chain: "Ethereum", role: "token", main: true }])[0]!;
    const h = html(r, "Ethereum");
    expect(h).toContain(`href="https://tronscan.org/#/address/${T}"`);
    expect(h).toContain('class="tok-chain">Tron<');
    expect(h).not.toContain("Ethereum");
    expect(h).not.toContain("on Tron<");
    expect(h).toContain("TXLA…qcdj");
    expect(h).toContain(`Copy address ${T}`);
  });
  it("an EVM fallback never applies to it, and a word is not a chain", () => {
    expect(addressRuns(`${S} on Solana devnet`, "Ethereum")[0]).toMatchObject({ chain: "Solana devnet" });
    expect(addressRuns(`${S} (Solana)`, "Ethereum")).toEqual([{ kind: "address", address: S, chain: "Solana" }]);
    expect(html({ ...rowsOf([{ label: "Mint", value: S }])[0]! }, "Ethereum")).toContain(`https://solscan.io/account/${S}`);
    expect(chainOfAddress(S, "", "Solana")).toBe("Solana");
    expect(chainOfAddress(T, "", "Ethereum")).toBe("");
    expect(addressRuns(`${T} near the top`, "")[1]).toEqual({ kind: "text", text: " near the top" });
    expect(addressRuns(`${T} tronic`, "")[1]).toEqual({ kind: "text", text: " tronic" });
    expect([chainTag("tron"), chainTag("Solana mainnet"), chainTag("8453")]).toEqual(["Tron", "Solana", "Base"]);
  });
});

describe("Docs replay steps follow the fact shown (c06c6502)", () => {
  it("only ZORA's total supply gets the totalSupply() steps", () => {
    const e = { from: "zora.co", name: "Zora", logoHash: null, statement: "s", claim: "c" };
    expect(isZoraSupply({ ...EXAMPLE_FALLBACK, from: null, name: null, logoHash: null })).toBe(true);
    expect(isZoraSupply({ ...e, proof: "The ZORA token on Base reports a total supply of 10 billion ZORA." })).toBe(true);
    expect(isZoraSupply({ ...e, proof: "The Zora Creator Coin factory deployed in May 2025." })).toBe(false);
  });
});

describe("file names (0d6b776d)", () => {
  it("no two modules share a name on a case-insensitive filesystem", () => {
    const base = readdirSync("src").filter((f) => /\.tsx?$/.test(f)).map((f) => f.replace(/\.tsx?$/, "").toLowerCase());
    expect(new Set(base).size).toBe(base.length);
  });
});
