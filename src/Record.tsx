/** The record's tabs: Overview (key facts, summary), Record (filter, sections, one facts table) and Sources. */
import { Fragment, useEffect, useState } from "react";
import { EXPLORER } from "./config";
import { jobLink, kindName, lineAnchor, payerName, shortHex } from "./format";
import { keyFacts, splitAddresses, type KeyRow } from "./keyfacts";
import { addHref, subjectHref, to } from "./route";
import { SubjectLogo } from "./Logo";
import { findSubject, lineMatches, parseLookup, repeatCount, repeatsOf, type Findable } from "./lookup";
import { countLines, countsWords, FILTER_WORDS, FILTERS, passes, rowClass, settleAll, speakerText, type Filter, type Settle } from "./settle";
import {
  blockNumber,
  channelStatus,
  hostOf,
  paragraphsOf,
  safeHref,
  SECTION_TITLES,
  SECTIONS,
  STATUS_HELP,
  STATUS_LEGEND,
  STATUS_WORDS,
  statusWord,
  type Channel,
  type ChannelStatus,
  isFactRow, type Kind, type Line, type ListedSource, type RecordRow, type SourceLine } from "./page";
import { firstPageStatus, statusText, type FirstPageStatus, type RecordModel } from "./model";
import type { Activity } from "./useActivity";
import { StillReading } from "./Home";
import { AddButtons, ChangePanel, evidenceOf, Pencil, PendingTag, useSuggest } from "./Suggest";
import { formatNumbers } from "./numbers";
import { keyFactTarget, lineTarget, sentenceTarget } from "./changes";
import { originOfLine } from "./changeResult";

export type { Filter };
const KINDS: Kind[] = ["proof", "statement", "claim"];

/** Shared view state: the filter and which rows are open live in App, so they survive tab changes. */
export interface Ui {
  filter: Filter;
  setFilter: (f: Filter) => void;
  openSet: Set<string>;
  toggle: (id: string) => void;
  /** Opens these lines in the Record tab and moves to the first. */
  openLines: (ids: string[]) => void;
  /** The element the current link points at, inside the current tab. */
  target: string | null;
  /** Counts link changes, so following the same link again acts again. */
  routeN?: number;
}

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

const panelAnchor = (a: Activity) => `panel-${a.req.requestId.slice(2, 14)}`;

/* ---------- Overview ---------- */

function Copy({ value }: { value: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      className="copy"
      aria-label={done ? "Copied" : `Copy address ${value}`}
      onClick={() => {
        void navigator.clipboard?.writeText(value).then(() => {
          setDone(true);
          window.setTimeout(() => setDone(false), 1500);
        });
      }}
    >
      {done ? "Copied" : "Copy"}
    </button>
  );
}

/** A value with every 0x address shortened in monospace, each with a copy button; linked when it has a url. */
function KeyValue({ row }: { row: KeyRow }) {
  if (row.accounts.length)
    return (
      <ul className="kf-accounts">
        {row.accounts.map((a, i) => (
          <li key={i}>
            {a.channel && safeHref(a.channel.url) ? <ExtLink url={a.channel.url} className="break">{a.name}</ExtLink> : <span className="break">{a.name}</span>}
          </li>
        ))}
      </ul>
    );
  const parts = splitAddresses(row.value);
  const body = parts.map((p, i) =>
    p.address ? (
      <span key={i} className="mono" title={p.text}>
        {shortHex(p.text)}
      </span>
    ) : (
      <Fragment key={i}>{formatNumbers(p.text)}</Fragment>
    ),
  );
  return (
    <>
      {safeHref(row.url) ? <ExtLink url={row.url} className="break">{body}</ExtLink> : <span className="break">{body}</span>}
      {parts.filter((p) => p.address).map((p, i) => (
        <Copy key={i} value={p.text} />
      ))}
      {row.note && <span className="small"> {row.note}</span>}
    </>
  );
}

