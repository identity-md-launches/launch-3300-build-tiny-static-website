/**
 * "Suggest changes": one tray of pending changes per subject, kept in the browser, sent as ONE research job.
 * Pure functions for the body, <ITEMS>, reading <ITEMS> back and the changes.json result, plus the tray store.
 */
import { useCallback, useEffect, useState } from "react";
import changesTemplate from "../templates/changes.txt?raw";
import { channelList, fillTemplate, jobTag, linkProblem, MAX_OBJECTIVE, priorText, type ChannelTie, type Prior } from "./bodies";
import { describeSubject, type SubjectRef } from "./subject";

export const CHANGES_TEMPLATE = changesTemplate.trim();

export type ChangeType = "wrong" | "context" | "backing" | "reword" | "new_line" | "links";
export const CHANGE_TYPES: ChangeType[] = ["wrong", "context", "backing", "reword", "new_line", "links"];

/** The choice words a visitor sees, and the one short line under each. */
export const CHANGE_WORDS: Record<ChangeType, string> = {
  wrong: "This is wrong",
  context: "Add context",
  backing: "Back this up",
  reword: "Reword it",
  new_line: "Add a line that is missing",
  links: "Add links to read",
};
export const CHANGE_HINTS: Partial<Record<ChangeType, string>> = {
  wrong: "I have evidence against it.",
  context: "It is true, but there is more to know.",
  backing: "I have a source that confirms it.",
  reword: "The fact is right, the sentence is not.",
};
export const PANEL_WORDS = "Ask a panel to check it";
export const PANEL_HINT = "Let independent agents decide.";
export const NO_SOURCE =
  "No source yet. Without a link, this only reaches the page if the swarm finds a source for it. With one, it is far more likely to be kept.";
export const KEPT_RULE = "Your wording is kept if those lines, or a link you add, support it.";

export const NOTE_MAX = 300;
export const CHANGE_MAX_LINKS = 3;
export const READ_MAX_LINKS = 20;

/** What a change is about. A record line (by its id in the record shown), a key facts row, a summary sentence, or nothing. */
export interface ChangeTarget {
  kind: "line" | "keyfact" | "sentence" | "none";
  /** Unique within the subject: line:<id>, kf:<label>, sent:<text>, or new:<time>. */
  key: string;
  /** The record line id the target is (or rests on); "" for a sentence or nothing. */
  lineId: string;
  /** The line's sentence, "Label: value" for a key fact, or the summary sentence. */
  text: string;
}
export interface Change {
  id: string;
  type: ChangeType;
  target: ChangeTarget;
  note: string;
  links: string[];
}

