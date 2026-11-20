/** The third review of Suggest changes: one block per finding. */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { Hex } from "viem";
import { artifactUrl, encodeBody, MAX_OBJECTIVE, priorText } from "../src/bodies";
import { changesBody, fitChangesPrior, lineTarget, makeRefOf, newChangeId, parseItems, type Change } from "../src/changes";
import { applyChangeLinks, carriedOf, lineInFile, originOfLine, resolveChangeTarget, type LineScope } from "../src/changeResult";
import { isFactRow, mergeRecord, parseChanges, parseLines, parsePage, type Line } from "../src/page";
import { settleAll } from "../src/settle";
import { refFromId } from "../src/subject";
import { liveTarget, planChanges } from "../src/Suggest";
import type { Activity } from "../src/useActivity";

const IMD = refFromId("imd.fun");
const h = (c: string) => c.repeat(64);
const OLD = h("a");
const NEW = h("d");
const SRC = h("b");

function act(over: Partial<Activity> & { objective: string; kind: string; requestId: string }): Activity {
  return {
    req: { requestId: over.requestId as Hex, payer: "0x0085000000000000000000000000000000059e00" as Hex, action: "job.open@job-1", body: "", bodyJson: { objective: over.objective }, kind: over.kind, title: "", subject: "imd.fun", template: "", amount: 0n, blockNumber: 1n, transactionHash: "0x01" as Hex },
    state: "completed", time: null, ens: "alice.eth", jobId: null, oracle: null, refusal: null, sources: null, sourcesError: null, edit: null, fileHash: null, page: null, via: null, rejected: null, doneTime: null,
    ...over,
  } as Activity;
}

const channel = { label: "Site", url: "https://imd.fun/", tie: "strong" };
const OLD_PAGE = parsePage(JSON.stringify({
  subject: { name: "IMD", channels: [channel] },
  lines: [{ id: "L1", section: "what_it_does", text: "IMD is a swarm of agents.", kind: "statement", by: "IMD", sources: ["S1"], quote: "a swarm of agents" }],
  sources: [{ id: "S1", ref: "https://imd.fun/", type: "page" }],
}), "imd.fun");
/** A rebuild given the old page as F1: L99 carries F1:L1, and L1 is reused for another sentence. */
const NEW_PAGE = parsePage(JSON.stringify({
  subject: { name: "IMD", channels: [channel] },
  lines: [
    { id: "L1", section: "what_it_does", text: "The registry is public.", kind: "statement", by: "IMD", sources: ["S1"], quote: "public" },
    { id: "L99", section: "what_it_does", text: "IMD is a swarm of agents.", kind: "statement", by: "IMD", sources: ["S1"], quote: "a swarm of agents", from: ["F1:L1"] },
  ],
  sources: [{ id: "S1", ref: "https://imd.fun/", type: "page" }],
}), "imd.fun");
const REBUILD_OBJECTIVE = `Rebuild the record. Start from the earlier results: ${priorText({ files: [artifactUrl(OLD)], answers: [] })}. Fetch each file.`;

const CHANGES_RESULT = JSON.stringify({
  items: [{ n: 1, type: "context", target: "F1:L1", verdict: "kept", why: "The docs add the registry.", lines: ["C1"] }, { n: 2, type: "backing", target: "F1:L1", verdict: "kept", why: "The registry lists 5.", lines: ["C2"] }],
  sources: [{ id: "S1", url: "https://imd.fun/docs", type: "page", publisher: "IMD", could_open: true, about_subject: true }],
  lines: [
    { id: "C1", source: "S1", section: "what_it_does", text: "IMD says its agents are listed in a public registry.", kind: "statement", by: "IMD", quote: "listed in a public registry", links: [{ type: "context", target: "F1:L1" }] },
    { id: "C2", source: "S1", section: "on_chain", text: "The registry contract returns 5 agents.", kind: "proof", rerun: "Call count() on the registry on chain 1.", fact: { name: "Registry agents", value: "5", unit: "agents" }, links: [{ type: "confirms", target: "F1:L1" }] },
  ],
});
const changesJob = (objective: string) => act({ requestId: "0xch", kind: "changes", objective, changes: parseChanges(CHANGES_RESULT), fileHash: h("c") });
const objectiveFor = (files: string[]) => `A visitor proposes changes. The record so far: ${priorText({ files, answers: [] })}. The subject's channels: none. The changes: (1) …`;

function show(page: ReturnType<typeof parsePage>, pageHash: string, pageObjective: string, after: Activity[]) {
  const scope: LineScope = { pageHash, after, carried: carriedOf(page, pageObjective) };
  const jobs = after.filter((a) => a.changes || a.sources).map((a) => ({ key: a.req.requestId, data: a.changes?.data ?? a.sources!, payer: "0x0085…059e", jobHref: "", raised: !!a.changes }));
  const sections = applyChangeLinks(mergeRecord(page, jobs), scope);
  const byId = new Map(sections.flatMap((s) => s.rows.map((r) => [r.line.id, r.line] as const)));
  return { scope, sections, byId, resolve: (id: string): Line | undefined => byId.get(id) };
}

