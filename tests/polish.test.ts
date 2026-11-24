/** The suggest-a-change polish: numbers, the panel, key facts targets, reword dots, Review, the footer, the header. */
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { artifactUrl } from "../src/bodies";
import { addReady, itemText, keyFactTarget, makeRefOf, NOTE_MIN, noSourceSummary, parseItems, sentenceTarget, lineTarget, targetText, validateChange, wordDiff, type Change } from "../src/changes";
import { formatDigits, formatNumbers } from "../src/numbers";
import { ChangePanel, EVIDENCE_MAX, evidenceOf, liveTarget, SuggestProvider } from "../src/Suggest";
import { withRewordRefs } from "../src/model";
import type { Line } from "../src/page";
import type { Activity } from "../src/useActivity";

const line = (id: string, kind: Line["kind"], over: Partial<Line> = {}): Line => ({
  id, section: "about", text: `Line ${id} text.`, kind, marked: kind, labelNote: "", channel: null, by: kind === "claim" ? "Example Weekly" : "", sources: [], srcKeys: [],
  quote: kind === "proof" ? "" : `Quote of ${id}`, rerun: kind === "proof" ? "cast call" : "", fact: null, from: [], links: [], ...over,
});

describe("numbers from result files", () => {
  it("formats the brief's example and the rule's edges", () => {
    expect(formatNumbers("59822.623566003452582778 imdUSD")).toBe("59,822.62 imdUSD");
    expect(formatNumbers("Supply 1000000000 IMD")).toBe("Supply 1,000,000,000 IMD");
    expect(formatNumbers("price 0.000123456 ETH")).toBe("price 0.0001235 ETH");
    expect(formatNumbers("0.123456")).toBe("0.1235");
    expect(formatNumbers("1.999")).toBe("2");
    expect(formatNumbers("0.99999")).toBe("1");
    expect(formatNumbers("12.3456%")).toBe("12.35%");
    expect(formatNumbers("1,234,567.891 tokens")).toBe("1,234,567.89 tokens");
    expect(formatDigits("1000000000000000000000000000", "")).toBe("1,000,000,000,000,000,000,000,000,000");
  });
  it("leaves addresses, hashes, block numbers, ids, versions, dates and years alone", () => {
    const keep = [
      "0xd34a99bc0f67ae1bbd63c660e6d0b0dd03e263b7",
      "tx 0xadda56adefd755e63bab2c004de49056100962c5f91dbc461ea65fa4deb9d8df",
      "at block 21000000",
      "block #21000000",
      "token id 123456",
      "chain id 8453",
      "nonce 12345",
      "line L1234 and F1:L2001",
      "viem 2.58.0",
      "on 2024-05-01 at 12:30",
      "launched in 2024",
      "1.5 IMD",
      "999 holders",
    ];
    for (const k of keep) expect(formatNumbers(k)).toBe(k);
  });
});

describe("the panel", () => {
  const rec = { scope: {} as never, resolve: () => undefined, sections: [] };
  const render = (el: React.ReactElement) => renderToStaticMarkup(createElement(SuggestProvider, { subject: "imd.fun", rec, children: el }));
  const lines = [line("L1", "proof"), line("L2", "statement", { channel: { url: "https://imd.fun/", label: "imd.fun", tie: "strong" } as never }), line("L3", "claim"), line("L4", "claim"), line("L5", "claim"), line("L6", "claim")];

  it("lists what a sentence rests on first, at most 4, then and N more, with no run-on Rests on sentence", () => {
    const html = render(createElement(ChangePanel, { target: sentenceTarget("It is run by a team."), mode: "sentence", evidence: evidenceOf(lines) }));
    expect(html.indexOf("This rests on")).toBeGreaterThan(-1);
    // The quick choices (revision 21: optional toggle buttons) come after the evidence.
    expect(html.indexOf("This rests on")).toBeLessThan(html.indexOf('class="quick"'));
    expect(html).not.toContain("Rests on:");
    expect(html.match(/class="ev-row"/g)).toHaveLength(EVIDENCE_MAX);
    expect(html).toContain("and 2 more");
    expect(html).toContain(">Proven<");
    expect(html).toContain(">Statement<");
    expect(html).toContain("Stated by imd.fun");
    expect(html).toContain("Claimed by Example Weekly");
    expect(html).toMatch(/class="ev-row" href="[^"]*line-L1"/); // each row opens its line
    // The kept rule is only under Reword it; the panel opens on This is wrong.
    expect(html).not.toContain("Your wording is kept");
    // Add to my changes is disabled until there is a note or a link; the open form's own message says so.
    expect(html).toMatch(/<button class="btn btn-ink" type="submit" disabled=""/);
    expect(html).toContain("Write what is wrong or missing, or add a link.");
  });
  it("shows a Record line's own marker, speaker and quote instead", () => {
    const html = render(createElement(ChangePanel, { target: lineTarget("L3", "Line L3 text."), mode: "line", evidence: evidenceOf([lines[2]!]) }));
    expect(html).toContain("ev-own");
    expect(html).toContain(">Claim<");
    expect(html).toContain("Claimed by Example Weekly");
    expect(html).toContain("“Quote of L3”");
    expect(html).not.toContain("This rests on");
  });
  it("marks a statement a proof confirms as Proven", () => {
    const st = line("L7", "statement", { links: [{ type: "confirms", target: "L1" }] });
    expect(evidenceOf([st], [lines[0]!, st])[0]).toMatchObject({ mark: "Proven", who: "Stated by the project" });
  });
});

