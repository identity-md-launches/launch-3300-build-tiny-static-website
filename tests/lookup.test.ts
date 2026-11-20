/** This job: the home bar, first-page states, related projects, history, the record's search and repeat check, logos. */
import { describe, expect, it } from "vitest";
import { countsText, findSubject, initialOf, isSettled, kindCounts, lineMatches, matchesQuery, normText, parseLookup, repeatCount, repeatsOf } from "../src/lookup";
import { parsePage, relatedId, STATUS_LEGEND } from "../src/page";
import { firstPageStatus, statusText } from "../src/model";
import { addHref, routeOf } from "../src/route";
import { isPng, pngDataUrl, pngSize } from "../src/api";
import type { Activity } from "../src/useActivity";

const A = "0x1111111111111111111111111111111111111111";

describe("the home bar", () => {
  it("reads a domain, a pasted link's host, an address, chain:address and an explorer link", () => {
    expect(parseLookup("")).toEqual({ kind: "empty" });
    expect(parseLookup("  IMD.fun ")).toEqual({ kind: "domain", domain: "imd.fun" });
    expect(parseLookup("https://www.example.com/docs?x=1")).toEqual({ kind: "domain", domain: "example.com" });
    expect(parseLookup(A.toUpperCase().replace("0X", "0x"))).toEqual({ kind: "address", address: A, chainId: null });
    expect(parseLookup(`8453:${A}`)).toEqual({ kind: "address", address: A, chainId: 8453 });
    // A pasted link always resolves to its host, even when its path names an address.
    expect(parseLookup(`https://etherscan.io/address/${A}#code`)).toEqual({ kind: "domain", domain: "etherscan.io" });
    expect(parseLookup("not a domain")).toEqual({ kind: "invalid" });
    expect(parseLookup("0x123")).toEqual({ kind: "invalid" });
  });
  it("opens a subject by domain, by chain:address id, or by the main contract its page names", () => {
    const subjects = [{ id: "imd.fun", main: "0xd34a99bc0f67ae1bbd63c660e6d0b0dd03e263b7" }, { id: `137:${A}` }];
    expect(findSubject(parseLookup("https://imd.fun/docs"), subjects)).toBe("imd.fun");
    expect(findSubject(parseLookup("0xD34A99BC0F67AE1BBD63C660E6D0B0DD03E263B7"), subjects)).toBe("imd.fun");
    expect(findSubject(parseLookup(A), subjects)).toBe(`137:${A}`);
    expect(findSubject(parseLookup(`137:${A}`), subjects)).toBe(`137:${A}`);
    expect(findSubject(parseLookup(`1:${A}`), subjects)).toBeNull();
    expect(findSubject(parseLookup("other.org"), subjects)).toBeNull();
  });
  it("filters the list as the visitor types, by id, name, one line or main contract", () => {
    const s = { id: "imd.fun", name: "IMD", oneLine: "A swarm of agents", main: A };
    expect(matchesQuery(s, "")).toBe(true);
    expect(matchesQuery(s, "swarm")).toBe(true);
    expect(matchesQuery(s, "https://imd.fun/x")).toBe(true);
    expect(matchesQuery(s, A.slice(0, 10))).toBe(true);
    expect(matchesQuery(s, "uniswap")).toBe(false);
  });
  it("Add this project lands on home with the bar filled in", () => {
    expect(addHref(`8453:${A}`)).toBe(`#/add/8453%3A${A}`);
    expect(routeOf(addHref(`8453:${A}`))).toEqual({ subject: null, tab: "overview", target: null, add: `8453:${A}` });
    expect(routeOf(addHref("aave.com")).add).toBe("aave.com");
  });
});

const act = (over: Partial<Activity> & { state: Activity["state"]; block: bigint }): Activity =>
  ({
    req: { requestId: `0x${over.block.toString(16).padStart(64, "0")}`, action: "job.open@job-1", kind: "add", subject: "x.org", blockNumber: over.block } as Activity["req"],
    state: over.state,
    refusal: over.refusal ?? null,
    rejected: over.rejected ?? null,
    page: null,
  }) as unknown as Activity;

describe("a subject with no page shows its first page's state", () => {
  it("in progress while a request is pending; else refused with its reason, or no project found with the notes", () => {
    expect(statusText(firstPageStatus([act({ state: "pending", block: 1n })]))).toBe("First page in progress");
    expect(statusText(firstPageStatus([act({ state: "refused", block: 1n, refusal: { reason: "body_invalid", detail: "objective too long" } })]))).toBe(
      "First page refused: body_invalid: objective too long",
    );
    expect(statusText(firstPageStatus([act({ state: "completed", block: 1n, rejected: "A person, not a project." })]))).toBe("No project found: A person, not a project.");
    // A newer pending request wins over an older refusal.
    expect(firstPageStatus([act({ state: "refused", block: 1n }), act({ state: "pending", block: 2n })])).toEqual({ kind: "pending" });
    // The newest outcome is shown.
    expect(firstPageStatus([act({ state: "completed", block: 1n, rejected: "n" }), act({ state: "refused", block: 2n, refusal: { reason: "r", detail: "" } })])).toEqual({ kind: "refused", reason: "r" });
  });
});

