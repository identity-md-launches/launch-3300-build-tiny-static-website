/** Revision 31 review fixes: Supply per token, test networks, page contributors, Added by, one search. */
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { artifactUrl, priorText } from "../src/bodies";
import { changesBody, noTarget, type Change } from "../src/changes";
import { ACTIONS } from "../src/config";
import { addedOf, contributorsOf, fundersOf, shownLabel } from "../src/contributorStats";
import { noMatchText, searchOptions } from "../src/HeaderSearch";
import { keyFacts, shownEntries, supplyItems, supplyToken, supplyValues, type KeyRow } from "../src/keyfacts";
import { changesOriginOf } from "../src/model";
import { parseChanges, parsePage } from "../src/page";
import { questionsOf } from "../src/questions";
import { ContributorTable, KeyValue } from "../src/Record";
import { refFromId } from "../src/subject";
import type { Activity } from "../src/useActivity";

const src = (p: string) => readFileSync(p, "utf8");
const id = (n: number) => `0x${n.toString(16).padStart(64, "0")}`;
const page = (infobox: unknown[], contracts: unknown[] = []) => parsePage(JSON.stringify({ subject: { name: "Ex", channels: [], contracts }, infobox, lines: [] }), "example.org");
const rowsOf = (infobox: unknown[], contracts: unknown[] = []) => {
  const p = page(infobox, contracts);
  return keyFacts(p, () => undefined, p.lines).rows;
};
const html = (r: KeyRow) => renderToStaticMarkup(createElement(KeyValue, { row: r, chain: "" }));
const item = (name: string, text: string) => ({ name, text, url: "", address: "", chain: "", explorer: "" });

describe("A1: Supply is one entry per token", () => {
  it("joins a token's home total and bridged balances, as written, never summed", () => {
    const zora = supplyItems([item("ZORA on Base", "10 billion"), item("ZORA bridged to Solana", "about 99.10 million")]);
    expect(zora).toHaveLength(1);
    expect(zora[0]).toMatchObject({ name: "ZORA", text: "on Base: 10 billion; bridged to Solana: about 99.10 million" });
    const uni = supplyItems([item("UNI (Ethereum)", "1 billion UNI"), item("UNI (Arbitrum One)", "1,194,517.17 UNI"), item("UNI (Base)", "312,000 UNI")]);
    expect(uni.map((x) => x.name)).toEqual(["UNI"]);
    expect(uni[0]!.text).toBe("Ethereum: 1 billion UNI; Arbitrum One: 1,194,517.17 UNI; Base: 312,000 UNI");
  });
  it("keeps two tokens apart and a lone entry untouched", () => {
    const two = supplyItems([item("IMD", "about 7.08 million in total, of which about 4.28 million is bridged to 2 other chains"), item("imdUSD", "1,200")]);
    expect(two).toHaveLength(2);
    expect(two[0]!.text).toContain("of which about 4.28 million");
    expect(supplyToken("UNI (Ethereum)")).toBe("UNI");
    expect(supplyToken("", "1 billion UNI")).toBe("UNI");
    expect(supplyToken("Total supply", "100")).toBe("");
  });
  it("groups a list of texts the same way", () => {
    expect(supplyValues(["ZORA on Base: 10 billion", "ZORA bridged to Solana: about 99.10 million"])).toEqual(["ZORA on Base: 10 billion; bridged to Solana: about 99.10 million"]);
    expect(supplyValues(["IMD: 7.08 million", "INFER: 1 billion"])).toEqual(["IMD: 7.08 million", "INFER: 1 billion"]);
  });
  it("a Supply row from a page shows one item per token", () => {
    const rows = rowsOf([{ label: "Supply", values: [{ name: "ZORA on Base", text: "10 billion" }, { name: "ZORA bridged to Solana", text: "about 99.10 million" }] }]);
    const supply = rows.find((r) => r.label === "Supply")!;
    expect(shownEntries(supply).items).toHaveLength(1);
    expect((html(supply).match(/<li/g) ?? []).length).toBe(1);
  });
});

