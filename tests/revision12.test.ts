import "./legacy-gate";
/**
 * Revision 12, answering an outside review: a set of changes passes the instruction preflight before its pay dialog;
 * wagmi persists nothing (no address in storage) and a silent reconnect is not undone when the provider mounts; the
 * published instructions make linked channels statements; a summary patch wins over the same job's final_text; a
 * later patch clears an earlier dispute on a Key facts row; a patched Website row links to its new address.
 */
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { Hex } from "viem";
import { askInstructionsReachable, needsInstructionCheck } from "../src/App";
import { artifactUrl, priorText, sourceBody } from "../src/bodies";
import { changesBody, lineTarget, type Change } from "../src/changes";
import { disputesOf, repairedJobs } from "../src/changeResult";
import { ACTIONS } from "../src/config";
import { INSTRUCTIONS } from "../src/instructions";
import { urlOfValue, withPatches, type KeyRow } from "../src/keyfacts";
import { unfoldedCount, coreOf, useRecordModel } from "../src/model";
import { parseChanges, parseLines, parsePage, type Page } from "../src/page";
import { OverviewTab, type Ui } from "../src/Record";
import { SuggestProvider } from "../src/Suggest";
import { refFromId } from "../src/subject";
import type { Activity } from "../src/useActivity";
import { dropWalletSnapshots, WALLET_FLAG } from "../src/walletFlag";

const h = (c: string) => c.repeat(64);
let block = 10n;
const req = (id: string, subject: string, kind: string, objective: string) => ({
  requestId: id as Hex, payer: "0x0085000000000000000000000000000000000000" as Hex, action: ACTIONS.research, body: "", bodyJson: { objective }, kind, title: "", subject, template: "", amount: 1n, blockNumber: block, transactionHash: `0x${id.slice(2).padEnd(64, "0")}` as Hex,
});
const base = { time: null, ens: null, jobId: null, oracle: null, refusal: null, sourcesError: null, edit: null, changes: null, sources: null, page: null, via: null, rejected: null, doneTime: null, logo: null, logoHash: null, filesRead: true };
function pageJob(id: string, subject: string, page: Page, hash: string): Activity {
  block++;
  return { ...base, req: req(id, subject, "add", "Research the project."), state: "completed", completion: { blockNumber: block, logIndex: 0, status: 0 }, page, fileHash: hash } as unknown as Activity;
}
function changesJob(id: string, subject: string, pageHash: string, body: object, changesText = "(1) type: links; target: none; note: none; links: none"): Activity {
  block++;
  const text = JSON.stringify({ sources: [{ id: "S1", url: "https://tracker.example.org/x", type: "article", publisher: "Tracker", could_open: true }], notes: "", ...body });
  const objective = `Judge the changes. The record so far: ${priorText({ files: [artifactUrl(pageHash)], answers: [] })}. Channels already known: none known. The changes: ${changesText}`;
  return { ...base, req: req(id, subject, "changes", objective), state: "completed", completion: { blockNumber: block, logIndex: 0, status: 0 }, fileHash: h(id.slice(-1)), sources: parseLines(text, { changes: true }), changes: parseChanges(text) } as unknown as Activity;
}
const ui: Ui = { filter: "all", setFilter: () => {}, openSet: new Set(), toggle: () => {}, openLines: () => {}, target: null };
function render(items: Activity[], subject: string) {
  let model!: ReturnType<typeof useRecordModel>;
  function Harness() {
    const m = useRecordModel(items, null, subject);
    model = m;
    return createElement(SuggestProvider, { subject, rec: m, children: createElement(OverviewTab, { m, ui, items, price: "", subjects: [] }) });
  }
  return { html: renderToStaticMarkup(createElement(Harness)), m: model };
}
const notice = (html: string) => /A newer source disputes ([\d,]+) parts? of this page\./.exec(html)?.[1] ?? null;
const claim = (id: string, text: string) => ({ id, source: "S1", section: "what_it_does", text, kind: "claim", by: "Tracker", quote: "seats", links: [] });

