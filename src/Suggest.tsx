/** Suggest changes where you read: the pencil, the inline panel, the tray bar at the bottom and its review. */
import { ToneMark } from "./KindIcon";
import { createContext, Fragment, useCallback, useContext, useEffect, useId, useMemo, useRef, useState } from "react";
import { CHANGES } from "./requests";
import { askOf, type Ask } from "./requests/ask";
import { artifactUrl, fitsObjective, MAX_OBJECTIVE } from "./bodies";
import { InstructionsBlock } from "./InstructionsBlock";
import {
  CHANGE_HINTS,
  CHANGE_WORDS,
  KEPT_RULE,
  NOTE_HEADING,
  NOTE_MAX,
  NOTE_PLACEHOLDER,
  NOTE_STEPS,
  QUICK_LINE,
  QUICK_SENTENCE,
  SOURCES_HINT,
  SOURCES_LABEL,
  sameSentence,
  changesBody,
  changesObjective,
  cleanNote,
  fitChangesPrior,
  hasSource,
  idsOf,
  makeRefOf,
  addReady,
  noSourceSummary,
  noteFit,
  wordDiff,
  newChangeId,
  noTarget,
  planLinks,
  roomLeft,
  SUGGEST_MAX,
  useTray,
  validateChange,
  type Change,
  type ChangeTarget,
} from "./changes";
import { holdFocus } from "./modal";
import { cleanQuestion } from "./questions";
import { lineAnchor } from "./format";
import { formatNumbers } from "./numbers";
import { proofIdsOf, settleOf, speakerText } from "./settle";
import { to } from "./route";
import type { ChangeType } from "./changes";
import { lineInFile, originOfLine } from "./changeResult";
import type { Prior } from "./bodies";
import type { RecordModel } from "./model";
import type { Line } from "./page";

/** The research price as the tray shows it, read again when the tray opens, when Review opens and while it is open. */
export interface Quote {
  text: string;
  failed: boolean;
  /** Reads it again, for the exact request when its body is given. */
  refresh: (body?: Record<string, unknown>) => void;
}

/** What the tray hands to the pay dialog: an Ask of the changes kind (src/requests/changes.ts). */
export type ChangesAsk = Ask;

/* ---------- Shared state: which panel is open, and the tray ---------- */

interface SuggestState {
  subject: string;
  tray: ReturnType<typeof useTray>;
  /** The key of the target whose panel is open, or null. */
  open: string | null;
  setOpen: (key: string | null) => void;
  /** Each saved change's target as the record shows it now (by change id), or null when its row is gone. */
  live: Map<string, ChangeTarget | null>;
  /**
   * The open form's note and links being written, by subject: kept here, above the tabs, so a visitor who looks at
   * Record while writing finds the draft again. Cleared on Add to my changes. A ref, so typing re-renders nothing else.
   */
  drafts: React.MutableRefObject<Map<string, { note: string; links: string }>>;
  /**
   * The length of the objective of a changes job that carries this change alone, as Review would build it (the page
   * as F1, earlier results, panel answers and channels): the budget the open form's Sources and Edit links use.
   * Null when the record cannot be measured.
   */
  measure: (c: Change) => number | null;
}
const Ctx = createContext<SuggestState | null>(null);

/**
 * Where a saved change's target is now. A line is found by the file and line id saved with the change: in the page
 * shown, in a job not folded in, or through the from origins of a rebuild that carried it forward (its id may have
 * changed). Null when it is no longer shown: the visitor chooses the row again before submitting.
 */
export function liveTarget(rec: Pick<RecordModel, "scope" | "resolve">, t: ChangeTarget): ChangeTarget | null {
  if (t.kind === "sentence" || t.kind === "none") return t;
  if (t.lost) return null;
  if (t.kind === "keyfact" && !idsOf(t).length && !t.file) return t;
  const has = (x: string) => !!rec.resolve(x);
  let id: string | null = null;
  if (t.file && t.fileLine) id = lineInFile(t.file, t.fileLine, rec.scope, has);
  // A draft saved before files were kept with it: only while that id still names the same sentence.
  else if (t.lineId && has(t.lineId) && (t.kind === "keyfact" || rec.resolve(t.lineId)!.text === t.text)) id = t.lineId;
  if (!id) return null;
  if (t.kind === "line") return { ...t, lineId: id, key: `line:${id}` };
  // The row's other lines: those still on the record, after the one found again.
  const rest = idsOf(t).filter((x) => x !== t.lineId && x !== id && has(x));
  return { ...t, lineId: id, lineIds: [id, ...rest] };
}

/** The objective length of a changes job with this one change, or null for a record without what a request needs. */
export function measureChange(rec: Pick<RecordModel, "scope" | "resolve" | "sections"> & Partial<RecordModel>, c: Change): number | null {
  if (!rec.subject || !rec.promptChannels || !rec.after || !rec.results || !rec.answers) return null;
  return planChanges(rec as RecordModel, [c], new Map([[c.id, liveTarget(rec, c.target)]])).body.objective.length;
}

