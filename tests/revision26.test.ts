/** Review fixes to revision 25: the Home example's fact matcher, live-only key facts rows, the phone header, og.png. */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { exampleOf, datesIn } from "../src/example";
import { keyFacts } from "../src/keyfacts";
import { parsePage, type Line } from "../src/page";

const K = ["proof", "statement", "claim"] as const;
/** Three lines, L1–L3, in Proof, Statement and Claim order, with the given links (none by default). */
const three = (texts: string[], links: Line["links"][] = [[], [], []]): Line[] => {
  const page = parsePage(JSON.stringify({ subject: { name: "Uniswap" }, lines: texts.map((t, i) => ({ id: `L${i + 1}`, section: "what_it_does", text: t, kind: K[i] })) }), "uniswap.org");
  return page.lines.map((l, i) => ({ ...l, kind: K[i]!, links: links[i]! }));
};
const published = (t: string) => [t, `Uniswap docs state that ${t[0]!.toLowerCase()}${t.slice(1)}`, `DefiLlama says ${t[0]!.toLowerCase()}${t.slice(1)}`];

describe("the Home example is one fact on all three lines (c97e5ccb)", () => {
  it("never groups two different pools", () => {
    expect(exampleOf(three(["The ETH/USDC pool fee is 0.3%.", "Uniswap docs state that the WBTC/USDT pool fee is 0.3%.", "DefiLlama says the ETH/USDC pool fee is 0.3%."]))).toBeNull();
    expect(exampleOf(three(published("The ETH/USDC pool fee is 0.3%.")))).not.toBeNull();
  });
  it("never groups two different dates of one year", () => {
    expect(exampleOf(three(["Uniswap had $5 million daily volume on Ethereum on 1 March 2024.", "Uniswap docs state that Uniswap had $5 million daily volume on Ethereum on 2 March 2024.", "DefiLlama says Uniswap had $5 million daily volume on Ethereum on 1 March 2024."]))).toBeNull();
    expect(exampleOf(three(["Uniswap had $5 million daily volume on Ethereum on 1 March 2024.", "Uniswap docs state that Uniswap had $5 million daily volume on Ethereum on March 1, 2024.", "DefiLlama says Uniswap had $5 million daily volume on Ethereum on 2024-03-01."]))).not.toBeNull();
    expect(datesIn("on 1 March 2024 and in May 2021").dates).toEqual(["2021-05", "2024-03-01"]);
  });
  it("matches a launch, with the same version and date", () => {
    expect(exampleOf(three(published("Uniswap v3 launched in May 2021.")))).toEqual({ proof: "Uniswap v3 launched in May 2021.", statement: "Uniswap docs state that uniswap v3 launched in May 2021.", claim: "DefiLlama says uniswap v3 launched in May 2021." });
    expect(exampleOf(three(["Uniswap v3 launched in May 2021.", "Uniswap docs state that Uniswap v3 launched in June 2021.", "DefiLlama says Uniswap v3 launched in May 2021."]))).toBeNull();
    expect(exampleOf(three(["Uniswap v3 launched in May 2021.", "Uniswap docs state that Uniswap v2 launched in May 2021.", "DefiLlama says Uniswap v3 launched in May 2021."]))).toBeNull();
  });
  it("never groups two tokens' figures", () => {
    expect(exampleOf(three(["The UNI total supply is 1 billion.", "Uniswap docs state that the ZORA total supply is 1 billion.", "CoinGecko says the UNI total supply is 1 billion."]))).toBeNull();
    expect(exampleOf(three(["The UNI contract on Ethereum reports a total supply of 1,000,000,000 UNI.", "Uniswap docs state that the total supply of UNI is 1 billion.", "CoinGecko says UNI has a total supply of 1 billion tokens."]))).not.toBeNull();
  });
  it("takes a statement and claim that link to the proof as confirms", () => {
    const linked: Line["links"][] = [[], [{ type: "confirms", target: "L1" }], [{ type: "confirms", target: "L1" }]];
    expect(exampleOf(three(["Pool 0xabc reports fee() = 3000.", "Uniswap docs state the default fee tier is 0.3%.", "DefiLlama says the fee is 0.3%."], linked))).not.toBeNull();
    // A link never joins lines whose pools differ.
    expect(exampleOf(three(["The ETH/USDC pool reports fee() = 3000.", "Uniswap docs state the WBTC/USDT fee tier is 0.3%.", "DefiLlama says the ETH/USDC fee is 0.3%."], linked))).toBeNull();
  });
});

