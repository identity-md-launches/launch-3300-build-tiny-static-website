/**
 * The home bar, which both searches and adds, and the record view's search and repeat check. Pure, for tests.
 */
import type { Kind, Line } from "./page";
import { isAddress, normDomain } from "./subject";

export type Lookup =
  | { kind: "empty" }
  | { kind: "domain"; domain: string }
  /** chainId is set when the input named it ("8453:0x…"), else null and the visitor may pick one. */
  | { kind: "address"; address: string; chainId: number | null }
  | { kind: "invalid" };

/**
 * What the visitor typed or pasted: a 0x address, "chain:0x…", a domain, or a link (its host is taken, without
 * "www."). Anything else is invalid.
 */
export function parseLookup(raw: string): Lookup {
  const t = raw.trim();
  if (!t) return { kind: "empty" };
  const pair = /^(\d{1,12})\s*:\s*(0x[0-9a-fA-F]{40})$/.exec(t);
  if (pair && Number(pair[1]) > 0) return { kind: "address", address: pair[2]!.toLowerCase(), chainId: Number(pair[1]) };
  if (isAddress(t)) return { kind: "address", address: t.toLowerCase(), chainId: null };
  // A link to an explorer page of a contract: take the address in its path, not the explorer's host.
  const inPath = /^https?:\/\/[^/]+\/(?:[^?#]*\/)?(?:address|token)\/(0x[0-9a-fA-F]{40})\b/i.exec(t);
  if (inPath) return { kind: "address", address: inPath[1]!.toLowerCase(), chainId: null };
  if (/\s/.test(t)) return { kind: "invalid" };
  const domain = normDomain(t);
  return domain ? { kind: "domain", domain } : { kind: "invalid" };
}

/** A subject as the bar and Related look it up: its id, and the main contract its page names, if any. */
export interface Findable {
  id: string;
  main?: string;
}

/**
 * The subject a lookup names: a domain matches a subject with that id; an address matches a chain:address id on
 * that chain (any chain when none was named) or a subject whose page names it as the main contract.
 */
export function findSubject(q: Lookup, subjects: Findable[]): string | null {
  if (q.kind === "domain") return subjects.find((s) => s.id === q.domain)?.id ?? null;
  if (q.kind !== "address") return null;
  const a = q.address.toLowerCase();
  const byId = subjects.find((s) => {
    const m = /^(\d+):(0x[0-9a-f]{40})$/.exec(s.id);
    return !!m && m[2] === a && (q.chainId === null || Number(m[1]) === q.chainId);
  });
  if (byId) return byId.id;
  return subjects.find((s) => !!s.main && s.main.toLowerCase() === a)?.id ?? null;
}

/** Shown while typing: the subjects whose id, name or one-line text contain what was typed (or its domain). */
export function matchesQuery(s: { id: string; name: string; oneLine: string; main?: string }, raw: string): boolean {
  const needle = raw.trim().toLowerCase();
  if (!needle) return true;
  const q = parseLookup(raw);
  const n = q.kind === "domain" ? q.domain : q.kind === "address" ? q.address : needle;
  return [s.id, s.name, s.oneLine, s.main ?? ""].some((x) => x.toLowerCase().includes(n) || x.toLowerCase().includes(needle));
}

/** The bar's value for a subject id handed over by "Add this project": a domain, or "chain:0x…". */
export const lookupText = (id: string) => id.trim();

/* ---------- Record: search, settled filter, repeats ---------- */

/** Line text for the repeat check: lower case, punctuation and spacing ignored. */
export const normText = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();

/**
 * Groups of two or more lines with the same text, ignoring case and punctuation, in record order. The warning
 * counts every line after the first of its group: "N lines repeat another line".
 */
export function repeatsOf(lines: Line[]): Line[][] {
  const groups = new Map<string, Line[]>();
  for (const l of lines) {
    const k = normText(l.text);
    if (!k) continue;
    groups.set(k, [...(groups.get(k) ?? []), l]);
  }
  return [...groups.values()].filter((g) => g.length > 1);
}
export const repeatCount = (groups: Line[][]) => groups.reduce((n, g) => n + g.length - 1, 0);

/** The record search: every word typed must appear in the line's text or its speaker (by), ignoring case. */
export function lineMatches(l: Pick<Line, "text" | "by">, raw: string): boolean {
  const words = normText(raw).split(" ").filter(Boolean);
  if (!words.length) return true;
  const hay = normText(`${l.text} ${l.by}`);
  return words.every((w) => hay.includes(w));
}

/** "Only lines that are confirmed or contradicted": a line with at least one confirms or contradicts link. */
export const isSettled = (l: Pick<Line, "links">) => l.links.length > 0;

/** Counts of proofs, statements and claims among a section's lines. */
export function kindCounts(lines: Pick<Line, "kind">[]): Record<Kind, number> {
  const c: Record<Kind, number> = { proof: 0, statement: 0, claim: 0 };
  for (const l of lines) c[l.kind]++;
  return c;
}

/** "3 proofs, 1 statement, 0 claims". */
export function countsText(c: Record<Kind, number>): string {
  const p = (n: number, one: string) => `${n.toLocaleString("en-US")} ${one}${n === 1 ? "" : "s"}`;
  return `${p(c.proof, "proof")}, ${p(c.statement, "statement")}, ${p(c.claim, "claim")}`;
}

/** The first letter of a name, for the tile shown when a subject has no logo file. */
export function initialOf(name: string): string {
  const m = /[\p{L}\p{N}]/u.exec(name.replace(/^(https?:\/\/)?(www\.)?/i, ""));
  return m ? m[0].toUpperCase() : "?";
}