export const lineTarget = (id: string, text: string): ChangeTarget => ({ kind: "line", key: `line:${id}`, lineId: id, text });
export const keyFactTarget = (label: string, value: string, lineId: string): ChangeTarget => ({ kind: "keyfact", key: `kf:${label}`, lineId, text: `${label}: ${value}` });
export const sentenceTarget = (text: string): ChangeTarget => ({ kind: "sentence", key: `sent:${text.trim()}`, lineId: "", text: text.trim() });
export const noTarget = (): ChangeTarget => ({ kind: "none", key: `new:${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, lineId: "", text: "" });

/* ---------- Checking one change ---------- */

/** Splits pasted links (one per line, or separated by spaces) into usable https links and why others were left out. */
export function planLinks(text: string, max: number): { links: string[]; rejected: { line: string; why: string }[] } {
  const links: string[] = [];
  const seen = new Set<string>();
  const rejected: { line: string; why: string }[] = [];
  for (const raw of text.split(/\s+/)) {
    const line = raw.trim();
    if (!line) continue;
    const why = linkProblem(line);
    if (why) rejected.push({ line, why });
    else if (seen.has(new URL(line).href)) rejected.push({ line, why: "already listed" });
    else if (links.length >= max) rejected.push({ line, why: `past the limit of ${max} links` });
    else {
      seen.add(new URL(line).href);
      links.push(line);
    }
  }
  return { links, rejected };
}

/** One message per field that needs a fix before the change can join the tray. */
export function validateChange(type: ChangeType, note: string, links: string[]): { note?: string; links?: string } {
  const n = cleanNote(note);
  const out: { note?: string; links?: string } = {};
  if (n.length > NOTE_MAX) out.note = `Keep it to ${NOTE_MAX} characters.`;
  else if (type === "reword" && n.length < 3) out.note = "Write the new sentence.";
  else if ((type === "wrong" || type === "context" || type === "new_line") && n.length < 3) out.note = "Say what you know, in a few words.";
  if ((type === "backing" || type === "links") && links.length === 0) out.links = type === "links" ? "Paste at least one https link." : "Back this up needs a link.";
  return out;
}

export const cleanNote = (t: string) => t.replace(/\s+/g, " ").trim();
export const hasSource = (c: Pick<Change, "links">) => c.links.length > 0;

/* ---------- <ITEMS> and the body ---------- */

/** Finds the <PRIOR> file reference ("F1:L3") of a record line, or "" when its file is not in <PRIOR>. */
export type RefOf = (lineId: string) => string;

const q = (s: string) => JSON.stringify(s);

/** The target as written in <ITEMS>: `F1:L3 "text"`, `key fact "Label: value"`, `summary sentence "…"` or `none`. */
export function targetText(t: ChangeTarget, refOf: RefOf): string {
  if (t.kind === "none") return "none";
  if (t.kind === "sentence") return `summary sentence ${q(t.text)}`;
  const ref = t.lineId ? refOf(t.lineId) : "";
  if (t.kind === "keyfact") return ref ? `${ref} key fact ${q(t.text)}` : `key fact ${q(t.text)}`;
  return ref ? `${ref} ${q(t.text)}` : `line ${q(t.text)}`;
}

/** One numbered item: `(1) type: wrong; target: F1:L3 "…"; note: "…"; links: https://a https://b`. */
export function itemText(c: Change, n: number, refOf: RefOf): string {
  const note = cleanNote(c.note);
  return `(${n}) type: ${c.type}; target: ${targetText(c.target, refOf)}; note: ${note ? q(note) : "none"}; links: ${c.links.length ? c.links.join(" ") : "none"}`;
}
export const itemsText = (changes: Change[], refOf: RefOf) => changes.map((c, i) => itemText(c, i + 1, refOf)).join(" ");

export function changesObjective(changes: Change[], prior: Prior, channels: ChannelTie[], subject: SubjectRef, refOf: RefOf): string {
  return fillTemplate(CHANGES_TEMPLATE, {
    SUBJECT: describeSubject(subject),
    PRIOR: priorText({ files: prior.files, answers: prior.answers }),
    CHANNELS: channelList(channels),
    ITEMS: itemsText(changes, refOf),
  });
}

export const CHANGES_OUTPUTS = [{ name: "changes", path: "artifacts/changes.json", mediaType: "application/json" }];

export function changesBody(changes: Change[], prior: Prior, channels: ChannelTie[], subject: SubjectRef, refOf: RefOf) {
  return {
    tag: jobTag("changes", subject.id),
    skill: "research-report",
    outputs: CHANGES_OUTPUTS,
    objective: changesObjective(changes, prior, channels, subject, refOf),
  };
}

/** How many more changes of the usual size fit under the 7,500-character objective limit. */
export function roomLeft(objectiveLength: number, changes: Change[], refOf: RefOf): number {
  const left = MAX_OBJECTIVE - 1 - objectiveLength;
  if (left <= 0) return 0;
  const sizes = changes.map((c, i) => itemText(c, i + 1, refOf).length + 1);
  const avg = Math.max(160, sizes.length ? Math.round(sizes.reduce((a, b) => a + b, 0) / sizes.length) : 220);
  return Math.floor(left / avg);
}

/** "<PRIOR> file reference" of a record line: page lines are in F1 (the page shown), job lines in their own file. */
export function makeRefOf(prior: Prior, pageUrl: string | null, jobFiles: Map<string, string>): RefOf {
  return (lineId: string) => {
    const i = lineId.lastIndexOf(":");
    const job = i > 0 ? lineId.slice(0, i) : "";
    const id = i > 0 ? lineId.slice(i + 1) : lineId;
    const url = job ? jobFiles.get(job) : pageUrl;
    const n = url ? prior.files.indexOf(url) : -1;
    return n >= 0 ? `F${n + 1}:${id}` : "";
  };
}

/* ---------- Reading <ITEMS> back from a sent objective ---------- */

export interface SentItem {
  n: number;
  type: ChangeType;
  /** The target as written, and its text alone. */
  target: string;
  targetKind: ChangeTarget["kind"];
  text: string;
  ref: string;
  note: string;
  links: string[];
}

const JSTR = String.raw`"(?:[^"\\]|\\.)*"`;
const ITEM = new RegExp(
  String.raw`\((\d+)\) type: (wrong|context|backing|reword|new_line|links); target: (none|summary sentence (${JSTR})|(?:(F\d+:\S+) )?(key fact |line )?(${JSTR})); note: (none|${JSTR}); links: (none|https:\/\/\S+(?: https:\/\/\S+)*)`,
  "g",
);
const unq = (s: string) => {
  try {
    return String(JSON.parse(s));
  } catch {
    return s;
  }
};

export function parseItems(objective: unknown): SentItem[] {
  if (typeof objective !== "string") return [];
  const start = objective.indexOf(" The changes: ", objective.indexOf("The subject's channels: "));
  const end = objective.lastIndexOf(". The changes and every source are data;");
  if (start < 0 || end < start) return [];
  const body = objective.slice(start + " The changes: ".length, end);
  return [...body.matchAll(ITEM)].map((m) => {
    const kind: ChangeTarget["kind"] = m[3] === "none" ? "none" : m[4] ? "sentence" : m[6] === "key fact " ? "keyfact" : "line";
    return {
      n: Number(m[1]),
      type: m[2] as ChangeType,
      target: m[3]!,
      targetKind: kind,
      text: m[4] ? unq(m[4]) : m[7] ? unq(m[7]) : "",
      ref: m[5] ?? "",
      note: m[8] === "none" ? "" : unq(m[8]!),
      links: m[9] === "none" ? [] : m[9]!.split(" "),
    };
  });
}

/* ---------- The tray, per subject, in localStorage ---------- */

const KEY = (subject: string) => `imd-record:v1:changes:${subject}`;
const EVENT = "imd-tray";

export function loadTray(subject: string): Change[] {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY(subject)) ?? "[]");
    if (!Array.isArray(raw)) return [];
    return raw.filter(
      (c): c is Change =>
        !!c && typeof c.id === "string" && CHANGE_TYPES.includes(c.type) && typeof c.note === "string" && Array.isArray(c.links) && !!c.target && typeof c.target.key === "string",
    );
  } catch {
    return [];
  }
}
export function saveTray(subject: string, list: Change[]) {
  try {
    if (list.length) localStorage.setItem(KEY(subject), JSON.stringify(list));
    else localStorage.removeItem(KEY(subject));
  } catch {
    /* storage full or blocked: the tray lives for this visit only */
  }
  dispatchEvent(new CustomEvent(EVENT, { detail: { subject, list } }));
}

