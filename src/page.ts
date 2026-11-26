import { isAddressFor } from "./addr";
import { statusWord as liveStatus } from "./liveness";
/** Turns untrusted page.json and lines.json into plain strings. Nothing here is ever rendered as HTML. */
import { countLines, type Counts } from "./settle";
import { registrableDomain, sameSite } from "./psl";
import { chainIdOf } from "./subject";

export const SECTIONS = ["what_it_does", "how_it_works", "money", "people", "on_chain", "history"] as const;
export const SECTION_TITLES: Record<string, string> = {
  what_it_does: "What it does",
  how_it_works: "How it works",
  money: "Money",
  people: "People",
  on_chain: "On chain",
  history: "History",
};

export type Kind = "proof" | "statement" | "claim";
/** strong: on chain; linked: a channel on another site the own domain links to as its official account; weak; none. */
export type Tie = "strong" | "linked" | "weak" | "none";

/** An on-chain fact from a proof line: a short name, the value and its unit, and where it was read. */
export interface Fact {
  name: string;
  value: string;
  unit: string;
  chain: string;
  block: string;
}
export interface Line {
  id: string;
  section: string;
  text: string;
  /** The kind shown, after the label rule. */
  kind: Kind;
  /** The kind the result file gave. */
  marked: Kind;
  /** Why a marked statement is shown as a claim; empty when the kind was kept. */
  labelNote: string;
  /** The channel the line was published on, when one matched. */
  channel: Channel | null;
  by: string;
  sources: string[];
  /** Keys into the one numbered source list (see allSources). */
  srcKeys: string[];
  quote: string;
  rerun: string;
  fact: Fact | null;
  /** The earlier lines a rebuilt line came from, as file number and id, such as F2:L14. */
  from: string[];
  /** The permanent address this line was first written at: "<job id>:<line id>" or "F2:L14" (see addresses.ts). */
  origin?: string;
  /** The other origins of a merged line. */
  also?: string[];
  /** Proof lines or panel answers (A1...) that settle this line. */
  links: LineLink[];
  /** Older readings of the same check, as block and value; the line itself holds the newest. */
  history?: Reading[];
  /** test or past when the line gives that status or its re-run is on a test network. */
  status?: "test" | "past";
}
export interface Reading {
  block: string;
  value: string;
}
/** A project this one depends on or is built on: a name, its domain or chain:contract id, the relation in a few words. */
export interface Related {
  name: string;
  /** A domain, a chain:address id, or "" when the job gave neither. */
  id: string;
  relation: string;
  lines: string[];
}
/** Where the logo file came from: a URL on the subject's own domain and when it was fetched. Shown as text only. */
export interface LogoSource {
  url: string;
  fetchedAt: string;
}
export interface LineLink {
  /** confirms: establishes the whole sentence as written; partly: only part of it; contradicts: shows it wrong. */
  type: "confirms" | "contradicts" | "partly" | "context" | "outdates" | "agrees";
  target: string;
  /**
   * Set on a link a changes result's affects list put on an existing line: the newer line it names marks this one
   * Contradicted or Superseded at once, whatever its kind, until a rebuild folds the change in.
   */
  affects?: boolean;
}
/** A row of the key facts box: label, value, an optional link and the line ids it rests on. */
export interface InfoRow {
  label: string;
  value: string;
  url: string;
  lines: string[];
  /** When the value lists several things, each one: shown as separate lines. Empty for a single value. */
  values: string[];
  /** Entries the result gave as { name, url } (Official accounts): each account's name and link. */
  entries?: { name: string; url: string; text?: string; status?: "live" | "test" | "past" }[];
  /** Each values entry in parts (name, text, url, address, chain), set whenever values is. */
  items?: ValueItem[];
}

/**
 * One entry of an infobox row's values. The instructions ask for objects with exactly name, text and optionally url
 * or address with chain: "UNI" / "governance token" / 0x1f98… / "Ethereum", or "UNI" / "1 billion". A string entry
 * is all text. An entry of another shape keeps every one of its parts in text, so it is never cut to a first word.
 */
export interface ValueItem {
  name: string;
  text: string;
  url: string;
  address: string;
  chain: string;
  /** True when the entry was an object (any shape), false for a plain string. */
  shaped: boolean;
  /** A token's other chains: each {chain, address} the entry lists under "also" (its home chain is chain/address). */
  also?: { chain: string; address: string }[];
  /** live, test or past when the entry gives a status. */
  status?: "live" | "test" | "past";
}

const ENTRY_KEYS = new Set(["name", "text", "url", "address", "chain"]);
/** A name, under the keys results have used for it. */
const NAME_KEYS = ["name", "symbol", "label", "title", "token", "ticker"];
const ADDRESS_KEYS = ["address", "contract", "contract_address", "token_address"];
const CHAIN_KEYS = ["chain", "network", "chain_id", "chainId"];
/** Where a token's other chains are listed: "also" as the instructions ask, or a name results have used for it. */
const ALSO_KEYS = ["also", "also_on", "other_chains", "bridged", "deployments"];

/** A token entry's other chains, each {chain, address} with a valid 0x address; [] when none are given. */
export function alsoOf(o: Record<string, unknown>): { key: string; list: { chain: string; address: string }[] } | null {
  for (const k of ALSO_KEYS) {
    const v = o[k];
    if (!Array.isArray(v)) continue;
    const list = v.slice(0, 20).flatMap((x) => {
      if (!x || typeof x !== "object" || Array.isArray(x)) return [];
      const e = x as Record<string, unknown>;
      const address = str(e.address ?? e.contract, 80).trim();
      const chain = str(e.chain ?? e.network ?? e.chain_id ?? e.chainId, 60).trim();
      return isAddressFor(address, chain) ? [{ chain, address }] : [];
    });
    if (list.length) return { key: k, list };
  }
  return null;
}

/** The readable strings of a value: a string, number or true/false as one, a list of them in its order; else none. */
function readable(v: unknown): string[] {
  if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") {
    const t = String(v).trim();
    return t ? [t] : [];
  }
  return Array.isArray(v) ? v.slice(0, 20).flatMap((x) => (typeof x === "string" || typeof x === "number" || typeof x === "boolean" ? readable(x) : [])) : [];
}

/** One values entry, read whole; null when it is empty. Pure, for tests. */
export function valueItemOf(x: unknown): ValueItem | null {
  if (typeof x === "string" || typeof x === "number") {
    const text = str(x, 300).trim();
    return text ? { name: "", text, url: "", address: "", chain: "", shaped: false } : null;
  }
  if (!x || typeof x !== "object" || Array.isArray(x)) return null;
  const o = x as Record<string, unknown>;
  const pick = (keys: string[], max: number) => {
    for (const k of keys) {
      const v = str(o[k], max).trim();
      if (v) return { key: k, v };
    }
    return null;
  };
  const nm = pick(NAME_KEYS, 120);
  const ad = pick(ADDRESS_KEYS, 80);
  const ch = pick(CHAIN_KEYS, 60);
  const url = str(o.url, 400).trim();
  // An address field is checked against the chain it names (a Solana address need not look like a key).
  const address = ad && isAddressFor(ad.v, ch?.v ?? "") ? ad.v : "";
  const status = liveStatus(o.status);
  const also = alsoOf(o);
  const used = new Set([nm?.key, address ? ad?.key : "", ch?.key, "url", also?.key, status ? "status" : ""].filter(Boolean) as string[]);
  // text as given (a list of strings under text is joined in its order); then every other readable part of an entry
  // of another shape, in order, so nothing it says is lost.
  const extra = Object.entries(o)
    .filter(([k]) => k !== "text" && !used.has(k) && !ENTRY_KEYS.has(k))
    .flatMap(([, v]) => readable(v));
  const own = readable(o.text).join(", ");
  // An address under an unexpected key that is not a 0x address stays readable as text.
  const badAddr = ad && !address ? [ad.v] : [];
  const text = [own, ...extra, ...badAddr].filter(Boolean).join(", ").slice(0, 300);
  const name = nm?.v ?? "";
  if (!name && !text && !url && !address) return null;
  return { name, text, url, address, chain: ch?.v ?? "", shaped: true, ...(also ? { also: also.list } : {}), ...(status ? { status } : {}) };
}

