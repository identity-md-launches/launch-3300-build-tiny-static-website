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

/** The lines of a completed result by the id the record shows: page lines keep theirs, a job's lines are prefixed. */
function linesOf(a: Activity): Map<string, LineLike> {
  const out = new Map<string, LineLike>();
  if (a.page) for (const l of a.page.lines) if (l.id) out.set(l.id, l as LineLike);
  const jobLines: LineLike[] = a.changes?.data.lines ?? a.sources?.lines ?? a.edit?.data.lines ?? [];
  for (const l of jobLines) if (l.id) out.set(`${a.req.requestId}:${l.id}`, l);
  return out;
}

/**
 * Every record line shown now, with its permanent address: page lines by their id, the lines of a sources, edit or
 * changes job as "<request id>:<id>".
 */
export function originsOf(items: Activity[], latest: Activity | undefined): Map<string, Origin> {
  const out = new Map<string, Origin>();
  const byHash = new Map<string, Activity>();
  for (const a of items) if (a.fileHash) byHash.set(a.fileHash, a);
  const cache = new Map<string, Origin | null>();

  const own = (a: Activity, id: string): Origin => ({ jobId: a.jobId, lineId: id, tx: a.req.transactionHash, also: [] });

  /** The address of line `id` in the result file `a` produced, following its own origin or from refs back. */
  const inFile = (a: Activity, id: string, seen: Set<string>): Origin | null => {
    const key = `${a.req.requestId}|${id}`;
    if (cache.has(key)) return cache.get(key)!;
    if (seen.has(key)) return null;
    seen.add(key);
    const line = linesOf(a).get(id);
    let found: Origin | null = null;
    if (line) {
      const refs = line.origin ? [line.origin] : line.from ?? [];
      for (const r of refs) {
        found = resolveRef(a, r, seen);
        if (found) break;
      }
      if (!found) found = own(a, line.id);
      const also = (line.also ?? []).map((r) => resolveRef(a, r, new Set(seen))).filter((x): x is Origin => !!x).map(({ also: _a, ...x }) => x);
      if (also.length) found = { ...found, also: [...found.also, ...also] };
    }
    cache.set(key, found);
    return found;
  };

  /** A ref inside the file `a` produced: F<n>:<id> of its own <PRIOR>, a job address, or a bare id. */
  const resolveRef = (a: Activity, ref: string, seen: Set<string>): Origin | null => {
    const j = JOB_REF.exec(ref.trim());
    if (j) return { jobId: j[1]!, lineId: j[2]!, tx: "", also: [] };
    const m = FILE_REF.exec(ref);
    if (m) {
      const f = parsePrior(a.req.bodyJson?.objective).files.find((x) => x.n === Number(m[1]));
      const target = f?.hash ? byHash.get(f.hash) : undefined;
      return target ? inFile(target, m[2]!, seen) : null;
    }
    // A bare id is in this file.
    return linesOf(a).has(ref) ? inFile(a, ref, seen) : null;
  };

  if (!latest) return out;
  for (const l of latest.page?.lines ?? []) {
    if (!l.id) continue;
    const o = inFile(latest, l.id, new Set());
    if (o) out.set(l.id, o);
  }
  // The lines of results not folded in join the record under "<request id>:<id>".
  for (const a of items) {
    if (a === latest || !a.fileHash || (!a.changes && !a.sources && !a.edit)) continue;
    for (const [id, l] of linesOf(a)) {
      const o = inFile(a, id, new Set());
      if (o) out.set(id, o);
      void l;
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
