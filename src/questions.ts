/**
 * Open questions ("Not known yet") with ids that never change. A question's id is built like a line's permanent
 * address: the job that first wrote it, then its own id ("<job id>:q3", the third question of that job's file). A later
 * page that lists the same wording keeps that id. A changes job may close a question or reword it (questions[] in
 * changes.json). Accepted operations are replayed in completion order (block, then log index) on the question they
 * name: a reword (an answer in part) keeps the question's id and gives it the new wording, so its link always shows the
 * current wording; a close marks that same question Answered, with the date and the lines that answer it. Every
 * question ever listed stays findable under its link. Pure, for tests.
 */
import { artifactUrl, parsePrior } from "./bodies";
import type { Activity } from "./useActivity";
import { isChangesJob, isPageJob } from "./useActivity";

/** An earlier wording of a question and the changes job that narrowed it (an answer in part). */
export interface QuestionStep {
  text: string;
  by: Activity;
  at: number | null;
  lines: string[];
}
export interface Question {
  /** "<job id>:q<n>": the job that first wrote it and its own id. */
  id: string;
  /** The current wording. */
  text: string;
  /** When it was first written. */
  at: number | null;
  /** open; answered by a changes job; or closed: the page shown no longer asks it. */
  state: "open" | "answered" | "closed";
  /** The changes job that answered it, and when. */
  by?: Activity;
  closedAt?: number | null;
  /** The answering job's new line ids (in that job's own file). */
  lines?: string[];
  /** Earlier wordings, oldest first: each answer in part that narrowed it. */
  history?: QuestionStep[];
}
/** What one changes job did to one question: for Activity. `text` is the wording it acted on. */
export interface QuestionAct {
  question: Question;
  op: "close" | "reword";
  text: string;
  lines: string[];
  /** A close that answered a question open when it was applied (a page contributor's "question answered"). */
  answered?: boolean;
}
export interface QuestionState {
  /** The open questions, in the page's order. */
  open: Question[];
  /** Every question ever listed, by id. */
  all: Map<string, Question>;
  /** What each changes job did to questions, by request id: for Activity. */
  byJob: Map<string, QuestionAct[]>;
}

/**
 * A question as a visitor reads it: raw line references such as "[L42,L55,L91]", "(F1:L3)", "[A2]" or "[S11,S23,L66]" are dropped
 * from the text. Ids and matching keep the text as written (normQuestion), so links never change.
 */
export const cleanQuestion = (q: string): string =>
  q
    .replace(/\s*[[(]\s*(?:(?:F\d+:)?[LAQS]\d+[a-z]?\s*(?:[,;]|\band\b|[-–])?\s*)+[\])]/gi, "")
    .replace(/\s+([?.!,;:])/g, "$1")
    .replace(/\s+/g, " ")
    .trim();

export const normQuestion = (q: string) => q.trim().replace(/\s+/g, " ").replace(/[.?!\s]+$/, "").toLowerCase();
/** The element id and link part of a question: "q-<job id>-q3" (#/s/<subject>/q-…). */
export const questionAnchor = (id: string) => `q-${id.replace(/[^A-Za-z0-9_-]/g, "-")}`;
const jobKey = (a: Activity) => a.jobId ?? a.req.requestId;
const counted = (a: Activity) => a.state === "completed" && !a.notRead && !a.rejected;
const timeOf = (a: Activity) => a.doneTime ?? a.time ?? 0;

/** Completion order: block, then log index when both completions are known; else when each was written. */
export function completionOrder(a: Activity, b: Activity): number {
  const ca = a.completion, cb = b.completion;
  if (ca && cb) {
    if (ca.blockNumber !== cb.blockNumber) return ca.blockNumber < cb.blockNumber ? -1 : 1;
    return (ca.logIndex ?? 0) - (cb.logIndex ?? 0);
  }
  return timeOf(a) - timeOf(b);
}

/**
 * Whether a page job was given a changes job's result: its request was sent after that job completed, and its
 * objective (or, through its F1, that of an earlier page it was rebuilt from) lists the result's file. A rebuild sent
 * before the answer, or that left its file out for space, never had it. Without a readable objective or file hash, only
 * the order decides.
 */
