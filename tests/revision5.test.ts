/**
 * The home queue and cache, stale reasons, the claim badge's host fallback and multi-token values (job 10f2c646),
 * with the reviewer's cases: a failed supporting result, a failed logo, a second scan, panel answers left out of
 * <PRIOR>, a comma-joined Tokens value and a claim by "Unknown".
 */
import { INSTRUCTIONS } from "../src/instructions";
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import type { Hex } from "viem";
import { artifactUrl, matchesTemplate, rebuildObjective, REBUILD_TEMPLATE } from "../src/bodies";
import { DigestQueue, digestQueue, splitDigests } from "../src/digest";
import { coreOf, digestOf, needsRetry, outdatedOf, outdatedText, resultSig, subjectSummaries, unfoldedAnswersOf, type Digest } from "../src/model";
import { badgeOf, isGenericSpeaker, keyFacts, tokensOf, TOKEN_ROWS } from "../src/keyfacts";
import { parsePage } from "../src/page";
import { refFromId } from "../src/subject";
import { ACTIONS } from "../src/config";
import type { Activity } from "../src/useActivity";

const A = "0x00856bd495941f3b95da5b7e374c76d822c9059e";
const h = (c: string) => c.repeat(64);
let n = 0;
const PAGE = (name: string, extra: object = {}) =>
  JSON.stringify({ subject: { name, one_line: `${name} does things`, channels: [], contracts: [] }, lines: [{ id: "L1", section: "what_it_does", text: "It does things.", kind: "claim", by: "Blog Weekly", sources: ["S1"] }], ...extra });

function act(kind: "add" | "source" | "oracle", o: { block: number; hash?: string; objective?: string; page?: string; subject?: string; answer?: string; sourcesError?: string; logoHash?: string | null; filesRead?: boolean }): Activity {
  n++;
  const tx = `0x${(n + 5000).toString(16).padStart(64, "0")}` as Hex;
  const req = {
    requestId: `0x${(n + 9000).toString(16).padStart(64, "0")}` as Hex,
    payer: A as Hex,
    action: kind === "oracle" ? ACTIONS.oracle : "job.open@job-1",
    body: "",
    bodyJson: { objective: o.objective ?? "" },
    kind: kind === "oracle" ? "oracle" : kind,
    title: kind === "oracle" ? `Question ${n}` : "",
    subject: o.subject ?? "example.com",
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
    jobId: kind === "oracle" ? `job-${n}` : null,
    oracle: o.answer ? { id: "x", status: "answered", answer: o.answer, agreed: 5, panelSize: 5, jobId: `job-${n}` } : null,
    refusal: null,
    sources: kind === "source" && !o.sourcesError ? { sources: [], lines: [], differs: [] } : null,
    sourcesError: o.sourcesError ?? null,
    edit: null,
    fileHash: o.sourcesError ? null : o.hash ?? null,
    page: o.page && !o.sourcesError ? parsePage(o.page) : null,
    via: null,
    rejected: null,
    doneTime: (o.block + 1) * 1000,
    logo: o.logoHash ? "data:image/png;base64,AAAA" : null,
    logoHash: o.logoHash ?? null,
    filesRead: o.filesRead ?? true,
  } as Activity;
}

const current = (prior: string) => rebuildObjective({ files: [prior], answers: [] }, refFromId("example.com"));

describe("Home reads each listed subject through one queue (96f42b1f)", () => {
  it("never runs more than 3 reads at once across several plans, and replaces the waiting list newest first", async () => {
    const started: string[] = [];
    const release = new Map<string, () => void>();
    let peak = 0;
    const q = new DigestQueue(3, (id) => {
      started.push(id);
      peak = Math.max(peak, q.active.size);
      return new Promise<void>((r) => release.set(id, r));
    });
    q.plan(["p3", "p2", "p1"]);
    expect(started).toEqual(["p3", "p2", "p1"]);
    // A newer scan arrives: its subjects wait for a free slot instead of starting a second pool.
    q.plan(["p6", "p5", "p4", "p3", "p2", "p1"]);
    expect(started).toEqual(["p3", "p2", "p1"]);
    expect(q.waiting).toEqual(["p6", "p5", "p4"]);
    release.get("p3")!();
    await new Promise((r) => setTimeout(r, 0));
    expect(started).toEqual(["p3", "p2", "p1", "p6"]);
    expect(peak).toBe(3);
    // A plan replaces what waits; a subject already being read is not queued twice.
    q.plan(["p7", "p6", "p5"]);
    expect(q.waiting).toEqual(["p7", "p5"]);
  });
  it("queues subjects with no digest first, then stale digests and digests with a failed read, newest first", () => {
    const a = act("add", { block: 10, hash: h("1"), page: PAGE("A"), subject: "a.example", filesRead: false });
    const b = act("add", { block: 20, hash: h("2"), page: PAGE("B"), subject: "b.example", filesRead: false });
    const c = act("add", { block: 30, hash: h("3"), page: PAGE("C"), subject: "c.example", filesRead: false });
    const d = act("add", { block: 40, hash: h("4"), page: PAGE("D"), subject: "d.example", filesRead: false });
    const ok = (id: string, list: Activity[], extra: Partial<Digest> = {}): Digest => ({ ...digestOf(id, list.map((x) => ({ ...x, filesRead: true })))!, ...extra });
    const digests = new Map<string, Digest>([
      ["a.example", ok("a.example", [a], { logo: "failed" })],
      ["b.example", ok("b.example", [b])],
      ["c.example", ok("c.example", [c], { failedReads: 1 })],
    ]);
    expect(needsRetry(digests.get("a.example"))).toBe(true);
    expect(needsRetry(digests.get("b.example"))).toBe(false);
    expect(digestQueue([a, b, c, d], digests)).toEqual(["d.example", "c.example", "a.example"]);
  });
});

