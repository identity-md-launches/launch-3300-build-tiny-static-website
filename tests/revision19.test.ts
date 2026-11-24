/**
 * Revision 19: Related and Key facts against the real newest pages of the five subjects (tests/fixtures/live-pages.json).
 */
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import fixture from "./fixtures/live-pages.json";
import { parsePage } from "../src/page";
import { recordAddresses, type RankedAddress } from "../src/model";
import { KeyValue, relatedCards } from "../src/Record";
import { keyFacts } from "../src/keyfacts";
import { addressRuns, chainEntries, chainTag, chainText, takeAddress } from "../src/addrDisplay";
import type { Findable } from "../src/lookup";

const pages = Object.fromEntries(fixture.pages.map((p) => [p.id, { page: parsePage(JSON.stringify(p.raw), p.id), ranked: p.ranked as RankedAddress[] }]));
const subjects = (order: string[]): Findable[] => order.map((id) => ({ id, main: pages[id]!.page.main, contracts: recordAddresses(pages[id]!.page), ranked: pages[id]!.ranked }));
const ids = fixture.pages.map((p) => p.id);

describe("B7: Related resolves entries by rank, never to the page's own subject, whatever Home's order", () => {
  for (const order of [ids, [...ids].reverse()]) {
    it(`imdusd.com: one imd.fun card with IdentityMD, IMD and sIMD; Uniswap v4 on uniswap.org (order ${order[0]})`, () => {
      const cards = relatedCards(pages["imdusd.com"]!.page.related, subjects(order), "imdusd.com");
      const imd = cards.find((c) => c.found === "imd.fun")!;
      expect(imd.name).toBe("IdentityMD");
      expect(imd.relations.map((r) => r.name)).toEqual(["IdentityMD", "IMD", "Staked IMD (sIMD)"]);
      expect(cards.find((c) => c.name === "Uniswap v4")!.found).toBe("uniswap.org");
      // USDC is only mentioned in other pages' proofs: it stays an entry of its own, with Add this project.
      expect(cards.find((c) => c.name === "USDC")!.found).toBeNull();
      expect(cards.find((c) => c.name === "Chainlink")!.found).toBeNull();
      expect(cards.filter((c) => c.found === "imdusd.com")).toHaveLength(0);
    });
  }
});

describe("C10-C12: Key facts never print a full address and show chains once with their roles", () => {
  for (const id of ids) {
    it(`${id}: every address shortened, linked, with a copy icon and a chain tag`, () => {
      const page = pages[id]!.page;
      const { rows } = keyFacts(page, () => undefined, []);
      for (const r of rows) {
        const html = renderToStaticMarkup(createElement(KeyValue, { row: r, chain: "Ethereum" }));
        const text = html.replace(/<[^>]+>/g, " ");
        expect(text, `${id} ${r.label}`).not.toMatch(/0x[0-9a-fA-F]{40}/);
        expect(text).not.toMatch(/Ethereum chain 1|>Copy</);
        expect(html).not.toContain('class="copy"');
        const addrs = (html.match(/class="addr"/g) ?? []).length;
        expect((html.match(/class="copy-icon"/g) ?? []).length).toBe(addrs);
      }
    });
  }
  it("reads a token written as one string, as on imdusd.com", () => {
    const { rows } = keyFacts(pages["imdusd.com"]!.page, () => undefined, []);
    const t = rows.find((r) => r.label === "Tokens")!.tokens;
    expect(t.map((x) => [x.symbol, x.purpose, x.address.slice(0, 6), x.chain])).toEqual([
      ["imdUSD", "Borrowing dollar", "0x61aA", "Ethereum"],
      ["INFER", "Protocol token", "0x53d0", "Ethereum"],
      ["sINFER", "INFER staking shares", "0x5e3b", "Ethereum"],
    ]);
  });
  it("takes the chain written after an address into its tag", () => {
    expect(takeAddress("ENS Registry 0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e, Ethereum chain 1")).toMatchObject({ chain: "Ethereum", rest: "ENS Registry" });
    expect(takeAddress("IMD: jobs, 0xd34a99bc0f67ae1bbd63c660e6d0b0dd03e263b7 Ethereum, 0x5f7bb59365ce557c26dbcaa4ee9d39a4b95b7127 Robinhood Chain")).toMatchObject({ chain: "Ethereum", tail: "0x5f7bb59365ce557c26dbcaa4ee9d39a4b95b7127 Robinhood Chain" });
    const runs = addressRuns("Safe 0xbeFd108085613662356aa26A2466Ad3426DA9C32; two-of-three", "Ethereum");
    expect(runs).toEqual([{ kind: "text", text: "Safe " }, { kind: "address", address: "0xbeFd108085613662356aa26A2466Ad3426DA9C32", chain: "Ethereum" }, { kind: "text", text: "; two-of-three" }]);
    expect(chainTag("Ethereum mainnet")).toBe("Ethereum");
  });
  it("ens.domains Chains: Ethereum, then each payment chain with its role", () => {
    const row = pages["ens.domains"]!.page.infobox.find((r) => r.label === "Chains")!;
    const list = chainEntries((row.items ?? []).map((v) => ({ text: `${v.name} ${v.text}`.trim(), chain: v.chain || null })));
    expect(list.map(chainText)).toEqual(["Ethereum", "Base: app payment", "Arbitrum One: app payment", "Optimism: app payment"]);
  });
});
