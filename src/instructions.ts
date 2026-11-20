/**
 * The standing instructions of each job template, published as immutable static files on this site at
 * /instructions/<name>-<first 12 hex characters of their sha256>.txt (scripts/instructions.ts writes them and
 * src/instructions.json). The objective only names the file and its hash; the job fetches it first.
 */
import rebuildText from "../templates/instructions/rebuild.txt?raw";
import changesText from "../templates/instructions/changes.txt?raw";
import manifest from "./instructions.json";
import { INSTRUCTIONS_BASE } from "./config";

export type InstructionName = "rebuild" | "changes";
export interface Instructions {
  name: InstructionName;
  /** The file's exact text, the bytes the hash is of. */
  text: string;
  file: string;
  sha256: string;
  /** Where a job fetches it: the site itself, by its ENS name through a public gateway (see INSTRUCTIONS_BASE). */
  url: string;
}

const of = (name: InstructionName, text: string): Instructions => ({
  name,
  text,
  file: manifest[name].file,
  sha256: manifest[name].sha256,
  url: `${INSTRUCTIONS_BASE}instructions/${manifest[name].file}`,
});

/** The file's paragraphs (blank-line separated), as the site shows them. */
export const paragraphsOf = (text: string) => text.trim().split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);

export const INSTRUCTIONS: Record<InstructionName, Instructions> = { rebuild: of("rebuild", rebuildText), changes: of("changes", changesText) };

/** The sentence every new objective names its instruction file in, and how it is read back. */
const NAMED = /Your full instructions are the file at (\S+), sha256 ([0-9a-f]{64})\./;
/** The instruction file an objective names, or null for an objective sent before instruction files. */
export function instructionsOf(objective: unknown): { url: string; sha256: string } | null {
  if (typeof objective !== "string") return null;
  const m = NAMED.exec(objective);
  return m ? { url: m[1]!, sha256: m[2]! } : null;
}
