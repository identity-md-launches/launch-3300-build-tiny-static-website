/**
 * Open questions ("Not known yet") with ids that never change. A question's id is built like a line's permanent
 * address: the job that first wrote it, then its own id ("<job id>:q3", the third question of that job's file). A later
 * page that lists the same wording keeps that id. A changes job may close a question or reword it (questions[] in
 * changes.json); a reworded question is a new one, first written by that changes job. Every question ever listed stays
 * findable under its link: open, answered (with the date and the lines that answer it) or no longer open. Pure, for tests.
 */
import type { Activity } from "./useActivity";
import { isChangesJob, isPageJob } from "./useActivity";

export interface Question {
  /** "<job id>:q<n>": the job that first wrote it and its own id. */
  id: string;
  text: string;
  /** When it was first written. */
  at: number | null;
  state: "open" | "answered" | "reworded" | "closed";
  /** The changes job that answered or reworded it, and when. */
  by?: Activity;
  closedAt?: number | null;
  /** The answering job's new line ids (in that job's own file). */
  lines?: string[];
  /** For a reworded question: the id of the question that replaced it. */
  next?: string;
}
export interface QuestionState {
  /** The open questions, in the page's order, then those a changes job added by rewording. */
  open: Question[];
  /** Every question ever listed, by id. */
  all: Map<string, Question>;
  /** What each changes job did to questions, by request id: for Activity. */
  byJob: Map<string, Question[]>;
}

export const normQuestion = (q: string) => q.trim().replace(/\s+/g, " ").replace(/[.?!\s]+$/, "").toLowerCase();
/** The element id and link part of a question: "q-<job id>-q3" (#/s/<subject>/q-…). */
export const questionAnchor = (id: string) => `q-${id.replace(/[^A-Za-z0-9_-]/g, "-")}`;
const jobKey = (a: Activity) => a.jobId ?? a.req.requestId;
const counted = (a: Activity) => a.state === "completed" && !a.notRead && !a.rejected;
const timeOf = (a: Activity) => a.doneTime ?? a.time ?? 0;

/**
 * Every question of a subject's counted page and changes jobs, oldest first, and which are open under the page shown
 * (`latest`): its questions, less those a later changes job closed or reworded, plus the new wordings.
 */
export function questionsOf(items: Activity[], latest: Activity | undefined): QuestionState {
  const jobs = items.filter(counted).filter((a) => (isPageJob(a.req) && a.page) || (isChangesJob(a.req) && a.changes)).sort((a, b) => timeOf(a) - timeOf(b));
  const all = new Map<string, Question>();
  const byText = new Map<string, Question>();
  const byJob = new Map<string, Question[]>();
  const add = (text: string, a: Activity, n: number) => {
    const key = normQuestion(text);
    const had = byText.get(key);
    if (had) return had;
    const q: Question = { id: `${jobKey(a)}:q${n}`, text, at: a.doneTime ?? null, state: "open" };
    all.set(q.id, q);
    byText.set(key, q);
    return q;
  };
  // The changes jobs that acted on a question, with what they did, in time order.
  const acts: { a: Activity; target: Question; op: "close" | "reword"; text: string; lines: string[] }[] = [];
  for (const a of jobs) {
    if (isPageJob(a.req)) {
      a.page!.openQuestions.forEach((t, i) => add(t, a, i + 1));
      continue;
    }
    let n = 0;
    for (const x of a.changes!.questions ?? []) {
      const target = byText.get(normQuestion(x.target));
      if (!target) continue;
      acts.push({ a, target, op: x.op, text: x.text, lines: x.lines });
      const list = byJob.get(a.req.requestId) ?? [];
      list.push(target);
      byJob.set(a.req.requestId, list);
      if (x.op === "reword" && x.text.trim()) {
        n += 1;
        const nq = add(x.text, a, n);
        target.next = nq.id;
      }
    }
  }
  // What a changes job did stays on the question it acted on, whenever it ran.
  for (const x of acts) {
    x.target.state = x.op === "close" ? "answered" : "reworded";
    x.target.by = x.a;
    x.target.closedAt = x.a.doneTime ?? null;
    x.target.lines = x.lines;
  }
  const page = latest?.page && counted(latest) ? latest : undefined;
  const shown = new Set((page?.page?.openQuestions ?? []).map(normQuestion));
  const since = page ? timeOf(page) : -Infinity;
  const open: Question[] = [];
  const seen = new Set<string>();
  const push = (q: Question | undefined) => {
    if (!q || seen.has(q.id)) return;
    seen.add(q.id);
    open.push(q);
  };
  // Acted on after the page shown: closed or reworded now, whatever the page lists.
  const later = acts.filter((x) => timeOf(x.a) > since);
  const gone = new Set(later.map((x) => x.target.id));
  for (const t of page?.page?.openQuestions ?? []) {
    const q = byText.get(normQuestion(t))!;
    if (!gone.has(q.id)) {
      // Listed again by the page shown after an earlier job closed it: open again.
      q.state = "open";
      push(q);
    }
  }
  for (const x of later) if (x.op === "reword" && x.target.next) push(all.get(x.target.next));
  for (const q of open) q.state = "open";
  // Never closed by a changes job and not listed now: the page shown no longer asks it.
  for (const q of all.values()) if (q.state === "open" && !seen.has(q.id) && !shown.has(normQuestion(q.text))) q.state = "closed";
  if (!page) for (const q of all.values()) if (q.state === "closed") q.state = "open";
  return { open, all, byJob };
}

/** The question a "#/s/<subject>/q-…" link names, matched by its anchor. */
export const questionForAnchor = (s: QuestionState, anchor: string) => [...s.all.values()].find((q) => questionAnchor(q.id) === anchor) ?? null;
