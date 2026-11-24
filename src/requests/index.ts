/** Every request kind the site sells. Add a kind by adding its module here; no other kind changes. */
import { CHANGES } from "./changes";
import { FIRST_PAGE } from "./firstPage";
import { REBUILD } from "./rebuild";
import type { RequestKind } from "./kind";

export { CHANGES, FIRST_PAGE, REBUILD };
export type { RequestKind, PriceReader, ResultFile } from "./kind";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const REQUEST_KINDS: readonly RequestKind<any>[] = [FIRST_PAGE, REBUILD, CHANGES];

/** Result files of tag kinds no longer sold, whose finished jobs are still read. */
export const HISTORICAL_RESULTS: Readonly<Record<string, readonly string[]>> = { source: ["lines"], edit: ["edit"] };

/** The result file names the site reads from a job of this tag kind ("add" → page and logo, "changes" → changes). */
export const resultNamesOf = (tagKind: string): string[] => {
  const sold = REQUEST_KINDS.filter((k) => k.tagKind === tagKind).flatMap((k) => k.results.map((r) => r.name));
  return [...new Set(sold.length ? sold : HISTORICAL_RESULTS[tagKind] ?? [])];
};

/** The result file itself of a job of this tag kind: the first its kind lists, or null when no kind reads one. */
export const resultFileOf = (tagKind: string): string | null => resultNamesOf(tagKind)[0] ?? null;

/** The kind sold with this Intake action and tag kind (the first page and a rebuild share one, and one result). */
export const kindOfRequest = (r: { action: string; kind: string }): RequestKind<never> | undefined => REQUEST_KINDS.find((k) => k.action === r.action && k.tagKind === r.kind);
