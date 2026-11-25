/** Home's "Find a project" and "Sort by": pure, for tests. No likes and no sorting by token price. */
import type { SubjectSummary } from "./model";
import { localDate } from "./dates";

export const SORTS = [
  { key: "changed", label: "Recently changed" },
  { key: "added", label: "Newest added" },
  { key: "edits", label: "Most edited" },
  { key: "proven", label: "Most proven" },
  { key: "open", label: "Most open questions" },
  { key: "disputed", label: "Most disputed" },
  { key: "launched", label: "Launch date" },
] as const;
export type SortKey = (typeof SORTS)[number]["key"];
export const sortOf = (v: string | null | undefined): SortKey => (SORTS.some((s) => s.key === v) ? (v as SortKey) : "changed");

/** "#/?sort=edits" for a sort other than the default; "#/" for Recently changed. */
export const sortHash = (k: SortKey) => (k === "changed" ? "#/" : `#/?sort=${k}`);
export const sortFromHash = (hash: string) => sortOf(/[?&]sort=([a-z]+)/.exec(hash)?.[1]);

/** What a row is sorted by that the summary does not hold: counted jobs, first request, and two digest figures. */
export interface RowFacts {
  /**
   * False when the figures read from the subject's record (open questions, proofs, contradicted lines, launch date) are
   * not known for its current results: nothing read here yet, or newer results since. Such a row goes after known ones.
   */
  current?: boolean;
  /** Counted jobs: completed requests whose result was read. */
  edits: number;
  /** The subject's first request. */
  added: number | null;
  /** Open questions on the page shown, from the digest; null when not known yet. */
  open: number | null;
  /** The Launched fact as a time; null when the page has none (known only while `current`). */
  launched: number | null;
}

/** True when the row's name or domain contains the text (case and spacing ignored). */
export function findMatches(s: Pick<SubjectSummary, "id" | "name">, find: string): boolean {
  const f = find.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "");
  if (!f) return true;
  return s.name.toLowerCase().includes(f) || s.id.toLowerCase().includes(f);
}

type Row = Pick<SubjectSummary, "id" | "changed" | "counts"> & { order?: number };
/** The sorts whose figure comes from the subject's record, not from the Intake scan. */
const FROM_RECORD: SortKey[] = ["proven", "open", "disputed", "launched"];
/** True when this sort's figure for the row is not known for its current results. */
export const awaits = (k: SortKey, f: RowFacts | undefined) => FROM_RECORD.includes(k) && f?.current === false;
/** The figure a sort ranks by; null for "goes last". */
export function figure(s: Row, k: SortKey, f: RowFacts | undefined): number | null {
  if (awaits(k, f)) return null;
  switch (k) {
    case "changed": return s.order ?? s.changed;
    case "added": return f?.added ?? null;
    case "edits": return f?.edits ?? 0;
    case "proven": return s.counts ? s.counts.checks : null;
    case "open": return f?.open ?? null;
    case "disputed": return s.counts ? s.counts.contradicted : null;
    case "launched": return f?.launched ?? null;
  }
}

/**
 * The rows in the chosen order: largest or newest first; for Launch date the earliest first. A missing figure (no
 * Launched fact) goes after known ones, and a figure awaiting an update after those.
 */
export function sortProjects<T extends Row>(rows: T[], k: SortKey, facts: Map<string, RowFacts>): T[] {
  return rows
    .map((s, i) => ({ s, i, v: figure(s, k, facts.get(s.id)), late: Number(awaits(k, facts.get(s.id))) }))
    .sort((a, b) => {
      if (a.v === null && b.v === null) return a.late - b.late || a.i - b.i;
      if (a.v === null) return 1;
      if (b.v === null) return -1;
      return (k === "launched" ? a.v - b.v : b.v - a.v) || a.i - b.i;
    })
    .map((x) => x.s);
}

const n = (v: number, one: string, many = `${one}s`) => `${v.toLocaleString("en-US")} ${v === 1 ? one : many}`;
const day = (t: number) => new Date(t).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
/** The figure a row is sorted by, when the row does not already show it ("12 edits", "9 open questions"). */
export function figureOf(s: Row, k: SortKey, f: RowFacts | undefined): string {
  if (awaits(k, f)) return k === "launched" ? "Launch date awaiting update" : "Count awaiting update";
  const v = figure(s, k, f);
  if (v === null) return k === "launched" ? "No launch date" : "";
  switch (k) {
    case "changed": return "";
    case "added": return `Added ${localDate(v)}`;
    case "edits": return n(v, "edit");
    case "proven": return n(v, "proof");
    case "open": return n(v, "open question");
    case "disputed": return n(v, "contradicted line");
    case "launched": return `Launched ${day(v)}`;
  }
}
