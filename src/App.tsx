import { useEffect, useMemo, useRef, useState } from "react";
import { formatUnits, pad, stringToHex, type Hex } from "viem";
import { useAccount } from "wagmi";
import { readContract, waitForTransactionReceipt, writeContract } from "wagmi/actions";
import { ACTIONS, CHAIN_ID, EMPTY_SELECTOR, ERC20_ABI, ETHERSCAN, EXPLORER, IMD, INTAKE, INTAKE_ABI, ZERO_ADDRESS } from "./config";
import { PRESETS, RESEARCH_OBJECTIVE, encodeBody, oracleBody, questionP4, researchBody, validateP4, type Kind } from "./bodies";
import { fetchResearchPage } from "./api";
import { orderAll, parsePage, safeHref, SECTION_TITLES, type Line, type Page } from "./page";
import { ConnectSheet, config } from "./wallet";
import { rememberSent, useActivity, type Activity } from "./useActivity";

const actionId = (a: string) => pad(stringToHex(a), { dir: "right", size: 32 });
const imd = (v: bigint) => `${formatUnits(v, 18)} IMD`;
const shortHex = (h: string) => `${h.slice(0, 6)}…${h.slice(-4)}`;
const jobLink = (jobId: string | null, tx: string) => (jobId ? `${EXPLORER}/jobs/${jobId}` : `${ETHERSCAN}/tx/${tx}`);

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
  body: Record<string, unknown>;
  warning?: string;
}

/* ---------- Record ---------- */

function KindLabel({ line }: { line: Line }) {
  const name = line.kind === "proof" ? "Proof" : line.kind === "statement" ? "Statement" : "Claim";
  return (
    <span className={`label label-${line.kind}`}>
      {name}
      {line.kind === "claim" && line.by ? ` · ${line.by}` : ""}
    </span>
  );
}

function LineRow({ line, page, check, differs }: { line: Line; page: Page; check: { text: string; href: string }; differs?: string }) {
  const num = (id: string) => page.sources.findIndex((s) => s.id === id) + 1;
  return (
    <li className={`line${differs ? " line-differs" : ""}`}>
      {differs && <p className="differs-note">Differs from the line above{differs ? `: ${differs}` : ""}</p>}
      <p className="line-text">{line.text}</p>
      {line.quote && line.kind !== "proof" && <p className="quote">“{line.quote}”</p>}
      {line.rerun && line.kind === "proof" && <p className="quote">Re-run: {line.rerun}</p>}
      <div className="line-meta">
        <KindLabel line={line} />
        {line.sources.map((s) => {
          const n = num(s);
          return n > 0 ? (
            <a key={s} className="chip mono" href={`#source-${n}`} aria-label={`Source ${n}`}>
              {n}
            </a>
          ) : (
            <span key={s} className="chip mono" title="Source not listed">
              ?
            </span>
          );
        })}
        <a className="checked" href={check.href} target="_blank" rel="noopener noreferrer">
          {check.text}
        </a>
      </div>
    </li>
  );
}

function ExtLink({ url, children }: { url: string; children: React.ReactNode }) {
  const href = safeHref(url);
  return href ? (
    <a href={href} target="_blank" rel="noopener noreferrer nofollow">
      {children}
    </a>
  ) : (
    <span>{children}</span>
  );
}

