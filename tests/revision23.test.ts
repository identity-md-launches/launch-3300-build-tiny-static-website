/**
 * Revision 23: Sources takes as many links as fit in one request; one finished page-job state across Overview and
 * Contribute (a found:false result, a result listing that failed, a cached scan still catching up); the sent
 * confirmation names Etherscan until IMD names the job; DNS is a standard in Related; legacy Tokens values fold a
 * chain-and-address continuation into the token before it; saved new_line and links changes read "Note".
 */
import type { Hex } from "viem";
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ContributeTab, sentLink } from "../src/App";
import { artifactUrl, MAX_OBJECTIVE } from "../src/bodies";
import { addReady, CHANGE_WORDS, changesObjective, noteFit, noTarget, planLinks, type Change } from "../src/changes";
import { ACTIONS } from "../src/config";
import { flatTokens, keyFacts, tokensOfItems } from "../src/keyfacts";
import { pageJobsOf, readSettled, useRecordModel } from "../src/model";
import { parsePage, valueItemOf, type Page } from "../src/page";
import { OverviewTab, ownDomainEntry, relatedCards, type Ui } from "../src/Record";
import { refFromId, explorerAddressUrl } from "../src/subject";
import { measureChange, SuggestProvider } from "../src/Suggest";
import type { Activity } from "../src/useActivity";

const h = (c: string) => c.repeat(64);
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
/** Overview and Contribute for one subject, as SubjectView renders them, from its requests and the scan's freshness. */
function views(items: Activity[], subject: string, cached = false) {
  const jobs = pageJobsOf(items, cached);
  let m!: ReturnType<typeof useRecordModel>;
  const Harness = ({ tab }: { tab: "overview" | "contribute" }) => {
    m = useRecordModel(items, null, subject);
    const body =
      tab === "overview"
        ? createElement(OverviewTab, { m, ui, items, price: "", subjects: [], jobs, onRetry: () => {} })
        : createElement(ContributeTab, { onAsk: () => {}, researchPrice: "0.5 IMD", rec: m, onRefresh: () => {}, refreshing: false, items, unreadable: 0, jobs });
    return createElement(SuggestProvider, { subject, rec: m, children: body });
  };
  return { overview: renderToStaticMarkup(createElement(Harness, { tab: "overview" })), contribute: renderToStaticMarkup(createElement(Harness, { tab: "contribute" })), jobs, m };
}
const minimal = (subject: string): Page => parsePage(JSON.stringify({ subject: { name: subject, channels: [], contracts: [] }, infobox: [], lines: [{ id: "L1", section: "what_it_does", text: "It exists.", kind: "claim", by: "Team", quote: "", links: [] }] }), subject);

describe("fae46456: Sources takes as many links as fit in one request", () => {
  const links41 = Array.from({ length: 41 }, (_, i) => `https://example.com/${i + 1}`);
  it("planLinks has no fixed count: 41 and 400 distinct links are all usable", () => {
    expect(planLinks(links41.join("\n")).links).toHaveLength(41);
    expect(planLinks(Array.from({ length: 400 }, (_, i) => `https://example.com/${i}`).join("\n")).rejected).toEqual([]);
  });
  it("a links-only note with 41 links fits the objective and can be added", () => {
    const c: Change = { id: "n", type: "note", target: noTarget(), note: "", links: links41 };
    const len = changesObjective([c], { files: [artifactUrl(h("a"))], answers: [] }, [], refFromId("imd.fun"), () => "").length;
    expect(len).toBeLessThan(MAX_OBJECTIVE);
    expect(addReady("note", "", links41, 0, "", len)).toEqual({ ok: true, need: "" });
  });
  it("the budget is the objective's length check, and its reason is given when the note is too large", () => {
    expect(noteFit(MAX_OBJECTIVE)).toBe("");
    expect(noteFit(MAX_OBJECTIVE + 1)).toMatch(/does not fit in one request: it would be 7,901 characters, over the 7,900/);
    const r = addReady("note", "", ["https://example.com/"], 0, "", MAX_OBJECTIVE + 500);
    expect(r.ok).toBe(false);
    expect(r.need).toContain("Remove some links or shorten the note.");
  });
  it("measureChange builds the request Review would send, and grows with the links", () => {
    const { m } = views([pageJob("0x01", "imd.fun", { page: minimal("imd.fun"), fileHash: h("a") })], "imd.fun");
    const note = (links: string[]): Change => ({ id: "n", type: "note", target: noTarget(), note: "", links });
    const small = measureChange(m, note(links41))!;
    expect(small).toBeGreaterThan(900);
    expect(small).toBeLessThan(MAX_OBJECTIVE);
    const big = measureChange(m, note(Array.from({ length: 400 }, (_, i) => `https://example.com/${i}`)))!;
    expect(noteFit(big)).not.toBe("");
    // A record without what a request needs (a test stub) is not measured: no limit is invented.
    expect(measureChange({ scope: {} as never, resolve: () => undefined, sections: [] }, note(links41))).toBeNull();
  });
  it("the form and the link editor use the budget, never a 40-link limit", () => {
    const src = readFileSync("src/Suggest.tsx", "utf8");
    expect(src).toContain("const plan = useMemo(() => planLinks(links), [links]);");
    expect(src).toContain("const over = noteFit(s.measure({ ...change, links: p.links, retry: undefined }));");
    expect(src).not.toMatch(/up to \{max\}|READ_MAX_LINKS/);
  });
});

