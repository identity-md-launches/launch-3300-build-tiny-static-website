/** The key facts table: from "infobox" when a rebuild wrote one, else built from the page shown. Pure, for tests. */
import { hostOf, underChannel, type Channel, type Line, type Page } from "./page";
import { chainIdOf, chainName } from "./subject";

export type Badge = { text: string; tone: "proof" | "statement" | "claim" | "strong" | "weak" | "none" };

export interface KeyRow {
  label: string;
  value: string;
  url: string;
  /** Small text after the value, such as the chain a contract is on. */
  note: string;
  /** The record lines the row rests on; its badge opens them. */
  lines: Line[];
  /** For a row that is one of the subject's channels: the channel, whose tie the badge shows. */
  channel: Channel | null;
  badge: Badge | null;
}

const TIE_BADGE: Record<string, string> = { strong: "Confirmed on chain", weak: "Names the contract", none: "Not confirmed" };

/** "Proven on chain" if any line is a proof; else "Stated by <channel>" for a statement; else "Reported by <who>". */
export function badgeOf(lines: Line[]): Badge | null {
  if (lines.some((l) => l.kind === "proof")) return { text: "Proven on chain", tone: "proof" };
  const st = lines.find((l) => l.kind === "statement");
  if (st) return { text: `Stated by ${st.channel?.label || hostOf(st.channel?.url ?? "") || st.by || "the project"}`, tone: "statement" };
  const cl = lines.find((l) => l.kind === "claim");
  if (cl) return { text: `Reported by ${cl.by || "an outside source"}`, tone: "claim" };
  return null;
}
export const tieBadge = (c: Channel): Badge => ({ text: TIE_BADGE[c.tie] ?? TIE_BADGE.none!, tone: c.tie });

/** The channel a row names by its URL, or by its value being the channel's label or URL. */
export function channelOfRow(channels: Channel[], row: { label: string; value: string; url: string }): Channel | null {
  const same = (a: string, b: string) => a.trim().toLowerCase().replace(/\/+$/, "") === b.trim().toLowerCase().replace(/\/+$/, "");
  return (
    channels.find((c) => row.url && (same(row.url, c.url) || (underChannel(row.url, c) && underChannel(c.url, { ...c, url: row.url })))) ??
    channels.find((c) => same(row.value, c.url) || (!!c.label && same(row.value, c.label))) ??
    null
  );
}

/** Lines published on a channel, for a channel row that names no lines of its own. */
const linesOn = (all: Line[], c: Channel) => all.filter((l) => l.channel && same(l.channel.url, c.url));
const same = (a: string, b: string) => a.trim().toLowerCase().replace(/\/+$/, "") === b.trim().toLowerCase().replace(/\/+$/, "");

export function keyFacts(page: Page | null, resolve: (id: string) => Line | undefined, all: Line[]): { rows: KeyRow[]; fromInfobox: boolean; otherChannels: Channel[] } {
  if (!page) return { rows: [], fromInfobox: false, otherChannels: [] };
  if (page.infobox.length) {
    const used = new Set<Channel>();
    const rows = page.infobox.map((r): KeyRow => {
      const lines = r.lines.map(resolve).filter((l): l is Line => !!l);
      const channel = channelOfRow(page.channels, r);
      if (channel) used.add(channel);
      const rest = channel && !lines.length ? linesOn(all, channel) : lines;
      return { label: r.label, value: r.value, url: r.url, note: "", lines: rest, channel, badge: channel ? tieBadge(channel) : badgeOf(lines) };
    });
    return { rows, fromInfobox: true, otherChannels: page.channels.filter((c) => !used.has(c)) };
  }
  const rows: KeyRow[] = [];
  for (const c of page.channels) {
    const shown = c.url.replace(/^https?:\/\//i, "").replace(/\/+$/, "");
    rows.push({ label: c.label || "Channel", value: shown || c.url, url: c.url, note: "", lines: linesOn(all, c), channel: c, badge: tieBadge(c) });
  }
  const contracts = [...page.contracts].filter((c) => c.address).sort((a, b) => Number(b.main) - Number(a.main));
  for (const c of contracts) {
    const addr = c.address.toLowerCase();
    const lines = all.filter((l) => [l.text, l.rerun, l.quote, l.fact?.value ?? ""].some((s) => s.toLowerCase().includes(addr)));
    const id = chainIdOf(c.chain);
    rows.push({
      label: c.main ? "Main contract" : "Contract",
      value: c.address,
      url: "",
      note: c.chain ? `on ${id !== null ? chainName(id) : c.chain}` : "",
      lines,
      channel: null,
      badge: badgeOf(lines),
    });
  }
  for (const l of all) {
    if (l.kind !== "proof" || !l.fact || !/symbol|supply/i.test(l.fact.name)) continue;
    rows.push({ label: l.fact.name, value: `${l.fact.value}${l.fact.unit ? ` ${l.fact.unit}` : ""}`, url: "", note: "", lines: [l], channel: null, badge: badgeOf([l]) });
  }
  return { rows, fromInfobox: false, otherChannels: [] };
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
