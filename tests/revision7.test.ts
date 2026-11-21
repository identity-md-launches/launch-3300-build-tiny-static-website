/** Revision 7: the reviewer's findings on the key facts, the record, panel questions, privacy and the README. */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { parsePage } from "../src/page";
import { badgeOf, keyFacts, speakersOf, withoutChain } from "../src/keyfacts";
import { repeatKey, rowMatches } from "../src/lookup";
import { dropUnresolvedAnswers, settleAll } from "../src/settle";
import { parseItems, seedFromLine } from "../src/changes";
import INSTRUCTIONS from "../src/instructions.json";

const page = (o: object) => parsePage(JSON.stringify({ subject: { name: "IMD", channels: [], contracts: [] }, lines: [], ...o }), "imd.fun");

describe("cb46ab83: a Tokens value without values is one text value", () => {
  it("is never split into tokens, and drops on <chain> only when the Chains row names one chain", () => {
    const v = "GOV: governance, 0x1111111111111111111111111111111111111111 on Ethereum, PAY: fees, 0x2222222222222222222222222222222222222222 on Ethereum";
    const p = page({ infobox: [{ label: "Tokens", value: v, lines: [] }, { label: "Chains", value: "Ethereum", lines: [] }] });
    const row = keyFacts(p, () => undefined, p.lines).rows[0]!;
    expect(row.tokens).toEqual([]);
    expect(row.values).toEqual([]);
    expect(row.value).toBe("GOV: governance, 0x1111111111111111111111111111111111111111, PAY: fees, 0x2222222222222222222222222222222222222222");
    const semi = page({ infobox: [{ label: "Tokens", value: v.replace(", PAY", "; PAY"), lines: [] }] });
    expect(keyFacts(semi, () => undefined, semi.lines).rows[0]!.tokens).toEqual([]);
    expect(withoutChain("0x1111111111111111111111111111111111111111 on Base", "Ethereum")).toContain("on Base");
  });
  it("Record renders an unlinked text value with a copy button beside every address", () => {
    const src = readFileSync("src/Record.tsx", "utf8");
    expect(src).toMatch(/<span className="mono">\{shortHex\(p\.text\)\}<\/span>\s*<Copy value=\{p\.text\} \/>/);
  });
});

describe("2a450f79: speakers in the order the result gives them", () => {
  it("keeps by order and counts each speaker once", () => {
    const p = page({
      lines: [
        { id: "C1", section: "people", text: "Taylor is a contributor.", kind: "claim", by: "Project news; @colleague; Outside Weekly; @taylor" },
        { id: "C2", section: "people", text: "Taylor works on IMD.", kind: "claim", by: "@colleague" },
      ],
    });
    expect(speakersOf(p.lines)).toEqual(["Project news", "@colleague", "Outside Weekly", "@taylor"]);
    expect(badgeOf(p.lines)!.text).toBe("Reported by Project news, @colleague and 2 more");
  });
  it("a statement leads with its channel, then the other speakers its by names", () => {
    const p = page({
      subject: { name: "IMD", channels: [{ label: "@imd", url: "https://x.com/imd", tie: "strong" }], contracts: [] },
      sources: [{ id: "s", ref: "https://x.com/imd/status/1" }],
      lines: [{ id: "S1", section: "people", text: "Taylor leads design.", kind: "statement", by: "IMD; @taylor", sources: ["s"] }],
    });
    expect(speakersOf(p.lines)[0]).toBe("@imd");
  });
});

