/**
 * Revision 15: stacked Overview, values entries shown whole (Tokens and Supply), the summary's dot key, the year and
 * identifier rule for numbers, the reader's note and Superseded, imd.site as a suffix, and the new instruction rules.
 */
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { Hex } from "viem";
import { ACTIONS } from "../src/config";
import { INSTRUCTIONS } from "../src/instructions";
import { keyFacts, shownItemOf } from "../src/keyfacts";
import { readerNoteText, useRecordModel } from "../src/model";
import { formatNumbers } from "../src/numbers";
import { parsePage, valueItemOf, valueItemText, type Page } from "../src/page";
import { registrableDomain } from "../src/psl";
import { OverviewTab, type Ui } from "../src/Record";
import { emptyCounts, homeGroups, shownGroups } from "../src/settle";
import { canonicalId, explorerAddressUrl, isBareSuffix, subjectDomain } from "../src/subject";
import { SuggestProvider } from "../src/Suggest";
import type { Activity } from "../src/useActivity";

const UNI = "0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984";
const STK = "0x2222222222222222222222222222222222222222";

describe("4c. imd.site and other hosting suffixes", () => {
  it("record-test-1.imd.site stays record-test-1.imd.site", () => {
    expect(subjectDomain("record-test-1.imd.site")).toBe("record-test-1.imd.site");
    expect(subjectDomain("https://record-test-1.imd.site/#/s/x")).toBe("record-test-1.imd.site");
    expect(registrableDomain("record-test-1.imd.site")).toBe("record-test-1.imd.site");
    expect(canonicalId("record-test-1.imd.site")).toBe("record-test-1.imd.site");
  });
  it("a subdomain of a tenant belongs to that tenant; tenants never share; the bare suffix is no project", () => {
    expect(subjectDomain("docs.record-test-1.imd.site")).toBe("record-test-1.imd.site");
    expect(subjectDomain("record-test-2.imd.site")).toBe("record-test-2.imd.site");
    expect(isBareSuffix("imd.site")).toBe(true);
    for (const [host, owner] of [["me.github.io", "me.github.io"], ["docs.app.vercel.app", "app.vercel.app"], ["x.netlify.app", "x.netlify.app"], ["a.pages.dev", "a.pages.dev"]] as const)
      expect(subjectDomain(host)).toBe(owner);
  });
});

describe("D7. numbers: years and plain identifiers are not quantities", () => {
  it('"founded 2020" stays "2020"; "2000 seats" becomes "2,000 seats"; "block 26446763" is unchanged', () => {
    expect(formatNumbers("founded 2020")).toBe("founded 2020");
    expect(formatNumbers("2000 seats")).toBe("2,000 seats");
    expect(formatNumbers("block 26446763")).toBe("block 26446763");
  });
  it("a whole number from 1000 to 2999 changes only before a unit or token symbol", () => {
    expect(formatNumbers("2020 was a quiet year")).toBe("2020 was a quiet year");
    expect(formatNumbers("EIP 1559 burns fees")).toBe("EIP 1559 burns fees");
    expect(formatNumbers("a pool of 2500 IMD")).toBe("a pool of 2,500 IMD");
    expect(formatNumbers("1200 sIMD staked")).toBe("1,200 sIMD staked");
    expect(formatNumbers("costs $1500")).toBe("costs $1,500");
    expect(formatNumbers("In 2024 IMD launched")).toBe("In 2024 IMD launched");
    expect(formatNumbers("sold 2000 seats in 2025")).toBe("sold 2,000 seats in 2025");
    // Outside that range the quantity rule is as before.
    expect(formatNumbers("3000 users")).toBe("3,000 users");
    expect(formatNumbers("about 1000000000 UNI")).toBe("about 1,000,000,000 UNI");
  });
  it("leaves standard and chain identifiers, heights and timestamps alone (review 8cee2fa0)", () => {
    expect(formatNumbers("an ERC 4626 vault")).toBe("an ERC 4626 vault");
    expect(formatNumbers("EIP 7702 accounts")).toBe("EIP 7702 accounts");
    expect(formatNumbers("BIP 32 and SLIP 44")).toBe("BIP 32 and SLIP 44");
    expect(formatNumbers("Base chain (8453)")).toBe("Base chain (8453)");
    expect(formatNumbers("at block height 26446763")).toBe("at block height 26446763");
    expect(formatNumbers("launched at timestamp 1732300000")).toBe("launched at timestamp 1732300000");
    expect(formatNumbers("block number 26446763")).toBe("block number 26446763");
    // Quantities next to them still read as quantities.
    expect(formatNumbers("an ERC 4626 vault holding 1500000 USDC")).toBe("an ERC 4626 vault holding 1,500,000 USDC");
    expect(formatNumbers("a chain with 15000 validators")).toBe("a chain with 15,000 validators");
  });
  it("never changes numbers in dates, addresses, hashes, version names or handles", () => {
    for (const t of ["2024-05-01", "12/05/2024", "Nov 23, 2026", UNI, "0xabc123def4567890", "v2.1.0", "version 2.19.5", "@user2000", "Block: 26446763", "(2021)", "2021–2023"])
      expect(formatNumbers(t)).toBe(t);
  });
});

