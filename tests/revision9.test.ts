/**
 * The ninth revision, answering an outside review: the full Public Suffix List, legacy subject ids in cached scans and
 * trays, first-party statement attribution, Proven counts that match their rows, contradicted proofs, panel answers
 * completed after the last rebuild, and later disputes on a reworded sentence.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { Hex } from "viem";
import { artifactUrl, priorText } from "../src/bodies";
import { applyChangeLinks, disputedCount, disputesOf, sentenceDispute, type LineScope } from "../src/changeResult";
import { fromStored, toStored } from "../src/chain";
import { migrateTrays } from "../src/changes";
import { ACTIONS } from "../src/config";
import { parseLookup } from "../src/lookup";
import { shownAnswersOf } from "../src/model";
import { applyLabel, mergeRecord, parseChanges, parseLines, parsePage, type Line } from "../src/page";
import { RULE_COUNT, registrableDomain, sameSite } from "../src/psl";
import { routeOf } from "../src/route";
import { countLines, groupOf, rowClass, settleAll, settleOf } from "../src/settle";
import { subjectIdOf, validateSubject } from "../src/subject";
import type { Activity } from "../src/useActivity";

describe("0e7a81b5: the full Public Suffix List decides the registrable domain", () => {
  it("passes every case of the list's own test file", () => {
    const t = readFileSync("tests/fixtures/test_psl.txt", "utf8");
    const bad: string[] = [];
    let n = 0;
    for (const m of t.matchAll(/^checkPublicSuffix\((null|'[^']*'), (null|'[^']*')\);/gm)) {
      if (m[1] === "null") continue;
      n++;
      const input = m[1]!.slice(1, -1);
      const want = m[2] === "null" ? "" : new URL(`http://${m[2]!.slice(1, -1)}`).hostname;
      if (registrableDomain(input) !== want) bad.push(`${input}: ${registrableDomain(input)} ≠ ${want}`);
    }
    expect(n).toBeGreaterThan(70);
    expect(bad).toEqual([]);
    expect(RULE_COUNT).toBeGreaterThan(9000);
  });

  it("resolves wildcard, exception and multi-label rules, and keeps tenants apart", () => {
    expect(parseLookup("app.test.k12.ak.us")).toEqual({ kind: "domain", domain: "test.k12.ak.us" });
    expect(parseLookup("docs.b.c.kobe.jp")).toEqual({ kind: "domain", domain: "b.c.kobe.jp" });
    expect(registrableDomain("www.city.kobe.jp")).toBe("city.kobe.jp");
    expect(sameSite("other-school.k12.ak.us", "test.k12.ak.us")).toBe(false);
    expect(sameSite("other.github.io", "github.io")).toBe(false);
    expect(sameSite("docs.uniswap.org", "uniswap.org")).toBe(true);
    // The full hostname is resolved before any www. handling: www.github.io is the tenant "www".
    expect(registrableDomain("www.github.io")).toBe("www.github.io");
    expect(sameSite("www.github.io", "me.github.io")).toBe(false);
    expect(registrableDomain("x.proj.imd.site")).toBe("proj.imd.site");
  });

  it("refuses a bare public suffix as a new subject, and keeps legacy aliases routing", () => {
    for (const s of ["github.io", "k12.ak.us", "co.uk", "imd.site"]) {
      expect(parseLookup(s)).toEqual({ kind: "invalid" });
      expect(subjectIdOf({ domain: s, address: "", chain: "" })).toBe("");
      expect(validateSubject({ domain: s, address: "", chain: "" }).domain).toMatch(/shared by many sites/);
    }
    expect(routeOf("#/s/app.uniswap.org").subject).toBe("uniswap.org");
  });
});

const req = (id: string, subject: string) => ({ requestId: id as Hex, payer: "0x01" as Hex, action: "job.open@job-1", body: "", bodyJson: null, kind: "page", title: "", subject, template: "", amount: 1n, blockNumber: 5n, transactionHash: "0x02" as Hex });

describe("df384b55: cached scans and saved drafts follow the canonical subject", () => {
  it("canonicalises a stored request's subject as the scan is read", () => {
    const stored = toStored({ lastBlock: 9n, requests: [req("0xaa", "app.uniswap.org")] as never, completions: new Map() });
    expect(stored.requests[0]!.subject).toBe("app.uniswap.org");
    expect(fromStored(JSON.parse(JSON.stringify(stored)))!.requests[0]!.subject).toBe("uniswap.org");
  });

  it("merges a legacy tray into the canonical one, by draft id, keeping drafts already there", () => {
    const m = new Map<string, string>([
      ["imd-record:v1:changes:app.uniswap.org", JSON.stringify([{ id: "c1" }, { id: "c2" }])],
      ["imd-record:v1:changes:uniswap.org", JSON.stringify([{ id: "c2" }, { id: "c3" }])],
      ["imd-record:v1:changes:other.org", JSON.stringify([{ id: "c9" }])],
    ]);
    const storage = { get length() { return m.size; }, key: (i: number) => [...m.keys()][i] ?? null, getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k) };
    expect(migrateTrays("uniswap.org", storage)).toBe(1);
    expect(JSON.parse(m.get("imd-record:v1:changes:uniswap.org")!).map((c: { id: string }) => c.id)).toEqual(["c2", "c3", "c1"]);
    expect(m.has("imd-record:v1:changes:app.uniswap.org")).toBe(false);
    expect(m.has("imd-record:v1:changes:other.org")).toBe(true);
    expect(migrateTrays("uniswap.org", storage)).toBe(0);
  });
});

describe("2c9bbf25: a statement is attributed by its first-party publication", () => {
  it("the live Uniswap record reads as 43 statements, 6 claims and 20 proofs", () => {
    const page = parsePage(readFileSync("tests/fixtures/uniswap-page.json", "utf8"), "uniswap.org");
    const n = (k: string) => page.lines.filter((l) => l.kind === k).length;
    expect([n("statement"), n("claim"), n("proof")]).toEqual([43, 6, 20]);
    for (const id of ["L09", "L33"]) expect(page.lines.find((l) => l.id === id)!.kind).toBe("statement");
  });

  it("keeps the downgrade for a line citing only outside publications", () => {
    const line = { marked: "statement", kind: "statement" } as Line;
    expect(applyLabel(line, [], "Uniswap Labs", ["https://uniswap.org/terms-of-service", "https://news.example.com/a"], "uniswap.org").kind).toBe("statement");
    expect(applyLabel(line, [], "Uniswap Labs", ["https://news.example.com/a", "https://blog.other.com/b"], "uniswap.org").kind).toBe("claim");
  });
});

describe("ba8e9a2e and f28551d7: Proven counts the rows it renders; a contradicted check leaves it", () => {
  const P = (id: string, fact: boolean): Line => ({ id, kind: "proof", links: [], fact: fact ? { name: id, value: "1" } : null }) as unknown as Line;
  const lines = [P("P1", true), P("P2", false), P("P3", true), { id: "C1", kind: "claim", links: [{ type: "confirms", target: "P1" }] } as unknown as Line];
  it("counts the table check and the confirmed claim alike", () => {
    const s = settleAll(lines);
    expect(countLines(lines, s, new Set(["P1", "P3"])).proven).toBe(4);
    expect(countLines(lines, s, new Set(["P3"])).proven).toBe(3);
  });
  it("an affects contradiction moves a check into Contradicted", () => {
    const p3 = { kind: "proof" as const, links: [{ type: "contradicts" as const, target: "0xc1:N1", affects: true }] };
    const st = settleOf(p3, new Set(["P3"]), new Set(["P3", "0xc1:N1"]));
    expect(st).toMatchObject({ state: "contradicted", contradicts: ["0xc1:N1"] });
    expect(groupOf(rowClass(p3, st))).toBe("contradicted");
  });
});

/* ---------- Changes jobs ---------- */
const h = (c: string) => c.repeat(64);
const PAGE_HASH = h("a");
const PAGE = parsePage(
  JSON.stringify({
    subject: { name: "Example", channels: [{ label: "Site", url: "https://example.com/", tie: "strong" }] },
    summary: [{ text: "A decentralized protocol and an app are available.", lines: ["L1"] }],
    lines: [{ id: "L1", section: "what_it_does", text: "Example runs a protocol and an app.", kind: "statement", by: "Example", sources: ["S1"], quote: "protocol" }],
    sources: [{ id: "S1", ref: "https://example.com/", type: "page" }],
  }),
  "example.com",
);
const ANSWER_URL = "https://explorer.imd.fun/jobs/job-6";
function changesJob(id: string, body: object, answers: { title: string; answer: string; agreed: number; size: number; url: string }[] = []): Activity {
  const text = JSON.stringify({ sources: [{ id: "S1", url: "https://tracker.example.org/x", type: "article", publisher: "Tracker", could_open: true }], notes: "", ...body });
  const objective = `Judge the changes. The record so far: ${priorText({ files: [artifactUrl(PAGE_HASH)], answers })}. Channels already known: none known. The changes: (1) type: reword; target: summary sentence "A decentralized protocol and an app are available."; note: none; links: none`;
  return {
    req: { ...req(id, "example.com"), action: "job.open@job-1", kind: "changes", bodyJson: { objective } },
    state: "completed", time: null, ens: "alice.eth", jobId: null, oracle: null, refusal: null, sourcesError: null, edit: null, fileHash: h(id.slice(-1)), page: null, via: null, rejected: null, doneTime: null,
    sources: parseLines(text, { changes: true }),
    changes: parseChanges(text),
  } as unknown as Activity;
}

