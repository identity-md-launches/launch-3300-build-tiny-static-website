import { useEffect, useMemo, useRef, useState } from "react";
import { formatUnits, pad, stringToHex, type Hex } from "viem";
import { useAccount } from "wagmi";
import { readContract, waitForTransactionReceipt, writeContract } from "wagmi/actions";
import { ACTIONS, CHAIN_ID, EMPTY_SELECTOR, ERC20_ABI, ETHERSCAN, IMD, INTAKE, INTAKE_ABI, ZERO_ADDRESS } from "./config";
import { PRESETS, RESEARCH_OBJECTIVE, SOURCE_MAX_LINKS, encodeBody, oracleBody, planSources, questionP4, researchBody, sourceBody, validateP4 } from "./bodies";
import { fetchResearchPage } from "./api";
import { parsePage, safeHref, type Page } from "./page";
import { Record, type RecordState } from "./Record";
import { ActivityList } from "./ActivityList";
import { ConnectSheet, config } from "./wallet";
import { rememberSent, useActivity, type Activity } from "./useActivity";

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

/** The newest completed research page, downloaded, hash-checked and parsed. */
function useRecordPage(items: Activity[] | null): RecordState {
  const latest = useMemo(() => items?.find((a) => a.req.action === ACTIONS.research && a.req.kind === "add" && a.state === "completed"), [items]);
  const [page, setPage] = useState<Page | null>(null);
  const [via, setVia] = useState<{ jobId: string | null; path: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!latest?.completion) return;
    setError(null);
    fetchResearchPage(latest.req, latest.completion, latest.jobId)
      .then((p) => {
        setPage(parsePage(p.text));
        setVia({ jobId: p.jobId, path: p.path });
      })
      .catch((e) => setError(e instanceof Error ? e.message : "The page could not be read"));
  }, [latest]);
  /** Ready once the chain was read and the page, if there is one, has loaded or failed. */
  const ready = items !== null && (!latest || page !== null || error !== null);
  const channels = (page?.channels ?? []).flatMap((c) => {
    const url = safeHref(c.url);
    return url ? [{ url, tie: c.tie }] : [];
  });
  return { latest, page, via, error, ready, channels, main: page?.main ?? "" };
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

function Actions({ onAsk, researchPrice, rec }: { onAsk: (a: Ask) => void; researchPrice: string; rec: RecordState }) {
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
    <section id="actions" aria-labelledby="actions-title">
      <h2 id="actions-title" className="section-title">
        Pay the swarm
      </h2>
      <div className="grid">
        <div className="card">
          <h3>Research this page</h3>
          <p>One research job reads imd.fun's own channels and contracts and writes every line of the record, with sources.</p>
          <details>
            <summary>Read the objective</summary>
            <p className="objective">{RESEARCH_OBJECTIVE}</p>
          </details>
          <div className="row-actions">
            <button className="btn btn-primary" onClick={() => onAsk({ title: "Research this page", action: ACTIONS.research, kind: "add", body: researchBody() })}>
              Research this page
            </button>
            <span className="price mono">{researchPrice}</span>
          </div>
        </div>

        <div className="card">
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

/* ---------- App ---------- */

export default function App() {
  const activity = useActivity();
  const [ask, setAsk] = useState<Ask | null>(null);
  const researchPrice = usePrice(ACTIONS.research);
  const rec = useRecordPage(activity.items);
  return (
    <>
      <a className="skip" href="#root-main">Skip to content</a>
      <header className="top">
        <a className="brand" href="#record">IMD record</a>
        <nav aria-label="Sections" className="nav">
          <a href="#actions">Actions</a>
          <a href="#activity">Activity</a>
        </nav>
        <ConnectSheet />
      </header>
      <main id="root-main" tabIndex={-1}>
        <Record items={activity.items} rec={rec} price={researchPrice} onResearch={() => setAsk({ title: "Research this page", action: ACTIONS.research, kind: "add", body: researchBody() })} />
        <Actions onAsk={setAsk} researchPrice={researchPrice} rec={rec} />
        <ActivityList {...activity} />
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
