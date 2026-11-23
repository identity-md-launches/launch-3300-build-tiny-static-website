/**
 * The tenth revision, answering an outside review: a later source flags a reworded sentence on the assembled
 * Overview; a www tenant of a shared host keeps its own domain; a standalone check stays in Proven when it confirms
 * another row; a rebuild's A<n> resolves only against its own Earlier results; whole-record links and affects lists
 * are kept whole; and Try again reads a failed file again.
 */
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { Hex } from "viem";
import { artifactUrl, priorText } from "../src/bodies";
import { ACTIONS } from "../src/config";
import { coreOf, useRecordModel } from "../src/model";
import { channelStatus, onDomain, parseChanges, parseLines, parsePage, type Page } from "../src/page";
import { OverviewTab, RecordTab, type Ui } from "../src/Record";
import { rowClass, settleAll } from "../src/settle";
import { SuggestProvider } from "../src/Suggest";
import { domainOfId } from "../src/subject";
import { memoRead, type Activity } from "../src/useActivity";
import { websiteOf } from "../src/keyfacts";

const h = (c: string) => c.repeat(64);
let block = 10n;
const req = (id: string, subject: string, kind: string, objective: string, action: string = ACTIONS.research) => ({
  requestId: id as Hex, payer: "0x0000000000000000000000000000000000000001" as Hex, action, body: "", bodyJson: { objective }, kind, title: "", subject, template: "", amount: 1n, blockNumber: block, transactionHash: `0x${id.slice(2).padEnd(64, "0")}` as Hex,
});
const base = { time: null, ens: "alice.eth", jobId: null, oracle: null, refusal: null, sourcesError: null, edit: null, changes: null, sources: null, page: null, via: null, rejected: null, doneTime: null, logo: null, logoHash: null, filesRead: true };
function pageJob(id: string, subject: string, page: Page, hash: string, objective = "Research the project."): Activity {
  block++;
  return { ...base, req: req(id, subject, "add", objective), state: "completed", completion: { blockNumber: block, logIndex: 0, status: 0 }, page, fileHash: hash } as unknown as Activity;
}
function changesJob(id: string, subject: string, pageHash: string, body: object, changesText = "(1) type: links; target: none; note: none; links: none"): Activity {
  block++;
  const text = JSON.stringify({ sources: [{ id: "S1", url: "https://tracker.example.org/x", type: "article", publisher: "Tracker", could_open: true }], notes: "", ...body });
  const objective = `Judge the changes. The record so far: ${priorText({ files: [artifactUrl(pageHash)], answers: [] })}. Channels already known: none known. The changes: ${changesText}`;
  return { ...base, req: req(id, subject, "changes", objective), state: "completed", completion: { blockNumber: block, logIndex: 0, status: 0 }, fileHash: h(id.slice(-1)), sources: parseLines(text, { changes: true }), changes: parseChanges(text) } as unknown as Activity;
}
const ui = (filter: Ui["filter"] = "all"): Ui => ({ filter, setFilter: () => {}, openSet: new Set(), toggle: () => {}, openLines: () => {}, target: null });

