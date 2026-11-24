/**
 * Which jobs count.
 *
 * The site reads a tagged job's result only if its objective is exactly what this site would have written: the
 * template for its kind, naming an instruction file of that kind whose sha256 is one this site published (every file
 * under /instructions/, current and past), at the address the site used when that file was current, with nothing
 * before, after or between the filled-in parts. The parts (subject, earlier results, channels and, for changes, the
 * numbered items) are read back out of the objective, each is written again with the site's own serializer, and the
 * whole text is compared.
 *
 * The filled-in parts are then checked against the other jobs: the subject is the tag's subject; every earlier result
 * listed is the result file of a job that itself counts for the same subject; every channel is the subject's own
 * domain or an account a counted page of the same subject lists (compared as host and path, so two accounts on one
 * service are two channels).
 *
 * Jobs sent before instruction files existed (a page or changes job naming none, or a sources or edit job sent before
 * the first job that names one) count only when a later counted rebuild of the same subject lists their result among
 * its earlier results.
 *
 * Everything here is pure. `shapeOf` needs only the request, so the site checks it before reading any result bytes
 * (src/useActivity.ts); `countedOf` needs the result hashes and pages of the jobs that passed.
 */
import { EDIT_TEMPLATE, fillTemplate, leadsText, priorText, readLeads, REBUILD_TEMPLATE, REBUILD_TEMPLATE_V1, RESEARCH_OBJECTIVE, sourceObjective, RECONSIDER_MARK, type ChannelTie, type Prior } from "./bodies";
import { hasV1Opening } from "./openings";
import { CHANGES_TEMPLATE, CHANGES_TEMPLATE_V1, itemsText, parseItemsText, type Change } from "./changes";
import { INSTRUCTIONS_FALLBACK_GATEWAY, INSTRUCTIONS_GATEWAY } from "./config";
import published from "./instructions.published.json";
import { fetchUrlOf, instructionsOf } from "./instructions";
import { sameSite } from "./psl";
import { canonicalId, describeSubject, domainOfId, refFromId } from "./subject";

/** The rule a result that is not read failed, in plain words (Activity shows "Not read: <why>"). */
export const WHY = {
  template: "its objective differs from this record's template",
  subject: "its subject differs from its tag",
  prior: (n: number) => `earlier result F${n} is not from a job that counts`,
  channel: (url: string) => `channel ${url} is not listed by an earlier page`,
  unnamed: "it names no instruction file and was sent after instruction files existed",
  unadopted: "it was sent before instruction files existed and no later counted page lists its result",
} as const;
export const notReadText = (why: string) => `Not read: ${why}`;
/** The generic reason, for a result judged without its rule (kept for older callers). */
export const NOT_READ = notReadText(WHY.template);

/** Every instruction file this site has published, current and past. */
export const PUBLISHED_INSTRUCTIONS: { file: string; sha256: string }[] = published;
const BY_HASH = new Map(PUBLISHED_INSTRUCTIONS.map((p) => [p.sha256, p] as const));
export const publishedFile = (sha256: string) => BY_HASH.get(sha256) ?? null;

/**
 * How the objective named each file while it was current. The first files were named by one address on this site
 * (2026-11-20 22:26), then by one address on the dweb.link IPNS gateway (23:01), then by one content address on
 * filebase (2026-11-21 01:36); from 2026-11-21 23:01 every file is named at filebase "or, if that fails," at pinata.
 */
type Era = "site" | "dweb" | "filebase" | "two";
const ERAS: Record<string, Era> = {
  "rebuild-b280294bd61b.txt": "site",
  "changes-8400e6bf9d85.txt": "site",
  "rebuild-aede2eb36737.txt": "dweb",
  "changes-b1e42e455312.txt": "dweb",
  "rebuild-8d7dfbc27d07.txt": "filebase",
  "changes-0571b29e932d.txt": "filebase",
  "rebuild-ede1a5e23b01.txt": "filebase",
  "changes-053f706852a0.txt": "filebase",
};
const SITE_ADDR = "https://record-test-1.identitymd.eth.limo/instructions/";
const DWEB_ADDR = "https://record--test--1-identitymd-eth.ipns.dweb.link/instructions/";
const FALLBACK_CLAUSE = " or, if that fails, at <FALLBACK>";

