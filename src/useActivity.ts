/** Every tagged request, followed to completion from the Intake's events and IMD's public read routes. */
import { useCallback, useEffect, useRef, useState } from "react";
import { getEnsName } from "wagmi/actions";
import type { Hex } from "viem";
import { loadTaggedRequests, stateOf, getBlockTime, type Completion, type TaggedRequest } from "./chain";
import { cacheGet, cacheSet, fetchLogo, fetchOracle, fetchResearchPage, getIntakeEntry, oracleIdFrom, refusalOf, type OracleRead, type Refusal } from "./api";
import { ACTIONS } from "./config";
import { parseEdit, parseLines, parsePage, rejectionOf, type EditResult, type Page, type SourceLines } from "./page";
import { config } from "./wallet";
import { domainOfId } from "./subject";

export interface Activity {
  req: TaggedRequest;
  completion?: Completion;
  state: "pending" | "completed" | "refused" | "failed";
  time: number | null;
  ens: string | null;
  jobId: string | null;
  oracle: OracleRead | null;
  /** Reason and detail from GET /intake/1/:tx, for refused or failed requests. */
  refusal: Refusal | null;
  /** A completed source job's lines.json, hash-checked and parsed. */
  sources: SourceLines | null;
  sourcesError: string | null;
  /** A completed edit job's edit.json, hash-checked and parsed. */
  edit: EditResult | null;
  /** SHA-256 of a completed page, sources or edit job's result file: its artifact id, for <PRIOR>. */
  fileHash: string | null;
  /** A completed page job's page.json, hash-checked and parsed. */
  page: Page | null;
  /** Where a page file was read: the job id and the route (api.imd.fun or an IPFS gateway). */
  via: { jobId: string | null; path: "api" | "ipfs" } | null;
  /**
   * Set when the result file says found: false: the job did not find one real project. Holds its notes. Such a
   * result is never shown as the page, never adds lines and never lists the subject on Home.
   */
  rejected: string | null;
  /** When the result was written: the completion's block time, or null while pending or unknown. */
  doneTime: number | null;
  /**
   * A completed page job's logo file as a data: URL: downloaded from api.imd.fun, checked against its listed
   * SHA-256 and accepted only as a PNG. Null when the job wrote none or it failed a check (see logoError).
   */
  logo?: string | null;
  logoError?: string | null;
}

export const isSourceJob = (r: TaggedRequest) => r.action === ACTIONS.research && r.kind === "source";
export const isEditJob = (r: TaggedRequest) => r.action === ACTIONS.research && r.kind === "edit";
export const isPageJob = (r: TaggedRequest) => r.action === ACTIONS.research && r.kind === "add";

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

async function timeOf(r: { blockNumber: bigint }): Promise<number | null> {
  const key = `time:${r.blockNumber}`;
  const c = cacheGet<number>(key);
  if (c) return c;
  const t = await getBlockTime(`0x${r.blockNumber.toString(16)}` as Hex);
  if (t) cacheSet(key, t);
  return t;
}

async function follow(req: TaggedRequest, completion: Completion | undefined): Promise<Activity> {
  const state = stateOf(completion);
  const final = state !== "pending";
  const jobKey = `job:${req.requestId}`;
  const whyKey = `why:${req.requestId}`;
  let jobId = cacheGet<string>(jobKey);
  let oracleId: string | null = cacheGet<string>(`oid:${req.requestId}`);
  let refusal: Refusal | null = cacheGet<Refusal>(whyKey);
  const needsWhy = (state === "refused" || state === "failed") && !refusal;
  if (needsWhy || !jobId || (!oracleId && req.action.startsWith("oracle."))) {
    const entry = await getIntakeEntry(req);
    const r = entry?.admission?.result;
    if (r?.jobId) {
      jobId = r.jobId;
      cacheSet(jobKey, jobId);
    }
    oracleId = oracleIdFrom(entry, completion);
    if (oracleId) cacheSet(`oid:${req.requestId}`, oracleId);
    if (state === "refused" || state === "failed") {
      refusal = refusalOf(entry);
      if (refusal && final) cacheSet(whyKey, refusal);
    }
  }
  let oracle: OracleRead | null = null;
  if (req.action.startsWith("oracle.") && oracleId) {
    try {
      oracle = await fetchOracle(oracleId, final);
      jobId ??= oracle.jobId;
    } catch {
      oracle = null;
    }
  }
  let sources: SourceLines | null = null;
  let sourcesError: string | null = null;
  let edit: EditResult | null = null;
  let fileHash: string | null = null;
  let page: Page | null = null;
  let via: Activity["via"] = null;
  let rejected: string | null = null;
  let logo: string | null = null;
  let logoError: string | null = null;
  if ((isSourceJob(req) || isEditJob(req) || isPageJob(req)) && state === "completed" && completion) {
    const name = isEditJob(req) ? "edit" : isPageJob(req) ? "page" : "lines";
    try {
      const f = await fetchResearchPage(req, completion, jobId, name);
      fileHash = f.hash ?? null;
      rejected = rejectionOf(f.text);
      if (rejected !== null) rejected ||= "The job found no single real project and gave no notes.";
      else if (name === "edit") {
        edit = parseEdit(f.text);
        sources = edit.data;
      } else if (name === "page") {
        page = parsePage(f.text, domainOfId(req.subject));
        via = { jobId: f.jobId, path: f.path };
        try {
          logo = await fetchLogo(req, completion, f.jobId ?? jobId);
        } catch (e) {
          logoError = e instanceof Error ? e.message : "The logo could not be read";
        }
      } else sources = parseLines(f.text);
      jobId ??= f.jobId;
    } catch (e) {
      sourcesError = e instanceof Error ? e.message : `The ${name} file could not be read`;
    }
  }
  const [time, ens, doneTime] = await Promise.all([timeOf(req), ensOf(req.payer), completion ? timeOf(completion) : Promise.resolve(null)]);
  return { req, completion, state, time, ens, jobId, oracle, refusal, sources, sourcesError, edit, fileHash, page, via, rejected, doneTime, logo, logoError };
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