describe("d800b36b: a rebuild keeps settled changes on the lines they target", () => {
  it("before the rebuild, L1 shows Context C1 and is Proven by C2", () => {
    const { byId } = show(OLD_PAGE, OLD, "", [changesJob(objectiveFor([artifactUrl(OLD)]))]);
    expect(byId.get("L1")!.links).toEqual([{ type: "context", target: "0xch:C1" }, { type: "confirms", target: "0xch:C2" }]);
  });
  it("after a rebuild that carried F1:L1 into L99, the links follow it to L99 and not the reused L1", () => {
    const { byId, sections } = show(NEW_PAGE, NEW, REBUILD_OBJECTIVE, [changesJob(objectiveFor([artifactUrl(OLD)]))]);
    expect(byId.get("L99")!.links).toEqual([{ type: "context", target: "0xch:C1" }, { type: "confirms", target: "0xch:C2" }]);
    expect(byId.get("L1")!.links).toEqual([]);
    expect(settleAll(sections.flatMap((s) => s.rows.map((r) => r.line))).by.get("L99")!.state).toBe("proven");
  });
  it("resolves an F-number through the shown rebuild's from origins, and nothing for an unknown file", () => {
    const { scope, resolve } = show(NEW_PAGE, NEW, REBUILD_OBJECTIVE, []);
    const a = changesJob(objectiveFor([artifactUrl(OLD)]));
    expect(resolveChangeTarget("F1:L1", a, scope, (x) => !!resolve(x))).toBe("L99");
    expect(lineInFile(h("e"), "L1", scope, (x) => !!resolve(x))).toBeNull();
  });
});

