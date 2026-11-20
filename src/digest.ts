/**
 * The home list's digests: one small record per subject (name, one_line, counts, logo hash, changed date, its
 * contracts, what the out-of-date note needs) kept in IndexedDB, plus each logo once under its hash. A digest is
 * written when a subject's files are read: when its page is opened, or when the home page reads, a few at a time and
 * newest first, every listed subject that has no digest (or one taken before newer results).
 */
import { useEffect, useRef, useState } from "react";
import { digestOf, resultSig, type Digest } from "./model";
import { kvAll, kvSet } from "./store";
import type { Activity } from "./useActivity";

export interface LogoEntry {
  type: "logo";
  hash: string;
  url: string;
}

/** How many subjects the home page reads at once. */
export const DIGEST_CONCURRENCY = 3;

/** Splits what the digests store holds into digests by subject id and logos by hash. Digests of an older shape are read again. */
export function splitDigests(values: unknown[]): { digests: Map<string, Digest>; logos: Map<string, string> } {
  const digests = new Map<string, Digest>();
  const logos = new Map<string, string>();
  for (const v of values) {
    const o = v as Partial<Digest> & Partial<LogoEntry>;
    if (o?.type === "digest" && typeof o.id === "string" && o.v === 2) digests.set(o.id, o as Digest);
    else if (o?.type === "logo" && typeof o.hash === "string" && typeof o.url === "string" && o.url.startsWith("data:image/png;base64,")) logos.set(o.hash, o.url);
  }
  return { digests, logos };
}

const newest = (list: Activity[]) => Math.max(0, ...list.map((a) => a.doneTime ?? a.time ?? Number(a.completion?.blockNumber ?? a.req.blockNumber)));

/**
 * The subjects whose files the home page should read, newest first: each has a completed result whose file was not
 * read here, and no digest, or a digest taken from other results. Subjects with no digest come before stale ones.
 */
export function digestQueue(items: Activity[], digests: Map<string, Digest>): string[] {
  const by = new Map<string, Activity[]>();
  for (const a of items) by.set(a.req.subject, [...(by.get(a.req.subject) ?? []), a]);
  const want = [...by]
    .filter(([, list]) => list.some((a) => a.filesRead === false))
    .map(([id, list]) => ({ id, missing: !digests.has(id), stale: digests.get(id)?.sig !== resultSig(list), t: newest(list) }))
    .filter((x) => x.missing || x.stale);
  return want.sort((a, b) => Number(b.missing) - Number(a.missing) || b.t - a.t || a.id.localeCompare(b.id)).map((x) => x.id);
}

/** Runs `work` over `ids` with at most `limit` at once, in order. */
export async function inPool(ids: string[], limit: number, work: (id: string) => Promise<void>): Promise<void> {
  let next = 0;
  const lane = async () => {
    while (next < ids.length) await work(ids[next++]!);
  };
  await Promise.all(Array.from({ length: Math.min(limit, ids.length) }, lane));
}

export interface DigestState {
  digests: Map<string, Digest>;
  logos: Map<string, string>;
  /** Subjects queued or being read for a digest: Home shows a placeholder row for them. */
  reading: Set<string>;
  /** Subjects whose files could not be read, with why. */
  failed: Map<string, string>;
}

/**
 * Writes a subject's digest whenever its files are read, and on the home page reads the files of every subject that
 * needs one (digestQueue), DIGEST_CONCURRENCY at a time, filling each row in as its digest arrives.
 */
export function useDigests(items: Activity[] | null, subject: string | null, readSubject?: (id: string) => Promise<Activity[]>): DigestState {
  const [state, setState] = useState<{ digests: Map<string, Digest>; logos: Map<string, string> }>({ digests: new Map(), logos: new Map() });
  const [loaded, setLoaded] = useState(false);
  const [reading, setReading] = useState<Set<string>>(new Set());
  const [failed, setFailed] = useState<Map<string, string>>(new Map());
  /** Subject id and the result list it was read for: never read the same thing twice in one visit. */
  const tried = useRef(new Map<string, string>());
  const latest = useRef(state);
  latest.current = state;

  useEffect(() => {
    let live = true;
    void kvAll<unknown>("digests").then((values) => {
      if (!live) return;
      setState(splitDigests(values));
      setLoaded(true);
    });
    return () => {
      live = false;
    };
  }, []);

  const remember = (id: string, mine: Activity[]): boolean => {
    const d = digestOf(id, mine);
    if (!d) return false;
    const logo = mine.find((a) => a.logoHash && a.logo && a.logoHash === d.logoHash)?.logo ?? null;
    setState((s) => {
      const old = s.digests.get(id);
      if (old && JSON.stringify(old) === JSON.stringify(d) && (!logo || s.logos.has(d.logoHash!))) return s;
      void kvSet("digests", id, d);
      const logos = new Map(s.logos);
      if (logo && d.logoHash) {
        logos.set(d.logoHash, logo);
        void kvSet("digests", `logo:${d.logoHash}`, { type: "logo", hash: d.logoHash, url: logo } satisfies LogoEntry);
      }
      return { digests: new Map(s.digests).set(id, d), logos };
    });
    return true;
  };

  // The open subject: its files are read by the page itself.
  useEffect(() => {
    if (!items || !subject) return;
    const mine = items.filter((a) => a.req.subject === subject);
    if (mine.length) remember(subject, mine);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, subject]);

  // The home page: read every subject that has no digest, newest first, a few at a time.
  useEffect(() => {
    if (!items || subject || !readSubject || !loaded) return;
    const queue = digestQueue(items, latest.current.digests).filter((id) => {
      const sig = resultSig(items.filter((a) => a.req.subject === id));
      if (tried.current.get(id) === sig) return false;
      tried.current.set(id, sig);
      return true;
    });
    if (!queue.length) return;
    setReading((r) => new Set([...r, ...queue]));
    void inPool(queue, DIGEST_CONCURRENCY, async (id) => {
      let why = "";
      try {
        const mine = await readSubject(id);
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
      setReading((r) => {
        const n = new Set(r);
        n.delete(id);
        return n;
      });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, subject, readSubject, loaded]);

  return { ...state, reading, failed };
}
