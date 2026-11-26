/**
 * The project page's Overview blocks added with the one-column layout (revision 35): the header, the screenshots,
 * How it works, Ask the contract and Go deeper. Each block is left out when the page has no data for it, so a page
 * built before the explained / screenshots / ask instructions still shows cleanly.
 */
import { Fragment, useEffect, useRef, useState, type KeyboardEvent } from "react";
import { fetchShot, type ShotRead } from "./api";
import { askContract, recordedOf, sameValue, type AskAnswer } from "./ask";
import { KindIcon } from "./KindIcon";
import { SubjectLogo } from "./Logo";
import type { RecordModel } from "./model";
import { formatNumbers } from "./numbers";
import type { Ask, Category, ExplainedKind, ExplainedSentence, Line, Screenshot } from "./page";
import { cleanQuestion, questionAnchor } from "./questions";
import { resultNamesOf } from "./requests";
import { lineAnchor } from "./format";
import { to } from "./route";
import { SaveStar } from "./saved";
import { countLines, countsParts } from "./settle";
import type { Activity } from "./useActivity";

/** What a visitor reads for each category. */
export const CATEGORY_WORDS: Record<Category, string> = { protocol: "Protocol", app: "App", network: "Network", token: "Token", ai: "AI", tool: "Tool", other: "Other" };

export function CategoryChip({ category }: { category: Category | undefined | null }) {
  if (!category) return null;
  return <span className="cat-chip">{CATEGORY_WORDS[category]}</span>;
}

/** 1. Logo, name, one_line, category chip and save star; the app button on the right when the page names an app. */
export function ProjectHeader({ m, name, latest }: { m: RecordModel; name: string; latest: Activity | undefined }) {
  const page = m.page;
  return (
    <header className="p-head">
      <SubjectLogo name={name} logo={latest?.logo} size={44} />
      <div className="p-head-text">
        <div className="title-row">
          <h1 id="record-title" tabIndex={-1}>{name}</h1>
          {page && <SaveStar id={m.subject.id} name={name} />}
        </div>
        <p className="lead">{page?.oneLine || `Public sources and checks for ${m.subject.id}.`}</p>
        {page?.category && <CategoryChip category={page.category} />}
      </div>
      {page?.app && (
        <a className="btn btn-primary p-app" href={page.app.url} target="_blank" rel="noopener noreferrer">
          {page.app.label}
          <span className="sr-only"> (opens in a new tab)</span>
        </a>
      )}
    </header>
  );
}

