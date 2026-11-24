/**
 * Which key facts entries and record lines are a test or past, so the site can tag them and place them after the
 * live ones. Pure, for tests.
 */
/** A test network's name (the same words as TEST_NETWORK in page.ts, kept here so this file imports nothing). */
const TEST_NETWORK = /\b(?:test[- ]?nets?|test networks?|devnets?|sepolia|goerli|g[öo]rli|holesky|hoodi|ropsten|rinkeby|kovan|fuji|mumbai|amoy|chiado|alfajores|shasta|nile)\b/i;

export type Liveness = "live" | "test" | "past";
const PAST = /\b(?:retired|deprecated|discontinued|sunset(?:ted)?|shut down|no longer (?:developed|maintained|active|live)|wound down|defunct|legacy|past)\b/i;

/** A status a result wrote ("live", "test", "testnet", "past", "retired"…); null for none. */
export function statusWord(v: unknown): Liveness | null {
  if (typeof v !== "string") return null;
  const s = v.trim().toLowerCase();
  if (s === "live" || s === "active" || s === "mainnet") return "live";
  if (/^(?:test|testnet|test network|pilot|devnet)$/.test(s)) return "test";
  if (/^(?:past|retired|ended|deprecated|discontinued|sunset)$/.test(s)) return "past";
  return null;
}

/** An entry's status: the one it gives, else from its words and chain (a test network, or a retired product). */
export function livenessOf(e: { status?: Liveness | null; text?: string; name?: string; chain?: string }): Liveness {
  if (e.status) return e.status;
  const words = `${e.name ?? ""} ${e.text ?? ""} ${e.chain ?? ""}`;
  if (TEST_NETWORK.test(words)) return "test";
  if (PAST.test(`${e.name ?? ""} ${e.text ?? ""}`)) return "past";
  return "live";
}

export const LIVENESS_TAG: Record<Exclude<Liveness, "live">, string> = { test: "test network", past: "past" };

/** Live entries first, then test, then past, each group in its own order. */
export function liveFirst<T>(list: T[], of: (x: T) => Liveness): T[] {
  const rank = { live: 0, test: 1, past: 2 } as const;
  return list.map((x, i) => ({ x, i, r: rank[of(x)] })).sort((a, b) => a.r - b.r || a.i - b.i).map((v) => v.x);
}
