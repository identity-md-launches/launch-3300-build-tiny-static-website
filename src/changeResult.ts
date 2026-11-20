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
import type { LineLink, RecordRow, SummarySentence } from "./page";
import type { Activity } from "./useActivity";

/** Resolves a target written in a changes result to a record line id, in the scope of the <PRIOR> that job was given. */
export function resolveChangeTarget(raw: string, a: Activity, pageHash: string | null, after: Activity[], has: (id: string) => boolean): string | null {
  const m = /^\s*(?:F(\d+):)?([^\s"]+)/i.exec(raw);
  if (!m) return null;
  const id = m[2]!;
  if (m[1]) {
    const f = parsePrior(a.req.bodyJson?.objective).files.find((x) => x.n === Number(m[1]));
    if (!f?.hash) return null;
    if (f.hash === pageHash) return has(id) ? id : null;
    const job = after.find((x) => x.fileHash === f.hash);
    const full = job ? `${job.req.requestId}:${id}` : "";
    return full && has(full) ? full : null;
  }
  return has(id) ? id : null;
}

export function applyChangeLinks(sections: { section: string; rows: RecordRow[] }[], after: Activity[], pageHash: string | null): { section: string; rows: RecordRow[] }[] {
  const jobs = after.filter((a) => a.changes);
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
        const target = resolveChangeTarget(k.target, a, pageHash, after, (x) => ids.has(x));
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
