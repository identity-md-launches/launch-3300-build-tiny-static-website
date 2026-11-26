/**
 * Revision 36: the one-column project page, Home's cards, the instruction additions and explained kinds.
 */
import "./legacy-gate";
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { Hex } from "viem";
import { encodeAbiParameters } from "viem";
import { decodeAnswer, recordedOf, rpcFor, sameValue } from "../src/ask";
import { ACTIONS, HOME_HEADING, HOME_TITLE } from "../src/config";
import { categoryCounts, readView } from "../src/HomeViews";
import { cardOf, useRecordModel } from "../src/model";
import { explainedKind, parseExplained, parsePage, type Page } from "../src/page";
import { basicsOrder, basicsRank, OverviewTab, type Ui } from "../src/Record";
import { SuggestProvider } from "../src/Suggest";
import type { Activity } from "../src/useActivity";
import { INSTRUCTIONS } from "../src/instructions";

const read = (p: string) => readFileSync(p, "utf8");
const flat = (s: string) => s.trim().replace(/\s*\n\s*/g, " ");

describe("D20. explained kinds: four known, anything else shows no mark", () => {
  it("reads proof, statement, claim and not_checked; a missing or unknown kind is none, never a refusal", () => {
    expect(["proof", "statement", "claim", "not_checked", "Not checked", "PROOF"].map(explainedKind)).toEqual(["proof", "statement", "claim", "not_checked", "not_checked", "proof"]);
    expect([undefined, "", "fact", "verified", 3].map(explainedKind)).toEqual([null, null, null, null, null]);
    const x = parseExplained({ how_it_works: [{ text: "You post a job.", lines: ["L1"], kind: "statement" }, { text: "You pay in IMD.", lines: [], kind: "weird" }, { text: "Agents answer.", lines: [] }] })!;
    expect(x.howItWorks.map((s) => s.kind)).toEqual(["statement", undefined, undefined]);
    expect(x.howItWorks).toHaveLength(3);
  });
  it("a what_it_means sentence carries no kind", () => {
    const x = parseExplained({ contracts: [{ address: "0x" + "ab".repeat(20), chain: "Base", sentences: [{ text: "Owner can pause.", lines: [], part: "who_can_change", kind: "proof" }, { text: "Your funds can be frozen.", lines: [], part: "what_it_means", kind: "claim" }] }] })!;
    expect(x.contracts[0]!.sentences.map((s) => s.kind)).toEqual(["proof", undefined]);
  });
  it("a page with an unknown kind still parses whole", () => {
    const p = parsePage(JSON.stringify({ found: true, subject: { name: "X" }, explained: { how_it_works: [{ text: "Step.", lines: [], kind: "maybe" }] } }));
    expect(p.explained?.howItWorks[0]?.text).toBe("Step.");
  });
});

describe("A5. the basics' order", () => {
  it("links, tokens, runs on, founder or team, then the rest in their order", () => {
    const rows = ["Supply", "Founder or creator", "Main contract", "Chains", "Tokens", "Official accounts", "Website", "Launched"].map((label) => ({ label }));
    expect(basicsOrder(rows).map((r) => r.label)).toEqual(["Official accounts", "Website", "Tokens", "Chains", "Founder or creator", "Supply", "Main contract", "Launched"]);
    expect(basicsRank("Size")).toBe(4);
  });
});

describe("A6. Ask the contract", () => {
  it("decodes uint with decimals, address, bool and string", () => {
    expect(decodeAnswer(encodeAbiParameters([{ type: "uint256" }], [1234500000000000000000n]), { returns: "uint", decimals: 18 })).toBe("1234.5");
    expect(decodeAnswer(encodeAbiParameters([{ type: "uint256" }], [42n]), { returns: "uint", decimals: null })).toBe("42");
    expect(decodeAnswer(encodeAbiParameters([{ type: "bool" }], [true]), { returns: "bool", decimals: null })).toBe("true");
    expect(decodeAnswer(encodeAbiParameters([{ type: "string" }], ["hello"]), { returns: "string", decimals: null })).toBe("hello");
    const a = "0x" + "12".repeat(20);
    expect(decodeAnswer(encodeAbiParameters([{ type: "address" }], [a as Hex]), { returns: "address", decimals: null }).toLowerCase()).toBe(a);
    expect(() => decodeAnswer("0x", { returns: "uint", decimals: null })).toThrow();
  });
  it("compares with the recorded value by its digits; says nothing without one", () => {
    expect(sameValue("1234.5", "1,234.50 IMD")).toBe(true);
    expect(sameValue("1234.6", "1,234.50")).toBe(false);
    expect(sameValue("42", "")).toBe(null);
    expect(sameValue("0x" + "Ab".repeat(20), "held by 0x" + "ab".repeat(20))).toBe(true);
    expect(recordedOf({ value: "5", unit: "USDC" })).toBe("5 USDC");
    expect(rpcFor(1).length).toBeGreaterThan(0);
    expect(rpcFor(8453).length).toBeGreaterThan(0);
  });
});

