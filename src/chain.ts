/** Reads the Intake's events from public RPCs, with no wallet. */
import { decodeAbiParameters, hexToString, trim, type Hex } from "viem";
import { ACTIONS, INTAKE, LAUNCH_BLOCK, RPCS, TAG_NEEDLE, TOPIC_COMPLETED, TOPIC_REQUESTED } from "./config";
import { matchOracleQuestion } from "./bodies";
import { canonicalId, DEFAULT_SUBJECT, isSubjectId } from "./subject";

export interface RawLog {
  topics: Hex[];
  data: Hex;
  blockNumber: Hex;
  transactionHash: Hex;
  logIndex: Hex;
}

let rpcId = 0;
/** One JSON-RPC call. Throws on an HTTP error, a JSON-RPC error or a body that is not JSON. */
export async function rpc<T>(url: string, method: string, params: unknown[]): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: ++rpcId, method, params }),
  });
  if (!res.ok) throw new Error(`${method} answered ${res.status}`);
  const j = (await res.json()) as { result?: T; error?: { message?: string } };
  if (j.error) throw new Error(j.error.message || `${method} failed`);
  return j.result as T;
}

const hex = (n: bigint) => `0x${n.toString(16)}`;

export type RpcCall = <T>(url: string, method: string, params: unknown[]) => Promise<T>;
export interface ScanOptions {
  from?: bigint;
  /** The last block to read; the head of the first RPC that answers when not given. */
  to?: bigint;
  rpcs?: ReadonlyArray<{ url: string; span: bigint }>;
  call?: RpcCall;
  /** Told each time a range fails and the scan moves to the next RPC with half the range. */
  onRetry?: (r: { url: string; from: bigint; span: bigint; error: string }) => void;
  /** Consecutive failures before giving up: by default eight rounds of every RPC. */
  maxFailures?: number;
}

/** The chain head from the first RPC that answers, trying each in turn. */
export async function headOf(rpcs: ScanOptions["rpcs"] = RPCS, call: RpcCall = rpc): Promise<bigint> {
  let lastError: unknown;
  for (const { url } of rpcs) {
    try {
      return BigInt(await call<Hex>(url, "eth_blockNumber", []));
    } catch (e) {
      lastError = e;
    }
  }
  throw lastError instanceof Error ? lastError : new Error("No public RPC answered");
}

/**
 * Logs on the Intake between two blocks, in ranges no larger than each RPC allows. When an RPC fails or refuses a
 * range (too many results, range too large, rate limit), the same range is tried on the next RPC with half the
 * span; a range that succeeds moves on with that RPC and span. Gives up only after maxFailures failures in a row.
 */
export async function getIntakeLogs(topics: (Hex | Hex[] | null)[], opts: ScanOptions = {}): Promise<{ logs: RawLog[]; head: bigint }> {
  const rpcs = opts.rpcs ?? RPCS;
  const call = opts.call ?? rpc;
  const head = opts.to ?? (await headOf(rpcs, call));
  const max = opts.maxFailures ?? rpcs.length * 8;
  const out: RawLog[] = [];
  let i = 0;
  let span = rpcs[0]!.span;
  let fails = 0;
  let start = opts.from ?? LAUNCH_BLOCK;
  while (start <= head) {
    const r = rpcs[i % rpcs.length]!;
    const s = span < r.span ? span : r.span;
    const end = start + s - 1n < head ? start + s - 1n : head;
    try {
      const logs = await call<RawLog[]>(r.url, "eth_getLogs", [{ address: INTAKE, topics, fromBlock: hex(start), toBlock: hex(end) }]);
      if (!Array.isArray(logs)) throw new Error("eth_getLogs gave no list");
      out.push(...logs);
      start = end + 1n;
      fails = 0;
    } catch (e) {
      fails++;
      if (fails >= max) throw e instanceof Error ? e : new Error("No public RPC answered");
      i++;
      span = s > 1n ? s / 2n : 1n;
      opts.onRetry?.({ url: r.url, from: start, span, error: e instanceof Error ? e.message : String(e) });
    }
  }
  return { logs: out, head };
}

export async function getBlockTime(blockNumber: Hex): Promise<number | null> {
  for (const { url } of RPCS) {
    try {
      const b = await rpc<{ timestamp: Hex } | null>(url, "eth_getBlockByNumber", [blockNumber, false]);
      if (b) return Number(BigInt(b.timestamp)) * 1000;
    } catch {
      /* next RPC */
    }
  }
  return null;
}

