import { cleanQuestion, questionAnchor } from "./questions";
import { localDateTime } from "./dates";
/** Every paid request of this site, newest first, with its state, refusal reason, panel answer, source outcomes or edit verdicts. */
import { artifactUrl } from "./bodies";
import { ACTIONS } from "./config";
import { jobLink, lineAnchor, payerName } from "./format";
import { walletHref } from "./route";
import { outcomeOf, outcomeText, tooLargeText, VERDICT_WORDS } from "./page";
import { isInstructionsUnavailable, STANDING_WORDS, type RecordModel } from "./model";
import { TEMPLATE_TITLES, type Template } from "./bodies";
import { to } from "./route";
import { isChangesJob, isEditJob, isPageJob, isSourceJob, type Activity, type useActivity } from "./useActivity";
import { CHANGE_WORDS, keyFactTarget, lineTarget, newChangeId, noTarget, parseItems, sentenceTarget, type ChangeTarget, type SentItem } from "./changes";
import { originOfLine, resolveChangeTarget } from "./changeResult";
import { changesOutcome } from "./outcome";
import { useSuggest } from "./Suggest";
import { useState } from "react";

function what(a: Activity) {
  // A panel request is named by its question type, never by a record kind (Proof, Statement, Claim).
  if (a.req.action !== ACTIONS.research) return `Question · ${TEMPLATE_TITLES[a.req.template as Template] ?? "Panel answer"}`;
  if (isSourceJob(a.req)) return "Sources";
  if (isEditJob(a.req)) return "Edit";
  if (isChangesJob(a.req)) return (!a.notRead && changesOutcome(a)) || "Changes";
  if (isPageJob(a.req)) return "Page rebuild";
  return "Job";
}

type Shown = Pick<RecordModel, "standing" | "after" | "editRefs" | "resolve" | "pageHash" | "scope"> & Partial<Pick<RecordModel, "questions">>;

/** A change not kept because nothing backed it: no link was given, or the job says no source supported it. */
export const lackedSource = (item: Pick<SentItem, "links">, why: string) => item.links.length === 0 || /\b(source|sources|link|links|evidence)\b/i.test(why);

/** The file and line pairs a sent change cited: "F1:L2,F1:L3" is two, "L4" one, "" none. */
export const retryRefs = (ref: string) => ref.split(",").map((x) => x.trim()).filter(Boolean);

/**
 * The target of a change Activity puts back in the tray. A key facts row may cite several lines ("F1:L2,F1:L3"):
 * each file and line pair is found on the record on its own, and all are kept. When it cited lines and none is on
 * the record now, the target is marked lost: Review holds it until the visitor chooses the row again.
 */
export function retryTarget(item: SentItem, a: Activity, shown: Pick<Shown, "scope" | "resolve">): ChangeTarget {
  if (item.targetKind === "sentence") return sentenceTarget(item.text);
  if (item.targetKind === "none") return noTarget();
  const refs = retryRefs(item.ref);
  const ids = refs.flatMap((r) => {
    const id = resolveChangeTarget(r, a, shown.scope, (x) => !!shown.resolve(x));
    return id ? [id] : [];
  });
  const id = ids[0] ?? null;
  let target: ChangeTarget;
  if (item.targetKind === "keyfact") {
    const i = item.text.indexOf(": ");
    target = keyFactTarget(i > 0 ? item.text.slice(0, i) : item.text, i > 0 ? item.text.slice(i + 2) : "", ids, id ? originOfLine(id, shown.scope) : null);
  } else target = id ? lineTarget(id, item.text, originOfLine(id, shown.scope)) : { kind: "line", key: `old:${item.text}`, lineId: "", text: item.text };
  return refs.length > 0 && !ids.length ? { ...target, lost: true } : target;
}

/** A changes job that closed or reworded open questions: "Answered: <the question>", linking to the new lines. */
function AnsweredQuestions({ a, shown }: { a: Activity; shown: Shown }) {
  const list = shown.questions?.byJob.get(a.req.requestId) ?? [];
  if (!list.length) return null;
  return (
    <ul className="plain answered" aria-label="Questions this job answered">
      {list.map((x, i) => {
        const lines = shown.editRefs(a, x.lines, null);
        return (
          <li key={`${x.question.id}-${i}`}>
            <a href={to(questionAnchor(x.question.id))}>{x.op === "reword" ? "Answered in part" : "Answered"}: {cleanQuestion(x.text)}</a>
            {lines.length > 0 && (
              <span className="small">
                {" "}
                {lines.map((l, i) => (
                  <span key={l.id}>
                    {i > 0 && ", "}
                    <a href={to(lineAnchor(l.id))}>new line {i + 1}</a>
                  </span>
                ))}
              </span>
            )}
          </li>
        );
      })}
    </ul>
  );
}