/* ---------- f4f56092: changes go through the instruction preflight ---------- */
describe("f4f56092: a set of changes is checked before its pay dialog", () => {
  const C: Change[] = [{ id: "1", type: "context", target: lineTarget("L1", "IMD is a swarm of agents."), note: "", links: ["https://imd.fun/docs"] }];
  const body = changesBody(C, { files: [artifactUrl(h("a"))], answers: [] }, [], refFromId("imd.fun"), () => "F1:L1");
  const ask = { title: "Submit 1 change", action: ACTIONS.research, kind: "changes", body, instructions: "changes" as const };

  it("needs the check (also without the instructions field) and tries both addresses before refusing", async () => {
    expect(needsInstructionCheck(ask)).toBe(true);
    expect(needsInstructionCheck({ ...ask, instructions: undefined })).toBe(true);
    const tried: string[] = [];
    const down = (async (u: string) => {
      tried.push(String(u));
      return new Response("Gateway Timeout", { status: 504 });
    }) as unknown as typeof fetch;
    expect(await askInstructionsReachable({ ...ask, instructions: undefined }, down)).toBe(false);
    expect(tried).toEqual([INSTRUCTIONS.changes.url, INSTRUCTIONS.changes.fallbackUrl]);
  });

  it("passes when the second address gives the exact bytes", async () => {
    const tried: string[] = [];
    const second = (async (u: string) => {
      tried.push(String(u));
      return String(u) === INSTRUCTIONS.changes.fallbackUrl ? new Response(INSTRUCTIONS.changes.text) : new Response("", { status: 504 });
    }) as unknown as typeof fetch;
    expect(await askInstructionsReachable(ask, second)).toBe(true);
    expect(tried.length).toBe(2);
  });

  it("a changes request whose objective names no instruction file is never offered; a sources request opens as before", async () => {
    expect(await askInstructionsReachable({ ...ask, body: { objective: "Judge these changes." } }, (() => Promise.reject(new Error("no fetch"))) as typeof fetch)).toBe(false);
    const src = { title: "Add a source", action: ACTIONS.research, kind: "source", body: sourceBody(["https://imd.fun/docs"], [], "", refFromId("imd.fun")) };
    expect(needsInstructionCheck(src)).toBe(false);
  });
});

/* ---------- ce3a87b4 / f7c52d45: no wallet snapshot in storage ---------- */
describe("ce3a87b4: wagmi persists nothing; an old snapshot is removed and the one flag kept", () => {
  it("dropWalletSnapshots removes every wagmi.* key and keeps the site's flag", () => {
    const m = new Map<string, string>([
      ["wagmi.store", JSON.stringify({ state: { connections: { __type: "Map", value: [["x", { accounts: ["0x1111111111111111111111111111111111117aBc"] }]] } } })],
      ["wagmi.recentConnectorId", '"injected"'],
      ["wagmi.injected.connected", "true"],
      [WALLET_FLAG, "1"],
      ["imd-record:tray:imd.fun", "[]"],
    ]);
    const storage = { get length() { return m.size; }, key: (i: number) => [...m.keys()][i] ?? null, getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k), clear: () => m.clear() };
    (globalThis as { localStorage?: unknown }).localStorage = storage;
    try {
      expect(dropWalletSnapshots()).toBe(3);
      expect([...m.keys()]).toEqual([WALLET_FLAG, "imd-record:tray:imd.fun"]);
      expect([...m.values()].join(" ")).not.toMatch(/0x[0-9a-fA-F]{40}/);
    } finally {
      delete (globalThis as { localStorage?: unknown }).localStorage;
    }
  });
  it("the wagmi config has no storage, and the browser wallet connector is a targeted injected one with id injected", async () => {
    const { config } = await import("../src/wallet");
    expect(config.storage).toBeNull();
    expect(config.connectors[0]!.id).toBe("injected");
    expect(config.connectors[0]!.type).toBe("injected");
  });
});

