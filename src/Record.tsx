/** The record's tabs: Overview (key facts, summary), Record (filter, sections, one facts table) and Sources. */
import { disputedCount, sentenceDispute, type Dispute, type Disputes } from "./changeResult";
import { Fragment, useEffect, useState } from "react";
import { EXPLORER } from "./config";
import { jobLink, kindName, lineAnchor, payerName, shortHex } from "./format";
import { keyFacts, splitAddresses, type KeyRow } from "./keyfacts";
import { addHref, subjectHref, to } from "./route";
import { SubjectLogo } from "./Logo";
import { findSubject, parseLookup, rowMatches, type Findable } from "./lookup";
import { countLines, countsWords, FILTER_WORDS, filtersFor, GROUP_TONE, passes, rowClass, settleAll, speakerText, type Filter, type Settle } from "./settle";
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
import { readDate } from "./dates";
import { firstPageStatus, INSTRUCTIONS_UNAVAILABLE, isInstructionsUnavailable, statusText, type FirstPageStatus, type RecordModel } from "./model";
import type { Activity } from "./useActivity";
import { OutdatedNote, StillReading } from "./Home";
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
  if (row.values.length)
    return (
      <ul className="kf-values">
        {row.values.map((v, i) => (
          <li key={i}>
            <ValueText text={v} />
          </li>
        ))}
      </ul>
    );
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
  if (row.tokens.length)
    return (
      <ul className="kf-tokens">
        {row.tokens.map((t, i) => (
          <li key={i}>
            <span className="tok-name">
              {t.symbol && <strong>{t.symbol}</strong>}
              {t.symbol && t.purpose ? ": " : ""}
              {t.purpose && formatNumbers(t.purpose)}
            </span>
            {t.address && (
              <span className="tok-addr">
                {t.url ? (
                  <ExtLink url={t.url} className="mono">{shortHex(t.address)}</ExtLink>
                ) : (
                  <span className="mono">{shortHex(t.address)}</span>
                )}
                <Copy value={t.address} />
              </span>
            )}
            {!t.address && t.url && (
              <>
                {" "}
                <ExtLink url={t.url}>Explorer</ExtLink>
              </>
            )}
            {t.chain && <span className="small"> on {t.chain}</span>}
          </li>
        ))}
      </ul>
    );
  return (
    <>
      <ValueText text={row.value} url={row.url} />
      {row.note && <span className="small"> {row.note}</span>}
    </>
  );
}

/** A text value: every 0x address shortened in monospace with its copy button; linked when it has a url. */
function ValueText({ text, url = "" }: { text: string; url?: string }) {
  const parts = splitAddresses(text);
  const body = parts.map((p, i) => (p.address ? <span key={i} className="mono">{shortHex(p.text)}</span> : <Fragment key={i}>{formatNumbers(p.text)}</Fragment>));
  if (safeHref(url))
    return (
      <>
        <ExtLink url={url} className="break">{body}</ExtLink>
        {parts.filter((p) => p.address).map((p, i) => (
          <Copy key={i} value={p.text} />
        ))}
      </>
    );
  // Unlinked: each shortened address is followed by its own copy button, kept together on narrow screens.
  return (
    <span className="break">
      {parts.map((p, i) =>
        p.address ? (
          <span key={i} className="tok-addr">
            <span className="mono">{shortHex(p.text)}</span>
            <Copy value={p.text} />
          </span>
        ) : (
          <Fragment key={i}>{formatNumbers(p.text)}</Fragment>
        ),
      )}
    </span>
  );
}

/** Every full address a key facts row names, for its details: the table itself shows them shortened. */
const rowAddresses = (r: KeyRow) => [...new Set([r.value, ...r.values, ...r.tokens.map((t) => t.address)].flatMap((v) => splitAddresses(v).filter((p) => p.address).map((p) => p.text)))];

