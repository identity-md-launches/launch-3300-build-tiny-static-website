/** The fourth review of Suggest changes: one block per finding (its id's first 8 characters). */
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { Hex } from "viem";
import { artifactUrl, priorText } from "../src/bodies";
import { addReady, changesBody, keyFactTarget, makeRefOf, parseItems, sameSentence, sentenceTarget, type Change } from "../src/changes";
import { carriedOf, type LineScope } from "../src/changeResult";
import { formatNumbers } from "../src/numbers";
import { mergeRecord, parsePage, type Line } from "../src/page";
import { refFromId } from "../src/subject";
import { ChangePanel, evidenceOf, liveTarget, planChanges, SuggestProvider } from "../src/Suggest";
import { retryRefs, retryTarget } from "../src/ActivityList";
import { lineOfFileRef } from "../src/model";
import { routeOf } from "../src/route";
import type { Activity } from "../src/useActivity";

const IMD = refFromId("imd.fun");
const h = (c: string) => c.repeat(64);
const OLD = h("a");
const NEW = h("d");

function act(over: Partial<Activity> & { objective: string; kind: string; requestId: string }): Activity {
  return {
    req: { requestId: over.requestId as Hex, payer: "0x0085000000000000000000000000000000059e00" as Hex, action: "job.open@job-1", body: "", bodyJson: { objective: over.objective }, kind: over.kind, title: "", subject: "imd.fun", template: "", amount: 0n, blockNumber: 1n, transactionHash: "0x01" as Hex },
    state: "completed", time: null, ens: "alice.eth", jobId: null, oracle: null, refusal: null, sources: null, sourcesError: null, edit: null, fileHash: null, page: null, via: null, rejected: null, doneTime: null,
    ...over,
  } as Activity;
}
const channel = { label: "Site", url: "https://imd.fun/", tie: "strong" };
const PAGE = parsePage(JSON.stringify({
  subject: { name: "IMD", channels: [channel] },
  lines: [
    { id: "L2", section: "what_it_does", text: "IMD is a token.", kind: "statement", by: "IMD", sources: ["S1"], quote: "the IMD token" },
    { id: "L3", section: "what_it_does", text: "The token is IMD.", kind: "claim", sources: ["S1"], quote: "IMD" },
  ],
  sources: [{ id: "S1", ref: "https://imd.fun/", type: "page" }],
}), "imd.fun");
/** A rebuild given PAGE as F1: L7 carries F1:L3 forward under a new id. */
const REBUILT = parsePage(JSON.stringify({
  subject: { name: "IMD", channels: [channel] },
  lines: [{ id: "L7", section: "what_it_does", text: "The token is IMD.", kind: "proof", rerun: "cast call", from: ["F1:L3"] }],
  sources: [],
}), "imd.fun");
const REBUILD_OBJECTIVE = `Rebuild the record. Start from the earlier results: ${priorText({ files: [artifactUrl(OLD)], answers: [] })}. Fetch each file.`;

function show(page: ReturnType<typeof parsePage>, pageHash: string, pageObjective: string, after: Activity[]) {
  const scope: LineScope = { pageHash, after, carried: carriedOf(page, pageObjective) };
  const sections = mergeRecord(page, []);
  const byId = new Map(sections.flatMap((s) => s.rows.map((r) => [r.line.id, r.line] as const)));
  return { scope, sections, byId, resolve: (id: string): Line | undefined => byId.get(id) };
}

describe("42e9982d: Add a link and try again keeps every line of a Key facts row", () => {
  // The change as it was sent: a Token row resting on L2 and L3 of F1 (the page shown then).
  const kf: Change = { id: "k", type: "backing", target: keyFactTarget("Token", "IMD", ["L2", "L3"], { file: OLD, id: "L2" }), note: "", links: [] };
  const refOf = makeRefOf({ files: [artifactUrl(OLD)], answers: [] }, artifactUrl(OLD), new Map());
  const objective = changesBody([kf], { files: [artifactUrl(OLD)], answers: [] }, [], IMD, refOf).objective;
  const item = parseItems(objective)[0]!;
  const job = act({ requestId: "0xch", kind: "changes", objective });

  it("sends F1:L2,F1:L3 and splits it back into two pairs", () => {
    expect(item.ref).toBe("F1:L2,F1:L3");
    expect(retryRefs(item.ref)).toEqual(["F1:L2", "F1:L3"]);
    expect(retryRefs("")).toEqual([]);
  });
  it("puts back a target with both line ids, which the next request sends again", () => {
    const shown = show(PAGE, OLD, "", []);
    const t = retryTarget(item, job, shown);
    expect(t).toMatchObject({ kind: "keyfact", lineIds: ["L2", "L3"], text: "Token: IMD" });
    expect(t.lost).toBeUndefined();
    const again: Change = { id: "r", type: "backing", target: t, note: "", links: ["https://example.com/receipt"], retry: "no source" };
    const live = new Map([["r", liveTarget({ scope: shown.scope, resolve: shown.resolve }, t)]]);
    const plan = planChanges({ pageHash: OLD, after: [], scope: shown.scope, results: [], answers: [], channels: [], subject: IMD }, [again], live);
    expect(plan.body.objective).toContain('target: F1:L2,F1:L3 key fact "Token: IMD"');
  });
  it("after a rebuild, finds the carried line under its new id", () => {
    const shown = show(REBUILT, NEW, REBUILD_OBJECTIVE, []);
    expect(retryTarget(item, job, shown)).toMatchObject({ lineIds: ["L7"] });
  });
  it("holds a row whose cited lines are all gone in Review, never sending it as text only", () => {
    const shown = show(REBUILT, NEW, "", []); // no from origins: nothing can be found
    const t = retryTarget(item, job, shown);
    expect(t.lost).toBe(true);
    expect(liveTarget({ scope: shown.scope, resolve: shown.resolve }, t)).toBeNull();
    const c: Change = { id: "x", type: "backing", target: t, note: "", links: ["https://example.com/receipt"] };
    const plan = planChanges({ pageHash: NEW, after: [], scope: shown.scope, results: [], answers: [], channels: [], subject: IMD }, [c], new Map([["x", null]]));
    expect(plan.gone.has("x")).toBe(true);
  });
});

