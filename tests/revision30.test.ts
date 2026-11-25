/**
 * Revision 30: layout and bug fixes. The save star is icon only on the name or title line; the example cards link to
 * their page and carry no caption or logo; Open questions move from Overview to Contribute, each shown once, without
 * raw line references, and an answered question keeps its links after a rebuild; the two dark bars; dates in the
 * visitor's own time zone; a heading's focus outline only for keyboard visitors; Launch date follows corrections.
 */
import type { Hex } from "viem";
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it } from "vitest";
import { ContributeTab, SENT_TEXT, sentLink } from "../src/App";
import { ACTIONS } from "../src/config";
import { localDate, localDateTime, readDate } from "../src/dates";
import { ExampleCards, EXAMPLE_FALLBACK } from "../src/Home";
import { launchedNow, launchedOf, ownLineNow, pageJobsOf, useRecordModel } from "../src/model";
import { parsePage } from "../src/page";
import { cleanQuestion } from "../src/questions";
import { OverviewTab, type Ui } from "../src/Record";
import { SaveStar } from "../src/saved";
import { answerNote, SuggestProvider } from "../src/Suggest";
import type { Activity } from "../src/useActivity";
import type { Line } from "../src/page";
import type { Origin } from "../src/addresses";

const src = (f: string) => readFileSync(f, "utf8");
let block = 10n;
const req = (id: string, subject: string, kind: string, objective: string) => ({
  requestId: id as Hex, payer: "0x0085000000000000000000000000000000000000" as Hex, action: ACTIONS.research, body: "", bodyJson: { objective }, kind, title: "", subject, template: "", amount: 1n, blockNumber: block, transactionHash: `0x${id.slice(2).padEnd(64, "0")}` as Hex,
});
const base = { time: null, ens: null, jobId: null, oracle: null, refusal: null, sourcesError: null, edit: null, changes: null, sources: null, page: null, via: null, rejected: null, doneTime: null, logo: null, logoHash: null, filesRead: true };
function pageJob(id: string, subject: string, extra: Partial<Activity>): Activity {
  block++;
  return { ...base, req: req(id, subject, "add", "Research the project."), state: "completed", completion: { blockNumber: block, logIndex: 0, status: 0 }, ...extra } as unknown as Activity;
}
const ui: Ui = { filter: "all", setFilter: () => {}, openSet: new Set(), toggle: () => {}, openLines: () => {}, target: null };
function views(items: Activity[], subject: string) {
  const jobs = pageJobsOf(items, false);
  let m!: ReturnType<typeof useRecordModel>;
  const Harness = ({ tab }: { tab: "overview" | "contribute" }) => {
    m = useRecordModel(items, null, subject);
    const body =
      tab === "overview"
        ? createElement(OverviewTab, { m, ui, items, price: "", subjects: [], jobs, onRetry: () => {} })
        : createElement(ContributeTab, { onAsk: () => {}, researchPrice: "0.5 IMD", rec: m, onRefresh: () => {}, refreshing: false, items, unreadable: 0, jobs });
    return createElement(SuggestProvider, { subject, rec: m, children: body });
  };
  return { overview: renderToStaticMarkup(createElement(Harness, { tab: "overview" })), contribute: renderToStaticMarkup(createElement(Harness, { tab: "contribute" })), m };
}
const QUESTION = "Who audits the vault contracts [L42,L55,L91]?";
const page = parsePage(
  JSON.stringify({
    subject: { name: "Vault", channels: [], contracts: [] },
    infobox: [{ label: "Launched", value: "2021-05-04" }],
    open_questions: [QUESTION, "What is the fee (F1:L3)?"],
    lines: [{ id: "L1", section: "what_it_does", text: "It exists.", kind: "claim", by: "Team", quote: "", links: [] }],
  }),
  "vault.example",
);
const items = [pageJob("0x01", "vault.example", { page, fileHash: "a".repeat(64) } as Partial<Activity>)];
const count = (s: string, x: string) => s.split(x).length - 1;