function KeyFacts({ m, ui }: { m: RecordModel; ui: Ui }) {
  const { rows } = useKeyFacts(m);
  const s = useSuggest();
  const [openRow, setOpenRow] = useState<string | null>(null);
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
                  <th scope="row">
                    {rowAddresses(r).length ? (
                      <button type="button" className="kf-toggle" aria-expanded={openRow === r.label} aria-controls={`kf-d-${i}`} onClick={() => setOpenRow(openRow === r.label ? null : r.label)}>
                        <span className="chev" aria-hidden="true" />
                        {r.label}
                      </button>
                    ) : (
                      r.label
                    )}
                  </th>
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
                {openRow === r.label && rowAddresses(r).length > 0 && (
                  <tr className="kf-details" id={`kf-d-${i}`}>
                    <td colSpan={4}>
                      <dl className="facts">
                        {rowAddresses(r).map((a) => (
                          <Fragment key={a}>
                            <dt>Full address</dt>
                            <dd className="mono break">
                              {a} <Copy value={a} />
                            </dd>
                          </Fragment>
                        ))}
                      </dl>
                    </td>
                  </tr>
                )}
                {s.open === target.key && (
                  <tr className="kf-panel">
                    <td colSpan={4}>
                      <ChangePanel target={target} mode="line" sourceUrl={url} line={r.lines[0] ?? { text: r.value }} evidence={evidenceOf(r.lines, allLines(m))} onOpenLines={ui.openLines} />
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
  if (r.disputedBy)
    return (
      <a
        className={`badge badge-${b.tone}`}
        href={to(lineAnchor(r.disputedBy))}
        onClick={(e) => {
          e.preventDefault();
          ui.openLines([r.disputedBy!]);
        }}
        aria-label={`${r.label}: ${b.text}. Open the newer line that ${b.tone === "contradicted" ? "contradicts" : "outdates"} it`}
      >
        {b.text}
      </a>
    );
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
  const sourceUrl = (l: Line) => (l.srcKeys[0] ? m.sourceList.find((s) => s.key === l.srcKeys[0])?.url ?? "" : "");
  const kf = keyFacts(m.page, m.resolve, all, sourceUrl);
  return { ...kf, rows: withDisputes(kf.rows, m.disputes) };
}

/** A Key facts row a newer source contradicts or outdates reads "Contradicted" or "Out of date" in place of its badge. */
export function withDisputes(rows: KeyRow[], d: Pick<Disputes, "infobox">): KeyRow[] {
  return rows.map((r) => {
    const hit = d.infobox.get(r.label.trim().toLowerCase());
    if (!hit) return r;
    const badge: KeyRow["badge"] = hit.type === "contradicts" ? { text: "Contradicted", tone: "contradicted" } : { text: "Out of date", tone: "outdated" };
    return { ...r, status: null, badge, disputedBy: hit.by };
  });
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

/** A small amber (out of date) or red (contradicted) dot after a summary sentence a newer line disputes; it opens that line. */
function DisputeDot({ d, ui }: { d: Dispute | null; ui: Ui }) {
  if (!d) return null;
  const word = d.type === "contradicts" ? "Contradicted" : "Out of date";
  return (
    <a
      className={`dispute-dot dispute-${d.type}`}
      href={to(lineAnchor(d.by))}
      title={`${word}: a newer source disputes this sentence`}
      aria-label={`${word}: open the newer line that disputes this sentence`}
      onClick={(e) => {
        e.preventDefault();
        ui.openLines([d.by]);
      }}
    >
      <span className="dot" aria-hidden="true" />
    </a>
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
                    <DisputeDot d={sentenceDispute(s, m.disputes)} ui={ui} />
                    {s.rewordedBy && <span className="reworded small"> reworded by <span className="mono">{s.rewordedBy}</span></span>}
                    {s.correctedBy && <span className="reworded small"> corrected by <span className="mono">{s.correctedBy}</span></span>}
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

/** The panel answers some record line links to; the others are listed only under Page upkeep and Activity. */
export function linkedAnswers(m: Pick<RecordModel, "panel" | "sections" | "answerRef">): { linked: Activity[]; unlinked: Activity[] } {
  const ids = new Set<string>();
  for (const l of allLines(m)) for (const k of l.links) {
    const a = m.answerRef(k.target)?.activity;
    if (a) ids.add(a.req.requestId);
  }
  return { linked: m.panel.filter((a) => ids.has(a.req.requestId)), unlinked: m.panel.filter((a) => !ids.has(a.req.requestId)) };
}

function PanelAnswers({ m }: { m: RecordModel }) {
  const { linked } = linkedAnswers(m);
  if (!linked.length) return null;
  return (
    <div className="card" id="panel-answers">
      <h2>Panel answers</h2>
      <ul className="lines">
        {[...linked].reverse().map((a) => (
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

/** "A newer source disputes N parts of this page.", when a kept change left anything in its affects list. */
function DisputedNote({ m }: { m: RecordModel }) {
  const { rows } = useKeyFacts(m);
  if (!m.page || !m.disputes.fromKept) return null;
  const n = disputedCount(m.disputes, rows.map((r) => r.label), m.summary);
  if (!n) return null;
  return (
    <p className="disputed-note" role="note">
      A newer source disputes {n === 1 ? "1 part" : `${n.toLocaleString("en-US")} parts`} of this page. <a href={to("rebuild")}>Rebuild to update them.</a>
    </p>
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
      {m.outdated && <OutdatedNote o={m.outdated} href={to("rebuild")} />}
      <DisputedNote m={m} />
      {rejectedCard && (first?.kind === "instructions" || isInstructionsUnavailable(m.rejected!.rejected)) && (
        <div className="card empty" id="rejected">
          <h2>Instructions not verified</h2>
          <p className="why">{INSTRUCTIONS_UNAVAILABLE}</p>
          <p>It could not fetch the instruction file its objective names, or the file’s sha256 differed, so it did not research {m.subject.id}. This says nothing about whether the project exists.</p>
          <p className="small">
            See <a href={to("activity")}>Activity</a> for the job.
          </p>
        </div>
      )}
      {rejectedCard && !(first?.kind === "instructions" || isInstructionsUnavailable(m.rejected!.rejected)) && (
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
              <h2>{first.kind === "not-found" ? "No project found" : first.kind === "instructions" ? "Instructions not verified" : first.kind === "refused" ? "First page refused" : "First page failed"}</h2>
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
  // This row's own earlier origins: those of the lines folded into it are listed with each of them.
  const ownFrom = line.from.filter((f) => !(row.same ?? []).some((o) => o.line.from.includes(f)));
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
                <dt>{st!.state === "proven" ? "Proof" : disputeWho(proof)}</dt>
                <dd>
                  {proof.text}
                  {proof.kind === "proof" && (proof.rerun ? <span className="block">Re-run: {proof.rerun}</span> : <span className="block small">The proof gives no re-run steps.</span>)}
                </dd>
              </Fragment>
            );
          const a = ctx.m.answerRef(t);
          return (
            <Fragment key={t}>
              <dt>Panel answer</dt>
              <dd>
                {a ? a.text : "A panel answer not shown in this record"}
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
        {!!row.same?.length && (
          <>
            <dt>Also in the record</dt>
            <dd>
              <ul className="plain">
                {row.same.map((o, i) => {
                  const nums = o.line.srcKeys.map((k) => ctx.numbers.get(k)?.n).filter((n): n is number => n !== undefined);
                  const who = o.line.kind === "proof" ? "A proof" : speakerText(o.line);
                  const added = o.origin
                    ? `added by ${o.origin.raised ? "a changes job" : "a sources or edit job"} paid by ${o.origin.payer}`
                    : o.line.from.length
                      ? [...new Set(o.line.from.map(ctx.m.fromOrigin))].join("; ")
                      : "from the page job";
                  return (
                    <li key={i}>
                      {who}, {added}
                      {nums.length ? `, source${nums.length === 1 ? "" : "s"} ${nums.join(", ")}` : ""}
                      {o.line.quote ? <span className="block">“{o.line.quote}”</span> : null}
                    </li>
                  );
                })}
              </ul>
            </dd>
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
          {!origin && ownFrom.length > 0 && <span className="block small">{[...new Set(ownFrom.map(ctx.m.fromOrigin))].join("; ")}</span>}
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
  // Out of date is the row's lead with "Newer:" under it; a link to nothing the record shows is left out.
  const links = line.links.filter((k) => k.type !== "outdates" && !lead.has(`${k.type}:${k.target.trim()}`) && (ctx.m.resolve(k.target) || ctx.m.answerRef(k.target)));
  if (!links.length) return null;
  return (
    <ul className="settled">
      {links.map((k, i) => {
        const word = k.type === "confirms" ? "Confirmed by" : k.type === "partly" ? "Partly confirmed by" : k.type === "context" ? "Context" : k.type === "agrees" ? "Also said by another speaker" : "Contradicted by";
        const target = ctx.m.resolve(k.target);
        const answer = target ? null : ctx.m.answerRef(k.target);
        let body: React.ReactNode = <span>a line not shown in this record</span>;
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
  if (s.state === "outdated")
    return (
      <span className="kind kind-outdated">
        <span className="dot" aria-hidden="true" />
        Out of date
      </span>
    );
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

/** Who disputes a line, by the evidence it is: a proof, a newer claim or statement, or a panel answer. */
const disputeWho = (l: Pick<Line, "kind">) => (l.kind === "proof" ? "The proof shows" : l.kind === "claim" ? "A newer claim says" : "A newer statement says");

/** What the disputing line or panel answer says, for a contradicted row, introduced by what kind of evidence it is. */
function shownBy(t: string, ctx: Ctx): { who: string; text: string } {
  const proof = ctx.m.resolve(t);
  if (proof) return { who: disputeWho(proof), text: proof.text };
  const a = ctx.m.answerRef(t);
  return { who: "The panel answered", text: a?.text || "an answer not shown in this record" };
}

/** "Newer: <the newer line>" under an Out of date row, each opening that line. */
function NewerNotes({ ids, ctx, contradicted }: { ids: string[]; ctx: Ctx; contradicted?: boolean }) {
  return (
    <ul className="settled">
      {ids.map((t) => {
        const newer = ctx.m.resolve(t);
        const a = newer ? null : ctx.m.answerRef(t);
        if (!newer && !a) return null;
        return (
          <li key={t} className={contradicted ? "settled-contradicts" : "settled-outdates"}>
            <span className="settled-word">{contradicted ? `${newer ? disputeWho(newer) : "The panel answered"}:` : "Newer:"}</span>{" "}
            {newer ? (
              <a
                href={to(lineAnchor(newer.id))}
                onClick={(e) => {
                  e.preventDefault();
                  ctx.ui.openLines([newer.id]);
                }}
              >
                {formatNumbers(newer.text)}
              </a>
            ) : (
              <span>{a!.text}</span>
            )}
          </li>
        );
      })}
    </ul>
  );
}

/**
 * Who else says what this row says: the speakers of identical lines shown as this one row, and statements or
 * claims of the record whose confirms (or partly) link points at it. Each opens that line.
 */
function alsoSaidBy(row: RecordRow, ctx: Ctx): { who: string; id: string }[] {
  const { line } = row;
  const mine = (line.kind === "proof" ? "" : speakerText(line)).replace(/^(Stated|Claimed) by /, "").toLowerCase();
  const out: { who: string; id: string }[] = [];
  const add = (l: Line, id: string) => {
    if (l.kind === "proof") return;
    const who = speakerText(l).replace(/^(Stated|Claimed) by /, "");
    if (!who || who.toLowerCase() === mine || out.some((x) => x.who.toLowerCase() === who.toLowerCase())) return;
    out.push({ who, id });
  };
  for (const o of row.same ?? []) add(o.line, line.id);
  for (const l of allLines(ctx.m)) if (l.id !== line.id && l.links.some((k) => (k.type === "confirms" || k.type === "partly") && k.target.trim() === line.id)) add(l, l.id);
  return out;
}

/** "Also said by <speaker>" under a line, each opening the line that says it. */
function AlsoSaid({ also, lineId, open, toggle, ctx }: { also: { who: string; id: string }[]; lineId: string; open: boolean; toggle: () => void; ctx: Ctx }) {
  if (!also.length) return null;
  return (
    <ul className="settled also">
      {also.map((a, i) => (
        <li key={i}>
          <span className="settled-word">Also said by</span>{" "}
          <a
            href={to(lineAnchor(a.id))}
            onClick={(e) => {
              e.preventDefault();
              if (a.id === lineId) {
                if (!open) toggle();
              } else ctx.ui.openLines([a.id]);
            }}
          >
            {a.who}
          </a>
        </li>
      ))}
    </ul>
  );
}

function LineRow({ row, ctx, facts }: { row: RecordRow; ctx: Ctx; facts: Set<string> }) {
  const { line } = row;
  const anchor = lineAnchor(line.id || line.text.slice(0, 40));
  const showBy = line.kind !== "proof" && line.by;
  const open = ctx.ui.openSet.has(line.id);
  const toggle = () => ctx.ui.toggle(line.id);
  const s = ctx.settled.by.get(line.id);
  const settled = s && (s.state === "proven" || s.state === "contradicted" || s.state === "outdated") ? s : null;
  const sg = useSuggest();
  const also = alsoSaidBy(row, ctx);
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
                <span className="said-word">{line.kind === "proof" ? "Checked:" : "Said:"}</span> {formatNumbers(line.text)}
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
          ) : settled?.state === "outdated" ? (
            <span className="row-text">
              <SettleMark s={settled} ctx={ctx} />
              <span className="block">{formatNumbers(line.text)}</span>
            </span>
          ) : (
            <span className="row-text">{formatNumbers(line.text)}</span>
          )}
          <span className="row-meta">
            {settled ? (
              <>
                {settled.state === "proven" && <SettleMark s={settled} ctx={ctx} />}
                {line.kind === "proof" ? <KindMark kind="proof" /> : <span className="by small">{speakerText(line)}{settled.state === "proven" ? ", then confirmed" : ""}</span>}
              </>
            ) : (
              <>
                <KindMark kind={line.kind} />
                {line.kind === "proof" && <span className="by small">a check in its own right</span>}
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
      {settled?.state === "outdated" && <NewerNotes ids={settled.outdates} ctx={ctx} />}
      <AlsoSaid also={also} lineId={line.id} open={open} toggle={toggle} ctx={ctx} />
      <LinkNotes line={line} ctx={ctx} />
      {open && <Details row={row} ctx={ctx} id={`${anchor}-d`} />}
      {sg.open === target.key && <ChangePanel target={target} mode="line" sourceUrl={srcUrl} line={line} evidence={evidenceOf([line], allLines(ctx.m))} onOpenLines={ctx.ui.openLines} />}
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
          const st = ctx.settled.by.get(row.line.id);
          const stale = st?.state === "outdated" ? st : null;
          const disputed = st?.state === "contradicted" ? st : null;
          const also = alsoSaidBy(row, ctx);
          return (
            <Fragment key={row.line.id || f.name}>
              <tr id={anchor} className={`fact-row has-pencil${stale ? " row-outdated" : ""}${disputed ? " row-contradicted" : ""}${open ? " is-open" : ""}`} onClick={onRowClick(toggle)}>
                <th scope="row">
                  <button type="button" className="row-toggle" aria-expanded={open} aria-controls={`${anchor}-d`} onClick={toggle}>
                    <span className="chev" aria-hidden="true" />
                    <span className="row-text">
                      {/* Each check says what it is, as a standalone proof row does; a disputed one says so instead. */}
                      {disputed ? <SettleMark s={disputed} ctx={ctx} /> : stale ? <SettleMark s={stale} ctx={ctx} /> : <KindMark kind="proof" />}
                      <span className="block">{f.name}</span>
                    </span>
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
                    <ChangePanel target={target} mode="line" sourceUrl={ctx.numbers.get(row.line.srcKeys[0] ?? "")?.url ?? ""} line={row.line} evidence={evidenceOf([row.line], allLines(ctx.m))} onOpenLines={ctx.ui.openLines} />
                  </td>
                </tr>
              )}
              {(stale || disputed || also.length > 0) && (
                <tr className="fact-links">
                  <td colSpan={3}>
                    {disputed && <NewerNotes ids={disputed.contradicts} ctx={ctx} contradicted />}
                    {stale && <NewerNotes ids={stale.outdates} ctx={ctx} />}
                    <AlsoSaid also={also} lineId={row.line.id} open={open} toggle={toggle} ctx={ctx} />
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

/**
 * "Page upkeep": one closed row at the bottom of Record. It opens to show the lines dropped in the last rebuild with
 * their reasons, earlier lines unaccounted for (if any), how many identical lines were shown as one, and panel
 * answers no line links to. Internal ids appear only here (and on Contribute under Rebuild the page). A small amber
 * dot marks the row only when there are unaccounted lines.
 */
function PageUpkeep({ m }: { m: RecordModel }) {
  const a = m.accounting;
  const dropped = a.dropped;
  const carried = m.carried;
  const missing = a.state === "done" ? a.missing : [];
  const { unlinked } = linkedAnswers(m);
  const total = dropped.length + carried.length;
  if (!m.page && !unlinked.length) return null;
  return (
    <details className="card upkeep" id="upkeep">
      <summary>
        <span className="upkeep-title">Page upkeep</span>
        {missing.length > 0 && <span className="upkeep-dot" role="img" aria-label="Earlier lines unaccounted for" />}
      </summary>
      <div className="upkeep-body small">
        {a.state === "loading" && <p>Checking the last rebuild against the {a.files} earlier files it was given…</p>}
        {a.state === "error" && <p>Unable to check the last rebuild against its earlier files: {a.error}</p>}
        <h3>Dropped in the last rebuild</h3>
        {total > 0 ? (
          <ul className="plain" id="dropped">
            {dropped.map((d, i) => (
              <li key={i}>
                <span className="mono">{d.ref}</span>
                {d.text && <> “{d.text}”</>}
                {": "}
                <span className="why-dropped">{d.why || "no reason given"}</span>
              </li>
            ))}
            {carried.map((d) => (
              <li key={`${d.url}:${d.id}`}>
                <span className="mono">{d.id}</span> of <span className="mono break">{d.url.replace(/^https:\/\/api\.imd\.fun\/artifacts\//, "").slice(0, 12)}…</span>
                {": "}
                <span className="why-dropped">{d.why || "no reason given"}</span>
                <span> Dropped by an earlier rebuild; the next rebuild reconsiders it.</span>
              </li>
            ))}
          </ul>
        ) : (
          <p>None.</p>
        )}
        {missing.length > 0 && (
          <div id="unaccounted">
            <h3>
              {missing.length} earlier line{missing.length === 1 ? " is" : "s are"} unaccounted for
            </h3>
            <p>The last rebuild neither carried these lines forward nor listed them as dropped.</p>
            <ul className="plain">
              {missing.map((x) => (
                <li key={x.ref}>
                  <span className="mono">{x.ref}</span> {x.text}
                </li>
              ))}
            </ul>
          </div>
        )}
        {m.unresolved.length > 0 && (
          <div id="unresolved">
            <h3>
              {m.unresolved.length} link{m.unresolved.length === 1 ? "" : "s"} to a panel answer the record does not hold
            </h3>
            <p>These lines keep their own kind until the next rebuild links them to an answer it was given.</p>
            <ul className="plain">
              {m.unresolved.map((x, i) => (
                <li key={i}>
                  <span className="mono">{x.lineId}</span> {x.type} <span className="mono">{x.target}</span>: {x.text}
                </li>
              ))}
            </ul>
          </div>
        )}
        <h3>Identical lines</h3>
        <p id="repeats">
          {m.merged
            ? `${m.merged.toLocaleString("en-US")} line${m.merged === 1 ? " had" : "s had"} the same text as another line (ignoring case and punctuation) and ${m.merged === 1 ? "is" : "are"} shown as one row. The next rebuild merges them.`
            : "No two lines have the same text."}
        </p>
        {unlinked.length > 0 && (
          <>
            <h3>Panel answers no line links to yet</h3>
            <ul className="plain">
              {[...unlinked].reverse().map((p) => (
                <li key={p.req.requestId} id={panelAnchor(p)} tabIndex={-1}>
                  {p.req.title || String(p.req.bodyJson?.question ?? "").slice(0, 120)}:{" "}
                  <span className={`answer answer-${p.oracle?.answer ?? "none"}`}>{p.oracle?.answer ?? "no answer"}</span>, {p.oracle?.agreed ?? "?"} of {p.oracle?.panelSize ?? "?"} agreed.{" "}
                  <a href={jobLink(p.jobId, p.req.transactionHash)} target="_blank" rel="noopener noreferrer">
                    {p.jobId ? "Open the request" : "Open the transaction"}
                  </a>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </details>
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
  const keep = (r: RecordRow) => passes(filter, rowClass(r.line, settled.by.get(r.line.id))) && rowMatches(r, query);
  const shownFacts = factRows.filter(keep);
  const named = new Set(sections.map((s) => s.section));
  if (factRows.length) named.add("on_chain");
  const order = [...SECTIONS.filter((s) => named.has(s)), ...[...named].filter((s) => !(SECTIONS as readonly string[]).includes(s))];
  const shown = order
    .map((section) => {
      const every = sections.find((s) => s.section === section)?.rows ?? [];
      // Every proof keeps its own row, also when a settled row shows it as its evidence: in the facts table when it
      // has a fact, else here. Proven lists both kinds; each row says which it is.
      const rows = every.filter((r) => !facts.has(r.line.id) && keep(r));
      const table = section === "on_chain" ? shownFacts : [];
      const inSection = [...rows, ...table].map((r) => r.line);
      const hasOpen = inSection.some((l) => ui.openSet.has(l.id));
      const open = narrowing ? narrowState[section] ?? true : sectionOpen[section] ?? hasOpen;
      // The rows shown, counted by the shared rule: every row once.
      return { section, rows, table, counts: countLines(inSection, settled), open };
    })
    .filter((s) => s.rows.length > 0 || s.table.length > 0);
  // A link to one line opens it, and its section, when the tab is reached by that link; a search or the
  // settled filter that would hide it is cleared.
  useEffect(() => {
    if (!ui.target?.startsWith("line-")) return;
    const folded = [...m.alias].find(([id]) => lineAnchor(id) === ui.target);
    if (folded) return ui.openLines([folded[1]]);
    const row = sections.flatMap((s) => s.rows).find((r) => lineAnchor(r.line.id) === ui.target);
    if (!row) return;
    if (!ui.openSet.has(row.line.id)) ui.toggle(row.line.id);
    setQuery("");
    setSectionOpen((s) => Object.fromEntries(Object.entries(s).filter(([, v]) => v)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ui.target, sections]);
  const matched = shown.reduce((n, s) => n + s.rows.length + s.table.length, 0);

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
          {counts.all > 0 && (
            <div className="filter" role="group" aria-label="Show lines">
              {filtersFor(counts).map((f) => (
                <button key={f} type="button" className="btn btn-filter" aria-pressed={filter === f} onClick={() => ui.setFilter(f)}>
                  {f === "all" ? FILTER_WORDS[f] : (
                    <span className={`kind kind-${GROUP_TONE[f]}`}>
                      <span className="dot" aria-hidden="true" />
                      {FILTER_WORDS[f]}
                    </span>
                  )}
                  <span className="count num">{counts[f]}</span>
                </button>
              ))}
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
      {/* Panel answers that lines link to, then Page upkeep: always the last thing on Record. */}
      <PanelAnswers m={m} />
      <PageUpkeep m={m} />
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
                    s.readAt ? `read ${readDate(s.readAt)}` : "read at an unknown time",
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