describe("89a6d9c5: a kept rewording's dots follow lines a rebuild carried forward", () => {
  it("resolves the result's F1:L3 to the rebuilt page's L7", () => {
    const { scope, byId } = show(REBUILT, NEW, REBUILD_OBJECTIVE, []);
    expect(lineOfFileRef([{ n: 1, hash: OLD }], 1, "L3", scope, byId)?.id).toBe("L7");
    expect(lineOfFileRef([{ n: 1, hash: OLD }], 1, "L2", scope, byId)).toBeUndefined();
    expect(lineOfFileRef([{ n: 1, hash: OLD }], 2, "L3", scope, byId)).toBeUndefined();
  });
  it("still resolves a line of the page shown", () => {
    const { scope, byId } = show(PAGE, OLD, "", []);
    expect(lineOfFileRef([{ n: 1, hash: OLD }], 1, "L3", scope, byId)?.id).toBe("L3");
  });
});

describe("293df307: a rewording equal to the sentence on the page is not a change", () => {
  const raw = "The treasury holds 59822.623566003452582778 imdUSD.";
  const shown = formatNumbers(raw);
  it("refuses the exact text and the displayed text", () => {
    expect(shown).toBe("The treasury holds 59,822.62 imdUSD.");
    expect(sameSentence(shown, [raw, shown])).toBe(true);
    expect(sameSentence(`  ${shown.toUpperCase()} `, [raw, shown])).toBe(true);
    expect(addReady("reword", shown, [], 0, [raw, shown]).ok).toBe(false);
    expect(addReady("reword", raw, [], 0, [raw, shown]).ok).toBe(false);
    expect(addReady("reword", "The treasury holds 60,000 imdUSD.", [], 0, [raw, shown]).ok).toBe(true);
  });
  it("the panel compares against both", () => {
    expect(readFileSync("src/Suggest.tsx", "utf8")).toContain('type === "reword" ? [target.text, formatNumbers(target.text)] : ""');
  });
});

describe("7a4f89f3: numbers group quantities and leave ids, blocks and dates alone", () => {
  it("groups 2000 tokens", () => {
    expect(formatNumbers("Outstanding 2000 tokens")).toBe("Outstanding 2,000 tokens");
    expect(formatNumbers("a supply of 2000 tokens")).toBe("a supply of 2,000 tokens");
  });
  it("keeps blocks and ids after a colon, and UUIDs whole", () => {
    expect(formatNumbers("Block: 26445600")).toBe("Block: 26445600");
    expect(formatNumbers("Request ID: 12345678-1234-5678-1234-123456789012")).toBe("Request ID: 12345678-1234-5678-1234-123456789012");
    expect(formatNumbers("see 12345678-1234-5678-1234-123456789012 now")).toBe("see 12345678-1234-5678-1234-123456789012 now");
    expect(formatNumbers("chain id: 8453")).toBe("chain id: 8453");
  });
  it("keeps years where a date is meant", () => {
    for (const k of ["launched in 2024", "since March 2024", "Q3 2025", "(2021)", "2021–2023", "2024-05-01"]) expect(formatNumbers(k)).toBe(k);
  });
  it("shows the facts table's block as supplied", () => {
    const rec = readFileSync("src/Record.tsx", "utf8");
    expect(rec).toContain(', block <span className="num">{f.block}</span>');
    expect(rec).not.toContain('toLocaleString("en-US") : f.block');
  });
});