describe("page file: related, history, logo", () => {
  const p = parsePage(
    JSON.stringify({
      subject: { name: "Ex" },
      related: [
        { name: "Uniswap", id: "https://app.uniswap.org/", relation: "trades on its pools", lines: ["L1"] },
        { name: "USDC", id: `1 : ${A.toUpperCase().replace("0X", "0x")}`, relation: "collateral", lines: [] },
        { name: "", id: "x.org" },
        { name: "Mystery" },
      ],
      lines: [{ id: "L1", text: "Seats are 2.", kind: "proof", rerun: "call", fact: { name: "Seats", value: "2", unit: "" }, history: [{ block: "21,000,000", value: "1" }, { block: 20000000, value: 0 }, { block: "x" }] }],
      logo: { url: "https://example.com/apple-touch-icon.png", fetched_at: "2026-11-20T10:00:00Z" },
    }),
    "example.com",
  );
  it("reads related with a normalised id, drops entries without a name", () => {
    expect(p.related).toEqual([
      { name: "Uniswap", id: "app.uniswap.org", relation: "trades on its pools", lines: ["L1"] },
      { name: "USDC", id: `1:${A}`, relation: "collateral", lines: [] },
      { name: "Mystery", id: "", relation: "", lines: [] },
    ]);
    expect(relatedId("Base")).toBe("");
  });
  it("reads a proof's earlier readings as block and value", () => {
    expect(p.lines[0]!.history).toEqual([
      { block: "21000000", value: "1" },
      { block: "20000000", value: "0" },
    ]);
  });
  it("reads where the logo came from as text only", () => {
    expect(p.logo).toEqual({ url: "https://example.com/apple-touch-icon.png", fetchedAt: "2026-11-20T10:00:00Z" });
    expect(parsePage(JSON.stringify({ subject: {} })).logo).toBeNull();
  });
});

describe("record: search, settled filter, repeat check", () => {
  const line = (id: string, text: string, by = "", links: { type: "confirms"; target: string }[] = []) =>
    ({ id, text, by, links, kind: "claim" }) as unknown as Parameters<typeof repeatsOf>[0][number];
  it("finds repeats ignoring case and punctuation, and counts the lines after the first of each group", () => {
    const ls = [line("L1", "Seats cost 5 IMD."), line("L2", "seats cost 5 imd"), line("L3", "Seats cost 5 IMD!!"), line("L4", "Jobs cost 0.5 IMD."), line("L5", "JOBS COST 0.5 imd")];
    const g = repeatsOf(ls);
    expect(g.map((x) => x.map((l) => l.id))).toEqual([["L1", "L2", "L3"], ["L4", "L5"]]);
    expect(repeatCount(g)).toBe(3);
    expect(normText("It’s — “Free”.")).toBe("it s free");
    expect(repeatsOf([line("L1", "A."), line("L2", "B.")])).toEqual([]);
  });
  it("searches text and speaker; the filter keeps lines with a confirms or contradicts link", () => {
    const l = line("L1", "The docs price a job at 0.5 IMD.", "DefiLlama", [{ type: "confirms", target: "A1" }]);
    expect(lineMatches(l, "defillama")).toBe(true);
    expect(lineMatches(l, "job price")).toBe(true);
    expect(lineMatches(l, "seat")).toBe(false);
    expect(isSettled(l)).toBe(true);
    expect(isSettled(line("L2", "x"))).toBe(false);
  });
  it("section counts read as proofs, statements and claims", () => {
    expect(countsText(kindCounts([{ kind: "proof" }, { kind: "claim" }, { kind: "claim" }]))).toBe("1 proof, 0 statements, 2 claims");
  });
});

describe("labels", () => {
  it("the Sources legend is the brief's sentence", () => {
    expect(STATUS_LEGEND).toBe("Lines published on Own domain or Verified on chain channels show as statements; everything else is a claim.");
  });
});

describe("logo", () => {
  // A 1x1 PNG.
  const png = Uint8Array.from(atob("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="), (c) => c.charCodeAt(0));
  it("accepts only PNG bytes and shows them as a data: URL, never a remote URL", () => {
    expect(isPng(png)).toBe(true);
    expect(pngSize(png)).toEqual({ width: 1, height: 1 });
    expect(pngDataUrl(png).startsWith("data:image/png;base64,iVBORw0KGgo")).toBe(true);
    const gif = new TextEncoder().encode("GIF89a" + "\0".repeat(40));
    expect(isPng(gif)).toBe(false);
    const svg = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"></svg>');
    expect(isPng(svg)).toBe(false);
  });
  it("a subject with no logo shows the first letter of its name", () => {
    expect(initialOf("imd.fun")).toBe("I");
    expect(initialOf("https://www.aave.com")).toBe("A");
    expect(initialOf("1:0xabc")).toBe("1");
    expect(initialOf("—")).toBe("?");
  });
});
