/** Turns untrusted page.json and lines.json into plain strings. Nothing here is ever rendered as HTML. */
import { countLines, type Counts } from "./settle";
import { registrableDomain, sameSite } from "./psl";

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
  /** Proof lines or panel answers (A1...) that settle this line. */
  links: LineLink[];
  /** Older readings of the same check, as block and value; the line itself holds the newest. */
  history?: Reading[];
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
   * Contradicted or Out of date at once, whatever its kind, until a rebuild folds the change in.
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
  entries?: { name: string; url: string }[];
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
}
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
  return url ? { url, fetchedAt: str(o.fetched_at ?? o.time ?? o.at, 64).trim() } : null;
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

export function parsePage(text: string, domain = ""): Page {
  const j = obj(JSON.parse(text));
  const subject = obj(j.subject);
  const channels: Channel[] = arr(subject.channels).map((c) => {
    const o = obj(c);
    return { label: str(o.label, 120), url: str(o.url, 400), tie: tieOf(o.tie) };
  });
  const contracts: Contract[] = arr(subject.contracts).map((c) => {
    const o = obj(c);
    return { address: str(o.address, 64), chain: str(o.chain, 64), role: str(o.role, 300), main: o.main === true };
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
        links: parseLinks(o.links),
        history: parseHistory(o.history),
      };
      return applyLabel(line, channels, line.by, ids.map((s) => refOf.get(s) ?? ""), domain);
    })
    .filter((l) => l.text);
  const main = contracts.find((c) => c.main)?.address ?? "";
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
        // A value entry is a string, or { name, url } (Official accounts): its name is the value, its url the link.
        const raw = arr(o.values).slice(0, 20);
        const entries = raw.filter((x) => x && typeof x === "object").map((x) => ({ name: str(obj(x).name, 200).trim(), url: str(obj(x).url, 400).trim() })).filter((e) => e.name || e.url);
        const values = raw.map((x) => (x && typeof x === "object" ? str(obj(x).name, 300) || str(obj(x).url, 300) : str(x, 300)).trim()).filter(Boolean);
        return { label: str(o.label, 80), value: str(o.value, 300) || values.join("; "), url: str(o.url, 400), lines: arr(o.lines).map((x) => str(x, 64)).filter(Boolean), values: values.length > 1 ? values : [], ...(entries.length ? { entries } : {}) };
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
  origin: { payer: string; jobHref: string; raised?: boolean; time?: number | null } | null;
  /** Other lines with the same text (ignoring case and punctuation), shown as this ONE row: their origins, speakers and sources. */
  same?: RecordRow[];
}
/** A row of the on-chain facts table: a proof with a fact, from the page or raised by a visitor's changes job. */
export const isFactRow = (r: RecordRow) => r.line.kind === "proof" && !!r.line.fact && (!r.origin || !!r.origin.raised);
export interface SourceJob {
  key: string;
  data: SourceLines;
  payer: string;
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
        rows.push(...orderSection(p.page, section, p.placed).map((r) => ({ ...r, origin: { payer: p.job.payer, jobHref: p.job.jobHref, raised: p.job.raised, time: p.job.time ?? null } })));
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
}
/** Every valid patch: a row or sentence, a target and a new value. */
export function parsePatches(v: unknown): Patch[] {
  return bounded(v).list.flatMap((x): Patch[] => {
    const o = obj(x);
    const kind = str(o.kind, 16).toLowerCase();
    const target = str(o.target, 600).trim();
    const value = str(o.value ?? o.text, 600).trim();
    if ((kind !== "infobox" && kind !== "summary") || !target || !value) return [];
    return [{ kind, target, value, lines: arr(o.lines).map((l) => str(l, 64).trim()).filter(Boolean) }];
  });
}
export interface ChangesResult {
  items: ChangeVerdict[];
  /** New values for Key facts rows and summary sentences in affects (see Patch). */
  patches: Patch[];
  /** What the new lines contradict or outdate elsewhere in the record. */
  affects: Affect[];
  /** The new sources and lines, read like an added-source result, with proofs (re-run steps given) and links. */
  data: SourceLines;
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
    data: over ? { ...data, tooLarge: data.tooLarge ?? over } : data,
  };
}