describe("5be75877: identical lines keep signs and amounts apart", () => {
  it("does not merge +5 and −5, or 1.5 and 15; merges 1,000 and 1000", () => {
    expect(repeatKey("Net change was +5 IMD.")).not.toBe(repeatKey("Net change was −5 IMD."));
    expect(repeatKey("Net change was -5 IMD.")).toBe(repeatKey("net change was −5 imd"));
    expect(repeatKey("A fee of 1.5%")).not.toBe(repeatKey("A fee of 15%"));
    expect(repeatKey("Supply is 1,000 IMD.")).toBe(repeatKey("supply is 1000 IMD"));
    expect(repeatKey("It’s “free”.")).toBe(repeatKey("its free"));
  });
  it("merged details name each folded line's earlier origin in words", () => {
    const src = readFileSync("src/Record.tsx", "utf8");
    expect(src).toContain("o.line.from.map(ctx.m.fromOrigin)");
    expect(readFileSync("src/model.ts", "utf8")).toContain("carried over from ${what} paid by");
  });
});

describe("a482b9c7: an unresolved panel reference settles nothing", () => {
  it("drops links to answers the rebuild was not given and keeps the row's own kind", () => {
    const p = page({ lines: [{ id: "C1", section: "history", text: "A job costs 99 IMD.", kind: "claim", by: "Blog", links: [{ type: "contradicts", target: "A9" }] }] });
    const rows = [{ section: "history", rows: p.lines.map((line) => ({ line })) }];
    expect(settleAll(p.lines).by.get("C1")!.state).toBe("contradicted");
    const out = dropUnresolvedAnswers(rows, new Set([1]));
    expect(out.unresolved).toEqual([{ lineId: "C1", text: "A job costs 99 IMD.", type: "contradicts", target: "A9" }]);
    expect(settleAll(out.sections[0]!.rows.map((r) => r.line)).by.get("C1")!.state).toBe("none");
    expect(dropUnresolvedAnswers(rows, new Set([9])).unresolved).toEqual([]);
    expect(readFileSync("src/Record.tsx", "utf8")).not.toContain("`answer ${t}`");
  });
});

describe("c9a6bd4f: contract questions come from the rerun", () => {
  const rerun = "On Ethereum, run cast call 0x1111111111111111111111111111111111111111 totalSupply()(uint256) --block 26400100. Raw return 42000000000000000000.";
  it("asks for the raw return the rerun states, not the display amount", () => {
    const s = seedFromLine({ text: "Supply is 42 IMD", kind: "proof", rerun, fact: { value: "42", unit: "IMD", chain: "Ethereum" } }, "");
    expect(s).toMatchObject({ type: "contract", chain: "1", address: "0x1111111111111111111111111111111111111111", signature: "totalSupply()", value: "42000000000000000000" });
  });
  it("is not filled in when the return is only a display amount or the call needs arguments", () => {
    expect(seedFromLine({ text: "x", kind: "proof", rerun: rerun.replace(/ Raw return.*$/, ""), fact: { value: "42", unit: "IMD" } }, "").type).toBe("none");
    const bal = "On Ethereum, run cast call 0x1111111111111111111111111111111111111111 'balanceOf(address)(uint256)' 0x2222222222222222222222222222222222222222. Raw return 5.";
    expect(seedFromLine({ text: "x", kind: "proof", rerun: bal, fact: { value: "5", unit: "" } }, "").type).toBe("none");
  });
  it("puts the price before Review the question", () => {
    expect(readFileSync("src/App.tsx", "utf8")).toMatch(/>Edit<\/button>\s*\{price\}\s*<button type="button" className="btn btn-primary" onClick=\{\(\) => submit\(\)\}>Review the question/);
  });
});

