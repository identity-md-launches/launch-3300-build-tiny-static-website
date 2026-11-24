/** What a changes job did, in one line, for Activity and the wallet profile. */
import type { Activity } from "./useActivity";

/** "Updated the page: 3 added, 1 not added" for a completed changes job whose file was read. */
export function changesOutcome(a: Pick<Activity, "changes">): string {
  const items = a.changes?.items ?? [];
  if (!items.length) return "";
  const kept = items.filter((i) => i.kept).length;
  return `Updated the page: ${kept} added, ${items.length - kept} not added`;
}