/* ---------- a17bafd2: a summary patch wins over the same job's final_text ---------- */
describe("a17bafd2: a corrected summary sentence shows the patch, its evidence, payer and earlier wording", () => {
  const PH = h("b");
  const OLD = "There are 2,000 seats.";
  const NEW = "There are 2,100 seats.";
  const page = parsePage(
    JSON.stringify({
      subject: { name: "Proj", channels: [{ label: "Site", url: "https://proj.example/", tie: "strong" }] },
      summary: [{ text: OLD, lines: ["L1"] }],
      lines: [{ id: "L1", section: "what_it_does", text: "Proj has 2,000 seats.", kind: "statement", by: "Proj", sources: ["S1"], quote: "seats" }],
      sources: [{ id: "S1", ref: "https://proj.example/", type: "page" }],
    }),
    "proj.example",
  );
  it("rests on the patch's lines [N1], says Updated by a change from the payer and keeps the earlier text", () => {
    const first = pageJob("0xa1", "proj.example", page, PH);
    const c = changesJob(
      "0xc1",
      "proj.example",
      PH,
      {
        items: [{ n: 1, type: "wrong", target: `summary sentence "${OLD}"`, verdict: "kept", why: "", final_text: NEW, lines: ["N2"] }],
        lines: [claim("N1", "Tracker says there are 2,100 seats."), claim("N2", "Tracker says seats were added.")],
        affects: [{ kind: "summary", target: OLD, type: "outdates", by_line: "N1" }],
        patches: [{ kind: "summary", target: OLD, value: NEW, lines: ["N1"] }],
      },
      `(1) type: wrong; target: summary sentence "${OLD}"; note: none; links: none`,
    );
    const { m, html } = render([first, c], "proj.example");
    const s = m.summary[0]!;
    expect(s.text).toBe(NEW);
    expect(s.updatedBy).toBeTruthy();
    expect(s.correctedBy).toBeUndefined();
    expect(s.earlier).toBe(OLD);
    expect(s.refs.map((l) => l.id)).toEqual(["0xc1:N1"]);
    // No "corrected by 0x…" text inside the paragraph: one pencil after the dots, and one line under the summary.
    expect(html).not.toMatch(/corrected by <span|corrected by 0x|Updated by a change from <span class="mono">/);
    expect(html).toContain('aria-label="Corrected by a visitor: show the change"');
    expect(notice(html)).toBeNull();
  });
});

/* ---------- 794a3c1a: a later patch clears an earlier dispute on the same row ---------- */
describe("794a3c1a: a newer patch repairs a Key facts row an earlier job disputed", () => {
  const PH = h("c");
  const page = parsePage(
    JSON.stringify({
      subject: { name: "Proj", channels: [{ label: "Site", url: "https://proj.example/", tie: "strong" }] },
      summary: [{ text: "Proj sells seats.", lines: ["L1"] }],
      infobox: [{ label: "Seats", value: "2,000", lines: ["L1"] }],
      lines: [{ id: "L1", section: "what_it_does", text: "Proj has 2,000 seats.", kind: "statement", by: "Proj", sources: ["S1"], quote: "seats" }],
      sources: [{ id: "S1", ref: "https://proj.example/", type: "page" }],
    }),
    "proj.example",
  );
  const kept = { items: [{ n: 1, type: "links", target: "none", verdict: "kept", why: "", lines: ["N1"] }], lines: [claim("N1", "Tracker says there are 2,100 seats.")] };
  const affects = [{ kind: "infobox", target: "Seats", type: "outdates", by_line: "N1" }];
  it("shows 2,100 with its normal badge, no dispute banner, and the page is not out of date", () => {
    const first = pageJob("0xa1", "proj.example", page, PH);
    const early = changesJob("0xc1", "proj.example", PH, { ...kept, affects, patches: [] });
    const later = changesJob("0xc2", "proj.example", PH, { ...kept, affects, patches: [{ kind: "infobox", target: "Seats", value: "2,100", lines: ["N1"] }] });
    const { html, m } = render([first, early, later], "proj.example");
    expect(m.disputes.infobox.size).toBe(0);
    expect(notice(html)).toBeNull();
    expect(html).toContain("2,100");
    expect(html).toContain("Reported by Tracker");
    expect(html).not.toContain(">Out of date<");
    const core = coreOf([first, early, later]);
    expect(repairedJobs(core.unfolded).size).toBe(2);
    expect(unfoldedCount(core)).toBe(0);
  });
  it("a dispute from a job that completed after the patch still counts", () => {
    const first = pageJob("0xa1", "proj.example", page, PH);
    const patched = changesJob("0xc1", "proj.example", PH, { ...kept, affects, patches: [{ kind: "infobox", target: "Seats", value: "2,100", lines: ["N1"] }] });
    const after = changesJob("0xc2", "proj.example", PH, { ...kept, affects, patches: [] });
    const { html, m } = render([first, patched, after], "proj.example");
    expect(m.disputes.infobox.get("seats")?.job).toBe("0xc2");
    expect(notice(html)).toBe("1");
    const core = coreOf([first, patched, after]);
    expect(unfoldedCount(core)).toBe(1);
    void disputesOf;
  });
});

