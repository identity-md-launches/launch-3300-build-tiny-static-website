/** Every tagged request, followed to completion from the Intake's events and IMD's public read routes. */
import { useCallback, useEffect, useRef, useState } from "react";
import { getEnsName } from "wagmi/actions";
import type { Hex } from "viem";
import { loadTaggedRequests, stateOf, getBlockTime, type Completion, type TaggedRequest } from "./chain";
import { cacheGet, cacheSet, fetchOracle, getIntakeEntry, oracleIdFrom, type OracleRead } from "./api";
import { config } from "./wallet";

export interface Activity {
  req: TaggedRequest;
  completion?: Completion;
  state: "pending" | "completed" | "refused" | "failed";
  time: number | null;
  ens: string | null;
  jobId: string | null;
  oracle: OracleRead | null;
}

export interface SentTx {
  hash: Hex;
  kind: string;
  action: string;
  at: number;
}

export function sentTxs(): SentTx[] {
  return cacheGet<SentTx[]>("sent") ?? [];
}
export function rememberSent(t: SentTx) {
  cacheSet("sent", [t, ...sentTxs().filter((x) => x.hash !== t.hash)].slice(0, 20));
}

async function ensOf(addr: Hex): Promise<string | null> {
  const key = `ens:${addr.toLowerCase()}`;
  const c = cacheGet<{ name: string | null; at: number }>(key);
  if (c && Date.now() - c.at < 86_400_000) return c.name;
  try {
    const name = await getEnsName(config, { address: addr, chainId: 1 });
    cacheSet(key, { name: name ?? null, at: Date.now() });
    return name ?? null;
  } catch {
    return null;
  }
}

async function timeOf(r: TaggedRequest): Promise<number | null> {
  const key = `time:${r.blockNumber}`;
  const c = cacheGet<number>(key);
  if (c) return c;
  const t = await getBlockTime(`0x${r.blockNumber.toString(16)}` as Hex);
  if (t) cacheSet(key, t);
  return t;
}

async function follow(req: TaggedRequest, completion: Completion | undefined): Promise<Activity> {
  const state = stateOf(completion);
  const jobKey = `job:${req.requestId}`;
  let jobId = cacheGet<string>(jobKey);
  let oracleId: string | null = cacheGet<string>(`oid:${req.requestId}`);
  if (!jobId || (!oracleId && req.action.startsWith("oracle."))) {
    const entry = await getIntakeEntry(req);
    const r = entry?.admission?.result;
    if (r?.jobId) {
      jobId = r.jobId;
      cacheSet(jobKey, jobId);
    }
    oracleId = oracleIdFrom(entry, completion);
    if (oracleId) cacheSet(`oid:${req.requestId}`, oracleId);
  }
  let oracle: OracleRead | null = null;
  if (req.action.startsWith("oracle.") && oracleId) {
    try {
      oracle = await fetchOracle(oracleId, state !== "pending");
      jobId ??= oracle.jobId;
    } catch {
      oracle = null;
    }
  }
  const [time, ens] = await Promise.all([timeOf(req), ensOf(req.payer)]);
  return { req, completion, state, time, ens, jobId, oracle };
}

export function useActivity() {
  const [items, setItems] = useState<Activity[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const timer = useRef<number | undefined>(undefined);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { requests, completions } = await loadTaggedRequests();
      const out = await Promise.all(requests.map((r) => follow(r, completions.get(r.requestId.toLowerCase()))));
      setItems(out);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "The chain could not be read");
      setItems((prev) => prev ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Follow open requests: poll every 30 seconds while anything is pending.
  useEffect(() => {
    window.clearTimeout(timer.current);
    const pending = (items ?? []).some((a) => a.state === "pending") || sentTxs().some((t) => Date.now() - t.at < 3_600_000);
    if (pending) timer.current = window.setTimeout(() => void load(), 30_000);
    return () => window.clearTimeout(timer.current);
  }, [items, load]);

  return { items, error, loading, reload: load };
}
