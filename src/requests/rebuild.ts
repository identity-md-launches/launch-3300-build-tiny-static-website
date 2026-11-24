/** Rebuild: "Rebuild the Swarmpedia page for <subject id>." From the page shown and every result after it. */
import { ACTIONS } from "../config";
import { REBUILD_OUTPUTS, rebuildBody } from "../bodies";
import type { RequestKind } from "./kind";
import type { PageInput } from "./firstPage";

export const REBUILD: RequestKind<PageInput> = {
  id: "rebuild",
  label: "Rebuild the page",
  action: ACTIONS.research,
  tagKind: "add",
  instructions: "rebuild",
  body: (i) => rebuildBody(i.prior, i.subject, i.channels ?? [], i.moreChannels ?? 0, { first: false, leads: i.leads ?? [] }),
  price: (read) => read(ACTIONS.research),
  results: REBUILD_OUTPUTS,
};
