import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { formatUnits, pad, stringToHex, type Hex } from "viem";
import { useAccount } from "wagmi";
import { readContract, waitForTransactionReceipt, writeContract } from "wagmi/actions";
import { ACTIONS, CHAIN_ID, EMPTY_SELECTOR, ERC20_ABI, ETHERSCAN, IMD, INTAKE, INTAKE_ABI, ZERO_ADDRESS } from "./config";
import {
  MAX_OBJECTIVE,
  TEMPLATE_KIND,
  TEMPLATE_TITLES,
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
  type Prior,
  type Template,
} from "./bodies";
import { OverviewTab, RecordTab, SourcesTab, type Filter, type Ui } from "./Record";
import { ActivityList } from "./ActivityList";
import { ConnectSheet, config } from "./wallet";
import { rememberSent, useActivity } from "./useActivity";
import { holdFocus } from "./modal";
import { planRebuild, subjectRefFor, subjectSummaries, useRecordModel, type RecordModel } from "./model";
import type { Findable } from "./lookup";
import { lineAnchor } from "./format";
import { TABS, routeOf, setLinkSubject, subjectHref, to } from "./route";
import { CHAIN_CHOICES, chainName, describeSubject, refFromInput, validateSubject, type SubjectRef } from "./subject";
import { Home, StillReading } from "./Home";
import { useDigests } from "./digest";
import type { Activity } from "./useActivity";
import { AddButtons, SuggestProvider, TrayBar, type Quote } from "./Suggest";
import { takeConfirmSeed } from "./changes";

type RecordState = RecordModel;
const actionId = (a: string) => pad(stringToHex(a), { dir: "right", size: 32 });
const imd = (v: bigint) => `${formatUnits(v, 18)} IMD`;

async function readPrice(action: string): Promise<bigint> {
  return readContract(config, { address: INTAKE, abi: INTAKE_ABI, functionName: "priceOf", args: [actionId(action), IMD], chainId: CHAIN_ID });
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
  warning?: string;
  /** Runs once the request is paid and mined: the tray of changes is emptied. */
  afterSent?: () => void;
}


/* ---------- Actions ---------- */

