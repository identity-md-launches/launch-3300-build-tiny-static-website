/** Every request kind the site sells. Add a kind by adding its module here; no other kind changes. */
import { CHANGES } from "./changes";
import { FIRST_PAGE } from "./firstPage";
import { REBUILD } from "./rebuild";
import type { RequestKind } from "./kind";

export { CHANGES, FIRST_PAGE, REBUILD };
export type { RequestKind, PriceReader, ResultFile } from "./kind";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const REQUEST_KINDS: readonly RequestKind<any>[] = [FIRST_PAGE, REBUILD, CHANGES];

/** The result file names the site reads from a job of this tag kind ("add" → page and logo, "changes" → changes). */
export const resultNamesOf = (tagKind: string): string[] => [...new Set(REQUEST_KINDS.filter((k) => k.tagKind === tagKind).flatMap((k) => k.results.map((r) => r.name)))];
