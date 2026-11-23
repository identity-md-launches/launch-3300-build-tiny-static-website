/** Revision 13: overview order, corrected sentences, pay dialog, wallet storage, speakers, patch history, accounts, line details, instructions. */
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { Hex } from "viem";
import { askSentence, sentHref } from "../src/App";
import { artifactUrl, priorText } from "../src/bodies";
import { applySentenceChanges } from "../src/changeResult";
import { ACTIONS } from "../src/config";
import { accountLabel, accountsOf, keyFacts, speakersOf, withPatches, type KeyRow } from "../src/keyfacts";
import { useRecordModel } from "../src/model";
import { parseChanges, parseLines, parsePage, type Line, type Page } from "../src/page";
import { KEY_FACTS_SHOWN, OverviewTab, whyLabel, type Ui } from "../src/Record";
import { SuggestProvider } from "../src/Suggest";
import type { Activity } from "../src/useActivity";
import { dropWalletSnapshots, WALLET_FLAG, WALLET_KEY } from "../src/walletFlag";

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
function changesJob(id: string, subject: string, pageHash: string, body: object, changesText: string, doneTime: number): Activity {
  block++;
  const text = JSON.stringify({ sources: [{ id: "S1", url: "https://tracker.example.org/x", type: "article", publisher: "Tracker", could_open: true }], notes: "", ...body });
  const objective = `Judge the changes. The record so far: ${priorText({ files: [artifactUrl(pageHash)], answers: [] })}. Channels already known: none known. The changes: ${changesText}`;
  return { ...base, doneTime, req: req(id, subject, "changes", objective), state: "completed", completion: { blockNumber: block, logIndex: 0, status: 0 }, fileHash: h(id.slice(-1)), sources: parseLines(text, { changes: true }), changes: parseChanges(text) } as unknown as Activity;
}
const ui: Ui = { filter: "all", setFilter: () => {}, openSet: new Set(), toggle: () => {}, openLines: () => {}, target: null };
function render(items: Activity[], subject: string) {
  let model!: ReturnType<typeof useRecordModel>;
  function Harness() {
    const m = useRecordModel(items, null, subject);
    model = m;
    return createElement(SuggestProvider, { subject, rec: m, children: createElement(OverviewTab, { m, ui, items, price: "", subjects: [{ id: "base.org", main: "", contracts: [] }] }) });
  }
  return { html: renderToStaticMarkup(createElement(Harness)), m: model };
}
const claim = (id: string, text: string) => ({ id, source: "S1", section: "what_it_does", text, kind: "claim", by: "Tracker", quote: "seats", links: [] });
const line = (id: string, kind: Line["kind"], extra: Partial<Line> = {}): Line => ({ id, section: "money", text: id, kind, marked: kind, labelNote: "", channel: null, by: "", sources: [], srcKeys: [], quote: "", rerun: "", fact: null, from: [], links: [], ...extra });