function Record({ items, onAsk, price }: { items: Activity[] | null; onAsk: (a: Ask) => void; price: string }) {
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
  const panel = (items ?? []).filter((a) => a.req.action === ACTIONS.oracle && a.state === "completed");
  const research = () => onAsk({ title: "Research this page", action: ACTIONS.research, body: researchBody() });
  const researchCheck = { text: "research job", href: latest ? jobLink(via?.jobId ?? latest.jobId, latest.req.transactionHash) : EXPLORER };

  return (
    <section id="record" aria-labelledby="record-title">
      <h1 id="record-title">{page?.name || "IMD (imd.fun)"}</h1>
      <p className="lead">{page?.oneLine || "A public record of imd.fun. Every line shows who said it, its source and how it was checked."}</p>

      {!page && (
        <div className="card empty">
          <h2>{items === null ? "Reading the record…" : "No research yet"}</h2>
          <p>
            {latest && !error
              ? "Research finished. Downloading and checking the page…"
              : "The record is written by the IMD swarm. Pay for one research job and its page appears here."}
          </p>
          {error && <p className="error">Unable to read the page: {error}</p>}
          <div className="row-actions">
            <button className="btn btn-primary" onClick={research}>
              Research this page
            </button>
            <span className="price mono">{price}</span>
          </div>
        </div>
      )}

      {page && (
        <>
          {page.channels.length > 0 && (
            <ul className="channels" aria-label="Channels">
              {page.channels.map((c, i) => (
                <li key={i}>
                  <ExtLink url={c.url}>{c.label || c.url}</ExtLink>
                  <span className={`tie tie-${c.tie}`}>tie: {c.tie}</span>
                </li>
              ))}
            </ul>
          )}
          <div className="row-actions">
            <button className="btn btn-primary" onClick={research}>
              Research again
            </button>
            <a className="btn" href="#actions">
              Confirm a fact
            </a>
          </div>
          {orderAll(page).map(({ section, rows }) => (
            <div key={section} className="card">
              <h2>{SECTION_TITLES[section] ?? section}</h2>
              <ul className="lines">
                {rows.map(({ line, differsWith, why }) => (
                  <LineRow key={line.id || line.text} line={line} page={page} check={researchCheck} differs={differsWith ? why || " " : undefined} />
                ))}
              </ul>
            </div>
          ))}
        </>
      )}

      {panel.length > 0 && (
        <div className="card">
          <h2>Checked by a panel</h2>
          <ul className="lines">
            {panel.map((a) => (
              <li key={a.req.requestId} className="line">
                <p className="line-text">{String(a.req.bodyJson?.question ?? "")}</p>
                <div className="line-meta">
                  <span className={`label label-${a.req.kind}`}>{a.req.kind.charAt(0).toUpperCase() + a.req.kind.slice(1)}</span>
                  <span className="answer">Answer: {a.oracle?.answer ?? "none"}</span>
                  <a className="checked" href={jobLink(a.jobId, a.req.transactionHash)} target="_blank" rel="noopener noreferrer">
                    panel, {a.oracle?.agreed ?? "?"} of {a.oracle?.panelSize ?? "?"} agreed
                  </a>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {page && page.openQuestions.length > 0 && (
        <div className="card">
          <h2>Not known yet</h2>
          <ul className="plain">
            {page.openQuestions.map((q, i) => (
              <li key={i}>{q}</li>
            ))}
          </ul>
        </div>
      )}

      {page && page.sources.length > 0 && (
        <div className="card">
          <h2>Sources</h2>
          <ol className="sources">
            {page.sources.map((s, i) => (
              <li key={i} id={`source-${i + 1}`}>
                <span className="chip mono">{i + 1}</span>
                <span className="source-ref">
                  <ExtLink url={s.ref}>{s.ref}</ExtLink>
                </span>
                <span className="small">
                  {s.type || "source"} · read {s.readAt || "at an unknown time"}
                  {s.couldOpen === false ? " · could not open" : ""}
                </span>
              </li>
            ))}
          </ol>
          {via && <p className="small">Read through {via.path === "api" ? "api.imd.fun" : "an IPFS gateway"}; bytes matched the listed SHA-256.</p>}
        </div>
      )}
    </section>
  );
}

/* ---------- Actions ---------- */

function Actions({ onAsk, researchPrice }: { onAsk: (a: Ask) => void; researchPrice: string }) {
  const oraclePrice = usePrice(ACTIONS.oracle);
  const [p4, setP4] = useState({ url: "", handle: "", text: "" });
  const [p4Err, setP4Err] = useState<ReturnType<typeof validateP4>>({});
  const [free, setFree] = useState({ q: "", kind: "claim" as Kind });
  const [freeErr, setFreeErr] = useState("");
  const urlRef = useRef<HTMLInputElement>(null);

  const askP4 = (e: React.FormEvent) => {
    e.preventDefault();
    const errs = validateP4(p4.url, p4.handle, p4.text);
    setP4Err(errs);
    if (Object.keys(errs).length) {
      (document.getElementById(errs.url ? "p4-url" : errs.handle ? "p4-handle" : "p4-text") as HTMLElement | null)?.focus();
      return;
    }
    const q = questionP4(p4.url.trim(), p4.handle.trim().replace(/^@/, ""), p4.text.trim().replace(/[.?]+$/, ""));
    onAsk({ title: "Confirm a post", action: ACTIONS.oracle, body: oracleBody("claim", q, "panel") });
  };
  const askFree = (e: React.FormEvent) => {
    e.preventDefault();
    const q = free.q.trim();
    if (q.length < 10 || q.length > 2000) {
      setFreeErr("Write a yes or no question of 10 to 2,000 characters.");
      document.getElementById("free-q")?.focus();
      return;
    }
    setFreeErr("");
    onAsk({
      title: "Ask your own question",
      action: ACTIONS.oracle,
      body: oracleBody(free.kind, q, free.kind === "proof" ? "chain" : "panel"),
      warning: "Unchecked wording: the panel may refuse it, and the payment is not refunded.",
    });
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
            <button className="btn btn-primary" onClick={() => onAsk({ title: "Research this page", action: ACTIONS.research, body: researchBody() })}>
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
                <button className="btn preset" onClick={() => onAsk({ title: p.title, action: ACTIONS.oracle, body: oracleBody(p.kind, p.question, p.evidence) })}>
                  <span>Check: {p.title}</span>
                  <span className="small">{p.note}</span>
                </button>
              </li>
            ))}
          </ul>

          <form className="form" onSubmit={askP4} noValidate>
            <h4>Check a post on X</h4>
            <label htmlFor="p4-url">Post link</label>
            <input ref={urlRef} id="p4-url" name="url" type="url" inputMode="url" autoComplete="url" placeholder="https://x.com/name/status/123"
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

          <form className="form" onSubmit={askFree} noValidate>
            <h4>Ask your own question</h4>
            <p className="warn">Unchecked wording, may be refused, payment is not refunded.</p>
            <label htmlFor="free-q">Yes or no question</label>
            <textarea id="free-q" name="question" rows={3} value={free.q} onChange={(e) => setFree({ ...free, q: e.target.value })}
              aria-invalid={!!freeErr} aria-describedby={freeErr ? "free-q-err" : undefined} />
            {freeErr && <p id="free-q-err" className="error">{freeErr}</p>}
            <label htmlFor="free-kind">What kind of fact</label>
            <select id="free-kind" name="kind" value={free.kind} onChange={(e) => setFree({ ...free, kind: e.target.value as Kind })}>
              <option value="proof">Proof: from chain data</option>
              <option value="statement">Statement: imd.fun said it</option>
              <option value="claim">Claim: someone else said it</option>
            </select>
            <button className="btn" type="submit">Review your question</button>
          </form>
        </div>
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
      const kind = String((ask.body.tag as { kind?: string }).kind ?? "");
      rememberSent({ hash: h, kind, action: ask.action, at: Date.now() });
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

/* ---------- Activity ---------- */

function ActivityList({ items, error, loading, reload }: ReturnType<typeof useActivity>) {
  return (
    <section id="activity" aria-labelledby="activity-title">
      <div className="section-head">
        <h2 id="activity-title" className="section-title">Activity</h2>
        <button className="btn" onClick={() => void reload()} disabled={loading}>{loading ? "Reading chain…" : "Refresh"}</button>
      </div>
      {error && <p className="error">Unable to read the chain: {error}. Try Refresh.</p>}
      {items && items.length === 0 && !error && <div className="card"><p>No requests yet. Every paid request from this page appears here, newest first.</p></div>}
      {items === null && <div className="card"><p>Reading requests from Ethereum…</p></div>}
      {items && items.length > 0 && (
        <ul className="activity">
          {items.map((a) => (
            <li key={a.req.requestId} className="card act">
              <div className="act-top">
                <span className={`state state-${a.state}`}>{a.state}</span>
                <span className="small">{a.time ? new Date(a.time).toLocaleString() : `block ${a.req.blockNumber}`}</span>
              </div>
              <p className="act-what">
                {a.req.action === ACTIONS.research ? "Research" : "Question"} · {a.req.kind}
                {a.req.action === ACTIONS.oracle && a.state === "completed" && a.oracle ? ` · answer: ${a.oracle.answer ?? "none"} (${a.oracle.agreed ?? "?"} of ${a.oracle.panelSize ?? "?"} agreed)` : ""}
                {a.completion?.reason ? ` · ${a.completion.reason}` : ""}
              </p>
              {a.req.action === ACTIONS.oracle && <p className="small">{String(a.req.bodyJson?.question ?? "")}</p>}
              <p className="small">
                Paid by <span className="mono">{a.ens ?? shortHex(a.req.payer)}</span> ·{" "}
                <a href={jobLink(a.jobId, a.req.transactionHash)} target="_blank" rel="noopener noreferrer">
                  {a.jobId ? "Open on explorer.imd.fun" : "Open the transaction"}
                </a>
              </p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/* ---------- App ---------- */

export default function App() {
  const activity = useActivity();
  const [ask, setAsk] = useState<Ask | null>(null);
  const researchPrice = usePrice(ACTIONS.research);
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
        <Record items={activity.items} onAsk={setAsk} price={researchPrice} />
        <Actions onAsk={setAsk} researchPrice={researchPrice} />
        <ActivityList {...activity} />
        <footer className="about">
          <p>About: this is a test. Payments go to IMD and are not refunded. Nobody can edit this page by hand; every line comes from a paid research job or panel answer read from Ethereum.</p>
        </footer>
      </main>
      {ask && <PayDialog ask={ask} onClose={() => setAsk(null)} onSent={() => void activity.reload()} />}
    </>
  );
}
