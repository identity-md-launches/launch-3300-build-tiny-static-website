/**
 * Revision 32: layout only. Header link "Contributors" and the menu below 768 px; Home's search label for screen
 * readers only with a short placeholder below 480 px; About this page (heading once, no Pages touched, Funded by
 * aligned, Last built, Built with older instructions); Related's "+"; Sources grouped and de-duplicated; Activity's
 * folded rebuilds; Record headers without zero counts.
 */
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ACTIONS } from "../src/config";
import { CONTRIBUTORS_TITLE } from "../src/contributorStats";
import { NARROW_QUERY, SEARCH_PLACEHOLDER, SEARCH_PLACEHOLDER_SHORT } from "../src/HeaderSearch";
import { CONTRIBUTORS_LINK, SiteMenu } from "../src/SiteMenu";
import { AboutThisPage, ADD_PROJECT_LABEL, builtWithOlder, ChannelGroups, ContributorTable, lastBuiltText, OLDER_BUILD } from "../src/Record";
import { channelGroups, channelKey, dedupeChannels, type Channel } from "../src/page";
import { foldRebuilds, foldText, foldedRebuild } from "../src/ActivityList";
import { countsParts, countsWords, emptyCounts } from "../src/settle";
import { localDate } from "../src/dates";
import type { Activity } from "../src/useActivity";

const src = (p: string) => readFileSync(p, "utf8");
const css = src("src/styles.css");
const count = (s: string, x: string) => s.split(x).length - 1;

describe("A. header and home", () => {
  it("1: the header link reads Contributors; the page keeps its title", () => {
    const h = renderToStaticMarkup(createElement(SiteMenu, { docs: false, contributors: true }));
    expect(CONTRIBUTORS_LINK).toBe("Contributors");
    expect(h).toContain('href="#/contributors" aria-current="page">Contributors</a>');
    expect(h).toContain(">How it works</a>");
    expect(h).not.toContain("Top contributors");
    expect(CONTRIBUTORS_TITLE).toBe("Top contributors");
    expect(src("src/Contributors.tsx")).toContain("{CONTRIBUTORS_TITLE}</h1>");
    expect(src("src/Contributors.tsx")).toContain("{CONTRIBUTORS_LINE}");
  });
  it("2: below 768 px one row: name, search icon, Connect, and a menu button holding the two links", () => {
    const h = renderToStaticMarkup(createElement(SiteMenu, { docs: false, contributors: false }));
    expect(h).toMatch(/<button[^>]*class="site-menu-toggle"[^>]*aria-label="Menu"[^>]*aria-expanded="false"/);
    const app = src("src/App.tsx");
    const row = app.slice(app.indexOf('<div className="top-row">'), app.indexOf("</header>"));
    expect(row.indexOf("<HeaderSearch")).toBeLessThan(row.indexOf("<Connect />"));
    expect(row.indexOf("<Connect />")).toBeLessThan(row.indexOf("<SiteMenu"));
    const block = css.slice(css.indexOf("@media (max-width: 47.99rem) {\n  .top-row"));
    expect(block).toContain(".top-row, .top-row:has(.acct-wrap) { flex-wrap: nowrap;");
    expect(block).toContain(".top-nav { display: none; }");
    expect(block).toContain(".site-menu { display: block;");
    expect(css).toContain(".site-menu { display: none;");
    expect(css).toMatch(/\.site-menu-toggle \{[^}]*width: 44px; height: 44px;/);
  });
  it("3: the search label is for screen readers only; below 480 px the placeholder is short", () => {
    const home = src("src/Home.tsx");
    expect(home).toContain('<label htmlFor="lookup" className="sr-only">{SEARCH_PLACEHOLDER}</label>');
    expect(home).toContain("placeholder={narrow ? SEARCH_PLACEHOLDER_SHORT : SEARCH_PLACEHOLDER}");
    expect(SEARCH_PLACEHOLDER_SHORT).toBe("Search, or enter a website");
    expect(SEARCH_PLACEHOLDER).toBe("Search projects, or enter a website or contract address");
    expect(NARROW_QUERY).toBe("(max-width: 29.99rem)");
  });
});

