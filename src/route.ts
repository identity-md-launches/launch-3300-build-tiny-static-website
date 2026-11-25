/** The home list, each subject's five tabs, and which tab a link opens. Hash routes only: the export is static. */
import { canonicalId, DEFAULT_SUBJECT, isSubjectId } from "./subject";

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
  /** "#/docs": how the site works. */
  docs?: boolean;
  /** "#/w/<address>": one wallet's profile page. */
  wallet?: string;
  /** "#/contributors": the people who added to Swarmpedia pages. */
  contributors?: boolean;
  /** "#/s/<subject>/l/<job id>:<line id>": the Record at that line, highlighted. */
  address?: string;
}

/** Which tab a part after the subject opens, and the element inside it. */
function inSubject(h: string): { tab: Tab; target: string | null } {
  if (!h) return { tab: "overview", target: null };
  if (TABS.some((t) => t.id === h)) return { tab: h as Tab, target: null };
  if (h === "actions") return { tab: "contribute", target: null };
  // The old Add sources and Suggest an edit cards are now one "Suggest changes" card.
  if (h === "add-sources" || h === "suggest-edit" || h === "suggest-changes") return { tab: "contribute", target: "suggest-changes" };
  if (h === "rebuild") return { tab: "contribute", target: h };
  // Panel checks are hidden for now: an old "confirm" address lands on the open form.
  if (h === "confirm") return { tab: "contribute", target: "suggest-changes" };
  // The old "Add a missing line" and "Add links to read" addresses: both are now the open form on Contribute.
  if (h === "add-line" || h === "add-links") return { tab: "contribute", target: "suggest-changes" };
  if (h.startsWith("line-") || h === "dropped" || h === "unaccounted" || h.startsWith("panel-") || h === "panel-answers" || h === "other-channels")
    return { tab: "record", target: h };
  if (h.startsWith("source-")) return { tab: "sources", target: h };
  // An open question's link (#/s/<subject>/q-<job id>-q<n>) opens the Record scrolled to it.
  if (h.startsWith("q-")) return { tab: "record", target: h };
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
  // "#/add/" with nothing after it: home with the lookup field empty and focused, for a related project whose
  // record gives no usable domain or contract.
  if (h === "/docs" || h === "/docs/") return { subject: null, tab: "overview", target: null, docs: true };
  if (h === "/contributors" || h === "/contributors/") return { subject: null, tab: "overview", target: null, contributors: true };
  const w = /^\/w\/(0x[0-9a-fA-F]{40})\/?$/.exec(h);
  if (w) return { subject: null, tab: "overview", target: null, wallet: w[1]!.toLowerCase() };
  if (h === "/add" || h === "/add/") return { subject: null, tab: "overview", target: null, add: "" };
  const add = /^\/add\/(.+)$/.exec(h);
  if (add) return { subject: null, tab: "overview", target: null, add: add[1]!.trim().slice(0, 300) };
  const m = /^\/s\/([^/]+)(?:\/(.*))?$/.exec(h);
  if (m) {
    const id = m[1]!.toLowerCase();
    if (!isSubjectId(id)) return { subject: null, tab: "overview", target: null, bad: m[1]! };
    // A line's permanent address (#/s/<subject>/l/<job id>:<line id>) opens the Record at that line.
    const at = /^l\/([^/]+)$/.exec(m[2] ?? "");
    if (at) return { subject: canonicalId(id), tab: "record", target: null, address: decodeURIComponent(at[1]!) };
    // An older link to a subdomain id (#/s/app.uniswap.org) opens the registrable domain's record (uniswap.org).
    return { subject: canonicalId(id), ...inSubject(m[2] ?? "") };
  }
  if (h.startsWith("/")) return { subject: null, tab: "overview", target: null };
  return { subject: DEFAULT_SUBJECT, ...inSubject(h) };
}

/**
 * The current address for an old subject link, or null when the link is already current: "#/s/app.uniswap.org/overview"
 * becomes "#/s/uniswap.org/overview" (the registrable domain the record is kept under), keeping the tab or element.
 */
export function canonicalHash(hash: string): string | null {
  let h: string;
  try {
    h = decodeURIComponent(hash.replace(/^#/, ""));
  } catch {
    return null;
  }
  const m = /^\/s\/([^/]+)(\/.*)?$/.exec(h);
  if (!m || !isSubjectId(m[1]!.toLowerCase())) return null;
  const id = canonicalId(m[1]!.toLowerCase());
  if (id === m[1]) return null;
  return `#/s/${id}${m[2] ?? ""}`;
}

/** Home with the bar filled in to add a project ("Add this project" under Related). */
export const addHref = (id: string) => `#/add/${encodeURIComponent(id)}`;

/** The link to a line's permanent address on a subject's record: "#/s/<subject>/l/<job id>:<line id>". */
export const lineAddressHref = (subject: string, address: string) => `#/s/${subject}/l/${encodeURIComponent(address)}`;
/** The link to a wallet's profile. */
export const walletHref = (address: string) => `#/w/${address.toLowerCase()}`;
/** How the site works. */
export const DOCS_HREF = "#/docs";

/** The link to a subject, or to one of its tabs or elements. */
export const subjectHref = (subject: string, part = "") => `#/s/${subject}${part ? `/${part}` : ""}`;

/* The subject whose page is open, so the record's in-page links can be written as before ("#record"). */
let current = DEFAULT_SUBJECT;
export const setLinkSubject = (s: string) => {
  current = s;
};
/** "#/s/<subject open now>/<part>" for an in-page link. */
export const to = (part = "") => subjectHref(current, part);

/** The contributors page. */
export const CONTRIBUTORS_HREF = "#/contributors";
