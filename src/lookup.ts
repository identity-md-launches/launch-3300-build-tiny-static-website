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
 * Line text for the repeat check only: lower case, accents and punctuation removed (not turned into spaces, so
 * "1,000" and "1000" are the same), then runs of whitespace collapsed. The search keeps normText's word breaks.
 */
export const repeatKey = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\p{L}\p{N}\s]+/gu, "")
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
