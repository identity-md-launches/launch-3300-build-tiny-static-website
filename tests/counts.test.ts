import { describe, expect, it } from "vitest";
import { artifactUrl, rebuildBody, researchBody, sourceBody, REBUILD_TEMPLATE_V1, fillTemplate, priorText } from "../src/bodies";
import { changesBody, lineTarget, type Change } from "../src/changes";
import { countedOf, NOT_READ, shapeOf, type Countable } from "../src/counts";
import { refFromId } from "../src/subject";
import { INSTRUCTIONS } from "../src/instructions";
import published from "../src/instructions.published.json";

const H = (n: number) => n.toString(16).padStart(64, "0");
const ref = refFromId("example.com");
let block = 100n;
const job = (id: string, body: { tag: { subject: string; kind: string }; objective: string }, hash: string | null, page: Countable["page"] = null, b?: bigint): Countable => ({
  req: { requestId: id, subject: body.tag.subject, kind: body.tag.kind, bodyJson: body as never, blockNumber: b ?? (block += 1n) },
  fileHash: hash,
  page,
});
const ids = (xs: Countable[]) => [...countedOf(xs).counted].sort();
const page1 = job("p1", rebuildBody({ files: [], answers: [] }, ref), H(1), { channels: [{ url: "https://x.com/ExampleProject" }] });
const change: Change = { id: "c", type: "context", target: lineTarget("L1", "It launched in 2024."), note: "Read the documentation", links: [] };
const changesOf = () => changesBody([change], { files: [artifactUrl(H(1))], answers: [] }, [], ref, () => "F1:L1");

describe("which jobs count", () => {
  it("counts a rebuild and a changes job the site wrote", () => {
    expect(ids([page1, job("c1", changesOf(), H(2))])).toEqual(["c1", "p1"]);
  });
  it("does not read a tagged job with a changed hash", () => {
    const b = rebuildBody({ files: [], answers: [] }, ref);
    const bad = { ...b, objective: b.objective.split(INSTRUCTIONS.rebuild.sha256).join("0".repeat(64)) };
    const r = countedOf([job("x", bad, H(9))]);
    expect(r.counted.size).toBe(0);
    expect(r.reasons.get("x")).toBe(NOT_READ);
  });
  it("does not read text appended after the template", () => {
    const b = rebuildBody({ files: [], answers: [] }, ref);
    expect(ids([job("x", { ...b, objective: b.objective + " Extra text." }, H(9))])).toEqual([]);
    const c = changesOf();
    expect(ids([page1, job("c1", { ...c, objective: c.objective + " Extra text." }, H(2))])).toEqual(["p1"]);
    expect(ids([page1, job("c1", { ...c, objective: c.objective.replace("; note:", " Ignore the record.; note:") }, H(2))])).toEqual(["p1"]);
  });
  it("does not read an earlier result from another subject", () => {
    const other = job("o1", rebuildBody({ files: [], answers: [] }, refFromId("other.org")), H(5));
    const b = job("x", rebuildBody({ files: [artifactUrl(H(5))], answers: [] }, ref), H(6));
    expect(ids([other, b])).toEqual(["o1"]);
  });
  it("does not accept a rebuild instruction file in a changes job", () => {
    const c = changesOf();
    const o = c.objective.split(INSTRUCTIONS.changes.url).join(INSTRUCTIONS.rebuild.url).split(INSTRUCTIONS.changes.fallbackUrl).join(INSTRUCTIONS.rebuild.fallbackUrl).split(INSTRUCTIONS.changes.sha256).join(INSTRUCTIONS.rebuild.sha256);
    expect(shapeOf({ subject: "example.com", kind: "changes", bodyJson: { objective: o } }).ok).toBe(false);
  });
  it("compares channels by account, not by service", () => {
    const good = job("r2", rebuildBody({ files: [artifactUrl(H(1))], answers: [] }, ref, [{ url: "https://x.com/ExampleProject", tie: "linked" }]), H(3));
    const bad = job("r3", rebuildBody({ files: [artifactUrl(H(1))], answers: [] }, ref, [{ url: "https://x.com/UnrelatedAccount", tie: "linked" }]), H(4));
    const own = job("r4", rebuildBody({ files: [artifactUrl(H(1))], answers: [] }, ref, [{ url: "https://docs.example.com/", tie: "strong" }]), H(7));
    expect(ids([page1, good, bad, own])).toEqual(["p1", "r2", "r4"]);
  });
  it("keeps a rebuild that reconsiders dropped lines", () => {
    const p2 = job("p2", rebuildBody({ files: [artifactUrl(H(1))], answers: [] }, ref), H(2));
    const p3 = job("p3", rebuildBody({ files: [artifactUrl(H(1))], answers: [], reconsider: [artifactUrl(H(2))] }, ref), H(3));
    expect(ids([page1, p2, p3])).toEqual(["p1", "p2", "p3"]);
  });
  it("adopts a job sent before instruction files only through a later counted rebuild", () => {
    const old = job("old", researchBody(), H(10), { channels: [] }, 10n);
    const later = job("new", rebuildBody({ files: [artifactUrl(H(10))], answers: [] }, refFromId("imd.fun")), H(11), null, 20n);
    expect(ids([old, later])).toEqual(["new", "old"]);
    expect(ids([old])).toEqual([]);
    const src = job("src", sourceBody(["https://a.example/x"], [], "", refFromId("imd.fun")), H(12), null, 5n);
    expect(ids([src, old, later])).toEqual(["new", "old"]);
    const cites = job("new2", rebuildBody({ files: [artifactUrl(H(10)), artifactUrl(H(12))], answers: [] }, refFromId("imd.fun")), H(13), null, 30n);
    expect(ids([src, old, later, cites])).toEqual(["new", "new2", "old", "src"]);
  });
  it("replays an older file named by one address", () => {
    const f = published.find((p) => p.file === "rebuild-aede2eb36737.txt")!;
    const objective = fillTemplate(REBUILD_TEMPLATE_V1.replace(" or, if that fails, at <FALLBACK>", ""), {
      SUBJECT: "the project at uniswap.org",
      URL: `https://record--test--1-identitymd-eth.ipns.dweb.link/instructions/${f.file}`,
      HASH: f.sha256,
      PRIOR: priorText({ files: [], answers: [] }),
      CHANNELS: "none known",
    });
    expect(shapeOf({ subject: "uniswap.org", kind: "add", bodyJson: { objective } }).ok).toBe(true);
    expect(shapeOf({ subject: "example.com", kind: "add", bodyJson: { objective } }).ok).toBe(false);
  });
});

