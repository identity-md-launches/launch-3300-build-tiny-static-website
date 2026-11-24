/** Revision 18 (B7): Related entries matched to subjects by any address in their record, and merged into one card. */
import { describe, expect, it } from "vitest";
import { relatedCards } from "../src/Record";
import { relatedId, parsePage } from "../src/page";
import { recordAddresses } from "../src/model";
import type { Findable } from "../src/lookup";

// imd.fun's Key facts as the live page gives them (job 85445a56): tokens written as one string per entry.
const imdPage = parsePage(JSON.stringify({
  found: true, name: "IdentityMD", one_line: "x", main_contract: "0xd34a99bc0f67ae1bbd63c660e6d0b0dd03e263b7",
  contracts: [{ address: "0xd34a99bc0f67ae1bbd63c660e6d0b0dd03e263b7", chain: "Ethereum", role: "IMD token", main: true }],
  infobox: [
    { label: "Tokens", value: "IMD: jobs, 0xd34a99bc0f67ae1bbd63c660e6d0b0dd03e263b7 Ethereum; sIMD: staking, 0x9efa934d9fad4ae28c998a40195646b965a97247 Ethereum", lines: [], values: ["IMD: jobs, 0xd34a99bc0f67ae1bbd63c660e6d0b0dd03e263b7 Ethereum, 0xff0c532fdb8cd566ae169c1cb157ff2bdc83e105 Base (Fren Pet)", "sIMD: staking, 0x9efa934d9fad4ae28c998a40195646b965a97247 Ethereum"] },
  ],
  lines: [{ id: "P1", section: "money", text: "The vault holds 241,300 sIMD.", kind: "proof", sources: ["S1"], rerun: "On Ethereum mainnet (chain ID 1), run cast call 0x1111111111111111111111111111111111111111 \"totalSupply()\"" }],
}), "imd.fun");

describe("Related matches a subject by any address in its record", () => {
  it("reads the chain written before an address in a related id", () => {
    expect(relatedId("Ethereum (chain 1): 0xd34a99bc0f67ae1bbd63c660e6d0b0dd03e263b7")).toBe("1:0xd34a99bc0f67ae1bbd63c660e6d0b0dd03e263b7");
    expect(relatedId("Base: 0xFF0c532fdb8cd566ae169c1cb157ff2bdc83e105")).toBe("8453:0xff0c532fdb8cd566ae169c1cb157ff2bdc83e105");
    expect(relatedId("8453:0xff0c532fdb8cd566ae169c1cb157ff2bdc83e105")).toBe("8453:0xff0c532fdb8cd566ae169c1cb157ff2bdc83e105");
  });
  it("lists key-fact and proof addresses with their chains", () => {
    const a = recordAddresses(imdPage);
    expect(a).toContainEqual({ address: "0x9efa934d9fad4ae28c998a40195646b965a97247", chainId: 1 });
    expect(a).toContainEqual({ address: "0xff0c532fdb8cd566ae169c1cb157ff2bdc83e105", chainId: 8453 });
    expect(a).toContainEqual({ address: "0x1111111111111111111111111111111111111111", chainId: 1 });
  });
  it("merges IdentityMD, IMD and Staked IMD on imdusd.com into one imd.fun card with three relations", () => {
    const subjects: Findable[] = [{ id: "imd.fun", main: imdPage.main, contracts: recordAddresses(imdPage) }, { id: "imdusd.com" }];
    const related = [
      { name: "IdentityMD", id: "imd.fun", relation: "Agent price panels" },
      { name: "IMD", id: relatedId("Ethereum (chain 1): 0xd34a99bc0f67ae1bbd63c660e6d0b0dd03e263b7"), relation: "Underlying asset of collateral" },
      { name: "Staked IMD (sIMD)", id: relatedId("Ethereum (chain 1): 0x9efa934d9fad4ae28c998a40195646b965a97247"), relation: "Loan collateral" },
      { name: "Chainlink", id: "chain.link", relation: "Dollar price conversion" },
    ];
    const cards = relatedCards(related, subjects, "imdusd.com");
    expect(cards).toHaveLength(2);
    expect(cards[0]).toMatchObject({ found: "imd.fun", name: "IdentityMD" });
    expect(cards[0]!.relations.map((r) => r.relation)).toEqual(["Agent price panels", "Underlying asset of collateral", "Loan collateral"]);
    expect(cards[1]).toMatchObject({ found: null, addable: "chain.link" });
  });
  it("does not match an address on another chain", () => {
    const subjects: Findable[] = [{ id: "imd.fun", contracts: recordAddresses(imdPage) }];
    expect(relatedCards([{ name: "sIMD on Base", id: "8453:0x9efa934d9fad4ae28c998a40195646b965a97247", relation: "x" }], subjects, "other.org")[0]!.found).toBeNull();
  });
});
