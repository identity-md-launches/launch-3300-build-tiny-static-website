/**
 * The eighth revision: the project's own domain is its registrable domain, the rebuild and changes instructions'
 * new rules, counts in three groups, and a new source checked against the whole record (affects).
 */
import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { Hex } from "viem";
import { artifactUrl, priorText } from "../src/bodies";
import { applyChangeLinks, disputedCount, disputesOf, sentenceDispute, type LineScope } from "../src/changeResult";
import { INSTRUCTIONS } from "../src/instructions";
import { parseLookup } from "../src/lookup";
import { applyLabel, mergeRecord, onDomain, parseAffects, parseChanges, parseLines, parsePage, type Line } from "../src/page";
import { publicSuffix, registrableDomain } from "../src/psl";
import { routeOf } from "../src/route";
import { countLines, countsWords, filtersFor, passes, rowClass, settleAll, shownGroups } from "../src/settle";
import { canonicalId, domainOfId, subjectIdOf } from "../src/subject";
import { subjectOfTag } from "../src/chain";
import { withDisputes } from "../src/Record";
import type { KeyRow } from "../src/keyfacts";
import type { Activity } from "../src/useActivity";

describe("A. the project's own domain is its registrable domain", () => {
  it("applies the public suffix rules, with shared hosts as suffixes", () => {
    expect(registrableDomain("app.uniswap.org")).toBe("uniswap.org");
    expect(registrableDomain("support.uniswap.org")).toBe("uniswap.org");
    expect(registrableDomain("uniswap.org")).toBe("uniswap.org");
    expect(registrableDomain("a.b.example.co.uk")).toBe("example.co.uk");
    expect(registrableDomain("docs.me.github.io")).toBe("me.github.io");
    for (const host of ["github.io", "vercel.app", "netlify.app", "pages.dev", "imd.site"]) {
      expect(publicSuffix(`proj.${host}`)).toBe(host);
      expect(registrableDomain(`www.proj.${host}`)).toBe(`proj.${host}`);
    }
    expect(publicSuffix("app.uniswap.org")).toBe("org");
  });

  it("treats uniswap.org and every subdomain as the subject's own, for a subject recorded as app.uniswap.org", () => {
    for (const u of ["https://uniswap.org/", "https://docs.uniswap.org/x", "https://support.uniswap.org/hc", "https://app.uniswap.org/"]) expect(onDomain(u, "app.uniswap.org")).toBe(true);
    expect(onDomain("https://uniswap.org.evil.com/", "app.uniswap.org")).toBe(false);
    expect(onDomain("https://notuniswap.org/", "uniswap.org")).toBe(false);
    // A project on a shared host owns only its own subdomain.
    expect(onDomain("https://other.github.io/", "me.github.io")).toBe(false);
    expect(onDomain("https://docs.me.github.io/", "me.github.io")).toBe(true);
    expect(onDomain("https://other.imd.site/", "mine.imd.site")).toBe(false);
  });

  it("shows lines from docs. and support. as statements, not claims", () => {
    const line = { id: "L1", section: "what_it_does", text: "x", kind: "statement", marked: "statement", by: "Uniswap Docs", links: [] } as unknown as Line;
    expect(applyLabel(line, [], "Uniswap Docs", ["https://docs.uniswap.org/concepts"], "app.uniswap.org").kind).toBe("statement");
    expect(applyLabel(line, [], "Uniswap Support", ["https://support.uniswap.org/hc/en-us"], "uniswap.org").kind).toBe("statement");
    expect(applyLabel(line, [], "Blog", ["https://blog.example.com/uniswap"], "uniswap.org").kind).toBe("claim");
  });

  it("makes the subject id the registrable domain when a project is added by a subdomain", () => {
    for (const d of ["app.uniswap.org", "www.uniswap.org", "docs.uniswap.org", "https://app.uniswap.org/#/swap"]) expect(subjectIdOf({ domain: d, address: "", chain: "" })).toBe("uniswap.org");
    expect(parseLookup("app.uniswap.org")).toEqual({ kind: "domain", domain: "uniswap.org" });
    expect(subjectIdOf({ domain: "docs.me.github.io", address: "", chain: "" })).toBe("me.github.io");
    expect(domainOfId("app.uniswap.org")).toBe("uniswap.org");
  });

  it("keeps existing links and requests: app.uniswap.org opens and joins the uniswap.org record", () => {
    expect(routeOf("#/s/app.uniswap.org").subject).toBe("uniswap.org");
    expect(routeOf("#/s/app.uniswap.org/record")).toMatchObject({ subject: "uniswap.org", tab: "record" });
    expect(subjectOfTag("app.uniswap.org")).toBe("uniswap.org");
    expect(subjectOfTag({ subject: "docs.uniswap.org" })).toBe("uniswap.org");
    expect(canonicalId("1:0xABCDEFabcdefabcdefabcdefabcdefabcdefabcd")).toBe("1:0xabcdefabcdefabcdefabcdefabcdefabcdefabcd");
    expect(canonicalId("imd.fun")).toBe("imd.fun");
  });
});