describe("A. Overview order", () => {
  const rows = Array.from({ length: 10 }, (_, i) => ({ label: `Row ${i + 1}`, value: `Value ${i + 1}`, lines: ["L1"] }));
  const page = parsePage(
    JSON.stringify({
      subject: { name: "Proj", one_line: "A test project.", channels: [{ label: "Site", url: "https://proj.example/", tie: "strong" }] },
      summary: [{ text: "Proj sells seats.", lines: ["L1"] }],
      infobox: rows,
      related: [{ name: "Base", id: "base.org", relation: "runs on", lines: ["L1"] }, { name: "Other", id: "other.example", relation: "uses", lines: [] }],
      lines: [{ id: "L1", section: "what_it_does", text: "Proj sells seats.", kind: "statement", by: "Proj", sources: ["S1"], quote: "seats" }],
      sources: [{ id: "S1", ref: "https://proj.example/", type: "page" }],
    }),
    "proj.example",
  );
  const { html } = render([pageJob("0xa1", "proj.example", page, h("1"))], "proj.example");
  it("puts the Summary before Key facts and Related after both, above the footer links", () => {
    const sum = html.indexOf('class="summary-col"');
    const kf = html.indexOf('class="keyfacts"');
    const rel = html.indexOf('class="related"');
    const foot = html.indexOf('class="ov-foot"');
    expect(sum).toBeGreaterThan(html.indexOf('class="lead"'));
    expect(kf).toBeGreaterThan(sum);
    expect(rel).toBeGreaterThan(kf);
    expect(foot).toBeGreaterThan(rel);
  });
  it("shows the first 8 Key facts rows and Show all N", () => {
    expect(KEY_FACTS_SHOWN).toBe(8);
    expect(html).toContain("Value 8");
    expect(html).not.toContain("Value 9");
    expect(html).toContain("Show all 10");
  });
  it("Related chips: name, relation under it, a link when the project has a page, Add on click otherwise; no dots", () => {
    const rel = html.slice(html.indexOf('class="related"'), html.indexOf('class="ov-foot"'));
    expect(rel).toContain('<a class="rel-chip" href="#/s/base.org"><span class="rel-name">Base</span><span class="rel-what">runs on</span></a>');
    expect(rel).toMatch(/<button type="button" class="rel-chip" aria-expanded="false"><span class="rel-name">Other<\/span>/);
    expect(rel).not.toMatch(/sdot|badge/);
  });
  it("is stacked at every width: no side column, the summary at a reading width, Key facts full width (revision 15)", () => {
    const css = readFileSync("src/styles.css", "utf8");
    expect(css).toContain(".overview { display: grid; grid-template-columns: minmax(0, 1fr);");
    expect(css).not.toContain("minmax(0, 3fr) minmax(0, 2fr)");
    expect(css).not.toContain(".facts-col");
    expect(css).toContain("--read-max: 47.5rem;");
    expect(css).toMatch(/\.summary-col \{[^}]*max-width: var\(--read-max\)/);
    // Every selector list that sets grid-template-columns and names .overview keeps one column.
    for (const m of css.matchAll(/([^{}]+)\{([^}]*grid-template-columns[^}]*)\}/g)) {
      if (m[1]!.split(",").map((x) => x.trim()).includes(".overview")) expect(m[2]).toContain("minmax(0, 1fr)");
    }
  });
  it("a summary sentence and its marks sit in a nowrap group joined by U+2060, so its dots never start a line", () => {
    const css = readFileSync("src/styles.css", "utf8");
    expect(css).toContain(".sent-group { white-space: nowrap; }");
    expect(css).toContain(".sent-group > .sent { white-space: normal; }");
    const src = readFileSync("src/Record.tsx", "utf8");
    expect(src).toMatch(/<span className="sent-group">\s*<Sentence [^\n]+\n[^\n]*\n\s*\{"\\u2060"\}\s*<SentenceDots/);
  });
});