describe("B3 / F14 / F15. values entries are shown whole", () => {
  it("reads an entry of the one shape, a string, and an entry of another shape without losing text", () => {
    expect(valueItemOf({ name: "UNI", text: "governance token", address: UNI, chain: "Ethereum" })).toMatchObject({ name: "UNI", text: "governance token", address: UNI, chain: "Ethereum", shaped: true });
    expect(valueItemOf({ name: "UNI", text: "1 billion" })).toMatchObject({ name: "UNI", text: "1 billion", address: "" });
    expect(valueItemOf("UNI: 1 billion")).toMatchObject({ name: "", text: "UNI: 1 billion", shaped: false });
    // Another shape: every part stays in text, never only the first word.
    const odd = valueItemOf({ symbol: "SOCKS", purpose: "redeemable for socks", supply: "500" })!;
    expect(odd.name).toBe("SOCKS");
    expect(odd.text).toBe("redeemable for socks, 500");
    expect(valueItemText({ ...valueItemOf({ name: "UNI", text: "governance token", address: UNI, chain: "Ethereum" })! })).toBe(`UNI: governance token, ${UNI} on Ethereum`);
  });
  it("Tokens: symbol, purpose, address, chain and an explorer link per entry; Supply: symbol and amount", () => {
    const p = parsePage(
      JSON.stringify({
        subject: { name: "Proj", channels: [], contracts: [] },
        infobox: [
          { label: "Tokens", value: "UNI, STK", values: [{ name: "UNI", text: "governance token", address: UNI, chain: "Ethereum" }, { name: "STK", text: "staking token", address: STK, chain: "Base" }], lines: [] },
          { label: "Supply", value: "UNI: 1 billion", values: [{ name: "UNI", text: "1 billion" }], lines: [] },
        ],
        lines: [],
      }),
      "proj.example",
    )!;
    const rows = keyFacts(p, () => undefined, []).rows;
    expect(rows[0]!.tokens).toEqual([
      { symbol: "UNI", purpose: "governance token", address: UNI, chain: "Ethereum", url: `https://etherscan.io/address/${UNI}` },
      { symbol: "STK", purpose: "staking token", address: STK, chain: "Base", url: `https://basescan.org/address/${STK}` },
    ]);
    expect(rows[1]!.items).toEqual([{ name: "UNI", text: "1 billion", url: "", address: "", chain: "", explorer: "" }]);
    expect(rows[1]!.values).toEqual(["UNI: 1 billion"]);
  });
  it("an explorer link for each chain, Blockscan for one the site does not know", () => {
    expect(explorerAddressUrl(UNI, "8453")).toBe(`https://basescan.org/address/${UNI}`);
    expect(explorerAddressUrl(UNI, "Arbitrum One")).toBe(`https://arbiscan.io/address/${UNI}`);
    expect(explorerAddressUrl(UNI, "Somechain")).toBe(`https://blockscan.com/address/${UNI}`);
    expect(explorerAddressUrl("not an address")).toBe("");
    expect(shownItemOf({ name: "X", text: "", url: "javascript:alert(1)", address: "", chain: "", shaped: true }).url).toBe("");
  });
});

/* ---------- Overview, rendered ---------- */
let block = 10n;
const req = (id: string, subject: string, objective: string) => ({
  requestId: id as Hex, payer: "0x0085000000000000000000000000000000000000" as Hex, action: ACTIONS.research, body: "", bodyJson: { objective }, kind: "add", title: "", subject, template: "", amount: 1n, blockNumber: block, transactionHash: `0x${id.slice(2).padEnd(64, "0")}` as Hex,
});
const base = { time: null, ens: null, jobId: null, oracle: null, refusal: null, sourcesError: null, edit: null, changes: null, sources: null, page: null, via: null, rejected: null, doneTime: null, logo: null, logoHash: null, filesRead: true };
function pageJob(id: string, subject: string, page: Page): Activity {
  block++;
  // An objective that names no instruction file: built with an older format.
  return { ...base, req: req(id, subject, "Research the project."), state: "completed", completion: { blockNumber: block, logIndex: 0, status: 0 }, page, fileHash: "a".repeat(64) } as unknown as Activity;
}
const ui: Ui = { filter: "all", setFilter: () => {}, openSet: new Set(), toggle: () => {}, openLines: () => {}, target: null };
function render(items: Activity[], subject: string) {
  let model!: ReturnType<typeof useRecordModel>;
  function Harness() {
    const m = useRecordModel(items, null, subject);
    model = m;
    return createElement(SuggestProvider, { subject, rec: m, children: createElement(OverviewTab, { m, ui, items, price: "", subjects: [] }) });
  }
  return { html: renderToStaticMarkup(createElement(Harness)), m: model };
}

