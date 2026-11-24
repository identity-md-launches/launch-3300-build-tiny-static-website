/** Changes: "Check changes to the Swarmpedia page for <subject id>." The tray's changes, one job per submit. */
import { ACTIONS } from "../config";
import type { ChannelTie, Prior } from "../bodies";
import { CHANGES_OUTPUTS, changesBody, type Change, type RefOf } from "../changes";
import type { SubjectRef } from "../subject";
import type { RequestKind } from "./kind";

export interface ChangesInput {
  changes: Change[];
  prior: Prior;
  channels: ChannelTie[];
  subject: SubjectRef;
  refOf: RefOf;
  moreChannels?: number;
}

export const CHANGES: RequestKind<ChangesInput> = {
  id: "changes",
  label: "Submit changes",
  action: ACTIONS.research,
  tagKind: "changes",
  instructions: "changes",
  body: (i) => changesBody(i.changes, i.prior, i.channels, i.subject, i.refOf, i.moreChannels ?? 0),
  price: (read) => read(ACTIONS.research),
  results: CHANGES_OUTPUTS,
};
