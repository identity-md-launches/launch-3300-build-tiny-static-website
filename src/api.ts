/**
 * Reads results from IMD's public, browser-open routes, with an IPFS fallback. Result files (pages, lines, edits,
 * artifacts, logos) are kept in IndexedDB (store.ts); only small values (job ids, times, names) use localStorage.
 */
import { keccak256, type Hex } from "viem";
import { API } from "./config";
import type { Completion, TaggedRequest } from "./chain";
import { kvGet, kvSet } from "./store";

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

/** The size limits a PNG is checked against: the logo keeps its own, a screenshot has others (SHOT_LIMITS). */
export interface PngLimits {
  maxBytes: number;
  maxWidth: number;
  maxHeight: number;
}
export const LOGO_LIMITS: PngLimits = { maxBytes: MAX_LOGO_BYTES, maxWidth: 4096, maxHeight: 4096 };
/** Every screenshot the rebuild instructions ask for is a PNG exactly this many pixels wide. */
export const SHOT_WIDTH = 1280;
/**
 * A screenshot: exactly 1280 wide (checked in shotOf), up to 32 MiB and 32,768 pixels tall, so a detailed or full-page
 * capture is read. The logo limits stay on the logo path.
 */
export const SHOT_LIMITS: PngLimits = { maxBytes: 32 * 1024 * 1024, maxWidth: SHOT_WIDTH, maxHeight: 32768 };

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(b: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < b.length; i++) c = CRC_TABLE[(c ^ b[i]!) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** A PNG's chunks, or null when the file is not a whole PNG: bad signature, a cut-off chunk or a wrong CRC. */
export function pngChunks(b: Uint8Array, maxBytes = MAX_LOGO_BYTES): { type: string; data: Uint8Array }[] | null {
  if (b.length < 8 + 25 + 12 || b.length > maxBytes) return null;
  if (!PNG_SIGNATURE.every((x, i) => b[i] === x)) return null;
  const v = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const out: { type: string; data: Uint8Array }[] = [];
  let at = 8;
  while (at < b.length) {
    if (at + 12 > b.length) return null;
    const len = v.getUint32(at);
    if (at + 12 + len > b.length) return null;
    const type = String.fromCharCode(...b.subarray(at + 4, at + 8));
    if (crc32(b.subarray(at + 4, at + 8 + len)) !== v.getUint32(at + 8 + len)) return null;
    out.push({ type, data: b.subarray(at + 8, at + 8 + len) });
    at += 12 + len;
    if (type === "IEND") break;
  }
  return out;
}

/**
 * True when the bytes are a whole PNG: its signature, IHDR first (13 bytes, non-zero size, a valid colour type and
 * depth), at least one IDAT, every chunk's CRC right, and IEND last with nothing after it. A truncated file, or
 * any other format, is refused. Whether the pixel data inflates is checked by pngDecodes.
 */
export function isPng(b: Uint8Array, limits: PngLimits = LOGO_LIMITS): boolean {
  const chunks = pngChunks(b, limits.maxBytes);
  if (!chunks || chunks[0]?.type !== "IHDR" || chunks[0].data.length !== 13 || chunks.at(-1)?.type !== "IEND") return false;
  const end = chunks.reduce((n, c) => n + 12 + c.data.length, 8);
  if (end !== b.length || !chunks.some((c) => c.type === "IDAT")) return false;
  const { width, height } = pngSize(b);
  const h = chunks[0].data;
  const depths: Record<number, number[]> = { 0: [1, 2, 4, 8, 16], 2: [8, 16], 3: [1, 2, 4, 8], 4: [8, 16], 6: [8, 16] };
  return width > 0 && height > 0 && width <= limits.maxWidth && height <= limits.maxHeight && (depths[h[9]!] ?? []).includes(h[8]!) && h[10] === 0 && h[11] === 0 && h[12]! <= 1;
}

const CHANNELS: Record<number, number> = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 };

/**
 * True when a PNG that passed isPng also decodes: in a browser, createImageBitmap must succeed with a non-zero
 * size; elsewhere its IDAT data must inflate (zlib) to exactly the bytes its size and format call for.
 */
