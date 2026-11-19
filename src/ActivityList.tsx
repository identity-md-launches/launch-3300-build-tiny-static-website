/** Every paid request of this site, newest first, with its state, refusal reason, panel answer or source outcomes. */
import { ACTIONS } from "./config";
import { jobLink, kindName, payerName } from "./format";
import { outcomeOf, outcomeText } from "./page";
import { isSourceJob, type useActivity } from "./useActivity";

export function ActivityList({ items, error, loading, reload }: ReturnType<typeof useActivity>) {
  return (
    <section id="activity" aria-labelledby="activity-title">
      <div className="section-head">
        <h2 id="activity-title" className="section-title">Activity</h2>
        <button className="btn" onClick={() => void reload()} disabled={loading}>{loading ? "Reading chain…" : "Refresh"}</button>
      </div>
      {error && <p className="error">Unable to read the chain: {error}. Try Refresh.</p>}
      {items && items.length === 0 && !error && <div className="card"><p>No requests yet. Every paid request from this page appears here, newest first.</p></div>}
      {items === null && <div className="card"><p>Reading requests from Ethereum…</p></div>}
      {items && items.length > 0 && (
        <ul className="activity">
          {items.map((a) => (
            <li key={a.req.requestId} className="card act">
              <div className="act-top">
                <span className={`state state-${a.state}`}>{a.state}</span>
                <span className="small">{a.time ? new Date(a.time).toLocaleString() : `block ${a.req.blockNumber}`}</span>
              </div>
              <p className="act-what">
                {a.req.action === ACTIONS.research ? (isSourceJob(a.req) ? "Sources" : "Research") : `Question · ${kindName(a.req.kind)}`}
                {a.req.action === ACTIONS.oracle && a.state === "completed" && a.oracle ? ` · answer: ${a.oracle.answer ?? "none"} (panel, ${a.oracle.agreed ?? "?"} of ${a.oracle.panelSize ?? "?"} agreed)` : ""}
              </p>
              {(a.state === "refused" || a.state === "failed") && (
                <p className="why">
                  {a.state === "refused" ? "Refused" : "Failed"}: {a.refusal ? [a.refusal.reason, a.refusal.detail].filter(Boolean).join(": ") : a.completion?.reason || "no reason given yet"}
                </p>
              )}
              {a.req.action === ACTIONS.oracle && <p className="small">{a.req.title || String(a.req.bodyJson?.question ?? "")}</p>}
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
              {a.sourcesError && <p className="error">Unable to read the lines: {a.sourcesError}</p>}
              <p className="small">
                Paid by <span className="mono">{payerName(a)}</span> ·{" "}
                <a href={jobLink(a.jobId, a.req.transactionHash)} target="_blank" rel="noopener noreferrer">
                  {a.jobId ? "Open on explorer.imd.fun" : "Open the transaction"}
                </a>
              </p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
