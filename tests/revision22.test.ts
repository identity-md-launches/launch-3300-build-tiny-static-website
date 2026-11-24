/**
 * Revision 22: Related "Add this project" decided by the entry itself (never a chain such as Ethereum, kept for a
 * project whose relation names a token), a token's other chains tagged with their own chain (ENS on Polygon PoS), no
 * "Create the page" while the record is read or when a result is unreadable, one output shape for also in the
 * rebuild instructions, Key facts wrapping on phones, Back this up on a sentence, and the open form's draft kept.
 */
import { readFileSync } from "node:fs";
import { createElement, Fragment } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { chainOnlyPiece, isChainName, otherAddresses } from "../src/addrDisplay";
import { tokenOfItem, tokensOf } from "../src/keyfacts";
import { valueItemOf } from "../src/page";
import { ownDomainEntry, relatedCards } from "../src/Record";
import { explorerAddressUrl } from "../src/subject";
import { QUICK_SENTENCE, QUICK_LINE } from "../src/changes";
import { NoteForm, SuggestProvider, useSuggest } from "../src/Suggest";
import manifest from "../src/instructions.json";

const read = (f: string) => readFileSync(f, "utf8");
// ENS on Ethereum and its Polygon PoS deployment, as the live ens.domains Tokens row gives them.
const ENS = "0xC18360217D8F7Ab5e7c516566761Ea12Ce7F9D72";
const ENS_POLYGON = "0xbd7a5cf51d22930b8b3df6d834f9bcef90ee7c4f";
const B = "0x00000000000000000000000000000000000000b1"; // an example address, not a real deployment

describe("D9. Add this project matches the entry, not its relation's words", () => {
  const live = [
    { name: "Ethereum", id: "ethereum.org", relation: "Hosts ENS naming and governance contracts" },
    { name: "Base", id: "base.org", relation: "deployed on it" },
    { name: "Polygon", id: "polygon.technology", relation: "bridged deployment" },
    { name: "Solana", id: "solana.com", relation: "Runs on" },
    { name: "Uniswap", id: "uniswap.org", relation: "pools its token" },
    { name: "LayerZero", id: "layerzero.network", relation: "bridges its token between networks" },
    { name: "Safe", id: "safe.global", relation: "treasury multisig on Ethereum mainnet" },
  ];
  it("the live ens.domains entries: chains get no link, projects naming a token keep it", () => {
    expect(relatedCards(live, [], "ens.domains").map((c) => c.addable)).toEqual(["", "", "", "", "uniswap.org", "layerzero.network", "safe.global"]);
  });
  it("standards, tokens and relations that say the entry is a chain", () => {
    expect(ownDomainEntry({ name: "ERC-20", id: "eips.ethereum.org", relation: "the token it follows" })).toBe(false);
    expect(ownDomainEntry({ name: "Token standard", id: "example-standard.org", relation: "" })).toBe(false);
    expect(ownDomainEntry({ name: "USDC", id: "circle.com", relation: "paired with" })).toBe(false);
    expect(ownDomainEntry({ name: "$IMD", id: "imd.fun", relation: "pays for jobs" })).toBe(false);
    expect(ownDomainEntry({ name: "Ethereum mainnet", id: "example.org", relation: "" })).toBe(false);
    expect(ownDomainEntry({ name: "Some L2", id: "somel2.xyz", relation: "the chain it runs on" })).toBe(false);
    expect(ownDomainEntry({ name: "Some L2", id: "somel2.xyz", relation: "supported network" })).toBe(false);
    expect(ownDomainEntry({ name: "Chainlink", id: "chain.link", relation: "price feeds for its token" })).toBe(true);
    expect(ownDomainEntry({ name: "Mode app", id: "mode.app", relation: "uses its coin" })).toBe(true);
    expect(isChainName("Polygon PoS")).toBe(true);
    expect(isChainName("Uniswap")).toBe(false);
  });
});