export async function pngDecodes(b: Uint8Array, limits: PngLimits = LOGO_LIMITS): Promise<boolean> {
  if (!isPng(b, limits)) return false;
  try {
    if (typeof createImageBitmap === "function") {
      const bmp = await createImageBitmap(new Blob([b as Uint8Array<ArrayBuffer>], { type: "image/png" }));
      const ok = bmp.width > 0 && bmp.height > 0;
      bmp.close();
      return ok;
    }
    const chunks = pngChunks(b, limits.maxBytes)!;
    const idat = chunks.filter((c) => c.type === "IDAT");
    const joined = new Uint8Array(idat.reduce((n, c) => n + c.data.length, 0));
    let at = 0;
    for (const c of idat) {
      joined.set(c.data, at);
      at += c.data.length;
    }
    const inflated = new Uint8Array(await new Response(new Blob([joined]).stream().pipeThrough(new DecompressionStream("deflate"))).arrayBuffer());
    const h = chunks[0]!.data;
    if (h[12] === 1) return inflated.length > 0; // interlaced: the size check below is for one pass only
    const { width, height } = pngSize(b);
    const rowBytes = Math.ceil((width * h[8]! * CHANNELS[h[9]!]!) / 8);
    return inflated.length === height * (1 + rowBytes);
  } catch {
    return false;
  }
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

/** The completed job's result listing (its named files and their SHA-256), from api.imd.fun only. */
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
    // No public IPFS gateway is read on load (only this site, IMD's API and the public RPCs): an unread result stays
    // unread and is tried again through IMD's API on Refresh.
    void c;
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
export interface LogoRead {
  /** A data: URL of the checked PNG, or null when the job wrote none. */
  url: string | null;
  /** The logo file's SHA-256, which the home list's digest keeps. */
  hash: string | null;
}
export async function fetchLogo(r: TaggedRequest, c: Completion, jobIdHint: string | null): Promise<LogoRead> {
  return fetchPngFile(r, c, jobIdHint, "logo");
}

/** A PNG's pixel width from its IHDR chunk (bytes 16 to 19), or 0. */
export const pngWidth = (b: Uint8Array) => (b.length >= 24 ? ((b[16]! << 24) | (b[17]! << 16) | (b[18]! << 8) | b[19]!) >>> 0 : 0);

/** One screenshot slot as read: a checked PNG data: URL and its size, or url null for an empty slot. */
export interface ShotRead extends LogoRead {
  width?: number;
  height?: number;
}

/**
 * The screenshot rules on bytes whose hash already matched: a 1 by 1 PNG is the placeholder a job writes for a slot
 * it could not fill and reads as an empty slot; anything else must be a whole PNG exactly 1280 pixels wide that
 * decodes, within SHOT_LIMITS. Throws, saying why, for a file that breaks them (it is then not shown).
 */
export async function shotOf(bytes: Uint8Array, hash: string): Promise<ShotRead> {
  if (!isPng(bytes, { ...SHOT_LIMITS, maxWidth: Number.MAX_SAFE_INTEGER })) throw new Error("The screenshot is not a whole PNG file within 32 MiB and 32,768 pixels tall");
  const { width, height } = pngSize(bytes);
  if (width === 1 && height === 1) return { url: null, hash: null };
  if (width !== SHOT_WIDTH) throw new Error(`The screenshot is ${width} pixels wide, not ${SHOT_WIDTH}`);
  if (!(await pngDecodes(bytes, SHOT_LIMITS))) throw new Error("The screenshot's PNG data does not decode");
  return { url: pngDataUrl(bytes), hash, width, height };
}

/**
 * One screenshot slot of a completed page job: the result file named shot-<slot> from api.imd.fun, its bytes checked
 * against the listed SHA-256 and then by shotOf. Cached once read. Url null when the job wrote no such file or only
 * the placeholder; throws when the file fails a check.
 */
export async function fetchShot(r: TaggedRequest, c: Completion, jobIdHint: string | null, slot: number): Promise<ShotRead> {
  // "shot:v2": entries cached by the first reader (which took any width from 320) are never reused.
  const key = `shot:v2:${slot}:${r.requestId}`;
  const cached = await kvGet<ShotRead>("files", key);
  if (cached) return cached;
  const bytes = await fetchResultPng(r, c, jobIdHint, `shot-${slot}`, "screenshot", SHOT_LIMITS.maxBytes);
  const out = bytes ? await shotOf(bytes.bytes, bytes.hash) : { url: null, hash: null };
  await kvSet("files", key, out);
  return out;
}

/** A named result file's bytes, checked against its listed SHA-256; null when the job lists no such file. */
async function fetchResultPng(r: TaggedRequest, c: Completion, jobIdHint: string | null, name: string, what: string, maxBytes: number): Promise<{ bytes: Uint8Array; hash: string } | null> {
  const { files } = await jobResult(r, c, jobIdHint);
  const file = files.find((f) => f.name === name);
  if (!file) return null;
  if (!/^[0-9a-f]{64}$/.test(file.hash)) throw new Error(`The ${what}'s listed hash is not 64 hex characters`);
  const res = await fetch(`${API}/artifacts/${file.hash}`);
  if (!res.ok) throw new Error(`${name} artifact answered ${res.status}`);
  const buf = await res.arrayBuffer();
  if (buf.byteLength > maxBytes) throw new Error(`The ${what} is larger than ${Math.round(maxBytes / 1024)} KiB`);
  if ((await sha256Hex(buf)) !== file.hash) throw new Error(`The ${what}'s bytes do not match the listed hash`);
  return { bytes: new Uint8Array(buf), hash: file.hash };
}

/** The logo result file of a completed job, checked against its listed SHA-256 and the logo limits, and cached (see fetchLogo). */
async function fetchPngFile(r: TaggedRequest, c: Completion, jobIdHint: string | null, name: "logo"): Promise<LogoRead> {
  const key = `${name}:${r.requestId}`;
  const cached = await kvGet<LogoRead>("files", key);
  if (cached) return cached;
  const read = await fetchResultPng(r, c, jobIdHint, name, "logo", Number.MAX_SAFE_INTEGER);
  let url: string | null = null;
  if (read) {
    if (!isPng(read.bytes)) throw new Error("The logo is not a whole PNG file");
    if (!(await pngDecodes(read.bytes))) throw new Error("The logo's PNG data does not decode");
    url = pngDataUrl(read.bytes);
  }
  const out: LogoRead = { url, hash: read && url ? read.hash : null };
  await kvSet("files", key, out);
  return out;
}

/**
 * A logo by the SHA-256 a published or stored digest names: downloaded from api.imd.fun/artifacts/<hash>, its bytes
 * checked against that hash and the logo limits, and accepted only as a PNG that decodes. Home uses it for a project
 * whose logo this browser has not read yet. Throws, saying why, for a file that fails a check.
 */
export async function fetchLogoByHash(hash: string): Promise<string> {
  if (!/^[0-9a-f]{64}$/.test(hash)) throw new Error("The logo's hash is not 64 hex characters");
  const res = await fetch(`${API}/artifacts/${hash}`);
  if (!res.ok) throw new Error(`The logo artifact answered ${res.status}`);
  const buf = await res.arrayBuffer();
  if (buf.byteLength > MAX_LOGO_BYTES) throw new Error("The logo is larger than 512 KiB");
  if ((await sha256Hex(buf)) !== hash) throw new Error("The logo's bytes do not match its hash");
  const bytes = new Uint8Array(buf);
  if (!isPng(bytes)) throw new Error("The logo is not a whole PNG file");
  if (!(await pngDecodes(bytes))) throw new Error("The logo's PNG data does not decode");
  return pngDataUrl(bytes);
}

/** One artifact by its SHA-256, checked and cached: the files a rebuild was given. */
export async function fetchArtifact(hash: string): Promise<string> {
  const key = `artifact:${hash}`;
  const cached = await kvGet<string>("files", key);
  if (typeof cached === "string") return cached;
  const text = await fetchVerified({ name: "", hash });
  await kvSet("files", key, text);
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
 * No fallback to public IPFS gateways: the browser contacts only this site, IMD's API and the public RPCs on load.
 */
export async function fetchResearchPage(r: TaggedRequest, c: Completion, jobIdHint: string | null, fileName = "page"): Promise<PageFetch> {
  const key = `${fileName}:${r.requestId}`;
  const cached = await kvGet<PageFetch>("files", key);
  if (cached && typeof cached.text === "string") {
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
      await kvSet("files", key, out);
      return out;
    } catch (e) {
      firstError = e;
    }
  }
  // No public IPFS gateway is read on load: the page stays unread and is tried again through IMD's API on Refresh.
  void c;
  throw firstError instanceof Error ? firstError : new Error("The page could not be read");
}

/**
 * The SHA-256 a completed job's result lists for one named file, from GET /jobs/:id/result alone: no artifact byte is
 * read. The gate (counts.ts) checks a job's earlier results and channels with these hashes before its file is read.
 */
export async function fetchResultHash(r: TaggedRequest, jobId: string | null, fileName = "page"): Promise<string> {
  const key = `rh:${fileName}:${r.requestId}`;
  const cached = cacheGet<string>(key);
  if (cached) return cached;
  const done = await kvGet<PageFetch>("files", `${fileName}:${r.requestId}`);
  if (done?.hash) return done.hash;
  if (!jobId) throw new Error("The job of this request is not known yet");
  const result = await getJson<JobResult>(`${API}/jobs/${jobId}/result`);
  const file = result.files?.find((f) => f.name === fileName);
  if (!file?.hash || !/^[0-9a-f]{64}$/.test(file.hash)) throw new Error(`The job result has no file named "${fileName}"`);
  cacheSet(key, file.hash);
  return file.hash;
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