function receivedBy(pages: Activity[]): (page: Activity, job: Activity) => boolean {
  const byUrl = new Map(pages.filter((p) => p.fileHash).map((p) => [artifactUrl(p.fileHash!), p] as const));
  const sentAfter = (page: Activity, job: Activity) => {
    const sent = page.req.blockNumber;
    const done = job.completion?.blockNumber;
    if (sent === undefined || done === undefined) return true;
    if (sent !== done) return sent > done;
    return (page.req.logIndex ?? Infinity) > (job.completion?.logIndex ?? 0);
  };
  return (page, job) => {
    const seen = new Set<Activity>();
    for (let cur: Activity | undefined = page; cur && !seen.has(cur); ) {
      seen.add(cur);
      if (!sentAfter(cur, job)) return false;
      const o: unknown = cur.req.bodyJson?.objective;
      if (typeof o !== "string" || !job.fileHash) return true;
      const files = parsePrior(o).files;
      const url = artifactUrl(job.fileHash);
      if (o.includes(url)) return true;
      const f1 = files[0];
      cur = f1 ? byUrl.get(f1.url) : undefined;
    }
    return false;
  };
}

/**
 * Every question of a subject's counted page and changes jobs, and which are open under the page shown (`latest`):
 * its questions, less those a later changes job closed, each under its current wording. A rebuild decides only with
 * what it was given: an answer or a reword its job did not receive stands, with its id, date and lines.
 */
export function questionsOf(items: Activity[], latest: Activity | undefined): QuestionState {
  const jobs = items.filter(counted).filter((a) => (isPageJob(a.req) && a.page) || (isChangesJob(a.req) && a.changes)).sort(completionOrder);
  const shown = latest?.page && counted(latest) ? latest : undefined;
  const received = receivedBy(jobs.filter((a) => isPageJob(a.req)));
  const all = new Map<string, Question>();
  const byText = new Map<string, Question>();
  const byJob = new Map<string, QuestionAct[]>();
  let open: Question[] = [];
  for (const a of jobs) {
    if (isPageJob(a.req)) {
      // A page newer than the page shown gives its questions ids but does not decide what is open.
      const decides = !shown || a === shown || completionOrder(a, shown) < 0;
      const listed: Question[] = [];
      a.page!.openQuestions.forEach((t, i) => {
        const key = normQuestion(t);
        let q = byText.get(key);
        if (!q) {
          q = { id: `${jobKey(a)}:q${i + 1}`, text: t, at: a.doneTime ?? null, state: "open" };
          if (all.has(q.id)) return;
          all.set(q.id, q);
          byText.set(key, q);
        } else if (decides && (q.history ?? []).every((h) => received(a, h.by))) q.text = t;
        if (!listed.includes(q)) listed.push(q);
      });
      if (!decides) continue;
      // The page replaces the open list: what it no longer asks is closed; what it asks is open, again if need be. An
      // answer its job was not given still stands.
      for (const q of open) if (!listed.includes(q) && q.state === "open") q.state = "closed";
      for (const q of listed) {
        if (q.state === "answered" && q.by && !received(a, q.by)) continue;
        if (q.state !== "open") {
          q.state = "open";
          delete q.by;
          delete q.closedAt;
          delete q.lines;
        }
      }
      open = listed.filter((q) => q.state === "open");
      continue;
    }
    for (const x of a.changes!.questions ?? []) {
      const q = byText.get(normQuestion(x.target));
      if (!q) continue;
      if (x.op === "reword" && !x.text.trim()) continue;
      const list = byJob.get(a.req.requestId) ?? [];
      list.push({ question: q, op: x.op, text: q.text, lines: x.lines, ...(x.op === "close" ? { answered: q.state === "open" } : {}) });
      byJob.set(a.req.requestId, list);
      if (x.op === "close") {
        q.state = "answered";
        q.by = a;
        q.closedAt = a.doneTime ?? null;
        q.lines = x.lines;
        open = open.filter((o) => o !== q);
      } else {
        q.history = [...(q.history ?? []), { text: q.text, by: a, at: a.doneTime ?? null, lines: x.lines }];
        q.text = x.text.trim();
        byText.set(normQuestion(q.text), q);
      }
    }
  }
  return { open, all, byJob };
}

/** The question a "#/s/<subject>/q-…" link names, matched by its anchor. */
export const questionForAnchor = (s: QuestionState, anchor: string) => [...s.all.values()].find((q) => questionAnchor(q.id) === anchor) ?? null;