/** "Rebuild the page": the research action, starting from the page shown now and everything completed after it. */
export function rebuildAsk(prior: Prior, subject: SubjectRef, hasPage: boolean): Ask {
  const body = rebuildBody(prior, subject);
  return {
    title: hasPage ? `Rebuild the page of ${subject.id}` : `Create the page of ${subject.id}`,
    subject: subject.id,
    action: ACTIONS.research,
    kind: "add",
    body,
    warning: body.objective.length >= MAX_OBJECTIVE ? `The objective is ${body.objective.length.toLocaleString("en-US")} characters, over the ${MAX_OBJECTIVE.toLocaleString("en-US")} the Intake takes. It would be refused.` : undefined,
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

function RebuildCard({ onAsk, rec, price, onRefresh, refreshing }: { onAsk: (a: Ask) => void; rec: RecordState; price: string; onRefresh: () => void; refreshing: boolean }) {
  const ask = rebuildAsk(rec.prior, rec.subject, !!rec.page);
  const prior = priorText(rec.prior);
  const ready = rec.snapshot.ok;
  return (
    <div className="card" id="rebuild" tabIndex={-1}>
      <h3>{rec.page ? "Rebuild the page" : "Create the page"}</h3>
      <p className="break">Tidies the record: merges repeats, folds in everything added since the last rebuild, and looks for what is new.</p>
      {ready ? (
        <>
          <p className="small">
            {prior === "none"
              ? "There is no page yet, so this job starts from nothing."
              : `It is given ${rec.prior.files.length} earlier file${rec.prior.files.length === 1 ? "" : "s"} and ${rec.prior.answers.length} panel answer${rec.prior.answers.length === 1 ? "" : "s"}.`}
          </p>
          <details>
            <summary>Read the objective</summary>
            <p className="small break">
              One page job starts from the page shown now and every page, sources, edit and changes result it has not folded in yet, carries each line forward or says why
              it dropped it, merges lines that say the same thing into one (keeping every origin and speaker), and then looks for what is new. It researches{" "}
              {describeSubject(rec.subject)}.
              {(rec.prior.reconsider?.length ?? 0) > 0 &&
                ` The page shown dropped lines, so ${rec.prior.reconsider!.length} file${rec.prior.reconsider!.length === 1 ? "" : "s"} they came from ${rec.prior.reconsider!.length === 1 ? "is" : "are"} listed again, marked “reconsider dropped lines”: the job carries those lines forward unless one is a duplicate, off subject or replaced by the same speaker.`}
            </p>
            {(rec.leftOut > 0 || rec.answersLeftOut > 0 || rec.reconsiderLeftOut > 0) && (
              <p className="warn">
                {rec.leftOut > 0 && `${rec.leftOut} older result${rec.leftOut === 1 ? " is" : "s are"} left out to keep the objective under 7,500 characters; it takes the newest that fit. `}
                {rec.answersLeftOut > 0 && `${rec.answersLeftOut} older panel answer${rec.answersLeftOut === 1 ? " is" : "s are"} left out for the same reason. `}
                {rec.reconsiderLeftOut > 0 && `${rec.reconsiderLeftOut} file${rec.reconsiderLeftOut === 1 ? "" : "s"} to reconsider ${rec.reconsiderLeftOut === 1 ? "is" : "are"} left out for the same reason.`}
              </p>
            )}
            <p className="objective">{String(ask.body.objective)}</p>
          </details>
        </>
      ) : (
        <SnapshotNote rec={rec} onRefresh={onRefresh} refreshing={refreshing} />
      )}
      {ready && ask.warning && <p className="warn">{ask.warning}</p>}
      <div className="row-actions">
        <button className="btn" onClick={() => (ready ? onAsk(ask) : undefined)} disabled={!ready}>
          {ready ? (rec.page ? "Rebuild the page" : "Create the page") : rec.snapshot.loading ? "Reading the record…" : "Record not read"}
        </button>
        <span className="price mono">{price}</span>
      </div>
    </div>
  );
}

const field = (id: string, err?: string) => ({ id, "aria-invalid": !!err, "aria-describedby": err ? `${id}-err` : undefined });
const Err = ({ id, msg }: { id: string; msg?: string }) => (msg ? <p id={`${id}-err`} className="error">{msg}</p> : null);

/** "Confirm a fact": three short forms, one per question template, each ending with the subject's "filed under" sentence. */
function ConfirmCard({ onAsk, rec }: { onAsk: (a: Ask) => void; rec: RecordState }) {
  const oraclePrice = usePrice(ACTIONS.oracle).text;
  const [tpl, setTpl] = useState<Template>("post");
  const [f, setF] = useState({ url: "", handle: "", text: "", chain: String(CHAIN_CHOICES.some((c) => c.id === rec.subject.chainId) ? rec.subject.chainId : 1), signature: "", address: rec.subject.address || rec.main, value: "" });
  const [errs, setErrs] = useState<Record<string, string | undefined>>({});
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });
  // "Ask a panel to check it" on a row opens this form with the row's sentence (and its source page) filled in.
  useEffect(() => {
    const s = takeConfirmSeed();
    if (!s) return;
    setTpl("page");
    setF((x) => ({ ...x, url: /^https:\/\//.test(s.url) ? s.url : x.url, text: s.text.replace(/[.?!]+$/, "").slice(0, 400) }));
    window.setTimeout(() => document.getElementById(/^https:\/\//.test(s.url) ? "q-text" : "q-url")?.focus(), 0);
  }, []);
  const sid = rec.subject.id;
  const question =
    tpl === "post"
      ? questionPost(f.url || "<URL>", f.handle || "<HANDLE>", f.text || "<TEXT>", sid)
      : tpl === "page"
        ? questionPage(f.url || "<URL>", f.text || "<TEXT>", sid)
        : questionContract(f.chain || "<CHAIN ID>", f.signature || "<FUNCTION SIGNATURE>", f.address || "<ADDRESS>", f.value || "<VALUE>", sid);
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const found: Record<string, string | undefined> =
      tpl === "post" ? validateP4(f.url, f.handle, f.text) : tpl === "page" ? validatePage(f.url, f.text) : validateContract(f.chain, f.signature, f.address, f.value);
    setErrs(found);
    const first = Object.keys(found)[0];
    if (first) {
      document.getElementById(`q-${first}`)?.focus();
      return;
    }
    onAsk({ title: `Confirm: ${TEMPLATE_TITLES[tpl].toLowerCase()}`, subject: sid, action: ACTIONS.oracle, kind: TEMPLATE_KIND[tpl], body: templateBody(tpl, question, Number(f.chain)) });
  };
  return (
    <div className="card" id="confirm" tabIndex={-1}>
      <h3>Ask a panel to check a fact</h3>
      <p>
        A panel of 5 agents answers true or false; 4 must agree. The answer is filed under this record and shows on the line it confirms or contradicts. Each question costs{" "}
        <span className="mono">{oraclePrice}</span>.
      </p>
      <form className="form" onSubmit={submit} noValidate>
        <fieldset className="seg">
          <legend>What to check</legend>
          {(Object.keys(TEMPLATE_TITLES) as Template[]).map((k) => (
            <label key={k} className="seg-item">
              <input type="radio" name="template" value={k} checked={tpl === k} onChange={() => { setTpl(k); setErrs({}); }} />
              {TEMPLATE_TITLES[k]}
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
          <span className="price mono">{oraclePrice}</span>
        </div>
      </form>
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

type Step = "review" | "approving" | "sending" | "sent" | "error";

function PayDialog({ ask, onClose, onSent }: { ask: Ask; onClose: () => void; onSent: () => void }) {
  const { address, isConnected, chainId } = useAccount();
  const [price, setPrice] = useState<bigint | null>(null);
  const [allowance, setAllowance] = useState<bigint | null>(null);
  const [balance, setBalance] = useState<bigint | null>(null);
  const [step, setStep] = useState<Step>("review");
  const [msg, setMsg] = useState("");
  const [priceFailed, setPriceFailed] = useState(false);
  const [tx, setTx] = useState<Hex | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const opener = useRef<Element | null>(document.activeElement);
  const json = encodeBody(ask.body);
  const right = isConnected && chainId === CHAIN_ID && !!address;

  const refresh = async () => {
    const p = await readPrice(ask.action);
    setPrice(p);
    if (address) {
      const [a, b] = await Promise.all([
        readContract(config, { address: IMD, abi: ERC20_ABI, functionName: "allowance", args: [address, INTAKE], chainId: CHAIN_ID }),
        readContract(config, { address: IMD, abi: ERC20_ABI, functionName: "balanceOf", args: [address], chainId: CHAIN_ID }),
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
    const release = ref.current ? holdFocus(ref.current, () => close()) : () => undefined;
    ref.current?.querySelector<HTMLElement>("h2")?.focus();
    return () => {
      release();
      (opener.current as HTMLElement | null)?.focus?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const close = () => {
    onClose();
  };

  const pay = async () => {
    if (!address || price === null) return;
    setMsg("");
    try {
      // The price is read again at the click; the amount sent is exactly that value.
      const p = await readPrice(ask.action);
      if (p !== price) {
        setPrice(p);
        setMsg(`The price changed to ${imd(p)}. Review it and pay again.`);
        return;
      }
      const a = await readContract(config, { address: IMD, abi: ERC20_ABI, functionName: "allowance", args: [address, INTAKE], chainId: CHAIN_ID });
      if (a < p) {
        setStep("approving");
        const h = await writeContract(config, { address: IMD, abi: ERC20_ABI, functionName: "approve", args: [INTAKE, p], chainId: CHAIN_ID });
        await waitForTransactionReceipt(config, { hash: h, chainId: CHAIN_ID });
        setAllowance(p);
      }
      setStep("sending");
      const h = await writeContract(config, {
        address: INTAKE,
        abi: INTAKE_ABI,
        functionName: "request",
        args: [actionId(ask.action), stringToHex(json), { target: ZERO_ADDRESS, selector: EMPTY_SELECTOR }, IMD, p],
        chainId: CHAIN_ID,
      });
      setTx(h);
      rememberSent({ hash: h, kind: ask.kind, action: ask.action, at: Date.now() });
      await waitForTransactionReceipt(config, { hash: h, chainId: CHAIN_ID });
      setStep("sent");
      ask.afterSent?.();
      onSent();
    } catch (e) {
      const text = e instanceof Error ? e.message : "";
      setStep("error");
      setMsg(/reject|denied/i.test(text) ? "The wallet request was declined. Nothing was paid." : "The transaction did not go through. Check the wallet and try again.");
    }
  };

  const short = balance !== null && price !== null && balance < price;
  const needsApprove = allowance !== null && price !== null && allowance < price;
  const busy = step === "approving" || step === "sending";

  return (
    <div className="sheet-bg" onClick={busy ? undefined : close}>
      <div ref={ref} className="sheet sheet-wide" role="dialog" aria-modal="true" aria-labelledby="pay-title" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-head">
          <h2 id="pay-title" tabIndex={-1}>{ask.title}</h2>
          <button className="x" aria-label="Close" onClick={close} disabled={busy}>×</button>
        </div>
        <dl className="facts">
          <dt>Amount</dt>
          <dd className="mono">{price !== null ? `${imd(price)} (${price.toString()})` : priceFailed ? "Price unavailable" : "Reading price…"}</dd>
          <dt>To</dt>
          <dd className="mono">IMD Intake v2 {INTAKE}</dd>
          <dt>Action</dt>
          <dd className="mono">{ask.action}</dd>
        </dl>
        {ask.warning && <p className="warn">{ask.warning}</p>}
        <p className="small">The full body, sent as UTF-8 bytes:</p>
        <pre className="body mono" tabIndex={0} aria-label="Request body">{JSON.stringify(ask.body, null, 2)}</pre>
        <p className="small">Payments go to IMD and are not refunded. {needsApprove ? `Your wallet first approves exactly ${price !== null ? imd(price) : "the price"} to the Intake.` : ""}</p>
        <div className="row-actions">
          {priceFailed && price === null && (
            <button type="button" className="btn" onClick={readQuote}>
              Retry price
            </button>
          )}
          {!isConnected ? (
            <><ConnectSheet /><span className="small">Connect a wallet to pay.</span></>
          ) : !right ? (
            <ConnectSheet />
          ) : step === "sent" ? (
            <button className="btn btn-primary" onClick={close}>Done</button>
          ) : (
            <button className="btn btn-primary" onClick={pay} disabled={busy || price === null || short}>
              {step === "approving" ? "Approving in wallet…" : step === "sending" ? "Paying in wallet…" : needsApprove ? `Approve and pay ${price !== null ? imd(price) : ""}` : `Pay ${price !== null ? imd(price) : ""}`}
            </button>
          )}
        </div>
        <p className="note" role="status">
          {short && balance !== null ? `This wallet holds ${imd(balance)}, less than the price.` : ""}
          {step === "sent" ? "Paid. It shows under Activity as pending until the swarm answers." : ""}
          {msg}
          {tx && <> <a href={`${ETHERSCAN}/tx/${tx}`} target="_blank" rel="noopener noreferrer">View the transaction</a></>}
        </p>
      </div>
    </div>
  );
}
/* ---------- Routes: home, and each subject's tabs ---------- */

function useRoute() {
  const [route, setRoute] = useState(() => ({ ...routeOf(location.hash), n: 0 }));
  useEffect(() => {
    const on = () => setRoute((r) => ({ ...routeOf(location.hash), n: r.n + 1 }));
    addEventListener("hashchange", on);
    return () => removeEventListener("hashchange", on);
  }, []);
  return route;
}

function SubjectView({ subject, items, activity, route, onAsk, researchPrice, researchQuote, subjects, readingFiles }: {
  readingFiles: boolean;
  subject: string;
  /** Every subject on the site, so Related can link to the ones that have a page here. */
  subjects: Findable[];
  items: Activity[] | null;
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
  const openLines = useCallback((ids: string[]) => {
    if (!ids.length) return;
    setFilter("all");
    setOpenSet((s) => new Set([...s, ...ids]));
    const h = to(lineAnchor(ids[0]!));
    if (location.hash === h) dispatchEvent(new HashChangeEvent("hashchange"));
    else location.hash = h;
  }, []);
  const ui: Ui = { filter, setFilter, openSet, toggle, openLines, target: route.target, routeN: route.n };

  // After a link: scroll to its target once it exists, else to the top of the tab; move focus there.
  const lines = rec.sections.length;
  useEffect(() => {
    const t = route.target;
    const el = t ? document.getElementById(t) : null;
    if (t && !el) return; // not rendered yet: runs again when the record loads
    if (el) {
      el.scrollIntoView?.({ block: "start" });
      const f = el.querySelector<HTMLElement>(".row-toggle") ?? (el.tabIndex >= 0 || el.hasAttribute("tabindex") ? el : el.querySelector<HTMLElement>("textarea, button, summary, a, input"));
      if (route.n > 0) f?.focus({ preventScroll: true });
      if (el instanceof HTMLDetailsElement) el.open = true;
    } else if (route.n > 0) {
      window.scrollTo(0, 0);
      document.querySelector<HTMLElement>(".tab h1")?.focus({ preventScroll: true });
    }
  }, [route, lines, rec.page]);

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
      {route.tab === "overview" && <OverviewTab m={rec} ui={ui} items={items} price={researchPrice} subjects={subjects} chainError={activity.error} retrying={activity.retrying} readingFiles={readingFiles} />}
      {route.tab === "record" && <RecordTab m={rec} ui={ui} />}
      {route.tab === "sources" && <SourcesTab m={rec} />}
      {route.tab === "activity" && <ActivityList {...activity} items={items} shown={rec} subject={subject} />}
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
  const researchQuote = usePrice(ACTIONS.research);
  const researchPrice = researchQuote.text;
  const { digests, logos } = useDigests(activity.items, subject ?? null);
  if (subject) setLinkSubject(subject);
  // A subject's page waits until its result files are read: until then its requests are the home list's light ones.
  const items = useMemo(() => {
    if (activity.items === null || !subject) return activity.items;
    const mine = activity.items.filter((a) => a.req.subject === subject);
    return mine.every((a) => a.filesRead !== false) ? mine : null;
  }, [activity.items, subject]);
  const readingFiles = !!subject && activity.items !== null && items === null;
  const subjects = useMemo<Findable[]>(() => subjectSummaries(activity.items ?? [], digests, logos).map((s) => ({ id: s.id, main: s.main, contracts: s.contracts })), [activity.items, digests, logos]);
  useEffect(() => {
    if (!subject) document.title = "On the record (test)";
  }, [subject]);

  /** The home form: the Rebuild dialog for that subject, starting from its record when it already has one. */
  const addProject = (input: { domain: string; address: string; chain: string }): string | null => {
    if (Object.keys(validateSubject(input)).length) return "Fix the fields above.";
    if (activity.items === null) return "Wait until the list has loaded from Ethereum.";
    // A failed read leaves no earlier files to start from; never offer a paid rebuild on an unknown record.
    if (activity.error) return CHAIN_READ_BLOCK;
    const typed = refFromInput(input);
    const mine = activity.items.filter((a) => a.req.subject === typed.id);
    const known = subjectRefFor(typed.id, mine, null);
    const ref: SubjectRef = typed.address ? typed : known;
    const plan = planRebuild(mine, ref);
    if (plan.needsReads) return `The page of ${ref.id} dropped lines whose files must be read first. Open its page and rebuild it from Contribute.`;
    if (plan.reconsiderLeftOut > 0) return `The files the page of ${ref.id} dropped lines from do not fit in one objective. Open its page to see why.`;
    if (!plan.ok) return `An earlier result of ${ref.id} could not be read yet. Open its page and use Refresh.`;
    setAsk(rebuildAsk(plan.prior, ref, plan.hasPage));
    return null;
  };

  return (
    <>
      <a className="skip" href="#root-main" onClick={(e) => { e.preventDefault(); document.getElementById("root-main")?.focus(); }}>Skip to content</a>
      <header className="top">
        <div className="top-row">
          <a className="brand" href="#/">On the record <span className="brand-test">(test)</span></a>
          <ConnectSheet />
        </div>
      </header>
      <main id="root-main" tabIndex={-1}>
        {subject ? (
          <SubjectView key={subject} readingFiles={readingFiles} subject={subject} subjects={subjects} items={items} activity={activity} route={route} onAsk={setAsk} researchPrice={researchPrice} researchQuote={researchQuote} />
        ) : (
          <Home key={route.add ?? ""} items={activity.items} error={activity.error} loading={activity.loading} retrying={activity.retrying} cached={activity.cached} digests={digests} logos={logos} reload={activity.reload} onAdd={addProject} price={researchPrice} bad={route.bad} prefill={route.add} />
        )}
        <footer className="about">
          <p>About: a test. Payments go to IMD and are not refunded. Every line comes from a paid job or panel answer on Ethereum.</p>
          <p>
            For agents: <a href="./agents.md">agents.md</a> lists the Intake call, the exact bodies and the read routes.
          </p>
        </footer>
      </main>
      {ask && (
        <PayDialog
          ask={ask}
          onClose={() => setAsk(null)}
          onSent={() => {
            void activity.reload();
            if (ask.subject && route.subject !== ask.subject) location.hash = subjectHref(ask.subject, "activity");
          }}
        />
      )}
    </>
  );
}
