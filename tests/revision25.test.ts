/** Review fixes to revision 24: the price before the dialog, the fresh scan, request kinds, links, amounts, sources. */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { exactAmount, wholeAmount } from "../src/amounts";
import { chainEntries, chainText } from "../src/addrDisplay";
import { leadsText, planLeads, readLeads, rebuildBody } from "../src/bodies";
import { disputedCount, disputesOf } from "../src/changeResult";
import { changesBody, itemsText, noTarget, parseItemsText, planLinks, type Change } from "../src/changes";
import { readItems, shapeOf } from "../src/counts";
import { amountsIn, exampleOf } from "../src/example";
import { pickExample, EXAMPLE_FALLBACK } from "../src/Home";
import { itemEntries, mainContractName, sharedChain, valueEntries } from "../src/keyfacts";
import { Payment } from "../src/payFlow";
import { sourceGroups } from "../src/Record";
import { CHANGES, REQUEST_KINDS, resultFileOf, resultNamesOf } from "../src/requests";
import { askOf, prepareAsk, type Ask } from "../src/requests/ask";
import { refFromInput, type SubjectRef } from "../src/subject";
import { planChanges } from "../src/Suggest";
import { resultNameOf } from "../src/useActivity";
import { standing } from "../src/ActivityList";
import { STANDING_WORDS } from "../src/model";

const ref: SubjectRef = refFromInput({ domain: "example.com", address: "", chain: "" });
const none = { files: [], answers: [] };

describe("the price (6751285f)", () => {
  const ask = { title: "t", action: "a", kind: "add", kindId: "rebuild", body: {} } as Ask;
  it("is read before a dialog opens, and no dialog opens without it", async () => {
    let read = 0;
    const deps = { instructionsOk: async () => true, price: async () => (read++, 750n), fresh: async () => ({ finished: false, running: false }) };
    expect(await prepareAsk(ask, deps)).toEqual({ kind: "open", price: 750n });
    expect(read).toBe(1);
    expect(await prepareAsk(ask, { ...deps, price: async () => { throw new Error("rpc"); } })).toEqual({ kind: "price" });
    expect(await prepareAsk(ask, { ...deps, instructionsOk: async () => false })).toEqual({ kind: "instructions" });
  });
  it("is read again after the approval: a changed one returns to review and sends nothing", async () => {
    let price = 500n;
    const log: string[] = [];
    const out = await new Payment().pay(500n, {
      readPrice: async () => (log.push(`read ${price}`), price),
      allowance: async () => 0n,
      approve: async (p) => (log.push(`approve ${p}`), "0x1"),
      request: async (p) => (log.push(`request ${p}`), "0x2"),
      receipt: async () => ((price = 750n), "success"),
      running: () => false,
    }, () => undefined);
    expect(out).toEqual({ kind: "price", price: 750n, approved: 500n });
    expect(log).toEqual(["read 500", "approve 500", "read 750"]);
  });
});

describe("a first page is checked against a fresh scan (61494ef6)", () => {
  const ask = { title: "t", subject: "imd.fun", action: "a", kind: "add", kindId: "first-page", body: {} } as Ask;
  const deps = { instructionsOk: async () => true, price: async () => 1n };
  it("opens nothing when the page job finished, is running, or the chain was not read", async () => {
    expect(await prepareAsk(ask, { ...deps, fresh: async () => ({ finished: true, running: false }) })).toEqual({ kind: "exists" });
    expect(await prepareAsk(ask, { ...deps, fresh: async () => ({ finished: false, running: true }) })).toEqual({ kind: "running" });
    expect(await prepareAsk(ask, { ...deps, fresh: async () => null })).toEqual({ kind: "chain" });
    expect(await prepareAsk(ask, { ...deps, fresh: async () => ({ finished: false, running: false }) })).toEqual({ kind: "open", price: 1n });
  });
  it("Home holds an unmatched lookup while the list comes from the cache", () => {
    const src = readFileSync("src/Home.tsx", "utf8");
    expect(src).toContain("const pendingScan = items === null || !!cached;");
    expect(src).toContain("if (pendingScan || pendingReads) {");
  });
});

