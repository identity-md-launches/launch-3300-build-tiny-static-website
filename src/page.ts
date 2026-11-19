/** Turns untrusted page.json and lines.json into plain strings. Nothing here is ever rendered as HTML. */

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
export type Tie = "strong" | "weak" | "none";

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
}
export interface LineLink {
  type: "confirms" | "contradicts";
  target: string;
}
/** A row of the key facts box: label, value, an optional link and the line ids it rests on. */
export interface InfoRow {
  label: string;
  value: string;
  url: string;
  lines: string[];
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
}

const str = (v: unknown, max = 2000): string => (typeof v === "string" ? v.slice(0, max) : typeof v === "number" ? String(v) : "");
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const obj = (v: unknown): Record<string, unknown> => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
const kindOf = (v: unknown): Kind => {
  const k = str(v).toLowerCase();
  return k === "proof" || k === "statement" ? k : "claim";
};
export const tieOf = (v: unknown): Tie => {
  const t = str(v).toLowerCase();
  return t === "strong" || t === "weak" ? t : "none";
};
const levelOf = (v: unknown): Level => (str(v).toLowerCase() === "conflict" ? "conflict" : "question");
/** A host name from a URL or a bare host, for "read via <host>". */
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

function parseLinks(v: unknown): LineLink[] {
  return arr(v)
    .slice(0, 10)
    .flatMap((x) => {
      const o = obj(x);
      const t = str(o.type, 32).toLowerCase();
      const target = str(o.target, 64).trim();
      return (t === "confirms" || t === "contradicts") && target ? [{ type: t as LineLink["type"], target }] : [];
    });
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
    return { host: u.hostname.toLowerCase().replace(/^www\./, ""), path: u.pathname.replace(/\/+$/, "").toLowerCase() };
  } catch {
    return null;
  }
};
/**
 * How a channel shows to visitors: Own domain when it is on the subject's domain or a subdomain of it, Verified
 * on chain for tie strong, Not verified otherwise. Only lines on Own domain or Verified on chain channels show as statements.
 */
export type ChannelStatus = "own" | "verified" | "unverified";
export const STATUS_WORDS: Record<ChannelStatus, string> = { own: "Own domain", verified: "Verified on chain", unverified: "Not verified" };
/** True when url's host is the domain or a subdomain of it. */
export function onDomain(url: string, domain: string): boolean {
  const d = domain.trim().toLowerCase().replace(/^www\./, "");
  const h = hostOf(url).toLowerCase();
  return !!d && !!h && (h === d || h.endsWith(`.${d}`));
}
export function channelStatus(c: Pick<Channel, "url" | "tie">, domain: string): ChannelStatus {
  if (onDomain(c.url, domain)) return "own";
  return c.tie === "strong" ? "verified" : "unverified";
}
/** What each label means, for the key under the channels list and a badge's title. */
export const STATUS_HELP: Record<ChannelStatus, string> = {
  own: "Own domain: on the subject's domain or a subdomain of it.",
  verified: "Verified on chain: a contract, ENS record or deployer wallet points to it.",
  unverified: "Not verified: neither.",
};
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

/**
 * A line shows as a statement only when its publisher is one of the record's channels that is Own domain (on the
 * subject's domain or a subdomain) or Verified on chain (tie strong). Otherwise a marked statement is shown as a
 * claim. Proof and claim stay as marked.
 */
export function applyLabel(line: Line, channels: Channel[], publisher: string, urls: string[], domain = ""): Line {
  if (line.marked !== "statement") return { ...line, kind: line.marked, labelNote: "", channel: null };
  const ch = channelFor(channels, publisher, urls);
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
        by: str(o.by, 200),
        sources: ids,
        srcKeys: ids.map((s) => `r:${s}`),
        quote: str(o.quote, 400),
        rerun,
        fact: marked === "proof" ? parseFact(o.fact, lineText, rerun) : null,
        from: arr(o.from).map((x) => str(x, 64).trim()).filter(Boolean).slice(0, 40),
        links: parseLinks(o.links),
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
    infobox: arr(j.infobox)
      .slice(0, 16)
      .map((r) => {
        const o = obj(r);
        return { label: str(o.label, 80), value: str(o.value, 300), url: str(o.url, 400), lines: arr(o.lines).map((x) => str(x, 64)).filter(Boolean) };
      })
      .filter((r) => r.label && r.value),
    lines,
    differs: parseDiffers(j.differs),
    dropped: parseDropped(j.dropped),
    openQuestions: arr(j.open_questions).map((q) => str(q, 600)).filter(Boolean),
    sources,
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
export function parseLines(text: string): SourceLines {
  const j = obj(JSON.parse(text));
  const sources: SourceRef[] = arr(j.sources).slice(0, 40).map((s) => {
    const o = obj(s);
    return {
      id: str(o.id, 64),
      url: str(o.url, 600),
      type: str(o.type, 64),
      publisher: str(o.publisher, 200),
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
  const lines: SourceLine[] = arr(j.lines)
    .slice(0, 200)
    .map((l) => {
      const o = obj(l);
      const sourceId = str(o.source, 64);
      const source = byId.get(sourceId) ?? null;
      const marked: Kind = kindOf(o.kind) === "statement" ? "statement" : "claim";
      return {
        id: str(o.id, 64),
        section: str(o.section, 64),
        text: str(o.text, 600),
        kind: marked,
        marked,
        labelNote: "",
        channel: null,
        by: str(o.by, 200) || source?.publisher || "",
        sources: sourceId ? [sourceId] : [],
        srcKeys: [],
        quote: str(o.quote, 400),
        rerun: "",
        fact: null,
        from: [],
        links: [],
        source,
      };
    })
    .filter((l) => l.text && l.source?.couldOpen !== false && l.source?.aboutSubject !== false);
  return { sources, lines, differs: parseDiffers(j.differs) };
}

/** A record row: a research line, or a line added by a source job (with who paid and where the job is). */
export interface RecordRow extends Row {
  origin: { payer: string; jobHref: string } | null;
}
export interface SourceJob {
  key: string;
  data: SourceLines;
  payer: string;
  jobHref: string;
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
        rows.push(...orderSection(p.page, section, p.placed).map((r) => ({ ...r, origin: { payer: p.job.payer, jobHref: p.job.jobHref } })));
      return { section, rows };
    })
    .filter((s) => s.rows.length > 0);
}

/** How many rows of each kind, for the filter. */
export function countKinds(sections: { rows: { line: Line }[] }[]): Record<Kind | "all", number> {
  const c = { all: 0, proof: 0, statement: 0, claim: 0 };
  for (const s of sections)
    for (const r of s.rows) {
      c.all++;
      c[r.line.kind]++;
    }
  return c;
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
