/** Small display helpers shared by the record, the actions and Activity. */
import { ETHERSCAN, EXPLORER } from "./config";
import type { Activity } from "./useActivity";

export const shortHex = (h: string) => `${h.slice(0, 6)}…${h.slice(-4)}`;
export const payerName = (a: Activity) => a.ens ?? shortHex(a.req.payer);
export const kindName = (k: string) => (k === "proof" ? "Proof" : k === "statement" ? "Statement" : "Claim");
export const jobLink = (jobId: string | null, tx: string) => (jobId ? `${EXPLORER}/jobs/${jobId}` : `${ETHERSCAN}/tx/${tx}`);
/** A safe element id for a record line. */
export const lineAnchor = (id: string) => `line-${id.replace(/[^A-Za-z0-9_-]/g, "-")}`;
