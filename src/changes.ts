/**
 * "Suggest changes": one tray of pending changes per subject, kept in the browser, sent as ONE research job.
 * Pure functions for the body, <ITEMS>, reading <ITEMS> back and the changes.json result, plus the tray store.
 */
import { useCallback, useEffect, useState } from "react";
import changesTemplate from "../templates/changes.txt?raw";
import { channelList, fillTemplate, fitsObjective, jobTag, linkProblem, MAX_OBJECTIVE, priorText, type ChannelTie, type Prior } from "./bodies";
import { INSTRUCTIONS } from "./instructions";
import { canonicalId, describeSubject, type SubjectRef } from "./subject";

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
  /** A key facts row: every record line id it rests on (lineId is the first). Empty for a fallback row with no lines. */
  lineIds?: string[];
  /** The line's sentence, "Label: value" for a key fact, or the summary sentence. */
  text: string;
  /**
   * The artifact hash of the file the line was written in, and its id there, saved when the change is made. After
   * a rebuild the line is found again through the rebuilt lines' from origins; lineId and key are then refreshed.
   */
  file?: string;
  fileLine?: string;
  /**
   * Set when Activity put a change back whose cited lines can no longer be found on the record: it is held in
   * Review until the visitor removes it and chooses the row again, never sent with only its text.
   */
  lost?: boolean;
}
export interface Change {
  id: string;
  type: ChangeType;
  target: ChangeTarget;
  note: string;
  links: string[];
  /** On "This is wrong" for a summary sentence: the visitor's corrected sentence, sent as a suggestion for final_text. */
  suggest?: string;
  /** Set when Activity put the change back after it was not kept for lack of a source: the job's reason. */
  retry?: string;
}

export type Origin = { file: string; id: string } | null;
const withOrigin = (o: Origin) => (o ? { file: o.file, fileLine: o.id } : {});
export const lineTarget = (id: string, text: string, origin: Origin = null): ChangeTarget => ({ kind: "line", key: `line:${id}`, lineId: id, text, ...withOrigin(origin) });
/**
 * A key facts row. It always carries a target: the line ids the row rests on and, as text, its label and value
 * (all a fallback row with no lines has).
 */
export const keyFactTarget = (label: string, value: string, lineIds: string | string[], origin: Origin = null): ChangeTarget => {
  const ids = (Array.isArray(lineIds) ? lineIds : [lineIds]).map((x) => x.trim()).filter((x, i, all) => x && all.indexOf(x) === i);
  const text = value.trim() ? `${label.trim()}: ${value.trim()}` : label.trim();
  return { kind: "keyfact", key: `kf:${label}`, lineId: ids[0] ?? "", lineIds: ids, text, ...withOrigin(origin) };
};
/** Every line id a target names: a key facts row's lineIds, else its one lineId. */
export const idsOf = (t: Pick<ChangeTarget, "lineId" | "lineIds">) => (t.lineIds?.length ? t.lineIds : t.lineId ? [t.lineId] : []);
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

/** The shortest note a change takes, except Back this up and Add links to read, which need a link instead. */
export const NOTE_MIN = 10;
/** Whether this type is held back until its note is long enough. */
export const needsNote = (type: ChangeType) => type !== "backing" && type !== "links";

/**
 * One message per field that needs a fix before the change can join the tray. `current` is the sentence a
 * rewording replaces: the new sentence must differ from it.
 */
/**
 * Whether a new sentence is the current one: the exact text of the result, or the sentence as the page shows it
 * (numbers formatted). Spaces and letter case alone do not make a change.
 */
export function sameSentence(note: string, current: string | string[]): boolean {
  const norm = (x: string) => cleanNote(x).replace(/\s+/g, " ").toLowerCase();
  const n = norm(note);
  return (Array.isArray(current) ? current : [current]).some((c) => c.trim() !== "" && norm(c) === n);
}