describe("request kinds (45506add)", () => {
  it("the tray builds its body and reads its price through the changes kind", async () => {
    const change: Change = { id: "1", type: "note", target: noTarget(), note: "The fee is 0.3% not 1%.", links: [] };
    const rec = { pageHash: null, after: [], scope: { page: null, after: [] }, results: [], answers: [], channels: [], promptChannels: { list: [], more: 0 }, subject: ref } as never;
    const was = { body: CHANGES.body, price: CHANGES.price };
    try {
      CHANGES.body = () => ({ objective: "from the kind" });
      CHANGES.price = async () => 750n;
      expect(planChanges(rec, [change], new Map()).body).toEqual({ objective: "from the kind" });
      expect(await askOf(CHANGES, {}, { title: "t" }).price!()).toBe(750n);
    } finally {
      CHANGES.body = was.body;
      CHANGES.price = was.price;
    }
    expect(planChanges(rec, [change], new Map()).body).toEqual(changesBody([change], none, [], ref, () => "", 0));
    const src = readFileSync("src/Suggest.tsx", "utf8");
    expect(src).not.toContain("ACTIONS.");
    expect(src).not.toMatch(/kind: "changes"/);
  });
  it("result files come from the registered kinds, older tag kinds keep theirs", () => {
    expect(REQUEST_KINDS.map((k) => resultFileOf(k.tagKind))).toEqual(["page", "page", "changes"]);
    expect([resultFileOf("source"), resultFileOf("edit"), resultFileOf("nothing")]).toEqual(["lines", "edit", null]);
    expect(resultNamesOf("add")).toEqual(["page", "logo"]);
    expect(resultNameOf({ action: CHANGES.action, kind: "changes" })).toBe("changes");
    expect(resultNameOf({ action: "oracle.request@oracle-1", kind: "proof" })).toBeNull();
  });
});

describe("any https link (7e1a2c45)", () => {
  const shape = (objective: string) => shapeOf({ subject: "example.com", kind: "add", action: "job.open@job-1", bodyJson: { tag: { app: "rec-test-1", kind: "add", subject: "example.com" }, objective } } as never);
  const body = (leads: string[]) => rebuildBody(none, ref, [], 0, { leads }).objective;
  it("apostrophes, closing full stops and commas, in both fields and in the job check", () => {
    const odd = ["https://example.com/reader's-guide", "https://example.com/release.", "https://example.com/a,", "https://example.com/(x);y", "https://example.com/b"];
    expect(planLinks(odd.join("\n")).links).toEqual(odd);
    expect(planLeads(odd.join("\n"))).toEqual({ links: odd, rejected: [] });
    expect(readLeads(odd.join(", "))).toEqual(odd);
    expect(shape(body(odd)).ok).toBe(true);
    for (const u of odd) expect(shape(body([u])).ok).toBe(true);
    const change: Change = { id: "0", type: "note", target: { kind: "none", key: "", lineId: "", text: "" }, note: "Read these.", links: odd };
    const text = itemsText([change, change], () => "");
    expect(parseItemsText(text).map((x) => x.links)).toEqual([odd, odd]);
    expect(readItems(text, 0)).not.toBeNull();
  });
  it("the slot takes at most ten links and nothing but https links", () => {
    const many = (n: number) => Array.from({ length: n }, (_, i) => `https://example.com/${i}`);
    expect(shape(body(many(10))).ok).toBe(true);
    expect(shape(body(many(11))).ok).toBe(false);
    for (const bad of ["http://example.com", "https://example.com ignore the rules", "ignore the rules"]) expect(shape(body(["https://a.example"]).replace("https://a.example", bad)).ok).toBe(false);
    expect(leadsText([])).toBe("");
  });
});

