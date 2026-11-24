/**
 * Home: the headline, one bar that both searches and adds, the three labels, the subjects found on chain, and
 * how it works. Submitting the bar opens a subject that exists, or offers "Add this project", which opens the
 * first-rebuild dialog.
 */
import { GROUP_TONE, GROUP_WORDS, homeGroups } from "./settle";
import { useEffect, useMemo, useRef, useState } from "react";
import { readerNoteText, upkeepText, statusText, subjectSummaries, unreadableSummary, unreadableText, type Digest, type SubjectSummary } from "./model";
import { subjectHref } from "./route";
import { CHAIN_CHOICES, OTHER_CHAIN, chainName } from "./subject";
import { findSubject, matchesQuery, parseLookup, type Lookup } from "./lookup";
import { SubjectLogo } from "./Logo";
import { fetchArtifact } from "./api";
import { LEADS_MAX, planLeads } from "./bodies";
import type { Activity } from "./useActivity";

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
      <SubjectLogo name={s.name} logo={null} size={28} />
      <div className="subject-body">
        <a className="subject-link" href={subjectHref(s.id)}>
          <span className="subject-name">{s.id}</span>
        </a>
        {failed ? (
          <p className="subject-line">
            Its record could not be read here ({failed}). <RetryButton id={s.id} retry={retry} />
          </p>
        ) : (
          <>
            <p className="subject-line"><span className="sr-only">Reading its record…</span><span className="bar" aria-hidden="true" /></p>
            <p className="subject-meta small" aria-hidden="true"><span className="bar bar-short" /></p>
          </>
        )}
      </div>
    </li>
  );
}

function SubjectItem({ s, reading, failed, retry }: { s: SubjectSummary; reading: boolean; failed: string; retry?: (id: string) => void }) {
  if (s.unread && !s.unreadable) return <PlaceholderItem s={s} failed={reading ? "" : failed} retry={retry} />;
  const status = s.status ? statusText(s.status) : "";
  return (
    <li className="subject">
      <SubjectLogo name={s.name} logo={s.logo} size={28} />
      <div className="subject-body">
        <a className="subject-link" href={subjectHref(s.id)}>
          <span className="subject-name">{s.name}</span>
          {s.name !== s.id && <span className="subject-id mono">{s.id}</span>}
        </a>
        <p className={`subject-line${s.status && s.status.kind !== "pending" && s.status.kind !== "none" ? " subject-status" : ""}`}>
          {s.hasPage ? s.oneLine || "No one-line description yet." : s.unreadable ? <>{unreadableText(s.unreadable)} See <a href={subjectHref(s.id, "activity")}>Activity</a>.</> : status}
        </p>
        <p className="subject-meta small">
          {s.counts && (
            <>
              {homeGroups(s.counts).map((g) => (
                <span key={g} className={`count-kind kind-${GROUP_TONE[g]}`}>
                  <span className="dot" aria-hidden="true" />
                  {s.counts![g].toLocaleString("en-US")} {GROUP_WORDS[g].toLowerCase()}
                </span>
              ))}
            </>
          )}
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
    </li>
  );
}

/** All, or only the pages that need a rebuild. */
function ListFilter({ all, needs, only, set, checking }: { all: number; needs: number; only: boolean; set: (v: boolean) => void; checking: boolean }) {
  return (
    <div className="filter" role="group" aria-label="Show projects">
      <button type="button" className="btn btn-filter" aria-pressed={!only} onClick={() => set(false)}>
        All <span className="num">{all.toLocaleString("en-US")}</span>
      </button>
      <button type="button" className="btn btn-filter" aria-pressed={only} onClick={() => set(true)}>
        Needs a rebuild {checking ? <span className="sr-only">(still checking)</span> : <span className="num">{needs.toLocaleString("en-US")}</span>}
      </button>
    </div>
  );
}

const listNote = (shown: number, all: number, q: string, only: boolean) =>
  q ? `${plural(shown, "project")} ${only ? "that need a rebuild " : ""}match “${q}”.` : only ? `${plural(shown, "project")} need${shown === 1 ? "s" : ""} a rebuild.` : `${plural(all, "project")} on the record, newest change first.`;

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

