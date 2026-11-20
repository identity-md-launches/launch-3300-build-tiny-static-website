/**
 * The standing instructions of each job template, published as immutable static files on this site at
 * /instructions/<name>-<first 12 hex characters of their sha256>.txt (scripts/instructions.ts writes them and
 * src/instructions.json). The objective only names the file and its hash; the job fetches it first.
 */
import rebuildText from "../templates/instructions/rebuild.txt?raw";
import changesText from "../templates/instructions/changes.txt?raw";
import manifest from "./instructions.json";
import { INSTRUCTIONS_GATEWAY } from "./config";

export type InstructionName = "rebuild" | "changes";
export interface Instructions {
  name: InstructionName;
  /** The file's exact text, the bytes the hash is of. */
  text: string;
  file: string;
  sha256: string;
  /**
   * Where a job fetches it: the file's content address at an HTTPS gateway that serves bytes directly (see
   * INSTRUCTIONS_GATEWAY), named after the published file. The address is derived from the sha256, so it can
   * never serve other bytes.
   */
  url: string;
  /** The same file on this site, relative to the page: ./instructions/<name>-<hash12>.txt. */
  path: string;
}

const B32 = "abcdefghijklmnopqrstuvwxyz234567";
/**
 * The CIDv1 (raw codec 0x55, sha2-256 multihash) of a file from its sha256 hex: how IPFS addresses a file of one
 * block imported with raw leaves, as this site's files are. "b" + base32 of 01 55 12 20 <digest>.
 */
export function rawCid(sha256: string): string {
  if (!/^[0-9a-f]{64}$/.test(sha256)) throw new Error("rawCid: expected a sha256 in hex");
  const bytes = [0x01, 0x55, 0x12, 0x20, ...(sha256.match(/../g) ?? []).map((h) => parseInt(h, 16))];
  let out = "b";
  let bits = 0;
  let v = 0;
  for (const x of bytes) {
    v = ((v << 8) | x) & 0xffff;
    bits += 8;
    while (bits >= 5) {
      out += B32[(v >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits) out += B32[(v << (5 - bits)) & 31];
  return out;
}

/** The address a job fetches an instruction file from (see Instructions.url). */
export const fetchUrlOf = (file: string, sha256: string) => `${INSTRUCTIONS_GATEWAY}${rawCid(sha256)}?filename=${file}`;

const of = (name: InstructionName, text: string): Instructions => ({
  name,
  text,
  file: manifest[name].file,
  sha256: manifest[name].sha256,
  url: fetchUrlOf(manifest[name].file, manifest[name].sha256),
  path: `./instructions/${manifest[name].file}`,
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
