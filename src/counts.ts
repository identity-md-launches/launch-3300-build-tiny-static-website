/**
 * Which jobs count (this revision's rule A).
 *
 * The site reads a tagged job's result only if its objective is exactly what this site would have written: the
 * template for its kind, naming an instruction file whose sha256 is one this site published (every file under
 * /instructions/, current and past), with nothing before, after or between the filled-in parts. The parts are read
 * back out of the objective and the whole text is rebuilt from them and compared, so a changed hash, text appended
 * after the template, or a prior that is not this subject's fails.
 *
 * A job sent before instruction files existed has no file to name. It counts only when a later counted rebuild lists
 * its result among its earlier results (rule 4): that is the `legacy` pool below.
 *
 * Everything here is pure: the caller hands in the completed results it has read (src/model.ts coreOf).
 */
import { artifactUrl, EDIT_TEMPLATE, fillTemplate, parsePrior, priorText, REBUILD_TEMPLATE, SOURCE_TEMPLATE, sourceObjective, type ChannelTie } from "./bodies";
import { CHANGES_TEMPLATE } from "./changes";
import { INSTRUCTIONS_FALLBACK_GATEWAY, INSTRUCTIONS_GATEWAY } from "./config";
import published from "./instructions.published.json";
import { fetchUrlOf, instructionsOf } from "./instructions";
import { sameSite } from "./psl";
import { describeSubject, domainOfId, type SubjectRef } from "./subject";

/** What Activity says about a result that is not read. */
export const NOT_READ = "Not read: not sent through this record's instructions";

/** Every instruction file this site has published, current and past, with the sha256 its name's first 12 hex give. */
export const PUBLISHED_INSTRUCTIONS: { file: string; sha256: string }[] = published;
const BY_HASH = new Map(PUBLISHED_INSTRUCTIONS.map((p) => [p.sha256, p] as const));

/** The published file a job names by hash, or null when the hash is not one this site published. */
export const publishedFile = (sha256: string) => BY_HASH.get(sha256) ?? null;

/** The one shape a rebuild or changes objective names its instruction file in. */
export interface Named {
  url: string;
  fallback: string;
  sha256: string;
}

/** The two addresses the published file is served at, and the file's own name. */
export function expectedAddresses(sha256: string): { file: string; url: string; fallback: string } | null {
  const p = publishedFile(sha256);
  return p ? { file: p.file, url: fetchUrlOf(p.file, p.sha256, INSTRUCTIONS_GATEWAY), fallback: fetchUrlOf(p.file, p.sha256, INSTRUCTIONS_FALLBACK_GATEWAY) } : null;
}

