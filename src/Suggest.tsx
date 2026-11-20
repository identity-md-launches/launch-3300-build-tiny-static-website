/** Suggest changes where you read: the pencil, the inline panel, the tray bar at the bottom and its review. */
import { createContext, useContext, useEffect, useId, useMemo, useRef, useState } from "react";
import { ACTIONS } from "./config";
import { artifactUrl, MAX_OBJECTIVE } from "./bodies";
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
  cleanNote,
  hasSource,
  makeRefOf,
  newChangeId,
  noTarget,
  planLinks,
  roomLeft,
  setConfirmSeed,
  useTray,
  validateChange,
  type Change,
  type ChangeTarget,
  type ChangeType,
} from "./changes";
import { holdFocus } from "./modal";
import { lineAnchor } from "./format";
import { to } from "./route";
import type { RecordModel } from "./model";
import type { Line } from "./page";

/** The one Ask shape PayDialog takes (kept here so the tray can build one without importing App). */
export interface ChangesAsk {
  title: string;
  subject?: string;
  action: string;
  kind: string;
  body: Record<string, unknown>;
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
}
const Ctx = createContext<SuggestState | null>(null);

export function SuggestProvider({ subject, children }: { subject: string; children: React.ReactNode }) {
  const tray = useTray(subject);
  const [open, setOpen] = useState<string | null>(null);
  const value = useMemo(() => ({ subject, tray, open, setOpen }), [subject, tray, open]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSuggest(): SuggestState {
  const s = useContext(Ctx);
  if (!s) throw new Error("SuggestProvider missing");
  return s;
}

/** The pending change about this target, if any. */
export const pendingFor = (s: SuggestState, key: string) => s.tray.list.find((c) => c.target.key === key) ?? null;

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

/**
 * Opens under the row or sentence. A choice, one short line under each, a note of up to 300 characters and up to 3
 * https links (20 for "Add links to read"), the no-source warning while there is no link, then Add to my changes
 * and Cancel. "Ask a panel to check it" opens Confirm a fact instead: a panel question is sent on its own.
 */
export function ChangePanel({ target, mode, rests = [], sourceUrl = "", onClose }: { target: ChangeTarget; mode: PanelMode; rests?: Line[]; sourceUrl?: string; onClose?: () => void }) {
  const s = useSuggest();
  const existing = pendingFor(s, target.key);
  const choices = CHOICES[mode];
  const [type, setType] = useState<ChangeType>(existing?.type ?? (choices[0] as ChangeType));
  const [note, setNote] = useState(existing?.note ?? (mode === "sentence" && type === "reword" ? target.text : ""));
  const [links, setLinks] = useState((existing?.links ?? []).join("\n"));
  const [errs, setErrs] = useState<{ note?: string; links?: string }>({});
  const id = useId();
  const ref = useRef<HTMLDivElement>(null);
  const max = type === "links" ? READ_MAX_LINKS : CHANGE_MAX_LINKS;
  const plan = useMemo(() => planLinks(links, max), [links, max]);
  const close = () => {
    s.setOpen(null);
    onClose?.();
  };
  useEffect(() => {
    ref.current?.querySelector<HTMLElement>("input:checked, textarea")?.focus({ preventScroll: true });
    ref.current?.scrollIntoView?.({ block: "nearest" });
  }, []);
  const pick = (t: ChangeType | "panel") => {
    if (t === "panel") {
      setConfirmSeed({ text: target.text, url: sourceUrl });
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
    const found = validateChange(type, note, plan.links);
    if (plan.rejected.length && !found.links) found.links = `Fix or remove: ${plan.rejected[0]!.line.slice(0, 60)} (${plan.rejected[0]!.why}).`;
    setErrs(found);
    if (found.note) return document.getElementById(`${id}-note`)?.focus();
    if (found.links) return document.getElementById(`${id}-links`)?.focus();
    const c: Change = { id: existing?.id ?? newChangeId(), type, target: mode === "new_line" || mode === "links" ? (existing?.target ?? noTarget()) : target, note: type === "links" ? "" : cleanNote(note), links: plan.links };
    s.tray.put(c);
    close();
  };
  const remove = () => {
    if (existing) s.tray.remove(existing.id);
    close();
  };
  const count = cleanNote(note).length;
  return (
    <div ref={ref} className="cpanel" role="group" aria-labelledby={`${id}-h`} onKeyDown={(e) => e.key === "Escape" && (e.stopPropagation(), close())}>
      <p id={`${id}-h`} className="cpanel-h">
        {mode === "new_line" ? "Add a line that is missing" : mode === "links" ? "Add links to read" : existing ? "Edit your change" : "Suggest a change"}
      </p>
      <form className="form" onSubmit={submit} noValidate>
        {choices.length > 1 && (
          <fieldset className="opts">
            <legend className="sr-only">What kind of change</legend>
            {choices.map((c) => (
              <label key={c} className="opt">
                <input type="radio" name={`${id}-type`} value={c} checked={c === type} onChange={() => pick(c)} />
                <span className="opt-word">{c === "panel" ? PANEL_WORDS : CHANGE_WORDS[c]}</span>
                <span className="opt-hint">{c === "panel" ? PANEL_HINT : CHANGE_HINTS[c]}</span>
              </label>
            ))}
          </fieldset>
        )}
        {mode === "sentence" && (
          <div className="rests small">
            {rests.length ? (
              <>
                <span>Rests on: </span>
                {rests.map((l, i) => (
                  <span key={l.id}>
                    {i > 0 && ", "}
                    <a href={to(lineAnchor(l.id))}>{l.text.length > 70 ? `${l.text.slice(0, 69)}…` : l.text}</a>
                  </span>
                ))}
                <span className="block">{KEPT_RULE}</span>
              </>
            ) : (
              <span>This sentence names no lines. {KEPT_RULE.replace("those lines, or a link you add,", "a link you add")}</span>
            )}
          </div>
        )}
        {type !== "links" && (
          <>
            <label htmlFor={`${id}-note`}>{noteLabel(type)}</label>
            <textarea id={`${id}-note`} rows={type === "reword" ? 3 : 2} value={note} onChange={(e) => setNote(e.target.value)} aria-invalid={!!errs.note} aria-describedby={`${id}-count${errs.note ? ` ${id}-note-err` : ""}`} />
            <p id={`${id}-count`} className={count > NOTE_MAX ? "error" : "small"}>
              {count} of {NOTE_MAX} characters
            </p>
            {errs.note && <p id={`${id}-note-err`} className="error">{errs.note}</p>}
          </>
        )}
        <label htmlFor={`${id}-links`}>{type === "links" ? `Links to read, one per line (up to ${READ_MAX_LINKS})` : type === "backing" ? `Your source: up to ${CHANGE_MAX_LINKS} https links, one per line` : `Links, one per line (up to ${CHANGE_MAX_LINKS}, optional)`}</label>
        <textarea id={`${id}-links`} rows={type === "links" ? 5 : 2} spellCheck={false} autoCapitalize="none" autoComplete="off" placeholder="https://example.com/article" value={links} onChange={(e) => setLinks(e.target.value)} aria-invalid={!!errs.links} aria-describedby={errs.links ? `${id}-links-err` : undefined} />
        {errs.links && <p id={`${id}-links-err`} className="error">{errs.links}</p>}
        {plan.links.length === 0 && type !== "links" && <p className="nosource">{NO_SOURCE}</p>}
        <div className="row-actions">
          <button className="btn btn-ink" type="submit">
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
      </form>
    </div>
  );
}

/* ---------- "Add a line that is missing" and "Add links to read" ---------- */

export function AddButtons({ where }: { where: string }) {
  const s = useSuggest();
  const newKey = `${where}:new_line`;
  const linksKey = `${where}:links`;
  const target = (key: string): ChangeTarget => ({ ...noTarget(), key });
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

/** The <PRIOR> file reference of each record line, for <ITEMS>. */
export function refOfModel(rec: RecordModel) {
  const jobFiles = new Map(rec.after.filter((a) => a.fileHash).map((a) => [a.req.requestId, artifactUrl(a.fileHash!)] as const));
  return makeRefOf(rec.prior, rec.pageHash ? artifactUrl(rec.pageHash) : null, jobFiles);
}

export function useChangesPlan(rec: RecordModel, list: Change[]) {
  return useMemo(() => {
    const refOf = refOfModel(rec);
    const body = changesBody(list, rec.prior, rec.channels, rec.subject, refOf);
    return { body, refOf, room: roomLeft(body.objective.length, list, refOf), over: body.objective.length >= MAX_OBJECTIVE };
  }, [rec, list]);
}

const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? "" : "s"}`;

export function TrayBar({ rec, price, onAsk }: { rec: RecordModel; price: string; onAsk: (a: ChangesAsk) => void }) {
  const s = useSuggest();
  const list = s.tray.list;
  const [review, setReview] = useState(false);
  const plan = useChangesPlan(rec, list);
  const on = list.length > 0;
  useEffect(() => {
    document.body.classList.toggle("has-tray", on);
    return () => document.body.classList.remove("has-tray");
  }, [on]);
  if (!on) return null;
  const withSource = list.filter(hasSource).length;
  return (
    <>
      <div className="tray" role="region" aria-label="Your changes">
        <div className="tray-in">
          <p className="tray-text" aria-live="polite">
            <strong>{plural(list.length, "change")}</strong>
            <span className="tray-meta">
              {withSource} with a source, {list.length - withSource} without
              <span aria-hidden="true"> · </span>
              {plan.over ? "over the 7,500-character limit" : `room for about ${plan.room} more`}
              <span aria-hidden="true"> · </span>
              <span className="mono">{price}</span>
            </span>
          </p>
          <button type="button" className="btn btn-tray" onClick={() => setReview(true)}>
            Review and submit
          </button>
        </div>
      </div>
      {review && <Review rec={rec} price={price} onClose={() => setReview(false)} onAsk={onAsk} />}
    </>
  );
}

function AddLink({ change }: { change: Change }) {
  const s = useSuggest();
  const [open, setOpen] = useState(false);
  const [v, setV] = useState("");
  const [err, setErr] = useState("");
  const id = useId();
  if (!open)
    return (
      <button type="button" className="linklike small" onClick={() => setOpen(true)}>
        Add a link
      </button>
    );
  const save = () => {
    const p = planLinks(v, CHANGE_MAX_LINKS);
    if (!p.links.length) return setErr(p.rejected[0] ? `Not used: ${p.rejected[0].why}.` : "Paste an https link.");
    s.tray.put({ ...change, links: p.links });
  };
  return (
    <span className="addlink">
      <label htmlFor={id} className="sr-only">Link</label>
      <input id={id} type="url" inputMode="url" placeholder="https://example.com/article" value={v} onChange={(e) => setV(e.target.value)} onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), save())} autoFocus aria-invalid={!!err} />
      <button type="button" className="btn btn-small" onClick={save}>Save link</button>
      {err && <span className="error block">{err}</span>}
    </span>
  );
}

function Review({ rec, price, onClose, onAsk }: { rec: RecordModel; price: string; onClose: () => void; onAsk: (a: ChangesAsk) => void }) {
  const s = useSuggest();
  const list = s.tray.list;
  const plan = useChangesPlan(rec, list);
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
  const n = list.length;
  const submit = () => {
    if (!ready || plan.over) return;
    const clear = s.tray.clear;
    onClose();
    onAsk({ title: `Submit ${plural(n, "change")}`, subject: rec.subject.id, action: ACTIONS.research, kind: "changes", body: plan.body, afterSent: clear });
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
              <p className="review-type">{CHANGE_WORDS[c.type]}</p>
              {c.target.text && <p className="review-about">“{c.target.text}”</p>}
              {c.note && <p>{c.type === "reword" ? "New sentence: " : ""}{c.note}</p>}
              {c.links.length > 0 && (
                <ul className="plain small">
                  {c.links.map((u) => (
                    <li key={u} className="mono break">{u}</li>
                  ))}
                </ul>
              )}
              {!hasSource(c) && (
                <p className="nosource">
                  {NO_SOURCE} <AddLink change={c} />
                </p>
              )}
              <button type="button" className="linklike small" onClick={() => s.tray.remove(c.id)}>
                Remove
              </button>
            </li>
          ))}
        </ol>
        <dl className="facts">
          <dt>Total</dt>
          <dd className="mono">{price}, one research job</dd>
        </dl>
        <details>
          <summary>Read the full request</summary>
          <pre className="body mono" tabIndex={0} aria-label="Request body">{JSON.stringify(plan.body, null, 2)}</pre>
        </details>
        {!ready && <p className="warn">{rec.snapshot.why}</p>}
        {plan.over && <p className="warn">The request is {plan.body.objective.length.toLocaleString("en-US")} characters, over the 7,500 the Intake takes. Remove a change or shorten a note.</p>}
        <div className="row-actions">
          <button type="button" className="btn btn-primary" onClick={submit} disabled={!ready || plan.over}>
            Submit {plural(n, "change")}
          </button>
          <span className="small">One request, one payment.</span>
        </div>
      </div>
    </div>
  );
}