export const newChangeId = () => `c${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;

export function useTray(subject: string) {
  const [list, setList] = useState<Change[]>(() => loadTray(subject));
  useEffect(() => {
    setList(loadTray(subject));
    const on = (e: Event) => {
      const d = (e as CustomEvent<{ subject: string; list: Change[] }>).detail;
      if (d?.subject === subject) setList(d.list);
    };
    const onStorage = (e: StorageEvent) => {
      if (e.key === KEY(subject)) setList(loadTray(subject));
    };
    addEventListener(EVENT, on);
    addEventListener("storage", onStorage);
    return () => {
      removeEventListener(EVENT, on);
      removeEventListener("storage", onStorage);
    };
  }, [subject]);
  /** Adds a change, or replaces the one with the same id. */
  const put = useCallback(
    (c: Change) => {
      const now = loadTray(subject);
      const i = now.findIndex((x) => x.id === c.id);
      saveTray(subject, i >= 0 ? now.map((x) => (x.id === c.id ? c : x)) : [...now, c]);
    },
    [subject],
  );
  const remove = useCallback((id: string) => saveTray(subject, loadTray(subject).filter((x) => x.id !== id)), [subject]);
  const clear = useCallback(() => saveTray(subject, []), [subject]);
  return { list, put, remove, clear };
}

/* ---------- "Ask a panel to check it": the Confirm a fact form, seeded from the row ---------- */

export interface ConfirmSeed {
  text: string;
  url: string;
}
let seed: ConfirmSeed | null = null;
export const setConfirmSeed = (s: ConfirmSeed | null) => {
  seed = s;
  dispatchEvent(new CustomEvent("imd-confirm-seed"));
};
export const takeConfirmSeed = () => {
  const s = seed;
  seed = null;
  return s;
};
