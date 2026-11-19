/**
 * What the site shows for one subject, derived from Activity.
 *
 * The page shown is the subject's newest completed page result. An earlier result (page, sources or edit) is
 * folded into it ONLY when its artifact URL appears in the objective of the request that produced the page
 * shown, as read from that request's body in the Intake's Requested event. Time order alone never counts.
 * Record shows the lines of the page shown plus those of every completed sources and edit result not folded
 * in. <PRIOR> lists the page shown as F1, then every completed result of the subject not folded in, oldest first.
 */
import { useEffect, useMemo, useState } from "react";
import { ACTIONS } from "./config";
import { artifactUrl, MAX_OBJECTIVE, parsePrior, rebuildObjective, type Prior, type PriorAnswer } from "./bodies";
import { completedBefore } from "./chain";
import { fetchArtifact } from "./api";
import { jobLink, payerName } from "./format";
import {
  allSources,
  countKinds,
  droppedLines,
  lineIdsOf,
  mergeRecord,
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
import { chainIdOf, contractFromObjective, domainOfId, refFromId, type SubjectRef } from "./subject";
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

/** Whether every input of <PRIOR> was read: the chain, the page shown, each result not folded in and each panel answer. */
export interface Snapshot {
  ok: boolean;
  /** Why it is not complete yet, or "" when it is. */
  why: string;
  /** True while reads are still under way; false when one failed and Refresh is the way on. */
  loading: boolean;
}

const completionOrder = (a: Activity, b: Activity) => completedBefore(a.completion!, b.completion!);
const isResult = (a: Activity) => (isPageJob(a.req) || isSourceJob(a.req) || isEditJob(a.req)) && a.state === "completed" && !!a.completion && !a.rejected;
/** Completed jobs whose file says found: false, oldest first. */
export const rejectedOf = (items: Activity[]) =>
  items.filter((a) => a.rejected && a.state === "completed" && a.completion).sort(completionOrder);

/** True when this result's artifact URL appears in the objective of the request that produced the page shown. */
export function isFoldedInto(a: Activity, latest: Activity | undefined): boolean {
  if (!latest || !a.fileHash || a.req.requestId === latest.req.requestId) return false;
  const objective = latest.req.bodyJson?.objective;
  return typeof objective === "string" && objective.includes(artifactUrl(a.fileHash));
}

/** The pure part of the model, shared by a subject's page and the home list. */
export interface Core {
  latest: Activity | undefined;
  page: Page | null;
  /** Every completed page, sources and edit result other than the page shown, oldest first. */
  results: Activity[];
  /** Request ids of results folded into the page shown. */
  folded: Set<string>;
  /** Results not folded in (pages, sources, edits), oldest first. */
  unfolded: Activity[];
  /** Sources and edit results not folded in, oldest first: their lines join the record. */
  after: Activity[];
  jobs: SourceJob[];
  sections: { section: string; rows: RecordRow[] }[];
  counts: ReturnType<typeof countKinds>;
}

export function coreOf(items: Activity[]): Core {
  const done = items.filter(isResult).sort(completionOrder);
  const latest = done.filter((a) => isPageJob(a.req)).at(-1);
  const page = latest?.page ?? null;
  const results = done.filter((a) => a !== latest);
  const folded = new Set(results.filter((a) => isFoldedInto(a, latest)).map((a) => a.req.requestId));
  const unfolded = results.filter((a) => !folded.has(a.req.requestId));
  const after = unfolded.filter((a) => isSourceJob(a.req) || isEditJob(a.req));
  const jobs: SourceJob[] = after
    .filter((a) => a.sources)
    .map((a) => ({ key: a.req.requestId, data: a.sources!, payer: payerName(a), jobHref: jobLink(a.jobId, a.req.transactionHash) }));
  const sections = mergeRecord(page, jobs, page?.domain || domainOfId(items[0]?.req.subject ?? ""));
  return { latest, page, results, folded, unfolded, after, jobs, sections, counts: countKinds(sections) };
}

/**
 * The subject as it fills <SUBJECT>. A chain:address id names its contract. A domain id takes the contract a
 * visitor gave in an earlier request's objective, else the page's main contract when its chain is known.
 */
export function subjectRefFor(id: string, items: Activity[], page: Page | null): SubjectRef {
  const ref = refFromId(id);
  if (!ref.domain) return ref;
  for (const a of [...items].sort((x, y) => (x.req.blockNumber < y.req.blockNumber ? 1 : -1))) {
    const c = contractFromObjective(a.req.bodyJson?.objective, ref.domain);
    if (c) return { ...ref, address: c.address, chainId: c.chainId };
  }
  const main = page?.contracts.find((c) => c.main && /^0x[0-9a-fA-F]{40}$/.test(c.address));
  const chainId = main ? chainIdOf(main.chain) : null;
  return main && chainId !== null ? { ...ref, address: main.address, chainId } : ref;
}

/**
 * The files to mark "reconsider dropped lines": the artifact URLs of the files the page shown's dropped entries
 * came from ("F2:L14" names file F2 of the objective that produced the page shown), in file order, each once,
 * leaving out any URL already listed.
 */
export function reconsiderFiles(dropped: Pick<Dropped, "id">[], given: { n: number; url: string; hash: string }[], listed: string[] = []): string[] {
  const ns = new Set(dropped.flatMap((d) => {
    const m = /^F(\d+):/i.exec(d.id.trim());
    return m ? [Number(m[1])] : [];
  }));
  const out: string[] = [];
  for (const f of [...given].sort((a, b) => a.n - b.n))
    if (ns.has(f.n) && f.hash && !out.includes(f.url) && !listed.includes(f.url)) out.push(f.url);
  return out;
}

/**
 * Keeps <PRIOR> under 7,500 characters: F1 always, then the newest results that fit with no answers (oldest
 * dropped first), then the files to reconsider in the room left, then the newest panel answers that fit in the
 * room left. Neither answers nor files to reconsider ever push a result out. Returns which results made it in.
 */
export function fitPrior(
  page: string | null,
  results: { id: string; url: string }[],
  answers: PriorAnswer[],
  measure: (p: Prior) => number,
  reconsider: string[] = [],
): { prior: Prior; included: Set<string>; leftOut: number; answersLeftOut: number; reconsiderLeftOut: number } {
  // Files come first: F1, then the newest results that fit with no answers at all. Answers only take the room left.
  let rs = [...results];
  let rc: string[] = [];
  let as: PriorAnswer[] = [];
  const make = (): Prior => ({ files: [...(page ? [page] : []), ...rs.map((r) => r.url)], answers: as, ...(rc.length ? { reconsider: rc } : {}) });
  while (rs.length > 0 && measure(make()) >= MAX_OBJECTIVE) rs = rs.slice(1);
  const wanted = page ? reconsider.filter((u) => u !== page && !rs.some((r) => r.url === u)) : [];
  for (let k = wanted.length; k > 0; k--) {
    rc = wanted.slice(0, k);
    if (measure(make()) < MAX_OBJECTIVE) break;
    rc = [];
  }
  for (let k = answers.length; k > 0; k--) {
    as = answers.slice(answers.length - k);
    if (measure(make()) < MAX_OBJECTIVE) break;
    as = [];
  }
  return { prior: make(), included: new Set(rs.map((r) => r.id)), leftOut: results.length - rs.length, answersLeftOut: answers.length - as.length, reconsiderLeftOut: wanted.length - rc.length };
}

export type Standing = "shown" | "folded" | "next" | "left-out" | "";
export const STANDING_WORDS: Record<Exclude<Standing, "">, string> = {
  shown: "Shown now",
  folded: "Folded into the page shown",
  next: "Not yet folded in: included in the next rebuild",
  "left-out": "Not yet folded in: too many earlier files to fit in the next rebuild, which takes the newest",
};

export interface SubjectSummary {
  id: string;
  name: string;
  oneLine: string;
  counts: ReturnType<typeof countKinds>;
  /** When the record last changed: the newest completed result's time, else the newest request's. */
  changed: number | null;
  requests: number;
  pending: number;
  hasPage: boolean;
}

/**
 * One entry per subject found on chain, newest change first. A subject whose research came back found: false
 * and that has no page is not a project record, so it is not listed (its link still shows why).
 */
export function subjectSummaries(items: Activity[]): SubjectSummary[] {
  const by = new Map<string, Activity[]>();
  for (const a of items) by.set(a.req.subject, [...(by.get(a.req.subject) ?? []), a]);
  const projects = [...by].filter(([, list]) => !rejectedOf(list).length || !!coreOf(list).page);
  const out = projects.map(([id, list]): SubjectSummary => {
    const core = coreOf(list);
    const doneTimes = list.filter((a) => a.state === "completed").map((a) => a.doneTime ?? a.time ?? 0);
    const anyTimes = list.map((a) => a.time ?? 0);
    const changed = Math.max(0, ...(doneTimes.length ? doneTimes : anyTimes)) || null;
    return {
      id,
      name: core.page?.name || id,
      oneLine: core.page?.oneLine ?? "",
      counts: core.counts,
      changed,
      requests: list.length,
      pending: list.filter((a) => a.state === "pending").length,
      hasPage: !!core.page,
    };
  });
  return out.sort((a, b) => (b.changed ?? 0) - (a.changed ?? 0) || a.id.localeCompare(b.id));
}

export interface RecordModel {
  subject: SubjectRef;
  latest: Activity | undefined;
  /** The newest completed job whose file said found: false, with its notes; shown on Overview when there is no page. */
  rejected: Activity | undefined;
  page: Page | null;
  pageHash: string | null;
  via: { jobId: string | null; path: string } | null;
  error: string | null;
  /** Ready once the chain was read and the page, if there is one, has loaded or failed. */
  ready: boolean;
  channels: { url: string; tie: "strong" | "weak" | "none" }[];
  main: string;
  /** Completed sources and edit results not folded in, oldest first. */
  after: Activity[];
  jobs: SourceJob[];
  /** The newest accepted edit shown as the summary, if any. */
  edit: { activity: Activity; result: EditResult; key: string } | null;
  summary: ShownSentence[];
  /** Resolves a page line id (infobox, links) to the record line it names. */
  resolve: (id: string) => Line | undefined;
  /** The record lines an edit's verdict or accepted sentence cites, resolved in the scope that supplied them. */
  editRefs: (a: Activity, ids: string[], verdict: Verdict | null) => Line[];
  /** Shown now, folded in, or not yet folded in, for a completed result. */
  standing: (a: Activity) => Standing;
  snapshot: Snapshot;
  prior: Prior;
  /** How many results not folded in were left out of <PRIOR> to stay under 7,500 characters, and panel answers. */
  leftOut: number;
  answersLeftOut: number;
  /** Files to reconsider that did not fit in <PRIOR>. */
  reconsiderLeftOut: number;
  panel: Activity[];
  /** Panel answers A1... as the shown rebuild was given them. */
  answerRef: (target: string) => { text: string; activity: Activity | undefined } | null;
  accounting: Accounting;
  sections: { section: string; rows: RecordRow[] }[];
  sourceList: ListedSource[];
  counts: ReturnType<typeof countKinds>;
}

/** The model for one subject. `items` are that subject's requests only. */
export function useRecordModel(items: Activity[] | null, chainError: string | null, subjectId: string): RecordModel {
  const core = useMemo(() => coreOf(items ?? []), [items]);
  const { latest, page, unfolded, after, jobs, sections, counts } = core;
  const pageHash = latest?.fileHash ?? null;
  const via = latest?.via ?? null;
  const error = latest && !page ? latest.sourcesError ?? "The page could not be read" : null;
  const ready = items !== null;
  const subject = useMemo(() => subjectRefFor(subjectId, items ?? [], page), [subjectId, items, page]);

  const edit = useMemo(() => {
    const e = [...after].reverse().find((a) => isEditJob(a.req) && a.edit && a.edit.accepted.length > 0);
    return e ? { activity: e, result: e.edit!, key: e.req.requestId } : null;
  }, [after]);

  const panel = useMemo(() => (items ?? []).filter((a) => a.req.action === ACTIONS.oracle && a.state === "completed" && a.completion).sort(completionOrder), [items]);
  const given = useMemo(() => parsePrior(latest?.req.bodyJson?.objective), [latest]);
  const fit = useMemo(() => {
    const results = unfolded.filter((a) => a.fileHash).map((a) => ({ id: a.req.requestId, url: artifactUrl(a.fileHash!) }));
    const again = reconsiderFiles(page?.dropped ?? [], given.files);
    return fitPrior(page && pageHash ? artifactUrl(pageHash) : null, results, answersOf(items ?? []), (p) => rebuildObjective(p, subject).length, again);
  }, [items, unfolded, page, pageHash, subject, given]);

  const sourceList = useMemo(() => allSources(page, jobs), [page, jobs]);
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

  const standing = (a: Activity): Standing => {
    if (!isResult(a)) return "";
    if (latest?.req.requestId === a.req.requestId) return "shown";
    if (core.folded.has(a.req.requestId)) return "folded";
    return fit.included.has(a.req.requestId) || !a.fileHash ? "next" : "left-out";
  };

  // <PRIOR> is complete only after a good chain read, the page shown (with its address), every result not
  // folded in and every panel answer have been read. "none" is reserved for a good read that finds nothing.
  const snapshot: Snapshot = (() => {
    if (items === null) return { ok: false, why: "Reading the record from Ethereum…", loading: true };
    if (chainError) return { ok: false, why: `Unable to read the chain: ${chainError}`, loading: false };
    if (latest) {
      if (error) return { ok: false, why: `Unable to read the page shown: ${error}`, loading: false };
      if (!pageHash) return { ok: false, why: "The page shown has no artifact address to give the job.", loading: false };
    }
    const unread = unfolded.find((a) => !a.fileHash);
    if (unread) return { ok: false, why: `Unable to read an earlier result${unread.sourcesError ? `: ${unread.sourcesError}` : ""}`, loading: false };
    if (panel.some((a) => !a.oracle)) return { ok: false, why: "Unable to read a panel answer.", loading: false };
    return { ok: true, why: "", loading: false };
  })();

  const channels = (page?.channels ?? []).flatMap((c) => {
    const url = safeHref(c.url);
    return url ? [{ url, tie: c.tie }] : [];
  });
  return {
    subject,
    latest,
    rejected: rejectedOf(items ?? []).at(-1),
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
    standing,
    snapshot,
    prior: fit.prior,
    leftOut: fit.leftOut,
    answersLeftOut: fit.answersLeftOut,
    reconsiderLeftOut: fit.reconsiderLeftOut,
    panel,
    answerRef,
    accounting,
    sections,
    sourceList,
    counts,
  };
}

/** The answers of a subject's completed panel requests, as <PRIOR> lists them (A1…). */
export function answersOf(items: Activity[]): PriorAnswer[] {
  return items
    .filter((a) => a.req.action === ACTIONS.oracle && a.state === "completed" && a.completion && a.oracle?.answer)
    .sort(completionOrder)
    .map((a) => ({
      title: a.req.title || String(a.req.bodyJson?.question ?? "").slice(0, 120),
      answer: a.oracle!.answer!,
      agreed: a.oracle!.agreed,
      size: a.oracle!.panelSize,
      url: jobLink(a.jobId, a.req.transactionHash),
    }));
}

/**
 * The <PRIOR> a rebuild of this subject is given, outside the hook (the home form uses it). ok is false while a
 * result it would list could not be read.
 */
export function planRebuild(items: Activity[], subject: SubjectRef) {
  const core = coreOf(items);
  const pageHash = core.latest?.fileHash ?? null;
  const unread = core.unfolded.some((a) => !a.fileHash) || (!!core.latest && (!core.page || !pageHash));
  const results = core.unfolded.filter((a) => a.fileHash).map((a) => ({ id: a.req.requestId, url: artifactUrl(a.fileHash!) }));
  const again = reconsiderFiles(core.page?.dropped ?? [], parsePrior(core.latest?.req.bodyJson?.objective).files);
  const fit = fitPrior(core.page && pageHash ? artifactUrl(pageHash) : null, results, answersOf(items), (p) => rebuildObjective(p, subject).length, again);
  return { ...fit, ok: !unread, hasPage: !!core.page };
}
