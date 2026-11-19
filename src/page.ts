/** Turns an untrusted page.json into plain strings and arrays. Nothing here is ever rendered as HTML. */

export const SECTIONS = ["what_it_does", "how_it_works", "money", "people", "on_chain", "history"] as const;
export const SECTION_TITLES: Record<string, string> = {
  what_it_does: "What it does",
  how_it_works: "How it works",
  money: "Money",
  people: "People",
  on_chain: "On chain",
  history: "History",
};

export interface Line {
  id: string;
  section: string;
  text: string;
  kind: "proof" | "statement" | "claim";
  by: string;
  sources: string[];
  quote: string;
  rerun: string;
}
export interface Source {
  id: string;
  ref: string;
  type: string;
  readAt: string;
  couldOpen: boolean | null;
}
export interface Channel {
  label: string;
  url: string;
  tie: string;
}
export interface Page {
  name: string;
  oneLine: string;
  channels: Channel[];
  lines: Line[];
  differs: { lines: string[]; why: string }[];
  openQuestions: string[];
  sources: Source[];
}

const str = (v: unknown, max = 2000): string => (typeof v === "string" ? v.slice(0, max) : typeof v === "number" ? String(v) : "");
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const obj = (v: unknown): Record<string, unknown> => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});

export function parsePage(text: string): Page {
  const j = obj(JSON.parse(text));
  const subject = obj(j.subject);
  const lines: Line[] = arr(j.lines)
    .slice(0, 60)
    .map((l) => {
      const o = obj(l);
      const k = str(o.kind).toLowerCase();
      return {
        id: str(o.id, 64),
        section: str(o.section, 64),
        text: str(o.text, 600),
        kind: (k === "proof" || k === "statement" ? k : "claim") as Line["kind"],
        by: str(o.by, 200),
        sources: arr(o.sources).map((s) => str(s, 64)).filter(Boolean),
        quote: str(o.quote, 400),
        rerun: str(o.rerun, 600),
      };
    })
    .filter((l) => l.text);
  return {
    name: str(subject.name, 200) || "IMD",
    oneLine: str(subject.one_line, 400),
    channels: arr(subject.channels).map((c) => {
      const o = obj(c);
      return { label: str(o.label, 120), url: str(o.url, 400), tie: str(o.tie, 16) || "none" };
    }),
    lines,
    differs: arr(j.differs).map((d) => {
      const o = obj(d);
      return { lines: arr(o.lines).map((x) => str(x, 64)), why: str(o.why, 400) };
    }),
    openQuestions: arr(j.open_questions).map((q) => str(q, 600)).filter(Boolean),
    sources: arr(j.sources).map((s) => {
      const o = obj(s);
      return {
        id: str(o.id, 64),
        ref: str(o.ref, 600),
        type: str(o.type, 64),
        readAt: str(o.read_at, 64),
        couldOpen: typeof o.could_open === "boolean" ? o.could_open : null,
      };
    }),
  };
}

/** Lines of one section, in order, with the second line of each differs pair moved directly under the first. */
export type Row = { line: Line; differsWith: string | null; why: string };

/** Every section's rows; a line already shown under its pair in an earlier section is not shown twice. */
export function orderAll(page: Page): { section: string; rows: Row[] }[] {
  const placed = new Set<string>();
  return sectionsOf(page)
    .map((section) => ({ section, rows: orderSection(page, section, placed) }))
    .filter((s) => s.rows.length > 0);
}

export function orderSection(page: Page, section: string, placed = new Set<string>()): Row[] {
  const inSection = page.lines.filter((l) => l.section === section);
  const pairOf = new Map<string, { other: string; why: string }>();
  for (const d of page.differs) {
    const [a, b] = d.lines;
    if (a && b && !pairOf.has(a) && !pairOf.has(b)) {
      pairOf.set(a, { other: b, why: d.why });
      pairOf.set(b, { other: a, why: d.why });
    }
  }
  const byId = new Map(page.lines.map((l) => [l.id, l]));
  const out: Row[] = [];
  for (const l of inSection) {
    if (placed.has(l.id)) continue;
    placed.add(l.id);
    out.push({ line: l, differsWith: null, why: "" });
    const p = pairOf.get(l.id);
    const second = p && byId.get(p.other);
    if (p && second && !placed.has(second.id)) {
      placed.add(second.id);
      out.push({ line: second, differsWith: l.id, why: p.why });
    }
  }
  return out;
}

/** Sections in the brief's order, then any the page named that the brief did not. */
export function sectionsOf(page: Page): string[] {
  const named = new Set(page.lines.map((l) => l.section));
  const known = SECTIONS.filter((s) => named.has(s));
  const extra = [...named].filter((s) => !(SECTIONS as readonly string[]).includes(s));
  // A line placed under another section by a differs pair is already shown there.
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
  isChannel: boolean;
}
export interface SourceLine extends Line {
  /** The line's one source, from the same file. */
  source: SourceRef | null;
}
export interface SourceLines {
  sources: SourceRef[];
  lines: SourceLine[];
  differs: { lines: string[]; why: string }[];
}

/**
 * Turns an untrusted lines.json into plain strings. Kinds are never raised: a line is a statement only when
 * its source's publisher is one of the subject's channels; everything else, proof included, is a claim.
 * Sources that could not be opened contribute no lines.
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
      const statement = str(o.kind).toLowerCase() === "statement" && source?.isChannel === true;
      return {
        id: str(o.id, 64),
        section: str(o.section, 64),
        text: str(o.text, 600),
        kind: (statement ? "statement" : "claim") as Line["kind"],
        by: str(o.by, 200) || source?.publisher || "",
        sources: sourceId ? [sourceId] : [],
        quote: str(o.quote, 400),
        rerun: "",
        source,
      };
    })
    .filter((l) => l.text && l.source?.couldOpen !== false);
  return {
    sources,
    lines,
    differs: arr(j.differs).map((d) => {
      const o = obj(d);
      return { lines: arr(o.lines).map((x) => str(x, 64)), why: str(o.why, 400) };
    }),
  };
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

/**
 * Every section in order: the research lines first, then each completed source job's lines, each job's
 * differs pairs kept together (the second line directly under the first).
 */
export function mergeRecord(page: Page | null, jobs: SourceJob[]): { section: string; rows: RecordRow[] }[] {
  const asPage = (j: SourceJob): Page => ({
    name: "",
    oneLine: "",
    channels: [],
    sources: [],
    openQuestions: [],
    lines: j.data.lines.map((l) => ({ ...l, id: `${j.key}:${l.id}` })),
    differs: j.data.differs.map((d) => ({ why: d.why, lines: d.lines.map((x) => `${j.key}:${x}`) })),
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
