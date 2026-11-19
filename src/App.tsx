import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { formatUnits, pad, stringToHex, type Hex } from "viem";
import { useAccount } from "wagmi";
import { readContract, waitForTransactionReceipt, writeContract } from "wagmi/actions";
import { ACTIONS, CHAIN_ID, EMPTY_SELECTOR, ERC20_ABI, ETHERSCAN, IMD, INTAKE, INTAKE_ABI, ZERO_ADDRESS } from "./config";
import {
  EDIT_MAX_LINKS,
  EDIT_MAX_TEXT,
  MAX_OBJECTIVE,
  PRESETS,
  SOURCE_MAX_LINKS,
  cleanEditText,
  editBody,
  encodeBody,
  oracleBody,
  planEditLinks,
  planSources,
  priorText,
  questionP4,
  rebuildBody,
  sourceBody,
  validateP4,
} from "./bodies";
import { OverviewTab, RecordTab, SourcesTab, type Filter, type Ui } from "./Record";
import { ActivityList } from "./ActivityList";
import { ConnectSheet, config } from "./wallet";
import { rememberSent, useActivity } from "./useActivity";
import { useRecordModel, type RecordModel } from "./model";
import { lineAnchor } from "./format";

type RecordState = RecordModel;
const actionId = (a: string) => pad(stringToHex(a), { dir: "right", size: 32 });
const imd = (v: bigint) => `${formatUnits(v, 18)} IMD`;

async function readPrice(action: string): Promise<bigint> {
  return readContract(config, { address: INTAKE, abi: INTAKE_ABI, functionName: "priceOf", args: [actionId(action), IMD], chainId: CHAIN_ID });
}

function usePrice(action: string) {
  const [price, setPrice] = useState<bigint | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    readPrice(action).then(setPrice, () => setFailed(true));
  }, [action]);
  return failed ? "Price unavailable" : price === null ? "Reading price…" : imd(price);
}

interface Ask {
  title: string;
  action: string;
  /** What the request is (add, source, proof, statement, claim), remembered with the sent transaction. */
  kind: string;
  body: Record<string, unknown>;
  warning?: string;
}


/* ---------- Actions ---------- */

function AddSources({ onAsk, rec, price }: { onAsk: (a: Ask) => void; rec: RecordState; price: string }) {
  const [text, setText] = useState("");
  const [err, setErr] = useState("");
  const plan = useMemo(() => planSources(text, rec.channels, rec.main), [text, rec.channels, rec.main]);
  const n = plan.links.length;
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!rec.ready) {
      setErr("Wait until the record has loaded, so its channels can be named.");
      return;
    }
    if (n === 0) {
      setErr("Paste at least one https link, one per line.");
      document.getElementById("src-links")?.focus();
      return;
    }
    setErr("");
    onAsk({ title: `Add ${n} source${n === 1 ? "" : "s"}`, action: ACTIONS.research, kind: "source", body: sourceBody(plan.links, rec.channels, rec.main) });
  };
  const fit =
    plan.slotsLeft === 0
      ? `${SOURCE_MAX_LINKS} of ${SOURCE_MAX_LINKS} links: no more will fit.`
      : plan.moreAtMost === plan.slotsLeft
        ? `${n} of ${SOURCE_MAX_LINKS} links. ${plan.slotsLeft} more will fit.`
        : `${n} of ${SOURCE_MAX_LINKS} links. ${plan.moreAtMost} more will fit at full length (300 characters), more if shorter: ${plan.charsLeft.toLocaleString("en-US")} characters left.`;
  return (
    <div className="card" id="add-sources">
      <h3>Add sources</h3>
      <p>One research job reads each link and adds what it says about imd.fun to the record, as a statement if one of imd.fun's tied channels published it and a claim if not. Sources that are not about imd.fun add nothing.</p>
      <form className="form" onSubmit={submit} noValidate>
        <label htmlFor="src-links">Links, one per line</label>
        <textarea id="src-links" name="links" rows={5} spellCheck={false} autoCapitalize="none" autoComplete="off" placeholder={"https://x.com/name/status/123\nhttps://example.com/article"}
          value={text} onChange={(e) => setText(e.target.value)} aria-invalid={!!err} aria-describedby={`src-fit${err ? " src-err" : ""}`} />
        <p id="src-fit" className="small" aria-live="polite">{fit}</p>
        {plan.rejected.length > 0 && (
          <ul className="plain small skipped" aria-label="Lines left out">
            {plan.rejected.map((r, i) => (
              <li key={i}>
                Left out, {r.why}: <span className="mono break">{r.line.length > 80 ? `${r.line.slice(0, 79)}…` : r.line}</span>
              </li>
            ))}
          </ul>
        )}
        <p className="small">Only https links up to 300 characters, with no quotes or spaces. Repeats are dropped.</p>
        {err && <p id="src-err" className="error">{err}</p>}
        <div className="row-actions">
          <button className="btn" type="submit">Review the source job</button>
          <span className="price mono">{price}</span>
        </div>
      </form>
    </div>
  );
}

