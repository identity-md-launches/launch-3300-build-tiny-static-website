/**
 * The header's two site links. From 768 pixels up they sit in the header row; below that a menu button at the end of
 * the row opens them in a small panel, so the header keeps one row: site name, search icon, Connect, menu.
 */
import { useEffect, useId, useRef, useState } from "react";
import { CONTRIBUTORS_HREF, DOCS_HREF } from "./route";

/** The header link's text. The page it opens keeps its own title, "Top contributors". */
export const CONTRIBUTORS_LINK = "Contributors";

export function SiteMenu({ docs, contributors }: { docs: boolean; contributors: boolean }) {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const id = useId();
  useEffect(() => {
    if (!open) return;
    const down = (e: MouseEvent) => {
      if (wrap.current && !wrap.current.contains(e.target as Node)) setOpen(false);
    };
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        button.current?.focus();
      }
    };
    const nav = () => setOpen(false);
    document.addEventListener("mousedown", down);
    document.addEventListener("keydown", key);
    window.addEventListener("hashchange", nav);
    return () => {
      document.removeEventListener("mousedown", down);
      document.removeEventListener("keydown", key);
      window.removeEventListener("hashchange", nav);
    };
  }, [open]);
  const links = (
    <>
      <a className="top-link" href={DOCS_HREF} aria-current={docs ? "page" : undefined}>How it works</a>
      <a className="top-link" href={CONTRIBUTORS_HREF} aria-current={contributors ? "page" : undefined}>{CONTRIBUTORS_LINK}</a>
    </>
  );
  return (
    <>
      <nav className="top-nav" aria-label="Site">{links}</nav>
      <div className="site-menu" ref={wrap}>
        <button
          ref={button}
          type="button"
          className="site-menu-toggle"
          aria-label="Menu"
          aria-expanded={open}
          aria-controls={`${id}-menu`}
          onClick={() => setOpen(!open)}
        >
          <svg viewBox="0 0 20 20" width="20" height="20" aria-hidden="true" focusable="false">
            {open ? (
              <path d="M5 5l10 10M15 5L5 15" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            ) : (
              <path d="M3 6h14M3 10h14M3 14h14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            )}
          </svg>
        </button>
        {open && (
          <nav className="site-menu-panel" id={`${id}-menu`} aria-label="Site">
            {links}
          </nav>
        )}
      </div>
    </>
  );
}
