/**
 * Revision 18: the gate replayed against the real history of every tagged job on the Intake (read from Ethereum
 * mainnet, tests/fixtures/onchain-history.json: objectives and tags exactly as sent, completion positions, and the
 * result hashes and page channels api.imd.fun lists). Every subject must show its newest page, through the same
 * meta-then-full reading the site does (settleReads), and a result that is not read says which rule failed.
 */
import { describe, expect, it } from "vitest";
import type { Hex } from "viem";
import { completedBefore, type Completion, type TaggedRequest } from "../src/chain";
import { countedOf, doneBefore, notReadText, shapeOf, WHY, type Countable } from "../src/counts";
import { markNotRead, settleReads, type Activity } from "../src/useActivity";
import history from "./fixtures/onchain-history.json";
import { sourceObjective } from "../src/bodies";
import { refFromId } from "../src/subject";

type Row = (typeof history.requests)[number];
const rows = history.requests as Row[];

function activity(r: Row, full: boolean): Activity {
  let bodyJson: Record<string, unknown> | null = null;
  try {
    bodyJson = JSON.parse(r.body);
  } catch {
    bodyJson = null;
  }
  const req: TaggedRequest = { requestId: r.requestId as Hex, payer: "0x0" as Hex, action: r.action, body: r.body, bodyJson, kind: r.kind, title: "", subject: r.subject, template: "", amount: 0n, blockNumber: BigInt(r.blockNumber), logIndex: r.logIndex, transactionHash: r.transactionHash as Hex };
  const c = r.completion;
  const completion: Completion | undefined = c ? { requestId: r.requestId as Hex, status: c.status, resultHash: "0x" as Hex, reason: "", uri: "", transactionHash: "0x" as Hex, blockNumber: BigInt(c.blockNumber), logIndex: c.logIndex } : undefined;
  const research = r.action === "job.open@job-1";
  const shape = research ? shapeOf(req) : null;
  const notRead = shape && !shape.ok && !shape.legacy ? notReadText(shape.why) : null;
  const hasFile = research && !notRead && c?.status === 0 && !!r.fileHash;
  const page = full && hasFile && r.kind === "add" && r.channels ? ({ channels: r.channels.map((url) => ({ url, tie: "none" })) } as unknown as Activity["page"]) : null;
  return {
    req, completion, state: !c ? "pending" : c.status === 0 ? "completed" : c.status === 1 ? "refused" : "failed",
    time: null, ens: null, jobId: r.jobId, oracle: null, refusal: null, sources: null, sourcesError: null, edit: null,
    fileHash: hasFile ? r.fileHash : null, page, via: null, rejected: null, doneTime: null, filesRead: !hasFile || full, notRead,
  };
}

const byJob = (prefix: string) => rows.find((r) => r.jobId?.startsWith(prefix))!;
const NEWEST: Record<string, string> = { "zora.co": "38d71f15", "uniswap.org": "cd234a59", "imd.fun": "85445a56", "ens.domains": "a9b77d6d", "imdusd.com": "e2651b57" };

/** The site's own reading: meta first (hashes only), then the files of the jobs that count, until nothing changes. */
async function readAll(): Promise<Activity[]> {
  const base = rows.map((r) => activity(r, false));
  const full = async (a: Activity) => activity(rows.find((r) => r.requestId === a.req.requestId)!, true);
  return settleReads(base, full);
}
const newestPage = (items: Activity[], subject: string) =>
  items.filter((a) => a.req.subject === subject && a.req.kind === "add" && a.state === "completed" && !a.notRead && a.page).sort((a, b) => completedBefore(a.completion!, b.completion!)).at(-1);

