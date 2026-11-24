/** The record's tabs: Overview (key facts, summary), Record (filter, sections, one facts table) and Sources. */
import { disputedCount, rowPatchListsOf, sentenceDispute, type Dispute, type Disputes, type SentenceChange } from "./changeResult";
import { Fragment, useEffect, useState } from "react";
import { EXPLORER } from "./config";
import { jobLink, kindName, lineAnchor, payerName, shortHex } from "./format";
import { addressText, historicFor, shortJobId } from "./addresses";
import { explorerAddressUrl } from "./subject";
import { addressRuns, chainEntries, chainTag, chainText, isChainName } from "./addrDisplay";
import { keyFacts, splitAddresses, withPatches, type Badge, type KeyRow, type RowChange, type ShownItem } from "./keyfacts";
import { addHref, lineAddressHref, subjectHref, to, walletHref } from "./route";
import { SubjectLogo } from "./Logo";
import { findSubject, parseLookup, relatedSubject, rowMatches, type Findable, type Lookup } from "./lookup";
import { countLines, countsWords, FILTER_WORDS, filtersFor, GROUP_TONE, passes, rowClass, settleAll, speakerText, type Filter, type Settle } from "./settle";
import {
  blockNumber,
  channelStatus,
  hostOf,
  paragraphsOf,
  safeHref,
  SECTION_TITLES,
  SECTIONS,
  STATUS_HELP,
  STATUS_LEGEND,
  STATUS_WORDS,
  statusWord,
  type Channel,
  type ChannelStatus,
  isFactRow, type Kind, type Line, type ListedSource, type RecordRow, type SourceLine } from "./page";
import { readDate } from "./dates";
import { firstPageStatus, INSTRUCTIONS_UNAVAILABLE, type PageJobs, isInstructionsUnavailable, statusText, unreadableText, type FirstPageStatus, type RecordModel } from "./model";
import type { Activity } from "./useActivity";
import { OutdatedNote, ReaderNote, StillReading } from "./Home";
import { ChangePanel, evidenceOf, Pencil, PendingTag, useSuggest } from "./Suggest";
import { formatNumbers } from "./numbers";
import { keyFactTarget, lineTarget, sentenceTarget } from "./changes";
import { originOfLine } from "./changeResult";

export type { Filter };
const KINDS: Kind[] = ["proof", "statement", "claim"];

/** Shared view state: the filter and which rows are open live in App, so they survive tab changes. */
export interface Ui {
  filter: Filter;
  setFilter: (f: Filter) => void;
  openSet: Set<string>;
  toggle: (id: string) => void;
  /** Opens these lines in the Record tab and moves to the first. */
  openLines: (ids: string[]) => void;
  /** The element the current link points at, inside the current tab. */
  target: string | null;
  /** Counts link changes, so following the same link again acts again. */
  routeN?: number;
  /** The record line a permanent address (#/s/<subject>/l/<job id>:<line id>) opened: shown highlighted. */
  highlight?: string;
  /** The permanent address the route names, when the Record was opened by one. */
  address?: string;
}

export function KindMark({ kind }: { kind: string }) {
  return (
    <span className={`kind kind-${kind}`}>
      <span className="dot" aria-hidden="true" />
      {kindName(kind)}
    </span>
  );
}

export function ExtLink({ url, children, className }: { url: string; children: React.ReactNode; className?: string }) {
  const href = safeHref(url);
  return href ? (
    <a className={className} href={href} target="_blank" rel="noopener noreferrer nofollow">
      {children}
    </a>
  ) : (
    <span className={className}>{children}</span>
  );
}

const panelAnchor = (a: Activity) => `panel-${a.req.requestId.slice(2, 14)}`;

/* ---------- Overview ---------- */

/** The small copy icon beside an address: its accessible name says what it copies. */
/** A requesting wallet, linked to its profile (#/w/<address>) as Activity links it. Plain text without an address. */
export function PayerLink({ name, address }: { name: string; address?: string | null }) {
  return address ? <a className="mono" href={walletHref(address)}>{name}</a> : <span className="mono">{name}</span>;
}

export function CopyIcon({ value, label = "Copy address" }: { value: string; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      className="copy-icon"
      aria-label={done ? "Copied" : `${label} ${value}`}
      title={done ? "Copied" : label}
      onClick={() => {
        void navigator.clipboard?.writeText(value).then(() => {
          setDone(true);
          window.setTimeout(() => setDone(false), 1500);
        });
      }}
    >
      <svg viewBox="0 0 20 20" width="14" height="14" aria-hidden="true" focusable="false">
        {done ? <path d="M4 10.5l4 4 8-9" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /> : (
          <>
            <rect x="7" y="7" width="9" height="10" rx="1.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
            <path d="M4 13V4.5A1.5 1.5 0 0 1 5.5 3H12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </>
        )}
      </svg>
    </button>
  );
}

export function Copy({ value, label }: { value: string; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      className="copy"
      aria-label={done ? "Copied" : `${label ?? "Copy address"} ${value}`}
      onClick={() => {
        void navigator.clipboard?.writeText(value).then(() => {
          setDone(true);
          window.setTimeout(() => setDone(false), 1500);
        });
      }}
    >
      {done ? "Copied" : label ?? "Copy"}
    </button>
  );
}

/** One address as Key facts shows every address: shortened and linked to its explorer, a copy icon, a chain tag. */
export function Addr({ address, chain, url = "" }: { address: string; chain: string; url?: string }) {
  const href = safeHref(url) && url.toLowerCase().includes(address.toLowerCase()) ? url : explorerAddressUrl(address, chain);
  return (
    <span className="addr">
      <a className="addr-link" href={href} target="_blank" rel="noopener noreferrer" aria-label={`${shortHex(address)}${chain ? ` on ${chain}` : ""}, open in the block explorer`}>
        <span className="mono">{shortHex(address)}</span>
      </a>
      <CopyIcon value={address} />
      {chain && <span className="tok-chain">{chain}</span>}
    </span>
  );
}

/** Text with each address shown as Addr, the chain written after it moved into its tag. */
function Runs({ text, chain = "" }: { text: string; chain?: string }) {
  return (
    <>
      {addressRuns(text, chain).map((r, i) => (r.kind === "address" ? <Addr key={i} address={r.address} chain={r.chain} /> : <Fragment key={i}>{formatNumbers(r.text)}</Fragment>))}
    </>
  );
}


/** A link shown after a value, its label with any long hex shortened ("etherscan.io/tx/0x0d45…d5d"). */
const shortLink = (url: string) => linkText(url).replace(/0x[0-9a-fA-F]{12,}/g, (h) => shortHex(h));

/** A value: its text with every address as Addr (or an Account list, tokens, entries, chains). */
export function KeyValue({ row, chain }: { row: KeyRow; chain: string }) {
  if (/^chains?$/i.test(row.label.trim())) {
    const entries = row.items?.length
      ? row.items.map((v) => ({ text: [v.name, v.text].filter(Boolean).join(" "), chain: v.chain || null }))
      : (row.values.length ? row.values : row.value.split(/;|\n/)).map((t) => ({ text: t }));
    const list = chainEntries(entries);
    if (list.length)
      return (
        <ul className="kf-values">
          {list.map((c, i) => (
            <li key={i}>{chainText(c)}</li>
          ))}
        </ul>
      );
  }
  if (row.items?.length)
    return (
      <ul className="kf-values kf-items">
        {row.items.map((v, i) => (
          <li key={i}>
            <ItemValue v={v} chain={chain} />
          </li>
        ))}
      </ul>
    );
  if (row.values.length)
    return (
      <ul className="kf-values">
        {row.values.map((v, i) => (
          <li key={i}>
            <Runs text={v} chain={chain} />
          </li>
        ))}
      </ul>
    );
  if (row.accounts.length)
    return (
      <ul className="kf-accounts">
        {row.accounts.map((a, i) => (
          <li key={i}>
            {/* The shared values layout (name in bold, text, link), with the account's own badge on the same item. */}
            <ItemValue v={{ name: a.name, text: a.text, url: safeHref(a.url) ? a.url : "", address: "", chain: "", explorer: "" }} chain="" />
            {row.perAccount && a.status && <AccountBadge b={a.status} />}
          </li>
        ))}
      </ul>
    );
  if (row.tokens.length) {
    // One entry per token: symbol, purpose, then each address it names as Addr with its chain tag.
    return (
      <ul className="kf-tokens">
        {row.tokens.map((t, i) => (
          <li key={i} className="tok-line">
            {t.symbol && <strong className="tok-symbol">{t.symbol}</strong>}
            {/* Its own words, then the home chain's address, then "also on" with each other chain's own address and tag. */}
            {t.purpose && <span className="tok-purpose"><Runs text={t.purpose} /></span>}
            {/* Only the first token may take the subject's home chain; another without a chain of its own gets no tag. */}
            {t.address && <Addr address={t.address} chain={chainTag(i === 0 ? t.chain || chain : t.chain)} url={t.url} />}
            {(t.also?.length ?? 0) > 0 && (
              <span className="tok-also">
                <span className="tok-also-k">also on</span>
                {t.also!.map((o) => (
                  <span key={`${o.address}@${o.chain}`} className="tok-also-one">
                    <Addr address={o.address} chain={o.chain} />
                    {o.note && <span className="small"> {o.note}</span>}
                  </span>
                ))}
              </span>
            )}
            {!t.address && t.url && <span className="tok-addr"><ExtLink url={t.url} className="break item-link">{shortLink(t.url)}</ExtLink></span>}
          </li>
        ))}
      </ul>
    );
  }
  return (
    <>
      <ValueText text={row.value} url={row.url} chain={chain} />
      {row.note && <span className="small"> {row.note}</span>}
    </>
  );
}

