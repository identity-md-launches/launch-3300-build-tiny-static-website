/**
 * Home: the headline, one bar that both searches and adds, the three kinds shown as one fact, and the subjects found
 * on chain. Submitting the bar opens a subject that exists, or offers "Add this project", which opens the
 * first-rebuild dialog.
 */
import { GROUP_TONE, GROUP_WORDS, homeGroups } from "./settle";
import { useEffect, useMemo, useRef, useState } from "react";
import { readerNoteText, upkeepText, statusText, subjectSummaries, unreadableSummary, unreadableText, type Digest, type SubjectSummary } from "./model";
import { subjectHref } from "./route";
import { CHAIN_CHOICES, OTHER_CHAIN, chainName } from "./subject";
import { findSubject, matchesQuery, parseLookup, type Lookup } from "./lookup";
import { SubjectLogo } from "./Logo";
import { KindIcon, ToneMark } from "./KindIcon";
import imdLogo from "./assets/imd-logo.png";
import { HOME_HEADING } from "./config";
import { LEADS_MAX, planLeads } from "./bodies";
import type { Activity } from "./useActivity";
import type { Example as Lines3 } from "./example";
import { SaveStar, useSaved } from "./saved";
import { SORTS, sortOf, sortProjects, figureOf, findMatches, sortFromHash, sortHash, type SortKey, type RowFacts } from "./sorting";

