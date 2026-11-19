/** The record: summary, filter, one row per line with details, on-chain facts as a table, and one source list. */
import { Fragment, useEffect, useMemo, useState } from "react";
import { ACTIONS, EXPLORER } from "./config";
import { jobLink, kindName, lineAnchor, payerName, TIE_WORDS, tieWord } from "./format";
import {
  allSources,
  countKinds,
  hostOf,
  mergeRecord,
  safeHref,
  SECTION_TITLES,
  type Kind,
  type ListedSource,
  type Page,
  type RecordRow,
  type SourceJob,
  type SourceLine,
} from "./page";
import { isSourceJob, type Activity } from "./useActivity";

export interface RecordState {
  latest: Activity | undefined;
  page: Page | null;
  via: { jobId: string | null; path: string } | null;
  error: string | null;
  ready: boolean;
  channels: { url: string; tie: "strong" | "weak" | "none" }[];
  main: string;
}

type Filter = Kind | "all";
const FILTERS: Filter[] = ["all", "proof", "statement", "claim"];

export function KindMark({ kind }: { kind: string }) {
  return (
    <span className={`kind kind-${kind}`}>
      <span className="dot" aria-hidden="true" />
      {kindName(kind)}
    </span>
  );
}

export function ExtLink({ url, children, className }: { url: string; children: React.ReactNode; className?: string }) {
  const href = safeHref(url);
  return href ? (
    <a className={className} href={href} target="_blank" rel="noopener noreferrer nofollow">
      {children}
    </a>
  ) : (
    <span className={className}>{children}</span>
  );
}

/** Context every row needs: source numbers, who paid for the research, and how to open another row. */
interface Ctx {
  numbers: Map<string, ListedSource>;
  research: { payer: string; href: string } | null;
}

function SourceNumbers({ keys, numbers }: { keys: string[]; numbers: Map<string, ListedSource> }) {
  if (!keys.length) return null;
  return (
    <span className="nums">
      {keys.map((k) => {
        const s = numbers.get(k);
        return s ? (
          <a key={k} className="chip mono" href={`#source-${s.n}`} aria-label={`Source ${s.n}`}>
            {s.n}
          </a>
        ) : (
          <span key={k} className="chip mono" title="Source not listed">
            ?
          </span>
        );
      })}
    </span>
  );
}

/** The opened part of a row: the quote, re-run steps, how it was checked, who added it, and the links. */
function Details({ row, ctx, id, withText }: { row: RecordRow; ctx: Ctx; id: string; withText?: boolean }) {
  const { line, origin } = row;
  const listed = line.srcKeys.map((k) => ctx.numbers.get(k)).filter((s): s is ListedSource => !!s);
  const checked =
    line.kind === "proof"
      ? "Proof: anyone can follow the re-run steps and get the same answer."
      : line.kind === "statement"
        ? `Statement: published on ${line.channel?.label || line.channel?.url || "a channel of the subject"}, whose tie is “${tieWord(line.channel?.tie ?? "none")}”.`
        : `Claim: said by ${line.by || "someone other than the subject"}, not on a tied channel of the subject. Nobody has confirmed it.`;
  const job = origin ? { what: "A source job", payer: origin.payer, href: origin.jobHref } : ctx.research ? { what: "The research job", payer: ctx.research.payer, href: ctx.research.href } : null;
  return (
    <div className="details" id={id}>
      <dl className="facts">
        {withText && (
          <>
            <dt>Line</dt>
            <dd>{line.text}</dd>
          </>
        )}
        {line.quote && (
          <>
            <dt>Quote</dt>
            <dd>“{line.quote}”</dd>
          </>
        )}
        {line.rerun && (
          <>
            <dt>Re-run</dt>
            <dd>{line.rerun}</dd>
          </>
        )}
        <dt>Checked</dt>
        <dd>
          {checked}
          {line.labelNote && <span className="block small">{line.labelNote}</span>}
        </dd>
        <dt>Added by</dt>
        <dd>
          {job ? (
            <>
              {job.what}, paid by <span className="mono">{job.payer}</span>
            </>
          ) : (
            "Unknown"
          )}
        </dd>
        <dt>Links</dt>
        <dd>
          <ul className="links">
            {listed.map((s) => (
              <li key={s.key}>
                <span className="chip mono">{s.n}</span> <ExtLink url={s.url}>{hostOf(s.url) || s.url || "source"}</ExtLink>
              </li>
            ))}
            {job && (
              <li>
                <a href={job.href} target="_blank" rel="noopener noreferrer">
                  {origin ? "Source job" : "Research job"} on {job.href.startsWith(EXPLORER) ? "explorer.imd.fun" : "Etherscan"}
                </a>
              </li>
            )}
          </ul>
        </dd>
      </dl>
    </div>
  );
}

