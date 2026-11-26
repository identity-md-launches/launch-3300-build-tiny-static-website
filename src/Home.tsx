/**
 * Home: the headline, one bar that both searches and adds, the three kinds shown as one fact, and the subjects found
 * on chain. Submitting the bar opens a subject that exists, or offers "Add this project", which opens the
 * first-rebuild dialog.
 */
import { GROUP_TONE, GROUP_WORDS, homeGroups } from "./settle";
import { useEffect, useMemo, useRef, useState } from "react";
import { countedBy, isCurrent, readerNoteText, upkeepText, statusText, subjectSummaries, unreadableSummary, unreadableText, type Digest, type SubjectSummary } from "./model";
import { subjectHref } from "./route";
import { CHAIN_CHOICES, OTHER_CHAIN, chainName } from "./subject";
import { findSubject, matchesNameOrDomain, parseLookup, type Lookup } from "./lookup";
import { NARROW_QUERY, noMatchText, SEARCH_PLACEHOLDER, SEARCH_PLACEHOLDER_SHORT, useMedia } from "./HeaderSearch";
import { SubjectLogo } from "./Logo";
import { KindIcon, ToneMark } from "./KindIcon";
import imdLogo from "./assets/imd-logo.png";
import { HOME_HEADING } from "./config";
import { CategoryChips, ProjectCard, ProjectRow, ViewSwitch, useHomeView } from "./HomeViews";
import type { Category } from "./page";
import { LEADS_MAX, planLeads } from "./bodies";
import type { Activity } from "./useActivity";
import type { Example as Lines3 } from "./example";
import { SaveStar, useSaved } from "./saved";
import { localDate } from "./dates";
import { SORTS, sortOf, sortProjects, figureOf, sortFromHash, sortHash, type SortKey, type RowFacts } from "./sorting";