describe("A2, A3: a declared test network moves to Test networks with its tag", () => {
  it("a Chains entry marked test leaves Chains and gets its own Test networks entry", () => {
    const rows = rowsOf([{ label: "Chains", values: [{ name: "Ethereum", text: "", status: "live" }, { name: "Staging Ledger", text: "", status: "test" }] }]);
    const chains = rows.find((r) => r.label === "Chains")!;
    expect(html(chains)).not.toContain("Staging Ledger");
    expect(html(chains)).not.toContain("test network");
    const test = rows.find((r) => r.label === "Test networks")!;
    expect(html(test)).toContain("Staging Ledger");
    expect(html(test)).toContain('class="live-tag">test network<');
  });
  it("merges into a Test networks row given as a list, shown and deduplicated", () => {
    const rows = rowsOf([
      { label: "Chains", values: [{ name: "Ethereum", text: "", status: "live" }, { name: "Sepolia", text: "", status: "test" }] },
      { label: "Test networks", values: [{ name: "Signet", text: "", status: "test" }] },
    ]);
    const test = rows.filter((r) => r.label === "Test networks");
    expect(test).toHaveLength(1);
    const h = html(test[0]!);
    expect(h).toContain("Signet");
    expect(h).toContain("Sepolia");
    expect((h.match(/test network</g) ?? []).length).toBe(2);
    expect(html(rows.find((r) => r.label === "Chains")!)).not.toContain("Sepolia");
  });
});

const job = (n: number, kind: "add" | "changes", over: Partial<Activity> & { objective?: string; payer?: string }): Activity =>
  ({
    req: { requestId: id(n), subject: "example.org", action: ACTIONS.research, kind, payer: over.payer ?? "0x" + "1".repeat(40), blockNumber: BigInt(n * 10), bodyJson: over.objective ? { objective: over.objective } : null },
    completion: { blockNumber: BigInt(n * 10 + 1), logIndex: 0 }, state: "completed", jobId: `job-${n}`, doneTime: n * 1000, time: n * 1000, notRead: null, rejected: null, ens: null,
    ...over,
  }) as unknown as Activity;
const NOTE = (n: string): Change => ({ id: n, type: "note", target: noTarget(), note: `Note number ${n} with enough words.`, links: [] });
const objective = changesBody([NOTE("1"), NOTE("2")], { files: [], answers: [] }, [], refFromId("example.org"), (x) => x).objective;

describe("C12, C13: contributor figures come from what was sent and what was applied", () => {
  const pg = job(1, "add", { page: parsePage(JSON.stringify({ subject: { name: "Ex" }, lines: [], open_questions: ["What is the actual fee?"] }), "example.org"), fileHash: "a".repeat(64) });
  const ch = job(2, "changes", {
    objective,
    fileHash: "b".repeat(64),
    changes: parseChanges(JSON.stringify({ found: true, items: [{ n: 1, type: "note", target: "none", verdict: "kept", why: "ok", lines: ["N1"] }], lines: [{ id: "N1", text: "It is so.", kind: "statement" }], questions: [{ target: "A question never on this page?", op: "close", text: "", lines: ["N1"] }] })),
  });
  it("notes sent are the objective's notes; a close aimed at no open question credits nothing", () => {
    const [row] = contributorsOf([pg, ch]);
    expect(row).toMatchObject({ sent: 2, added: 1, answered: 0, pages: 1 });
    expect(addedOf(row!)).toBe("1 added of 2");
    const h = renderToStaticMarkup(createElement(ContributorTable, { rows: [row!], caption: "x" }));
    expect(h).toContain("1 added of 2");
  });
  it("a close that answers an open question counts once", () => {
    const answers = job(3, "changes", { objective, fileHash: "c".repeat(64), changes: parseChanges(JSON.stringify({ found: true, items: [], lines: [{ id: "N1", text: "It is 1%.", kind: "statement" }], questions: [{ target: "What is the actual fee?", op: "close", text: "", lines: ["N1"] }] })) });
    const again = job(4, "changes", { objective, fileHash: "d".repeat(64), changes: parseChanges(JSON.stringify({ found: true, items: [], lines: [{ id: "N1", text: "It is 1%.", kind: "statement" }], questions: [{ target: "What is the actual fee?", op: "close", text: "", lines: ["N1"] }] })), payer: "0x" + "2".repeat(40) });
    expect(questionsOf([pg, answers], pg).byJob.get(answers.req.requestId)![0]!.answered).toBe(true);
    const rows = contributorsOf([pg, answers, again]);
    expect(rows.find((r) => r.address === "0x" + "1".repeat(40))!.answered).toBe(1);
    expect(rows.find((r) => r.address === "0x" + "2".repeat(40))!.answered).toBe(0);
  });
  it("funders count every counted job of the page; names are ENS or a short address", () => {
    const f = fundersOf([pg, ch], "example.org");
    expect(f).toEqual([{ address: "0x" + "1".repeat(40), name: "0x1111…1111", jobs: 2 }]);
    expect(shownLabel("Contributors")).toBe("Project contributors");
  });
});