function DiffersNote({ row }: { row: RecordRow }) {
  if (!row.differsWith) return null;
  const conflict = row.level === "conflict";
  return (
    <p className={`differs ${conflict ? "differs-conflict" : "differs-question"}`}>
      {conflict ? "Conflicts with the line above" : "Compare with the line above"}
      {row.why ? `: ${row.why}` : ""}
    </p>
  );
}

/** Clicking anywhere on a row that is not a link toggles it; the button inside handles Enter and Space. */
const onRowClick = (toggle: () => void) => (e: React.MouseEvent) => {
  const t = e.target as HTMLElement;
  if (t.closest("a, button")) return;
  toggle();
};

function LineRow({ row, ctx, open, toggle }: { row: RecordRow; ctx: Ctx; open: boolean; toggle: () => void }) {
  const { line } = row;
  const anchor = lineAnchor(line.id || line.text.slice(0, 40));
  const showBy = line.kind !== "proof" && line.by;
  return (
    <li className={`row${row.differsWith ? ` row-differs row-${row.level}` : ""}${open ? " is-open" : ""}`} id={anchor}>
      <DiffersNote row={row} />
      <div className="row-main" onClick={onRowClick(toggle)}>
        <button type="button" className="row-toggle" aria-expanded={open} aria-controls={`${anchor}-d`} onClick={toggle}>
          <span className="chev" aria-hidden="true" />
          <span className="row-text">{line.text}</span>
          <span className="row-meta">
            <KindMark kind={line.kind} />
            {showBy && <span className="by">{line.by}</span>}
          </span>
        </button>
        <SourceNumbers keys={line.srcKeys} numbers={ctx.numbers} />
      </div>
      {open && <Details row={row} ctx={ctx} id={`${anchor}-d`} />}
    </li>
  );
}

/** A section's proof lines that carry "fact", as a table: name, value, chain and block. A row opens to the sentence and re-run steps. */
function FactTable({ section, rows, ctx, openSet, toggle }: { section: string; rows: RecordRow[]; ctx: Ctx; openSet: Set<string>; toggle: (id: string) => void }) {
  return (
    <table className="fact-table">
      <caption className="sr-only">On-chain facts in {SECTION_TITLES[section] ?? section}</caption>
      <thead>
        <tr>
          <th scope="col">Name</th>
          <th scope="col">Value</th>
          <th scope="col">Chain and block</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => {
          const f = row.line.fact!;
          const anchor = lineAnchor(row.line.id || f.name);
          const open = openSet.has(row.line.id);
          return (
            <Fragment key={row.line.id || f.name}>
              <tr id={anchor} className={`fact-row${open ? " is-open" : ""}`} onClick={onRowClick(() => toggle(row.line.id))}>
                <th scope="row">
                  <button type="button" className="row-toggle" aria-expanded={open} aria-controls={`${anchor}-d`} onClick={() => toggle(row.line.id)}>
                    <span className="chev" aria-hidden="true" />
                    <span className="row-text">{f.name}</span>
                  </button>
                </th>
                <td data-label="Value" className="num">
                  {f.value}
                  {f.unit ? ` ${f.unit}` : ""}
                </td>
                <td data-label="Chain and block">
                  {f.chain || "Chain not given"}
                  {f.block ? (
                    <>
                      , block <span className="num">{Number(f.block).toLocaleString("en-US")}</span>
                    </>
                  ) : (
                    ", block not given"
                  )}
                </td>
              </tr>
              {open && (
                <tr className="fact-details">
                  <td colSpan={3}>
                    <Details row={row} ctx={ctx} id={`${anchor}-d`} withText />
                  </td>
                </tr>
              )}
            </Fragment>
          );
        })}
      </tbody>
    </table>
  );
}

/** A fact row goes in the table only when it is not one half of a differs pair, so pairs stay together. */
function splitFacts(rows: RecordRow[]) {
  const paired = new Set<string>();
  rows.forEach((r, i) => {
    if (r.differsWith) {
      paired.add(r.line.id);
      paired.add(rows[i - 1]?.line.id ?? "");
    }
  });
  const facts = rows.filter((r) => r.line.kind === "proof" && r.line.fact && !r.origin && !paired.has(r.line.id));
  const rest = rows.filter((r) => !facts.includes(r));
  return { facts, rest };
}