describe("e137d407: a completed found:false page job never offers Create the page", () => {
  const items = [pageJob("0x02", "person.example", { rejected: "The domain identifies a person, not a project.", fileHash: h("b") })];
  const v = views(items, "person.example");
  it("Overview explains it and links to Activity, with no Create the page", () => {
    expect(v.jobs).toMatchObject({ finished: true, loadFailed: false, settled: true });
    expect(v.overview).toContain("No project found");
    expect(v.overview).not.toMatch(/Create the page/);
  });
  it("Contribute: Page upkeep stays closed and offers Rebuild the page", () => {
    expect(v.contribute).not.toMatch(/Create the page/);
    expect(v.contribute).toContain("Rebuild the page");
    expect(v.contribute).toContain("The last page job found no project: The domain identifies a person, not a project.");
    expect(v.contribute).toMatch(/<details class="upkeep" id="rebuild">/);
  });
});

describe("70541e59: a result listing that failed is a failed read with Try again", () => {
  const failed = pageJob("0x03", "imd.fun", { filesRead: false, fileHash: null, sourcesError: "HTTP 404" });
  it("the read has settled, so the subject's page is not held at Reading the page", () => {
    expect(readSettled(failed)).toBe(true);
    expect(readSettled({ ...failed, sourcesError: null })).toBe(false);
    expect(pageJobsOf([failed])).toMatchObject({ finished: true, loadFailed: true });
  });
  it("Overview and Page upkeep say The page could not be loaded. Try again.", () => {
    const v = views([failed], "imd.fun");
    for (const html of [v.overview, v.contribute]) {
      expect(html).toContain("The page could not be loaded.");
      expect(html).toMatch(/<button[^>]*>Try again\.<\/button>/);
      expect(html).not.toMatch(/Create the page|Reading the page…|Reading the record from Ethereum/);
    }
  });
  it("App treats a failed lookup as settled for the open subject", () => {
    expect(readFileSync("src/App.tsx", "utf8")).toContain("return mine.every(readSettled) ? mine : null;");
  });
});

describe("561b1b5f: the sent confirmation names Etherscan until IMD names the job", () => {
  const tx = `0x${"9".repeat(64)}`;
  it("before admission: View the Ethereum transaction, on Etherscan", () => {
    expect(sentLink(tx, [], {})).toEqual({ href: `https://etherscan.io/tx/${tx}`, text: "View the Ethereum transaction", job: false });
  });
  it("after admission: Follow it on the IMD explorer, to the job", () => {
    expect(sentLink(tx, [], { [tx]: "job-fixture-123" })).toEqual({ href: "https://explorer.imd.fun/jobs/job-fixture-123", text: "Follow it on the IMD explorer", job: true });
  });
  it("the toast stays until admission resolves, then hides after 8 seconds", () => {
    const src = readFileSync("src/App.tsx", "utf8");
    // Revision 24: the bar stays until dismissed.
    expect(src).toContain('aria-label="Dismiss" onClick={onDone}');
  });
});

