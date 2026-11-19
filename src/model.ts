/**
 * What the site shows, derived from Activity: the newest completed page result, plus the sources and edit
 * results completed after it. Earlier ones are already folded into that page and are reachable from Activity.
 */
import { useEffect, useMemo, useState } from "react";
import { ACTIONS } from "./config";
import { artifactUrl, parsePrior, type Prior } from "./bodies";
import { completedBefore } from "./chain";
import { fetchArtifact, fetchResearchPage } from "./api";
import { jobLink, payerName } from "./format";
import {
  allSources,
  countKinds,
  lineIdsOf,
  mergeRecord,
  parsePage,
  safeHref,
  unaccounted,
  type EditResult,
  type Line,
  type ListedSource,
  type Page,
  type RecordRow,
  type SourceJob,
  type SummarySentence,
  type Unaccounted,
} from "./page";
import { isEditJob, isPageJob, isSourceJob, type Activity } from "./useActivity";

export interface Accounting {
  /** none: the shown page was not a rebuild from earlier files. */
  state: "none" | "loading" | "done" | "error";
  missing: Unaccounted[];
  files: number;
  error: string;
}

export interface RecordModel {
  latest: Activity | undefined;
  page: Page | null;
  pageHash: string | null;
  via: { jobId: string | null; path: string } | null;
  error: string | null;
  /** Ready once the chain was read and the page, if there is one, has loaded or failed. */
  ready: boolean;
  channels: { url: string; tie: "strong" | "weak" | "none" }[];
  main: string;
  /** Completed sources and edit jobs after the shown page, oldest first. */
  after: Activity[];
  jobs: SourceJob[];
  /** The newest accepted edit shown as the summary, if any. */
  edit: { activity: Activity; result: EditResult; key: string } | null;
  summary: SummarySentence[];
  /** Resolves a summary or infobox line id to the record line it names. */
  resolve: (id: string, scope?: string) => Line | undefined;
  prior: Prior;
  panel: Activity[];
  /** Panel answers A1... as the shown rebuild was given them. */
  answerRef: (target: string) => { text: string; activity: Activity | undefined } | null;
  accounting: Accounting;
  sections: { section: string; rows: RecordRow[] }[];
  sourceList: ListedSource[];
  counts: ReturnType<typeof countKinds>;
}

const completionOrder = (a: Activity, b: Activity) => completedBefore(a.completion!, b.completion!);

export function useRecordModel(items: Activity[] | null): RecordModel {
  const latest = useMemo(() => {
    const pages = (items ?? []).filter((a) => isPageJob(a.req) && a.state === "completed" && a.completion);
    return pages.sort(completionOrder).at(-1);
  }, [items]);
  const [page, setPage] = useState<Page | null>(null);
  const [pageHash, setPageHash] = useState<string | null>(null);
  const [via, setVia] = useState<{ jobId: string | null; path: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!latest?.completion) return;
    setError(null);
    fetchResearchPage(latest.req, latest.completion, latest.jobId)
      .then((p) => {
        setPage(parsePage(p.text));
        setPageHash(p.hash ?? null);
        setVia({ jobId: p.jobId, path: p.path });
      })
      .catch((e) => setError(e instanceof Error ? e.message : "The page could not be read"));
  }, [latest]);
  const ready = items !== null && (!latest || page !== null || error !== null);

  const after = useMemo(
    () =>
      (items ?? [])
        .filter((a) => (isSourceJob(a.req) || isEditJob(a.req)) && a.state === "completed" && a.completion)
        .filter((a) => !latest?.completion || completedBefore(latest.completion, a.completion!) < 0)
        .sort(completionOrder),
    [items, latest],
  );
  const jobs: SourceJob[] = useMemo(
    () => after.filter((a) => a.sources).map((a) => ({ key: a.req.requestId, data: a.sources!, payer: payerName(a), jobHref: jobLink(a.jobId, a.req.transactionHash) })),
    [after],
  );
  const edit = useMemo(() => {
    const e = [...after].reverse().find((a) => isEditJob(a.req) && a.edit && a.edit.accepted.length > 0);
    return e ? { activity: e, result: e.edit!, key: e.req.requestId } : null;
  }, [after]);

  const panel = useMemo(() => (items ?? []).filter((a) => a.req.action === ACTIONS.oracle && a.state === "completed" && a.completion).sort(completionOrder), [items]);
  const prior: Prior = useMemo(
    () => ({
      files: page && pageHash ? [artifactUrl(pageHash), ...after.filter((a) => a.fileHash).map((a) => artifactUrl(a.fileHash!))] : [],
      answers: panel
        .filter((a) => a.oracle?.answer)
        .map((a) => ({
          title: a.req.title || String(a.req.bodyJson?.question ?? "").slice(0, 120),
          answer: a.oracle!.answer!,
          agreed: a.oracle!.agreed,
          size: a.oracle!.panelSize,
          url: jobLink(a.jobId, a.req.transactionHash),
        })),
    }),
    [page, pageHash, after, panel],
  );

  const sections = useMemo(() => mergeRecord(page, jobs), [page, jobs]);
  const sourceList = useMemo(() => allSources(page, jobs), [page, jobs]);
  const counts = useMemo(() => countKinds(sections), [sections]);
  const byId = useMemo(() => new Map(sections.flatMap((s) => s.rows.map((r) => [r.line.id, r.line] as const))), [sections]);
  const summary = edit ? edit.result.accepted : page?.summary ?? [];
  const resolve = (id: string, scope: string | undefined = edit?.key) => byId.get(id) ?? (scope ? byId.get(`${scope}:${id}`) : undefined);

  const given = useMemo(() => parsePrior(latest?.req.bodyJson?.objective), [latest]);
  const answerRef = (target: string) => {
    const m = /^A(\d+)$/i.exec(target.trim());
    if (!m) return null;
    const a = given.answers.find((x) => x.n === Number(m[1]));
    if (!a) return null;
    const activity = panel.find((p) => a.url && (a.url === jobLink(p.jobId, p.req.transactionHash) || a.url.includes(p.req.transactionHash) || (!!p.jobId && a.url.includes(p.jobId))));
    return { text: a.text, activity };
  };

  const [accounting, setAccounting] = useState<Accounting>({ state: "none", missing: [], files: 0, error: "" });
  useEffect(() => {
    if (!page || !given.files.length) {
      setAccounting({ state: "none", missing: [], files: 0, error: "" });
      return;
    }
    let live = true;
    setAccounting({ state: "loading", missing: [], files: given.files.length, error: "" });
    Promise.all(
      given.files.map(async (f) => {
        if (!f.hash) throw new Error(`F${f.n} is not an artifact address`);
        return { n: f.n, lines: lineIdsOf(await fetchArtifact(f.hash)) };
      }),
    )
      .then((files) => live && setAccounting({ state: "done", missing: unaccounted(page, files), files: files.length, error: "" }))
      .catch((e) => live && setAccounting({ state: "error", missing: [], files: given.files.length, error: e instanceof Error ? e.message : "An earlier file could not be read" }));
    return () => {
      live = false;
    };
  }, [page, given]);

  const channels = (page?.channels ?? []).flatMap((c) => {
    const url = safeHref(c.url);
    return url ? [{ url, tie: c.tie }] : [];
  });
  return {
    latest,
    page,
    pageHash,
    via,
    error,
    ready,
    channels,
    main: page?.main ?? "",
    after,
    jobs,
    edit,
    summary,
    resolve,
    prior,
    panel,
    answerRef,
    accounting,
    sections,
    sourceList,
    counts,
  };
}
