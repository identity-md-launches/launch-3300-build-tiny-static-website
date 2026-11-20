/**
 * Settled lines. A statement or claim with a link of type confirms to a proof line or a panel answer is shown as
 * ONE row led by "Proven" (or "Confirmed by a panel, N of M"); with a link of type contradicts, it is led by
 * "Contradicted". A link of type partly keeps the line's own kind. The speaker never changes: a settled row still
 * says "Stated by <channel>" or "Claimed by <who>". Pure, for tests.
 */
import type { Kind, Line, LineLink } from "./page";

export type SettleState = "proven" | "contradicted" | "partly" | "none";

export interface Settle {
  state: SettleState;
  /** Targets that confirm the whole sentence: proof line ids or panel answers (A1...). */
  confirms: string[];
  contradicts: string[];
  partly: string[];
}

/** A panel answer as a rebuild was given it: A1, A2... */
export const isAnswerRef = (target: string) => /^A\d+$/i.test(target.trim());

/** True when a link target settles a line: a proof line of the same record, or a panel answer. */
export function settlesWith(target: string, proofIds: Set<string>): boolean {
  const t = target.trim();
  return isAnswerRef(t) || proofIds.has(t);
}

/**
 * How one line is settled. Only statements and claims are settled; a proof is evidence, not a thing said.
 * Contradicts wins over confirms: a sentence a proof shows wrong is never shown as Proven.
 */
export function settleOf(line: Pick<Line, "kind" | "links">, proofIds: Set<string>): Settle {
  const pick = (type: LineLink["type"]) => line.links.filter((k) => k.type === type && settlesWith(k.target, proofIds)).map((k) => k.target.trim());
  const confirms = pick("confirms");
  const contradicts = pick("contradicts");
  const partly = pick("partly");
  if (line.kind === "proof") return { state: "none", confirms: [], contradicts: [], partly: [] };
  const state: SettleState = contradicts.length ? "contradicted" : confirms.length ? "proven" : partly.length ? "partly" : "none";
  return { state, confirms, contradicts, partly };
}

/** The proof line ids among these lines. */
export const proofIdsOf = (lines: Pick<Line, "id" | "kind">[]) => new Set(lines.filter((l) => l.kind === "proof").map((l) => l.id));

/** Every line's settle state, keyed by line id, and the proof lines a settled row already shows. */
export function settleAll(lines: Pick<Line, "id" | "kind" | "links">[]): { by: Map<string, Settle>; absorbed: Set<string> } {
  const proofs = proofIdsOf(lines);
  const by = new Map<string, Settle>();
  const absorbed = new Set<string>();
  for (const l of lines) {
    const s = settleOf(l, proofs);
    by.set(l.id, s);
    if (s.state === "proven") for (const t of s.confirms) if (proofs.has(t)) absorbed.add(t);
    if (s.state === "contradicted") for (const t of s.contradicts) if (proofs.has(t)) absorbed.add(t);
  }
  return { by, absorbed };
}

/** What a row counts as: a settled row once, as Proven or Contradicted; otherwise its own kind. */
export type RowClass = Kind | "proven" | "contradicted";
export function rowClass(line: Pick<Line, "kind">, s: Settle | undefined): RowClass {
  if (s?.state === "proven") return "proven";
  if (s?.state === "contradicted") return "contradicted";
  return line.kind;
}

export type Counts = Record<RowClass | "all" | "said", number>;
export const emptyCounts = (): Counts => ({ all: 0, proven: 0, contradicted: 0, proof: 0, statement: 0, claim: 0, said: 0 });

/**
 * The counts Record, the filter, Home and Key facts share. A settled row counts once, as Proven or Contradicted;
 * a proof that a settled row already shows is not counted again. "said" is every statement and claim with no
 * confirms or contradicts link (a partly-confirmed line is still only said). all = proven + contradicted + proof +
 * statement + claim.
 */
export function countLines(lines: Pick<Line, "id" | "kind" | "links">[], settled = settleAll(lines)): Counts {
  const c = emptyCounts();
  for (const l of lines) {
    if (l.kind === "proof" && settled.absorbed.has(l.id)) continue;
    const k = rowClass(l, settled.by.get(l.id));
    c[k]++;
    c.all++;
    if (k === "statement" || k === "claim") c.said++;
  }
  return c;
}

export type Filter = "all" | "proven" | "contradicted" | "said" | Kind;
export const FILTERS: Filter[] = ["all", "proven", "contradicted", "proof", "statement", "claim", "said"];
export const FILTER_WORDS: Record<Filter, string> = {
  all: "All",
  proven: "Proven",
  contradicted: "Contradicted",
  proof: "Proof",
  statement: "Statement",
  claim: "Claim",
  said: "Only said",
};

/** True when a row of this class passes the filter. */
export function passes(filter: Filter, k: RowClass): boolean {
  if (filter === "all") return true;
  if (filter === "said") return k === "statement" || k === "claim";
  return filter === k;
}

/** "Stated by <channel>" for a statement, "Claimed by <who>" for a claim: the speaker a settled row keeps. */
export function speakerText(line: Pick<Line, "kind" | "by" | "channel">): string {
  if (line.kind === "statement") return `Stated by ${line.channel?.label || line.channel?.url || line.by || "the project"}`;
  if (line.kind === "claim") return `Claimed by ${line.by || "an outside source"}`;
  return "";
}

/** "2 proven, 1 contradicted, 3 proofs, 1 statement, 0 claims": proven and contradicted only when there are any. */
export function countsWords(c: Counts): string {
  const p = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString("en-US")} ${n === 1 ? one : many}`;
  const settled = [c.proven ? `${c.proven.toLocaleString("en-US")} proven` : "", c.contradicted ? `${c.contradicted.toLocaleString("en-US")} contradicted` : ""].filter(Boolean);
  return [...settled, p(c.proof, "proof"), p(c.statement, "statement"), p(c.claim, "claim")].join(", ");
}
