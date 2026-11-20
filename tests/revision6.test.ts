/**
 * Revision 6 (job 6ef62573): the reviewer's findings on instruction files. Rebuild lineage, the older-format note
 * alongside waiting results, bare dropped ids of older pages, the channel budget, the instruction-fetch outcome,
 * the left-out list, the instruction file address the free check accepts and the reflowed instruction files.
 */
import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import type { Hex } from "viem";
import { artifactUrl, MAX_OBJECTIVE, parsePrior, rebuildObjective } from "../src/bodies";
import { changesObjective, lineTarget } from "../src/changes";
import {
  carriedDrops,
  coreOf,
  digestOf,
  digestOutdated,
  firstPageStatus,
  historyNeeds,
  leftOutItemsOf,
  outdatedOf,
  outdatedText,
  planRebuild,
  promptChannelsOf,
  statusText,
  unfoldedCount,
} from "../src/model";
import { INSTRUCTIONS, paragraphsOf, rawCid } from "../src/instructions";
import { parsePage } from "../src/page";
import { refFromId } from "../src/subject";
import type { Activity } from "../src/useActivity";

const A = "0x00856bd495941f3b95da5b7e374c76d822c9059e";
const IMD = refFromId("imd.fun");
let n = 0;
const hashOf = (k: number) => k.toString(16).padStart(64, "0");
const PAGE = (extra: object = {}) =>
  JSON.stringify({ subject: { name: "IMD", one_line: "IMD does things", channels: [], contracts: [] }, lines: [{ id: "L1", section: "what_it_does", text: "It does things.", kind: "claim", by: "Blog Weekly", sources: ["S1"] }], ...extra });

function act(kind: "add" | "source", o: { block: number; hash: string; objective?: string; page?: string; rejected?: string }): Activity {
  n++;
  const tx = `0x${(n + 5000).toString(16).padStart(64, "0")}` as Hex;
  const req = {
    requestId: `0x${(n + 9000).toString(16).padStart(64, "0")}` as Hex,
    payer: A as Hex,
    action: "job.open@job-1",
    body: "",
    bodyJson: { objective: o.objective ?? "", tag: { app: "rec-test-1", kind, subject: "imd.fun" } },
    kind,
    title: "",
    subject: "imd.fun",
    template: "",
    amount: 0n,
    blockNumber: BigInt(o.block),
    transactionHash: tx,
  };
  return {
    req,
    completion: { requestId: req.requestId, status: 0, resultHash: "0x" as Hex, reason: "", uri: "", transactionHash: tx, blockNumber: BigInt(o.block + 1), logIndex: 0 },
    state: "completed",
    time: o.block * 1000,
    ens: null,
    jobId: null,
    oracle: null,
    refusal: null,
    sources: kind === "source" ? { sources: [], lines: [], differs: [] } : null,
    sourcesError: null,
    edit: null,
    fileHash: o.hash,
    page: o.page ? parsePage(o.page) : null,
    via: null,
    rejected: o.rejected ?? null,
    doneTime: (o.block + 1) * 1000,
    logo: null,
    logoHash: null,
    filesRead: true,
  } as Activity;
}
const objectiveOf = (files: string[], reconsider: string[] = []) => rebuildObjective({ files, answers: [], ...(reconsider.length ? { reconsider } : {}) }, IMD);
const LEGACY = readFileSync("tests/fixtures/rebuild-before-instructions.txt", "utf8").trim();

describe("folded results follow the F1 lineage (5804358472)", () => {
  it("a second rebuild from the first keeps the first rebuild's inputs folded in", () => {
    const p0 = act("add", { block: 10, hash: hashOf(1000), objective: objectiveOf([]), page: PAGE() });
    const sources = Array.from({ length: 70 }, (_, i) => act("source", { block: 20 + i * 2, hash: hashOf(i + 1) }));
    const urls = sources.map((s) => artifactUrl(s.fileHash!));
    const a = act("add", { block: 300, hash: hashOf(2000), objective: objectiveOf([artifactUrl(p0.fileHash!), ...urls.slice(1)]), page: PAGE() });
    const afterA = coreOf([p0, ...sources, a]);
    expect(unfoldedCount(afterA)).toBe(1);
    const b = act("add", { block: 400, hash: hashOf(3000), objective: objectiveOf([artifactUrl(a.fileHash!), urls[0]!]), page: PAGE() });
    const afterB = coreOf([p0, ...sources, a, b]);
    expect(unfoldedCount(afterB)).toBe(0);
    expect(outdatedOf(afterB)).toBeNull();
    // A result outside the lineage stays eligible.
    const late = act("source", { block: 500, hash: hashOf(4000) });
    expect(coreOf([p0, ...sources, a, b, late]).unfolded.map((x) => x.fileHash)).toEqual([hashOf(4000)]);
  });
});

