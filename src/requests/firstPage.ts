/** First page: "Write the Swarmpedia page for <subject id>." A subject with no finished page job. */
import { ACTIONS } from "../config";
import { REBUILD_OUTPUTS, rebuildBody, type ChannelTie, type Prior } from "../bodies";
import type { SubjectRef } from "../subject";
import type { RequestKind } from "./kind";

export interface PageInput {
  prior: Prior;
  subject: SubjectRef;
  channels?: ChannelTie[];
  moreChannels?: number;
  /** "Research to start from": up to 10 https links. */
  leads?: string[];
}

export const FIRST_PAGE: RequestKind<PageInput> = {
  id: "first-page",
  label: "Create the page",
  action: ACTIONS.research,
  tagKind: "add",
  instructions: "rebuild",
  body: (i) => rebuildBody(i.prior, i.subject, i.channels ?? [], i.moreChannels ?? 0, { first: true, leads: i.leads ?? [] }),
  price: (read) => read(ACTIONS.research),
  results: REBUILD_OUTPUTS,
};
