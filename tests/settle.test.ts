/** Job 8: a settled line leads with what settles it; counts, filters, Home and Key facts share one rule. */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { countKinds, mergeRecord, parsePage } from "../src/page";
import { countLines, countsWords, FILTERS, passes, rowClass, settleAll, settleOf, speakerText, proofIdsOf } from "../src/settle";
import { badgeOf, keyFacts } from "../src/keyfacts";
import { REBUILD_TEMPLATE } from "../src/bodies";

const PAGE = JSON.stringify({
  subject: { name: "Ex", one_line: "x", channels: [{ label: "Docs", url: "https://example.com/docs", tie: "none" }] },
  sources: [{ id: "d", ref: "https://example.com/docs" }, { id: "x", ref: "https://news.example.org/a" }],
  infobox: [{ label: "Supply", value: "1,000 EX", lines: ["S1"] }, { label: "Fee", value: "1%", lines: ["C1"] }],
  lines: [
    { id: "P1", section: "on_chain", text: "Total supply is 1,000 EX.", kind: "proof", rerun: "Call totalSupply() on Ethereum at block 100.", fact: { name: "Supply", value: "1000", unit: "EX" } },
    { id: "P2", section: "on_chain", text: "The fee is 2%.", kind: "proof", rerun: "Call fee() on Ethereum at block 100." },
    { id: "S1", section: "money", text: "The supply is 1,000 EX.", kind: "statement", by: "Docs", sources: ["d"], quote: "1,000 EX in total", links: [{ type: "confirms", target: "P1" }] },
    { id: "C1", section: "money", text: "News says the fee is 1%.", kind: "claim", by: "News", sources: ["x"], quote: "a 1% fee", links: [{ type: "contradicts", target: "P2" }] },
    { id: "C2", section: "people", text: "News says the team is three people.", kind: "claim", by: "News", sources: ["x"], links: [{ type: "confirms", target: "A1" }] },
    { id: "C3", section: "history", text: "News says it launched in May with 1,000 EX.", kind: "claim", by: "News", sources: ["x"], links: [{ type: "partly", target: "P1" }] },
    { id: "C4", section: "history", text: "News says it is popular.", kind: "claim", by: "News", sources: ["x"] },
  ],
});

describe("settled lines", () => {
  const p = parsePage(PAGE, "example.com");
  const lines = p.lines;
  const proofs = proofIdsOf(lines);
  const byId = (id: string) => lines.find((l) => l.id === id)!;

  it("reads confirms, contradicts and partly links", () => {
    expect(byId("C3").links).toEqual([{ type: "partly", target: "P1" }]);
    expect(settleOf(byId("S1"), proofs).state).toBe("proven");
    expect(settleOf(byId("C1"), proofs).state).toBe("contradicted");
    expect(settleOf(byId("C2"), proofs)).toMatchObject({ state: "proven", confirms: ["A1"] });
    expect(settleOf(byId("C3"), proofs).state).toBe("partly");
    expect(settleOf(byId("C4"), proofs).state).toBe("none");
    // A proof is evidence, never itself settled.
    expect(settleOf({ kind: "proof", links: [{ type: "confirms", target: "P2" }] }, proofs).state).toBe("none");
    // A confirms link to a statement (not a proof or panel answer) does not settle.
    expect(settleOf({ kind: "claim", links: [{ type: "confirms", target: "S1" }] }, proofs).state).toBe("none");
    // Contradicts wins over confirms.
    expect(settleOf({ kind: "claim", links: [{ type: "confirms", target: "P1" }, { type: "contradicts", target: "P2" }] }, proofs).state).toBe("contradicted");
  });

  it("never changes who said it: kind and by stay on the line", () => {
    expect(byId("S1")).toMatchObject({ kind: "statement", by: "Docs" });
    expect(speakerText(byId("C1"))).toBe("Claimed by News");
    expect(speakerText({ kind: "statement", by: "Docs", channel: { label: "Docs", url: "https://example.com/docs", tie: "none" } })).toBe("Stated by Docs");
  });

  it("counts a settled row once and does not count the proof it shows again", () => {
    const s = settleAll(lines);
    expect([...s.absorbed].sort()).toEqual(["P1", "P2"]);
    const c = countLines(lines);
    expect(c).toEqual({ all: 5, proven: 2, contradicted: 1, outdated: 0, proof: 0, statement: 0, claim: 2, said: 2 });
    expect(countKinds(mergeRecord(p, []))).toEqual(c);
    expect(countsWords(c)).toBe("2 proven, 1 contradicted, 0 proofs, 0 statements, 2 claims");
    // A partly-confirmed line keeps its own kind and is still only said.
    expect(rowClass(byId("C3"), s.by.get("C3"))).toBe("claim");
  });

  it("filters Proven, Contradicted and Only said", () => {
    expect(FILTERS).toEqual(["all", "proven", "contradicted", "outdated", "proof", "statement", "claim", "said"]);
    expect(passes("said", "claim")).toBe(true);
    expect(passes("said", "proven")).toBe(false);
    expect(passes("claim", "proven")).toBe(false);
    expect(passes("contradicted", "contradicted")).toBe(true);
  });

  it("Key facts badges use the same rule", () => {
    expect(badgeOf([byId("S1")], lines)).toEqual({ text: "Proven", tone: "proven" });
    expect(badgeOf([byId("C1")], lines)).toEqual({ text: "Contradicted", tone: "contradicted" });
    const rows = keyFacts(p, (id) => lines.find((l) => l.id === id), lines).rows;
    expect(rows.map((r) => r.badge?.text)).toEqual(["Proven", "Contradicted"]);
  });

  it("the rebuild template defines the link types word for word", () => {
    const t = readFileSync("templates/instructions/rebuild.txt", "utf8").trim();
    expect(t).toContain(
      "When a proof or panel answer (A1...) settles a statement or claim, give that line links with type and target id. Type confirms only when it establishes the whole sentence as written, tense included: a value read at deployment confirms 'was X at launch', not 'is X'; partly when it establishes part; contradicts when it shows the sentence wrong.",
    );
    expect(readFileSync("templates/rebuild.txt", "utf8").trim()).toBe(REBUILD_TEMPLATE);
  });

  it("the Record tab renders one row per settled line, led by its marker, with the speaker after", () => {
    const src = readFileSync("src/Record.tsx", "utf8");
    expect(src).toContain("!settled.absorbed.has(r.line.id)");
    expect(src).toContain("Confirmed by a panel, ");
    expect(src).toContain('"Partly confirmed by"');
    expect(src).toContain("speakerText(line)");
  });
});
