/**
 * #/contributors: the people who added to Swarmpedia pages, ranked by notes added. Computed in the browser from
 * counted changes jobs (src/contributors.ts); no wallet needed to view. Each subject with a changes job is read in
 * full once, as a wallet's profile reads its subjects, so every result's verdicts are known.
 */
import { useEffect, useMemo, useState } from "react";
import { changesSubjects, contributorsOf, CONTRIBUTORS_LINE, CONTRIBUTORS_TITLE } from "./contributorStats";
import { ContributorTable } from "./Record";
import { SITE_NAME } from "./config";
import { readable, type Activity, type ActivityState } from "./useActivity";

export function Contributors({ activity }: { activity: ActivityState }) {
  const counted = useMemo(() => (activity.items ? readable(activity.items) : null), [activity.items]);
  const subjects = useMemo(() => (counted ? changesSubjects(counted).join("|") : ""), [counted]);
  const states = useMemo(() => (counted ?? []).map((a) => `${a.req.requestId}:${a.state}`).sort().join("|"), [counted]);
  const [full, setFull] = useState<Activity[] | null>(null);
  const { readSubject } = activity;
  useEffect(() => {
    document.title = `${CONTRIBUTORS_TITLE} · ${SITE_NAME}`;
  }, []);
  useEffect(() => {
    if (counted === null) return;
    if (!subjects) return setFull([]);
    let alive = true;
    void Promise.all(subjects.split("|").map((s) => readSubject(s).catch(() => [] as Activity[]))).then((lists) => {
      if (alive) setFull(readable(lists.flat()));
    });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subjects, states, readSubject]);
  const rows = useMemo(() => (full ? contributorsOf(full) : []), [full]);
  return (
    <section className="tab contributors" aria-labelledby="contributors-title">
      <h1 id="contributors-title" className="tab-title" tabIndex={-1}>{CONTRIBUTORS_TITLE}</h1>
      <p className="lead">{CONTRIBUTORS_LINE}</p>
      {full === null ? (
        <div className="card"><p role="status">{counted === null ? "Reading requests from Ethereum…" : "Reading the changes results…"}</p></div>
      ) : rows.length ? (
        <ContributorTable rows={rows} labelledBy="contributors-title" ranked />
      ) : (
        <div className="card empty"><p>No counted changes yet.</p></div>
      )}
      <p className="small">Ranked by notes added. A name is the ENS name a wallet set for itself, else its address. Each counted changes job counts once.</p>
    </section>
  );
}
