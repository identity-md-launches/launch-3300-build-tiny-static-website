/**
 * Every tagged request, followed to completion from the Intake's events and IMD's public read routes.
 *
 * Loading: the last block scanned and the requests found are kept in IndexedDB. A return visit shows them at once
 * and then scans only newer blocks. Result files (page, lines, edit, logo) are read for the subject whose page is
 * open, and by readSubject, which the home list uses to take a digest of each subject it has none for (digest.ts).
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { getEnsName } from "wagmi/actions";
import type { Hex } from "viem";
import { fromStored, loadTaggedRequests, stateOf, getBlockTime, toStored, type Completion, type ScanState, type TaggedRequest } from "./chain";
import { dropOldFileCache, kvGet, kvSet } from "./store";
import { cacheGet, cacheSet, fetchLogo, fetchOracle, fetchResearchPage, getIntakeEntry, oracleIdFrom, refusalOf, type OracleRead, type Refusal } from "./api";
import { ACTIONS } from "./config";
import { parseChanges, parseEdit, parseLines, parsePage, rejectionOf, type ChangesResult, type EditResult, type Page, type SourceLines } from "./page";
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
  /** A completed changes job's changes.json, hash-checked and parsed. */
  changes?: ChangesResult | null;
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
  /** The logo file's SHA-256, for the home digest. */
  logoHash?: string | null;
  /**
   * True when this request's result files were read (or it has none to read). The home list follows every request
   * without its files; only the open subject's requests are read in full. Undefined counts as read.
   */
  filesRead?: boolean;
}

export const isSourceJob = (r: TaggedRequest) => r.action === ACTIONS.research && r.kind === "source";
export const isEditJob = (r: TaggedRequest) => r.action === ACTIONS.research && r.kind === "edit";
export const isChangesJob = (r: TaggedRequest) => r.action === ACTIONS.research && r.kind === "changes";
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