describe("dc91f104: a panel answer completed after the last rebuild still settles a new line", () => {
  it("resolves A1 of the changes job by the answer's URL among the subject's completed answers", () => {
    const panel = {
      req: { ...req("0xp1", "example.com"), action: ACTIONS.oracle, title: "Example runs an app", bodyJson: { question: "q" } },
      state: "completed", completion: { blockNumber: 3n, logIndex: 0, status: 0 }, jobId: "job-6", oracle: { answer: "true", agreed: 5, panelSize: 5 },
    } as unknown as Activity;
    const shownAnswers = shownAnswersOf([panel], undefined);
    expect(shownAnswers).toHaveLength(1);
    const job = changesJob("0xc1", {
      items: [{ n: 1, type: "links", target: "none", verdict: "kept", why: "", lines: ["N1"] }],
      lines: [{ id: "N1", source: "S1", section: "what_it_does", text: "Tracker says Example has no app.", kind: "claim", by: "Tracker", quote: "no app", links: [{ type: "contradicts", target: "A1" }] }],
      affects: [],
    }, [{ title: "Example runs an app", answer: "true", agreed: 5, size: 5, url: ANSWER_URL }]);
    const scope: LineScope = { pageHash: PAGE_HASH, after: [job], carried: new Map(), pageAnswers: shownAnswers };
    const all = applyChangeLinks(mergeRecord(PAGE, [{ key: "0xc1", data: job.sources!, payer: "a", jobHref: "", raised: true }]), scope).flatMap((s) => s.rows.map((r) => r.line));
    const n1 = all.find((l) => l.id === "0xc1:N1")!;
    expect(n1.links).toEqual([{ type: "contradicts", target: `A${shownAnswers[0]!.n}` }]);
    expect(settleAll(all).by.get("0xc1:N1")!.state).toBe("contradicted");
  });
});

