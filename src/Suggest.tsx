/** Suggest changes where you read: the pencil, the inline panel, the tray bar at the bottom and its review. */
import { createContext, Fragment, useContext, useEffect, useId, useMemo, useRef, useState } from "react";
import { ACTIONS } from "./config";
import { artifactUrl, fitsObjective, MAX_OBJECTIVE } from "./bodies";
import { InstructionsBlock } from "./Instructions";
import {
  CHANGE_HINTS,
  CHANGE_MAX_LINKS,
  CHANGE_WORDS,
  KEPT_RULE,
  NO_SOURCE,
  NOTE_MAX,
  PANEL_HINT,
  PANEL_WORDS,
  READ_MAX_LINKS,
  changesBody,
  changesObjective,
  cleanNote,
  fitChangesPrior,
  hasSource,
  idsOf,
  makeRefOf,
  NOTE_MIN,
  addReady,
  noSourceSummary,
  wordDiff,
  newChangeId,
  noTarget,
  planLinks,
  roomLeft,
  setConfirmSeed,
  seedFromLine,
  SUGGEST_MAX,
  useTray,
  validateChange,
  needsNote,
  type Change,
  type ChangeTarget,
  type ChangeType,
} from "./changes";
import { holdFocus } from "./modal";
import { lineAnchor } from "./format";
import { formatNumbers } from "./numbers";
import { proofIdsOf, settleOf, speakerText } from "./settle";
import { to } from "./route";
import { lineInFile, originOfLine } from "./changeResult";
import type { Prior } from "./bodies";
import type { RecordModel } from "./model";
import type { Line } from "./page";

/** The research price as the tray shows it, read again when the tray opens, when Review opens and while it is open. */
export interface Quote {
  text: string;
  failed: boolean;
  refresh: () => void;
}

/** The one Ask shape PayDialog takes (kept here so the tray can build one without importing App). */
export interface ChangesAsk {
  title: string;
  subject?: string;
  action: string;
  kind: string;
  body: Record<string, unknown>;
  /** The instruction file the objective names: the pay dialog opens only after it was fetched with a matching sha256. */
  instructions?: "changes";
  warning?: string;
  afterSent?: () => void;
}

/* ---------- Shared state: which panel is open, and the tray ---------- */