/** "Rebuild the page": the research action, starting from the page shown now and everything completed after it. */
function rebuildAsk(rec: RecordState): Ask {
  const body = rebuildBody(rec.prior);
  return {
    title: "Rebuild the page",
    action: ACTIONS.research,
    kind: "add",
    body,
    warning: body.objective.length >= MAX_OBJECTIVE ? `The objective is ${body.objective.length.toLocaleString("en-US")} characters, over the ${MAX_OBJECTIVE.toLocaleString("en-US")} the Intake takes. It would be refused.` : undefined,
  };
}

function RebuildCard({ onAsk, rec, price }: { onAsk: (a: Ask) => void; rec: RecordState; price: string }) {
  const ask = rebuildAsk(rec);
  const prior = priorText(rec.prior);
  return (
    <div className="card" id="rebuild">
      <h3>Rebuild the page</h3>
      <p>
        One page job starts from the page shown now and every sources and edit result completed after it, carries each line forward or says why it dropped it, merges
        repeats, and then looks for what is new.
      </p>
      <p className="small">
        {prior === "none"
          ? "There is no page yet, so this job starts from nothing."
          : `It is given ${rec.prior.files.length} earlier file${rec.prior.files.length === 1 ? "" : "s"} and ${rec.prior.answers.length} panel answer${rec.prior.answers.length === 1 ? "" : "s"}.`}
      </p>
      <details>
        <summary>Read the objective</summary>
        <p className="objective">{String(ask.body.objective)}</p>
      </details>
      {ask.warning && <p className="warn">{ask.warning}</p>}
      <div className="row-actions">
        <button className="btn btn-primary" onClick={() => (rec.ready ? onAsk(ask) : undefined)} disabled={!rec.ready}>
          {rec.ready ? "Rebuild the page" : "Reading the record…"}
        </button>
        <span className="price mono">{price}</span>
      </div>
    </div>
  );
}

/** The current summary as editable text: one paragraph per block, a blank line between them. */
function summaryText(rec: RecordState) {
  const paras: string[][] = [];
  let last: number | null | undefined;
  rec.summary.forEach((s, i) => {
    if (i === 0 || (s.paragraph !== null && s.paragraph !== last)) paras.push([]);
    paras[paras.length - 1]!.push(s.text.trim());
    last = s.paragraph;
  });
  return paras.map((p) => p.join(" ")).join("\n\n");
}