describe("D11. a token's other chains carry their own chain", () => {
  it("the live ENS row: governance token, Ethereum home, also on Polygon PoS with polygonscan", () => {
    const item = valueItemOf({ name: "ENS", text: `governance token, bridged to Polygon PoS at ${ENS_POLYGON}`, address: ENS, chain: "Ethereum" });
    const t = tokenOfItem(item!);
    expect(t).toMatchObject({ symbol: "ENS", purpose: "governance token", address: ENS, chain: "Ethereum" });
    expect(t.also).toEqual([{ address: ENS_POLYGON, chain: "Polygon PoS", note: "" }]);
    expect(explorerAddressUrl(ENS_POLYGON, "Polygon PoS")).toBe(`https://polygonscan.com/address/${ENS_POLYGON}`);
  });
  it("a chain before each of two addresses tags each with its own", () => {
    expect(otherAddresses(`governance; Polygon ${ENS_POLYGON}, Base ${B}`).also.map((x) => x.chain)).toEqual(["Polygon", "Base"]);
    expect(otherAddresses(`governance token; Polygon contract ${ENS_POLYGON}`).also[0]!.chain).toBe("Polygon");
    expect(otherAddresses(`governance token; on Polygon it is ${ENS_POLYGON}`).also[0]!.chain).toBe("Polygon");
    const br = otherAddresses(`governance token on Ethereum and Polygon (${ENS_POLYGON})`);
    expect(br.also[0]!.chain).toBe("Polygon");
    expect(br.rest).not.toContain(")");
    // The chain after an address still wins when no address follows it.
    expect(otherAddresses(`fees ${B} on Base`).also[0]!.chain).toBe("Base");
  });
  it("a piece that is only a chain and an address folds into the previous token", () => {
    const list = tokensOf(`ENS governance token ${ENS} on Ethereum; Polygon ${ENS_POLYGON}`);
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ symbol: "ENS", purpose: "governance token", address: ENS, chain: "Ethereum" });
    expect(list[0]!.also).toEqual([{ address: ENS_POLYGON, chain: "Polygon", note: "" }]);
    expect(chainOnlyPiece(`${B} on Base`)).toEqual({ address: B, chain: "Base" });
    expect(chainOnlyPiece(`USDC: dollar ${B} on Base`)).toBeNull();
  });
  it("a token past the first never takes the subject's home chain", () => {
    expect(read("src/Record.tsx")).toContain("chain={chainTag(i === 0 ? t.chain || chain : t.chain)}");
  });
});

describe("D10. Create the page only once the chain shows no page job", () => {
  it("Overview footer and Contribute wait for the record and count unreadable results", () => {
    const r = read("src/Record.tsx");
    expect(r).toContain(") : items !== null && !latest && unreadable === 0 ? (");
    const app = read("src/App.tsx");
    expect(app).toContain("const firstPage = known && !rec.page && !rec.latest && unreadable === 0;");
    expect(app).toContain("if (!rec.page && (rec.latest || unreadable > 0))");
    expect(app).toContain("Reading the record from Ethereum…");
    expect(app).toContain("unreadable={unreadableCount(allItems ?? [])} />}");
  });
});

describe("D11. the rebuild instructions give one shape for also", () => {
  const t = read("templates/instructions/rebuild.txt");
  it("keeps the brief's three sentences and adds also to the values contract, example and keys", () => {
    expect(t).toContain("A token's entry gives its home chain and address. Other chains go in a field also, a list of {chain, address}. Never write another chain's address inside the text.");
    expect(t).toContain("and optionally url or address with chain; a Tokens entry may also have also, a list of {chain, address}. Use no other shapes.");
    expect(t).toContain('"chain": "Ethereum", "also": [{"chain": "Polygon", "address": "0x..."}]}]');
    expect(t).toContain("values[{name,text,url,address,chain,also[{chain,address}]}]");
    expect(read(`public/instructions/${manifest.rebuild.file}`)).toBe(t);
  });
});

describe("advisories", () => {
  it("a sentence offers This is wrong, Add context and Back this up, then Reword it", () => {
    expect(QUICK_SENTENCE).toEqual(["wrong", "context", "backing", "reword"]);
    expect(QUICK_LINE).toEqual(["wrong", "context", "backing"]);
    expect(read("templates/instructions/changes.txt")).toContain("for backing on a summary sentence, link the line it writes to the lines the sentence rests on");
  });
  it("the open form starts from the draft kept above the tabs", () => {
    function Seed() {
      useSuggest().drafts.current.set("ens.domains", { note: "A draft I am still writing.", links: "https://example.com/a" });
      return null;
    }
    const rec = { scope: {} as never, resolve: () => undefined, sections: [] };
    const html = renderToStaticMarkup(createElement(SuggestProvider, { subject: "ens.domains", rec, children: createElement(Fragment, null, createElement(Seed), createElement(NoteForm)) }));
    expect(html).toContain("A draft I am still writing.</textarea>");
    expect(html).toContain("https://example.com/a</textarea>");
  });
  it("phones wrap token addresses inside the cell; upkeep summaries carry a chevron", () => {
    const css = read("src/styles.css");
    expect(css).toContain(".kf-tokens, .kf-items, .kf-values { grid-template-columns: minmax(0, 1fr); }");
    expect(css).toContain(".kf-value .addr { display: inline-flex; flex-wrap: wrap; white-space: normal; max-width: 100%; }");
    expect(css).toContain(".upkeep[open] > summary::before, .upkeep details[open] > summary::before { transform: rotate(45deg); }");
    expect(read("src/Suggest.tsx")).toContain("rows={inline ? 4 : 5}");
  });
});
