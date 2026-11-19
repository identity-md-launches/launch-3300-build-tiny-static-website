/** The key facts table: from "infobox" when a rebuild wrote one, else built from the page shown. Pure, for tests. */
import { channelStatus, hostOf, onDomain, STATUS_WORDS, underChannel, type Channel, type ChannelStatus, type Line, type Page } from "./page";
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
  /** From the kinds of the lines the row rests on only (badgeOf). */
  badge: Badge | null;
  /** The channel's label (Own domain, Verified on chain, Not verified), on the Website and Official accounts rows only. */
  status: Badge | null;
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
 * Main contract, and one token symbol proof and one supply proof. Never every channel and contract.
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
      const channel = TIE_ROWS.test(r.label.trim()) ? named : null;
      return { label: r.label, value: r.value, url: r.url, note: "", lines, channel, badge: badgeOf(lines), status: channel ? statusBadge(channel, domain) : null };
    });
    return { rows, fromInfobox: true, otherChannels: page.channels.filter((c) => !used.has(c)) };
  }
  const rows: KeyRow[] = [];
  const site = websiteOf(page.channels, domain);
  if (site) {
    const lines = linesOn(all, site);
    const shown = site.url.replace(/^https?:\/\//i, "").replace(/\/+$/, "");
    rows.push({ label: "Website", value: shown || site.url, url: site.url, note: "", lines, channel: site, badge: badgeOf(lines), status: statusBadge(site, domain) });
  }
  const main = page.contracts.find((c) => c.main && /^0x[0-9a-fA-F]{40}$/.test(c.address));
  if (main) {
    const addr = main.address.toLowerCase();
    const lines = all.filter((l) => [l.text, l.rerun, l.quote, l.fact?.value ?? ""].some((s) => s.toLowerCase().includes(addr)));
    const id = chainIdOf(main.chain);
    rows.push({ label: "Main contract", value: main.address, url: "", note: main.chain ? `on ${id !== null ? chainName(id) : main.chain}` : "", lines, channel: null, badge: badgeOf(lines), status: null });
  }
  const taken = new Set<Line>();
  for (const re of [/symbol/i, /supply/i]) {
    const l = all.find((x) => x.kind === "proof" && x.fact && re.test(x.fact.name) && !taken.has(x));
    if (!l) continue;
    taken.add(l);
    rows.push({ label: l.fact!.name, value: `${l.fact!.value}${l.fact!.unit ? ` ${l.fact!.unit}` : ""}`, url: "", note: "", lines: [l], channel: null, badge: badgeOf([l]), status: null });
  }
  return { rows, fromInfobox: false, otherChannels: page.channels.filter((c) => c !== site) };
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