/* ---------- f27af976: a patched Website value links to its new address ---------- */
describe("f27af976: a patched Website row is linked and labelled from its new value", () => {
  const PH = h("d");
  const page = parsePage(
    JSON.stringify({
      subject: { name: "Proj", channels: [{ label: "Site", url: "https://proj.example/", tie: "strong" }] },
      summary: [{ text: "Proj runs a site.", lines: ["L1"] }],
      infobox: [{ label: "Website", value: "https://proj.example/old", url: "https://proj.example/old", lines: ["L1"] }],
      lines: [{ id: "L1", section: "what_it_does", text: "Proj has a site.", kind: "statement", by: "Proj", sources: ["S1"], quote: "site" }],
      sources: [{ id: "S1", ref: "https://proj.example/", type: "page" }],
    }),
    "proj.example",
  );
  it("the anchor's text and href are both the new address", () => {
    const first = pageJob("0xa1", "proj.example", page, PH);
    const c = changesJob("0xc1", "proj.example", PH, {
      items: [{ n: 1, type: "links", target: "none", verdict: "kept", why: "", lines: ["N1"] }],
      lines: [claim("N1", "Tracker says the site moved to proj.example/new.")],
      affects: [{ kind: "infobox", target: "Website", type: "outdates", by_line: "N1" }],
      patches: [{ kind: "infobox", target: "Website", value: "https://proj.example/new", lines: ["N1"] }],
    });
    const { html } = render([first, c], "proj.example");
    expect(html).toContain('href="https://proj.example/new"');
    expect(html).not.toContain('href="https://proj.example/old"');
  });
  it("a replacement with no identifiable URL is plain text; its label comes from the new value", () => {
    const row: KeyRow = { label: "Website", value: "https://proj.example/old", url: "https://proj.example/old", note: "", lines: [], channel: { label: "Site", url: "https://proj.example/old", tie: "strong" }, badge: null, status: { text: "Own domain", tone: "own" }, accounts: [], values: [], tokens: [] };
    const [text] = withPatches([row], new Map([["website", { value: "Its new site is not named yet", lines: [], payer: "0xabc" }]]), [], () => "", { channels: [], domain: "proj.example" });
    expect(text!.url).toBe("");
    expect(text!.channel).toBeNull();
    expect(text!.status?.text).toBe("Not verified");
    const [moved] = withPatches([row], new Map([["website", { value: "other.example", lines: [], payer: "0xabc" }]]), [], () => "", { channels: [], domain: "proj.example" });
    expect(moved!.url).toBe("https://other.example");
    expect(moved!.status?.text).toBe("Not verified");
    expect(urlOfValue("proj.example/new")).toBe("https://proj.example/new");
    expect(urlOfValue("two words")).toBe("");
  });
});
