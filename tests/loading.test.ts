/** Job 8: loading. The RPC scan halves its range and moves on; a return visit scans only newer blocks; files and digests live in IndexedDB. */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { encodeAbiParameters, pad, stringToHex, toHex, type Hex } from "viem";
import { fromStored, getIntakeLogs, loadTaggedRequests, RESCAN, toStored, type RawLog } from "../src/chain";
import { INTAKE, LAUNCH_BLOCK, TOPIC_COMPLETED, TOPIC_REQUESTED } from "../src/config";
import { dropOldFileCache, memoryKV, useKV, kvGet, kvSet } from "../src/store";
import { splitDigests } from "../src/digest";
import { digestOf, subjectSummaries, type Digest } from "../src/model";

const RPCS = [
  { url: "a", span: 1000n },
  { url: "b", span: 1000n },
];

describe("RPC fallback", () => {
  it("tries the next RPC and halves the range when one fails or limits it", async () => {
    const calls: string[] = [];
    const call = async <T,>(url: string, method: string, params: unknown[]): Promise<T> => {
      if (method === "eth_blockNumber") return toHex(LAUNCH_BLOCK + 1999n) as T;
      const q = params[0] as { fromBlock: string; toBlock: string };
      const span = BigInt(q.toBlock) - BigInt(q.fromBlock) + 1n;
      calls.push(`${url}:${span}`);
      if (url === "a") throw new Error("rate limited");
      if (span > 300n) throw new Error("range too large");
      return [] as T;
    };
    const retries: string[] = [];
    const { head } = await getIntakeLogs([TOPIC_REQUESTED], { rpcs: RPCS, call, onRetry: (r) => retries.push(`${r.url}->${r.span}`) });
    expect(head).toBe(LAUNCH_BLOCK + 1999n);
    expect(calls.slice(0, 4)).toEqual(["a:1000", "b:500", "a:250", "b:125"]);
    expect(retries.slice(0, 3)).toEqual(["a->500", "b->250", "a->125"]);
  });

  it("gives up only after many failures in a row", async () => {
    const call = async <T,>(_u: string, method: string): Promise<T> => {
      if (method === "eth_blockNumber") return toHex(LAUNCH_BLOCK + 10n) as T;
      throw new Error("down");
    };
    await expect(getIntakeLogs([TOPIC_REQUESTED], { rpcs: RPCS, call, maxFailures: 5 })).rejects.toThrow("down");
  });
});

const reqLog = (n: number, block: bigint): RawLog => ({
  topics: [TOPIC_REQUESTED, pad(toHex(n), { size: 32 }), pad("0x00000000000000000000000000000000000000aa", { size: 32 }), pad(stringToHex("job.open@job-1"), { dir: "right", size: 32 })],
  data: encodeAbiParameters(
    [{ type: "bytes" }, { type: "address" }, { type: "bytes4" }, { type: "address" }, { type: "uint256" }],
    [stringToHex(JSON.stringify({ tag: { app: "rec-test-1", kind: "add", subject: "example.com" }, objective: "x" })), "0x0000000000000000000000000000000000000000", "0x00000000", "0x0000000000000000000000000000000000000000", 1n],
  ),
  blockNumber: toHex(block),
  transactionHash: pad(toHex(n + 500), { size: 32 }),
  logIndex: "0x0",
});
const doneLog = (n: number, block: bigint): RawLog => ({
  topics: [TOPIC_COMPLETED, pad(toHex(n), { size: 32 })],
  data: encodeAbiParameters([{ type: "uint8" }, { type: "bytes32" }, { type: "string" }, { type: "bool" }], [0, pad("0x01", { size: 32 }), "ipfs://x/result.json", false]),
  blockNumber: toHex(block),
  transactionHash: pad(toHex(n + 900), { size: 32 }),
  logIndex: "0x1",
});