describe("c2189d61: DNS is a standard, never Add this project", () => {
  const live = JSON.parse(readFileSync("tests/fixtures/live-pages.json", "utf8")).pages[1].raw.related as { name: string; id: string; relation: string }[];
  it("the archived ens.domains Related entries: only Uniswap and Safe can be added", () => {
    expect(live.find((r) => r.name === "DNS")).toMatchObject({ id: "icann.org" });
    expect(relatedCards(live, [], "ens.domains").filter((c) => c.addable).map((c) => c.addable)).toEqual(["uniswap.org", "safe.global"]);
  });
  it("standards by name; ICANN itself stays eligible for its own domain", () => {
    for (const name of ["DNS", "DNSSEC", "HTTPS", "TLS", "BIP-39", "RFC 1035", "Domain Name System"]) expect(ownDomainEntry({ name, id: "icann.org", relation: "" })).toBe(false);
    expect(ownDomainEntry({ name: "ICANN", id: "icann.org", relation: "DNS root" })).toBe(true);
  });
});

describe("358ab13d: a cached scan cannot establish that no page job finished", () => {
  it("while the scan for newer blocks runs, neither tab offers Create the page and Page upkeep stays closed", () => {
    const v = views([], "imd.fun", true);
    expect(v.jobs.settled).toBe(false);
    expect(v.overview).not.toMatch(/No page yet|Create the page/);
    expect(v.overview).toContain("Reading the page…");
    expect(v.contribute).not.toMatch(/Create the page/);
    expect(v.contribute).toContain("Reading the record from Ethereum…");
    expect(v.contribute).toMatch(/<details class="upkeep" id="rebuild">/);
  });
  it("once the current scan ends with no page job, Create the page is offered", () => {
    const v = views([], "imd.fun", false);
    expect(v.overview).toContain("No page yet");
    expect(v.overview).toContain("Create the page");
    expect(v.contribute).toMatch(/<details class="upkeep" id="rebuild" open="">/);
  });
  it("a cached scan that already holds a finished page job is enough to rule creation out", () => {
    expect(pageJobsOf([pageJob("0x04", "imd.fun", { page: minimal("imd.fun"), fileHash: h("c") })], true)).toMatchObject({ finished: true, settled: true });
  });
});

describe("c73ad91a: legacy Tokens values show Polygon under also on", () => {
  const ENS = "0xC18360217D8F7Ab5e7c516566761Ea12Ce7F9D72";
  const POL = "0xbd7a5cf51d22930b8b3df6d834f9bcef90ee7c4f";
  const home = `ENS governance token ${ENS} on Ethereum`;
  const rowOf = (row: object) => {
    const p = parsePage(JSON.stringify({ subject: { name: "ENS", channels: [], contracts: [] }, infobox: [row], lines: [] }), "ens.domains");
    return keyFacts(p, () => undefined, p.lines).rows[0]!;
  };
  const expectEns = (tokens: ReturnType<typeof flatTokens>) => {
    expect(tokens).toHaveLength(1);
    expect(tokens[0]).toMatchObject({ symbol: "ENS", address: ENS, chain: "Ethereum", url: `https://etherscan.io/address/${ENS}` });
    expect(tokens[0]!.also).toEqual([{ address: POL, chain: "Polygon", note: "" }]);
    expect(explorerAddressUrl(POL, tokens[0]!.also![0]!.chain)).toBe(`https://polygonscan.com/address/${POL}`);
  };
  it("a flat value with no values field", () => expectEns(rowOf({ label: "Tokens", value: `${home}; Polygon ${POL}`, lines: [] }).tokens));
  it("values split into strings: the chain-only entry folds into the token before it", () => {
    expectEns(rowOf({ label: "Tokens", value: `${home}; Polygon ${POL}`, values: [home, `Polygon ${POL}`], lines: [] }).tokens);
    const t = tokensOfItems([valueItemOf(home)!, valueItemOf(`Polygon ${POL}`)!]);
    expect(t).toHaveLength(1);
    expect(t[0]!.also).toEqual([{ address: POL, chain: "Polygon", note: "" }]);
  });
  it("a flat text of several tokens stays one text value (never split)", () => {
    expect(flatTokens(`GOV: votes, 0x1111111111111111111111111111111111111111 on Ethereum; PAY: fees, 0x2222222222222222222222222222222222222222 on Base`)).toEqual([]);
    expect(flatTokens(home)).toEqual([]);
  });
});

describe("9d8f30b9: saved new_line and links changes read Note", () => {
  it("labels, with the stored type kept", () => {
    expect(CHANGE_WORDS.new_line).toBe("Note");
    expect(CHANGE_WORDS.links).toBe("Note");
    expect(Object.values(CHANGE_WORDS)).not.toContain("Add a line that is missing");
    expect(Object.values(CHANGE_WORDS)).not.toContain("Add links to read");
  });
});