function Summary({ page, onOpen }: { page: Page; onOpen: (id: string) => void }) {
  const ids = new Set(page.lines.map((l) => l.id));
  return (
    <div className="card summary">
      <h2>Summary</h2>
      <p className="small">Written by the research job from the lines below. Not itself a checked line.</p>
      <ul className="plain">
        {page.summary.map((s, i) => (
          <li key={i}>
            {s.text}{" "}
            <span className="nums">
              {s.lines.map((id) =>
                ids.has(id) ? (
                  <a
                    key={id}
                    className="chip mono"
                    href={`#${lineAnchor(id)}`}
                    onClick={(e) => {
                      e.preventDefault();
                      onOpen(id);
                    }}
                  >
                    {id}
                  </a>
                ) : (
                  <span key={id} className="chip mono" title="Not a line of this record">
                    {id}
                  </span>
                ),
              )}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function SourceList({ list, via }: { list: ListedSource[]; via: RecordState["via"] }) {
  return (
    <div className="card">
      <h2>Sources</h2>
      <ol className="sources">
        {list.map((s) => (
          <li key={s.key} id={`source-${s.n}`}>
            <span className="chip mono">{s.n}</span>
            <span className="source-ref">
              <ExtLink url={s.url}>{s.url || "no address given"}</ExtLink>
              {s.readVia && <span className="via"> read via {s.readVia}</span>}
            </span>
            <span className="small">
              {[
                s.type || "source",
                s.publisher ? `published by ${s.publisher}` : "",
                `read ${s.readAt || "at an unknown time"}`,
                s.couldOpen === false ? "could not open" : "",
                s.outcome?.kind === "off" ? "not about this subject" : "",
                s.addedBy ? `added by ${s.addedBy}` : "research",
              ]
                .filter(Boolean)
                .join(" · ")}
            </span>
          </li>
        ))}
      </ol>
      {via && <p className="small">The research page was read through {via.path === "api" ? "api.imd.fun" : "an IPFS gateway"}; its bytes matched the listed SHA-256.</p>}
    </div>
  );
}

function PanelChecks({ items }: { items: Activity[] }) {
  const panel = items.filter((a) => a.req.action === ACTIONS.oracle && a.state === "completed");
  if (!panel.length) return null;
  return (
    <div className="card">
      <h2>Checked by a panel</h2>
      <ul className="lines">
        {panel.map((a) => (
          <li key={a.req.requestId} className="panel-row">
            <p className="row-text">{a.req.title || String(a.req.bodyJson?.question ?? "").slice(0, 120)}</p>
            <div className="row-meta">
              <span className={`answer answer-${a.oracle?.answer ?? "none"}`}>{a.oracle?.answer ?? "no answer"}</span>
              <span className="small">
                panel, {a.oracle?.agreed ?? "?"} of {a.oracle?.panelSize ?? "?"} agreed
              </span>
              <KindMark kind={a.req.kind} />
              <a className="small" href={jobLink(a.jobId, a.req.transactionHash)} target="_blank" rel="noopener noreferrer">
                {a.jobId ? "Open the request" : "Open the transaction"}
              </a>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function Record({ items, rec, onResearch, price }: { items: Activity[] | null; rec: RecordState; onResearch: () => void; price: string }) {
  const { latest, page, via, error } = rec;
  const sourceJobs: SourceJob[] = useMemo(
    () =>
      (items ?? [])
        .filter((a) => isSourceJob(a.req) && a.state === "completed" && a.sources)
        .reverse()
        .map((a) => ({ key: a.req.requestId, data: a.sources!, payer: payerName(a), jobHref: jobLink(a.jobId, a.req.transactionHash) })),
    [items],
  );
  const sections = useMemo(() => mergeRecord(page, sourceJobs), [page, sourceJobs]);
  const list = useMemo(() => allSources(page, sourceJobs), [page, sourceJobs]);
  const counts = useMemo(() => countKinds(sections), [sections]);
  const [filter, setFilter] = useState<Filter>("all");
  const [openSet, setOpenSet] = useState<Set<string>>(() => new Set());
  const [focusId, setFocusId] = useState<string | null>(null);
  const ctx: Ctx = {
    numbers: new Map(list.map((s) => [s.key, s])),
    research: latest ? { payer: payerName(latest), href: jobLink(via?.jobId ?? latest.jobId, latest.req.transactionHash) } : null,
  };
  const toggle = (id: string) =>
    setOpenSet((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  /** Opens a line from a summary link: shows all kinds, opens it, then scrolls to it and focuses its button. */
  const openLine = (id: string) => {
    setFilter("all");
    setOpenSet((s) => new Set(s).add(id));
    setFocusId(id);
  };
  useEffect(() => {
    if (!focusId) return;
    const el = document.getElementById(lineAnchor(focusId));
    el?.scrollIntoView?.({ block: "start" });
    el?.querySelector<HTMLElement>(".row-toggle")?.focus({ preventScroll: true });
    if (el && history.replaceState) history.replaceState(null, "", `#${lineAnchor(focusId)}`);
    setFocusId(null);
  }, [focusId]);
  useEffect(() => {
    const m = /^#line-(.+)$/.exec(location.hash);
    const id = m && page?.lines.find((l) => lineAnchor(l.id) === `line-${m[1]}`)?.id;
    if (id) openLine(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page]);

  const shown = sections
    .map((s) => ({ ...s, rows: filter === "all" ? s.rows : s.rows.filter((r) => r.line.kind === filter) }))
    .filter((s) => s.rows.length > 0);

  return (
    <section id="record" aria-labelledby="record-title">
      <h1 id="record-title">{page?.name || "IMD (imd.fun)"}</h1>
      <p className="lead">{page?.oneLine || "A public record of imd.fun. Every line shows who said it, its source and how it was checked."}</p>

      {!page ? (
        <div className="card empty">
          <h2>{items === null ? "Reading the record…" : latest && !error ? "Downloading the record…" : "No research yet"}</h2>
          <p>
            {latest && !error
              ? "Research finished. Downloading and checking the page…"
              : "The record is written by the IMD swarm. Pay for one research job and its page appears here."}
          </p>
          {error && <p className="error">Unable to read the page: {error}</p>}
          <div className="row-actions">
            <button className="btn btn-primary" onClick={onResearch}>
              Research this page
            </button>
            <span className="price mono">{price}</span>
          </div>
        </div>
      ) : (
        <div className="row-actions">
          <button className="btn btn-primary" onClick={onResearch}>
            Research again
          </button>
          <a className="btn" href="#actions">
            Confirm a fact
          </a>
          <a className="btn" href="#add-sources">
            Add sources
          </a>
        </div>
      )}

      {page && page.summary.length > 0 && <Summary page={page} onOpen={openLine} />}

      {page && page.channels.length > 0 && (
        <div className="channels-block">
          <h2>Channels</h2>
          <ul className="channels">
            {page.channels.map((c, i) => (
              <li key={i}>
                <ExtLink url={c.url}>{c.label || c.url}</ExtLink>
                <span className={`tie tie-${TIE_WORDS[c.tie] ? c.tie : "none"}`}>{tieWord(c.tie)}</span>
              </li>
            ))}
          </ul>
          <p className="small tie-key">
            Confirmed on chain: a contract, ENS record or deployer wallet points to it. Names the contract: it publishes the main contract's address. Not confirmed: neither. Only lines
            published on the first two show as statements.
          </p>
        </div>
      )}

      <PanelChecks items={items ?? []} />

      {counts.all > 0 && (
        <div className="filter" role="group" aria-label="Show lines of kind">
          {FILTERS.map((f) => (
            <button key={f} type="button" className="btn btn-filter" aria-pressed={filter === f} onClick={() => setFilter(f)}>
              {f === "all" ? "All" : <KindMark kind={f} />}
              <span className="count num">{counts[f]}</span>
            </button>
          ))}
        </div>
      )}

      {shown.map(({ section, rows }) => {
        const { facts, rest } = splitFacts(rows);
        return (
          <div key={section} className="card">
            <h2>{SECTION_TITLES[section] ?? section}</h2>
            {facts.length > 0 && <FactTable section={section} rows={facts} ctx={ctx} openSet={openSet} toggle={toggle} />}
            {rest.length > 0 && (
              <ul className="lines">
                {rest.map((row) => (
                  <LineRow key={row.line.id || row.line.text} row={row} ctx={ctx} open={openSet.has(row.line.id)} toggle={() => toggle(row.line.id)} />
                ))}
              </ul>
            )}
          </div>
        );
      })}
      {counts.all > 0 && shown.length === 0 && <p className="small">No lines of this kind.</p>}

      {page && page.openQuestions.length > 0 && (
        <div className="card">
          <h2>Not known yet</h2>
          <ul className="plain">
            {page.openQuestions.map((q, i) => (
              <li key={i}>{q}</li>
            ))}
          </ul>
        </div>
      )}

      {list.length > 0 && <SourceList list={list} via={via} />}
    </section>
  );
}

export type { SourceLine };