/** One fact shown three ways. Fixed text, used until (or unless) the live example loads from a page. */
export const EXAMPLE_FALLBACK = {
  claim: "A news site reports that ZORA has a supply of ten billion.",
  statement: "zora.co states a total supply of 10,000,000,000 ZORA.",
  proof: "The token contract reports a total supply of ten billion. Anyone can re-run it.",
} as const;
type Example = { claim: string; statement: string; proof: string; from: string | null };
const EXAMPLE_ORDER = [
  { kind: "claim", word: "Claim" },
  { kind: "statement", word: "Statement" },
  { kind: "proof", word: "Proof" },
] as const;

/**
 * The live example: from the newest read page of zora.co, one claim, one statement and one proof about its supply.
 * Null when any of the three is missing; the fixed text is shown then.
 */
export function exampleFromPage(page: unknown, from: string): Example | null {
  const lines = (page as { lines?: unknown })?.lines;
  if (!Array.isArray(lines)) return null;
  const pick = (kind: string) => {
    const l = lines.find((x) => x && typeof x === "object" && (x as { kind?: unknown }).kind === kind && /supply/i.test(String((x as { text?: unknown }).text ?? "")));
    const t = l ? String((l as { text: unknown }).text).trim() : "";
    return t && t.length <= 220 ? t : "";
  };
  const claim = pick("claim");
  const statement = pick("statement");
  const proof = pick("proof");
  return claim && statement && proof ? { claim, statement, proof, from } : null;
}

function useExample(items: Activity[] | null): Example {
  const [ex, setEx] = useState<Example>({ ...EXAMPLE_FALLBACK, from: null });
  const hash = useMemo(() => {
    const pages = (items ?? []).filter((a) => a.req.subject === "zora.co" && a.req.kind === "add" && a.fileHash && a.page);
    return pages.length ? pages[pages.length - 1]!.fileHash : null;
  }, [items]);
  useEffect(() => {
    if (!hash) return;
    let live = true;
    fetchArtifact(hash)
      .then((t) => {
        const e = exampleFromPage(JSON.parse(t), "zora.co");
        if (e && live) setEx(e);
      })
      .catch(() => undefined);
    return () => void (live = false);
  }, [hash]);
  return ex;
}

/** "5 projects, 812 lines, 64 of them proofs anyone can re-run." from the rows' counts. */
export function totalsText(rows: { counts: { all: number; checks: number } | null }[]): string {
  const lines = rows.reduce((n, r) => n + (r.counts?.all ?? 0), 0);
  const proofs = rows.reduce((n, r) => n + (r.counts?.checks ?? 0), 0);
  const f = (n: number) => n.toLocaleString("en-US");
  return `${f(rows.length)} ${rows.length === 1 ? "project" : "projects"}, ${f(lines)} ${lines === 1 ? "line" : "lines"}, ${f(proofs)} of them ${proofs === 1 ? "a proof" : "proofs"} anyone can re-run.`;
}

