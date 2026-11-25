/** Saved projects: kept in this browser only (localStorage), with no wallet and no request. */
import { useEffect, useState } from "react";

const KEY = "swarmpedia.saved.v1";
const EVENT = "swarmpedia-saved";

export function readSaved(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string").slice(0, 500) : [];
  } catch {
    return [];
  }
}
export function toggleSaved(id: string): string[] {
  const now = readSaved();
  const next = now.includes(id) ? now.filter((x) => x !== id) : [...now, id];
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* storage full or blocked: the star still answers for this visit */
  }
  window.dispatchEvent(new Event(EVENT));
  return next;
}
/** The saved ids, kept in step across every star on the page and other tabs. */
export function useSaved(): string[] {
  const [list, setList] = useState<string[]>(() => (typeof localStorage === "undefined" ? [] : readSaved()));
  useEffect(() => {
    const on = () => setList(readSaved());
    window.addEventListener(EVENT, on);
    window.addEventListener("storage", on);
    return () => {
      window.removeEventListener(EVENT, on);
      window.removeEventListener("storage", on);
    };
  }, []);
  return list;
}

/** The star: an icon-only toggle button labelled "Save"; pressed when the project is saved. */
export function SaveStar({ id, name }: { id: string; name: string }) {
  const saved = useSaved().includes(id);
  return (
    <button type="button" className={`save-star${saved ? " is-on" : ""}`} aria-pressed={saved} aria-label="Save" title={saved ? `${name} is saved on this device` : `Save ${name} on this device`} onClick={() => toggleSaved(id)}>
      <svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true" focusable="false">
        <path d="M10 2.6l2.3 4.7 5.2.8-3.8 3.7.9 5.1L10 14.5l-4.6 2.4.9-5.1-3.8-3.7 5.2-.8z" fill={saved ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      </svg>
    </button>
  );
}