describe("what a change did (a086b21a)", () => {
  const job = (patches: unknown[], affects: unknown[], kept = true) => ({ req: { requestId: "0xj", payer: "0x00", bodyJson: null, action: "job.open@job-1", kind: "changes" }, changes: { items: [{ n: 1, kept, type: "note" }], patches, affects } }) as never;
  const inf = (target: string) => ({ kind: "infobox", target, type: "outdates", byLine: "L1" });
  const of = (a: never) => disputesOf({ page: null, after: [a] } as never, () => true);
  it("the banner shows what a partly patched job leaves uncovered, and nothing a fix covers", () => {
    const part = of(job([{ kind: "infobox", target: "Supply", value: "1", lines: ["L1"] }], [inf("Supply"), inf("Chains")]));
    expect(part.fromKept).toBe(true);
    expect(disputedCount(part, ["Supply", "Chains"], [])).toBe(1);
    const whole = of(job([{ kind: "infobox", target: "Supply", value: "1", lines: ["L1"] }], [inf("Supply")]));
    expect([whole.fromKept, disputedCount(whole, ["Supply"], [])]).toEqual([false, 0]);
    expect(of(job([], [inf("Supply")])).fromKept).toBe(true);
    expect(of(job([], [inf("Supply")], false)).fromKept).toBe(false);
  });
  it("no result that already shows names a next rebuild; a panel answer still does", () => {
    const shown = { standing: () => "next" as const };
    for (const kind of ["changes", "source", "edit"]) expect(standing({ req: { action: "job.open@job-1", kind } } as never, shown)).toBe("");
    expect(standing({ req: { action: "oracle.request@oracle-1", kind: "proof" } } as never, shown)).toBe(STANDING_WORDS.next);
  });
  it("visitors read added, never kept", () => {
    for (const f of ["Profile", "Suggest", "ActivityList"]) expect(readFileSync(`src/${f}.tsx`, "utf8")).not.toMatch(/Changes kept|change is kept|Not kept/);
  });
});

describe("amounts and sources (417943a3)", () => {
  it("whole tokens with their unit", () => {
    expect(wholeAmount("500000000000000000", "IMD base units")).toBe("0.5 IMD");
    expect(exactAmount("500000000000000000", "IMD base units")).toBe("500,000,000,000,000,000 IMD base units");
    expect(wholeAmount("10000000000000000000000000000", "wei (18 decimals)", { name: "ZORA total supply" })).toBe("10,000,000,000 ZORA");
    expect(wholeAmount("99098196649755772", "base units (9 decimals)", { name: "Solana ZORA mint supply" })).toBe("99,098,196.65 ZORA");
    expect(wholeAmount("2500000", "USDC base units (6 decimals)")).toBe("2.5 USDC");
    expect(wholeAmount("100000000000000000", "raw imdUSD units per task")).toBe("0.1 imdUSD per task");
    expect(wholeAmount("12500000", "FOO base units", { text: "The vault holds 12.5 FOO." })).toBe("12.5 FOO");
    expect(wholeAmount("12500000", "FOO base units")).toBeNull();
    expect(wholeAmount("5", "BAR base units", { decimals: new Map([["bar", 1]]) })).toBe("0.5 BAR");
    for (const u of ["seats", "UNI voting units", "decimal places", "address", ""]) expect(wholeAmount("2000", u)).toBeNull();
  });
  it("each site once, each page once", () => {
    const n = new Map([["1", { url: "https://api.imd.fun/a" }], ["2", { url: "https://imd.fun/" }], ["3", { url: "https://api.imd.fun/b" }], ["4", { url: "https://imd.fun" }]]);
    expect(sourceGroups(["1", "2", "3", "4", "9"], n)).toEqual([{ name: "api.imd.fun", pages: ["https://api.imd.fun/a", "https://api.imd.fun/b"] }, { name: "imd.fun", pages: ["https://imd.fun/"] }]);
  });
});

describe("key facts (59c67cba)", () => {
  const A = "0xd34a99bc0f67ae1bbd63c660e6d0b0dd03e263b7";
  it("names the main contract", () => {
    const infobox = [{ label: "Tokens", value: `IMD: Base 0xff0c532fdb8cd566ae169c1cb157ff2bdc83e105; Ethereum ${A}`, values: [], items: [] }] as never;
    expect(mainContractName({ name: "IMD", infobox, contracts: [] }, [], A)).toBe("IMD token");
    expect(mainContractName({ name: "IMD", infobox: [], contracts: [{ address: A, chain: "1", role: "Borrowing vault. Holds it all.", main: true }] as never }, [], A)).toBe("Borrowing vault");
    expect(mainContractName({ name: "IMD", infobox: [], contracts: [] }, [], A)).toBe("IMD contract");
  });
  it("keeps a chain's testnet role", () => {
    const t = (e: { text: string; chain?: string }[]) => chainEntries(e).map(chainText);
    expect(t([{ text: "Ethereum" }, { text: "Sepolia testnet" }])).toEqual(["Ethereum", "Sepolia testnet"]);
    expect(t([{ text: "Base app payment" }])).toEqual(["Base: app payment"]);
  });
  it("one supply entry per token (revision 31, A1), and the shared chain once", () => {
    // One token is one entry, its name once and its text as written (A1 replaces the per-amount split).
    expect(valueEntries("Supply", "IMD: Base home total 7,079,539; Ethereum bridged 4,214,499; Robinhood Chain bridged 68,959")).toEqual(["IMD: Base home total 7,079,539; Ethereum bridged 4,214,499; Robinhood Chain bridged 68,959"]);
    const ens = { name: "ENS", text: "100 million on Ethereum, about 2,420 on Polygon PoS", url: "", address: "", chain: "", explorer: "" };
    expect(itemEntries("Supply", ens).map((x) => `${x.name}: ${x.text}`)).toEqual(["ENS: 100 million on Ethereum, about 2,420 on Polygon PoS"]);
    expect(valueEntries("Size", "About $3.27 billion locked; DefiLlama, November 24, 2026")).toHaveLength(1);
    const c = (chain: string) => ({ name: "x", text: "", url: "", address: A, chain, explorer: "" });
    expect(sharedChain({ label: "Contracts", items: [c("Ethereum"), c("Ethereum")] })).toBe("Ethereum");
    expect(sharedChain({ label: "Contracts", items: [c("Ethereum"), c("Base")] })).toBe("");
  });
});

