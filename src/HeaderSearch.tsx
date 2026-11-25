/**
 * The header's compact search, on every page but Home's first screen: typing lists matching projects in a dropdown
 * (logo, name, domain); Enter opens the highlighted one, else the first; with no match, a domain or an address offers
 * "Create the page for <text>", which opens Home with the big box filled in and its offer shown (#/add/<text>).
 * On Home it stays hidden while the big box is on screen and appears once that box has scrolled out of view. Below
 * 768 pixels the header shows a search icon that opens the field at full width.
 */
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { SubjectLogo } from "./Logo";
import { matchesNameOrDomain, parseLookup } from "./lookup";
import { addHref, subjectHref } from "./route";
import type { SubjectSummary } from "./model";

export const SEARCH_PLACEHOLDER = "Search projects, or enter a website or contract address";
/** Home's placeholder below 480 pixels, where the full one does not fit the box. */
export const SEARCH_PLACEHOLDER_SHORT = "Search, or enter a website";
/** Below 480 pixels, the width at which Home's search box takes the short placeholder. */
export const NARROW_QUERY = "(max-width: 29.99rem)";

/** True while the media query matches; follows resizes and rotation. */
export function useMedia(query: string): boolean {
  const get = () => typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia(query).matches;
  const [on, setOn] = useState(get);
  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const mq = window.matchMedia(query);
    const change = () => setOn(mq.matches);
    change();
    mq.addEventListener("change", change);
    return () => mq.removeEventListener("change", change);
  }, [query]);
  return on;
}
/** Matches shown in the dropdown. */
export const HEADER_MATCHES = 6;

export type SearchEntry = Pick<SubjectSummary, "id" | "name" | "oneLine" | "logo" | "main" | "contracts">;

/** What the dropdown offers for a text: the matching projects, else a page to create for a domain or an address. Pure. */
export function searchOptions(entries: SearchEntry[], raw: string): { matches: SearchEntry[]; create: string | null } {
  const t = raw.trim();
  if (!t) return { matches: [], create: null };
  const matches = entries.filter((s) => matchesNameOrDomain(s, t)).slice(0, HEADER_MATCHES);
  if (matches.length) return { matches, create: null };
  const q = parseLookup(t);
  return { matches, create: q.kind === "domain" ? q.domain : q.kind === "address" ? (q.chainId !== null ? `${q.chainId}:${q.address}` : q.address) : null };
}

/**
 * What an unmatched search says: a domain or address can be created with "Look it up"; plain text cannot, so it asks
 * for another name or a website or contract address instead. Pure.
 */
export function noMatchText(raw: string, alsoStale = false): string {
  const t = raw.trim();
  const head = `No project${alsoStale ? " that needs a rebuild" : ""} matches “${t}”.`;
  if (alsoStale) return head;
  const q = parseLookup(t);
  return q.kind === "domain" || q.kind === "address" ? `${head} Press Look it up to add it.` : `${head} Try another name or enter a website or contract address.`;
}

/** True while the element with this id is on screen (and the page is Home). */
function useOnScreen(id: string, active: boolean): boolean {
  const [on, setOn] = useState(active);
  useEffect(() => {
    if (!active) return setOn(false);
    let obs: IntersectionObserver | null = null;
    let tries = 0;
    let timer = 0;
    const attach = () => {
      const el = document.getElementById(id);
      if (!el) {
        if (tries++ < 40) timer = window.setTimeout(attach, 50);
        else setOn(false);
        return;
      }
      if (typeof IntersectionObserver === "undefined") return setOn(true);
      // The sticky header covers the top of the page: the box counts as scrolled away once it is under it.
      const top = (document.querySelector(".top") as HTMLElement | null)?.offsetHeight ?? 0;
      obs = new IntersectionObserver((es) => setOn(es.some((e) => e.isIntersecting)), { rootMargin: `-${top}px 0px 0px 0px` });
      obs.observe(el);
    };
    setOn(true);
    attach();
    return () => {
      window.clearTimeout(timer);
      obs?.disconnect();
    };
  }, [id, active]);
  return on;
}