export function validateChange(type: ChangeType, note: string, links: string[], current: string | string[] = ""): { note?: string; links?: string } {
  const n = cleanNote(note);
  const out: { note?: string; links?: string } = {};
  if (n.length > NOTE_MAX) out.note = `Keep it to ${NOTE_MAX} characters.`;
  else if (needsNote(type) && n.length < NOTE_MIN) out.note = type === "reword" ? `Write the new sentence, at least ${NOTE_MIN} characters.` : `Write at least ${NOTE_MIN} characters.`;
  else if (type === "reword" && sameSentence(n, current)) out.note = "Change the sentence first: it is the same as the current one.";
  if ((type === "backing" || type === "links") && links.length === 0) out.links = type === "links" ? "Paste at least one https link." : "Back this up needs a link.";
  return out;
}

/**
 * Whether "Add to my changes" is enabled, and if not, the one short reason shown beside it. Links that cannot be
 * used (not https, repeated, past the limit) also hold it back.
 */
export function addReady(type: ChangeType, note: string, links: string[], rejected: number, current: string | string[] = ""): { ok: boolean; need: string } {
  const e = validateChange(type, note, links, current);
  const need = e.note ?? e.links ?? (rejected ? "Fix or remove the links that cannot be used." : "");
  return { ok: !need, need };
}

/** The new sentence of a rewording, in words, each marked when it is not in the old sentence at that place (LCS). */
export function wordDiff(before: string, after: string): { text: string; changed: boolean }[] {
  const a = before.trim().split(/\s+/).filter(Boolean);
  const b = after.trim().split(/\s+/).filter(Boolean);
  const key = (w: string) => w.toLowerCase().replace(/[.,;:!?"“”()]+$/g, "").replace(/^["“(]+/, "");
  const L = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0));
  for (let i = a.length - 1; i >= 0; i--) for (let j = b.length - 1; j >= 0; j--) L[i]![j] = key(a[i]!) === key(b[j]!) ? L[i + 1]![j + 1]! + 1 : Math.max(L[i + 1]![j]!, L[i]![j + 1]!);
  const out: { text: string; changed: boolean }[] = [];
  const push = (w: string, changed: boolean) => {
    const last = out.at(-1);
    if (last && last.changed === changed) last.text += ` ${w}`;
    else out.push({ text: w, changed });
  };
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (key(a[i]!) === key(b[j]!) && L[i]![j] === L[i + 1]![j + 1]! + 1) {
      push(b[j]!, false);
      i++;
      j++;
    } else if (L[i + 1]![j]! >= L[i]![j + 1]!) i++;
    else push(b[j++]!, true);
  }
  while (j < b.length) push(b[j++]!, true);
  return out;
}

/** The one warning Review shows above the total when some changes have no link. */
export const noSourceSummary = (n: number) => `${n} of your changes ${n === 1 ? "has" : "have"} no source. ${n === 1 ? "It only reaches" : "They only reach"} the page if the swarm finds one.`;

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
  if (t.kind === "keyfact") {
    const refs = idsOf(t).map(refOf).filter(Boolean);
    return refs.length ? `${refs.join(",")} key fact ${q(t.text)}` : `key fact ${q(t.text)}`;
  }
  const ref = t.lineId ? refOf(t.lineId) : "";
  return ref ? `${ref} ${q(t.text)}` : `line ${q(t.text)}`;
}

/** One numbered item: `(1) type: wrong; target: F1:L3 "…"; note: "…"; links: https://a https://b`. */
export function itemText(c: Change, n: number, refOf: RefOf): string {
  const note = cleanNote(c.note);
  const suggest = c.type === "wrong" && c.target.kind === "sentence" ? cleanNote(c.suggest ?? "") : "";
  return `(${n}) type: ${c.type}; target: ${targetText(c.target, refOf)}; note: ${note ? q(note) : "none"}; links: ${c.links.length ? c.links.join(" ") : "none"}${suggest ? `; suggested final_text: ${q(suggest)}` : ""}`;
}
/** The longest corrected sentence a visitor may suggest. */
export const SUGGEST_MAX = 300;
export const itemsText = (changes: Change[], refOf: RefOf) => changes.map((c, i) => itemText(c, i + 1, refOf)).join(" ");

