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

/** The eight bytes every PNG file starts with. */
const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
export const MAX_LOGO_BYTES = 512 * 1024;

/** True when the bytes are a PNG: its signature, then an IHDR chunk. Any other format is refused. */
export function isPng(b: Uint8Array): boolean {
  if (b.length < 24 || b.length > MAX_LOGO_BYTES) return false;
  if (!PNG_SIGNATURE.every((x, i) => b[i] === x)) return false;
  return String.fromCharCode(b[12]!, b[13]!, b[14]!, b[15]!) === "IHDR";
}

/** Width and height from a PNG's IHDR chunk. */
export function pngSize(b: Uint8Array): { width: number; height: number } {
  const v = new DataView(b.buffer, b.byteOffset, b.byteLength);
  return { width: v.getUint32(16), height: v.getUint32(20) };
}

/** A data: URL of checked PNG bytes. The image is never loaded from the project's server or any other site. */
export function pngDataUrl(b: Uint8Array): string {
  let s = "";
  for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000));
  return `data:image/png;base64,${btoa(s)}`;
}

const resultMemo = new Map<string, Promise<{ files: ResultFile[] }>>();

/** The completed job's result listing (its named files and their SHA-256), from api.imd.fun or the completion's IPFS uri. */
function jobResult(r: TaggedRequest, c: Completion, jobIdHint: string | null): Promise<{ files: ResultFile[] }> {
  const key = r.requestId;
  const hit = resultMemo.get(key);
  if (hit) return hit;
  const p = (async () => {
    let firstError: unknown = null;
    if (jobIdHint) {
      try {
        const result = await getJson<JobResult>(`${API}/jobs/${jobIdHint}/result`);
        return { files: result.files ?? [] };
      } catch (e) {
        firstError = e;
      }
    }
    const m = /^ipfs:\/\/([A-Za-z0-9]+)\/result\.json$/.exec(c.uri);
    if (m)
      for (const gw of IPFS_GATEWAYS) {
        try {
          const res = await fetch(`${gw}${m[1]}/result.json`);
          if (!res.ok) continue;
          const bytes = new Uint8Array(await res.arrayBuffer());
          if (keccak256(bytes).toLowerCase() !== c.resultHash.toLowerCase()) continue;
          return { files: (JSON.parse(new TextDecoder().decode(bytes)) as JobResult).files ?? [] };
        } catch (e) {
          firstError ??= e;
        }
      }
    throw firstError instanceof Error ? firstError : new Error("The job result could not be read");
  })();
  p.catch(() => resultMemo.delete(key));
  resultMemo.set(key, p);
  return p;
}

/**
 * The subject's logo from a completed page job: the result file named "logo", downloaded from
 * api.imd.fun/artifacts/<hash>, its bytes checked against the listed SHA-256, and accepted only as a PNG.
 * Null when the job wrote no logo; throws when one is listed but fails a check.
 */
export async function fetchLogo(r: TaggedRequest, c: Completion, jobIdHint: string | null): Promise<string | null> {
  const key = `logo:${r.requestId}`;
  const cached = cacheGet<{ url: string | null }>(key);
  if (cached) return cached.url;
  const { files } = await jobResult(r, c, jobIdHint);
  const file = files.find((f) => f.name === "logo");
  let url: string | null = null;
  if (file) {
    if (!/^[0-9a-f]{64}$/.test(file.hash)) throw new Error("The logo's listed hash is not 64 hex characters");
    const res = await fetch(`${API}/artifacts/${file.hash}`);
    if (!res.ok) throw new Error(`logo artifact answered ${res.status}`);
    const buf = await res.arrayBuffer();
    if ((await sha256Hex(buf)) !== file.hash) throw new Error("The logo's bytes do not match the listed hash");
    const bytes = new Uint8Array(buf);
    if (!isPng(bytes)) throw new Error("The logo is not a PNG file");
    url = pngDataUrl(bytes);
  }
  cacheSet(key, { url });
  return url;
}

/** One artifact by its SHA-256, checked and cached: the files a rebuild was given. */
export async function fetchArtifact(hash: string): Promise<string> {
  const key = `artifact:${hash}`;
  const cached = cacheGet<string>(key);
  if (cached) return cached;
  const text = await fetchVerified({ name: "", hash });
  cacheSet(key, text);
  return text;
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
  /** SHA-256 of the file's bytes: its artifact id at api.imd.fun/artifacts/<hash>. */
  hash?: string;
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
  if (cached) {
    if (!cached.hash) cached.hash = await sha256Hex(new TextEncoder().encode(cached.text).buffer as ArrayBuffer);
    return cached;
  }
  let firstError: unknown = null;
  if (jobIdHint) {
    try {
      const result = await getJson<JobResult>(`${API}/jobs/${jobIdHint}/result`);
      const file = result.files?.find((f) => f.name === fileName);
      if (!file) throw new Error(`The job result has no file named "${fileName}"`);
      const out: PageFetch = { text: await fetchVerified(file), hash: file.hash, jobId: jobIdHint, path: "api" };
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
        const out: PageFetch = { text: await fetchVerified(file), hash: file.hash, jobId: result.jobId ?? jobIdHint, path: "ipfs" };
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