/**
 * The template a published file was sent with, filled with its addresses and hash, in the form the site used while
 * it was current; null for an unknown hash. See templatesFor for every form a file was ever named in.
 */
export function templateFor(kind: "add" | "changes", sha256: string): string | null {
  return templatesFor(kind, sha256)[0] ?? null;
}

/**
 * Every objective template a published file may have been sent with: a file stayed current across a change of
 * address (rebuild-aede2eb36737.txt was named at dweb.link and then at filebase), so each published hash is replayed
 * in every address form the site has emitted: this site, dweb.link, filebase alone, and filebase "or, if that fails,"
 * pinata. Its own era's form comes first. Empty for an unknown hash or a file of the other kind.
 */
export function templatesFor(kind: "add" | "changes", sha256: string): string[] {
  const p = publishedFile(sha256);
  if (!p || !p.file.startsWith(kind === "add" ? "rebuild-" : "changes-")) return [];
  const filebase = fetchUrlOf(p.file, p.sha256, INSTRUCTIONS_GATEWAY);
  const fallback = fetchUrlOf(p.file, p.sha256, INSTRUCTIONS_FALLBACK_GATEWAY);
  // A file published since the Swarmpedia name: the current openings, named at filebase "or, if that fails," pinata.
  if (!hasV1Opening(p.sha256)) return [fillTemplate(kind === "add" ? REBUILD_TEMPLATE : CHANGES_TEMPLATE, { URL: filebase, FALLBACK: fallback, HASH: p.sha256 })];
  const base = kind === "add" ? REBUILD_TEMPLATE_V1 : CHANGES_TEMPLATE_V1;
  const era = ERAS[p.file] ?? "two";
  const forms: [Era, string][] = [["site", SITE_ADDR + p.file], ["dweb", DWEB_ADDR + p.file], ["filebase", filebase], ["two", filebase]];
  forms.sort((a, b) => Number(b[0] === era) - Number(a[0] === era));
  const out = forms.map(([e, url]) => fillTemplate(e === "two" ? base : base.replace(FALLBACK_CLAUSE, ""), { URL: url, FALLBACK: fetchUrlOf(p.file, p.sha256, INSTRUCTIONS_FALLBACK_GATEWAY), HASH: p.sha256 }));
  return out.filter((t, i) => out.indexOf(t) === i);
}

/* ---------- The filled-in parts, read back and written again ---------- */

const ARTIFACT = /^https:\/\/api\.imd\.fun\/artifacts\/([0-9a-f]{64})$/;
const ANSWER = /^([\s\S]+) = ([\s\S]+), (\d+|\?) of (\d+|\?), (\S+)$/;

/** A <PRIOR> text read back: plain files, files to reconsider, panel answers; null when it is not priorText's shape. */
export function readPrior(text: string): (Prior & { hashes: string[] }) | null {
  if (text === "none") return { files: [], reconsider: [], answers: [], hashes: [] };
  const parts = text.split(/; (?=\[[FA]\d+\] )/);
  const files: string[] = [];
  const reconsider: string[] = [];
  const ordered: string[] = [];
  const answers: Prior["answers"] = [];
  let f = 0;
  let a = 0;
  for (const part of parts) {
    const m = /^\[(F|A)(\d+)\] ([\s\S]*)$/.exec(part);
    if (!m) return null;
    if (m[1] === "F") {
      if (a > 0 || Number(m[2]) !== ++f) return null;
      const mark = ` (${RECONSIDER_MARK})`;
      const re = m[3]!.endsWith(mark);
      const url = re ? m[3]!.slice(0, -mark.length) : m[3]!;
      if (!ARTIFACT.test(url)) return null;
      (re ? reconsider : files).push(url);
      ordered.push(url);
    } else {
      if (Number(m[2]) !== ++a) return null;
      const x = ANSWER.exec(m[3]!);
      if (!x) return null;
      answers.push({ title: x[1]!, answer: x[2]!, agreed: x[3] === "?" ? null : Number(x[3]), size: x[4] === "?" ? null : Number(x[4]), url: x[5]! });
    }
  }
  // In the order the objective numbers them (F1, F2, …), so a failed earlier result can be named by its number.
  return { files, reconsider, answers, hashes: ordered.map((u) => ARTIFACT.exec(u)![1]!) };
}

