/**
 * What the pay dialog takes (an Ask), built from a request kind (src/requests/), and how prices are read. Every paid
 * request the site offers goes through askFor, so its action, body and price are always its kind's own.
 */
import { pad, stringToHex } from "viem";
import { IMD, INTAKE, INTAKE_ABI } from "../config";
import type { InstructionName } from "../instructions";
import { publicClient } from "../reads";
import type { PriceReader, RequestKind } from "./kind";

export const actionId = (a: string) => pad(stringToHex(a), { dir: "right", size: 32 });

/** The Intake's price for an action, in IMD base units. */
export const readPrice: PriceReader = (action) => publicClient.readContract({ address: INTAKE, abi: INTAKE_ABI, functionName: "priceOf", args: [actionId(action), IMD] });

export interface Ask {
  title: string;
  /** The subject the request belongs to; after paying, the site opens its Activity. */
  subject?: string;
  action: string;
  /** What the request is (add, source, proof, statement, claim), remembered with the sent transaction. */
  kind: string;
  /** The request kind (src/requests/) it was built by: "first-page", "rebuild", "changes". */
  kindId?: string;
  body: Record<string, unknown>;
  /** The instruction file the objective names, shown under the body. */
  instructions?: InstructionName;
  warning?: string;
  /** A rebuild (or first page) of `subject`: one at a time, so the review checks for one already running. */
  rebuild?: boolean;
  /** Runs once the request is paid and mined: the tray of changes is emptied. */
  afterSent?: () => void;
  /** Reads what IMD charges for this exact request (its kind's price, src/requests/). */
  price?: () => Promise<bigint>;
}

/** An Ask for a request kind (src/requests/): its action, tag kind, body, instructions and price reading. */
export function askFor<I>(kind: RequestKind<I>, input: I, extra: Pick<Ask, "title"> & Partial<Ask>): Ask {
  return askOf(kind, kind.body(input), extra);
}

/** The same for a body the kind has already built (the tray plans its body as the visitor edits). */
export function askOf<I>(kind: RequestKind<I>, body: Record<string, unknown>, extra: Pick<Ask, "title"> & Partial<Ask>): Ask {
  return { action: kind.action, kind: kind.tagKind, kindId: kind.id, body, instructions: kind.instructions, price: () => kind.price(readPrice, body), ...extra };
}

/** What IMD charges for this exact request: the kind's own price reading, else the Intake's price for its action. */
export const priceOfAsk = (a: Pick<Ask, "action" | "price">): Promise<bigint> => (a.price ? a.price() : readPrice(a.action));

/**
 * The price the page showed for each kind, from its last read. The exact price is read again before a pay dialog
 * opens; when that differs from what the page showed, the dialog says so before the wallet is asked.
 */
const shown = new Map<string, bigint>();
const shownKey = (a: Pick<Ask, "action" | "kindId">) => a.kindId ?? a.action;
export const noteShownPrice = (a: Pick<Ask, "action" | "kindId">, p: bigint) => void shown.set(shownKey(a), p);
export const shownPrice = (a: Pick<Ask, "action" | "kindId">): bigint | undefined => shown.get(shownKey(a));

/** Why a pay dialog did not open, or the price it opens with. */
export type Prepared =
  | { kind: "open"; price: bigint }
  /** Its instruction file could not be fetched with a matching sha256. */
  | { kind: "instructions" }
  /** The price could not be read. */
  | { kind: "price" }
  /** A first page was asked for and Ethereum could not be read again. */
  | { kind: "chain" }
  /** A first page was asked for a subject that has a finished page job. */
  | { kind: "exists" }
  /** A first page was asked for while one is running. */
  | { kind: "running" };

export interface PrepareDeps {
  instructionsOk: (a: Ask) => Promise<boolean>;
  price: (a: Ask) => Promise<bigint>;
  /** For a first page only: the subject's page jobs after reading Ethereum again; null when it could not be read. */
  fresh: (subject: string) => Promise<{ finished: boolean; running: boolean } | null>;
}

/** Everything checked before a pay dialog opens: a first page against a fresh scan, the instruction file, the price. */
export async function prepareAsk(a: Ask, deps: PrepareDeps): Promise<Prepared> {
  if (a.kindId === "first-page" && a.subject) {
    const now = await deps.fresh(a.subject).catch(() => null);
    if (!now) return { kind: "chain" };
    if (now.finished) return { kind: "exists" };
    if (now.running) return { kind: "running" };
  }
  const [ok, price] = await Promise.all([deps.instructionsOk(a), deps.price(a).catch(() => null)]);
  if (!ok) return { kind: "instructions" };
  return price === null ? { kind: "price" } : { kind: "open", price };
}

