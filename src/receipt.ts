/**
 * After the wallet returns a transaction hash: its receipt decides whether the request reached the Intake (a
 * reverted transaction never did), and the plane's admission by hash gives the job id the toast and the pending
 * line link to. Both are plain polls with injectable reads, so tests run them with fakes and a short interval.
 */
import { API, RPCS } from "./config";
import { rpc } from "./chain";

export type ReceiptStatus = "success" | "reverted";
type RawReceipt = { status?: string | null } | null;
export type ReceiptRead = (hash: string) => Promise<RawReceipt>;

/** A receipt's status field ("0x1" success, "0x0" reverted); null while the transaction is not included. */
export function receiptStatus(r: RawReceipt): ReceiptStatus | null {
  if (!r || typeof r !== "object") return null;
  const s = String(r.status ?? "").toLowerCase();
  if (s === "0x1" || s === "1" || s === "success") return "success";
  if (s === "0x0" || s === "0" || s === "reverted") return "reverted";
  return null;
}

/** The public RPC's eth_getTransactionReceipt, first answering endpoint. */
export const rpcReceipt: ReceiptRead = async (hash) => {
  for (const { url } of RPCS) {
    try {
      return await rpc<RawReceipt>(url, "eth_getTransactionReceipt", [hash]);
    } catch {
      /* next endpoint */
    }
  }
  return null;
};

/**
 * Polls every source (the connected wallet's own provider and the public RPC) until one returns an included
 * receipt, and resolves its status. A source that throws counts as "not yet". `stop()` returns true to give up
 * (the dialog closed); it then resolves null.
 */
export async function waitForReceipt(hash: string, reads: ReceiptRead[], opts: { interval?: number; stop?: () => boolean } = {}): Promise<ReceiptStatus | null> {
  const interval = opts.interval ?? 1500;
  for (;;) {
    if (opts.stop?.()) return null;
    const got = await Promise.all(reads.map((r) => r(hash).then(receiptStatus, () => null)));
    const s = got.find((x) => x !== null);
    if (s) return s;
    await new Promise((res) => setTimeout(res, interval));
  }
}

/** What the plane says about a transaction: its job id once admitted, or that it ended without one. */
export type Admission = { jobId: string | null; done: boolean };
export type AdmissionRead = (hash: string) => Promise<Admission>;

/** GET /intake/1/:transactionHash: the first entry's job id, or done when it was refused or failed. */
export const intakeAdmission: AdmissionRead = async (hash) => {
  const res = await fetch(`${API}/intake/1/${hash}`);
  if (!res.ok) return { jobId: null, done: false };
  const j = (await res.json()) as { entries?: { state?: string; admission?: { result?: { jobId?: string } } | null }[] };
  for (const e of j.entries ?? []) {
    const id = e.admission?.result?.jobId;
    if (typeof id === "string" && id) return { jobId: id, done: true };
  }
  const ended = (j.entries ?? []).some((e) => /refus|reject|fail/i.test(String(e.state ?? "")));
  return { jobId: null, done: ended };
};

/**
 * Looks up one sent transaction's job id until it is known or the request ended, calling `onJob` as soon as the
 * read returns it. Returns a cancel function. The first read runs at once; then every `interval` ms, up to `limit` reads.
 */
export function followAdmission(hash: string, onJob: (jobId: string) => void, opts: { read?: AdmissionRead; interval?: number; limit?: number } = {}): () => void {
  const read = opts.read ?? intakeAdmission;
  const interval = opts.interval ?? 1500;
  const limit = opts.limit ?? 400;
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let n = 0;
  const tick = async () => {
    if (stopped) return;
    n++;
    let a: Admission = { jobId: null, done: false };
    try {
      a = await read(hash);
    } catch {
      /* not yet */
    }
    if (stopped) return;
    if (a.jobId) {
      onJob(a.jobId);
      return;
    }
    if (a.done || n >= limit) return;
    timer = setTimeout(() => void tick(), interval);
  };
  void tick();
  return () => {
    stopped = true;
    if (timer) clearTimeout(timer);
  };
}