describe("B and D12. corrected sentences and patch history", () => {
  const PH = h("b");
  const A = "There are 2,000 seats.";
  const B = "There are 2,100 seats.";
  const C = "There are 2,200 seats.";
  const page = parsePage(
    JSON.stringify({
      subject: { name: "Proj", channels: [{ label: "Site", url: "https://proj.example/", tie: "strong" }] },
      summary: [{ text: A, lines: ["L1"] }],
      infobox: [{ label: "Seats", value: "2,000", lines: ["L1"] }],
      lines: [{ id: "L1", section: "what_it_does", text: "Proj has 2,000 seats.", kind: "statement", by: "Proj", sources: ["S1"], quote: "seats" }],
      sources: [{ id: "S1", ref: "https://proj.example/", type: "page" }],
    }),
    "proj.example",
  );
  const first = pageJob("0xb1", "proj.example", page, PH);
  const c1 = changesJob("0xc1", "proj.example", PH, { items: [{ n: 1, type: "wrong", target: `summary sentence "${A}"`, verdict: "kept", why: "", final_text: B, lines: ["N1"] }], lines: [claim("N1", "Tracker says there are 2,100 seats.")] }, `(1) type: wrong; target: summary sentence "${A}"; note: none; links: none`, 1_763_600_000);
  const c2 = changesJob("0xc2", "proj.example", PH, { items: [{ n: 1, type: "wrong", target: `summary sentence "${B}"`, verdict: "kept", why: "", final_text: C, lines: ["N1"] }], lines: [claim("N1", "Tracker says there are 2,200 seats.")] }, `(1) type: wrong; target: summary sentence "${B}"; note: none; links: none`, 1_763_700_000);
  it("a sentence corrected twice keeps both earlier wordings, newest first, each with who and when", () => {
    const out = applySentenceChanges([{ text: A, lines: ["L1"], paragraph: null }], [c1, c2]);
    expect(out[0]!.text).toBe(C);
    expect(out[0]!.earlier).toBe(B);
    expect(out[0]!.history!.map((x) => [x.text, x.how, x.at])).toEqual([[B, "corrected", 1_763_700_000], [A, "corrected", 1_763_600_000]]);
  });
  it("the paragraph has no 'corrected by' text; one pencil, and one line under the summary", () => {
    const { html } = render([first, c1, c2], "proj.example");
    const p = /<p class="prose">([\s\S]*?)<\/p>/.exec(html)![1]!;
    // The pencil's own label is the only "Corrected by" left in the paragraph; no payer text.
    expect(p.replace(/<button[\s\S]*?<\/button>/g, "")).not.toMatch(/corrected by|reworded by|updated by/i);
    expect(p.match(/class="changed-mark"/g)).toHaveLength(1);
    expect(html).toContain("1 sentence corrected by visitors since the last rebuild.");
  });
  it("a Key facts row patched twice: earlier is the value shown just before the newest patch; all listed newest first", () => {
    const row: KeyRow = { label: "Seats", value: "2,000", url: "", note: "", lines: [], channel: null, badge: null, status: null, accounts: [], tokens: [], values: [] };
    const [r] = withPatches([row], new Map([["seats", [{ value: "2,100", lines: [], payer: "alice.eth", at: 1 }, { value: "2,200", lines: [], payer: "bob.eth", at: 2 }]]]), []);
    expect(r!.value).toBe("2,200");
    expect(r!.earlier).toBe("2,100");
    expect(r!.updatedBy).toBe("bob.eth");
    expect(r!.history).toEqual([{ value: "2,100", by: "bob.eth", at: 2 }, { value: "2,000", by: "alice.eth", at: 1 }]);
  });
});

describe("D11. every speaker counts", () => {
  it("a statement counts its channel and every name its by gives", () => {
    const ch = { label: "@ex", url: "https://x.com/ex", tie: "strong" as const };
    expect(speakersOf([line("a", "statement", { channel: ch, by: "Example; @taylor" })])).toEqual(["@ex", "Example", "@taylor"]);
  });
  it("a claim with no named speaker counts its source's host next to named ones", () => {
    const names = speakersOf([line("a", "claim", { by: "Outside Weekly", srcKeys: ["k"] }), line("b", "claim", { by: "a blog", srcKeys: ["k2"] })], (l) => (l.id === "b" ? "https://blog.example.org/p" : ""));
    expect(names).toEqual(["Outside Weekly", "blog.example.org"]);
  });
  it("a Proven row's details still list its speakers", () => {
    const p = parsePage(
      JSON.stringify({
        subject: { name: "P", channels: [] },
        infobox: [{ label: "Supply", value: "1 million P", lines: ["P1", "C1"] }],
        lines: [
          { id: "P1", section: "on_chain", text: "Supply is 1 million.", kind: "proof", sources: ["S1"], rerun: "chain 1 block 1", fact: { name: "Supply", value: "1000000", unit: "P" } },
          { id: "C1", section: "money", text: "Tracker says 1 million.", kind: "claim", by: "Tracker; Dana Lee", sources: ["S1"], links: [{ type: "confirms", target: "P1" }] },
        ],
        sources: [{ id: "S1", ref: "https://t.example/" }],
      }),
      "p.example",
    );
    const [row] = keyFacts(p, (id) => p.lines.find((l) => l.id === id), p.lines).rows;
    expect(row!.speakers).toEqual(["Tracker", "Dana Lee"]);
  });
});

