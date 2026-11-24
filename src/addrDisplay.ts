/**
 * Key facts address display, pure for tests: a value's text split into plain runs and addresses, each address with
 * the chain written right after it ("0x… on Ethereum", "0x…, Ethereum chain 1", "0x… Base"), which is taken out of
 * the text and shown as the address's chain tag. Also the Chains row as one "Chain: role" entry per chain.
 */
import { anyChainIdOf, chainLabel } from "./subject";

export type Run = { kind: "text"; text: string } | { kind: "address"; address: string; chain: string };

const NAMES = [
  "Ethereum mainnet", "Ethereum Mainnet", "Ethereum", "Base mainnet", "Base", "Robinhood Chain", "Sepolia testnet", "Sepolia", "Arbitrum One", "Arbitrum",
  "OP Mainnet", "Optimism", "Polygon PoS", "Polygon", "BNB Smart Chain", "BNB", "Unichain", "zkSync Era", "zkSync", "Linea", "Blast", "Scroll",
  "Avalanche C-Chain", "Avalanche", "Zora",
];
const NAME_RE = NAMES.map((n) => n.replace(/[.*+?^${}()|[\]\\-]/g, "\\$&")).join("|");
/** What may follow an address to name its chain: ", on Ethereum (chain 1)", " Base", " on chain 8453". */
const AFTER = new RegExp(`^,?\\s*(?:on\\s+(?:the\\s+)?)?(?:(${NAME_RE})(?:\\s*,?\\s*(?:\\(\\s*(?:chain(?:\\s*id)?\\s*)?\\d+\\s*\\)|chain(?:\\s*id)?\\s*\\d+)(?![\\w]))?|\\(?chain(?:\\s*id)?\\s*(\\d+)\\)?)`, "i");
const ADDRESS = /0x[0-9a-fA-F]{40}(?![0-9a-fA-F])/g;

/** "Base" for "Base mainnet", "8453" or "base"; "" for nothing. */
export const chainTag = (v: string) => (v ? chainLabel(v.replace(/\s+mainnet$/i, "")) : "");

/** The runs of a text: plain text and addresses, each address with the chain written after it, else `fallback`. */
export function addressRuns(text: string, fallback = ""): Run[] {
  const out: Run[] = [];
  let at = 0;
  for (const m of text.matchAll(ADDRESS)) {
    const start = m.index!;
    if (start > at) out.push({ kind: "text", text: text.slice(at, start) });
    let end = start + m[0].length;
    const after = AFTER.exec(text.slice(end));
    let chain = "";
    if (after && after[0].trim()) {
      chain = after[1] ? chainTag(after[1]) : chainTag(after[2]!);
      end += after[0].length;
    }
    out.push({ kind: "address", address: m[0], chain: chain || chainTag(fallback) });
    at = end;
  }
  if (at < text.length) out.push({ kind: "text", text: text.slice(at) });
  return out.filter((r) => r.kind === "address" || r.text.length > 0);
}

/** The first address in a text with its chain, and the text without it ("Borrowing dollar"), punctuation tidied. */
export function takeAddress(text: string, fallback = ""): { address: string; chain: string; rest: string; lead: string; tail: string } | null {
  const m = new RegExp(ADDRESS.source).exec(text);
  if (!m) return null;
  let end = m.index + m[0].length;
  const after = AFTER.exec(text.slice(end));
  let chain = "";
  if (after && after[0].trim()) {
    chain = after[1] ? chainTag(after[1]) : chainTag(after[2]!);
    end += after[0].length;
  }
  const lead = tidy(text.slice(0, m.index));
  const tail = tidy(text.slice(end));
  return { address: m[0], chain: chain || chainTag(fallback), rest: tidy(`${text.slice(0, m.index)} ${text.slice(end)}`), lead, tail };
}

/** Trims separators left at either end or doubled after an address was taken out. */
export const tidy = (s: string) => s.replace(/\s+([,;.])/g, "$1").replace(/([,;])\s*([,;])/g, "$1").replace(/\s{2,}/g, " ").replace(/^[\s,;:–-]+|[\s,;:–-]+$/g, "");

const LEAD = new RegExp(`^(${NAME_RE})\\b`, "i");

/** One Chains entry as "Chain" and its role: "Base app payment" → Base, "app payment"; "Ethereum mainnet" → Ethereum. */
export function chainEntry(text: string, chain: string | number | null = null): { chain: string; role: string } {
  const t = text.trim();
  const m = LEAD.exec(t);
  const named = chain !== null && chain !== "" ? chainTag(String(chain)) : "";
  if (m) {
    const role = tidy(t.slice(m[0].length).replace(/^\s*(mainnet|network)\b/i, ""));
    return { chain: named || chainTag(m[1]!), role };
  }
  return { chain: named || t, role: named ? tidy(t) : "" };
}

/** The Chains row: each chain once, in order, with its roles joined ("Base: app payment"). */
export function chainEntries(entries: { text: string; chain?: string | number | null }[]): { chain: string; role: string }[] {
  const out: { chain: string; role: string }[] = [];
  for (const e of entries) {
    const c = chainEntry(e.text, e.chain ?? null);
    if (!c.chain) continue;
    const key = anyChainIdOf(c.chain) ?? c.chain.toLowerCase();
    const have = out.find((x) => (anyChainIdOf(x.chain) ?? x.chain.toLowerCase()) === key);
    if (have) {
      if (c.role && !have.role.split(", ").includes(c.role)) have.role = have.role ? `${have.role}, ${c.role}` : c.role;
    } else out.push({ ...c });
  }
  return out;
}

/** "Chain: role" or "Chain". */
export const chainText = (c: { chain: string; role: string }) => (c.role ? `${c.chain}: ${c.role}` : c.chain);