async function follow(req: TaggedRequest, completion: Completion | undefined, withFiles: boolean): Promise<Activity> {
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
  if (withFiles && req.action.startsWith("oracle.") && oracleId) {
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
  let changes: ChangesResult | null = null;
  let fileHash: string | null = null;
  let page: Page | null = null;
  let via: Activity["via"] = null;
  let rejected: string | null = null;
  let logo: string | null = null;
  let logoError: string | null = null;
  let logoHash: string | null = null;
  const hasFiles = (isSourceJob(req) || isEditJob(req) || isPageJob(req) || isChangesJob(req)) && state === "completed" && !!completion;
  if (hasFiles && withFiles && completion) {
    const name = isEditJob(req) ? "edit" : isPageJob(req) ? "page" : isChangesJob(req) ? "changes" : "lines";
    try {
      const f = await fetchResearchPage(req, completion, jobId, name);
      fileHash = f.hash ?? null;
      rejected = rejectionOf(f.text);
      if (rejected !== null) rejected ||= "The job found no single real project and gave no notes.";
      else if (name === "changes") {
        changes = parseChanges(f.text);
        sources = changes.data;
      } else if (name === "edit") {
        edit = parseEdit(f.text);
        sources = edit.data;
      } else if (name === "page") {
        page = parsePage(f.text, domainOfId(req.subject));
        via = { jobId: f.jobId, path: f.path };
        // The logo file is shown only when the page says where it came from (page.logo). A job that found no
        // icon still writes a placeholder PNG to satisfy the declared output, and leaves page.logo out.
        if (page.logo) try {
          const l = await fetchLogo(req, completion, f.jobId ?? jobId);
          logo = l.url;
          logoHash = l.hash;
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
  // A completed panel request's answer is read like a result file: the out-of-date count needs it.
  const hasAnswer = req.action.startsWith("oracle.") && state === "completed" && !!oracleId;
  return { req, completion, state, time, ens, jobId, oracle, refusal, sources, sourcesError, edit, changes, fileHash, page, via, rejected, doneTime, logo, logoError, logoHash, filesRead: !(hasFiles || hasAnswer) || withFiles };
}

const SCAN_KEY = "intake";

export interface ActivityState {
  items: Activity[] | null;
  error: string | null;
  loading: boolean;
  /** A public RPC failed or limited a range and the scan moved on to the next one: "Still reading the chain". */
  retrying: boolean;
  /** True while the items shown come from the browser's cache and the scan for newer blocks has not ended. */
  cached: boolean;
  reload: () => Promise<void>;
  /**
   * Reads one subject's result files (page, lines, edit, changes and the logo) without opening its page, and returns
   * its requests. What is read is kept, so opening the subject later does not read it again.
   */
  readSubject: (id: string) => Promise<Activity[]>;
}

/** `subject`: the subject whose page is open; its requests are read with their result files. */
export function useActivity(subject: string | null = null): ActivityState {
  const [items, setItems] = useState<Activity[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const [cached, setCached] = useState(false);
  const timer = useRef<number | undefined>(undefined);
  const retry = useRef<number | undefined>(undefined);
  const scan = useRef<ScanState | null>(null);
  const open = useRef<string | null>(subject);
  open.current = subject;
  // Finished requests are followed once per mode; a request still open is followed again on each read.
  const memo = useRef(new Map<string, Promise<Activity>>());
  const followed = useCallback((r: TaggedRequest, c: Completion | undefined, withFiles: boolean) => {
    const state = stateOf(c);
    const key = `${r.requestId}|${state}|${withFiles}`;
    if (state === "pending") return follow(r, c, withFiles);
    let p = memo.current.get(key);
    if (!p) {
      p = follow(r, c, withFiles);
      p.catch(() => memo.current.delete(key));
      memo.current.set(key, p);
    }
    return p;
  }, []);

  const build = useCallback(async () => {
    const s = scan.current;
    if (!s) return;
    const sub = open.current;
    const out = await Promise.all(s.requests.map((r) => followed(r, s.completions.get(r.requestId.toLowerCase()), r.subject === sub)));
    if (scan.current === s && open.current === sub) setItems(out);
  }, [followed]);

  const load = useCallback(async () => {
    setLoading(true);
    window.clearTimeout(retry.current);
    try {
      if (!scan.current) {
        dropOldFileCache();
        const stored = fromStored(await kvGet("scan", SCAN_KEY));
        if (stored) {
          scan.current = stored;
          setCached(true);
          await build();
        }
      }
      const next = await loadTaggedRequests(scan.current, { onRetry: () => setRetrying(true) });
      scan.current = next;
      await kvSet("scan", SCAN_KEY, toStored(next));
      await build();
      setError(null);
      setCached(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "The chain could not be read");
      // Never an empty page: with nothing read yet, "Still reading the chain" stays up and the scan tries again.
      if (!scan.current) retry.current = window.setTimeout(() => void load(), 20_000);
    } finally {
      setLoading(false);
      setRetrying(false);
    }
  }, [build]);

  useEffect(() => {
    void load();
    return () => window.clearTimeout(retry.current);
  }, [load]);

  // Opening a subject reads its result files; going back home keeps what was read.
  useEffect(() => {
    void build();
  }, [subject, build]);

  // Follow open requests: poll every 30 seconds while anything is pending.
  useEffect(() => {
    window.clearTimeout(timer.current);
    const pending = (items ?? []).some((a) => a.state === "pending") || sentTxs().some((t) => Date.now() - t.at < 3_600_000);
    if (pending) timer.current = window.setTimeout(() => void load(), 30_000);
    return () => window.clearTimeout(timer.current);
  }, [items, load]);

  const readSubject = useCallback(
    async (id: string) => {
      const s = scan.current;
      if (!s) return [];
      const research = (r: TaggedRequest) => isPageJob(r) || isSourceJob(r) || isEditJob(r) || isChangesJob(r) || r.action.startsWith("oracle.");
      return Promise.all(s.requests.filter((r) => r.subject === id).map((r) => followed(r, s.completions.get(r.requestId.toLowerCase()), research(r))));
    },
    [followed],
  );

  return { items, error, loading, retrying, cached, reload: load, readSubject };
}