const hostPath = (u: string) => {
  try {
    const x = new URL(u);
    return `${x.host.replace(/^www\./, "")}${x.pathname === "/" ? "" : x.pathname}`;
  } catch {
    return u;
  }
};
const safeUrl = (u: string) => (/^https?:\/\//i.test(u) ? u : "");

/** The screenshots the page lists whose slot the job declared as an output, in the page's order. */
export function listedShots(page: RecordModel["page"], latest: Pick<Activity, "req"> | undefined): Screenshot[] {
  if (!page?.screenshots?.length || !latest) return [];
  const names = resultNamesOf(latest.req.kind);
  return page.screenshots.filter((s) => names.includes(`shot-${s.slot}`));
}

type ShotState = ShotRead | "failed" | undefined;

/**
 * 2. One large image, its caption, "1 of 4" and the address it was captured from, then a row of thumbnails. A thumbnail
 * or the arrow keys change the image. The first file is read at once; the others only once it has arrived. A 1 by 1
 * placeholder or a file that fails a check is left out.
 */
export function Gallery({ m, latest, name }: { m: RecordModel; latest: Activity | undefined; name: string }) {
  const listed = listedShots(m.page, latest);
  const key = latest ? `${latest.req.requestId}:${listed.map((s) => s.slot).join(",")}` : "";
  const [reads, setReads] = useState<{ key: string; by: Map<number, ShotState> }>({ key: "", by: new Map() });
  const [at, setAt] = useState(0);
  const frame = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!key || !latest?.completion) return;
    let live = true;
    const by = new Map<number, ShotState>();
    setReads({ key, by: new Map(by) });
    setAt(0);
    const jobId = latest.via?.jobId ?? latest.jobId ?? null;
    (async () => {
      for (const s of listed) {
        let r: ShotState;
        try {
          r = await fetchShot(latest.req, latest.completion!, jobId, s.slot);
        } catch (e) {
          console.warn(`Screenshot ${s.slot} could not be read:`, e instanceof Error ? e.message : e);
          r = "failed";
        }
        if (!live) return;
        by.set(s.slot, r);
        setReads({ key, by: new Map(by) });
      }
    })();
    return () => {
      live = false;
    };
    // The key names the request and its slots; the objects behind it are replaced on every refresh.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  if (!listed.length) return null;
  const by = reads.key === key ? reads.by : new Map<number, ShotState>();
  // Shown: every slot not yet known to be empty or broken. Read ones carry their image.
  const shown = listed.filter((s) => {
    const r = by.get(s.slot);
    return r === undefined || (r !== "failed" && !!r.url);
  });
  if (!shown.length) return null;
  const i = Math.min(at, shown.length - 1);
  const cur = shown[i]!;
  const read = by.get(cur.slot);
  const img = read && read !== "failed" ? read : null;
  const go = (n: number) => setAt((n + shown.length) % shown.length);
  const onKey = (e: KeyboardEvent) => {
    if (shown.length < 2) return;
    if (e.key === "ArrowRight") {
      e.preventDefault();
      go(i + 1);
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      go(i - 1);
    }
  };
  const href = safeUrl(cur.url);
  return (
    <section className="gallery" aria-label="Screenshots" onKeyDown={onKey}>
      <div className="g-frame" ref={frame} tabIndex={shown.length > 1 ? 0 : -1} aria-roledescription="carousel" aria-label={shown.length > 1 ? "Screenshots: use the left and right arrow keys to change the image" : "Screenshot"} aria-busy={img ? undefined : true}>
        {img?.url && <img src={img.url} alt={cur.caption ? `${name}: ${cur.caption}` : `A screen of ${name}`} width={img.width ?? 1280} height={img.height ?? 960} />}
      </div>
      <p className="g-cap small" aria-live="polite">
        {cur.caption && <span className="g-caption">{cur.caption}</span>}
        <span className="num">{`${i + 1} of ${shown.length}`}</span>
        {href && (
          <a href={href} target="_blank" rel="noopener noreferrer" className="g-src">
            {hostPath(href)}
          </a>
        )}
      </p>
      {shown.length > 1 && (
        <div className="g-thumbs" role="group" aria-label="Choose a screenshot">
          {shown.map((s, j) => {
            const r = by.get(s.slot);
            const u = r && r !== "failed" ? r.url : null;
            return (
              <button key={s.slot} type="button" className="g-thumb" aria-pressed={j === i} aria-label={`Screenshot ${j + 1} of ${shown.length}${s.caption ? `: ${s.caption}` : ""}`} onClick={() => go(j)}>
                {u ? <img src={u} alt="" width={160} height={120} /> : <span className="g-thumb-wait" aria-hidden="true" />}
              </button>
            );
          })}
        </div>
      )}
    </section>
  );
}

const KIND_WORDS: Record<ExplainedKind, string> = { proof: "proven on chain", statement: "the project says", claim: "others say", not_checked: "not checked" };

/** The small quiet mark at the end of an explained sentence; nothing for a sentence with no kind. */
export function ExplainedMark({ kind }: { kind: ExplainedKind | undefined }) {
  if (!kind) return null;
  if (kind === "not_checked")
    return (
      <span className="x-mark x-not-checked" title="Not checked">
        not checked
      </span>
    );
  return (
    <span className={`x-mark kind-${kind}`} title={KIND_WORDS[kind]}>
      <KindIcon kind={kind} size={13} />
      <span className="sr-only"> ({KIND_WORDS[kind]})</span>
    </span>
  );
}

/** Lines an explained sentence names that the record has. */
const linesOf = (m: Pick<RecordModel, "resolve">, s: ExplainedSentence): Line[] => s.lines.map((id) => m.resolve(id)).filter((l): l is Line => !!l);