export interface TaggedRequest {
  requestId: Hex;
  payer: Hex;
  action: string;
  body: string;
  bodyJson: Record<string, unknown> | null;
  kind: string;
  /** A short title for an oracle question this site asks; "" for jobs. */
  title: string;
  /** The subject id the request belongs to: the tag's subject, the question's "filed under" sentence, else imd.fun. */
  subject: string;
  /** Which oracle template the question matched ("post", "page", "contract", or a legacy preset id); "" for jobs. */
  template: string;
  amount: bigint;
  blockNumber: bigint;
  transactionHash: Hex;
}

/**
 * Decodes one Requested log and keeps it when it is this site's: a body tagged "app":"rec-test-1" (jobs, and
 * oracle requests sent before the tag was dropped), or an oracle request whose question is exactly a preset
 * question or matches the post-check pattern. The kind comes from the tag, else from the template that matched.
 */
export function decodeRequested(log: RawLog): TaggedRequest | null {
  if (log.topics[0]?.toLowerCase() !== TOPIC_REQUESTED) return null;
  const [body, , , , amount] = decodeAbiParameters(
    [
      { name: "body", type: "bytes" },
      { name: "callbackTarget", type: "address" },
      { name: "callbackSelector", type: "bytes4" },
      { name: "asset", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    log.data,
  );
  const text = hexToString(body);
  const action = hexToString(trim(log.topics[3]!, { dir: "right" }));
  const tagged = text.includes(TAG_NEEDLE);
  if (!tagged && action !== ACTIONS.oracle) return null;
  let bodyJson: Record<string, unknown> | null = null;
  try {
    const parsed = JSON.parse(text);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) bodyJson = parsed as Record<string, unknown>;
  } catch {
    bodyJson = null;
  }
  const match = action === ACTIONS.oracle ? matchOracleQuestion(bodyJson?.question, isSubjectId) : null;
  if (!tagged && !match) return null;
  const tag = (bodyJson?.tag ?? {}) as { kind?: unknown; subject?: unknown };
  const subject = subjectOfTag(tag.subject, match?.subject);
  if (subject === null) return null;
  return {
    requestId: log.topics[1]!,
    payer: `0x${log.topics[2]!.slice(26)}` as Hex,
    action,
    body: text,
    bodyJson,
    kind: typeof tag.kind === "string" ? tag.kind : match?.kind ?? "unknown",
    title: match?.title ?? "",
    subject,
    template: match?.template ?? "",
    amount,
    blockNumber: BigInt(log.blockNumber),
    transactionHash: log.transactionHash,
  };
}

/**
 * The subject a tag names. A string id, or an object carrying one in "subject" (a tag written as the brief's
 * {"app","kind","subject"} nested under "subject") are both read. No subject: the oracle question's, else imd.fun.
 * null when a subject is given but is not a valid id, so the request is not shown under any record.
 */
export function subjectOfTag(v: unknown, fallback?: string): string | null {
  const raw = v && typeof v === "object" ? (v as { subject?: unknown }).subject : v;
  // A subject added by a subdomain (app.uniswap.org) belongs to its registrable domain's record (uniswap.org).
  if (raw === undefined || raw === null) return canonicalId(fallback ?? DEFAULT_SUBJECT);
  return isSubjectId(raw) ? canonicalId(raw) : null;
}

export interface Completion {
  requestId: Hex;
  status: number;
  resultHash: Hex;
  reason: string;
  uri: string;
  transactionHash: Hex;
  /** Where the completion sits on chain, so results can be ordered by when they completed. */
  blockNumber: bigint;
  logIndex: number;
}

export function decodeCompleted(log: RawLog): Completion | null {
  if (log.topics[0]?.toLowerCase() !== TOPIC_COMPLETED) return null;
  const [status, resultHash, uri] = decodeAbiParameters(
    [
      { name: "status", type: "uint8" },
      { name: "resultHash", type: "bytes32" },
      { name: "uri", type: "string" },
      { name: "delivered", type: "bool" },
    ],
    log.data,
  );
  let reason = "";
  if (status !== 0) {
    try {
      reason = hexToString(trim(resultHash, { dir: "right" })).replace(/[^\x20-\x7e]/g, "");
    } catch {
      reason = "";
    }
  }
  return { requestId: log.topics[1]!, status, resultHash, reason, uri, transactionHash: log.transactionHash, blockNumber: BigInt(log.blockNumber ?? "0x0"), logIndex: Number(log.logIndex ?? "0x0") };
}

/** Blocks scanned again on a return visit, in case the newest ones were reorganised. */
export const RESCAN = 12n;

/** What the browser keeps between visits: the last block scanned and every request and completion found. */
export interface ScanState {
  lastBlock: bigint;
  requests: TaggedRequest[];
  completions: Map<string, Completion>;
}

/**
 * Every tagged request since launch, with its completion if one was written. Newest first. With an earlier
 * state, only blocks after its lastBlock (less RESCAN) are read: new requests, and completions of requests still
 * open, are added to what was already known.
 */
export async function loadTaggedRequests(prev: ScanState | null = null, opts: Omit<ScanOptions, "from" | "to"> = {}): Promise<ScanState> {
  const from = prev ? (prev.lastBlock - RESCAN + 1n > LAUNCH_BLOCK ? prev.lastBlock - RESCAN + 1n : LAUNCH_BLOCK) : LAUNCH_BLOCK;
  const { logs, head } = await getIntakeLogs([TOPIC_REQUESTED], { ...opts, from });
  const found = logs.map(decodeRequested).filter((r): r is TaggedRequest => r !== null);
  const byId = new Map<string, TaggedRequest>();
  for (const r of prev?.requests ?? []) if (r.blockNumber < from) byId.set(r.requestId.toLowerCase(), r);
  for (const r of found) byId.set(r.requestId.toLowerCase(), r);
  const requests = [...byId.values()];
  const completions = new Map(prev?.completions ?? []);
  const open = requests.filter((r) => !completions.has(r.requestId.toLowerCase())).map((r) => r.requestId);
  for (let i = 0; i < open.length; i += 50) {
    const done = await getIntakeLogs([TOPIC_COMPLETED, open.slice(i, i + 50)], { ...opts, from, to: head });
    for (const l of done.logs) {
      const c = decodeCompleted(l);
      if (c) completions.set(c.requestId.toLowerCase(), c);
    }
  }
  requests.sort((a, b) => (a.blockNumber === b.blockNumber ? 0 : a.blockNumber > b.blockNumber ? -1 : 1));
  return { lastBlock: head, requests, completions };
}

/* ---------- The scan state as stored (bigints as strings) ---------- */

type Stored<T> = { [K in keyof T]: T[K] extends bigint ? string : T[K] };
export interface StoredScan {
  v: 1;
  intake: string;
  lastBlock: string;
  requests: Stored<TaggedRequest>[];
  completions: Stored<Completion>[];
}

export function toStored(s: ScanState): StoredScan {
  return {
    v: 1,
    intake: INTAKE.toLowerCase(),
    lastBlock: s.lastBlock.toString(),
    requests: s.requests.map((r) => ({ ...r, amount: r.amount.toString(), blockNumber: r.blockNumber.toString() })),
    completions: [...s.completions.values()].map((c) => ({ ...c, blockNumber: c.blockNumber.toString() })),
  };
}

/** The stored state, or null when it is missing, for another Intake, or not readable. */
export function fromStored(v: unknown): ScanState | null {
  try {
    const s = v as StoredScan;
    if (!s || s.v !== 1 || s.intake !== INTAKE.toLowerCase() || !Array.isArray(s.requests) || !Array.isArray(s.completions)) return null;
    return {
      lastBlock: BigInt(s.lastBlock),
      // A request stored before subjects were registrable domains keeps the id it was read with (app.uniswap.org):
      // canonicalise it here, before grouping or an incremental refresh, so it joins its record (uniswap.org).
      requests: s.requests.map((r) => ({ ...r, subject: typeof r.subject === "string" ? canonicalId(r.subject) : r.subject, amount: BigInt(r.amount), blockNumber: BigInt(r.blockNumber) })),
      completions: new Map(s.completions.map((c) => [c.requestId.toLowerCase(), { ...c, blockNumber: BigInt(c.blockNumber) }] as const)),
    };
  } catch {
    return null;
  }
}

export function stateOf(c: Completion | undefined): "pending" | "completed" | "refused" | "failed" {
  if (!c) return "pending";
  return c.status === 0 ? "completed" : c.status === 1 ? "refused" : "failed";
}

/** Orders completions: negative when a completed before b. */
export function completedBefore(a: Completion, b: Completion): number {
  if (a.blockNumber !== b.blockNumber) return a.blockNumber < b.blockNumber ? -1 : 1;
  return a.logIndex - b.logIndex;
}
