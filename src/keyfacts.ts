/** The key facts table: from "infobox" when a rebuild wrote one, else built from the page shown. Pure, for tests. */
import { channelFor, channelStatus, hostOf, onDomain, safeHref, STATUS_WORDS, underChannel, type Channel, type ChannelStatus, type Line, type Page } from "./page";
import { chainIdOf, chainName } from "./subject";
import { proofIdsOf, settleOf } from "./settle";

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
  /** The value as a list, only when the result gave one (infobox values): each entry on its own line. */
  values: string[];
  /** The Tokens row: one entry per token the value lists, each shown on its own line. Empty on other rows. */
  tokens: TokenItem[];
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
  const items = (values.length ? values : tokenParts(value)).map((p) => {
    const address = ADDR.exec(p)?.[0] ?? "";
    let rest = p;
    let chain = "";
    if (address) {
      const at = rest.indexOf(address);
      const after = rest.slice(at + address.length);
      const c = /^\s*\)?\s*(?:,\s*)?\(?\s*on\s+([A-Z][A-Za-z0-9 .\-]{0,30}?)\s*\)?\s*[.,]?\s*$/.exec(after);
      if (c) {
        chain = c[1]!.trim();
        rest = rest.slice(0, at) + " ";
      } else rest = rest.slice(0, at) + " " + after;
    }
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
    return { symbol, purpose, address, chain, url: "" };
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
  name: string;
  channel: Channel | null;
  status: Badge | null;
}

/** Each account an Official accounts value lists ("@imd, @news"), matched to its channel by label, handle or URL. */
export function accountsOf(channels: Channel[], value: string | string[], domain: string): Account[] {
  // A text value is never split on commas or "and": only a list the result gave (values) is several accounts.
  const parts = (typeof value === "string" ? [value] : value).map((p) => p.trim()).filter(Boolean);
  return parts.map((name) => {
    const url = /^https?:\/\//i.test(name) ? name : /^[a-z0-9-]+(\.[a-z0-9-]+)+(\/\S*)?$/i.test(name) ? `https://${name}` : "";
    const channel = channelFor(channels, name, url ? [url] : []);
    return { name, channel, status: channel ? statusBadge(channel, domain) : null };
  });
}

const OUTDATED: Badge = { text: "Out of date", tone: "outdated" };
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
  if (states.length && states.every((s) => s === "outdated")) return { text: "Out of date", tone: "outdated" };
  if (states.includes("proven")) return { text: "Proven", tone: "proven" };
  if (lines.some((l) => l.kind === "proof")) return { text: "Proven on chain", tone: "proof" };
  const names = speakersOf(lines, sourceUrl);
  if (!names.length) return null;
  const tone = lines.some((l) => l.kind === "statement") ? "statement" : "claim";
  return { text: `${tone === "statement" ? "Stated by" : "Reported by"} ${speakerList(names)}`, tone };
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
    const names = l.kind === "statement" ? [l.channel?.label || hostOf(l.channel?.url ?? "") || by[0] || "the project", ...by.slice(1)] : by;
    for (const name of names) if (!out.some((x) => x.toLowerCase() === name.toLowerCase())) out.push(name);
  }
  // A claim whose speaker is not named falls back to the host of its source, only when no one is named at all.
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
const CAUTION: ChannelStatus[] = ["unverified", "verified", "own"];

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
  if (accounts.length) {
    const each = accounts.map((a) => statusOf(a.name, a.channel, domain));
    return toBadge(CAUTION.find((s) => each.includes(s)) ?? "unverified");
  }
  return toBadge(statusOf(row.url || row.value, channel, domain));
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
    channels.find((c) => !!d && hostOf(c.url).toLowerCase() === d) ??
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
      const listed = tied && /^official accounts?$/i.test(r.label.trim()) ? accountsOf(page.channels, r.values?.length ? r.values : r.value, domain) : [];
      const accounts = listed.length > 1 ? listed : [];
      for (const a of accounts) if (a.channel) used.add(a.channel);
      // A lone account takes the channel its handle resolves to, with the row's URL or value as the fallback.
      const lone = listed.length === 1 ? listed[0]!.channel : null;
      const channel = tied && !accounts.length ? lone ?? named : null;
      if (channel) used.add(channel);
      // Exactly one badge per row: Website and Official accounts show only their channel label (worked out from
      // the URL and the subject's domain when no channel matches); every other row shows only Proven on chain,
      // Stated by or Reported by.
      // A Website or Official accounts row whose lines are all out of date says so in place of its channel label.
      const stale = tied && allOutdated(lines, all);
      const status = tied ? (stale ? OUTDATED : rowStatus(r, channel, accounts, domain)) : null;
      const badge = tied ? null : badgeOf(lines, all, sourceUrl);
      // Tokens one per line only when the result gave them as a list (values); a text value stays one text value.
      const isTokens = TOKEN_ROWS.test(r.label.trim());
      const tokens = isTokens && r.values?.length ? tokensOf(r.value, safeHref(r.url) ? r.url : "", r.values) : [];
      // "on <chain>" says nothing when the Chains row names a single chain.
      if (singleChain) for (const t of tokens) t.chain = "";
      const value = isTokens && singleChain && !tokens.length ? withoutChain(r.value, chainsRow!.values?.[0] ?? chainsRow!.value) : r.value;
      return { label: r.label, value, url: r.url, note: "", lines, channel, badge, status, accounts, tokens, values: tokens.length || accounts.length ? [] : r.values ?? [] };
    });
    return { rows, fromInfobox: true, otherChannels: page.channels.filter((c) => !used.has(c)) };
  }
  const rows: KeyRow[] = [];
  const site = websiteOf(page.channels, domain);
  if (site) {
    const lines = linesOn(all, site);
    const shown = site.url.replace(/^https?:\/\//i, "").replace(/\/+$/, "");
    rows.push({ label: "Website", value: shown || site.url, url: site.url, note: "", lines, channel: site, badge: null, status: statusBadge(site, domain), accounts: [], tokens: [], values: [] });
  }
  const main = page.contracts.find((c) => c.main && /^0x[0-9a-fA-F]{40}$/.test(c.address));
  if (main) {
    const addr = main.address.toLowerCase();
    const lines = all.filter((l) => [l.text, l.rerun, l.quote, l.fact?.value ?? ""].some((s) => s.toLowerCase().includes(addr)));
    const id = chainIdOf(main.chain);
    rows.push({ label: "Main contract", value: main.address, url: "", note: main.chain ? `on ${id !== null ? chainName(id) : main.chain}` : "", lines, channel: null, badge: badgeOf(lines, all, sourceUrl), status: null, accounts: [], tokens: [], values: [] });
  }
  const token = tokenAddresses(page);
  for (const which of ["symbol", "supply"] as const) {
    const l = all.find((x) => x.kind === "proof" && !!x.fact && isTokenFact(x, which) && provesToken(x, token));
    if (!l) continue;
    rows.push({ label: l.fact!.name, value: `${l.fact!.value}${l.fact!.unit ? ` ${l.fact!.unit}` : ""}`, url: "", note: "", lines: [l], channel: null, badge: badgeOf([l], [l], sourceUrl), status: null, accounts: [], tokens: [], values: [] });
  }
  return { rows, fromInfobox: false, otherChannels: page.channels.filter((c) => c !== site) };
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
