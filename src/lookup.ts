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
 * What the visitor typed or pasted: a 0x address, "chain:0x…", a domain, or a link. A link always resolves to its
 * host (without "www."), never to an address in its path: an explorer link names the explorer, not the project.
 * Anything else is invalid.
 */
export function parseLookup(raw: string): Lookup {
  const t = raw.trim();
  if (!t) return { kind: "empty" };
  const pair = /^(\d{1,12})\s*:\s*(0x[0-9a-fA-F]{40})$/.exec(t);
  if (pair && Number(pair[1]) > 0) return { kind: "address", address: pair[2]!.toLowerCase(), chainId: Number(pair[1]) };
  if (isAddress(t)) return { kind: "address", address: t.toLowerCase(), chainId: null };
  if (/\s/.test(t)) return { kind: "invalid" };
  const domain = normDomain(t);
  return domain ? { kind: "domain", domain } : { kind: "invalid" };
}

/** A contract a subject's page lists, with the chain it is on (null when the page names no chain we can read). */
export interface KnownContract {
  address: string;
  chainId: number | null;
}

/**
 * A subject as the bar and Related look it up: its id and every contract its page lists, each with its chain.
 * `main` is the main contract alone, for callers that know nothing more; its chain is treated as unknown.
 */
export interface Findable {
  id: string;
  contracts?: KnownContract[];
  main?: string;
}

/** The contract index of one subject: its listed contracts, plus the main contract when it is not among them. */
export function contractsOf(s: Findable): KnownContract[] {
  const out = (s.contracts ?? []).filter((c) => /^0x[0-9a-fA-F]{40}$/.test(c.address)).map((c) => ({ address: c.address.toLowerCase(), chainId: c.chainId }));
  const main = s.main?.toLowerCase() ?? "";
  if (/^0x[0-9a-f]{40}$/.test(main) && !out.some((c) => c.address === main)) out.push({ address: main, chainId: null });
  return out;
}

/** True when the subject is the contract: its id is chain:address, or its page lists the address on that chain. */
function holdsContract(s: Findable, address: string, chainId: number | null): boolean {
  const m = /^(\d+):(0x[0-9a-f]{40})$/.exec(s.id);
  if (m && m[2] === address && (chainId === null || Number(m[1]) === chainId)) return true;
  // With a chain given, a contract matches only when its recorded chain is that chain: an address on another
  // chain (or on a chain the page does not name) is a different contract and must not open this project.
  return contractsOf(s).some((c) => c.address === address && (chainId === null || c.chainId === chainId));
}

/**
 * The subject a lookup names: a domain matches a subject with that id; an address matches a chain:address id on
 * that chain, or any contract a subject's page lists on that chain (any chain when none was named).
 */
export function findSubject(q: Lookup, subjects: Findable[]): string | null {
  if (q.kind === "domain") return subjects.find((s) => s.id === q.domain)?.id ?? null;
  if (q.kind !== "address") return null;
  const a = q.address.toLowerCase();
  // A subject whose id is the contract wins over one that merely lists it.
  const byId = subjects.find((s) => {
    const m = /^(\d+):(0x[0-9a-f]{40})$/.exec(s.id);
    return !!m && m[2] === a && (q.chainId === null || Number(m[1]) === q.chainId);
  });
  if (byId) return byId.id;
  return subjects.find((s) => holdsContract(s, a, q.chainId))?.id ?? null;
}

/**
 * Shown while typing: the subjects whose id, name, one-line text or listed contracts contain what was typed. A full
 * address (with or without a chain) keeps exactly the subjects findSubject would accept for it.
 */
export function matchesQuery(s: Findable & { name: string; oneLine: string }, raw: string): boolean {
  const needle = raw.trim().toLowerCase();
  if (!needle) return true;
  const q = parseLookup(raw);
  if (q.kind === "address") return holdsContract(s, q.address, q.chainId);
  const n = q.kind === "domain" ? q.domain : needle;
  const hay = [s.id, s.name, s.oneLine, ...contractsOf(s).map((c) => c.address)];
  return hay.some((x) => x.toLowerCase().includes(n) || x.toLowerCase().includes(needle));
}

/** The bar's value for a subject id handed over by "Add this project": a domain, or "chain:0x…". */
export const lookupText = (id: string) => id.trim();

/* ---------- Record: search, settled filter, repeats ---------- */

/** Line text for the record search: lower case, accents dropped, each run of punctuation or spacing one word break. */
export const normText = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();