describe("B. rebuild instructions", () => {
  const t = INSTRUCTIONS.rebuild.text.replace(/\s*\n\s*/g, " ");
  it("adds scope, key facts, size and uncertainty word for word", () => {
    for (const s of [
      "The subject is the whole project behind the domain: its protocol or contracts, its apps and the organisation that runs them. Say in one_line and in the summary which of these exist. Do not narrow the record to one app.",
      "No market prices: never a row for a token's trading price. One Supply row covering only the project's live main-network tokens; never testnet, retired or bridged copies. In Tokens, list a token once and name its chains.",
      "When independent trackers publish usage figures for the project, such as value locked, trading volume or active users, add one infobox row 'Size' with the figure, the tracker's name and the date, as a claim. For a project with wide coverage, read at least 8 outside sources.",
      "End the summary on an uncertainty only if it matters to a newcomer: who controls the project, a conflict between what the project says and what the chain shows, or a fact that has just changed. Rounding differences between data providers are not such a thing.",
    ])
      expect(t).toContain(s);
  });
  it("is published as a new immutable file, and the old files are still served", () => {
    expect(INSTRUCTIONS.rebuild.file).not.toBe("rebuild-8d7dfbc27d07.txt");
    expect(INSTRUCTIONS.changes.file).not.toBe("changes-0571b29e932d.txt");
    for (const f of ["rebuild-8d7dfbc27d07.txt", "changes-0571b29e932d.txt", INSTRUCTIONS.rebuild.file, INSTRUCTIONS.changes.file]) expect(existsSync(`public/instructions/${f}`)).toBe(true);
    expect(readFileSync(`public/instructions/${INSTRUCTIONS.rebuild.file}`, "utf8")).toBe(INSTRUCTIONS.rebuild.text);
  });
});

/* A record with a proof, a confirmed statement, a statement, a claim and a contradicted claim. */
const L = (id: string, kind: string, links: { type: string; target: string }[] = []) => ({ id, kind, links }) as unknown as Line;
const LINES = [L("P1", "proof"), L("P2", "proof"), L("S1", "statement", [{ type: "confirms", target: "P1" }]), L("S2", "statement", [{ type: "partly", target: "P2" }]), L("C1", "claim"), L("C2", "claim", [{ type: "contradicts", target: "P2" }])];

describe("C. counts read at a glance", () => {
  it("groups Proven (proofs and confirmed lines), Stated, Claimed; Contradicted and Out of date only above zero", () => {
    const c = countLines(LINES);
    // Revision 10 (5c38d3a8): P1 and P2 keep their own Proof rows although S1 and C2 show them as evidence.
    expect(c).toMatchObject({ all: 6, proven: 3, stated: 1, claimed: 1, contradicted: 1, outdated: 0, checks: 2, confirmed: 1 });
    expect(shownGroups(c)).toEqual(["proven", "stated", "claimed", "contradicted"]);
    expect(countsWords(c)).toBe("3 proven, 1 stated, 1 claimed, 1 contradicted");
    expect(filtersFor(c)).toEqual(["all", "proven", "stated", "claimed", "contradicted"]);
    const plain = countLines([L("P9", "proof"), L("S9", "statement")]);
    expect(plain).toMatchObject({ proven: 1, checks: 1, confirmed: 0 });
    expect(countsWords(plain)).toBe("1 proven, 1 stated, 0 claimed");
  });
  it("the Proven filter shows both kinds", () => {
    const s = settleAll(LINES);
    expect(passes("proven", rowClass(LINES[0]!, s.by.get("P1")))).toBe(true);
    expect(passes("proven", rowClass(LINES[2]!, s.by.get("S1")))).toBe(true);
    expect(passes("stated", rowClass(LINES[3]!, s.by.get("S2")))).toBe(true);
  });
  it("Home and Record show the groups, without Only said or a proofs count", () => {
    const home = readFileSync("src/Home.tsx", "utf8");
    const rec = readFileSync("src/Record.tsx", "utf8");
    expect(home).toContain("shownGroups(s.counts)");
    expect(home).not.toContain('plural(s.counts.proof, "proof")');
    expect(rec).toContain("filtersFor(counts)");
    expect(rec).not.toContain("Only said");
    expect(rec).toContain("a check in its own right");
    expect(rec).toContain(", then confirmed");
  });
});