/** A channels list as channelList writes it. */
const CHANNEL = /^(https:\/\/[^\s,]+) \(tie: (strong|linked|weak|none)\)$/;
export function parseChannels(text: string): { list: ChannelTie[]; more: number } | null {
  if (text === "none known") return { list: [], more: 0 };
  const more = /(?:^|, and )(\d+) more listed in the page shown \(F1\)$/.exec(text);
  const body = more ? text.slice(0, more.index) : text;
  const list: ChannelTie[] = [];
  if (body)
    for (const part of body.split(", ")) {
      const m = CHANNEL.exec(part);
      if (!m) return null;
      list.push({ url: m[1]!, tie: m[2] as ChannelTie["tie"] });
    }
  return { list, more: Number(more?.[1] ?? 0) };
}
const channelText = (c: { list: ChannelTie[]; more: number }) => {
  const listed = c.list.map((x) => `${x.url} (tie: ${x.tie})`).join(", ");
  if (!c.more) return listed || "none known";
  return `${listed ? `${listed}, and ` : ""}${c.more} more listed in the page shown (F1)`;
};

/** An <ITEMS> text read back into changes and written again with the site's own serializer (itemsText). */
export function readItems(text: string, files: number): Change[] | null {
  const items = parseItemsText(text);
  if (!items.length) return null;
  const changes: Change[] = [];
  for (const [i, it] of items.entries()) {
    if (it.n !== i + 1) return null;
    const refs = it.ref ? it.ref.split(",") : [];
    // A reference names a line of a file the objective lists.
    if (refs.some((r) => { const m = /^F(\d+):\S+$/.exec(r); return !m || Number(m[1]) < 1 || Number(m[1]) > files; })) return null;
    const target: Change["target"] =
      it.targetKind === "none" ? { kind: "none", key: "", lineId: "", text: "" }
      : it.targetKind === "sentence" ? { kind: "sentence", key: "", lineId: "", text: it.text }
      : it.targetKind === "keyfact" ? { kind: "keyfact", key: "", lineId: refs[0] ?? "", lineIds: refs, text: it.text }
      : { kind: "line", key: "", lineId: refs[0] ?? "", text: it.text };
    if (it.targetKind === "line" && refs.length > 1) return null;
    changes.push({ id: String(i), type: it.type, target, note: it.note, links: it.links, ...(it.suggest ? { suggest: it.suggest } : {}) });
  }
  return itemsText(changes, (id) => id) === text ? changes : null;
}

/** True when an objective's subject text names the tag's subject (its domain, with or without a main contract). */
export function subjectMatches(text: string, id: string): boolean {
  if (!id) return false;
  const ref = refFromId(id);
  if (!ref.domain) return text.toLowerCase() === describeSubject(ref).toLowerCase();
  if (text === describeSubject(ref)) return true;
  const m = /^the project at (\S+), whose main contract is (0x[0-9a-fA-F]{40}) on chain (\d{1,12})$/.exec(text);
  return !!m && m[1] === ref.domain;
}

/**
 * The ids an objective's subject text may name: the scan's subject and the tag's subject as it was sent. A subject
 * added as a subdomain (the tag and objective say app.uniswap.org) is listed under its registrable domain
 * (uniswap.org); the objective is compared with the tag it was sent with, and grouped under the canonical subject.
 */
export function tagSubjectsOf(req: { subject: string; bodyJson: Record<string, unknown> | null }): string[] {
  const tag = req.bodyJson?.tag as { subject?: unknown } | undefined;
  const raw = tag && typeof tag === "object" ? (tag.subject && typeof tag.subject === "object" ? (tag.subject as { subject?: unknown }).subject : tag.subject) : undefined;
  // The objective names the subject exactly as the tag does: a tag saying app.uniswap.org needs an objective saying
  // app.uniswap.org (never uniswap.org), in every address form a published file is replayed in.
  if (typeof raw === "string" && raw && raw !== req.subject && canonicalId(raw) === req.subject) return [raw];
  return [req.subject];
}
const subjectOk = (text: string, req: { subject: string; bodyJson: Record<string, unknown> | null }) => tagSubjectsOf(req).some((id) => subjectMatches(text, id));

/* ---------- One request alone ---------- */

export type Shape =
  | { ok: true; kind: CountKind; priorHashes: string[]; channels: string[]; named: boolean }
  | { ok: false; legacy: boolean; why: string };