describe("E13-15. official accounts and line details", () => {
  it("short names, never an address in brackets", () => {
    expect(accountLabel("Zora", "https://x.com/zora")).toBe("@zora on X");
    expect(accountLabel("ourzora", "https://github.com/ourzora")).toBe("ourzora on GitHub");
    expect(accountLabel("Zora treasury (0x1111111111111111111111111111111111111111)", "")).toBe("Zora treasury");
  });
  it("entries with name and url: each account's own tie; differing labels show per account", () => {
    const channels = [{ label: "@zora", url: "https://x.com/zora", tie: "linked" as const }, { label: "ourzora", url: "https://github.com/ourzora", tie: "none" as const }];
    const acc = accountsOf(channels, [{ name: "@zora on X", url: "https://x.com/zora" }, { name: "ourzora on GitHub", url: "https://github.com/ourzora" }], "zora.co");
    expect(acc.map((a) => [a.name, a.url, a.status?.text])).toEqual([
      ["@zora on X", "https://x.com/zora", "Linked from own site"],
      ["ourzora on GitHub", "https://github.com/ourzora", "Not verified"],
    ]);
    const p = parsePage(JSON.stringify({ subject: { name: "Zora", channels }, infobox: [{ label: "Official accounts", value: "@zora on X; ourzora on GitHub", values: [{ name: "@zora on X", url: "https://x.com/zora" }, { name: "ourzora on GitHub", url: "https://github.com/ourzora" }], lines: [] }] }), "zora.co");
    const [row] = keyFacts(p, () => undefined, []).rows;
    expect(row!.perAccount).toBe(true);
    expect(row!.accounts.map((a) => a.name)).toEqual(["@zora on X", "ourzora on GitHub"]);
  });
  it("one plain sentence on why a line has its label", () => {
    const ch = { label: "its help centre", url: "https://support.zora.co/a", tie: "none" as const };
    expect(whyLabel({ kind: "statement", by: "Zora", channel: ch }, "Zora", "zora.co")).toBe("Zora said this on its help centre, which is part of its own domain.");
    expect(whyLabel({ kind: "proof", by: "", channel: null }, "Zora", "zora.co")).toMatch(/^Anyone can re-run/);
  });
  it("details: Why it has this label, Source, First recorded; paying wallet and job under a closed History", () => {
    const src = readFileSync("src/Record.tsx", "utf8");
    expect(src).toContain("<dt>Why it has this label</dt>");
    expect(src).toContain("<dt>First recorded</dt>");
    expect(src).toMatch(/<details className="line-history">\s*<summary>History<\/summary>/);
  });
});

describe("C. pay dialog", () => {
  it("one plain sentence for what the job does", () => {
    const body = { objective: "The changes: (1) type: wrong; target: x; note: none; links: none (2) type: context; target: y; note: none; links: none" };
    expect(askSentence({ action: ACTIONS.research, kind: "add", subject: "zora.co", rebuild: true, body: {}, title: "Rebuild the page" })).toBe("A research job rebuilds the page of zora.co from its sources and earlier results.");
    expect(askSentence({ action: ACTIONS.oracle, kind: "claim", body: { question: "Does it? This question is filed under the record of zora.co." }, title: "" })).toBe("A panel of agents answers one question: “Does it?”");
    expect(askSentence({ action: ACTIONS.research, kind: "changes", subject: "zora.co", body, title: "" })).toMatch(/^A research job checks your/);
  });
  it("the toast links the transaction until the job id is known, then the job", () => {
    const hash = `0x${"ab".repeat(32)}`;
    expect(sentHref(hash, [])).toBe(`https://etherscan.io/tx/${hash}`);
    const a = { req: { transactionHash: hash }, jobId: "job-1" } as unknown as Activity;
    expect(sentHref(hash, [a])).toMatch(/^https:\/\/explorer\.imd\.fun\/jobs\/job-1$/);
  });
  it("source: full request folded, wallet lines, no Done button, no time estimate", () => {
    const src = readFileSync("src/App.tsx", "utf8");
    expect(src).toContain("<summary>Show the full request</summary>");
    expect(src).toContain("Waiting for your wallet…");
    expect(src).toContain("Approved. Now confirm the request.");
    expect(src).toContain("Follow it on the IMD explorer.");
    expect(src).toContain('"Try again"');
    expect(src).not.toMatch(/>Done</);
    expect(src).not.toMatch(/minutes|usually takes/i);
  });
});