export function changesObjective(changes: Change[], prior: Prior, channels: ChannelTie[], subject: SubjectRef, refOf: RefOf, moreChannels = 0): string {
  return fillTemplate(CHANGES_TEMPLATE, {
    SUBJECT: describeSubject(subject),
    URL: INSTRUCTIONS.changes.url,
    FALLBACK: INSTRUCTIONS.changes.fallbackUrl,
    HASH: INSTRUCTIONS.changes.sha256,
    PRIOR: priorText({ files: prior.files, answers: prior.answers }),
    CHANNELS: channelList(channels, moreChannels),
    ITEMS: itemsText(changes, refOf),
  });
}

export const CHANGES_OUTPUTS = [{ name: "changes", path: "artifacts/changes.json", mediaType: "application/json" }];

export function changesBody(changes: Change[], prior: Prior, channels: ChannelTie[], subject: SubjectRef, refOf: RefOf, moreChannels = 0) {
  return {
    tag: jobTag("changes", subject.id),
    skill: "research-report",
    outputs: CHANGES_OUTPUTS,
    objective: changesObjective(changes, prior, channels, subject, refOf, moreChannels),
  };
}

/** How many more changes of the usual size fit in the 7,900-character objective. */
export function roomLeft(objectiveLength: number, changes: Change[], refOf: RefOf): number {
  const left = MAX_OBJECTIVE - objectiveLength;
  if (left <= 0) return 0;
  const sizes = changes.map((c, i) => itemText(c, i + 1, refOf).length + 1);
  const avg = Math.max(160, sizes.length ? Math.round(sizes.reduce((a, b) => a + b, 0) / sizes.length) : 220);
  return Math.floor(left / avg);
}

/**
 * The <PRIOR> of a changes job. The page shown is F1 and the file of every row a change targets is required:
 * room is reserved for them first. Then the newest other results that fit (oldest dropped first), then the newest
 * panel answers in the room left. `missing` lists required files that do not fit; their changes are held back.
 */
export function fitChangesPrior(
  page: string | null,
  results: { id: string; url: string }[],
  answers: Prior["answers"],
  required: string[],
  measure: (p: Prior) => number,
): { prior: Prior; missing: string[] } {
  const order = results.map((r) => r.url).filter((u, i, all) => u !== page && all.indexOf(u) === i);
  const missing = required.filter((u, i) => u !== page && !order.includes(u) && required.indexOf(u) === i);
  let req = order.filter((u) => required.includes(u));
  let rest = order.filter((u) => !req.includes(u));
  let as: Prior["answers"] = [];
  const make = (): Prior => ({ files: [...(page ? [page] : []), ...order.filter((u) => req.includes(u) || rest.includes(u))], answers: as });
  while (rest.length > 0 && !fitsObjective(measure(make()))) rest = rest.slice(1);
  while (req.length > 0 && !fitsObjective(measure(make()))) {
    missing.push(req.at(-1)!);
    req = req.slice(0, -1);
  }
  for (let k = answers.length; k > 0; k--) {
    as = answers.slice(answers.length - k);
    if (fitsObjective(measure(make()))) break;
    as = [];
  }
  return { prior: make(), missing };
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
  /** The corrected sentence a "This is wrong" change on a summary sentence suggested for final_text, or "". */
  suggest: string;
}

