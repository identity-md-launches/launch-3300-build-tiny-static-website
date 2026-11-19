/** The five tabs, with their own links, and which tab a link opens. */
export const TABS = [
  { id: "overview", label: "Overview" },
  { id: "record", label: "Record" },
  { id: "sources", label: "Sources" },
  { id: "activity", label: "Activity" },
  { id: "contribute", label: "Contribute" },
] as const;
export type Tab = (typeof TABS)[number]["id"];

/** Which tab a link opens, and the element inside it. Old links (#actions, #add-sources, #activity) still work. */
export function routeOf(hash: string): { tab: Tab; target: string | null } {
  let h: string;
  try {
    h = decodeURIComponent(hash.replace(/^#/, ""));
  } catch {
    return { tab: "overview", target: null }; // a truncated or mistyped escape such as "#%"
  }
  if (TABS.some((t) => t.id === h)) return { tab: h as Tab, target: null };
  if (h === "actions") return { tab: "contribute", target: null };
  if (h === "add-sources" || h === "suggest-edit" || h === "rebuild" || h === "confirm") return { tab: "contribute", target: h };
  if (h.startsWith("line-") || h === "dropped" || h === "unaccounted") return { tab: "record", target: h };
  if (h.startsWith("source-")) return { tab: "sources", target: h };
  if (h.startsWith("panel-")) return { tab: "overview", target: h };
  return { tab: "overview", target: null };
}