interface SuggestState {
  subject: string;
  tray: ReturnType<typeof useTray>;
  /** The key of the target whose panel is open, or null. */
  open: string | null;
  setOpen: (key: string | null) => void;
  /** Each saved change's target as the record shows it now (by change id), or null when its row is gone. */
  live: Map<string, ChangeTarget | null>;
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

export function SuggestProvider({ subject, rec, children }: { subject: string; rec: Pick<RecordModel, "scope" | "resolve" | "sections">; children: React.ReactNode }) {
  const tray = useTray(subject);
  const [open, setOpen] = useState<string | null>(null);
  // rec.resolve is new on every render; the record's sections and scope are what it reads.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const live = useMemo(() => new Map(tray.list.map((c) => [c.id, liveTarget(rec, c.target)] as const)), [tray.list, rec.sections, rec.scope]);
  const value = useMemo(() => ({ subject, tray, open, setOpen, live }), [subject, tray, open, live]);
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

export type PanelMode = "line" | "sentence" | "new_line" | "links";
const CHOICES: Record<PanelMode, (ChangeType | "panel")[]> = {
  line: ["wrong", "context", "backing", "panel"],
  sentence: ["wrong", "reword", "context"],
  new_line: ["new_line"],
  links: ["links"],
};

const noteLabel = (t: ChangeType) =>
  t === "reword" ? "The new sentence" : t === "wrong" ? "What is wrong, and what is right" : t === "context" ? "What more there is to know" : t === "new_line" ? "The missing line" : "A note (optional)";

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
      <span className="dot" aria-hidden="true" />
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
  if (mode === "new_line" || mode === "links") return null;
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
 * Opens under the row or sentence, never wider than its column. First what the target rests on, then a choice
 * with one short line under each, a note of 10 to 300 characters and up to 3 https links (20 for "Add links to
 * read"), the no-source warning while there is no link, then Add to my changes and Cancel. Add to my changes stays
 * disabled until the change is complete. "Ask a panel to check it" opens Confirm a fact instead: a panel question
 * is sent on its own.
 */
/** What "Ask a panel to check it" reads from a line to fill in the panel form. */
export type SeedLine = { text: string; kind?: string; by?: string; rerun?: string; fact?: { value: string; unit?: string; chain?: string } | null };

export function ChangePanel({ target, mode, evidence = [], sourceUrl = "", line, onClose, onOpenLines }: { target: ChangeTarget; mode: PanelMode; evidence?: Evidence[]; sourceUrl?: string; line?: SeedLine; onClose?: () => void; onOpenLines?: (ids: string[]) => void }) {
  const s = useSuggest();
  const existing = pendingFor(s, target.key);
  const choices = CHOICES[mode];
  const [type, setType] = useState<ChangeType>(existing?.type ?? (choices[0] as ChangeType));
  const [note, setNote] = useState(existing?.note ?? (mode === "sentence" && type === "reword" ? target.text : ""));
  const [links, setLinks] = useState((existing?.links ?? []).join("\n"));
  const [corrected, setCorrected] = useState(existing?.suggest ?? "");
  const [errs, setErrs] = useState<{ note?: string; links?: string }>({});
  const id = useId();
  const ref = useRef<HTMLDivElement>(null);
  const max = type === "links" ? READ_MAX_LINKS : CHANGE_MAX_LINKS;
  const plan = useMemo(() => planLinks(links, max), [links, max]);
  // The exact sentence of the result and the sentence as the page shows it: neither counts as a rewording.
  const current = type === "reword" ? [target.text, formatNumbers(target.text)] : "";
  const ready = addReady(type, note, plan.links, plan.rejected.length, current);
  // The pencil, sentence, Edit or add button that opened the panel: focus goes back there when it closes.
  const opener = useRef<Element | null>(typeof document === "undefined" ? null : document.activeElement);
  const close = () => {
    s.setOpen(null);
    onClose?.();
    const back = opener.current;
    requestAnimationFrame(() => {
      if (back instanceof HTMLElement && back.isConnected && back !== document.body) back.focus({ preventScroll: true });
    });
  };
  useEffect(() => {
    ref.current?.querySelector<HTMLElement>("input:checked, textarea")?.focus({ preventScroll: true });
    if (ref.current) revealPanel(ref.current);
  }, []);
  const pick = (t: ChangeType | "panel") => {
    if (t === "panel") {
      setConfirmSeed(seedFromLine(line ?? { text: target.text }, sourceUrl));
      s.setOpen(null);
      location.hash = to("confirm");
      return;
    }
    if (t === "reword" && !note.trim()) setNote(target.text);
    setType(t);
    setErrs({});
  };
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const found = validateChange(type, note, plan.links, current);
    if (plan.rejected.length && !found.links) found.links = `Fix or remove: ${plan.rejected[0]!.line.slice(0, 60)} (${plan.rejected[0]!.why}).`;
    setErrs(found);
    if (found.note) return document.getElementById(`${id}-note`)?.focus();
    if (found.links) return document.getElementById(`${id}-links`)?.focus();
    const c: Change = { id: existing?.id ?? newChangeId(), type, target: mode === "new_line" || mode === "links" ? (existing?.target ?? noTarget()) : target, note: type === "links" ? "" : cleanNote(note), links: plan.links, ...(type === "wrong" && mode === "sentence" && cleanNote(corrected) ? { suggest: cleanNote(corrected).slice(0, SUGGEST_MAX) } : {}) };
    s.tray.put(c);
    close();
  };
  const remove = () => {
    if (existing) s.tray.remove(existing.id);
    close();
  };
  const count = cleanNote(note).length;
  const rejectedNow = plan.rejected[0];
  return (
    <div ref={ref} className="cpanel" role="group" aria-labelledby={`${id}-h`} onKeyDown={(e) => e.key === "Escape" && (e.stopPropagation(), close())}>
      <p id={`${id}-h`} className="cpanel-h">
        {mode === "new_line" ? "Add a line that is missing" : mode === "links" ? "Add links to read" : existing ? "Edit your change" : "Suggest a change"}
      </p>
      <EvidenceList mode={mode} target={target} evidence={evidence} onOpenLines={onOpenLines} />
      <form className="form" onSubmit={submit} noValidate>
        {choices.length > 1 && (
          <fieldset className="opts">
            <legend className="sr-only">What kind of change</legend>
            {choices.map((c) =>
              c === "panel" ? (
                // Not one of the radios: arrowing through the choices never leaves the form. It opens Confirm a fact when activated.
                <button key={c} type="button" className="opt opt-action" onClick={() => pick(c)}>
                  <span className="opt-word">{PANEL_WORDS}</span>
                  <span className="opt-hint">{PANEL_HINT}</span>
                </button>
              ) : (
                <label key={c} className="opt">
                  <input type="radio" name={`${id}-type`} value={c} checked={c === type} onChange={() => pick(c)} />
                  <span className="opt-word">{CHANGE_WORDS[c]}</span>
                  <span className="opt-hint">{CHANGE_HINTS[c]}</span>
                </label>
              ),
            )}
          </fieldset>
        )}
        {type !== "links" && (
          <>
            <label htmlFor={`${id}-note`}>{noteLabel(type)}</label>
            {type === "reword" && <p className="small">{evidence.length ? KEPT_RULE : KEPT_RULE.replace("those lines, or a link you add, support it", "a link you add supports it")}</p>}
            <textarea id={`${id}-note`} rows={type === "reword" ? 3 : 2} value={note} onChange={(e) => setNote(e.target.value)} aria-invalid={!!errs.note} aria-describedby={`${id}-count${errs.note ? ` ${id}-note-err` : ""}`} />
            <p id={`${id}-count`} className={count > NOTE_MAX ? "error" : "small"}>
              {count} of {NOTE_MAX} characters{needsNote(type) && count < NOTE_MIN ? `, at least ${NOTE_MIN}` : ""}
            </p>
            {errs.note && <p id={`${id}-note-err`} className="error">{errs.note}</p>}
          </>
        )}
        {type === "wrong" && mode === "sentence" && (
          <>
            <label htmlFor={`${id}-corrected`}>Corrected sentence (optional)</label>
            <textarea id={`${id}-corrected`} rows={2} maxLength={SUGGEST_MAX} value={corrected} onChange={(e) => setCorrected(e.target.value)} aria-describedby={`${id}-corrected-hint`} />
            <p id={`${id}-corrected-hint`} className="small">Sent as a suggestion. If the change is kept, the summary shows the corrected sentence the job writes.</p>
          </>
        )}
        <label htmlFor={`${id}-links`}>{type === "links" ? `Links to read, one per line (up to ${READ_MAX_LINKS})` : type === "backing" ? `Your source: up to ${CHANGE_MAX_LINKS} https links, one per line` : `Links, one per line (up to ${CHANGE_MAX_LINKS}, optional)`}</label>
        <textarea id={`${id}-links`} rows={type === "links" ? 5 : 2} spellCheck={false} autoCapitalize="none" autoComplete="off" placeholder="https://example.com/article" value={links} onChange={(e) => setLinks(e.target.value)} aria-invalid={!!errs.links || !!rejectedNow} aria-describedby={errs.links || rejectedNow ? `${id}-links-err` : undefined} />
        {(errs.links || rejectedNow) && (
          <p id={`${id}-links-err`} className="error">
            {errs.links ?? `Cannot use ${rejectedNow!.line.slice(0, 60)}: ${rejectedNow!.why}.`}
          </p>
        )}
        {plan.links.length === 0 && type !== "links" && type !== "backing" && <p className="nosource">{NO_SOURCE}</p>}
        <div className="row-actions">
          <button className="btn btn-ink" type="submit" disabled={!ready.ok} aria-describedby={ready.ok ? undefined : `${id}-need`}>
            Add to my changes
          </button>
          <button className="btn" type="button" onClick={close}>
            Cancel
          </button>
          {existing && (
            <button className="linklike small" type="button" onClick={remove}>
              Remove
            </button>
          )}
        </div>
        {!ready.ok && (
          <p id={`${id}-need`} className="small" aria-live="polite">
            {ready.need}
          </p>
        )}
      </form>
    </div>
  );
}

/* ---------- "Add a line that is missing" and "Add links to read" ---------- */

/** The addresses of the Overview footer's first two links. */
export const ADD_LINE = "add-line";
export const ADD_LINKS = "add-links";

/** "Add a line that is missing" and "Add links to read": buttons, or (variant "links") two text links for the Overview footer. */
export function AddButtons({ where, variant = "buttons", routeTarget = null, routeN = 0, children }: { where: string; variant?: "buttons" | "links"; routeTarget?: string | null; routeN?: number; children?: React.ReactNode }) {
  const s = useSuggest();
  const newKey = `${where}:new_line`;
  const linksKey = `${where}:links`;
  const target = (key: string): ChangeTarget => ({ ...noTarget(), key });
  const { setOpen } = s;
  // The footer links have their own addresses (#/s/<subject>/add-line, /add-links): opened from a copied link or a
  // new tab, the page opens the form under the row.
  useEffect(() => {
    if (variant !== "links") return;
    if (routeTarget === ADD_LINE) setOpen(newKey);
    else if (routeTarget === ADD_LINKS) setOpen(linksKey);
  }, [variant, routeTarget, routeN, newKey, linksKey, setOpen]);
  const follow = (key: string) => (e: React.MouseEvent) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return; // a new tab or window follows the address
    e.preventDefault();
    s.setOpen(s.open === key ? null : key);
  };
  if (variant === "links")
    return (
      <>
        <p className="foot-links">
          <a href={to(ADD_LINE)} aria-expanded={s.open === newKey} onClick={follow(newKey)}>
            Add a missing line
          </a>
          <a href={to(ADD_LINKS)} aria-expanded={s.open === linksKey} onClick={follow(linksKey)}>
            Add links to read
          </a>
          {children}
        </p>
        {s.open === newKey && <ChangePanel key={newKey} target={target(newKey)} mode="new_line" />}
        {s.open === linksKey && <ChangePanel key={linksKey} target={target(linksKey)} mode="links" />}
      </>
    );
  return (
    <>
      <div className="row-actions">
        <button type="button" className="btn" aria-expanded={s.open === newKey} onClick={() => s.setOpen(s.open === newKey ? null : newKey)}>
          Add a line that is missing
        </button>
        <button type="button" className="btn" aria-expanded={s.open === linksKey} onClick={() => s.setOpen(s.open === linksKey ? null : linksKey)}>
          Add links to read
        </button>
      </div>
      {s.open === newKey && <ChangePanel key={newKey} target={target(newKey)} mode="new_line" />}
      {s.open === linksKey && <ChangePanel key={linksKey} target={target(linksKey)} mode="links" />}
    </>
  );
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
  const body = changesBody(changes, fit.prior, ch.list, rec.subject, refOf, ch.more);
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
  const { refresh } = quote;
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
  if (!on) return null;
  const withSource = list.filter(hasSource).length;
  const openReview = () => {
    refresh();
    setReview(true);
  };
  return (
    <>
      <div className="tray" role="region" aria-label="Your changes">
        <div className="tray-in">
          <p className="tray-text" aria-live="polite">
            <strong>{plural(list.length, "change")}</strong>
            <span className="tray-meta">
              {withSource} with a source, {list.length - withSource} without
              <span aria-hidden="true"> · </span>
              {plan.over ? `over the ${MAX_OBJECTIVE.toLocaleString("en-US")}-character limit` : `room for about ${plan.room} more`}
              <span aria-hidden="true"> · </span>
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
      {review && <Review rec={rec} quote={quote} onClose={() => setReview(false)} onAsk={onAsk} />}
    </>
  );
}

/**
 * The links of one change in Review: Add a link when it has none, Edit links when it has some. A change put back
 * after it was not kept for lack of a source opens with its previous links, to replace or remove them.
 */
function LinkEditor({ change }: { change: Change }) {
  const s = useSuggest();
  const max = change.type === "links" ? READ_MAX_LINKS : CHANGE_MAX_LINKS;
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
    const p = planLinks(v, max);
    if (p.rejected.length) return setErr(`Fix or remove: ${p.rejected[0]!.line.slice(0, 60)} (${p.rejected[0]!.why}).`);
    if (!p.links.length && (change.type === "backing" || change.type === "links")) return setErr("Paste at least one https link.");
    refocusLinks = change.id;
    s.tray.put({ ...change, links: p.links, retry: undefined });
    setErr("");
    setOpen(false);
  };
  return (
    <span className="addlink block">
      <label htmlFor={id} className="small block">
        {change.retry ? "Replace or remove the links it was sent with" : "Links"}, one per line (up to {max})
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
    onAsk({ title: `Submit ${plural(n, "change")}`, subject: rec.subject.id, action: ACTIONS.research, kind: "changes", body: plan.body, instructions: "changes", afterSent: clear });
  };
  return (
    <div className="sheet-bg" onClick={onClose}>
      <div ref={ref} className="sheet sheet-wide" role="dialog" aria-modal="true" aria-labelledby="review-title" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-head">
          <h2 id="review-title" tabIndex={-1}>Review your changes</h2>
          <button className="x" aria-label="Close" onClick={onClose}>×</button>
        </div>
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
              {c.retry && <p className="small">Not kept last time: {c.retry}</p>}
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
                <button type="button" className="linklike" onClick={quote.refresh}>
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