/** One explained sentence: clicking it (or Enter) opens the lines it rests on in Record, like a summary sentence's marks. */
export function ExplainedText({ s, m, openLines }: { s: ExplainedSentence; m: Pick<RecordModel, "resolve">; openLines: (ids: string[]) => void }) {
  const refs = linesOf(m, s);
  const body = (
    <>
      {formatNumbers(s.text)}
      {"⁠"}
      <ExplainedMark kind={s.kind} />
    </>
  );
  if (!refs.length) return <span className="x-text">{body}</span>;
  return (
    <a
      className="x-text x-open"
      href={to(lineAnchor(refs[0]!.id))}
      onClick={(e) => {
        e.preventDefault();
        openLines(refs.map((l) => l.id));
      }}
      title={`Open the ${refs.length === 1 ? "line" : `${refs.length} lines`} it rests on`}
    >
      {body}
    </a>
  );
}

/** 4. explained.how_it_works as numbered steps. */
export function HowItWorks({ m, openLines }: { m: RecordModel; openLines: (ids: string[]) => void }) {
  const steps = m.page?.explained?.howItWorks ?? [];
  if (!steps.length) return null;
  return (
    <section className="ov-sec how" aria-labelledby="how-title">
      <h2 id="how-title">How it works</h2>
      <ol className="steps">
        {steps.map((s, i) => (
          <li key={i}>
            <ExplainedText s={s} m={m} openLines={openLines} />
          </li>
        ))}
      </ol>
    </section>
  );
}

const CHAIN_NAMES: Record<number, string> = { 1: "Ethereum", 8453: "Base", 10: "OP Mainnet", 42161: "Arbitrum One", 137: "Polygon", 7777777: "Zora", 130: "Unichain", 56: "BNB Chain", 43114: "Avalanche", 100: "Gnosis", 59144: "Linea", 534352: "Scroll", 324: "zkSync Era", 81457: "Blast", 11155111: "Sepolia", 84532: "Base Sepolia" };
export const chainNameOf = (id: number) => CHAIN_NAMES[id] ?? `chain ${id}`;

const timeText = (t: number) => (t ? new Date(t).toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "");

/** One question: "Ask now" makes the call; the answer shows with its unit, block and time, beside the recorded value. */
function AskCard({ a, m, i }: { a: Ask; m: RecordModel; i: number }) {
  const [st, setSt] = useState<{ busy: boolean; answer: AskAnswer | null; error: string }>({ busy: false, answer: null, error: "" });
  const line = m.resolve(a.line);
  const recorded = recordedOf(line?.fact);
  const unit = a.call.unit;
  const run = () => {
    setSt({ busy: true, answer: null, error: "" });
    askContract(a.call).then(
      (answer) => setSt({ busy: false, answer, error: "" }),
      (e: unknown) => setSt({ busy: false, answer: null, error: e instanceof Error ? e.message : "The call failed" }),
    );
  };
  const same = st.answer ? sameValue(st.answer.value, line?.fact?.value) : null;
  const id = `ask-${i}`;
  return (
    <li className="ask-card">
      <p className="ask-q" id={`${id}-q`}>{a.question}</p>
      <div className="ask-row">
        <button type="button" className="btn" onClick={run} disabled={st.busy} aria-describedby={`${id}-q`}>
          {st.busy ? "Asking…" : st.error ? "Try again" : "Ask now"}
        </button>
        <span className="small ask-chain">on {chainNameOf(a.call.chainId)}</span>
      </div>
      <dl className="ask-vals" aria-live="polite">
        {st.answer && (
          <div>
            <dt>Now</dt>
            <dd>
              <strong className="num">{formatNumbers(st.answer.value)}</strong>
              {unit ? ` ${unit}` : ""}
              <span className="small ask-when">
                {" "}
                at block {st.answer.block.toLocaleString("en-US")}
                {st.answer.time ? `, ${timeText(st.answer.time)}` : ""}
              </span>
            </dd>
          </div>
        )}
        {recorded && (
          <div>
            <dt>On this page</dt>
            <dd>
              <span className="num">{formatNumbers(recorded)}</span>
              {line?.fact?.block ? <span className="small ask-when"> at block {formatNumbers(line.fact.block)}</span> : null}
            </dd>
          </div>
        )}
      </dl>
      {same === false && <p className="ask-changed">Changed since this page was built.</p>}
      {st.error && (
        <p className="error small" role="alert">
          The RPC did not answer: {st.error}. Try again.
        </p>
      )}
    </li>
  );
}