export type CountKind = "add" | "changes" | "source" | "edit";
const KINDS = new Set(["add", "changes", "source", "edit"]);
const NO: Shape = { ok: false, legacy: false, why: WHY.template };
const BADSUBJECT: Shape = { ok: false, legacy: false, why: WHY.subject };
const LEGACY: Shape = { ok: false, legacy: true, why: WHY.unadopted };

/** Every index of `needle` in `hay`. */
const indexes = (hay: string, needle: string) => {
  const out: number[] = [];
  for (let i = hay.indexOf(needle); i >= 0; i = hay.indexOf(needle, i + 1)) out.push(i);
  return out;
};

/**
 * What a tagged request's objective is, from the request alone: a shape this site writes (with the parts to check
 * against other jobs), an older objective that counts only when a later counted rebuild adopts its result, or neither.
 */
export function shapeOf(req: { subject: string; kind: string; bodyJson: Record<string, unknown> | null }): Shape {
  const o = req.bodyJson?.objective;
  if (typeof o !== "string" || !o || !KINDS.has(req.kind)) return NO;
  const kind = req.kind as CountKind;
  if (kind === "add" || kind === "changes") {
    const named = instructionsOf(o);
    // Sent before instruction files: the first research objective, or an older full template (rule 4).
    if (!named) return o === RESEARCH_OBJECTIVE || o.startsWith(kind === "add" ? "Write the record page for one subject: " : "A visitor proposes changes to the record of ") ? LEGACY : NO;
    const ts = templatesFor(kind, named.sha256);
    if (!ts.length) return NO;
    if (!hasV1Opening(named.sha256)) return shapeOfCurrent(req, kind, o, ts[0]!);
    const lead = kind === "add" ? "Write the record page for one subject: " : "Judge a visitor's proposed changes to the record of one subject: ";
    const after = ". Your full instructions are the file at ";
    if (!o.startsWith(lead)) return NO;
    const subject = o.slice(lead.length, o.indexOf(after));
    if (!subjectOk(subject, req)) return BADSUBJECT;
    for (const t of ts) {
      const r = shapeWith(t, o, kind, { SUBJECT: subject });
      if (r) return r;
    }
    return NO;
  }
  return shapeOfOther(req, kind, o);
}

/** "<Write|Rebuild> the Swarmpedia page for <id>. " or "Check changes to the Swarmpedia page for <id>. ", then the main contract when known. */
const CURRENT_LEAD = {
  add: /^(Write|Rebuild) the Swarmpedia page for (\S+?)\. (Its main contract is 0x[0-9a-fA-F]{40} on chain \d{1,12}\. )?Your full instructions are the file at /,
  changes: /^(Check changes to) the Swarmpedia page for (\S+?)\. (Its main contract is 0x[0-9a-fA-F]{40} on chain \d{1,12}\. )?Your full instructions are the file at /,
} as const;

/**
 * An objective naming an instruction file published since the Swarmpedia name: its opening, the subject id (exactly
 * the tag's subject as it was sent) and an optional main contract sentence (only for a domain subject), then the
 * whole text compared as for the older files.
 */
function shapeOfCurrent(req: { subject: string; bodyJson: Record<string, unknown> | null }, kind: "add" | "changes", o: string, t: string): Shape {
  const m = CURRENT_LEAD[kind].exec(o);
  if (!m) return NO;
  const id = m[2]!;
  if (!tagSubjectsOf(req).includes(id)) return BADSUBJECT;
  if (m[3] && !refFromId(id).domain) return NO;
  return shapeWith(t, o, kind, { ...(kind === "add" ? { ACTION: m[1]! } : {}), SUBJECT: id, MAIN: m[3] ?? "" }) ?? NO;
}

