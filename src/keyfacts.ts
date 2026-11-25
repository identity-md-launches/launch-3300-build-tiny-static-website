/** The key facts table: from "infobox" when a rebuild wrote one, else built from the page shown. Pure, for tests. */
import { addressRuns, chainEntries, chainOfAddress, chainOnlyPiece, chainTag, otherAddresses, takeAddress, type OtherAddr } from "./addrDisplay";
import { channelFor, channelStatus, fullHostOf, hostOf, onDomain, siteHost, safeHref, STATUS_WORDS, underChannel, type Channel, type ChannelStatus, type Line, type Page, type ValueItem, type Contract, TEST_NETWORK, isLiveContract, liveMainOf } from "./page";
import { chainIdOf, chainLabel, chainName, explorerAddressUrl } from "./subject";
import { decimalsOf, wholeFact } from "./amounts";
import { proofIdsOf, settleOf } from "./settle";
import { liveFirst, livenessOf, type Liveness } from "./liveness";

export type Badge = { text: string; tone: "proof" | "statement" | "claim" | "proven" | "contradicted" | "outdated" | ChannelStatus };

export interface KeyRow {
  label: string;
  value: string;
  url: string;
  /** Small text after the value, such as the chain a contract is on. */
  note: string;
  /** The record lines the row rests on; its badge opens them. */
  lines: Line[];
  /** The channel the row names, on the Website and Official accounts rows only. */
  channel: Channel | null;
  /** From the kinds of the lines the row rests on only (badgeOf); null on a row that shows its channel's label instead. */
  badge: Badge | null;
  /**
   * The row's one channel label (Own domain, Verified on chain, Not verified), on the Website and Official accounts
   * rows only, and always set there. A list of accounts takes the most cautious label among them.
   */
  status: Badge | null;
  /**
   * An Official accounts row that lists several accounts: each account with the channel it matches, so its name
   * can link there. Their individual labels are listed on Sources; the row shows only its one status badge.
   */
  accounts: Account[];
  /** The value as a list, only when the result gave one (infobox values): each entry on its own line, in full. */
  values: string[];
  /**
   * The same list in parts, when the result gave values: each entry's name (bold), text, and link or address with
   * its chain and explorer link. Rows of tokens and accounts use tokens and accounts instead.
   */
  items?: ShownItem[];
  /** The Tokens row: one entry per token the value lists, each shown on its own line. Empty on other rows. */
  tokens: TokenItem[];  /**
   * Set when a newer source a kept change found contradicts or outdates this row (its affects list): the record
   * id of that newer line. The badge then reads "Contradicted" or "Superseded" in place of its usual one.
   */
  disputedBy?: string;
  /**
   * Every speaker the badge's lines name, strongest first, when there is more than one: the badge names only the
   * first ("Stated by Documentation +1") and the row's details list them all.
   */
  speakers?: string[];
  /** Set when a kept change patched this row: who paid for the newest patch, and the value shown just before it. */
  updatedBy?: string;
  earlier?: string;
  /** Every value this row showed before each patch, newest first: the value, who changed it and when (unix seconds). */
  history?: RowChange[];
  /** The Main contract row's name for its address ("IMD token"), shown when the value itself names none. */
  mainName?: string;
  /** True on an Official accounts row whose accounts carry different labels: each account shows its own badge. */
  perAccount?: boolean;
}

/** One patch of a row or sentence: the value shown just before it, who paid for the change and when it completed. */
export interface RowChange {
  value: string;
  /** Set when the row showed a list just before the patch (values, tokens or accounts): its item names, in order. */
  values?: string[];
  by: string;
  at: number | null;
}

/** One token of a Tokens value: its symbol, what it is for, its contract address and chain ("" when the value gives none). */
export interface TokenItem {
  symbol: string;
  purpose: string;
  address: string;
  /** The chain written with the address, such as "Ethereum" in "0x… on Ethereum". */
  chain: string;
  /** A safe explorer link for this token, when the row's url clearly points at it. */
  url: string;
  /** live, test or past when its values entry gives a status (carried through every conversion). */
  status?: "live" | "test" | "past";
  /**
   * Its other chains, after the home address: each with its own address, chain ("" when not written; never the home
   * chain by default) and a short note. Shown as "also on".
   */
  also?: OtherAddr[];
}