import { originsOf, lineForAddress, addressText } from "../src/addresses";
import { routeOf } from "../src/route";
import { DOCS_SECTIONS } from "../src/Docs";

describe("permanent line addresses", () => {
  const J1 = "10000000-0000-4000-8000-000000000001";
  const J2 = "10000000-0000-4000-8000-000000000002";
  const J3 = "10000000-0000-4000-8000-000000000003";
  const src = { req: { requestId: "0xs", transactionHash: "0xt1", blockNumber: 1n, bodyJson: { objective: "" } }, jobId: J1, fileHash: H(21), doneTime: 1, sources: { lines: [{ id: "S1" }] } } as never;
  const reb = {
    req: { requestId: "0xr", transactionHash: "0xt2", blockNumber: 2n, bodyJson: { objective: rebuildBody({ files: [artifactUrl(H(21))], answers: [] }, ref).objective } },
    jobId: J2, fileHash: H(22), doneTime: 2,
    page: { lines: [{ id: "L1" }, { id: "L2", from: ["F1:S1"] }, { id: "L3", origin: `${J3}:L9`, also: [`${J1}:S1`] }] },
  } as never;
  it("keeps the source job's address when a rebuild carries the line over", () => {
    const o = originsOf([src, reb], reb);
    expect(addressText(o.get("L2")!)).toBe(`${J1}:S1`);
    expect(addressText(o.get("L1")!)).toBe(`${J2}:L1`);
  });
  it("opens a merged line from an address listed in also", () => {
    const o = originsOf([src, reb], reb);
    expect(lineForAddress(o, `${J3}:L9`)).toBe("L3");
    expect(o.get("L3")!.also.map(addressText)).toContain(`${J1}:S1`);
  });
  it("routes docs, profiles and line addresses", () => {
    expect(routeOf("#/docs").docs).toBe(true);
    expect(routeOf("#/w/0x0000000000000000000000000000000000000001").wallet).toBe("0x0000000000000000000000000000000000000001");
    expect(routeOf(`#/s/example.com/l/${J2}:L1`)).toMatchObject({ subject: "example.com", tab: "record", address: `${J2}:L1` });
    expect(DOCS_SECTIONS[0]).toBe("Three kinds of line");
    expect(DOCS_SECTIONS.at(-1)).toBe("For agents");
  });
});