const plural = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString("en-US")} ${n === 1 ? one : many}`;

function when(t: number | null) {
  if (!t) return "not yet";
  return localDate(t);
}

/**
 * The reader's note on Overview and on a home row: "2 additions not yet merged. Rebuild", only when results are not
 * folded in. An older instruction format alone shows nothing here (see OutdatedNote).
 */
export function ReaderNote({ o, href }: { o: SubjectSummary["outdated"]; href: string }) {
  const text = readerNoteText(o);
  if (!text) return null;
  return (
    <p className="outdated small" role="note">
      <span>{text}.</span> <a href={href}>Rebuild</a>
    </p>
  );
}

/** The upkeep note (Out of date, with its reason), for upkeep only: the Contribute tab and Page upkeep. */
export function OutdatedNote({ o, href }: { o: NonNullable<SubjectSummary["outdated"]>; href: string }) {
  return (
    <p className="outdated small">
      <span>{upkeepText(o)}</span> <a href={href}>Rebuild</a>
    </p>
  );
}

/** "Try again": reads a subject's failed files again now. */
function RetryButton({ id, retry }: { id: string; retry?: (id: string) => void }) {
  if (!retry) return null;
  return (
    <button type="button" className="linklike" onClick={() => retry(id)}>
      Try again
    </button>
  );
}

/** While a subject's page file and logo are read for its digest: a light row with its id, never "Open the page". */
function PlaceholderItem({ s, failed, retry }: { s: SubjectSummary; failed: string; retry?: (id: string) => void }) {
  return (
    <li className={`subject${failed ? "" : " subject-loading"}`} aria-busy={!failed}>
      <SubjectLogo name={s.name} logo={null} size={44} />
      <div className="subject-body">
        <a className="subject-link subject-link-id" href={subjectHref(s.id)}>
          <span className="subject-id">{s.id}</span>
        </a>
        {failed ? (
          <p className="subject-line">
            Its record could not be read here ({failed}). <RetryButton id={s.id} retry={retry} />
          </p>
        ) : (
          <>
            <p className="subject-line"><span className="sr-only">Reading its record…</span><span className="bar" aria-hidden="true" /></p>
          </>
        )}
      </div>
    </li>
  );
}

/** When the record last changed; while its block time is still being read, that it is. */
const Changed = ({ s }: { s: SubjectSummary }) => <span>{s.waiting ? "Reading when it changed…" : `Changed ${when(s.changed)}`}</span>;

/**
 * A subject with no digest in this browser yet: drawn from the Intake scan alone (its id, its counted jobs, when it
 * changed). Its record is read when its page is opened, never to draw the list.
 */
function LightItem({ s, figure }: { s: SubjectSummary; figure: string }) {
  return (
    <li className="subject subject-light">
      <SubjectLogo name={s.name} logo={null} size={44} />
      <div className="subject-body">
        <div className="subject-head">
          <a className="subject-link" href={subjectHref(s.id)}>
            <span className="subject-name">{s.name}</span>
            {s.name !== s.id && <span className="subject-id">{s.id}</span>}
          </a>
          <SaveStar id={s.id} name={s.name} />
        </div>
        <p className="subject-line">Open its page to read the record.</p>
        <p className="subject-meta small">
          {figure && <span className="row-figure">{figure}</span>}
          <Changed s={s} />
          {s.pending > 0 && <span>{plural(s.pending, "request")} pending</span>}
        </p>
      </div>
    </li>
  );
}

function SubjectItem({ s, reading, failed, retry, figure = "" }: { s: SubjectSummary; reading: boolean; failed: string; retry?: (id: string) => void; figure?: string }) {
  if (s.unread && !s.unreadable) return reading || failed ? <PlaceholderItem s={s} failed={reading ? "" : failed} retry={retry} /> : <LightItem s={s} figure={figure} />;
  const status = s.status ? statusText(s.status) : "";
  return (
    <li className="subject">
      <SubjectLogo name={s.name} logo={s.logo} size={44} />
      <div className="subject-body">
        <div className="subject-head">
          <a className="subject-link" href={subjectHref(s.id)}>
            <span className="subject-name">{s.name}</span>
            {s.name !== s.id && <span className="subject-id">{s.id}</span>}
          </a>
          <SaveStar id={s.id} name={s.name} />
        </div>
        <p className={`subject-line${s.status && s.status.kind !== "pending" && s.status.kind !== "none" ? " subject-status" : ""}`}>
          {s.hasPage ? s.oneLine || "No one-line description yet." : s.unreadable ? <>{unreadableText(s.unreadable)} See <a href={subjectHref(s.id, "activity")}>Activity</a>.</> : status}
        </p>
        <p className="subject-meta small">
          {s.counts && (
            <>
              {homeGroups(s.counts).map((g) => (
                <span key={g} className={`count-kind kind-${GROUP_TONE[g]}`}>
                  <ToneMark tone={GROUP_TONE[g]} />
                  {s.counts![g].toLocaleString("en-US")} {GROUP_WORDS[g].toLowerCase()}
                </span>
              ))}
            </>
          )}
          {figure && <span className="row-figure">{figure}</span>}
          <Changed s={s} />
          {s.pending > 0 && <span>{plural(s.pending, "request")} pending</span>}
          {s.stale && reading && <span>Reading newer results…</span>}
        </p>
        {!!s.incomplete && (
          <p className="small subject-incomplete">
            {reading ? "Reading its files again…" : <>Counts may be short: {plural(s.incomplete, "result file")} could not be read. <RetryButton id={s.id} retry={retry} /></>}
          </p>
        )}
        <ReaderNote o={s.outdated} href={subjectHref(s.id, "rebuild")} />
      </div>
    </li>
  );
}

type ListView = "all" | "stale" | "saved";
/** All, only the pages that need a rebuild, or only the projects saved on this device. */
function ListFilter({ all, needs, saved, view, set, checking }: { all: number; needs: number; saved: number; view: ListView; set: (v: ListView) => void; checking: boolean }) {
  return (
    <div className="filter" role="group" aria-label="Show projects">
      <button type="button" className="btn btn-filter" aria-pressed={view === "all"} onClick={() => set("all")}>
        All <span className="num">{all.toLocaleString("en-US")}</span>
      </button>
      <button type="button" className="btn btn-filter" aria-pressed={view === "stale"} onClick={() => set("stale")}>
        <span className="wide-only">Needs a rebuild</span>
        <span className="narrow-only">Rebuild</span> {checking ? <span className="sr-only">(still checking)</span> : <span className="num">{needs.toLocaleString("en-US")}</span>}
      </button>
      <button type="button" className="btn btn-filter" aria-pressed={view === "saved"} onClick={() => set("saved")}>
        Saved <span className="num">{saved.toLocaleString("en-US")}</span>
      </button>
    </div>
  );
}
/** "Sort by", on the right of the row above the list. The big box at the top is the one search. */
function ListSort({ sort, setSort }: { sort: SortKey; setSort: (k: SortKey) => void }) {
  return (
    <div className="field list-sort">
      <label htmlFor="sort-projects">Sort by</label>
      <select id="sort-projects" value={sort} onChange={(e) => setSort(sortOf(e.target.value))}>
        {SORTS.map((o) => (
          <option key={o.key} value={o.key}>{o.label}</option>
        ))}
      </select>
    </div>
  );
}
/**
 * What each row is sorted by: counted jobs and first request from the scan; open questions and launch date from the
 * digest, only while it was taken from exactly the results the scan lists (else they await an update). Pure, for tests.
 */
export function rowFacts(items: Activity[], digests?: Map<string, Digest>): Map<string, RowFacts> {
  const by = new Map<string, Activity[]>();
  for (const a of items) by.set(a.req.subject, [...(by.get(a.req.subject) ?? []), a]);
  return new Map(
    [...by].map(([id, scanned]): [string, RowFacts] => {
      const d = digests?.get(id);
      const list = countedBy(d, scanned);
      if (!list.length) return [id, { edits: 0, added: null, current: false, open: null, launched: null }];
      const first = list.reduce((m, a) => (a.req.blockNumber < m.req.blockNumber ? a : m));
      // While its first request's time is being read, no later one stands in for it.
      const added = first.metaPending && !first.time ? null : Math.min(...list.map((a) => a.time ?? a.doneTime ?? Infinity));
      const current = isCurrent(d, list) && d!.open !== undefined && d!.launched !== undefined;
      return [id, { edits: list.filter((a) => a.state === "completed" && !a.notRead).length, added: added !== null && Number.isFinite(added) ? added : null, current, open: current ? d!.open! : null, launched: current ? d!.launched! : null }];
    }),
  );
}
/** Rows drawn at first, and added by each "Show more". */
export const PAGE_ROWS = 30;

const listNote = (shown: number, all: number, q: string, only: boolean) =>
  q ? `${plural(shown, "project")} ${only ? "that need a rebuild " : ""}match “${q}”.` : only ? `${plural(shown, "project")} need${shown === 1 ? "s" : ""} a rebuild.` : "";

export type AddInput = { domain: string; address: string; chain: string; leads?: string[] };

/** "No page yet for <input>": the price, a chain picker for an address, and "Add this project". */
function AddOffer({ q, shown, price, onAdd }: { q: Extract<Lookup, { kind: "domain" | "address" }>; shown: string; price: string; onAdd: (i: AddInput) => string | null }) {
  const [chain, setChain] = useState(q.kind === "address" && q.chainId !== null ? (CHAIN_CHOICES.some((c) => c.id === q.chainId) ? String(q.chainId) : OTHER_CHAIN) : "1");
  const [other, setOther] = useState(q.kind === "address" && q.chainId !== null ? String(q.chainId) : "");
  const [msg, setMsg] = useState("");
  const [leadsRaw, setLeadsRaw] = useState("");
  const leads = planLeads(leadsRaw);
  const cost = /IMD$/.test(price) ? price : "what the swarm charges";
  const add = () => {
    if (q.kind === "domain") return setMsg(onAdd({ domain: q.domain, address: "", chain: "", leads: leads.links }) ?? "");
    const id = chain === OTHER_CHAIN ? other.trim() : chain;
    if (!/^\d{1,12}$/.test(id) || Number(id) < 1) {
      setMsg("Write the chain ID as a number, such as 137.");
      document.getElementById("offer-chain-other")?.focus();
      return;
    }
    setMsg(onAdd({ domain: "", address: q.address, chain: id, leads: leads.links }) ?? "");
  };
  return (
    <div className="offer" role="status" aria-live="polite">
      <p>
        No page yet for <strong className="break">{shown}</strong>. Adding one starts one research job and costs <span className="mono nowrap">{cost}</span>; the price is read again before you pay.
      </p>
      {q.kind === "address" && (
        <div className="offer-chain">
          <label htmlFor="offer-chain">Chain of this contract (optional)</label>
          <select id="offer-chain" value={chain} onChange={(e) => setChain(e.target.value)}>
            {CHAIN_CHOICES.map((c) => (
              <option key={c.id} value={c.id}>{c.name} ({c.id})</option>
            ))}
            <option value={OTHER_CHAIN}>Other chain ID</option>
          </select>
          {chain === OTHER_CHAIN && (
            <>
              <label htmlFor="offer-chain-other" className="sr-only">Chain ID</label>
              <input id="offer-chain-other" type="text" inputMode="numeric" className="mono" placeholder="Chain ID, such as 137" autoComplete="off" value={other} onChange={(e) => setOther(e.target.value)} />
            </>
          )}
          <p className="small">Its page will be filed under {chain === OTHER_CHAIN ? (other.trim() ? `chain ${other.trim()}` : "the chain you write") : chainName(chain)}.</p>
        </div>
      )}
      <div className="field leads-field">
        <label htmlFor="offer-leads">Research to start from <span className="small">(optional)</span></label>
        <textarea id="offer-leads" rows={2} spellCheck={false} autoCapitalize="none" autoComplete="off" placeholder="https://example.com/research" value={leadsRaw} onChange={(e) => setLeadsRaw(e.target.value)} aria-describedby="offer-leads-hint" />
        <p id="offer-leads-hint" className="small">Up to {LEADS_MAX} https links, one per line. The swarm reads them first and follows their sources.</p>
        {leads.rejected.length > 0 && (
          <ul className="plain small error">
            {leads.rejected.map((r) => (
              <li key={r.line} className="break">Not used: {r.line} ({r.why})</li>
            ))}
          </ul>
        )}
      </div>
      {msg && <p className="error" role="alert">{msg}</p>}
      <div className="row-actions">
        <button type="button" className="btn btn-primary" onClick={add}>Add this project</button>
      </div>
    </div>
  );
}

/** How many unread projects an unsettled contract lookup links to. */
const UNSURE_LINKS = 8;

/**
 * A contract no known record lists, while some projects' records are not known in this browser: which projects those
 * are, each with a link to its page (the page reads the record), and the way on when none of them is the one.
 */
function Unsure({ shown, rows, onNone }: { shown: string; rows: SubjectSummary[]; onNone: () => void }) {
  const list = rows.slice(0, UNSURE_LINKS);
  return (
    <div className="offer" role="status" aria-live="polite">
      <p>
        No record known here lists <strong className="break">{shown}</strong>. {rows.length === 1 ? "The contracts of 1 project are" : `The contracts of ${rows.length.toLocaleString("en-US")} projects are`} not known in this browser yet, so {rows.length === 1 ? "it" : "one of them"} may be the one. Open its page to check:
      </p>
      <p className="unsure-links">
        {list.map((s) => (
          <a key={s.id} href={subjectHref(s.id)}>{s.name}</a>
        ))}
        {rows.length > list.length && <span className="small">and {(rows.length - list.length).toLocaleString("en-US")} more in the list below</span>}
      </p>
      <div className="row-actions">
        <button type="button" className="btn" onClick={onNone}>None of these: add it</button>
      </div>
    </div>
  );
}

/** One fact shown three ways. Fixed text, used when neither uniswap.org nor zora.co has a live example. */
export const EXAMPLE_FALLBACK = {
  proof: "The ZORA token contract on Base reports a total supply of 10 billion ZORA.",
  statement: "zora.co states a total supply of 10,000,000,000 ZORA.",
  claim: "A news site reports that ZORA has a supply of ten billion.",
} as const;
/** The page the fixed text is taken from: zora.co. */
export const EXAMPLE_FALLBACK_FROM = "zora.co";
const fallbackName = (d: Map<string, Pick<Digest, "name">> | undefined) => d?.get(EXAMPLE_FALLBACK_FROM)?.name || "Zora";
const exampleLogo = (e: Example, d: Map<string, Digest> | undefined, logos: Map<string, string> | undefined) => {
  const hash = e.from ? e.logoHash : d?.get(EXAMPLE_FALLBACK_FROM)?.logoHash ?? null;
  return hash ? logos?.get(hash) ?? null : null;
};
/** The record the example comes from: its id, its name and its logo's hash; null for the fixed text. */
export type Example = Lines3 & { from: string | null; name: string | null; logoHash: string | null };
/** The three cards, in this order: the icon, the name and what the kind means. */
export const EXAMPLE_ORDER = [
  { kind: "proof", word: "Proof", note: "anyone can re-run it" },
  { kind: "statement", word: "Statement", note: "the project says" },
  { kind: "claim", word: "Claim", note: "others say" },
] as const;
/** Where the live example is looked for, in order; the fixed text when neither page has one fact present as all three kinds. */
export const EXAMPLE_FROM = ["uniswap.org", "zora.co"] as const;

/**
 * The live example: three lines of one record that state the same fact (example.ts), kept with that record's digest
 * when its page was read. uniswap.org's when it has one, else zora.co's; the fixed text when neither has.
 */
export function pickExample(digests: Map<string, Pick<Digest, "id" | "example" | "hasPage"> & Partial<Pick<Digest, "name" | "logoHash">>> | undefined): Example {
  for (const id of EXAMPLE_FROM) {
    const d = digests?.get(id);
    if (d && d.hasPage && d.example) return { ...d.example, from: d.id, name: d.name || d.id, logoHash: d.logoHash ?? null };
  }
  return { ...EXAMPLE_FALLBACK, from: null, name: null, logoHash: null };
}

/**
 * True when the cards state ZORA's total supply: the fixed text, or zora.co's own proof of it. Only then do the Docs
 * caption and totalSupply() steps describe the proof shown; a project's name alone does not say which fact it is.
 */
export const isZoraSupply = (e: Example) => e.from === null || (e.from === EXAMPLE_FALLBACK_FROM && /\bZORA\b/.test(e.proof) && /\btotal supply\b|totalSupply\(\)/i.test(e.proof));

/**
 * The three cards (Proof, Statement, Claim) with one example: the same component on Home and in Docs. Each card links
 * to the page the example comes from; no logo or caption is shown, so a first visit never shows a stand-in letter.
 */
export function ExampleCards({ example, label }: { example: Example; label?: string }) {
  const href = subjectHref(example.from ?? EXAMPLE_FALLBACK_FROM);
  return (
    <ul className="label-cards" aria-label={label}>
      {EXAMPLE_ORDER.map((l) => (
        <li key={l.kind} className="label-item">
          <a className={`label-card label-${l.kind}`} href={href}>
          <span className="card-head">
            <span className={`card-icon kind-${l.kind}`}><KindIcon kind={l.kind} size={20} /></span>
            <span className="card-title">
              <span className={`card-name kind-${l.kind}`}>{l.word}</span>
              <span className="card-note">{l.note}</span>
            </span>
          </span>
          <span className="example-text">{example[l.kind]}</span>
          </a>
        </li>
      ))}
    </ul>
  );
}

/** "5 projects, 812 lines, 64 of them proofs anyone can re-run." from the rows' counts. */
export function totalsText(rows: { counts: { all: number; checks: number } | null }[]): string {
  const lines = rows.reduce((n, r) => n + (r.counts?.all ?? 0), 0);
  const proofs = rows.reduce((n, r) => n + (r.counts?.checks ?? 0), 0);
  const f = (n: number) => n.toLocaleString("en-US");
  return `${f(rows.length)} ${rows.length === 1 ? "project" : "projects"}, ${f(lines)} ${lines === 1 ? "line" : "lines"}, ${f(proofs)} of them ${proofs === 1 ? "a proof" : "proofs"} anyone can re-run.`;
}

/**
 * The totals sentence with the Proof icon beside its proof count: "5 projects, 812 lines, ✓64 of them proofs anyone
 * can re-run." On phones the words after the counts are hidden (.totals-more), so it reads "5 projects, 812 lines,
 * ✓64 proofs" on one line.
 */
function TotalsLine({ text }: { text: string }) {
  const at = text.lastIndexOf(", ") + 2;
  const m = /^([\d,]+) of them (a proof|proofs)( anyone can re-run\.)$/.exec(text.slice(at));
  return (
    <>
      {text.slice(0, at)}
      <span className="kind-proof totals-proofs">
        <KindIcon kind="proof" size={14} />
        {m ? (
          <span>
            {m[1]} <span className="totals-more">of them </span>
            {m[2] === "a proof" ? <><span className="totals-more">a </span>proof</> : "proofs"}
            <span className="totals-more">{m[3]}</span>
          </span>
        ) : (
          text.slice(at)
        )}
      </span>
    </>
  );
}

/** Shown instead of an empty list while nothing has been read: never "No projects" before the chain answered. */
export function StillReading({ error, retrying }: { error: string | null; retrying: boolean }) {
  return (
    <div className="still" role="status">
      <p className="still-title">Still reading the chain…</p>
      <p className="small">
        {error
          ? `No public RPC answered yet (${error}). Trying again in a moment.`
          : retrying
            ? "A public RPC failed or limited the range. Trying the next one with smaller ranges."
            : "Reading the requests from Ethereum. Later visits start from what this browser already read."}
      </p>
    </div>
  );
}

export function Home({ items, error, loading, retrying, cached, digests, logos, reading, failed, busy, retry, filling = false, reload, onAdd, price, bad, prefill, unreadable, example: given }: {
  items: Activity[] | null;
  /** Subjects with finished page jobs none of which is read, and how many of their results were not read. */
  unreadable?: Map<string, number>;
  error: string | null;
  loading: boolean;
  /** A public RPC failed or limited a range and the scan moved on. */
  retrying?: boolean;
  /** The list shown comes from this browser's cache while newer blocks are read. */
  cached?: boolean;
  /** Each subject's digest and the logos they name, from IndexedDB: Home reads no full page file. */
  digests?: Map<string, Digest>;
  logos?: Map<string, string>;
  /** Subjects whose files are being read for their digest, and those that failed: placeholder rows. */
  reading?: Set<string>;
  failed?: Map<string, string>;
  /** True while a digest read that could still change the list is outstanding. */
  busy?: boolean;
  /** Reads a subject's failed files again. */
  retry?: (id: string) => void;
  /** Some rows show only what the scan gave: their times and names are still being read. */
  filling?: boolean;
  /** The three-card example, chosen once in App so Home and Docs show the same one. */
  example?: Example;
  reload: () => Promise<unknown>;
  onAdd: (i: AddInput) => string | null;
  price: string;
  bad?: string;
  /** A domain or chain:0x… handed over by "Add this project" under Related: the bar starts filled in with it. */
  prefill?: string;
}) {
  const [q, setQ] = useState(prefill ?? "");
  const narrow = useMedia(NARROW_QUERY);
  const [submitted, setSubmitted] = useState<{ raw: string; q: Lookup } | null>(null);
  /** A contract lookup the known records cannot settle: shown instead of the offer until the visitor says it is none of them. */
  const [unsure, setUnsure] = useState<{ raw: string; q: Lookup } | null>(null);
  const [err, setErr] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const all = useMemo(() => {
    const listed = subjectSummaries(items ?? [], digests, logos);
    if (!unreadable?.size) return listed;
    const have = new Set(listed.map((s) => s.id));
    const marked = listed.map((s) => (!s.hasPage && unreadable.get(s.id) ? { ...s, unread: false, status: null, unreadable: unreadable.get(s.id) } : s));
    return [...marked, ...[...unreadable].filter(([id]) => !have.has(id)).map(([id, n]) => unreadableSummary(id, n))];
  }, [items, digests, logos, unreadable]);
  const picked = useMemo(() => pickExample(digests), [digests]);
  const example = given ?? picked;
  const [view, setView] = useState<ListView>("all");
  const onlyStale = view === "stale";
  const saved = useSaved();
  const [sort, setSortState] = useState<SortKey>(() => (typeof location === "undefined" ? "changed" : sortFromHash(location.hash)));
  const setSort = (k: SortKey) => {
    setSortState(k);
    setLimit(PAGE_ROWS);
    // The choice is kept in the address, so a sorted view can be shared.
    history.replaceState(null, "", sortHash(k));
  };
  const [limit, setLimit] = useState(PAGE_ROWS);
  const facts = useMemo(() => rowFacts(items ?? [], digests), [items, digests]);
  const needs = all.filter((s) => s.outdated).length;
  const savedRows = all.filter((s) => saved.includes(s.id)).length;
  const [layout, setLayout] = useHomeView();
  const [cat, setCat] = useState<Category | null>(null);
  const filteredAll = all.filter((s) => matchesNameOrDomain(s, q) && (view === "all" || (view === "stale" ? !!s.outdated : saved.includes(s.id))));
  // The chips count the projects the search and the filter buttons leave; a chip then filters both views.
  const filtered = cat ? filteredAll.filter((s) => s.category === cat) : filteredAll;
  const shown = sortProjects(filtered, sort, facts);
  // Reads still under way can add a contract to the list or mark a page out of date.
  const pendingReads = !!busy;
  /** Rows drawn from the scan alone. */
  const unknown = all.some((s) => s.unread && !s.unreadable);
  /** Projects whose contracts are not known here for their newest page: they may hold a contract no known record lists. */
  const unindexed = all.filter((s) => s.indexed === false && !s.unreadable);
  /** The project a lookup names: by its record's contracts, else by a contract its own requests on the Intake name. */
  const find1 = (parsed: Lookup) => findSubject(parsed, all) ?? findSubject(parsed, unindexed.map((s) => ({ id: s.id, contracts: s.claimed ?? [] })));
  /**
   * Answers a lookup no row matched, from what is known here alone: a domain, or a contract when every project's
   * contracts are known, gets the offer; otherwise the visitor is shown which projects are not known. It never reads a record.
   */
  const answer = (raw: string, parsed: Lookup) => {
    setChecking(null);
    if (parsed.kind === "address" && unindexed.length) setUnsure({ raw: raw.trim(), q: parsed });
    else setSubmitted({ raw: raw.trim(), q: parsed });
  };
  // A list read from this browser's cache, or not read at all yet, cannot show that a project has no page: an unmatched
  // lookup waits for the current scan of Ethereum, and says so when that scan fails.
  const pendingScan = items === null || !!cached;
  const scanFailed = pendingScan && !!error && !loading;
  const SCAN_FAILED = "Ethereum could not be read, so the site cannot tell whether this project already has a page. Try again in a moment.";
  /** The totals are exact once every project's counts are known; until then they say "about". */
  const countsReady = !pendingReads && !filling && !unknown && all.every((s) => !!s.counts || !s.hasPage);
  /** Some counts are known: while the rest load, the totals say "about". */
  const someCounts = all.some((s) => !!s.counts);
  /** An address or domain looked up while reads were pending: answered once they finish. */
  const [checking, setChecking] = useState<string | null>(null);

  const look = (raw: string) => {
    const parsed = parseLookup(raw);
    setSubmitted(null);
    setUnsure(null);
    if (parsed.kind === "empty") {
      setErr("Write a domain, such as imd.fun, or a 0x contract address.");
      input.current?.focus();
      return;
    }
    if (parsed.kind === "invalid") {
      setErr(`“${raw.trim()}” is not a domain or a 0x address. Write a domain such as imd.fun, paste a link, or a contract address.`);
      input.current?.focus();
      return;
    }
    setErr("");
    const found = find1(parsed);
    if (found) {
      location.hash = subjectHref(found);
      return;
    }
    if (scanFailed) {
      setErr(SCAN_FAILED);
      void reload();
      return;
    }
    // The list may still be on its way: never offer a paid duplicate before the scan and the stored records answered.
    if (pendingScan || pendingReads) {
      setChecking(raw);
      return;
    }
    answer(raw, parsed);
  };

  // Answer a lookup made while reads were pending, as soon as one finds it or all have finished.
  useEffect(() => {
    if (checking === null) return;
    const parsed = parseLookup(checking);
    if (parsed.kind === "empty" || parsed.kind === "invalid") return setChecking(null);
    const found = find1(parsed);
    if (found) {
      setChecking(null);
      location.hash = subjectHref(found);
    } else if (scanFailed) {
      setChecking(null);
      setErr(SCAN_FAILED);
    } else if (!pendingScan && !pendingReads) answer(checking, parsed);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [checking, all, pendingReads, pendingScan, scanFailed]);

  // An offer already shown gives way when a read finds the project it was about.
  useEffect(() => {
    const asked = submitted ?? unsure;
    if (!asked) return;
    const found = find1(asked.q);
    if (found) {
      setSubmitted(null);
      setUnsure(null);
      location.hash = subjectHref(found);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [submitted, unsure, all]);

  /** Checks again before the paid dialog opens: routes to a project a read has since found. */
  const add = (input: AddInput): string | null => {
    if (submitted) {
      const found = find1(submitted.q);
      if (found) {
        location.hash = subjectHref(found);
        return null;
      }
    }
    if (pendingScan) return "Still reading newer blocks from Ethereum. Try again in a moment.";
    if (pendingReads) return "Still checking project contracts. Try again in a moment.";
    return onAdd(input);
  };

  // "Add this project" under Related lands here with the bar filled in: look it up once the list is read.
  const handed = useRef(false);
  useEffect(() => {
    if (prefill === "") document.getElementById("lookup")?.focus();
  }, [prefill]);
  useEffect(() => {
    if (!prefill || handed.current || items === null) return;
    handed.current = true;
    setQ(prefill);
    look(prefill);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefill, items]);

  const offer = submitted && (submitted.q.kind === "domain" || submitted.q.kind === "address") ? submitted.q : null;
  const offerName = offer ? (offer.kind === "domain" ? offer.domain : offer.address) : "";

  return (
    <section className="tab home" aria-labelledby="home-title">
      <div className="hero">
        <h1 id="home-title" tabIndex={-1}>{HOME_HEADING}</h1>
        <p className="lead">
          Everything is checked by{" "}
          <a className="imd-link" href="https://imd.fun" target="_blank" rel="noopener noreferrer">
            <img className="imd-logo" src={imdLogo} width={18} height={18} alt="" decoding="async" />
            IMD, a distributed swarm of AI agents
          </a>
          .
        </p>
        <form
          className="lookup"
          role="search"
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            look(q);
          }}
        >
          <label htmlFor="lookup" className="sr-only">{SEARCH_PLACEHOLDER}</label>
          <input
            id="lookup"
            ref={input}
            type="text"
            inputMode="url"
            enterKeyHint="search"
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            placeholder={narrow ? SEARCH_PLACEHOLDER_SHORT : SEARCH_PLACEHOLDER}
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setErr("");
              setChecking(null);
              if (submitted && e.target.value.trim() !== submitted.raw) setSubmitted(null);
              if (unsure && e.target.value.trim() !== unsure.raw) setUnsure(null);
            }}
            aria-invalid={!!err}
            aria-describedby={err ? "lookup-err" : undefined}
          />
          <button type="submit" className="btn btn-primary btn-lookup">Look it up</button>
          <a className="example-link small" href={subjectHref("imdusd.com")}>or see an example</a>
        </form>
        {err && <p id="lookup-err" className="error lookup-msg" role="alert">{err}</p>}
        {checking !== null && (
          <p className="small lookup-msg" role="status">
            {pendingScan ? "Reading newer blocks from Ethereum…" : "Checking project contracts…"}
          </p>
        )}
        {unsure && !offer && <Unsure shown={unsure.raw} rows={unindexed} onNone={() => { setSubmitted(unsure); setUnsure(null); }} />}
        {offer && <AddOffer key={`${offer.kind}:${offerName}`} q={offer} shown={submitted!.raw} price={price} onAdd={add} />}
      </div>

      <section className="example" aria-labelledby="example-title">
        <h2 id="example-title" className="sr-only">The three kinds of line</h2>
        <ExampleCards example={example} />
      </section>

      {bad && <p className="warn" role="status">“{bad}” is not a project id. Ids are a domain, such as imd.fun, or chain and contract, such as 1:0x….</p>}

      <div className="home-list">
        <h2 className="list-title">Projects</h2>
        {items !== null && all.length > 0 && <p className="totals-line num" aria-live="polite">{countsReady ? <TotalsLine text={totalsText(all)} /> : someCounts ? <TotalsLine text={`About ${totalsText(all)}`} /> : `${plural(all.length, "project")}.`}</p>}
        {error && items !== null && (
          <p className="error">
            Unable to read the chain: {error}.{" "}
            <button type="button" className="linklike" onClick={() => void reload()} disabled={loading}>{loading ? "Reading chain…" : "Try again"}</button>
          </p>
        )}
        {items === null ? (
          <StillReading error={error} retrying={!!retrying} />
        ) : all.length ? (
          <>
            {cached && loading && <p className="small" role="status">Shown from this browser. Reading newer blocks…</p>}
            {/* One set of controls above both list states: typing past the last match never unmounts the field. */}
            {/* One row: the filter buttons on the left, "Sort by" on the right. */}
            <div className="list-bar">
              <ListFilter all={all.length} needs={needs} saved={savedRows} view={view} set={(v) => { setView(v); setLimit(PAGE_ROWS); }} checking={pendingReads} />
              <div className="list-tools">
                <ViewSwitch view={layout} set={setLayout} />
                <ListSort sort={sort} setSort={setSort} />
              </div>
            </div>
            <CategoryChips rows={filteredAll} value={cat} set={(c) => { setCat(c); setLimit(PAGE_ROWS); }} />
            {shown.length ? (
              <>
                <p className="small list-note" aria-live="polite">{onlyStale && pendingReads ? "Checking which pages need a rebuild…" : listNote(shown.length, all.length, q.trim(), onlyStale)}</p>
                <ul className={layout === "cards" ? "pcards" : "prows"}>
                  {shown.slice(0, limit).map((s) =>
                    // A row still being read (or whose read failed) keeps its placeholder, with its retry.
                    s.unread && !s.unreadable && (reading?.has(s.id) || failed?.get(s.id)) ? (
                      <SubjectItem key={s.id} s={s} reading={!!reading?.has(s.id)} failed={failed?.get(s.id) ?? ""} retry={retry} figure={figureOf(s, sort, facts.get(s.id))} />
                    ) : layout === "cards" ? (
                      <ProjectCard key={s.id} s={s} items={items} />
                    ) : (
                      <ProjectRow key={s.id} s={s} />
                    ),
                  )}
                </ul>
                {shown.length > limit && (
                  <p className="show-more">
                    <button type="button" className="btn" onClick={() => setLimit((n) => n + PAGE_ROWS)}>
                      Show more <span className="small">({(shown.length - limit).toLocaleString("en-US")} left)</span>
                    </button>
                  </p>
                )}
              </>
            ) : (
              <p className="small list-note" aria-live="polite">
                {view === "saved" && !q.trim() ? "Saved projects stay on this device." : pendingReads && onlyStale ? "Checking which pages need a rebuild…" : q.trim() ? noMatchText(q, onlyStale) : onlyStale ? "No page needs a rebuild." : "No projects."}
              </p>
            )}
          </>
        ) : (
          <p className="small" aria-live="polite">{q.trim() ? noMatchText(q) : "No projects yet. Add the first one with the box above."}</p>
        )}
      </div>

    </section>
  );
}