/** The other chains of a token: those listed under also, then those written in its text, never its home address. */
function withAlso(t: TokenItem, listed: { chain: string; address: string }[] = []): TokenItem {
  const fromText = otherAddresses(t.purpose);
  const home = t.address.toLowerCase();
  const seen = new Set<string>();
  const also = [...listed.map((x) => ({ address: x.address, chain: x.chain ? chainTag(x.chain) : "", note: "" })), ...fromText.also].filter((x) => {
    const k = `${x.address.toLowerCase()}@${x.chain.toLowerCase()}`;
    if ((x.address.toLowerCase() === home && (!x.chain || x.chain === t.chain)) || seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  return { ...t, purpose: fromText.rest, ...(also.length ? { also } : {}) };
}

/** A values entry as Overview shows it: name in bold, then text, then the link or the shortened address. */
export interface ShownItem {
  name: string;
  text: string;
  url: string;
  address: string;
  /** The chain's readable name, "" when not given. */
  chain: string;
  /** The address's block explorer page, "" without an address. */
  explorer: string;
  /** live, test or past when the entry gives one. */
  status?: "live" | "test" | "past";
}

/** A values entry for display, its chain written readably and its address with an explorer link. Pure, for tests. */
export function shownItemOf(e: ValueItem): ShownItem {
  const chain = e.chain ? chainLabel(e.chain) : "";
  return { name: e.name, text: e.text, url: safeHref(e.url) ? e.url : "", address: e.address, chain, explorer: e.address ? explorerAddressUrl(e.address, e.chain) : "", ...(e.status ? { status: e.status } : {}) };
}

/** A Tokens entry from a values object: symbol, purpose, address, chain and explorer link, each in full. */
export function tokenOfItem(e: ValueItem): TokenItem {
  const t = tokenOfItemBare(e);
  return e.status ? { ...t, status: e.status } : t;
}
function tokenOfItemBare(e: ValueItem): TokenItem {
  const s = shownItemOf(e);
  // A string entry ("UNI: governance, 0x… on Ethereum") is read as the older Tokens text was.
  if (!e.shaped) return tokensOf(e.text, "", [e.text])[0] ?? { symbol: "", purpose: e.text, address: "", chain: "", url: "" };
  // A partly structured entry ("imdUSD", "Borrowing dollar; 0x… on Ethereum") keeps its address in the text.
  const took = !s.address ? takeAddress(s.text) : null;
  if (took) return withAlso({ symbol: s.name, purpose: took.rest, address: took.address, chain: s.chain || took.chain, url: s.url && s.url.toLowerCase().includes(took.address.toLowerCase()) ? s.url : "" }, e.also);
  return withAlso({ symbol: s.name, purpose: s.text, address: s.address, chain: s.chain, url: s.explorer || s.url }, e.also);
}

/**
 * The tokens of a values list. A plain string entry that is only a chain and an address ("Polygon 0x…") is the
 * previous token on another chain: it is folded into that token's "also on", never shown as a token of its own.
 */
export function tokensOfItems(items: ValueItem[]): TokenItem[] {
  const out: TokenItem[] = [];
  for (const e of items) {
    const only = !e.shaped && out.length ? chainOnlyPiece(e.text) : null;
    if (only) {
      const prev = out[out.length - 1]!;
      const { also: was = [], ...rest } = prev;
      out[out.length - 1] = withAlso(rest, [...was.map((x) => ({ chain: x.chain, address: x.address })), only]);
    } else out.push(tokenOfItem(e));
  }
  return out;
}

/**
 * A flat legacy Tokens value (no values list) read as one token with its other chains: its first item names an
 * address and every other item is only a chain and an address ("Polygon 0x…"). Anything else stays one text value
 * (an empty list), never split into several tokens.
 */
export function flatTokens(value: string, rowUrl = ""): TokenItem[] {
  const parts = tokenParts(value);
  if (parts.length < 2 || !ADDR.test(parts[0]!) || chainOnlyPiece(parts[0]!) || !parts.slice(1).every((p) => chainOnlyPiece(p))) return [];
  const out = tokensOf(value, rowUrl);
  return out.length === 1 ? out : [];
}

/**
 * Rows that list tokens one per line: the Tokens row only. A legacy singular Token row keeps the plain linked value
 * (its symbol linked to the row's explorer URL), as pages built before the Tokens format wrote it.
 */
export const TOKEN_ROWS = /^tokens$/i;

const ADDR = /0x[0-9a-fA-F]{40}/;
/** A ticker as an item's first word: $IMD, IMD, sIMD, veCRV, USDC.e; followed by ":" or "(" (or " -"). */
const TICKER_START = /^\s*(?:\$[A-Za-z0-9][A-Za-z0-9.\-]{0,11}|[A-Za-z0-9]*[A-Z]{2,}[A-Za-z0-9.\-]*)\s*(?::|\(|[-–—]\s)/;

/**
 * Splits a Tokens value into its items. Rebuilds write one item per token separated by semicolons (or new lines).
 * An older value that runs them together with commas, such as "GOV: governance, 0x11… on Ethereum, PAY: fees,
 * 0x22… on Base", is split only where the next token starts (a ticker followed by ":" or "("), after an item that
 * already holds an address, so the chain written after an address stays with it.
 */
export function tokenParts(value: string): string[] {
  const v = value.trim();
  if (!v) return [];
  // Items are separated by semicolons (the Tokens format) or new lines; never by commas or "and".
  return v.split(/\s*(?:;|\n)\s*/).filter(Boolean);
}
void TICKER_START;

/**
 * Each token a Tokens value lists, such as "IMD: pays for jobs, 0xd34a… on Ethereum; SEAT (seat pass) 0x12… on
 * Base". The symbol is the first word when it is written like a ticker ($IMD, IMD, sIMD); the chain is what follows
 * "on" after the address; the purpose is what is left once those are taken out. `rowUrl` is kept on the one token
 * it points at: the token whose address it contains, or the only token.
 */
export function tokensOf(value: string, rowUrl = "", values: string[] = []): TokenItem[] {
  // A piece that is only a chain and an address ("Polygon 0x…") is the previous token on another chain, never a token.
  const pieces: { text: string; also: { chain: string; address: string }[] }[] = [];
  for (const p of values.length ? values : tokenParts(value)) {
    const only = pieces.length ? chainOnlyPiece(p) : null;
    if (only) pieces[pieces.length - 1]!.also.push(only);
    else pieces.push({ text: p, also: [] });
  }
  const items = pieces.map(({ text: p, also: folded }) => {
    // The first address and the chain written after it ("0x… on Ethereum", "0x… Base"); other addresses stay in the
    // purpose, where Key facts shows each with its own chain tag.
    const took = takeAddress(p);
    const address = took?.address ?? "";
    const chain = took?.chain ?? "";
    let rest = took ? took.rest : p;
    const sym = /^\s*\$?([A-Za-z0-9][A-Za-z0-9.\-]{0,11})(?=\s*(?:[:(\-–—,]|$|\s))/.exec(rest);
    // A ticker has two capitals in a row (IMD, sIMD, veCRV, USDC.e) or a $ before it; "Pays" or "Governance" is a word.
    const symbol = sym && (/[A-Z]{2,}/.test(sym[1]!) || /^\s*\$/.test(sym[0])) ? sym[1]! : "";
    if (symbol) rest = rest.slice(sym![0].length);
    const purpose = rest
      .replace(/\(\s*\)/g, " ")
      .replace(/\b(at|contract|address)\s*(?=[,;.)]|\s*$)/gi, " ")
      .replace(/\s+/g, " ")
      .replace(/^[\s:,(–—-]+|[\s:,(–—-]+$/g, "")
      .replace(/^\((.*)\)$/, "$1")
      .trim();
    return withAlso({ symbol, purpose, address, chain, url: "" }, folded);
  });
  if (rowUrl) {
    const lower = rowUrl.toLowerCase();
    const hit = items.filter((t) => t.address && lower.includes(t.address.toLowerCase()));
    const target = hit.length === 1 ? hit[0] : items.length === 1 ? items[0] : undefined;
    if (target) target.url = rowUrl;
  }
  return items;
}

/**
 * A speaker who is not named: empty, or a stand-in such as "an outside source", "a news site", "media reports". The
 * Key facts badge names the host of the line's first source instead.
 */
export function isGenericSpeaker(by: string): boolean {
  const s = by.trim().toLowerCase().replace(/[.:]+$/, "");
  if (!s) return true;
  // A bare label that names no one: "Unknown", "Anonymous", "N/A", "Source", "-".
  if (/^(?:unknown|anonymous|anon|unnamed|unattributed|unspecified|undisclosed|not stated|not named|not given|none|null|n\/?a|tbd|[-–—?]+)$/.test(s)) return true;
  return /^(?:(?:an?|the|some|one|several|various|other|multiple)\s+)?(?:(?:outside|external|third[- ]party|unnamed|anonymous|unknown|independent|online|crypto|news|media|industry)\s+)*(?:source|site|website|web site|news site|news outlet|outlet|post|article|blog|report|reports|publisher|publication|media|press|user|users|account|party|commentator|observer|someone|people|analyst|analysts|reporter|journalist|forum|community member)s?$/.test(s);
}

export interface Account {
  /** A short reader's name, such as "@zora on X" or "ourzora on GitHub"; never an address in brackets. */
  name: string;
  /** Where the account's link goes: the entry's url, else its channel's, else "" (plain text). */
  url: string;
  channel: Channel | null;
  /** What the entry says about the account ("Launch announcements"), shown after its name; "" when none. */
  text: string;
  /** live, test or past when its values entry gives a status. */
  live?: Liveness;
  /** From the account's own tie: Linked from own site (linked), Verified on chain (strong), else Not verified. */
  status: Badge | null;
}

/** An Official accounts entry as the result may give it: a name with a url. */
export type AccountEntry = { name: string; url: string; text?: string; status?: Liveness };

const SITES: Array<[RegExp, string, boolean]> = [
  [/^(?:x|twitter)\.com$/, "X", true],
  [/^github\.com$/, "GitHub", false],
  [/^(?:warpcast\.com|farcaster\.xyz)$/, "Farcaster", true],
  [/^(?:t\.me|telegram\.me)$/, "Telegram", true],
  [/^(?:discord\.gg|discord\.com)$/, "Discord", false],
  [/^medium\.com$/, "Medium", true],
  [/^(?:youtube\.com|youtu\.be)$/, "YouTube", true],
  [/^linkedin\.com$/, "LinkedIn", false],
  [/^reddit\.com$/, "Reddit", false],
  [/^mirror\.xyz$/, "Mirror", false],
  [/^instagram\.com$/, "Instagram", true],
  [/^bsky\.app$/, "Bluesky", true],
];

/**
 * A Discord or Telegram invite's name: the server or group name the page shows. A missing name, or one that is only
 * the invite code or link, reads "Discord server" or "Telegram group". Null when the link is not an invite.
 */
export function inviteName(name: string, url: string): string | null {
  const at = /^https?:\/\//i.test(url) || !url ? url : `https://${url}`;
  const discord = /^https?:\/\/(?:www\.)?(?:discord\.gg|discord(?:app)?\.com\/invite)\/([\w-]+)/i.exec(at);
  const tg = /^https?:\/\/(?:www\.)?(?:t\.me|telegram\.me)\/(?:joinchat\/|\+|%2B)([\w-]+)/i.exec(at);
  const code = (discord ?? tg)?.[1] ?? "";
  if (!code) return null;
  const n = name.trim();
  // The name with any invite address, "@" and "on Discord" taken off: only the code left means no real name was given.
  const bare = n
    .replace(/^https?:\/\//i, "")
    .replace(/^www\./i, "")
    .replace(/^(?:discord\.gg|discord(?:app)?\.com\/invite|t\.me|telegram\.me)\/?/i, "")
    .replace(/^joinchat\//i, "")
    .replace(/[?#].*$/, "")
    .replace(/\/+$/, "")
    .replace(/^[@+]+/, "")
    .replace(/\s+on\s+(?:discord|telegram)$/i, "")
    .replace(/^(?:discord|telegram)(?:\s+(?:invite|server|group))?:?\s+(?=\S)/i, "")
    .replace(/^[@+]+/, "")
    .trim();
  const plain = /^(?:(?:join|our|the|official)\s+)*(?:discord|telegram)?(?:\s*(?:invite|server|group|channel|chat|community|link))*$/i.test(n);
  return n && !plain && bare && bare.toLowerCase() !== code.toLowerCase() ? n : discord ? "Discord server" : "Telegram group";
}

/**
 * A short name for an account: "@zora on X", "ourzora on GitHub", "zora on Discord". Taken from its URL when it has
 * one on a known site; otherwise the given name with any bracketed address or URL removed.
 */
export function accountLabel(name: string, url: string): string {
  const clean = name.replace(/\s*\((?:[^)]*0x[0-9a-fA-F]{6,}[^)]*|https?:[^)]*)\)/g, "").replace(/\s*0x[0-9a-fA-F]{40}\b/g, "").trim();
  const invite = inviteName(clean, url);
  if (invite !== null) return invite;
  let u: URL | null = null;
  try {
    u = url ? new URL(/^https?:\/\//i.test(url) ? url : `https://${url}`) : null;
  } catch {
    u = null;
  }
  if (!u) return clean || name.trim();
  const host = u.hostname.toLowerCase().replace(/^(?:www|mobile|m)\./, "");
  const site = SITES.find(([re]) => re.test(host));
  const seg = u.pathname.split("/").filter(Boolean);
  let handle = (host === "linkedin.com" || host === "reddit.com" ? seg[1] : host === "discord.com" ? seg[1] : seg[0]) ?? "";
  handle = decodeURIComponent(handle).replace(/^@/, "");
  if (!site) return clean || host;
  if (!handle || /^(?:invite|channel|company|r|in|u|user|c)$/i.test(handle)) return clean && !/^https?:/i.test(clean) ? (/ on /.test(clean) ? clean : `${clean} on ${site[1]}`) : site[1];
  return `${site[2] ? "@" : ""}${handle} on ${site[1]}`;
}

/** Platform words an older value puts before handles ("X: @a, @b"), and the hosts each means. */
const PLATFORM_HOSTS: [RegExp, RegExp][] = [
  [/^(?:x|twitter)$/i, /^(?:x|twitter)\.com$/],
  [/^(?:farcaster|warpcast)$/i, /^(?:warpcast\.com|farcaster\.xyz)$/],
  [/^instagram$/i, /^instagram\.com$/],
  [/^tiktok$/i, /^tiktok\.com$/],
  [/^github$/i, /^github\.com$/],
  [/^telegram$/i, /^t\.me$/],
  [/^youtube$/i, /^youtube\.com$/],
  [/^(?:bluesky|bsky)$/i, /^bsky\.app$/],
];
const SOCIAL_HOST = /^(?:x\.com|twitter\.com|warpcast\.com|farcaster\.xyz|instagram\.com|tiktok\.com|github\.com|t\.me|youtube\.com|bsky\.app|discord\.(?:gg|com)|linkedin\.com|medium\.com|mirror\.xyz|reddit\.com)$/;

/** A channel's social host and its handle (first path segment without "@"), or null for other channels. */
function socialOf(c: Channel): { host: string; handle: string } | null {
  try {
    const u = new URL(c.url);
    const host = u.hostname.toLowerCase().replace(/^(?:www|mobile|m)\./, "");
    if (!SOCIAL_HOST.test(host)) return null;
    const seg = u.pathname.split("/").filter(Boolean);
    if (seg.length !== 1) return null;
    return { host, handle: decodeURIComponent(seg[0]!).replace(/^@/, "").toLowerCase() };
  } catch {
    return null;
  }
}

/**
 * The accounts an older text value names. The value is cut at commas, semicolons and "and" only when at least one
 * part resolves to a profile: an explicit URL ("X @zora (https://x.com/zora)", "x.com/news") or a handle that one of
 * the result's own channels has ("X: @Uniswap, @UniswapBuilders", where the platform word carries to the handles
 * after it). Every part is kept, linked or not, so nothing the value says is dropped. Returns [] otherwise.
 */
export function accountEntriesIn(text: string, channels: Channel[]): AccountEntry[] {
  const URL_RE = /\(?((?:https?:\/\/)[^\s)\],;]+|(?:www\.)?(?:x|twitter|github|instagram|tiktok|warpcast|t)\.(?:com|me)\/[^\s)\],;]+)\)?/i;
  const parts = text.split(/\s*[,;]\s*|\s+and\s+/i).map((x) => x.trim()).filter(Boolean);
  let platform: RegExp | null = null;
  const out = parts.map((part): AccountEntry => {
    const lead = /^([A-Za-z]+)\s*:?\s+(?=@|\S)/.exec(part);
    const p = lead ? PLATFORM_HOSTS.find(([re]) => re.test(lead[1]!)) : undefined;
    if (p) platform = p[1];
    const u = URL_RE.exec(part);
    if (u) {
      const url = /^https?:/i.test(u[1]!) ? u[1]!.replace(/[.,]+$/, "") : `https://${u[1]!.replace(/[.,]+$/, "")}`;
      return { name: part.replace(u[0], "").replace(/\s*:\s*$/, "").trim() || url, url };
    }
    const h = /@([A-Za-z0-9_.~-]+)/.exec(part);
    if (h) {
      const handle = h[1]!.replace(/[.]+$/, "").toLowerCase();
      const ch = channels.find((c) => {
        const so = socialOf(c);
        return !!so && so.handle === handle && (!platform || platform.test(so.host));
      });
      if (ch) return { name: `@${h[1]!.replace(/[.]+$/, "")}`, url: ch.url };
    }
    return { name: part, url: "" };
  });
  return out.some((e) => e.url) ? out : [];
}

/** Each account an Official accounts value lists ("@imd, @news"), matched to its channel by label, handle or URL. */
export function accountsOf(channels: Channel[], value: string | string[] | AccountEntry[], domain: string): Account[] {
  // A text value is split only into the profile URLs or channel handles it names (accountEntriesIn); otherwise it
  // stays one entry. A structured entry's own url is used first.
  const parts: AccountEntry[] = (typeof value === "string" ? [value] : value)
    .flatMap((p): AccountEntry[] => {
      if (typeof p !== "string") return [{ name: p.name.trim(), url: p.url.trim(), text: (p.text ?? "").trim(), ...(p.status ? { status: p.status } : {}) }];
      const found = accountEntriesIn(p, channels);
      return found.length ? found : [{ name: p.trim(), url: "" }];
    })
    .filter((p) => p.name || p.url);
  return parts.map(({ name, url: given, text = "", status: live }) => {
    const own = /^https?:\/\//i.test(name) ? name : /^[a-z0-9-]+(\.[a-z0-9-]+)+(\/\S*)?$/i.test(name) ? `https://${name}` : "";
    const url0 = safeHref(given) ? given : own;
    const channel = channelFor(channels, name, url0 ? [url0] : []);
    const url = url0 || (channel && safeHref(channel.url) ? channel.url : "");
    return { name: accountLabel(name, url), url, channel, text, ...(live ? { live } : {}), status: toBadge(accountStatus(url || name, channel, domain)) };
  });
}

/** One account's label from its own tie: on the own domain, else its channel's tie (linked, strong), else Not verified. */
function accountStatus(target: string, ch: Channel | null, domain: string): ChannelStatus {
  const url = /^https?:\/\//i.test(target) ? target : /^[a-z0-9-]+(\.[a-z0-9-]+)+(\/\S*)?$/i.test(target) ? `https://${target}` : "";
  if (url && onDomain(url, domain)) return "own";
  // A channel on the own domain matched to an off-site account (or a handle) never lends it Own domain.
  if (ch && !onDomain(ch.url, domain)) return channelStatus(ch, domain);
  return "unverified";
}

const OUTDATED: Badge = { text: "Superseded", tone: "outdated" };
/** True when a row rests on lines and every one has a newer line showing it changed. */
export function allOutdated(lines: Line[], all: Line[] = lines): boolean {
  if (!lines.length) return false;
  const proofs = proofIdsOf(all);
  const ids = new Set(all.map((l) => l.id));
  return lines.every((l) => settleOf(l, proofs, ids).state === "outdated");
}

/** A text value with " on <chain>" removed after each address, when that chain is the only one the Chains row names. */
export function withoutChain(value: string, chain: string): string {
  const c = chain.trim();
  if (!c) return value;
  const esc = c.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return value.replace(new RegExp(`(0x[0-9a-fA-F]{40})\\s*\\(?\\s*on\\s+${esc}\\s*\\)?`, "gi"), "$1");
}

/** The only rows that show a channel's tie. */
export const TIE_ROWS = /^(website|official accounts?)$/i;

/**
 * The same rule as Record's rows (settle.ts): "Contradicted" when a line the row rests on is contradicted by a proof
 * or panel answer of the record; "Proven" when one is confirmed by one; "Proven on chain" if any line is a proof;
 * else "Stated by <channel>" for a statement; else "Reported by <who>". Pass every record line as `all` so a link
 * to a proof outside the row's own lines is still seen.
 */
export function badgeOf(lines: Line[], all: Line[] = lines, sourceUrl: (l: Line) => string = () => ""): Badge | null {
  const proofs = proofIdsOf(all);
  const ids = new Set(all.map((l) => l.id));
  const states = lines.map((l) => settleOf(l, proofs, ids).state);
  if (states.includes("contradicted")) return { text: "Contradicted", tone: "contradicted" };
  // Every line the row rests on has a newer line showing it changed: the row says so in place of its badge.
  if (states.length && states.every((s) => s === "outdated")) return { text: "Superseded", tone: "outdated" };
  if (states.includes("proven")) return { text: "Proven", tone: "proven" };
  if (lines.some((l) => l.kind === "proof")) return { text: "Proven on chain", tone: "proof" };
  const names = speakersOf(lines, sourceUrl);
  if (!names.length) return null;
  const tone = lines.some((l) => l.kind === "statement") ? "statement" : "claim";
  return { text: `${tone === "statement" ? "Stated by" : "Reported by"} ${speakerShort(names)}`, tone };
}

/** One short line: the strongest speaker, then "+N" for the rest ("Documentation +1"). */
export function speakerShort(names: string[]): string {
  return names.length > 1 ? `${names[0]} +${names.length - 1}` : names[0] ?? "";
}

/** The full speaker list for a row's details, when its Stated by or Reported by badge names more than one. */
export function speakersField(badge: Badge | null, lines: Line[], sourceUrl: (l: Line) => string = () => ""): { speakers?: string[] } {
  const names = speakersOf(lines, sourceUrl);
  // A Stated by / Reported by badge names the first: the details list all once there is more than one. Any other
  // badge (Proven, Contradicted, Superseded) names none, so the details list every speaker there is.
  const named = !!badge && (badge.tone === "statement" || badge.tone === "claim");
  return names.length > (named ? 1 : 0) ? { speakers: names } : {};
}

/**
 * A changes job's patches on top of the Key facts rows shown: the row shows the new value with its normal badge,
 * worked out from the lines the patch rests on, and keeps the earlier value and who paid for its details.
 * `patches` maps a lower-case row label to the new value, its resolved lines and the payer.
 */
export function withPatches(
  rows: KeyRow[],
  patches: Map<string, RowPatchIn | RowPatchIn[]>,
  all: Line[],
  sourceUrl: (l: Line) => string = () => "",
  ctx: { channels: Channel[]; domain: string } = { channels: [], domain: "" },
): KeyRow[] {
  if (!patches.size) return rows;
  const seen = new Set(rows.map((r) => r.label.trim().toLowerCase()));
  // Patches in completion order: each one's "earlier" is the value shown just before it. A remove leaves the row out
  // (a later set brings it back); a set on a row the record lacks (Test networks) adds it after the others.
  const apply = (r0: KeyRow | null, got: RowPatchIn | RowPatchIn[]): KeyRow | null => {
    let r = r0;
    for (const p of Array.isArray(got) ? got : [got]) {
      if (p.op === "remove") r = null;
      else r = patchRow(r ?? newRow(p.label ?? r0?.label ?? ""), p, all, sourceUrl, ctx);
    }
    return r;
  };
  const out = rows.flatMap((r0) => {
    const got = patches.get(r0.label.trim().toLowerCase());
    const r = got ? apply(r0, got) : r0;
    return r ? [r] : [];
  });
  for (const [label, got] of patches) {
    if (seen.has(label)) continue;
    const list = Array.isArray(got) ? got : [got];
    const name = list.find((p) => p.label)?.label ?? label.replace(/^./, (c) => c.toUpperCase());
    const r = apply(null, list.map((p) => ({ ...p, label: p.label ?? name })));
    if (r) out.push(r);
  }
  return out;
}
const newRow = (label: string): KeyRow => ({ label, value: "", url: "", note: "", lines: [], channel: null, badge: null, status: null, accounts: [], tokens: [], values: [] });

/**
 * A patch as withPatches takes it: the new value, its resolved lines, the payer and when it completed. op remove
 * leaves the row out; label is the row's name as the patch wrote it, used when the patch adds a row.
 */
export type RowPatchIn = { value: string; lines: Line[]; payer: string; at?: number | null; op?: "set" | "remove"; label?: string };

function patchRow(r: KeyRow, p: RowPatchIn, all: Line[], sourceUrl: (l: Line) => string, ctx: { channels: Channel[]; domain: string }): KeyRow {
  {
    const tied = TIE_ROWS.test(r.label.trim());
    const badge = tied ? null : badgeOf(p.lines, all, sourceUrl);
    const { speakers: _drop, ...rest } = r;
    // A row's link and channel label belong to its value: a patched Website or Official accounts row is linked and
    // labelled from the new value and the channels, never from the value it replaced. No identifiable URL: plain text.
    const link = tied ? patchedLink(r.label, p.value, p.lines, all, ctx) : { url: "", channel: null, status: null };
    const shown = displayedOf(r);
    const before = shown.length > 1 ? shown.join("; ") : shown[0] ?? "";
    // A row the patch adds (Test networks) keeps an empty earlier value: Overview shows it as "none".
    const history: RowChange[] = [{ value: before, ...(shown.length > 1 ? { values: shown } : {}), by: p.payer, at: p.at ?? null }, ...(r.history ?? [])];
    return { ...rest, ...link, value: p.value, values: [], items: [], tokens: [], accounts: [], perAccount: false, lines: p.lines, badge, updatedBy: p.payer, earlier: before, history, ...speakersField(badge, p.lines, sourceUrl) };
  }
}

/**
 * What a row displays, as Overview draws it: its accounts' short names, its tokens, its list of values, or else
 * its one value. Patch history keeps exactly this, so an earlier entry reads as the visitor saw it.
 */
export function displayedOf(r: Pick<KeyRow, "value" | "values" | "tokens" | "accounts">): string[] {
  if (r.accounts.length) return r.accounts.map((a) => a.name);
  if (r.tokens.length) return r.tokens.map((t) => [t.symbol, t.purpose ? `(${t.purpose})` : ""].filter(Boolean).join(" ") || t.address);
  if (r.values.length) return [...r.values];
  return r.value ? [r.value] : [];
}

/** The URL a value names on its own: a whole http(s) address, or a bare host with an optional path; else "". */
export function urlOfValue(value: string): string {
  const v = value.trim();
  const url = /^https?:\/\/\S+$/i.test(v) ? v : /^[a-z0-9-]+(\.[a-z0-9-]+)+(\/\S*)?$/i.test(v) ? `https://${v}` : "";
  return url && safeHref(url) ? url : "";
}

/** The link, channel and channel label of a patched Website or Official accounts row, from its new value only. */
function patchedLink(label: string, value: string, lines: Line[], all: Line[], ctx: { channels: Channel[]; domain: string }): Pick<KeyRow, "url" | "channel" | "status"> {
  const url = urlOfValue(value);
  const row = { label, value, url };
  const isAccounts = /^official accounts?$/i.test(label.trim());
  const listed = isAccounts ? accountsOf(ctx.channels, value, ctx.domain) : [];
  const channel = (listed.length === 1 ? listed[0]!.channel : null) ?? channelOfRow(ctx.channels, row);
  // A channel the value names by label or handle gives the row its link when the value is not an address itself.
  const href = url || (channel && safeHref(channel.url) ? channel.url : "");
  const status = allOutdated(lines, all) ? OUTDATED : rowStatus({ label, value, url: href }, channel, listed, ctx.domain);
  return { url: href, channel, status };
}

/**
 * Every speaker of these lines, strongest first, in the order the result gives them: a rebuild lists every speaker
 * in by, strongest first (the project on its own channels; another person at the project; an outside publication;
 * the person about themselves). A statement leads with its channel, then the other speakers its by names. Lines are
 * read in order, statements first; a speaker named twice counts once, at its first (strongest) place.
 */
export function speakersOf(lines: Line[], sourceUrl: (l: Line) => string = () => ""): string[] {
  const out: string[] = [];
  const said = lines.filter((l) => l.kind !== "proof");
  const ordered = [...said.filter((l) => l.kind === "statement"), ...said.filter((l) => l.kind !== "statement")];
  for (const l of ordered) {
    const by = l.by.split(/\s*[;,]\s*/).map((s) => s.trim()).filter((s) => s && !isGenericSpeaker(s));
    // Every speaker counts: the statement's channel, then every name its by gives (none is assumed to be the channel).
    const channel = l.kind === "statement" ? l.channel?.label || hostOf(l.channel?.url ?? "") || (by.length ? "" : "the project") : "";
    // A claim whose speaker is not named counts as the host of its source, when it has one.
    const names = [channel, ...by, ...(l.kind !== "statement" && !by.length ? [hostOf(sourceUrl(l))] : [])].filter(Boolean);
    for (const name of names) if (!out.some((x) => x.toLowerCase() === name.toLowerCase())) out.push(name);
  }
  // No one named at all: a claim falls back to "a source not named in the record".
  if (!out.length) {
    const cl = lines.find((l) => l.kind === "claim");
    return cl ? [reporter(cl, sourceUrl)] : [];
  }
  return out;
}
/** "A", "A and B", or "A, B and 3 more". */
export function speakerList(names: string[]): string {
  if (names.length <= 1) return names[0] ?? "";
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names[0]}, ${names[1]} and ${names.length - 2} more`;
}
/** Who a claim's badge names: its speaker, or when that is missing or generic the host of its first source. */
function reporter(l: Line, sourceUrl: (l: Line) => string): string {
  if (!isGenericSpeaker(l.by)) return l.by.trim();
  return hostOf(sourceUrl(l)) || "a source not named in the record";
}

/** A channel's label as a badge: Own domain, Verified on chain or Not verified. */
export const statusBadge = (c: Channel, domain: string): Badge => toBadge(channelStatus(c, domain));
const toBadge = (s: ChannelStatus): Badge => ({ text: STATUS_WORDS[s], tone: s });

/** From most to least cautious: a row listing accounts takes the first label any of them has. */
const CAUTION: ChannelStatus[] = ["unverified", "linked", "verified", "own"];

/**
 * The label of a URL or account name with no matching channel, or with one: on the subject's domain (or a
 * subdomain) is Own domain whatever the channel list says; else the channel's label; else Not verified.
 */
function statusOf(target: string, channel: Channel | null, domain: string): ChannelStatus {
  const url = /^https?:\/\//i.test(target) ? target : /^[a-z0-9-]+(\.[a-z0-9-]+)+(\/\S*)?$/i.test(target) ? `https://${target}` : "";
  if (url && onDomain(url, domain)) return "own";
  return channel ? channelStatus(channel, domain) : "unverified";
}

/**
 * The one badge of a Website or Official accounts row. Website: from its URL (or value) and the subject's domain,
 * even when that URL is not in the channel list. Official accounts: each listed account's label, and the row shows
 * the most cautious of them (one Not verified account makes the row Not verified).
 */
export function rowStatus(row: { label: string; value: string; url: string }, channel: Channel | null, accounts: Account[], domain: string): Badge {
  if (/^official accounts?$/i.test(row.label.trim())) return toBadge(accountsStatus(row, channel, accounts, domain));
  if (accounts.length) {
    const each = accounts.map((a) => statusOf(a.name, a.channel, domain));
    return toBadge(CAUTION.find((s) => each.includes(s)) ?? "unverified");
  }
  return toBadge(statusOf(row.url || row.value, channel, domain));
}

/**
 * An Official accounts row is judged by the accounts it names, never by a link to the project's own site: an
 * account on another site (x.com, github.com) is "Linked from own site" when its channel has tie linked (the own
 * domain links to it as its official account), "Verified on chain" for tie strong, else "Not verified". Only an
 * account that is itself on the own domain is Own domain. Several accounts take the most cautious label.
 */
export function accountsStatus(row: { value: string; url: string }, channel: Channel | null, accounts: Account[], domain: string): ChannelStatus {
  const one = (name: string, ch: Channel | null): ChannelStatus => {
    const url = /^https?:\/\//i.test(name) ? name : /^[a-z0-9-]+(\.[a-z0-9-]+)+(\/\S*)?$/i.test(name) ? `https://${name}` : "";
    if (url && onDomain(url, domain)) return "own";
    // A channel on the own domain matched to an off-site account (or a handle) never lends it Own domain.
    if (ch && !onDomain(ch.url, domain)) return channelStatus(ch, domain);
    return "unverified";
  };
  // One account: its name (the value), with the row's channel when the handle matched none; the row's URL only
  // when the value names nothing else.
  const each = accounts.length > 1 ? accounts.map((a) => one(a.name, a.channel)) : accounts.length ? [one(accounts[0]!.name, accounts[0]!.channel ?? channel)] : [one(row.url || row.value, channel)];
  return CAUTION.find((s) => each.includes(s)) ?? "unverified";
}

/** The channel a row names by its URL, or by its value being the channel's label or URL. */
export function channelOfRow(channels: Channel[], row: { label: string; value: string; url: string }): Channel | null {
  return (
    channels.find((c) => row.url && (same(row.url, c.url) || (underChannel(row.url, c) && underChannel(c.url, { ...c, url: row.url })))) ??
    channels.find((c) => same(row.value, c.url) || (!!c.label && same(row.value, c.label))) ??
    null
  );
}

/** Lines published on a channel. */
const linesOn = (all: Line[], c: Channel) => all.filter((l) => l.channel && same(l.channel.url, c.url));
const same = (a: string, b: string) => a.trim().toLowerCase().replace(/\/+$/, "") === b.trim().toLowerCase().replace(/\/+$/, "");

/** The subject's website among its channels: the one at the domain itself, else the first on the domain, else one labelled website. */
export function websiteOf(channels: Channel[], domain: string): Channel | null {
  const d = domain.trim().toLowerCase();
  return (
    channels.find((c) => !!d && siteHost(fullHostOf(c.url)) === siteHost(d)) ??
    channels.find((c) => onDomain(c.url, d)) ??
    channels.find((c) => /^(web ?site|site|home ?page)$/i.test(c.label.trim())) ??
    null
  );
}

/**
 * The key facts table. With "infobox", its rows; a row's badge comes only from the kinds of the lines it rests on,
 * and only the Website and Official accounts rows also show their channel's label. Without one, at most: Website,
 * Main contract, and one symbol proof and one supply proof of the subject's own token (provesToken): a proof of
 * another contract's symbol or supply is left out, and so is the row when no proof establishes it for this token.
 * Never every channel and contract.
 */
export function keyFacts(page: Page | null, resolve: (id: string) => Line | undefined, all: Line[], sourceUrl: (l: Line) => string = () => ""): { rows: KeyRow[]; fromInfobox: boolean; otherChannels: Channel[] } {
  if (!page) return { rows: [], fromInfobox: false, otherChannels: [] };
  const domain = page.domain ?? "";
  if (page.infobox.length) {
    const used = new Set<Channel>();
    const chainsRow = page.infobox.find((r) => /^chains?$/i.test(r.label.trim()));
    const singleChain = !!chainsRow && (chainsRow.values?.length ?? 0) <= 1 && !/[,;]|\band\b/i.test(chainsRow.value);
    const rows = page.infobox.map((r): KeyRow => {
      const lines = r.lines.map(resolve).filter((l): l is Line => !!l);
      const named = channelOfRow(page.channels, r);
      if (named) used.add(named);
      const tied = TIE_ROWS.test(r.label.trim());
      // An Official accounts row naming several accounts links each account to its channel.
      const isAcc = tied && /^official accounts?$/i.test(r.label.trim());
      const listed = isAcc ? accountsOf(page.channels, r.entries?.length ? r.entries : r.values?.length ? r.values : r.value, domain) : [];
      // Official accounts always list their accounts by short name, each linked; other rows keep their plain value.
      const accounts = isAcc ? listed : listed.length > 1 ? listed : [];
      for (const a of accounts) if (a.channel) used.add(a.channel);
      // A lone account takes the channel its handle resolves to, with the row's URL or value as the fallback.
      const lone = listed.length === 1 ? listed[0]!.channel : null;
      const channel = tied && (listed.length <= 1) ? lone ?? named : null;
      if (channel) used.add(channel);
      // Exactly one badge per row: Website and Official accounts show only their channel label (worked out from
      // the URL and the subject's domain when no channel matches); every other row shows only Proven on chain,
      // Stated by or Reported by.
      // A Website or Official accounts row whose lines are all out of date says so in place of its channel label.
      const stale = tied && allOutdated(lines, all);
      const status = tied ? (stale ? OUTDATED : rowStatus(r, channel, isAcc ? listed : accounts, domain)) : null;
      // Accounts with different labels each show their own badge beside them; the row then shows none.
      const perAccount = isAcc && !stale && new Set(listed.map((a) => a.status?.tone)).size > 1;
      const badge = tied ? null : badgeOf(lines, all, sourceUrl);
      // Tokens one per line when the result gave them as a list (values). A flat legacy text is one text value,
      // except one token followed by its other chains ("ENS 0x… on Ethereum; Polygon 0x…"): that token then shows
      // its home address first and each other chain under "also on" (flatTokens).
      const isTokens = TOKEN_ROWS.test(r.label.trim());
      const rowHref = safeHref(r.url) ? r.url : "";
      const tokens = isTokens && r.items?.length ? tokensOfItems(r.items) : isTokens && r.values?.length ? tokensOf(r.value, rowHref, r.values) : isTokens ? flatTokens(r.value, rowHref) : [];
      // Every token with an address links to its block explorer, on its own chain or the single chain named.
      const oneChain = singleChain ? chainsRow!.values?.[0] ?? chainsRow!.value : "";
      for (const t of tokens) if (t.address && !t.url) t.url = explorerAddressUrl(t.address, t.chain || oneChain);
      // A token with no chain of its own is on the single chain the Chains row names; the Tokens row then shows that
      // chain once, after the list, when every token shares it.
      if (singleChain) for (const t of tokens) t.chain ||= oneChain;
      const value = isTokens && singleChain && !tokens.length ? withoutChain(r.value, chainsRow!.values?.[0] ?? chainsRow!.value) : r.value;
      const main = MAIN_ROW.test(r.label.trim()) ? ADDR.exec([r.value, ...(r.items ?? []).map((x) => x.address)].join(" "))?.[0] ?? "" : "";
      return { label: r.label, value, url: r.url, note: "", ...(main ? { mainName: mainContractName(page, all, main) } : {}), lines, channel, badge, status, accounts, perAccount, tokens, values: tokens.length || accounts.length ? [] : r.values ?? [], ...(!tokens.length && !accounts.length && r.items?.length ? { items: r.items.map(shownItemOf) } : {}), ...speakersField(badge, lines, sourceUrl) };
    });
    return { rows: liveRowsFirst(liveOnlyRows(rows, page, all, sourceUrl), statusOfContract(page.contracts)), fromInfobox: true, otherChannels: page.channels.filter((c) => !used.has(c)) };
  }
  const rows: KeyRow[] = [];
  const site = websiteOf(page.channels, domain);
  if (site) {
    const lines = linesOn(all, site);
    const shown = site.url.replace(/^https?:\/\//i, "").replace(/\/+$/, "");
    rows.push({ label: "Website", value: shown || site.url, url: site.url, note: "", lines, channel: site, badge: null, status: statusBadge(site, domain), accounts: [], tokens: [], values: [] });
  }
  // Main contract describes a live main-network deployment only; test deployments get their own Test networks row.
  const main = liveMainOf(page.contracts);
  if (main) {
    const addr = main.address.toLowerCase();
    const lines = all.filter((l) => [l.text, l.rerun, l.quote, l.fact?.value ?? ""].some((s) => s.toLowerCase().includes(addr)));
    const id = chainIdOf(main.chain);
    rows.push({ label: "Main contract", mainName: mainContractName(page, all, main.address), value: main.address, url: "", note: main.chain ? `on ${id !== null ? chainName(id) : main.chain}` : "", lines, channel: null, badge: badgeOf(lines, all, sourceUrl), status: null, accounts: [], tokens: [], values: [] });
  }
  // Every test program, EVM or not (a Solana devnet program has no 0x address), is listed under Test networks.
  const tests = page.contracts.filter((c) => c.status === "test");
  if (tests.length) {
    const lines = linesNaming(all, tests);
    const nets = [...new Map(tests.map((c) => testNetworksIn(`${c.chain} ${c.role}`)[0] ?? c.chain.trim()).filter(Boolean).map((n) => [n.toLowerCase(), n])).values()];
    rows.push({ label: "Test networks", value: nets.join(", ") || "Test network", url: "", note: "", lines, channel: null, badge: badgeOf(lines, all, sourceUrl), status: null, accounts: [], tokens: [], values: [] });
  }
  const token = tokenAddresses(page);
  for (const which of ["symbol", "supply"] as const) {
    const l = all.find((x) => x.kind === "proof" && !!x.fact && isTokenFact(x, which) && provesToken(x, token));
    if (!l) continue;
    rows.push({ label: l.fact!.name, value: wholeFact(l.fact!, l.text, decimalsOf(all)) ?? `${l.fact!.value}${l.fact!.unit ? ` ${l.fact!.unit}` : ""}`, url: "", note: "", lines: [l], channel: null, badge: badgeOf([l], [l], sourceUrl), status: null, accounts: [], tokens: [], values: [] });
  }
  return { rows: liveRowsFirst(rows, statusOfContract(page.contracts)), fromInfobox: false, otherChannels: page.channels.filter((c) => c !== site) };
}

/**
 * A name for the main contract: the token the Tokens row lists at that address ("IMD token"), else the token symbol a
 * proof reads from it, else its role on the record, else the project's own name. Never empty.
 */
export function mainContractName(page: Pick<Page, "name" | "infobox" | "contracts">, all: Line[], address: string): string {
  const addr = address.toLowerCase();
  const row = page.infobox.find((r) => TOKEN_ROWS.test(r.label.trim()));
  const item = row?.items?.find((x) => x.name && (x.address.toLowerCase() === addr || x.also?.some((y) => y.address.toLowerCase() === addr) || x.text.toLowerCase().includes(addr)));
  if (item) return tokenName(item.name);
  // "IMD: Base 0x…; Ethereum 0x…": an entry without a name of its own belongs to the token named before it.
  let symbol = "";
  for (const part of row ? [row.value, ...row.values].join("; ").split(/;\s*/) : []) {
    symbol = /^\s*\$?([A-Za-z][\w.]{0,15})\s*[:(]/.exec(part)?.[1] ?? symbol;
    if (symbol && part.toLowerCase().includes(addr)) return tokenName(symbol);
  }
  const proof = all.find((l) => isTokenFact(l, "symbol") && provesToken(l, [addr]));
  if (proof?.fact) return tokenName(proof.fact.value);
  const role = page.contracts.find((c) => c.address.toLowerCase() === addr)?.role.split(/[.,;(]/)[0]!.trim() ?? "";
  if (role) return role.length > 48 ? `${role.slice(0, 47).trim()}…` : role;
  return page.name ? `${page.name} contract` : "Contract";
}
const MAIN_ROW = /^main contract$/i;

/** The status the page's contracts give an address; null when it lists none. */
export type StatusOf = (address: string) => Liveness | null;
export const statusOfContract = (contracts: Pick<Contract, "address" | "status">[]): StatusOf => {
  // One address can be deployed on several chains (Intake v2 is on Ethereum, Robinhood Chain and Sepolia): it is
  // test or past only when every listed deployment of it is; one live deployment makes it live. Without a status of
  // its own a deployment counts as live, so an address on Sepolia never lends its tag to the same address on Ethereum.
  const by = new Map<string, Liveness[]>();
  for (const c of contracts) {
    if (!c.address) continue;
    const k = c.address.toLowerCase();
    const st: Liveness = c.status === "test" || c.status === "past" ? c.status : "live";
    by.set(k, [...(by.get(k) ?? []), st]);
  }
  const anyDeclared = new Set(contracts.filter((c) => c.address && (c.status === "test" || c.status === "past" || c.status === "live")).map((c) => c.address.toLowerCase()));
  return (a) => {
    if (!a) return null;
    const k = a.toLowerCase();
    if (!anyDeclared.has(k)) return null;
    return liveFirst(by.get(k) ?? [], (x) => x)[0] ?? null;
  };
};
/** A test or past status the page gives the first contract a text names. */
const textStatus = (text: string, of: StatusOf): Liveness | null => {
  for (const r of addressRuns(text)) {
    const s = r.kind === "address" ? of(r.address) : null;
    if (s && s !== "live") return s;
  }
  return null;
};
const CHAINS_ROW = /^chains?$/i;
/** The Chains row's entries, each chain once with its roles and its status. */
export function chainsOfRow(row: Pick<KeyRow, "items" | "values" | "value">): { chain: string; role: string; status: Liveness }[] {
  const entries: { text: string; chain?: string | null; status?: Liveness }[] = row.items?.length
    ? row.items.map((v) => ({ text: [v.name, v.text].filter(Boolean).join(" "), chain: v.chain || null, ...(v.status ? { status: v.status } : {}) }))
    : (row.values.length ? row.values : row.value.split(/;|\n/)).map((t) => ({ text: t }));
  const list = chainEntries(entries).map((c) => {
    // A chain named by several entries is live when any of them is.
    const of = entries.filter((e) => chainEntries([e])[0]?.chain === c.chain).map((e) => livenessOf({ status: e.status, text: `${c.chain} ${c.role}` }));
    return { ...c, status: liveFirst(of, (x) => x)[0] ?? ("live" as Liveness) };
  });
  return liveFirst(list, (c) => c.status);
}
/**
 * One Key facts entry's status, the same for every kind of row: the one it declares, else its contract's, else test in a
 * Test networks row, else what its words say.
 */
function entryLiveness(label: string, e: { status?: Liveness | null; name?: string; text?: string; chain?: string; address?: string }, of: StatusOf): Liveness {
  const declared = e.status ?? of(e.address ?? "") ?? textStatus(e.text ?? "", of);
  if (declared) return declared;
  return TEST_ROW.test(label.trim()) ? "test" : livenessOf({ name: e.name, text: e.text, chain: e.chain });
}
/** What a row shows, each entry with its status, live entries first. Exactly one of the lists is set. */
export interface ShownEntries {
  chains?: { chain: string; role: string; status: Liveness }[];
  items?: { v: ShownItem; st: Liveness }[];
  values?: { v: string; st: Liveness; last: boolean }[];
  accounts?: { v: Account; st: Liveness }[];
  tokens?: { v: TokenItem; first: boolean; st: Liveness }[];
  /** One plain value: tagged only in a Test networks row or when it names a test or past contract of the page. */
  single?: Liveness;
}
export function shownEntries(row: KeyRow, of: StatusOf = () => null): ShownEntries {
  const st = (e: Parameters<typeof entryLiveness>[1]) => entryLiveness(row.label, e, of);
  const sorted = <T extends { st: Liveness }>(list: T[]) => liveFirst(list, (x) => x.st);
  if (CHAINS_ROW.test(row.label.trim())) {
    const chains = chainsOfRow(row);
    if (chains.length) return { chains };
  }
  const supply = SUPPLY_ROW.test(row.label.trim());
  if (row.items?.length) {
    const list = supply ? supplyItems(row.items) : row.items.flatMap((v) => itemEntries(row.label, v));
    return { items: sorted(list.map((e) => ({ v: e, st: st(e) }))) };
  }
  if (row.values.length) {
    const list = row.values.flatMap((v) => valueEntries(row.label, v));
    return { values: sorted((supply ? supplyValues(list) : list).map((v) => ({ v, st: st({ text: v }), last: false }))) };
  }
  if (row.accounts.length) return { accounts: sorted(row.accounts.map((v) => ({ v, st: v.live ?? (TEST_ROW.test(row.label.trim()) ? ("test" as const) : ("live" as const)) }))) };
  if (row.tokens.length) return { tokens: sorted(row.tokens.map((v, i) => ({ v, first: i === 0, st: st({ status: v.status, name: v.symbol, text: v.purpose, chain: v.chain, address: v.address }) }))) };
  const parts = valueEntries(row.label, row.value);
  if (parts.length > 1) return { values: sorted(parts.map((v, i) => ({ v, st: st({ text: v }), last: i === parts.length - 1 }))) };
  return { single: TEST_ROW.test(row.label.trim()) ? st({ text: row.value }) : textStatus(row.value, of) ?? "live" };
}
/** The status of a row as a whole: its best entry's. A row is test or past only when every entry it shows is. */
export function rowLiveness(row: KeyRow, of: StatusOf = () => null): Liveness {
  const e = shownEntries(row, of);
  if (e.single) return e.single;
  const all = e.chains?.map((c) => c.status) ?? [...(e.items ?? []), ...(e.values ?? []), ...(e.accounts ?? []), ...(e.tokens ?? [])].map((x) => x.st);
  return liveFirst(all, (x) => x)[0] ?? "live";
}
/** Rows with a live entry first, then rows that hold only test entries, then only past ones; each group in its order. */
export const liveRowsFirst = (rows: KeyRow[], of: StatusOf = () => null): KeyRow[] => liveFirst(rows, (r) => rowLiveness(r, of));

/** The rows that describe live main-network deployments only. */
export const LIVE_ONLY_ROWS = /^(?:main contract|chains?|contracts?|deployed by|controlled by)$/i;
export const TEST_ROW = /^test networks?$/i;
/** "Solana devnet", "Base Sepolia", "testnet": the test networks a text names, each once. */
export function testNetworksIn(text: string): string[] {
  const re = /\b(?:(?:[A-Z][\w.]*|zkSync|opBNB)\s+)?(?:test[- ]?net|devnet|Sepolia|Goerli|Holesky|Hoodi|Fuji|Mumbai|Amoy|Chiado|Alfajores)(?:\s+test[- ]?net)?\b/gi;
  const out = new Map<string, string>();
  for (const m of text.matchAll(re)) {
    const name = m[0].replace(/^(?:on|the|a|an|its|in)\s+/i, "").trim();
    if (!out.has(name.toLowerCase())) out.set(name.toLowerCase(), name);
  }
  return [...out.values()];
}

type DeployStatus = "live" | "test" | "past";
const norm = (s: string) => s.trim().toLowerCase().replace(/\s+(?:mainnet|one|pos|network|chain)$/, "");
/**
 * What one entry of a live-only row describes: the deployment it names, resolved against the page's contracts. An
 * entry naming a contract's address takes that contract's status (live, test or past); an entry naming a test
 * network is test; an entry that names only a chain takes the status of the page's contracts on that chain when none
 * of them is live; anything else is live. net is the test network to list under Test networks.
 */
export function entryStatus(text: string, chain: string, contracts: Contract[]): { status: DeployStatus; net: string } {
  const t = `${text} ${chain}`;
  const lower = t.toLowerCase();
  const named = contracts.find((c) => c.address.trim().length >= 20 && lower.includes(c.address.trim().toLowerCase()));
  const netOf = (c?: Contract) => testNetworksIn(t)[0] ?? (c?.chain.trim() || chain.trim() || text.trim());
  if (named) {
    if (named.status === "past") return { status: "past", net: "" };
    if (named.status === "test" || !isLiveContract(named)) return { status: "test", net: netOf(named) };
    return { status: "live", net: "" };
  }
  if (TEST_NETWORK.test(t)) return { status: "test", net: netOf() };
  // A chain with no address: the page's contracts on that chain say whether anything live is there.
  if (!ADDR.test(t) && contracts.length) {
    const on = contracts.filter((c) => c.chain.trim() && [norm(chain), norm(text)].includes(norm(c.chain)));
    if (on.length && !on.some(isLiveContract)) return on.some((c) => c.status === "test") ? { status: "test", net: netOf(on.find((c) => c.status === "test")) } : { status: "past", net: "" };
  }
  return { status: "live", net: "" };
}

/** A row value that lists several things in one text ("Ethereum and Sepolia", "A; B"), split into them. */
const partsOf = (value: string) => value.split(/\s*(?:[;,]|\band\b)\s*/i).map((x) => x.trim()).filter(Boolean);

/**
 * Main contract, Chains, Contracts, Deployed by and Controlled by describe live main-network deployments only. Each
 * thing such a row lists is resolved against the deployment it names (entryStatus): live entries stay, an entry on a
 * test network moves to a Test networks row with its network, and a past one is left out. A row left with nothing is
 * left out. When the page has no live deployment at all (no live contract in subject.contracts and no live entry left
 * in Main contract, Chains or Contracts), all five rows are left out. The page's test contracts, EVM or not, are
 * listed under Test networks too; that row is added after the others unless the page has one.
 */
export function liveOnlyRows(rows: KeyRow[], page: Pick<Page, "contracts">, all: Line[], sourceUrl: (l: Line) => string = () => ""): KeyRow[] {
  const isLive = (r: KeyRow) => LIVE_ONLY_ROWS.test(r.label.trim());
  const nets = new Map<string, string>();
  const addNet = (raw: string) => {
    const n = netName(raw);
    const k = netKey(n);
    if (n && !nets.has(k)) nets.set(k, n);
  };
  const testLines: Line[] = [];
  const out: KeyRow[] = [];
  for (const r of rows) {
    if (!isLive(r)) {
      out.push(r);
      continue;
    }
    let kept: KeyRow | null = r;
    if (r.items?.length) {
      // An entry's own declared status wins (A2, A3): a chain marked as a test network moves to Test networks with
      // its tag, whatever its words say; one marked live stays.
      const chainsRow = CHAINS_ROW.test(r.label.trim());
      const st = r.items.map((i): { status: Liveness; net: string } => {
        const e = entryStatus([i.name, i.text, i.address, i.url].join(" "), i.chain, page.contracts);
        if (i.status === "live" || i.status === "past") return { status: i.status, net: "" };
        if (i.status === "test") return { status: "test", net: e.status === "test" && e.net ? e.net : chainsRow ? i.name || i.chain || i.text : i.chain || i.name };
        return e;
      });
      const keep = st.map((x) => x.status === "live");
      if (keep.some((k) => !k)) {
        const items = r.items.filter((_, i) => keep[i]);
        const values = r.values.length === r.items.length ? r.values.filter((_, i) => keep[i]) : r.values;
        kept = items.length ? { ...r, items, values, value: values.join("; ") || items.map((i) => i.name || i.text || i.address).join("; ") } : null;
      }
      st.forEach((x) => x.status === "test" && addNet(x.net));
      if (st.some((x) => x.status === "test")) testLines.push(...r.lines);
    } else {
      const list = r.values.length ? r.values : partsOf(`${r.value}`);
      const st = list.map((v) => entryStatus(v, "", page.contracts));
      // The row's own note ("on Sepolia") applies to every entry.
      const noteTest = !!r.note && TEST_NETWORK.test(r.note);
      if (noteTest) st.forEach((x) => (x.status === "live" ? ((x.status = "test"), (x.net = testNetworksIn(r.note)[0] ?? r.note)) : x));
      const keep = st.map((x) => x.status === "live");
      if (keep.some((k) => !k)) {
        const liveParts = list.filter((_, i) => keep[i]);
        kept = !liveParts.length ? null : r.values.length ? { ...r, values: liveParts, value: liveParts.join("; ") } : { ...r, value: liveParts.join(", ") };
      }
      st.forEach((x) => x.status === "test" && addNet(x.net));
      if (st.some((x) => x.status === "test")) testLines.push(...r.lines);
    }
    if (kept) out.push(kept);
  }
  const liveLeft = page.contracts.some((c) => isLiveContract(c) && !!c.address.trim()) || out.some((r) => /^(?:main contract|chains?|contracts?)$/i.test(r.label.trim()));
  const result = liveLeft ? out : out.filter((r) => !isLive(r));
  // Every test program the page lists, whatever its address format, has its network named.
  for (const c of page.contracts) if (c.status === "test" || (!isLiveContract(c) && c.status !== "past")) addNet(testNetworksIn(`${c.chain} ${c.role}`)[0] ?? c.chain.trim());
  if (!nets.size) return result;
  const lines = [...new Set([...testLines, ...linesNaming(all, page.contracts.filter((c) => c.status === "test"))])];
  // The page has its own Test networks row: a test network taken out of Chains or Contracts is added to it, never dropped.
  const own = result.findIndex((r) => TEST_ROW.test(r.label.trim()));
  if (own >= 0) {
    const r = result[own]!;
    const listed = [...(r.values.length ? r.values : partsOf(r.value)), ...(r.items ?? []).map((i) => i.name || i.chain || i.text)].map((v) => netKey(netName(v)));
    const missing = [...nets].filter(([k]) => !listed.includes(k)).map(([, n]) => n);
    if (!missing.length) return result;
    // A row given as a list shows its items: each moved network becomes an item of its own, tagged test like the rest.
    const moved: ShownItem[] = missing.map((name) => ({ name, text: "", url: "", address: "", chain: "", explorer: "", status: "test" }));
    const items = r.items?.length ? { items: [...r.items, ...moved] } : {};
    const merged: KeyRow = r.values.length || r.items?.length ? { ...r, ...items, values: r.values.length ? [...r.values, ...missing] : r.values, value: [...(r.values.length ? r.values : partsOf(r.value)), ...missing].join("; ") } : { ...r, value: [r.value, ...missing].filter((x) => x.trim()).join(", ") };
    return result.map((x, i) => (i === own ? { ...merged, lines: [...new Set([...r.lines, ...lines])] } : x));
  }
  const badge = badgeOf(lines, all, sourceUrl);
  return [...result, { label: "Test networks", value: [...nets.values()].join(", "), url: "", note: "", lines, channel: null, badge, status: null, accounts: [], tokens: [], values: [], ...speakersField(badge, lines, sourceUrl) }];
}
/** A test network's shown name: a chain id by its name (11155111 is Sepolia). */
const netName = (raw: string): string => {
  const t = raw.trim();
  if (/^\d+$/.test(t)) return chainName(Number(t)) || t;
  return t;
};
/** "Sepolia testnet", "Sepolia" and "sepolia test network" are one network. */
const netKey = (n: string) => n.toLowerCase().replace(/\s+(?:test[- ]?net(?:work)?|network)$/, "").trim();
/** The record lines that name any of these contracts' addresses. */
function linesNaming(all: Line[], contracts: Contract[]): Line[] {
  const addrs = contracts.map((c) => c.address.trim().toLowerCase()).filter((a) => a.length >= 20);
  return addrs.length ? all.filter((l) => [l.text, l.rerun, l.quote, l.fact?.value ?? ""].some((s) => addrs.some((a) => s.toLowerCase().includes(a)))) : [];
}
const tokenName = (name: string) => (/\btoken$/i.test(name.trim()) ? name.trim() : `${name.trim()} token`);

const SUPPLY_ROW = /^(?:(?:total|circulating|max(?:imum)?|token) )?supply$/i;
const NAMED = /^(\$?[A-Za-z][\w.]{0,11}):\s+(?=\S)/;
/**
 * A long text value as one entry per line. A Supply value is one entry per token (see below); another row is split at
 * semicolons when it has three or more entries. A value with one entry is returned whole.
 */
export function valueEntries(label: string, value: string): string[] {
  const parts = value.split(/;\s+/).map((p) => p.trim()).filter(Boolean);
  if (!SUPPLY_ROW.test(label.trim())) return parts.length >= 3 ? parts : [value];
  // Supply is one entry per token, its text as written. A value that names its token ("IMD: about 7.08 million in
  // total; about 4.28 million bridged") is split only where another token's name starts; a part with no name of its
  // own belongs to the token before it. A value that names no token is split at its semicolons, one token each.
  if (!NAMED.test(parts[0] ?? "")) return parts.length > 1 ? parts : [value];
  const out: string[] = [];
  for (const p of parts) {
    if (NAMED.test(p) || !out.length) out.push(p);
    else out[out.length - 1] = `${out[out.length - 1]}; ${p}`;
  }
  return out.length > 1 ? out : [value];
}
/**
 * The token a Supply entry is about: a ticker in capitals ("ZORA on Base", "UNI (Ethereum)", "$IMD: …"), else the
 * unit an amount is given in ("1 billion UNI"); "" when it names none.
 */
export function supplyToken(name: string, text = ""): string {
  const head = /^\$?([A-Z][A-Z0-9.]{1,11})(?![\w.])/.exec(name.trim()) ?? (!name.trim() ? /^\$?([A-Z][A-Z0-9.]{1,11}):/.exec(text.trim()) : null);
  if (head) return head[1]!;
  const unit = /\d(?:[\d,.]*)\s*(?:(?:thousand|million|billion|trillion)\s+)?\$?([A-Z][A-Z0-9.]{1,11})\b/.exec(text);
  return unit ? unit[1]! : "";
}
/** "ZORA on Base" without its token: "on Base"; "UNI (Arbitrum One)": "Arbitrum One"; the bare token: "". */
const afterToken = (name: string, token: string) =>
  name.trim().replace(new RegExp(`^\\$?${token.replace(/\./g, "\\.")}\\s*:?\\s*`), "").replace(/^\((.*)\)$/, "$1").trim();
/**
 * Supply is one entry per token (A1): entries about the same token (its home total and each bridged balance) are one
 * entry, the token's name once and then each part's own words and amount as written, the first entry's first. Nothing is
 * summed or reworded, so a bridged balance is never shown as supply of its own. Entries that name no token stay apart.
 */
export function supplyItems(items: ShownItem[]): ShownItem[] {
  const groups = new Map<string, ShownItem[]>();
  const order: (string | ShownItem)[] = [];
  for (const v of items) {
    const t = v.address ? "" : supplyToken(v.name, v.text);
    if (!t) {
      order.push(v);
      continue;
    }
    if (!groups.has(t)) order.push(t), groups.set(t, []);
    groups.get(t)!.push(v);
  }
  return order.map((o) => {
    if (typeof o !== "string") return o;
    const g = groups.get(o)!;
    if (g.length === 1) return g[0]!;
    const text = g
      .map((v) => {
        const where = afterToken(v.name, o);
        const body = !v.name.trim() ? v.text.trim().replace(new RegExp(`^\\$?${o.replace(/\./g, "\\.")}:\\s*`), "") : v.text.trim();
        return where && body ? `${where}: ${body}` : where || body;
      })
      .filter(Boolean)
      .join("; ");
    const status = liveFirst(g.map((v) => v.status ?? "live"), (x) => x)[0];
    return { name: o, text, url: g.find((v) => v.url)?.url ?? "", address: "", chain: "", explorer: "", ...(status && g.some((v) => v.status) ? { status } : {}) };
  });
}
/** The same for a Supply value given as a list of texts ("ZORA on Base: 10 billion"): the first text of a token as
 * written, each later one after it without the repeated token name. */
export function supplyValues(values: string[]): string[] {
  const groups = new Map<string, string[]>();
  const order: string[] = [];
  values.forEach((v, i) => {
    const t = supplyToken(/^([^:]{1,72}):/.exec(v.trim())?.[1] ?? "", v);
    const k = t || `#${i}`;
    if (!groups.has(k)) order.push(k), groups.set(k, []);
    groups.get(k)!.push(v.trim());
  });
  return order.map((k) => {
    const g = groups.get(k)!;
    if (k.startsWith("#") || g.length === 1) return g[0]!;
    const rest = g.slice(1).map((v) => v.replace(new RegExp(`^\\$?${k.replace(/\./g, "\\.")}(?:\\s*:)?\\s*`), "").replace(/^\((.*?)\)/, "$1"));
    return [g[0]!, ...rest].join("; ");
  });
}
/** A list entry with a name of its own is one token: shown once, its text as written, never split. */
export function itemEntries(_label: string, v: ShownItem): ShownItem[] {
  return [v];
}
/** The chain every entry of a Contracts row shares, shown once for the list; "" when they differ or one has none. */
export function sharedChain(row: Pick<KeyRow, "label" | "items">, fallback = ""): string {
  const items = row.items ?? [];
  if (!/^contracts?$/i.test(row.label.trim()) || items.length < 2) return "";
  const chains = new Set(items.map((v) => (v.address ? chainOfAddress(v.address, v.chain, fallback) : "")));
  return chains.size === 1 ? [...chains][0]! : "";
}

const ADDRESS = /0x[0-9a-fA-F]{40}/g;
const addressesIn = (...parts: string[]) => [...parts.join(" ").matchAll(ADDRESS)].map((m) => m[0].toLowerCase());

/** The subject's token: the contracts whose role says token or ERC-20, else the main contract. */
export function tokenAddresses(page: Pick<Page, "contracts">): string[] {
  const valid = page.contracts.filter((c) => /^0x[0-9a-fA-F]{40}$/.test(c.address));
  const token = valid.filter((c) => /token|erc-?20/i.test(c.role) && !/erc-?(721|1155)|nft|collectible/i.test(c.role));
  return (token.length ? token : valid.filter((c) => c.main)).map((c) => c.address.toLowerCase());
}

/**
 * True when a symbol or supply proof is about the subject's token. With the token known, the proof must name it
 * (in its re-run, text, quote or value) and its re-run must not read any other contract; a proof that names no
 * contract at all does not establish which asset it measured, so it is not shown. With no contract known, a
 * proof is taken as it is.
 */
export function provesToken(l: Line, token: string[]): boolean {
  if (!token.length) return true;
  const reads = addressesIn(l.rerun);
  if (reads.some((a) => !token.includes(a))) return false;
  return addressesIn(l.rerun, l.text, l.quote, l.fact?.value ?? "").some((a) => token.includes(a));
}

/**
 * A proof of the token's symbol or supply: named so ("Token symbol", "Symbol", "Ticker"; "Token supply", "Total
 * supply", "Supply") or re-run with the ERC-20 call itself (symbol(), totalSupply()). A seat or any other count
 * named "supply" is not the token's supply.
 */
export function isTokenFact(l: Line, which: "symbol" | "supply"): boolean {
  if (!l.fact) return false;
  const name = l.fact.name.trim();
  if (/\bseats?\b/i.test(`${name} ${l.fact.unit}`) || /\bseats?\b/i.test(l.text)) return false;
  if (which === "symbol") return /^(token )?(symbol|ticker)$/i.test(name) || /\btoken('s)? (symbol|ticker)\b/i.test(name) || (/\bsymbol\(\)/.test(l.rerun) && /symbol|ticker/i.test(name));
  return /^(token |total )?supply$/i.test(name) || /\b(token('s)?|total) supply\b/i.test(name) || (/\btotalSupply\(\)/.test(l.rerun) && /supply/i.test(name));
}

/** Splits a value into text and 0x addresses, so addresses can be shown shortened in monospace with a copy button. */
export function splitAddresses(v: string): { text: string; address: boolean }[] {
  const out: { text: string; address: boolean }[] = [];
  let last = 0;
  for (const m of v.matchAll(/0x[0-9a-fA-F]{40}/g)) {
    if (m.index! > last) out.push({ text: v.slice(last, m.index), address: false });
    out.push({ text: m[0], address: true });
    last = m.index! + m[0].length;
  }
  if (last < v.length) out.push({ text: v.slice(last), address: false });
  return out;
}
