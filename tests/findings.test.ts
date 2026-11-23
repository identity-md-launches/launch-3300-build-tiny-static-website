import "./legacy-gate";
/**
 * Third revision: the reviewer's findings on the record-has-no-size-limit revision. Each block names the finding
 * id it covers.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { Hex } from "viem";
import { INSTRUCTIONS } from "../src/instructions";
import { artifactUrl, EDIT_TEMPLATE, REBUILD_TEMPLATE, rebuildObjective, SOURCE_TEMPLATE, sourceObjective, type Prior } from "../src/bodies";
import { accountsOf, keyFacts, provesToken } from "../src/keyfacts";
import { droppedFileNumbers, fitPrior, leftOutText, planRebuild, reconsiderFiles } from "../src/model";
import { candidateFiles, channelStatus, droppedLines, parsePage, type PriorLines } from "../src/page";
import { refFromId } from "../src/subject";
import type { TaggedRequest } from "../src/chain";
import type { Activity } from "../src/useActivity";

const A = "0x1111111111111111111111111111111111111111";
const h = (c: string) => c.repeat(64);
let n = 0;
function act(kind: "add" | "source" | "edit", opts: { block: number; hash?: string; objective?: string; page?: string; subject?: string }): Activity {
  n++;
  const req = {
    requestId: `0x${n.toString(16).padStart(64, "0")}` as Hex,
    payer: A as Hex,
    action: "job.open@job-1",
    body: "",
    bodyJson: { objective: opts.objective ?? "" },
    kind,
    title: "",
    subject: opts.subject ?? "example.com",
    template: "",
    amount: 0n,
    blockNumber: BigInt(opts.block),
    transactionHash: `0x${(n + 1000).toString(16).padStart(64, "0")}` as Hex,
  } satisfies TaggedRequest;
  const page = opts.page ? parsePage(opts.page) : null;
  return {
    req,
    completion: { requestId: req.requestId, status: 0, resultHash: "0x" as Hex, reason: "", uri: "", transactionHash: req.transactionHash, blockNumber: BigInt(opts.block + 1), logIndex: 0 },
    state: "completed",
    time: opts.block * 1000,
    ens: null,
    jobId: null,
    oracle: null,
    refusal: null,
    sources: kind === "add" ? null : { sources: [], lines: [{ id: "L1", section: "money", text: `line of ${n}`, kind: "claim", marked: "claim", labelNote: "", channel: null, by: "x", sources: [], srcKeys: [], quote: "", rerun: "", fact: null, from: [], links: [], source: null }], differs: [] },
    sourcesError: null,
    edit: null,
    fileHash: opts.hash ?? null,
    page,
    via: null,
    rejected: null,
    doneTime: (opts.block + 1) * 1000,
  };
}

describe("the record has no line limit in the parsers (52acaff0)", () => {
  it("keeps line 2,001 and dropped entry 2,001, and an infobox row citing L2001 resolves", () => {
    const lines = Array.from({ length: 2001 }, (_, i) => ({ id: `L${i + 1}`, section: "what_it_does", text: `Claim number ${i + 1}.`, kind: "claim", by: "Example Weekly", sources: ["S1"] }));
    const dropped = Array.from({ length: 2001 }, (_, i) => ({ id: `F2:L${i + 1}`, why: "exact duplicate of L1" }));
    const p = parsePage(JSON.stringify({ subject: { name: "Ex" }, lines, dropped, infobox: [{ label: "Launched", value: "2024", lines: ["L2001"] }] }), "example.com");
    expect(p.lines).toHaveLength(2001);
    expect(p.lines.at(-1)!.id).toBe("L2001");
    expect(p.dropped).toHaveLength(2001);
    expect(p.dropped.at(-1)!.id).toBe("F2:L2001");
    const k = keyFacts(p, (id) => p.lines.find((l) => l.id === id), p.lines);
    expect(k.rows[0]!.lines.map((l) => l.id)).toEqual(["L2001"]);
    expect(k.rows[0]!.badge?.text).toBe("Reported by Example Weekly");
    const files: PriorLines[] = [{ n: 2, lines: lines.map((l) => ({ id: l.id, text: l.text })) }];
    expect(droppedLines(p, files).at(-1)).toMatchObject({ ref: "F2:L2001", text: "Claim number 2001." });
  });
});

// dc28a9b3 asked to merge only exact duplicates; this job's brief (MERGING IS NOT DROPPING) replaces that rule.
describe("the rebuild objective merges lines that say the same thing (replaces dc28a9b3)", () => {
  it("merges across files, speakers and dates; a merged line is carried, not dropped", () => {
    expect(INSTRUCTIONS.rebuild.text).toContain("Merge lines that say the same thing into ONE line, even across files, speakers or dates; it lists every origin in from and speaker in by, counts as carried, and its origins stay out of dropped.");
    expect(INSTRUCTIONS.rebuild.text).not.toContain("Merge only exact duplicates of the same attributed line.");
    expect(INSTRUCTIONS.rebuild.text).toContain("Carry every earlier line forward unless a reason to drop applies.");
    expect(INSTRUCTIONS.rebuild.text).toContain("The only reasons to drop are: not about the subject, or replaced by a newer statement from the same speaker.");
    expect(readFileSync("templates/rebuild.txt", "utf8").trim()).toBe(REBUILD_TEMPLATE);
  });
});

describe("what fits in <PRIOR>: the page shown, the newest results, then the files to reconsider (replaces 8fe1a504)", () => {
  const ref = refFromId("example.com");
  const measure = (p: Prior) => rebuildObjective(p, ref).length;
  const f1 = artifactUrl(h("f"));
  const old = artifactUrl(h("1"));
  const later = (n: number) => Array.from({ length: n }, (_, i) => ({ id: String(i), url: artifactUrl(i.toString(16).padStart(64, "0")) }));
  it("60 later results and one file to reconsider all fit in 7,900 characters", () => {
    const fit = fitPrior(f1, later(60), [], measure, [old]);
    expect(fit.prior.reconsider).toEqual([old]);
    expect(fit.leftOut).toBe(0);
    expect(fit.reconsiderLeftOut).toBe(0);
    expect(measure(fit.prior)).toBeLessThanOrEqual(7900);
    expect(rebuildObjective(fit.prior, ref)).toContain(`${old} (reconsider dropped lines)`);
  });
  it("past the room, the newest results are kept first and the file to reconsider is left out, never the page shown", () => {
    const rs = later(150);
    const fit = fitPrior(f1, rs, [], measure, [old]);
    expect(fit.prior.files[0]).toBe(f1);
    expect(fit.included.has("149")).toBe(true);
    expect(fit.included.has("0")).toBe(false);
    expect(fit.leftOut).toBe(150 - fit.included.size);
    expect(fit.leftOut).toBeGreaterThan(0);
    expect(fit.reconsiderLeftOut).toBe(1);
    expect(fit.prior.reconsider).toBeUndefined();
    expect(measure(fit.prior)).toBeLessThanOrEqual(7900);
    // Listed in time order after F1: the oldest included result first, the newest last.
    expect(fit.prior.files.at(-1)).toBe(rs.at(-1)!.url);
  });
  it("planRebuild stays offered when the files to reconsider do not fit", () => {
    const shownPage = JSON.stringify({ subject: { name: "Ex" }, lines: [{ id: "L1", section: "money", text: "x", kind: "claim", by: "b", from: ["F1:L1"] }], dropped: [{ id: "F1:L2", why: "space" }] });
    const oldAct = act("add", { block: 100, hash: h("1"), page: JSON.stringify({ subject: { name: "Ex" }, lines: [] }) });
    const shown = act("add", { block: 200, hash: h("f"), page: shownPage, objective: `Start from the earlier results: [F1] ${old}. Fetch each file.` });
    const after = Array.from({ length: 150 }, (_, i) => act("source", { block: 300 + i * 10, hash: i.toString(16).padStart(64, "0") }));
    const plan = planRebuild([oldAct, shown, ...after], ref);
    expect(plan.ok).toBe(true);
    expect(plan.reconsiderLeftOut).toBe(1);
    expect(plan.leftOut).toBeGreaterThan(0);
    expect(measure(plan.prior)).toBeLessThanOrEqual(7900);
    expect(leftOutText(plan)).toEqual([
      `${plan.leftOut} older results: they stay “Not yet folded in”, and a later rebuild picks them up.`,
      "1 file to reconsider: its dropped lines stay listed as dropped, and a later rebuild reconsiders it.",
    ]);
    // With fewer results the marked file fits and is listed.
    const small = planRebuild([oldAct, shown, ...after.slice(0, 60)], ref);
    expect(small.prior.reconsider).toEqual([old]);
    expect(leftOutText(small)).toEqual([]);
  });
  it("many files to reconsider: as many as fit, and the rebuild is still offered", () => {
    const tooMany = Array.from({ length: 100 }, (_, i) => artifactUrl((i + 100).toString(16).padStart(64, "0")));
    const fit = fitPrior(f1, later(10), [], measure, tooMany);
    expect(fit.included.size).toBe(10);
    expect(fit.reconsiderLeftOut).toBeGreaterThan(0);
    expect(fit.prior.reconsider!.length).toBe(100 - fit.reconsiderLeftOut);
    expect(measure(fit.prior)).toBeLessThanOrEqual(7900);
  });
});

describe("a legacy bare dropped id finds its file (45192b1a)", () => {
  const given = [
    { n: 1, url: artifactUrl(h("1")), hash: h("1") },
    { n: 2, url: artifactUrl(h("2")), hash: h("2") },
  ];
  const files: PriorLines[] = [
    { n: 1, lines: [{ id: "L4", text: "Old four" }] },
    { n: 2, lines: [{ id: "L1", text: "Other" }] },
  ];
  it("resolves L4 with the same reads Record uses, and waits for them otherwise", () => {
    expect(droppedFileNumbers([{ id: "L4" }]).unresolved).toBe(1);
    expect([...droppedFileNumbers([{ id: "L4" }], files).ns]).toEqual([1]);
    expect(reconsiderFiles([{ id: "L4" }], given)).toEqual([]);
    expect(reconsiderFiles([{ id: "L4" }], given, [], files)).toEqual([artifactUrl(h("1"))]);
    expect(droppedLines({ dropped: [{ id: "L4", why: "space" }] }, files)[0]).toMatchObject({ ref: "F1:L4", text: "Old four" });
    // An id two files have is unresolved in Record's display, but both files are reconsidered (32496e59).
    expect(reconsiderFiles([{ id: "L1" }], given, [], [...files, { n: 1, lines: [{ id: "L1", text: "x" }] }])).toEqual([artifactUrl(h("1")), artifactUrl(h("2"))]);
  });
  it("planRebuild is not offered from the home form until the files are read, then marks F1", () => {
    const ref = refFromId("example.com");
    const oldAct = act("add", { block: 100, hash: h("1"), page: JSON.stringify({ subject: { name: "Ex" }, lines: [] }) });
    const shownPage = JSON.stringify({ subject: { name: "Ex" }, lines: [{ id: "L1", section: "money", text: "x", kind: "claim", by: "b" }], dropped: [{ id: "L4", why: "space" }] });
    const shown = act("add", { block: 200, hash: h("f"), page: shownPage, objective: `Start from the earlier results: [F1] ${artifactUrl(h("1"))}. Fetch each file.` });
    const before = planRebuild([oldAct, shown], ref);
    expect(before.needsReads).toBe(true);
    expect(before.ok).toBe(false);
    const after = planRebuild([oldAct, shown], ref, [{ n: 1, lines: [{ id: "L4", text: "Old four" }] }]);
    expect(after.ok).toBe(true);
    expect(after.prior.reconsider).toEqual([artifactUrl(h("1"))]);
  });
});

describe("the jobs' statement rule is the site's label rule (1154ad1b)", () => {
  it("rebuild, sources and edit objectives make Own domain, tie strong and tie linked channels statements, nothing else", () => {
    for (const t of [INSTRUCTIONS.rebuild.text, SOURCE_TEMPLATE, EDIT_TEMPLATE]) expect(t).not.toMatch(/tie (is )?strong or weak/);
    for (const t of [SOURCE_TEMPLATE, EDIT_TEMPLATE]) expect(t).toContain("on the subject's domain or a subdomain of it");
    // The rebuild now names the registrable domain: uniswap.org and every subdomain of it.
    expect(INSTRUCTIONS.rebuild.text).toContain("A line is a statement only if published on a listed channel on the subject's own domain (its registrable domain or any subdomain of it), or on a listed channel with tie strong or linked; anything else is a claim.");
    expect(INSTRUCTIONS.changes.text).toContain("a statement only if its publisher is a channel on the subject's own domain (its registrable domain or any subdomain of it) or a channel with tie strong or linked;");
    const o = sourceObjective(["https://docs.imd.fun/about"], [{ url: "https://docs.imd.fun", tie: "none" }], "", refFromId("imd.fun"));
    expect(o).toContain("If the publisher is a listed channel on the subject's domain or a subdomain of it, or a listed channel with tie strong or linked, its lines have kind statement;");
  });
  it("a Docs channel on a subdomain with tie none: a statement line shows as Stated by Docs", () => {
    const p = parsePage(
      JSON.stringify({
        subject: { name: "IMD", channels: [{ label: "Docs", url: "https://docs.imd.fun", tie: "none" }, { label: "@fan", url: "https://x.com/fan", tie: "weak" }] },
        infobox: [{ label: "Launched", value: "2026", lines: ["L4"] }, { label: "Price", value: "1 IMD", lines: ["L5"] }],
        lines: [
          { id: "L4", section: "history", text: "It launched in 2026.", kind: "statement", by: "Docs", sources: ["D1"] },
          { id: "L5", section: "money", text: "A job costs 1 IMD.", kind: "statement", by: "@fan", sources: ["X1"] },
        ],
        sources: [{ id: "D1", ref: "https://docs.imd.fun/about" }, { id: "X1", ref: "https://x.com/fan/status/1" }],
      }),
      "imd.fun",
    );
    expect(channelStatus(p.channels[0]!, "imd.fun")).toBe("own");
    expect(channelStatus(p.channels[1]!, "imd.fun")).toBe("unverified");
    const k = keyFacts(p, (id) => p.lines.find((l) => l.id === id), p.lines);
    expect(k.rows.map((r) => r.badge?.text)).toEqual(["Stated by Docs", "Reported by @fan"]);
  });
});

describe("the fallback takes only token symbol and token supply proofs (e3dbc6c6)", () => {
  const page = (lines: object[], contracts: object[] = []) => parsePage(JSON.stringify({ subject: { name: "Ex", contracts }, lines }), "example.com");
  it("a Seat supply proof before a Token supply proof: one row, from the token supply", () => {
    const p = page([
      { id: "L1", section: "on_chain", text: "There are 12 seats.", kind: "proof", rerun: "call seatSupply()", fact: { name: "Seat supply", value: "12", unit: "seats" }, sources: ["S1"] },
      { id: "L2", section: "on_chain", text: "Supply is 1000 EX.", kind: "proof", rerun: "call totalSupply()", fact: { name: "Token supply", value: "1000", unit: "EX" }, sources: ["S1"] },
    ]);
    const rows = keyFacts(p, () => undefined, p.lines).rows;
    expect(rows.map((r) => [r.label, r.value])).toEqual([["Token supply", "1000 EX"]]);
  });
  it("only a seat proof: no supply row; a proof read with totalSupply() on the token contract is preferred", () => {
    const seat = page([{ id: "L1", section: "on_chain", text: "Seats.", kind: "proof", rerun: "call supply()", fact: { name: "Supply of seats", value: "12", unit: "" }, sources: ["S1"] }]);
    expect(keyFacts(seat, () => undefined, seat.lines).rows).toEqual([]);
    const T = "0x3333333333333333333333333333333333333333";
    const two = page(
      [
        { id: "L1", section: "on_chain", text: "Other supply.", kind: "proof", rerun: `call totalSupply() on ${A}`, fact: { name: "Total supply", value: "5", unit: "X" }, sources: ["S1"] },
        { id: "L2", section: "on_chain", text: "Token supply.", kind: "proof", rerun: `call totalSupply() on ${T}`, fact: { name: "Total supply", value: "9", unit: "EX" }, sources: ["S1"] },
      ],
      [{ address: T, chain: "1", role: "ERC-20 token", main: false }],
    );
    expect(keyFacts(two, () => undefined, two.lines).rows.map((r) => r.value)).toEqual(["9 EX"]);
  });
});

describe("key facts badges wrap instead of widening the page (e2b1fd57)", () => {
  it("the wider table has a fixed layout and the badge cell wraps", () => {
    const css = readFileSync("src/styles.css", "utf8");
    expect(css).toMatch(/\.keyfacts table \{[^}]*table-layout: fixed/);
    expect(css).toMatch(/\.kf-badge \{[^}]*white-space: normal/);
    expect(css).not.toMatch(/\.kf-badge \{[^}]*nowrap/);
    expect(css).toMatch(/\.kf-badge \.badge[^{]*\{[^}]*max-width: 100%[^}]*overflow-wrap: anywhere/);
  });
});

describe("the README documents the current rules (9f1d8237)", () => {
  it("names the three drop reasons, reconsidered files, Supply and Seats, badge precedence, the fallback and the labels", () => {
    const r = readFileSync("README.md", "utf8");
    for (const s of [
      "earlier line for exactly two reasons",
      "**Merging is not dropping**",
      "every origin in `from` and every speaker in `by`",
      "Look it up",
      "1 by 1 transparent placeholder PNG",
      "(reconsider dropped lines)",
      "Supply and Seats are separate rows",
      '"Proven on chain" if any is a proof',
      "at most four rows: Website, Main contract, the token symbol proof and the token supply",
      "**Own domain**",
      "**Verified on chain**",
      "**Not verified**",
      "Only the first two can publish statements.",
      "is kept, with `links` to what confirms or contradicts it",
    ])
      expect(r).toContain(s);
    expect(r).not.toContain("names the contract");
    expect(r).not.toContain('"not confirmed"');
    expect(r).not.toMatch(/channels with tie `strong` or\s+`weak`/);
  });
});

describe("an Official accounts row shows one badge (2ba970b7, revised by 44e42685)", () => {
  it("@imd, @news: one conservative channel label for the row, no evidence badge", () => {
    const p = parsePage(
      JSON.stringify({
        subject: { name: "IMD", channels: [{ label: "@imd", url: "https://x.com/imd", tie: "strong" }, { label: "@news", url: "https://x.com/news", tie: "weak" }] },
        infobox: [{ label: "Official accounts", value: "@imd, @news", values: ["@imd","@news"], lines: ["L1"] }],
        lines: [{ id: "L1", section: "people", text: "The accounts are @imd and @news.", kind: "statement", by: "@imd", sources: ["S1"] }],
        sources: [{ id: "S1", ref: "https://x.com/imd/status/1" }],
      }),
      "imd.fun",
    );
    const [row] = keyFacts(p, (id) => p.lines.find((l) => l.id === id), p.lines).rows;
    // The individual labels stay with each account (and on Sources); the row shows only the most cautious one.
    // Each account by a short name, with its own tie's label; they differ, so each shows its badge beside it.
    expect(row!.accounts.map((a) => [a.name, a.status?.text])).toEqual([["@imd on X", "Verified on chain"], ["@news on X", "Not verified"]]);
    expect(row!.perAccount).toBe(true);
    expect(row!.status).toEqual({ text: "Not verified", tone: "unverified" });
    expect(row!.badge).toBeNull();
    expect(accountsOf(p.channels, ["@imd", "x.com/news", "@other"], "imd.fun").map((a) => a.channel?.label ?? null)).toEqual(["@imd", "@news", null]);
    // A text value is split only when its parts name profiles (revision 14, 62dcc4ad); every part is kept.
    expect(accountsOf(p.channels, "@imd and x.com/news; @other", "imd.fun").map((a) => [a.name, a.url])).toEqual([["@imd on X", "https://x.com/imd"], ["@news on X", "https://x.com/news"], ["@other", ""]]);
    // A text value naming no profile stays one account.
    expect(accountsOf(p.channels, "Our team and friends", "imd.fun")).toHaveLength(1);
  });
});

describe("an ambiguous bare dropped id reconsiders every candidate file (32496e59)", () => {
  const ref = refFromId("example.com");
  const f1 = artifactUrl(h("1"));
  const f2 = artifactUrl(h("2"));
  const read: PriorLines[] = [
    { n: 1, lines: [{ id: "L4", text: "Old four" }] },
    { n: 2, lines: [{ id: "L4", text: "Later four" }] },
  ];
  it("L4 in both F1 and F2: both URLs are marked, Record still shows L4 as given", () => {
    expect(candidateFiles("L4", read)).toEqual([1, 2]);
    expect(candidateFiles("F2:L4", read)).toEqual([2]);
    expect(droppedLines({ dropped: [{ id: "L4", why: "space" }] }, read)[0]).toMatchObject({ ref: "L4", text: "" });
    const oldPage = act("add", { block: 100, hash: h("1"), page: JSON.stringify({ subject: { name: "Ex" }, lines: [] }) });
    const src = act("source", { block: 150, hash: h("2") });
    const shownPage = JSON.stringify({ subject: { name: "Ex" }, lines: [{ id: "L1", section: "money", text: "x", kind: "claim", by: "b" }], dropped: [{ id: "L4", why: "space" }] });
    const shown = act("add", { block: 200, hash: h("f"), page: shownPage, objective: rebuildObjective({ files: [f1, f2], answers: [] }, ref) });
    expect(planRebuild([oldPage, src, shown], ref).ok).toBe(false);
    const plan = planRebuild([oldPage, src, shown], ref, read);
    expect(plan.prior.reconsider).toEqual([f1, f2]);
    expect(plan.ok).toBe(true);
    const objective = rebuildObjective(plan.prior, ref);
    expect(objective).toContain(f1);
    expect(objective).toContain(f2);
    expect(objective.match(/reconsider dropped lines/g)?.length ?? 0).toBeGreaterThanOrEqual(1);
  });
  it("the size gate still applies to the candidate set", () => {
    const many = Array.from({ length: 100 }, (_, i) => artifactUrl((i + 100).toString(16).padStart(64, "0")));
    const fit = fitPrior(artifactUrl(h("f")), [], [], (p) => rebuildObjective(p, ref).length, many);
    expect(fit.reconsiderLeftOut).toBeGreaterThan(0);
  });
});

describe("the fallback shows only the subject's own token proofs (e69669a6)", () => {
  const TOKEN = "0xd34a99bc0f67ae1bbd63c660e6d0b0dd03e263b7";
  const BADGE = "0x2222222222222222222222222222222222222222";
  const page = (lines: object[]) =>
    parsePage(
      JSON.stringify({
        subject: {
          name: "IMD",
          channels: [{ label: "imd.fun", url: "https://imd.fun/", tie: "weak" }],
          contracts: [
            { address: TOKEN, chain: "Ethereum", role: "token", main: true },
            { address: BADGE, chain: "Ethereum", role: "Collectible badges (ERC-721)", main: false },
          ],
        },
        lines,
        sources: [{ id: "R2", ref: "https://etherscan.io/" }],
      }),
      "imd.fun",
    );
  const badge = [
    { id: "L1", section: "on_chain", text: "12 badges exist.", kind: "proof", rerun: `Call totalSupply() on ${BADGE} on Ethereum at block 123.`, fact: { name: "Total supply", value: "12", unit: "badges" }, sources: ["R2"] },
    { id: "L2", section: "on_chain", text: "The badge symbol is BADGE.", kind: "proof", rerun: `Call symbol() on ${BADGE} on Ethereum at block 123.`, fact: { name: "Symbol", value: "BADGE", unit: "" }, sources: ["R2"] },
  ];
  it("a collectible's symbol and supply proofs do not fill the token rows", () => {
    const p = page(badge);
    expect(keyFacts(p, () => undefined, p.lines).rows.map((r) => r.label)).toEqual(["Website", "Main contract"]);
  });
  it("the token's own proofs are shown; one that names no contract is not", () => {
    const p = page([
      ...badge,
      { id: "L3", section: "on_chain", text: "Anonymous supply.", kind: "proof", rerun: "call totalSupply()", fact: { name: "Total supply", value: "7", unit: "" }, sources: ["R2"] },
      { id: "L4", section: "on_chain", text: "Symbol is IMD.", kind: "proof", rerun: `Call symbol() on ${TOKEN}.`, fact: { name: "Symbol", value: "IMD", unit: "" }, sources: ["R2"] },
    ]);
    expect(keyFacts(p, () => undefined, p.lines).rows.map((r) => [r.label, r.value])).toEqual([
      ["Website", "imd.fun"],
      ["Main contract", TOKEN],
      ["Symbol", "IMD"],
    ]);
    expect(provesToken(p.lines[2]!, [TOKEN])).toBe(false);
    expect(provesToken(p.lines[0]!, [TOKEN])).toBe(false);
  });
});

describe("a lone Official accounts handle keeps its tie (d1dd68f7)", () => {
  it("@imd alone shows Verified on chain, as it does in a list", () => {
    const make = (value: string, extra: object[] = []) =>
      parsePage(
        JSON.stringify({
          subject: { name: "IMD", channels: [{ label: "IMD on X", url: "https://x.com/imd", tie: "strong" }, ...extra] },
          infobox: [{ label: "Official accounts", value, values: value.includes(",") ? value.split(/\s*,\s*/) : [], lines: ["L1"] }],
          lines: [{ id: "L1", section: "people", text: "We are @imd.", kind: "statement", by: "@imd", sources: ["S1"] }],
          sources: [{ id: "S1", ref: "https://x.com/imd/status/1" }],
        }),
        "imd.fun",
      );
    const alone = make("@imd");
    const [row] = keyFacts(alone, (id) => alone.lines.find((l) => l.id === id), alone.lines).rows;
    expect(row!.status?.text).toBe("Verified on chain");
    expect(row!.channel?.url).toBe("https://x.com/imd");
    expect(row!.badge).toBeNull();
    const both = make("@imd, @news", [{ label: "@news", url: "https://x.com/news", tie: "weak" }]);
    const [row2] = keyFacts(both, (id) => both.lines.find((l) => l.id === id), both.lines).rows;
    expect(row2!.accounts[0]!.status?.text).toBe("Verified on chain");
  });
});