describe("the panel and Review markup", () => {
  const rec = { scope: {} as never, resolve: () => undefined, sections: [] };
  const render = (el: React.ReactElement) => renderToStaticMarkup(createElement(SuggestProvider, { subject: "imd.fun", rec, children: el }));
  const long = "VeryLongUnbrokenQuote".repeat(19);
  const lines: Line[] = [
    { id: "L2", section: "about", text: "A proof.", kind: "proof", marked: "proof", labelNote: "", channel: null, by: "", sources: [], srcKeys: [], quote: "", rerun: "cast call", fact: null, from: [], links: [] },
    { id: "L3", section: "about", text: "A claim.", kind: "claim", marked: "claim", labelNote: "", channel: null, by: "Example Weekly", sources: [], srcKeys: [], quote: long, rerun: "", fact: null, from: [], links: [] },
  ];
  it("78593ea4: a Key facts panel shows each quote whole, and says when a proof has none", () => {
    const html = render(createElement(ChangePanel, { target: keyFactTarget("Token", "IMD", ["L2", "L3"]), mode: "line", evidence: evidenceOf(lines) }));
    expect(html).toContain(`“${long}”`);
    expect(html).toContain('class="ev-quote ev-quote-full"');
    expect(html).not.toContain('class="ev-text"');
    expect(html).toContain("No quote: this line is a re-runnable check.");
    const css = readFileSync("src/styles.css", "utf8");
    expect(css).toMatch(/\.ev-quote-full \{ display: block; overflow-wrap: anywhere;/);
    expect(css).not.toMatch(/\.ev-quote-full \{[^}]*line-clamp/);
  });
  it("0951e1d5: Ask a panel to check it is a separate button, not one of the radios", () => {
    const html = render(createElement(ChangePanel, { target: keyFactTarget("Token", "IMD", ["L2"]), mode: "line", evidence: evidenceOf(lines) }));
    expect(html.match(/type="radio"/g)).toHaveLength(3);
    expect(html).not.toContain('value="panel"');
    expect(html).toMatch(/<button type="button" class="opt opt-action"><span class="opt-word">Ask a panel to check it/);
  });
  it("3f52e4db: an opened panel scrolls below the sticky header, heading first when it is taller than the room", () => {
    const src = readFileSync("src/Suggest.tsx", "utf8");
    expect(src).toContain("if (ref.current) revealPanel(ref.current);");
    expect(src).not.toContain('scrollIntoView?.({ block: "nearest" })');
    expect(src).toContain('document.querySelector<HTMLElement>(".top")');
  });
  it("56cd5bac: a rewording in Review shows only the new sentence", () => {
    expect(readFileSync("src/Suggest.tsx", "utf8")).toContain('{c.target.text && c.type !== "reword" && (');
  });
  it("62e7b854: the Review footer is one grid row with a request link", () => {
    const src = readFileSync("src/Suggest.tsx", "utf8");
    expect(src).toMatch(/<a\s+className="review-read"\s+href="#review-body"/);
    const css = readFileSync("src/styles.css", "utf8");
    expect(css).toMatch(/\.review-foot \{ display: grid; grid-template-columns: minmax\(0, auto\) minmax\(0, 1fr\) auto;/);
    expect(css).not.toMatch(/\.review-foot \{[^}]*flex-wrap/);
  });
  it("9ff9ae34: the link editor takes focus and gives it back", () => {
    const src = readFileSync("src/Suggest.tsx", "utf8");
    expect(src).toContain("if (open) box.current?.focus();");
    expect(src).toContain("btn.current?.focus();");
  });
});

describe("df2f0beb: the Overview footer is four links with destinations", () => {
  it("routes add-line and add-links to Overview", () => {
    expect(routeOf("#/s/imd.fun/add-line")).toMatchObject({ subject: "imd.fun", tab: "overview", target: "add-line" });
    expect(routeOf("#/s/imd.fun/add-links")).toMatchObject({ subject: "imd.fun", tab: "overview", target: "add-links" });
  });
  it("renders the first two as links", () => {
    const src = readFileSync("src/Suggest.tsx", "utf8");
    expect(src).toMatch(/<a href=\{to\(ADD_LINE\)\}[^>]*>\s*Add a missing line/);
    expect(src).toMatch(/<a href=\{to\(ADD_LINKS\)\}[^>]*>\s*Add links to read/);
  });
});

describe("42b6c09e: a wallet on another chain keeps its chip and menu", () => {
  it("renders Switch to Ethereum beside the chip", () => {
    const w = readFileSync("src/wallet.tsx", "utf8");
    expect(w).toMatch(/if \(chainId !== CHAIN_ID\)\s*return \(\s*<div className="acct-wrap">[\s\S]*Switch to Ethereum[\s\S]*\{chip\}/);
  });
});

it("keeps sentence targets as they were", () => {
  expect(sentenceTarget(" A. ").text).toBe("A.");
});