const T = Date.UTC(2026, 10, 24, 12) / 1000;
const pay = (n: number) => `0x${String(n).repeat(40).slice(0, 40)}`;
const act = (n: number, kind: string, extra: Partial<Activity> = {}): Activity =>
  ({
    req: { requestId: `0x${n.toString(16).padStart(64, "0")}`, action: ACTIONS.research, kind, subject: "example.org", payer: pay(n % 9 + 1), blockNumber: BigInt(n), bodyJson: { objective: "" } },
    state: "completed",
    time: T,
    doneTime: T,
    ...extra,
  }) as unknown as Activity;

describe("B. overview", () => {
  it("4: 56 px between Related and About this page and one divider between them", () => {
    expect(css).toContain(".tab { gap: var(--space-4); }");
    expect(css).toContain(".related + .about-page { margin-top: 40px; }");
    expect(css).toMatch(/--space-4: 16px;/);
    expect(css).toContain(".rel-row:last-child { border-bottom: 0; }");
    expect(css).toMatch(/\.about-page \{[^}]*border-top: 1px solid/);
  });
  it("5: Page contributors shows once, no Pages touched on a project page, Funded by unindented", () => {
    const people = [{ address: pay(1), name: "alice.eth", sent: 2, added: 2, answered: 1, pages: 3 }];
    const h = renderToStaticMarkup(createElement(ContributorTable, { rows: people as never, labelledBy: "page-contributors-title", pages: false }));
    expect(h).not.toContain("Pages touched");
    expect(h).not.toContain("<caption");
    expect(h).toContain('aria-labelledby="page-contributors-title"');
    const all = renderToStaticMarkup(createElement(ContributorTable, { rows: people as never, labelledBy: "contributors-title", ranked: true }));
    expect(all).toContain("Pages touched");
    expect(src("src/Record.tsx")).toContain('<h3 id="page-contributors-title">Page contributors</h3>');
    expect(src("src/Record.tsx")).not.toContain('caption="Page contributors"');
    expect(css).toContain(".funders { display: grid; gap: var(--space-1); margin: 0; padding: 0; list-style: none; }");
  });
  it("6: Last built and Built with older instructions with Rebuild to Page upkeep", () => {
    expect(lastBuiltText({ doneTime: T, time: T - 600 })).toBe(`Last built ${localDate(T)}`);
    expect(localDate(T)).toBe("24 Nov 2026");
    expect(lastBuiltText({ doneTime: null, time: T })).toBe("Last built 24 Nov 2026");
    expect(lastBuiltText(undefined)).toBeNull();
    expect(builtWithOlder({ kind: "format" })).toBe(true);
    expect(builtWithOlder({ kind: "results", n: 2, format: true })).toBe(true);
    expect(builtWithOlder({ kind: "results", n: 2 })).toBe(false);
    expect(builtWithOlder(null)).toBe(false);
    const page = act(1, "add");
    const h = renderToStaticMarkup(createElement(AboutThisPage, { items: [page], subject: "example.org", latest: page, outdated: { kind: "format" } }));
    expect(h).toContain("Last built 24 Nov 2026");
    expect(h).toMatch(new RegExp(`${OLDER_BUILD} <a href="[^"]*rebuild">Rebuild</a>`));
    expect(count(h, "Page contributors")).toBe(1);
    const fresh = renderToStaticMarkup(createElement(AboutThisPage, { items: [page], subject: "example.org", latest: page, outdated: null }));
    expect(fresh).toContain("Last built 24 Nov 2026");
    expect(fresh).not.toContain(OLDER_BUILD);
  });
  it("7: Related's + button: 44 px target, label and tooltip Add this project", () => {
    expect(ADD_PROJECT_LABEL).toBe("Add this project");
    expect(css).toMatch(/\.rel-add \{[^}]*width: 44px; height: 44px;/);
    expect(css).toContain(".rel-add:hover .rel-tip, .rel-add:focus-visible .rel-tip { opacity: 1; visibility: visible; }");
    const rec = src("src/Record.tsx");
    expect(rec).toContain("{!c.found && c.addable && <RelatedAdd href={addHref(c.addable)}");
    expect(rec).toContain('<a className="rel-name" href={subjectHref(c.found)}>{c.name}</a>');
  });
});

