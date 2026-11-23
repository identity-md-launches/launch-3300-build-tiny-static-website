/**
 * A wallet's profile (#/w/<address>): every request it made through this site, from the scan the site already runs.
 * Nothing is stored. The ENS name is read through the site's public RPC and shown only when the reverse record's name
 * resolves back to the same address. No avatars, no new hosts.
 */
import { useEffect, useMemo, useState } from "react";
import { formatUnits } from "viem";
import { ACTIONS, ETHERSCAN } from "./config";
import { jobLink } from "./format";
import { publicClient } from "./reads";
import { subjectHref } from "./route";
import { CopyIcon } from "./Record";
import { parsePrior } from "./bodies";
import { isChangesJob, isEditJob, isPageJob, isSourceJob, readable, type Activity, type ActivityState } from "./useActivity";

export const PROFILE_EMPTY = "This wallet has not made a request here yet.";

/** What a request was, in the profile's words. Panel checks are found by their wording (chain.ts matched them). */
export function profileKind(a: Activity): string {
  if (a.req.action.startsWith("oracle.")) return "panel check";
  if (isPageJob(a.req)) return parsePrior(a.req.bodyJson?.objective).files.length ? "rebuild" : "new page";
  if (isSourceJob(a.req)) return "sources";
  if (isChangesJob(a.req) || isEditJob(a.req)) return "changes";
  return a.req.kind || "request";
}

/** "3 kept, 1 not kept" for a completed changes job whose file was read. */
export function changesOutcome(a: Activity): string {
  const items = a.changes?.items ?? [];
  if (!items.length) return "";
  const kept = items.filter((i) => i.kept).length;
  return `${kept} kept, ${items.length - kept} not kept`;
}

const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

/** The reverse ENS name, only when it resolves forward to the same address. */
function useVerifiedEns(address: `0x${string}`): string | null {
  const [name, setName] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    setName(null);
    void (async () => {
      try {
        const n = await publicClient.getEnsName({ address });
        if (!n) return;
        const back = await publicClient.getEnsAddress({ name: n });
        if (alive && back && back.toLowerCase() === address.toLowerCase()) setName(n);
      } catch {
        /* no name shown */
      }
    })();
    return () => {
      alive = false;
    };
  }, [address]);
  return name;
}

export function Profile({ address, activity }: { address: string; activity: ActivityState }) {
  const addr = address.toLowerCase() as `0x${string}`;
  const ens = useVerifiedEns(addr);
  const mine = useMemo(() => (activity.items ?? []).filter((a) => a.req.payer.toLowerCase() === addr), [activity.items, addr]);
  // The subjects this wallet touched are read in full, so changes outcomes and refusals show.
  const subjects = useMemo(() => [...new Set(mine.map((a) => a.req.subject))].sort().join("|"), [mine]);
  // Read again whenever one of this wallet's requests changes state (a pending job completes on the next poll).
  const states = useMemo(() => mine.map((a) => `${a.req.requestId}:${a.state}`).sort().join("|"), [mine]);
  const [full, setFull] = useState<Map<string, Activity>>(new Map());
  const { readSubject } = activity;
  useEffect(() => {
    if (!subjects) return;
    let alive = true;
    void Promise.all(subjects.split("|").map((s) => readSubject(s).catch(() => [] as Activity[]))).then((lists) => {
      if (alive) setFull(new Map(lists.flat().map((a) => [a.req.requestId, a] as const)));
    });
    return () => {
      alive = false;
    };
  }, [subjects, states, readSubject]);
  // The scan's row gives the state; the full read gives the details (changes outcome) once it is of the same state.
  const rows = mine.map((a) => { const f = full.get(a.req.requestId); return f && f.state === a.state ? f : a; }).sort((x, y) => (x.req.blockNumber === y.req.blockNumber ? 0 : x.req.blockNumber > y.req.blockNumber ? -1 : 1));
  const counted = new Set(readable(rows).map((a) => a.req.requestId));
  // A result that is not read (not sent through this record's instructions) adds no page and no kept change.
  const kept = rows.reduce((n, a) => n + (counted.has(a.req.requestId) ? (a.changes?.items ?? []).filter((i) => i.kept).length : 0), 0);
  // What the wallet paid: the Intake takes the fee when the request is sent and returns nothing on a refusal (a
  // refused completion's receipt has no IMD transfer), so every request's amount counts, refused ones included.
  const spent = rows.reduce((n, a) => n + a.req.amount, 0n);
  const started = rows.filter((a) => profileKind(a) === "new page" && counted.has(a.req.requestId) && !a.notRead).length;

  useEffect(() => {
    document.title = `${ens ?? short(addr)} · On the record (test)`;
  }, [ens, addr]);

  return (
    <section className="tab profile" aria-labelledby="profile-title">
      <h1 id="profile-title" className="tab-title" tabIndex={-1}>
        {ens ?? <span className="mono">{short(addr)}</span>}
      </h1>
      <p className="profile-addr">
        <span className="mono" title={addr}>{short(addr)}</span>
        <CopyIcon value={addr} />
        <a href={`${ETHERSCAN}/address/${addr}`} target="_blank" rel="noopener noreferrer">
          Etherscan
        </a>
      </p>
      <dl className="totals" aria-label="Totals">
        <div>
          <dt>Requests</dt>
          <dd className="num">{rows.length}</dd>
        </div>
        <div>
          <dt>Pages started</dt>
          <dd className="num">{started}</dd>
        </div>
        <div>
          <dt>Changes kept</dt>
          <dd className="num">{kept}</dd>
        </div>
        <div>
          <dt>IMD spent</dt>
          <dd className="num">{Number(formatUnits(spent, 18)).toLocaleString("en-US", { maximumFractionDigits: 4 })}</dd>
        </div>
      </dl>
      {activity.items === null ? (
        <div className="card">
          <p>Reading requests from Ethereum…</p>
        </div>
      ) : rows.length === 0 ? (
        <div className="card empty">
          <p>{PROFILE_EMPTY}</p>
        </div>
      ) : (
        <ul className="activity">
          {rows.map((a) => {
            const outcome = isChangesJob(a.req) ? changesOutcome(a) : "";
            const state = a.state === "completed" ? "done" : a.state === "pending" ? "pending" : "refused";
            const why = a.state === "refused" || a.state === "failed" ? (a.refusal ? [a.refusal.reason, a.refusal.detail].filter(Boolean).join(": ") : a.completion?.reason || "no reason given yet") : "";
            return (
              <li key={a.req.requestId} className="card act">
                <div className="act-top">
                  <span className={`state state-${a.state}`}>{state}</span>
                  <span className="small">{a.time ? new Date(a.time).toLocaleDateString() : `block ${a.req.blockNumber}`}</span>
                </div>
                <p className="act-what">
                  {profileKind(a)} · <a href={subjectHref(a.req.subject)}>{a.req.subject}</a>
                </p>
                {why && <p className="why">Refused: {why}</p>}
                {outcome && <p className="small">{outcome}</p>}
                {a.state === "completed" && a.req.action === ACTIONS.research && !counted.has(a.req.requestId) && <p className="why rejected">{a.notRead}</p>}
                <p className="small">
                  {a.jobId && (
                    <>
                      <a href={jobLink(a.jobId, a.req.transactionHash)} target="_blank" rel="noopener noreferrer">
                        Job on the explorer
                      </a>
                      {" · "}
                    </>
                  )}
                  <a href={`${ETHERSCAN}/tx/${a.req.transactionHash}`} target="_blank" rel="noopener noreferrer">
                    Transaction
                  </a>
                </p>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
