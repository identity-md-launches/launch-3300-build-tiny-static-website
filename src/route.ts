/** The home list, each subject's five tabs, and which tab a link opens. Hash routes only: the export is static. */
import { DEFAULT_SUBJECT, isSubjectId } from "./subject";

export const TABS = [
  { id: "overview", label: "Overview" },
  { id: "record", label: "Record" },
  { id: "sources", label: "Sources" },
  { id: "activity", label: "Activity" },
  { id: "contribute", label: "Contribute" },
] as const;
export type Tab = (typeof TABS)[number]["id"];

export interface Route {
  /** null on the home list. */
  subject: string | null;
  tab: Tab;
  target: string | null;
  /** A subject link whose id is not a valid subject id. */
  bad?: string;
  /** "#/add/<domain or chain:0x…>": home, with the bar filled in to add that project. */
  add?: string;
}

/** Which tab a part after the subject opens, and the element inside it. */
function inSubject(h: string): { tab: Tab; target: string | null } {
  if (!h) return { tab: "overview", target: null };
  if (TABS.some((t) => t.id === h)) return { tab: h as Tab, target: null };
  if (h === "actions") return { tab: "contribute", target: null };
  if (h === "add-sources" || h === "suggest-edit" || h === "rebuild" || h === "confirm") return { tab: "contribute", target: h };
  if (h.startsWith("line-") || h === "dropped" || h === "unaccounted" || h.startsWith("panel-") || h === "panel-answers" || h === "other-channels")
    return { tab: "record", target: h };
  if (h.startsWith("source-")) return { tab: "sources", target: h };
  return { tab: "overview", target: null };
}

/**
 * "" or "#/" is home. "#/s/<subject id>[/<tab or element>]" is a subject. Any older link (#overview, #record,
 * #actions, #add-sources, #activity, #line-…) opens imd.fun, the one subject the site had before.
 */
export function routeOf(hash: string): Route {
  let h: string;
  try {
    h = decodeURIComponent(hash.replace(/^#/, ""));
  } catch {
    return { subject: null, tab: "overview", target: null }; // a truncated or mistyped escape such as "#%"
  }
  if (h === "" || h === "/") return { subject: null, tab: "overview", target: null };
  const add = /^\/add\/(.+)$/.exec(h);
  if (add) return { subject: null, tab: "overview", target: null, add: add[1]!.trim().slice(0, 300) };
  const m = /^\/s\/([^/]+)(?:\/(.*))?$/.exec(h);
  if (m) {
    const id = m[1]!.toLowerCase();
    if (!isSubjectId(id)) return { subject: null, tab: "overview", target: null, bad: m[1]! };
    return { subject: id, ...inSubject(m[2] ?? "") };
  }
  if (h.startsWith("/")) return { subject: null, tab: "overview", target: null };
  return { subject: DEFAULT_SUBJECT, ...inSubject(h) };
}

/** Home with the bar filled in to add a project ("Add this project" under Related). */
export const addHref = (id: string) => `#/add/${encodeURIComponent(id)}`;

/** The link to a subject, or to one of its tabs or elements. */
export const subjectHref = (subject: string, part = "") => `#/s/${subject}${part ? `/${part}` : ""}`;

/* The subject whose page is open, so the record's in-page links can be written as before ("#record"). */
let current = DEFAULT_SUBJECT;
export const setLinkSubject = (s: string) => {
  current = s;
};
/** "#/s/<subject open now>/<part>" for an in-page link. */
export const to = (part = "") => subjectHref(current, part);
