/** Every paid request of this site, newest first, with its state, refusal reason, panel answer, source outcomes or edit verdicts. */
import { artifactUrl } from "./bodies";
import { ACTIONS } from "./config";
import { jobLink, kindName, lineAnchor, payerName } from "./format";
import { outcomeOf, outcomeText, VERDICT_WORDS } from "./page";
import { STANDING_WORDS, type RecordModel } from "./model";
import { TEMPLATE_TITLES, type Template } from "./bodies";
import { to } from "./route";
import { isEditJob, isPageJob, isSourceJob, type Activity, type useActivity } from "./useActivity";

function what(a: Activity) {
  if (a.req.action !== ACTIONS.research) return `Question · ${TEMPLATE_TITLES[a.req.template as Template] ?? kindName(a.req.kind)}`;
  if (isSourceJob(a.req)) return "Sources";
  if (isEditJob(a.req)) return "Edit";
  if (isPageJob(a.req)) return "Page rebuild";
  return "Job";
}

type Shown = Pick<RecordModel, "standing" | "after" | "editRefs">;

/** Shown now, folded in (its artifact URL is in the objective of the page shown), or not yet folded in. */
function standing(a: Activity, shown: Shown): string {
  const s = shown.standing(a);
  return s ? STANDING_WORDS[s] : "";
}

const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? "" : "s"}`;

export function ActivityList({ items, error, loading, reload, shown }: ReturnType<typeof useActivity> & { shown: Shown }) {
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
            const st = standing(a, shown);
            const onTop = shown.after.some((x) => x.req.requestId === a.req.requestId);
            return (
              <li key={a.req.requestId} className="card act">
                <div className="act-top">
                  <span className={`state state-${a.state}`}>{a.state}</span>
                  <span className="small">{a.time ? new Date(a.time).toLocaleString() : `block ${a.req.blockNumber}`}</span>
                </div>
                <p className="act-what">
                  {what(a)}
                  {a.req.action === ACTIONS.oracle && a.state === "completed" && a.oracle ? ` · answer: ${a.oracle.answer ?? "none"} (panel, ${a.oracle.agreed ?? "?"} of ${a.oracle.panelSize ?? "?"} agreed)` : ""}
                </p>
                {st && <p className="small">{st}</p>}
                {a.rejected && (
                  <p className="why rejected">
                    Not a project record: the job set found to false, so nothing from it is shown. Its notes: {a.rejected}
                  </p>
                )}
                {(a.state === "refused" || a.state === "failed") && (
                  <p className="why">
                    {a.state === "refused" ? "Refused" : "Failed"}: {a.refusal ? [a.refusal.reason, a.refusal.detail].filter(Boolean).join(": ") : a.completion?.reason || "no reason given yet"}
                  </p>
                )}
                {a.req.action === ACTIONS.oracle && <p className="small">{a.req.title || String(a.req.bodyJson?.question ?? "")}</p>}
                {isEditJob(a.req) && a.edit && (
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
                {a.sourcesError && <p className="error">Unable to read the result: {a.sourcesError}</p>}
                <p className="small">
                  Paid by <span className="mono">{payerName(a)}</span> ·{" "}
                  <a href={jobLink(a.jobId, a.req.transactionHash)} target="_blank" rel="noopener noreferrer">
                    {a.jobId ? "Open on explorer.imd.fun" : "Open the transaction"}
                  </a>
                  {a.fileHash && (
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
