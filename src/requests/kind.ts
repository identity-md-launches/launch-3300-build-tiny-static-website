/**
 * One module per request kind (src/requests/firstPage.ts, rebuild.ts, changes.ts). A kind says everything the site
 * needs to sell it, so a new kind is one new module and touches no other: its Intake action, how it builds its body,
 * how its price is read for that exact request, and which result files the site reads from the finished job.
 */
import type { InstructionName } from "../instructions";

/** Reads the Intake's price for an action in IMD (priceOf(action, IMD)), in IMD base units (18 decimals). */
export type PriceReader = (action: string) => Promise<bigint>;

export interface ResultFile {
  /** The output name in the body ("page", "logo", "changes"). The first file of a kind is its result file. */
  name: string;
  path: string;
  mediaType: string;
}

export interface RequestKind<Input> {
  /** Stable id of the kind. */
  id: string;
  /** What the pay dialog calls it. */
  label: string;
  /** The Intake action the request is sent to. */
  action: string;
  /** The tag kind the job check groups it under ({"app":"rec-test-1","kind":…}). */
  tagKind: string;
  /** The instruction file its objective names, when it names one. */
  instructions?: InstructionName;
  /** The exact body sent to the Intake. */
  body(input: Input): Record<string, unknown>;
  /**
   * What IMD charges for this exact request, read just before the pay dialog shows it and again at the click. Never a
   * fixed number. The Intake's priceOf for the action is the price; IMD's quote route (POST /requests/quote) answers
   * a keyless browser with "request_token_required" (checked 2026-11-24), so no kind sold here applies one.
   */
  price(read: PriceReader, body?: Record<string, unknown>): Promise<bigint>;
  /** The result files the site reads from the finished job, the result file itself first. */
  results: readonly ResultFile[];
}
