/** Home: a search box, the subjects found on chain, and "Add a project", which opens the Rebuild dialog. */
import { useMemo, useState } from "react";
import { subjectSummaries, type SubjectSummary } from "./model";
import { subjectHref } from "./route";
import { CHAIN_CHOICES, OTHER_CHAIN, subjectIdOf, validateSubject } from "./subject";
import type { Activity } from "./useActivity";

const plural = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString("en-US")} ${n === 1 ? one : many}`;

function when(t: number | null) {
  if (!t) return "not yet";
  return new Date(t).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function SubjectItem({ s }: { s: SubjectSummary }) {
  return (
    <li className="subject">
      <a className="subject-link" href={subjectHref(s.id)}>
        <span className="subject-name">{s.name}</span>
        {s.name !== s.id && <span className="subject-id mono">{s.id}</span>}
      </a>
      <p className="subject-line">{s.oneLine || (s.hasPage ? "No one-line description yet." : "No page yet: the first rebuild is under way or was refused.")}</p>
      <p className="subject-meta small">
        <span className="count-kind kind-proof"><span className="dot" aria-hidden="true" />{plural(s.counts.proof, "proof")}</span>
        <span className="count-kind kind-statement"><span className="dot" aria-hidden="true" />{plural(s.counts.statement, "statement")}</span>
        <span className="count-kind kind-claim"><span className="dot" aria-hidden="true" />{plural(s.counts.claim, "claim")}</span>
        <span>Changed {when(s.changed)}</span>
        {s.pending > 0 && <span>{plural(s.pending, "request")} pending</span>}
      </p>
    </li>
  );
}

function AddProject({ onAdd, price }: { onAdd: (i: { domain: string; address: string; chain: string }) => string | null; price: string }) {
  const [f, setF] = useState({ domain: "", address: "", chain: "1", otherChain: "" });
  const [errs, setErrs] = useState<ReturnType<typeof validateSubject>>({});
  const [msg, setMsg] = useState("");
  const other = f.chain === OTHER_CHAIN;
  // The subject as the form describes it: a listed chain, or the chain id typed under "Other chain ID".
  const input = { domain: f.domain, address: f.address, chain: other ? f.otherChain.trim() : f.chain };
  const id = subjectIdOf(input);
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const found = validateSubject(input);
    setErrs(found);
    const first = (["domain", "address", "chain"] as const).find((k) => found[k]);
    if (first) {
      setMsg("");
      document.getElementById(first === "chain" && other ? "add-chain-other" : `add-${first}`)?.focus();
      return;
    }
    setMsg(onAdd(input) ?? "");
  };
  return (
    <section className="card add" id="add" aria-labelledby="add-title" tabIndex={-1}>
      <h2 id="add-title">Add a project</h2>
      <p className="small">One research job writes the first page. You see its request and price first.</p>
      <form className="form" onSubmit={submit} noValidate>
        <label htmlFor="add-domain">Website domain</label>
        <input id="add-domain" name="domain" type="text" inputMode="url" autoComplete="off" autoCapitalize="none" spellCheck={false} placeholder="example.com"
          value={f.domain} onChange={(e) => setF({ ...f, domain: e.target.value })} aria-invalid={!!errs.domain} aria-describedby={errs.domain ? "add-domain-err" : "add-id"} />
        {errs.domain && <p id="add-domain-err" className="error">{errs.domain}</p>}
        <label htmlFor="add-address">Main contract address (optional)</label>
        <input id="add-address" name="address" type="text" className="mono" autoComplete="off" autoCapitalize="none" spellCheck={false} placeholder="0x…"
          value={f.address} onChange={(e) => setF({ ...f, address: e.target.value })} aria-invalid={!!errs.address} aria-describedby={errs.address ? "add-address-err" : undefined} />
        {errs.address && <p id="add-address-err" className="error">{errs.address}</p>}
        <label htmlFor="add-chain">Chain of that contract</label>
        <select id="add-chain" name="chain" value={f.chain} onChange={(e) => setF({ ...f, chain: e.target.value })} aria-invalid={!!errs.chain && !other}
          aria-describedby={errs.chain && !other ? "add-chain-err" : undefined}>
          {CHAIN_CHOICES.map((c) => (
            <option key={c.id} value={c.id}>{c.name} ({c.id})</option>
          ))}
          <option value={OTHER_CHAIN}>Other chain ID</option>
        </select>
        {other && (
          <>
            <label htmlFor="add-chain-other">Chain ID</label>
            <input id="add-chain-other" name="otherChain" type="text" inputMode="numeric" pattern="[0-9]*" autoComplete="off" placeholder="137"
              className="mono" value={f.otherChain} onChange={(e) => setF({ ...f, otherChain: e.target.value })}
              aria-invalid={!!errs.chain} aria-describedby={errs.chain ? "add-chain-err" : undefined} />
          </>
        )}
        {errs.chain && <p id="add-chain-err" className="error">{errs.chain}</p>}
        <p id="add-id" className="small">
          {id ? <>Its page will be <span className="mono break">{subjectHref(id)}</span></> : "Projects only: a domain, or a contract if it has no website."}
        </p>
        {msg && <p className="error" role="alert">{msg}</p>}
        <div className="row-actions">
          <button className="btn btn-primary" type="submit">Review the first rebuild</button>
          <span className="price mono">{price}</span>
        </div>
      </form>
    </section>
  );
}

export function Home({ items, error, loading, reload, onAdd, price, bad }: {
  items: Activity[] | null;
  error: string | null;
  loading: boolean;
  reload: () => Promise<void>;
  onAdd: (i: { domain: string; address: string; chain: string }) => string | null;
  price: string;
  bad?: string;
}) {
  const [q, setQ] = useState("");
  const all = useMemo(() => subjectSummaries(items ?? []), [items]);
  const needle = q.trim().toLowerCase();
  const shown = needle ? all.filter((s) => [s.id, s.name, s.oneLine].some((x) => x.toLowerCase().includes(needle))) : all;
  return (
    <section className="tab home" aria-labelledby="home-title">
      <h1 id="home-title" tabIndex={-1}>Projects, on the record</h1>
      <p className="lead">What a crypto project is, who said each line and how it was checked.</p>
      {bad && <p className="warn" role="status">“{bad}” is not a project id. Ids are a domain, such as imd.fun, or chain and contract, such as 1:0x….</p>}
      <div className="home-grid">
        <div className="home-list">
          <div className="search-row">
            <label htmlFor="search" className="sr-only">Search projects</label>
            <input id="search" type="search" placeholder="Search projects" autoComplete="off" value={q} onChange={(e) => setQ(e.target.value)} />
            <a className="btn btn-primary add-jump" href="#/" onClick={(e) => { e.preventDefault(); const el = document.getElementById("add"); el?.scrollIntoView({ block: "start" }); document.getElementById("add-domain")?.focus({ preventScroll: true }); }}>
              Add a project
            </a>
          </div>
          {error && (
            <p className="error">
              Unable to read the chain: {error}.{" "}
              <button type="button" className="linklike" onClick={() => void reload()} disabled={loading}>{loading ? "Reading chain…" : "Try again"}</button>
            </p>
          )}
          {items === null || (error && !all.length) ? (
            items === null && <p className="small" role="status">Reading the projects from Ethereum…</p>
          ) : shown.length ? (
            <>
              <p className="small" aria-live="polite">{needle ? `${plural(shown.length, "project")} match “${q.trim()}”.` : `${plural(all.length, "project")} on the record, newest change first.`}</p>
              <ul className="subjects">
                {shown.map((s) => (
                  <SubjectItem key={s.id} s={s} />
                ))}
              </ul>
            </>
          ) : (
            <p className="small" aria-live="polite">{needle ? `No project matches “${q.trim()}”. Add it below.` : "No projects yet. Add the first one."}</p>
          )}
        </div>
        <AddProject onAdd={onAdd} price={price} />
      </div>
    </section>
  );
}