const plural = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString("en-US")} ${n === 1 ? one : many}`;

function when(t: number | null) {
  if (!t) return "not yet";
  return new Date(t).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
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

function SubjectItem({ s, reading, failed, retry, figure = "" }: { s: SubjectSummary; reading: boolean; failed: string; retry?: (id: string) => void; figure?: string }) {
  if (s.unread && !s.unreadable) return <PlaceholderItem s={s} failed={reading ? "" : failed} retry={retry} />;
  const status = s.status ? statusText(s.status) : "";
  return (
    <li className="subject">
      <SubjectLogo name={s.name} logo={s.logo} size={44} />
      <div className="subject-body">
        <a className="subject-link" href={subjectHref(s.id)}>
          <span className="subject-name">{s.name}</span>
          {s.name !== s.id && <span className="subject-id">{s.id}</span>}
        </a>
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
          <span>Changed {when(s.changed)}</span>
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
      <SaveStar id={s.id} name={s.name} />
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
        Needs a rebuild {checking ? <span className="sr-only">(still checking)</span> : <span className="num">{needs.toLocaleString("en-US")}</span>}
      </button>
      <button type="button" className="btn btn-filter" aria-pressed={view === "saved"} onClick={() => set("saved")}>
        Saved <span className="num">{saved.toLocaleString("en-US")}</span>
      </button>
    </div>
  );
}
/** "Find a project" (by name or domain) and "Sort by", above the list. */
function ListTools({ find, setFind, sort, setSort }: { find: string; setFind: (v: string) => void; sort: SortKey; setSort: (k: SortKey) => void }) {
  return (
    <div className="list-tools">
      <div className="field list-find">
        <label htmlFor="find-project">Find a project</label>
        <input id="find-project" type="search" autoComplete="off" spellCheck={false} placeholder="Name or domain" value={find} onChange={(e) => setFind(e.target.value)} />
      </div>
      <div className="field list-sort">
        <label htmlFor="sort-projects">Sort by</label>
        <select id="sort-projects" value={sort} onChange={(e) => setSort(sortOf(e.target.value))}>
          {SORTS.map((o) => (
            <option key={o.key} value={o.key}>{o.label}</option>
          ))}
        </select>
      </div>
    </div>
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
type Example = Lines3 & { from: string | null; name: string | null; logoHash: string | null };
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

export function Home({ items, error, loading, retrying, cached, digests, logos, reading, failed, busy, retry, reload, onAdd, price, bad, prefill, unreadable }: {
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
  reload: () => Promise<unknown>;
  onAdd: (i: AddInput) => string | null;
  price: string;
  bad?: string;
  /** A domain or chain:0x… handed over by "Add this project" under Related: the bar starts filled in with it. */
  prefill?: string;
}) {
  const [q, setQ] = useState(prefill ?? "");
  const [submitted, setSubmitted] = useState<{ raw: string; q: Lookup } | null>(null);
  const [err, setErr] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const all = useMemo(() => {
    const listed = subjectSummaries(items ?? [], digests, logos);
    if (!unreadable?.size) return listed;
    const have = new Set(listed.map((s) => s.id));
    const marked = listed.map((s) => (!s.hasPage && unreadable.get(s.id) ? { ...s, unread: false, status: null, unreadable: unreadable.get(s.id) } : s));
    return [...marked, ...[...unreadable].filter(([id]) => !have.has(id)).map(([id, n]) => unreadableSummary(id, n))];
  }, [items, digests, logos, unreadable]);
  const example = useMemo(() => pickExample(digests), [digests]);
  const [view, setView] = useState<ListView>("all");
  const onlyStale = view === "stale";
  const saved = useSaved();
  const [find, setFind] = useState("");
  const [sort, setSortState] = useState<SortKey>(() => (typeof location === "undefined" ? "changed" : sortFromHash(location.hash)));
  const setSort = (k: SortKey) => {
    setSortState(k);
    setLimit(PAGE_ROWS);
    // The choice is kept in the address, so a sorted view can be shared.
    history.replaceState(null, "", sortHash(k));
  };
  const [limit, setLimit] = useState(PAGE_ROWS);
  // What each row is sorted by: counted jobs and first request from the scan, the rest from the cached digest.
  const facts = useMemo(() => {
    const out = new Map<string, RowFacts>();
    for (const a of items ?? []) {
      const id = a.req.subject;
      const f = out.get(id) ?? { edits: 0, added: null, open: null, launched: null };
      if (a.state === "completed" && !a.notRead) f.edits += 1;
      const t = a.time ?? a.doneTime;
      if (t && (f.added === null || t < f.added)) f.added = t;
      out.set(id, f);
    }
    for (const [id, f] of out) {
      const d = digests?.get(id);
      f.open = d?.open ?? null;
      f.launched = d?.launched ?? null;
    }
    return out;
  }, [items, digests]);
  const needs = all.filter((s) => s.outdated).length;
  const savedRows = all.filter((s) => saved.includes(s.id)).length;
  const filtered = all.filter((s) => matchesQuery(s, q) && findMatches(s, find) && (view === "all" || (view === "stale" ? !!s.outdated : saved.includes(s.id))));
  const shown = sortProjects(filtered, sort, facts);
  // Reads still under way can add a contract to the list or mark a page out of date.
  const pendingReads = !!busy || all.some((s) => s.unread && !failed?.has(s.id));
  // A list read from this browser's cache, or not read at all yet, cannot show that a project has no page: an unmatched
  // lookup waits for the current scan of Ethereum, and says so when that scan fails.
  const pendingScan = items === null || !!cached;
  const scanFailed = pendingScan && !!error && !loading;
  const SCAN_FAILED = "Ethereum could not be read, so the site cannot tell whether this project already has a page. Try again in a moment.";
  /** The totals are shown once every project's counts are read, never a part of them. */
  const countsReady = !pendingReads && all.every((s) => !!s.counts || !s.hasPage);
  /** Some counts are known: while the rest load, the totals say "about". */
  const someCounts = all.some((s) => !!s.counts);
  /** An address or domain looked up while reads were pending: answered once they finish. */
  const [checking, setChecking] = useState<string | null>(null);

  const look = (raw: string) => {
    const parsed = parseLookup(raw);
    setSubmitted(null);
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
    const found = findSubject(parsed, all);
    if (found) {
      location.hash = subjectHref(found);
      return;
    }
    if (scanFailed) {
      setErr(SCAN_FAILED);
      void reload();
      return;
    }
    // A page that lists this contract (or domain) may still be on its way: never offer a paid duplicate before
    // every pending read has answered.
    if (pendingScan || pendingReads) {
      setChecking(raw);
      return;
    }
    setChecking(null);
    setSubmitted({ raw: raw.trim(), q: parsed });
  };

  // Answer a lookup made while reads were pending, as soon as one finds it or all have finished.
  useEffect(() => {
    if (checking === null) return;
    const parsed = parseLookup(checking);
    if (parsed.kind === "empty" || parsed.kind === "invalid") return setChecking(null);
    const found = findSubject(parsed, all);
    if (found) {
      setChecking(null);
      location.hash = subjectHref(found);
    } else if (scanFailed) {
      setChecking(null);
      setErr(SCAN_FAILED);
    } else if (!pendingScan && !pendingReads) {
      setChecking(null);
      setSubmitted({ raw: checking.trim(), q: parsed });
    }
  }, [checking, all, pendingReads, pendingScan, scanFailed]);

  // An offer already shown gives way when a read finds the project it was about.
  useEffect(() => {
    if (!submitted) return;
    const found = findSubject(submitted.q, all);
    if (found) {
      setSubmitted(null);
      location.hash = subjectHref(found);
    }
  }, [submitted, all]);

  /** Checks again before the paid dialog opens: routes to a project a read has since found. */
  const add = (input: AddInput): string | null => {
    if (submitted) {
      const found = findSubject(submitted.q, all);
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
          <label htmlFor="lookup" className="sr-only">A project's website or a contract address</label>
          <input
            id="lookup"
            ref={input}
            type="text"
            inputMode="url"
            enterKeyHint="search"
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            placeholder="A project's website or a contract address"
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setErr("");
              setChecking(null);
              if (submitted && e.target.value.trim() !== submitted.raw) setSubmitted(null);
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
        {offer && <AddOffer key={`${offer.kind}:${offerName}`} q={offer} shown={submitted!.raw} price={price} onAdd={add} />}
      </div>

      <section className="example" aria-labelledby="example-title">
        <h2 id="example-title" className="sr-only">The three kinds of line</h2>
        <ul className="label-cards">
          {EXAMPLE_ORDER.map((l) => (
            <li key={l.kind} className={`label-card label-${l.kind}`}>
              <span className="card-head">
                <span className={`card-icon kind-${l.kind}`}><KindIcon kind={l.kind} size={20} /></span>
                <span className="card-title">
                  <span className={`card-name kind-${l.kind}`}>{l.word}</span>
                  <span className="card-note">{l.note}</span>
                </span>
              </span>
              <span className="example-text">{example[l.kind]}</span>
            </li>
          ))}
        </ul>
        <p className="small example-from">
          From the page of{" "}
          <a className="example-src" href={subjectHref(example.from ?? EXAMPLE_FALLBACK_FROM)}>
            <SubjectLogo name={example.name ?? fallbackName(digests)} logo={exampleLogo(example, digests, logos)} size={20} />
            {example.name ?? fallbackName(digests)}
          </a>
        </p>
      </section>

      {bad && <p className="warn" role="status">“{bad}” is not a project id. Ids are a domain, such as imd.fun, or chain and contract, such as 1:0x….</p>}

      <div className="home-list">
        <h2 className="list-title">Projects</h2>
        {items !== null && all.length > 0 && <p className="totals-line num" aria-live="polite">{countsReady ? <TotalsLine text={totalsText(all)} /> : someCounts ? <TotalsLine text={`About ${totalsText(all)}`} /> : "Reading project totals…"}</p>}
        {error && items !== null && (
          <p className="error">
            Unable to read the chain: {error}.{" "}
            <button type="button" className="linklike" onClick={() => void reload()} disabled={loading}>{loading ? "Reading chain…" : "Try again"}</button>
          </p>
        )}
        {items === null ? (
          <StillReading error={error} retrying={!!retrying} />
        ) : shown.length ? (
          <>
            {cached && loading && <p className="small" role="status">Shown from this browser. Reading newer blocks…</p>}
            <ListTools find={find} setFind={(v) => { setFind(v); setLimit(PAGE_ROWS); }} sort={sort} setSort={setSort} />
            <ListFilter all={all.length} needs={needs} saved={savedRows} view={view} set={(v) => { setView(v); setLimit(PAGE_ROWS); }} checking={pendingReads} />
            <p className="small list-note" aria-live="polite">{onlyStale && pendingReads ? "Checking which pages need a rebuild…" : find.trim() ? `${plural(shown.length, "project")} match “${find.trim()}”.` : listNote(shown.length, all.length, q.trim(), onlyStale)}</p>
            <ul className="subjects">
              {shown.slice(0, limit).map((s) => (
                <SubjectItem key={s.id} s={s} reading={!!reading?.has(s.id)} failed={failed?.get(s.id) ?? ""} retry={retry} figure={figureOf(s, sort, facts.get(s.id))} />
              ))}
            </ul>
            {shown.length > limit && (
              <p className="show-more">
                <button type="button" className="btn" onClick={() => setLimit((n) => n + PAGE_ROWS)}>
                  Show more <span className="small">({(shown.length - limit).toLocaleString("en-US")} left)</span>
                </button>
              </p>
            )}
          </>
        ) : all.length ? (
          <>
            <ListTools find={find} setFind={setFind} sort={sort} setSort={setSort} />
            <ListFilter all={all.length} needs={needs} saved={savedRows} view={view} set={setView} checking={pendingReads} />
            <p className="small" aria-live="polite">
              {view === "saved" && !find.trim() ? "Saved projects stay on this device." : find.trim() ? `No project matches “${find.trim()}”.` : pendingReads && onlyStale ? "Checking which pages need a rebuild…" : q.trim() ? `No project${onlyStale ? " that needs a rebuild" : ""} matches “${q.trim()}”.${onlyStale ? "" : " Press Look it up to add it."}` : onlyStale ? "No page needs a rebuild." : "No projects."}
            </p>
          </>
        ) : (
          <p className="small" aria-live="polite">{q.trim() ? `No project matches “${q.trim()}”. Press Look it up to add it.` : "No projects yet. Add the first one with the bar above."}</p>
        )}
      </div>

    </section>
  );
}
