/**
 * Home's two views of the project list (revision 35): Cards (the default) and List, the category chips above both, and
 * the switch between them, remembered in this browser. A card shows the first screenshot cropped from the top at 16 by
 * 10 (or the logo on a light tile), logo and name, one_line, the category, a play button to the app and "Dive in".
 */
import { useEffect, useRef, useState } from "react";
import { fetchLogoByHash, fetchShot } from "./api";
import type { Digest } from "./model";
import { kvSet } from "./store";
import type { LogoEntry } from "./digest";
import { localDate } from "./dates";
import { SubjectLogo } from "./Logo";
import { statusText, unreadableText, type SubjectSummary } from "./model";
import { CATEGORY_WORDS, CategoryChip } from "./Overview";
import { CATEGORIES, type Category } from "./page";
import { subjectHref } from "./route";
import { SaveStar } from "./saved";
import type { Activity } from "./useActivity";

export type HomeView = "cards" | "list";
const VIEW_KEY = "swarmpedia.homeView";

/** The view this browser chose last; Cards when none was chosen or storage is closed. */
export function readView(): HomeView {
  try {
    return localStorage.getItem(VIEW_KEY) === "list" ? "list" : "cards";
  } catch {
    return "cards";
  }
}
export function useHomeView(): [HomeView, (v: HomeView) => void] {
  const [v, setV] = useState<HomeView>(readView);
  const set = (x: HomeView) => {
    setV(x);
    try {
      localStorage.setItem(VIEW_KEY, x);
    } catch {
      /* private mode: the choice lasts for this visit */
    }
  };
  return [v, set];
}

export function ViewSwitch({ view, set }: { view: HomeView; set: (v: HomeView) => void }) {
  return (
    <div className="view-switch" role="group" aria-label="Show as">
      <button type="button" aria-pressed={view === "cards"} onClick={() => set("cards")}>
        Cards
      </button>
      <button type="button" aria-pressed={view === "list"} onClick={() => set("list")}>
        List
      </button>
    </div>
  );
}

/** "All" and one chip per category with at least one project, each with its count, in the categories' own order. */
export function categoryCounts(rows: Pick<SubjectSummary, "category">[]): { category: Category; n: number }[] {
  return CATEGORIES.map((c) => ({ category: c, n: rows.filter((r) => r.category === c).length })).filter((x) => x.n > 0);
}

export function CategoryChips({ rows, value, set }: { rows: Pick<SubjectSummary, "category">[]; value: Category | null; set: (c: Category | null) => void }) {
  const cats = categoryCounts(rows);
  // With a category chosen, "All" always stays, so the filter can be cleared.
  if (!cats.length && value === null) return null;
  return (
    <div className="cat-chips" role="group" aria-label="Filter by category">
      <button type="button" className="chip" aria-pressed={value === null} onClick={() => set(null)}>
        All <span className="num">{rows.length.toLocaleString("en-US")}</span>
      </button>
      {cats.map(({ category, n }) => (
        <button key={category} type="button" className="chip" aria-pressed={value === category} onClick={() => set(value === category ? null : category)}>
          {CATEGORY_WORDS[category]} <span className="num">{n.toLocaleString("en-US")}</span>
        </button>
      ))}
    </div>
  );
}

/**
 * The category a visitor chose, as long as the rows the search leaves still hold one in it; otherwise none, so the
 * search's matches show under All. Pure, for tests.
 */
export function liveCategory(rows: Pick<SubjectSummary, "category">[], cat: Category | null): Category | null {
  return cat && rows.some((r) => r.category === cat) ? cat : null;
}

/**
 * Logos Home has a hash for (from a stored or published digest) but not the image: each read once, checked against its
 * hash, and kept in the digests store under that hash, so the card, its tile and the List row show the project's logo
 * on a first visit. A file that fails a check is left out and the letter tile stays.
 */
