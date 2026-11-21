/**
 * Settled lines. A statement or claim with a link of type confirms to a proof line or a panel answer is shown as
 * ONE row led by "Proven" (or "Confirmed by a panel, N of M"); with a link of type contradicts, it is led by
 * "Contradicted". A link of type partly keeps the line's own kind. The speaker never changes: a settled row still
 * says "Stated by <channel>" or "Claimed by <who>". Pure, for tests.
 */
import type { Kind, Line, LineLink } from "./page";

export type SettleState = "proven" | "contradicted" | "outdated" | "partly" | "none";

export interface Settle {
  state: SettleState;
  /** Targets that confirm the whole sentence: proof line ids or panel answers (A1...). */
  confirms: string[];
  contradicts: string[];
  partly: string[];
  /** Newer lines (or panel answers) that show something this line reported has since changed. */
  outdates: string[];
}

/** A panel answer as a rebuild was given it: A1, A2... */
export const isAnswerRef = (target: string) => /^A\d+$/i.test(target.trim());

/** A link to a panel answer the record does not hold: kept out of settling, listed under Page upkeep. */
export interface UnresolvedRef {
  lineId: string;
  text: string;
  type: LineLink["type"];
  target: string;
}

/**
 * Removes links to panel answers (A1…) that name no answer the page's rebuild was given, so an unresolved reference
 * never settles a row (a row keeps its own kind) and never shows a raw id. Each one removed is returned for Page upkeep.
 */
export function dropUnresolvedAnswers<R extends { line: Line; same?: R[] }>(sections: { section: string; rows: R[] }[], known: Set<number>): { sections: { section: string; rows: R[] }[]; unresolved: UnresolvedRef[] } {
  const unresolved: UnresolvedRef[] = [];
  const fix = (r: R): R => {
    const bad = r.line.links.filter((k) => isAnswerRef(k.target) && !known.has(Number(k.target.trim().slice(1))));
    if (!bad.length) return r;
    for (const k of bad) unresolved.push({ lineId: r.line.id, text: r.line.text, type: k.type, target: k.target.trim() });
    return { ...r, line: { ...r.line, links: r.line.links.filter((k) => !bad.includes(k)) } };
  };
  return { sections: sections.map((s) => ({ section: s.section, rows: s.rows.map(fix) })), unresolved };
}

/** True when a link target settles a line: a proof line of the same record, or a panel answer. */
export function settlesWith(target: string, proofIds: Set<string>): boolean {
  const t = target.trim();
  return isAnswerRef(t) || proofIds.has(t);
}

/**
 * How one line is settled. Only statements and claims are settled; a proof is evidence, not a thing said.
 * Contradicts wins over confirms: a sentence a proof shows wrong is never shown as Proven.
 */
export function settleOf(line: Pick<Line, "kind" | "links">, proofIds: Set<string>, lineIds: Set<string> = proofIds): Settle {
  // A link an affects list placed settles whatever the newer line's kind: the changes job judged it plainly.
  const pick = (type: LineLink["type"]) => line.links.filter((k) => k.type === type && (k.affects || settlesWith(k.target, proofIds))).map((k) => k.target.trim());
  const confirms = pick("confirms");
  const contradicts = pick("contradicts");
  const partly = pick("partly");
  // Out of date: a newer line of any kind (or a panel answer) shows that what this line reported has since changed.
  const outdates = line.links.filter((k) => k.type === "outdates" && (isAnswerRef(k.target) || lineIds.has(k.target.trim()))).map((k) => k.target.trim());
  // A proof is never proven. A proof read at an older block can be out of date, and a newer line an affects list
  // names (or a newer proof) can contradict it: it then leaves Proven for Contradicted, like any disputed line.
  if (line.kind === "proof") {
    const against = line.links.filter((k) => k.type === "contradicts" && (k.affects || proofIds.has(k.target.trim()))).map((k) => k.target.trim());
    return { state: against.length ? "contradicted" : outdates.length ? "outdated" : "none", confirms: [], contradicts: against, partly: [], outdates };
  }
  const state: SettleState = contradicts.length ? "contradicted" : outdates.length ? "outdated" : confirms.length ? "proven" : partly.length ? "partly" : "none";
  return { state, confirms, contradicts, partly, outdates };
}

/** The proof line ids among these lines. */
export const proofIdsOf = (lines: Pick<Line, "id" | "kind">[]) => new Set(lines.filter((l) => l.kind === "proof").map((l) => l.id));