describe("the older-format note is independent of waiting results (21b7076f40)", () => {
  it("Overview and the digest path both report the format alongside the count", () => {
    const legacy = act("add", { block: 10, hash: hashOf(1), objective: LEGACY, page: PAGE() });
    const s1 = act("source", { block: 20, hash: hashOf(2) });
    const s2 = act("source", { block: 30, hash: hashOf(3) });
    const o = outdatedOf(coreOf([legacy, s1, s2]));
    expect(o).toEqual({ kind: "results", n: 2, format: true });
    expect(outdatedText(o!)).toBe("Out of date: 2 results not folded in; built with an older format");
    const d = digestOf("imd.fun", [legacy, s1, s2])!;
    expect(digestOutdated(d, [legacy, s1, s2])).toEqual({ kind: "results", n: 2, format: true });
    expect(outdatedOf(coreOf([legacy]))).toEqual({ kind: "format" });
    const current = act("add", { block: 10, hash: hashOf(9), objective: objectiveOf([]), page: PAGE() });
    expect(outdatedText(outdatedOf(coreOf([current, s1]))!)).toBe("Out of date: 1 result not folded in");
  });
});

describe("bare dropped ids of older pages stay owed (cc8fe21b6b)", () => {
  it("a legacy F1:L4-by-bare-id drop is carried past a rebuild that omits its file, and marked reconsider", () => {
    const pageA = act("add", { block: 10, hash: hashOf(1), objective: objectiveOf([]), page: PAGE({ lines: [{ id: "L4", section: "what_it_does", text: "Old four.", kind: "claim", by: "Blog Weekly", sources: ["S1"] }] }) });
    const urlA = artifactUrl(pageA.fileHash!);
    const pageB = act("add", { block: 20, hash: hashOf(2), objective: objectiveOf([urlA]), page: PAGE({ dropped: [{ id: "L4", why: "duplicate of L1" }] }) });
    const results = Array.from({ length: 3 }, (_, i) => act("source", { block: 30 + i * 2, hash: hashOf(100 + i) }));
    const pageC = act("add", { block: 50, hash: hashOf(3), objective: objectiveOf([artifactUrl(pageB.fileHash!), ...results.map((r) => artifactUrl(r.fileHash!))]), page: PAGE({ dropped: [] }) });
    const items = [pageA, pageB, ...results, pageC];
    expect(historyNeeds(items).map((x) => x.requestId)).toEqual([pageB.req.requestId]);
    const history = new Map([[pageB.req.requestId, [{ n: 1, lines: [{ id: "L1", text: "It does things." }, { id: "L4", text: "Old four." }] }]]]);
    expect(carriedDrops([pageA, pageB, pageC], history)).toEqual([{ url: urlA, id: "L4", why: "duplicate of L1" }]);
    // Without the reads the home form asks for them rather than planning without the drop.
    expect(planRebuild(items, IMD).needsReads).toBe(true);
    const plan = planRebuild(items, IMD, undefined, history);
    expect(plan.ok).toBe(true);
    const given = parsePrior(rebuildObjective(plan.prior, IMD, plan.channels, plan.moreChannels)).files;
    expect(given.filter((f) => f.reconsider).map((f) => f.url)).toEqual([urlA]);
  });
});

describe("the channel budget (c1393b3c2f)", () => {
  const channels = Array.from({ length: 24 }, (_, i) => ({ url: `https://imd.fun/channel-${i + 1}/${"a".repeat(330)}`, tie: "strong" }));
  const page = act("add", {
    block: 10,
    hash: hashOf(1),
    objective: objectiveOf([]),
    page: PAGE({ subject: { name: "IMD", one_line: "x", channels, contracts: [{ chain: "ethereum", address: "0xd34a99bc0f67ae1bbd63c660e6d0b0dd03e263b7", main: true }] } }),
  });
  it("keeps the rebuild objective within 7,900 and names the rest by count", () => {
    const plan = planRebuild([page], IMD);
    const objective = rebuildObjective(plan.prior, IMD, plan.channels, plan.moreChannels);
    expect(objective.length).toBeLessThanOrEqual(MAX_OBJECTIVE);
    expect(plan.moreChannels).toBeGreaterThan(0);
    expect(plan.channels.length + plan.moreChannels).toBe(24);
    expect(objective).toContain(`, and ${plan.moreChannels} more listed in the page shown (F1).`);
    // Channels take at most half the room left after the fixed text and F1, so results still fit.
    expect(objective.length).toBeLessThan(MAX_OBJECTIVE / 2 + 1000);
  });
  it("applies the same budget to a changes objective", () => {
    const ch = promptChannelsOf(page.page, artifactUrl(page.fileHash!), IMD);
    const items = [{ id: "c1", type: "context" as const, target: lineTarget("L1", "IMD is a swarm of agents."), note: "Check how the protocol describes agent coordination.", links: ["https://imd.fun/docs/"] }];
    const o = changesObjective(items, { files: [artifactUrl(page.fileHash!)], answers: [] }, ch.list, IMD, () => "F1:L1", ch.more);
    expect(o.length).toBeLessThanOrEqual(MAX_OBJECTIVE);
    expect(o).toContain("more listed in the page shown (F1). The changes: (1)");
  });
});

