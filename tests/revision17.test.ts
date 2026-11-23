/**
 * Revision 17: historical replay of the published instruction files at every gateway form the site emitted, the
 * raw tag subject of a subdomain request, a correction with both a source link and a suggested sentence, and the
 * chronological rules of the gate (earlier results and channels known when the request was sent; older jobs only
 * before instruction files existed).
 */
import { describe, expect, it } from "vitest";
import { artifactUrl, rebuildBody, researchBody } from "../src/bodies";
import { changesBody, parseItemsText, type Change } from "../src/changes";
import { countedOf, shapeOf, type Countable } from "../src/counts";
import { refFromId } from "../src/subject";
import onchain from "./fixtures/onchain-filebase.json";

const H = (n: number) => n.toString(16).padStart(64, "0");

/** Each on-chain body decoded as the scan does (canonical subject from the tag). */
const decoded = onchain.map((o) => {
  const bodyJson = JSON.parse(o.body) as Record<string, unknown>;
  const tag = bodyJson.tag as { subject: string; kind: string };
  return { ...o, bodyJson, tagSubject: tag.subject };
});

describe("on-chain objectives replay (Ethereum blocks 26459713–26466492)", () => {
  it("decodes the Uniswap request under uniswap.org with app.uniswap.org in its tag and objective", () => {
    const u = decoded.find((d) => d.transactionHash.startsWith("0xce827b57"))!;
    expect(u.subject).toBe("uniswap.org");
    expect(u.tagSubject).toBe("app.uniswap.org");
    expect((u.bodyJson.objective as string)).toContain("the project at app.uniswap.org");
    expect((u.bodyJson.objective as string)).toContain("ipfs.filebase.io");
    expect((u.bodyJson.objective as string)).toContain("rebuild-aede2eb36737.txt");
  });
  for (const d of decoded)
    it(`counts ${d.kind} ${d.subject} at block ${d.blockNumber} (${d.transactionHash.slice(0, 10)})`, () => {
      const s = shapeOf({ subject: d.subject, kind: d.kind, bodyJson: d.bodyJson });
      expect(s.ok).toBe(true);
    });
  it("counts the Uniswap rebuild with a completed result", () => {
    const u = decoded.find((d) => d.transactionHash.startsWith("0xce827b57"))!;
    const c: Countable = { req: { requestId: "u", subject: u.subject, kind: u.kind, bodyJson: u.bodyJson, blockNumber: BigInt(u.blockNumber) }, completion: { blockNumber: BigInt(u.blockNumber) + 50n }, fileHash: H(1), page: { channels: [] } };
    expect([...countedOf([c]).counted]).toEqual(["u"]);
  });
});

const ref = refFromId("example.com");
const job = (id: string, body: { tag: { subject: string; kind: string }; objective: string }, hash: string | null, b: bigint, done: bigint, page: Countable["page"] = null): Countable => ({
  req: { requestId: id, subject: body.tag.subject, kind: body.tag.kind, bodyJson: body as never, blockNumber: b },
  completion: { blockNumber: done },
  fileHash: hash,
  page,
});
const ids = (xs: Countable[]) => [...countedOf(xs).counted].sort();

describe("a correction with a source link and a suggested sentence", () => {
  const change: Change = { id: "c", type: "wrong", target: { kind: "sentence", key: "", lineId: "", text: "The project charges 2 units." }, note: "The fee changed", links: ["https://example.com/fees"], suggest: "The project now charges 3 units." };
  const body = changesBody([change], { files: [artifactUrl(H(1))], answers: [] }, [], ref, () => "");
  it("parses the link without the separator and keeps the suggestion", () => {
    const t = body.objective.slice(body.objective.indexOf("The changes: ") + 13, -1);
    const [it0] = parseItemsText(t);
    expect(it0!.links).toEqual(["https://example.com/fees"]);
    expect(it0!.suggest).toBe("The project now charges 3 units.");
  });
  it("passes the gate", () => {
    expect(shapeOf({ subject: "example.com", kind: "changes", bodyJson: body as never }).ok).toBe(true);
  });
});

describe("chronological rules", () => {
  it("does not count a rebuild whose earlier result was written after it was sent", () => {
    const a = job("b10", rebuildBody({ files: [], answers: [] }, ref), H(1), 10n, 11n, { channels: [] });
    const later = job("b30", rebuildBody({ files: [], answers: [] }, ref), H(3), 30n, 31n, { channels: [] });
    const early = job("b20", rebuildBody({ files: [artifactUrl(H(3))], answers: [] }, ref), H(2), 20n, 40n, { channels: [] });
    expect(ids([a, later, early])).toEqual(["b10", "b30"]);
  });
  it("does not let a page certify a channel only it lists", () => {
    const a = job("b10", rebuildBody({ files: [], answers: [] }, ref), H(1), 10n, 11n, { channels: [] });
    const b = job("b20", rebuildBody({ files: [artifactUrl(H(1))], answers: [] }, ref, [{ url: "https://x.com/newaccount", tie: "linked" }]), H(2), 20n, 21n, { channels: [{ url: "https://x.com/newaccount" }] });
    expect(ids([a, b])).toEqual(["b10"]);
    // Listed by the earlier page: counts.
    const a2 = { ...a, page: { channels: [{ url: "https://x.com/newaccount" }] } };
    expect(ids([a2, b])).toEqual(["b10", "b20"]);
  });
  it("does not count an instructionless request sent after instruction files existed, nor a rebuild that lists it", () => {
    const imd = refFromId("imd.fun");
    const named = job("n10", rebuildBody({ files: [], answers: [] }, imd), H(1), 10n, 11n, { channels: [] });
    const old = { ...researchBody(), tag: { app: "rec-test-1", kind: "add", subject: "imd.fun" } };
    const legacy = job("l20", old as never, H(2), 20n, 21n, { channels: [] });
    const adopt = job("r30", rebuildBody({ files: [artifactUrl(H(2))], answers: [] }, imd), H(3), 30n, 31n, { channels: [] });
    expect(ids([named, legacy, adopt])).toEqual(["n10"]);
    // Sent before the first named job: adopted by the later rebuild.
    const legacy5 = { ...legacy, req: { ...legacy.req, blockNumber: 5n }, completion: { blockNumber: 6n } };
    expect(ids([named, legacy5, adopt])).toEqual(["l20", "n10", "r30"]);
  });
});

