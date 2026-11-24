/**
 * Key facts address display, pure for tests: a value's text split into plain runs and addresses, each address with
 * the chain written right after it ("0x… on Ethereum", "0x…, Ethereum chain 1", "0x… Base"), which is taken out of
 * the text and shown as the address's chain tag. Also the Chains row as one "Chain: role" entry per chain.
 */
import { anyChainIdOf, chainLabel, CHAIN_CHOICES } from "./subject";

export type Run = { kind: "text"; text: string } | { kind: "address"; address: string; chain: string };

const NAMES = [
  "Ethereum mainnet", "Ethereum Mainnet", "Ethereum", "Base mainnet", "Base", "Robinhood Chain", "Sepolia testnet", "Sepolia", "Arbitrum One", "Arbitrum",
  "OP Mainnet", "Optimism", "Polygon PoS", "Polygon", "BNB Smart Chain", "BNB", "Unichain", "zkSync Era", "zkSync", "Linea", "Blast", "Scroll",
  "Avalanche C-Chain", "Avalanche", "Zora",
];
/**
 * Whether a name is a chain's: one of NAMES or the form's chains, or Ethereum, Solana, Unichain and a few others
 * results name, with any "mainnet", "network" or bracketed chain id after it. Pure, for tests.
 */
const MORE_CHAIN_NAMES = ["solana", "bitcoin", "polygon zkevm", "mode", "mantle", "celo", "gnosis", "gnosis chain", "sui", "aptos", "tron", "near", "starknet", "taiko", "ink", "soneium", "world chain", "abstract", "berachain", "sonic", "monad", "hyperliquid", "hyperevm", "ronin", "fantom", "cosmos", "polkadot", "cardano", "ton", "zkevm", "bnb chain", "bsc", "op", "arbitrum nova", "megaeth"];
export function isChainName(name: string): boolean {
  const n = name.trim().toLowerCase().replace(/\s*\((?:chain(?:\s*id)?\s*)?\d+\)\s*$/, "").replace(/\s+(?:mainnet|network|chain|blockchain|l1|l2)$/i, "").trim();
  if (!n) return false;
  const all = [...NAMES.map((x) => x.toLowerCase().replace(/\s+mainnet$/, "")), ...CHAIN_CHOICES.map((c) => c.name.toLowerCase()), ...MORE_CHAIN_NAMES];
  return all.includes(n) || all.includes(`${n} chain`);
}
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

/** An address on a token's other chain: its own chain ("" when the text names none) and a short note such as "Fren Pet". */
export interface OtherAddr {
  address: string;
  chain: string;
  note: string;
}
const CHAIN_ONLY = new RegExp(`^(?:on\\s+)?(${NAME_RE})(?:\\s+mainnet)?$`, "i");
/**
 * A chain written just before an address: "Polygon: 0x…", "on Polygon 0x…", "Polygon (chain 137) 0x…", "bridged to
 * Polygon PoS at 0x…", "Polygon contract 0x…", "on Polygon it is 0x…", "on Ethereum and Polygon (0x…)". The whole lead
 * ("bridged to Polygon PoS at") is matched, so it can be taken out of the text; group 2 is an opening bracket.
 */