/** A named objective compared with one template form: the parts read back, written again and the whole text compared. */
function shapeWith(t: string, o: string, kind: "add" | "changes", fills: Record<string, string>): Shape | null {
  {
    const t1 = fillTemplate(t, fills);
    // Only the current page template has a leads slot: "Earlier results: <PRIOR>. Leads to read first: <links>."
    const hasLeads = t1.includes("<LEADS>");
    const head = t1.slice(0, t1.indexOf("<PRIOR>"));
    if (!o.startsWith(head)) return null;
    const rest = o.slice(head.length);
    const CH = ". Channels already known: ";
    const IT = ". The changes: ";
    const LE = ". Leads to read first: ";
    for (const p of indexes(rest, CH)) {
      let priorPart = rest.slice(0, p);
      let leads = "";
      if (hasLeads) {
        const l = priorPart.indexOf(LE);
        if (l >= 0) {
          const list = readLeads(priorPart.slice(l + LE.length));
          if (!list) continue;
          leads = leadsText(list);
          priorPart = priorPart.slice(0, l);
        }
      }
      const prior = readPrior(priorPart);
      if (!prior) continue;
      if (kind === "changes" && prior.reconsider?.length) continue;
      const tail = rest.slice(p + CH.length);
      const splits: [string, string][] = kind === "add" ? (tail.endsWith(".") ? [[tail.slice(0, -1), ""]] : []) : indexes(tail, IT).map((q) => [tail.slice(0, q), tail.slice(q + IT.length)]);
      for (const [chText, itText] of splits) {
        const channels = parseChannels(chText);
        if (!channels) continue;
        const values: Record<string, string> = { PRIOR: priorText(prior), CHANNELS: channelText(channels), ...(hasLeads ? { LEADS: leads } : {}) };
        if (kind === "changes") {
          if (!itText.endsWith(".") || !readItems(itText.slice(0, -1), prior.files.length)) continue;
          values.ITEMS = itText.slice(0, -1);
        }
        if (fillTemplate(t1, values) === o) return { ok: true, kind, priorHashes: prior.hashes, channels: channels.list.map((c) => c.url), named: true };
      }
    }
    return null;
  }
}

function shapeOfOther(req: { subject: string; kind: string; bodyJson: Record<string, unknown> | null }, kind: CountKind, o: string): Shape {
  if (kind === "source") {
    const a = "Read each source below and report what it says about ";
    const b = ". The subject description comes from a visitor";
    if (!o.startsWith(a) || o.indexOf(b) < 0) return NO;
    const subject = o.slice(a.length, o.indexOf(b));
    if (!subjectOk(subject, req)) return BADSUBJECT;
    const urls = between(o, ". Sources: ", ". Output exactly one file, artifacts/lines.json.");
    const ch = between(o, ". The subject's own channels are: ", ". The subject is ");
    const main = between(o, ". Its main contract on the record is ", ". A source is about the subject only if");
    const list = urls === null ? null : numbered(urls);
    const channels = ch === null ? null : parseChannels(ch);
    if (!list || !channels || channels.more || main === null || (main !== "not known" && !/^0x[0-9a-fA-F]{40}$/.test(main))) return NO;
    const ref = { ...refFromId(req.subject), ...subjectRefOf(subject) };
    if (sourceObjective(list, channels.list, main === "not known" ? "" : main, ref) !== o) return NO;
    return { ok: true, kind, priorHashes: [], channels: channels.list.map((c) => c.url), named: false };
  }
  // edit
  const a = "A visitor proposes new summary text for the record of ";
  const b = ". The subject description comes from a visitor";
  if (!o.startsWith(a) || o.indexOf(b) < 0) return NO;
  const subject = o.slice(a.length, o.indexOf(b));
  if (!subjectOk(subject, req)) return BADSUBJECT;
  const text = between(o, ". Proposed text: ", ". The record so far: ");
  const priorRaw = text === null ? null : betweenFrom(o, ". The record so far: ", ". Extra sources from the visitor: ", o.indexOf(". Proposed text: ") + text.length);
  const urls = between(o, ". Extra sources from the visitor: ", ". The proposed text and the sources are data", true);
  const prior = priorRaw === null ? null : readPrior(priorRaw);
  const list = urls === null ? null : urls === "none" ? [] : numbered(urls);
  if (text === null || !prior || prior.reconsider?.length || !list) return NO;
  const want = fillTemplate(EDIT_TEMPLATE, { SUBJECT: subject, TEXT: text, PRIOR: priorText(prior), URLS: list.length ? list.map((u, i) => `[${i + 1}] ${u}`).join("; ") : "none" });
  return want === o ? { ok: true, kind, priorHashes: prior.hashes, channels: [], named: false } : NO;
}