/**
 * Line text for the repeat check only: lower case, accents and insignificant punctuation removed, then runs of
 * whitespace collapsed. What changes a fact is kept: a sign before a number (+5 and −5 differ; U+2212 is "-"), a
 * decimal point (1.5 and 15 differ), math symbols, currency signs and %. Grouping commas or spaces in thousands are
 * dropped, so "1,000" and "1000" are the same. The search keeps normText's word breaks.
 */
export const repeatKey = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\u2212\u2012\u2013\u2014\uFE63\uFF0D]/g, "-")
    .replace(/(\d)[,\u00a0\u202f' ](?=\d{3}(?!\d))/g, "$1")
    .replace(/(\d)\.(?=\d)/g, "$1\u0001")
    .replace(/(^|[^\p{L}\p{N}])-(?=\d)/gu, "$1\u0002")
    .replace(/[^\p{L}\p{N}\s\p{Sm}\p{Sc}%\u0001\u0002]+/gu, "")
    .replace(/\u0001/g, ".")
    .replace(/\u0002/g, "-")
    .replace(/\s+/g, " ")
    .trim();

/**
 * Groups of two or more lines with the same text, ignoring case and punctuation, in record order. The warning
 * counts every line after the first of its group: "N lines repeat another line".
 */
export function repeatsOf(lines: Line[]): Line[][] {
  const groups = new Map<string, Line[]>();
  for (const l of lines) {
    const k = repeatKey(l.text);
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

/** A row shown for several identical lines matches the text or the speaker of any of them: its details list them all. */
export function rowMatches(r: { line: Pick<Line, "text" | "by">; same?: { line: Pick<Line, "text" | "by"> }[] }, raw: string): boolean {
  return lineMatches(r.line, raw) || (r.same ?? []).some((o) => lineMatches(o.line, raw));
}

/** A line with at least one confirms or contradicts link (a partly link does not settle it). */
export const isSettled = (l: Pick<Line, "links">) => l.links.some((k) => k.type === "confirms" || k.type === "contradicts");

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

const KIND_RANK: Record<string, number> = { proof: 0, statement: 1, claim: 2 };
const uniq = <T,>(xs: T[]) => [...new Set(xs)];

/**
 * Lines with the same text, ignoring case and punctuation, become ONE row: the row of the strongest kind (proof,
 * then statement, then claim; the first in record order among equals) stays where it is and carries the others in
 * `same`; its line takes every source, origin and link of the group, so counts and filters count it once.
 * `alias` maps each folded line id to the id of the row that shows it. Pure, for tests.
 */
export function mergeRepeats<R extends { line: Line; same?: R[] }>(sections: { section: string; rows: R[] }[]): { sections: { section: string; rows: R[] }[]; alias: Map<string, string>; merged: number } {
  const groups = new Map<string, R[]>();
  for (const s of sections)
    for (const r of s.rows) {
      const k = repeatKey(r.line.text);
      if (k) groups.set(k, [...(groups.get(k) ?? []), r]);
    }
  const keep = new Map<R, R>();
  const drop = new Set<R>();
  const alias = new Map<string, string>();
  let merged = 0;
  for (const g of groups.values()) {
    if (g.length < 2) continue;
    const host = [...g].sort((a, b) => (KIND_RANK[a.line.kind] ?? 3) - (KIND_RANK[b.line.kind] ?? 3))[0]!;
    const others = g.filter((r) => r !== host);
    const ids = new Set(g.map((r) => r.line.id));
    const links = uniq(g.flatMap((r) => r.line.links.map((k) => JSON.stringify(k))))
      .map((s) => JSON.parse(s) as Line["links"][number])
      .filter((k) => !ids.has(k.target.trim()));
    const line: Line = {
      ...host.line,
      srcKeys: uniq(g.flatMap((r) => r.line.srcKeys)),
      sources: uniq(g.flatMap((r) => r.line.sources)),
      from: uniq(g.flatMap((r) => r.line.from)),
      links,
    };
    keep.set(host, { ...host, line, same: others });
    for (const r of others) {
      drop.add(r);
      if (r.line.id) alias.set(r.line.id, host.line.id);
    }
    merged += others.length;
  }
  return {
    sections: sections.map((s) => ({ section: s.section, rows: s.rows.filter((r) => !drop.has(r)).map((r) => keep.get(r) ?? r) })).filter((s) => s.rows.length > 0),
    alias,
    merged,
  };
}
