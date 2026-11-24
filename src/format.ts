/** Small display helpers shared by the record, the actions and Activity. */
import { ETHERSCAN, EXPLORER } from "./config";
import type { Activity } from "./useActivity";

import { shortAddr } from "./addr";

/** A short address or hash: "0x0…" and the last 6 for a vanity address with four or more leading zeros. */
export const shortHex = (h: string) => shortAddr(h);
export const payerName = (a: Activity) => a.ens ?? shortHex(a.req.payer);
export const kindName = (k: string) => (k === "proof" ? "Proof" : k === "statement" ? "Statement" : "Claim");
export const jobLink = (jobId: string | null, tx: string) => (jobId ? `${EXPLORER}/jobs/${jobId}` : `${ETHERSCAN}/tx/${tx}`);
/** A safe element id for a record line. */
export const lineAnchor = (id: string) => `line-${id.replace(/[^A-Za-z0-9_-]/g, "-")}`;