import { settleReads, markNotRead, type Activity } from "../src/useActivity";
import { ACTIONS } from "../src/config";

describe("a rebuild with another subject's earlier result is never downloaded", () => {
  const act = (id: string, subject: string, body: { objective: string; tag: unknown }, hash: string, b: bigint): Activity => ({
    req: { requestId: id as never, payer: "0x00856bd495941f3b95da5b7e374c76d822c9059e", action: ACTIONS.research, body: JSON.stringify(body), bodyJson: body as never, kind: "add", title: "", subject, template: "", amount: 5n * 10n ** 17n, blockNumber: b, transactionHash: "0x1" as never },
    completion: { requestId: id as never, status: 0, resultHash: "0x" as never, reason: "", uri: "", transactionHash: "0x2" as never, blockNumber: b + 1n, logIndex: 0 },
    state: "completed", time: null, ens: null, jobId: `job-${id}`, oracle: null, refusal: null, sources: null, sourcesError: null, edit: null, changes: null,
    fileHash: hash, page: null, via: null, rejected: null, doneTime: null, filesRead: false, notRead: null,
  });
  it("reads the counted page and not the cross-subject rebuild", async () => {
    const a = act("f1", "fixture.example", rebuildBody({ files: [], answers: [] }, refFromId("fixture.example")), H(1), 10n);
    const x = act("x2", "crossref.example", rebuildBody({ files: [artifactUrl(H(1))], answers: [] }, refFromId("crossref.example")), H(2), 20n);
    const read: string[] = [];
    // Only crossref.example's requests, as readSubject passes them.
    const out = await settleReads([x], async (r) => { read.push(r.req.requestId); return { ...r, filesRead: true, page: { channels: [] } as never }; });
    expect(read).toEqual([]);
    expect(out[0]!.notRead).toBeTruthy();
    const both = await settleReads([a, x], async (r) => { read.push(r.req.requestId); return { ...r, filesRead: true, page: { channels: [] } as never }; });
    expect(read).toEqual(["f1"]);
    expect(both.find((r) => (r.req.requestId as string) === "x2")!.notRead).toBeTruthy();
  });
  it("a verdict from a full read keeps the light row out of the list", () => {
    const x = act("x2", "crossref.example", rebuildBody({ files: [artifactUrl(H(1))], answers: [] }, refFromId("crossref.example")), H(2), 20n);
    const light = { ...x, fileHash: null };
    expect(markNotRead([light])[0]!.notRead).toBeFalsy();
    expect(markNotRead([light], { verdicts: new Map([["x2", false]]) })[0]!.notRead).toBeTruthy();
  });
});

import { historicFor, historicLines, originsOf } from "../src/addresses";

describe("a citation to a line a later rebuild superseded", () => {
  const J1 = "10000000-0000-4000-8000-000000000001";
  const J2 = "10000000-0000-4000-8000-000000000002";
  const fx = refFromId("fixture.example");
  const p1 = { req: { requestId: "0xp1", transactionHash: "0xt1", blockNumber: 1n, bodyJson: { objective: rebuildBody({ files: [], answers: [] }, fx).objective } }, jobId: J1, fileHash: H(31), doneTime: 1,
    page: { lines: [{ id: "L3", text: "The project charges 2 units." }], dropped: [] } } as never;
  const p2 = { req: { requestId: "0xp2", transactionHash: "0xt2", blockNumber: 2n, bodyJson: { objective: rebuildBody({ files: [artifactUrl(H(31))], answers: [] }, fx).objective } }, jobId: J2, fileHash: H(32), doneTime: 2,
    page: { lines: [{ id: "L11", text: "The project charges 3 units." }], dropped: [{ id: "F1:L3", why: "replaced by L11" }] } } as never;
  it("finds the older line, superseded by the line that replaced it", () => {
    const o = originsOf([p1, p2], p2);
    const h = historicLines([p1, p2], [p1, p2], p2, o);
    const hit = historicFor(h, `${J1}:L3`)!;
    expect(hit.text).toBe("The project charges 2 units.");
    expect(hit.origin.jobId).toBe(J1);
    expect(hit.origin.lineId).toBe("L3");
    expect(hit.replaced).toBe(true);
    expect(hit.by).toBe("L11");
  });
});

import { readFileSync } from "node:fs";
import { fetchUrlOf } from "../src/instructions";
import { INSTRUCTIONS_GATEWAY } from "../src/config";
import manifest from "../src/instructions.json";

describe("README names the current instruction files by their own content address", () => {
  it("pairs each current file with its raw CID and sha256", () => {
    const readme = readFileSync("README.md", "utf8");
    for (const k of ["rebuild", "changes"] as const) {
      expect(readme).toContain(`- ${k}: \`${fetchUrlOf(manifest[k].file, manifest[k].sha256, INSTRUCTIONS_GATEWAY)}\`,\n  sha256 \`${manifest[k].sha256}\``);
    }
  });
});
