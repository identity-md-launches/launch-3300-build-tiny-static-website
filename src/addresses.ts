/**
 * A permanent address for every line (this revision's rule B): the job whose result first wrote the line, plus its
 * id in that result — "<job id>:<line id>". It never changes.
 *
 * A rebuild keeps the address of a line it carries over: the earlier line's own origin when that line has one, else
 * that earlier file's address (F2) with the line's id. A merged line keeps the oldest origin and lists the others in
 * also. Pages built before that rule carry only `from` (F1:L3): the site follows those from file to file back to the
 * first one and turns that file's address into the job that produced it.
 */
import { parsePrior } from "./bodies";
import type { Activity } from "./useActivity";

export interface LineAddress {
  /** The explorer job whose result first wrote the line, when it is known. */
  jobId: string | null;
  /** The line's id in that result. */
  lineId: string;
  /** The transaction that sent the job, for a job id that is not known. */
  tx: string;
}

export interface Origin extends LineAddress {
  /** Other origins of a merged line, oldest first. */
  also: LineAddress[];
}

/** "56eda474-deca-4a95-90bc-8d0192cc0cc7:L3", or the job id alone in a prior. */
const JOB_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const FILE_REF = /^\s*F(\d+):(\S+)\s*$/i;
const JOB_REF = /^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}):(\S+)$/i;

/** An address as the site writes it: "<job id>:<line id>". */
export const addressText = (a: { jobId: string | null; lineId: string }) => (a.jobId ? `${a.jobId}:${a.lineId}` : a.lineId);

/** The 8-character form shown on the page. */
export const shortJobId = (id: string | null) => (id ? id.slice(0, 8) : "");

interface LineLike {
  id: string;
  from?: string[];
  origin?: string;
  also?: string[];
}

/** A result's lines by their id in that file (never prefixed: references inside a file name local ids). */
function localLines(a: Activity): Map<string, LineLike> {
  const out = new Map<string, LineLike>();
  const lines: LineLike[] = a.page?.lines ?? a.changes?.data.lines ?? a.sources?.lines ?? a.edit?.data.lines ?? [];
  for (const l of lines) if (l.id) out.set(l.id, l);
  return out;
}

const ARTIFACT_REF = /^(?:https:\/\/api\.imd\.fun\/artifacts\/)?([0-9a-f]{64}):(\S+)$/i;
type Timed = Origin & { t: number };
const plain = ({ jobId, lineId, tx }: LineAddress): LineAddress => ({ jobId, lineId, tx });
const same = (x: LineAddress, y: LineAddress) => addressText(x).toLowerCase() === addressText(y).toLowerCase() && (x.jobId !== null || x.tx === y.tx);

/**
 * Every record line shown now, with its permanent address: page lines by their id, the lines of a sources, edit or
 * changes job as "<request id>:<id>" (the prefix is the record's own key, added only here).
 */
export function originsOf(items: Activity[], latest: Activity | undefined): Map<string, Origin> {
  const out = new Map<string, Origin>();
  const byHash = new Map<string, Activity>();
  for (const a of items) if (a.fileHash) byHash.set(a.fileHash, a);
  const byJob = new Map<string, Activity>();
  for (const a of items) if (a.jobId) byJob.set(a.jobId.toLowerCase(), a);
  const cache = new Map<string, Timed | null>();
  const timeOf = (a: Activity) => a.doneTime ?? a.time ?? Number(a.req.blockNumber);

  /** The address of line `id` in the result file `a` produced, following its origin or from refs back. */
  const inFile = (a: Activity, id: string, seen: Set<string>): Timed | null => {
    const key = `${a.req.requestId}|${id}`;
    if (cache.has(key)) return cache.get(key)!;
    if (seen.has(key)) return null;
    seen.add(key);
    const line = localLines(a).get(id);
    let found: Timed | null = null;
    if (line) {
      const refs = [...(line.origin ? [line.origin] : line.from ?? []), ...(line.also ?? [])];
      const all = refs.map((r) => resolveRef(a, r, new Set(seen))).filter((x): x is Timed => !!x);
      // A merged line keeps the oldest origin and lists the others (and theirs) in also.
      const sorted = [...all].sort((x, y) => x.t - y.t);
      const first = sorted[0] ?? { jobId: a.jobId, lineId: line.id, tx: a.req.transactionHash, also: [], t: timeOf(a) };
      const also: LineAddress[] = [];
      for (const o of [...sorted.slice(1), ...sorted.flatMap((x) => x.also.map((y) => ({ ...y, also: [], t: 0 })))]) {
        if (!same(o, first) && !also.some((x) => same(x, o))) also.push(plain(o));
      }
      for (const o of first.also) if (!same(o, first) && !also.some((x) => same(x, o))) also.push(plain(o));
      found = { ...plain(first), also, t: first.t };
    }
    cache.set(key, found);
    return found;
  };

  /** A ref inside the file `a` produced: F<n>:<id> of its own <PRIOR>, a file or job address, or a bare id. */
  const resolveRef = (a: Activity, ref: string, seen: Set<string>): Timed | null => {
    const r = ref.trim();
    const j = JOB_REF.exec(r);
    if (j) {
      const job = byJob.get(j[1]!.toLowerCase());
      if (job && localLines(job).has(j[2]!)) return inFile(job, j[2]!, seen);
      return { jobId: j[1]!, lineId: j[2]!, tx: "", also: [], t: job ? timeOf(job) : 0 };
    }
    const f = ARTIFACT_REF.exec(r);
    if (f) {
      const target = byHash.get(f[1]!.toLowerCase());
      return target ? inFile(target, f[2]!, seen) : null;
    }
    const m = FILE_REF.exec(r);
    if (m) {
      const file = parsePrior(a.req.bodyJson?.objective).files.find((x) => x.n === Number(m[1]));
      const target = file?.hash ? byHash.get(file.hash) : undefined;
      return target ? inFile(target, m[2]!, seen) : null;
    }
    // A bare id names a line of this same file.
    return r !== "" && localLines(a).has(r) && !seen.has(`${a.req.requestId}|${r}`) ? inFile(a, r, seen) : null;
  };

  const strip = (o: Timed): Origin => ({ jobId: o.jobId, lineId: o.lineId, tx: o.tx, also: o.also });
  if (latest) for (const l of latest.page?.lines ?? []) {
    if (!l.id) continue;
    const o = inFile(latest, l.id, new Set());
    if (o) out.set(l.id, strip(o));
  }
  // The lines of results not folded in join the record under "<request id>:<id>".
  for (const a of items) {
    if (a === latest || !a.fileHash || (!a.changes && !a.sources && !a.edit)) continue;
    for (const id of localLines(a).keys()) {
      const o = inFile(a, id, new Set());
      if (o) out.set(`${a.req.requestId}:${id}`, strip(o));
    }
  }
  return out;
}

/** The record line an address opens: the line whose own origin it is, else a line that lists it in also. */
export function lineForAddress(origins: Map<string, Origin>, address: string): string | null {
  const want = address.trim().toLowerCase();
  if (!want) return null;
  for (const [id, o] of origins) {
    if (addressText(o).toLowerCase() === want) return id;
    if (o.also.some((x) => addressText(x).toLowerCase() === want)) return id;
  }
  // A changed line keeps its target's address in a from entry; the record may show it under the target's id.
  return null;
}