/** Every change of a changes job, "Added" or "Not added", each with its reason; one not added for lack of a source can go back in the tray. */
function ChangeItems({ a, shown }: { a: Activity; shown: Shown }) {
  const s = useSuggest();
  const [back, setBack] = useState<Map<number, "added" | "opened">>(() => new Map());
  const sent = parseItems(a.req.bodyJson?.objective);
  if (!sent.length) return null;
  const putBack = (item: SentItem, v: { why: string } | undefined) => {
    const target = retryTarget(item, a, shown);
    // One pending change per row or sentence: a change already waiting for this target is opened to edit instead.
    const existing = s.tray.list.find((x) => x.target.key === target.key && !target.lost);
    if (existing) {
      s.setOpen(target.key);
      setBack((b) => new Map(b).set(item.n, "opened"));
      return;
    }
    s.tray.put({ id: newChangeId(), type: item.type, target, note: item.note, links: item.links, retry: v?.why || "no source supported it", ...(item.suggest ? { suggest: item.suggest } : {}) });
    setBack((b) => new Map(b).set(item.n, "added"));
  };
  return (
    <ul className="verdicts" aria-label="Each change and its verdict">
      {sent.map((item) => {
        const v = a.changes?.items.find((x) => x.n === item.n);
        return (
          <li key={item.n}>
            <span className="small">{CHANGE_WORDS[item.type]}{item.text ? ":" : ""}</span>
            {item.text && <span>“{item.text}”</span>}
            {item.note && <span className="small">{item.type === "reword" ? "New sentence: " : "Note: "}{item.note}</span>}
            {v ? (
              v.kept ? (
                <>
                  <span className="verdict verdict-supported">Added{v.type === "reword" && v.finalText ? `: “${v.finalText}”` : ""}</span>
                  <span className="small">{v.why || "no reason given"}</span>
                </>
              ) : (
                <>
                  <span className="verdict verdict-unsupported">Not added</span>
                  <span className="small">{v.why || "no reason given"}</span>
                </>
              )
            ) : a.state === "completed" && a.changes ? (
              <span className="small">No verdict given</span>
            ) : null}
            {v && !v.kept && lackedSource(item, v.why) && (
              back.has(item.n) ? (
                <span className="small" role="status">
                  {back.get(item.n) === "opened" ? "You already have a change waiting for this; it is open to edit." : "Back in your changes, at the bottom of the page."}
                </span>
              ) : (
                <button type="button" className="linklike small" onClick={() => putBack(item, v)}>
                  Add a link and try again
                </button>
              )
            )}
          </li>
        );
      })}
    </ul>
  );
}

/**
 * Shown now, folded in (its artifact URL is in the objective of the page shown), or, for a panel answer, not yet
 * folded in. A changes, sources or edit result already shows on the page as applied, so it names no next rebuild.
 */
export function standing(a: Activity, shown: Pick<Shown, "standing">): string {
  const s = shown.standing(a);
  if ((s === "next" || s === "left-out") && (isChangesJob(a.req) || isSourceJob(a.req) || isEditJob(a.req))) return "";
  return s ? STANDING_WORDS[s] : "";
}