describe("2ee61ab9: a raised proof with a fact stays in the on-chain facts table", () => {
  it("lists C2 as a fact row with its raised origin, while a page fact row has none and a sources job's proof is not one", () => {
    const { sections } = show(OLD_PAGE, OLD, "", [changesJob(objectiveFor([artifactUrl(OLD)]))]);
    const rows = sections.flatMap((s) => s.rows);
    const c2 = rows.find((r) => r.line.id === "0xch:C2")!;
    expect(isFactRow(c2)).toBe(true);
    expect(c2.origin).toMatchObject({ raised: true, payer: "0x0085…059e" });
    expect(isFactRow({ ...c2, origin: { payer: "x", jobHref: "" } })).toBe(false);
    expect(isFactRow({ ...c2, origin: null })).toBe(true);
  });
  it("the facts table shows the raised-by label on the row", () => {
    const src = readFileSync("src/Record.tsx", "utf8");
    expect(src).toContain("const factRows = all.filter(isFactRow);");
    expect(src).toMatch(/row-text">\{f\.name\}<\/span>\s*<\/button>\s*\{row\.origin\?\.raised && <span className="by small block">raised by \{row\.origin\.payer\}<\/span>\}/);
  });
});

describe("e66a0e4f: a saved draft stays on the row the visitor chose", () => {
  const draft = lineTarget("L1", "IMD is a swarm of agents.", originOfLine("L1", { pageHash: OLD, after: [] }));
  it("saves the artifact hash and the line id with the draft", () => {
    expect(draft).toMatchObject({ file: OLD, fileLine: "L1", key: "line:L1" });
  });
  it("after the rebuild the draft attaches to L99, and the request names F1:L99 with the original sentence", () => {
    const { scope, resolve } = show(NEW_PAGE, NEW, REBUILD_OBJECTIVE, []);
    const live = liveTarget({ scope, resolve }, draft);
    expect(live).toMatchObject({ key: "line:L99", lineId: "L99" });
    const c: Change = { id: newChangeId(), type: "context", target: draft, note: "It runs on Ethereum.", links: [] };
    const plan = planChanges({ pageHash: NEW, after: [], scope, results: [], answers: [], channels: [], promptChannels: { list: [], more: 0 }, subject: IMD }, [c], new Map([[c.id, live]]));
    expect(parseItems(plan.body.objective)[0]).toMatchObject({ ref: "F1:L99", text: "IMD is a swarm of agents." });
    expect(plan.gone.size + plan.unplaced.size).toBe(0);
  });
  it("a draft whose row is gone, or an older bare-id draft whose id now names another sentence, must be chosen again", () => {
    const { scope, resolve } = show(NEW_PAGE, NEW, `no prior`, []);
    expect(liveTarget({ scope, resolve }, draft)).toBeNull();
    expect(liveTarget({ scope, resolve }, lineTarget("L1", "IMD is a swarm of agents."))).toBeNull();
    const c: Change = { id: "c1", type: "context", target: draft, note: "x y z", links: [] };
    expect(planChanges({ pageHash: NEW, after: [], scope, results: [], answers: [], channels: [], promptChannels: { list: [], more: 0 }, subject: IMD }, [c], new Map([["c1", null]])).gone.has("c1")).toBe(true);
  });
});

describe("e1648bd6: every row target carries its file number and line id", () => {
  const src = act({ requestId: "0xsrc", kind: "sources", objective: "sources", fileHash: SRC });
  src.sources = parseLines(JSON.stringify({ sources: [{ id: "S1", url: "https://blog.example/imd", type: "page", publisher: "A blog", could_open: true, about_subject: true }], lines: [{ id: "N1", source: "S1", section: "history", text: "A blog says IMD launched in 2026.", kind: "claim", by: "A blog", quote: "launched in 2026" }] }));
  it("reserves the targeted sources result before any other file", () => {
    const { scope, resolve } = show(OLD_PAGE, OLD, "", [src]);
    const t = lineTarget("0xsrc:N1", "A blog says IMD launched in 2026.", originOfLine("0xsrc:N1", scope));
    expect(t).toMatchObject({ file: SRC, fileLine: "N1" });
    const fillers = Array.from({ length: 60 }, (_, i) => ({ id: `0xf${i}`, url: artifactUrl(i.toString(16).padStart(64, "f")) }));
    const c: Change = { id: "c1", type: "context", target: t, note: "The launch was in 2025.", links: [] };
    const rec = { pageHash: OLD, after: [src], scope, results: [{ id: "0xsrc", url: artifactUrl(SRC) }, ...fillers], answers: [], channels: [], promptChannels: { list: [], more: 0 }, subject: IMD };
    const plan = planChanges(rec, [c], new Map([["c1", liveTarget({ scope, resolve }, t)]]));
    expect(plan.body.objective.length).toBeLessThan(MAX_OBJECTIVE);
    const f = plan.body.objective.indexOf(artifactUrl(SRC));
    expect(f).toBeGreaterThan(0);
    const item = parseItems(plan.body.objective)[0]!;
    expect(item.ref).toMatch(/^F\d+:N1$/);
    expect(plan.body.objective).toContain(`[${item.ref.split(":")[0]}] ${artifactUrl(SRC)}`);
    expect(plan.unplaced.size).toBe(0);
    expect(encodeBody(plan.body).length).toBeGreaterThan(0);
  });
  it("names the required files that do not fit, and the changes on them are held", () => {
    const urls = ["u1", "u2", "u3"].map((x) => artifactUrl(x.padEnd(64, "0")));
    const fit = fitChangesPrior("page", urls.map((url, i) => ({ id: String(i), url })), [], [urls[0]!, urls[2]!], (p) => p.files.length * 4000);
    expect(fit.prior.files).toEqual(["page"]);
    expect(fit.missing.sort()).toEqual([urls[0], urls[2]].sort());
    const roomy = fitChangesPrior("page", urls.map((url, i) => ({ id: String(i), url })), [], [urls[0]!], (p) => p.files.length * 3000);
    expect(roomy.prior.files).toEqual(["page", urls[0]]);
    expect(roomy.missing).toEqual([]);
  });
});

describe("CSS and copy findings", () => {
  const css = readFileSync("src/styles.css", "utf8");
  it("9e416ed9: What to check stays one column through 39.99rem", () => {
    expect(css).toContain("@media (min-width: 40rem) { .seg { grid-template-columns: repeat(3, minmax(0, 1fr)); } }");
    expect(css).not.toContain("@media (min-width: 30rem) { .seg");
  });
  it("f591ee05: touch pencils at 0.74 opacity", () => {
    expect(css).toContain("@media (hover: none) { .pencil { opacity: 0.74; width: 40px; height: 40px; } }");
  });
  it("2b09b99e: lookup padding 8px through 25rem; 2px gap, 6px button padding and 14px label below 23rem", () => {
    expect(css).toMatch(/@media \(max-width: 25rem\) \{\s*\.lookup input \{ padding: 0 var\(--space-2\); \}\s*\.lookup \.btn-lookup \{ padding: 0 var\(--space-2\); \}/);
    expect(css).toMatch(/@media \(max-width: 22\.99rem\) \{\s*\.lookup \{ gap: 2px; \}[\s\S]*?\.lookup \.btn-lookup \{ padding: 0 6px; font-size: var\(--text-nav\); \}/);
  });
  it("fe85fe21: Home's first step leads to suggesting changes", () => {
    const home = readFileSync("src/Home.tsx", "utf8");
    expect(home).toContain('text: "add a project or suggest changes to its record."');
    expect(home).not.toContain("a batch of links, or an edit to a summary");
  });
});