/** 6. One card per entry in ask. */
export function AskTheContract({ m }: { m: RecordModel }) {
  const asks = m.page?.ask ?? [];
  if (!asks.length) return null;
  return (
    <section className="ov-sec ask" aria-labelledby="ask-title">
      <h2 id="ask-title">Ask the contract</h2>
      <p className="small">Your browser asks a public node directly. No wallet needed.</p>
      <ul className="ask-list">
        {asks.map((a, i) => (
          <AskCard key={`${a.line}-${i}`} a={a} m={m} i={i} />
        ))}
      </ul>
    </section>
  );
}

function Deeper({ title, count, children }: { title: string; count?: number; children: React.ReactNode }) {
  return (
    <details className="deeper-row">
      <summary>
        <span className="chev" aria-hidden="true" />
        <span>{title}</span>
        {count !== undefined && <span className="num deeper-count">{count.toLocaleString("en-US")}</span>}
      </summary>
      <div className="deeper-body">{children}</div>
    </details>
  );
}

const shortAddr = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

/** 7. The token, The contracts, Not known yet and Full record: rows that open in place. */
export function GoDeeper({ m, openLines }: { m: RecordModel; openLines: (ids: string[]) => void }) {
  const x = m.page?.explained;
  const tokens = x?.tokens ?? [];
  const contracts = x?.contracts ?? [];
  const open = m.questions.open;
  const all = m.sections.flatMap((s) => s.rows.map((r) => r.line));
  const parts = countsParts(countLines(all));
  if (!m.page) return null;
  const list = (ss: ExplainedSentence[]) => (
    <ul className="x-list">
      {ss.map((s, i) => (
        <li key={i}>
          <ExplainedText s={s} m={m} openLines={openLines} />
        </li>
      ))}
    </ul>
  );
  return (
    <section className="ov-sec deeper" aria-labelledby="deeper-title">
      <h2 id="deeper-title">Go deeper</h2>
      {tokens.length > 0 && (
        <Deeper title={tokens.length === 1 ? "The token" : "The tokens"}>
          {tokens.map((t) => (
            <div className="x-block" key={t.token}>
              <h3>{t.token}</h3>
              {list(t.sentences)}
            </div>
          ))}
        </Deeper>
      )}
      {contracts.length > 0 && (
        <Deeper title="The contracts">
          {contracts.map((c) => {
            const what = c.sentences.filter((s) => !s.part);
            const who = c.sentences.filter((s) => s.part === "who_can_change");
            const means = c.sentences.filter((s) => s.part === "what_it_means");
            return (
              <div className="x-block" key={`${c.chain}:${c.address}`}>
                <h3>
                  <span className="mono">{shortAddr(c.address)}</span>
                  {c.chain ? <span className="small"> on {c.chain}</span> : null}
                </h3>
                {what.length > 0 && list(what)}
                {who.length > 0 && (
                  <>
                    <h4>Who can change it</h4>
                    {list(who)}
                  </>
                )}
                {means.length > 0 && (
                  <>
                    <h4>What that means for you</h4>
                    {list(means)}
                  </>
                )}
              </div>
            );
          })}
        </Deeper>
      )}
      {open.length > 0 && (
        <Deeper title="Not known yet" count={open.length}>
          <ul className="x-list">
            {open.map((q) => (
              <li key={q.id} id={questionAnchor(q.id)}>
                {cleanQuestion(q.text)}
              </li>
            ))}
          </ul>
        </Deeper>
      )}
      <Deeper title="Full record">
        <p>
          {parts.length ? (
            <>
              {all.length.toLocaleString("en-US")} lines:{" "}
              {parts.map((p, i) => (
                <Fragment key={p.group}>
                  {i ? ", " : ""}
                  {p.text}
                </Fragment>
              ))}
              .{" "}
            </>
          ) : null}
          {m.sourceList.length > 0 && `${m.sourceList.length.toLocaleString("en-US")} sources. `}
          <a href={to("record")}>Open the Record tab</a>
        </p>
      </Deeper>
    </section>
  );
}
