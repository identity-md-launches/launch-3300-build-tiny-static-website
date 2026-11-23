import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { formatUnits, pad, stringToHex, type Hex } from "viem";
import { ACTIONS, CHAIN_ID, EMPTY_SELECTOR, ERC20_ABI, ETHERSCAN, IMD, INTAKE, INTAKE_ABI, ZERO_ADDRESS } from "./config";
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
  rebuildBody,
  templateBody,
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
import { Payment, type PayStep } from "./payFlow";
import { leftOutText, pendingRebuildOf, planRebuild, subjectRefFor, subjectSummaries, useRecordModel, type RecordModel } from "./model";
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
import { Home, OutdatedNote, StillReading } from "./Home";
import { useDigests } from "./digest";
import type { Activity } from "./useActivity";
import { AddButtons, SuggestProvider, TrayBar, type Quote } from "./Suggest";
import { parseItems, takeConfirmSeed, type ConfirmSeed } from "./changes";

type RecordState = RecordModel;
const actionId = (a: string) => pad(stringToHex(a), { dir: "right", size: 32 });
const imd = (v: bigint) => `${formatUnits(v, 18)} IMD`;

async function readPrice(action: string): Promise<bigint> {
  return publicClient.readContract({ address: INTAKE, abi: INTAKE_ABI, functionName: "priceOf", args: [actionId(action), IMD] });
}

/** The price of an action, read once on load; refresh reads it again (the tray does, so its price stays live). */
function usePrice(action: string): Quote {
  const [price, setPrice] = useState<bigint | null>(null);
  const [failed, setFailed] = useState(false);
  const refresh = useCallback(() => {
    readPrice(action).then(
      (p) => {
        setPrice(p);
        setFailed(false);
      },
      () => setFailed(true),
    );
  }, [action]);
  useEffect(refresh, [refresh]);
  return useMemo(() => ({ text: failed ? "Price unavailable" : price === null ? "Reading price…" : imd(price), failed, refresh }), [failed, price, refresh]);
}