export function HeaderSearch({ entries, home }: { entries: SearchEntry[]; home: boolean }) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  /** Below 768 pixels: the field is shown at full width once the icon is pressed. */
  const [expanded, setExpanded] = useState(false);
  const [active, setActive] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const id = useId();
  const listId = `${id}-list`;
  const bigBoxShown = useOnScreen("lookup", home);
  const { matches, create } = useMemo(() => searchOptions(entries, q), [entries, q]);
  const options = matches.length ? matches.map((m) => ({ key: m.id, href: subjectHref(m.id) })) : create ? [{ key: `create:${create}`, href: addHref(create) }] : [];
  const showList = open && q.trim().length > 0;

  // Close on a click elsewhere and when the route changes.
  useEffect(() => {
    const down = (e: MouseEvent) => {
      if (wrap.current && !wrap.current.contains(e.target as Node)) {
        setOpen(false);
        setExpanded(false);
      }
    };
    const nav = () => {
      setOpen(false);
      setExpanded(false);
      setQ("");
    };
    document.addEventListener("mousedown", down);
    window.addEventListener("hashchange", nav);
    return () => {
      document.removeEventListener("mousedown", down);
      window.removeEventListener("hashchange", nav);
    };
  }, []);
  useEffect(() => setActive(0), [q]);
  useEffect(() => {
    if (expanded) input.current?.focus();
  }, [expanded]);

  const go = (i: number) => {
    const o = options[i] ?? options[0];
    if (!o) return;
    location.hash = o.href;
    setOpen(false);
    setExpanded(false);
    setQ("");
    input.current?.blur();
  };

  if (home && bigBoxShown) return null;
  return (
    <div className={`hsearch${expanded ? " hsearch-open" : ""}`} ref={wrap} role="search">
      <button
        type="button"
        className="hsearch-toggle"
        aria-label={expanded ? "Close search" : "Search projects"}
        aria-expanded={expanded}
        onClick={() => {
          setExpanded(!expanded);
          setOpen(false);
        }}
      >
        <svg viewBox="0 0 20 20" width="20" height="20" aria-hidden="true" focusable="false">
          {expanded ? (
            <path d="M5 5l10 10M15 5L5 15" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          ) : (
            <>
              <circle cx="8.5" cy="8.5" r="5.5" fill="none" stroke="currentColor" strokeWidth="1.8" />
              <path d="M12.6 12.6 17 17" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </>
          )}
        </svg>
      </button>
      <div className="hsearch-field">
        <label htmlFor={`${id}-q`} className="sr-only">{SEARCH_PLACEHOLDER}</label>
        <input
          id={`${id}-q`}
          ref={input}
          type="search"
          role="combobox"
          aria-expanded={showList}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={showList && options.length ? `${id}-o${Math.min(active, options.length - 1)}` : undefined}
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          enterKeyHint="go"
          placeholder="Search projects"
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setOpen(true);
              setActive((n) => Math.min(n + 1, Math.max(0, options.length - 1)));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setActive((n) => Math.max(0, n - 1));
            } else if (e.key === "Enter") {
              e.preventDefault();
              go(active);
            } else if (e.key === "Escape") {
              setOpen(false);
              if (!q) setExpanded(false);
            }
          }}
        />
        {showList && (
          <ul className="hsearch-list" id={listId} role="listbox" aria-label="Projects">
            {matches.map((m, i) => (
              <li key={m.id} id={`${id}-o${i}`} role="option" aria-selected={i === active}>
                <a href={subjectHref(m.id)} tabIndex={-1} onMouseEnter={() => setActive(i)} onClick={(e) => { e.preventDefault(); go(i); }}>
                  <SubjectLogo name={m.name} logo={m.logo} size={20} />
                  <span className="hsearch-name">{m.name}</span>
                  <span className="hsearch-domain small">{m.id}</span>
                </a>
              </li>
            ))}
            {!matches.length && create && (
              <li id={`${id}-o0`} role="option" aria-selected>
                <a href={addHref(create)} tabIndex={-1} onClick={(e) => { e.preventDefault(); go(0); }}>
                  <span className="hsearch-create">
                    <span>Create the page for</span>
                    <span className="hsearch-text mono">{create}</span>
                  </span>
                </a>
              </li>
            )}
            {!matches.length && !create && (
              <li className="hsearch-none small" role="presentation">No project matches. Enter a website or a contract address to create its page.</li>
            )}
          </ul>
        )}
      </div>
    </div>
  );
}