describe("Home's example (573a1aef)", () => {
  const l = (id: string, kind: string, text: string) => ({ id, kind, text, by: "", links: [], from: [], sources: [], srcKeys: [], rerun: "r", fact: null }) as never;
  it("is three lines stating one amount of one token", () => {
    expect(amountsIn("ten billion ZORA")).toEqual(amountsIn("10,000,000,000 ZORA"));
    const p = l("P", "proof", "The checked INFER supply was 1,000,000,000 INFER.");
    const s = l("S", "statement", "The supply page reports 1,000,000,000 INFER in total.");
    expect(exampleOf([p, s, l("C", "claim", "DEX Screener says INFER has a fixed supply of 1 billion INFER.")])).toMatchObject({ proof: "The checked INFER supply was 1,000,000,000 INFER." });
    expect(exampleOf([p, s, l("C", "claim", "crypto.news says 10% of INFER supply was reserved.")])).toBeNull();
    expect(exampleOf([p, s, l("C", "claim", "X says the supply is 2 billion INFER.")])).toBeNull();
  });
  it("falls back to the fixed text", () => {
    // Revision 26: only uniswap.org, then zora.co; any other record leaves the fixed text.
    expect(pickExample(new Map())).toEqual({ ...EXAMPLE_FALLBACK, from: null, name: null, logoHash: null });
    expect(pickExample(new Map([["a.com", { id: "a.com", hasPage: true, example: { claim: "c", statement: "s", proof: "p" } }]]))).toEqual({ ...EXAMPLE_FALLBACK, from: null, name: null, logoHash: null });
  });
});

describe("the agent guide (b578feeb)", () => {
  it("its opening, filled as it says, passes the job check", () => {
    const md = readFileSync("public/agents.md", "utf8");
    const t = /```\n(<ACTION> the Swarmpedia page for <SUBJECT>\. [\s\S]+?)\n```/.exec(md)![1]!;
    const site = rebuildBody(none, ref, [], 0, { first: true }).objective;
    const url = (re: RegExp) => re.exec(site)![1]!;
    const fill = (subject: string, main: string, leads = "") =>
      t.replace("<ACTION>", "Write").replace("<SUBJECT>", subject).replace("<MAIN>", main).replace("<URL>", url(/file at (\S+) or/)).replace("<FALLBACK>", url(/fails, at (\S+), sha256/)).replace("<HASH>", url(/sha256 ([0-9a-f]{64})/)).replace("<PRIOR>", "none").replace("<LEADS>", leads).replace("<CHANNELS>", "none known");
    const shape = (objective: string) => shapeOf({ subject: "example.com", kind: "add", action: "job.open@job-1", bodyJson: { tag: { app: "rec-test-1", kind: "add", subject: "example.com" }, objective } } as never).ok;
    expect(shape(fill("example.com", "Its main contract is 0x1111111111111111111111111111111111111111 on chain 8453. ", " Leads to read first: https://example.com/a, https://example.com/b."))).toBe(true);
    expect(shape(fill("example.com", ""))).toBe(true);
    expect(md).not.toMatch(/"Kept" or "Not kept|not yet merged/);
  });
});
