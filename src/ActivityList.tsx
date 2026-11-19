/** Every paid request of this site, newest first, with its state, refusal reason, panel answer, source outcomes or edit verdicts. */
import { artifactUrl } from "./bodies";
import { ACTIONS } from "./config";
import { jobLink, kindName, payerName } from "./format";
import { outcomeOf, outcomeText, VERDICT_WORDS } from "./page";
import type { RecordModel } from "./model";
import { isEditJob, isPageJob, isSourceJob, type Activity, type useActivity } from "./useActivity";

function what(a: Activity) {
  if (a.req.action !== ACTIONS.research) return `Question · ${kindName(a.req.kind)}`;
  if (isSourceJob(a.req)) return "Sources";
  if (isEditJob(a.req)) return "Edit";
  if (isPageJob(a.req)) return "Page rebuild";
  return "Job";
}

/** Whether a completed page, sources or edit result is shown now, or already folded into a newer page. */
function standing(a: Activity, shown: Pick<RecordModel, "latest" | "after">): string {
  if (a.state !== "completed" || a.req.action !== ACTIONS.research) return "";
  if (shown.latest?.req.requestId === a.req.requestId) return "Shown now";
  if (shown.after.some((x) => x.req.requestId === a.req.requestId)) return "Shown now, on top of the page";
  if (shown.latest) return isPageJob(a.req) ? "Replaced by a newer page" : "Folded into a newer page";
  return "";
}

export function ActivityList({ items, error, loading, reload, shown }: ReturnType<typeof useActivity> & { shown: Pick<RecordModel, "latest" | "after"> }) {
  return (
    <section id="activity" className="tab" aria-labelledby="activity-title">
      <div className="section-head">
        <h1 id="activity-title" className="tab-title" tabIndex={-1}>Activity</h1>
        <button className="btn" onClick={() => void reload()} disabled={loading}>{loading ? "Reading chain…" : "Refresh"}</button>
      </div>
      {error && <p className="error">Unable to read the chain: {error}. Try Refresh.</p>}
      {items && items.length === 0 && !error && <div className="card"><p>No requests yet. Every paid request from this page appears here, newest first.</p></div>}
      {items === null && <div className="card"><p>Reading requests from Ethereum…</p></div>}
      {items && items.length > 0 && (
        <ul className="activity">
          {items.map((a) => {
            const st = standing(a, shown);
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
                {(a.state === "refused" || a.state === "failed") && (
                  <p className="why">
                    {a.state === "refused" ? "Refused" : "Failed"}: {a.refusal ? [a.refusal.reason, a.refusal.detail].filter(Boolean).join(": ") : a.completion?.reason || "no reason given yet"}
                  </p>
                )}
                {a.req.action === ACTIONS.oracle && <p className="small">{a.req.title || String(a.req.bodyJson?.question ?? "")}</p>}
                {isEditJob(a.req) && a.edit && (
                  <ul className="verdicts" aria-label="Each sentence and its verdict">
                    {a.edit.sentences.map((s, i) => (
                      <li key={i}>
                        <span className={`verdict verdict-${s.verdict}`}>{VERDICT_WORDS[s.verdict]}</span>
                        <span>{s.text}</span>
                        {s.corrected && s.corrected !== s.text && <span className="small">Corrected to: {s.corrected}</span>}
                        {s.why && <span className="small">{s.why}</span>}
                      </li>
                    ))}
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
                {isSourceJob(a.req) && a.sources && <p className="small">{a.sources.lines.length} line{a.sources.lines.length === 1 ? "" : "s"} added to the record</p>}
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