describe("D10. wallet storage", () => {
  it("offers browser-extension wallets only: no Coinbase SDK connector, wagmi storage off", () => {
    const src = readFileSync("src/wallet.tsx", "utf8");
    expect(src).not.toMatch(/coinbaseWallet\(/);
    expect(src).toMatch(/storage: null/);
    expect(src).toMatch(/dropWalletSnapshots\(\)/);
  });
  it("Disconnect and page load clear every wallet library key, keeping the site's flag and other data", () => {
    const m = new Map<string, string>([
      ["wagmi.store", "{}"],
      ["-CBWSDK:SCWStateManager:accounts", '["0x1111111111111111111111111111111111117aBc"]'],
      ["cbwsdk.store", "{}"],
      ["-walletlink:https://www.walletlink.org:session:id", "x"],
      ["wc@2:core:0.3//keychain", "{}"],
      [WALLET_FLAG, "1"],
      ["imd-record:tray:imd.fun", "[]"],
    ]);
    const storage = { get length() { return m.size; }, key: (i: number) => [...m.keys()][i] ?? null, getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k), clear: () => m.clear() };
    (globalThis as { localStorage?: unknown }).localStorage = storage;
    try {
      expect(dropWalletSnapshots()).toBe(5);
      expect([...m.keys()]).toEqual([WALLET_FLAG, "imd-record:tray:imd.fun"]);
      expect(WALLET_KEY.test(WALLET_FLAG)).toBe(false);
    } finally {
      delete (globalThis as { localStorage?: unknown }).localStorage;
    }
  });
});

describe("F. instructions", () => {
  const r = readFileSync("templates/instructions/rebuild.txt", "utf8");
  const c = readFileSync("templates/instructions/changes.txt", "utf8");
  // Revision 15 replaced "Attribute once per sentence." with the attribution rule (C5); the fact-first wording stays.
  const F16 = "When you do attribute, state the fact first and put who said it in a short clause after it, such as 'Dee Goens is taking over as chief executive from Jacob Horne, who announced the change on X.' Never open a sentence with 'a post says' or 'an article says', and never describe a speaker by role alone: name them.";
  const F17 = "When a person reports their own action, appointment or departure, treat it as first-hand: say it plainly with one attribution and no further hedging. Keep 'self-described' for someone asserting a role or credit that others would normally confirm.";
  // Revision 16: the Size row may rest on the project's own statistics, so "Leave the row out if no tracker reports that" is gone.
  const F18 = "The Size row must measure the project itself, such as its app's users, volume or value locked; never a side product such as a bridge.";
  it("rebuild and changes carry F16 and F17; rebuild carries F18 and the account entries", () => {
    for (const t of [r, c]) {
      expect(t).toContain(F16);
      expect(t).toContain(F17);
    }
    expect(r).toContain(F18);
    expect(r).not.toContain("Leave the row out if no tracker reports that");
    expect(r).toContain('Official accounts: "values": [{"name": "@zora on X", "text": "", "url": "https://x.com/zora"}]');
  });
  it("the current files are new files with new hashes", () => {
    const m = JSON.parse(readFileSync("src/instructions.json", "utf8")) as Record<string, { file: string }>;
    expect(readFileSync(`public/instructions/${m.rebuild!.file}`, "utf8")).toBe(r);
    expect(readFileSync(`public/instructions/${m.changes!.file}`, "utf8")).toBe(c);
    expect(m.rebuild!.file).not.toBe("rebuild-77f7165b2051.txt");
  });
});