describe("the real history (Ethereum mainnet)", () => {
  it("holds the three jobs the brief names, with their real objectives and tags", () => {
    const z = byJob("38d71f15"), u = byJob("cd234a59"), f = byJob("85445a56");
    expect(z.subject).toBe("zora.co");
    expect(u.subject).toBe("uniswap.org");
    expect(f.subject).toBe("imd.fun");
    for (const r of [z, u, f]) {
      const b = JSON.parse(r.body);
      expect(b.tag.app).toBe("rec-test-1");
      expect(b.tag.kind).toBe("add");
      expect(b.objective).toMatch(/^Write the record page for one subject: /);
    }
  });
  it("holds the first jobs named at the later filebase address and the subdomain tag", () => {
    for (const id of ["4a837cd8", "70720ee8"]) expect(JSON.parse(byJob(id).body).objective).toContain("ipfs.filebase.io/ipfs/bafkreifo3yxlgzzxchnk4fbv6fl4bes2txkh3rsaeicmrowg5xppzdp3em?filename=rebuild-aede2eb36737.txt");
    const u = JSON.parse(byJob("23412ad9").body);
    expect(u.tag.subject).toBe("app.uniswap.org");
    expect(u.objective).toContain("the project at app.uniswap.org");
  });
  it("counts every named job of the five subjects", () => {
    for (const id of ["70720ee8", "4a837cd8", "23412ad9", "38d71f15", "cd234a59", "85445a56", "a9b77d6d", "e2651b57"]) {
      const a = activity(byJob(id), false);
      expect(shapeOf(a.req), id).toMatchObject({ ok: true, named: true });
    }
  });
  it("shows each subject's newest page after the site's reading", async () => {
    const items = await readAll();
    for (const [subject, job] of Object.entries(NEWEST)) expect(newestPage(items, subject)?.jobId?.slice(0, 8), subject).toBe(job);
  });
  it("gives every result that is not read a reason in plain words", async () => {
    const items = await readAll();
    const notRead = items.filter((a) => a.notRead && a.req.action === "job.open@job-1");
    for (const a of notRead) expect(a.notRead).toMatch(/^Not read: (its objective differs from this record's template|its subject differs from its tag|earlier result F\d+ is not from a job that counts|channel \S+ is not listed by an earlier page|it names no instruction file and was sent after instruction files existed|it was sent before instruction files existed and no later counted page lists its result)$/);
  });
});

describe("the three faults the last review left open", () => {
  it("an objective that disagrees with its tag does not count through the older-address replay", () => {
    const r = byJob("23412ad9");
    const b = JSON.parse(r.body);
    // Same objective (dweb/filebase replay of rebuild-aede2eb36737.txt), but it names uniswap.org while the tag says app.uniswap.org.
    const forged = { ...b, objective: b.objective.replace("the project at app.uniswap.org", "the project at uniswap.org") };
    const s = shapeOf({ subject: "uniswap.org", kind: "add", bodyJson: forged });
    expect(s).toMatchObject({ ok: false, why: WHY.subject });
    // And the other way round: a tag of uniswap.org with an objective of app.uniswap.org.
    const other = { ...b, tag: { ...b.tag, subject: "uniswap.org" } };
    expect(shapeOf({ subject: "uniswap.org", kind: "add", bodyJson: other })).toMatchObject({ ok: false, why: WHY.subject });
  });
  it("a result written later in the same block as a request is not one of its earlier results", () => {
    const x = { req: { requestId: "x", subject: "s", kind: "add", bodyJson: null, blockNumber: 5n }, completion: { blockNumber: 10n, logIndex: 7 }, fileHash: "h", page: null } as Countable;
    const a = (logIndex?: number) => ({ req: { requestId: "a", subject: "s", kind: "add", bodyJson: null, blockNumber: 10n, logIndex }, completion: null, fileHash: null, page: null }) as Countable;
    expect(doneBefore(x, a(3))).toBe(false);
    expect(doneBefore(x, a(9))).toBe(true);
    expect(doneBefore(x, a(undefined))).toBe(false);
    expect(doneBefore({ ...x, completion: { blockNumber: 10n } }, a(9))).toBe(false);
  });
  it("a sources job naming no instruction file, sent after instruction files existed, is not read", () => {
    // A sources objective exactly as the site writes it, sent after the first job that named an instruction file.
    const src = { ...byJob("98f74ec8"), body: JSON.stringify({ tag: { app: "rec-test-1", kind: "source", subject: "imd.fun" }, objective: sourceObjective(["https://imd.fun/docs/"], [], "", refFromId("imd.fun")) }) };
    const a = activity(src, false);
    expect(shapeOf(a.req)).toMatchObject({ ok: true, named: false });
    const later: Countable = { req: { ...a.req, requestId: "0xlater", blockNumber: 26470000n }, completion: { blockNumber: 26470010n, logIndex: 0 }, fileHash: "f".repeat(64), page: null };
    const named = rows.filter((r) => r.subject === "imd.fun").map((r) => activity(r, true));
    const { counted, reasons } = countedOf([...named, later]);
    expect(counted.has("0xlater")).toBe(false);
    expect(reasons.get("0xlater")).toBe(notReadText(WHY.unnamed));
    const light = markNotRead([...named.map((n) => ({ ...n })), { ...a, req: { ...a.req, requestId: "0xlater" as Hex, blockNumber: 26470000n }, completion: { ...a.completion!, blockNumber: 26470010n }, state: "completed", fileHash: null, filesRead: false }]);
    expect(light.find((x) => x.req.requestId === "0xlater")?.notRead).toBe(notReadText(WHY.unnamed));
  });
});