describe("C. sources", () => {
  const ch = (label: string, url: string, tie: Channel["tie"] = "none"): Channel => ({ label, url, tie });
  const list = [
    ch("Website", "https://example.org/"),
    ch("Docs", "https://docs.example.org"),
    ch("X (Twitter)", "https://x.com/example", "linked"),
    ch("X", "https://x.com/Example/"),
    ch("ENS", "https://app.ens.domains/example.eth", "strong"),
    ch("Forum", "https://forum.other.net"),
  ];
  it("9: two entries that point to the same address show once, under the shorter name", () => {
    expect(channelKey("https://x.com/Example/")).toBe(channelKey("http://www.x.com/example"));
    const d = dedupeChannels(list, "example.org");
    expect(d).toHaveLength(5);
    const x = d.find((c) => channelKey(c.url) === channelKey("https://x.com/example"))!;
    expect(x.label).toBe("X");
    expect(x.status).toBe("linked");
  });
  it("8: four headings with a count each; Not verified closed by default; one line each above", () => {
    const g = channelGroups(list, "example.org");
    expect(g.map((x) => [x.status, x.channels.length])).toEqual([["own", 2], ["verified", 1], ["linked", 1], ["unverified", 1]]);
    const h = renderToStaticMarkup(createElement(ChannelGroups, { channels: list, domain: "example.org" }));
    for (const w of ["Own domain", "Verified on chain", "Linked from own site", "Not verified"]) expect(h).toContain(`<h3 class="channel-group-title">${w} <span class="channel-count small">`);
    expect(count(h, '<details class="channel-group" open="">')).toBe(3);
    expect(h).toMatch(/<details class="channel-group"><summary><h3 class="channel-group-title">Not verified/);
    expect(count(h, '<ul class="tie-key small"><li>')).toBe(1);
    expect(count(h.slice(h.indexOf("tie-key"), h.indexOf("</ul>")), "<li>")).toBe(4);
  });
});

describe("D. activity and record", () => {
  const folded = new Set<string>();
  const shown = { standing: (a: Activity) => (folded.has(a.req.requestId) ? ("folded" as const) : a.req.requestId.endsWith("1") ? ("shown" as const) : ("" as const)) };
  it("10: two or more folded rebuilds in a row collapse into one line; the shown rebuild and changes stay", () => {
    const now = act(1, "add");
    const ch1 = act(2, "changes");
    const r3 = act(3, "add"), r4 = act(4, "add"), r5 = act(5, "add");
    const ch6 = act(6, "changes");
    const r7 = act(7, "add");
    for (const a of [r3, r4, r5, r7, ch6]) folded.add(a.req.requestId);
    expect(foldedRebuild(ch6, shown)).toBe(false);
    const e = foldRebuilds([now, ch1, r3, r4, r5, ch6, r7], shown);
    expect(e.map((x) => (x.kind === "one" ? x.a.req.kind : `fold:${x.items.length}`))).toEqual(["add", "changes", "fold:3", "changes", "add"]);
    expect(foldText(3)).toBe("3 earlier rebuilds");
    const al = src("src/ActivityList.tsx");
    expect(al).toContain("aria-expanded={open}");
    expect(al).toContain("{foldText(e.items.length)}");
  });
  it("11: record section headers leave out kinds with a zero count", () => {
    const c = { ...emptyCounts(), stated: 18, claimed: 3 };
    expect(countsWords(c)).toBe("18 stated, 3 claimed");
    expect(countsParts(c).map((p) => p.group)).toEqual(["stated", "claimed"]);
  });
});
