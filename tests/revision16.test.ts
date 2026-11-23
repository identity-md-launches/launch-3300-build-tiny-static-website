/**
 * Revision 16: the review's findings. Phone Key facts rows stay table rows (checked in tests/e2e.mjs and in the CSS
 * here), version names and bracketed quantities in number formatting (D7), one Size rule, Official accounts entries
 * with their bold name and text (F15), and text arrays in values entries (F15).
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { formatNumbers } from "../src/numbers";
import { valueItemOf, valueItemText } from "../src/page";
import { accountsOf } from "../src/keyfacts";

describe("D7. version names and bracketed quantities", () => {
  it("keeps a version after an explicit version or release label", () => {
    expect(formatNumbers("Protocol version 2.250 added staking.")).toBe("Protocol version 2.250 added staking.");
    expect(formatNumbers("Release 3.125 shipped.")).toBe("Release 3.125 shipped.");
    expect(formatNumbers("ver. 1.2345 is live")).toBe("ver. 1.2345 is live");
  });
  it("formats a quantity with a unit after an opening bracket", () => {
    expect(formatNumbers("The sale sold out (2000 seats).")).toBe("The sale sold out (2,000 seats).");
    expect(formatNumbers("(2500 IMD)")).toBe("(2,500 IMD)");
  });
  it("still leaves years, ranges and the earlier controls alone", () => {
    expect(formatNumbers("founded 2020")).toBe("founded 2020");
    expect(formatNumbers("(2021)")).toBe("(2021)");
    expect(formatNumbers("2021–2023")).toBe("2021–2023");
    expect(formatNumbers("2000 seats")).toBe("2,000 seats");
    expect(formatNumbers("block 26446763")).toBe("block 26446763");
    expect(formatNumbers("59822.623566 imdUSD")).toBe("59,822.62 imdUSD");
  });
});

describe("F15. values entries of another shape keep all their text", () => {
  it("joins a list under text in its order", () => {
    const e = valueItemOf({ name: "Bridge team", text: ["Operates the bridge", "Maintains the verifier"] });
    expect(e?.name).toBe("Bridge team");
    expect(e?.text).toBe("Operates the bridge, Maintains the verifier");
    expect(valueItemText(e!)).toBe("Bridge team: Operates the bridge, Maintains the verifier");
  });
  it("keeps lists under other keys too", () => {
    expect(valueItemOf({ name: "Team", roles: ["a", 2, true] })?.text).toBe("a, 2, true");
  });
});

describe("F15. Official accounts entries carry their text", () => {
  it("accountsOf keeps each entry's text beside its short name and url", () => {
    const a = accountsOf([], [{ name: "@uniswap on X", text: "Launch announcements", url: "https://x.com/uniswap" }, { name: "Uniswap on GitHub", url: "https://github.com/Uniswap" }], "uniswap.org");
    expect(a.map((x) => [x.name, x.text, x.url])).toEqual([
      ["@uniswap on X", "Launch announcements", "https://x.com/uniswap"],
      ["Uniswap on GitHub", "", "https://github.com/Uniswap"],
    ]);
  });
  it("Overview renders accounts with the shared name, text and link layout", () => {
    const src = readFileSync("src/Record.tsx", "utf8");
    const block = src.slice(src.indexOf('<ul className="kf-accounts">'), src.indexOf('if (row.tokens.length)'));
    expect(block).toContain("<ItemValue v={{ name: a.name, text: a.text");
  });
});

describe("F13. one Size rule", () => {
  const m = JSON.parse(readFileSync("src/instructions.json", "utf8")) as Record<string, { file: string }>;
  const r = readFileSync(`public/instructions/${m.rebuild!.file}`, "utf8");
  it("allows the project's own statistics and leaves the row out only when neither source has a figure", () => {
    expect(r).toContain("Size uses a figure from an established independent tracker or the project's own published statistics; never a figure from an individual's social post.");
    expect(r).toContain("Give the figure, its source and its date");
    expect(r).toContain("Leave the row out if neither source publishes a figure about the project itself.");
    expect(r).not.toContain("Leave the row out if no tracker reports that");
    expect(r).not.toContain("add one infobox row 'Size' with the figure, the tracker's name and the date, as a claim");
  });
  it("is a new published file; the previous one is still served", () => {
    expect(m.rebuild!.file).not.toBe("rebuild-936893c77936.txt");
    expect(readFileSync("public/instructions/rebuild-936893c77936.txt", "utf8")).toContain("Leave the row out if no tracker reports that");
  });
});

describe("A2. phone Key facts rows stay table rows", () => {
  it("no rule turns a Key facts row into a grid or moves the pencil out of its cell", () => {
    const css = readFileSync("src/styles.css", "utf8");
    expect(css).not.toMatch(/\.keyfacts tr\s*\{[^}]*display:\s*grid/);
    expect(css).not.toMatch(/\.kf-edit\s*\{[^}]*position:\s*absolute/);
  });
});