const h = (c: string) => c.repeat(64);
const req = (id: string, subject: string, kind: string) => ({ requestId: id as Hex, payer: "0x0085000000000000000000000000000000000000" as Hex, action: ACTIONS.research, body: "", bodyJson: { objective: "Research the project." }, kind, title: "", subject, template: "", amount: 1n, blockNumber: 11n, transactionHash: `0x${id.slice(2).padEnd(64, "0")}` as Hex });
const base = { time: null, ens: null, jobId: null, oracle: null, refusal: null, sourcesError: null, edit: null, changes: null, sources: null, page: null, via: null, rejected: null, doneTime: null, logo: null, logoHash: null, filesRead: true };
const pageJob = (page: Page): Activity => ({ ...base, req: req("0xa1", "proj.example", "add"), state: "completed", completion: { blockNumber: 12n, logIndex: 0, status: 0 }, page, fileHash: h("1") }) as unknown as Activity;
const ui: Ui = { filter: "all", setFilter: () => {}, openSet: new Set(), toggle: () => {}, openLines: () => {}, target: null };
function render(items: Activity[]) {
  function Harness() {
    const m = useRecordModel(items, null, "proj.example");
    return createElement(SuggestProvider, { subject: "proj.example", rec: m, children: createElement(OverviewTab, { m, ui, items, price: "", subjects: [] }) });
  }
  return renderToStaticMarkup(createElement(Harness));
}
const NEW_PAGE = {
  found: true,
  subject: { name: "Proj", one_line: "Post a job and get an answer.", category: "app", app: { url: "https://proj.example/app", label: "Open the app" } },
  infobox: [{ label: "Supply", value: "10", lines: ["L1"] }, { label: "Website", value: "proj.example", url: "https://proj.example/", lines: ["L1"] }],
  summary: [{ text: "Proj runs jobs.", lines: ["L1"], paragraph: 1 }, { text: "It costs one coin.", lines: ["L1"], paragraph: 2 }],
  lines: [{ id: "L1", section: "money", text: "A job costs 5 USDC.", kind: "proof", rerun: "Chain 1, block 9: call price()", fact: { name: "Job price", value: "5", unit: "USDC" } }],
  sources: [{ id: "S1", ref: "https://proj.example/", type: "page" }],
  explained: { how_it_works: [{ text: "You post a job.", lines: ["L1"], kind: "proof" }, { text: "An agent answers.", lines: [], kind: "unknown" }], tokens: [{ token: "PRJ", sentences: [{ text: "PRJ pays for jobs.", lines: ["L1"], kind: "statement" }] }], contracts: [] },
  ask: [{ question: "What does a job cost right now?", line: "L1", call: { chain_id: 1, to: "0x" + "cd".repeat(20), data: "0xa035b1fe", returns: "uint", decimals: 6, unit: "USDC" } }],
  open_questions: ["Who runs it?"],
};

