/**
 * Home: the headline, one bar that both searches and adds, the three labels, the subjects found on chain, and
 * how it works. Submitting the bar opens a subject that exists, or offers "Add this project", which opens the
 * first-rebuild dialog.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { statusText, subjectSummaries, type Digest, type SubjectSummary } from "./model";
import { subjectHref } from "./route";
import { CHAIN_CHOICES, OTHER_CHAIN, chainName } from "./subject";
import { findSubject, matchesQuery, parseLookup, type Lookup } from "./lookup";
import { SubjectLogo } from "./Logo";
import type { Activity } from "./useActivity";

const plural = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString("en-US")} ${n === 1 ? one : many}`;

function when(t: number | null) {
  if (!t) return "not yet";
  return new Date(t).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function SubjectItem({ s }: { s: SubjectSummary }) {
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
          {s.hasPage ? s.oneLine || "No one-line description yet." : status}
        </p>
        <p className="subject-meta small">
          {s.counts && (
            <>
              {s.counts.proven > 0 && <span className="count-kind kind-proven"><span className="dot" aria-hidden="true" />{s.counts.proven.toLocaleString("en-US")} proven</span>}
              {s.counts.contradicted > 0 && <span className="count-kind kind-contradicted"><span className="dot" aria-hidden="true" />{s.counts.contradicted.toLocaleString("en-US")} contradicted</span>}
              <span className="count-kind kind-proof"><span className="dot" aria-hidden="true" />{plural(s.counts.proof, "proof")}</span>
              <span className="count-kind kind-statement"><span className="dot" aria-hidden="true" />{plural(s.counts.statement, "statement")}</span>
              <span className="count-kind kind-claim"><span className="dot" aria-hidden="true" />{plural(s.counts.claim, "claim")}</span>
            </>
          )}
          <span>Changed {when(s.changed)}</span>
          {s.pending > 0 && <span>{plural(s.pending, "request")} pending</span>}
          {s.stale && <span>New results since you last opened it</span>}
        </p>
      </div>
    </li>
  );
}

export type AddInput = { domain: string; address: string; chain: string };

/** "No page yet for <input>": the price, a chain picker for an address, and "Add this project". */
function AddOffer({ q, shown, price, onAdd }: { q: Extract<Lookup, { kind: "domain" | "address" }>; shown: string; price: string; onAdd: (i: AddInput) => string | null }) {
  const [chain, setChain] = useState(q.kind === "address" && q.chainId !== null ? (CHAIN_CHOICES.some((c) => c.id === q.chainId) ? String(q.chainId) : OTHER_CHAIN) : "1");
  const [other, setOther] = useState(q.kind === "address" && q.chainId !== null ? String(q.chainId) : "");
  const [msg, setMsg] = useState("");
  const cost = /IMD$/.test(price) ? price : "the research price";
  const add = () => {
    if (q.kind === "domain") return setMsg(onAdd({ domain: q.domain, address: "", chain: "" }) ?? "");
    const id = chain === OTHER_CHAIN ? other.trim() : chain;
    if (!/^\d{1,12}$/.test(id) || Number(id) < 1) {
      setMsg("Write the chain ID as a number, such as 137.");
      document.getElementById("offer-chain-other")?.focus();
      return;
    }
    setMsg(onAdd({ domain: "", address: q.address, chain: id }) ?? "");
  };
  return (
    <div className="offer" role="status" aria-live="polite">
      <p>
        No page yet for <strong className="break">{shown}</strong>. Adding one costs <span className="mono nowrap">{cost}</span> and starts one research job.
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
      {msg && <p className="error" role="alert">{msg}</p>}
      <div className="row-actions">
        <button type="button" className="btn btn-primary" onClick={add}>Add this project</button>
      </div>
    </div>
  );
}

const LABELS = [
  { kind: "proof", word: "Proof", text: "anyone can re-run the check and get the same answer." },
  { kind: "statement", word: "Statement", text: "the project said it, on its own channels." },
  { kind: "claim", word: "Claim", text: "someone else said it; their name is on it." },
] as const;

const STEPS = [
  { word: "Contribute", text: "add a project or suggest changes to its record." },
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

export function Home({ items, error, loading, retrying, cached, digests, logos, reload, onAdd, price, bad, prefill }: {
  items: Activity[] | null;
  error: string | null;
  loading: boolean;
  /** A public RPC failed or limited a range and the scan moved on. */
  retrying?: boolean;
  /** The list shown comes from this browser's cache while newer blocks are read. */
  cached?: boolean;
  /** Each subject's digest and the logos they name, from IndexedDB: Home reads no full page file. */
  digests?: Map<string, Digest>;
  logos?: Map<string, string>;
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
  const all = useMemo(() => subjectSummaries(items ?? [], digests, logos), [items, digests, logos]);
  const shown = all.filter((s) => matchesQuery(s, q));

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
    setSubmitted({ raw: raw.trim(), q: parsed });
  };

  // "Add this project" under Related lands here with the bar filled in: look it up once the list is read.
  const handed = useRef(false);
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
        <h1 id="home-title" tabIndex={-1}>Look up any crypto project.</h1>
        <p className="lead">
          See what a project says, what can be proven, and where the two differ. Every line points to its source, and a swarm of independent agents checks each one before it goes in.
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
          <label htmlFor="lookup" className="sr-only">A domain or a 0x address</label>
          <input
            id="lookup"
            ref={input}
            type="text"
            inputMode="url"
            enterKeyHint="search"
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            placeholder="A domain or a 0x address"
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setErr("");
              if (submitted && e.target.value.trim() !== submitted.raw) setSubmitted(null);
            }}
            aria-invalid={!!err}
            aria-describedby={err ? "lookup-err" : "lookup-note"}
          />
          <button type="submit" className="btn btn-primary btn-lookup">Look it up</button>
        </form>
        {err && <p id="lookup-err" className="error lookup-msg" role="alert">{err}</p>}
        {offer && <AddOffer key={`${offer.kind}:${offerName}`} q={offer} shown={submitted!.raw} price={price} onAdd={onAdd} />}
        <p id="lookup-note" className="small lookup-note">People and agents can both add. Nothing is edited by hand.</p>
      </div>

      <ul className="label-cards" aria-label="The three labels">
        {LABELS.map((l) => (
          <li key={l.kind} className={`label-card label-${l.kind}`}>
            <span className={`kind kind-${l.kind}`}><span className="dot" aria-hidden="true" />{l.word}:</span> {l.text}
          </li>
        ))}
      </ul>

      {bad && <p className="warn" role="status">“{bad}” is not a project id. Ids are a domain, such as imd.fun, or chain and contract, such as 1:0x….</p>}

      <div className="home-list">
        <h2 className="list-title">Projects</h2>
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
            <p className="small" aria-live="polite">{q.trim() ? `${plural(shown.length, "project")} match “${q.trim()}”.` : `${plural(all.length, "project")} on the record, newest change first.`}</p>
            <ul className="subjects">
              {shown.map((s) => (
                <SubjectItem key={s.id} s={s} />
              ))}
            </ul>
          </>
        ) : (
          <p className="small" aria-live="polite">{q.trim() ? `No project matches “${q.trim()}”. Press Look it up to add it.` : "No projects yet. Add the first one with the bar above."}</p>
        )}
      </div>

      <section className="how" aria-labelledby="how-title">
        <h2 id="how-title" className="list-title">How it works</h2>
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