function SuggestEdit({ onAsk, rec, price }: { onAsk: (a: Ask) => void; rec: RecordState; price: string }) {
  const current = useMemo(() => summaryText(rec), [rec.summary]); // eslint-disable-line react-hooks/exhaustive-deps
  const [text, setText] = useState<string | null>(null);
  const [links, setLinks] = useState("");
  const [err, setErr] = useState("");
  const value = text ?? current;
  const clean = cleanEditText(value);
  const plan = useMemo(() => planEditLinks(links), [links]);
  const over = clean.length > EDIT_MAX_TEXT;
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!rec.ready) return setErr("Wait until the record has loaded, so the edit can name it.");
    if (clean.length < 20) {
      setErr("Write at least one full sentence.");
      document.getElementById("edit-text")?.focus();
      return;
    }
    if (over) {
      setErr(`Shorten the text to ${EDIT_MAX_TEXT.toLocaleString("en-US")} characters.`);
      document.getElementById("edit-text")?.focus();
      return;
    }
    const body = editBody(clean, rec.prior, plan.links);
    if (body.objective.length >= MAX_OBJECTIVE) return setErr(`The finished objective is over ${MAX_OBJECTIVE.toLocaleString("en-US")} characters. Shorten the text or drop a link.`);
    setErr("");
    onAsk({ title: "Suggest an edit", action: ACTIONS.research, kind: "edit", body });
  };
  return (
    <div className="card" id="suggest-edit" tabIndex={-1}>
      <h3>Suggest an edit</h3>
      <p>Change the summary as you like. One research job checks it sentence by sentence against the record and your links; what it accepts becomes the summary shown.</p>
      <form className="form" onSubmit={submit} noValidate>
        <label htmlFor="edit-text">Summary text</label>
        <textarea id="edit-text" name="summary" rows={9} value={value} onChange={(e) => setText(e.target.value)} aria-invalid={over || (!!err && clean.length < 20)} aria-describedby="edit-count" />
        <p id="edit-count" className={over ? "error" : "small"} aria-live="polite">
          {clean.length.toLocaleString("en-US")} of {EDIT_MAX_TEXT.toLocaleString("en-US")} characters
          {text !== null && text !== current ? (
            <>
              {" · "}
              <button type="button" className="linklike" onClick={() => setText(null)}>
                Start again from the current summary
              </button>
            </>
          ) : null}
        </p>
        <label htmlFor="edit-links">Links that back your text, one per line (optional)</label>
        <textarea id="edit-links" name="links" rows={3} spellCheck={false} autoCapitalize="none" autoComplete="off" placeholder="https://example.com/article" value={links} onChange={(e) => setLinks(e.target.value)} aria-describedby="edit-links-rule" />
        <p id="edit-links-rule" className="small">
          {plan.links.length} of {EDIT_MAX_LINKS} links. Only https links up to 300 characters, with no quotes or spaces. Repeats are dropped.
        </p>
        {plan.rejected.length > 0 && (
          <ul className="plain small skipped" aria-label="Links left out">
            {plan.rejected.map((r, i) => (
              <li key={i}>
                Left out, {r.why}: <span className="mono break">{r.line.length > 80 ? `${r.line.slice(0, 79)}…` : r.line}</span>
              </li>
            ))}
          </ul>
        )}
        {err && <p className="error" role="alert">{err}</p>}
        <div className="row-actions">
          <button className="btn" type="submit">Review the edit job</button>
          <span className="price mono">{price}</span>
        </div>
      </form>
    </div>
  );
}

