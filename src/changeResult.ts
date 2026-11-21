/**
 * What a completed changes job does to the record shown. Pure, for tests.
 * - Its new lines join the record (mergeRecord) marked "raised by <payer>".
 * - Each new line's link names the line it is about ("F1:L3", or a bare page line id). The link is moved onto
 *   that target line, pointing back at the new line, so the target row shows what the new line does to it:
 *   Contradicted by, Confirmed by, Partly confirmed by, or Context. A new proof settles the target as Proven or
 *   Contradicted by the same settled-line rules as any proof.
 * - A link from a new statement or claim to an existing proof line or panel answer goes the other way: it says what
 *   that proof or answer does to the new line, so it stays on the new line and settles it.
 * - Its affects list marks, at once, every existing line, Key facts row and summary sentence a new line
 *   contradicts or outdates (disputesOf). Only the sentence the visitor targeted is rewritten.
 * - A kept reword replaces that summary sentence, marked "reworded by <payer>".
 */
import { parsePrior } from "./bodies";
import { parseItems } from "./changes";
import { payerName } from "./format";
import type { Affect, LineLink, Page, RecordRow, SummarySentence } from "./page";
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
  /** The panel answers (A1…) the page shown was rebuilt with, so an answer a changes job names is found by its URL. */
  pageAnswers?: { n: number; url: string }[];
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

/** A panel answer a changes job names (A<n> of its own <PRIOR>) as the page shown numbers it, or null. */
function answerInPage(raw: string, a: Activity, scope: LineScope): string | null {
  const m = /^\s*A(\d+)\s*$/i.exec(raw);
  if (!m) return null;
  const url = parsePrior(a.req.bodyJson?.objective).answers.find((x) => x.n === Number(m[1]))?.url;
  const hit = url ? scope.pageAnswers?.find((x) => x.url === url) : undefined;
  return hit ? `A${hit.n}` : null;
}

/** The lines and links each kept changes job adds to the rows shown, as described at the top of this file. */
export function applyChangeLinks(sections: { section: string; rows: RecordRow[] }[], scope: LineScope): { section: string; rows: RecordRow[] }[] {
  const jobs = scope.after.filter((a) => a.changes);
  if (!jobs.length) return sections;
  const kindOf = new Map(sections.flatMap((s) => s.rows.map((r) => [r.line.id, r.line.kind] as const)));
  const ids = new Set(kindOf.keys());
  const added = new Map<string, LineLink[]>();
  const kept = new Map<string, LineLink[]>();
  const raisedIds = new Set<string>();
  const add = (on: string, k: LineLink) => {
    const list = added.get(on) ?? [];
    const same = list.find((x) => x.type === k.type && x.target === k.target);
    if (same) same.affects = same.affects || k.affects;
    else list.push({ ...k });
    added.set(on, list);
  };
  for (const a of jobs) {
    const key = a.req.requestId;
    for (const l of a.changes!.data.lines) {
      const newId = `${key}:${l.id}`;
      if (!ids.has(newId)) continue;
      raisedIds.add(newId);
      for (const k of l.links) {
        const answer = answerInPage(k.target, a, scope);
        const target = answer ?? resolveChangeTarget(k.target, a, scope, (x) => ids.has(x));
        if (!target || target === newId) continue;
        // An existing proof or panel answer settling the new statement or claim: the link stays on the new line.
        const settling = (k.type === "confirms" || k.type === "partly" || k.type === "contradicts") && l.kind !== "proof" && (!!answer || kindOf.get(target) === "proof");
        if (settling) kept.set(newId, [...(kept.get(newId) ?? []), { type: k.type, target }]);
        else if (!answer) add(target, { type: k.type, target: newId });
      }
    }
    for (const f of a.changes!.affects) {
      if (f.kind !== "line") continue;
      const by = `${key}:${f.byLine}`;
      const target = resolveChangeTarget(f.target, a, scope, (x) => ids.has(x));
      if (!ids.has(by) || !target || target === by) continue;
      add(target, { type: f.type, target: by, affects: true });
    }
  }
  return sections.map((s) => ({
    section: s.section,
    rows: s.rows.map((r) => {
      const more = added.get(r.line.id);
      // A raised line's own links name its target, not what settles it: they now live on the target, except the
      // links by which an existing proof or panel answer settles it.
      const own = raisedIds.has(r.line.id) ? kept.get(r.line.id) ?? [] : r.line.links;
      if (!more && own === r.line.links) return r;
      return { ...r, line: { ...r.line, links: [...own, ...(more ?? [])] } };
    }),
  }));
}