describe("a failed supporting result does not blank a readable page (440cb977)", () => {
  it("writes the digest with the page's name, counts and the failed read; only a failed page file holds it back", () => {
    const page = act("add", { block: 10, hash: h("1"), page: PAGE("Readable"), logoHash: null });
    const lines = act("source", { block: 20, sourcesError: "artifact answered 503" });
    const d = digestOf("example.com", [page, lines])!;
    expect(d).toMatchObject({ name: "Readable", oneLine: "Readable does things", hasPage: true, failedReads: 1, logo: "none" });
    expect(d.counts.claim).toBe(1);
    // The unread result is not folded in: the row also says the page is out of date.
    expect(d.unfolded).toBe(1);
    const [row] = subjectSummaries([{ ...page, filesRead: false }, { ...lines, filesRead: false }], new Map([["example.com", d]]));
    expect(row).toMatchObject({ name: "Readable", incomplete: 1, outdated: { kind: "results", n: 1 } });
    const broken = act("add", { block: 30, sourcesError: "artifact answered 503" });
    expect(digestOf("example.com", [page, broken])).toBeNull();
  });
});

describe("a logo that failed is read again (d0563bc8)", () => {
  it("records an advertised logo that failed apart from a page with no logo", () => {
    const withLogo = PAGE("L", { logo: { url: "https://example.com/icon.png", fetched_at: "2026-11-20T00:00:00Z" } });
    expect(digestOf("example.com", [act("add", { block: 10, hash: h("1"), page: withLogo, logoHash: null })])!.logo).toBe("failed");
    expect(digestOf("example.com", [act("add", { block: 10, hash: h("1"), page: withLogo, logoHash: h("e") })])!).toMatchObject({ logo: "ok", logoHash: h("e") });
    expect(digestOf("example.com", [act("add", { block: 10, hash: h("1"), page: PAGE("N") })])!.logo).toBe("none");
  });
  it("keeps only digests of the current shape and PNG data URLs", () => {
    const d = digestOf("example.com", [act("add", { block: 10, hash: h("1"), page: PAGE("X") })])!;
    const { digests, logos } = splitDigests([d, { ...d, id: "old.example", v: 2 }, { type: "logo", hash: "ab", url: "data:image/png;base64,AA" }, { type: "logo", hash: "cd", url: "javascript:x" }]);
    expect([...digests.keys()]).toEqual(["example.com"]);
    expect([...logos.keys()]).toEqual(["ab"]);
  });
});