const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? "" : "s"}`;

export function ActivityList({ items, error, loading, reload, shown }: ReturnType<typeof useActivity> & { shown: Shown; subject?: string }) {
  return (
    <section id="activity" className="tab" aria-labelledby="activity-title">
      <div className="section-head">
        <h1 id="activity-title" className="tab-title" tabIndex={-1}>Activity</h1>
        <button className="btn" onClick={() => void reload()} disabled={loading}>{loading ? "Reading chain…" : "Refresh"}</button>
      </div>
      {error && <p className="error">Unable to read the chain: {error}. Try Refresh.</p>}
      {items && items.length === 0 && !error && <div className="card"><p>No requests yet. Every paid request for this project appears here, newest first.</p></div>}
      {items === null && <div className="card"><p>Reading requests from Ethereum…</p></div>}
      {items && items.length > 0 && (
        <ul className="activity">
          {items.map((a) => {
            const st = a.notRead ? "" : standing(a, shown);
            const onTop = shown.after.some((x) => x.req.requestId === a.req.requestId);
            return (
              <li key={a.req.requestId} className="card act">
                <div className="act-top">
                  <span className={`state state-${a.state}`}>{a.state}</span>
                  <span className="small">{a.time ? localDateTime(a.time) :`block ${a.req.blockNumber}`}</span>
                </div>
                <p className="act-what">
                  {what(a)}
                  {a.req.action === ACTIONS.oracle && a.state === "completed" && a.oracle ? ` · answer: ${a.oracle.answer ?? "none"} (panel, ${a.oracle.agreed ?? "?"} of ${a.oracle.panelSize ?? "?"} agreed)` : ""}
                </p>
                {st && <p className="small">{st}</p>}
                {a.notRead && <p className="why rejected">{a.notRead}</p>}
                {a.rejected && (
                  <p className="why rejected">
                    {isInstructionsUnavailable(a.rejected)
                      ? "The job stopped because it could not verify the instructions, so nothing from it is shown."
                      : `Not a project record: the job set found to false, so nothing from it is shown. Its notes: ${a.rejected}`}
                  </p>
                )}
                {(a.state === "refused" || a.state === "failed") && (
                  <p className="why">
                    {a.state === "refused" ? "Refused" : "Failed"}: {a.refusal ? [a.refusal.reason, a.refusal.detail].filter(Boolean).join(": ") : a.completion?.reason || "no reason given yet"}
                  </p>
                )}
                {a.req.action === ACTIONS.oracle && <p className="small">{a.req.title || String(a.req.bodyJson?.question ?? "")}</p>}
                {!a.notRead && isEditJob(a.req) && a.edit && (
                  <ul className="verdicts" aria-label="Each sentence and its verdict">
                    {a.edit.sentences.map((s, i) => {
                      const refs = onTop ? shown.editRefs(a, s.lines, s.verdict) : [];
                      return (
                        <li key={i}>
                          <span className={`verdict verdict-${s.verdict}`}>{VERDICT_WORDS[s.verdict]}</span>
                          <span>{s.text}</span>
                          {s.corrected && s.corrected !== s.text && <span className="small">Corrected to: {s.corrected}</span>}
                          {s.why && <span className="small">{s.why}</span>}
                          {s.verdict !== "unsupported" && s.lines.length > 0 && (
                            <span className="small">
                              Backed by{" "}
                              {refs.length > 0
                                ? refs.map((l, j) => (
                                    <span key={l.id}>
                                      {j > 0 && "; "}
                                      <a href={to(lineAnchor(l.id))}>{l.text}</a>
                                    </span>
                                  ))
                                : <span className="mono">{s.lines.join(", ")}</span>}
                            </span>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                )}
                {isEditJob(a.req) && a.edit && (
                  <p className="small">
                    {a.edit.accepted.length ? `${a.edit.accepted.length} sentence${a.edit.accepted.length === 1 ? "" : "s"} accepted as the summary` : "No summary accepted"}
                    {` · ${a.edit.data.lines.length} new line${a.edit.data.lines.length === 1 ? "" : "s"}`}
                  </p>
                )}
                {isChangesJob(a.req) && (
                  <>
                    <ChangeItems a={a} shown={shown} />
                    <AnsweredQuestions a={a} shown={shown} />
                  </>
                )}
                {isSourceJob(a.req) && a.sources && (
                  <ul className="outcomes" aria-label="What each source gave">
                    {a.sources.sources.map((s, i) => {
                      const o = outcomeOf(a.sources!, s);
                      return (
                        <li key={i}>
                          <span className="mono break">{s.url || s.id}</span>
                          <span className={`outcome outcome-${o.kind}`}>{outcomeText(o)}</span>
                        </li>
                      );
                    })}
                  </ul>
                )}
                {isSourceJob(a.req) && a.sources && <p className="small">{onTop ? `${plural(a.sources.lines.length, "line")} added to the record` : `${plural(a.sources.lines.length, "line")} in result`}</p>}
                {a.sources?.tooLarge ? <p className="warn" role="note">{tooLargeText(a.sources.tooLarge)}</p> : null}
                {a.sourcesError && <p className="error">Unable to read the result: {a.sourcesError}</p>}
                <p className="small">
                  Paid by <a className="mono" href={walletHref(a.req.payer)}>{payerName(a)}</a> ·{" "}
                  <a href={jobLink(a.jobId, a.req.transactionHash)} target="_blank" rel="noopener noreferrer">
                    {a.jobId ? "Open on explorer.imd.fun" : "Open the transaction"}
                  </a>
                  {a.fileHash && !a.notRead && (
                    <>
                      {" · "}
                      <a href={artifactUrl(a.fileHash)} target="_blank" rel="noopener noreferrer">
                        Result file
                      </a>
                    </>
                  )}
                </p>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