describe("A / C6 / E8. the Overview a reader sees", () => {
  const page = parsePage(
    JSON.stringify({
      subject: { name: "Proj", one_line: "A test project.", channels: [{ label: "Site", url: "https://proj.example", tie: "strong" }], contracts: [] },
      summary: [{ text: "Proj sells seats, founded 2020.", lines: ["L1"], paragraph: 1 }],
      infobox: [
        { label: "Tokens", value: "UNI", values: [{ name: "UNI", text: "governance token", address: UNI, chain: "Ethereum" }], lines: ["L1"] },
        { label: "Supply", value: "UNI: 1 billion", values: [{ name: "UNI", text: "1 billion" }], lines: ["L1"] },
      ],
      related: [{ name: "Base", id: "base.org", relation: "runs on", lines: [] }],
      lines: [{ id: "L1", section: "what_it_does", text: "Proj sells 2000 seats.", kind: "statement", by: "Proj", sources: ["S1"], quote: "seats" }],
      sources: [{ id: "S1", ref: "https://proj.example/", type: "page" }],
    }),
    "proj.example",
  )!;
  const { html, m } = render([pageJob("0xa1", "proj.example", page)], "proj.example");
  it("stacks Summary, then Key facts, then Related, with no side column", () => {
    const sum = html.indexOf('class="summary-col"');
    const kf = html.indexOf('class="keyfacts"');
    const rel = html.indexOf('class="related"');
    expect(sum).toBeGreaterThan(0);
    expect(kf).toBeGreaterThan(sum);
    expect(rel).toBeGreaterThan(kf);
    expect(html).not.toContain("facts-col");
  });
  it("shows each Tokens entry in full with its address, copy button and explorer link, and Supply as UNI: 1 billion", () => {
    expect(html).toContain("<strong>UNI</strong>: governance token");
    expect(html).toContain("0x1f98…F984");
    expect(html).toContain(`aria-label="Copy address ${UNI}"`);
    expect(html).toContain(`href="https://etherscan.io/address/${UNI}"`);
    expect(html).toContain("<strong>UNI</strong>: <span class=\"break\">1 billion</span>");
  });
  it("keys the dots under the summary in one line", () => {
    const key = html.slice(html.indexOf('class="small dot-key"'));
    expect(key).toMatch(/kind-proof[^>]*><\/span> proven on chain/);
    expect(key).toMatch(/kind-statement[^>]*><\/span> the project says/);
    expect(key).toMatch(/kind-claim[^>]*><\/span> others say/);
    expect(key).toContain("Summary written from the record by a research job.");
    expect(html).not.toContain("Dots open supporting lines");
    expect(html).toContain("founded 2020");
  });
  it("tells a reader nothing about the instruction format", () => {
    expect(m.outdated).toEqual({ kind: "format" });
    expect(html).not.toContain("older format");
    expect(html).not.toContain("Out of date");
  });
  it("the reader's note is only for results not folded in", () => {
    expect(readerNoteText({ kind: "format" })).toBeNull();
    expect(readerNoteText(null)).toBeNull();
    expect(readerNoteText({ kind: "results", n: 1 })).toBe("1 addition not yet merged");
    expect(readerNoteText({ kind: "results", n: 3, format: true })).toBe("3 additions not yet merged");
  });
});

