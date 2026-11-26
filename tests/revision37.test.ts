/**
 * Revision 36 review fixes: Ask compares by return type and knows more chains, the category chips keep "All", the List
 * row's date is the build's, steps open their lines in place, "The token" for any count, and the docs' current layout.
 */
import "./legacy-gate";
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { Hex } from "viem";
import { rpcFor, sameValue } from "../src/ask";
import { ACTIONS } from "../src/config";
import { CategoryChips, liveCategory, ProjectRow } from "../src/HomeViews";
import { builtOf, useRecordModel, type SubjectSummary } from "../src/model";
import { parsePage, type Page } from "../src/page";
import { OverviewTab, type Ui } from "../src/Record";
import { SuggestProvider } from "../src/Suggest";
import type { Activity } from "../src/useActivity";

const read = (p: string) => readFileSync(p, "utf8");

describe("Ask: the comparison follows the return type; every listed chain has a public RPC", () => {
  it("a string is compared exactly, so a change of case is a change", () => {
    expect(sameValue("IMD", "imd", "string")).toBe(false);
    expect(sameValue("IMD", "IMD", "string")).toBe(true);
    expect(sameValue("IMD", " IMD ", "string")).toBe(true);
  });
  it("addresses by hex, bools as true or false, uints by digits", () => {
    expect(sameValue("0x" + "Ab".repeat(20), "0x" + "ab".repeat(20), "address")).toBe(true);
    expect(sameValue("true", "True", "bool")).toBe(true);
    expect(sameValue("false", "true", "bool")).toBe(false);
    expect(sameValue("1234.5", "1,234.50 IMD", "uint")).toBe(true);
  });
  it("Arbitrum Nova (42170) resolves to its official endpoint", () => {
    expect(rpcFor(42170)[0]).toBe("https://nova.arbitrum.io/rpc");
    for (const id of [1, 8453, 10, 42161, 42170, 137, 11155111]) expect(rpcFor(id).every((u) => u.startsWith("https://"))).toBe(true);
  });
});

describe("Home: chips, the List row's date", () => {
  it("a chosen category the search left empty is cleared; All stays while one is chosen", () => {
    expect(liveCategory([{ category: "network" }, { category: undefined }], "network")).toBe("network");
    expect(liveCategory([{ category: undefined }], "network")).toBe(null);
    const html = renderToStaticMarkup(createElement(CategoryChips, { rows: [{ category: undefined }], value: "network", set: () => {} }));
    expect(html).toContain("All <span");
    expect(renderToStaticMarkup(createElement(CategoryChips, { rows: [{ category: undefined }], value: null, set: () => {} }))).toBe("");
  });
  it("Last built is the producing page job's date, not the newest result's", () => {
    const list = [
      { req: { requestId: "0xa1" }, doneTime: Date.UTC(2026, 10, 1, 12), time: null },
      { req: { requestId: "0xb2" }, doneTime: Date.UTC(2026, 10, 2, 12), time: null },
    ] as unknown as Activity[];
    expect(builtOf({ hasPage: true, pageReq: "0xa1" }, list)).toBe(Date.UTC(2026, 10, 1, 12));
    const s = { id: "x.example", name: "X", oneLine: "Do a thing.", counts: null, outdated: null, changed: Date.UTC(2026, 10, 2, 12), built: Date.UTC(2026, 10, 1, 12), requests: 2, pending: 0, hasPage: true, main: "", contracts: [], logo: null, logoHash: null, status: null } as SubjectSummary;
    const html = renderToStaticMarkup(createElement(ProjectRow, { s }));
    expect(html).toContain("Last built 1 Nov 2026");
    expect(html).not.toContain("2 Nov 2026");
  });
  it("the example cards come after the directory", () => {
    const src = read("src/Home.tsx");
    expect(src.indexOf('className="example"')).toBeGreaterThan(src.indexOf('className="home-list"'));
  });
});

const req = (id: string, subject: string, kind: string) => ({ requestId: id as Hex, payer: "0x0085000000000000000000000000000000000000" as Hex, action: ACTIONS.research, body: "", bodyJson: { objective: "Research the project." }, kind, title: "", subject, template: "", amount: 1n, blockNumber: 11n, transactionHash: `0x${id.slice(2).padEnd(64, "0")}` as Hex });
const base = { time: null, ens: null, jobId: null, oracle: null, refusal: null, sourcesError: null, edit: null, changes: null, sources: null, page: null, via: null, rejected: null, doneTime: null, logo: null, logoHash: null, filesRead: true };
const pageJob = (page: Page): Activity => ({ ...base, req: req("0xa1", "proj.example", "add"), state: "completed", completion: { blockNumber: 12n, logIndex: 0, status: 0 }, page, fileHash: "1".repeat(64) }) as unknown as Activity;
const ui: Ui = { filter: "all", setFilter: () => {}, openSet: new Set(), toggle: () => {}, openLines: () => {}, target: null };
function render(items: Activity[]) {
  function Harness() {
    const m = useRecordModel(items, null, "proj.example");
    return createElement(SuggestProvider, { subject: "proj.example", rec: m, children: createElement(OverviewTab, { m, ui, items, price: "", subjects: [] }) });
  }
  return renderToStaticMarkup(createElement(Harness));
}
const PAGE = {
  found: true,
  subject: { name: "Proj", one_line: "Post a job." },
  summary: [{ text: "Proj runs jobs.", lines: ["L1"] }],
  lines: [{ id: "L1", section: "money", text: "A job costs 5 USDC.", kind: "proof", rerun: "Chain 1, block 9: call price()" }],
  explained: {
    how_it_works: [{ text: "You post a job.", lines: ["L1"], kind: "proof" }],
    tokens: [
      { token: "AAA", sentences: [{ text: "AAA pays.", lines: [] }] },
      { token: "BBB", sentences: [{ text: "BBB votes.", lines: [] }] },
    ],
    contracts: [],
  },
};

describe("Overview: steps open in place; one 'The token' row", () => {
  const html = render([pageJob(parsePage(JSON.stringify(PAGE), "proj.example"))]);
  it("a step is a toggle that opens its lines under it, not a link that leaves for Record", () => {
    expect(html).toMatch(/<li><span class="x-text x-open sent" role="button" tabindex="0" aria-expanded="false" aria-controls="step-ev-0"/);
    expect(html).not.toMatch(/<ol class="steps"><li><a /);
  });
  it("two tokens: one row named The token, a block for each", () => {
    expect(html).toContain("<span>The token</span>");
    expect(html).not.toContain("The tokens");
    expect(html).toContain("<h3>AAA</h3>");
    expect(html).toContain("<h3>BBB</h3>");
  });
});

describe("D21. both docs describe the current layout", () => {
  const agents = read("public/agents.md");
  const readme = read("README.md");
  it("names Cards | List, the chips, the Overview order, walletless Ask and the five additions", () => {
    for (const doc of [agents, readme]) {
      for (const s of ["## Current layout (revision 36)", "Cards | List", "Go deeper", "Ask the contract", "screen readers only", "rebuild-7351e67f471b.txt", "Prefer the price or cost a person pays", "Capture the top of each page, 1280 by 960"]) expect(doc).toContain(s);
    }
    expect(agents).not.toContain("the same words\nshown above it");
    expect(agents).not.toContain("key facts table");
  });
});