describe("3ab375e9: no public IPFS gateway on load", () => {
  it("api.ts and config.ts name no gateway", () => {
    for (const f of ["src/api.ts", "src/config.ts"]) expect(readFileSync(f, "utf8")).not.toMatch(/IPFS_GATEWAYS|"https:\/\/(dweb\.link|ipfs\.io)/);
  });
});

describe("1357d217 and 1ab459c0: Activity", () => {
  const src = readFileSync("src/ActivityList.tsx", "utf8");
  it("names a panel request by its question type or Panel answer, never a record kind", () => {
    expect(src).toContain('?? "Panel answer"');
    expect(src).not.toContain("kindName(");
  });
  it("a retry opens the change already waiting for the same target, and keeps the suggested final_text", () => {
    expect(src).toContain("s.tray.list.find((x) => x.target.key === target.key");
    const obj = 'Your full instructions are the file at x. Channels already known: none. The changes: (1) type: wrong; target: summary sentence "IMD is a swarm."; note: "old"; links: none; suggested final_text: "IMD is a directory.".';
    expect(parseItems(obj)[0]).toMatchObject({ type: "wrong", targetKind: "sentence", text: "IMD is a swarm.", suggest: "IMD is a directory." });
  });
});

describe("f08e8842: a small logo at its real size", () => {
  it("sizes the tile to the image and draws the image at its natural size", () => {
    const src = readFileSync("src/Logo.tsx", "utf8");
    expect(src).toContain("Math.max(size, small.w)");
    expect(src).toContain("width: small.w, height: small.h");
    expect(readFileSync("src/styles.css", "utf8")).not.toContain("scale-down");
  });
});

describe("f4777c44: one rebuild at a time, also in an open review", () => {
  it("passes the running rebuild to the dialog and checks it again before sending", () => {
    const src = readFileSync("src/App.tsx", "utf8");
    expect(src).toContain("running={ask.rebuild && ask.subject ? pendingRebuildOf(");
    expect(src).toContain("if (runningRef.current) {");
    expect(src).toContain("{blocked ? (");
  });
});

describe("13ce86fb: out of date on fact rows and channel badges", () => {
  it("a Website row whose lines are all out of date says Out of date", () => {
    const p = page({
      domain: "imd.fun",
      subject: { name: "IMD", channels: [{ label: "Website", url: "https://imd.fun", tie: "strong" }], contracts: [] },
      infobox: [{ label: "Website", value: "imd.fun", url: "https://imd.fun", lines: ["S1"] }],
      lines: [
        { id: "S1", section: "basics", text: "The site is imd.fun.", kind: "statement", by: "IMD", links: [{ type: "outdates", target: "S2" }] },
        { id: "S2", section: "basics", text: "The site moved to imd.xyz.", kind: "statement", by: "IMD" },
      ],
    });
    const row = keyFacts(p, (id) => p.lines.find((l) => l.id === id), p.lines).rows[0]!;
    expect(row.status).toEqual({ text: "Out of date", tone: "outdated" });
  });
  it("the facts table shows the amber mark, Newer and Also said by", () => {
    const src = readFileSync("src/Record.tsx", "utf8");
    expect(src).toContain("{stale && <SettleMark s={stale} ctx={ctx} />}");
    expect(src).toContain("{stale && <NewerNotes ids={stale.outdates} ctx={ctx} />}");
    expect(src).toContain('<AlsoSaid also={also} lineId={row.line.id}');
  });
});

describe("fcd90aeb: the README names the current instruction files", () => {
  it("lists the files src/instructions.json names as current", () => {
    const readme = readFileSync("README.md", "utf8");
    const cur = readme.slice(readme.indexOf("Current files:"));
    expect(cur.startsWith(`Current files: \`${INSTRUCTIONS.rebuild.file}\` and \`${INSTRUCTIONS.changes.file}\``)).toBe(true);
    expect(readme).toContain(`filename=${INSTRUCTIONS.rebuild.file}`);
    expect(readme).toContain(`filename=${INSTRUCTIONS.changes.file}`);
  });
});

describe("search finds a merged row by any of its speakers (revision 8)", () => {
  const row = { line: { text: "IMD is a swarm of agents.", by: "the project" }, same: [{ line: { text: "imd is a swarm of agents", by: "a forum" } }] };
  it("matches the row's own speaker and the speaker of a line merged into it", () => {
    expect(rowMatches(row, "the project")).toBe(true);
    expect(rowMatches(row, "a forum")).toBe(true);
    expect(rowMatches(row, "someone else")).toBe(false);
    expect(rowMatches({ line: row.line }, "a forum")).toBe(false);
  });
});
