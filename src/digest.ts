/**
 * The home list's digests: one small record per subject (name, one_line, counts, logo hash, changed date, its
 * contracts, what the out-of-date note needs) kept in IndexedDB, plus each logo once under its hash. A digest is
 * written when a subject's files are read: when its page is opened. The home list never reads a full record to draw
 * itself: it is drawn from the Intake scan and these cached digests, and a subject with no digest yet shows a light
 * row from the scan alone, or the compact record published with the site (published.json) while it is taken from
 * results the scan holds. A contract lookup uses these too: it never reads a record.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import published from "./published.json";
import { digestOf, isCurrent, leftOut, needsRetry, resultSig, type Digest } from "./model";
import { kvAll, kvSet } from "./store";
import type { Activity } from "./useActivity";

export interface LogoEntry {
  type: "logo";
  hash: string;
  url: string;
}

/** How many subjects the home page reads at once. */
export const DIGEST_CONCURRENCY = 3;

/**
 * Splits what the digests store holds into digests by subject id and logos by hash. A digest of the previous shape
 * (v8) is kept: its fields are the same, and the figures it does not have (open questions, launch date) are unknown
 * until its page is opened again.
 */
export function splitDigests(values: unknown[]): { digests: Map<string, Digest>; logos: Map<string, string> } {
  const digests = new Map<string, Digest>();
  const logos = new Map<string, string>();
  for (const v of values) {
    const o = v as Partial<Digest> & Partial<LogoEntry>;
    if (o?.type === "digest" && typeof o.id === "string" && o.v === 9) digests.set(o.id, o as Digest);
    else if (o?.type === "digest" && typeof o.id === "string" && (o as { v?: number }).v === 8) digests.set(o.id, { ...(o as Digest), open: undefined, launched: undefined, example: o.example ?? null });
    else if (o?.type === "logo" && typeof o.hash === "string" && typeof o.url === "string" && o.url.startsWith("data:image/png;base64,")) logos.set(o.hash, o.url);
  }
  return { digests, logos };
}

/**
 * The stored digests, with the compact records published with the site for subjects this browser has none for (or an
 * older one than the results the scan holds). A published record is used only when the scan holds every result it was
 * taken from; it carries no example and no logo image. Pure, for tests.
 */
export function withPublished(stored: Map<string, Digest>, items: Activity[] | null, from: Digest[] = published as unknown as Digest[]): Map<string, Digest> {
  if (!items?.length) return stored;
  let out = stored;
  for (const p of from) {
    const list = items.filter((a) => a.req.subject === p.id);
    const have = new Set(resultSig(list).split(","));
    if (p.v !== 9 || !p.sig || !p.sig.split(",").every((x) => have.has(x))) continue;
    const mine = stored.get(p.id);
    if (mine && ((isCurrent(mine, list) && mine.open !== undefined) || !isCurrent(p, list))) continue;
    if (out === stored) out = new Map(stored);
    out.set(p.id, mine?.example ? { ...p, example: mine.example } : p);
  }
  return out;
}

const newest = (list: Activity[]) => Math.max(0, ...list.map((a) => a.doneTime ?? a.time ?? Number(a.completion?.blockNumber ?? a.req.blockNumber)));

/**
 * The subjects whose files the home page should read, newest first: each has a completed result whose file was not
 * read here, and no digest, a digest taken from other results, or a digest with a failed read (a result file or the
 * advertised logo) to try again. Subjects with no digest come before the others.
 */
export function digestQueue(items: Activity[], digests: Map<string, Digest>): string[] {
  const by = new Map<string, Activity[]>();
  for (const a of items) by.set(a.req.subject, [...(by.get(a.req.subject) ?? []), a]);
  const want = [...by]
    .filter(([, list]) => list.some((a) => a.filesRead === false))
    .map(([id, list]) => {
      const d = digests.get(id);
      return { id, missing: !d, again: !!d && (!isCurrent(d, list) || needsRetry(d)), t: newest(list) };
    })
    .filter((x) => x.missing || x.again);
  return want.sort((a, b) => Number(b.missing) - Number(a.missing) || b.t - a.t || a.id.localeCompare(b.id)).map((x) => x.id);
}

/**
 * The home page's one read queue: at most `limit` reads at once for the life of the page, however many times the
 * list of subjects changes. plan() replaces the waiting list (newest first) and starts reads into free slots; a
 * subject being read is not started twice, and a finished read frees its slot for the next waiting subject.
 */
export class DigestQueue {
  waiting: string[] = [];
  readonly active = new Set<string>();
  constructor(
    private readonly limit: number,
    private readonly work: (id: string) => Promise<void>,
    private readonly changed: (active: Set<string>, waiting: string[]) => void = () => {},
    private readonly replan: () => void = () => {},
  ) {}
  plan(ids: string[]) {
    this.waiting = ids.filter((id, i) => !this.active.has(id) && ids.indexOf(id) === i);
    this.pump();
  }
  private pump() {
    while (this.active.size < this.limit && this.waiting.length) {
      const id = this.waiting.shift()!;
      this.active.add(id);
      void this.work(id)
        .catch(() => {})
        .finally(() => {
          this.active.delete(id);
          this.pump();
          this.replan();
        });
    }
    this.changed(new Set(this.active), [...this.waiting]);
  }
}