describe("an instruction-fetch failure is its own outcome (47f650b78b)", () => {
  it("is not reported as a missing project", () => {
    const a = act("add", { block: 10, hash: hashOf(1), objective: objectiveOf([]), rejected: "instructions unavailable" });
    const s = firstPageStatus([a]);
    expect(s).toEqual({ kind: "instructions" });
    expect(statusText(s)).toBe("The job stopped because it could not verify the instructions.");
    expect(statusText(firstPageStatus([act("add", { block: 10, hash: hashOf(2), objective: objectiveOf([]), rejected: "Several projects share this name" })]))).toBe("No project found: Several projects share this name");
  });
});

describe("Contribute names what was left out (4a8bdfb6d8)", () => {
  it("lists each omitted result, file and answer by its link", () => {
    const s = act("source", { block: 10, hash: hashOf(7) });
    const items = leftOutItemsOf({ leftOutIds: [s.req.requestId], reconsiderLeft: [artifactUrl(hashOf(8))], answersLeft: [{ title: "Q", answer: "true", agreed: 5, size: 5, url: "https://imd.fun/jobs/1" }] }, [s]);
    expect(items).toEqual([
      { label: `Sources result, file ${hashOf(7).slice(0, 10)}…`, href: artifactUrl(hashOf(7)) },
      { label: `File to reconsider, file ${hashOf(8).slice(0, 10)}…`, href: artifactUrl(hashOf(8)) },
      { label: "Panel answer: Q", href: "https://imd.fun/jobs/1" },
    ]);
    const app = readFileSync("src/App.tsx", "utf8");
    expect(app).toContain("Merges repeated lines, folds in the listed results, and looks for what’s new.");
    expect(app).not.toContain("folds in everything added since the last rebuild");
  });
});

describe("instruction files: address and paragraphs (920b5e20b2, b95e70dcba)", () => {
  it("objectives name the file's content address at a gateway that serves bytes, never an address with the ENS name (e0777a3a9a)", () => {
    for (const ins of Object.values(INSTRUCTIONS)) {
      expect(ins.url).toMatch(/^https:\/\/ipfs\.filebase\.io\/ipfs\/bafkrei[a-z2-7]{52}\?filename=(rebuild|changes)-[0-9a-f]{12}\.txt$/);
      expect(ins.url).not.toContain("identitymd");
      expect(ins.url).not.toContain("dweb.link");
    }
  });
  it("rawCid is the CID IPFS gives a one-block file imported with raw leaves", () => {
    // The published agents.md (site version bafybeihiyfpu…): Filebase and Pinata served it at this CID on 2026-11-21.
    expect(rawCid("5ad5e997894269171a37f62e0500a69c929f7d3b407abd0960fc192e72015c1a")).toBe("bafkreic22xuzpckcnelrun7wfycqbju4skpx2o2apk6qsyh4dexheak4di");
    expect(rawCid("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855")).toBe("bafkreihdwdcefgh4dqkjv67uzcmw7ojee6xedzdetojuzjevtenxquvyku");
    expect(() => rawCid("xyz")).toThrow();
  });
  it("are reflowed into paragraphs under new hashes, and the earlier files are still published", () => {
    expect(paragraphsOf(INSTRUCTIONS.rebuild.text).length).toBeGreaterThan(10);
    expect(paragraphsOf(INSTRUCTIONS.changes.text).length).toBeGreaterThan(4);
    for (const old of ["rebuild-b280294bd61b.txt", "changes-8400e6bf9d85.txt"]) expect(existsSync(`public/instructions/${old}`)).toBe(true);
    expect(INSTRUCTIONS.rebuild.file).not.toBe("rebuild-b280294bd61b.txt");
    expect(INSTRUCTIONS.changes.file).not.toBe("changes-8400e6bf9d85.txt");
  });
  it("the lookup button rules outrank .btn", () => {
    const css = readFileSync("src/styles.css", "utf8");
    expect(css).toMatch(/\.lookup \.btn-lookup \{ flex: none; height: 56px;/);
    expect(css).not.toMatch(/^\s*\.btn-lookup \{/m);
  });
});