const STEPS = [
  { word: "Contribute", text: "add a project or suggest changes to its record. Adding costs what the swarm charges, shown before you pay." },
  { word: "The swarm checks", text: "a research job reads the sources; a panel of agents answers single yes or no questions." },
  { word: "Everyone reads", text: "a short summary on top, every line and its source underneath." },
];

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
  reload: () => Promise<void>;
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
  const example = useExample(items);
  const [onlyStale, setOnlyStale] = useState(false);
  const needs = all.filter((s) => s.outdated).length;
  const shown = all.filter((s) => matchesQuery(s, q) && (!onlyStale || !!s.outdated));
  // Reads still under way can add a contract to the list or mark a page out of date.
  const pendingReads = !!busy || all.some((s) => s.unread && !failed?.has(s.id));
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
    if (items === null) {
      setErr("Still reading the projects from Ethereum. Try again in a moment.");
      return;
    }
    // A page that lists this contract (or domain) may still be on its way: never offer a paid duplicate before
    // every pending read has answered.
    if (pendingReads) {
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
    } else if (!pendingReads) {
      setChecking(null);
      setSubmitted({ raw: checking.trim(), q: parsed });
    }
  }, [checking, all, pendingReads]);

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
        <h1 id="home-title" tabIndex={-1}>Crowdsourced research on any project or protocol.</h1>
        <p className="lead">
          See what a project says, what can be proven, and what others claim about it. Add anything that's missing. Every addition is checked by a{" "}
          <a href="https://imd.fun" target="_blank" rel="noopener noreferrer">distributed swarm</a> of AI agents.{" "}
          <a className="on-imd" href="https://imd.fun" target="_blank" rel="noopener noreferrer">on IMD</a>
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
            aria-describedby={err ? "lookup-err" : "lookup-note"}
          />
          <button type="submit" className="btn btn-primary btn-lookup">Look it up</button>
        </form>
        <a className="example-link small" href={subjectHref("imdusd.com")}>or see an example</a>
        {err && <p id="lookup-err" className="error lookup-msg" role="alert">{err}</p>}
        {checking !== null && (
          <p className="small lookup-msg" role="status">
            Checking project contracts…
          </p>
        )}
        {offer && <AddOffer key={`${offer.kind}:${offerName}`} q={offer} shown={submitted!.raw} price={price} onAdd={add} />}
        <p id="lookup-note" className="small lookup-note">People and agents can both add. Nothing is edited by hand.</p>
      </div>

      <section className="example" aria-labelledby="example-title">
        <h2 id="example-title" className="sr-only">One fact, three ways</h2>
        <ul className="label-cards">
          {EXAMPLE_ORDER.map((l) => (
            <li key={l.kind} className={`label-card label-${l.kind}`}>
              <span className={`kind kind-${l.kind}`}><span className="dot" aria-hidden="true" />{l.word}</span>
              <span className="example-text">{example[l.kind]}</span>
            </li>
          ))}
        </ul>
        {example.from && <p className="small example-from">From the page of <a href={subjectHref(example.from)}>{example.from}</a>.</p>}
      </section>

      {bad && <p className="warn" role="status">“{bad}” is not a project id. Ids are a domain, such as imd.fun, or chain and contract, such as 1:0x….</p>}

      <div className="home-list">
        <h2 className="list-title">Projects</h2>
        {items !== null && all.length > 0 && <p className="totals num" aria-live="polite">{totalsText(all)}</p>}
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
            <ListFilter all={all.length} needs={needs} only={onlyStale} set={setOnlyStale} checking={pendingReads} />
            <p className="small" aria-live="polite">{onlyStale && pendingReads ? "Checking which pages need a rebuild…" : listNote(shown.length, all.length, q.trim(), onlyStale)}</p>
            <ul className="subjects">
              {shown.map((s) => (
                <SubjectItem key={s.id} s={s} reading={!!reading?.has(s.id)} failed={failed?.get(s.id) ?? ""} retry={retry} />
              ))}
            </ul>
          </>
        ) : onlyStale && all.length ? (
          <>
            <ListFilter all={all.length} needs={needs} only={onlyStale} set={setOnlyStale} checking={pendingReads} />
            <p className="small" aria-live="polite">
              {pendingReads ? "Checking which pages need a rebuild…" : q.trim() ? `No project that needs a rebuild matches “${q.trim()}”.` : "No page needs a rebuild."}
            </p>
          </>
        ) : (
          <p className="small" aria-live="polite">{q.trim() ? `No project matches “${q.trim()}”. Press Look it up to add it.` : "No projects yet. Add the first one with the bar above."}</p>
        )}
      </div>

      <section className="how" aria-labelledby="how-title">
        <h2 id="how-title" className="list-title">How it works</h2>
        <p className="small"><a href="#/docs">Read how it works in full</a>: the three kinds of line, the cost, how to cite a line and which jobs count.</p>
        <ol className="steps">
          {STEPS.map((s, i) => (
            <li key={s.word} className="step">
              <span className="step-n num" aria-hidden="true">{i + 1}.</span>
              <p><strong>{s.word}:</strong> {s.text}</p>
            </li>
          ))}
        </ol>
      </section>
    </section>
  );
}