describe("E8 / E9. upkeep places and Superseded", () => {
  it("the older-format note is kept only on Contribute and under Page upkeep, and still counts for Needs a rebuild", () => {
    const app = readFileSync("src/App.tsx", "utf8");
    const rec = readFileSync("src/Record.tsx", "utf8");
    const home = readFileSync("src/Home.tsx", "utf8");
    expect(app).toContain("{rec.page && rec.outdated && <OutdatedNote o={rec.outdated} href={to(\"rebuild\")} />}");
    expect(rec.slice(rec.indexOf("function PageUpkeep"))).toContain("<OutdatedNote o={m.outdated}");
    expect(rec.slice(rec.indexOf("export function OverviewTab"), rec.indexOf("/* ---------- Record ---------- */"))).not.toContain("<OutdatedNote");
    expect(home).toContain('<ReaderNote o={s.outdated} href={subjectHref(s.id, "rebuild")} />');
    expect(home).toContain("const needs = all.filter((s) => s.outdated).length;");
  });
  it("the line status reads Superseded everywhere; Home leaves it out of its counts", () => {
    for (const f of ["src/Record.tsx", "src/settle.ts", "src/keyfacts.ts", "src/Home.tsx"]) expect(readFileSync(f, "utf8")).not.toMatch(/["'>]\s*Out of date\b(?!: built)/);
    const c = { ...emptyCounts(), proven: 2, stated: 1, claimed: 1, contradicted: 1, outdated: 4 };
    expect(shownGroups(c)).toContain("outdated");
    expect(homeGroups(c)).toEqual(["proven", "stated", "claimed", "contradicted"]);
  });
});

describe("B4, 4b, C5, E10, F11-F14. instruction files", () => {
  const r = INSTRUCTIONS.rebuild.text;
  const c = INSTRUCTIONS.changes.text;
  const TOKENS = "Tokens lists at most 3: the tokens that are central to the project, such as its governance token, its product token and its staking token. Leave out receipt or vault-share tokens, pool positions, collectibles and merchandise tokens; those belong in the record's lines. Supply covers only the tokens listed in Tokens, each with its amount. Every Tokens entry must carry its contract address and chain; a token with no address found is not listed.";
  const BRIDGE = "Before listing tokens, check each one for a bridge. On a LayerZero token read its peers, and on a peer that is an adapter read token(); for other bridges read the equivalent. A token and its bridged forms are one token, even when the names differ (Fren Pet on Base and IMD on Ethereum are one token). List it once under the name the project uses now, with its home chain and the other chains it is on. Give one supply: the home chain's total, then the amount on each other chain. Never add chains together and never list a bridged form as a second token. Add a proof line with the contract reads that show the link. If the link cannot be read on chain, use the project's own statement and mark it stated.";
  const ATTR = "Plain descriptions of what the project is and how it is used need no attribution in words when they rest on the project's own statements; the dots show that. Attribute in words, once per sentence and after the fact, only when the sentence is about money flows, fees, who controls something, safety or performance, when it rests on a claim by someone else, or when sources disagree. Never use the same attribution phrase in two sentences running.";
  const HIST = "When the same source reports the same figure at different times, such as a tracker's value locked or a supply reading, keep one line with the newest reading and put older readings in history. Do not keep the older reading as a separate line or link it with outdates.";
  const LAUNCH = "Launched is the date the project first went live. If the current version is much newer, add it in the same value, such as 'November 2018; current version since January 2025'. When sources disagree on the date, give the project's own date and say so in a line.";
  const RUNBY = "Run by is the organisation and the person leading it now, such as 'Zora Labs; Dee Goens, chief executive'. Contributors is for other people and teams who work on it; never put the chief executive there.";
  const SIZE = "Size uses a figure from an established independent tracker or the project's own published statistics; never a figure from an individual's social post.";
  const VALUES = "Every infobox value that lists several things gives them in values as objects with exactly these keys: name, text (what to show after the name; may be empty) and optionally url or address with chain. Use no other shapes.";
  it("rebuild carries every new rule word for word, Run by after Founder or creator, and drops the old ones", () => {
    for (const s of [TOKENS, BRIDGE, ATTR, HIST, LAUNCH, RUNBY, SIZE, VALUES]) expect(r).toContain(s);
    expect(r).toContain("Founder or creator, Run by, Contributors");
    expect(r).not.toContain("Attribute once per sentence.");
    expect(r).not.toContain("Launched is one date");
    expect(r).not.toContain("every token the project issues");
    expect(r).not.toContain("also give them as an array in values, one entry each");
  });
  it("changes carries the bridge and attribution rules", () => {
    for (const s of [BRIDGE, ATTR]) expect(c).toContain(s);
    expect(c).not.toContain("Attribute once per sentence.");
  });
  it("the new wording is in new files; the files the previous revision named are still served", () => {
    expect(INSTRUCTIONS.rebuild.file).not.toBe("rebuild-8ba8632e27f2.txt");
    expect(INSTRUCTIONS.changes.file).not.toBe("changes-74f6ac6095c4.txt");
    for (const f of ["rebuild-8ba8632e27f2.txt", "changes-74f6ac6095c4.txt", INSTRUCTIONS.rebuild.file, INSTRUCTIONS.changes.file]) expect(readFileSync(`public/instructions/${f}`, "utf8").length).toBeGreaterThan(1000);
    expect(readFileSync(`public/instructions/${INSTRUCTIONS.rebuild.file}`, "utf8")).toBe(r);
  });
});