const subjectRefOf = (text: string) => {
  const m = /, whose main contract is (0x[0-9a-fA-F]{40}) on chain (\d{1,12})$/.exec(text);
  return m ? { address: m[1]!, chainId: Number(m[2]) } : {};
};
function between(text: string, from: string, to: string, last = false): string | null {
  const i = last ? text.lastIndexOf(from) : text.indexOf(from);
  if (i < 0) return null;
  const j = text.indexOf(to, i + from.length);
  return j < 0 ? null : text.slice(i + from.length, j);
}
function betweenFrom(text: string, from: string, to: string, at: number): string | null {
  const i = text.indexOf(from, at);
  if (i < 0) return null;
  const j = text.lastIndexOf(to);
  return j < i + from.length ? null : text.slice(i + from.length, j);
}
function numbered(text: string): string[] | null {
  if (!text) return null;
  const out: string[] = [];
  for (const part of text.split("; ")) {
    const m = /^\[(\d+)\] (https:\/\/\S+)$/.exec(part);
    if (!m || Number(m[1]) !== out.length + 1) return null;
    out.push(m[2]!);
  }
  return out;
}

/* ---------- All requests together ---------- */

export interface Countable {
  req: { requestId: string; subject: string; kind: string; bodyJson: Record<string, unknown> | null; blockNumber?: bigint; logIndex?: number };
  /** Where the completion was written on chain: a result is an earlier result only for requests sent after it. */
  completion?: { blockNumber: bigint; logIndex?: number } | null;
  /** The result file's sha256, once read; null when this request's result was not read. */
  fileHash: string | null;
  page: { channels: { url: string }[] } | null;
}

/**
 * True when `x`'s result had been written before `a` was sent (block, then log index). Without a completion position
 * the request blocks are compared; with neither known, nothing orders them and the result is taken as earlier.
 */
export function doneBefore(x: Countable, a: Countable): boolean {
  const sent = a.req.blockNumber;
  if (sent === undefined) return true;
  const c = x.completion;
  if (c && c.blockNumber !== undefined) {
    if (c.blockNumber !== sent) return c.blockNumber < sent;
    // Same block: earlier only when the completion's log comes before the request's. When either position is
    // unknown nothing shows it came first, so it is not an earlier result.
    return c.logIndex !== undefined && a.req.logIndex !== undefined && c.logIndex < a.req.logIndex;
  }
  return x.req.blockNumber === undefined || x.req.blockNumber < sent;
}

/** The first block at which a request named a published instruction file, or null when none did. */
export function firstNamedBlock(reqs: { subject: string; kind: string; bodyJson: Record<string, unknown> | null; blockNumber?: bigint }[]): bigint | null {
  let first: bigint | null = null;
  for (const r of reqs) {
    if (r.blockNumber === undefined || (first !== null && r.blockNumber >= first) || !KINDS.has(r.kind)) continue;
    const s = shapeOf(r);
    if (s.ok && s.named) first = r.blockNumber;
  }
  return first;
}

/** A channel compared as host (without www.) and path (without a trailing slash), case-insensitive. */
export function channelKey(url: string): string {
  try {
    const u = new URL(url);
    return `${u.hostname.toLowerCase().replace(/^www\./, "")}${u.pathname.replace(/\/+$/, "").toLowerCase()}`;
  } catch {
    return "";
  }
}
const hostOf = (url: string) => {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return "";
  }
};

/**
 * Every completed result that counts. A request whose result was not read is judged on its shape and on the jobs
 * read so far; its page is read in full, and judged again, before it is shown.
 */