/** "example.com/docs" for a link shown after an entry's text. */
const linkText = (url: string) => url.replace(/^https?:\/\//i, "").replace(/^www\./i, "").replace(/\/+$/, "");

/** One values entry: its name in bold, then its text, then its link or its address as Addr. */
function ItemValue({ v, chain }: { v: ShownItem; chain: string }) {
  return (
    <>
      <span className="tok-name">
        {v.name && <strong>{v.name}</strong>}
        {v.name && v.text ? ": " : ""}
        {v.text && <Runs text={v.text} chain={v.chain || chain} />}
      </span>
      {v.address ? (
        <>
          {" "}
          <Addr address={v.address} chain={chainTag(v.chain || chain)} url={v.explorer} />
        </>
      ) : (
        v.url && (
          <>
            {" "}
            <ExtLink url={v.url} className="break item-link">{shortLink(v.url)}</ExtLink>
          </>
        )
      )}
    </>
  );
}

/** A text value: every address as Addr; linked when it has a url and names no address, else the url follows. */
function ValueText({ text, url = "", chain = "" }: { text: string; url?: string; chain?: string }) {
  const runs = addressRuns(text, chain);
  const hasAddr = runs.some((r) => r.kind === "address");
  if (safeHref(url) && !hasAddr) return <ExtLink url={url} className="break">{formatNumbers(text)}</ExtLink>;
  // A url that only opens an address the text names adds nothing; another (a deploy transaction) follows the text.
  const extra = safeHref(url) && !runs.some((r) => r.kind === "address" && url.toLowerCase().includes(r.address.toLowerCase())) ? url : "";
  return (
    <span className="break">
      <Runs text={text} chain={chain} />
      {extra && (
        <>
          {" "}
          <ExtLink url={extra} className="item-link small">{shortLink(extra)}</ExtLink>
        </>
      )}
    </span>
  );
}

/** An account's own label, shown beside it when an Official accounts row's accounts differ. */
function AccountBadge({ b }: { b: Badge }) {
  return (
    <span className={`badge badge-${b.tone}`} title={STATUS_HELP[b.tone as ChannelStatus]}>
      {b.text}
    </span>
  );
}

/** "19 Nov 2026" from unix seconds, or "" when unknown. */
const whenOf = (at: number | null | undefined) => (at ? readDate(String(at)) : "");

/** Every earlier value of a patched row or sentence, newest first, each with who changed it and when. */
function ChangeHistory({ items }: { items: Array<RowChange | (SentenceChange & { value?: string })> }) {
  return (
    <ol className="plain change-history">
      {items.map((h, i) => {
        const v = "value" in h && h.value !== undefined ? h.value : (h as SentenceChange).text;
        const when = whenOf(h.at);
        return (
          <li key={i}>
            {"values" in h && h.values && h.values.length > 1 ? (
              <ul className="plain block">
                {h.values.map((x, j) => (
                  <li key={j}>{x}</li>
                ))}
              </ul>
            ) : (
              <span className="block">“{v || "none"}”</span>
            )}
            <span className="small">
              Changed by <span className="mono">{h.by}</span>
              {when ? `, ${when}` : ""}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

/** Every full address a key facts row names, for its details: the table itself shows them shortened. */
const rowAddresses = (r: KeyRow, chain = ""): { address: string; chain: string }[] => {
  const seen = new Set<string>();
  const out: { address: string; chain: string }[] = [];
  const add = (address: string, c: string) => { const k = address.toLowerCase(); if (!seen.has(k)) { seen.add(k); out.push({ address, chain: chainTag(c) }); } };
  for (const t of r.tokens) { if (t.address) add(t.address, t.chain || chain); for (const x of addressRuns(t.purpose, t.chain || chain)) if (x.kind === "address") add(x.address, x.chain); }
  for (const t of r.items ?? []) { if (t.address) add(t.address, t.chain || chain); for (const x of addressRuns(t.text, t.chain || chain)) if (x.kind === "address") add(x.address, x.chain); }
  for (const v of [r.value, ...r.values]) for (const x of addressRuns(v, chain)) if (x.kind === "address") add(x.address, x.chain);
  return out;
};
/** Every name, in full: "A", "A and B", "A, B and C". */
const allNames = (n: string[]) => (n.length < 2 ? n[0] ?? "" : `${n.slice(0, -1).join(", ")} and ${n[n.length - 1]}`);
/** A row opens details when it has full addresses, more speakers than its badge names, or a patch from a change. */
const hasRowDetails = (r: KeyRow) => rowAddresses(r).length > 0 || (r.speakers?.length ?? 0) > 0 || !!r.updatedBy;
/** Rows shown before "Show all N". */
export const KEY_FACTS_SHOWN = 8;

function KeyFacts({ m, ui }: { m: RecordModel; ui: Ui }) {
  const { rows } = useKeyFacts(m);
  const s = useSuggest();
  const [openRow, setOpenRow] = useState<string | null>(null);
  const [all, setAll] = useState(false);
  if (!rows.length) return null;
  // An address with no chain written beside it is on the main contract's chain.
  const mainC = m.page?.contracts.find((c) => c.main) ?? m.page?.contracts[0];
  const mainChain = mainC?.chain ? chainTag(String(mainC.chain)) : "";
  // A row opened by a link or a suggestion stays visible even while the list is folded.
  const shown = all || rows.length <= KEY_FACTS_SHOWN ? rows : rows.filter((r, i) => i < KEY_FACTS_SHOWN || r.label === openRow);
  return (
    <section className="keyfacts" aria-labelledby="keyfacts-title">
      <h2 id="keyfacts-title">Key facts</h2>
      <table>
        <tbody>
          {shown.map((r, i) => {
            const target = keyFactTarget(r.label, r.value || r.accounts.map((a) => a.name).join(", "), r.lines.map((l) => l.id), r.lines[0]?.id ? originOfLine(r.lines[0].id, m.scope) : null);
            const src = r.lines[0]?.srcKeys[0];
            const url = src ? m.sourceList.find((x) => x.key === src)?.url ?? "" : r.url;
            return (
              <Fragment key={i}>
                <tr className="has-pencil">
                  <th scope="row">
                    {hasRowDetails(r) ? (
                      <button type="button" className="kf-toggle" aria-expanded={openRow === r.label} aria-controls={`kf-d-${i}`} onClick={() => setOpenRow(openRow === r.label ? null : r.label)}>
                        <span className="chev" aria-hidden="true" />
                        {r.label}
                      </button>
                    ) : (
                      r.label
                    )}
                  </th>
                  <td className="kf-value">
                    <KeyValue row={r} chain={mainChain} />
                    <PendingTag targetKey={target.key} />
                  </td>
                  <td className="kf-badge">
                    {!r.perAccount && <RowBadge r={r} ui={ui} />}
                  </td>
                  <td className="kf-edit">
                    <Pencil target={target} label={`Suggest a change`} />
                  </td>
                </tr>
                {openRow === r.label && hasRowDetails(r) && (
                  <tr className="kf-details" id={`kf-d-${i}`}>
                    <td colSpan={4}>
                      <dl className="facts">
                        {r.updatedBy && (
                          <>
                            <dt>
                              Updated by a change from <span className="mono">{r.updatedBy}</span>
                              {whenOf(r.history?.[0]?.at) ? `, ${whenOf(r.history?.[0]?.at)}` : ""}
                            </dt>
                            <dd className="break">
                              {(r.history?.length ?? 0) > 1 ? "Earlier values, newest first:" : "Earlier value:"}
                              <ChangeHistory items={r.history?.length ? r.history : [{ value: r.earlier ?? "", by: r.updatedBy, at: null }]} />
                            </dd>
                          </>
                        )}
                        {r.speakers && r.speakers.length > 0 && (
                          <>
                            <dt>
                              {r.badge?.tone === "statement" ? "Stated by" : r.badge?.tone === "claim" ? "Reported by" : "Said by"} ({r.speakers.length})
                            </dt>
                            <dd className="break">{allNames(r.speakers)}</dd>
                          </>
                        )}
                        {rowAddresses(r, mainChain).length > 0 && (
                          <>
                            <dt>{rowAddresses(r, mainChain).length > 1 ? "Addresses" : "Address"}</dt>
                            <dd>
                              <ul className="plain">
                                {rowAddresses(r, mainChain).map((a) => (
                                  <li key={a.address}>
                                    <Addr address={a.address} chain={a.chain} />
                                  </li>
                                ))}
                              </ul>
                            </dd>
                          </>
                        )}
                      </dl>
                    </td>
                  </tr>
                )}
                {s.open === target.key && (
                  <tr className="kf-panel">
                    <td colSpan={4}>
                      <ChangePanel target={target} mode="line" sourceUrl={url} line={r.lines[0] ?? { text: r.value }} evidence={evidenceOf(r.lines, allLines(m))} onOpenLines={ui.openLines} />
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
      {rows.length > KEY_FACTS_SHOWN && (
        <button type="button" className="linklike kf-more" aria-expanded={all} onClick={() => setAll(!all)}>
          {all ? "Show fewer" : `Show all ${rows.length}`}
        </button>
      )}
    </section>
  );
}

/** The row's one badge: its channel's label on Website and Official accounts, else the kind of its lines. Opens them. */
function RowBadge({ r, ui }: { r: KeyRow; ui: Ui }) {
  const b = r.status ?? r.badge;
  if (!b) return null;
  if (r.disputedBy)
    return (
      <a
        className={`badge badge-${b.tone}`}
        href={to(lineAnchor(r.disputedBy))}
        onClick={(e) => {
          e.preventDefault();
          ui.openLines([r.disputedBy!]);
        }}
        aria-label={`${r.label}: ${b.text}. Open the newer line that ${b.tone === "contradicted" ? "contradicts" : "outdates"} it`}
      >
        {b.text}
      </a>
    );
  const title = r.status ? STATUS_HELP[r.status.tone as ChannelStatus] : undefined;
  if (!r.lines.length)
    return (
      <span className={`badge badge-${b.tone}`} title={title}>
        {b.text}
      </span>
    );
  return (
    <a
      className={`badge badge-${b.tone}`}
      title={title}
      href={to(lineAnchor(r.lines[0]!.id))}
      onClick={(e) => {
        e.preventDefault();
        ui.openLines(r.lines.map((l) => l.id));
      }}
      aria-label={`${r.label}: ${b.text}. Open the ${r.lines.length === 1 ? "line" : `${r.lines.length} lines`} it rests on`}
    >
      {b.text}
    </a>
  );
}

/** Every line the record shows, for the settle rule (a proof elsewhere can settle a line). */
const allLines = (m: Pick<RecordModel, "sections">) => m.sections.flatMap((s) => s.rows.map((r) => r.line));

export function useKeyFacts(m: RecordModel) {
  const all = m.sections.flatMap((s) => s.rows.map((r) => r.line));
  const sourceUrl = (l: Line) => (l.srcKeys[0] ? m.sourceList.find((s) => s.key === l.srcKeys[0])?.url ?? "" : "");
  const kf = keyFacts(m.page, m.resolve, all, sourceUrl);
  // Patches from changes jobs not yet folded in: the row's new value rests on the patch's lines, in that job's scope.
  const patches = new Map([...rowPatchListsOf(m.after)].map(([k, ps]) => [k, ps.map((p) => ({ value: p.patch.value, lines: m.editRefs(p.job, p.patch.lines, null), payer: p.payer, at: p.job.doneTime ?? null }))] as const));
  return { ...kf, rows: withDisputes(withPatches(kf.rows, patches, all, sourceUrl, { channels: m.page?.channels ?? [], domain: m.page?.domain ?? "" }), m.disputes) };
}

/** A Key facts row a newer source contradicts or outdates reads "Contradicted" or "Superseded" in place of its badge. */
export function withDisputes(rows: KeyRow[], d: Pick<Disputes, "infobox">): KeyRow[] {
  return rows.map((r) => {
    const hit = d.infobox.get(r.label.trim().toLowerCase());
    if (!hit) return r;
    const badge: KeyRow["badge"] = hit.type === "contradicts" ? { text: "Contradicted", tone: "contradicted" } : { text: "Superseded", tone: "outdated" };
    return { ...r, status: null, badge, disputedBy: hit.by };
  });
}

/** After each sentence, one small coloured dot per kind among its lines; a dot opens those lines in Record. */
export function SentenceDots({ lines, ui }: { lines: Line[]; ui: Ui }) {
  const kinds = KINDS.filter((k) => lines.some((l) => l.kind === k));
  if (!kinds.length) return null;
  return (
    <span className="sdots">
      {kinds.map((k) => {
        const of = lines.filter((l) => l.kind === k);
        const label = `${of.length} ${kindName(k).toLowerCase()} line${of.length === 1 ? "" : "s"}`;
        return (
          <a
            key={k}
            className={`sdot kind-${k}`}
            href={to(lineAnchor(of[0]!.id))}
            title={label}
            aria-label={`Open ${label} in Record`}
            onClick={(e) => {
              e.preventDefault();
              ui.openLines(of.map((l) => l.id));
            }}
          >
            <span className="dot" aria-hidden="true" />
          </a>
        );
      })}
    </span>
  );
}

/** One summary sentence: hover highlights it; a click or Enter opens the change panel under its paragraph. */
function Sentence({ text, active, onOpen }: { text: string; active: boolean; onOpen: () => void }) {
  return (
    <span
      className={`sent${active ? " is-on" : ""}`}
      role="button"
      tabIndex={0}
      aria-expanded={active}
      aria-description="Suggest a change"
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen();
        }
      }}
    >
      {formatNumbers(text)}
    </span>
  );
}

/** A small amber (out of date) or red (contradicted) dot after a summary sentence a newer line disputes; it opens that line. */
function DisputeDot({ d, ui }: { d: Dispute | null; ui: Ui }) {
  if (!d) return null;
  const word = d.type === "contradicts" ? "Contradicted" : "Superseded";
  return (
    <a
      className={`dispute-dot dispute-${d.type}`}
      href={to(lineAnchor(d.by))}
      title={`${word}: a newer source disputes this sentence`}
      aria-label={`${word}: open the newer line that disputes this sentence`}
      onClick={(e) => {
        e.preventDefault();
        ui.openLines([d.by]);
      }}
    >
      <span className="dot" aria-hidden="true" />
    </a>
  );
}

/** A changed sentence's one small pencil after its dots: it shows who changed it, when, the earlier wording and its lines. */
function ChangedMark({ open, onToggle, id }: { open: boolean; onToggle: () => void; id: string }) {
  return (
    <button type="button" className={`changed-mark${open ? " is-on" : ""}`} aria-expanded={open} aria-controls={id} aria-label="Corrected by a visitor: show the change" title="Corrected by a visitor" onClick={onToggle}>
      <svg viewBox="0 0 20 20" width="14" height="14" aria-hidden="true" focusable="false">
        <path d="M13.6 3.2a1.9 1.9 0 0 1 2.7 0l.5.5a1.9 1.9 0 0 1 0 2.7l-8.9 8.9-3.6.9.9-3.6 8.4-8.4Z" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
        <path d="M12.2 4.6l3.2 3.2" stroke="currentColor" strokeWidth="1.6" />
      </svg>
    </button>
  );
}

/** A summary sentence's changes since the last rebuild, newest first; the fallback reads the older single fields. */
export function sentenceChanges(s: { history?: SentenceChange[]; correctedBy?: string; rewordedBy?: string; updatedBy?: string; earlier?: string; original?: string }): SentenceChange[] {
  if (s.history?.length) return s.history;
  const by = s.correctedBy ?? s.rewordedBy ?? s.updatedBy;
  if (!by) return [];
  return [{ text: s.earlier ?? s.original ?? "", by, at: null, how: s.correctedBy ? "corrected" : s.rewordedBy ? "reworded" : "updated", lines: [] }];
}
const HOW: Record<SentenceChange["how"], string> = { corrected: "Corrected", reworded: "Reworded", updated: "Updated" };

/** What the pencil opens: who changed the sentence, when, every earlier wording and the lines the new one rests on. */
function ChangeNote({ id, changes, refs, ui }: { id: string; changes: SentenceChange[]; refs: Line[]; ui: Ui }) {
  const last = changes[0]!;
  const when = whenOf(last.at);
  return (
    <div className="change-note" id={id} role="region" aria-label="How this sentence changed">
      <p>
        {HOW[last.how]} by <span className="mono">{last.by}</span>
        {when ? `, ${when}` : ""}. {changes.length > 1 ? "Earlier wordings, newest first:" : "Earlier wording:"}
      </p>
      <ChangeHistory items={changes} />
      {refs.length > 0 && (
        <p className="small">
          Supported by{" "}
          {refs.map((l, i) => (
            <Fragment key={l.id}>
              {i > 0 ? ", " : ""}
              <a
                href={to(lineAnchor(l.id))}
                onClick={(e) => {
                  e.preventDefault();
                  ui.openLines([l.id]);
                }}
              >
                {l.text.length > 70 ? `${l.text.slice(0, 68)}…` : l.text}
              </a>
            </Fragment>
          ))}
        </p>
      )}
    </div>
  );
}

function Summary({ m, ui }: { m: RecordModel; ui: Ui }) {
  const sg = useSuggest();
  const [note, setNote] = useState<string | null>(null);
  if (!m.summary.length) return null;
  const changed = m.summary.filter((s) => sentenceChanges(s).length > 0).length;
  return (
    <div className="summary">
      <h2>Summary</h2>
      {paragraphsOf(m.summary).map((p, i) => {
        const openHere = p.find((s) => sg.open === sentenceTarget(s.text).key);
        const noteHere = p.find((s) => note === sentenceTarget(s.text).key && sentenceChanges(s).length);
        return (
          <Fragment key={i}>
            <p className="prose">
              {p.map((s, j) => {
                const target = sentenceTarget(s.text);
                const ch = sentenceChanges(s);
                return (
                  <Fragment key={j}>
                    <span className="sent-group">
                      <Sentence text={s.text} active={sg.open === target.key} onOpen={() => sg.setOpen(sg.open === target.key ? null : target.key)} />
                      {/* A word joiner in the nowrap group: Chrome then never breaks between the sentence and its dots. */}
                      {"\u2060"}
                      <SentenceDots lines={s.refs} ui={ui} />
                      <DisputeDot d={sentenceDispute(s, m.disputes)} ui={ui} />
                      {ch.length > 0 && <ChangedMark id={`chg-${i}`} open={note === target.key} onToggle={() => setNote(note === target.key ? null : target.key)} />}
                    </span>
                    <PendingTag targetKey={target.key} />{" "}
                  </Fragment>
                );
              })}
            </p>
            {noteHere && <ChangeNote id={`chg-${i}`} changes={sentenceChanges(noteHere)} refs={noteHere.refs} ui={ui} />}
            {openHere && <ChangePanel key={openHere.text} target={sentenceTarget(openHere.text)} mode="sentence" evidence={evidenceOf(openHere.refs, allLines(m))} onOpenLines={ui.openLines} />}
          </Fragment>
        );
      })}
      {changed > 0 && (
        <p className="small changed-count">
          {changed === 1 ? "1 sentence" : `${changed} sentences`} corrected by visitors since the last rebuild.
        </p>
      )}
      <p className="small dot-key">
        <span className="dk">
          <span className="dot kind-proof" aria-hidden="true" /> proven on chain
        </span>
        <span className="dk">
          <span className="dot kind-statement" aria-hidden="true" /> the project says
        </span>
        <span className="dk">
          <span className="dot kind-claim" aria-hidden="true" /> others say
        </span>
        <span className="dk-by">Summary written from the record by a research job.</span>
      </p>
      {/* An accepted edit keeps its credit, as its own sentence under the key. */}
      {m.edit && (
        <p className="small edit-credit">
          Edited by <PayerLink name={payerName(m.edit.activity)} address={m.edit.activity.req.payer} /> and checked by a research job.
        </p>
      )}
    </div>
  );
}

/** The panel answers some record line links to; the others are listed only under Page upkeep and Activity. */
export function linkedAnswers(m: Pick<RecordModel, "panel" | "sections" | "answerRef">): { linked: Activity[]; unlinked: Activity[] } {
  const ids = new Set<string>();
  for (const l of allLines(m)) for (const k of l.links) {
    const a = m.answerRef(k.target)?.activity;
    if (a) ids.add(a.req.requestId);
  }
  return { linked: m.panel.filter((a) => ids.has(a.req.requestId)), unlinked: m.panel.filter((a) => !ids.has(a.req.requestId)) };
}

function PanelAnswers({ m }: { m: RecordModel }) {
  const { linked } = linkedAnswers(m);
  if (!linked.length) return null;
  return (
    <div className="card" id="panel-answers">
      <h2>Panel answers</h2>
      <ul className="lines">
        {[...linked].reverse().map((a) => (
          <li key={a.req.requestId} className="panel-row" id={panelAnchor(a)} tabIndex={-1}>
            <p className="row-text">{a.req.title || String(a.req.bodyJson?.question ?? "").slice(0, 120)}</p>
            <div className="row-meta">
              <span className={`answer answer-${a.oracle?.answer ?? "none"}`}>{a.oracle?.answer ?? "no answer"}</span>
              <span className="small">
                panel, {a.oracle?.agreed ?? "?"} of {a.oracle?.panelSize ?? "?"} agreed
              </span>
              <KindMark kind={a.req.kind} />
              <a className="small" href={jobLink(a.jobId, a.req.transactionHash)} target="_blank" rel="noopener noreferrer">
                {a.jobId ? "Open the request" : "Open the transaction"}
              </a>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** One Related card: a subject on the site (or one entry not on it) with every relation the page gives it. */
export interface RelatedCard {
  key: string;
  name: string;
  /** The subject id on this site, or null when it is not on the site yet. */
  found: string | null;
  /** What "Add this project" fills in: a domain, chain:0x…, or "" (the empty field). */
  addable: string;
  relations: { name: string; relation: string }[];
}

/**
 * Related entries grouped by the subject they resolve to: an entry matches a subject by its id (domain), its main
 * contract, or any address in that subject's record on the same chain (Key facts and proof lines, model.ts
 * recordAddresses). Entries that resolve to the same subject become one card listing each relation; an entry that
 * resolves to the page's own subject is left out. The card is named by the entry given by domain, else the first.
 */
export function relatedCards(related: { name: string; id: string; relation: string }[], subjects: Findable[], self: string): RelatedCard[] {
  const cards: RelatedCard[] = [];
  const by = new Map<string, RelatedCard>();
  for (const [i, r] of related.entries()) {
    const q = parseLookup(r.id);
    // The page's own subject is never a candidate: an entry naming its own contract is left out, one naming another
    // project's contract resolves to the subject whose record ties it closest.
    if ((q.kind === "domain" && q.domain === self) || (q.kind === "address" && findSubject(q, subjects.filter((x) => x.id === self)) === self && isOwn(q, subjects.find((x) => x.id === self)))) continue;
    const found = relatedSubject(q, subjects, self);
    const addable = ownDomainEntry(r, q) ? q.kind === "domain" ? q.domain : "" : "";
    const rel = { name: r.name || r.id, relation: r.relation || "related" };
    const key = found ?? `entry-${i}`;
    const have = by.get(key);
    if (have) {
      have.relations.push(rel);
      if (q.kind === "domain" && r.name) have.name = r.name;
      continue;
    }
    const card: RelatedCard = { key, name: r.name || r.id || found || "Unnamed project", found, addable, relations: [rel] };
    by.set(key, card);
    cards.push(card);
  }
  return cards;
}

/** Sites of chains, which are never projects to add even though they have a domain of their own. */
const CHAIN_SITES = new Set(["ethereum.org", "base.org", "polygon.technology", "optimism.io", "arbitrum.io", "arbitrum.foundation", "solana.com", "unichain.org", "bnbchain.org", "avax.network", "zksync.io", "linea.build", "blast.io", "scroll.io", "zora.energy", "bitcoin.org"]);
/** Chain names that are also ordinary words, so a project's host label ("mode.app", "abstract.money") is not read as a chain. */
const GENERIC_LABELS = new Set(["mode", "ink", "op", "sonic", "abstract", "near", "ton", "celo", "gnosis", "mantle", "ronin", "taiko"]);
/**
 * Standards and protocols named as if they were projects: DNS (whose entry may give ICANN's domain), DNSSEC, HTTP,
 * TLS and the like. An entry naming the organisation itself (ICANN, IETF, W3C) is not a standard and stays eligible.
 */
const STANDARD_NAMES = new Set(["dns", "dnssec", "domain name system", "http", "https", "tls", "ssl", "tcp/ip", "smtp", "oauth", "openid", "openid connect", "json", "json-rpc", "unicode", "x.509", "pgp", "openpgp", "webauthn", "passkeys", "ipv4", "ipv6", "url", "uri", "utf-8", "rss", "atom", "activitypub"]);
/** Common tokens named as if they were projects. */
const TOKEN_SYMBOLS = new Set(["eth", "weth", "steth", "wsteth", "reth", "btc", "wbtc", "cbbtc", "usdc", "usdt", "dai", "usds", "usde", "eurc", "pyusd", "frax", "lusd", "gho", "crvusd"]);

/**
 * Whether a Related entry may offer "Add this project": only an entry given by a domain of its own (a bare host,
 * no path), and never a chain, a standard or another project's token. It matches the entry itself (its name, its
 * domain), never the bare words of its relation, which say which token or chain a project uses; the relation counts
 * only when it says the entry itself is a chain or a standard ("chain it runs on", "supported network").
 */
export function ownDomainEntry(r: { name: string; id: string; relation: string }, q: Lookup = parseLookup(r.id)): boolean {
  if (q.kind !== "domain") return false;
  const id = r.id.trim().replace(/^https?:\/\//i, "").replace(/\/+$/, "").toLowerCase();
  if (!/^[a-z0-9-]+(?:\.[a-z0-9-]+)+$/i.test(id)) return false;
  const name = r.name.trim();
  const host = q.domain.toLowerCase();
  const label = host.split(".")[0] ?? "";
  // A chain: by its name, its site, or its site's main label (ethereum.org, base.org, solana.com).
  if (isChainName(name) || CHAIN_SITES.has(host) || CHAIN_SITES.has(id) || (isChainName(label) && !GENERIC_LABELS.has(label))) return false;
  // A standard: ERC-20, EIP-1559, "Token standard".
  if (/^(?:erc|eip|bip|slip|caip|ensip|rfc)[- ]?\d+$/i.test(name) || /\bstandard$/i.test(name) || STANDARD_NAMES.has(name.toLowerCase().replace(/\s*\([^)]*\)\s*$/, ""))) return false;
  // A token: a $ symbol, a name ending in "token", a common token's symbol, or an address for a name.
  const bare = name.replace(/^\$/, "").toLowerCase();
  if (/^\$/.test(name) || /\btoken$/i.test(name) || TOKEN_SYMBOLS.has(bare) || TOKEN_SYMBOLS.has(label) || /0x[0-9a-f]{40}/i.test(name)) return false;
  // The relation says the entry itself is a chain or a standard.
  if (/\b(?:(?:the\s+)?chain (?:it|this|the project) (?:runs|is built|is deployed|lives) on|supported (?:chain|network)|token standard|(?:its|the) (?:home|base|settlement|host) (?:chain|network))\b/i.test(r.relation)) return false;
  return true;
}

/** True when the address is one of the subject's own contracts (rank 3 or listed), not one its proofs mention. */
function isOwn(q: Lookup, s: Findable | undefined): boolean {
  if (!s || q.kind !== "address") return false;
  const a = q.address.toLowerCase();
  if (s.ranked) return s.ranked.some((c) => c.address === a && c.tier === 3 && (q.chainId === null || c.chainId === null || c.chainId === q.chainId));
  return false;
}

const RELATED_SHOWN = 6;

/**
 * Related projects at the bottom of Overview as a compact list: name and relation on one line, at most six, then
 * "Show all N". A project on the site links to its page; one not on it carries a small "Add this project" link.
 */
function Related({ m, subjects }: { m: RecordModel; subjects: Findable[] }) {
  const [all, setAll] = useState(false);
  const cards = relatedCards(m.page?.related ?? [], subjects, m.subject.id);
  if (!cards.length) return null;
  const shown = all ? cards : cards.slice(0, RELATED_SHOWN);
  return (
    <section className="related" aria-labelledby="related-title">
      <h2 id="related-title">Related</h2>
      <ul className="plain related-list">
        {shown.map((c) => (
          <li key={c.key} className="rel-row">
            {c.found ? (
              <a className="rel-name" href={subjectHref(c.found)}>{c.name}</a>
            ) : (
              <span className="rel-name">{c.name}</span>
            )}
            <span className="rel-what">
              {c.relations.map((r, i) => (
                <span key={i} className="rel-one">
                  {c.relations.length > 1 && r.name !== c.name ? `${r.name}: ` : ""}
                  {r.relation}
                </span>
              ))}
            </span>
            {!c.found && c.addable && (
              <a className="rel-add small" href={addHref(c.addable)} aria-label={`Add this project: ${c.name}`}>
                Add this project
              </a>
            )}
          </li>
        ))}
      </ul>
      {cards.length > RELATED_SHOWN && (
        <button type="button" className="linklike small" aria-expanded={all} onClick={() => setAll(!all)}>
          {all ? "Show fewer" : `Show all ${cards.length.toLocaleString("en-US")}`}
        </button>
      )}
    </section>
  );
}

/** "A newer source disputes N parts of this page.", when a kept change left anything in its affects list. */
function DisputedNote({ m }: { m: RecordModel }) {
  const { rows } = useKeyFacts(m);
  if (!m.page || !m.disputes.fromKept) return null;
  const n = disputedCount(m.disputes, rows.map((r) => r.label), m.summary);
  if (!n) return null;
  return (
    <p className="disputed-note" role="note">
      A newer source disputes {n === 1 ? "1 part" : `${n.toLocaleString("en-US")} parts`} of this page. <a href={to("rebuild")}>Rebuild to update them.</a>
    </p>
  );
}

/** "The page could not be loaded. Try again." for a subject whose finished page job could not be read. */
export function PageRetry({ onRetry, retrying = false }: { onRetry?: () => void; retrying?: boolean }) {
  return (
    <p className="why" role="status">
      The page could not be loaded.{" "}
      {onRetry ? (
        <button type="button" className="linklike" onClick={onRetry} disabled={retrying}>
          {retrying ? "Trying again…" : "Try again."}
        </button>
      ) : (
        "Try again."
      )}
    </p>
  );
}

export function OverviewTab({ m, ui, items, subjects, chainError = null, retrying = false, readingFiles = false, unreadable = 0, onRetry, jobs = { finished: false, loadFailed: false, settled: true } }: { m: RecordModel; ui: Ui; items: Activity[] | null; price: string; subjects: Findable[]; chainError?: string | null; retrying?: boolean; readingFiles?: boolean; unreadable?: number; onRetry?: () => void; jobs?: PageJobs }) {
  const { page, latest, error } = m;
  // D10: "No page yet" and "Create the page" only once the current scan shows no finished page job.
  const noJobs = items !== null && jobs.settled && !jobs.finished && !latest && unreadable === 0;
  const name = page?.name || m.subject.id;
  // The same first-page status Home shows for this subject: in progress, refused, failed or no project found.
  const first: FirstPageStatus | null = !page && items !== null ? firstPageStatus(items) : null;
  const rejectedCard = !page && !!m.rejected && items !== null && !(latest && !error) && first?.kind !== "pending";
  return (
    <section className="tab" aria-labelledby="record-title">
      <div className="title-row">
        <SubjectLogo name={name} logo={latest?.logo} size={40} />
        <h1 id="record-title" tabIndex={-1}>{name}</h1>
      </div>
      <p className="lead">{page?.oneLine || `Public sources and checks for ${m.subject.id}.`}</p>
      <ReaderNote o={m.outdated} href={to("rebuild")} />
      <DisputedNote m={m} />
      {rejectedCard && (first?.kind === "instructions" || isInstructionsUnavailable(m.rejected!.rejected)) && (
        <div className="card empty" id="rejected">
          <h2>Instructions not verified</h2>
          <p className="why">{INSTRUCTIONS_UNAVAILABLE}</p>
          <p>It could not fetch the instruction file its objective names, or the file’s sha256 differed, so it did not research {m.subject.id}. This says nothing about whether the project exists.</p>
          <p className="small">
            See <a href={to("activity")}>Activity</a> for the job.
          </p>
        </div>
      )}
      {rejectedCard && !(first?.kind === "instructions" || isInstructionsUnavailable(m.rejected!.rejected)) && (
        <div className="card empty" id="rejected">
          <h2>No project found</h2>
          <p className="why">{first?.kind === "not-found" ? statusText(first) : `No project found: ${m.rejected!.rejected}`}</p>
          <p>The research job for {m.subject.id} found no single real project, so this site shows no page for it.</p>
          <p className="small">
            See <a href={to("activity")}>Activity</a> for the job. A rebuild with a clearer description can still try again.
          </p>
        </div>
      )}
      {!page && !rejectedCard && (
        <div className="card empty" id="first-page">
          {items === null ? (
            readingFiles ? <h2>Reading the page…</h2> : <StillReading error={chainError} retrying={retrying} />
          ) : !jobs.settled ? (
            // Shown from this browser's cache while Ethereum is read for newer blocks: never "No page yet" yet.
            <>
              <h2>Reading the page…</h2>
              <StillReading error={chainError} retrying={retrying} />
            </>
          ) : jobs.loadFailed && !latest ? (
            <>
              <h2>Page not loaded</h2>
              <PageRetry onRetry={onRetry} retrying={retrying} />
            </>
          ) : unreadable > 0 && !latest ? (
            <>
              <h2>No result could be read</h2>
              <p className="why">
                {unreadableText(unreadable)} See <a href={to("activity")}>Activity</a>.
              </p>
              <PageRetry onRetry={onRetry} retrying={retrying} />
            </>
          ) : latest && error ? (
            // A finished page job whose file failed to load: never "No page yet" or "Create the page".
            <>
              <h2>Page not loaded</h2>
              <PageRetry onRetry={onRetry} retrying={retrying} />
            </>
          ) : latest && !error ? (
            <>
              <h2>Downloading the record…</h2>
              <p>The page job finished. Downloading and checking its file…</p>
            </>
          ) : first?.kind === "pending" ? (
            <>
              <h2>First page in progress</h2>
              <p>A research job is writing the first page of {m.subject.id}. It appears here when the job completes; there is no need to pay for another. Follow it in <a href={to("activity")}>Activity</a>.</p>
            </>
          ) : first && first.kind !== "none" ? (
            <>
              <h2>{first.kind === "not-found" ? "No project found" : first.kind === "instructions" ? "Instructions not verified" : first.kind === "refused" ? "First page refused" : "First page failed"}</h2>
              <p className="why">{statusText(first)}</p>
              <p>
                See <a href={to("activity")}>Activity</a> for the request. You can try again with <a href={to("rebuild")}>a rebuild</a>.
              </p>
            </>
          ) : !noJobs ? (
            // A finished page job with nothing to show and no reason read: Activity says what happened.
            <>
              <h2>Page not loaded</h2>
              <PageRetry onRetry={onRetry} retrying={retrying} />
            </>
          ) : (
            <>
              <h2>No page yet</h2>
              <p>Run a rebuild to publish the first record of {m.subject.id}.</p>
            </>
          )}
          {error && !latest && <p className="error">Unable to read the page: {error}</p>}
        </div>
      )}
      {(page || m.summary.length > 0) && (
        <div className="overview">
          <div className="summary-col">
            <Summary m={m} ui={ui} />
            {page && !m.summary.length && (
              <p className="small">
                This page has no summary yet. Read the lines in <a href={to("record")}>Record</a>; the next rebuild writes one.
              </p>
            )}
          </div>
          <KeyFacts m={m} ui={ui} />
        </div>
      )}
      {page && <Related m={m} subjects={subjects} />}

      {page ? (
        <div className="ov-foot" id="suggest">
          <p>
            Something wrong or missing? Use the pencil on any row, click a sentence, or <a href={to("suggest-changes")}>say it in your own words</a>.
          </p>
        </div>
      ) : items !== null && jobs.settled && (unreadable > 0 || latest || jobs.finished) ? (
        // Finished page jobs exist but the page could not be read: Activity says why; creating the page is never offered.
        <div className="ov-foot">
          <p className="foot-links">
            <a href={to("activity")}>See why in Activity</a>
          </p>
        </div>
      ) : noJobs ? (
        // Only once the chain has answered and shows no finished page job; while it is read, nothing is offered.
        <div className="ov-foot">
          <p className="foot-links">
            <a href={to("rebuild")}>Create the page</a>
          </p>
        </div>
      ) : null}
    </section>
  );
}

/* ---------- Record ---------- */

interface Ctx {
  numbers: Map<string, ListedSource>;
  /** Every line's settle state and the proofs a settled row already shows. */
  settled: { by: Map<string, Settle>; absorbed: Set<string> };
  research: { payer: string; payerAddr?: string; href: string; time: number | null } | null;
  m: RecordModel;
  ui: Ui;
}

function SourceNumbers({ keys, numbers }: { keys: string[]; numbers: Map<string, ListedSource> }) {
  if (!keys.length) return null;
  return (
    <span className="nums">
      {keys.map((k) => {
        const s = numbers.get(k);
        return s ? (
          <a key={k} className="chip mono" href={to(`source-${s.n}`)} aria-label={`Source ${s.n}`}>
            {s.n}
          </a>
        ) : (
          <span key={k} className="chip mono" title="Source not listed">
            ?
          </span>
        );
      })}
    </span>
  );
}

/** The opened part of a row: the quote, re-run steps, how it was checked, who added it, and the links. */
function Details({ row, ctx, id, withText }: { row: RecordRow; ctx: Ctx; id: string; withText?: boolean }) {
  const { line, origin } = row;
  const st = ctx.settled.by.get(line.id);
  const settledBy = st && (st.state === "proven" || st.state === "contradicted") ? (st.state === "proven" ? st.confirms : st.contradicts) : [];
  const listed = line.srcKeys.map((k) => ctx.numbers.get(k)).filter((s): s is ListedSource => !!s);
  const checked = whyLabel(line, ctx.m.page?.name || ctx.m.subject.id, ctx.m.page?.domain ?? ctx.m.subject.domain, listed[0]?.url ?? "");
  // First recorded: the job that added the line, else the earliest earlier file it was carried over from, else the page job.
  const fromTimes = line.from.map(ctx.m.fromTime).filter((t): t is number => !!t);
  const first = origin?.time ?? (fromTimes.length ? Math.min(...fromTimes) : null) ?? ctx.research?.time ?? null;
  // This row's own earlier origins: those of the lines folded into it are listed with each of them.
  const ownFrom = line.from.filter((f) => !(row.same ?? []).some((o) => o.line.from.includes(f)));
  const job = origin ? { what: origin.raised ? "A changes job a visitor raised" : "A sources or edit job", payer: origin.payer, payerAddr: origin.payerAddr, href: origin.jobHref } : ctx.research ? { what: "The page job", payer: ctx.research.payer, payerAddr: ctx.research.payerAddr, href: ctx.research.href } : null;
  // Where the line was first written: the job and its line id, a permanent address (addresses.ts).
  const written = ctx.m.origins.get(line.id);
  return (
    <div className="details" id={id}>
      <dl className="facts">
        {withText && (
          <>
            <dt>Line</dt>
            <dd>{line.text}</dd>
          </>
        )}
        {!withText && formatNumbers(line.text) !== line.text && (
          <>
            <dt>Exact text</dt>
            <dd>{line.text}</dd>
          </>
        )}
        {line.fact && formatNumbers(line.fact.value) !== line.fact.value && (
          <>
            <dt>Exact value</dt>
            <dd className="mono">
              {line.fact.value}
              {line.fact.unit ? ` ${line.fact.unit}` : ""}
            </dd>
          </>
        )}
        {line.quote && (
          <>
            <dt>{settledBy.length ? "Original quote" : "Quote"}</dt>
            <dd>“{line.quote}”</dd>
          </>
        )}
        {settledBy.map((t) => {
          const proof = ctx.m.resolve(t);
          if (proof)
            return (
              <Fragment key={t}>
                <dt>{st!.state === "proven" ? "Proof" : disputeWho(proof)}</dt>
                <dd>
                  {proof.text}
                  {proof.kind === "proof" && (proof.rerun ? <span className="block">Re-run: {proof.rerun}</span> : <span className="block small">The proof gives no re-run steps.</span>)}
                </dd>
              </Fragment>
            );
          const a = ctx.m.answerRef(t);
          return (
            <Fragment key={t}>
              <dt>Panel answer</dt>
              <dd>
                {a ? a.text : "A panel answer not shown in this record"}
                {a?.activity && (
                  <span className="block small">
                    {a.activity.oracle?.agreed ?? "?"} of {a.activity.oracle?.panelSize ?? "?"} agreed.{" "}
                    <a href={to(panelAnchor(a.activity))}>See it under Panel answers</a>
                  </span>
                )}
              </dd>
            </Fragment>
          );
        })}
        {line.rerun && (
          <>
            <dt>Re-run</dt>
            <dd>{line.rerun}</dd>
          </>
        )}
        <dt>Why it has this label</dt>
        <dd>{checked}</dd>
        {listed.length > 0 && (
          <>
            <dt>Source</dt>
            <dd>
              <ul className="links">
                {listed.map((s) => (
                  <li key={s.key}>
                    <span className="chip mono">{s.n}</span> <ExtLink url={s.url}>{hostOf(s.url) || s.url || "source"}</ExtLink>
                  </li>
                ))}
              </ul>
            </dd>
          </>
        )}
        {first && (
          <>
            <dt>First recorded</dt>
            <dd>{readDate(String(first))}</dd>
          </>
        )}
        {written && (
          <>
            <dt>First written</dt>
            <dd>
              <a href={jobLink(written.jobId, written.tx)} target="_blank" rel="noopener noreferrer" title={written.jobId ?? written.tx}>
                {written.jobId ? `Written in job ${shortJobId(written.jobId)}` : "Written in a job not yet on the explorer"}
              </a>
              <span className="small">, line {written.lineId}</span>
              {written.jobId && (
                <>
                  {" · "}
                  <a href={lineAddressHref(ctx.m.subject.id, addressText(written))}>Permanent link</a>
                </>
              )}
              <Copy value={`${jobLink(written.jobId, written.tx)} line ${written.lineId}`} label="Copy citation" />
              {written.also.length > 0 && <span className="block small">Also cited as {written.also.map(addressText).join(", ")}</span>}
            </dd>
          </>
        )}
        {!!line.history?.length && (
          <>
            <dt>Earlier readings</dt>
            <dd>
              <ul className="plain history">
                {line.history.map((h, i) => (
                  <li key={i}>
                    {h.block ? (
                      <>
                        Block <span className="num">{/^\d+$/.test(h.block) ? BigInt(h.block).toLocaleString("en-US") : h.block}</span>:{" "}
                      </>
                    ) : (
                      "Block not given: "
                    )}
                    <span className="num">{h.value}</span>
                  </li>
                ))}
              </ul>
            </dd>
          </>
        )}
        {!!row.same?.length && (
          <>
            <dt>Also in the record</dt>
            <dd>
              <ul className="plain">
                {row.same.map((o, i) => {
                  const nums = o.line.srcKeys.map((k) => ctx.numbers.get(k)?.n).filter((n): n is number => n !== undefined);
                  const who = o.line.kind === "proof" ? "A proof" : speakerText(o.line);
                  return (
                    <li key={i}>
                      {who}
                      {nums.length ? `, source${nums.length === 1 ? "" : "s"} ${nums.join(", ")}` : ""}
                      {o.line.quote ? <span className="block">“{o.line.quote}”</span> : null}
                    </li>
                  );
                })}
              </ul>
            </dd>
          </>
        )}
      </dl>
      <details className="line-history">
        <summary>History</summary>
        <dl className="facts">
          {line.labelNote && (
            <>
              <dt>Label</dt>
              <dd>{line.labelNote}</dd>
            </>
          )}
          <dt>Added by</dt>
          <dd>
            {job ? (
              <>
                {job.what}, paid by <PayerLink name={job.payer} address={job.payerAddr} />
              </>
            ) : (
              "Unknown"
            )}
          </dd>
          {!origin && ownFrom.length > 0 && (
            <>
              <dt>Carried over</dt>
              <dd>{[...new Set(ownFrom.map(ctx.m.fromOrigin))].join("; ")}</dd>
            </>
          )}
          {!!row.same?.length && (
            <>
              <dt>Merged lines</dt>
              <dd>
                <ul className="plain">
                  {row.same.map((o, i) => (
                    <li key={i}>
                      {o.origin
                        ? `Added by ${o.origin.raised ? "a changes job" : "a sources or edit job"} paid by ${o.origin.payer}`
                        : o.line.from.length
                          ? [...new Set(o.line.from.map(ctx.m.fromOrigin))].join("; ")
                          : "From the page job"}
                    </li>
                  ))}
                </ul>
              </dd>
            </>
          )}
          {job && (
            <>
              <dt>Job</dt>
              <dd>
                <a href={job.href} target="_blank" rel="noopener noreferrer">
                  {origin ? "Its job" : "Page job"} on {job.href.startsWith(EXPLORER) ? "explorer.imd.fun" : "Etherscan"}
                </a>
              </dd>
            </>
          )}
        </dl>
      </details>
    </div>
  );
}

/** How a channel's label reads inside a sentence: "part of its own domain", "an account its own site links to". */
const STATUS_PHRASE: Record<ChannelStatus, string> = {
  own: "part of its own domain",
  linked: "an account its own site links to",
  verified: "an account shown on chain to be its own",
  unverified: "not shown to be its own",
};

/**
 * One plain sentence on why a line has its label, such as "Zora said this on its help centre, which is part of its
 * own domain." Pure, for tests.
 */
export function whyLabel(line: Pick<Line, "kind" | "by" | "channel"> & { marked?: Line["marked"] }, name: string, domain: string, sourceUrl = ""): string {
  if (line.kind === "proof") return "Anyone can re-run this check on chain and get the same answer.";
  const who = line.by.split(/\s*;\s*/)[0]?.trim();
  if (line.kind === "statement") {
    const ch = line.channel;
    const where = ch?.label || hostOf(ch?.url ?? "") || "one of its channels";
    const st: ChannelStatus = ch ? channelStatus(ch, domain) : "unverified";
    return `${name} said this on ${where}, which is ${STATUS_PHRASE[st]}.`;
  }
  // A line the job marked a statement but shown as a claim: one plain sentence on where it was said. The technical
  // reason stays under History, the URL under Source.
  if (line.marked === "statement") {
    const host = hostOf(sourceUrl) || hostOf(line.channel?.url ?? "");
    return `${who || "Someone"} made this claim on ${host ? host : "a site"}, outside ${name}'s verified channels.`;
  }
  return `${who || "Someone other than " + name} said this, not ${name} on a channel shown to be its own, so it is a claim.`;
}

/** "Confirmed by" in green or "Contradicted by" in red, each opening the linked proof line or panel answer. */
function LinkNotes({ line, ctx }: { line: Line; ctx: Ctx }) {
  // What a settled row already leads with is not repeated under it.
  const st = ctx.settled.by.get(line.id);
  const lead = new Set(st?.state === "proven" ? st.confirms.map((t) => `confirms:${t}`) : st?.state === "contradicted" ? st.contradicts.map((t) => `contradicts:${t}`) : []);
  // Superseded is the row's lead with "Newer:" under it; a link to nothing the record shows is left out.
  const links = line.links.filter((k) => k.type !== "outdates" && !lead.has(`${k.type}:${k.target.trim()}`) && (ctx.m.resolve(k.target) || ctx.m.answerRef(k.target)));
  if (!links.length) return null;
  return (
    <ul className="settled">
      {links.map((k, i) => {
        const word = k.type === "confirms" ? "Confirmed by" : k.type === "partly" ? "Partly confirmed by" : k.type === "context" ? "Context" : k.type === "agrees" ? "Also said by another speaker" : "Contradicted by";
        const target = ctx.m.resolve(k.target);
        const answer = target ? null : ctx.m.answerRef(k.target);
        let body: React.ReactNode = <span>a line not shown in this record</span>;
        if (target)
          body = (
            <a
              href={to(lineAnchor(target.id))}
              onClick={(e) => {
                e.preventDefault();
                ctx.ui.openLines([target.id]);
              }}
            >
              {formatNumbers(target.text)}
            </a>
          );
        else if (answer) body = answer.activity ? <a href={to(panelAnchor(answer.activity))}>{answer.text}</a> : <span>{answer.text}</span>;
        return (
          <li key={i} className={`settled-${k.type}`}>
            <span className="settled-word">{word}:</span> {k.type === "context" ? <span className="block">{body}</span> : body}
          </li>
        );
      })}
    </ul>
  );
}

function DiffersNote({ row, facts }: { row: RecordRow; facts: Set<string> }) {
  if (!row.differsWith) return null;
  const conflict = row.level === "conflict";
  const where = facts.has(row.differsWith) ? "the fact in the table above" : "the line above";
  return (
    <p className={`differs ${conflict ? "differs-conflict" : "differs-question"}`}>
      {conflict ? `Conflicts with ${where}` : `Compare with ${where}`}
      {row.why ? `: ${row.why}` : ""}
    </p>
  );
}

/** Clicking anywhere on a row that is not a link toggles it; the button inside handles Enter and Space. */
const onRowClick = (toggle: () => void) => (e: React.MouseEvent) => {
  const t = e.target as HTMLElement;
  if (t.closest("a, button")) return;
  toggle();
};

/** The green "Proven" (or "Confirmed by a panel, N of M") or red "Contradicted" marker a settled row leads with. */
export function SettleMark({ s, ctx }: { s: Settle; ctx: Ctx }) {
  if (s.state === "outdated")
    return (
      <span className="kind kind-outdated">
        <span className="dot" aria-hidden="true" />
        Superseded
      </span>
    );
  if (s.state === "contradicted")
    return (
      <span className="kind kind-contradicted">
        <span className="dot" aria-hidden="true" />
        Contradicted
      </span>
    );
  const panelOnly = s.confirms.every((t) => !ctx.m.resolve(t));
  const a = panelOnly ? ctx.m.answerRef(s.confirms[0]!)?.activity?.oracle : null;
  const word = !panelOnly ? "Proven" : a ? `Confirmed by a panel, ${a.agreed ?? "?"} of ${a.panelSize ?? "?"}` : "Confirmed by a panel";
  return (
    <span className="kind kind-proven">
      <span className="dot" aria-hidden="true" />
      {word}
    </span>
  );
}

/** Who disputes a line, by the evidence it is: a proof, a newer claim or statement, or a panel answer. */
const disputeWho = (l: Pick<Line, "kind">) => (l.kind === "proof" ? "The proof shows" : l.kind === "claim" ? "A newer claim says" : "A newer statement says");

/** What the disputing line or panel answer says, for a contradicted row, introduced by what kind of evidence it is. */
function shownBy(t: string, ctx: Ctx): { who: string; text: string } {
  const proof = ctx.m.resolve(t);
  if (proof) return { who: disputeWho(proof), text: proof.text };
  const a = ctx.m.answerRef(t);
  return { who: "The panel answered", text: a?.text || "an answer not shown in this record" };
}

/** "Newer: <the newer line>" under a Superseded row, each opening that line. */
function NewerNotes({ ids, ctx, contradicted }: { ids: string[]; ctx: Ctx; contradicted?: boolean }) {
  return (
    <ul className="settled">
      {ids.map((t) => {
        const newer = ctx.m.resolve(t);
        const a = newer ? null : ctx.m.answerRef(t);
        if (!newer && !a) return null;
        return (
          <li key={t} className={contradicted ? "settled-contradicts" : "settled-outdates"}>
            <span className="settled-word">{contradicted ? `${newer ? disputeWho(newer) : "The panel answered"}:` : "Newer:"}</span>{" "}
            {newer ? (
              <a
                href={to(lineAnchor(newer.id))}
                onClick={(e) => {
                  e.preventDefault();
                  ctx.ui.openLines([newer.id]);
                }}
              >
                {formatNumbers(newer.text)}
              </a>
            ) : (
              <span>{a!.text}</span>
            )}
          </li>
        );
      })}
    </ul>
  );
}

/**
 * Who else says what this row says: the speakers of identical lines shown as this one row, and statements or
 * claims of the record whose confirms (or partly) link points at it. Each opens that line.
 */
function alsoSaidBy(row: RecordRow, ctx: Ctx): { who: string; id: string }[] {
  const { line } = row;
  const mine = (line.kind === "proof" ? "" : speakerText(line)).replace(/^(Stated|Claimed) by /, "").toLowerCase();
  const out: { who: string; id: string }[] = [];
  const add = (l: Line, id: string) => {
    if (l.kind === "proof") return;
    const who = speakerText(l).replace(/^(Stated|Claimed) by /, "");
    if (!who || who.toLowerCase() === mine || out.some((x) => x.who.toLowerCase() === who.toLowerCase())) return;
    out.push({ who, id });
  };
  for (const o of row.same ?? []) add(o.line, line.id);
  for (const l of allLines(ctx.m)) if (l.id !== line.id && l.links.some((k) => (k.type === "confirms" || k.type === "partly") && k.target.trim() === line.id)) add(l, l.id);
  return out;
}

/** "Also said by <speaker>" under a line, each opening the line that says it. */
function AlsoSaid({ also, lineId, open, toggle, ctx }: { also: { who: string; id: string }[]; lineId: string; open: boolean; toggle: () => void; ctx: Ctx }) {
  if (!also.length) return null;
  return (
    <ul className="settled also">
      {also.map((a, i) => (
        <li key={i}>
          <span className="settled-word">Also said by</span>{" "}
          <a
            href={to(lineAnchor(a.id))}
            onClick={(e) => {
              e.preventDefault();
              if (a.id === lineId) {
                if (!open) toggle();
              } else ctx.ui.openLines([a.id]);
            }}
          >
            {a.who}
          </a>
        </li>
      ))}
    </ul>
  );
}

function LineRow({ row, ctx, facts }: { row: RecordRow; ctx: Ctx; facts: Set<string> }) {
  const { line } = row;
  const anchor = lineAnchor(line.id || line.text.slice(0, 40));
  const showBy = line.kind !== "proof" && line.by;
  const open = ctx.ui.openSet.has(line.id);
  const toggle = () => ctx.ui.toggle(line.id);
  const s = ctx.settled.by.get(line.id);
  const settled = s && (s.state === "proven" || s.state === "contradicted" || s.state === "outdated") ? s : null;
  const sg = useSuggest();
  const also = alsoSaidBy(row, ctx);
  const target = lineTarget(line.id || line.text.slice(0, 40), line.text, line.id ? originOfLine(line.id, ctx.m.scope) : null);
  const srcUrl = line.srcKeys.map((k) => ctx.numbers.get(k)?.url).find(Boolean) ?? "";
  return (
    <li className={`row has-pencil${row.differsWith ? ` row-differs row-${row.level}` : ""}${settled ? ` row-${settled.state}` : ""}${open ? " is-open" : ""}${ctx.ui.highlight === row.line.id ? " is-addressed" : ""}`} id={anchor}>
      <DiffersNote row={row} facts={facts} />
      <div className="row-main" onClick={onRowClick(toggle)}>
        <button type="button" className="row-toggle" aria-expanded={open} aria-controls={`${anchor}-d`} onClick={toggle}>
          <span className="chev" aria-hidden="true" />
          {settled?.state === "contradicted" ? (
            <span className="row-text">
              <SettleMark s={settled} ctx={ctx} />
              <span className="block">
                <span className="said-word">{line.kind === "proof" ? "Checked:" : "Said:"}</span> {formatNumbers(line.text)}
              </span>
              {settled.contradicts.map((t) => {
                const b = shownBy(t, ctx);
                return (
                  <span key={t} className="block shows">
                    <span className="said-word">{b.who}:</span> {formatNumbers(b.text)}
                  </span>
                );
              })}
            </span>
          ) : settled?.state === "outdated" ? (
            <span className="row-text">
              <SettleMark s={settled} ctx={ctx} />
              <span className="block">{formatNumbers(line.text)}</span>
            </span>
          ) : (
            <span className="row-text">{formatNumbers(line.text)}</span>
          )}
          <span className="row-meta">
            {settled ? (
              <>
                {settled.state === "proven" && <SettleMark s={settled} ctx={ctx} />}
                {line.kind === "proof" ? <KindMark kind="proof" /> : <span className="by small">{speakerText(line)}{settled.state === "proven" ? ", then confirmed" : ""}</span>}
              </>
            ) : (
              <>
                <KindMark kind={line.kind} />
                {line.kind === "proof" && <span className="by small">a check in its own right</span>}
                {showBy && <span className="by">{line.by}</span>}
              </>
            )}
            {row.origin?.raised && <span className="by small">raised by <PayerLink name={row.origin.payer} address={row.origin.payerAddr} /></span>}
          </span>
        </button>
        <SourceNumbers keys={line.srcKeys} numbers={ctx.numbers} />
        <Pencil target={target} />
      </div>
      <PendingTag targetKey={target.key} />
      {settled?.state === "outdated" && <NewerNotes ids={settled.outdates} ctx={ctx} />}
      <AlsoSaid also={also} lineId={line.id} open={open} toggle={toggle} ctx={ctx} />
      <LinkNotes line={line} ctx={ctx} />
      {open && <Details row={row} ctx={ctx} id={`${anchor}-d`} />}
      {sg.open === target.key && <ChangePanel target={target} mode="line" sourceUrl={srcUrl} line={line} evidence={evidenceOf([line], allLines(ctx.m))} onOpenLines={ctx.ui.openLines} />}
    </li>
  );
}

/** Every proof line that carries "fact", in one table under On chain: name, value with unit, chain and block. */
function FactTable({ rows, ctx }: { rows: RecordRow[]; ctx: Ctx }) {
  const sg = useSuggest();
  return (
    <table className="fact-table">
      <caption className="sr-only">On-chain facts</caption>
      <thead>
        <tr>
          <th scope="col">Name</th>
          <th scope="col">Value</th>
          <th scope="col">Chain and block</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => {
          const f = row.line.fact!;
          const anchor = lineAnchor(row.line.id || f.name);
          const open = ctx.ui.openSet.has(row.line.id);
          const toggle = () => ctx.ui.toggle(row.line.id);
          const target = lineTarget(row.line.id || f.name, `${f.name}: ${f.value}${f.unit ? ` ${f.unit}` : ""}`, row.line.id ? originOfLine(row.line.id, ctx.m.scope) : null);
          const st = ctx.settled.by.get(row.line.id);
          const stale = st?.state === "outdated" ? st : null;
          const disputed = st?.state === "contradicted" ? st : null;
          const also = alsoSaidBy(row, ctx);
          return (
            <Fragment key={row.line.id || f.name}>
              <tr id={anchor} className={`fact-row has-pencil${stale ? " row-outdated" : ""}${disputed ? " row-contradicted" : ""}${open ? " is-open" : ""}${ctx.ui.highlight === row.line.id ? " is-addressed" : ""}`} onClick={onRowClick(toggle)}>
                <th scope="row">
                  <button type="button" className="row-toggle" aria-expanded={open} aria-controls={`${anchor}-d`} onClick={toggle}>
                    <span className="chev" aria-hidden="true" />
                    <span className="row-text">
                      {/* Each check says what it is, as a standalone proof row does; a disputed one says so instead. */}
                      {disputed ? <SettleMark s={disputed} ctx={ctx} /> : stale ? <SettleMark s={stale} ctx={ctx} /> : <KindMark kind="proof" />}
                      <span className="block">{f.name}</span>
                    </span>
                  </button>
                  {row.origin?.raised && <span className="by small block">raised by <PayerLink name={row.origin.payer} address={row.origin.payerAddr} /></span>}
                  <PendingTag targetKey={target.key} />
                </th>
                <td data-label="Value" className="num" title={formatNumbers(f.value) !== f.value ? `Exact: ${f.value}` : undefined}>
                  {formatNumbers(f.value)}
                  {f.unit ? ` ${f.unit}` : ""}
                </td>
                <td data-label="Chain and block">
                  {f.chain || "Chain not given"}
                  {f.block ? (
                    <>
                      , block <span className="num">{f.block}</span>
                    </>
                  ) : (
                    ", block not given"
                  )}
                  <Pencil target={target} />
                </td>
              </tr>
              {sg.open === target.key && (
                <tr className="fact-details">
                  <td colSpan={3}>
                    <ChangePanel target={target} mode="line" sourceUrl={ctx.numbers.get(row.line.srcKeys[0] ?? "")?.url ?? ""} line={row.line} evidence={evidenceOf([row.line], allLines(ctx.m))} onOpenLines={ctx.ui.openLines} />
                  </td>
                </tr>
              )}
              {(stale || disputed || also.length > 0) && (
                <tr className="fact-links">
                  <td colSpan={3}>
                    {disputed && <NewerNotes ids={disputed.contradicts} ctx={ctx} contradicted />}
                    {stale && <NewerNotes ids={stale.outdates} ctx={ctx} />}
                    <AlsoSaid also={also} lineId={row.line.id} open={open} toggle={toggle} ctx={ctx} />
                  </td>
                </tr>
              )}
              {row.line.links.length > 0 && (
                <tr className="fact-links">
                  <td colSpan={3}>
                    <LinkNotes line={row.line} ctx={ctx} />
                  </td>
                </tr>
              )}
              {open && (
                <tr className="fact-details">
                  <td colSpan={3}>
                    <Details row={row} ctx={ctx} id={`${anchor}-d`} withText />
                  </td>
                </tr>
              )}
            </Fragment>
          );
        })}
      </tbody>
    </table>
  );
}

/**
 * "Page upkeep": one closed row at the bottom of Record. It opens to show the lines dropped in the last rebuild with
 * their reasons, earlier lines unaccounted for (if any), how many identical lines were shown as one, and panel
 * answers no line links to. Internal ids appear only here (and on Contribute under Rebuild the page). A small amber
 * dot marks the row only when there are unaccounted lines.
 */
function PageUpkeep({ m }: { m: RecordModel }) {
  const a = m.accounting;
  const dropped = a.dropped;
  const carried = m.carried;
  const missing = a.state === "done" ? a.missing : [];
  const { unlinked } = linkedAnswers(m);
  const total = dropped.length + carried.length;
  if (!m.page && !unlinked.length) return null;
  return (
    <details className="card upkeep" id="upkeep">
      <summary>
        <span className="upkeep-title">Page upkeep</span>
        {missing.length > 0 && <span className="upkeep-dot" role="img" aria-label="Earlier lines unaccounted for" />}
      </summary>
      <div className="upkeep-body small">
        {m.outdated && <OutdatedNote o={m.outdated} href={to("rebuild")} />}
        {a.state === "loading" && <p>Checking the last rebuild against the {a.files} earlier files it was given…</p>}
        {a.state === "error" && <p>Unable to check the last rebuild against its earlier files: {a.error}</p>}
        <h3>Dropped in the last rebuild</h3>
        {total > 0 ? (
          <ul className="plain" id="dropped">
            {dropped.map((d, i) => (
              <li key={i}>
                <span className="mono">{d.ref}</span>
                {d.text && <> “{d.text}”</>}
                {": "}
                <span className="why-dropped">{d.why || "no reason given"}</span>
              </li>
            ))}
            {carried.map((d) => (
              <li key={`${d.url}:${d.id}`}>
                <span className="mono">{d.id}</span> of <span className="mono break">{d.url.replace(/^https:\/\/api\.imd\.fun\/artifacts\//, "").slice(0, 12)}…</span>
                {": "}
                <span className="why-dropped">{d.why || "no reason given"}</span>
                <span> Dropped by an earlier rebuild; the next rebuild reconsiders it.</span>
              </li>
            ))}
          </ul>
        ) : (
          <p>None.</p>
        )}
        {missing.length > 0 && (
          <div id="unaccounted">
            <h3>
              {missing.length} earlier line{missing.length === 1 ? " is" : "s are"} unaccounted for
            </h3>
            <p>The last rebuild neither carried these lines forward nor listed them as dropped.</p>
            <ul className="plain">
              {missing.map((x) => (
                <li key={x.ref}>
                  <span className="mono">{x.ref}</span> {x.text}
                </li>
              ))}
            </ul>
          </div>
        )}
        {m.unresolved.length > 0 && (
          <div id="unresolved">
            <h3>
              {m.unresolved.length} link{m.unresolved.length === 1 ? "" : "s"} to a panel answer the record does not hold
            </h3>
            <p>These lines keep their own kind until the next rebuild links them to an answer it was given.</p>
            <ul className="plain">
              {m.unresolved.map((x, i) => (
                <li key={i}>
                  <span className="mono">{x.lineId}</span> {x.type} <span className="mono">{x.target}</span>: {x.text}
                </li>
              ))}
            </ul>
          </div>
        )}
        <h3>Identical lines</h3>
        <p id="repeats">
          {m.merged
            ? `${m.merged.toLocaleString("en-US")} line${m.merged === 1 ? " had" : "s had"} the same text as another line (ignoring case and punctuation) and ${m.merged === 1 ? "is" : "are"} shown as one row. The next rebuild merges them.`
            : "No two lines have the same text."}
        </p>
        {unlinked.length > 0 && (
          <>
            <h3>Panel answers no line links to yet</h3>
            <ul className="plain">
              {[...unlinked].reverse().map((p) => (
                <li key={p.req.requestId} id={panelAnchor(p)} tabIndex={-1}>
                  {p.req.title || String(p.req.bodyJson?.question ?? "").slice(0, 120)}:{" "}
                  <span className={`answer answer-${p.oracle?.answer ?? "none"}`}>{p.oracle?.answer ?? "no answer"}</span>, {p.oracle?.agreed ?? "?"} of {p.oracle?.panelSize ?? "?"} agreed.{" "}
                  <a href={jobLink(p.jobId, p.req.transactionHash)} target="_blank" rel="noopener noreferrer">
                    {p.jobId ? "Open the request" : "Open the transaction"}
                  </a>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </details>
  );
}

const CITED_WORDS: Record<string, string> = { proven: "Confirmed", contradicted: "Contradicted", outdated: "Superseded", partly: "Partly confirmed", none: "Standing" };

/** The line a permanent address opened: its status today and, when another line settles it, which one. */
function CitedLine({ ctx }: { ctx: Ctx }) {
  const { m, ui } = ctx;
  const id = ui.highlight;
  const row = id ? m.sections.flatMap((s) => s.rows).find((r) => r.line.id === id) : undefined;
  if (!row) {
    // A line an earlier counted page wrote and a later rebuild dropped: shown as it was, with what replaced it.
    const h = ui.address ? historicFor(m.historic, ui.address) : null;
    if (h) {
      const byLine = h.by ? m.resolve(h.by) : null;
      return (
        <div className="card cited is-addressed" role="status">
          <p>
            <strong>Cited line</strong> <span className="mono small break">{ui.address}</span>
          </p>
          <p className="cited-text">{h.text}</p>
          <p className="small">
            Written in job{" "}
            <a href={jobLink(h.origin.jobId, h.origin.tx)} target="_blank" rel="noopener noreferrer" className="mono">{shortJobId(h.origin.jobId)}</a>
          </p>
          <p>
            Status today: <strong className={h.replaced ? "cited-outdated" : "cited-none"}>{h.replaced ? "Superseded" : "Not on the page shown now"}</strong>
            {h.replaced && (h.by || h.byAddress) && (
              <>
                {" by "}
                {h.by ? <a href={to(lineAnchor(h.by))}>{byLine?.text ?? h.by}</a> : <span className="mono">{h.byAddress}</span>}
              </>
            )}
          </p>
          {h.why && !h.replaced && <p className="small">A later rebuild dropped it: {h.why}</p>}
        </div>
      );
    }
    return (
      <div className="card cited" role="status">
        <p>
          <strong>Cited line {ui.address}</strong>
        </p>
        <p className="small">{m.latest || m.jobs.length ? "This address is not on the record shown now. It may belong to a job this record does not read." : "Reading the record…"}</p>
      </div>
    );
  }
  const st = ctx.settled.by.get(row.line.id);
  const state = st?.state ?? "none";
  const by = state === "proven" ? st!.confirms : state === "contradicted" ? st!.contradicts : state === "outdated" ? st!.outdates : state === "partly" ? st!.partly : [];
  const settler = by.map((t) => ({ t, line: m.resolve(t) }))[0];
  const o = m.origins.get(row.line.id);
  const merged = o && ui.address && addressText(o).toLowerCase() !== ui.address.toLowerCase();
  return (
    <div className="card cited" role="status">
      <p>
        <strong>Cited line</strong> <span className="mono small break">{ui.address}</span>
      </p>
      <p>
        Status today: <strong className={`cited-${state}`}>{CITED_WORDS[state] ?? "Standing"}</strong>
        {settler && (
          <>
            {" by "}
            {settler.line ? <a href={to(lineAnchor(settler.line.id))}>{settler.line.text}</a> : <span className="mono">{settler.t}</span>}
          </>
        )}
      </p>
      {merged && <p className="small">This address was merged into the line below, first written as {addressText(o!)}.</p>}
    </div>
  );
}

export function RecordTab({ m, ui }: { m: RecordModel; ui: Ui }) {
  const { latest, via, sections, counts, page } = m;
  const all = sections.flatMap((s) => s.rows);
  const settled = settleAll(all.map((r) => r.line));
  const ctx: Ctx = {
    settled,
    numbers: new Map(m.sourceList.map((s) => [s.key, s])),
    research: latest ? { payer: payerName(latest), payerAddr: latest.req.payer, href: jobLink(via?.jobId ?? latest.jobId, latest.req.transactionHash), time: latest.doneTime ?? null } : null,
    m,
    ui,
  };
  const { filter } = ui;

  const [query, setQuery] = useState("");
  // Sections start closed. A section the visitor opened or closed keeps that; one holding an opened line, or
  // any section while a search or the settled filter is on, shows open so its matches are visible.
  const [sectionOpen, setSectionOpen] = useState<Record<string, boolean>>({});
  // While a search or the settled filter is on, every section with matches opens; what the visitor toggles then
  // is kept apart and forgotten when the controls change, so clearing them restores the manual state above.
  const [narrowOpen, setNarrowOpen] = useState<{ key: string; open: Record<string, boolean> }>({ key: "", open: {} });
  // A proof a visitor's changes job raised joins the table too, with "raised by <payer>" on its row.
  const factRows = all.filter(isFactRow);
  const facts = new Set(factRows.map((r) => r.line.id));
  // A search or any filter but All opens every section with matches, as the settled checkbox did before.
  const narrowing = query.trim() !== "" || filter !== "all";
  const narrowKey = narrowing ? `${query.trim().toLowerCase()}|${filter}` : "";
  const narrowState = narrowOpen.key === narrowKey ? narrowOpen.open : {};
  // A filter is a settled class as well as a kind: a settled row passes Proven or Contradicted, never Statement or Claim.
  const keep = (r: RecordRow) => passes(filter, rowClass(r.line, settled.by.get(r.line.id))) && rowMatches(r, query);
  const shownFacts = factRows.filter(keep);
  const named = new Set(sections.map((s) => s.section));
  if (factRows.length) named.add("on_chain");
  const order = [...SECTIONS.filter((s) => named.has(s)), ...[...named].filter((s) => !(SECTIONS as readonly string[]).includes(s))];
  const shown = order
    .map((section) => {
      const every = sections.find((s) => s.section === section)?.rows ?? [];
      // Every proof keeps its own row, also when a settled row shows it as its evidence: in the facts table when it
      // has a fact, else here. Proven lists both kinds; each row says which it is.
      const rows = every.filter((r) => !facts.has(r.line.id) && keep(r));
      const table = section === "on_chain" ? shownFacts : [];
      const inSection = [...rows, ...table].map((r) => r.line);
      const hasOpen = inSection.some((l) => ui.openSet.has(l.id));
      const open = narrowing ? narrowState[section] ?? true : sectionOpen[section] ?? hasOpen;
      // The rows shown, counted by the shared rule: every row once.
      return { section, rows, table, counts: countLines(inSection, settled), open };
    })
    .filter((s) => s.rows.length > 0 || s.table.length > 0);
  // A link to one line opens it, and its section, when the tab is reached by that link; a search or the
  // settled filter that would hide it is cleared.
  useEffect(() => {
    if (!ui.target?.startsWith("line-")) return;
    const folded = [...m.alias].find(([id]) => lineAnchor(id) === ui.target);
    if (folded) return ui.openLines([folded[1]]);
    const row = sections.flatMap((s) => s.rows).find((r) => lineAnchor(r.line.id) === ui.target);
    if (!row) return;
    if (!ui.openSet.has(row.line.id)) ui.toggle(row.line.id);
    setQuery("");
    setSectionOpen((s) => Object.fromEntries(Object.entries(s).filter(([, v]) => v)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ui.target, sections]);
  const matched = shown.reduce((n, s) => n + s.rows.length + s.table.length, 0);

  return (
    <section className="tab" aria-labelledby="record-tab-title">
      <h1 id="record-tab-title" tabIndex={-1} className="tab-title">Record</h1>
      {ui.address && <CitedLine ctx={ctx} />}
      {!page && !m.jobs.length ? (
        <div className="card empty">
          <p>No lines yet. Lines appear here once a page job, a sources job or an edit has completed.</p>
          <a className="btn" href={to("contribute")}>Contribute</a>
        </div>
      ) : (
        <>
          {counts.all > 0 && (
            <div className="filter" role="group" aria-label="Show lines">
              {filtersFor(counts).map((f) => (
                <button key={f} type="button" className="btn btn-filter" aria-pressed={filter === f} onClick={() => ui.setFilter(f)}>
                  {f === "all" ? FILTER_WORDS[f] : (
                    <span className={`kind kind-${GROUP_TONE[f]}`}>
                      <span className="dot" aria-hidden="true" />
                      {FILTER_WORDS[f]}
                    </span>
                  )}
                  <span className="count num">{counts[f]}</span>
                </button>
              ))}
            </div>
          )}
          {counts.all > 0 && (
            <div className="record-tools">
              <label htmlFor="record-search" className="sr-only">Search lines by text or speaker</label>
              <input id="record-search" type="search" placeholder="Search lines by text or speaker" autoComplete="off" value={query} onChange={(e) => setQuery(e.target.value)} />
              {narrowing && <p className="small" aria-live="polite">{matched.toLocaleString("en-US")} line{matched === 1 ? "" : "s"} match.</p>}
            </div>
          )}
          {shown.map(({ section, rows, table, counts: c, open }) => (
            <div key={section} className={`card section${open ? " is-open" : ""}`}>
              <h2 className="section-toggle-h">
                <button
                  type="button"
                  className="section-toggle"
                  aria-expanded={open}
                  aria-controls={`sec-${section}`}
                  onClick={() =>
                    narrowing
                      ? setNarrowOpen({ key: narrowKey, open: { ...narrowState, [section]: !open } })
                      : setSectionOpen((s) => ({ ...s, [section]: !open }))
                  }
                >
                  <span className="chev" aria-hidden="true" />
                  <span className="section-name">{SECTION_TITLES[section] ?? section}</span>
                  <span className="section-counts small">{countsWords(c)}</span>
                </button>
              </h2>
              {open && (
                <div id={`sec-${section}`} className="section-body">
                  {table.length > 0 && <FactTable rows={table} ctx={ctx} />}
                  {rows.length > 0 && (
                    <ul className="lines">
                      {rows.map((row) => (
                        <LineRow key={row.line.id || row.line.text} row={row} ctx={ctx} facts={facts} />
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </div>
          ))}
          {counts.all > 0 && shown.length === 0 && <p className="small">{narrowing ? "No lines match." : `No ${FILTER_WORDS[filter].toLowerCase()} lines.`}</p>}
          <p className="add-row small">
            Something missing? <a href={to("suggest-changes")}>Say it in your own words</a>.
          </p>
          <OtherChannels m={m} />
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
        </>
      )}
      {/* Panel answers that lines link to, then Page upkeep: always the last thing on Record. */}
      <PanelAnswers m={m} />
      <PageUpkeep m={m} />
    </section>
  );
}

/** Channels of the subject that the key facts table does not show. */
function OtherChannels({ m }: { m: RecordModel }) {
  const { otherChannels } = useKeyFacts(m);
  const domain = m.page?.domain || m.subject.domain;
  if (!otherChannels.length) return null;
  return (
    <div className="card" id="other-channels">
      <h2>Other channels</h2>
      <ul className="channels">
        {otherChannels.map((c, i) => (
          <li key={i}>
            <ExtLink url={c.url}>{c.label || c.url}</ExtLink>
            <ChannelLabel c={c} domain={domain} />
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ---------- Sources ---------- */

/** A channel's label: Own domain, Verified on chain or Not verified. */
function ChannelLabel({ c, domain }: { c: Channel; domain: string }) {
  const s = channelStatus(c, domain);
  return <span className={`tie tie-${s}`}>{STATUS_WORDS[s]}</span>;
}

export function SourcesTab({ m }: { m: RecordModel }) {
  const { page, via, sourceList: list } = m;
  const domain = page?.domain || m.subject.domain;
  return (
    <section className="tab" aria-labelledby="sources-title">
      <h1 id="sources-title" tabIndex={-1} className="tab-title">Sources</h1>
      {page && page.channels.length > 0 && (
        <div className="channels-block">
          <h2>Channels</h2>
          <ul className="channels">
            {page.channels.map((c, i) => (
              <li key={i}>
                <ExtLink url={c.url}>{c.label || c.url}</ExtLink>
                <ChannelLabel c={c} domain={domain} />
              </li>
            ))}
          </ul>
          <p className="small tie-key">
            {STATUS_HELP.own} {STATUS_HELP.verified} {STATUS_HELP.linked} {STATUS_HELP.unverified} {STATUS_LEGEND}
          </p>
        </div>
      )}
      {list.length > 0 ? (
        <div className="card">
          <h2>Every source, numbered</h2>
          <ol className="sources">
            {list.map((s) => (
              <li key={s.key} id={`source-${s.n}`}>
                <span className="chip mono">{s.n}</span>
                <span className="source-ref">
                  <ExtLink url={s.url}>{s.url || "no address given"}</ExtLink>
                  {s.readVia && <span className="via"> read via {s.readVia}</span>}
                </span>
                <span className="small">
                  {[
                    s.type || "source",
                    s.publisher ? `published by ${s.publisher}` : "",
                    s.readAt ? `read ${readDate(s.readAt)}` : "read at an unknown time",
                    s.couldOpen === false ? "could not open" : "",
                    s.outcome?.kind === "off" ? "not about this subject" : "",
                    s.addedBy ? `added by ${s.addedBy}` : "page job",
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
              </li>
            ))}
          </ol>
          {via && <p className="small">The page file was read through {via.path === "api" ? "api.imd.fun" : "an IPFS gateway"}; its bytes matched the listed SHA-256.</p>}
        </div>
      ) : (
        <div className="card empty">
          <p>No sources yet. They are listed here once a page job or a sources job has completed.</p>
        </div>
      )}
    </section>
  );
}

export type { SourceLine };