describe("A: the save star", () => {
  it("is an icon-only button labelled Save, with no visible word", () => {
    const html = renderToStaticMarkup(createElement(SaveStar, { id: "vault.example", name: "Vault" }));
    expect(html).toContain('aria-label="Save"');
    expect(html).toContain('aria-pressed="false"');
    expect(html).not.toContain("save-word");
    expect(html).not.toMatch(/>Save</);
  });
  it("on a home row it sits in the name line, not on a line of its own", () => {
    const home = src("src/Home.tsx");
    expect(home).toContain('<div className="subject-head">');
    expect(home).not.toMatch(/<\/div>\s*<SaveStar id=\{s\.id\} name=\{s\.name\} \/>\s*<\/li>/);
    const css = src("src/styles.css");
    expect(css).toMatch(/\.subject-head \.save-star \{ margin-block: -10px;/);
    expect(css).toMatch(/\.save-star \{[^}]*width: 44px; height: 44px;/);
  });
  it("on a project page it ends the title line; the separate Save row is gone", () => {
    const rec = src("src/Record.tsx");
    expect(rec).toContain('<h1 id="record-title" tabIndex={-1}>{name}</h1>\n        {page && <SaveStar id={m.subject.id} name={name} />}\n      </div>');
    expect(rec).not.toContain("ov-save");
    expect(src("src/styles.css")).toContain(".title-row .save-star { margin-inline-start: auto; }");
  });
});

describe("B: the example cards", () => {
  it("each card links to the example's page; no From the page of, no logo", () => {
    const html = renderToStaticMarkup(createElement(ExampleCards, { example: { ...EXAMPLE_FALLBACK, from: "uniswap.org", name: "Uniswap", logoHash: null } }));
    expect(count(html, 'href="#/s/uniswap.org"')).toBe(3);
    expect(html).not.toContain("From the page of");
    expect(html).not.toContain("logo");
    expect(src("src/Home.tsx")).not.toContain("From the page of");
    expect(src("src/Docs.tsx")).not.toContain("ExampleFrom");
  });
  it("the fixed example links to its own page", () => {
    const html = renderToStaticMarkup(createElement(ExampleCards, { example: { ...EXAMPLE_FALLBACK, from: null, name: null, logoHash: null } }));
    expect(count(html, 'href="#/s/zora.co"')).toBe(3);
  });
});

describe("C: open questions", () => {
  it("Overview has no Open questions block", () => {
    const { overview } = views(items, "vault.example");
    expect(overview).not.toContain("Open questions");
    expect(overview).not.toContain("Answer this");
  });
  it("Contribute has Open questions (N) under the form, closed by default, with a toggle", () => {
    const { contribute } = views(items, "vault.example");
    expect(contribute).toContain("Open questions (2)");
    expect(contribute).toContain('aria-expanded="false"');
    expect(contribute).toMatch(/<ul id="cq-list"[^>]*hidden=""/);
    expect(contribute.indexOf("suggest-changes")).toBeLessThan(contribute.indexOf("Open questions (2)"));
  });
  it("each question shows once, without raw line references, and Answer this is described by it", () => {
    const { contribute } = views(items, "vault.example");
    expect(count(contribute, "Who audits the vault contracts")).toBe(1);
    expect(contribute).not.toContain("[L42");
    expect(contribute).not.toContain("F1:L3");
    expect(contribute).toContain("Who audits the vault contracts?");
    expect(contribute).not.toContain('class="sr-only">: ');
    expect(contribute).toMatch(/aria-describedby="cq-q-[^"]+">Answer this<\/a>/);
  });
  it("cleanQuestion drops line references in their usual shapes", () => {
    expect(cleanQuestion(QUESTION)).toBe("Who audits the vault contracts?");
    expect(cleanQuestion("Is the fee 0.3% (L3) or 1% [L4; L5]?")).toBe("Is the fee 0.3% or 1%?");
    expect(cleanQuestion("Which chain [F2:L14, A1] runs it?")).toBe("Which chain runs it?");
    expect(cleanQuestion("Is [the token] live?")).toBe("Is [the token] live?");
    expect(answerNote(QUESTION)).toBe("Answer to: Who audits the vault contracts?\n");
  });
  it("Answer this fills a form already on screen through an event, and the Record keeps Not known yet", () => {
    const s = src("src/Suggest.tsx");
    expect(s).toContain("window.dispatchEvent(new Event(ANSWER_EVENT));");
    expect(s).toContain("window.addEventListener(ANSWER_EVENT, on);");
    expect(src("src/Record.tsx")).toContain("<h2>Not known yet</h2>");
  });
  it("an answering job's own line is found after a rebuild carried it forward", () => {
    const line = { id: "L7", text: "Audited by X." } as unknown as Line;
    const byId = new Map([["L7", line]]);
    const a = { req: { requestId: "0xc1" }, fileHash: "c".repeat(64), jobId: null } as unknown as Activity;
    const scope = { pageHash: "p".repeat(64), after: [], carried: new Map([[`${"c".repeat(64)}|N1`, "L7"]]) };
    expect(ownLineNow(a, "N1", scope, byId, new Map())).toBe(line);
    // Over several rebuilds: by its permanent address.
    const b = { req: { requestId: "0xc2" }, fileHash: null, jobId: "11111111-2222-3333-4444-555555555555" } as unknown as Activity;
    const origins = new Map<string, Origin>([["L7", { jobId: "11111111-2222-3333-4444-555555555555", lineId: "N2", tx: "", also: [] }]]);
    expect(ownLineNow(b, "N2", { ...scope, carried: new Map() }, byId, origins)).toBe(line);
    // Not folded in yet: its own prefixed id.
    const own = { id: "0xc1:N1" } as unknown as Line;
    expect(ownLineNow(a, "N1", scope, new Map([["0xc1:N1", own]]), new Map())).toBe(own);
  });
});

describe("D: the docs page", () => {
  it("uses the full content width: 200px menu, text up to 720px, 56px between", () => {
    const css = src("src/styles.css");
    expect(css).toContain(".doc-layout { grid-template-columns: 200px minmax(0, 720px); column-gap: 56px; }");
    expect(css).toContain(".docs.tab { display: block; max-width: none; }");
    expect(css).toContain(".docs .doc-layout { margin-top: 40px; }");
    expect(css).toContain(".doc-sec { margin-top: 48px; }");
    expect(css).toContain(".doc-sec h2 { margin: 0 0 16px; }");
    expect(css).toContain("grid-template-columns: repeat(auto-fit, minmax(200px, 1fr))");
    expect(css).toMatch(/\.doc-toc a \{ font-size: var\(--text-nav\); color: var\(--color-text-secondary\); text-decoration: none; \}/);
    expect(css).toContain(".doc-toc a[aria-current] { color: var(--color-accent-solid);");
  });
});

describe("E: the two dark bars", () => {
  it("the changes bar reads N change · price and the button; the counts moved to Review", () => {
    const s = src("src/Suggest.tsx");
    const tray = s.slice(s.indexOf('className="tray-text"'), s.indexOf("Review and submit"));
    expect(tray).not.toContain("with a source");
    expect(tray).not.toContain("room for about");
    expect(s).toContain('<p className="small review-meta">');
    expect(src("src/styles.css")).not.toMatch(/\.tray-meta \{[^}]*gray-200/);
  });
  it("the sent bar: Sent to the swarm. and one link that becomes Follow the job", () => {
    const tx = `0x${"9".repeat(64)}`;
    expect(SENT_TEXT).toBe("Sent to the swarm.");
    expect(sentLink(tx, [], {}).text).toBe("View the transaction");
    expect(sentLink(tx, [], { [tx]: "job-1" }).text).toBe("Follow the job");
    expect(src("src/App.tsx")).not.toContain("IMD is assigning it");
  });
});

describe("F: small fixes", () => {
  const tz = process.env.TZ;
  afterEach(() => {
    process.env.TZ = tz;
  });
  it("a date and time come from the visitor's own clock", () => {
    process.env.TZ = "America/Los_Angeles";
    // 06:49 UTC on 26 Nov is 22:49 on 25 Nov in Los Angeles: the date must not run a day ahead.
    const t = Date.UTC(2026, 10, 26, 6, 49);
    expect(localDateTime(t)).toBe("25 Nov 2026, 22:49");
    expect(localDateTime(t / 1000)).toBe("25 Nov 2026, 22:49");
    expect(readDate(new Date(t).toISOString())).toBe("25 Nov 2026");
    expect(readDate(String(t))).toBe("25 Nov 2026");
    expect(localDate(t)).toBe("25 Nov 2026");
    // A calendar date has no time zone: as written.
    expect(readDate("2026-11-26")).toBe("26 Nov 2026");
    expect(src("src/App.tsx")).not.toContain("readDate(d.toISOString())");
  });
  it("a focused heading shows its outline only to keyboard visitors", () => {
    const css = src("src/styles.css");
    expect(css).toContain('h1[tabindex="-1"]:focus, h2[tabindex="-1"]:focus { outline: none; }');
    expect(css).toContain('html.kbd h1[tabindex="-1"]:focus-visible');
    expect(src("src/main.tsx")).toContain('html.classList.add("kbd")');
  });
  it("Find a project and Sort by have screen-reader labels and share a row with the filters", () => {
    const home = src("src/Home.tsx");
    expect(home).toContain('<label htmlFor="find-project" className="sr-only">Find a project</label>');
    expect(home).toContain('<label htmlFor="sort-projects" className="sr-only">Sort by</label>');
    expect(home).toContain('<div className="list-bar">');
    expect(src("src/styles.css")).toMatch(/@media \(min-width: 60rem\) \{\s*\.list-bar \{ display: flex;/);
  });
  it("Launch date follows a correction of the Launched fact", () => {
    const p = { infobox: [{ label: "Launched", value: "2021-05-04" }] };
    expect(launchedNow(p, [])).toBe(launchedOf(p));
    const fix = (value: string, op?: "set" | "remove") => ({ ...base, changes: { patches: [{ kind: "infobox", target: "Launched", value, lines: [], ...(op ? { op } : {}) }] }, req: req(`0x0${value.length}`, "vault.example", "changes", "") }) as unknown as Activity;
    expect(launchedNow(p, [fix("March 2018")])).toBe(Date.UTC(2018, 2, 1));
    expect(launchedNow(p, [fix("March 2018"), fix("2019-07-02")])).toBe(Date.UTC(2019, 6, 2));
    expect(launchedNow(p, [fix("", "remove")])).toBe(null);
    expect(src("src/model.ts")).toContain("launched: launchedNow(core.page, core.after)");
  });
});