export function countedOf(items: Countable[], opts: { firstNamed?: bigint | null } = {}): { counted: Set<string>; reasons: Map<string, string> } {
  const results = items.filter((a) => KINDS.has(a.req.kind));
  const shapes = new Map(results.map((a) => [a.req.requestId, shapeOf(a.req)] as const));
  const ok = new Set(results.filter((a) => shapes.get(a.req.requestId)!.ok).map((a) => a.req.requestId));
  // The first block at which a job named an instruction file (over every request the scan found when the caller
  // passes it): jobs naming none count as older jobs only when sent before it.
  const firstNamed = opts.firstNamed !== undefined ? opts.firstNamed : firstNamedBlock(results.map((a) => a.req));
  const sentBefore = (a: Countable) => a.req.blockNumber === undefined || firstNamed === null || a.req.blockNumber < firstNamed;
  const legacy = new Set(results.filter((a) => { const s = shapes.get(a.req.requestId)!; return !s.ok && s.legacy && sentBefore(a); }).map((a) => a.req.requestId));
  const why = new Map<string, string>();
  for (const a of results) {
    const s = shapes.get(a.req.requestId)!;
    if (!s.ok) why.set(a.req.requestId, s.legacy && !sentBefore(a) ? WHY.unnamed : s.why);
    // A sources or edit job names no instruction file: before the first job that named one it is an older job (a
    // later counted rebuild may adopt it); sent after, it is not read.
    if (s.ok && !s.named) {
      ok.delete(a.req.requestId);
      if (sentBefore(a)) legacy.add(a.req.requestId);
      else why.set(a.req.requestId, WHY.unnamed);
    }
  }
  const byId = new Map(results.map((a) => [a.req.requestId, a] as const));
  // Whether any result of a subject was read: a light read (home list) cannot check references either way.
  const readFor = new Map<string, boolean>();
  for (const r of results) if (r.fileHash) readFor.set(r.req.subject, true);
  const adopted = new Set<string>();

  // An earlier result: the file of a job of the same subject, written before this request was sent.
  const holders = (a: Countable, hash: string, pool: (id: string) => boolean) => results.filter((x) => x !== a && x.fileHash === hash && x.req.subject === a.req.subject && pool(x.req.requestId) && doneBefore(x, a));
  let changed = true;
  while (changed) {
    changed = false;
    // Rule 4: an older job counts once a counted rebuild of the same subject, sent after its result, lists it.
    adopted.clear();
    for (const id of legacy) {
      const a = byId.get(id)!;
      if (!a.fileHash) continue;
      const by = results.some((r) => {
        const s = shapes.get(r.req.requestId)!;
        return r !== a && ok.has(r.req.requestId) && r.req.kind === "add" && r.req.subject === a.req.subject && s.ok && s.priorHashes.includes(a.fileHash!) && doneBefore(a, r);
      });
      if (by) adopted.add(id);
    }
    const counts = (id: string) => ok.has(id) || adopted.has(id);
    for (const id of [...ok]) {
      const a = byId.get(id)!;
      const s = shapes.get(id)! as Extract<Shape, { ok: true }>;
      // Every earlier result is the file of a job that counts for the same subject (or that this rebuild adopts).
      const anyRead = readFor.get(a.req.subject) ?? false;
      const badPrior = !anyRead ? -1 : s.priorHashes.findIndex((h) => holders(a, h, (x) => counts(x) || (s.kind === "add" && legacy.has(x))).length === 0);
      const priorsOk = badPrior < 0;
      const own = domainOfId(a.req.subject);
      // Accounts a counted page of the subject listed before this request was sent: never the page being checked.
      // A rebuild may also rely on an older page it lists among its earlier results (it adopts it, rule 4).
      const earlier = results.filter((x) => x !== a && (counts(x.req.requestId) || (s.kind === "add" && legacy.has(x.req.requestId) && !!x.fileHash && s.priorHashes.includes(x.fileHash))) && x.req.kind === "add" && x.req.subject === a.req.subject && doneBefore(x, a));
      const listed = new Set(earlier.flatMap((p) => (p.page?.channels ?? []).map((c) => channelKey(c.url))).filter(Boolean));
      // An older page this rebuild adopts, whose file is not read yet: it is read only once something counts it, so
      // the channel rule waits for it instead of refusing the rebuild that adopts it (settleReads reads it and judges
      // again). Without this, the first named rebuild of imd.fun and the older pages it adopts never counted.
      const unreadEarlier = earlier.some((x) => legacy.has(x.req.requestId) && !!x.fileHash && !x.page);
      const pagesRead = results.some((x) => x.req.subject === a.req.subject && x.req.kind === "add" && x.fileHash);
      const badChannel = s.channels.find((u) => {
        const h = hostOf(u);
        if (own && h && sameSite(h, own)) return false;
        // Before any page of the subject is read there is nothing to compare an account with yet.
        if (!anyRead || !pagesRead || unreadEarlier) return false;
        return !listed.has(channelKey(u));
      });
      if (!priorsOk || badChannel !== undefined) {
        why.set(id, !priorsOk ? WHY.prior(badPrior + 1) : WHY.channel(badChannel!));
        ok.delete(id);
        changed = true;
      }
    }
  }
  const counted = new Set([...ok, ...adopted]);
  const reasons = new Map<string, string>();
  for (const a of results) if (!counted.has(a.req.requestId)) reasons.set(a.req.requestId, notReadText(why.get(a.req.requestId) ?? WHY.unadopted));
  return { counted, reasons };
}
