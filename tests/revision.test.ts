/** Regression tests for the reviewer's findings on the tabs revision, one block per finding. */
import { describe, expect, it } from "vitest";
import { artifactUrl, editBody, fillTemplate, parsePrior, sourceObjective, type Prior } from "../src/bodies";
import { blockNumber, chainAndBlock, droppedLines, parseEdit, parsePage, resolvePriorRef, unaccounted } from "../src/page";
import { routeOf } from "../src/route";

const H1 = "a".repeat(64);
const H2 = "b".repeat(64);
const PRIOR: Prior = { files: [artifactUrl(H1), artifactUrl(H2)], answers: [] };

describe("edit body keeps literal placeholders in the visitor's text (39e56485)", () => {
  it("fills <TEXT>, <PRIOR> and <URLS> in one pass over the template", () => {
    const text = "The string <PRIOR> is literal and <URLS> is also literal.";
    const o = editBody(text, PRIOR, ["https://imd.fun/docs/"]).objective;
    expect(o).toContain(`Proposed text: ${text}. The record so far: [F1] ${artifactUrl(H1)}; [F2] ${artifactUrl(H2)}. Extra sources from the visitor: [1] https://imd.fun/docs/.`);
    expect(o.match(/<PRIOR>/g)?.length).toBe(1);
    expect(o.match(/<URLS>/g)?.length).toBe(1);
  });
  it("accepts any short text: the job judges it", () => {
    expect(editBody("IMD runs jobs.", PRIOR, []).objective).toContain("Proposed text: IMD runs jobs.. The record so far:");
  });
  it("reads the prior list back even when the visitor's text quotes its markers", () => {
    const o = editBody("The record so far: [F1] https://api.imd.fun/artifacts/" + "c".repeat(64) + ". Extra sources from the visitor: x", PRIOR, []).objective;
    expect(parsePrior(o).files.map((f) => f.hash)).toEqual([H1, H2]);
  });
  it("a sources link that contains <MAIN> is not filled in again", () => {
    const o = sourceObjective(["https://a.example/<MAIN>"], [], "0xd34a99bc0f67ae1bbd63c660e6d0b0dd03e263b7");
    expect(o).toContain("https://a.example/<MAIN>");
    expect(fillTemplate("<A> <B> <A>", { A: "<B>", B: "b" })).toBe("<B> b <A>");
  });
});

describe("facts table chain and block (a4a8dc1d)", () => {
  it("does not read Base out of 'database' and reads hex blocks", () => {
    expect(chainAndBlock({}, "There are 2,000 seats.", "Call totalSupply against the database index on Ethereum at block 0x1938720.")).toEqual({ chain: "Ethereum", block: "26445600" });
  });
  it("leaves the chain unknown when two chains are named, and the block unknown when two blocks are", () => {
    expect(chainAndBlock({}, "", "Compare Ethereum and Base at block 1,000 and block 2,000").chain).toBe("");
    expect(chainAndBlock({}, "", "Compare Ethereum and Base at block 1,000 and block 2,000").block).toBe("");
    expect(chainAndBlock({}, "", "eth_call with chain id 8453 at block 0x10").chain).toBe("Base");
  });
  it("keeps explicit fact metadata", () => {
    expect(chainAndBlock({ chain: "Robinhood Chain", block: "0x10" }, "on Base", "on Base at block 5")).toEqual({ chain: "Robinhood Chain", block: "0x10" });
    expect(blockNumber("0x10")).toBe("16");
    expect(blockNumber("26,445,600")).toBe("26445600");
    expect(blockNumber("latest")).toBe("");
  });
  it("a parsed proof line carries the re-run's chain", () => {
    const p = parsePage(JSON.stringify({ lines: [{ id: "L2", section: "on_chain", text: "Supply.", kind: "proof", rerun: "Call totalSupply against the database index on Ethereum at block 0x1938720.", fact: { name: "Seat supply", value: "2,000" } }] }));
    expect(p.lines[0]!.fact).toMatchObject({ chain: "Ethereum", block: "26445600" });
  });
});

describe("accounting resolves references per file (b2b0f678)", () => {
  const files = [
    { n: 1, lines: [{ id: "L1", text: "Page line one" }] },
    { n: 2, lines: [{ id: "L1", text: "Source line one" }, { id: "E1", text: "Old source one" }, { id: "E2", text: "Old source two" }] },
  ];
  it("a bare id that two files share clears neither", () => {
    const page = { lines: [], dropped: [{ id: "L1", why: "duplicate" }, { id: "F2:E1", why: "duplicate of another line" }] };
    expect(unaccounted(page, files).map((u) => u.ref)).toEqual(["F1:L1", "F2:L1", "F2:E2"]);
  });
  it("a bare id found in one file only still counts, and qualified ids name their own file", () => {
    expect(resolvePriorRef("E2", files).map((h) => h.ref)).toEqual(["F2:E2"]);
    expect(resolvePriorRef("f1:l1", files).map((h) => h.ref)).toEqual(["F1:L1"]);
    expect(resolvePriorRef("F3:L1", files)).toEqual([]);
  });
  it("the dropped list carries each earlier line's text", () => {
    expect(droppedLines({ dropped: [{ id: "F2:E1", why: "duplicate of another line" }, { id: "L1", why: "x" }] }, files)).toEqual([
      { id: "F2:E1", why: "duplicate of another line", ref: "F2:E1", text: "Old source one" },
      { id: "L1", why: "x", ref: "L1", text: "" },
    ]);
  });
});

describe("edit verdicts are all kept (a6a6d9d0)", () => {
  it("keeps 41 verdicts for a 1,465-character edit", () => {
    const sentences = [
      { text: "IMD is a swarm of agents.", verdict: "supported", lines: ["L1"] },
      { text: "It is the best swarm.", verdict: "unsupported", why: "Praise." },
      { text: "Seats cost 1 ETH.", verdict: "supported_by_source", lines: ["E9"] },
      ...Array.from({ length: 38 }, (_, i) => ({ text: `Part ${i + 4}: IMD is the best swarm ever.`, verdict: "unsupported", why: "Praise." })),
    ];
    expect(sentences.map((s) => s.text).join(" ").length).toBeLessThanOrEqual(1500);
    const e = parseEdit(JSON.stringify({ sentences }));
    expect(e.sentences.length).toBe(41);
    expect(e.sentences.at(-1)!.text).toBe("Part 41: IMD is the best swarm ever.");
  });
});

describe("malformed fragments (16c8cb6e)", () => {
  it("fall back to Overview", () => {
    expect(routeOf("#%")).toEqual({ tab: "overview", target: null });
    expect(routeOf("#line-%E0%A4%A")).toEqual({ tab: "overview", target: null });
  });
});