const BEFORE = new RegExp(`(?:^|[\\s,;(])(?:(?:also|bridged|deployed)\\s+)?(?:(?:on|to)\\s+(?:the\\s+)?)?(${NAME_RE})(?:\\s+mainnet)?(?:\\s*\\(\\s*(?:chain(?:\\s*id)?\\s*)?\\d+\\s*\\))?(?:\\s+(?:at|contract|address|token|it\\s+is|is))*\\s*[:=–-]?\\s*(\\()?\\s*$`, "i");
/** An address right after a chain name: AFTER's chain then belongs to that address, not to the one before it. */
const NEXT_ADDRESS = /^\s*(?:\(\s*chain(?:\s*id)?\s*\d+\s*\)\s*)?(?:(?:at|contract|address|token|it\s+is|is)\s+)*[:=–-]?\s*\(?\s*0x[0-9a-fA-F]{40}/i;

/** The chain written after an address at `end` ("0x… on Base"), unless that chain leads the next address. */
function chainAfter(text: string, end: number): { chain: string; length: number } | null {
  const rest = text.slice(end);
  const after = AFTER.exec(rest);
  if (!after || !after[0].trim()) return null;
  if (NEXT_ADDRESS.test(rest.slice(after[0].length))) return null;
  return { chain: after[1] ? chainTag(after[1]) : chainTag(after[2]!), length: after[0].length };
}

/** A Tokens piece that is only a chain and an address ("Polygon 0x…", "0x… on Base", "also on Polygon: 0x…"). */
export function chainOnlyPiece(text: string): { address: string; chain: string } | null {
  const all = [...text.matchAll(ADDRESS)];
  if (all.length !== 1) return null;
  const m = all[0]!;
  const lead = text.slice(0, m.index!).trim();
  const tail = text.slice(m.index! + m[0].length).replace(/^\s*\)/, "").trim();
  if (lead && !tail) {
    const b = BEFORE.exec(` ${lead} `.replace(/\s+$/, " "));
    if (b && !` ${lead}`.slice(0, b.index).replace(/^[\s,;(]*(?:also\s*)?/i, "").trim()) return { address: m[0], chain: chainTag(b[1]!) };
    return null;
  }
  if (!lead && tail) {
    const a = AFTER.exec(` ${tail}`);
    if (a && a[0].trim() && !` ${tail}`.slice(a[0].length).replace(/[\s.,;)]+/g, "")) return { address: m[0], chain: a[1] ? chainTag(a[1]) : chainTag(a[2]!) };
  }
  return null;
}

/**
 * Every address in a token's text after its home address was taken out, each with the chain written right after it
 * ("0x… on Polygon", "0x… (Polygon)") or right before it ("Polygon: 0x…"), and the text left without them. An
 * address whose chain is not written gets no chain: it is never given the token's home chain. Pure, for tests.
 */
export function otherAddresses(text: string): { rest: string; also: OtherAddr[] } {
  const also: OtherAddr[] = [];
  let out = "";
  let at = 0;
  for (const m of text.matchAll(ADDRESS)) {
    const start = m.index!;
    let before = text.slice(at, start);
    let end = start + m[0].length;
    let chain = "";
    const after = chainAfter(text, end);
    if (after) {
      chain = after.chain;
      end += after.length;
    } else {
      const b = BEFORE.exec(before);
      if (b) {
        chain = chainTag(b[1]!);
        before = before.slice(0, b.index + (/^[\s,;]/.test(b[0]) ? 1 : 0));
        // "(0x…)" after the chain: its closing bracket goes with it.
        if (b[2]) {
          const close = /^\s*\)/.exec(text.slice(end));
          if (close) end += close[0].length;
        }
      }
    }
    let note = "";
    const paren = /^\s*\(([^()]{1,60})\)/.exec(text.slice(end));
    if (paren) {
      const inner = paren[1]!.trim();
      const c = CHAIN_ONLY.exec(inner);
      if (c && !chain) chain = chainTag(c[1]!);
      else if (!c) note = inner;
      end += paren[0].length;
    }
    out += before;
    also.push({ address: m[0], chain, note });
    at = end;
  }
  out += text.slice(at);
  const rest = tidy(out.replace(/\(\s*\)/g, " ").replace(/\b(?:also(?:\s+(?:on|deployed on|bridged to))?|bridged to|and)\s*(?=[,;.]|$)/gi, " ").replace(/\s+/g, " "));
  return { rest, also };
}

/** The first address in a text with its chain, and the text without it ("Borrowing dollar"), punctuation tidied. */
export function takeAddress(text: string, fallback = ""): { address: string; chain: string; rest: string; lead: string; tail: string } | null {
  const m = new RegExp(ADDRESS.source).exec(text);
  if (!m) return null;
  let end = m.index + m[0].length;
  const after = chainAfter(text, end);
  let chain = "";
  if (after) {
    chain = after.chain;
    end += after.length;
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