export function useHashLogos(items: unknown[] | null, digests: Map<string, Digest> | undefined, logos: Map<string, string> | undefined): Map<string, string> {
  const [got, setGot] = useState<Map<string, string>>(new Map());
  const tried = useRef(new Set<string>());
  const want = items?.length && digests ? [...digests.values()].map((d) => d.hasPage && d.logoHash).filter((h): h is string => !!h && !logos?.has(h)) : [];
  const sig = [...new Set(want)].sort().join(",");
  useEffect(() => {
    // Every hash is read once per visit; its result is kept even if the list changes meanwhile.
    for (const h of sig ? sig.split(",") : []) {
      if (tried.current.has(h)) continue;
      tried.current.add(h);
      fetchLogoByHash(h).then(
        (url) => {
          void kvSet("digests", `logo:${h}`, { type: "logo", hash: h, url } satisfies LogoEntry);
          setGot((m) => new Map(m).set(h, url));
        },
        (e: unknown) => console.warn(`Logo ${h.slice(0, 12)} could not be read:`, e instanceof Error ? e.message : e),
      );
    }
  }, [sig]);
  return got;
}

/** The card's screenshot: read from the page request's result (checked and cached by fetchShot) once the card shows. */
function useCardShot(s: SubjectSummary, items: Activity[] | null): string | null {
  const [url, setUrl] = useState<{ key: string; url: string | null }>({ key: "", url: null });
  const key = s.shot ? `${s.shot.req}:${s.shot.slot}` : "";
  const a = key ? items?.find((x) => x.req.requestId === s.shot!.req) : undefined;
  const ready = !!a?.completion;
  useEffect(() => {
    if (!key || !a?.completion) return;
    let live = true;
    fetchShot(a.req, a.completion, a.via?.jobId ?? a.jobId ?? null, s.shot!.slot).then(
      (r) => live && setUrl({ key, url: r.url }),
      () => live && setUrl({ key, url: null }),
    );
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, ready]);
  return url.key === key ? url.url : null;
}

/** The small outlined play button: opens the app in a new tab; the app's label is its tooltip and name. */
export function PlayButton({ app, name }: { app: SubjectSummary["app"]; name: string }) {
  if (!app) return null;
  return (
    <a className="play" href={app.url} target="_blank" rel="noopener noreferrer" title={app.label} aria-label={`${app.label}: ${name} (opens in a new tab)`}>
      <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" focusable="false">
        <path d="M5 3.5v9l7-4.5-7-4.5Z" fill="currentColor" />
      </svg>
    </a>
  );
}

/** One_line, or for a subject with no page the words Home shows for it. */
function lineOf(s: SubjectSummary): string {
  if (s.unread && !s.unreadable) return "Open its page to read the record.";
  if (s.hasPage) return s.oneLine || "No one-line description yet.";
  if (s.unreadable) return unreadableText(s.unreadable);
  return s.status ? statusText(s.status) : "No page yet.";
}

export function ProjectCard({ s, items }: { s: SubjectSummary; items: Activity[] | null }) {
  const shot = useCardShot(s, items);
  const href = subjectHref(s.id);
  return (
    <li className="pcard">
      <a className="pcard-media" href={href} tabIndex={-1} aria-hidden="true">
        {shot ? (
          <img src={shot} alt="" width={1280} height={800} decoding="async" />
        ) : (
          <span className="pcard-tile">
            <SubjectLogo name={s.name} logo={s.logo} size={44} />
          </span>
        )}
      </a>
      <div className="pcard-body">
        <div className="pcard-head">
          <SubjectLogo name={s.name} logo={s.logo} size={20} />
          <a className="pcard-name" href={href}>
            {s.name}
          </a>
          <SaveStar id={s.id} name={s.name} />
        </div>
        <p className="pcard-line">{lineOf(s)}</p>
        <div className="pcard-foot">
          <CategoryChip category={s.category} />
          <PlayButton app={s.app} name={s.name} />
          <a className="pcard-dive" href={href} aria-label={`Dive in: ${s.name}`}>
            Dive in
          </a>
        </div>
      </div>
    </li>
  );
}

export function ProjectRow({ s }: { s: SubjectSummary }) {
  const href = subjectHref(s.id);
  return (
    <li className="prow">
      <SubjectLogo name={s.name} logo={s.logo} size={40} />
      <div className="prow-main">
        <div className="prow-head">
          <a className="prow-name" href={href}>
            {s.name}
          </a>
          <SaveStar id={s.id} name={s.name} />
        </div>
        <p className="prow-line">{lineOf(s)}</p>
      </div>
      <div className="prow-side">
        <CategoryChip category={s.category} />
        <PlayButton app={s.app} name={s.name} />
        <span className="small prow-built">{s.built ? `Last built ${localDate(s.built)}` : s.waiting ? "Reading…" : ""}</span>
      </div>
    </li>
  );
}
