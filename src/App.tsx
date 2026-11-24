import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { formatUnits, stringToHex, type Hex } from "viem";
import { ACTIONS, CHAIN_ID, EMPTY_SELECTOR, ERC20_ABI, ETHERSCAN, IMD, INTAKE, INTAKE_ABI, ZERO_ADDRESS, HOME_TITLE } from "./config";
import {
  MAX_OBJECTIVE,
  fitsObjective,
  TEMPLATE_KIND,
  TEMPLATE_TITLES,
  TEMPLATE_HINTS,
  plainQuestion,
  encodeBody,
  priorText,
  questionContract,
  questionPage,
  questionPost,
  LEADS_MAX,
  planLeads,
  templateBody,
  contractDefinitions,
  validateContract,
  validatePage,
  validateP4,
  type ChannelTie,
  type Prior,
  type Template,
} from "./bodies";
import { OverviewTab, PayerLink, RecordTab, SourcesTab, type Filter, type Ui } from "./Record";
import { ActivityList } from "./ActivityList";
import { Connect, loadWallet, useWalletAccount } from "./walletLazy";
import { publicClient } from "./reads";
import { isChangesJob, readable, rememberSent, sentTxs, useActivity } from "./useActivity";
import { holdFocus } from "./modal";
import { followAdmission, rpcReceipt, waitForReceipt, type ReceiptRead } from "./receipt";
import { Payment, REVERTED, type PayStep } from "./payFlow";
import { isInstructionsUnavailable, leftOutText, pageJobsOf, pendingRebuildOf, readSettled, upkeepText, type PageJobs, planRebuild, subjectRefFor, subjectSummaries, unreadableBySubject, unreadableCount, useRecordModel, type RecordModel } from "./model";
import { InstructionsBlock } from "./Instructions";
import { INSTRUCTIONS_UNREACHABLE, instructionsOf, instructionsReachable, type InstructionName } from "./instructions";
import type { Findable } from "./lookup";
import { jobLink, lineAnchor, payerName } from "./format";
import { lineForAddress } from "./addresses";
import { readDate } from "./dates";
import { DOCS_HREF, TABS, canonicalHash, routeOf, setLinkSubject, subjectHref, to } from "./route";
import { Docs } from "./Docs";
import { Profile } from "./Profile";
import { CHAIN_CHOICES, chainName, describeSubject, refFromInput, validateSubject, type SubjectRef } from "./subject";
import { Home, StillReading, pickExample } from "./Home";
import { useDigests } from "./digest";
import type { Activity } from "./useActivity";
import { NoteForm, SuggestProvider, TrayBar, type Quote } from "./Suggest";
import { parseItems, takeConfirmSeed, type ConfirmSeed } from "./changes";
import { CHANGES, FIRST_PAGE, REBUILD, type RequestKind } from "./requests";
import { actionId, askFor, noteShownPrice, prepareAsk, priceOfAsk, readPrice, shownPrice, type Ask, type Prepared } from "./requests/ask";

export { askFor, priceOfAsk, type Ask };

type RecordState = RecordModel;
const imd = (v: bigint) => `${formatUnits(v, 18)} IMD`;

/**
 * What IMD charges for a kind of request, read through that kind on load; refresh reads it again (the tray does, with
 * its request as it stands, so its price stays live).
 */
function useKindPrice(kind: Pick<RequestKind<never>, "id" | "action" | "price">): Quote {
  const [price, setPrice] = useState<bigint | null>(null);
  const [failed, setFailed] = useState(false);
  const refresh = useCallback((body?: Record<string, unknown>) => {
    kind.price(readPrice, body).then(
      (p) => {
        noteShownPrice({ action: kind.action, kindId: kind.id }, p);
        setPrice(p);
        setFailed(false);
      },
      () => setFailed(true),
    );
  }, [kind]);
  useEffect(() => refresh(), [refresh]);
  return useMemo(() => ({ text: failed ? "Price unavailable" : price === null ? "Reading price…" : imd(price), failed, refresh }), [failed, price, refresh]);
}

/** A panel question's price (the Confirm a fact card, hidden for now): the Intake's price for its action. */
const PANEL_PRICE: Pick<RequestKind<never>, "id" | "action" | "price"> = { id: ACTIONS.oracle, action: ACTIONS.oracle, price: (read) => read(ACTIONS.oracle) };

/**
 * Whether a request must pass the instruction preflight before its pay dialog opens: a rebuild, a set of changes,
 * or any request whose objective names an instruction file.
 */
export const needsInstructionCheck = (a: Pick<Ask, "instructions" | "kind" | "rebuild" | "body">): boolean =>
  !!a.instructions || !!a.rebuild || a.kind === "changes" || instructionsOf(a.body.objective) !== null;

/**
 * The preflight: true only when the instruction file the objective names was fetched with a matching sha256. A rebuild
 * or a set of changes whose objective names no file cannot read its instructions either, so it is never offered.
 */
export async function askInstructionsReachable(a: Pick<Ask, "instructions" | "kind" | "rebuild" | "body">, get?: typeof fetch): Promise<boolean> {
  if (!needsInstructionCheck(a)) return true;
  if (!instructionsOf(a.body.objective)) return false;
  return instructionsReachable(a.body.objective, get);
}

/* ---------- Actions ---------- */

/** "Rebuild the page": the research action, starting from the page shown now and everything completed after it. */
export function rebuildAsk(prior: Prior, subject: SubjectRef, hasPage: boolean, channels: ChannelTie[] = [], moreChannels = 0, leads: string[] = []): Ask {
  const kind = hasPage ? REBUILD : FIRST_PAGE;
  const a = askFor(kind, { prior, subject, channels, moreChannels, leads }, { title: hasPage ? `Rebuild the page of ${subject.id}` : `Create the page of ${subject.id}` });
  const body = a.body as { objective: string };
  return {
    ...a,
    subject: subject.id,
    rebuild: true,
    warning: fitsObjective(body.objective.length) ? undefined : `The objective is ${body.objective.length.toLocaleString("en-US")} characters, over the ${MAX_OBJECTIVE.toLocaleString("en-US")} this site allows (IMD refuses more than 8,000). It would be refused.`,
  };
}

/** Why <PRIOR> is not ready yet, with Refresh after a failed read. Nothing can be reviewed until it is. */
function SnapshotNote({ rec, onRefresh, refreshing }: { rec: RecordState; onRefresh: () => void; refreshing: boolean }) {
  const s = rec.snapshot;
  if (s.ok) return null;
  return (
    <p className={s.loading ? "small" : "warn"} role="status">
      {s.why}
      {!s.loading && (
        <>
          {" "}
          <button type="button" className="linklike" onClick={onRefresh} disabled={refreshing}>
            {refreshing ? "Reading chain…" : "Refresh"}
          </button>
        </>
      )}
    </p>
  );
}