/** The assembled Overview (or Record) as a visitor's browser builds it: useRecordModel, then the tab. */
function render(items: Activity[], subject: string, tab: "overview" | "record", filter: Ui["filter"] = "all"): { html: string; m: ReturnType<typeof useRecordModel> } {
  let model!: ReturnType<typeof useRecordModel>;
  function Harness() {
    const m = useRecordModel(items, null, subject);
    model = m;
    const body = tab === "overview" ? createElement(OverviewTab, { m, ui: ui(), items, price: "", subjects: [] }) : createElement(RecordTab, { m, ui: ui(filter) });
    return createElement(SuggestProvider, { subject, rec: m, children: body });
  }
  return { html: renderToStaticMarkup(createElement(Harness)), m: model };
}
const dots = (html: string) => (html.match(/class="dispute-dot dispute-/g) ?? []).length;
const notice = (html: string) => /A newer source disputes ([\d,]+) parts? of this page\./.exec(html)?.[1] ?? null;

/* ---------- 36faaca9 ---------- */
describe("36faaca9: a later source flags a reworded summary sentence on the assembled Overview", () => {
  const SENT = "A decentralized protocol and an app are available.";
  const NEW = "A decentralized protocol and a web app are available.";
  const PH = h("a");
  const page = (extra: object = {}) =>
    parsePage(
      JSON.stringify({
        subject: { name: "Example", channels: [{ label: "Site", url: "https://example.com/", tie: "strong" }] },
        summary: [{ text: SENT, lines: ["L1"] }, { text: "It has a team.", lines: ["L2"] }],
        lines: [
          { id: "L1", section: "what_it_does", text: "Example runs a protocol and an app.", kind: "statement", by: "Example", sources: ["S1"], quote: "protocol" },
          { id: "L2", section: "what_it_does", text: "Example has a team.", kind: "statement", by: "Example", sources: ["S1"], quote: "team" },
          { id: "L3", section: "what_it_does", text: "Example has three apps.", kind: "statement", by: "Example", sources: ["S1"], quote: "apps" },
          { id: "L4", section: "what_it_does", text: "Example has docs.", kind: "statement", by: "Example", sources: ["S1"], quote: "docs" },
          { id: "L5", section: "what_it_does", text: "Example has a fee.", kind: "statement", by: "Example", sources: ["S1"], quote: "fee" },
        ],
        sources: [{ id: "S1", ref: "https://example.com/", type: "page" }],
        ...extra,
      }),
      "example.com",
    );
  const reword = () => changesJob("0xc1", "example.com", PH, { items: [{ n: 1, type: "reword", target: `summary sentence "${SENT}"`, verdict: "kept", why: "", final_text: NEW, lines: [] }], lines: [], affects: [] }, `(1) type: reword; target: summary sentence "${SENT}"; note: none; links: none`);
  const N1 = { id: "N1", source: "S1", section: "what_it_does", text: "Tracker says the web app shut down.", kind: "claim", by: "Tracker", quote: "shut down", links: [] };

  it("shows the new wording, one amber dot opening N1 and the notice for 1 part", () => {
    const first = pageJob("0xa1", "example.com", page(), PH);
    const rw = reword();
    const later = changesJob("0xc2", "example.com", PH, { items: [{ n: 1, type: "links", target: "none", verdict: "kept", why: "", lines: ["N1"] }], lines: [N1], affects: [{ kind: "summary", target: NEW, type: "outdates", by_line: "N1" }] });
    const { html, m } = render([first, rw, later], "example.com", "overview");
    expect(m.summary[0]!.text).toBe(NEW);
    expect(m.summary[0]!.rewordJob?.req.requestId).toBe("0xc1");
    expect(html).toContain(NEW);
    expect(dots(html)).toBe(1);
    expect(html).toContain('class="dispute-dot dispute-outdates"');
    expect(html).toMatch(/aria-label="Superseded: open the newer line that disputes this sentence"/);
    expect(notice(html)).toBe("1");
    expect(html).toContain("A newer source disputes 1 part of this page.");
  });

  it("counts all six affected parts, the reworded sentence among them", () => {
    const affects = [
      { kind: "summary", target: NEW, type: "outdates", by_line: "N1" },
      ...["L2", "L3", "L4", "L5"].map((t) => ({ kind: "line", target: `F1:${t}`, type: "outdates", by_line: "N1" })),
      { kind: "summary", target: "It has a team.", type: "contradicts", by_line: "N1" },
    ];
    const first = pageJob("0xa1", "example.com", page(), PH);
    const rw = reword();
    const later = changesJob("0xc2", "example.com", PH, { items: [{ n: 1, type: "links", target: "none", verdict: "kept", why: "", lines: ["N1"] }], lines: [N1], affects });
    const { html } = render([first, rw, later], "example.com", "overview");
    expect(dots(html)).toBe(2);
    expect(notice(html)).toBe("6");
  });

  it("an entry from before the rewrite stays superseded on the assembled Overview", () => {
    const early = changesJob("0xc0", "example.com", PH, { items: [{ n: 1, type: "links", target: "none", verdict: "kept", why: "", lines: ["N1"] }], lines: [N1], affects: [{ kind: "summary", target: NEW, type: "outdates", by_line: "N1" }] });
    const first = pageJob("0xa1", "example.com", page(), PH);
    const rw = reword();
    // The same entry completed before the rewrite: its job sorts first.
    (early as { completion: { blockNumber: bigint } }).completion.blockNumber = first.completion!.blockNumber;
    (early as { completion: { logIndex: number } }).completion.logIndex = 1;
    const { html } = render([first, early, rw], "example.com", "overview");
    expect(dots(html)).toBe(0);
  });
});

/* ---------- 5a7b59a1 ---------- */
describe("5a7b59a1: a www tenant on a shared host keeps its own-domain attribution", () => {
  const PH = h("b");
  const text = JSON.stringify({
    subject: { name: "Tenant", channels: [{ label: "Website", url: "https://www.github.io/", tie: "none" }] },
    summary: [{ text: "The tenant publishes docs.", lines: ["L1"] }],
    lines: [{ id: "L1", section: "what_it_does", text: "The tenant publishes its own documentation.", kind: "statement", by: "Tenant", sources: ["S1"], quote: "documentation" }],
    sources: [{ id: "S1", ref: "https://www.github.io/docs", type: "page" }],
  });
  it("compares the full hostname: www.github.io owns www.github.io and its subdomains, not github.io or other tenants", () => {
    expect(domainOfId("www.github.io")).toBe("www.github.io");
    expect(onDomain("https://www.github.io/docs", "www.github.io")).toBe(true);
    expect(onDomain("https://docs.www.github.io/", "www.github.io")).toBe(true);
    expect(onDomain("https://github.io/", "www.github.io")).toBe(false);
    expect(onDomain("https://me.github.io/", "www.github.io")).toBe(false);
    // Unchanged elsewhere: www. of an ordinary domain still belongs to it.
    expect(onDomain("https://www.uniswap.org/", "uniswap.org")).toBe(true);
    expect(onDomain("https://docs.uniswap.org/", "app.uniswap.org")).toBe(true);
    expect(channelStatus({ url: "https://www.github.io/", tie: "none" }, "www.github.io")).toBe("own");
    expect(websiteOf([{ label: "Website", url: "https://www.github.io/", tie: "none" }], "www.github.io")?.url).toBe("https://www.github.io/");
  });
  it("Overview's Website says Own domain and Record shows L1 as a Statement: Stated 1, Claimed 0", () => {
    const items = [pageJob("0xa2", "www.github.io", parsePage(text, domainOfId("www.github.io")), PH)];
    const o = render(items, "www.github.io", "overview");
    expect(o.html).toContain("Own domain");
    expect(o.html).not.toContain("Not verified");
    const r = render(items, "www.github.io", "record", "stated");
    expect(r.m.counts).toMatchObject({ stated: 1, claimed: 0 });
    expect(r.html).toContain("The tenant publishes its own documentation.");
  });
});

/* ---------- 5c38d3a8 ---------- */
describe("5c38d3a8: a standalone check stays in Proven when it confirms another row", () => {
  const PH = h("c");
  const page = parsePage(
    JSON.stringify({
      subject: { name: "Reg", channels: [{ label: "Site", url: "https://reg.example/", tie: "strong" }] },
      summary: [{ text: "Reg runs a registry.", lines: ["P1"] }],
      lines: [
        { id: "P1", section: "on_chain", text: "The registry's owner is the multisig.", kind: "proof", rerun: "cast call 0x1 owner()", fact: { name: "Owner", value: "0xabc", chain: "Ethereum", block: "100" } },
        { id: "P2", section: "on_chain", text: "The standalone check verified the registry.", kind: "proof", rerun: "cast code 0x1" },
        { id: "P3", section: "on_chain", text: "The registry's fee is 1.", kind: "proof", rerun: "cast call 0x1 fee()", fact: { name: "Fee", value: "1", chain: "Ethereum", block: "100" } },
      ],
      sources: [],
    }),
    "reg.example",
  );
  const C1 = { id: "C1", source: "S1", section: "on_chain", text: "Tracker says the registry was verified.", kind: "claim", by: "Tracker", quote: "verified", links: [{ type: "confirms", target: "F1:P2" }] };
  const items = () => [pageJob("0xa3", "reg.example", page, PH), changesJob("0xc3", "reg.example", PH, { items: [{ n: 1, type: "links", target: "none", verdict: "kept", why: "", lines: ["C1"] }], lines: [C1], affects: [] })];

  it("Home and Record count 4 proven: three checks and the confirmed claim", () => {
    const core = coreOf(items());
    expect(core.counts).toMatchObject({ proven: 4, checks: 3, confirmed: 1, claimed: 0 });
    const lines = core.sections.flatMap((s) => s.rows.map((r) => r.line));
    expect(rowClass(lines.find((l) => l.id === "0xc3:C1")!, settleAll(lines).by.get("0xc3:C1"))).toBe("proven");
  });
  it("the Proven filter renders a searchable Proof row for P2 as well as the confirmed claim", () => {
    const { html, m } = render(items(), "reg.example", "record", "proven");
    expect(m.counts.proven).toBe(4);
    expect(html).toContain("The standalone check verified the registry.");
    expect(html).toContain("Tracker says the registry was verified.");
    expect(html).toMatch(/4 matches|4 lines|Proven 4|Proven<[^>]*>[^<]*4/);
  });
});

/* ---------- 00a39d36 ---------- */
describe("00a39d36: a later unrelated panel answer never settles a rebuild line", () => {
  const PH = h("d");
  const page = parsePage(
    JSON.stringify({
      subject: { name: "Ex", channels: [{ label: "Site", url: "https://ex.example/", tie: "strong" }] },
      summary: [],
      lines: [{ id: "L1", section: "history", text: "The launch was in July.", kind: "statement", by: "Ex", sources: ["S1"], quote: "July", links: [{ type: "confirms", target: "A1" }] }],
      sources: [{ id: "S1", ref: "https://ex.example/", type: "page" }],
    }),
    "ex.example",
  );
  const rebuildObjective = `Rebuild. Start from the earlier results: ${priorText({ files: [artifactUrl(h("e"))], answers: [] })}. Fetch each file.`;
  const panel = () => {
    block++;
    return { ...base, req: { ...req("0xp4", "ex.example", "", "", ACTIONS.oracle), title: "The docs price a job at 0.5 IMD", bodyJson: { question: "q" } }, state: "completed", completion: { blockNumber: block, logIndex: 0, status: 0 }, jobId: "job-77", oracle: { answer: "true", agreed: 5, panelSize: 5 } } as unknown as Activity;
  };

  it("L1 stays Stated and its missing A1 stays listed for Page upkeep", () => {
    const before = coreOf([pageJob("0xa4", "ex.example", page, PH, rebuildObjective)]);
    expect(before.counts).toMatchObject({ proven: 0, stated: 1 });
    const after = coreOf([pageJob("0xa4", "ex.example", page, PH, rebuildObjective), panel()]);
    expect(after.counts).toMatchObject({ proven: 0, stated: 1 });
    expect(after.unresolved).toEqual([expect.objectContaining({ lineId: "L1", target: "A1" })]);
    const l1 = after.sections.flatMap((s) => s.rows).find((r) => r.line.id === "L1")!;
    expect(l1.line.links).toEqual([]);
  });

  it("an answer the rebuild listed still settles its line", () => {
    const listed = `Rebuild. Start from the earlier results: ${priorText({ files: [artifactUrl(h("e"))], answers: [{ title: "The launch was in July", answer: "true", agreed: 5, size: 5, url: "https://explorer.imd.fun/jobs/job-77" }] })}. Fetch each file.`;
    const core = coreOf([pageJob("0xa4", "ex.example", page, PH, listed), panel()]);
    expect(core.counts).toMatchObject({ proven: 1, stated: 0 });
    expect(core.unresolved).toEqual([]);
  });

  it("a changes line that cites a later answer by its own URL still settles", () => {
    const p = panel();
    block++;
    const text = JSON.stringify({
      sources: [{ id: "S1", url: "https://tracker.example.org/x", type: "article", publisher: "Tracker", could_open: true }],
      items: [{ n: 1, type: "links", target: "none", verdict: "kept", why: "", lines: ["N1"] }],
      lines: [{ id: "N1", source: "S1", section: "history", text: "Tracker says a job costs 0.5 IMD.", kind: "claim", by: "Tracker", quote: "0.5", links: [{ type: "confirms", target: "A1" }] }],
      affects: [],
    });
    const objective = `Judge. The record so far: ${priorText({ files: [artifactUrl(PH)], answers: [{ title: "The docs price a job at 0.5 IMD", answer: "true", agreed: 5, size: 5, url: "https://explorer.imd.fun/jobs/job-77" }] })}. Channels already known: none known.`;
    const ch = { ...base, req: req("0xc4", "ex.example", "changes", objective), state: "completed", completion: { blockNumber: block, logIndex: 0, status: 0 }, fileHash: h("4"), sources: parseLines(text, { changes: true }), changes: parseChanges(text) } as unknown as Activity;
    const core = coreOf([pageJob("0xa4", "ex.example", page, PH, rebuildObjective), p, ch]);
    const lines = core.sections.flatMap((s) => s.rows.map((r) => r.line));
    expect(lines.find((l) => l.id === "0xc4:N1")!.links).toEqual([{ type: "confirms", target: "A1" }]);
    expect(core.counts.confirmed).toBe(1);
    // L1's own A1 still names no answer of its rebuild.
    expect(core.unresolved.map((u) => u.lineId)).toEqual(["L1"]);
  });
});

/* ---------- c1edc4a2 ---------- */
describe("c1edc4a2: the changes parser keeps every link and every affects entry", () => {
  it("a proof link after ten agreements still settles N1 as Contradicted", () => {
    const PH = h("f");
    const lines = Array.from({ length: 10 }, (_, i) => ({ id: `L${i + 1}`, section: "fees", text: `Source ${i + 1} reports a ten-token fee.`, kind: "statement", by: "Fee", sources: ["S1"], quote: "ten" }));
    const page = parsePage(
      JSON.stringify({
        subject: { name: "Fee", channels: [{ label: "Site", url: "https://fee.example/", tie: "strong" }] },
        summary: [],
        lines: [...lines, { id: "P1", section: "fees", text: "The fee read on chain is five tokens.", kind: "proof", rerun: "cast call 0x1 fee()" }],
        sources: [{ id: "S1", ref: "https://fee.example/", type: "page" }],
      }),
      "fee.example",
    );
    const links = [...lines.map((l) => ({ type: "agrees", target: `F1:${l.id}` })), { type: "contradicts", target: "F1:P1" }];
    const N1 = { id: "N1", source: "S1", section: "fees", text: "Tracker says the current live fee is ten tokens.", kind: "claim", by: "Tracker", quote: "ten", links };
    const job = changesJob("0xc5", "fee.example", PH, { items: [{ n: 1, type: "links", target: "none", verdict: "kept", why: "", lines: ["N1"] }], lines: [N1], affects: [] });
    expect(job.changes!.data.lines[0]!.links).toHaveLength(11);
    const core = coreOf([pageJob("0xa5", "fee.example", page, PH), job]);
    const all = core.sections.flatMap((s) => s.rows.map((r) => r.line));
    expect(rowClass(all.find((l) => l.id === "0xc5:N1")!, settleAll(all).by.get("0xc5:N1"))).toBe("contradicted");
    expect(core.counts).toMatchObject({ claimed: 0, contradicted: 1 });
    // The ten agreements still render on their targets.
    expect(all.filter((l) => l.links.some((k) => k.type === "agrees" && k.target === "0xc5:N1"))).toHaveLength(10);
  });

  it("201 affects entries mark 200 lines and the summary sentence: 201 parts and one amber dot", () => {
    const PH = h("9");
    const SUM = "The project is operating its deployments on Network A.";
    const lines = Array.from({ length: 200 }, (_, i) => ({ id: `L${i + 1}`, section: "on_chain", text: `Deployment ${i + 1} is operating on Network A.`, kind: "statement", by: "Proj", sources: ["S1"], quote: "operating" }));
    const page = parsePage(
      JSON.stringify({ subject: { name: "Proj", channels: [{ label: "Site", url: "https://proj.example/", tie: "strong" }] }, summary: [{ text: SUM, lines: ["L1"] }], lines, sources: [{ id: "S1", ref: "https://proj.example/", type: "page" }] }),
      "proj.example",
    );
    const affects = [...lines.map((l) => ({ kind: "line", target: `F1:${l.id}`, type: "outdates", by_line: "N1" })), { kind: "summary", target: SUM, type: "outdates", by_line: "N1" }];
    const N1 = { id: "N1", source: "S1", section: "on_chain", text: "Tracker says all 200 deployments shut down.", kind: "claim", by: "Tracker", quote: "shut down", links: [] };
    const job = changesJob("0xc6", "proj.example", PH, { items: [{ n: 1, type: "links", target: "none", verdict: "kept", why: "", lines: ["N1"] }], lines: [N1], affects });
    expect(job.changes!.affects).toHaveLength(201);
    const { html } = render([pageJob("0xa6", "proj.example", page, PH), job], "proj.example", "overview");
    expect(notice(html)).toBe("201");
    expect(dots(html)).toBe(1);
  });
});

/* ---------- e46b5e80 ---------- */
describe("e46b5e80: Try again reads a failed file again", () => {
  it("evicts a result whose file read failed, and keeps a successful read", async () => {
    const memo = new Map<string, Promise<{ sourcesError: string | null; n: number }>>();
    let n = 0;
    const run = async () => ({ sourcesError: ++n === 1 ? "artifact answered 503" : null, n });
    expect((await memoRead(memo, "k", run)).sourcesError).toBe("artifact answered 503");
    await Promise.resolve();
    const second = await memoRead(memo, "k", run);
    expect(second).toEqual({ sourcesError: null, n: 2 });
    await Promise.resolve();
    expect(await memoRead(memo, "k", run)).toBe(second);
    expect(n).toBe(2);
  });
  it("evicts a rejected read too", async () => {
    const memo = new Map<string, Promise<{ sourcesError: string | null }>>();
    let n = 0;
    const run = () => (++n === 1 ? Promise.reject(new Error("down")) : Promise.resolve({ sourcesError: null }));
    await expect(memoRead(memo, "k", run)).rejects.toThrow("down");
    await Promise.resolve();
    await memoRead(memo, "k", run);
    expect(n).toBe(2);
  });
});
