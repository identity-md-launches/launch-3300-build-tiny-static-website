/**
 * Revision 11 (brief item B5): a changes result is read whole, as a page result is. A 250-line result whose last
 * line contradicts a page line still marks that line, and a result past MAX_RESULT_ENTRIES says so in its Activity
 * row instead of dropping lines silently.
 */
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { Hex } from "viem";
import { artifactUrl, priorText } from "../src/bodies";
import { ACTIONS } from "../src/config";
import { coreOf, useRecordModel } from "../src/model";
import { MAX_RESULT_ENTRIES, parseChanges, parseLines, parsePage, tooLargeText, type Page } from "../src/page";
import { rowClass, settleAll } from "../src/settle";
import { SuggestProvider } from "../src/Suggest";
import { ActivityList } from "../src/ActivityList";
import type { Activity } from "../src/useActivity";

const h = (c: string) => c.repeat(64);
let block = 10n;
const req = (id: string, subject: string, kind: string, objective: string) => ({
  requestId: id as Hex, payer: "0x0000000000000000000000000000000000000001" as Hex, action: ACTIONS.research, body: "", bodyJson: { objective }, kind, title: "", subject, template: "", amount: 1n, blockNumber: block, transactionHash: `0x${id.slice(2).padEnd(64, "0")}` as Hex,
});
const base = { time: null, ens: "alice.eth", jobId: null, oracle: null, refusal: null, sourcesError: null, edit: null, changes: null, sources: null, page: null, via: null, rejected: null, doneTime: null, logo: null, logoHash: null, filesRead: true };
function pageJob(id: string, subject: string, page: Page, hash: string): Activity {
  block++;
  return { ...base, req: req(id, subject, "add", "Research the project."), state: "completed", completion: { blockNumber: block, logIndex: 0, status: 0 }, page, fileHash: hash } as unknown as Activity;
}
function changesJob(id: string, subject: string, pageHash: string, text: string): Activity {
  block++;
  const objective = `Judge the changes. The record so far: ${priorText({ files: [artifactUrl(pageHash)], answers: [] })}. Channels already known: none known. The changes: (1) type: links; target: none; note: none; links: none`;
  return { ...base, req: req(id, subject, "changes", objective), state: "completed", completion: { blockNumber: block, logIndex: 0, status: 0 }, fileHash: h(id.slice(-1)), sources: parseLines(text, { changes: true }), changes: parseChanges(text) } as unknown as Activity;
}

const PH = h("b");
const page = parsePage(
  JSON.stringify({
    subject: { name: "Proj", channels: [{ label: "Site", url: "https://proj.example/", tie: "strong" }] },
    summary: [{ text: "Proj runs a protocol.", lines: ["L1"] }],
    lines: [{ id: "L1", section: "fees", text: "Proj charges a fee of one token.", kind: "statement", by: "Proj", sources: ["S1"], quote: "one token" }],
    sources: [{ id: "S1", ref: "https://proj.example/", type: "page" }],
  }),
  "proj.example",
);

/**
 * A changes result of n lines and n sources; only the last line links, contradicting F1:L1, and affects lists F1:L1
 * as contradicted by it (as the changes instructions require). A reader that stopped before the last line would
 * drop both the link and the affects entry (its by_line is not among the lines read), so L1 would show no marker.
 */
function bigResult(n: number): string {
  const sources = Array.from({ length: n }, (_, i) => ({ id: `S${i + 1}`, url: `https://tracker.example.org/${i + 1}`, type: "article", publisher: "Tracker", could_open: true }));
  const lines = Array.from({ length: n }, (_, i) => ({
    id: `N${i + 1}`,
    source: `S${i + 1}`,
    section: "fees",
    text: i === n - 1 ? "Tracker says the fee is now ten tokens." : `Tracker notes item ${i + 1} about Proj.`,
    kind: "claim",
    by: "Tracker",
    quote: "fee",
    links: i === n - 1 ? [{ type: "contradicts", target: "F1:L1" }] : [],
  }));
  return JSON.stringify({ sources, lines, items: [{ n: 1, type: "links", target: "none", verdict: "kept", why: "", lines: lines.map((l) => l.id) }], affects: [{ kind: "line", target: "F1:L1", type: "contradicts", by_line: `N${n}` }], notes: "" });
}

function activityHtml(items: Activity[], subject: string): string {
  function Harness() {
    const m = useRecordModel(items, null, subject);
    const activity = { items: [...items].reverse(), error: null, loading: false, reload: async () => {} } as unknown as Parameters<typeof ActivityList>[0];
    return createElement(SuggestProvider, { subject, rec: m, children: createElement(ActivityList, { ...activity, shown: m, subject }) });
  }
  return renderToStaticMarkup(createElement(Harness));
}

describe("B5: a changes result is read whole", () => {
  it("a 250-line changes result whose last line contradicts F1:L1 still marks L1 Contradicted", () => {
    const job = changesJob("0xd1", "proj.example", PH, bigResult(250));
    expect(job.changes!.data.lines).toHaveLength(250);
    expect(job.changes!.data.sources).toHaveLength(250);
    expect(job.changes!.items[0]!.lines).toHaveLength(250);
    expect(job.changes!.data.tooLarge).toBeUndefined();
    expect(job.sources!.lines).toHaveLength(250);
    expect(job.changes!.data.lines[249]!.links).toEqual([{ type: "contradicts", target: "F1:L1" }]);

    const core = coreOf([pageJob("0xa1", "proj.example", page, PH), job]);
    const all = core.sections.flatMap((s) => s.rows.map((r) => r.line));
    const L1 = all.find((l) => l.id === "L1")!;
    expect(L1).toBeTruthy();
    expect(rowClass(L1, settleAll(all).by.get(L1.id))).toBe("contradicted");
    expect(core.counts).toMatchObject({ contradicted: 1 });
    // An ordinary result shows no size note in Activity.
    expect(activityHtml([pageJob("0xa2", "proj.example", page, PH), changesJob("0xd2", "proj.example", PH, bigResult(250))], "proj.example")).not.toContain("too large to show");
  });

  it(`a result past MAX_RESULT_ENTRIES (${MAX_RESULT_ENTRIES}) sets tooLarge and its Activity row says so`, () => {
    const n = MAX_RESULT_ENTRIES + 1;
    const job = changesJob("0xd3", "proj.example", PH, bigResult(n));
    expect(job.changes!.data.tooLarge).toBe(n);
    expect(job.sources!.tooLarge).toBe(n);
    expect(job.sources!.lines).toHaveLength(MAX_RESULT_ENTRIES);
    expect(tooLargeText(n)).toBe("This result is too large to show in full: 20,001 lines");
    const html = activityHtml([pageJob("0xa3", "proj.example", page, PH), job], "proj.example");
    expect(html).toContain(tooLargeText(n));
  }, 60_000); // builds a 20,001-entry result; over 5 s on a slow machine
});