function LeftOut({ rec }: { rec: RecordState }) {
  const items = leftOutText(rec);
  if (!items.length) return null;
  return (
    <div className="warn leftout" role="note">
      <p>Not everything fits in one objective of {MAX_OBJECTIVE.toLocaleString("en-US")} characters, so this rebuild takes the page shown, then the newest results, then the files to reconsider. Left out this time:</p>
      <ul className="plain">
        {items.map((t) => (
          <li key={t}>{t}</li>
        ))}
      </ul>
      {rec.leftOutItems.length > 0 && (
        <ul className="plain leftout-items small">
          {rec.leftOutItems.map((x) => (
            <li key={x.href + x.label}>
              <a href={x.href} target="_blank" rel="noreferrer" className="break">
                {x.label}
              </a>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function RebuildCard({ onAsk, rec, price, onRefresh, refreshing, known = true, unreadable = 0, jobs = { finished: false, loadFailed: false, settled: true } }: { onAsk: (a: Ask) => void; rec: RecordState; price: string; onRefresh: () => void; refreshing: boolean; known?: boolean; unreadable?: number; jobs?: PageJobs }) {
  // "Create the page" only for a subject with no finished page job; after one (also one that found no project) the
  // permitted retry is "Rebuild the page".
  const rebuild = !!rec.page || jobs.finished;
  const [leadsRaw, setLeadsRaw] = useState("");
  const leads = planLeads(leadsRaw);
  const ask = rebuildAsk(rec.prior, rec.subject, rebuild, rec.promptChannels.list, rec.promptChannels.more, leads.links);
  const prior = priorText(rec.prior);
  // Never opened for payment over the limit: the objective must fit in 7,900 characters.
  // One rebuild at a time: while one for this subject is pending, its button is replaced by where to follow it.
  const running = rec.pendingRebuild;
  const ready = rec.snapshot.ok && !ask.warning && !running;
  // A subject with a finished page job never offers "Create the page", even when its page file failed to load.
  // Until the chain and the result files have answered, the app cannot know whether a page job finished: it says
  // only that it is reading, and offers nothing.
  if (!rec.page && !known)
    return (
      <div className="card" id="rebuild-card">
        <p className="small" role="status">Reading the record from Ethereum…</p>
      </div>
    );
  if (!rec.page && (rec.latest || unreadable > 0 || jobs.loadFailed))
    return (
      <div className="card" id="rebuild-card">
        <p className="why" role="status">
          {rec.error || !rec.latest || jobs.loadFailed ? "The page could not be loaded." : "Reading the page…"}{" "}
          <button type="button" className="linklike" onClick={onRefresh} disabled={refreshing}>
            {refreshing ? "Trying again…" : "Try again."}
          </button>
        </p>
      </div>
    );
  const note = rec.page && rec.outdated ? upkeepText(rec.outdated) : "";
  // The upkeep line's link opens the rebuild dialog itself; while it cannot open, it shows why below.
  const openDialog = (e: React.MouseEvent) => {
    e.preventDefault();
    if (ready) onAsk(ask);
    else document.getElementById("rebuild-card")?.querySelector<HTMLElement>(".warn, .running, .small")?.scrollIntoView({ block: "nearest" });
  };
  return (
    <div className="card" id="rebuild-card">
      {note && (
        <p className="outdated small upkeep-note">
          <span>{note}</span>{" "}
          <a href="#rebuild" onClick={openDialog} aria-disabled={!ready || undefined}>
            Rebuild
          </a>
        </p>
      )}
      <h3>{rebuild ? "Rebuild the page" : "Create the page"}</h3>
      {!rec.page && rec.rejected?.rejected && (
        <p className="small break">
          {isInstructionsUnavailable(rec.rejected.rejected) ? "The last page job could not verify its instructions." : `The last page job found no project: ${rec.rejected.rejected.trim().replace(/[.\s]*$/, ".")}`} A rebuild can try again.
        </p>
      )}
      <p className="break">Merges repeated lines, folds in the listed results, and looks for what’s new.</p>
      {rec.snapshot.ok ? (
        <>
          <p className="small">
            {prior === "none"
              ? "There is no page yet, so this job starts from nothing."
              : `It is given ${rec.prior.files.length} earlier file${rec.prior.files.length === 1 ? "" : "s"} and ${rec.prior.answers.length} panel answer${rec.prior.answers.length === 1 ? "" : "s"}.`}
          </p>
          <details>
            <summary>Read the objective</summary>
            <p className="small break">
              One page job starts from the page shown now and the results listed below, carries each line forward or says why it dropped it, merges lines that say the
              same thing into one (keeping every origin and speaker), and then looks for what is new. It researches {describeSubject(rec.subject)}.
              {(rec.prior.reconsider?.length ?? 0) > 0 &&
                ` The page shown dropped lines, so ${rec.prior.reconsider!.length} file${rec.prior.reconsider!.length === 1 ? "" : "s"} they came from ${rec.prior.reconsider!.length === 1 ? "is" : "are"} listed again, marked “reconsider dropped lines”: the job carries those lines forward unless one is a duplicate, off subject or replaced by the same speaker.`}
            </p>
            <p className="objective">{String(ask.body.objective)}</p>
            <InstructionsBlock name="rebuild" />
          </details>
          <LeftOut rec={rec} />
        </>
      ) : (
        <SnapshotNote rec={rec} onRefresh={onRefresh} refreshing={refreshing} />
      )}
      {rec.snapshot.ok && !running && <LeadsField id="rebuild-leads" value={leadsRaw} onChange={setLeadsRaw} plan={leads} />}
      {rec.snapshot.ok && ask.warning && <p className="warn">{ask.warning}</p>}
      {running ? (
        <p className="running" role="status">
          A rebuild is running, started {startedAt(running)} by <PayerLink name={payerName(running)} address={running.req.payer} />.{" "}
          <a href={jobLink(running.jobId, running.req.transactionHash)} target="_blank" rel="noopener noreferrer">Follow it</a>
        </p>
      ) : (
      <div className="row-actions">
        <button className="btn" onClick={() => (ready ? onAsk(ask) : undefined)} disabled={!ready}>
          {ready || ask.warning ? (rebuild ? "Rebuild the page" : "Create the page") : rec.snapshot.loading ? "Reading the record…" : "Record not read"}
        </button>
        <span className="price mono">{price}</span>
      </div>
      )}
    </div>
  );
}

/** "Research to start from": optional, up to 10 https links, one per line. Listed in the objective as leads. */
export function LeadsField({ id, value, onChange, plan }: { id: string; value: string; onChange: (v: string) => void; plan: ReturnType<typeof planLeads> }) {
  return (
    <div className="field leads-field">
      <label htmlFor={id}>Research to start from <span className="small">(optional)</span></label>
      <textarea id={id} rows={3} spellCheck={false} autoCapitalize="none" autoComplete="off" placeholder="https://example.com/research" value={value} onChange={(e) => onChange(e.target.value)} aria-describedby={`${id}-hint`} />
      <p id={`${id}-hint`} className="small">Up to {LEADS_MAX} https links, one per line. The swarm reads them first and follows their sources; a line still needs a primary source.</p>
      {plan.rejected.length > 0 && (
        <ul className="plain small error" aria-live="polite">
          {plan.rejected.map((r) => (
            <li key={r.line} className="break">Not used: {r.line} ({r.why})</li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** When a request was sent, as "19 Nov 2026, 14:05" in the visitor's time, or "just now" while its block time is unknown. */
function startedAt(a: Activity): string {
  if (!a.time) return "just now";
  const d = new Date(a.time > 1e12 ? a.time : a.time * 1000);
  return `${readDate(d.toISOString())}, ${d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}`;
}

const field = (id: string, err?: string) => ({ id, "aria-invalid": !!err, "aria-describedby": err ? `${id}-err` : undefined });
const Err = ({ id, msg }: { id: string; msg?: string }) => (msg ? <p id={`${id}-err`} className="error">{msg}</p> : null);

type ConfirmMode = "intro" | "seeded" | "form" | "none";
type ConfirmFields = { url: string; handle: string; text: string; chain: string; signature: string; address: string; value: string };

/**
 * "Ask a panel to check a fact". Opened from a line ("Ask a panel to check it"), it is already filled in from that
 * line: the question in plain words, Edit, the price and Review the question. A line whose source fits none of the
 * three types says so. Opened on its own it explains how and offers "Write a question from scratch" (the full form).
 */
function ConfirmCard({ onAsk, rec }: { onAsk: (a: Ask) => void; rec: RecordState }) {
  const oraclePrice = useKindPrice(PANEL_PRICE).text;
  const defaultChain = String(CHAIN_CHOICES.some((c) => c.id === rec.subject.chainId) ? rec.subject.chainId : 1);
  const blank: ConfirmFields = { url: "", handle: "", text: "", chain: defaultChain, signature: "", address: rec.subject.address || rec.main, value: "" };
  const [mode, setMode] = useState<ConfirmMode>("intro");
  const [tpl, setTpl] = useState<Template>("post");
  const [f, setF] = useState<ConfirmFields>(blank);
  const [errs, setErrs] = useState<Record<string, string | undefined>>({});
  const set = (k: keyof ConfirmFields) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });
  const apply = (s: ConfirmSeed) => {
    setErrs({});
    if (s.type === "none") {
      setMode("none");
      setF({ ...blank, text: s.text, url: s.url });
      return;
    }
    setTpl(s.type);
    setF({ url: s.url, handle: s.handle, text: s.text, chain: s.chain || defaultChain, signature: s.signature, address: s.address || blank.address, value: s.value });
    setMode("seeded");
  };
  useEffect(() => {
    const take = () => {
      const s = takeConfirmSeed();
      if (s) apply(s);
    };
    take();
    addEventListener("imd-confirm-seed", take);
    return () => removeEventListener("imd-confirm-seed", take);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const sid = rec.subject.id;
  const question =
    tpl === "post"
      ? questionPost(f.url || "<URL>", f.handle || "<HANDLE>", f.text || "<TEXT>", sid)
      : tpl === "page"
        ? questionPage(f.url || "<URL>", f.text || "<TEXT>", sid)
        : questionContract(f.chain || "<CHAIN ID>", f.signature || "<FUNCTION SIGNATURE>", f.address || "<ADDRESS>", f.value || "<VALUE>", sid);
  const submit = (e?: React.FormEvent) => {
    e?.preventDefault();
    const found: Record<string, string | undefined> =
      tpl === "post" ? validateP4(f.url, f.handle, f.text) : tpl === "page" ? validatePage(f.url, f.text) : validateContract(f.chain, f.signature, f.address, f.value);
    setErrs(found);
    const first = Object.keys(found)[0];
    if (first) {
      setMode("form");
      window.setTimeout(() => document.getElementById(`q-${first}`)?.focus(), 0);
      return;
    }
    onAsk({ title: `Confirm: ${TEMPLATE_TITLES[tpl].toLowerCase()}`, subject: sid, action: ACTIONS.oracle, kind: TEMPLATE_KIND[tpl], body: templateBody(tpl, question, Number(f.chain), tpl === "contract" ? contractDefinitions(f.chain, f.signature, f.address, f.value) : undefined) });
  };
  const scratch = () => {
    setTpl("post");
    setF(blank);
    setErrs({});
    setMode("form");
    window.setTimeout(() => document.querySelector<HTMLInputElement>("#confirm input[name=template]:checked")?.focus(), 0);
  };
  const price = (
    <span className="price mono">{oraclePrice}</span>
  );
  return (
    <div className="card" id="confirm" tabIndex={-1}>
      <h3>Ask a panel to check a fact</h3>
      <p>For a line that matters: five agents answer independently, four must agree, and the answer is signed.</p>
      {mode === "intro" && (
        <>
          <p>Open any line and choose Ask a panel to check it.</p>
          <p>
            <button type="button" className="linklike" onClick={scratch}>Write a question from scratch</button>
          </p>
        </>
      )}
      {mode === "none" && (
        <div className="seeded" role="status">
          <p>“{f.text}”</p>
          <p className="warn">This line’s source is not an X post, a web page or a contract call whose re-run gives the call and its return, so no question can be filled in from it.</p>
          <p>
            <button type="button" className="linklike" onClick={scratch}>Write a question from scratch</button>
          </p>
        </div>
      )}
      {mode === "seeded" && (
        <div className="seeded">
          <p className="small">{TEMPLATE_TITLES[tpl]}</p>
          <p className="plain-q break" id="q-plain">{plainQuestion(tpl, f, chainName(Number(f.chain)))}</p>
          <details>
            <summary>Read the exact question</summary>
            <p className="objective">{question}</p>
          </details>
          <div className="row-actions">
            <button type="button" className="btn" onClick={() => setMode("form")}>Edit</button>
            {price}
            <button type="button" className="btn btn-primary" onClick={() => submit()}>Review the question</button>
          </div>
        </div>
      )}
      {mode === "form" && (
      <form className="form" onSubmit={submit} noValidate>
        <fieldset className="seg seg-hints">
          <legend>What to check</legend>
          {(Object.keys(TEMPLATE_TITLES) as Template[]).map((k) => (
            <label key={k} className="seg-item">
              <input type="radio" name="template" value={k} checked={tpl === k} onChange={() => { setTpl(k); setErrs({}); }} />
              <span className="seg-word">{TEMPLATE_TITLES[k]}</span>
              <span className="seg-hint">{TEMPLATE_HINTS[k]}</span>
            </label>
          ))}
        </fieldset>
        {tpl !== "contract" && (
          <>
            <label htmlFor="q-url">{tpl === "post" ? "Post link" : "Page link"}</label>
            <input {...field("q-url", errs.url)} name="url" type="url" inputMode="url" autoComplete="url" spellCheck={false}
              placeholder={tpl === "post" ? "https://x.com/name/status/123" : "https://example.com/docs"} value={f.url} onChange={set("url")} />
            <Err id="q-url" msg={errs.url} />
          </>
        )}
        {tpl === "post" && (
          <>
            <label htmlFor="q-handle">Handle of the account that posted it</label>
            <input {...field("q-handle", errs.handle)} name="handle" type="text" autoComplete="off" autoCapitalize="none" spellCheck={false} placeholder="name" value={f.handle} onChange={set("handle")} />
            <Err id="q-handle" msg={errs.handle} />
          </>
        )}
        {tpl !== "contract" && (
          <>
            <label htmlFor="q-text">{tpl === "post" ? "What the post says" : "What the page says"}</label>
            <input {...field("q-text", errs.text)} name="text" type="text" autoComplete="off" placeholder="the swap fee is 0.3%" value={f.text} onChange={set("text")} />
            <Err id="q-text" msg={errs.text} />
          </>
        )}
        {tpl === "contract" && (
          <>
            <label htmlFor="q-chain">Chain</label>
            <select {...field("q-chain", errs.chain)} name="chain" value={f.chain} onChange={set("chain")}>
              {CHAIN_CHOICES.map((c) => (
                <option key={c.id} value={c.id}>{c.name} ({c.id})</option>
              ))}
            </select>
            <Err id="q-chain" msg={errs.chain} />
            <label htmlFor="q-address">Contract address</label>
            <input {...field("q-address", errs.address)} name="address" type="text" className="mono" autoComplete="off" autoCapitalize="none" spellCheck={false} placeholder="0x…" value={f.address} onChange={set("address")} />
            <Err id="q-address" msg={errs.address} />
            <label htmlFor="q-signature">Function to call</label>
            <input {...field("q-signature", errs.signature)} name="signature" type="text" className="mono" autoComplete="off" autoCapitalize="none" spellCheck={false} placeholder="totalSupply()" value={f.signature} onChange={set("signature")} />
            <Err id="q-signature" msg={errs.signature} />
            <label htmlFor="q-value">Value it should return</label>
            <input {...field("q-value", errs.value)} name="value" type="text" autoComplete="off" placeholder="2000" value={f.value} onChange={set("value")} />
            <Err id="q-value" msg={errs.value} />
          </>
        )}
        <details>
          <summary>Read the question</summary>
          <p className="objective">{question}</p>
        </details>
        <div className="row-actions">
          <button className="btn" type="submit">Review the question</button>
          {price}
        </div>
      </form>
      )}
    </div>
  );
}

/**
 * Panel checks step back for now: every "Ask a panel to check" control and "Write a question from scratch" are
 * hidden. Panel answers that exist are still read and shown. Set to true to bring the Confirm a fact card back.
 */
export const PANEL_CHECKS = false;

export function ContributeTab({ onAsk, researchPrice, firstPrice, rec, onRefresh, refreshing, items, unreadable, jobs }: { onAsk: (a: Ask) => void; researchPrice: string; firstPrice?: string; rec: RecordState; onRefresh: () => void; refreshing: boolean; items: unknown[] | null; unreadable: number; jobs: PageJobs }) {
  // Page upkeep is closed by default; it starts open only once the chain and the files have answered and show no page,
  // no finished page job and no unreadable result, so "Create the page" is not hidden from a subject that has nothing else.
  // A scan read from the browser's cache cannot show that no page job finished since: known waits for the current scan.
  const known = items !== null && jobs.settled;
  const firstPage = known && !jobs.finished && !rec.page && !rec.latest && unreadable === 0;
  return (
    <section className="tab" aria-labelledby="actions-title">
      <h1 id="actions-title" className="tab-title" tabIndex={-1}>
        Contribute
      </h1>
      <div className="stack">
        <div className="card note-card" id="suggest-changes" tabIndex={-1}>
          <NoteForm />
        </div>
        {PANEL_CHECKS && <ConfirmCard key={rec.subject.id} onAsk={onAsk} rec={rec} />}
        <p className="small pay-line">Every request is paid from your own wallet to IMD Intake v2 on Ethereum. The dialog shows the price and the full request before your wallet asks.</p>
        <details className="upkeep" id="rebuild" open={firstPage || undefined}>
          <summary>Page upkeep</summary>
          <RebuildCard onAsk={onAsk} rec={rec} price={rec.page || jobs.finished ? researchPrice : firstPrice ?? researchPrice} onRefresh={onRefresh} refreshing={refreshing} known={known} unreadable={unreadable} jobs={jobs} />
        </details>
      </div>
    </section>
  );
}


/* ---------- Pay dialog ---------- */

type Step = "review" | PayStep | "error";

/** What the job will do, in one plain sentence, for the top of the pay dialog. Pure, for tests. */
export function askSentence(a: Pick<Ask, "action" | "kind" | "subject" | "rebuild" | "body" | "title">): string {
  const who = a.subject ?? "this project";
  if (a.action === ACTIONS.oracle) {
    const q = String(a.body.question ?? "").replace(/\s*This question is filed under the record of \S+\.\s*$/, "").trim();
    return `A panel of agents answers one question${q ? `: “${q.length > 160 ? `${q.slice(0, 158)}…` : q}”` : "."}`;
  }
  if (a.kind === "changes") {
    const n = parseItems((a.body as { objective?: unknown }).objective).length;
    return `A research job checks your ${n === 1 ? "suggested change" : `${n} suggested changes`} to ${who} against their sources and adds what they support.`;
  }
  if (a.kind === "source") return `A research job reads the links you gave and adds what they say about ${who} to its record.`;
  if (a.kind === "edit") return `A research job checks your edit to the summary of ${who} and adds what the record supports.`;
  if (/^Create/i.test(a.title)) return `A research job researches ${who} and writes its first page from public sources.`;
  return `A research job rebuilds the page of ${who} from its sources and earlier results.`;
}

/** A request the visitor just sent: its transaction, then its job once IMD lists it. */
export interface SentNote {
  hash: Hex;
  subject: string | null;
  kind: string;
  /** Changes in a "changes" request, for "Your N changes are being checked". */
  n: number;
  rebuild: boolean;
  at: number;
  /** Runs once Ethereum included the request (the tray is emptied). */
  afterSent?: () => void;
}

/** "The price changed since the page loaded…", when the page showed another price for this kind of request. */
export const priceChangedText = (shown: bigint | undefined, now: bigint): string => (shown !== undefined && shown !== now ? `The price changed since the page loaded: it is now ${imd(now)} (the page showed ${imd(shown)}). You pay ${imd(now)}.` : "");

/** `quoted`: the price of this exact request, read before the dialog opened. `exists`: a first page is no longer needed. */
function PayDialog({ ask, quoted, onClose, onSent, running, exists = false }: { ask: Ask; quoted: bigint; onClose: () => void; onSent: (sent: SentNote) => void; running?: Activity | null; exists?: boolean }) {
  const { address, isConnected, chainId } = useWalletAccount();
  const [price, setPrice] = useState<bigint>(quoted);
  const [allowance, setAllowance] = useState<bigint | null>(null);
  const [balance, setBalance] = useState<bigint | null>(null);
  const [step, setStep] = useState<Step>("review");
  const [msg, setMsg] = useState(() => priceChangedText(shownPrice(ask), quoted));
  const [priceFailed, setPriceFailed] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const opener = useRef<Element | null>(document.activeElement);
  const json = encodeBody(ask.body);
  const right = isConnected && chainId === CHAIN_ID && !!address;
  // One rebuild at a time: a rebuild someone else started while this review was open blocks paying for another.
  // The latest value is read again at the click, just before anything is sent to the wallet.
  const blocked = !!running && (step === "review" || step === "error");
  const stopRef = useRef(false);
  stopRef.current = !!running || exists;

  useEffect(() => noteShownPrice(ask, quoted), [ask, quoted]);
  /** A connected wallet: the price again (it may have moved while the visitor connected), its allowance and balance. */
  const readQuote = () => {
    setPriceFailed(false);
    if (!address) return;
    Promise.all([
      priceOfAsk(ask),
      publicClient.readContract({ address: IMD, abi: ERC20_ABI, functionName: "allowance", args: [address, INTAKE] }),
      publicClient.readContract({ address: IMD, abi: ERC20_ABI, functionName: "balanceOf", args: [address] }),
    ]).then(
      ([p, a, b]) => {
        const changed = priceChangedText(shownPrice(ask), p);
        if (changed) setMsg(changed);
        noteShownPrice(ask, p);
        setPrice(p);
        setAllowance(a);
        setBalance(b);
      },
      () => {
        setPriceFailed(true);
        setMsg("Unable to read the price again. Check your connection and use Retry price.");
      },
    );
  };
  useEffect(() => {
    readQuote();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [address]);

  useEffect(() => {
    // Everything outside the dialog is inert and Tab cycles inside it; closing gives focus back to the opener.
    // Escape closes the dialog only while it is the top modal; a wallet sheet over it takes Escape first.
    // closeRef: the latest close, so Escape sees the in-flight guard set after this first render.
    const release = ref.current ? holdFocus(ref.current, () => closeRef.current()) : () => undefined;
    ref.current?.querySelector<HTMLElement>("h2")?.focus();
    return () => {
      release();
      (opener.current as HTMLElement | null)?.focus?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const busy = step === "checking" || step === "approving" || step === "approved" || step === "sending" || step === "confirming";
  // Set synchronously at the click, before any read (payFlow.ts): a second click or an Escape while a request is in
  // flight does nothing, so one reviewed request goes to the wallet once, and its dialog stays to show Try again.
  const payment = useRef(new Payment());
  const alive = useRef(true);
  useEffect(() => () => void (alive.current = false), []);
  const close = () => {
    if (!payment.current.busy && !busy) onClose();
  };
  const closeRef = useRef(close);
  closeRef.current = close;
  /** The receipt of a transaction the wallet returned, from the wallet's own provider and the public RPC. */
  const receipt = async (h: Hex) => {
    const w = await loadWallet();
    const reads: ReceiptRead[] = [(x) => w.walletReceipt(x), rpcReceipt];
    return waitForReceipt(h, reads, { stop: () => !alive.current });
  };

  const pay = async () => {
    if (payment.current.busy || !address) return;
    setMsg("");
    const from = address;
    const out = await payment.current.pay(
      price,
      {
        readPrice: () => priceOfAsk(ask),
        allowance: () => publicClient.readContract({ address: IMD, abi: ERC20_ABI, functionName: "allowance", args: [from, INTAKE] }),
        approve: async (p) => (await loadWallet()).write({ address: IMD, abi: ERC20_ABI, functionName: "approve", args: [INTAKE, p], chainId: CHAIN_ID }),
        request: async (p) =>
          (await loadWallet()).write({
            address: INTAKE,
            abi: INTAKE_ABI,
            functionName: "request",
            args: [actionId(ask.action), stringToHex(json), { target: ZERO_ADDRESS, selector: EMPTY_SELECTOR }, IMD, p],
            chainId: CHAIN_ID,
          }),
        receipt,
        running: () => stopRef.current,
        // Signed: the dialog closes at once; the page's bar waits for Ethereum (App, SendBar).
        handoff: (hash) => {
          rememberSent({ hash, kind: ask.kind, action: ask.action, at: Date.now() });
          onSent({
            hash,
            subject: ask.subject ?? null,
            kind: ask.kind,
            n: ask.kind === "changes" ? parseItems((ask.body as { objective?: unknown }).objective).length : 0,
            rebuild: !!ask.rebuild,
            at: Date.now(),
            afterSent: ask.afterSent,
          });
        },
      },
      (s) => {
        if (s === "approved") setAllowance(price);
        if (alive.current) setStep(s);
      },
    );
    if (!out || out.kind === "gone" || !alive.current) return;
    if (out.kind === "price") {
      // Nothing was sent: the new amount is reviewed and needs its own Pay click (and approval, when it is higher).
      setPrice(out.price);
      noteShownPrice(ask, out.price);
      if (out.approved !== undefined) setAllowance(out.approved);
      setStep("review");
      setMsg(`The price changed to ${imd(out.price)}. Review it and pay again.`);
      return;
    }
    if (out.kind === "sent") return; // handed off at signing: the dialog is already closed
    if (out.kind === "blocked") {
      setStep("review");
      return;
    }
    if (out.kind === "error") {
      // The dialog stays with its draft: one sentence on what happened, and Try again.
      setStep("error");
      setMsg(out.message);
      return;
    }
  };

  const short = balance !== null && balance < price;
  const needsApprove = allowance !== null && allowance < price;
  const priceText = imd(price);

  return (
    <div className="sheet-bg" onClick={close}>
      <div ref={ref} className="sheet sheet-wide" role="dialog" aria-modal="true" aria-labelledby="pay-title" aria-describedby="pay-what" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-head">
          <h2 id="pay-title" tabIndex={-1}>{ask.title}</h2>
          <button className="x" aria-label="Close" onClick={close} disabled={busy}>×</button>
        </div>
        <p id="pay-what" className="pay-what">{askSentence(ask)}</p>
        <dl className="pay-plain">
          <div>
            <dt>Price</dt>
            <dd>{priceText}</dd>
          </div>
          <div>
            <dt>Paid to</dt>
            <dd>IMD, the network that runs the job. Not refunded.</dd>
          </div>
        </dl>
        {ask.warning && <p className="warn">{ask.warning}</p>}
        <div className="pay-more">
          <details className="ins-details">
            <summary>Show the full request</summary>
            <dl className="facts">
              <dt>Amount, in raw units</dt>
              <dd className="mono">{`${priceText} (${price.toString()})`}</dd>
              <dt>To</dt>
              <dd className="mono break">IMD Intake v2 {INTAKE}</dd>
              <dt>Action</dt>
              <dd className="mono">{ask.action}</dd>
            </dl>
            <p className="small">The full body, sent as UTF-8 bytes:</p>
            <pre className="body mono" tabIndex={0} aria-label="Request body">{JSON.stringify(ask.body, null, 2)}</pre>
            {needsApprove && <p className="small">Your wallet first approves exactly {priceText} to the Intake.</p>}
          </details>
          {ask.instructions && (
            <details className="ins-details">
              <summary>Instructions this job follows</summary>
              <InstructionsBlock name={ask.instructions} id={`dialog-ins-${ask.instructions}`} />
            </details>
          )}
        </div>
        {busy ? (
          <p className="pay-wait" role="status">
            {step === "checking"
              ? "Checking the price…"
              : step === "approved"
                ? "Approved. Now confirm the request."
                : step === "confirming"
                  ? "Sent from your wallet. Waiting for Ethereum to include it…"
                  : "Waiting for your wallet…"}
          </p>
        ) : (
          <div className="row-actions">
            {priceFailed && (
              <button type="button" className="btn" onClick={readQuote}>
                Retry price
              </button>
            )}
            {exists && (step === "review" || step === "error") ? (
              <p className="running" role="status">
                {ask.subject} has a page already, so nothing more is needed. <a href={subjectHref(ask.subject!)} onClick={onClose}>Open its page</a>
              </p>
            ) : blocked ? (
              <p className="running" role="status">
                A rebuild is running, started {startedAt(running!)} by <PayerLink name={payerName(running!)} address={running!.req.payer} />.{" "}
                <a href={jobLink(running!.jobId, running!.req.transactionHash)} target="_blank" rel="noopener noreferrer">Follow on the explorer</a>
              </p>
            ) : !isConnected ? (
              <><Connect /><span className="small">Connect a wallet to pay.</span></>
            ) : !right ? (
              <Connect />
            ) : (
              <button className="btn btn-primary" onClick={pay} disabled={short || priceFailed}>
                {step === "error" ? "Try again" : needsApprove ? `Approve and pay ${priceText}` : `Pay ${priceText}`}
              </button>
            )}
          </div>
        )}
        <p className={step === "error" ? "note error" : "note"} role={step === "error" ? "alert" : "status"}>
          {short && balance !== null ? `This wallet holds ${imd(balance)}, less than the price.` : ""}
          {msg}
        </p>
      </div>
    </div>
  );
}

/** Job ids of requests sent this visit, by lower-case transaction hash, as soon as the plane's admission names them. */
export type SentJobs = Record<string, string>;

/** The job link once its id is known (from the admission lookup or IMD's list), else the transaction on Etherscan. */
export const sentHref = (hash: string, items: Activity[] | null, jobs: SentJobs = {}): string => {
  const a = (items ?? []).find((x) => x.req.transactionHash.toLowerCase() === hash.toLowerCase());
  return jobLink(jobs[hash.toLowerCase()] ?? a?.jobId ?? null, hash);
};

/** The IMD job id of a sent request once admission (or IMD's list) names it, else null. */
export const sentJobId = (hash: string, items: Activity[] | null, jobs: SentJobs = {}): string | null => {
  const a = (items ?? []).find((x) => x.req.transactionHash.toLowerCase() === hash.toLowerCase());
  return jobs[hash.toLowerCase()] ?? a?.jobId ?? null;
};

/**
 * What the confirmation links to. "Follow it on the IMD explorer" only with the job's own IMD explorer link; while
 * the job is being assigned, "View the Ethereum transaction" on Etherscan.
 */
export function sentLink(hash: string, items: Activity[] | null, jobs: SentJobs = {}): { href: string; text: string; job: boolean } {
  const id = sentJobId(hash, items, jobs);
  return id ? { href: jobLink(id, hash), text: "Follow it on the IMD explorer", job: true } : { href: jobLink(null, hash), text: "View the Ethereum transaction", job: false };
}

/** What the bottom bar says once Ethereum included a request. */
export function sentDoneText(note: Pick<SentNote, "kind" | "n" | "rebuild">): string {
  if (note.kind === "changes") return note.n === 1 ? "Your change is with the swarm." : `Your ${note.n} changes are with the swarm.`;
  return note.rebuild ? "Your page request is with the swarm." : "Your request is with the swarm.";
}

export type SendState = "waiting" | "done" | "reverted";

/**
 * The bar at the bottom of the page after the wallet signed: "Sent. Waiting for Ethereum…", then "Your N changes are
 * with the swarm. Follow the job" with the explorer link, until dismissed.
 */
function SendBar({ sent, state, items, jobs, onDone }: { sent: SentNote; state: SendState; items: Activity[] | null; jobs: SentJobs; onDone: () => void }) {
  const link = sentLink(sent.hash, items, jobs);
  return (
    <div className={`send-bar${state === "reverted" ? " send-bar-error" : ""}`} role={state === "reverted" ? "alert" : "status"}>
      <p>
        {state === "waiting" ? (
          <>
            <span className="pending-dot" aria-hidden="true" />
            Sent. Waiting for Ethereum…{" "}
            <a href={jobLink(null, sent.hash)} target="_blank" rel="noopener noreferrer">View the transaction</a>
          </>
        ) : state === "reverted" ? (
          <>{REVERTED}</>
        ) : (
          <>
            {sentDoneText(sent)}{" "}
            <a href={link.job ? link.href : sentHref(sent.hash, items, jobs)} target="_blank" rel="noopener noreferrer">Follow the job</a>
            {link.job ? "" : <span className="small"> (IMD is assigning it; the link shows the transaction until then)</span>}
          </>
        )}
      </p>
      <button type="button" className="x" aria-label="Dismiss" onClick={onDone}>×</button>
    </div>
  );
}

/**
 * The pending state where the visitor is: "A rebuild is running, started just now" or "Your N changes are being
 * checked", each with "Follow on the explorer". From requests sent here this visit and from the chain.
 */
function PendingBar({ subject, items, sent, jobs }: { subject: string; items: Activity[] | null; sent: SentNote[]; jobs: SentJobs }) {
  const mine = (items ?? []).filter((a) => a.req.subject === subject);
  const done = (h: string) => mine.some((a) => a.req.transactionHash.toLowerCase() === h.toLowerCase() && a.state !== "pending");
  const rows: { key: string; text: string; href: string }[] = [];
  const rebuild = pendingRebuildOf(mine);
  const localRebuild = sent.find((x) => x.subject === subject && x.rebuild && !done(x.hash));
  if (rebuild) rows.push({ key: rebuild.req.transactionHash, text: `A rebuild is running, started ${startedAt(rebuild)}.`, href: jobLink(rebuild.jobId, rebuild.req.transactionHash) });
  else if (localRebuild) rows.push({ key: localRebuild.hash, text: "A rebuild is running, started just now.", href: sentHref(localRebuild.hash, items, jobs) });
  const mineSent = new Set([...sentTxs().map((x) => x.hash.toLowerCase()), ...sent.map((x) => x.hash.toLowerCase())]);
  const changes = new Map<string, { n: number; href: string }>();
  for (const x of sent) if (x.subject === subject && x.kind === "changes" && !done(x.hash)) changes.set(x.hash.toLowerCase(), { n: x.n, href: sentHref(x.hash, items, jobs) });
  for (const a of mine)
    if (a.state === "pending" && isChangesJob(a.req) && mineSent.has(a.req.transactionHash.toLowerCase()))
      changes.set(a.req.transactionHash.toLowerCase(), { n: parseItems(a.req.bodyJson?.objective).length, href: sentHref(a.req.transactionHash, items, jobs) });
  for (const [k, c] of changes) rows.push({ key: k, text: c.n === 1 ? "Your change is being checked." : `Your ${c.n} changes are being checked.`, href: c.href });
  if (!rows.length) return null;
  return (
    <div className="pending-bar" role="status">
      {rows.map((r) => (
        <p key={r.key}>
          <span className="pending-dot" aria-hidden="true" />
          {r.text}{" "}
          <a href={r.href} target="_blank" rel="noopener noreferrer">
            Follow on the explorer
          </a>
        </p>
      ))}
    </div>
  );
}
/* ---------- Routes: home, and each subject's tabs ---------- */

/** An old subject link (#/s/app.uniswap.org/overview) is replaced in the address bar by the current one, without a new history entry. */
function fixAddress() {
  const c = canonicalHash(location.hash);
  if (c) history.replaceState(history.state, "", c);
}

function useRoute() {
  const [route, setRoute] = useState(() => {
    fixAddress();
    return { ...routeOf(location.hash), n: 0 };
  });
  useEffect(() => {
    const on = () => {
      fixAddress();
      setRoute((r) => ({ ...routeOf(location.hash), n: r.n + 1 }));
    };
    addEventListener("hashchange", on);
    return () => removeEventListener("hashchange", on);
  }, []);
  return route;
}

function SubjectView({ subject, items, allItems, activity, route, onAsk, researchPrice, firstPrice, changesQuote, subjects, readingFiles, sent, jobs }: {
  readingFiles: boolean;
  jobs: SentJobs;
  /** Requests sent from this page this visit, for the pending state. */
  sent: SentNote[];
  subject: string;
  /** Every subject on the site, so Related can link to the ones that have a page here. */
  subjects: Findable[];
  items: Activity[] | null;
  /** Every request of the subject, also those not read: Activity lists them with the reason. */
  allItems: Activity[] | null;
  activity: ReturnType<typeof useActivity>;
  route: ReturnType<typeof useRoute>;
  onAsk: (a: Ask) => void;
  /** What a rebuild costs, and what a first page costs, each read through its own kind. */
  researchPrice: string;
  firstPrice: string;
  changesQuote: Quote;
}) {
  const rec = useRecordModel(items, activity.error, subject);
  const [filter, setFilter] = useState<Filter>("all");
  const [openSet, setOpenSet] = useState<Set<string>>(() => new Set());
  const toggle = useCallback(
    (id: string) =>
      setOpenSet((s) => {
        const n = new Set(s);
        if (n.has(id)) n.delete(id);
        else n.add(id);
        return n;
      }),
    [],
  );
  const alias = rec.alias;
  const openLines = useCallback((raw: string[]) => {
    // A line shown as one row with an identical line opens that row.
    const ids = [...new Set(raw.map((id) => alias.get(id) ?? id))];
    if (!ids.length) return;
    setFilter("all");
    setOpenSet((s) => new Set([...s, ...ids]));
    const h = to(lineAnchor(ids[0]!));
    if (location.hash === h) dispatchEvent(new HashChangeEvent("hashchange"));
    else location.hash = h;
  }, [alias]);
  // A permanent address (#/s/<subject>/l/<job id>:<line id>) opens the line whose origin it is, or the merged line
  // that lists it in also, through the Record's own line target: its section opens and the row is highlighted.
  const addressed = useMemo(() => {
    if (!route.address) return null;
    const id = lineForAddress(rec.origins, route.address);
    return id ? alias.get(id) ?? id : null;
  }, [route.address, rec.origins, alias]);
  const target = route.address ? (addressed ? lineAnchor(addressed) : null) : route.target;
  const ui: Ui = { filter, setFilter, openSet, toggle, openLines, target, routeN: route.n, highlight: addressed ?? undefined, address: route.address };

  // After a link: scroll to its target once it exists, else to the top of the tab; move focus there.
  const lines = rec.sections.length;
  useEffect(() => {
    const t = target;
    const el = t ? document.getElementById(t) : null;
    const land = (e: HTMLElement) => {
      e.scrollIntoView?.({ block: "start" });
      const f = e.querySelector<HTMLElement>(".row-toggle") ?? (e.tabIndex >= 0 || e.hasAttribute("tabindex") ? e : e.querySelector<HTMLElement>("textarea, button, summary, a, input"));
      if (route.n > 0 || route.address) f?.focus({ preventScroll: true });
      if (e instanceof HTMLDetailsElement) e.open = true;
    };
    if (t && !el) {
      // Not rendered yet: a line inside a closed section mounts only once the Record opens that section, in a later
      // render this effect does not see. Land on the row as soon as it is mounted (or give up after 15 seconds).
      const mo = new MutationObserver(() => {
        const found = document.getElementById(t);
        if (!found) return;
        mo.disconnect();
        window.clearTimeout(stop);
        land(found);
      });
      mo.observe(document.body, { childList: true, subtree: true });
      const stop = window.setTimeout(() => mo.disconnect(), 15_000);
      return () => {
        mo.disconnect();
        window.clearTimeout(stop);
      };
    }
    if (el) {
      land(el);
    } else if (route.n > 0) {
      window.scrollTo(0, 0);
      document.querySelector<HTMLElement>(".tab h1")?.focus({ preventScroll: true });
    }
  }, [route, target, lines, rec.page]);

  const name = rec.page?.name || subject;
  useEffect(() => {
    document.title = `${name} · Swarmpedia`;
  }, [name]);

  const refresh = () => void activity.reload();
  const pageJobs = useMemo(() => pageJobsOf(allItems, activity.cached), [allItems, activity.cached]);
  return (
    <SuggestProvider subject={subject} rec={rec}>
      <nav aria-label={`${name} tabs`} className="tabs">
        {TABS.map((t) => (
          <a key={t.id} href={subjectHref(subject, t.id)} aria-current={route.tab === t.id ? "page" : undefined}>
            {t.label}
          </a>
        ))}
      </nav>
      <PendingBar subject={subject} items={activity.items} sent={sent} jobs={jobs} />
      {route.tab === "overview" && <OverviewTab m={rec} ui={ui} items={items} price={researchPrice} onRetry={refresh} subjects={subjects} chainError={activity.error} retrying={activity.retrying} readingFiles={readingFiles} unreadable={unreadableCount(allItems ?? [])} jobs={pageJobs} />}
      {route.tab === "record" && <RecordTab m={rec} ui={ui} />}
      {route.tab === "sources" && <SourcesTab m={rec} />}
      {route.tab === "activity" && <ActivityList {...activity} items={allItems} shown={rec} subject={subject} />}
      {route.tab === "contribute" && <ContributeTab onAsk={onAsk} researchPrice={researchPrice} firstPrice={firstPrice} rec={rec} onRefresh={refresh} refreshing={activity.loading} items={items} unreadable={unreadableCount(allItems ?? [])} jobs={pageJobs} />}
      <TrayBar rec={rec} quote={changesQuote} onAsk={onAsk} />
    </SuggestProvider>
  );
}

/** Why a pay dialog did not open. */
export function notOpenedText(r: Prepared, a: Pick<Ask, "subject">): string {
  if (r.kind === "instructions") return INSTRUCTIONS_UNREACHABLE;
  if (r.kind === "price") return "The price could not be read, so nothing was opened and nothing can be paid.";
  if (r.kind === "chain") return "Ethereum could not be read again, so the site cannot tell whether this project already has a page. Nothing was opened.";
  if (r.kind === "running") return `A first page of ${a.subject ?? "this project"} is already being written. Open its page to follow it.`;
  return "";
}

export const CHAIN_READ_BLOCK = "The project list could not be read. Try again before reviewing a rebuild.";

export default function App() {
  const route = useRoute();
  const subject = route.subject;
  const activity = useActivity(subject ?? null);
  const [ask, setAsk] = useState<{ ask: Ask; price: bigint } | null>(null);
  const [sent, setSent] = useState<SentNote[]>([]);
  const [toast, setToast] = useState<SentNote | null>(null);
  const [sendState, setSendState] = useState<SendState>("waiting");
  const hideToast = useCallback(() => setToast(null), []);
  // While a sent request's job id is not known, read again so the toast and the pending line switch to the job link.
  const [jobs, setJobs] = useState<SentJobs>({});
  const waitingJob = sent.some((x) => !jobs[x.hash.toLowerCase()] && !(activity.items ?? []).some((a) => a.req.transactionHash.toLowerCase() === x.hash.toLowerCase() && (a.jobId || a.state !== "pending")));
  // The list itself is read again on a slow timer; the ref keeps that timer from restarting on every render.
  const reloadRef = useRef(activity.reload);
  reloadRef.current = activity.reload;
  useEffect(() => {
    if (!waitingJob) return;
    const t = window.setInterval(() => void reloadRef.current(), 15000);
    return () => window.clearInterval(t);
  }, [waitingJob]);
  // Each sent transaction's job id, looked up by its hash at once and then every 1.5 s until known, so the toast
  // and the pending line switch to the job link while the confirmation is still on screen. Keyed by the hashes only.
  const lookFor = sent.map((x) => x.hash.toLowerCase()).filter((h) => !jobs[h]).join(",");
  useEffect(() => {
    if (!lookFor) return;
    const stops = lookFor.split(",").map((h) =>
      followAdmission(h, (id) => {
        setJobs((j) => ({ ...j, [h]: id }));
        void reloadRef.current();
      }),
    );
    return () => stops.forEach((s) => s());
  }, [lookFor]);
  // A pay dialog opens only once the price of its exact request is read, its instruction file was fetched with a
  // matching sha256 (instructionsReachable), and, for a first page, Ethereum was read again and shows no finished page
  // job (prepareAsk); otherwise the visitor is told why, and nothing can be paid.
  const [checking, setChecking] = useState(false);
  const [notOpened, setNotOpened] = useState<{ ask: Ask; why: string } | null>(null);
  const preparing = useRef(false);
  const openAsk = useCallback((a: Ask) => {
    if (preparing.current) return;
    preparing.current = true;
    setNotOpened(null);
    setChecking(true);
    void prepareAsk(a, {
      instructionsOk: (x) => askInstructionsReachable(x),
      price: priceOfAsk,
      fresh: async (id) => {
        const now = await reloadRef.current();
        if (!now) return null;
        const mine = now.filter((x) => x.req.subject === id);
        return { finished: pageJobsOf(mine, false).finished, running: !!pendingRebuildOf(readable(mine)) };
      },
    }).then((r) => {
      preparing.current = false;
      setChecking(false);
      if (r.kind === "open") setAsk({ ask: a, price: r.price });
      else if (r.kind === "exists") location.hash = subjectHref(a.subject!);
      else setNotOpened({ ask: a, why: notOpenedText(r, a) });
    });
  }, []);
  const rebuildQuote = useKindPrice(REBUILD);
  const firstQuote = useKindPrice(FIRST_PAGE);
  const changesQuote = useKindPrice(CHANGES);
  // Requests not sent through this record's instructions are left out of every view but Activity (counts.ts).
  const counted = useMemo(() => (activity.items ? readable(activity.items) : null), [activity.items]);
  const { digests, logos, reading, failed, busy, retry, readAll } = useDigests(counted, subject ?? null, activity.readSubject);
  // One example for the three cards, on Home and in Docs.
  const example = useMemo(() => pickExample(digests), [digests]);
  if (subject) setLinkSubject(subject);
  // A subject's page waits until its result files are read: until then its requests are the home list's light ones.
  const allItems = useMemo(() => {
    if (activity.items === null || !subject) return activity.items;
    const mine = activity.items.filter((a) => a.req.subject === subject);
    // A result whose listing or file failed to load has settled too: the page says so and offers Try again.
    return mine.every(readSettled) ? mine : null;
  }, [activity.items, subject]);
  const items = useMemo(() => (allItems ? readable(allItems) : allItems), [allItems]);
  const unreadable = useMemo(() => unreadableBySubject(activity.items ?? []), [activity.items]);
  const readingFiles = !!subject && activity.items !== null && items === null;
  const subjects = useMemo<Findable[]>(() => subjectSummaries(counted ?? [], digests, logos).map((s) => ({ id: s.id, main: s.main, contracts: s.contracts, ranked: s.ranked })), [activity.items, digests, logos]);
  useEffect(() => {
    if (!subject && !route.docs && !route.wallet) document.title = HOME_TITLE;
  }, [subject, route.docs, route.wallet]);

  /** The home form: the Rebuild dialog for that subject, starting from its record when it already has one. */
  const addProject = (input: { domain: string; address: string; chain: string; leads?: string[] }): string | null => {
    if (Object.keys(validateSubject(input)).length) return "Fix the fields above.";
    if (activity.items === null) return "Wait until the list has loaded from Ethereum.";
    // A failed read leaves no earlier files to start from; never offer a paid rebuild on an unknown record.
    if (activity.error) return CHAIN_READ_BLOCK;
    // A list read from this browser's cache cannot show that a page job finished since: wait for the current scan.
    if (activity.cached) return "Still reading newer blocks from Ethereum. Try again in a moment.";
    const typed = refFromInput(input);
    const mine = readable(activity.items).filter((a) => a.req.subject === typed.id);
    const known = subjectRefFor(typed.id, mine, null);
    const ref: SubjectRef = typed.address ? typed : known;
    const busyWith = pendingRebuildOf(mine);
    if (busyWith) return `A rebuild of ${ref.id} is running, started ${startedAt(busyWith)} by ${payerName(busyWith)}. Open its page to follow it.`;
    // A subject with a finished page job is never offered a first page again: its page opens instead.
    if (pageJobsOf(activity.items.filter((a) => a.req.subject === typed.id), false).finished) {
      location.hash = subjectHref(ref.id);
      return null;
    }
    const plan = planRebuild(mine, ref);
    if (plan.needsReads) return `The page of ${ref.id} dropped lines whose files must be read first. Open its page and rebuild it from Contribute.`;
    if (!plan.ok) return `An earlier result of ${ref.id} could not be read yet. Open its page and use Refresh.`;
    const a = rebuildAsk(plan.prior, ref, plan.hasPage, plan.channels, plan.moreChannels, input.leads ?? []);
    if (a.warning) return a.warning;
    openAsk(a);
    return null;
  };

  return (
    <>
      <a className="skip" href="#root-main" onClick={(e) => { e.preventDefault(); document.getElementById("root-main")?.focus(); }}>Skip to content</a>
      <header className="top">
        <div className="top-row">
          <a className="brand" href="#/">Swarmpedia <span className="brand-beta">beta</span></a>
          <a className="top-link" href={DOCS_HREF} aria-current={route.docs ? "page" : undefined}>How it works</a>
          <Connect />
        </div>
      </header>
      <main id="root-main" tabIndex={-1}>
        {route.docs ? (
          <Docs quote={rebuildQuote} example={example} digests={digests} logos={logos} />
        ) : route.wallet ? (
          <Profile key={route.wallet} address={route.wallet} activity={activity} />
        ) : subject ? (
          <SubjectView key={subject} sent={sent} jobs={jobs} readingFiles={readingFiles} subject={subject} subjects={subjects} items={items} allItems={allItems} activity={activity} route={route} onAsk={openAsk} researchPrice={rebuildQuote.text} firstPrice={firstQuote.text} changesQuote={changesQuote} />
        ) : (
          <Home key={route.add ?? ""} items={counted} error={activity.error} loading={activity.loading} retrying={activity.retrying} cached={activity.cached} digests={digests} logos={logos} reading={reading} failed={failed} busy={busy} retry={retry} readAll={readAll} example={example} reload={activity.reload} onAdd={addProject} price={firstQuote.text} bad={route.bad} prefill={route.add} unreadable={unreadable} />
        )}
        <footer className="about">
          <p>Beta. Payments go to IMD and are not refunded. Every line comes from a paid job on Ethereum.</p>
          <p>
            For agents: <a href="./agents.md">agents.md</a> lists the Intake call, the exact bodies and the read routes.
          </p>
        </footer>
      </main>
      {checking && (
        <p className="toast" role="status">
          Reading the price and checking this request…
        </p>
      )}
      {notOpened && (
        <div className="toast toast-error" role="alert">
          <p>{notOpened.why}</p>
          {notOpened.why !== INSTRUCTIONS_UNREACHABLE && (
            <button type="button" className="btn" onClick={() => openAsk(notOpened.ask)}>
              Try again
            </button>
          )}
          <button type="button" className="btn" onClick={() => setNotOpened(null)}>
            Close
          </button>
        </div>
      )}
      {ask && (
        <PayDialog
          ask={ask.ask}
          quoted={ask.price}
          running={ask.ask.rebuild && ask.ask.subject ? pendingRebuildOf((activity.items ?? []).filter((a) => a.req.subject === ask.ask.subject)) : null}
          exists={ask.ask.kindId === "first-page" && pageJobsOf((activity.items ?? []).filter((a) => a.req.subject === ask.ask.subject), activity.cached).finished}
          onClose={() => setAsk(null)}
          onSent={(note) => {
            setAsk(null);
            setSent((xs) => [note, ...xs]);
            setToast(note);
            setSendState("waiting");
            // The wallet signed: wait for Ethereum here, not in the closed dialog.
            void loadWallet()
              .then((w) => waitForReceipt(note.hash, [(x) => w.walletReceipt(x), rpcReceipt]))
              .catch(() => waitForReceipt(note.hash, [rpcReceipt]))
              .then((st) => {
                if (st === "reverted") return setSendState("reverted");
                if (st === "success") {
                  note.afterSent?.();
                  setSendState("done");
                  void activity.reload();
                }
              });
            void activity.reload();
            // From Home (a new project), the visitor is taken to that project's page, where its pending state shows.
            if (ask.ask.subject && route.subject !== ask.ask.subject) location.hash = subjectHref(ask.ask.subject, "overview");
          }}
        />
      )}
      {toast && <SendBar sent={toast} state={sendState} items={activity.items} jobs={jobs} onDone={hideToast} />}
    </>
  );
}