describe("incremental scan", () => {
  it("a return visit reads only blocks after the last one scanned, and keeps what it knew", async () => {
    let head = LAUNCH_BLOCK + 100n;
    const chainReqs = [reqLog(1, LAUNCH_BLOCK + 10n)];
    const chainDone: RawLog[] = [];
    const ranges: [bigint, bigint][] = [];
    const call = async <T,>(_u: string, method: string, params: unknown[]): Promise<T> => {
      if (method === "eth_blockNumber") return toHex(head) as T;
      const q = params[0] as { fromBlock: Hex; toBlock: Hex; topics: unknown[]; address: string };
      expect(q.address).toBe(INTAKE);
      const f = BigInt(q.fromBlock);
      const t = BigInt(q.toBlock);
      ranges.push([f, t]);
      const pool = q.topics[0] === TOPIC_REQUESTED ? chainReqs : chainDone;
      return pool.filter((l) => BigInt(l.blockNumber) >= f && BigInt(l.blockNumber) <= t) as T;
    };
    const opts = { rpcs: [{ url: "a", span: 10_000n }], call };
    const first = await loadTaggedRequests(null, opts);
    expect(first.requests).toHaveLength(1);
    expect(first.completions.size).toBe(0);
    expect(first.lastBlock).toBe(head);

    // Stored and read back, as IndexedDB keeps it.
    const back = fromStored(JSON.parse(JSON.stringify(toStored(first))));
    expect(back?.requests[0]!.blockNumber).toBe(LAUNCH_BLOCK + 10n);

    head = LAUNCH_BLOCK + 200n;
    chainReqs.push(reqLog(2, LAUNCH_BLOCK + 150n));
    chainDone.push(doneLog(1, LAUNCH_BLOCK + 160n));
    ranges.length = 0;
    const second = await loadTaggedRequests(back, opts);
    expect(ranges.every(([f]) => f === LAUNCH_BLOCK + 100n - RESCAN + 1n)).toBe(true);
    expect(second.requests.map((r) => Number(r.requestId))).toEqual([2, 1]);
    expect(second.completions.has(pad(toHex(1), { size: 32 }))).toBe(true);
    expect(second.lastBlock).toBe(LAUNCH_BLOCK + 200n);
  });

  it("refuses a stored state for another Intake or another format", () => {
    expect(fromStored(null)).toBeNull();
    expect(fromStored({ v: 1, intake: "0x0", lastBlock: "1", requests: [], completions: [] })).toBeNull();
  });
});

describe("storage", () => {
  it("keeps files in the IndexedDB stores and moves old page files out of localStorage", async () => {
    useKV(memoryKV());
    await kvSet("files", "page:0x1", { text: "{}", hash: "h", jobId: null, path: "api" });
    expect(await kvGet("files", "page:0x1")).toEqual({ text: "{}", hash: "h", jobId: null, path: "api" });
    const keys = ["imd-record:v1:page:0x1", "imd-record:v1:job:0x1", "imd-record:v1:artifact:ab"];
    const store = { get length() { return keys.length; }, key: (i: number) => keys[i] ?? null, removeItem: (k: string) => void keys.splice(keys.indexOf(k), 1) };
    expect(dropOldFileCache(store)).toBe(2);
    expect(keys).toEqual(["imd-record:v1:job:0x1"]);
    const api = readFileSync("src/api.ts", "utf8");
    expect(api).not.toMatch(/cacheSet\(key, (out|text)\)/);
  });

  it("the home list shows a stored digest per subject without reading the page file again", () => {
    const digest: Digest = { type: "digest", v: 7, example: null, unfolded: 0, pageReq: null, failedReads: 0, logo: "ok", id: "example.com", sig: "0x01", name: "Example", oneLine: "Does things", counts: { all: 3, proven: 2, stated: 1, claimed: 0, contradicted: 0, outdated: 0, checks: 1, confirmed: 1 }, logoHash: "ab", changed: 5, hasPage: true, main: "", contracts: [], status: null };
    const { digests, logos } = splitDigests([digest, { type: "logo", hash: "ab", url: "data:image/png;base64,AAAA" }, { type: "logo", hash: "cd", url: "javascript:x" }]);
    expect(logos.size).toBe(1);
    const light = {
      req: { requestId: "0x01" as Hex, payer: "0x00" as Hex, action: "job.open@job-1", body: "", bodyJson: null, kind: "add", title: "", subject: "example.com", template: "", amount: 0n, blockNumber: 1n, transactionHash: "0x02" as Hex },
      completion: { requestId: "0x01" as Hex, status: 0, resultHash: "0x" as Hex, reason: "", uri: "", transactionHash: "0x03" as Hex, blockNumber: 2n, logIndex: 0 },
      state: "completed" as const, time: 1, ens: null, jobId: null, oracle: null, refusal: null, sources: null, sourcesError: null, edit: null, fileHash: null, page: null, via: null, rejected: null, doneTime: 9, filesRead: false,
    };
    expect(digestOf("example.com", [light])).toBeNull();
    const [s] = subjectSummaries([light], digests, logos);
    expect(s).toMatchObject({ name: "Example", oneLine: "Does things", hasPage: true, logo: "data:image/png;base64,AAAA", stale: false });
    expect(s!.counts!.proven).toBe(2);
    // Without a digest the subject is listed by its id as unread: Home shows a placeholder row while it reads it.
    const [bare] = subjectSummaries([light]);
    expect(bare).toMatchObject({ name: "example.com", counts: null, unread: true, status: { kind: "unread" } });
  });
});
