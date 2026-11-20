/**
 * The home list's digests: one small record per subject (name, one_line, counts, logo hash, changed date, its
 * contracts) kept in IndexedDB, plus each logo once under its hash. A digest is written when a subject's page is
 * opened and its files are read; the home list reads only these, never a full page file.
 */
import { useEffect, useState } from "react";
import { digestOf, type Digest } from "./model";
import { kvAll, kvSet } from "./store";
import type { Activity } from "./useActivity";

export interface LogoEntry {
  type: "logo";
  hash: string;
  url: string;
}

/** Splits what the digests store holds into digests by subject id and logos by hash. */
export function splitDigests(values: unknown[]): { digests: Map<string, Digest>; logos: Map<string, string> } {
  const digests = new Map<string, Digest>();
  const logos = new Map<string, string>();
  for (const v of values) {
    const o = v as Partial<Digest> & Partial<LogoEntry>;
    if (o?.type === "digest" && typeof o.id === "string") digests.set(o.id, o as Digest);
    else if (o?.type === "logo" && typeof o.hash === "string" && typeof o.url === "string" && o.url.startsWith("data:image/png;base64,")) logos.set(o.hash, o.url);
  }
  return { digests, logos };
}

/** Writes the open subject's digest once its files are read, and keeps the maps the home list uses. */
export function useDigests(items: Activity[] | null, subject: string | null) {
  const [state, setState] = useState<{ digests: Map<string, Digest>; logos: Map<string, string> }>({ digests: new Map(), logos: new Map() });
  useEffect(() => {
    let live = true;
    void kvAll<unknown>("digests").then((values) => live && setState(splitDigests(values)));
    return () => {
      live = false;
    };
  }, []);
  useEffect(() => {
    if (!items || !subject) return;
    const mine = items.filter((a) => a.req.subject === subject);
    if (!mine.length) return;
    const d = digestOf(subject, mine);
    if (!d) return;
    const logo = mine.find((a) => a.logoHash && a.logo && a.logoHash === d.logoHash)?.logo ?? null;
    setState((s) => {
      const old = s.digests.get(subject);
      if (old && JSON.stringify(old) === JSON.stringify(d) && (!logo || s.logos.has(d.logoHash!))) return s;
      void kvSet("digests", subject, d);
      const logos = new Map(s.logos);
      if (logo && d.logoHash) {
        logos.set(d.logoHash, logo);
        void kvSet("digests", `logo:${d.logoHash}`, { type: "logo", hash: d.logoHash, url: logo } satisfies LogoEntry);
      }
      return { digests: new Map(s.digests).set(subject, d), logos };
    });
  }, [items, subject]);
  return state;
}
