/**
 * What the site shows, derived from Activity: the newest completed page result, plus the sources and edit
 * results completed after it. Earlier ones are reachable from Activity; they count as folded into the page
 * only when that rebuild was given them and its accounting covers every one of their lines.
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
  droppedLines,
  lineIdsOf,
  mergeRecord,
  parsePage,
  safeHref,
  unaccounted,
  type EditResult,
  type Line,
  type Dropped,
  type ListedSource,
  type Page,
  type PriorLines,
  type RecordRow,
  type SourceJob,
  type SummarySentence,
  type Unaccounted,
  type Verdict,
} from "./page";
import { isEditJob, isPageJob, isSourceJob, type Activity } from "./useActivity";

export interface Accounting {
  /** none: the shown page was not a rebuild from earlier files. */
  state: "none" | "loading" | "done" | "error";
  missing: Unaccounted[];
  files: number;
  error: string;
  /** The dropped list, with each earlier line's text once the earlier files are read. */
  dropped: (Dropped & { ref: string; text: string })[];
}

/** A summary sentence with the record lines its references name, each resolved in its own scope. */
export interface ShownSentence extends SummarySentence {
  refs: Line[];
}

/** Whether every input of <PRIOR> was read: the chain, the page shown, each later result and each panel answer. */
export interface Snapshot {
  ok: boolean;
  /** Why it is not complete yet, or "" when it is. */
  why: string;
  /** True while reads are still under way; false when one failed and Refresh is the way on. */
  loading: boolean;
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
  summary: ShownSentence[];
  /** Resolves a page line id (infobox, links) to the record line it names. */
  resolve: (id: string) => Line | undefined;
  /** The record lines an edit's verdict or accepted sentence cites, resolved in the scope that supplied them. */
  editRefs: (a: Activity, ids: string[], verdict: Verdict | null) => Line[];
  /** Request ids of earlier sources or edit results the shown rebuild was given and fully accounted for. */
  foldedIn: Set<string>;
  snapshot: Snapshot;
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

export function useRecordModel(items: Activity[] | null, chainError: string | null = null): RecordModel {
  const latest = useMemo(() => {
    const pages = (items ?? []).filter((a) => isPageJob(a.req) && a.state === "completed" && a.completion);
    return pages.sort(completionOrder).at(-1);
  }, [items]);
  const [page, setPage] = useState<Page | null>(null);
  const [pageHash, setPageHash] = useState<string | null>(null);
  const [via, setVia] = useState<{ jobId: string | null; path: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadedFor, setLoadedFor] = useState<string | null>(null);
  useEffect(() => {
    if (!latest?.completion) return;
    setError(null);
    const key = latest.req.requestId;
    fetchResearchPage(latest.req, latest.completion, latest.jobId)
      .then((p) => {
        setPage(parsePage(p.text));
        setPageHash(p.hash ?? null);
        setVia({ jobId: p.jobId, path: p.path });
        setLoadedFor(key);
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
  // Page lines keep their own ids; lines of a sources or edit job are "<request id>:<id>" (see mergeRecord).
  const resolve = (id: string) => byId.get(id.trim());

  /**
   * An edit's references, each in its own scope. "F2:L14" is line L14 of file F2 of the record the edit was
   * given. A bare id is the edit's own new line when the verdict is supported_by_source (or the edit wrote
   * that id and no verdict says otherwise), and a line of the page shown for a supported verdict.
   */
  const editRefs = (a: Activity, ids: string[], verdict: Verdict | null): Line[] => {
    const key = a.req.requestId;
    const own = new Set((a.edit?.data.lines ?? []).map((l) => l.id));
    const files = parsePrior(a.req.bodyJson?.objective).files;
    const inFile = (n: number, id: string): Line | undefined => {
      const f = files.find((x) => x.n === n);
      if (!f?.hash) return undefined;
      if (f.hash === pageHash) return byId.get(id);
      const job = after.find((x) => x.fileHash === f.hash);
      return job ? byId.get(`${job.req.requestId}:${id}`) : undefined;
    };
    return ids.flatMap((raw) => {
      const id = raw.trim();
      const q = /^F(\d+):(.+)$/i.exec(id);
      let line: Line | undefined;
      if (q) line = inFile(Number(q[1]), q[2]!);
      else if (verdict === "supported_by_source" || (verdict === null && own.has(id))) line = own.has(id) ? byId.get(`${key}:${id}`) : undefined;
      // supported: existing lines only. With no such line shown, no dot rather than the edit's own line.
      else line = byId.get(id);
      return line ? [line] : [];
    });
  };
  const summary: ShownSentence[] = edit
    ? edit.result.accepted.map((s) => {
        const v = edit.result.sentences.find((x) => (x.corrected || x.text).trim() === s.text.trim() || x.text.trim() === s.text.trim());
        return { ...s, refs: editRefs(edit.activity, s.lines, v ? v.verdict : null) };
      })
    : (page?.summary ?? []).map((s) => ({ ...s, refs: s.lines.flatMap((id) => (byId.has(id.trim()) ? [byId.get(id.trim())!] : [])) }));

  const given = useMemo(() => parsePrior(latest?.req.bodyJson?.objective), [latest]);
  const answerRef = (target: string) => {
    const m = /^A(\d+)$/i.exec(target.trim());
    if (!m) return null;
    const a = given.answers.find((x) => x.n === Number(m[1]));
    if (!a) return null;
    const activity = panel.find((p) => a.url && (a.url === jobLink(p.jobId, p.req.transactionHash) || a.url.includes(p.req.transactionHash) || (!!p.jobId && a.url.includes(p.jobId))));
    return { text: a.text, activity };
  };

  const [accounting, setAccounting] = useState<Accounting>({ state: "none", missing: [], files: 0, error: "", dropped: [] });
  useEffect(() => {
    const bare = (page?.dropped ?? []).map((d) => ({ ...d, ref: d.id, text: "" }));
    if (!page || !given.files.length) {
      setAccounting({ state: "none", missing: [], files: 0, error: "", dropped: bare });
      return;
    }
    let live = true;
    setAccounting({ state: "loading", missing: [], files: given.files.length, error: "", dropped: bare });
    Promise.all(
      given.files.map(async (f): Promise<PriorLines> => {
        if (!f.hash) throw new Error(`F${f.n} is not an artifact address`);
        return { n: f.n, lines: lineIdsOf(await fetchArtifact(f.hash)) };
      }),
    )
      .then((files) => live && setAccounting({ state: "done", missing: unaccounted(page, files), files: files.length, error: "", dropped: droppedLines(page, files) }))
      .catch((e) => live && setAccounting({ state: "error", missing: [], files: given.files.length, error: e instanceof Error ? e.message : "An earlier file could not be read", dropped: bare }));
    return () => {
      live = false;
    };
  }, [page, given]);

  // Earlier results the shown rebuild was given (as Fn) and whose every line it carried or dropped.
  const foldedIn = useMemo(() => {
    const out = new Set<string>();
    if (accounting.state !== "done") return out;
    for (const f of given.files) {
      const a = (items ?? []).find((x) => x.fileHash && x.fileHash === f.hash && (isSourceJob(x.req) || isEditJob(x.req)));
      if (a && !accounting.missing.some((u) => u.n === f.n)) out.add(a.req.requestId);
    }
    return out;
  }, [accounting, given, items]);

  // <PRIOR> is complete only after a good chain read, the page shown (with its address), every later result
  // and every panel answer have been read. "none" is reserved for a good read that finds no page.
  const snapshot: Snapshot = (() => {
    if (items === null) return { ok: false, why: "Reading the record from Ethereum…", loading: true };
    if (chainError) return { ok: false, why: `Unable to read the chain: ${chainError}`, loading: false };
    if (latest) {
      if (error) return { ok: false, why: `Unable to read the page shown: ${error}`, loading: false };
      if (!page || loadedFor !== latest.req.requestId) return { ok: false, why: "Downloading the page shown…", loading: true };
      if (!pageHash) return { ok: false, why: "The page shown has no artifact address to give the job.", loading: false };
    }
    const unread = after.find((a) => !a.fileHash);
    if (unread) return { ok: false, why: `Unable to read a later result${unread.sourcesError ? `: ${unread.sourcesError}` : ""}`, loading: false };
    if (panel.some((a) => !a.oracle)) return { ok: false, why: "Unable to read a panel answer.", loading: false };
    return { ok: true, why: "", loading: false };
  })();

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
    editRefs,
    foldedIn,
    snapshot,
    prior,
    panel,
    answerRef,
    accounting,
    sections,
    sourceList,
    counts,
  };
}
