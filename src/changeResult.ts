/**
 * What a completed changes job does to the record shown. Pure, for tests.
 * - Its new lines join the record (mergeRecord) marked "raised by <payer>".
 * - Each new line's link names the line it is about ("F1:L3", or a bare page line id). The link is moved onto
 *   that target line, pointing back at the new line, so the target row shows what the new line does to it:
 *   Contradicted by, Confirmed by, Partly confirmed by, or Context. A new proof settles the target as Proven or
 *   Contradicted by the same settled-line rules as any proof.
 * - A kept reword replaces that summary sentence, marked "reworded by <payer>".
 */
import { parsePrior } from "./bodies";
import { parseItems } from "./changes";
import { payerName } from "./format";
import type { LineLink, Page, RecordRow, SummarySentence } from "./page";
import type { Activity } from "./useActivity";

/**
 * Where a record line can be found now. Page lines keep their ids; lines of a job not folded in are
 * "<request id>:<id>". A line of a file the page shown was rebuilt from (an earlier page, or a job folded in) is
 * found through the rebuilt lines' from origins ("F2:L14" names file F2 of the objective that produced the page).
 */
export interface LineScope {
  pageHash: string | null;
  after: Activity[];
  /** "<artifact hash>|<line id>" of each carried-forward origin, to the page line that carries it now. */
  carried: Map<string, string>;
}

/** The carried-forward map of the page shown: every from origin, resolved to its file's artifact hash. */
export function carriedOf(page: Pick<Page, "lines"> | null, objective: unknown): Map<string, string> {
  const out = new Map<string, string>();
  if (!page) return out;
  const files = parsePrior(objective).files;
  for (const l of page.lines) {
    if (!l.id) continue;
    for (const ref of l.from) {
      const m = /^\s*F(\d+):(\S+)\s*$/i.exec(ref);
      const f = m ? files.find((x) => x.n === Number(m[1])) : undefined;
      if (f?.hash && !out.has(`${f.hash}|${m![2]}`)) out.set(`${f.hash}|${m![2]}`, l.id);
    }
  }
  return out;
}

/** The record line shown now that is line `id` of the artifact `hash`: the line itself, or the line a rebuild carried it into. */
export function lineInFile(hash: string, id: string, scope: LineScope, has: (id: string) => boolean): string | null {
  if (hash === scope.pageHash) return has(id) ? id : null;
  const job = scope.after.find((x) => x.fileHash === hash);
  if (job) {
    const full = `${job.req.requestId}:${id}`;
    return has(full) ? full : null;
  }
  const carried = scope.carried.get(`${hash}|${id}`);
  return carried && has(carried) ? carried : null;
}

/** The artifact hash and line id a record line shown now was written in, or null when its file has no address. */
export function originOfLine(lineId: string, scope: Pick<LineScope, "pageHash" | "after">): { file: string; id: string } | null {
  const i = lineId.lastIndexOf(":");
  if (i > 0) {
    const job = scope.after.find((a) => a.req.requestId === lineId.slice(0, i));
    return job?.fileHash ? { file: job.fileHash, id: lineId.slice(i + 1) } : null;
  }
  return scope.pageHash && lineId ? { file: scope.pageHash, id: lineId } : null;
}

/** Resolves a target written in a changes result to a record line id, in the scope of the <PRIOR> that job was given. */
export function resolveChangeTarget(raw: string, a: Activity, scope: LineScope, has: (id: string) => boolean): string | null {
  const m = /^\s*(?:F(\d+):)?([^\s"]+)/i.exec(raw);
  if (!m) return null;
  const id = m[2]!;
  if (m[1]) {
    const f = parsePrior(a.req.bodyJson?.objective).files.find((x) => x.n === Number(m[1]));
    return f?.hash ? lineInFile(f.hash, id, scope, has) : null;
  }
  return has(id) ? id : null;
}

export function applyChangeLinks(sections: { section: string; rows: RecordRow[] }[], scope: LineScope): { section: string; rows: RecordRow[] }[] {
  const jobs = scope.after.filter((a) => a.changes);
  if (!jobs.length) return sections;
  const ids = new Set(sections.flatMap((s) => s.rows.map((r) => r.line.id)));
  const added = new Map<string, LineLink[]>();
  const raisedIds = new Set<string>();
  for (const a of jobs) {
    const key = a.req.requestId;
    for (const l of a.changes!.data.lines) {
      const newId = `${key}:${l.id}`;
      if (!ids.has(newId)) continue;
      raisedIds.add(newId);
      for (const k of l.links) {
        const target = resolveChangeTarget(k.target, a, scope, (x) => ids.has(x));
        if (!target || target === newId) continue;
        added.set(target, [...(added.get(target) ?? []), { type: k.type, target: newId }]);
      }
    }
  }
  return sections.map((s) => ({
    section: s.section,
    rows: s.rows.map((r) => {
      const more = added.get(r.line.id);
      // A raised line's own links name its target, not what settles it: they now live on the target.
      const own = raisedIds.has(r.line.id) ? [] : r.line.links;
      if (!more && own === r.line.links) return r;
      return { ...r, line: { ...r.line, links: [...own, ...(more ?? [])] } };
    }),
  }));
}

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ").replace(/[.!?\s]+$/, "").trim();
const unquote = (s: string) => {
  const t = s.replace(/^\s*summary sentence\s*/i, "").trim();
  try {
    return t.startsWith('"') ? String(JSON.parse(t)) : t;
  } catch {
    return t;
  }
};

export function applyRewords<T extends SummarySentence>(summary: T[], after: Activity[]): (T & { rewordedBy?: string; original?: string })[] {
  let out: (T & { rewordedBy?: string; original?: string })[] = summary;
  for (const a of after) {
    if (!a.changes) continue;
    const sent = parseItems(a.req.bodyJson?.objective);
    for (const v of a.changes.items) {
      if (!v.kept || v.type !== "reword" || !v.finalText.trim()) continue;
      const item = sent.find((x) => x.n === v.n && x.type === "reword");
      const was = norm(item?.text || unquote(v.target));
      if (!was) continue;
      out = out.map((s) => (norm(s.text) === was || (s.original && norm(s.original) === was) ? { ...s, original: s.original ?? s.text, text: v.finalText.trim(), rewordedBy: payerName(a) } : s));
    }
  }
  return out;
}
