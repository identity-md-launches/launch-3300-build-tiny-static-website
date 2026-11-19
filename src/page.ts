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
}
export interface Page {
  name: string;
  oneLine: string;
  channels: Channel[];
  contracts: Contract[];
  /** The main contract's address, or "" when the page names none. */
  main: string;
  summary: SummarySentence[];
  lines: Line[];
  differs: Differ[];
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

/* ---------- Facts ---------- */

const CHAINS = ["Robinhood Chain", "Ethereum", "Base", "Arbitrum", "Optimism", "Polygon", "Solana"];
/** Reads the chain and block of a proof line from fact.chain/fact.block, else from its text and re-run steps. */
export function chainAndBlock(fact: Record<string, unknown>, text: string, rerun: string): { chain: string; block: string } {
  let chain = str(fact.chain, 64);
  let block = str(fact.block, 32);
  const hay = `${text} ${rerun}`;
  if (!chain) {
    const lower = hay.toLowerCase();
    let best = -1;
    for (const c of CHAINS) {
      const i = lower.indexOf(c.toLowerCase());
      if (i >= 0 && (best < 0 || i < best)) {
        best = i;
        chain = c;
      }
    }
    if (!chain && /\bchain(?:\s*id)?\s*1\b|mainnet/i.test(hay)) chain = "Ethereum";
  }
  if (!block) {
    const m = /\bblock\s+(?:number\s+)?#?(\d[\d,]{2,})/i.exec(hay);
    if (m) block = m[1]!.replace(/,/g, "");
  }
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
 * A line shows as a statement only when its publisher is one of the record's channels with tie strong or weak.
 * Otherwise a marked statement is shown as a claim. Proof and claim stay as marked.
 */
export function applyLabel(line: Line, channels: Channel[], publisher: string, urls: string[]): Line {
  if (line.marked !== "statement") return { ...line, kind: line.marked, labelNote: "", channel: null };
  const ch = channelFor(channels, publisher, urls);
  if (ch && ch.tie !== "none") return { ...line, kind: "statement", labelNote: "", channel: ch };
  const labelNote = ch
    ? `Marked a statement by the job. Shown as a claim because the channel ${ch.label || ch.url} has tie none.`
    : `Marked a statement by the job. Shown as a claim because ${publisher || "its publisher"} is not one of the record's channels.`;
  return { ...line, kind: "claim", labelNote, channel: ch };
}

/* ---------- page.json ---------- */

export function parsePage(text: string): Page {
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
  const lines: Line[] = arr(j.lines)
    .slice(0, 60)
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
      };
      return applyLabel(line, channels, line.by, ids.map((s) => refOf.get(s) ?? ""));
    })
    .filter((l) => l.text);
  const main = contracts.find((c) => c.main)?.address ?? "";
  return {
    name: str(subject.name, 200) || "IMD",
    oneLine: str(subject.one_line, 400),
    channels,
    contracts,
    main: /^0x[0-9a-fA-F]{40}$/.test(main) ? main : "",
    summary: arr(j.summary)
      .slice(0, 8)
      .map((s) => {
        const o = obj(s);
        return { text: str(o.text, 600), lines: arr(o.lines).map((x) => str(x, 64)).filter(Boolean) };
      })
      .filter((s) => s.text),
    lines,
    differs: parseDiffers(j.differs),
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
export function mergeRecord(page: Page | null, jobs: SourceJob[]): { section: string; rows: RecordRow[] }[] {
  const channels = page?.channels ?? [];
  const asPage = (j: SourceJob) => ({
    lines: j.data.lines.map((l) => {
      const labelled = applyLabel(l, channels, l.source?.publisher || l.by, l.source?.url ? [l.source.url] : []);
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