/** An entry as one line of text: "UNI: governance token, 0x1f98… on Ethereum", "UNI: 1 billion". */
export function valueItemText(e: ValueItem): string {
  const head = e.name && e.text ? `${e.name}: ${e.text}` : e.name || e.text;
  const addr = e.address ? `${head ? ", " : ""}${e.address}${e.chain ? ` on ${e.chain}` : ""}` : "";
  return `${head}${addr}` || e.url;
}
export interface Dropped {
  id: string;
  why: string;
}
export interface Source {
  id: string;
  ref: string;
  type: string;
  readAt: string;
  couldOpen: boolean | null;
  readVia: string;
}
export interface Channel {
  label: string;
  url: string;
  tie: Tie;
}
export interface Contract {
  address: string;
  chain: string;
  role: string;
  main: boolean;
  /**
   * live, test (a test network, or a pilot with no real value) or past, as the rebuild gives it; when it gives none, a
   * chain or role naming a test network (Sepolia, devnet, testnet…) is test, and anything else is "".
   */
  status: "live" | "test" | "past" | "";
}

/** A test network's name: Sepolia, Goerli, Holesky, Hoodi, a devnet or testnet, Fuji, Mumbai, Amoy… */
export const TEST_NETWORK = /\b(?:test[- ]?nets?|test networks?|devnets?|sepolia|goerli|g[öo]rli|holesky|hoodi|ropsten|rinkeby|kovan|fuji|mumbai|amoy|chiado|alfajores|shasta|nile)\b/i;
const statusOf = (v: unknown): Contract["status"] => {
  const s = typeof v === "string" ? v.trim().toLowerCase() : "";
  return s === "live" || s === "test" || s === "past" ? s : "";
};
/**
 * A live main-network contract: not marked test or past, and its chain and role name no test network. Only these
 * fill Main contract, Chains, Contracts, Deployed by and Controlled by.
 */
export const isLiveContract = (c: Pick<Contract, "chain" | "role" | "status">) => c.status !== "test" && c.status !== "past" && !TEST_NETWORK.test(c.chain) && !(c.status !== "live" && TEST_NETWORK.test(c.role));
/** The main contract a page gives, only when it is live on a main network (isLiveContract); else undefined. */
export const liveMainOf = (contracts: Contract[]) => contracts.find((c) => c.main && isLiveContract(c) && /^0x[0-9a-fA-F]{40}$/.test(c.address));
export type Level = "conflict" | "question";
export interface Differ {
  lines: string[];
  why: string;
  level: Level;
}
export interface SummarySentence {
  text: string;
  lines: string[];
  /** The paragraph number the job gave, or null. */
  paragraph: number | null;
}
export interface Page {
  /** The subject's domain the page was read for ("" for a chain:address subject): channels on it are Own domain. */
  domain: string;
  name: string;
  oneLine: string;
  channels: Channel[];
  contracts: Contract[];
  /** The main contract's address, or "" when the page names none. */
  main: string;
  summary: SummarySentence[];
  infobox: InfoRow[];
  lines: Line[];
  differs: Differ[];
  dropped: Dropped[];
  openQuestions: string[];
  sources: Source[];
  related: Related[];
  logo: LogoSource | null;
  /* Parts added with the screenshot instructions (rebuild-2d329d7d77e8.txt and since). Each is present only when the page file
   * gives a valid one, so a page built before them parses exactly as it did. */
  /** subject.category: what the product mainly is. */
  category?: Category;
  /** subject.app: where a person uses the product, on its own domain or a listed channel. */
  app?: AppLink;
  /** The screenshots the job listed, in its order (at most 4, one per slot). */
  screenshots?: Screenshot[];
  /** Plain-words explanations: how it works, each token, each live main-network contract. */
  explained?: Explained;
  /** Proofs a browser can re-run: one eth_call at the latest block, one value. */
  ask?: Ask[];
}

export const CATEGORIES = ["protocol", "app", "network", "token", "ai", "tool", "other"] as const;
export type Category = (typeof CATEGORIES)[number];
export interface AppLink {
  url: string;
  /** At most 3 words, such as "Open the app". */
  label: string;
}
export interface Screenshot {
  /** As the page lists it: artifacts/shot-<slot>.png. */
  file: string;
  /** 1 to 4: the output named shot-<slot> holds the PNG. */
  slot: number;
  caption: string;
  /** The page captured. */
  url: string;
  capturedAt: string;
}
export interface ExplainedSentence {
  text: string;
  lines: string[];
  /** not_checked: the job did not read enough to say it is absent. */
  kind?: "not_checked";
  /** In contracts: who can change it, or what that means for a user's funds. */
  part?: "who_can_change" | "what_it_means";
}
export interface Explained {
  howItWorks: ExplainedSentence[];
  tokens: { token: string; sentences: ExplainedSentence[] }[];
  contracts: { address: string; chain: string; sentences: ExplainedSentence[] }[];
}
export const ASK_RETURNS = ["uint", "address", "bool", "string"] as const;
export interface AskCall {
  chainId: number;
  to: string;
  data: string;
  returns: (typeof ASK_RETURNS)[number];
  decimals: number | null;
  unit: string;
}
export interface Ask {
  question: string;
  /** The proof line it re-runs. */
  line: string;
  call: AskCall;
}

const str = (v: unknown, max = 2000): string => (typeof v === "string" ? v.slice(0, max) : typeof v === "number" ? String(v) : "");
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
/**
 * A line's speakers ("by"): a text, or a list of names. A list keeps every name, in order and once each, joined
 * with "; " so the speaker logic (keyfacts.ts speakersOf) counts each of them.
 */
export const byOf = (v: unknown): string => {
  if (!Array.isArray(v)) return str(v, Number.MAX_SAFE_INTEGER);
  const out: string[] = [];
  for (const x of v) {
    const n = str(x, 300).trim();
    if (n && !out.some((o) => o.toLowerCase() === n.toLowerCase())) out.push(n);
  }
  return out.join("; ");
};
const obj = (v: unknown): Record<string, unknown> => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
const kindOf = (v: unknown): Kind => {
  const k = str(v).toLowerCase();
  return k === "proof" || k === "statement" ? k : "claim";
};
export const tieOf = (v: unknown): Tie => {
  const t = str(v).toLowerCase();
  return t === "strong" || t === "linked" || t === "weak" ? t : "none";
};
const levelOf = (v: unknown): Level => (str(v).toLowerCase() === "conflict" ? "conflict" : "question");
/**
 * The full hostname of a URL or a bare host, "www." kept: what the ownership check compares (on a shared host,
 * www.github.io is the tenant "www", not github.io). "" when it is not a URL.
 */