function ContributeTab({ onAsk, researchPrice, rec }: { onAsk: (a: Ask) => void; researchPrice: string; rec: RecordState }) {
  const oraclePrice = usePrice(ACTIONS.oracle);
  const [p4, setP4] = useState({ url: "", handle: "", text: "" });
  const [p4Err, setP4Err] = useState<ReturnType<typeof validateP4>>({});

  const askP4 = (e: React.FormEvent) => {
    e.preventDefault();
    const errs = validateP4(p4.url, p4.handle, p4.text);
    setP4Err(errs);
    if (Object.keys(errs).length) {
      (document.getElementById(errs.url ? "p4-url" : errs.handle ? "p4-handle" : "p4-text") as HTMLElement | null)?.focus();
      return;
    }
    const q = questionP4(p4.url.trim(), p4.handle.trim().replace(/^@/, ""), p4.text.trim().replace(/[.?]+$/, ""));
    onAsk({ title: "Confirm a post", action: ACTIONS.oracle, kind: "claim", body: oracleBody(q, "panel") });
  };

  return (
    <section className="tab" aria-labelledby="actions-title">
      <h1 id="actions-title" className="tab-title" tabIndex={-1}>
        Contribute
      </h1>
      <p className="lead">Every action is paid from your own wallet to IMD Intake v2 on Ethereum. The dialog shows the price and the full request before your wallet asks.</p>
      <div className="grid">
        <RebuildCard onAsk={onAsk} rec={rec} price={researchPrice} />

        <div className="card" id="confirm">
          <h3>Confirm a fact</h3>
          <p>
            A panel of 5 agents answers true or false; 4 must agree. Each question costs <span className="mono">{oraclePrice}</span>.
          </p>
          <ul className="presets">
            {PRESETS.map((p) => (
              <li key={p.id}>
                <button className="btn preset" onClick={() => onAsk({ title: p.title, action: ACTIONS.oracle, kind: p.kind, body: oracleBody(p.question, p.evidence) })}>
                  <span>Check: {p.title}</span>
                  <span className="small">{p.note}</span>
                </button>
              </li>
            ))}
          </ul>

          <form className="form" onSubmit={askP4} noValidate>
            <h4>Check a post on X</h4>
            <label htmlFor="p4-url">Post link</label>
            <input id="p4-url" name="url" type="url" inputMode="url" autoComplete="url" placeholder="https://x.com/name/status/123"
              value={p4.url} onChange={(e) => setP4({ ...p4, url: e.target.value })} aria-invalid={!!p4Err.url} aria-describedby={p4Err.url ? "p4-url-err" : undefined} />
            {p4Err.url && <p id="p4-url-err" className="error">{p4Err.url}</p>}
            <label htmlFor="p4-handle">Handle of the account that posted it</label>
            <input id="p4-handle" name="handle" type="text" autoComplete="off" autoCapitalize="none" spellCheck={false} placeholder="imd_fun"
              value={p4.handle} onChange={(e) => setP4({ ...p4, handle: e.target.value })} aria-invalid={!!p4Err.handle} aria-describedby={p4Err.handle ? "p4-handle-err" : undefined} />
            {p4Err.handle && <p id="p4-handle-err" className="error">{p4Err.handle}</p>}
            <label htmlFor="p4-text">What the post says</label>
            <input id="p4-text" name="text" type="text" autoComplete="off" placeholder="the swarm has 2,000 seats"
              value={p4.text} onChange={(e) => setP4({ ...p4, text: e.target.value })} aria-invalid={!!p4Err.text} aria-describedby={p4Err.text ? "p4-text-err" : undefined} />
            {p4Err.text && <p id="p4-text-err" className="error">{p4Err.text}</p>}
            <button className="btn" type="submit">Review the post check</button>
          </form>
        </div>

        <AddSources onAsk={onAsk} rec={rec} price={researchPrice} />
        <SuggestEdit onAsk={onAsk} rec={rec} price={researchPrice} />
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
  useEffect(() => {
    refresh().catch(() => setMsg("Unable to read the price. Check your connection and try again."));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [address]);

  useEffect(() => {
    ref.current?.querySelector<HTMLElement>("h2")?.focus();
    const main = document.getElementById("root-main");
    main?.setAttribute("inert", "");
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    addEventListener("keydown", onKey);
    return () => {
      removeEventListener("keydown", onKey);
      main?.removeAttribute("inert");
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const close = () => {
    onClose();
    (opener.current as HTMLElement | null)?.focus?.();
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
          <dd className="mono">{price === null ? "Reading price…" : `${imd(price)} (${price.toString()})`}</dd>
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
/* ---------- Tabs, with their own links ---------- */

const TABS = [
  { id: "overview", label: "Overview" },
  { id: "record", label: "Record" },
  { id: "sources", label: "Sources" },
  { id: "activity", label: "Activity" },
  { id: "contribute", label: "Contribute" },
] as const;
type Tab = (typeof TABS)[number]["id"];

/** Which tab a link opens, and the element inside it. Old links (#actions, #add-sources, #activity) still work. */
export function routeOf(hash: string): { tab: Tab; target: string | null } {
  const h = decodeURIComponent(hash.replace(/^#/, ""));
  if (TABS.some((t) => t.id === h)) return { tab: h as Tab, target: null };
  if (h === "actions") return { tab: "contribute", target: null };
  if (h === "add-sources" || h === "suggest-edit" || h === "rebuild" || h === "confirm") return { tab: "contribute", target: h };
  if (h.startsWith("line-") || h === "dropped" || h === "unaccounted") return { tab: "record", target: h };
  if (h.startsWith("source-")) return { tab: "sources", target: h };
  if (h.startsWith("panel-")) return { tab: "overview", target: h };
  return { tab: "overview", target: null };
}

function useRoute() {
  const [route, setRoute] = useState(() => ({ ...routeOf(location.hash), n: 0 }));
  useEffect(() => {
    const on = () => setRoute((r) => ({ ...routeOf(location.hash), n: r.n + 1 }));
    addEventListener("hashchange", on);
    return () => removeEventListener("hashchange", on);
  }, []);
  return route;
}

export default function App() {
  const activity = useActivity();
  const [ask, setAsk] = useState<Ask | null>(null);
  const researchPrice = usePrice(ACTIONS.research);
  const rec = useRecordModel(activity.items);
  const route = useRoute();
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
    const h = `#${lineAnchor(ids[0]!)}`;
    if (location.hash === h) dispatchEvent(new HashChangeEvent("hashchange"));
    else location.hash = h;
  }, []);
  const ui: Ui = { filter, setFilter, openSet, toggle, openLines, target: route.target };

  // After a link: scroll to its target once it exists, else to the top of the tab; move focus there.
  const lines = rec.sections.length;
  useEffect(() => {
    const t = route.target;
    const el = t ? document.getElementById(t) : null;
    if (t && !el) return; // not rendered yet: runs again when the record loads
    if (el) {
      el.scrollIntoView?.({ block: "start" });
      const f = el.querySelector<HTMLElement>(".row-toggle") ?? (el.tabIndex >= 0 || el.hasAttribute("tabindex") ? el : el.querySelector<HTMLElement>("textarea, button, summary, a"));
      if (route.n > 0) f?.focus({ preventScroll: true });
      if (el instanceof HTMLDetailsElement) el.open = true;
    } else if (route.n > 0) {
      window.scrollTo(0, 0);
      document.querySelector<HTMLElement>(".tab h1")?.focus({ preventScroll: true });
    }
  }, [route, lines, rec.page]);

  const onRebuild = () => setAsk(rebuildAsk(rec));
  return (
    <>
      <a className="skip" href="#root-main" onClick={(e) => { e.preventDefault(); document.getElementById("root-main")?.focus(); }}>Skip to content</a>
      <header className="top">
        <div className="top-row">
          <a className="brand" href="#overview">IMD record</a>
          <ConnectSheet />
        </div>
        <nav aria-label="Tabs" className="tabs">
          {TABS.map((t) => (
            <a key={t.id} href={`#${t.id}`} aria-current={route.tab === t.id ? "page" : undefined}>
              {t.label}
            </a>
          ))}
        </nav>
      </header>
      <main id="root-main" tabIndex={-1}>
        {route.tab === "overview" && <OverviewTab m={rec} ui={ui} items={activity.items} price={researchPrice} onRebuild={onRebuild} />}
        {route.tab === "record" && <RecordTab m={rec} ui={ui} />}
        {route.tab === "sources" && <SourcesTab m={rec} />}
        {route.tab === "activity" && <ActivityList {...activity} shown={rec} />}
        {route.tab === "contribute" && <ContributeTab onAsk={setAsk} researchPrice={researchPrice} rec={rec} />}
        <footer className="about">
          <p>About: this is a test. Payments go to IMD and are not refunded. Nobody can edit this page by hand; every line comes from a paid research job or panel answer read from Ethereum.</p>
          <p>
            For agents: <a href="./agents.md">agents.md</a> lists the Intake call, the exact bodies and the read routes.
          </p>
        </footer>
      </main>
      {ask && <PayDialog ask={ask} onClose={() => setAsk(null)} onSent={() => void activity.reload()} />}
    </>
  );
}