describe("out of date (90eee5ec)", () => {
  it("counts completed results and panel answers the producing request did not list, on Overview and Home alike", () => {
    const old = act("add", { block: 10, hash: h("1"), page: PAGE("Old") });
    const answered = act("oracle", { block: 15, answer: "true" });
    const listedAnswer = act("oracle", { block: 16, answer: "false" });
    const objective = rebuildObjective(
      { files: [artifactUrl(h("1"))], answers: [{ title: "Q", answer: "false", agreed: 5, size: 5, url: `https://explorer.imd.fun/jobs/${listedAnswer.jobId}` }] },
      refFromId("example.com"),
    );
    const shown = act("add", { block: 20, hash: h("2"), page: PAGE("New"), objective });
    const items = [old, answered, listedAnswer, shown];
    const core = coreOf(items);
    expect(core.unfolded).toEqual([]);
    expect(unfoldedAnswersOf(items, shown)).toEqual([answered]);
    const o = outdatedOf(core);
    expect(o).toEqual({ kind: "results", n: 1 });
    expect(outdatedText(o!)).toBe("Out of date: 1 result not folded in");
    expect(digestOf("example.com", items)!.unfolded).toBe(1);
    // A panel answer counts in the digest's signature: a new answer makes Home read the subject again.
    expect(resultSig(items)).toContain(answered.req.requestId.toLowerCase());
    // With the answer listed, the page is current.
    const all = rebuildObjective(
      { files: [artifactUrl(h("1"))], answers: [answered, listedAnswer].map((a) => ({ title: "Q", answer: "true", agreed: 5, size: 5, url: `https://explorer.imd.fun/jobs/${a.jobId}` })) },
      refFromId("example.com"),
    );
    expect(outdatedOf(coreOf([old, answered, listedAnswer, act("add", { block: 30, hash: h("3"), page: PAGE("Newer"), objective: all })]))).toBeNull();
  });
  it("is built with an older format when the objective differs from templates/rebuild.txt apart from <PRIOR>", () => {
    // The format is the instruction file's hash named in the objective.
    expect(matchesTemplate(current(artifactUrl(h("1"))))).toBe(true);
    expect(matchesTemplate(current(artifactUrl(h("1"))).replace(INSTRUCTIONS.rebuild.sha256, "0".repeat(64)))).toBe(false);
    // A page built before instruction files names none: an older format, whatever its words.
    const before = readFileSync("tests/fixtures/rebuild-before-instructions.txt", "utf8").trim().replace("<SUBJECT>", "the project at example.com").replace("<PRIOR>", `[F1] ${artifactUrl(h("1"))}`);
    expect(matchesTemplate(before)).toBe(false);
    expect(readFileSync("templates/rebuild.txt", "utf8").trim()).toBe(REBUILD_TEMPLATE);
    const p = act("add", { block: 10, hash: h("1"), page: PAGE("P"), objective: "Write the record page for one subject: example.com. Older words." });
    expect(outdatedOf(coreOf([p]))).toEqual({ kind: "format" });
    expect(outdatedText({ kind: "format" })).toBe("Out of date: built with an older format");
  });
});

describe("Tokens values (436ed92e, 11a41834)", () => {
  it("never splits a text value on commas; a values list gives one token each (revision 13)", () => {
    expect(tokensOf("GOV: governance, 0x1111111111111111111111111111111111111111 on Ethereum, PAY: fees, 0x2222222222222222222222222222222222222222 on Base")).toHaveLength(1);
    const t = tokensOf("", "", ["GOV: governance, 0x1111111111111111111111111111111111111111 on Ethereum", "PAY: fees, 0x2222222222222222222222222222222222222222 on Base"]);
    expect(t).toEqual([
      { symbol: "GOV", purpose: "governance", address: "0x1111111111111111111111111111111111111111", chain: "Ethereum", url: "" },
      { symbol: "PAY", purpose: "fees", address: "0x2222222222222222222222222222222222222222", chain: "Base", url: "" },
    ]);
  });
  it("reads the format rebuilds write, one token per semicolon", () => {
    const t = tokensOf("IMD: pays for jobs, 0xd34a99bc0f67ae1bbd63c660e6d0b0dd03e263b7 on Ethereum; SEAT: a seat in the swarm, 0x3333333333333333333333333333333333333333 on Base; $GAS: gas credits");
    expect(t.map((x) => [x.symbol, x.purpose, x.address.slice(0, 6), x.chain])).toEqual([
      ["IMD", "pays for jobs", "0xd34a", "Ethereum"],
      ["SEAT", "a seat in the swarm", "0x3333", "Base"],
      ["GAS", "gas credits", "", ""],
    ]);
  });
  it("keeps a row's explorer link on the one token it names", () => {
    const v = "GOV: governance, 0x1111111111111111111111111111111111111111 on Ethereum; PAY: fees, 0x2222222222222222222222222222222222222222 on Base";
    const t = tokensOf(v, "https://etherscan.io/token/0x2222222222222222222222222222222222222222");
    expect(t.map((x) => x.url)).toEqual(["", "https://etherscan.io/token/0x2222222222222222222222222222222222222222"]);
    expect(tokensOf(v, "https://etherscan.io/").map((x) => x.url)).toEqual(["", ""]);
    expect(tokensOf("IMD", "https://etherscan.io/token/x")[0]!.url).toBe("https://etherscan.io/token/x");
  });
  it("lists tokens one per line only on a Tokens row; a legacy Token row keeps its linked value", () => {
    expect(TOKEN_ROWS.test("Tokens")).toBe(true);
    expect(TOKEN_ROWS.test("Token")).toBe(false);
    const p = parsePage(
      JSON.stringify({
        subject: { name: "IMD", channels: [], contracts: [] },
        infobox: [
          { label: "Token", value: "IMD", url: "https://etherscan.io/token/0xd34a99bc0f67ae1bbd63c660e6d0b0dd03e263b7", lines: [] },
          { label: "Tokens", value: "GOV: votes, 0x1111111111111111111111111111111111111111 on Ethereum; PAY: fees, 0x2222222222222222222222222222222222222222 on Base", lines: [] },
        ],
        lines: [],
      }),
      "imd.fun",
    );
    const k = keyFacts(p, () => undefined, p.lines);
    expect(k.rows[0]).toMatchObject({ label: "Token", tokens: [], url: "https://etherscan.io/token/0xd34a99bc0f67ae1bbd63c660e6d0b0dd03e263b7" });
    // A text value is never split (A2): without values it is one text value, every address shortened with a copy button.
    expect(k.rows[1]!.tokens).toEqual([]);
    const q = parsePage(
      JSON.stringify({
        subject: { name: "IMD", channels: [], contracts: [] },
        infobox: [{ label: "Tokens", value: "x", values: ["GOV: votes, 0x1111111111111111111111111111111111111111 on Ethereum", "PAY: fees, 0x2222222222222222222222222222222222222222 on Base"], lines: [] }],
        lines: [],
      }),
      "imd.fun",
    );
    expect(keyFacts(q, () => undefined, q.lines).rows[0]!.tokens.map((t) => t.symbol)).toEqual(["GOV", "PAY"]);
    const src = readFileSync("src/Record.tsx", "utf8");
    expect(src).toContain("<strong>{t.symbol}</strong>");
    expect(src).toContain("<Copy value={t.address} />");
  });
});