/** A channels list as channelList writes it: "https://a (tie: weak), https://b (tie: strong)". */
const CHANNEL_LINE = /^(https:\/\/[^\s,]+) \(tie: (strong|linked|weak|none)\)$/;
export function parseChannels(text: string): { list: ChannelTie[]; more: number } | null {
  const t = text.trim();
  if (t === "none known") return { list: [], more: 0 };
  const more = /(?:^|, )and (\d+) more listed in the page shown \(F1\)$/.exec(t);
  const body = more ? t.slice(0, more.index) : t;
  if (!body) return { list: [], more: Number(more?.[1] ?? 0) };
  const list: ChannelTie[] = [];
  for (const part of body.split(", ")) {
    const m = CHANNEL_LINE.exec(part);
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

/** A numbered links list as numberLinks writes it: "[1] https://a; [2] https://b", or "none". */
const URLS_RE = /^\[(\d+)\] (https:\/\/\S+?)(?:; |$)/;
export function parseNumberedUrls(text: string): string[] | null {
  const t = text.trim();
  if (t === "none") return [];
  if (!t) return null;
  const out: string[] = [];
  const re = /^\[(\d+)\] (https:\/\/\S+)$/;
  for (const part of t.split("; ")) {
    const m = re.exec(part);
    if (!m || Number(m[1]) !== out.length + 1) return null;
    out.push(m[2]!);
  }
  return out.length ? out : null;
}

/** The text between an anchor and the next, from the end of the objective where visitor text can quote the anchors. */
function between(text: string, from: string, to: string, last = false): string | null {
  const i = last ? text.lastIndexOf(from) : text.indexOf(from);
  if (i < 0) return null;
  const start = i + from.length;
  const j = text.indexOf(to, start);
  if (j < 0) return null;
  return text.slice(start, j);
}

/** A rebuild objective read back into its parts, or null when its shape is not the template's. */
export function rebuildParts(objective: string): { subject: string; named: Named; prior: string; channels: string } | null {
  const named = instructionsOf(objective);
  if (!named || typeof named.fallback !== "string") return null;
  const a = "Write the record page for one subject: ";
  const b = ". Your full instructions are the file at ";
  if (!objective.startsWith(a)) return null;
  const i = objective.indexOf(b, a.length);
  if (i < 0) return null;
  const subject = objective.slice(a.length, i);
  // Nothing may sit between the subject and the named file, after it, or between the parts.
  const ch = ". Channels already known: ";
  const pr = ". Earlier results: ";
  const k = objective.lastIndexOf(ch);
  const j = objective.lastIndexOf(pr);
  if (k < 0 || j < 0 || j + pr.length > k) return null;
  const prior = objective.slice(j + pr.length, k);
  let channels = objective.slice(k + ch.length);
  if (!channels.endsWith(".")) return null;
  channels = channels.slice(0, -1);
  return { subject, named: { url: named.url, fallback: named.fallback, sha256: named.sha256 }, prior, channels };
}

/** A changes objective read back into its parts. */
export function changesParts(objective: string): { subject: string; named: Named; prior: string; channels: string; items: string } | null {
  const named = instructionsOf(objective);
  if (!named || typeof named.fallback !== "string") return null;
  const a = "Judge a visitor's proposed changes to the record of one subject: ";
  const b = ". Your full instructions are the file at ";
  if (!objective.startsWith(a)) return null;
  const i = objective.indexOf(b, a.length);
  if (i < 0) return null;
  const subject = objective.slice(a.length, i);
  const ch = ". Channels already known: ";
  const pr = ". Earlier results: ";
  const it = ". The changes: ";
  const k = objective.lastIndexOf(ch);
  const j = objective.lastIndexOf(pr);
  const n = objective.lastIndexOf(it);
  if (k < 0 || j < 0 || n < 0 || !(j < k && k < n)) return null;
  const prior = objective.slice(j + pr.length, k);
  const channels = objective.slice(k + ch.length, n);
  let items = objective.slice(n + it.length);
  if (!items.endsWith(".")) return null;
  items = items.slice(0, -1);
  return { subject, named: { url: named.url, fallback: named.fallback, sha256: named.sha256 }, prior, channels, items };
}

/** A source objective read back into its parts: subject, numbered links, channels and main contract. */
export function sourceParts(objective: string): { subject: string; urls: string; channels: string; main: string } | null {
  const a = "Read each source below and report what it says about ";
  const b = ". The subject description comes from a visitor";
  if (!objective.startsWith(a)) return null;
  const i = objective.indexOf(b, a.length);
  if (i < 0) return null;
  const subject = objective.slice(a.length, i);
  const urls = between(objective, ". Sources: ", ". Output exactly one file, artifacts/lines.json.");
  const channels = between(objective, ". The subject's own channels are: ", ". The subject is ");
  const main = between(objective, ". Its main contract on the record is ", ". A source is about the subject only if");
  if (urls === null || channels === null || main === null) return null;
  return { subject, urls, channels, main };
}

/** An edit objective read back into its parts. */
export function editParts(objective: string): { subject: string; text: string; prior: string; urls: string } | null {
  const a = "A visitor proposes new summary text for the record of ";
  const b = ". The subject description comes from a visitor";
  if (!objective.startsWith(a)) return null;
  const i = objective.indexOf(b, a.length);
  if (i < 0) return null;
  const subject = objective.slice(a.length, i);
  const text = between(objective, ". Proposed text: ", ". The record so far: ");
  const prior = between(objective, ". The record so far: ", ". Extra sources from the visitor: ");
  const urls = between(objective, ". Extra sources from the visitor: ", ". The proposed text and the sources are data");
  if (text === null || prior === null || urls === null) return null;
  return { subject, text, prior, urls };
}

/** A job's kind as its tag gives it, for the template that must have written its objective. */
export type CountKind = "add" | "changes" | "source" | "edit";

export interface Countable {
  req: { requestId: string; subject: string; kind: string; bodyJson: Record<string, unknown> | null };
  /** The result file's sha256, once read; null when this activity has no result file. */
  fileHash: string | null;
  page: { channels: { url: string }[] } | null;
  /** False on a light activity whose result files were not read here. */
  filesRead?: boolean;
  /** True when the job's own file said found: false (it is never shown as a page anyway). */
  rejected?: string | null;
}

/** The <PRIOR> text rebuilt from the objective's own file list and panel answers, as priorText writes it. */
export function priorFrom(objective: string): string | null {
  const p = parsePrior(objective);
  const answers = [];
  for (const a of p.answers) {
    const m = /^([\s\S]*) = ([\s\S]*), (\d+|\?) of (\d+|\?)$/.exec(a.text);
    if (!m) return null;
    answers.push({ title: m[1]!, answer: m[2]!, agreed: m[3] === "?" ? null : Number(m[3]), size: m[4] === "?" ? null : Number(m[4]), url: a.url });
  }
  return priorText({ files: p.files.map((f) => f.url), answers });
}

const kindOf = (a: Countable): CountKind | null => (a.req.kind === "add" || a.req.kind === "changes" || a.req.kind === "source" || a.req.kind === "edit" ? a.req.kind : null);

/** The whole objective rebuilt from its own parts, for comparison with the objective the job carries. */
function rebuilt(a: Countable, ref: SubjectRef): string | null {
  const o = a.req.bodyJson?.objective;
  if (typeof o !== "string" || !o) return null;
  const kind = kindOf(a);
  if (kind === "add") {
    const p = rebuildParts(o);
    if (!p) return null;
    if (!namedIsPublished(p.named)) return null;
    const channels = parseChannels(p.channels);
    if (!channels) return null;
    const prior = priorFrom(o);
    if (prior === null) return null;
    return fillTemplate(REBUILD_TEMPLATE, { SUBJECT: p.subject, URL: p.named.url, FALLBACK: p.named.fallback, HASH: p.named.sha256, PRIOR: prior, CHANNELS: channelText(channels) });
  }
  if (kind === "changes") {
    const p = changesParts(o);
    if (!p) return null;
    if (!namedIsPublished(p.named)) return null;
    const channels = parseChannels(p.channels);
    if (!channels) return null;
    const prior = priorFrom(o);
    if (prior === null) return null;
    return fillTemplate(CHANGES_TEMPLATE, { SUBJECT: p.subject, URL: p.named.url, FALLBACK: p.named.fallback, HASH: p.named.sha256, PRIOR: prior, CHANNELS: channelText(channels), ITEMS: p.items });
  }
  if (kind === "source") {
    const p = sourceParts(o);
    if (!p) return null;
    const urls = parseNumberedUrls(p.urls);
    const channels = parseChannels(p.channels);
    if (!urls || !channels) return null;
    if (p.main !== "not known" && !/^0x[0-9a-fA-F]{40}$/.test(p.main)) return null;
    return sourceObjective(urls, channels.list, p.main === "not known" ? "" : p.main, ref);
  }
  if (kind === "edit") {
    const p = editParts(o);
    if (!p) return null;
    const urls = parseNumberedUrls(p.urls);
    if (!urls) return null;
    const prior = priorFrom(o);
    if (prior === null) return null;
    return fillTemplate(EDIT_TEMPLATE, { SUBJECT: p.subject, TEXT: p.text, PRIOR: prior, URLS: urls.length ? urls.map((u, i) => `[${i + 1}] ${u}`).join("; ") : "none" });
  }
  return null;
}

/** True when the objective names one of this site's published instruction files, at its own addresses. */
function namedIsPublished(n: Named): boolean {
  const want = expectedAddresses(n.sha256);
  if (!want) return false;
  return n.url === want.url && n.fallback === want.fallback;
}

/** The subject description an objective must carry for a tag subject. */
const subjectText = (ref: SubjectRef) => describeSubject(ref);

/** The parts a rebuild or changes objective fills in, as read back; used for the subject and prior checks. */
export interface Parts {
  subject: string;
  hasInstruction: boolean;
  priorHashes: string[];
  channelUrls: string[];
}

export function partsOf(o: string, kind: CountKind): Parts | null {
  if (kind === "add") {
    const p = rebuildParts(o);
    if (!p) return null;
    const ch = parseChannels(p.channels);
    return { subject: p.subject, hasInstruction: true, priorHashes: parsePrior(o).files.map((f) => f.hash).filter(Boolean), channelUrls: (ch?.list ?? []).map((c) => c.url) };
  }
  if (kind === "changes") {
    const p = changesParts(o);
    if (!p) return null;
    const ch = parseChannels(p.channels);
    return { subject: p.subject, hasInstruction: true, priorHashes: parsePrior(o).files.map((f) => f.hash).filter(Boolean), channelUrls: (ch?.list ?? []).map((c) => c.url) };
  }
  if (kind === "edit") {
    const p = editParts(o);
    if (!p) return null;
    return { subject: p.subject, hasInstruction: false, priorHashes: parsePrior(o).files.map((f) => f.hash).filter(Boolean), channelUrls: [] };
  }
  const p = sourceParts(o);
  if (!p) return null;
  const ch = parseChannels(p.channels);
  return { subject: p.subject, hasInstruction: false, priorHashes: [], channelUrls: (ch?.list ?? []).map((c) => c.url) };
}

/** True when a job's objective names an instruction file at all (the scheme introduced on 2026-11-21). */
export const namesInstructionFile = (o: unknown) => instructionsOf(o) !== null;

const hostOf = (url: string) => {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return "";
  }
};

/**
 * Every completed result that counts, with why the others do not. A result the site has not read yet (its file hash
 * unknown) is counted only on its objective's shape: the page it builds is read in full before it is shown.
 */
export function countedOf(items: Countable[], refFor: (id: string) => SubjectRef): { counted: Set<string>; reasons: Map<string, string> } {
  const results = items.filter((a) => kindOf(a) !== null);
  const reasons = new Map<string, string>();
  const ok = new Set<string>();
  const legacy = new Set<string>();
  const parts = new Map<string, Parts>();

  for (const a of results) {
    const id = a.req.requestId;
    const kind = kindOf(a)!;
    const o = a.req.bodyJson?.objective;
    const ref = refFor(a.req.subject);
    if (typeof o !== "string" || !o) {
      reasons.set(id, NOT_READ);
      continue;
    }
    const p = partsOf(o, kind);
    if (!p) {
      reasons.set(id, NOT_READ);
      continue;
    }
    // A page or changes job sent before instruction files: counted only through a later counted rebuild (rule 4).
    if (p.hasInstruction === false && (kind === "add" || kind === "changes")) {
      legacy.add(id);
      continue;
    }
    const want = rebuilt(a, ref);
    if (want === null || want !== o) {
      reasons.set(id, NOT_READ);
      continue;
    }
    if (p.subject !== subjectText(ref)) {
      reasons.set(id, NOT_READ);
      continue;
    }
    parts.set(id, p);
    ok.add(id);
  }

  const byHash = new Map<string, Countable[]>();
  for (const a of results) if (a.fileHash) byHash.set(a.fileHash, [...(byHash.get(a.fileHash) ?? []), a]);
  const fileOf = (a: Countable) => a.fileHash;

  // A prior must be a result file of a job that counts for the same subject. A job whose own file is not read yet
  // (light activity) is not evidence either way: its result is read before its page is shown.
  const priorOk = (a: Countable, p: Parts) => {
    // A light scan has read no result files at all: a prior cannot be checked either way until they are read.
    if (results.every((r) => !r.fileHash)) return true;
    for (const h of p.priorHashes) {
      const hit = (byHash.get(h) ?? []).filter((x) => ok.has(x.req.requestId) && x.req.subject === a.req.subject);
      if (!hit.length) return false;
    }
    return true;
  };
  const channelOk = (a: Countable, p: Parts, pages: Countable[]) => {
    if (!p.channelUrls.length) return true;
    const own = domainOfId(a.req.subject);
    const listed = new Set(pages.flatMap((x) => (x.page?.channels ?? []).map((c) => hostOf(c.url))).filter(Boolean));
    return p.channelUrls.every((u) => {
      const h = hostOf(u);
      return !!h && ((own && sameSite(h, own)) || listed.has(h));
    });
  };

  let changed = true;
  while (changed) {
    changed = false;
    const pages = results.filter((x) => ok.has(x.req.requestId) && x.req.kind === "add");
    for (const a of [...ok]) {
      const p = parts.get(a)!;
      const item = results.find((x) => x.req.requestId === a)!;
      if (!priorOk(item, p) || !channelOk(item, p, pages)) {
        ok.delete(a);
        reasons.set(a, NOT_READ);
        changed = true;
      }
    }
    // Rule 4: a job without an instruction file counts once a counted rebuild lists its result.
    for (const a of results) {
      if (!legacy.has(a.req.requestId) || !fileOf(a)) continue;
      const hash = a.fileHash!;
      const listed = results.some(
        (r) => ok.has(r.req.requestId) && r.req.kind === "add" && r.req.subject === a.req.subject && parsePrior(r.req.bodyJson?.objective).files.some((f) => f.hash === hash),
      );
      if (listed) {
        legacy.delete(a.req.requestId);
        ok.add(a.req.requestId);
        const p = partsOf(String(a.req.bodyJson?.objective ?? ""), kindOf(a)!);
        if (p) parts.set(a.req.requestId, p);
        reasons.delete(a.req.requestId);
        changed = true;
      }
    }
  }
  for (const a of results) if (!ok.has(a.req.requestId) && !reasons.has(a.req.requestId)) reasons.set(a.req.requestId, NOT_READ);
  return { counted: ok, reasons };
}

/** The artifact URL of a result file, or "" — the form a prior lists. */
export const resultUrl = (hash: string | null) => (hash ? artifactUrl(hash) : "");