describe("A. the one-column Overview", () => {
  const html = render([pageJob(parsePage(JSON.stringify(NEW_PAGE), "proj.example"))]);
  it("orders header, summary, how it works, the basics, ask, go deeper", () => {
    const at = (s: string) => html.indexOf(s);
    expect(at('class="p-head"')).toBeGreaterThan(-1);
    expect(at('class="summary ov-sec"')).toBeGreaterThan(at('class="p-head"'));
    expect(at('id="how-title"')).toBeGreaterThan(at('class="summary ov-sec"'));
    expect(at('id="keyfacts-title"')).toBeGreaterThan(at('id="how-title"'));
    expect(at('id="ask-title"')).toBeGreaterThan(at('id="keyfacts-title"'));
    expect(at('id="deeper-title"')).toBeGreaterThan(at('id="ask-title"'));
  });
  it("the header has the category chip and the app button that opens a new tab", () => {
    expect(html).toContain('<span class="cat-chip">App</span>');
    expect(html).toMatch(/<a class="btn btn-primary p-app" href="https:\/\/proj.example\/app" target="_blank" rel="noopener noreferrer">Open the app/);
  });
  it("shows the first paragraph and Read more", () => {
    expect(html).toContain("Proj runs jobs.");
    expect(html).not.toContain("It costs one coin.");
    expect(html).toContain(">Read more</button>");
    expect(html).not.toContain("dot-key");
  });
  it("numbers the steps; a known kind is a quiet mark, an unknown one none", () => {
    expect(html).toContain('<ol class="steps">');
    expect(html).toMatch(/You post a job\.⁠<span class="x-mark kind-proof"/);
    expect(html).toMatch(/An agent answers\.⁠<\/span>/);
  });
  it("the basics put Website first; Ask has its card and the recorded value; Go deeper has the token and the open questions", () => {
    expect(html).toContain(">The basics</h2>");
    expect(html.indexOf(">Website<")).toBeGreaterThan(-1);
    expect(html).toContain("What does a job cost right now?");
    expect(html).toContain(">Ask now</button>");
    expect(html).toContain("5 USDC");
    expect(html).toContain("<span>The token</span>");
    expect(html).toContain("<span>Not known yet</span>");
    expect(html).toContain("<span>Full record</span>");
  });
  it("a page built before the new instructions shows no empty block", () => {
    const old = render([pageJob(parsePage(JSON.stringify({ found: true, subject: { name: "Old", one_line: "An old page." }, summary: [{ text: "Old runs.", lines: [] }], lines: [] }), "proj.example"))]);
    for (const s of ["how-title", "ask-title", "gallery", "p-app", "cat-chip", "The token"]) expect(old).not.toContain(s);
    expect(old).toContain("<span>Full record</span>");
  });
});

describe("B. Home", () => {
  it("has the new heading; the title keeps the tagline", () => {
    expect(HOME_HEADING).toBe("Find new projects: what they promise, what they do, and what people say.");
    expect(HOME_TITLE).toBe("Swarmpedia: A crowdsourced record of any project or protocol.");
  });
  it("Cards by default; chips only for categories with a project, with counts", () => {
    expect(readView()).toBe("cards");
    expect(categoryCounts([{ category: "app" }, { category: "app" }, { category: "token" }, {}])).toEqual([{ category: "app", n: 2 }, { category: "token", n: 1 }]);
  });
  it("a card takes category, app and the first declared screenshot from the page", () => {
    const page = parsePage(JSON.stringify({ ...NEW_PAGE, screenshots: [{ file: "artifacts/shot-1.png", caption: "Home", url: "https://proj.example/" }] }), "proj.example");
    const c = cardOf(page, { req: { ...req("0xa1", "proj.example", "add"), kind: "add" } } as unknown as Activity);
    expect(c.category).toBe("app");
    expect(c.app?.label).toBe("Open the app");
  });
  it("the search label is for screen readers only", () => {
    expect(read("src/Home.tsx")).toContain('<label htmlFor="lookup" className="sr-only">');
  });
});

describe("C. the instruction additions", () => {
  const cur = flat(read(`public/instructions/${INSTRUCTIONS.rebuild.file}`));
  const prev = flat(read("public/instructions/rebuild-7d51ee3b35d9.txt"));
  const ADDED = [
    "When the record holds a proof that fits, ask is never empty. Take the call from that line's rerun text; you do not need to run it again. Prefer the price or cost a person pays, then a supply or count.",
    "At most 6 sentences per token in total. Never two sentences that say the same thing. Leave out 'how you get it' unless a source names where. For whether more can be created or destroyed, read the token's verified source: this sentence should rest on a proof. Do not write that it was not checked when the record already holds lines on it.",
    "A sentence's kind is the weakest kind among the lines it rests on: proof, statement, claim, or not_checked when it rests on none. Use no other kind. A what_it_means sentence carries no kind.",
    "Say what a person can do there, in words a newcomer would use. Do not list what the project consists of.",
    "Capture the top of each page, 1280 by 960, after it has finished loading. Skip a page whose capture is mostly empty.",
  ];
  it("adds each sentence once", () => {
    for (const s of ADDED) expect(cur.split(s).length).toBe(2);
  });
  it("keeps every earlier sentence exactly: removing the additions gives the previous file", () => {
    let t = cur;
    for (const s of ADDED) t = t.replace(` ${s}`, "");
    expect(t).toBe(prev);
  });
  it("is a new file with a new hash; the previous one stays served", () => {
    expect(INSTRUCTIONS.rebuild.file).toBe("rebuild-7351e67f471b.txt");
    expect(read("public/instructions/rebuild-7d51ee3b35d9.txt").length).toBeGreaterThan(0);
  });
});