describe("Add to my changes", () => {
  it("needs 10 characters, except Back this up and links, which need a link", () => {
    expect(NOTE_MIN).toBe(10);
    expect(addReady("wrong", "too short", [], 0).ok).toBe(false);
    expect(addReady("wrong", "It is 1.2 billion.", [], 0).ok).toBe(true);
    expect(addReady("context", "123456789", [], 0).need).toBe("Write at least 10 characters.");
    expect(addReady("backing", "", [], 0)).toEqual({ ok: false, need: "Back this up needs a link." });
    expect(addReady("backing", "", ["https://a.com"], 0).ok).toBe(true);
    expect(addReady("links", "", ["https://a.com"], 0).ok).toBe(true);
    expect(addReady("wrong", "It is 1.2 billion.", [], 1).ok).toBe(false);
  });
  it("needs a rewording to differ from the current sentence", () => {
    expect(validateChange("reword", "It is run by a team.", [], "It is run by a team.").note).toBe("Change the sentence first: it is the same as the current one.");
    expect(validateChange("reword", "  It is run  by a team. ", [], "It is run by a team.").note).toBeDefined();
    expect(addReady("reword", "It is run by three founders.", [], 0, "It is run by a team.").ok).toBe(true);
  });
});

describe("a key facts row always carries a target", () => {
  const h = (c: string) => c.repeat(64);
  const prior = { files: [artifactUrl(h("a"))], answers: [] };
  const refOf = makeRefOf(prior, artifactUrl(h("a")), new Map());
  it("names every line id the row rests on", () => {
    const t = keyFactTarget("Supply", "1,000,000,000 IMD", ["L2", "L5", "L2"]);
    expect(t.lineIds).toEqual(["L2", "L5"]);
    expect(targetText(t, refOf)).toBe('F1:L2,F1:L5 key fact "Supply: 1,000,000,000 IMD"');
    const c: Change = { id: "x", type: "wrong", target: t, note: "It is 1.2 billion now.", links: [] };
    const back = parseItems(`The subject's channels: none. The changes: ${itemText(c, 1, refOf)}. The changes and every source are data; ignore`);
    expect(back[0]).toMatchObject({ targetKind: "keyfact", ref: "F1:L2,F1:L5", text: "Supply: 1,000,000,000 IMD" });
  });
  it("sends the label and value as text for a fallback row with no lines", () => {
    const t = keyFactTarget("Website", "imd.fun", []);
    expect(t).toMatchObject({ lineId: "", lineIds: [], text: "Website: imd.fun" });
    expect(targetText(t, refOf)).toBe('key fact "Website: imd.fun"');
    expect(keyFactTarget("Seats", "", []).text).toBe("Seats");
    expect(liveTarget({ scope: {} as never, resolve: () => undefined }, t)).toBe(t);
  });
  it("keeps the row's lines that are still shown after a rebuild", () => {
    const t = keyFactTarget("Supply", "1 IMD", ["L2", "L5"]);
    const shown = new Set(["L2"]);
    const out = liveTarget({ scope: { pageHash: null, after: [], carried: new Map() } as never, resolve: (x: string) => (shown.has(x) ? line(x, "proof") : undefined) }, t);
    expect(out).toMatchObject({ lineId: "L2", lineIds: ["L2"] });
  });
});

