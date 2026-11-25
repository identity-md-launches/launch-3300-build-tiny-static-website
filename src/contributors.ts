/**
 * Page contributors: the people who added to Swarmpedia pages (not a project's own team, which Key facts lists as
 * "Project contributors"). Everything is computed in the browser from counted jobs (readable() in useActivity.ts):
 * no new request kind, no wallet needed to view. A contributor is named only by the ENS name the wallet set itself
 * (its reverse record, Activity.ens) or by its short address; never by a real name. Pure, for tests.
 */
import { shortHex } from "./format";
import { isChangesJob, type Activity } from "./useActivity";

export interface ContributorStat {
  /** The wallet, lowercase. */
  address: string;
  /** The wallet's own ENS name, else its short address. */
  name: string;
  /** Notes the swarm added to a page. */
  added: number;
  /** Notes sent in counted changes jobs whose result was read. */
  sent: number;
  /** Open questions a counted changes job closed. */
  answered: number;
  /** Pages with at least one counted changes job from this wallet. */
  pages: number;
}

export interface Funder {
  address: string;
  name: string;
  /** Counted jobs this wallet paid for on the page. */
  jobs: number;
}

/** A wallet's shown name: the ENS name it set itself (reverse record), else its short address. */
export function walletName(address: string, items: Pick<Activity, "ens" | "req">[]): string {
  const a = address.toLowerCase();
  const named = items.find((x) => x.req.payer.toLowerCase() === a && !!x.ens);
  return named?.ens ?? shortHex(a);
}

/** True for a completed changes job whose result was read. Only counted jobs (readable()) are passed in. */
const readChanges = (a: Activity) => isChangesJob(a.req) && a.state === "completed" && !a.notRead && !a.rejected && !!a.changes;

/**
 * Every wallet that sent counted changes, ranked by notes added, then notes sent, then questions answered, then
 * address. `items` are counted jobs; pass one subject's jobs for a page's own list.
 */
export function contributorsOf(items: Activity[]): ContributorStat[] {
  const by = new Map<string, { added: number; sent: number; answered: number; pages: Set<string> }>();
  for (const a of items) {
    if (!readChanges(a)) continue;
    const k = a.req.payer.toLowerCase();
    const s = by.get(k) ?? { added: 0, sent: 0, answered: 0, pages: new Set<string>() };
    const list = a.changes!.items;
    s.sent += list.length;
    s.added += list.filter((i) => i.kept).length;
    s.answered += (a.changes!.questions ?? []).filter((q) => q.op === "close").length;
    s.pages.add(a.req.subject);
    by.set(k, s);
  }
  return [...by]
    .map(([address, s]) => ({ address, name: walletName(address, items), added: s.added, sent: s.sent, answered: s.answered, pages: s.pages.size }))
    .sort((x, y) => y.added - x.added || y.sent - x.sent || y.answered - x.answered || x.address.localeCompare(y.address));
}

/** "14 added of 17". */
export const addedOf = (s: Pick<ContributorStat, "added" | "sent">) => `${s.added.toLocaleString("en-US")} added of ${s.sent.toLocaleString("en-US")}`;

/** The wallets that paid for one page's counted jobs, most jobs first. */
export function fundersOf(items: Activity[], subject: string): Funder[] {
  const by = new Map<string, number>();
  for (const a of items) {
    if (a.req.subject !== subject) continue;
    const k = a.req.payer.toLowerCase();
    by.set(k, (by.get(k) ?? 0) + 1);
  }
  return [...by]
    .map(([address, jobs]) => ({ address, name: walletName(address, items), jobs }))
    .sort((x, y) => y.jobs - x.jobs || x.address.localeCompare(y.address));
}

/** The subjects with a counted changes job: the ones the contributors page reads in full. */
export const changesSubjects = (items: Activity[]): string[] => [...new Set(items.filter((a) => isChangesJob(a.req)).map((a) => a.req.subject))].sort();

/** The Key facts label shown for a row: the project's own "Contributors" read "Project contributors". */
export const shownLabel = (label: string) => (/^contributors$/i.test(label.trim()) ? "Project contributors" : label);

export const CONTRIBUTORS_LINE = "People who added to Swarmpedia pages.";
export const CONTRIBUTORS_TITLE = "Top contributors";
