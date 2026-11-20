/** The key facts table: from "infobox" when a rebuild wrote one, else built from the page shown. Pure, for tests. */
import { channelFor, channelStatus, hostOf, onDomain, STATUS_WORDS, underChannel, type Channel, type ChannelStatus, type Line, type Page } from "./page";
import { chainIdOf, chainName } from "./subject";

export type Badge = { text: string; tone: "proof" | "statement" | "claim" | ChannelStatus };

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
  /** The channel's label (Own domain, Verified on chain, Not verified), on the Website and Official accounts rows only. */
  status: Badge | null;
  /**
   * An Official accounts row that lists several accounts: each account with the channel it matches and that
   * channel's own label, so a verified account is told apart from an unverified one in the same list.
   */
  accounts: Account[];
}

export interface Account {
  name: string;
  channel: Channel | null;
  status: Badge | null;
}

/** Each account an Official accounts value lists ("@imd, @news"), matched to its channel by label, handle or URL. */
export function accountsOf(channels: Channel[], value: string, domain: string): Account[] {
  const parts = value
    .split(/\s*(?:,|;|\||·|\band\b)\s*/i)
    .map((p) => p.trim())
    .filter(Boolean);
  return parts.map((name) => {
    const url = /^https?:\/\//i.test(name) ? name : /^[a-z0-9-]+(\.[a-z0-9-]+)+(\/\S*)?$/i.test(name) ? `https://${name}` : "";
    const channel = channelFor(channels, name, url ? [url] : []);
    return { name, channel, status: channel ? statusBadge(channel, domain) : null };
  });
}

/** The only rows that show a channel's tie. */
export const TIE_ROWS = /^(website|official accounts?)$/i;

/** "Proven on chain" if any line is a proof; else "Stated by <channel>" for a statement; else "Reported by <who>". */
export function badgeOf(lines: Line[]): Badge | null {
  if (lines.some((l) => l.kind === "proof")) return { text: "Proven on chain", tone: "proof" };
  const st = lines.find((l) => l.kind === "statement");
  if (st) return { text: `Stated by ${st.channel?.label || hostOf(st.channel?.url ?? "") || st.by || "the project"}`, tone: "statement" };
  const cl = lines.find((l) => l.kind === "claim");
  if (cl) return { text: `Reported by ${cl.by || "an outside source"}`, tone: "claim" };
  return null;
}
/** A channel's label as a badge: Own domain, Verified on chain or Not verified. */
export const statusBadge = (c: Channel, domain: string): Badge => {
  const s = channelStatus(c, domain);
  return { text: STATUS_WORDS[s], tone: s };
};

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
export function keyFacts(page: Page | null, resolve: (id: string) => Line | undefined, all: Line[]): { rows: KeyRow[]; fromInfobox: boolean; otherChannels: Channel[] } {
  if (!page) return { rows: [], fromInfobox: false, otherChannels: [] };
  const domain = page.domain ?? "";
  if (page.infobox.length) {
    const used = new Set<Channel>();
    const rows = page.infobox.map((r): KeyRow => {
      const lines = r.lines.map(resolve).filter((l): l is Line => !!l);
      const named = channelOfRow(page.channels, r);
      if (named) used.add(named);
      const tied = TIE_ROWS.test(r.label.trim());
      // An Official accounts row naming several accounts shows each account's own label, not one for the row.
      const listed = tied && /^official accounts?$/i.test(r.label.trim()) ? accountsOf(page.channels, r.value, domain) : [];
      const accounts = listed.length > 1 && listed.some((a) => a.channel) ? listed : [];
      for (const a of accounts) if (a.channel) used.add(a.channel);
      // A lone account takes the channel its handle resolves to, with the row's URL or value as the fallback.
      const lone = listed.length === 1 ? listed[0]!.channel : null;
      const channel = tied && !accounts.length ? lone ?? named : null;
      if (channel) used.add(channel);
      // One badge per row: Website and Official accounts show only their channel's label (each listed account its
      // own); every other row shows only Proven on chain, Stated by or Reported by.
      const status = channel ? statusBadge(channel, domain) : null;
      const badge = tied && (status || accounts.length) ? null : badgeOf(lines);
      return { label: r.label, value: r.value, url: r.url, note: "", lines, channel, badge, status, accounts };
    });
    return { rows, fromInfobox: true, otherChannels: page.channels.filter((c) => !used.has(c)) };
  }
  const rows: KeyRow[] = [];
  const site = websiteOf(page.channels, domain);
  if (site) {
    const lines = linesOn(all, site);
    const shown = site.url.replace(/^https?:\/\//i, "").replace(/\/+$/, "");
    rows.push({ label: "Website", value: shown || site.url, url: site.url, note: "", lines, channel: site, badge: null, status: statusBadge(site, domain), accounts: [] });
  }
  const main = page.contracts.find((c) => c.main && /^0x[0-9a-fA-F]{40}$/.test(c.address));
  if (main) {
    const addr = main.address.toLowerCase();
    const lines = all.filter((l) => [l.text, l.rerun, l.quote, l.fact?.value ?? ""].some((s) => s.toLowerCase().includes(addr)));
    const id = chainIdOf(main.chain);
    rows.push({ label: "Main contract", value: main.address, url: "", note: main.chain ? `on ${id !== null ? chainName(id) : main.chain}` : "", lines, channel: null, badge: badgeOf(lines), status: null, accounts: [] });
  }
  const token = tokenAddresses(page);
  for (const which of ["symbol", "supply"] as const) {
    const l = all.find((x) => x.kind === "proof" && !!x.fact && isTokenFact(x, which) && provesToken(x, token));
    if (!l) continue;
    rows.push({ label: l.fact!.name, value: `${l.fact!.value}${l.fact!.unit ? ` ${l.fact!.unit}` : ""}`, url: "", note: "", lines: [l], channel: null, badge: badgeOf([l]), status: null, accounts: [] });
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