export function SuggestProvider({ subject, rec, children }: { subject: string; rec: Pick<RecordModel, "scope" | "resolve" | "sections"> & Partial<RecordModel>; children: React.ReactNode }) {
  const tray = useTray(subject);
  const [open, setOpen] = useState<string | null>(null);
  const drafts = useRef(new Map<string, { note: string; links: string }>());
  // rec.resolve is new on every render; the record's sections and scope are what it reads.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const live = useMemo(() => new Map(tray.list.map((c) => [c.id, liveTarget(rec, c.target)] as const)), [tray.list, rec.sections, rec.scope]);
  const measure = useCallback((c: Change) => measureChange(rec, c), [rec]);
  const value = useMemo(() => ({ subject, tray, open, setOpen, live, drafts, measure }), [subject, tray, open, live, measure]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSuggest(): SuggestState {
  const s = useContext(Ctx);
  if (!s) throw new Error("SuggestProvider missing");
  return s;
}

/** The pending change about this target, if any. */
export const pendingFor = (s: SuggestState, key: string) => s.tray.list.find((c) => s.live.get(c.id)?.key === key) ?? null;

/* ---------- The pencil and the pending tag ---------- */

export function Pencil({ target, label = "Suggest a change" }: { target: ChangeTarget; label?: string }) {
  const s = useSuggest();
  const open = s.open === target.key;
  return (
    <button type="button" className={`pencil${open ? " is-on" : ""}`} aria-label={label} title={label} aria-expanded={open} onClick={() => s.setOpen(open ? null : target.key)}>
      <svg viewBox="0 0 20 20" width="16" height="16" aria-hidden="true" focusable="false">
        <path d="M13.6 3.2a1.9 1.9 0 0 1 2.7 0l.5.5a1.9 1.9 0 0 1 0 2.7l-8.9 8.9-3.6.9.9-3.6 8.4-8.4Z" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
        <path d="M12.2 4.6l3.2 3.2" stroke="currentColor" strokeWidth="1.6" />
      </svg>
    </button>
  );
}

export function PendingTag({ targetKey }: { targetKey: string }) {
  const s = useSuggest();
  const c = pendingFor(s, targetKey);
  if (!c) return null;
  return (
    <span className="pending">
      <span className="tag-pending">In your changes</span>
      <button type="button" className="linklike small" onClick={() => s.setOpen(targetKey)}>
        Edit
      </button>
    </span>
  );
}

/* ---------- The panel ---------- */

/**
 * "line": a Record line or Key facts row; "sentence": a summary sentence; "open": the Contribute form, about
 * nothing in particular (a note with no target).
 */
export type PanelMode = "line" | "sentence" | "open";
const QUICK: Record<PanelMode, ChangeType[]> = { line: QUICK_LINE, sentence: QUICK_SENTENCE, open: [] };

/** One supporting line as the panel lists it: its marker, who said it, its text and quote. */
export interface Evidence {
  id: string;
  text: string;
  mark: "Proven" | "Contradicted" | "Statement" | "Claim";
  tone: "proven" | "contradicted" | "statement" | "claim";
  who: string;
  quote: string;
  /** A re-runnable check: it has no quote of its own. */
  proof: boolean;
}

/** The marker and speaker of each line, by the record's own rule: settled lines and proofs read Proven. */
export function evidenceOf(lines: Line[], all: Line[] = lines): Evidence[] {
  const proofs = proofIdsOf(all);
  return lines.map((l) => {
    const st = settleOf(l, proofs).state;
    const mark: Evidence["mark"] = st === "contradicted" ? "Contradicted" : l.kind === "proof" || st === "proven" ? "Proven" : l.kind === "statement" ? "Statement" : "Claim";
    const who = l.kind === "proof" ? l.by || "Re-runnable check" : speakerText(l);
    return { id: l.id, text: l.text, mark, tone: mark.toLowerCase() as Evidence["tone"], who, quote: l.quote, proof: l.kind === "proof" };
  });
}

/** How many supporting lines the panel lists before "and N more". */
export const EVIDENCE_MAX = 4;

/**
 * Brings an opened panel into view below the sticky header (and above the tray bar): when it fits, as little
 * scrolling as needed; when it is taller than the room left, its heading and evidence start just under the header.
 */
export function revealPanel(el: HTMLElement) {
  const head = document.querySelector<HTMLElement>(".top");
  const tray = document.querySelector<HTMLElement>(".tray");
  const top = (head ? Math.max(0, head.getBoundingClientRect().bottom) : 0) + 8;
  const bottom = (tray ? Math.min(innerHeight, tray.getBoundingClientRect().top) : innerHeight) - 8;
  const r = el.getBoundingClientRect();
  let dy = 0;
  if (r.top < top) dy = r.top - top;
  else if (r.bottom > bottom) dy = Math.min(r.bottom - bottom, r.top - top);
  if (dy) window.scrollBy({ top: dy, behavior: "instant" as ScrollBehavior });
}

function EvidenceMark({ e }: { e: Evidence }) {
  return (
    <span className={`kind kind-${e.tone}`}>
      <ToneMark tone={e.tone} />
      {e.mark}
    </span>
  );
}

/**
 * The top of the panel. A sentence or key facts row: "This rests on", one line per row (marker, who, text, and on a
 * key facts row the quote), each opening that line; at most 4, then "and N more". A Record line: its own marker,
 * speaker and quote.
 */
function EvidenceList({ mode, target, evidence, onOpenLines }: { mode: PanelMode; target: ChangeTarget; evidence: Evidence[]; onOpenLines?: (ids: string[]) => void }) {
  if (mode === "open") return null;
  if (mode === "line" && target.kind === "line") {
    const e = evidence[0];
    if (!e) return null;
    return (
      <div className="ev ev-own">
        <p className="ev-meta">
          <EvidenceMark e={e} />
          {e.who && <span className="ev-who">{e.who}</span>}
        </p>
        {e.quote ? <p className="ev-quote">“{formatNumbers(e.quote)}”</p> : <p className="ev-quote small">No quote: this line is a re-runnable check.</p>}
      </div>
    );
  }
  const shown = evidence.slice(0, EVIDENCE_MAX);
  const more = evidence.length - shown.length;
  const open = (ids: string[]) => (e: React.MouseEvent) => {
    if (!onOpenLines) return;
    e.preventDefault();
    onOpenLines(ids);
  };
  return (
    <div className="ev">
      <p className="ev-h">This rests on</p>
      {shown.length ? (
        <ul className="ev-list">
          {shown.map((e) => (
            <li key={e.id}>
              <a className="ev-row" href={to(lineAnchor(e.id))} onClick={open([e.id])}>
                <span className="ev-meta">
                  <EvidenceMark e={e} />
                  {e.who && <span className="ev-who">{e.who}</span>}
                </span>
                {target.kind === "keyfact" ? (
                  // A key facts row: the line's own quote, whole and wrapped; a line with none says so.
                  e.quote ? (
                    <span className="ev-quote ev-quote-full">“{formatNumbers(e.quote)}”</span>
                  ) : (
                    <span className="ev-quote ev-quote-full">
                      <span className="ev-noquote">{e.proof ? "No quote: this line is a re-runnable check." : "No quote given."}</span> {formatNumbers(e.text)}
                    </span>
                  )
                ) : (
                  <span className="ev-text" title={e.text}>{formatNumbers(e.text)}</span>
                )}
              </a>
            </li>
          ))}
        </ul>
      ) : (
        <p className="small">{target.kind === "keyfact" ? "This row names no lines of the record yet." : "This sentence names no lines of the record."}</p>
      )}
      {more > 0 && (
        <p className="small">
          <a href={to(lineAnchor(evidence[EVIDENCE_MAX]!.id))} onClick={open(evidence.map((e) => e.id))}>
            and {more} more
          </a>
        </p>
      )}
    </div>
  );
}

/**
 * The same "This rests on" list a summary sentence's panel opens with, on its own: How it works opens it under a step,
 * in place, each line still opening that line in Record.
 */
export function RestsOn({ text, evidence, onOpenLines, id }: { text: string; evidence: Evidence[]; onOpenLines: (ids: string[]) => void; id?: string }) {
  return (
    <div className="cpanel rests-on" id={id} role="region" aria-label="What this step rests on">
      <EvidenceList mode="sentence" target={{ kind: "sentence", key: `step:${text}`, lineId: "", text }} evidence={evidence} onOpenLines={onOpenLines} />
    </div>
  );
}

/** What the panel used to read from a line for "Ask a panel to check it" (hidden for now); still accepted. */
export type SeedLine = { text: string; kind?: string; by?: string; rerun?: string; fact?: { value: string; unit?: string; chain?: string } | null };

/** The pending change a panel edits: only one it can show (a note, or one of its quick choices). */
const editable = (c: Change | null) => (c && c.type !== "new_line" && c.type !== "links" ? c : null);

/**
 * One open form, in two places. On Contribute (mode "open"): "What's wrong or missing?", a text area of up to 1,000
 * characters, Sources (one link per line), Add to my changes, and three lines on what happens next. Opened by the
 * pencil on a line, key facts row or summary sentence: the same form under it, with the item shown above as
 * "About: <text>", what it rests on, and optional quick choices (This is wrong, Add context, Back this up; on a
 * sentence Reword it). With no choice picked the change is a note. A note may be links alone.
 */
export function ChangePanel({ target, mode, evidence = [], onClose, onOpenLines }: { target: ChangeTarget; mode: PanelMode; evidence?: Evidence[]; sourceUrl?: string; line?: SeedLine; onClose?: () => void; onOpenLines?: (ids: string[]) => void }) {
  const s = useSuggest();
  const inline = mode !== "open";
  const existing = inline ? editable(pendingFor(s, target.key)) : null;
  const quick = QUICK[mode];
  const [type, setType] = useState<ChangeType>(existing?.type ?? "note");
  // The open form starts from the draft kept for this subject; a pencil's form from its pending change.
  const draft = !inline ? s.drafts.current.get(s.subject) : undefined;
  const [note, setNoteState] = useState(existing?.note ?? draft?.note ?? "");
  const [links, setLinksState] = useState(draft?.links ?? (existing?.links ?? []).join("\n"));
  const keep = (next: { note?: string; links?: string }) => {
    if (inline) return;
    const cur = s.drafts.current.get(s.subject) ?? { note: "", links: "" };
    const d = { ...cur, ...next };
    if (!d.note && !d.links) s.drafts.current.delete(s.subject);
    else s.drafts.current.set(s.subject, d);
  };
  const setNote = (v: string) => {
    setNoteState(v);
    keep({ note: v });
  };
  const setLinks = (v: string) => {
    setLinksState(v);
    keep({ links: v });
  };
  const [corrected, setCorrected] = useState(existing?.suggest ?? "");
  const [errs, setErrs] = useState<{ note?: string; links?: string }>({});
  const [added, setAdded] = useState(0);
  const id = useId();
  const ref = useRef<HTMLDivElement>(null);
  // Sources: as many links as fit in one request. The budget is the objective's length check, measured on this note
  // as Review would send it.
  const plan = useMemo(() => planLinks(links), [links]);
  const suggestText = type === "wrong" && mode === "sentence" && cleanNote(corrected) ? cleanNote(corrected).slice(0, SUGGEST_MAX) : "";
  const length = useMemo(
    () => s.measure({ id: existing?.id ?? "draft", type, target: inline ? target : OPEN_TARGET, note: cleanNote(note), links: plan.links, ...(suggestText ? { suggest: suggestText } : {}) }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [s.measure, type, note, plan.links, suggestText, inline, target.key],
  );
  // The exact sentence of the result and the sentence as the page shows it: neither counts as a rewording.
  const current = type === "reword" ? [target.text, formatNumbers(target.text)] : "";
  const ready = addReady(type, note, plan.links, plan.rejected.length, current, length);
  // The pencil, sentence or Edit button that opened the panel: focus goes back there when it closes.
  const opener = useRef<Element | null>(typeof document === "undefined" ? null : document.activeElement);
  const close = () => {
    s.setOpen(null);
    onClose?.();
    const back = opener.current;
    requestAnimationFrame(() => {
      if (back instanceof HTMLElement && back.isConnected && back !== document.body) back.focus({ preventScroll: true });
    });
  };
  // "Answer this" lands here with "Answer to: <the question>" filled in: the cursor goes to the next line.
  useEffect(() => {
    if (inline || !takeCaret()) return;
    const put = () => {
      const ta = ref.current?.querySelector<HTMLTextAreaElement>("textarea");
      if (!ta) return;
      ta.focus({ preventScroll: true });
      ta.setSelectionRange(ta.value.length, ta.value.length);
    };
    put();
    const t = window.setTimeout(put, 150);
    return () => window.clearTimeout(t);
  }, [inline]);
  // "Answer this" pressed while this form is on screen (Contribute's Open questions): take the new draft, scroll the
  // form into view and put the cursor on the line after the question.
  useEffect(() => {
    if (inline) return;
    let t = 0;
    const on = () => {
      takeCaret();
      const d = s.drafts.current.get(s.subject);
      setNoteState(d?.note ?? "");
      setLinksState(d?.links ?? "");
      const put = () => {
        const ta = ref.current?.querySelector<HTMLTextAreaElement>("textarea");
        if (!ta) return;
        ta.scrollIntoView?.({ block: "center" });
        ta.focus({ preventScroll: true });
        ta.setSelectionRange(ta.value.length, ta.value.length);
      };
      window.requestAnimationFrame(put);
      window.clearTimeout(t);
      t = window.setTimeout(put, 150);
    };
    window.addEventListener(ANSWER_EVENT, on);
    return () => {
      window.removeEventListener(ANSWER_EVENT, on);
      window.clearTimeout(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inline, s.subject]);
  useEffect(() => {
    if (!inline) return;
    ref.current?.querySelector<HTMLElement>("textarea")?.focus({ preventScroll: true });
    if (ref.current) revealPanel(ref.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // A quick choice is optional: pressing the one that is on turns it off again, and the change is a note.
  const pick = (t: ChangeType) => {
    const next: ChangeType = t === type ? "note" : t;
    if (next === "reword" && !note.trim()) setNote(target.text);
    if (type === "reword" && next !== "reword" && sameSentence(note, [target.text])) setNote("");
    setType(next);
    setErrs({});
  };
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const found = validateChange(type, note, plan.links, current);
    if (plan.rejected.length && !found.links) found.links = `Fix or remove: ${plan.rejected[0]!.line.slice(0, 60)} (${plan.rejected[0]!.why}).`;
    if (!found.note && !found.links && noteFit(length)) found.links = noteFit(length);
    setErrs(found);
    if (found.note) return document.getElementById(`${id}-note`)?.focus();
    if (found.links) return document.getElementById(`${id}-links`)?.focus();
    const c: Change = {
      id: existing?.id ?? newChangeId(),
      type,
      target: inline ? target : noTarget(),
      note: cleanNote(note),
      links: plan.links,
      ...(suggestText ? { suggest: suggestText } : {}),
    };
    s.tray.put(c);
    if (inline) return close();
    // The open form stays: emptied for the next note, with a word that this one is in the tray.
    setNote("");
    setLinks("");
    setType("note");
    setAdded((n) => n + 1);
    document.getElementById(`${id}-note`)?.focus();
  };
  const remove = () => {
    if (existing) s.tray.remove(existing.id);
    close();
  };
  const count = cleanNote(note).length;
  const rejectedNow = plan.rejected[0];
  const Heading = inline ? "p" : "h2";
  return (
    <div ref={ref} className={inline ? "cpanel" : "noteform"} role={inline ? "group" : undefined} aria-labelledby={inline ? `${id}-h` : undefined} onKeyDown={inline ? (e) => e.key === "Escape" && (e.stopPropagation(), close()) : undefined}>
      <Heading id={`${id}-h`} className={inline ? "cpanel-h" : "note-h"}>
        {NOTE_HEADING}
      </Heading>
      {inline && (
        <p className="about">
          <span className="about-k">About:</span> <span className="about-t">{formatNumbers(target.text)}</span>
        </p>
      )}
      <EvidenceList mode={mode} target={target} evidence={evidence} onOpenLines={onOpenLines} />
      <form className="form" onSubmit={submit} noValidate>
        {quick.length > 0 && (
          <div className="quick" role="group" aria-label="Optional: what kind of change">
            <span className="quick-k">Optional</span>
            {quick.map((c) => (
              <button key={c} type="button" className="qchip" aria-pressed={type === c} title={CHANGE_HINTS[c]} onClick={() => pick(c)}>
                {CHANGE_WORDS[c]}
              </button>
            ))}
          </div>
        )}
        {type === "reword" ? (
          <>
            <label htmlFor={`${id}-note`}>The new sentence</label>
            <p className="small">{evidence.length ? KEPT_RULE : KEPT_RULE.replace("those lines, or a link you add, support it", "a link you add supports it")}</p>
          </>
        ) : null}
        <textarea
          id={`${id}-note`}
          rows={inline ? 4 : 5}
          value={note}
          placeholder={type === "reword" ? undefined : NOTE_PLACEHOLDER}
          aria-labelledby={type === "reword" ? undefined : `${id}-h`}
          onChange={(e) => setNote(e.target.value)}
          aria-invalid={!!errs.note}
          aria-describedby={`${id}-count${errs.note ? ` ${id}-note-err` : ""}`}
        />
        <p id={`${id}-count`} className={count > NOTE_MAX ? "error" : "small"}>
          {count.toLocaleString("en-US")} of {NOTE_MAX.toLocaleString("en-US")} characters
        </p>
        {errs.note && <p id={`${id}-note-err`} className="error">{errs.note}</p>}
        {type === "wrong" && mode === "sentence" && (
          <>
            <label htmlFor={`${id}-corrected`}>Corrected sentence (optional)</label>
            <textarea id={`${id}-corrected`} rows={2} maxLength={SUGGEST_MAX} value={corrected} onChange={(e) => setCorrected(e.target.value)} aria-describedby={`${id}-corrected-hint`} />
            <p id={`${id}-corrected-hint`} className="small">Sent as a suggestion. If the change is added, the summary shows the corrected sentence the job writes.</p>
          </>
        )}
        <label htmlFor={`${id}-links`}>{SOURCES_LABEL}</label>
        <p id={`${id}-links-hint`} className="small">{SOURCES_HINT}</p>
        <textarea
          id={`${id}-links`}
          rows={inline ? 2 : 3}
          spellCheck={false}
          autoCapitalize="none"
          autoComplete="off"
          placeholder="https://example.com/article"
          value={links}
          onChange={(e) => setLinks(e.target.value)}
          aria-invalid={!!errs.links || !!rejectedNow}
          aria-describedby={`${id}-links-hint${errs.links || rejectedNow ? ` ${id}-links-err` : ""}`}
        />
        {(errs.links || rejectedNow) && (
          <p id={`${id}-links-err`} className="error">
            {errs.links ?? `Cannot use ${rejectedNow!.line.slice(0, 60)}: ${rejectedNow!.why}.`}
          </p>
        )}
        <div className="row-actions">
          <button className="btn btn-ink" type="submit" disabled={!ready.ok} aria-describedby={ready.ok ? undefined : `${id}-need`}>
            Add to my changes
          </button>
          {inline && (
            <button className="btn" type="button" onClick={close}>
              Cancel
            </button>
          )}
          {existing && (
            <button className="linklike small" type="button" onClick={remove}>
              Remove
            </button>
          )}
        </div>
        {!ready.ok && (note.trim() || links.trim()) ? (
          <p id={`${id}-need`} className="small" aria-live="polite">
            {ready.need}
          </p>
        ) : !ready.ok ? (
          <p id={`${id}-need`} className="sr-only">
            {ready.need}
          </p>
        ) : null}
        {!inline && added > 0 && (
          <p className="added small" role="status">
            Added to your changes. Review and submit them from the bar at the bottom.
          </p>
        )}
      </form>
      {!inline && (
        <ol className="note-steps">
          {NOTE_STEPS.map((t) => (
            <li key={t}>{t}</li>
          ))}
        </ol>
      )}
    </div>
  );
}

/** The open form's target: none. Each note added from it gets a new target key of its own (noTarget). */
export const OPEN_TARGET: ChangeTarget = { kind: "none", key: "open", lineId: "", text: "" };

/** The Contribute form: "What's wrong or missing?" */
let caretPending = false;
const takeCaret = () => {
  const v = caretPending;
  caretPending = false;
  return v;
};
/** The note "Answer this" fills in: the question on the first line, the cursor on the next. */
export const answerNote = (question: string) => `Answer to: ${cleanQuestion(question)}\n`;
/** Sent when "Answer this" fills the draft, so a form already on screen takes it at once. */
export const ANSWER_EVENT = "swarmpedia-answer";
/**
 * "Answer this" on an open question: the Contribute form's draft becomes "Answer to: <the question>" and a new line
 * (any links already written are kept), and Contribute opens with the cursor on that line.
 */
export function startAnswer(s: Pick<SuggestState, "drafts" | "subject">, question: string, href: string) {
  const cur = s.drafts.current.get(s.subject);
  s.drafts.current.set(s.subject, { note: answerNote(question), links: cur?.links ?? "" });
  caretPending = true;
  window.dispatchEvent(new Event(ANSWER_EVENT));
  location.hash = href;
}

export function NoteForm() {
  return <ChangePanel target={OPEN_TARGET} mode="open" />;
}

/* ---------- The tray: the bar, and the review ---------- */

/**
 * The changes job's own <PRIOR> and body. The file of every row a change targets is reserved first (see
 * fitChangesPrior), so each target carries its file number and line id. A change whose row is gone after a rebuild
 * (gone), or whose file does not fit (unplaced), holds the submission until the visitor fixes it.
 */
export function planChanges(rec: Pick<RecordModel, "pageHash" | "after" | "scope" | "results" | "answers" | "channels" | "promptChannels" | "subject">, list: Change[], live: Map<string, ChangeTarget | null>) {
  const changes = list.map((c) => {
    const t = live.get(c.id);
    return t ? { ...c, target: t } : c;
  });
  const gone = new Set(list.filter((c) => live.get(c.id) === null).map((c) => c.id));
  const pageUrl = rec.pageHash ? artifactUrl(rec.pageHash) : null;
  const jobFiles = new Map(rec.after.filter((a) => a.fileHash).map((a) => [a.req.requestId, artifactUrl(a.fileHash!)] as const));
  const targeted = changes.filter((c) => !gone.has(c.id) && (c.target.kind === "line" || c.target.kind === "keyfact") && idsOf(c.target).length > 0);
  const required = targeted.flatMap((c) =>
    idsOf(c.target).flatMap((lineId) => {
      const o = originOfLine(lineId, rec.scope);
      return o ? [artifactUrl(o.file)] : [];
    }),
  );
  // The same channel budget as a rebuild: the channels that do not fit stay listed in F1.
  const ch = rec.promptChannels;
  const measure = (p: Prior) => changesObjective(changes, p, ch.list, rec.subject, makeRefOf(p, pageUrl, jobFiles), ch.more).length;
  const fit = fitChangesPrior(pageUrl, rec.results, rec.answers, required, measure);
  const refOf = makeRefOf(fit.prior, pageUrl, jobFiles);
  const body = CHANGES.body({ changes, prior: fit.prior, channels: ch.list, subject: rec.subject, refOf, moreChannels: ch.more }) as ReturnType<typeof changesBody>;
  const unplaced = new Set(targeted.filter((c) => idsOf(c.target).some((x) => !refOf(x))).map((c) => c.id));
  // Never sent with an empty target: a line or key facts row with neither a line reference nor its text.
  for (const c of changes) if ((c.target.kind === "line" || c.target.kind === "keyfact") && !c.target.text.trim() && !idsOf(c.target).some((x) => refOf(x))) unplaced.add(c.id);
  return { body, refOf, gone, unplaced, room: roomLeft(body.objective.length, changes, refOf), over: !fitsObjective(body.objective.length) };
}

export function useChangesPlan(rec: RecordModel, list: Change[], live: Map<string, ChangeTarget | null>) {
  return useMemo(() => planChanges(rec, list, live), [rec, list, live]);
}

const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? "" : "s"}`;
/** How often the tray reads the price again while it is shown. */
export const PRICE_EVERY_MS = 30_000;

export function TrayBar({ rec, quote, onAsk }: { rec: RecordModel; quote: Quote; onAsk: (a: ChangesAsk) => void }) {
  const s = useSuggest();
  const list = s.tray.list;
  const [review, setReview] = useState(false);
  const plan = useChangesPlan(rec, list, s.live);
  const on = list.length > 0;
  const { refresh: readQuote } = quote;
  // The price is read for the request as it stands now, through the changes kind.
  const bodyNow = useRef(plan.body);
  bodyNow.current = plan.body;
  const refresh = useCallback(() => readQuote(bodyNow.current), [readQuote]);
  useEffect(() => {
    document.body.classList.toggle("has-tray", on);
    return () => document.body.classList.remove("has-tray");
  }, [on]);
  // The price is read when the tray first shows, and again every 30 seconds while it stays.
  useEffect(() => {
    if (!on) return;
    refresh();
    const t = setInterval(refresh, PRICE_EVERY_MS);
    return () => clearInterval(t);
  }, [on, refresh]);
  // The bar of a sent request sits above the tray: its height is published for the stylesheet.
  const bar = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = bar.current;
    if (!on || !el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => document.body.style.setProperty("--tray-h", `${el.offsetHeight}px`));
    ro.observe(el);
    return () => ro.disconnect();
  }, [on]);
  if (!on) return null;
  const openReview = () => {
    refresh();
    setReview(true);
  };
  return (
    <>
      <div ref={bar} className="tray" role="region" aria-label="Your changes">
        <div className="tray-in">
          <p className="tray-text" aria-live="polite">
            <strong>{plural(list.length, "change")}</strong>
            <span aria-hidden="true">·</span>
            <span className="tray-price">
              <span className="mono">{quote.text}</span>
              {quote.failed && (
                <>
                  {" "}
                  <button type="button" className="linklike small tray-retry" onClick={refresh}>
                    Retry
                  </button>
                </>
              )}
            </span>
          </p>
          <button type="button" className="btn btn-tray" onClick={openReview}>
            Review and submit
          </button>
        </div>
      </div>
      {review && <Review rec={rec} quote={{ ...quote, refresh }} onClose={() => setReview(false)} onAsk={onAsk} />}
    </>
  );
}

/**
 * The links of one change in Review: Add a link when it has none, Edit links when it has some. A change put back
 * after it was not kept for lack of a source opens with its previous links, to replace or remove them.
 */
function LinkEditor({ change }: { change: Change }) {
  const s = useSuggest();
  const [open, setOpen] = useState(!!change.retry && change.links.length > 0);
  const [v, setV] = useState(change.links.join("\n"));
  const [err, setErr] = useState("");
  const id = useId();
  const btn = useRef<HTMLButtonElement>(null);
  const box = useRef<HTMLTextAreaElement>(null);
  const opened = useRef(false);
  // Focus goes into the links box when the editor opens, and back to Add a link or Edit links when it closes.
  // Saving re-mounts this editor (its key holds the links), so the new one takes focus back from refocusLinks.
  useEffect(() => {
    if (open) box.current?.focus();
    else if (opened.current || refocusLinks === change.id) {
      refocusLinks = null;
      btn.current?.focus();
    }
    opened.current = open;
  }, [open, change.id]);
  if (!open)
    return (
      <button ref={btn} type="button" className="linklike small" onClick={() => setOpen(true)}>
        {change.links.length ? "Edit links" : "Add a link"}
      </button>
    );
  const save = () => {
    // As many links as fit in one request: the same objective length check as the open form.
    const p = planLinks(v);
    if (p.rejected.length) return setErr(`Fix or remove: ${p.rejected[0]!.line.slice(0, 60)} (${p.rejected[0]!.why}).`);
    if (!p.links.length && (change.type === "backing" || change.type === "links" || (change.type === "note" && !change.note))) return setErr("Paste at least one https link.");
    const over = noteFit(s.measure({ ...change, links: p.links, retry: undefined }));
    if (over) return setErr(over);
    refocusLinks = change.id;
    s.tray.put({ ...change, links: p.links, retry: undefined });
    setErr("");
    setOpen(false);
  };
  return (
    <span className="addlink block">
      <label htmlFor={id} className="small block">
        {change.retry ? "Replace or remove the links it was sent with" : "Links"}, one per line, as many as fit in one request
      </label>
      <textarea ref={box} id={id} rows={Math.min(Math.max(change.links.length, 2), 6)} spellCheck={false} autoCapitalize="none" autoComplete="off" placeholder="https://example.com/article" value={v} onChange={(e) => setV(e.target.value)} aria-invalid={!!err} aria-describedby={err ? `${id}-err` : undefined} />
      <span className="row-actions">
        <button type="button" className="btn btn-small" onClick={save}>
          Save links
        </button>
        <button type="button" className="btn btn-small" onClick={() => (setOpen(false), setV(change.links.join("\n")), setErr(""))}>
          Cancel
        </button>
      </span>
      {err && (
        <span id={`${id}-err`} className="error block">
          {err}
        </span>
      )}
    </span>
  );
}

/** The change whose links were just saved: its re-mounted editor puts focus back on its button. */
let refocusLinks: string | null = null;

/** A change's note in Review. A rewording shows only the new sentence, with the words that changed in bold. */
function ReviewNote({ change: c }: { change: Change }) {
  if (c.type !== "reword") return <p className="review-note">{c.note}</p>;
  return (
    <p className="review-note">
      {wordDiff(c.target.text, c.note).map((p, i) => (
        <Fragment key={i}>
          {i > 0 && " "}
          {p.changed ? <strong>{p.text}</strong> : p.text}
        </Fragment>
      ))}
    </p>
  );
}

function Review({ rec, quote, onClose, onAsk }: { rec: RecordModel; quote: Quote; onClose: () => void; onAsk: (a: ChangesAsk) => void }) {
  const s = useSuggest();
  const list = s.tray.list;
  const plan = useChangesPlan(rec, list, s.live);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const release = ref.current ? holdFocus(ref.current, onClose) : () => undefined;
    ref.current?.querySelector<HTMLElement>("h2")?.focus();
    return release;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (!list.length) onClose();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [list.length]);
  const ready = rec.snapshot.ok;
  const held = plan.gone.size + plan.unplaced.size;
  const n = list.length;
  const noSource = list.filter((c) => !hasSource(c)).length;
  const [showBody, setShowBody] = useState(false);
  // Read the full request goes to it: the request is shown, focused and scrolled into view inside the dialog.
  useEffect(() => {
    if (showBody) document.getElementById("review-body")?.focus();
  }, [showBody]);
  const submit = () => {
    if (!ready || plan.over || held) return;
    const clear = s.tray.clear;
    onClose();
    onAsk(askOf(CHANGES, plan.body, { title: `Submit ${plural(n, "change")}`, subject: rec.subject.id, afterSent: clear }));
  };
  return (
    <div className="sheet-bg" onClick={onClose}>
      <div ref={ref} className="sheet sheet-wide" role="dialog" aria-modal="true" aria-labelledby="review-title" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-head">
          <h2 id="review-title" tabIndex={-1}>Review your changes</h2>
          <button className="x" aria-label="Close" onClick={onClose}>×</button>
        </div>
        <p className="small review-meta">
          {n - noSource} with a source, {noSource} without
          <span aria-hidden="true"> · </span>
          {plan.over ? `over the ${MAX_OBJECTIVE.toLocaleString("en-US")}-character limit` : `room for about ${plan.room} more`}
        </p>
        <ol className="review">
          {list.map((c) => (
            <li key={c.id} className="review-item">
              <p className="review-tags">
                <span className={`ctag ctag-${c.type}`}>{CHANGE_WORDS[c.type]}</span>
                {!hasSource(c) && <span className="ctag ctag-nosource">No source</span>}
              </p>
              {c.target.text && c.type !== "reword" && (
                <p className="review-about" title={c.target.text}>
                  {formatNumbers(c.target.text)}
                </p>
              )}
              {plan.gone.has(c.id) && (
                <p className="warn">
                  This row is no longer on the record as it was: a rebuild changed or removed it. Remove this change and choose the row again on the{" "}
                  <a href={to("record")} onClick={onClose}>Record</a>.
                </p>
              )}
              {plan.unplaced.has(c.id) && <p className="warn">The file this row comes from does not fit in one request with the others. Remove some changes and send this one on its own.</p>}
              {c.retry && <p className="small">Not added last time: {c.retry}</p>}
              {c.note && <ReviewNote change={c} />}
              {c.links.length > 0 && (
                <ul className="review-links small">
                  {c.links.map((u) => (
                    <li key={u} className="mono break">{u}</li>
                  ))}
                </ul>
              )}
              <span className="row-actions review-actions">
                <LinkEditor key={`${c.id}:${c.links.join(" ")}`} change={c} />
                <button type="button" className="linklike small" onClick={() => s.tray.remove(c.id)}>
                  Remove
                </button>
              </span>
            </li>
          ))}
        </ol>
        {noSource > 0 && <p className="nosource">{noSourceSummary(noSource)}</p>}
        {showBody && (
          <div id="review-body" className="review-body" tabIndex={0} aria-label="The full request">
            <h4>The objective</h4>
            <p className="objective">{plan.body.objective}</p>
            <InstructionsBlock name="changes" id="review-ins" />
            <h4>The request body</h4>
            <pre className="body mono" tabIndex={0} aria-label="Request body">
              {JSON.stringify(plan.body, null, 2)}
            </pre>
          </div>
        )}
        {!ready && <p className="warn">{rec.snapshot.why}</p>}
        {plan.over && <p className="warn">The request is {plan.body.objective.length.toLocaleString("en-US")} characters, over the {MAX_OBJECTIVE.toLocaleString("en-US")} this site allows. Remove a change or shorten a note.</p>}
        {held > 0 && <p className="warn">{plural(held, "change")} above need{held === 1 ? "s" : ""} your attention before you submit.</p>}
        <div className="review-foot">
          <p className="review-price">
            {quote.failed ? (
              <>
                {quote.text}{" "}
                <button type="button" className="linklike" onClick={() => quote.refresh()}>
                  Retry price
                </button>
              </>
            ) : /IMD$/.test(quote.text) ? (
              `${quote.text} for all ${n}`
            ) : (
              quote.text
            )}
          </p>
          <a
            className="review-read"
            href="#review-body"
            aria-expanded={showBody}
            aria-controls="review-body"
            onClick={(e) => {
              // The request shows in place: the address of the page stays as it is.
              e.preventDefault();
              setShowBody((v) => !v);
            }}
          >
            {showBody ? "Hide the full request" : "Read the full request"}
          </a>
          <button type="button" className="btn btn-primary review-submit" onClick={submit} disabled={!ready || plan.over || held > 0}>
            Submit
          </button>
        </div>
      </div>
    </div>
  );
}
