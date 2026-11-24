/**
 * The pay dialog's sequence, without React, so it can be tested: read the price again, approve when the allowance is
 * short, send the one reviewed request, and wait for its receipt. A Payment holds a synchronous in-flight flag, set
 * before the first read: a second pay() while one runs returns null at once and sends nothing, and the dialog's
 * close paths check `busy` so Escape or a backdrop click cannot remove the dialog of a request still in flight.
 */
import type { Hex } from "viem";
import type { ReceiptStatus } from "./receipt";

export type PayStep = "checking" | "approving" | "approved" | "sending" | "confirming";

export interface PayDeps {
  readPrice: () => Promise<bigint>;
  allowance: () => Promise<bigint>;
  approve: (amount: bigint) => Promise<Hex>;
  request: (amount: bigint) => Promise<Hex>;
  /** Resolves the included receipt's status; null when the wait was abandoned (the dialog went away). */
  receipt: (hash: Hex) => Promise<ReceiptStatus | null>;
  /** True when a rebuild of the same subject is now running: nothing is sent. */
  running: () => boolean;
  /**
   * When given, called as soon as the wallet has signed the request: the caller takes over waiting for Ethereum (the
   * dialog closes at once and the page's bar shows "Sent. Waiting for Ethereum…"), and pay() returns "sent".
   */
  handoff?: (hash: Hex) => void;
}

export type PayOutcome =
  | { kind: "sent"; hash: Hex; amount: bigint }
  | { kind: "price"; price: bigint }
  | { kind: "blocked" }
  | { kind: "error"; message: string }
  | { kind: "gone" };

export const REVERTED = "The transaction reverted before IMD received the request.";
export const APPROVAL_REVERTED = "The approval reverted, so nothing was paid.";
export const DECLINED = "You declined the request in your wallet, so nothing was paid.";
export const NOT_SENT = "The wallet could not send the request, so nothing was paid.";

/** A wallet's refusal (EIP-1193 code 4001, or a message saying so) versus any other failure. */
export function failureText(e: unknown): string {
  const o = e as { code?: unknown; cause?: { code?: unknown }; message?: unknown } | null;
  const code = o?.code ?? o?.cause?.code;
  const text = typeof o?.message === "string" ? o.message : "";
  return code === 4001 || /reject|denied|cancel/i.test(text) ? DECLINED : NOT_SENT;
}

export class Payment {
  private inFlight = false;
  get busy(): boolean {
    return this.inFlight;
  }

  /** Runs one payment of the reviewed price; null when one is already in flight. */
  async pay(reviewed: bigint, deps: PayDeps, onStep: (s: PayStep) => void): Promise<PayOutcome | null> {
    if (this.inFlight) return null;
    this.inFlight = true;
    try {
      if (deps.running()) return { kind: "blocked" };
      onStep("checking");
      // The price is read again at the click; the amount sent is exactly that value.
      const p = await deps.readPrice();
      if (p !== reviewed) return { kind: "price", price: p };
      if (deps.running()) return { kind: "blocked" };
      const a = await deps.allowance();
      if (a < p) {
        onStep("approving");
        const h = await deps.approve(p);
        const ok = await deps.receipt(h);
        if (ok === null) return { kind: "gone" };
        if (ok === "reverted") return { kind: "error", message: APPROVAL_REVERTED };
        onStep("approved");
      } else onStep("sending");
      if (deps.running()) return { kind: "blocked" };
      const h = await deps.request(p);
      if (deps.handoff) {
        deps.handoff(h);
        return { kind: "sent", hash: h, amount: p };
      }
      // Only an included, successful receipt means the Intake received the request.
      onStep("confirming");
      const got = await deps.receipt(h);
      if (got === null) return { kind: "gone" };
      if (got === "reverted") return { kind: "error", message: REVERTED };
      return { kind: "sent", hash: h, amount: p };
    } catch (e) {
      return { kind: "error", message: failureText(e) };
    } finally {
      this.inFlight = false;
    }
  }
}