export function fullHostOf(v: string): string {
  try {
    return new URL(/^https?:\/\//i.test(v) ? v : `https://${v}`).hostname.toLowerCase().replace(/\.$/, "");
  } catch {
    return "";
  }
}
/**
 * A host without a leading "www." when that label is not itself the registrable part: www.uniswap.org reads as
 * uniswap.org, while www.github.io (a tenant of a shared host) stays www.github.io.
 */
export const siteHost = (host: string) => (/^www\./.test(host) && registrableDomain(host) !== host ? host.slice(4) : host);
/** A host name from a URL or a bare host, for "read via <host>": display only, never an ownership check. */
export function hostOf(v: string): string {
  try {
    return new URL(/^https?:\/\//i.test(v) ? v : `https://${v}`).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

function parseDiffers(v: unknown): Differ[] {
  return arr(v).map((d) => {
    const o = obj(d);
    return { lines: arr(o.lines).map((x) => str(x, 64)), why: str(o.why, 400), level: levelOf(o.level) };
  });
}

export function parseSummary(v: unknown): SummarySentence[] {
  return arr(v)
    .slice(0, 60)
    .map((s) => {
      const o = obj(s);
      const p = typeof o.paragraph === "number" ? o.paragraph : typeof o.paragraph === "string" && /^\d+$/.test(o.paragraph) ? Number(o.paragraph) : null;
      return { text: str(o.text, 600), lines: arr(o.lines).map((x) => str(x, 64)).filter(Boolean), paragraph: p };
    })
    .filter((s) => s.text);
}

/** Every valid link of a line, however many: a whole-record comparison may link one line to many. */
function parseLinks(v: unknown): LineLink[] {
  return arr(v)
    .flatMap((x) => {
      const o = obj(x);
      const t = str(o.type, 32).toLowerCase();
      const target = str(o.target, 64).trim();
      return (t === "confirms" || t === "contradicts" || t === "partly" || t === "context" || t === "outdates" || t === "agrees") && target ? [{ type: t as LineLink["type"], target }] : [];
    });
}

/** Every earlier reading of a proof, however many: none is dropped. */
export function parseHistory(v: unknown): Reading[] {
  return arr(v)
    .map((x) => {
      const o = obj(x);
      return { block: blockNumber(str(o.block, 64)) || str(o.block, 64).trim(), value: str(o.value, 200).trim() };
    })
    .filter((r) => r.value);
}

/** A related project's id from what the job wrote: a domain (normalised), "chain:0x…", or "" when neither. */
export function relatedId(v: string): string {
  const s = v.trim();
  const m = /^(\d+)\s*:\s*(0x[0-9a-fA-F]{40})$/.exec(s);
  if (m) return `${m[1]}:${m[2]!.toLowerCase()}`;
  if (/^0x[0-9a-fA-F]{40}$/.test(s)) return s.toLowerCase();
  // "Ethereum (chain 1): 0x…", "Base: 0x…", "eip155:8453:0x…": the chain named before the address.
  const named = /^(.{1,60}?)[\s:]+(0x[0-9a-fA-F]{40})$/.exec(s);
  if (named) {
    const pre = named[1]!.replace(/^eip155\s*:\s*/i, "");
    const id = /chain(?:\s*id)?\s*(\d{1,12})/i.exec(pre)?.[1] ?? (/^\d{1,12}$/.test(pre.trim()) ? pre.trim() : null);
    const chain = id !== null ? Number(id) : chainIdOf(pre.replace(/\(.*\)/, "").replace(/:$/, ""));
    return chain !== null ? `${chain}:${named[2]!.toLowerCase()}` : named[2]!.toLowerCase();
  }
  const host = hostOf(s).toLowerCase();
  return /^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(host) ? host : "";
}

export function parseRelated(v: unknown): Related[] {
  return arr(v)
    .slice(0, 20)
    .map((x) => {
      const o = obj(x);
      return { name: str(o.name, 120).trim(), id: relatedId(str(o.id, 200)), relation: str(o.relation, 200).trim(), lines: arr(o.lines).map((l) => str(l, 64)).filter(Boolean) };
    })
    .filter((r) => r.name);
}

function parseLogo(v: unknown): LogoSource | null {
  const o = obj(v);
  const url = str(o.url, 400).trim();
  // A share image, banner or wordmark is never the logo, even saved square: its artwork is already cut off. The row
  // then shows the letter tile until a site icon, app icon or official avatar is recorded.
  if (!url || isShareImage(url)) return null;
  return { url, fetchedAt: str(o.fetched_at ?? o.time ?? o.at, 64).trim() };
}

/**
 * True for the URL of a social share image, banner or wordmark rather than a square icon: a file or folder named og,
 * opengraph, share, social, card, banner, twitter, preview, cover, hero, header or wordmark (tacit.finance's
 * /tacit-card.png, /og-image.png, /images/social/banner.jpg). Icons (favicon, apple-touch-icon, icon-512, avatars
 * at pbs.twimg.com/profile_images or avatars.githubusercontent.com) are not.
 */
export function isShareImage(url: string): boolean {
  let path = url;
  try {
    path = new URL(url).pathname;
  } catch {
    /* a bare path */
  }
  path = decodeURIComponent(path).toLowerCase();
  if (/(?:^|[/_.-])(?:favicon|apple-touch-icon|icon|icons|logo-?mark|avatar|avatars|profile_images)(?:[/_.-]|\d|$)/.test(path)) return false;
  return /(?:^|[/_.-])(?:og|og-?image|opengraph|open-?graph|share|sharing|social|card|cards|banner|banners|twitter|twitter-?card|preview|cover|hero|header|wordmark|lockup|meta-?image)(?:[/_.-]|\d|$)/.test(path);
}

function parseDropped(v: unknown): Dropped[] {
  // Every dropped entry is kept: the record has no line limit, so neither has the list of what it dropped.
  return arr(v)
    .map((d) => {
      const o = obj(d);
      return { id: str(o.id, 64).trim(), why: str(o.why, 400) };
    })
    .filter((d) => d.id);
}

/**
 * Short paragraphs: by the job's paragraph numbers when it gave them (a new paragraph wherever the number
 * changes), otherwise three sentences at a time.
 */
export function paragraphsOf<T extends { paragraph: number | null }>(sentences: T[]): T[][] {
  const out: T[][] = [];
  const numbered = sentences.some((s) => s.paragraph !== null);
  sentences.forEach((s, i) => {
    const prev = sentences[i - 1];
    const start = i === 0 || (numbered ? s.paragraph !== null && s.paragraph !== prev?.paragraph : i % 3 === 0);
    if (start) out.push([s]);
    else out[out.length - 1]!.push(s);
  });
  return out;
}

/* ---------- Facts ---------- */

/** Chain names matched as whole words (so "database" is not Base), and the chain ids that name them. */
const CHAINS: { name: string; re: RegExp; id: number | null }[] = [
  { name: "Robinhood Chain", re: /\brobinhood chain\b/i, id: null },
  { name: "Ethereum", re: /\bethereum\b/i, id: 1 },
  { name: "Base", re: /\bbase\b(?![\s_-]*(?:fee|url|64)\b)/i, id: 8453 },
  { name: "Arbitrum", re: /\barbitrum\b/i, id: 42161 },
  { name: "Optimism", re: /\boptimism\b/i, id: 10 },
  { name: "Polygon", re: /\bpolygon\b/i, id: 137 },
  { name: "Solana", re: /\bsolana\b/i, id: null },
];

/** The one chain a text names, by whole name or by "chain id N"; "" when it names none or more than one. */
function chainIn(hay: string): string {
  const found = new Set<string>();
  for (const c of CHAINS) if (c.re.test(hay)) found.add(c.name);
  for (const m of hay.matchAll(/\bchain(?:\s*-?\s*id)?\s*[:=]?\s*(0x[0-9a-f]+|\d+)\b/gi)) {
    const n = Number(m[1]!.toLowerCase().startsWith("0x") ? parseInt(m[1]!, 16) : m[1]);
    const c = CHAINS.find((x) => x.id === n);
    found.add(c ? c.name : `chain id ${n}`);
  }
  if (!found.size && /\b(?:ethereum\s+)?mainnet\b/i.test(hay)) found.add("Ethereum");
  return found.size === 1 ? [...found][0]! : "";
}

/** A block number written in decimal (26,445,600) or hex (0x1938720), as plain decimal digits. */
export function blockNumber(v: string): string {
  const t = v.trim().replace(/[,_\s]/g, "");
  if (/^\d+$/.test(t)) return t.replace(/^0+(?=\d)/, "");
  if (/^0x[0-9a-f]+$/i.test(t)) return BigInt(t).toString();
  return "";
}

/** The one block a text names; "" when it names none or several different ones. */
function blockIn(hay: string): string {
  const found = new Set<string>();
  for (const m of hay.matchAll(/\bblock\s+(?:number\s+|height\s+)?(?:#\s*)?(0x[0-9a-f]+|\d[\d,_]{2,}\d|\d{3,})\b/gi)) {
    const b = blockNumber(m[1]!);
    if (b) found.add(b);
  }
  return found.size === 1 ? [...found][0]! : "";
}

/**
 * The chain and block of a proof line. fact.chain and fact.block are kept as given. Otherwise they are read
 * from the re-run steps, then from the line's text, and only when exactly one chain or block is named.
 */
export function chainAndBlock(fact: Record<string, unknown>, text: string, rerun: string): { chain: string; block: string } {
  const chain = str(fact.chain, 64).trim() || chainIn(rerun) || chainIn(text);
  const block = str(fact.block, 32).trim() || blockIn(rerun) || blockIn(text);
  return { chain, block };
}

function parseFact(v: unknown, text: string, rerun: string): Fact | null {
  const o = obj(v);
  const name = str(o.name, 120);
  const value = str(o.value, 200);
  if (!name || !value) return null;
  return { name, value, unit: str(o.unit, 40), ...chainAndBlock(o, text, rerun) };
}

/* ---------- The label rule ---------- */

const norm = (url: string) => {
  try {
    const u = new URL(url);
    return { host: siteHost(u.hostname.toLowerCase()), path: u.pathname.replace(/\/+$/, "").toLowerCase() };
  } catch {
    return null;
  }
};
/**
 * How a channel shows to visitors: Own domain when it is on the subject's domain or a subdomain of it, Verified
 * on chain for tie strong, Not verified otherwise. Only lines on Own domain or Verified on chain channels show as statements.
 */
export type ChannelStatus = "own" | "verified" | "linked" | "unverified";
export const STATUS_WORDS: Record<ChannelStatus, string> = { own: "Own domain", verified: "Verified on chain", linked: "Linked from own site", unverified: "Not verified" };
/**
 * True when url's host is the subject's own domain: the registrable domain of `domain` (public suffix rules, see
 * src/psl.ts) or any subdomain of it. A subject recorded as app.uniswap.org owns uniswap.org and *.uniswap.org; a
 * project on a shared host (me.github.io) owns only its own subdomain.
 */
export function onDomain(url: string, domain: string): boolean {
  // The full hostname, before any "www." handling: a www tenant of a shared host owns www.github.io itself.
  return sameSite(fullHostOf(url), domain);
}
export function channelStatus(c: Pick<Channel, "url" | "tie">, domain: string): ChannelStatus {
  if (onDomain(c.url, domain)) return "own";
  // A channel on another site that the own domain links to as its official account (tie linked): its lines count
  // as statements, and it shows as "Linked from own site", never as Own domain.
  return c.tie === "strong" ? "verified" : c.tie === "linked" ? "linked" : "unverified";
}
/** What each label means, for the key under the channels list and a badge's title. */
export const STATUS_HELP: Record<ChannelStatus, string> = {
  own: "Own domain: on the subject's domain or a subdomain of it.",
  verified: "Verified on chain: a contract, ENS record or deployer wallet points to it.",
  linked: "Linked from own site: an account on another site that the project's own domain links to as its official account.",
  unverified: "Not verified: none of these.",
};
/** The four groups on Sources, in this order. */
export const STATUS_ORDER: ChannelStatus[] = ["own", "verified", "linked", "unverified"];
/** The address two channel entries are compared by: host without "www." and path, case and trailing slash aside. */
export function channelKey(url: string): string {
  const n = norm(url.trim());
  return n ? `${n.host}${n.path}` : url.trim().toLowerCase().replace(/\/+$/, "");
}
export interface ShownChannel extends Channel {
  status: ChannelStatus;
}
/**
 * The channels Sources lists: entries that point to the same address (channelKey) are shown once, under the shorter
 * name, with the strongest label any of them earned. Order of first appearance is kept. Pure.
 */
export function dedupeChannels(channels: Channel[], domain: string): ShownChannel[] {
  const out: ShownChannel[] = [];
  const by = new Map<string, ShownChannel>();
  for (const c of channels) {
    const status = channelStatus(c, domain);
    const key = channelKey(c.url);
    const have = by.get(key);
    if (!have) {
      const x = { ...c, status };
      by.set(key, x);
      out.push(x);
      continue;
    }
    const name = (x: Channel) => (x.label || x.url).trim();
    if (name(c).length < name(have).length) {
      have.label = c.label;
      have.url = c.url;
    }
    if (STATUS_ORDER.indexOf(status) < STATUS_ORDER.indexOf(have.status)) {
      have.status = status;
      have.tie = c.tie;
    }
  }
  return out;
}
/** Sources' four groups with their channels, every group present even when empty. Pure. */
export function channelGroups(channels: Channel[], domain: string): { status: ChannelStatus; channels: ShownChannel[] }[] {
  const shown = dedupeChannels(channels, domain);
  return STATUS_ORDER.map((status) => ({ status, channels: shown.filter((c) => c.status === status) }));
}
/** What each group holds, one line each, without the group's own name (the heading carries it). */
export const STATUS_LINES: Record<ChannelStatus, string> = {
  own: "on the subject's domain or a subdomain of it.",
  verified: "a contract, ENS record or deployer wallet points to it.",
  linked: "an account on another site that the project's own domain links to as its official account.",
  unverified: "none of these.",
};

/** The legend under the channels on Sources. */
export const STATUS_LEGEND = "Lines published on Own domain, Verified on chain or Linked from own site channels show as statements; everything else is a claim.";
export const statusWord = (c: Pick<Channel, "url" | "tie">, domain: string) => STATUS_WORDS[channelStatus(c, domain)];

/** True when url is the channel's URL or a page under it. */
export function underChannel(url: string, channel: Channel): boolean {
  const a = norm(url);
  const c = norm(channel.url);
  if (!a || !c || a.host !== c.host) return false;
  return c.path === "" || a.path === c.path || a.path.startsWith(`${c.path}/`);
}
/** The channel a publisher name or source URL belongs to, preferring the most specific URL match. */
export function channelFor(channels: Channel[], publisher: string, urls: string[]): Channel | null {
  const p = publisher.trim().toLowerCase();
  if (p) {
    const byName = channels.find((c) => c.label.trim().toLowerCase() === p || c.url.toLowerCase().replace(/\/+$/, "") === p.replace(/\/+$/, ""));
    if (byName) return byName;
    const handle = /^@([a-z0-9_]{1,15})$/.exec(p);
    if (handle) {
      const x = channels.find((c) => {
        const n = norm(c.url);
        return n && /^(x|twitter)\.com$/.test(n.host) && n.path === `/${handle[1]}`;
      });
      if (x) return x;
    }
  }
  let best: Channel | null = null;
  for (const u of urls)
    for (const c of channels) if (underChannel(u, c) && (!best || c.url.length > best.url.length)) best = c;
  return best;
}

/** The most specific listed channel a URL is at or under, or null. */
function channelAtUrl(channels: Channel[], url: string): Channel | null {
  let best: Channel | null = null;
  for (const c of channels) if (underChannel(url, c) && (!best || c.url.length > best.url.length)) best = c;
  return best;
}

/**
 * A line shows as a statement only when it was published on one of the record's channels that is Own domain (on
 * the subject's domain or a subdomain), Verified on chain (tie strong) or Linked from own site (tie linked). Otherwise a marked statement is shown as a
 * claim. Proof and claim stay as marked.
 *
 * Where the line was published is read from its cited URLs first. When it cites any http(s) URL, at least one of
 * them must be the publication that made it: a page on the subject's domain (or a subdomain), or at or under one
 * of those listed channels. Further outside URLs are corroborating references and do not downgrade the line; a
 * line that cites only outside publications is shown as a claim. A name match on `by` can never turn an outside URL
 * into a statement. Only a line that cites no URL at all is matched by its publisher's name or handle.
 */
export function applyLabel(line: Line, channels: Channel[], publisher: string, urls: string[], domain = ""): Line {
  if (line.marked !== "statement") return { ...line, kind: line.marked, labelNote: "", channel: null };
  const published = urls.map((u) => u.trim()).filter((u) => /^https?:\/\/[^\s]+$/i.test(u));
  if (published.length) {
    const each = published.map((u) => {
      const ch = channelAtUrl(channels, u);
      return { u, ch, ok: onDomain(u, domain) || (!!ch && channelStatus(ch, domain) !== "unverified") };
    });
    const own = each.find((e) => e.ok);
    if (own) {
      const byName = channelFor(channels, publisher, []);
      const channel = each.find((e) => e.ok && e.ch)?.ch ?? (byName && channelStatus(byName, domain) !== "unverified" ? byName : null);
      return { ...line, kind: "statement", labelNote: "", channel };
    }
    const outside = each[0]!;
    const labelNote = outside.ch
      ? `Marked a statement by the job. Shown as a claim because its source ${outside.u} is on the channel ${outside.ch.label || outside.ch.url}, which is not verified: it is not on the subject's domain and no contract, ENS record or deployer wallet points to it.`
      : `Marked a statement by the job. Shown as a claim because ${published.length > 1 ? "none of its sources is" : `its source ${outside.u} is not`} on the subject's domain or one of the record's verified channels.`;
    return { ...line, kind: "claim", labelNote, channel: outside.ch };
  }
  const ch = channelFor(channels, publisher, []);
  if (ch && channelStatus(ch, domain) !== "unverified") return { ...line, kind: "statement", labelNote: "", channel: ch };
  const labelNote = ch
    ? `Marked a statement by the job. Shown as a claim because the channel ${ch.label || ch.url} is not verified: it is not on the subject's domain and no contract, ENS record or deployer wallet points to it.`
    : `Marked a statement by the job. Shown as a claim because ${publisher || "its publisher"} is not one of the record's channels.`;
  return { ...line, kind: "claim", labelNote, channel: ch };
}

/* ---------- page.json ---------- */

/**
 * The job's own refusal: a result file whose top-level "found" is false did not identify one real project
 * (templates/*.txt). Returns its notes ("" when it gave none), or null for an ordinary result.
 */
export function rejectionOf(text: string): string | null {
  try {
    const j = obj(JSON.parse(text));
    return j.found === false ? str(j.notes, 1200).trim() : null;
  } catch {
    return null;
  }
}

const words = (s: string) => s.split(/\s+/).filter(Boolean).length;

/** subject.category, when it is one of the seven. */
export function parseCategory(v: unknown): Category | null {
  const c = str(v, 32).trim().toLowerCase();
  return (CATEGORIES as readonly string[]).includes(c) ? (c as Category) : null;
}

/** subject.app: an http(s) url on the subject's own domain or under a listed channel, with a label of 1 to 3 words. */
export function parseApp(v: unknown, domain: string, channels: Channel[]): AppLink | null {
  const o = obj(v);
  const href = safeHref(str(o.url, 400).trim());
  const label = str(o.label, 60).replace(/\s+/g, " ").trim();
  if (!href || !label || words(label) > 3) return null;
  const own = !!domain && onDomain(href, domain);
  if (!own && !channels.some((c) => underChannel(href, c))) return null;
  return { url: href, label };
}

const SHOT_FILE = /^(?:\.\/)?(?:artifacts\/)?shot-([1-4])\.png$/;
/** page.screenshots: at most 4, each naming one of the four slots once; an entry with no valid file is left out. */
export function parseScreenshots(v: unknown): Screenshot[] {
  const seen = new Set<number>();
  const out: Screenshot[] = [];
  for (const x of arr(v).slice(0, 8)) {
    const o = obj(x);
    const file = str(o.file ?? o.path, 64).trim();
    const m = SHOT_FILE.exec(file);
    if (!m || seen.has(Number(m[1]))) continue;
    seen.add(Number(m[1]));
    out.push({ file, slot: Number(m[1]), caption: str(o.caption, 160).replace(/\s+/g, " ").trim(), url: str(o.url, 400).trim(), capturedAt: str(o.captured_at ?? o.time ?? o.at, 64).trim() });
    if (out.length === 4) break;
  }
  return out;
}

function parseExplainedSentences(v: unknown, max: number, parts: boolean): ExplainedSentence[] {
  return arr(v)
    .map((s): ExplainedSentence => {
      const o = obj(s);
      const kind = str(o.kind, 32).trim().toLowerCase();
      const part = str(o.part, 32).trim().toLowerCase();
      return {
        text: str(o.text, 600).trim(),
        lines: arr(o.lines).map((x) => str(x, 64).trim()).filter(Boolean),
        ...(kind === "not_checked" ? { kind: "not_checked" as const } : {}),
        ...(parts && (part === "who_can_change" || part === "what_it_means") ? { part } : {}),
      };
    })
    .filter((s) => s.text)
    .slice(0, max);
}

/** page.explained: up to 6 how-it-works sentences, up to 6 per token, at most 3 contracts with up to 5 each. Null when it says nothing. */
export function parseExplained(v: unknown): Explained | null {
  if (!v || typeof v !== "object" || Array.isArray(v)) return null;
  const o = obj(v);
  const howItWorks = parseExplainedSentences(o.how_it_works, 6, false);
  const tokens = arr(o.tokens)
    .slice(0, 20)
    .map((x) => {
      const t = obj(x);
      return { token: str(t.token ?? t.symbol ?? t.name, 80).trim(), sentences: parseExplainedSentences(t.sentences, 6, false) };
    })
    .filter((t) => t.token && t.sentences.length);
  const contracts = arr(o.contracts)
    .map((x) => {
      const c = obj(x);
      return { address: str(c.address, 64).trim(), chain: str(c.chain, 64).trim(), sentences: parseExplainedSentences(c.sentences, 5, true) };
    })
    .filter((c) => /^0x[0-9a-fA-F]{40}$/.test(c.address) && c.sentences.length)
    .slice(0, 3);
  return howItWorks.length || tokens.length || contracts.length ? { howItWorks, tokens, contracts } : null;
}

/** An eth_call's input: 0x and whole bytes in hex, bare 0x included (a call with no input, such as a precompile's). */
const ASK_DATA = /^0x(?:[0-9a-fA-F]{2})*$/;
/** Longer calldata is refused, never shortened: 64 KiB of input, as hex characters with the 0x. */
const MAX_ASK_DATA = 2 + 2 * 65536;
/**
 * page.ask: at most 3, each a question of at most 10 words, a proof line the page has, and one eth_call a browser can
 * send as given: a chain id, a contract address, hex calldata, one return type of four, its decimals and unit.
 */
export function parseAsk(v: unknown, lineIds: Set<string>): Ask[] {
  return arr(v)
    .slice(0, 12)
    .flatMap((x): Ask[] => {
      const o = obj(x);
      const question = str(o.question, 200).replace(/\s+/g, " ").trim();
      const line = str(o.line ?? o.line_id, 64).trim();
      const c = obj(o.call);
      const chainId = typeof c.chain_id === "number" ? c.chain_id : /^\d{1,12}$/.test(str(c.chain_id, 16)) ? Number(str(c.chain_id, 16)) : NaN;
      const to = str(c.to, 64).trim();
      // The calldata exactly as the page gives it: never cut or trimmed, so the browser re-runs the proof's own call.
      const data = typeof c.data === "string" && c.data.length <= MAX_ASK_DATA ? c.data : "";
      const returns = str(c.returns, 16).trim().toLowerCase();
      const d = typeof c.decimals === "number" ? c.decimals : /^\d{1,2}$/.test(str(c.decimals, 4)) ? Number(str(c.decimals, 4)) : null;
      if (!question || words(question) > 10 || !lineIds.has(line)) return [];
      if (!Number.isInteger(chainId) || chainId < 1 || !/^0x[0-9a-fA-F]{40}$/.test(to) || !ASK_DATA.test(data)) return [];
      if (!(ASK_RETURNS as readonly string[]).includes(returns)) return [];
      const decimals = d !== null && Number.isInteger(d) && d >= 0 && d <= 77 ? d : null;
      return [{ question, line, call: { chainId, to, data, returns: returns as AskCall["returns"], decimals, unit: str(c.unit, 40).trim() } }];
    })
    .slice(0, 3);
}

export function parsePage(text: string, domain = ""): Page {
  const j = obj(JSON.parse(text));
  const subject = obj(j.subject);
  const channels: Channel[] = arr(subject.channels).map((c) => {
    const o = obj(c);
    return { label: str(o.label, 120), url: str(o.url, 400), tie: tieOf(o.tie) };
  });
  const contracts: Contract[] = arr(subject.contracts).map((x) => {
    const o = obj(x);
    const c: Contract = { address: str(o.address, 64), chain: str(o.chain, 64), role: str(o.role, 300), main: o.main === true, status: statusOf(o.status) };
    // No status given: a chain or role naming a test network is a test deployment.
    if (!c.status && (TEST_NETWORK.test(c.chain) || TEST_NETWORK.test(c.role))) c.status = "test";
    return c;
  });
  const sources: Source[] = arr(j.sources).map((s) => {
    const o = obj(s);
    return {
      id: str(o.id, 64),
      ref: str(o.ref, 600),
      type: str(o.type, 64),
      readAt: str(o.read_at, 64),
      couldOpen: typeof o.could_open === "boolean" ? o.could_open : null,
      readVia: hostOf(str(o.read_via, 300)),
    };
  });
  const refOf = new Map(sources.map((s) => [s.id, s.ref]));
  // The record has no line limit: every valid line is kept, however many there are.
  const lines: Line[] = arr(j.lines)
    .map((l) => {
      const o = obj(l);
      const lineText = str(o.text, 600);
      const rerun = str(o.rerun, 600);
      const marked = kindOf(o.kind);
      const ids = arr(o.sources).map((s) => str(s, 64)).filter(Boolean);
      const line: Line = {
        id: str(o.id, 64),
        section: str(o.section, 64),
        text: lineText,
        kind: marked,
        marked,
        labelNote: "",
        channel: null,
        // A merged line names every speaker in by; the whole field is kept.
        by: byOf(o.by),
        sources: ids,
        srcKeys: ids.map((s) => `r:${s}`),
        quote: str(o.quote, 400),
        rerun,
        fact: marked === "proof" ? parseFact(o.fact, lineText, rerun) : null,
        // Every origin of a merged line is kept, however many: dropping one would also raise a false
        // "unaccounted for" warning.
        from: arr(o.from).map((x) => str(x, 64).trim()).filter(Boolean),
        origin: str(o.origin, 120).trim() || undefined,
        also: arr(o.also).map((x) => str(x, 120).trim()).filter(Boolean),
        links: parseLinks(o.links),
        history: parseHistory(o.history),
      };
      const st = liveStatus(o.status) ?? (TEST_NETWORK.test(`${line.fact?.chain ?? ""} ${rerun.slice(0, 80)}`) ? "test" : null);
      if (st === "test" || st === "past") line.status = st;
      return applyLabel(line, channels, line.by, ids.map((s) => refOf.get(s) ?? ""), domain);
    })
    .filter((l) => l.text);
  // Only a live main-network contract is the main contract: a test program marked main never is.
  const main = liveMainOf(contracts)?.address ?? "";
  return {
    domain: domain.trim().toLowerCase(),
    name: str(subject.name, 200),
    oneLine: str(subject.one_line, 400),
    channels,
    contracts,
    main: /^0x[0-9a-fA-F]{40}$/.test(main) ? main : "",
    summary: parseSummary(j.summary),
    // Every valid row is kept: Overview shows the first eight and "Show all N" over all of them.
    infobox: arr(j.infobox)
      .map((r) => {
        const o = obj(r);
        // A value entry is { name, text, url } or { name, text, address, chain } (the instructions' one shape), or a
        // plain string. Every entry is kept whole: values holds each entry's full text, items its parts.
        const raw = arr(o.values).slice(0, 20);
        const items = raw.map(valueItemOf).filter((e): e is ValueItem => !!e);
        // Official accounts entries keep their own text ("Launch announcements") beside their name and url.
        const entries = raw
          .filter((x) => x && typeof x === "object" && !Array.isArray(x))
          .map((x) => {
            const it = valueItemOf(x);
            return { name: str(obj(x).name, 200).trim(), url: str(obj(x).url, 400).trim(), text: it?.text ?? "", ...(it?.status ? { status: it.status } : {}) };
          })
          .filter((e) => e.name || e.url);
        const values = items.map(valueItemText).filter(Boolean);
        const listed = values.length > 1 || items.some((e) => e.shaped);
        return {
          label: str(o.label, 80),
          value: str(o.value, 300) || values.join("; "),
          url: str(o.url, 400),
          lines: arr(o.lines).map((x) => str(x, 64)).filter(Boolean),
          values: listed ? values : [],
          ...(listed ? { items } : {}),
          ...(entries.length ? { entries } : {}),
        };
      })
      // A row never shows "unverified" or "unknown" as its value: it is left out, as the instructions say.
      .filter((r) => r.label && r.value && !/^\s*(unverified|unknown|not known|n\/a)\.?\s*$/i.test(r.value)),
    lines,
    differs: parseDiffers(j.differs),
    dropped: parseDropped(j.dropped),
    openQuestions: arr(j.open_questions).map((q) => str(q, 600)).filter(Boolean),
    sources,
    related: parseRelated(j.related),
    logo: parseLogo(j.logo),
    ...newParts(j, subject, domain.trim().toLowerCase(), channels, lines),
  };
}

/** The parts added with the screenshot instructions, each only when the page file gives a valid one. */
function newParts(j: Record<string, unknown>, subject: Record<string, unknown>, domain: string, channels: Channel[], lines: Line[]): Partial<Page> {
  const category = parseCategory(subject.category);
  const app = parseApp(subject.app, domain, channels);
  const screenshots = parseScreenshots(j.screenshots);
  const explained = parseExplained(j.explained);
  const ask = parseAsk(j.ask, new Set(lines.filter((l) => l.kind === "proof").map((l) => l.id)));
  return {
    ...(category ? { category } : {}),
    ...(app ? { app } : {}),
    ...(screenshots.length ? { screenshots } : {}),
    ...(explained ? { explained } : {}),
    ...(ask.length ? { ask } : {}),
  };
}

/* ---------- Ordering ---------- */

/** One record row. A row whose differsWith is set sits directly under the line it differs from. */
export type Row = { line: Line; differsWith: string | null; why: string; level: Level };

/** Every section's rows; a line already shown under its pair in an earlier section is not shown twice. */
export function orderAll(page: Page): { section: string; rows: Row[] }[] {
  const placed = new Set<string>();
  return sectionsOf(page)
    .map((section) => ({ section, rows: orderSection(page, section, placed) }))
    .filter((s) => s.rows.length > 0);
}

export function orderSection(page: Pick<Page, "lines" | "differs">, section: string, placed = new Set<string>()): Row[] {
  const inSection = page.lines.filter((l) => l.section === section);
  const pairOf = new Map<string, { other: string; why: string; level: Level }>();
  for (const d of page.differs) {
    const [a, b] = d.lines;
    if (a && b && !pairOf.has(a) && !pairOf.has(b)) {
      pairOf.set(a, { other: b, why: d.why, level: d.level });
      pairOf.set(b, { other: a, why: d.why, level: d.level });
    }
  }
  const byId = new Map(page.lines.map((l) => [l.id, l]));
  const out: Row[] = [];
  for (const l of inSection) {
    if (placed.has(l.id)) continue;
    placed.add(l.id);
    out.push({ line: l, differsWith: null, why: "", level: "question" });
    const p = pairOf.get(l.id);
    const second = p && byId.get(p.other);
    if (p && second && !placed.has(second.id)) {
      placed.add(second.id);
      out.push({ line: second, differsWith: l.id, why: p.why, level: p.level });
    }
  }
  return out;
}

/** Sections in the brief's order, then any the page named that the brief did not. */
export function sectionsOf(page: Pick<Page, "lines">): string[] {
  const named = new Set(page.lines.map((l) => l.section));
  const known = SECTIONS.filter((s) => named.has(s));
  const extra = [...named].filter((s) => !(SECTIONS as readonly string[]).includes(s));
  return [...known, ...extra];
}

/** Only http(s) links become anchors; anything else stays plain text. */
export function safeHref(url: string): string | null {
  try {
    const u = new URL(url);
    return u.protocol === "https:" || u.protocol === "http:" ? u.href : null;
  } catch {
    return null;
  }
}

/* ---------- Source jobs (artifacts/lines.json) ---------- */

export interface SourceRef {
  id: string;
  url: string;
  type: string;
  publisher: string;
  publishedAt: string;
  readAt: string;
  couldOpen: boolean | null;
  readVia: string;
  /** false when the job judged the source not about the subject. */
  aboutSubject: boolean | null;
  aboutWhy: string;
  /** The job's own answer; the site does not rely on it (see applyLabel). */
  isChannel: boolean;
}
export interface SourceLine extends Line {
  /** The line's one source, from the same file. */
  source: SourceRef | null;
}
/** What happened to one source: lines it gave, could not open, or read but not about the subject. */
export type Outcome = { kind: "lines"; count: number } | { kind: "closed" } | { kind: "off"; why: string };
export interface SourceLines {
  sources: SourceRef[];
  lines: SourceLine[];
  differs: Differ[];
  /**
   * Set only when the file holds more lines, sources or items than MAX_RESULT_ENTRIES: how many it holds. The
   * Activity row then says "This result is too large to show in full: N lines". Never set for an ordinary file.
   */
  tooLarge?: number;
}

/**
 * The most lines (and sources, and changes items) one result file is read for. Every line and item is read, as page
 * results are; this bound only stops a hostile or broken file from freezing the tab, and is far past any real result
 * (a full record is a few hundred lines). A file past it is read up to it and its Activity row says so.
 */
export const MAX_RESULT_ENTRIES = 20_000;
/** The words the Activity row shows for a file past MAX_RESULT_ENTRIES. */
export const tooLargeText = (n: number) => `This result is too large to show in full: ${n.toLocaleString("en-US")} lines`;
/** Every entry of an array up to MAX_RESULT_ENTRIES, and how many it held when it held more. */
function bounded(v: unknown): { list: unknown[]; over: number | undefined } {
  const all = arr(v);
  return all.length > MAX_RESULT_ENTRIES ? { list: all.slice(0, MAX_RESULT_ENTRIES), over: all.length } : { list: all, over: undefined };
}

export function outcomeOf(data: SourceLines, s: SourceRef): Outcome {
  if (s.couldOpen === false) return { kind: "closed" };
  if (s.aboutSubject === false) return { kind: "off", why: s.aboutWhy };
  return { kind: "lines", count: data.lines.filter((l) => l.source?.id === s.id).length };
}
export function outcomeText(o: Outcome): string {
  if (o.kind === "closed") return "could not open";
  if (o.kind === "off") return `read, not about this subject: ${o.why || "no reason given"}`;
  return `${o.count} line${o.count === 1 ? "" : "s"}`;
}

/**
 * Turns an untrusted lines.json into plain strings. Proof is never accepted from a source job: it becomes a
 * claim. Marked statements keep their mark until mergeRecord applies the label rule with the record's
 * channels. Sources that could not be opened, or that are not about the subject, contribute no lines.
 */
export function parseLines(text: string, opts: { changes?: boolean } = {}): SourceLines {
  const j = obj(JSON.parse(text));
  const src = bounded(j.sources);
  const rows = bounded(j.lines);
  const sources: SourceRef[] = src.list.map((s) => {
    const o = obj(s);
    return {
      id: str(o.id, 64),
      url: str(o.url, 600),
      type: str(o.type, 64),
      publisher: byOf(o.publisher).slice(0, 400),
      publishedAt: str(o.published_at, 64),
      readAt: str(o.read_at, 64),
      couldOpen: typeof o.could_open === "boolean" ? o.could_open : null,
      readVia: hostOf(str(o.read_via, 300)),
      aboutSubject: typeof o.about_subject === "boolean" ? o.about_subject : null,
      aboutWhy: str(o.about_why, 400),
      isChannel: o.publisher_is_subject_channel === true,
    };
  });
  const byId = new Map(sources.map((s) => [s.id, s]));
  // Every line is read, as page results are: a link whose evidence is line 201 or later is kept.
  const lines: SourceLine[] = rows.list
    .map((l) => {
      const o = obj(l);
      const sourceId = str(o.source, 64);
      const source = byId.get(sourceId) ?? null;
      // A changes result may write a proof, but only one that gives re-run steps; its lines keep their links.
      const rerun = opts.changes ? str(o.rerun, 1200) : "";
      const k = kindOf(o.kind);
      const marked: Kind = k === "statement" ? "statement" : k === "proof" && rerun ? "proof" : "claim";
      return {
        id: str(o.id, 64),
        section: str(o.section, 64),
        text: str(o.text, 600),
        kind: marked,
        marked,
        labelNote: "",
        channel: null,
        by: byOf(o.by) || source?.publisher || "",
        sources: sourceId ? [sourceId] : [],
        srcKeys: [],
        quote: str(o.quote, 400),
        rerun,
        fact: marked === "proof" ? parseFact(o.fact, str(o.text, 600), rerun) : null,
        from: [],
        links: opts.changes ? parseLinks(o.links) : [],
        source,
      };
    })
    .filter((l) => l.text && l.source?.couldOpen !== false && l.source?.aboutSubject !== false);
  const over = Math.max(src.over ?? 0, rows.over ?? 0);
  return { sources, lines, differs: parseDiffers(j.differs), ...(over ? { tooLarge: rows.over ?? over } : {}) };
}

/** A record row: a research line, or a line added by a source job (with who paid and where the job is). */
export interface RecordRow extends Row {
  /** raised: the line came from a visitor's changes job ("raised by <payer>"). */
  origin: { payer: string; payerAddr?: string; jobHref: string; raised?: boolean; time?: number | null } | null;
  /** Other lines with the same text (ignoring case and punctuation), shown as this ONE row: their origins, speakers and sources. */
  same?: RecordRow[];
}
/** A row of the on-chain facts table: a proof with a fact, from the page or raised by a visitor's changes job. */
export const isFactRow = (r: RecordRow) => r.line.kind === "proof" && !!r.line.fact && (!r.origin || !!r.origin.raised);
export interface SourceJob {
  key: string;
  data: SourceLines;
  payer: string;
  /** The requesting wallet, for its profile link. */
  payerAddr?: string;
  jobHref: string;
  raised?: boolean;
  /** When the job completed (unix seconds), for a line's "First recorded". */
  time?: number | null;
}

/** One numbered source in the record's single list: research sources first, then each source job's. */
export interface ListedSource {
  key: string;
  n: number;
  url: string;
  type: string;
  readAt: string;
  couldOpen: boolean | null;
  readVia: string;
  publisher: string;
  addedBy: string | null;
  outcome: Outcome | null;
}
export function allSources(page: Page | null, jobs: SourceJob[]): ListedSource[] {
  const out: ListedSource[] = [];
  for (const s of page?.sources ?? [])
    out.push({ key: `r:${s.id}`, n: out.length + 1, url: s.ref, type: s.type, readAt: s.readAt, couldOpen: s.couldOpen, readVia: s.readVia, publisher: "", addedBy: null, outcome: null });
  for (const j of jobs)
    for (const s of j.data.sources)
      out.push({ key: `${j.key}:${s.id}`, n: out.length + 1, url: s.url, type: s.type, readAt: s.readAt, couldOpen: s.couldOpen, readVia: s.readVia, publisher: s.publisher, addedBy: j.payer, outcome: outcomeOf(j.data, s) });
  return out;
}

/**
 * Every section in order: the research lines first, then each completed source job's lines, each job's
 * differs pairs kept together (the second line directly under the first). Source lines get the label rule
 * here, against the record's channels.
 */
export function mergeRecord(page: Page | null, jobs: SourceJob[], domain = page?.domain ?? ""): { section: string; rows: RecordRow[] }[] {
  const channels = page?.channels ?? [];
  const asPage = (j: SourceJob) => ({
    lines: j.data.lines.map((l) => {
      const labelled = applyLabel(l, channels, l.source?.publisher || l.by, l.source?.url ? [l.source.url] : [], domain);
      return { ...labelled, source: l.source, id: `${j.key}:${l.id}`, srcKeys: l.source ? [`${j.key}:${l.source.id}`] : [] } as SourceLine;
    }),
    differs: j.data.differs.map((d) => ({ ...d, lines: d.lines.map((x) => `${j.key}:${x}`) })),
  });
  const pages = jobs.map((j) => ({ job: j, page: asPage(j), placed: new Set<string>() }));
  const named = new Set<string>([...(page?.lines ?? []), ...pages.flatMap((p) => p.page.lines)].map((l) => l.section));
  const sections = [...SECTIONS.filter((s) => named.has(s)), ...[...named].filter((s) => !(SECTIONS as readonly string[]).includes(s))];
  const placedResearch = new Set<string>();
  return sections
    .map((section) => {
      const rows: RecordRow[] = page ? orderSection(page, section, placedResearch).map((r) => ({ ...r, origin: null })) : [];
      for (const p of pages)
        rows.push(...orderSection(p.page, section, p.placed).map((r) => ({ ...r, origin: { payer: p.job.payer, payerAddr: p.job.payerAddr, jobHref: p.job.jobHref, raised: p.job.raised, time: p.job.time ?? null } })));
      return { section, rows };
    })
    .filter((s) => s.rows.length > 0);
}

/**
 * How many rows of each class, for the filter, section counts and Home: every line once. A settled row counts as
 * Proven or Contradicted, and each proof line counts as its own Proven row too (see settle.ts countLines).
 */
export function countKinds(sections: { rows: { line: Line }[] }[]): Counts {
  return countLines(sections.flatMap((s) => s.rows.map((r) => r.line)));
}

/* ---------- Edits (artifacts/edit.json) ---------- */

export type Verdict = "supported" | "supported_by_source" | "unsupported";
export interface EditSentence {
  text: string;
  verdict: Verdict;
  lines: string[];
  corrected: string;
  why: string;
}
export interface EditResult {
  sentences: EditSentence[];
  accepted: SummarySentence[];
  /** The edit's new sources and lines, read like an added-source result. */
  data: SourceLines;
}
const verdictOf = (v: unknown): Verdict => {
  const t = str(v).toLowerCase();
  return t === "supported" || t === "supported_by_source" ? t : "unsupported";
};
export const VERDICT_WORDS: Record<Verdict, string> = {
  supported: "supported by the record",
  supported_by_source: "supported by a new source",
  unsupported: "not supported",
};

export function parseEdit(text: string): EditResult {
  const j = obj(JSON.parse(text));
  return {
    // 1,500 characters of proposed text: every verdict is kept up to a bound no real edit reaches.
    sentences: arr(j.sentences)
      .slice(0, 400)
      .map((s) => {
        const o = obj(s);
        return { text: str(o.text, 600), verdict: verdictOf(o.verdict), lines: arr(o.lines).map((x) => str(x, 64)).filter(Boolean), corrected: str(o.corrected, 600), why: str(o.why, 400) };
      })
      .filter((s) => s.text),
    accepted: parseSummary(j.accepted_summary),
    data: parseLines(text),
  };
}

/* ---------- Accounting after a rebuild ---------- */

/** The line ids and texts in one earlier result file (page.json, lines.json or edit.json). */
export function lineIdsOf(text: string): { id: string; text: string }[] {
  try {
    return arr(obj(JSON.parse(text)).lines)
      .map((l) => ({ id: str(obj(l).id, 64).trim(), text: str(obj(l).text, 600) }))
      .filter((l) => l.id);
  } catch {
    return [];
  }
}

const refKey = (s: string) => s.replace(/\s+/g, "").toUpperCase();

export interface Unaccounted {
  /** File number and line id, such as F2:L14. */
  ref: string;
  /** The file number, F1... */
  n: number;
  text: string;
}
export interface PriorLines {
  n: number;
  lines: { id: string; text: string }[];
}

/**
 * The earlier lines a reference names. "F2:L14" names line L14 of file F2. A bare "L14" (an older form) names a
 * line only when exactly one earlier file has that id; otherwise it names nothing, so it cannot clear several.
 */
export function resolvePriorRef(ref: string, files: PriorLines[]): { ref: string; n: number; text: string }[] {
  const r = refKey(ref);
  const q = /^F(\d+):(.+)$/.exec(r);
  const hits: { ref: string; n: number; text: string }[] = [];
  for (const f of files)
    for (const l of f.lines) {
      const id = refKey(l.id);
      if (q ? Number(q[1]) === f.n && q[2] === id : r === id) hits.push({ ref: `F${f.n}:${l.id}`, n: f.n, text: l.text });
    }
  return q ? hits.slice(0, 1) : hits.length === 1 ? hits : [];
}

/**
 * Every earlier file that could have supplied a dropped reference. "F2:L14" names one file; a bare "L14" (an older
 * form) names every file that has that id, so a rebuild recovering dropped lines keeps all of them in reach when the
 * origin is ambiguous. Record still shows an ambiguous bare id as given (resolvePriorRef finds no single line).
 */
export function candidateFiles(ref: string, files: PriorLines[]): number[] {
  const r = refKey(ref);
  const q = /^F(\d+):(.+)$/.exec(r);
  if (q) return [Number(q[1])];
  return [...new Set(files.filter((f) => f.lines.some((l) => refKey(l.id) === r)).map((f) => f.n))];
}

/** Every earlier line (file Fn, line id) that the rebuilt page neither carried (in a line's from) nor listed in dropped. */
export function unaccounted(page: Pick<Page, "lines" | "dropped">, files: PriorLines[]): Unaccounted[] {
  const named = new Set<string>();
  for (const ref of [...page.lines.flatMap((l) => l.from), ...page.dropped.map((d) => d.id)])
    for (const hit of resolvePriorRef(ref, files)) named.add(refKey(hit.ref));
  const out: Unaccounted[] = [];
  for (const f of files)
    for (const l of f.lines) {
      const ref = `F${f.n}:${l.id}`;
      if (!named.has(refKey(ref))) out.push({ ref, n: f.n, text: l.text });
    }
  return out;
}

/** The dropped list with each earlier line's text, when its reference names exactly one earlier line. */
export function droppedLines(page: Pick<Page, "dropped">, files: PriorLines[]): (Dropped & { ref: string; text: string })[] {
  return page.dropped.map((d) => {
    const hit = resolvePriorRef(d.id, files);
    return { ...d, ref: hit.length === 1 ? hit[0]!.ref : d.id, text: hit.length === 1 ? hit[0]!.text : "" };
  });
}

/* ---------- Changes (artifacts/changes.json) ---------- */

export interface ChangeVerdict {
  n: number;
  type: string;
  target: string;
  kept: boolean;
  why: string;
  lines: string[];
  finalText: string;
}
/**
 * One entry of a changes result's affects list: an existing line (as file and id, such as F1:L3), an infobox row
 * (its label) or a summary sentence (its text) that a new line contradicts or outdates.
 */
export interface Affect {
  kind: "line" | "infobox" | "summary";
  target: string;
  type: "contradicts" | "outdates";
  byLine: string;
}
/** Every valid affects entry, however many: each part it names is marked at once. */
export function parseAffects(v: unknown): Affect[] {
  return arr(v)
    .flatMap((x): Affect[] => {
      const o = obj(x);
      const kind = str(o.kind, 16).toLowerCase();
      const type = str(o.type, 16).toLowerCase();
      const target = str(o.target, 600).trim();
      const byLine = str(o.by_line ?? o.byLine, 64).trim();
      if ((kind !== "line" && kind !== "infobox" && kind !== "summary") || (type !== "contradicts" && type !== "outdates") || !target || !byLine) return [];
      return [{ kind, type, target, byLine }];
    });
}
/**
 * One patch of a changes result: the new value of a Key facts row (target: its label) or the new text of a summary
 * sentence (target: its current text), with the line ids it now rests on, read in the changes job's own scope.
 * The site shows it on top of the page; the next rebuild folds it in with the rest of the changes result.
 */
export interface Patch {
  kind: "infobox" | "summary";
  target: string;
  value: string;
  lines: string[];
  /**
   * remove: a Key facts row is left out (a live-only row that held a test-network program). set, or no op (older
   * results): the row's or sentence's new value; a set on a Key facts row the record lacks (Test networks) adds it.
   */
  op?: "set" | "remove";
}
/**
 * Every valid patch: a row or sentence, a target and a new value. An infobox patch with op remove, or with an empty
 * value, removes its row; a summary patch always needs its new text.
 */
export function parsePatches(v: unknown): Patch[] {
  return bounded(v).list.flatMap((x): Patch[] => {
    const o = obj(x);
    const kind = str(o.kind, 16).toLowerCase();
    const target = str(o.target, 600).trim();
    const value = str(o.value ?? o.text, 600).trim();
    const op = str(o.op, 16).trim().toLowerCase();
    const lines = arr(o.lines).map((l) => str(l, 64).trim()).filter(Boolean);
    if ((kind !== "infobox" && kind !== "summary") || !target) return [];
    if (kind === "infobox" && (op === "remove" || (!value && (o.value === "" || o.value === null)))) return [{ kind, target, value: "", lines, op: "remove" }];
    if (!value || (op && op !== "set")) return [];
    return [{ kind, target, value, lines, ...(op === "set" ? { op: "set" as const } : {}) }];
  });
}
/** A changes result's patch of an explained sentence: its exact text as target, and its new text. */
export interface ExplainedPatch {
  kind: "explained";
  target: string;
  value: string;
  lines: string[];
  op: "set";
}
export function parseExplainedPatches(v: unknown): ExplainedPatch[] {
  return bounded(v).list.flatMap((x): ExplainedPatch[] => {
    const o = obj(x);
    const target = str(o.target, 600).trim();
    const value = str(o.value ?? o.text, 600).trim();
    const op = str(o.op, 16).trim().toLowerCase();
    if (str(o.kind, 16).toLowerCase() !== "explained" || !target || !value || (op && op !== "set")) return [];
    return [{ kind: "explained", target, value, lines: arr(o.lines).map((l) => str(l, 64).trim()).filter(Boolean), op: "set" }];
  });
}
export interface ChangesResult {
  items: ChangeVerdict[];
  /** New text for explained sentences (kept for the next job's layout; nothing shows them yet). */
  explainedPatches?: ExplainedPatch[];
  /** New values for Key facts rows and summary sentences in affects (see Patch). */
  patches: Patch[];
  /** What the new lines contradict or outdate elsewhere in the record. */
  affects: Affect[];
  /** The page's open questions this job closed or reworded (an "Answer to:" note). */
  questions?: QuestionChange[];
  /** The new sources and lines, read like an added-source result, with proofs (re-run steps given) and links. */
  data: SourceLines;
}
export interface QuestionChange {
  /** The question's exact text as the page gives it. */
  target: string;
  op: "close" | "reword";
  /** The new wording, for reword. */
  text: string;
  lines: string[];
}
/** Every valid questions entry: a target and op close, or op reword with its new wording. */
export function parseQuestionChanges(v: unknown): QuestionChange[] {
  return bounded(v).list.flatMap((x): QuestionChange[] => {
    const o = obj(x);
    const target = str(o.target ?? o.question, 600).trim();
    const op = str(o.op, 16).trim().toLowerCase();
    const text = str(o.text ?? o.value, 600).trim();
    const lines = arr(o.lines).map((l) => str(l, 64).trim()).filter(Boolean);
    if (!target) return [];
    if (op === "reword" && text) return [{ target, op, text, lines }];
    if (op === "close" || op === "remove" || op === "answered" || (op === "reword" && !text)) return [{ target, op: "close", text: "", lines }];
    return [];
  });
}
export function parseChanges(text: string): ChangesResult {
  const j = obj(JSON.parse(text));
  const items = bounded(j.items);
  const data = parseLines(text, { changes: true });
  const over = Math.max(items.over ?? 0, data.tooLarge ?? 0);
  return {
    // Every item is read, as every line is (see MAX_RESULT_ENTRIES).
    items: items.list
      .map((x, i) => {
        const o = obj(x);
        const n = typeof o.n === "number" && Number.isFinite(o.n) ? o.n : Number(str(o.n, 8)) || i + 1;
        return {
          n,
          type: str(o.type, 32).toLowerCase(),
          target: str(o.target, 600),
          kept: str(o.verdict, 32).toLowerCase() === "kept",
          why: str(o.why, 400),
          lines: arr(o.lines).map((l) => str(l, 64)).filter(Boolean),
          finalText: str(o.final_text, 600),
        };
      }),
    affects: parseAffects(j.affects),
    patches: parsePatches(j.patches),
    ...(() => {
      const e = parseExplainedPatches(j.patches);
      return e.length ? { explainedPatches: e } : {};
    })(),
    questions: parseQuestionChanges(j.questions),
    data: over ? { ...data, tooLarge: data.tooLarge ?? over } : data,
  };
}