describe("ff089edc: a later source can dispute a sentence an earlier kept change reworded", () => {
  it("matches the displayed text and skips only entries from before the rewrite", () => {
    const reword = changesJob("0xc1", { items: [{ n: 1, type: "reword", target: "x", verdict: "kept", why: "", final_text: "A decentralized protocol and a web app are available.", lines: [] }], lines: [], affects: [] });
    const later = changesJob("0xc2", {
      items: [{ n: 1, type: "links", target: "none", verdict: "kept", why: "", lines: ["N1"] }],
      lines: [{ id: "N1", source: "S1", section: "what_it_does", text: "Tracker says the web app shut down.", kind: "claim", by: "Tracker", quote: "shut down", links: [] }],
      affects: [{ kind: "summary", target: "A decentralized protocol and a web app are available.", type: "outdates", by_line: "N1" }],
    });
    const scope: LineScope = { pageHash: PAGE_HASH, after: [reword, later], carried: new Map() };
    const d = disputesOf(scope, (x) => x === "0xc2:N1");
    const sentence = { text: "A decentralized protocol and a web app are available.", original: "A decentralized protocol and an app are available.", rewordJob: reword };
    expect(sentenceDispute(sentence, d)).toMatchObject({ type: "outdates", by: "0xc2:N1" });
    expect(disputedCount(d, [], [sentence])).toBe(1);
    expect(d.fromKept).toBe(true);
    // The same entry from a job before the rewrite was superseded by it.
    const early = disputesOf({ ...scope, after: [later, reword] }, (x) => x === "0xc2:N1");
    expect(sentenceDispute(sentence, early)).toBeNull();
  });
});
