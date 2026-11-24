/** One block per finding of the second review of this job (finding ids in each describe). */
import { INSTRUCTIONS } from "../src/instructions";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { findSubject, matchesQuery, parseLookup, repeatCount, repeatsOf, type Findable } from "../src/lookup";
import { parsePage, type Line } from "../src/page";
import { keyFacts } from "../src/keyfacts";
import { isPng, pngDecodes } from "../src/api";
import { REBUILD_OUTPUTS, rebuildBody } from "../src/bodies";
import { refFromId } from "../src/subject";

const IMD = "0xd34a99bc0f67ae1bbd63c660e6d0b0dd03e263b7";
const SECOND = "0x2222222222222222222222222222222222222222";
const subjects: (Findable & { name: string; oneLine: string })[] = [
  { id: "imd.fun", name: "IMD", oneLine: "", main: IMD, contracts: [{ address: IMD, chainId: 1 }, { address: SECOND, chainId: 1 }] },
];
const rows = (page: unknown, domain = "imd.fun") => {
  const p = parsePage(JSON.stringify(page), domain);
  return keyFacts(p, (id) => p.lines.find((l) => l.id === id), p.lines).rows;
};

describe("a pasted link resolves to its host (49c4a774)", () => {
  it("an explorer-style path never turns a link into a contract lookup", () => {
    expect(parseLookup(`https://example.com/address/${IMD}`)).toEqual({ kind: "domain", domain: "example.com" });
    expect(parseLookup(`https://etherscan.io/token/${IMD}`)).toEqual({ kind: "domain", domain: "etherscan.io" });
    expect(findSubject(parseLookup(`https://example.com/address/${IMD}`), subjects)).toBeNull();
    expect(parseLookup(IMD)).toEqual({ kind: "address", address: IMD, chainId: null });
    expect(parseLookup(`1:${IMD}`)).toEqual({ kind: "address", address: IMD, chainId: 1 });
  });
});

describe("contracts are indexed with their chains (c1bce64a)", () => {
  it("a second listed contract opens its project and stays in the filtered list", () => {
    expect(findSubject(parseLookup(SECOND), subjects)).toBe("imd.fun");
    expect(findSubject(parseLookup(`1:${SECOND}`), subjects)).toBe("imd.fun");
    expect(matchesQuery(subjects[0]!, SECOND)).toBe(true);
  });
  it("an address recorded on another chain never opens the project", () => {
    expect(findSubject(parseLookup(`8453:${IMD}`), subjects)).toBeNull();
    expect(matchesQuery(subjects[0]!, `8453:${IMD}`)).toBe(false);
    // A main contract with no known chain matches only when no chain is named.
    const bare: Findable[] = [{ id: "x.org", main: IMD }];
    expect(findSubject(parseLookup(IMD), bare)).toBe("x.org");
    expect(findSubject(parseLookup(`1:${IMD}`), bare)).toBeNull();
  });
});

describe("repeats ignore punctuation inside amounts (baf39908)", () => {
  it('"Supply is 1,000." and "SUPPLY IS 1000" repeat each other', () => {
    const l = (id: string, text: string) => ({ id, text }) as unknown as Line;
    const g = repeatsOf([l("L1", "Seats cost 5 IMD."), l("L2", "seats cost 5 imd"), l("L88", "Supply is 1,000."), l("L89", "SUPPLY IS 1000")]);
    expect(g.map((x) => x.map((y) => y.id))).toEqual([["L1", "L2"], ["L88", "L89"]]);
    expect(repeatCount(g)).toBe(2);
  });
});

describe("merged lines keep every origin, speaker and reading (519dd975)", () => {
  it("41 origins, 51 earlier readings and a long by survive parsing", () => {
    const from = Array.from({ length: 41 }, (_, i) => `F1:L${i + 1}`);
    const history = Array.from({ length: 51 }, (_, i) => ({ block: String(26400000 + i), value: String(1500 + i) }));
    const by = Array.from({ length: 30 }, (_, i) => `Speaker number ${i + 1}`).join(", ");
    const p = parsePage(
      JSON.stringify({
        lines: [
          { id: "L1", section: "money", text: "A merged line.", kind: "claim", by, sources: ["S1"], from },
          { id: "L2", section: "on_chain", text: "Seat supply is 1551.", kind: "proof", rerun: "x", history },
        ],
      }),
      "imd.fun",
    );
    expect(p.lines[0]!.from).toHaveLength(41);
    expect(p.lines[0]!.from.at(-1)).toBe("F1:L41");
    expect(p.lines[0]!.by).toBe(by);
    expect(by.length).toBeGreaterThan(200);
    expect(p.lines[1]!.history).toHaveLength(51);
    expect(p.lines[1]!.history?.at(-1)).toEqual({ block: "26400050", value: "1550" });
  });
});

describe("a statement is labelled by the URL it cites (5db6fb03)", () => {
  const page = (ref: string) =>
    parsePage(
      JSON.stringify({
        subject: { channels: [{ label: "imd.fun", url: "https://imd.fun/", tie: "weak" }, { label: "@imd", url: "https://x.com/imd", tie: "strong" }] },
        lines: [{ id: "L1", section: "money", text: "Docs say there are new seats.", kind: "statement", by: "imd.fun", sources: ["S1"] }],
        sources: [{ id: "S1", ref }],
      }),
      "imd.fun",
    ).lines[0]!;
  it("by imd.fun but cited to an outside account is a Claim", () => {
    const l = page("https://x.com/someone/status/1");
    expect(l.kind).toBe("claim");
    expect(l.labelNote).toContain("https://x.com/someone/status/1");
  });
  it("cited to the subject's domain, a subdomain or a verified channel is a Statement", () => {
    expect(page("https://imd.fun/docs/").kind).toBe("statement");
    expect(page("https://docs.imd.fun/seats").kind).toBe("statement");
    expect(page("https://x.com/imd/status/9").kind).toBe("statement");
  });
});