/** One part of the page a newer source disputes: the record id of the newer line that does it, and how. */
export interface Dispute {
  type: Affect["type"];
  by: string;
}
export interface Disputes {
  /** Record line ids marked Contradicted or Out of date by an affects entry. */
  lines: Map<string, Dispute>;
  /** Key facts rows by lower-case label. */
  infobox: Map<string, Dispute>;
  /** Summary sentences by their normalised text. */
  summary: Map<string, Dispute>;
  /** True when a changes job with a kept change listed anything in affects. */
  fromKept: boolean;
}

/**
 * Everything the affects lists of the changes jobs not yet folded in name, resolved to what the page shows now. A
 * newer job's entry for the same target wins; contradicts wins over outdates within one job.
 */
export function disputesOf(scope: LineScope, has: (id: string) => boolean): Disputes {
  const out: Disputes = { lines: new Map(), infobox: new Map(), summary: new Map(), fromKept: false };
  const put = (m: Map<string, Dispute>, k: string, d: Dispute) => {
    const was = m.get(k);
    if (!was || was.type !== "contradicts" || d.type === "contradicts") m.set(k, d);
  };
  for (const a of scope.after) {
    if (!a.changes) continue;
    const key = a.req.requestId;
    let any = false;
    for (const f of a.changes.affects) {
      const by = `${key}:${f.byLine}`;
      if (!has(by)) continue;
      const d = { type: f.type, by };
      if (f.kind === "line") {
        const t = resolveChangeTarget(f.target, a, scope, has);
        if (!t || t === by) continue;
        put(out.lines, t, d);
      } else if (f.kind === "infobox") put(out.infobox, f.target.trim().toLowerCase(), d);
      else {
        const t = norm(unquote(f.target));
        if (!t) continue;
        put(out.summary, t, d);
      }
      any = true;
    }
    if (any && a.changes.items.some((v) => v.kept)) out.fromKept = true;
  }
  return out;
}

/** The dispute on a summary sentence shown now, unless that sentence was itself rewritten by a kept change. */
export function sentenceDispute(s: { text: string; original?: string }, d: Disputes): Dispute | null {
  if (s.original) return null;
  return d.summary.get(norm(s.text)) ?? null;
}

/** How many parts of the page shown the disputes mark: lines, Key facts rows and summary sentences. */
export function disputedCount(d: Disputes, rowLabels: string[], sentences: { text: string; original?: string }[]): number {
  const labels = new Set(rowLabels.map((l) => l.trim().toLowerCase()));
  const rows = [...d.infobox.keys()].filter((k) => labels.has(k)).length;
  const sent = sentences.filter((s) => sentenceDispute(s, d)).length;
  return d.lines.size + rows + sent;
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

/**
 * Kept rewordings replace their sentence. The sentence then rests on the lines its own verdict lists
 * (items[].lines, in `rewordLines`, read in the scope of `rewordJob`), not on the old sentence's lines.
 */
export type Reworded<T> = T & { rewordedBy?: string; correctedBy?: string; original?: string; rewordLines?: string[]; rewordJob?: Activity };
export function applyRewords<T extends SummarySentence>(summary: T[], after: Activity[]): Reworded<T>[] {
  let out: Reworded<T>[] = summary;
  for (const a of after) {
    if (!a.changes) continue;
    const sent = parseItems(a.req.bodyJson?.objective);
    for (const v of a.changes.items) {
      // A kept rewording, or a kept "This is wrong" on a summary sentence with its corrected final_text.
      if (!v.kept || (v.type !== "reword" && v.type !== "wrong") || !v.finalText.trim()) continue;
      const item = sent.find((x) => x.n === v.n && x.type === v.type);
      if (v.type === "wrong" && !(item ? item.targetKind === "sentence" : /^\s*summary sentence/i.test(v.target))) continue;
      const was = norm(item?.text || unquote(v.target));
      if (!was) continue;
      const who = v.type === "wrong" ? { correctedBy: payerName(a), rewordedBy: undefined } : { rewordedBy: payerName(a), correctedBy: undefined };
      out = out.map((s) => (norm(s.text) === was || (s.original && norm(s.original) === was) ? { ...s, original: s.original ?? s.text, text: v.finalText.trim(), ...who, rewordLines: v.lines.length ? v.lines : s.rewordLines, rewordJob: a } : s));
    }
  }
  return out;
}