const A = "0x1111111111111111111111111111111111111111";
const B = "0x2222222222222222222222222222222222222222";
const rows = (j: object) => {
  const p = parsePage(JSON.stringify(j), "example.org");
  return keyFacts(p, () => undefined, p.lines).rows.map((r) => [r.label, r.value] as const);
};
describe("live-only key facts rows (acd34dc3)", () => {
  it("splits a Chains row that names a live and a test network", () => {
    const j = { subject: { contracts: [{ address: A, chain: "Ethereum", status: "live", main: true }, { address: B, chain: "Sepolia", status: "test" }] }, infobox: [{ label: "Chains", value: "Ethereum and Sepolia", values: [{ name: "Ethereum", text: "" }, { name: "Sepolia", text: "" }] }] };
    expect(rows(j)).toEqual([["Chains", "Ethereum"], ["Test networks", "Sepolia"]]);
    // The same as one text.
    expect(rows({ ...j, infobox: [{ label: "Chains", value: "Ethereum and Sepolia" }] })).toEqual([["Chains", "Ethereum"], ["Test networks", "Sepolia"]]);
  });
  it("keeps only live contracts in Contracts, moves a test one and leaves out a past one", () => {
    const C = "0x3333333333333333333333333333333333333333";
    const j = { subject: { contracts: [{ address: A, chain: "Ethereum", status: "live", main: true }, { address: B, chain: "Base Sepolia", status: "test" }, { address: C, chain: "Ethereum", status: "past" }] }, infobox: [{ label: "Contracts", value: "x", values: [{ name: "Token", text: "", address: A, chain: "Ethereum" }, { name: "Pilot", text: "", address: B, chain: "Base Sepolia" }, { name: "Old", text: "", address: C, chain: "Ethereum" }] }] };
    expect(rows(j)).toEqual([["Contracts", `Token, ${A} on Ethereum`], ["Test networks", "Base Sepolia"]]);
  });
  it("leaves out every live-only row when the only deployment is past", () => {
    const j = { subject: { contracts: [{ address: A, chain: "Ethereum", status: "past", main: false }] }, infobox: [{ label: "Main contract", value: A }, { label: "Chains", value: "Ethereum" }, { label: "Deployed by", value: B }, { label: "Website", value: "example.org" }] };
    expect(rows(j).map((r) => r[0])).toEqual(["Website"]);
  });
  it("lists a non-EVM test program under Test networks, with or without an infobox", () => {
    const contracts = [{ address: "11111111111111111111111111111111", chain: "Solana devnet", status: "test" }];
    expect(rows({ subject: { contracts } })).toEqual([["Test networks", "Solana devnet"]]);
    expect(rows({ subject: { contracts }, infobox: [{ label: "Website", value: "example.org" }] })).toEqual([["Website", "example.org"], ["Test networks", "Solana devnet"]]);
  });
});

describe("phones and the share image (f238f973, 9bc121a7)", () => {
  const css = readFileSync("src/styles.css", "utf8");
  it("keeps the header inside 375 px and the totals to their counts", () => {
    const block = css.slice(css.indexOf("@media (min-width: 23.4375rem) and (max-width: 30rem)"));
    expect(block).toContain("--text-display: 1.75rem");
    expect(block).toContain("column-gap: var(--space-1)");
    expect(block).toMatch(/\.top-link \{[^}]*font-size: var\(--text-small\)/);
    expect(block).toContain("padding-inline: var(--space-2)");
    expect(css).toMatch(/\.totals-more \{ display: none; \}/);
  });
  it("og.html carries the headline and the three line icons", () => {
    const html = readFileSync("scripts/og.html", "utf8");
    expect(html).toContain("A crowdsourced record of any project or protocol.");
    expect(html).not.toContain("Crowdsourced research");
    expect(html.match(/<svg /g)?.length).toBe(3);
    const png = readFileSync("public/og.png");
    expect([png.readUInt32BE(16), png.readUInt32BE(20)]).toEqual([1200, 630]);
  });
});