function KeyFacts({ m, ui }: { m: RecordModel; ui: Ui }) {
  const { rows } = useKeyFacts(m);
  const s = useSuggest();
  if (!rows.length) return null;
  return (
    <section className="keyfacts" aria-labelledby="keyfacts-title">
      <h2 id="keyfacts-title">Key facts</h2>
      <table>
        <tbody>
          {rows.map((r, i) => {
            const target = keyFactTarget(r.label, r.value || r.accounts.map((a) => a.name).join(", "), r.lines.map((l) => l.id), r.lines[0]?.id ? originOfLine(r.lines[0].id, m.scope) : null);
            const src = r.lines[0]?.srcKeys[0];
            const url = src ? m.sourceList.find((x) => x.key === src)?.url ?? "" : r.url;
            return (
              <Fragment key={i}>
                <tr className="has-pencil">
                  <th scope="row">{r.label}</th>
                  <td className="kf-value">
                    <KeyValue row={r} />
                    <PendingTag targetKey={target.key} />
                  </td>
                  <td className="kf-badge">
                    <RowBadge r={r} ui={ui} />
                  </td>
                  <td className="kf-edit">
                    <Pencil target={target} label={`Suggest a change`} />
                  </td>
                </tr>
                {s.open === target.key && (
                  <tr className="kf-panel">
                    <td colSpan={4}>
                      <ChangePanel target={target} mode="line" sourceUrl={url} evidence={evidenceOf(r.lines, allLines(m))} onOpenLines={ui.openLines} />
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </section>
  );
}

/** The row's one badge: its channel's label on Website and Official accounts, else the kind of its lines. Opens them. */
function RowBadge({ r, ui }: { r: KeyRow; ui: Ui }) {
  const b = r.status ?? r.badge;
  if (!b) return null;
  const title = r.status ? STATUS_HELP[r.status.tone as ChannelStatus] : undefined;
  if (!r.lines.length)
    return (
      <span className={`badge badge-${b.tone}`} title={title}>
        {b.text}
      </span>
    );
  return (
    <a
      className={`badge badge-${b.tone}`}
      title={title}
      href={to(lineAnchor(r.lines[0]!.id))}
      onClick={(e) => {
        e.preventDefault();
        ui.openLines(r.lines.map((l) => l.id));
      }}
      aria-label={`${r.label}: ${b.text}. Open the ${r.lines.length === 1 ? "line" : `${r.lines.length} lines`} it rests on`}
    >
      {b.text}
    </a>
  );
}

/** Every line the record shows, for the settle rule (a proof elsewhere can settle a line). */
const allLines = (m: Pick<RecordModel, "sections">) => m.sections.flatMap((s) => s.rows.map((r) => r.line));

export function useKeyFacts(m: RecordModel) {
  const all = m.sections.flatMap((s) => s.rows.map((r) => r.line));
  return keyFacts(m.page, m.resolve, all);
}

/** After each sentence, one small coloured dot per kind among its lines; a dot opens those lines in Record. */
export function SentenceDots({ lines, ui }: { lines: Line[]; ui: Ui }) {
  const kinds = KINDS.filter((k) => lines.some((l) => l.kind === k));
  if (!kinds.length) return null;
  return (
    <span className="sdots">
      {kinds.map((k) => {
        const of = lines.filter((l) => l.kind === k);
        const label = `${of.length} ${kindName(k).toLowerCase()} line${of.length === 1 ? "" : "s"}`;
        return (
          <a
            key={k}
            className={`sdot kind-${k}`}
            href={to(lineAnchor(of[0]!.id))}
            title={label}
            aria-label={`Open ${label} in Record`}
            onClick={(e) => {
              e.preventDefault();
              ui.openLines(of.map((l) => l.id));
            }}
          >
            <span className="dot" aria-hidden="true" />
          </a>
        );
      })}
    </span>
  );
}

/** One summary sentence: hover highlights it; a click or Enter opens the change panel under its paragraph. */
function Sentence({ text, active, onOpen }: { text: string; active: boolean; onOpen: () => void }) {
  return (
    <span
      className={`sent${active ? " is-on" : ""}`}
      role="button"
      tabIndex={0}
      aria-expanded={active}
      aria-description="Suggest a change"
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen();
        }
      }}
    >
      {formatNumbers(text)}
    </span>
  );
}

function Summary({ m, ui }: { m: RecordModel; ui: Ui }) {
  const sg = useSuggest();
  if (!m.summary.length) return null;
  return (
    <div className="summary">
      <h2>Summary</h2>
      {paragraphsOf(m.summary).map((p, i) => {
        const openHere = p.find((s) => sg.open === sentenceTarget(s.text).key);
        return (
          <Fragment key={i}>
            <p className="prose">
              {p.map((s, j) => {
                const target = sentenceTarget(s.text);
                return (
                  <Fragment key={j}>
                    <Sentence text={s.text} active={sg.open === target.key} onOpen={() => sg.setOpen(sg.open === target.key ? null : target.key)} />
                    <SentenceDots lines={s.refs} ui={ui} />
                    {s.rewordedBy && <span className="reworded small"> reworded by <span className="mono">{s.rewordedBy}</span></span>}
                    <PendingTag targetKey={target.key} />{" "}
                  </Fragment>
                );
              })}
            </p>
            {openHere && <ChangePanel key={openHere.text} target={sentenceTarget(openHere.text)} mode="sentence" evidence={evidenceOf(openHere.refs, allLines(m))} onOpenLines={ui.openLines} />}
          </Fragment>
        );
      })}
      <p className="small">
        {m.edit ? (
          <>
            Edited by <span className="mono">{payerName(m.edit.activity)}</span>, checked by a research job. Not itself a checked line.
          </>
        ) : (
          "Written from Record by a research job. Not itself a checked line."
        )}{" "}
        Dots open supporting lines.
      </p>
    </div>
  );
}

function PanelAnswers({ m }: { m: RecordModel }) {
  if (!m.panel.length) return null;
  return (
    <div className="card" id="panel-answers">
      <h2>Panel answers</h2>
      <ul className="lines">
        {[...m.panel].reverse().map((a) => (
          <li key={a.req.requestId} className="panel-row" id={panelAnchor(a)} tabIndex={-1}>
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

/**
 * Related projects under Key facts: each with its relation. A link to its page here when a subject with that
 * domain or contract exists on the site; otherwise "Add this project", which opens the home bar filled in.
 */
function Related({ m, ui, subjects }: { m: RecordModel; ui: Ui; subjects: Findable[] }) {
  const related = m.page?.related ?? [];
  if (!related.length) return null;
  return (
    <section className="related" aria-labelledby="related-title">
      <h2 id="related-title">Related</h2>
      <ul className="plain related-list">
        {related.map((r, i) => {
          const q = parseLookup(r.id);
          const found = q.kind === "domain" || q.kind === "address" ? findSubject(q, subjects.filter((s) => s.id !== m.subject.id)) : null;
          const lines = r.lines.map(m.resolve).filter((l): l is Line => !!l);
          const addable = q.kind === "domain" || (q.kind === "address" && q.chainId !== null) ? r.id : q.kind === "address" ? q.address : "";
          return (
            <li key={i} className="related-item">
              <span className="related-name">
                {found ? <a href={subjectHref(found)}>{r.name}</a> : <strong>{r.name}</strong>}
                {r.id && <span className="small mono"> {r.id}</span>}
              </span>
              <span className="related-rel">
                {r.relation || "related"}
                <SentenceDots lines={lines} ui={ui} />
              </span>
              {!found && addable && (
                <a className="btn btn-small" href={addHref(addable)}>
                  Add this project
                </a>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

export function OverviewTab({ m, ui, items, subjects, chainError = null, retrying = false, readingFiles = false }: { m: RecordModel; ui: Ui; items: Activity[] | null; price: string; subjects: Findable[]; chainError?: string | null; retrying?: boolean; readingFiles?: boolean }) {
  const { page, latest, error } = m;
  const name = page?.name || m.subject.id;
  // The same first-page status Home shows for this subject: in progress, refused, failed or no project found.
  const first: FirstPageStatus | null = !page && items !== null ? firstPageStatus(items) : null;
  const rejectedCard = !page && !!m.rejected && items !== null && !(latest && !error) && first?.kind !== "pending";
  return (
    <section className="tab" aria-labelledby="record-title">
      <div className="title-row">
        <SubjectLogo name={name} logo={latest?.logo} size={40} />
        <h1 id="record-title" tabIndex={-1}>{name}</h1>
      </div>
      <p className="lead">{page?.oneLine || `Public sources and checks for ${m.subject.id}.`}</p>
      {rejectedCard && (
        <div className="card empty" id="rejected">
          <h2>No project found</h2>
          <p className="why">{first?.kind === "not-found" ? statusText(first) : `No project found: ${m.rejected!.rejected}`}</p>
          <p>The research job for {m.subject.id} found no single real project, so this site shows no page for it.</p>
          <p className="small">
            See <a href={to("activity")}>Activity</a> for the job. A rebuild with a clearer description can still create the page.
          </p>
        </div>
      )}
      {!page && !rejectedCard && (
        <div className="card empty" id="first-page">
          {items === null ? (
            readingFiles ? <h2>Reading the page…</h2> : <StillReading error={chainError} retrying={retrying} />
          ) : latest && !error ? (
            <>
              <h2>Downloading the record…</h2>
              <p>The page job finished. Downloading and checking its file…</p>
            </>
          ) : first?.kind === "pending" ? (
            <>
              <h2>First page in progress</h2>
              <p>A research job is writing the first page of {m.subject.id}. It appears here when the job completes; there is no need to pay for another. Follow it in <a href={to("activity")}>Activity</a>.</p>
            </>
          ) : first && first.kind !== "none" ? (
            <>
              <h2>{first.kind === "not-found" ? "No project found" : first.kind === "refused" ? "First page refused" : "First page failed"}</h2>
              <p className="why">{statusText(first)}</p>
              <p>
                See <a href={to("activity")}>Activity</a> for the request. You can try again with <a href={to("rebuild")}>a rebuild</a>.
              </p>
            </>
          ) : (
            <>
              <h2>No page yet</h2>
              <p>Run a rebuild to publish the first record of {m.subject.id}.</p>
            </>
          )}
          {error && <p className="error">Unable to read the page: {error}</p>}
        </div>
      )}
      {(page || m.summary.length > 0) && (
        <div className="overview">
          <div className="facts-col">
            <KeyFacts m={m} ui={ui} />
            <Related m={m} ui={ui} subjects={subjects} />
          </div>
          <Summary m={m} ui={ui} />
          {page && !m.summary.length && (
            <p className="small">
              This page has no summary yet. Read the lines in <a href={to("record")}>Record</a>; the next rebuild writes one.
            </p>
          )}
        </div>
      )}

      {page ? (
        <div className="ov-foot" id="suggest">
          <p>Something wrong or missing? Hover any row or click a sentence to suggest a change.</p>
          <AddButtons where="overview" variant="links" routeTarget={ui.target} routeN={ui.routeN}>
            <a href={to("confirm")}>Ask a panel to check a fact</a>
            <a href={to("rebuild")}>Rebuild the page</a>
          </AddButtons>
        </div>
      ) : (
        <div className="ov-foot">
          <p className="foot-links">
            <a href={to("confirm")}>Ask a panel to check a fact</a>
            <a href={to("rebuild")}>Create the page</a>
          </p>
        </div>
      )}
    </section>
  );
}

/* ---------- Record ---------- */

interface Ctx {
  numbers: Map<string, ListedSource>;
  /** Every line's settle state and the proofs a settled row already shows. */
  settled: { by: Map<string, Settle>; absorbed: Set<string> };
  research: { payer: string; href: string } | null;
  m: RecordModel;
  ui: Ui;
}

function SourceNumbers({ keys, numbers }: { keys: string[]; numbers: Map<string, ListedSource> }) {
  if (!keys.length) return null;
  return (
    <span className="nums">
      {keys.map((k) => {
        const s = numbers.get(k);
        return s ? (
          <a key={k} className="chip mono" href={to(`source-${s.n}`)} aria-label={`Source ${s.n}`}>
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
  const st = ctx.settled.by.get(line.id);
  const settledBy = st && (st.state === "proven" || st.state === "contradicted") ? (st.state === "proven" ? st.confirms : st.contradicts) : [];
  const listed = line.srcKeys.map((k) => ctx.numbers.get(k)).filter((s): s is ListedSource => !!s);
  const checked =
    line.kind === "proof"
      ? "Proof: anyone can follow the re-run steps and get the same answer."
      : line.kind === "statement"
        ? `Statement: published on ${line.channel?.label || line.channel?.url || "a channel of the subject"}, labelled “${line.channel ? statusWord(line.channel, ctx.m.page?.domain ?? ctx.m.subject.domain) : STATUS_WORDS.unverified}”.`
        : `Claim: said by ${line.by || "someone other than the subject"}, not on an Own domain or Verified on chain channel of the subject.`;
  const job = origin ? { what: origin.raised ? "A changes job a visitor raised" : "A sources or edit job", payer: origin.payer, href: origin.jobHref } : ctx.research ? { what: "The page job", payer: ctx.research.payer, href: ctx.research.href } : null;
  return (
    <div className="details" id={id}>
      <dl className="facts">
        {withText && (
          <>
            <dt>Line</dt>
            <dd>{line.text}</dd>
          </>
        )}
        {!withText && formatNumbers(line.text) !== line.text && (
          <>
            <dt>Exact text</dt>
            <dd>{line.text}</dd>
          </>
        )}
        {line.fact && formatNumbers(line.fact.value) !== line.fact.value && (
          <>
            <dt>Exact value</dt>
            <dd className="mono">
              {line.fact.value}
              {line.fact.unit ? ` ${line.fact.unit}` : ""}
            </dd>
          </>
        )}
        {line.quote && (
          <>
            <dt>{settledBy.length ? "Original quote" : "Quote"}</dt>
            <dd>“{line.quote}”</dd>
          </>
        )}
        {settledBy.map((t) => {
          const proof = ctx.m.resolve(t);
          if (proof)
            return (
              <Fragment key={t}>
                <dt>{st!.state === "proven" ? "Proof" : "The proof shows"}</dt>
                <dd>
                  {proof.text}
                  {proof.rerun ? <span className="block">Re-run: {proof.rerun}</span> : <span className="block small">The proof gives no re-run steps.</span>}
                </dd>
              </Fragment>
            );
          const a = ctx.m.answerRef(t);
          return (
            <Fragment key={t}>
              <dt>Panel answer</dt>
              <dd>
                {a ? a.text : <span className="mono">{t}</span>}
                {a?.activity && (
                  <span className="block small">
                    {a.activity.oracle?.agreed ?? "?"} of {a.activity.oracle?.panelSize ?? "?"} agreed.{" "}
                    <a href={to(panelAnchor(a.activity))}>See it under Panel answers</a>
                  </span>
                )}
              </dd>
            </Fragment>
          );
        })}
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
        {!!line.history?.length && (
          <>
            <dt>Earlier readings</dt>
            <dd>
              <ul className="plain history">
                {line.history.map((h, i) => (
                  <li key={i}>
                    {h.block ? (
                      <>
                        Block <span className="num">{/^\d+$/.test(h.block) ? BigInt(h.block).toLocaleString("en-US") : h.block}</span>:{" "}
                      </>
                    ) : (
                      "Block not given: "
                    )}
                    <span className="num">{h.value}</span>
                  </li>
                ))}
              </ul>
            </dd>
          </>
        )}
        {line.from.length > 0 && (
          <>
            <dt>Carried from</dt>
            <dd className="mono">{line.from.join(", ")}</dd>
          </>
        )}
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
                  {origin ? "Its job" : "Page job"} on {job.href.startsWith(EXPLORER) ? "explorer.imd.fun" : "Etherscan"}
                </a>
              </li>
            )}
          </ul>
        </dd>
      </dl>
    </div>
  );
}

/** "Confirmed by" in green or "Contradicted by" in red, each opening the linked proof line or panel answer. */
function LinkNotes({ line, ctx }: { line: Line; ctx: Ctx }) {
  // What a settled row already leads with is not repeated under it.
  const st = ctx.settled.by.get(line.id);
  const lead = new Set(st?.state === "proven" ? st.confirms.map((t) => `confirms:${t}`) : st?.state === "contradicted" ? st.contradicts.map((t) => `contradicts:${t}`) : []);
  const links = line.links.filter((k) => !lead.has(`${k.type}:${k.target.trim()}`));
  if (!links.length) return null;
  return (
    <ul className="settled">
      {links.map((k, i) => {
        const word = k.type === "confirms" ? "Confirmed by" : k.type === "partly" ? "Partly confirmed by" : k.type === "context" ? "Context" : "Contradicted by";
        const target = ctx.m.resolve(k.target);
        const answer = target ? null : ctx.m.answerRef(k.target);
        let body: React.ReactNode = <span className="mono">{k.target}</span>;
        if (target)
          body = (
            <a
              href={to(lineAnchor(target.id))}
              onClick={(e) => {
                e.preventDefault();
                ctx.ui.openLines([target.id]);
              }}
            >
              {formatNumbers(target.text)}
            </a>
          );
        else if (answer) body = answer.activity ? <a href={to(panelAnchor(answer.activity))}>{answer.text}</a> : <span>{answer.text}</span>;
        return (
          <li key={i} className={`settled-${k.type}`}>
            <span className="settled-word">{word}:</span> {k.type === "context" ? <span className="block">{body}</span> : body}
          </li>
        );
      })}
    </ul>
  );
}

function DiffersNote({ row, facts }: { row: RecordRow; facts: Set<string> }) {
  if (!row.differsWith) return null;
  const conflict = row.level === "conflict";
  const where = facts.has(row.differsWith) ? "the fact in the table above" : "the line above";
  return (
    <p className={`differs ${conflict ? "differs-conflict" : "differs-question"}`}>
      {conflict ? `Conflicts with ${where}` : `Compare with ${where}`}
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

/** The green "Proven" (or "Confirmed by a panel, N of M") or red "Contradicted" marker a settled row leads with. */
export function SettleMark({ s, ctx }: { s: Settle; ctx: Ctx }) {
  if (s.state === "contradicted")
    return (
      <span className="kind kind-contradicted">
        <span className="dot" aria-hidden="true" />
        Contradicted
      </span>
    );
  const panelOnly = s.confirms.every((t) => !ctx.m.resolve(t));
  const a = panelOnly ? ctx.m.answerRef(s.confirms[0]!)?.activity?.oracle : null;
  const word = !panelOnly ? "Proven" : a ? `Confirmed by a panel, ${a.agreed ?? "?"} of ${a.panelSize ?? "?"}` : "Confirmed by a panel";
  return (
    <span className="kind kind-proven">
      <span className="dot" aria-hidden="true" />
      {word}
    </span>
  );
}

/** What the proof or panel answer shows, for a contradicted row: the proof line's text, else the answer's. */
function shownBy(t: string, ctx: Ctx): { who: string; text: string } {
  const proof = ctx.m.resolve(t);
  if (proof) return { who: "The proof shows", text: proof.text };
  const a = ctx.m.answerRef(t);
  return { who: "The panel answered", text: a?.text || `answer ${t}` };
}

function LineRow({ row, ctx, facts }: { row: RecordRow; ctx: Ctx; facts: Set<string> }) {
  const { line } = row;
  const anchor = lineAnchor(line.id || line.text.slice(0, 40));
  const showBy = line.kind !== "proof" && line.by;
  const open = ctx.ui.openSet.has(line.id);
  const toggle = () => ctx.ui.toggle(line.id);
  const s = ctx.settled.by.get(line.id);
  const settled = s && (s.state === "proven" || s.state === "contradicted") ? s : null;
  const sg = useSuggest();
  const target = lineTarget(line.id || line.text.slice(0, 40), line.text, line.id ? originOfLine(line.id, ctx.m.scope) : null);
  const srcUrl = line.srcKeys.map((k) => ctx.numbers.get(k)?.url).find(Boolean) ?? "";
  return (
    <li className={`row has-pencil${row.differsWith ? ` row-differs row-${row.level}` : ""}${settled ? ` row-${settled.state}` : ""}${open ? " is-open" : ""}`} id={anchor}>
      <DiffersNote row={row} facts={facts} />
      <div className="row-main" onClick={onRowClick(toggle)}>
        <button type="button" className="row-toggle" aria-expanded={open} aria-controls={`${anchor}-d`} onClick={toggle}>
          <span className="chev" aria-hidden="true" />
          {settled?.state === "contradicted" ? (
            <span className="row-text">
              <SettleMark s={settled} ctx={ctx} />
              <span className="block">
                <span className="said-word">Said:</span> {formatNumbers(line.text)}
              </span>
              {settled.contradicts.map((t) => {
                const b = shownBy(t, ctx);
                return (
                  <span key={t} className="block shows">
                    <span className="said-word">{b.who}:</span> {formatNumbers(b.text)}
                  </span>
                );
              })}
            </span>
          ) : (
            <span className="row-text">{formatNumbers(line.text)}</span>
          )}
          <span className="row-meta">
            {settled ? (
              <>
                {settled.state === "proven" && <SettleMark s={settled} ctx={ctx} />}
                <span className="by small">{speakerText(line)}</span>
              </>
            ) : (
              <>
                <KindMark kind={line.kind} />
                {showBy && <span className="by">{line.by}</span>}
              </>
            )}
            {row.origin?.raised && <span className="by small">raised by {row.origin.payer}</span>}
          </span>
        </button>
        <SourceNumbers keys={line.srcKeys} numbers={ctx.numbers} />
        <Pencil target={target} />
      </div>
      <PendingTag targetKey={target.key} />
      <LinkNotes line={line} ctx={ctx} />
      {open && <Details row={row} ctx={ctx} id={`${anchor}-d`} />}
      {sg.open === target.key && <ChangePanel target={target} mode="line" sourceUrl={srcUrl} evidence={evidenceOf([line], allLines(ctx.m))} onOpenLines={ctx.ui.openLines} />}
    </li>
  );
}

/** Every proof line that carries "fact", in one table under On chain: name, value with unit, chain and block. */
function FactTable({ rows, ctx }: { rows: RecordRow[]; ctx: Ctx }) {
  const sg = useSuggest();
  return (
    <table className="fact-table">
      <caption className="sr-only">On-chain facts</caption>
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
          const open = ctx.ui.openSet.has(row.line.id);
          const toggle = () => ctx.ui.toggle(row.line.id);
          const target = lineTarget(row.line.id || f.name, `${f.name}: ${f.value}${f.unit ? ` ${f.unit}` : ""}`, row.line.id ? originOfLine(row.line.id, ctx.m.scope) : null);
          return (
            <Fragment key={row.line.id || f.name}>
              <tr id={anchor} className={`fact-row has-pencil${open ? " is-open" : ""}`} onClick={onRowClick(toggle)}>
                <th scope="row">
                  <button type="button" className="row-toggle" aria-expanded={open} aria-controls={`${anchor}-d`} onClick={toggle}>
                    <span className="chev" aria-hidden="true" />
                    <span className="row-text">{f.name}</span>
                  </button>
                  {row.origin?.raised && <span className="by small block">raised by {row.origin.payer}</span>}
                  <PendingTag targetKey={target.key} />
                </th>
                <td data-label="Value" className="num" title={formatNumbers(f.value) !== f.value ? `Exact: ${f.value}` : undefined}>
                  {formatNumbers(f.value)}
                  {f.unit ? ` ${f.unit}` : ""}
                </td>
                <td data-label="Chain and block">
                  {f.chain || "Chain not given"}
                  {f.block ? (
                    <>
                      , block <span className="num">{f.block}</span>
                    </>
                  ) : (
                    ", block not given"
                  )}
                  <Pencil target={target} />
                </td>
              </tr>
              {sg.open === target.key && (
                <tr className="fact-details">
                  <td colSpan={3}>
                    <ChangePanel target={target} mode="line" sourceUrl={ctx.numbers.get(row.line.srcKeys[0] ?? "")?.url ?? ""} evidence={evidenceOf([row.line], allLines(ctx.m))} onOpenLines={ctx.ui.openLines} />
                  </td>
                </tr>
              )}
              {row.line.links.length > 0 && (
                <tr className="fact-links">
                  <td colSpan={3}>
                    <LinkNotes line={row.line} ctx={ctx} />
                  </td>
                </tr>
              )}
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

function Accounting({ m }: { m: RecordModel }) {
  const a = m.accounting;
  const dropped = a.dropped;
  return (
    <>
      {a.state === "loading" && <p className="small">Checking the last rebuild against the {a.files} earlier files it was given…</p>}
      {a.state === "error" && <p className="small">Unable to check the last rebuild against its earlier files: {a.error}</p>}
      {a.state === "done" && a.missing.length > 0 && (
        <div className="warn-box" id="unaccounted" role="note">
          <h2>
            {a.missing.length} earlier line{a.missing.length === 1 ? " is" : "s are"} unaccounted for
          </h2>
          <p className="small">The last rebuild neither carried these lines forward nor listed them as dropped.</p>
          <ul className="plain small">
            {a.missing.map((x) => (
              <li key={x.ref}>
                <span className="mono">{x.ref}</span> {x.text}
              </li>
            ))}
          </ul>
        </div>
      )}
      {dropped.length > 0 && (
        <details className="dropped" id="dropped">
          <summary>
            Dropped in the last rebuild <span className="count num">{dropped.length}</span>
          </summary>
          <ul className="plain small">
            {dropped.map((d, i) => (
              <li key={i}>
                <span className="mono">{d.ref}</span>
                {d.text && <> “{d.text}”</>}
                {": "}
                <span className="why-dropped">{d.why || "no reason given"}</span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </>
  );
}

export function RecordTab({ m, ui }: { m: RecordModel; ui: Ui }) {
  const { latest, via, sections, counts, page } = m;
  const all = sections.flatMap((s) => s.rows);
  const settled = settleAll(all.map((r) => r.line));
  const ctx: Ctx = {
    settled,
    numbers: new Map(m.sourceList.map((s) => [s.key, s])),
    research: latest ? { payer: payerName(latest), href: jobLink(via?.jobId ?? latest.jobId, latest.req.transactionHash) } : null,
    m,
    ui,
  };
  const { filter } = ui;

  const [query, setQuery] = useState("");
  // Sections start closed. A section the visitor opened or closed keeps that; one holding an opened line, or
  // any section while a search or the settled filter is on, shows open so its matches are visible.
  const [sectionOpen, setSectionOpen] = useState<Record<string, boolean>>({});
  // While a search or the settled filter is on, every section with matches opens; what the visitor toggles then
  // is kept apart and forgotten when the controls change, so clearing them restores the manual state above.
  const [narrowOpen, setNarrowOpen] = useState<{ key: string; open: Record<string, boolean> }>({ key: "", open: {} });
  // A proof a visitor's changes job raised joins the table too, with "raised by <payer>" on its row.
  const factRows = all.filter(isFactRow);
  const facts = new Set(factRows.map((r) => r.line.id));
  // A search or any filter but All opens every section with matches, as the settled checkbox did before.
  const narrowing = query.trim() !== "" || filter !== "all";
  const narrowKey = narrowing ? `${query.trim().toLowerCase()}|${filter}` : "";
  const narrowState = narrowOpen.key === narrowKey ? narrowOpen.open : {};
  // A filter is a settled class as well as a kind: a settled row passes Proven or Contradicted, never Statement or Claim.
  const keep = (r: RecordRow) => passes(filter, rowClass(r.line, settled.by.get(r.line.id))) && lineMatches(r.line, query);
  const shownFacts = factRows.filter(keep);
  const named = new Set(sections.map((s) => s.section));
  if (factRows.length) named.add("on_chain");
  const order = [...SECTIONS.filter((s) => named.has(s)), ...[...named].filter((s) => !(SECTIONS as readonly string[]).includes(s))];
  const shown = order
    .map((section) => {
      const every = sections.find((s) => s.section === section)?.rows ?? [];
      // A proof a settled row already shows is not shown again as its own row; the facts table still lists it.
      const rows = every.filter((r) => !facts.has(r.line.id) && !settled.absorbed.has(r.line.id) && keep(r));
      const table = section === "on_chain" ? shownFacts : [];
      const inSection = [...rows, ...table].map((r) => r.line);
      const hasOpen = inSection.some((l) => ui.openSet.has(l.id));
      const open = narrowing ? narrowState[section] ?? true : sectionOpen[section] ?? hasOpen;
      // The rows shown, counted by the shared rule: a settled row once, a proof it already shows not again.
      return { section, rows, table, counts: countLines(inSection, settled), open };
    })
    .filter((s) => s.rows.length > 0 || s.table.length > 0);
  // A link to one line opens it, and its section, when the tab is reached by that link; a search or the
  // settled filter that would hide it is cleared.
  useEffect(() => {
    if (!ui.target?.startsWith("line-")) return;
    const row = sections.flatMap((s) => s.rows).find((r) => lineAnchor(r.line.id) === ui.target);
    if (!row) return;
    // A proof that a settled row shows (and that is not in the facts table) has no row of its own: open that row.
    if (settled.absorbed.has(row.line.id) && !facts.has(row.line.id)) {
      const host = all.find((r) => {
        const st = settled.by.get(r.line.id);
        return !!st && (st.state === "proven" ? st.confirms : st.state === "contradicted" ? st.contradicts : []).includes(row.line.id);
      });
      if (host) ui.openLines([host.line.id]);
      return;
    }
    if (!ui.openSet.has(row.line.id)) ui.toggle(row.line.id);
    setQuery("");
    setSectionOpen((s) => Object.fromEntries(Object.entries(s).filter(([, v]) => v)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ui.target, sections]);
  const matched = shown.reduce((n, s) => n + s.rows.length + s.table.length, 0);
  const repeats = repeatsOf(all.map((r) => r.line));
  const repeated = repeatCount(repeats);

  return (
    <section className="tab" aria-labelledby="record-tab-title">
      <h1 id="record-tab-title" tabIndex={-1} className="tab-title">Record</h1>
      {!page && !m.jobs.length ? (
        <div className="card empty">
          <p>No lines yet. Lines appear here once a page job, a sources job or an edit has completed.</p>
          <a className="btn" href={to("contribute")}>Contribute</a>
        </div>
      ) : (
        <>
          <Accounting m={m} />
          {counts.all > 0 && (
            <div className="filter" role="group" aria-label="Show lines">
              {FILTERS.map((f) => (
                <button key={f} type="button" className="btn btn-filter" aria-pressed={filter === f} onClick={() => ui.setFilter(f)}>
                  {f === "all" || f === "said" ? FILTER_WORDS[f] : (
                    <span className={`kind kind-${f}`}>
                      <span className="dot" aria-hidden="true" />
                      {FILTER_WORDS[f]}
                    </span>
                  )}
                  <span className="count num">{counts[f]}</span>
                </button>
              ))}
            </div>
          )}
          {repeated > 0 && (
            <div className="warn-box" id="repeats" role="note">
              <h2>
                {repeated} line{repeated === 1 ? " repeats" : "s repeat"} another line
              </h2>
              <p className="small">These lines have the same text, ignoring case and punctuation. The next rebuild merges them into one.</p>
              <ul className="plain small repeat-list">
                {repeats.map((g, i) => (
                  <li key={i}>
                    “{g[0]!.text}”:{" "}
                    {g.map((l, j) => (
                      <Fragment key={j}>
                        {j > 0 && ", "}
                        <a
                          href={to(lineAnchor(l.id))}
                          onClick={(e) => {
                            e.preventDefault();
                            ui.openLines([l.id]);
                          }}
                        >
                          <span className="mono">{l.id || "no id"}</span>
                        </a>
                        {l.by && l.kind !== "proof" ? ` (${l.by})` : ""}
                      </Fragment>
                    ))}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {counts.all > 0 && (
            <div className="record-tools">
              <label htmlFor="record-search" className="sr-only">Search lines by text or speaker</label>
              <input id="record-search" type="search" placeholder="Search lines by text or speaker" autoComplete="off" value={query} onChange={(e) => setQuery(e.target.value)} />
              {narrowing && <p className="small" aria-live="polite">{matched.toLocaleString("en-US")} line{matched === 1 ? "" : "s"} match.</p>}
            </div>
          )}
          {shown.map(({ section, rows, table, counts: c, open }) => (
            <div key={section} className={`card section${open ? " is-open" : ""}`}>
              <h2 className="section-toggle-h">
                <button
                  type="button"
                  className="section-toggle"
                  aria-expanded={open}
                  aria-controls={`sec-${section}`}
                  onClick={() =>
                    narrowing
                      ? setNarrowOpen({ key: narrowKey, open: { ...narrowState, [section]: !open } })
                      : setSectionOpen((s) => ({ ...s, [section]: !open }))
                  }
                >
                  <span className="chev" aria-hidden="true" />
                  <span className="section-name">{SECTION_TITLES[section] ?? section}</span>
                  <span className="section-counts small">{countsWords(c)}</span>
                </button>
              </h2>
              {open && (
                <div id={`sec-${section}`} className="section-body">
                  {table.length > 0 && <FactTable rows={table} ctx={ctx} />}
                  {rows.length > 0 && (
                    <ul className="lines">
                      {rows.map((row) => (
                        <LineRow key={row.line.id || row.line.text} row={row} ctx={ctx} facts={facts} />
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </div>
          ))}
          {counts.all > 0 && shown.length === 0 && <p className="small">{narrowing ? "No lines match." : `No ${FILTER_WORDS[filter].toLowerCase()} lines.`}</p>}
          <div className="add-row">
            <AddButtons where="record" />
          </div>
          <OtherChannels m={m} />
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
        </>
      )}
      {/* Always the last thing on Record, with or without a page: every completed panel answer of this subject. */}
      <PanelAnswers m={m} />
    </section>
  );
}

/** Channels of the subject that the key facts table does not show. */
function OtherChannels({ m }: { m: RecordModel }) {
  const { otherChannels } = useKeyFacts(m);
  const domain = m.page?.domain || m.subject.domain;
  if (!otherChannels.length) return null;
  return (
    <div className="card" id="other-channels">
      <h2>Other channels</h2>
      <ul className="channels">
        {otherChannels.map((c, i) => (
          <li key={i}>
            <ExtLink url={c.url}>{c.label || c.url}</ExtLink>
            <ChannelLabel c={c} domain={domain} />
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ---------- Sources ---------- */

/** A channel's label: Own domain, Verified on chain or Not verified. */
function ChannelLabel({ c, domain }: { c: Channel; domain: string }) {
  const s = channelStatus(c, domain);
  return <span className={`tie tie-${s}`}>{STATUS_WORDS[s]}</span>;
}

export function SourcesTab({ m }: { m: RecordModel }) {
  const { page, via, sourceList: list } = m;
  const domain = page?.domain || m.subject.domain;
  return (
    <section className="tab" aria-labelledby="sources-title">
      <h1 id="sources-title" tabIndex={-1} className="tab-title">Sources</h1>
      {page && page.channels.length > 0 && (
        <div className="channels-block">
          <h2>Channels</h2>
          <ul className="channels">
            {page.channels.map((c, i) => (
              <li key={i}>
                <ExtLink url={c.url}>{c.label || c.url}</ExtLink>
                <ChannelLabel c={c} domain={domain} />
              </li>
            ))}
          </ul>
          <p className="small tie-key">
            {STATUS_HELP.own} {STATUS_HELP.verified} {STATUS_HELP.unverified} {STATUS_LEGEND}
          </p>
        </div>
      )}
      {list.length > 0 ? (
        <div className="card">
          <h2>Every source, numbered</h2>
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
                    s.addedBy ? `added by ${s.addedBy}` : "page job",
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
              </li>
            ))}
          </ol>
          {via && <p className="small">The page file was read through {via.path === "api" ? "api.imd.fun" : "an IPFS gateway"}; its bytes matched the listed SHA-256.</p>}
        </div>
      ) : (
        <div className="card empty">
          <p>No sources yet. They are listed here once a page job or a sources job has completed.</p>
        </div>
      )}
    </section>
  );
}

export type { SourceLine };