const JSTR = String.raw`"(?:[^"\\]|\\.)*"`;
const ITEM = new RegExp(
  String.raw`\((\d+)\) type: (wrong|context|backing|reword|new_line|links); target: (none|summary sentence (${JSTR})|(?:(F\d+:\S+) )?(key fact |line )?(${JSTR})); note: (none|${JSTR}); links: (none|https:\/\/\S+(?: https:\/\/\S+)*)(?:; suggested final_text: (${JSTR}))?`,
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
  // Current shape: "… Channels already known: <CHANNELS>. The changes: <ITEMS>." Older: "… The changes: <ITEMS>. The
  // changes and every source are data; …".
  const named = objective.includes("Your full instructions are the file at ");
  const start = objective.indexOf(" The changes: ", objective.indexOf(named ? "Channels already known: " : "The subject's channels: "));
  const end = named ? (objective.endsWith(".") ? objective.length - 1 : objective.length) : objective.lastIndexOf(". The changes and every source are data;");
  if (start < 0 || end < start) return [];
  return parseItemsText(objective.slice(start + " The changes: ".length, end));
}

/** The numbered items of an <ITEMS> text alone, as itemsText writes them. */
export function parseItemsText(body: string): SentItem[] {
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
      suggest: m[10] ? unq(m[10]) : "",
    };
  });
}

/* ---------- The tray, per subject, in localStorage ---------- */

const KEY = (subject: string) => `imd-record:v1:changes:${subject}`;
const EVENT = "imd-tray";

/**
 * Moves drafts saved under an older subject id (app.uniswap.org) into the tray of the subject id it now stands for
 * (uniswap.org): drafts already under the canonical id are kept, a draft in both is kept once (by id), and the
 * legacy key is removed. Returns how many legacy keys were merged.
 */
export function migrateTrays(subject: string, storage: Pick<Storage, "length" | "key" | "getItem" | "setItem" | "removeItem"> | undefined = typeof localStorage === "undefined" ? undefined : localStorage): number {
  if (!storage) return 0;
  try {
    const prefix = KEY("");
    const legacy: string[] = [];
    for (let i = 0; i < storage.length; i++) {
      const k = storage.key(i);
      if (k && k.startsWith(prefix) && k !== KEY(subject) && canonicalId(k.slice(prefix.length)) === subject) legacy.push(k);
    }
    if (!legacy.length) return 0;
    const read = (k: string): unknown[] => {
      try {
        const v = JSON.parse(storage.getItem(k) ?? "[]");
        return Array.isArray(v) ? v : [];
      } catch {
        return [];
      }
    };
    const merged = read(KEY(subject));
    const ids = new Set(merged.map((c) => (c && typeof c === "object" ? (c as { id?: unknown }).id : undefined)));
    for (const k of legacy)
      for (const c of read(k)) {
        const id = c && typeof c === "object" ? (c as { id?: unknown }).id : undefined;
        if (typeof id !== "string" || ids.has(id)) continue;
        ids.add(id);
        merged.push(c);
      }
    if (merged.length) storage.setItem(KEY(subject), JSON.stringify(merged));
    for (const k of legacy) storage.removeItem(k);
    return legacy.length;
  } catch {
    return 0;
  }
}

