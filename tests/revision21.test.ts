/**
 * Revision 21: one open field on Contribute (type note), panel checks hidden, rebuild under Page upkeep, Related
 * "Add this project" only for a domain of its own, no "Create the page" once a page job finished, tokens on several
 * chains (home address, then "also on"), and the Sent toast.
 */
import { readFileSync, existsSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { itemText, noTarget, lineTarget, parseItemsText, sentenceTarget, validateChange, addReady, NOTE_HEADING, NOTE_PLACEHOLDER, SOURCES_HINT, NOTE_STEPS, type Change } from "../src/changes";
import { ChangePanel, NoteForm, SuggestProvider } from "../src/Suggest";
import { otherAddresses } from "../src/addrDisplay";
import { tokenOfItem, tokensOf } from "../src/keyfacts";
import { valueItemOf } from "../src/page";
import { ownDomainEntry, relatedCards } from "../src/Record";
import { routeOf } from "../src/route";
import { upkeepText, OLDER_RULES } from "../src/model";
import manifest from "../src/instructions.json";

const HOME = "0xC18360217D8F7Ab5e7c516566761Ea12Ce7F9D72";
const OTHER = "0x00000000000000000000000000000000000000a1"; // an example address, not a real deployment
const read = (f: string) => readFileSync(f, "utf8");
const rec = { scope: {} as never, resolve: () => undefined, sections: [] };
const render = (el: React.ReactElement) => renderToStaticMarkup(createElement(SuggestProvider, { subject: "ens.domains", rec, children: el }));

describe("A. one open field", () => {
  it("renders the Contribute form word for word", () => {
    const html = render(createElement(NoteForm));
    expect(NOTE_HEADING).toBe("What's wrong or missing?");
    expect(html).toContain("<h2");
    expect(html).toContain("What&#x27;s wrong or missing?");
    expect(html).toContain(`placeholder="${NOTE_PLACEHOLDER}"`);
    expect(NOTE_PLACEHOLDER).toBe("Say it in your own words. For example: the team changed in September, or the fee is 0.3% not 1%.");
    expect(html).toMatch(/<label[^>]*>Sources<\/label>/);
    expect(SOURCES_HINT).toBe("Add a link if you have one. Without one the swarm has to find a source, and may not.");
    expect(html).toContain(SOURCES_HINT);
    expect(html).toContain("Add to my changes");
    expect(html).toContain("0 of 1,000 characters");
    expect([...NOTE_STEPS]).toEqual(["The swarm reads your note and its sources.", "What holds up is added or corrected, with the source shown.", "You can follow the job on the IMD explorer."]);
    expect(html).toMatch(/<ol class="note-steps"><li>The swarm reads/);
    expect(html).not.toContain("About:");
    expect(html).not.toContain("qchip");
  });
  it("the pencil opens the same form with About: <text> and optional quick choices", () => {
    const line = render(createElement(ChangePanel, { target: lineTarget("L3", "The fee is 1%."), mode: "line" }));
    expect(line).toContain("What&#x27;s wrong or missing?");
    expect(line).toMatch(/<span class="about-k">About:<\/span> <span class="about-t">The fee is 1%.<\/span>/);
    for (const w of ["This is wrong", "Add context", "Back this up"]) expect(line).toMatch(new RegExp(`class="qchip" aria-pressed="false" title="[^"]*">${w}</button>`));
    expect(line).toContain("Optional");
    expect(line).not.toContain("Ask a panel");
    expect(line).not.toContain("note-steps");
    const sent = render(createElement(ChangePanel, { target: sentenceTarget("It is run by a team."), mode: "sentence" }));
    expect(sent).toContain(">Reword it</button>");
    expect(sent).toContain("About:");
  });
  it("a note needs words or links; links alone are allowed; up to 1,000 characters", () => {
    expect(validateChange("note", "", [])).toEqual({ note: "Write what is wrong or missing, or add a link." });
    expect(validateChange("note", "", ["https://a.example/x"])).toEqual({});
    expect(validateChange("note", "too short", [])).toEqual({ note: "Write at least 10 characters, or add a link." });
    expect(validateChange("note", "The team changed in September.", [])).toEqual({});
    expect(validateChange("note", "x".repeat(1000), [])).toEqual({});
    expect(validateChange("note", "x".repeat(1001), [])).toEqual({ note: "Keep it to 1000 characters." });
    expect(addReady("note", "", ["https://a.example/x"], 0).ok).toBe(true);
    expect(addReady("note", "", [], 0).ok).toBe(false);
  });
  it("a note goes into <ITEMS> as type note and reads back; older types still read", () => {
    const c: Change = { id: "1", type: "note", target: noTarget(), note: "The fee is 0.3% not 1%.", links: ["https://a.example/fees"] };
    const text = itemText(c, 1, () => "");
    expect(text).toBe('(1) type: note; target: none; note: "The fee is 0.3% not 1%."; links: https://a.example/fees');
    const onlyLinks = itemText({ ...c, id: "2", note: "" }, 2, () => "");
    const lineNote = itemText({ ...c, id: "3", target: lineTarget("L3", "The fee is 1%.") }, 3, (id) => (id === "L3" ? "F1:L3" : ""));
    const old = '(4) type: new_line; target: none; note: "A missing line here."; links: none (5) type: links; target: none; note: none; links: https://b.example';
    const items = parseItemsText(`${text} ${onlyLinks} ${lineNote} ${old}`);
    expect(items.map((i) => [i.n, i.type, i.targetKind])).toEqual([[1, "note", "none"], [2, "note", "none"], [3, "note", "line"], [4, "new_line", "none"], [5, "links", "none"]]);
    expect(items[1]!.note).toBe("");
    expect(items[2]!.ref).toBe("F1:L3");
  });
  it("Add a line that is missing and Add links to read are gone everywhere", () => {
    for (const f of ["src/Suggest.tsx", "src/Record.tsx", "src/App.tsx"]) {
      expect(read(f)).not.toMatch(/>\s*(Add a line that is missing|Add a missing line|Add links to read)\s*</);
    }
    expect(routeOf("#/s/imd.fun/add-line")).toMatchObject({ tab: "contribute", target: "suggest-changes" });
  });
  it("the changes instructions add the note kind, word for word, in a new published file", () => {
    const text = read("templates/instructions/changes.txt");
    expect(text).toContain("Work out which lines, key facts or summary sentences the note concerns. Treat it as a lead, never as a source. Find and read sources for it, starting with any links given. Write a line only when a source supports it, and say in the result what you did with the note and why.");
    expect(read(`public/instructions/${manifest.changes.file}`)).toBe(text);
  });
});

describe("B. panel checks step back", () => {
  it("hides every Ask a panel control and Write a question from scratch, keeps panel answers", () => {
    const app = read("src/App.tsx");
    expect(app).toContain("export const PANEL_CHECKS = false;");
    expect(app).toContain("{PANEL_CHECKS && <ConfirmCard");
    expect(read("src/Record.tsx")).not.toContain("Ask a panel to check a fact</a>");
    expect(read("src/Suggest.tsx")).not.toContain("PANEL_WORDS");
    expect(routeOf("#/s/imd.fun/confirm")).toMatchObject({ tab: "contribute", target: "suggest-changes" });
    expect(read("src/Record.tsx")).toContain("panel-answers");
  });
});

describe("C. rebuild is upkeep", () => {
  it("Page upkeep is a closed section at the bottom of Contribute, and its line opens the rebuild dialog", () => {
    const app = read("src/App.tsx");
    expect(app).toMatch(/<details className="upkeep" id="rebuild" open=\{firstPage \|\| undefined\}>\s*<summary>Page upkeep<\/summary>/);
    expect(app.indexOf("<NoteForm />")).toBeLessThan(app.indexOf('<details className="upkeep"'));
    expect(app).toContain("if (ready) onAsk(ask);");
    expect(OLDER_RULES).toBe("Built with older instructions. A rebuild applies the current rules.");
    expect(upkeepText({ kind: "format" } as never)).toBe(OLDER_RULES);
    expect(routeOf("#/s/imd.fun/rebuild")).toMatchObject({ tab: "contribute", target: "rebuild" });
  });
});

describe("D. small fixes", () => {
  it("9: Add this project only for an entry with a domain of its own", () => {
    expect(ownDomainEntry({ name: "Aave", id: "aave.com", relation: "integrates" })).toBe(true);
    expect(ownDomainEntry({ name: "Ethereum", id: "ethereum.org", relation: "chain it runs on" })).toBe(false);
    expect(ownDomainEntry({ name: "ERC-20", id: "eips.ethereum.org/EIPS/eip-20", relation: "standard" })).toBe(false);
    expect(ownDomainEntry({ name: "USDC", id: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", relation: "paired token" })).toBe(false);
    expect(ownDomainEntry({ name: "Base", id: "", relation: "network" })).toBe(false);
    const cards = relatedCards([{ name: "Aave", id: "aave.com", relation: "integrates" }, { name: "Polygon", id: "polygon.technology", relation: "chain" }, { name: "WETH", id: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2", relation: "token" }], [], "ens.domains");
    expect(cards.map((c) => c.addable)).toEqual(["aave.com", "", ""]);
  });
  it("10: a subject with a finished page job never offers Create the page", () => {
    const rec2 = read("src/Record.tsx");
    expect(rec2).toContain("The page could not be loaded.");
    expect(rec2).toMatch(/latest && error \?/);
    expect(rec2).toContain("items !== null && (unreadable > 0 || latest) ?");
    const app = read("src/App.tsx");
    expect(app).toContain("if (!rec.page && rec.latest)");
  });
  it("11: other chains' addresses keep their own chain, never the home chain", () => {
    expect(otherAddresses(`governance; Polygon: ${OTHER}`).also).toEqual([{ address: OTHER, chain: "Polygon", note: "" }]);
    expect(otherAddresses(`governance, ${OTHER} on Base`).also[0]!.chain).toBe("Base");
    expect(otherAddresses(`governance, ${OTHER} (Polygon)`).also[0]!.chain).toBe("Polygon");
    expect(otherAddresses(`governance, also ${OTHER}`).also[0]!.chain).toBe("");
    expect(otherAddresses(`governance; Polygon: ${OTHER}`).rest).toBe("governance");
    // ENS: home address on Ethereum, the Polygon address under also on, tagged Polygon.
    const ens = tokenOfItem(valueItemOf({ name: "ENS", text: `governance; Polygon: ${OTHER}`, address: HOME, chain: 1 })!);
    expect(ens).toMatchObject({ symbol: "ENS", purpose: "governance", address: HOME, chain: "Ethereum" });
    expect(ens.also).toEqual([{ address: OTHER, chain: "Polygon", note: "" }]);
    // The also field the rebuild instructions ask for.
    const listed = tokenOfItem(valueItemOf({ name: "ENS", text: "governance", address: HOME, chain: "Ethereum", also: [{ chain: "Polygon", address: OTHER }] })!);
    expect(listed.purpose).toBe("governance");
    expect(listed.also).toEqual([{ address: OTHER, chain: "Polygon", note: "" }]);
    // Older text: "IMD: jobs, 0x… Ethereum, 0x… Base (Fren Pet)".
    const imd = tokensOf("", "", [`IMD: jobs, ${HOME} Ethereum, ${OTHER} Base (Fren Pet)`])[0]!;
    expect(imd.chain).toBe("Ethereum");
    expect(imd.also).toEqual([{ address: OTHER, chain: "Base", note: "Fren Pet" }]);
    expect(read("templates/instructions/rebuild.txt")).toContain("A token's entry gives its home chain and address. Other chains go in a field also, a list of {chain, address}. Never write another chain's address inside the text.");
    expect(read("src/Record.tsx")).toContain('<span className="tok-also-k">also on</span>');
  });
  it("12: after a request is sent the dialog closes and the toast links the job", () => {
    const app = read("src/App.tsx");
    expect(app).toMatch(/onSent=\{\(note\) => \{\s*setAsk\(null\);/);
    expect(app).toMatch(/Sent\.\{" "\}\s*<a href=\{sentHref\(sent\.hash, items, jobs\)\}[^>]*>\s*Follow it on the IMD explorer\./);
  });
});

describe("E. docs", () => {
  it("agents.md and the README describe the open field", () => {
    const agents = read("public/agents.md");
    expect(agents).toContain("`note`");
    expect(agents).toContain("also on");
    expect(read("README.md")).toContain("What's wrong or missing?");
    expect(existsSync("DESIGN.md")).toBe(true);
  });
});
