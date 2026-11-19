/** Reads the Intake's events from public RPCs, with no wallet. */
import { decodeAbiParameters, hexToString, trim, type Hex } from "viem";
import { INTAKE, LAUNCH_BLOCK, RPCS, TAG_NEEDLE, TOPIC_COMPLETED, TOPIC_REQUESTED } from "./config";

export interface RawLog {
  topics: Hex[];
  data: Hex;
  blockNumber: Hex;
  transactionHash: Hex;
  logIndex: Hex;
}

let rpcId = 0;
async function rpc<T>(url: string, method: string, params: unknown[]): Promise<T> {
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

/** Logs on the Intake from the launch block to the head, chunked to each RPC's range, trying the next RPC on error. */
export async function getIntakeLogs(topics: (Hex | Hex[] | null)[], from: bigint = LAUNCH_BLOCK): Promise<RawLog[]> {
  let lastError: unknown;
  for (const { url, span } of RPCS) {
    try {
      const head = BigInt(await rpc<Hex>(url, "eth_blockNumber", []));
      const out: RawLog[] = [];
      for (let start = from; start <= head; start += span) {
        const end = start + span - 1n < head ? start + span - 1n : head;
        const logs = await rpc<RawLog[]>(url, "eth_getLogs", [
          { address: INTAKE, topics, fromBlock: hex(start), toBlock: hex(end) },
        ]);
        out.push(...logs);
      }
      return out;
    } catch (e) {
      lastError = e;
    }
  }
  throw lastError instanceof Error ? lastError : new Error("No public RPC answered");
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
  amount: bigint;
  blockNumber: bigint;
  transactionHash: Hex;
}

/** Decodes one Requested log; returns null when it does not carry this site's tag. */
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
  if (!text.includes(TAG_NEEDLE)) return null;
  let bodyJson: Record<string, unknown> | null = null;
  try {
    const parsed = JSON.parse(text);
    if (parsed && typeof parsed === "object") bodyJson = parsed as Record<string, unknown>;
  } catch {
    bodyJson = null;
  }
  const tag = (bodyJson?.tag ?? {}) as { kind?: unknown };
  return {
    requestId: log.topics[1]!,
    payer: `0x${log.topics[2]!.slice(26)}` as Hex,
    action: hexToString(trim(log.topics[3]!, { dir: "right" })),
    body: text,
    bodyJson,
    kind: typeof tag.kind === "string" ? tag.kind : "unknown",
    amount,
    blockNumber: BigInt(log.blockNumber),
    transactionHash: log.transactionHash,
  };
}

export interface Completion {
  requestId: Hex;
  status: number;
  resultHash: Hex;
  reason: string;
  uri: string;
  transactionHash: Hex;
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
  return { requestId: log.topics[1]!, status, resultHash, reason, uri, transactionHash: log.transactionHash };
}

/** Every tagged request since launch, with its completion if one was written. Newest first. */
export async function loadTaggedRequests(): Promise<{ requests: TaggedRequest[]; completions: Map<string, Completion> }> {
  const logs = await getIntakeLogs([TOPIC_REQUESTED]);
  const requests = logs.map(decodeRequested).filter((r): r is TaggedRequest => r !== null);
  const completions = new Map<string, Completion>();
  if (requests.length) {
    const ids = requests.map((r) => r.requestId);
    for (let i = 0; i < ids.length; i += 50) {
      const done = await getIntakeLogs([TOPIC_COMPLETED, ids.slice(i, i + 50)]);
      for (const l of done) {
        const c = decodeCompleted(l);
        if (c) completions.set(c.requestId.toLowerCase(), c);
      }
    }
  }
  requests.sort((a, b) => (a.blockNumber === b.blockNumber ? 0 : a.blockNumber > b.blockNumber ? -1 : 1));
  return { requests, completions };
}

export function stateOf(c: Completion | undefined): "pending" | "completed" | "refused" | "failed" {
  if (!c) return "pending";
  return c.status === 0 ? "completed" : c.status === 1 ? "refused" : "failed";
}