describe("C15: Added by survives any number of rebuilds", () => {
  const [HC, H1, H2] = ["c", "1", "2"].map((c) => c.repeat(64)) as [string, string, string];
  const withPrior = (files: string[]) => `x. Start from the earlier results: ${priorText({ files: files.map(artifactUrl), answers: [] })}. Fetch each file. y`;
  const pageOf = (from: string) => parsePage(JSON.stringify({ subject: { name: "Ex" }, lines: [{ id: "L66", section: "history", text: "Dee Goens announced he became chief executive.", kind: "statement", by: "Zora", from: [from] }] }), "example.org");
  const changes = job(1, "changes", { fileHash: HC, payer: "0x" + "9".repeat(40), changes: parseChanges(JSON.stringify({ found: true, items: [], lines: [{ id: "N1", text: "x", kind: "statement" }] })) });
  const first = job(2, "add", { fileHash: H1, objective: withPrior([HC]), page: pageOf("F1:N1") });
  const second = job(3, "add", { fileHash: H2, objective: withPrior([H1]), page: pageOf("F1:L66") });
  it("follows F1:L66 through the earlier page to the changes job", () => {
    expect(changesOriginOf("F1:L66", [{ n: 1, hash: H1 }], [changes, first, second])).toBe(changes);
    expect(changesOriginOf("F1:N1", [{ n: 1, hash: HC }], [changes, first, second])).toBe(changes);
  });
  it("finds nothing for a line no changes job wrote", () => {
    const plain = job(4, "add", { fileHash: "e".repeat(64), objective: withPrior([]), page: pageOf("F9:L1") });
    expect(changesOriginOf("F1:L66", [{ n: 1, hash: "e".repeat(64) }], [plain])).toBeNull();
  });
});

describe("B8, B9: one search", () => {
  it("plain text is pointed to a valid next step; a domain or address can be added", () => {
    expect(noMatchText("no matching project name")).toBe("No project matches “no matching project name”. Try another name or enter a website or contract address.");
    expect(noMatchText("example.org")).toContain("Press Look it up to add it.");
    expect(noMatchText("0x" + "ab".repeat(20))).toContain("Press Look it up to add it.");
  });
  it("the header offers to create the page for a full address, shown on its own wrapping line", () => {
    expect(searchOptions([], "0x00000000000000000000000000000000000000b1").create).toBe("0x00000000000000000000000000000000000000b1");
    expect(src("src/HeaderSearch.tsx")).toContain('<span className="hsearch-text mono">{create}</span>');
    expect(src("src/styles.css")).toContain(".hsearch-create .hsearch-text { word-break: break-all;");
  });
  it("the prompt is visible in full above the big box", () => {
    expect(src("src/Home.tsx")).toContain('<label htmlFor="lookup" className="lookup-label">{SEARCH_PLACEHOLDER}</label>');
  });
  it("contracts wrap per cell, not by a viewport breakpoint", () => {
    const css = src("src/styles.css");
    expect(css).toContain(".kf-contracts li { display: flex; flex-wrap: wrap;");
    expect(css).not.toMatch(/@media \(max-width: 22\.99rem\) \{\s*\.kf-contracts li/);
  });
  it("the statistics module has its own name next to the Contributors page", () => {
    expect(src("src/App.tsx")).toContain('from "./Contributors"');
    expect(src("src/Record.tsx")).toContain('from "./contributorStats"');
  });
});