/** Every line's settle state, keyed by line id, and the proof lines a settled row already shows. */
export function settleAll(lines: Pick<Line, "id" | "kind" | "links">[]): { by: Map<string, Settle>; absorbed: Set<string> } {
  const proofs = proofIdsOf(lines);
  const ids = new Set(lines.map((l) => l.id));
  const by = new Map<string, Settle>();
  const absorbed = new Set<string>();
  for (const l of lines) {
    const s = settleOf(l, proofs, ids);
    by.set(l.id, s);
    if (s.state === "proven") for (const t of s.confirms) if (proofs.has(t)) absorbed.add(t);
    if (s.state === "contradicted") for (const t of s.contradicts) if (proofs.has(t)) absorbed.add(t);
  }
  return { by, absorbed };
}

/** What a row counts as: a settled row once, as Proven or Contradicted; otherwise its own kind. */
export type RowClass = Kind | "proven" | "contradicted" | "outdated";
export function rowClass(line: Pick<Line, "kind">, s: Settle | undefined): RowClass {
  if (s?.state === "proven") return "proven";
  if (s?.state === "contradicted") return "contradicted";
  if (s?.state === "outdated") return "outdated";
  return line.kind;
}

/**
 * The groups every count shows, so a count reads at a glance:
 * - proven: proof lines, plus statements and claims with a confirming link (to a proof or a panel answer);
 * - stated: statements with no confirming link (a partly-confirmed statement is still only stated);
 * - claimed: claims with no confirming link;
 * - contradicted and outdated: shown only when above zero.
 */
export type Group = "proven" | "stated" | "claimed" | "contradicted" | "outdated";
export const groupOf = (k: RowClass): Group => (k === "proof" || k === "proven" ? "proven" : k === "statement" ? "stated" : k === "claim" ? "claimed" : k);
export const GROUP_WORDS: Record<Group, string> = { proven: "Proven", stated: "Stated", claimed: "Claimed", contradicted: "Contradicted", outdated: "Out of date" };
/** The kind colour each group shows in: proven green, stated blue, claimed orange, contradicted red, out of date amber. */
export const GROUP_TONE: Record<Group, string> = { proven: "proven", stated: "statement", claimed: "claim", contradicted: "contradicted", outdated: "outdated" };

/** all and each group; `checks` and `confirmed` split proven into proof rows and said-then-confirmed rows. */
export type Counts = Record<Group | "all" | "checks" | "confirmed", number>;
export const emptyCounts = (): Counts => ({ all: 0, proven: 0, stated: 0, claimed: 0, contradicted: 0, outdated: 0, checks: 0, confirmed: 0 });

/**
 * The counts Record, the filter, Home and Key facts share, over exactly the rows the Record renders. A settled row
 * counts once; a proof that a settled row already shows is not counted again, unless it also has its own row
 * (`alone`: the On-chain facts table lists every proof with a fact, so such a check counts there, once, as a proof).
 * all = proven + stated + claimed + contradicted + outdated.
 */
export function countLines(lines: Pick<Line, "id" | "kind" | "links">[], settled = settleAll(lines), alone: Set<string> = new Set()): Counts {
  const c = emptyCounts();
  for (const l of lines) {
    if (l.kind === "proof" && settled.absorbed.has(l.id) && !alone.has(l.id)) continue;
    const k = rowClass(l, settled.by.get(l.id));
    c[groupOf(k)]++;
    if (k === "proof") c.checks++;
    if (k === "proven") c.confirmed++;
    c.all++;
  }
  return c;
}

/** The groups shown: Proven, Stated and Claimed always; Contradicted and Out of date only when above zero. */
export function shownGroups(c: Counts): Group[] {
  return (["proven", "stated", "claimed", "contradicted", "outdated"] as Group[]).filter((g) => g === "proven" || g === "stated" || g === "claimed" || c[g] > 0);
}

export type Filter = "all" | Group;
export const FILTERS: Filter[] = ["all", "proven", "stated", "claimed", "contradicted", "outdated"];
export const FILTER_WORDS: Record<Filter, string> = { all: "All", ...GROUP_WORDS };
/** The filter buttons for these counts: All and the groups shown. */
export const filtersFor = (c: Counts): Filter[] => ["all", ...shownGroups(c)];

/** True when a row of this class passes the filter. Proven passes proof rows and said-then-confirmed rows alike. */
export function passes(filter: Filter, k: RowClass): boolean {
  if (filter === "all") return true;
  return groupOf(k) === filter;
}

/** "Stated by <channel>" for a statement, "Claimed by <who>" for a claim: the speaker a settled row keeps. */
export function speakerText(line: Pick<Line, "kind" | "by" | "channel">): string {
  if (line.kind === "statement") return `Stated by ${line.channel?.label || line.channel?.url || line.by || "the project"}`;
  if (line.kind === "claim") return `Claimed by ${line.by || "an outside source"}`;
  return "";
}

/** "5 proven, 2 stated, 3 claimed", then contradicted and out of date only when there are any. */
export function countsWords(c: Counts): string {
  return shownGroups(c)
    .map((g) => `${c[g].toLocaleString("en-US")} ${g === "outdated" ? "out of date" : g}`)
    .join(", ");
}