export interface Ask {
  title: string;
  /** The subject the request belongs to; after paying, the site opens its Activity. */
  subject?: string;
  action: string;
  /** What the request is (add, source, proof, statement, claim), remembered with the sent transaction. */
  kind: string;
  body: Record<string, unknown>;
  /** The instruction file the objective names, shown under the body. */
  instructions?: InstructionName;
  warning?: string;
  /** A rebuild (or first page) of `subject`: one at a time, so the review checks for one already running. */
  rebuild?: boolean;
  /** Runs once the request is paid and mined: the tray of changes is emptied. */
  afterSent?: () => void;
}


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
export function rebuildAsk(prior: Prior, subject: SubjectRef, hasPage: boolean, channels: ChannelTie[] = [], moreChannels = 0): Ask {
  const body = rebuildBody(prior, subject, channels, moreChannels);
  return {
    title: hasPage ? `Rebuild the page of ${subject.id}` : `Create the page of ${subject.id}`,
    subject: subject.id,
    action: ACTIONS.research,
    kind: "add",
    body,
    instructions: "rebuild",
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

function RebuildCard({ onAsk, rec, price, onRefresh, refreshing }: { onAsk: (a: Ask) => void; rec: RecordState; price: string; onRefresh: () => void; refreshing: boolean }) {
  const ask = rebuildAsk(rec.prior, rec.subject, !!rec.page, rec.promptChannels.list, rec.promptChannels.more);
  const prior = priorText(rec.prior);
  // Never opened for payment over the limit: the objective must fit in 7,900 characters.
  // One rebuild at a time: while one for this subject is pending, its button is replaced by where to follow it.
  const running = rec.pendingRebuild;
  const ready = rec.snapshot.ok && !ask.warning && !running;
  return (
    <div className="card" id="rebuild" tabIndex={-1}>
      <h3>{rec.page ? "Rebuild the page" : "Create the page"}</h3>
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
      {rec.snapshot.ok && ask.warning && <p className="warn">{ask.warning}</p>}
      {running ? (
        <p className="running" role="status">
          A rebuild is running, started {startedAt(running)} by <PayerLink name={payerName(running)} address={running.req.payer} />.{" "}
          <a href={jobLink(running.jobId, running.req.transactionHash)} target="_blank" rel="noopener noreferrer">Follow it</a>
        </p>
      ) : (
      <div className="row-actions">
        <button className="btn" onClick={() => (ready ? onAsk(ask) : undefined)} disabled={!ready}>
          {ready || ask.warning ? (rec.page ? "Rebuild the page" : "Create the page") : rec.snapshot.loading ? "Reading the record…" : "Record not read"}
        </button>
        <span className="price mono">{price}</span>
      </div>
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
  const oraclePrice = usePrice(ACTIONS.oracle).text;
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
    onAsk({ title: `Confirm: ${TEMPLATE_TITLES[tpl].toLowerCase()}`, subject: sid, action: ACTIONS.oracle, kind: TEMPLATE_KIND[tpl], body: templateBody(tpl, question, Number(f.chain)) });
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
            <input {...field("q-text", errs.text)} name="text" type="text" autoComplete="off" placeholder="a job costs 0.5 IMD" value={f.text} onChange={set("text")} />
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

function ContributeTab({ onAsk, researchPrice, rec, onRefresh, refreshing }: { onAsk: (a: Ask) => void; researchPrice: string; rec: RecordState; onRefresh: () => void; refreshing: boolean }) {
  return (
    <section className="tab" aria-labelledby="actions-title">
      <h1 id="actions-title" className="tab-title" tabIndex={-1}>
        Contribute
      </h1>
      <p className="lead">Every action is paid from your own wallet to IMD Intake v2 on Ethereum. The dialog shows the price and the full request before your wallet asks.</p>
      {rec.page && rec.outdated && <OutdatedNote o={rec.outdated} href={to("rebuild")} />}
      <div className="stack">
        <div className="card" id="suggest-changes" tabIndex={-1}>
          <h3>Suggest changes</h3>
          <ol className="howto">
            <li>Hover any row, or click a summary sentence.</li>
            <li>Say what is wrong, add context, or back it up with a link.</li>
            <li>Your changes collect at the bottom and go out as one job.</li>
          </ol>
          <AddButtons where="contribute" />
        </div>
        <ConfirmCard key={rec.subject.id} onAsk={onAsk} rec={rec} />
        <RebuildCard onAsk={onAsk} rec={rec} price={researchPrice} onRefresh={onRefresh} refreshing={refreshing} />
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
    return `A research job checks your ${n === 1 ? "suggested change" : `${n} suggested changes`} to ${who} against their sources and keeps what they support.`;
  }
  if (a.kind === "source") return `A research job reads the links you gave and adds what they say about ${who} to its record.`;
  if (a.kind === "edit") return `A research job checks your edit to the summary of ${who} and keeps what the record supports.`;
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
}

function PayDialog({ ask, onClose, onSent, running }: { ask: Ask; onClose: () => void; onSent: (sent: SentNote) => void; running?: Activity | null }) {
  const { address, isConnected, chainId } = useWalletAccount();
  const [price, setPrice] = useState<bigint | null>(null);
  const [allowance, setAllowance] = useState<bigint | null>(null);
  const [balance, setBalance] = useState<bigint | null>(null);
  const [step, setStep] = useState<Step>("review");
  const [msg, setMsg] = useState("");
  const [priceFailed, setPriceFailed] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const opener = useRef<Element | null>(document.activeElement);
  const json = encodeBody(ask.body);
  const right = isConnected && chainId === CHAIN_ID && !!address;
  // One rebuild at a time: a rebuild someone else started while this review was open blocks paying for another.
  // The latest value is read again at the click, just before anything is sent to the wallet.
  const blocked = !!running && (step === "review" || step === "error");
  const runningRef = useRef<Activity | null>(null);
  runningRef.current = running ?? null;

  const refresh = async () => {
    const p = await readPrice(ask.action);
    setPrice(p);
    if (address) {
      const [a, b] = await Promise.all([
        publicClient.readContract({ address: IMD, abi: ERC20_ABI, functionName: "allowance", args: [address, INTAKE] }),
        publicClient.readContract({ address: IMD, abi: ERC20_ABI, functionName: "balanceOf", args: [address] }),
      ]);
      setAllowance(a);
      setBalance(b);
    }
    return p;
  };
  /** Reads the price (and the wallet's allowance and balance); on failure the amount says so and Retry price shows. */
  const readQuote = () => {
    setPriceFailed(false);
    setMsg("");
    refresh().catch(() => {
      setPriceFailed(true);
      setMsg("Unable to read the price. Check your connection and use Retry price.");
    });
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
    if (payment.current.busy || !address || price === null) return;
    setMsg("");
    const from = address;
    const out = await payment.current.pay(
      price,
      {
        readPrice: () => readPrice(ask.action),
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
        running: () => !!runningRef.current,
      },
      (s) => {
        if (s === "approved" && price !== null) setAllowance(price);
        if (alive.current) setStep(s);
      },
    );
    if (!out || out.kind === "gone" || !alive.current) return;
    if (out.kind === "price") {
      setPrice(out.price);
      setStep("review");
      setMsg(`The price changed to ${imd(out.price)}. Review it and pay again.`);
      return;
    }
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
    rememberSent({ hash: out.hash, kind: ask.kind, action: ask.action, at: Date.now() });
    // Received: the dialog closes and the page follows the request; the tray is cleared (afterSent).
    ask.afterSent?.();
    onSent({
      hash: out.hash,
      subject: ask.subject ?? null,
      kind: ask.kind,
      n: ask.kind === "changes" ? parseItems((ask.body as { objective?: unknown }).objective).length : 0,
      rebuild: !!ask.rebuild,
      at: Date.now(),
    });
  };

  const short = balance !== null && price !== null && balance < price;
  const needsApprove = allowance !== null && price !== null && allowance < price;
  const priceText = price !== null ? imd(price) : priceFailed ? "Price unavailable" : "Reading price…";

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
              <dd className="mono">{price !== null ? `${imd(price)} (${price.toString()})` : priceText}</dd>
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
            {priceFailed && price === null && (
              <button type="button" className="btn" onClick={readQuote}>
                Retry price
              </button>
            )}
            {blocked ? (
              <p className="running" role="status">
                A rebuild is running, started {startedAt(running!)} by <PayerLink name={payerName(running!)} address={running!.req.payer} />.{" "}
                <a href={jobLink(running!.jobId, running!.req.transactionHash)} target="_blank" rel="noopener noreferrer">Follow on the explorer</a>
              </p>
            ) : !isConnected ? (
              <><Connect /><span className="small">Connect a wallet to pay.</span></>
            ) : !right ? (
              <Connect />
            ) : (
              <button className="btn btn-primary" onClick={pay} disabled={price === null || short}>
                {step === "error" ? "Try again" : needsApprove ? `Approve and pay ${price !== null ? imd(price) : ""}` : `Pay ${price !== null ? imd(price) : ""}`}
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

/** The small confirmation at the bottom of the page, for about 8 seconds after a request is sent. */
function SentToast({ sent, items, jobs, onDone }: { sent: SentNote; items: Activity[] | null; jobs: SentJobs; onDone: () => void }) {
  useEffect(() => {
    const t = window.setTimeout(onDone, 8000);
    return () => window.clearTimeout(t);
  }, [sent.hash, onDone]);
  return (
    <p className="toast toast-sent" role="status">
      <span>
        Sent.{" "}
        <a href={sentHref(sent.hash, items, jobs)} target="_blank" rel="noopener noreferrer">
          Follow it on the IMD explorer.
        </a>
      </span>
    </p>
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

function SubjectView({ subject, items, allItems, activity, route, onAsk, researchPrice, researchQuote, subjects, readingFiles, sent, jobs }: {
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
  researchPrice: string;
  researchQuote: Quote;
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
    document.title = `${name} · On the record (test)`;
  }, [name]);

  const refresh = () => void activity.reload();
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
      {route.tab === "overview" && <OverviewTab m={rec} ui={ui} items={items} price={researchPrice} subjects={subjects} chainError={activity.error} retrying={activity.retrying} readingFiles={readingFiles} />}
      {route.tab === "record" && <RecordTab m={rec} ui={ui} />}
      {route.tab === "sources" && <SourcesTab m={rec} />}
      {route.tab === "activity" && <ActivityList {...activity} items={allItems} shown={rec} subject={subject} />}
      {route.tab === "contribute" && <ContributeTab onAsk={onAsk} researchPrice={researchPrice} rec={rec} onRefresh={refresh} refreshing={activity.loading} />}
      <TrayBar rec={rec} quote={researchQuote} onAsk={onAsk} />
    </SuggestProvider>
  );
}

export const CHAIN_READ_BLOCK = "The project list could not be read. Try again before reviewing a rebuild.";

export default function App() {
  const route = useRoute();
  const subject = route.subject;
  const activity = useActivity(subject ?? null);
  const [ask, setAsk] = useState<Ask | null>(null);
  const [sent, setSent] = useState<SentNote[]>([]);
  const [toast, setToast] = useState<SentNote | null>(null);
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
  // A rebuild or a set of changes opens its pay dialog only after its instruction file was fetched and its sha256
  // matched (instructionsReachable); otherwise the visitor is told, and nothing can be paid.
  const [checking, setChecking] = useState(false);
  const [unreachable, setUnreachable] = useState(false);
  const openAsk = useCallback((a: Ask) => {
    setUnreachable(false);
    if (!needsInstructionCheck(a)) {
      setAsk(a);
      return;
    }
    setChecking(true);
    void askInstructionsReachable(a).then((ok) => {
      setChecking(false);
      if (ok) setAsk(a);
      else setUnreachable(true);
    });
  }, []);
  const researchQuote = usePrice(ACTIONS.research);
  const researchPrice = researchQuote.text;
  // Requests not sent through this record's instructions are left out of every view but Activity (counts.ts).
  const counted = useMemo(() => (activity.items ? readable(activity.items) : null), [activity.items]);
  const { digests, logos, reading, failed, busy, retry } = useDigests(counted, subject ?? null, activity.readSubject);
  if (subject) setLinkSubject(subject);
  // A subject's page waits until its result files are read: until then its requests are the home list's light ones.
  const allItems = useMemo(() => {
    if (activity.items === null || !subject) return activity.items;
    const mine = activity.items.filter((a) => a.req.subject === subject);
    return mine.every((a) => a.filesRead !== false || a.notRead) ? mine : null;
  }, [activity.items, subject]);
  const items = useMemo(() => (allItems ? readable(allItems) : allItems), [allItems]);
  const readingFiles = !!subject && activity.items !== null && items === null;
  const subjects = useMemo<Findable[]>(() => subjectSummaries(counted ?? [], digests, logos).map((s) => ({ id: s.id, main: s.main, contracts: s.contracts })), [activity.items, digests, logos]);
  useEffect(() => {
    if (!subject && !route.docs && !route.wallet) document.title = "On the record (test)";
  }, [subject, route.docs, route.wallet]);

  /** The home form: the Rebuild dialog for that subject, starting from its record when it already has one. */
  const addProject = (input: { domain: string; address: string; chain: string }): string | null => {
    if (Object.keys(validateSubject(input)).length) return "Fix the fields above.";
    if (activity.items === null) return "Wait until the list has loaded from Ethereum.";
    // A failed read leaves no earlier files to start from; never offer a paid rebuild on an unknown record.
    if (activity.error) return CHAIN_READ_BLOCK;
    const typed = refFromInput(input);
    const mine = readable(activity.items).filter((a) => a.req.subject === typed.id);
    const known = subjectRefFor(typed.id, mine, null);
    const ref: SubjectRef = typed.address ? typed : known;
    const busyWith = pendingRebuildOf(mine);
    if (busyWith) return `A rebuild of ${ref.id} is running, started ${startedAt(busyWith)} by ${payerName(busyWith)}. Open its page to follow it.`;
    const plan = planRebuild(mine, ref);
    if (plan.needsReads) return `The page of ${ref.id} dropped lines whose files must be read first. Open its page and rebuild it from Contribute.`;
    if (!plan.ok) return `An earlier result of ${ref.id} could not be read yet. Open its page and use Refresh.`;
    const a = rebuildAsk(plan.prior, ref, plan.hasPage, plan.channels, plan.moreChannels);
    if (a.warning) return a.warning;
    openAsk(a);
    return null;
  };

  return (
    <>
      <a className="skip" href="#root-main" onClick={(e) => { e.preventDefault(); document.getElementById("root-main")?.focus(); }}>Skip to content</a>
      <header className="top">
        <div className="top-row">
          <a className="brand" href="#/">On the record <span className="brand-test">(test)</span></a>
          <a className="top-link" href={DOCS_HREF} aria-current={route.docs ? "page" : undefined}>How it works</a>
          <Connect />
        </div>
      </header>
      <main id="root-main" tabIndex={-1}>
        {route.docs ? (
          <Docs quote={researchQuote} />
        ) : route.wallet ? (
          <Profile key={route.wallet} address={route.wallet} activity={activity} />
        ) : subject ? (
          <SubjectView key={subject} sent={sent} jobs={jobs} readingFiles={readingFiles} subject={subject} subjects={subjects} items={items} allItems={allItems} activity={activity} route={route} onAsk={openAsk} researchPrice={researchPrice} researchQuote={researchQuote} />
        ) : (
          <Home key={route.add ?? ""} items={counted} error={activity.error} loading={activity.loading} retrying={activity.retrying} cached={activity.cached} digests={digests} logos={logos} reading={reading} failed={failed} busy={busy} retry={retry} reload={activity.reload} onAdd={addProject} price={researchPrice} bad={route.bad} prefill={route.add} />
        )}
        <footer className="about">
          <p>About: a test. Payments go to IMD and are not refunded. Every line comes from a paid job or panel answer on Ethereum.</p>
          <p>
            For agents: <a href="./agents.md">agents.md</a> lists the Intake call, the exact bodies and the read routes.
          </p>
        </footer>
      </main>
      {checking && (
        <p className="toast" role="status">
          Checking that this job can read its instructions…
        </p>
      )}
      {unreachable && (
        <div className="toast toast-error" role="alert">
          <p>{INSTRUCTIONS_UNREACHABLE}</p>
          <button type="button" className="btn" onClick={() => setUnreachable(false)}>
            Close
          </button>
        </div>
      )}
      {ask && (
        <PayDialog
          ask={ask}
          running={ask.rebuild && ask.subject ? pendingRebuildOf((activity.items ?? []).filter((a) => a.req.subject === ask.subject)) : null}
          onClose={() => setAsk(null)}
          onSent={(note) => {
            setAsk(null);
            setSent((xs) => [note, ...xs]);
            setToast(note);
            void activity.reload();
            // From Home (a new project), the visitor is taken to that project's page, where its pending state shows.
            if (ask.subject && route.subject !== ask.subject) location.hash = subjectHref(ask.subject, "overview");
          }}
        />
      )}
      {toast && <SentToast sent={toast} items={activity.items} jobs={jobs} onDone={hideToast} />}
    </>
  );
}