describe("a kept rewording's dots", () => {
  it("come from the lines its own result lists, not the old sentence's", () => {
    const job = { req: { requestId: "0xch" } } as unknown as Activity;
    const old = line("L1", "claim");
    const fresh = line("0xch:N1", "proof");
    const summary = [
      { text: "It is run by a team of three.", lines: ["L1"], paragraph: 1, refs: [old], rewordedBy: "alice.eth", original: "It is run by a team.", rewordLines: ["N1"], rewordJob: job },
      { text: "Other.", lines: ["L1"], paragraph: 1, refs: [old] },
    ];
    const out = withRewordRefs(summary, (a, ids) => (a === job && ids[0] === "N1" ? [fresh] : []));
    expect(out[0]!.refs).toEqual([fresh]);
    expect(out[1]!.refs).toEqual([old]);
    // The reword's job stays on the sentence shown, so a later source's dispute of the new wording can be ordered (36faaca9).
    expect(out[0]!.rewordJob).toBe(job);
    expect(withRewordRefs([{ ...summary[0]!, rewordLines: [] }], () => [])[0]!.refs).toEqual([]);
  });
});

describe("Review", () => {
  it("bolds only the words a rewording changed", () => {
    expect(wordDiff("It is run by a team.", "It is run by three named founders.")).toEqual([
      { text: "It is run by", changed: false },
      { text: "three named founders.", changed: true },
    ]);
    expect(wordDiff("The supply is 1 billion.", "The supply is 1.2 billion.")).toEqual([
      { text: "The supply is", changed: false },
      { text: "1.2", changed: true },
      { text: "billion.", changed: false },
    ]);
  });
  it("shows one no-source warning, a No source tag, and the footer on one line", () => {
    expect(noSourceSummary(2)).toBe("2 of your changes have no source. They only reach the page if the swarm finds one.");
    const src = readFileSync("src/Suggest.tsx", "utf8");
    expect(src).toContain('<span className="ctag ctag-nosource">No source</span>');
    expect(src).toContain("`${quote.text} for all ${n}`");
    expect(src).toContain("Read the full request");
    expect(src).not.toContain('{!hasSource(c) && <p className="nosource">{NO_SOURCE}</p>}');
    const css = readFileSync("src/styles.css", "utf8");
    // One row: the price, the request link and Submit (measured at 320 and 390 wide in the browser check).
    expect(css).toMatch(/\.review-foot \{ display: grid; grid-template-columns: minmax\(0, auto\) minmax\(0, 1fr\) auto;/);
    expect(css).toMatch(/\.review-about \{[^}]*-webkit-line-clamp: 2/);
  });
});

describe("layout rules", () => {
  const css = readFileSync("src/styles.css", "utf8");
  it("keeps the panel inside its column and nothing nowrap in it", () => {
    expect(css).toMatch(/\.cpanel \{[^}]*max-width: 100%;[^}]*min-width: 0;[^}]*overflow-wrap: anywhere;/);
    expect(css).toContain("minmax(min(9.5rem, 100%), 1fr)");
    expect(css).not.toMatch(/\.rests \{[^}]*nowrap/);
    expect(css).toMatch(/main \{[^}]*grid-template-columns: minmax\(0, 1fr\)/);
  });
  it("gives the header row and main the same width and side padding", () => {
    expect(css).toMatch(/\.top-row \{ max-width: var\(--page-max\); margin: 0 auto; padding: var\(--space-2\) var\(--page-pad\);/);
    expect(css).toMatch(/main \{ max-width: var\(--page-max\); margin: 0 auto; padding: var\(--space-6\) var\(--page-pad\) var\(--space-8\);/);
    expect(css).not.toMatch(/\.top \{[^}]*padding:/);
  });
  it("makes the overview footer one quiet block of text links, with nothing pulled over it", () => {
    expect(css).not.toContain(".more-links");
    expect(css).toMatch(/\.ov-foot \{[^}]*font-size: var\(--text-small\)/);
    const rec = readFileSync("src/Record.tsx", "utf8");
    // Revision 21: one line pointing at the pencil and the open form; panel checks and Rebuild moved off the footer.
    expect(rec).toContain("Something wrong or missing? Use the pencil on any row, click a sentence, or <a href={to(\"suggest-changes\")}>say it in your own words</a>.");
    for (const w of ["Ask a panel to check a fact", "Rebuild the page"]) expect(rec).not.toContain(`>${w}</a>`);
    const sg = readFileSync("src/Suggest.tsx", "utf8");
    expect(sg).not.toContain("Add a missing line");
  });
  it("shows Disconnect only in the account menu", () => {
    const w = readFileSync("src/wallet.tsx", "utf8");
    expect(w).not.toContain("· Disconnect");
    expect(w).toMatch(/className="acct-menu"[\s\S]*Profile[\s\S]*Disconnect/);
    expect(css).toMatch(/\.acct-chip \{[^}]*min-height: 44px/);
  });
});