export interface DigestState {
  digests: Map<string, Digest>;
  logos: Map<string, string>;
  /** Subjects queued or being read for a digest: Home shows a placeholder row for them. */
  reading: Set<string>;
  /** Subjects whose files could not be read, with why. */
  failed: Map<string, string>;
  /** True while a read that could still change the list is outstanding, or the stored digests are not loaded yet. */
  busy: boolean;
  /** Reads a subject's files again (its failed page, result files or logo), now. */
  retry: (id: string) => void;
}

/**
 * Writes a subject's digest whenever its files are read (its page is opened). The home page reads no subject's files
 * by itself: only retry() (a visitor's Try again) starts a read, through one DigestQueue.
 */
export function useDigests(items: Activity[] | null, subject: string | null, readSubject?: (id: string) => Promise<Activity[]>, all: Activity[] | null = items): DigestState {
  const [state, setState] = useState<{ digests: Map<string, Digest>; logos: Map<string, string> }>({ digests: new Map(), logos: new Map() });
  const [loaded, setLoaded] = useState(false);
  const [reading, setReading] = useState<Set<string>>(new Set());
  const [failed, setFailed] = useState<Map<string, string>>(new Map());
  /** Subject id and the result list it was read for: never read the same thing twice in one visit. */
  const tried = useRef(new Map<string, string>());
  const latest = useRef(state);
  latest.current = state;
  /** Subjects a visitor asked to read again with Try again. */
  const wanted = useRef(new Set<string>());
  const ctx = useRef({ items, subject, readSubject, loaded, all });
  ctx.current = { items, subject, readSubject, loaded, all };

  useEffect(() => {
    let live = true;
    void kvAll<unknown>("digests").then((values) => {
      if (!live) return;
      const read = splitDigests(values);
      latest.current = read;
      setState(read);
      setLoaded(true);
    });
    return () => {
      live = false;
    };
  }, []);

  const remember = (id: string, mine: Activity[]): boolean => {
    const d = digestOf(id, mine, leftOut((ctx.current.all ?? []).filter((a) => a.req.subject === id), mine));
    if (!d) return false;
    const logo = mine.find((a) => a.logoHash && a.logo && a.logoHash === d.logoHash)?.logo ?? null;
    const s = latest.current;
    const old = s.digests.get(id);
    if (old && JSON.stringify(old) === JSON.stringify(d) && (!logo || s.logos.has(d.logoHash!))) return true;
    void kvSet("digests", id, d);
    const logos = new Map(s.logos);
    if (logo && d.logoHash) {
      logos.set(d.logoHash, logo);
      void kvSet("digests", `logo:${d.logoHash}`, { type: "logo", hash: d.logoHash, url: logo } satisfies LogoEntry);
    }
    const next = { digests: new Map(s.digests).set(id, d), logos };
    latest.current = next;
    setState(next);
    return true;
  };

  // The open subject: its files are read by the page itself.
  useEffect(() => {
    if (!items || !subject) return;
    const mine = items.filter((a) => a.req.subject === subject);
    if (mine.length) remember(subject, mine);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, subject]);

  const sigOf = (list: Activity[], id: string) => resultSig(list.filter((a) => a.req.subject === id));

  const queue = useRef<DigestQueue | null>(null);
  const plan = () => {
    const { items: its, subject: open, readSubject: read, loaded: ready } = ctx.current;
    if (!its || open || !read || !ready || !queue.current) return;
    // Read: subjects asked for with Try again, and every row whose digest (stored here or published with the site)
    // was taken before a newer counted result, so a home row never stays behind its project's page.
    const known = withPublished(latest.current.digests, its);
    const want = digestQueue(its, known).filter((id) => wanted.current.has(id) || (known.has(id) && !isCurrent(known.get(id)!, its.filter((a) => a.req.subject === id))));
    queue.current.plan(want.filter((id) => tried.current.get(id) !== sigOf(its, id)));
  };
  queue.current ??= new DigestQueue(
    DIGEST_CONCURRENCY,
    async (id) => {
      const read = ctx.current.readSubject;
      if (!read) return;
      tried.current.set(id, sigOf(ctx.current.items ?? [], id));
      let why = "";
      try {
        const mine = await read(id);
        if (!remember(id, mine)) why = mine.find((a) => a.sourcesError)?.sourcesError ?? "its files could not be read";
      } catch (e) {
        why = e instanceof Error ? e.message : "its files could not be read";
      }
      setFailed((f) => {
        const n = new Map(f);
        if (why) n.set(id, why);
        else n.delete(id);
        return n;
      });
    },
    (active, waiting) => setReading(new Set([...active, ...waiting])),
    () => plan(),
  );

  // Reads asked for (Try again) and refreshes of rows behind a newer counted result continue as the list changes.
  useEffect(() => {
    plan();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, subject, readSubject, loaded]);

  const retry = (id: string) => {
    wanted.current.add(id);
    tried.current.delete(id);
    setFailed((f) => {
      const n = new Map(f);
      n.delete(id);
      return n;
    });
    plan();
  };

  const digests = useMemo(() => withPublished(state.digests, items), [state.digests, items]);
  return { digests, logos: state.logos, reading, failed, busy: !loaded || reading.size > 0, retry };
}
