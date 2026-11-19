/** Small display helpers shared by the record, the actions and Activity. */
import { ETHERSCAN, EXPLORER } from "./config";
import type { Activity } from "./useActivity";

export const shortHex = (h: string) => `${h.slice(0, 6)}…${h.slice(-4)}`;
export const payerName = (a: Activity) => a.ens ?? shortHex(a.req.payer);
export const kindName = (k: string) => (k === "proof" ? "Proof" : k === "statement" ? "Statement" : "Claim");
export const jobLink = (jobId: string | null, tx: string) => (jobId ? `${EXPLORER}/jobs/${jobId}` : `${ETHERSCAN}/tx/${tx}`);
/** The tie words shown to visitors, for the page's strong, weak and none. */
export const TIE_WORDS: Record<string, string> = { strong: "confirmed on chain", weak: "names the contract", none: "not confirmed" };
export const tieWord = (t: string) => TIE_WORDS[t] ?? TIE_WORDS.none!;
/** A safe element id for a record line. */
export const lineAnchor = (id: string) => `line-${id.replace(/[^A-Za-z0-9_-]/g, "-")}`;