/* ---------- D. affects ---------- */

const h = (c: string) => c.repeat(64);
const PAGE_HASH = h("a");
const channel = { label: "Site", url: "https://example.com/", tie: "strong" };
const PAGE = parsePage(
  JSON.stringify({
    subject: { name: "Example", channels: [channel] },
    infobox: [{ label: "Supply", value: "about 1 million EX", lines: ["L1"] }, { label: "Website", value: "example.com", url: "https://example.com/", lines: [] }],
    summary: [{ text: "Example has about 1 million tokens.", lines: ["L1"] }, { text: "Example runs one app.", lines: ["L2"] }],
    lines: [
      { id: "L1", section: "money", text: "Example says its supply is 1 million EX.", kind: "statement", by: "Example", sources: ["S1"], quote: "1 million EX" },
      { id: "L2", section: "what_it_does", text: "Example runs one app.", kind: "statement", by: "Example", sources: ["S1"], quote: "one app" },
      { id: "L3", section: "on_chain", text: "Total supply is 1 million EX.", kind: "proof", rerun: "cast call", sources: ["S1"] },
    ],
    sources: [{ id: "S1", ref: "https://example.com/", type: "page" }],
  }),
  "example.com",
);
const CHANGES = {
  items: [{ n: 1, type: "wrong", target: "F1:L1", verdict: "kept", why: "newer supply", lines: ["N1"] }],
  sources: [{ id: "S1", url: "https://news.example.org/supply", type: "article", publisher: "News", could_open: true }],
  lines: [
    { id: "N1", source: "S1", section: "money", text: "News says supply is now 2 million EX.", kind: "claim", by: "News", quote: "2 million EX", links: [{ type: "outdates", target: "F1:L1" }] },
    { id: "N2", source: "S1", section: "what_it_does", text: "News says Example runs one app.", kind: "claim", by: "News", quote: "one app", links: [{ type: "agrees", target: "F1:L2" }] },
    { id: "N3", source: "S1", section: "money", text: "News says supply is 5 million EX.", kind: "claim", by: "News", quote: "5 million", links: [{ type: "contradicts", target: "F1:L3" }] },
  ],
  affects: [
    { kind: "line", target: "F1:L1", type: "outdates", by_line: "N1" },
    { kind: "infobox", target: "Supply", type: "outdates", by_line: "N1" },
    { kind: "summary", target: "Example has about 1 million tokens.", type: "outdates", by_line: "N1" },
    { kind: "summary", target: "A sentence the page does not have.", type: "contradicts", by_line: "N1" },
    { kind: "bogus", target: "x", type: "outdates", by_line: "N1" },
  ],
  notes: "",
};

function changesJob(): Activity {
  const text = JSON.stringify(CHANGES);
  const objective = `Judge the changes. The record so far: ${priorText({ files: [artifactUrl(PAGE_HASH)], answers: [] })}. Channels already known: none known. The changes: (1) type: wrong; target: F1:L1 line "x"; note: none; links: none`;
  return {
    req: { requestId: "0xc1" as Hex, payer: "0x0085000000000000000000000000000000059e00" as Hex, action: "job.open@job-1", body: "", bodyJson: { objective }, kind: "changes", title: "", subject: "example.com", template: "", amount: 0n, blockNumber: 1n, transactionHash: "0x01" as Hex },
    state: "completed", time: null, ens: "alice.eth", jobId: null, oracle: null, refusal: null, sourcesError: null, edit: null, fileHash: h("c"), page: null, via: null, rejected: null, doneTime: null,
    sources: parseLines(text, { changes: true }),
    changes: parseChanges(text),
  } as unknown as Activity;
}

