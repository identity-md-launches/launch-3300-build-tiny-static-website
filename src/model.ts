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
import { artifactUrl, fitsObjective, matchesTemplate, parsePrior, rebuildObjective, type ChannelTie, type Prior, type PriorAnswer } from "./bodies";
import { completedBefore } from "./chain";
import { fetchArtifact } from "./api";
import { jobLink, payerName } from "./format";
import {
  allSources,
  candidateFiles,
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
import { isChangesJob, isEditJob, isPageJob, isSourceJob, type Activity } from "./useActivity";
import { applyChangeLinks, applyRewords, carriedOf, lineInFile, type LineScope, type Reworded } from "./changeResult";
import type { KnownContract } from "./lookup";

export interface Accounting {
  /** none: the shown page was not a rebuild from earlier files. */
  state: "none" | "loading" | "done" | "error";
  missing: Unaccounted[];
  files: number;
  error: string;
  /** The dropped list, with each earlier line's text once the earlier files are read. */
  dropped: (Dropped & { ref: string; text: string })[];
  /** The earlier files' line ids, once read: they resolve bare dropped ids for the files to reconsider. */
  read: PriorLines[];
}

/** A summary sentence with the record lines its references name, each resolved in its own scope. */
export interface ShownSentence extends SummarySentence {
  refs: Line[];
  /** Set when a kept reword from a changes job replaced this sentence. */
  rewordedBy?: string;
  original?: string;
}

/**
 * A kept rewording rests on the lines its own verdict lists (items[].lines), resolved in that job's scope; no
 * dots when it lists none. Other sentences keep their refs.
 */
/**
 * Line `id` of file F<n> of a job's <PRIOR>, as the record shows it now: in the page shown, in a job not folded in,
 * or the line a rebuild carried it into through its from origins (its id may have changed).
 */
export function lineOfFileRef(files: { n: number; hash: string | null }[], n: number, id: string, scope: LineScope, byId: Map<string, Line>): Line | undefined {
  const f = files.find((x) => x.n === n);
  if (!f?.hash) return undefined;
  const found = lineInFile(f.hash, id, scope, (x) => byId.has(x));
  return found ? byId.get(found) : undefined;
}

export function withRewordRefs(summary: Reworded<ShownSentence>[], refsOf: (a: Activity, ids: string[]) => Line[]): ShownSentence[] {
  return summary.map(({ rewordLines, rewordJob, ...s }) => (rewordJob ? { ...s, refs: refsOf(rewordJob, rewordLines ?? []) } : s));
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
const isResult = (a: Activity) => (isPageJob(a.req) || isSourceJob(a.req) || isEditJob(a.req) || isChangesJob(a.req)) && a.state === "completed" && !!a.completion && !a.rejected;
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
  /** Completed panel answers the request that produced the page shown did not list in its <PRIOR>. */
  unfoldedAnswers: Activity[];
  /** Sources and edit results not folded in, oldest first: their lines join the record. */
  after: Activity[];
  jobs: SourceJob[];
  /** Where a line of the page, a job or an earlier file is shown now (see changeResult.ts). */
  scope: LineScope;
  sections: { section: string; rows: RecordRow[] }[];
  counts: ReturnType<typeof countKinds>;
  /** Dropped entries of earlier pages whose files a rebuild was not given for space: owed to the next rebuild. */
  carried: CarriedDrop[];
}

export function coreOf(items: Activity[]): Core {
  const done = items.filter(isResult).sort(completionOrder);
  const latest = done.filter((a) => isPageJob(a.req)).at(-1);
  const page = latest?.page ?? null;
  const results = done.filter((a) => a !== latest);
  const folded = new Set(results.filter((a) => isFoldedInto(a, latest)).map((a) => a.req.requestId));
  const unfolded = results.filter((a) => !folded.has(a.req.requestId));
  const after = unfolded.filter((a) => isSourceJob(a.req) || isEditJob(a.req) || isChangesJob(a.req));
  const jobs: SourceJob[] = after
    .filter((a) => a.sources)
    .map((a) => ({ key: a.req.requestId, data: a.sources!, payer: payerName(a), jobHref: jobLink(a.jobId, a.req.transactionHash), raised: isChangesJob(a.req) }));
  // A changes result's new lines point at the line they are about; the target row shows what each does to it,
  // also when a rebuild has since carried that line forward under another id.
  const scope: LineScope = { pageHash: latest?.fileHash ?? null, after, carried: carriedOf(page, latest?.req.bodyJson?.objective) };
  const sections = applyChangeLinks(mergeRecord(page, jobs, page?.domain || domainOfId(items[0]?.req.subject ?? "")), scope);
  const carried = carriedDrops(done.filter((a) => isPageJob(a.req) && a.page));
  return { latest, page, results, folded, unfolded, unfoldedAnswers: unfoldedAnswersOf(items, latest), after, jobs, scope, sections, counts: countKinds(sections), carried };
}

/** A completed panel request with an answer: one of the A1… a rebuild is given. */
export const isAnswer = (a: Activity) => a.req.action === ACTIONS.oracle && a.state === "completed" && !!a.completion && !!a.oracle?.answer;

/**
 * The usable panel answers the request that produced the page shown did not list in its <PRIOR>, matched by
 * request identity (the answer's job link, transaction or job id in the listed URL). They are results still to fold
 * in: the next rebuild lists them.
 */
export function unfoldedAnswersOf(items: Activity[], latest: Activity | undefined): Activity[] {
  if (!latest) return [];
  const given = parsePrior(latest.req.bodyJson?.objective).answers;
  const listed = (a: Activity) =>
    given.some((g) => !!g.url && (g.url === jobLink(a.jobId, a.req.transactionHash) || g.url.includes(a.req.transactionHash) || (!!a.jobId && g.url.includes(a.jobId))));
  return items.filter((a) => isAnswer(a) && !listed(a));
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
 * The file numbers the page shown's dropped entries came from. "F2:L14" names file F2 of the objective that
 * produced the page shown. A bare "L14" (an older form) names every earlier file that has that id (all of them
 * when the origin is ambiguous), which needs those files read. Without them, bare ids are reported as
 * unresolved so a rebuild waits for the reads rather than leaving their file out.
 */
export function droppedFileNumbers(dropped: Pick<Dropped, "id">[], files?: PriorLines[]): { ns: Set<number>; unresolved: number } {
  const ns = new Set<number>();
  let unresolved = 0;
  for (const d of dropped) {
    const m = /^F(\d+):/i.exec(d.id.trim());
    if (m) ns.add(Number(m[1]));
    else if (!files) unresolved++;
    // Every file that has the id: when two earlier files share it, both are reconsidered rather than neither.
    else for (const n of candidateFiles(d.id, files)) ns.add(n);
  }
  return { ns, unresolved };
}

/** True when the page shown's dropped list has a bare id, whose file only the earlier files' reads can tell. */
export const hasBareDropped = (dropped: Pick<Dropped, "id">[]) => droppedFileNumbers(dropped).unresolved > 0;

/**
 * The files to mark "reconsider dropped lines": the artifact URLs of the files the page shown's dropped entries
 * came from, in file order, each once, leaving out any URL already listed. Pass the earlier files' lines to
 * resolve bare ids.
 */
export function reconsiderFiles(
  dropped: Pick<Dropped, "id">[],
  given: { n: number; url: string; hash: string }[],
  listed: string[] = [],
  files?: PriorLines[],
): string[] {
  const { ns } = droppedFileNumbers(dropped, files);
  const out: string[] = [];
  for (const f of [...given].sort((a, b) => a.n - b.n))
    if (ns.has(f.n) && f.hash && !out.includes(f.url) && !listed.includes(f.url)) out.push(f.url);
  return out;
}

/**
 * Fills <PRIOR> with as much as fits in the 7,900-character objective, in this order: the page shown (F1, always);
 * the results not folded in, newest first; then the files marked reconsider (the files the dropped lines came
 * from), then the newest panel answers in the room left. A rebuild is always offered: whatever does not fit is left
 * out and counted, so Contribute can say so, and stays "Not yet folded in" (or listed as dropped) for the next one.
 * Files are listed in time order: F1, the included results oldest first, then the marked files.
 */
export function fitPrior(
  page: string | null,
  results: { id: string; url: string }[],
  answers: PriorAnswer[],
  measure: (p: Prior) => number,
  reconsider: string[] = [],
): { prior: Prior; included: Set<string>; leftOut: number; answersLeftOut: number; reconsiderLeftOut: number } {
  const wanted = page ? reconsider.filter((u, i) => u !== page && reconsider.indexOf(u) === i) : [];
  // A result that is also a file to reconsider is listed once, as a result, marked.
  const rs = results.filter((r) => r.url !== page);
  const inRs = new Set<string>();
  const inRc = new Set<string>();
  let as: PriorAnswer[] = [];
  const make = (): Prior => {
    const plain = rs.filter((r) => inRs.has(r.id) && !wanted.includes(r.url)).map((r) => r.url);
    const marked = [...rs.filter((r) => inRs.has(r.id) && wanted.includes(r.url)).map((r) => r.url), ...wanted.filter((u) => inRc.has(u))];
    const files = [...(page ? [page] : []), ...plain];
    return { files, answers: as, ...(marked.length ? { reconsider: marked.filter((u, i) => marked.indexOf(u) === i) } : {}) };
  };
  const fits = () => fitsObjective(measure(make()));
  for (const r of [...rs].reverse()) {
    inRs.add(r.id);
    if (!fits()) inRs.delete(r.id);
  }
  const listedUrls = new Set(rs.filter((r) => inRs.has(r.id)).map((r) => r.url));
  for (const u of wanted) {
    if (listedUrls.has(u) || rs.some((r) => r.url === u)) continue;
    inRc.add(u);
    if (!fits()) inRc.delete(u);
  }
  for (let k = answers.length; k > 0; k--) {
    as = answers.slice(answers.length - k);
    if (fits()) break;
    as = [];
  }
  const prior = make();
  const given = new Set([...prior.files, ...(prior.reconsider ?? [])]);
  return {
    prior,
    included: new Set(inRs),
    leftOut: rs.length - inRs.size,
    answersLeftOut: answers.length - as.length,
    reconsiderLeftOut: wanted.filter((u) => !given.has(u)).length,
  };
}

/**
 * A dropped entry of an earlier page whose file a later rebuild was not given (left out for space). It is still
 * listed as dropped, and its file is reconsidered by the next rebuild.
 */
export interface CarriedDrop {
  url: string;
  id: string;
  why: string;
}

/**
 * Walks the completed pages, oldest first. The dropped entries of each page that name their file (F2:L14) are owed a
 * reconsideration by the next rebuild; one whose file that rebuild's <PRIOR> does not list is carried on until a
 * rebuild lists it. Returns what is still owed after the page shown. Bare ids are resolved only for the page shown.
 */
export function carriedDrops(pages: Activity[]): CarriedDrop[] {
  let carry: CarriedDrop[] = [];
  for (let k = 1; k < pages.length; k++) {
    const prev = pages[k - 1]!;
    const listed = new Set(parsePrior(pages[k]!.req.bodyJson?.objective).files.map((f) => f.url));
    const prevGiven = parsePrior(prev.req.bodyJson?.objective).files;
    const owed = (prev.page?.dropped ?? []).flatMap((d) => {
      const m = /^F(\d+):(.+)$/i.exec(d.id.trim());
      const f = m ? prevGiven.find((g) => g.n === Number(m[1])) : undefined;
      return f && f.hash ? [{ url: f.url, id: m![2]!, why: d.why }] : [];
    });
    carry = [...carry, ...owed].filter((c, i, all) => !listed.has(c.url) && all.findIndex((x) => x.url === c.url && x.id === c.id) === i);
  }
  return carry;
}

/** What did not fit in the next rebuild's objective, said on Contribute. Empty when everything fits. */
export function leftOutText(r: { leftOut: number; answersLeftOut: number; reconsiderLeftOut: number }): string[] {
  const out: string[] = [];
  if (r.leftOut > 0) out.push(`${r.leftOut} older result${r.leftOut === 1 ? "" : "s"}: ${r.leftOut === 1 ? "it stays" : "they stay"} “Not yet folded in”, and a later rebuild picks ${r.leftOut === 1 ? "it" : "them"} up.`);
  if (r.reconsiderLeftOut > 0)
    out.push(`${r.reconsiderLeftOut} file${r.reconsiderLeftOut === 1 ? "" : "s"} to reconsider: ${r.reconsiderLeftOut === 1 ? "its" : "their"} dropped lines stay listed as dropped, and a later rebuild reconsiders ${r.reconsiderLeftOut === 1 ? "it" : "them"}.`);
  if (r.answersLeftOut > 0) out.push(`${r.answersLeftOut} older panel answer${r.answersLeftOut === 1 ? "" : "s"}.`);
  return out;
}

export type Standing = "shown" | "folded" | "next" | "left-out" | "";
export const STANDING_WORDS: Record<Exclude<Standing, "">, string> = {
  shown: "Shown now",
  folded: "Folded into the page shown",
  next: "Not yet folded in: included in the next rebuild",
  "left-out": "Not yet folded in: left out of the next rebuild for space, which takes the newest first; a later rebuild picks it up",
};

export interface SubjectSummary {
  id: string;
  name: string;
  oneLine: string;
  /** Null while the subject's files have not been read in this browser yet, so no digest exists. */
  counts: ReturnType<typeof countKinds> | null;
  /** True when results arrived after the digest was taken: Home reads the subject's files again. */
  stale?: boolean;
  /** True while there is neither a digest nor read files: Home shows a placeholder row while it reads them. */
  unread?: boolean;
  /** Why its page needs a rebuild, or null. */
  outdated: Outdated;
  /** When the record last changed: the newest completed result's time, else the newest request's. */
  changed: number | null;
  requests: number;
  pending: number;
  hasPage: boolean;
  /** The page's main contract, so the home bar finds a subject by it. */
  main: string;
  /** Every contract the page lists with its chain id, so the home bar and Related find a subject by any of them. */
  contracts: KnownContract[];
  /** The page job's checked PNG logo as a data: URL, or null: a letter tile is shown instead. */
  logo: string | null;
  /** The logo file's SHA-256: the digest keeps it, and the logo itself is kept once under that hash. */
  logoHash: string | null;
  /** For a subject with no page: why, in the words Home shows. Null when it has a page. */
  status: FirstPageStatus | null;
  /** Result files (other than the page shown) that could not be read: its counts may be short. */
  incomplete?: number;
}

/** A subject with no page: its first page job is pending, was refused (or failed), or found no project. */
export type FirstPageStatus = { kind: "pending" } | { kind: "unread" } | { kind: "refused"; reason: string } | { kind: "failed"; reason: string } | { kind: "not-found"; notes: string } | { kind: "none" };

export function firstPageStatus(list: Activity[]): FirstPageStatus {
  const pages = list.filter((a) => isPageJob(a.req));
  if (pages.some((a) => a.state === "pending")) return { kind: "pending" };
  const last = [...pages].sort((a, b) => (a.req.blockNumber < b.req.blockNumber ? -1 : a.req.blockNumber > b.req.blockNumber ? 1 : 0)).at(-1);
  if (!last) return { kind: "none" };
  const why = (a: Activity) => [a.refusal?.reason, a.refusal?.detail].filter(Boolean).join(": ") || "no reason given";
  if (last.state === "refused") return { kind: "refused", reason: why(last) };
  if (last.state === "failed") return { kind: "failed", reason: why(last) };
  // Completed, but its file has not been read here yet: Home reads it for the digest.
  if (last.state === "completed" && last.filesRead === false) return { kind: "unread" };
  if (last.rejected) return { kind: "not-found", notes: last.rejected };
  // Completed, but its file has not been read (yet): still on its way to a first page.
  return last.state === "completed" && !last.page ? { kind: "pending" } : { kind: "none" };
}

/** The words Home shows for a subject with no page. */
export function statusText(s: FirstPageStatus): string {
  switch (s.kind) {
    case "pending":
      return "First page in progress";
    case "unread":
      return "Reading its record…";
    case "refused":
      return `First page refused: ${s.reason}`;
    case "failed":
      return `First page failed: ${s.reason}`;
    case "not-found":
      return `No project found: ${s.notes}`;
    default:
      return "No page yet.";
  }
}

/**
 * The small digest the home list keeps per subject (digest.ts stores it in IndexedDB): taken when the subject's page
 * is opened and its files are read, so Home never reads a full page file.
 */
export interface Digest {
  type: "digest";
  /** 3 since the digest counts panel answers and keeps failed reads apart; older digests are read again. */
  v: 3;
  id: string;
  /** The completed results it was taken from; a different list means newer results exist. */
  sig: string;
  name: string;
  oneLine: string;
  counts: ReturnType<typeof countKinds>;
  logoHash: string | null;
  changed: number | null;
  hasPage: boolean;
  main: string;
  contracts: KnownContract[];
  /** Why there is no page, when the files said so (found: false). */
  status: FirstPageStatus | null;
  /** Completed results and panel answers not folded into the page shown, when it was taken. */
  unfolded: number;
  /** Result files other than the page shown that could not be read: counts may be short; read again next visit. */
  failedReads: number;
  /** The page's logo: none advertised, read and kept, or advertised but its read failed (read again next visit). */
  logo: "none" | "ok" | "failed";
  /** The request that produced the page shown: Home compares its objective with the current template. */
  pageReq: string | null;
}

/** The completed page, sources, edit and changes results and panel answers of a subject, as one string: what a digest was taken from. */
export const resultSig = (list: Activity[]) =>
  list
    .filter((a) => (isPageJob(a.req) || isSourceJob(a.req) || isEditJob(a.req) || isChangesJob(a.req) || a.req.action === ACTIONS.oracle) && a.state === "completed")
    .map((a) => a.req.requestId.toLowerCase())
    .sort()
    .join(",");

/**
 * The digest of a subject whose files were read; null while any of them is unread, or when the newest page file
 * itself could not be read (that is not a subject without a page). A failed read of another result file does not
 * hold the page back: the digest is written with failedReads, and Home reads those files again.
 */
export function digestOf(id: string, list: Activity[]): Digest | null {
  if (list.some((a) => a.filesRead === false)) return null;
  const core = coreOf(list);
  if (core.latest && !core.page) return null;
  const s = summaryOf(id, list, core);
  const failedReads = list.filter((a) => a !== core.latest && a.sourcesError).length;
  const logo = core.page?.logo ? (s.logoHash ? "ok" : "failed") : "none";
  return { type: "digest", v: 3, id, sig: resultSig(list), name: s.name, oneLine: s.oneLine, counts: s.counts!, logoHash: s.logoHash, changed: s.changed, hasPage: s.hasPage, main: s.main, contracts: s.contracts, status: s.status, unfolded: core.page ? unfoldedCount(core) : 0, pageReq: core.page ? core.latest?.req.requestId ?? null : null, failedReads, logo };
}

/** Results and panel answers still to fold into the page shown: the number the out-of-date note gives. */
export const unfoldedCount = (core: Pick<Core, "unfolded" | "unfoldedAnswers">) => core.unfolded.length + core.unfoldedAnswers.length;

/** Why a subject's digest should be read again on this visit although nothing new completed: a read that failed. */
export const needsRetry = (d: Digest | undefined) => !!d && (d.failedReads > 0 || d.logo === "failed");

function summaryOf(id: string, list: Activity[], core = coreOf(list)): SubjectSummary {
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
    main: core.page?.main ?? "",
    contracts: (core.page?.contracts ?? [])
      .filter((c) => /^0x[0-9a-fA-F]{40}$/.test(c.address))
      .map((c) => ({ address: c.address.toLowerCase(), chainId: chainIdOf(c.chain) })),
    logo: core.latest?.logo ?? null,
    logoHash: core.latest?.logoHash ?? null,
    status: core.page ? null : firstPageStatus(list),
    outdated: outdatedOf(core),
    incomplete: list.filter((a) => a !== core.latest && a.sourcesError).length,
  };
}

/** The out-of-date note from a digest: its unfolded count, else the producing request's objective against the template. */
export function digestOutdated(d: Digest, list: Activity[]): Outdated {
  if (!d.hasPage || !d.pageReq) return null;
  if (d.unfolded > 0) return { kind: "results", n: d.unfolded };
  const req = list.find((a) => a.req.requestId === d.pageReq);
  if (!req) return null;
  return matchesTemplate(req.req.bodyJson?.objective) ? null : { kind: "format" };
}

/**
 * One entry per subject found on chain, newest change first. A subject whose files were read here is summarised
 * from them. Otherwise its stored digest gives name, one_line, counts and logo (marked stale when newer results
 * exist); with no digest it is listed by its id until its page is opened. A subject with no page is listed with its
 * first page's state: in progress, refused (with the reason) or no project found (with the job's notes).
 */
export function subjectSummaries(items: Activity[], digests: Map<string, Digest> = new Map(), logos: Map<string, string> = new Map()): SubjectSummary[] {
  const by = new Map<string, Activity[]>();
  for (const a of items) by.set(a.req.subject, [...(by.get(a.req.subject) ?? []), a]);
  const out = [...by].map(([id, list]): SubjectSummary => {
    const own = summaryOf(id, list);
    if (!list.some((a) => a.filesRead === false)) return own;
    const d = digests.get(id);
    if (!d) return { ...own, counts: own.hasPage ? own.counts : null, unread: !own.hasPage, outdated: null };
    return {
      ...own,
      name: d.name || id,
      oneLine: d.oneLine,
      counts: d.counts,
      stale: d.sig !== resultSig(list),
      hasPage: d.hasPage,
      main: d.main,
      contracts: d.contracts,
      logo: d.logoHash ? logos.get(d.logoHash) ?? null : null,
      logoHash: d.logoHash,
      status: d.hasPage ? null : d.status && d.sig === resultSig(list) ? d.status : own.status,
      outdated: digestOutdated(d, list),
      incomplete: d.failedReads,
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
  /** Why the page shown needs a rebuild, or null. */
  outdated: Outdated;
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
  /** Where a line of the page, a job or an earlier file is shown now. */
  scope: LineScope;
  /** Every completed result not folded in that has a file, oldest first, and the panel answers: a changes job fits its own <PRIOR> from them. */
  results: { id: string; url: string }[];
  answers: PriorAnswer[];
  /** How many results not folded in were left out of <PRIOR> to fit in 7,900 characters, and panel answers. */
  leftOut: number;
  answersLeftOut: number;
  /** Files to reconsider that did not fit in <PRIOR>: their dropped lines stay listed as dropped. */
  reconsiderLeftOut: number;
  /** Dropped entries of earlier pages whose files the last rebuild was not given: still listed as dropped, owed to the next. */
  carried: CarriedDrop[];
  panel: Activity[];
  /** Panel answers A1... as the shown rebuild was given them. */
  answerRef: (target: string) => { text: string; activity: Activity | undefined } | null;
  accounting: Accounting;
  sections: { section: string; rows: RecordRow[] }[];
  sourceList: ListedSource[];
  counts: ReturnType<typeof countKinds>;
}

/** The page's channels as <CHANNELS> lists them: http(s) URLs only, with their ties. */
export const channelTies = (page: Page | null): ChannelTie[] =>
  (page?.channels ?? []).flatMap((c) => {
    const url = safeHref(c.url);
    return url ? [{ url, tie: c.tie }] : [];
  });

/** The model for one subject. `items` are that subject's requests only. */
export function useRecordModel(items: Activity[] | null, chainError: string | null, subjectId: string): RecordModel {
  const core = useMemo(() => coreOf(items ?? []), [items]);
  const { latest, page, unfolded, after, jobs, sections, counts, scope } = core;
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
  const [accounting, setAccounting] = useState<Accounting>({ state: "none", missing: [], files: 0, error: "", dropped: [], read: [] });
  const results = useMemo(() => unfolded.filter((a) => a.fileHash).map((a) => ({ id: a.req.requestId, url: artifactUrl(a.fileHash!) })), [unfolded]);
  const answers = useMemo(() => answersOf(items ?? []), [items]);
  const fit = useMemo(() => {
    // Bare dropped ids are resolved with the same reads Record's accounting makes.
    const again = [...reconsiderFiles(page?.dropped ?? [], given.files, [], accounting.state === "done" ? accounting.read : undefined), ...core.carried.map((c) => c.url)];
    const ties = channelTies(page);
    return fitPrior(page && pageHash ? artifactUrl(pageHash) : null, results, answers, (p) => rebuildObjective(p, subject, ties).length, again);
  }, [results, answers, page, pageHash, subject, given, accounting, core]);

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
    const own = new Set((a.edit?.data.lines ?? a.changes?.data.lines ?? []).map((l) => l.id));
    const files = parsePrior(a.req.bodyJson?.objective).files;
    const inFile = (n: number, id: string): Line | undefined => lineOfFileRef(files, n, id, scope, byId);
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
  const written: ShownSentence[] = edit
    ? edit.result.accepted.map((s) => {
        const v = edit.result.sentences.find((x) => (x.corrected || x.text).trim() === s.text.trim() || x.text.trim() === s.text.trim());
        return { ...s, refs: editRefs(edit.activity, s.lines, v ? v.verdict : null) };
      })
    : (page?.summary ?? []).map((s) => ({ ...s, refs: s.lines.flatMap((id) => (byId.has(id.trim()) ? [byId.get(id.trim())!] : [])) }));
  // A kept rewording rests on the lines its own result lists (items[].lines), each in that job's scope.
  const summary: ShownSentence[] = withRewordRefs(applyRewords(written, after), (a, ids) => editRefs(a, ids, null));

  const answerRef = (target: string) => {
    const m = /^A(\d+)$/i.exec(target.trim());
    if (!m) return null;
    const a = given.answers.find((x) => x.n === Number(m[1]));
    if (!a) return null;
    const activity = panel.find((p) => a.url && (a.url === jobLink(p.jobId, p.req.transactionHash) || a.url.includes(p.req.transactionHash) || (!!p.jobId && a.url.includes(p.jobId))));
    return { text: a.text, activity };
  };

  // A failed read is retried when the record is read again (Refresh).
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (accounting.state === "error") setAttempt((n) => n + 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items]);
  useEffect(() => {
    const bare = (page?.dropped ?? []).map((d) => ({ ...d, ref: d.id, text: "" }));
    if (!page || !given.files.length) {
      setAccounting({ state: "none", missing: [], files: 0, error: "", dropped: bare, read: [] });
      return;
    }
    let live = true;
    setAccounting({ state: "loading", missing: [], files: given.files.length, error: "", dropped: bare, read: [] });
    Promise.all(
      given.files.map(async (f): Promise<PriorLines> => {
        if (!f.hash) throw new Error(`F${f.n} is not an artifact address`);
        return { n: f.n, lines: lineIdsOf(await fetchArtifact(f.hash)) };
      }),
    )
      .then((files) => live && setAccounting({ state: "done", missing: unaccounted(page, files), files: files.length, error: "", dropped: droppedLines(page, files), read: files }))
      .catch((e) => live && setAccounting({ state: "error", missing: [], files: given.files.length, error: e instanceof Error ? e.message : "An earlier file could not be read", dropped: bare, read: [] }));
    return () => {
      live = false;
    };
  }, [page, given, attempt]);

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
    // A bare dropped id names its file only once the earlier files are read; the rebuild waits for that.
    if (page && given.files.length && hasBareDropped(page.dropped)) {
      if (accounting.state === "error") return { ok: false, why: `Unable to read the earlier files the dropped lines came from: ${accounting.error}. Refresh to try again.`, loading: false };
      if (accounting.state !== "done") return { ok: false, why: "Reading the earlier files the dropped lines came from…", loading: true };
    }
    return { ok: true, why: "", loading: false };
  })();

  const channels = channelTies(page);
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
    outdated: outdatedOf(core),
    jobs,
    edit,
    summary,
    resolve,
    editRefs,
    standing,
    snapshot,
    prior: fit.prior,
    scope,
    results,
    answers,
    leftOut: fit.leftOut,
    answersLeftOut: fit.answersLeftOut,
    reconsiderLeftOut: fit.reconsiderLeftOut,
    carried: core.carried,
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
 * Why the page shown needs a rebuild: completed results not folded into it yet, or the request that produced it
 * sent an objective other than what templates/rebuild.txt sends now (apart from <PRIOR>). Null when it is current
 * or there is no page.
 */
export type Outdated = { kind: "results"; n: number } | { kind: "format" } | null;

export function outdatedOf(core: Pick<Core, "latest" | "page" | "unfolded" | "unfoldedAnswers">): Outdated {
  if (!core.latest || !core.page) return null;
  const n = unfoldedCount(core);
  if (n) return { kind: "results", n };
  return matchesTemplate(core.latest.req.bodyJson?.objective) ? null : { kind: "format" };
}

/** "Out of date: 2 results not folded in" or "Out of date: built with an older format". */
export function outdatedText(o: NonNullable<Outdated>): string {
  return o.kind === "results" ? `Out of date: ${o.n.toLocaleString("en-US")} result${o.n === 1 ? "" : "s"} not folded in` : "Out of date: built with an older format";
}

/**
 * The <PRIOR> a rebuild of this subject is given, outside the hook (the home form uses it). ok is false while a
 * result it would list could not be read.
 */
export function planRebuild(items: Activity[], subject: SubjectRef, read?: PriorLines[]) {
  const core = coreOf(items);
  const pageHash = core.latest?.fileHash ?? null;
  const unread = core.unfolded.some((a) => !a.fileHash) || (!!core.latest && (!core.page || !pageHash));
  const results = core.unfolded.filter((a) => a.fileHash).map((a) => ({ id: a.req.requestId, url: artifactUrl(a.fileHash!) }));
  const given = parsePrior(core.latest?.req.bodyJson?.objective).files;
  const dropped = core.page?.dropped ?? [];
  // Bare dropped ids need the earlier files read (the subject's page does that); without them, no plan is offered.
  const needsReads = !read && given.length > 0 && hasBareDropped(dropped);
  const again = [...reconsiderFiles(dropped, given, [], read), ...core.carried.map((c) => c.url)];
  const channels = channelTies(core.page);
  const fit = fitPrior(core.page && pageHash ? artifactUrl(pageHash) : null, results, answersOf(items), (p) => rebuildObjective(p, subject, channels).length, again);
  return { ...fit, ok: !unread && !needsReads, needsReads, hasPage: !!core.page, channels };
}