describe("one badge per Key facts row (44e42685)", () => {
  it("Official accounts with mixed verification shows one cautious label", () => {
    const [r] = rows({
      subject: { channels: [{ label: "@imd", url: "https://x.com/imd", tie: "strong" }, { label: "@news", url: "https://x.com/news", tie: "weak" }] },
      infobox: [{ label: "Official accounts", value: "@imd, @news", values: ["@imd","@news"], lines: ["L1"] }],
      lines: [{ id: "L1", section: "people", text: "x", kind: "statement", by: "@imd", sources: ["S1"] }],
      sources: [{ id: "S1", ref: "https://x.com/imd/status/1" }],
    });
    expect([r!.status?.text, r!.badge]).toEqual(["Not verified", null]);
    const [all] = rows({
      subject: { channels: [{ label: "@imd", url: "https://x.com/imd", tie: "strong" }, { label: "@b", url: "https://x.com/b", tie: "strong" }] },
      infobox: [{ label: "Official accounts", value: "@imd, @b", values: ["@imd","@b"], lines: [] }],
    });
    expect([all!.status?.text, all!.badge]).toEqual(["Verified on chain", null]);
  });
  it("Website is labelled from its URL and the subject's domain, even when not a listed channel", () => {
    const [r] = rows({
      subject: { channels: [{ label: "imd.fun", url: "https://imd.fun/", tie: "none" }] },
      infobox: [{ label: "Website", value: "status.imd.fun", url: "https://status.imd.fun/", lines: ["L1"] }],
      lines: [{ id: "L1", section: "what_it_does", text: "x", kind: "statement", by: "imd.fun", sources: ["S1"] }],
      sources: [{ id: "S1", ref: "https://imd.fun/" }],
    });
    expect([r!.status?.text, r!.badge]).toEqual(["Own domain", null]);
    const [off] = rows({ infobox: [{ label: "Website", value: "elsewhere.org", lines: [] }] });
    expect([off!.status?.text, off!.badge]).toEqual(["Not verified", null]);
  });
});

describe("a logo must be a whole, decodable PNG (a7f183aa)", () => {
  const png = Uint8Array.from(atob("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="), (c) => c.charCodeAt(0));
  it("the full file decodes; its first 24 bytes, a cut-off IDAT or a bad CRC do not", async () => {
    expect(isPng(png)).toBe(true);
    expect(await pngDecodes(png)).toBe(true);
    expect(isPng(png.slice(0, 24))).toBe(false);
    expect(await pngDecodes(png.slice(0, 24))).toBe(false);
    expect(isPng(png.slice(0, png.length - 12))).toBe(false); // IEND missing
    const bad = png.slice();
    bad[40] = bad[40]! ^ 0xff; // inside IDAT: CRC no longer matches
    expect(isPng(bad)).toBe(false);
  });
});

describe("a first rebuild with no icon can satisfy both declared outputs (d28f6feb)", () => {
  it("declares page and logo and tells the job to write a placeholder PNG and leave page.logo out", () => {
    const body = rebuildBody({ files: [], answers: [], reconsider: [] } as never, refFromId("137:0x1111111111111111111111111111111111111111"));
    expect(body.outputs).toEqual(REBUILD_OUTPUTS);
    expect(body.outputs.map((o) => o.path)).toEqual(["artifacts/page.json", "artifacts/logo.png"]);
    expect(body.objective).toContain("Whatever else: output artifacts/page.json and artifacts/logo.png;");
    expect(INSTRUCTIONS.rebuild.text).toContain("Output artifacts/page.json and artifacts/logo.png.");
    expect(INSTRUCTIONS.rebuild.text).toContain("set logo to its URL and the time; else write logo.png as a 1 by 1 transparent PNG and leave logo out.");
    expect(INSTRUCTIONS.rebuild.text).not.toContain("artifacts/logo.png if found");
  });
  it("the site shows the logo file only when page.logo is present", () => {
    const src = readFileSync("src/useActivity.ts", "utf8");
    expect(src).toMatch(/if \(page\.logo && resultNamesOf\(req\.kind\)\.includes\("logo"\)\) try \{\s*const l = await fetchLogo/);
  });
});

describe("the README and agents.md teach the current workflow (4b3290f1)", () => {
  const readme = readFileSync("README.md", "utf8");
  const agents = readFileSync("public/agents.md", "utf8");
  it("README: the one bar, chain picker, Related, first-page outcomes and the two outputs", () => {
    for (const s of ["**The Look it up bar**", "chain picker", "**Related**", "First page in progress", "First page refused:", "No project found: <notes>", "`artifacts/page.json` and `artifacts/logo.png`", "**Merging is not dropping**"])
      expect(readme).toContain(s);
    expect(readme).not.toContain("exact duplicate of a line it kept");
    expect(readme).not.toContain("stay two lines");
    expect(readme).not.toContain('"Add a project" form');
  });
  it("agents.md: merged origins and speakers, the bar, the logo output; no old rules", () => {
    for (const s of ["**merged into one line**", "every speaker in `by`", "**The home bar**", "`artifacts/logo.png`", "1 by 1 transparent placeholder PNG"]) expect(agents).toContain(s);
    expect(agents).not.toContain("stay separate");
    expect(agents).not.toContain("exact duplicate");
    expect(agents).not.toContain('"Add a project" form');
    expect(readFileSync("dist/agents.md", "utf8")).toBe(agents);
  });
});