function shown() {
  const job = changesJob();
  const scope: LineScope = { pageHash: PAGE_HASH, after: [job], carried: new Map() };
  const sections = applyChangeLinks(mergeRecord(PAGE, [{ key: "0xc1", data: job.sources!, payer: "alice.eth", jobHref: "", raised: true }]), scope);
  const all = sections.flatMap((s) => s.rows.map((r) => r.line));
  const byId = new Map(all.map((l) => [l.id, l] as const));
  return { scope, sections, all, byId };
}

describe("D. a new source is checked against the whole record", () => {
  it("parses affects, keeping only line, infobox and summary entries that name a new line", () => {
    expect(parseAffects(CHANGES.affects)).toHaveLength(4);
    expect(parseAffects([{ kind: "line", target: "F1:L1", type: "confirms", by_line: "N1" }])).toEqual([]);
    expect(parseChanges(JSON.stringify(CHANGES)).affects[0]).toEqual({ kind: "line", target: "F1:L1", type: "outdates", byLine: "N1" });
  });

  it("marks an affected line with its status, and keeps agrees as a link", () => {
    const { all, byId } = shown();
    const s = settleAll(all);
    expect(s.by.get("L1")!.state).toBe("outdated");
    expect(byId.get("L2")!.links).toContainEqual({ type: "agrees", target: "0xc1:N2" });
  });

  it("an existing proof contradicting a new claim stays on the new line and settles it", () => {
    const { all, byId } = shown();
    expect(byId.get("0xc1:N3")!.links).toEqual([{ type: "contradicts", target: "L3" }]);
    expect(settleAll(all).by.get("0xc1:N3")!.state).toBe("contradicted");
    // The proof itself is not marked by the claim.
    expect(byId.get("L3")!.links).toEqual([]);
  });

  it("a contradicts entry in affects marks the line Contradicted even when the newer line is a claim", () => {
    const job = changesJob();
    job.changes!.affects = [{ kind: "line", target: "F1:L2", type: "contradicts", byLine: "N2" }];
    const scope: LineScope = { pageHash: PAGE_HASH, after: [job], carried: new Map() };
    const all = applyChangeLinks(mergeRecord(PAGE, [{ key: "0xc1", data: job.sources!, payer: "a", jobHref: "", raised: true }]), scope).flatMap((s) => s.rows.map((r) => r.line));
    expect(settleAll(all).by.get("L2")!.state).toBe("contradicted");
  });

  it("marks Key facts rows and summary sentences, and counts what the page shows", () => {
    const { scope, byId } = shown();
    const d = disputesOf(scope, (x) => byId.has(x));
    expect(d.fromKept).toBe(true);
    expect(d.lines.get("L1")).toMatchObject({ type: "outdates", by: "0xc1:N1" });
    const rows = withDisputes([{ label: "Supply", badge: { text: "Stated by Example", tone: "statement" }, status: null } as KeyRow, { label: "Website", badge: null, status: { text: "Own domain", tone: "own" } } as KeyRow], d);
    expect(rows[0]).toMatchObject({ badge: { text: "Out of date", tone: "outdated" }, disputedBy: "0xc1:N1" });
    expect(rows[1]!.disputedBy).toBeUndefined();
    expect(sentenceDispute({ text: "Example has about 1 million tokens" }, d)).toMatchObject({ type: "outdates", by: "0xc1:N1" });
    // The sentence the visitor targeted was rewritten: it is not marked again.
    expect(sentenceDispute({ text: "Example has about 1 million tokens.", original: "x" }, d)).toBeNull();
    // One line, one Key facts row and one summary sentence; the sentence the page lacks is not counted.
    expect(disputedCount(d, ["Supply", "Website"], PAGE.summary)).toBe(3);
  });

  it("says nothing when no kept change left anything in affects", () => {
    const job = changesJob();
    job.changes!.items = job.changes!.items.map((v) => ({ ...v, kept: false }));
    const scope: LineScope = { pageHash: PAGE_HASH, after: [job], carried: new Map() };
    expect(disputesOf(scope, () => true).fromKept).toBe(false);
    const rec = readFileSync("src/Record.tsx", "utf8");
    expect(rec).toContain("A newer source disputes {n === 1 ? \"1 part\" : `${n.toLocaleString(\"en-US\")} parts`} of this page.");
    expect(rec).toContain("Rebuild to update them.");
  });

  it("changes instructions name affects and the agrees link", () => {
    const t = INSTRUCTIONS.changes.text;
    expect(t).toContain("affects[{kind,target,type,by_line}]");
    expect(t).toContain("or agrees (same thing said by another speaker)");
  });
});
