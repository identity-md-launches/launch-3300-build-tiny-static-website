/** Reads results from IMD's public, browser-open routes, with an IPFS fallback and a localStorage cache. */
import { keccak256, type Hex } from "viem";
import { API, IPFS_GATEWAYS } from "./config";
import type { Completion, TaggedRequest } from "./chain";

const CACHE_PREFIX = "imd-record:v1:";

export function cacheGet<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(CACHE_PREFIX + key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

export function cacheSet(key: string, value: unknown) {
  try {
    localStorage.setItem(CACHE_PREFIX + key, JSON.stringify(value));
  } catch {
    /* storage full or blocked: render without it */
  }
}

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url} answered ${res.status}`);
  return (await res.json()) as T;
}

/** What the plane knows about a request, by transaction hash: GET /intake/1/:transactionHash (CORS open). */
export interface IntakeEntry {
  requestId: string;
  state?: string;
  reason?: string | null;
  detail?: string | null;
  admission?: { result?: { kind?: string; jobId?: string; requestId?: string } } | null;
  completion?: { status?: number; uri?: string; resultHash?: string } | null;
}

export async function getIntakeEntry(r: TaggedRequest): Promise<IntakeEntry | null> {
  try {
    const j = await getJson<{ entries?: IntakeEntry[] }>(`${API}/intake/1/${r.transactionHash}`);
    return j.entries?.find((e) => e.requestId?.toLowerCase() === r.requestId.toLowerCase()) ?? null;
  } catch {
    return null;
  }
}

export async function sha256Hex(bytes: ArrayBuffer): Promise<string> {
  const d = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

interface ResultFile {
  name: string;
  hash: string;
  url?: string;
}
interface JobResult {
  jobId?: string;
  files?: ResultFile[];
}

/** Downloads the named file and checks its bytes against the listed SHA-256 before anyone parses them. */
async function fetchVerified(file: ResultFile): Promise<string> {
  if (!/^[0-9a-f]{64}$/.test(file.hash)) throw new Error("The listed hash is not 64 hex characters");
  const res = await fetch(`${API}/artifacts/${file.hash}`);
  if (!res.ok) throw new Error(`artifact answered ${res.status}`);
  const bytes = await res.arrayBuffer();
  const got = await sha256Hex(bytes);
  if (got !== file.hash) throw new Error("The downloaded bytes do not match the listed hash");
  return new TextDecoder().decode(bytes);
}

/** Reason and detail of a refused or failed request, as plain text from GET /intake/1/:transactionHash. */
export interface Refusal {
  reason: string;
  detail: string;
}
export function refusalOf(entry: IntakeEntry | null): Refusal | null {
  if (!entry) return null;
  const clean = (s: unknown) => (typeof s === "string" ? s.replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, 400) : "");
  const reason = clean(entry.reason);
  const detail = clean(entry.detail).replace(/^:\s*/, "");
  return reason || detail ? { reason, detail } : null;
}

export interface PageFetch {
  text: string;
  jobId: string | null;
  path: "api" | "ipfs";
}

/**
 * One named output file of a completed job request ("page" for research, "lines" for sources).
 * Primary: jobId from GET /intake/1/:tx, then GET /jobs/:id/result, the file named "page", GET /artifacts/{hash}.
 * Fallback: the completion's uri (ipfs://CID/result.json) through a gateway, checked against resultHash.
 */
export async function fetchResearchPage(r: TaggedRequest, c: Completion, jobIdHint: string | null, fileName = "page"): Promise<PageFetch> {
  const key = `${fileName}:${r.requestId}`;
  const cached = cacheGet<PageFetch>(key);
  if (cached) return cached;
  let firstError: unknown = null;
  if (jobIdHint) {
    try {
      const result = await getJson<JobResult>(`${API}/jobs/${jobIdHint}/result`);
      const file = result.files?.find((f) => f.name === fileName);
      if (!file) throw new Error(`The job result has no file named "${fileName}"`);
      const out: PageFetch = { text: await fetchVerified(file), jobId: jobIdHint, path: "api" };
      cacheSet(key, out);
      return out;
    } catch (e) {
      firstError = e;
    }
  }
  const m = /^ipfs:\/\/([A-Za-z0-9]+)\/result\.json$/.exec(c.uri);
  if (m) {
    for (const gw of IPFS_GATEWAYS) {
      try {
        const res = await fetch(`${gw}${m[1]}/result.json`);
        if (!res.ok) continue;
        const bytes = new Uint8Array(await res.arrayBuffer());
        if (keccak256(bytes).toLowerCase() !== c.resultHash.toLowerCase()) continue;
        const result = JSON.parse(new TextDecoder().decode(bytes)) as JobResult;
        const file = result.files?.find((f) => f.name === fileName);
        if (!file) continue;
        const out: PageFetch = { text: await fetchVerified(file), jobId: result.jobId ?? jobIdHint, path: "ipfs" };
        cacheSet(key, out);
        return out;
      } catch (e) {
        firstError ??= e;
      }
    }
  }
  throw firstError instanceof Error ? firstError : new Error("The page could not be read");
}

export interface OracleRead {
  id: string;
  status: string;
  answer: string | null;
  agreed: number | null;
  panelSize: number | null;
  jobId: string | null;
}

export function normalizeAnswer(a: unknown): string | null {
  if (a === true || a === "true" || a === 1 || a === "1") return "true";
  if (a === false || a === "false" || a === 0 || a === "0") return "false";
  if (a === null || a === undefined) return null;
  return String(a);
}

/** Oracle id from the intake route, or from the completion uri written on chain. */
export function oracleIdFrom(entry: IntakeEntry | null, c: Completion | undefined): string | null {
  const fromEntry = entry?.admission?.result?.kind === "oracle" ? entry.admission.result.requestId : undefined;
  if (fromEntry) return fromEntry;
  const m = c?.uri && /oracle\/requests\/([0-9a-f-]{36})/i.exec(c.uri);
  return m ? m[1]! : null;
}

/** GET /oracle/requests/:id, a CORS-open oracle read route: status, agreement and panel size. */
export async function fetchOracle(id: string, final: boolean): Promise<OracleRead> {
  const cached = cacheGet<OracleRead>(`oracle:${id}`);
  if (cached && final) return cached;
  const j = await getJson<{
    id: string;
    status: string;
    panelSize?: number;
    jobId?: string;
    agreement?: { agreed?: number; answer?: unknown } | null;
  }>(`${API}/oracle/requests/${id}?members=0`);
  const out: OracleRead = {
    id: j.id,
    status: j.status,
    answer: normalizeAnswer(j.agreement?.answer),
    agreed: typeof j.agreement?.agreed === "number" ? j.agreement.agreed : null,
    panelSize: typeof j.panelSize === "number" ? j.panelSize : null,
    jobId: j.jobId ?? null,
  };
  if (final) cacheSet(`oracle:${id}`, out);
  return out;
}

export const asHex = (s: string) => s as Hex;