describe("the claim badge names the source's host for an unnamed speaker (05a07e88)", () => {
  it("treats bare labels such as Unknown as unnamed, and keeps real names", () => {
    for (const s of ["Unknown", "unknown.", "Anonymous", "N/A", "", "an outside source", "a news site", "Unnamed source", "media reports"]) expect(isGenericSpeaker(s)).toBe(true);
    for (const s of ["The Block", "DefiLlama", "Unknown Labs Research", "CoinDesk"]) expect(isGenericSpeaker(s)).toBe(false);
  });
  it("shows Reported by <host of its first source>", () => {
    const p = parsePage(
      JSON.stringify({
        subject: { name: "X", channels: [], contracts: [] },
        infobox: [{ label: "Audit", value: "Annual", lines: ["L4"] }],
        lines: [{ id: "L4", section: "history", text: "It is audited every year.", kind: "claim", by: "Unknown", sources: ["R3"] }],
        sources: [{ id: "R3", ref: "https://news.example/record" }],
      }),
      "x.example",
    );
    const url = (l: { sources: string[] }) => p.sources.find((s) => s.id === l.sources[0])?.ref ?? "";
    const k = keyFacts(p, (id) => p.lines.find((l) => l.id === id), p.lines, url);
    expect(k.rows[0]!.badge?.text).toBe("Reported by news.example");
    expect(badgeOf(p.lines, p.lines, url)!.text).not.toContain("outside source");
  });
});

describe("Home waits for contract reads before offering a paid page (0cee4f1b, 51bd1845)", () => {
  it("says Checking project contracts and rechecks before the dialog; the filter says it is checking", () => {
    const src = readFileSync("src/Home.tsx", "utf8");
    expect(src).toContain("Checking project contracts…");
    expect(src).toContain("Checking which pages need a rebuild…");
    expect(src).toMatch(/const add = \(input: AddInput\)[\s\S]*findSubject\(submitted\.q, all\)/);
    expect(src).not.toContain("Open the page to read its record");
  });
});

describe("the documents describe this site (51cca9e7)", () => {
  const agents = readFileSync("public/agents.md", "utf8");
  const readme = readFileSync("README.md", "utf8");
  it("agents.md publishes the current body and the new rules", () => {
    expect(agents).toContain("Write notes afresh for this run");
    expect(agents).toContain("**Tokens**");
    expect(agents).not.toContain("reads a full page file only");
    expect(agents).not.toContain("Website, Token,");
    expect(agents).toContain("Needs a rebuild");
    expect(agents).toContain("Reported by news.example");
  });
  it("the README explains the home queue, IndexedDB, Tokens, the badge and the notes", () => {
    for (const s of ["newest first", "IndexedDB", "Tokens", "Reported by", "Out of date: N results not folded in", "Out of date: built with an older format", "Needs a rebuild"]) expect(readme).toContain(s);
    expect(readme).not.toContain("Open the page to read its record");
  });
});