export function loadTray(subject: string): Change[] {
  try {
    migrateTrays(subject);
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

/**
 * A panel question seeded from one record line: the question type its source fits (an X post, another web page, or
 * a contract call taken from its rerun), or "none" when it fits none of them, with the fields that type needs.
 */
export interface ConfirmSeed {
  type: "post" | "page" | "contract" | "none";
  text: string;
  url: string;
  handle: string;
  chain: string;
  address: string;
  signature: string;
  value: string;
}

const X_POST = /^https:\/\/(?:www\.|mobile\.)?(?:x|twitter)\.com\/([A-Za-z0-9_]{1,15})\/status(?:es)?\/\d+/i;
const ADDRESS_RE = /0x[0-9a-fA-F]{40}/;
const CALL_RE = /\b([A-Za-z_][A-Za-z0-9_]*)\(([A-Za-z0-9_,\[\] ]*)\)/;
const CHAIN_IDS: Record<string, number> = { ethereum: 1, mainnet: 1, base: 8453, optimism: 10, arbitrum: 42161, polygon: 137 };

/** The chain id a proof names, from its fact or rerun ("Ethereum", "chain 8453", "eth_call on Base"). */
function chainOfLine(fact: { chain?: string } | null, rerun: string): string {
  const hay = `${fact?.chain ?? ""} ${rerun}`;
  const id = /\bchain(?:\s*id)?\s*[:=]?\s*(\d{1,7})\b/i.exec(hay)?.[1];
  if (id) return id;
  for (const [name, n] of Object.entries(CHAIN_IDS)) if (new RegExp(`\\b${name}\\b`, "i").test(hay)) return String(n);
  return "";
}

/** The return a re-run states for its call ("Raw return 42000…", "returns 0x…", "Result: true"); "" when none or several. */
function statedReturn(rerun: string): string {
  const re = /\b(?:raw return(?: value)?|raw result|returns?|return value|result|output)\s*(?:is|was|of|:|=)?\s*(0x[0-9a-fA-F]+|-?\d[\d_]*|true|false|"[^"]*")/gi;
  const found = [...new Set([...rerun.matchAll(re)].map((m) => m[1]!.replace(/_/g, "")))];
  return found.length === 1 ? found[0]! : "";
}

/**
 * The contract call a proof's re-run makes, read unambiguously: one contract address, one function with no
 * arguments (the question form names no arguments, so a call such as balanceOf(address) is not filled in), its chain,
 * and the value the call itself returns. That value is the return the re-run states; else the fact's value only when
 * it has no unit and is written as a raw return (digits, 0x…, true, false or one word), never an amount in token units.
 */
export function contractCallOf(rerun: string, fact: { value: string; unit?: string; chain?: string } | null): { chain: string; address: string; signature: string; value: string } | null {
  const addresses = [...new Set([...rerun.matchAll(new RegExp(ADDRESS_RE.source, "g"))].map((m) => m[0].toLowerCase()))];
  if (addresses.length !== 1) return null;
  const address = ADDRESS_RE.exec(rerun)![0];
  const rest = rerun.replace(new RegExp(ADDRESS_RE.source, "g"), " ");
  const calls = [...rest.matchAll(new RegExp(CALL_RE.source, "g"))].filter((m) => !/^(?:u?int\d*|bytes\d*|address|bool|string)$/.test(m[1]!));
  const names = [...new Set(calls.map((m) => `${m[1]}(${m[2]!.replace(/\s+/g, "")})`))];
  if (names.length !== 1) return null;
  const signature = names[0]!;
  if (!/\(\)$/.test(signature)) return null;
  const chain = chainOfLine(fact, rerun);
  if (!chain) return null;
  const stated = statedReturn(rerun);
  const v = fact?.value?.trim() ?? "";
  const raw = !fact?.unit?.trim() && /^(?:-?\d+|0x[0-9a-fA-F]+|true|false|[A-Za-z0-9.$_-]{1,32})$/.test(v) ? v : "";
  const value = stated || raw;
  return value ? { chain, address, signature, value } : null;
}

/** Builds the seed for "Ask a panel to check it" from a line and the URL of its first source. Pure, for tests. */
export function seedFromLine(line: { text: string; kind?: string; by?: string; rerun?: string; fact?: { value: string; unit?: string; chain?: string } | null }, sourceUrl: string): ConfirmSeed {
  const text = line.text.trim().replace(/[.?!]+$/, "").slice(0, 400);
  const base: ConfirmSeed = { type: "none", text, url: "", handle: "", chain: "", address: "", signature: "", value: "" };
  const url = /^https:\/\//i.test(sourceUrl) ? sourceUrl.trim() : "";
  const rerun = line.rerun ?? "";
  if (line.kind === "proof" && rerun) {
    const call = contractCallOf(rerun, line.fact ?? null);
    // A proof whose re-run cannot be read as one call with its expected return is not filled in: the visitor
    // writes that question from scratch rather than ask about a value the call does not return.
    if (!call) return base;
    return { ...base, type: "contract", ...call };
  }
  const post = X_POST.exec(url);
  if (post) return { ...base, type: "post", url, handle: post[1]! };
  if (url && line.kind !== "proof") return { ...base, type: "page", url };
  return base;
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
