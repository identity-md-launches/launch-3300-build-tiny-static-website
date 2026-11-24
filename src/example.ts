/**
 * Home's live example: one fact that a proof, a statement and a claim of the same record all assert. Pure, for tests.
 *
 * Lines are grouped by the fact they assert, not by shared words: a fact is its metric (a supply, a fee, value
 * locked…), its value (an amount of a token, a percentage, a dollar figure or a number), its qualifiers (circulating,
 * maximum, initial…), its network, its time and the contract it names. Three lines are one fact only when all of
 * these agree; a qualifier a line leaves out never conflicts with a network or a time another line gives, but a
 * supply qualifier (circulating, maximum…) must be the same on all three.
 */
import type { Line } from "./page";
import { settleAll } from "./settle";

export interface Example {
  claim: string;
  statement: string;
  proof: string;
}

const WORDS: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 };
const SCALE: Record<string, number> = { thousand: 1e3, million: 1e6, billion: 1e9, trillion: 1e12, k: 1e3, m: 1e6, bn: 1e9 };
const NUM = String.raw`(\d[\d,]*(?:\.\d+)?|one|two|three|four|five|six|seven|eight|nine|ten)`;
const AMOUNT = new RegExp(String.raw`(?<![\w.,])${NUM}(?:\s+(million|billion|trillion))?\s+\$?([A-Za-z]{0,4}[A-Z]{2,}[A-Za-z0-9.]*[A-Za-z0-9])`, "g");
const PERCENT = /(?<![\w.,])(\d+(?:\.\d+)?)\s?(?:%|percent\b)/gi;
const DOLLARS = /\$\s?(\d[\d,]*(?:\.\d+)?)(?:\s*(thousand|million|billion|trillion|bn|k|m)\b)?/gi;
const PLAIN = new RegExp(String.raw`(?<![\w.,$])${NUM}(?:\s+(thousand|million|billion|trillion))?(?![\w%]|\.\d)`, "gi");

const numberOf = (n: string, scale?: string) => (WORDS[n.toLowerCase()] ?? Number(n.replace(/,/g, ""))) * (scale ? SCALE[scale.toLowerCase()] ?? 1 : 1);
const isYear = (n: number, raw: string) => Number.isInteger(n) && n >= 1990 && n <= 2099 && /^\d{4}$/.test(raw);

/** Every token amount a sentence gives, as "<symbol> <number>": "ten billion ZORA" and "10,000,000,000 ZORA" are one. */
export function amountsIn(text: string): string[] {
  return [...text.matchAll(AMOUNT)].flatMap((m) => {
    const n = numberOf(m[1]!, m[2]);
    return Number.isFinite(n) && n > 0 ? [`${m[3]} ${n}`] : [];
  });
}

/**
 * Every value a sentence gives: token amounts ("UNI 1000000000"), percentages ("% 0.3"), dollar figures
 * ("$ 4200000000") and other numbers ("n 1000000000"). Years are a time, not a value.
 */
export function valuesIn(text: string): string[] {
  const out = new Set<string>(amountsIn(text));
  for (const m of text.matchAll(PERCENT)) out.add(`% ${Number(m[1])}`);
  for (const m of text.matchAll(DOLLARS)) out.add(`$ ${numberOf(m[1]!, m[2])}`);
  // A number already read as a percentage or a dollar figure is not also a bare number.
  const rest = text.replace(PERCENT, " ").replace(DOLLARS, " ");
  for (const m of rest.matchAll(PLAIN)) {
    const n = numberOf(m[1]!, m[2]);
    if (Number.isFinite(n) && n > 0 && !isYear(n, m[1]!)) out.add(`n ${n}`);
  }
  // A token amount also counts as its bare number, so "1 billion" matches "1,000,000,000 UNI" of the same token
  // only through the shared number; two different tokens never share a token amount.
  for (const v of [...out]) if (!/^[%$n] /.test(v)) out.add(`n ${v.split(" ").pop()}`);
  return [...out];
}

/** The kinds of fact an example can be: the first word group names the metric. */
const METRICS: [string, RegExp][] = [
  ["supply", /\bsupply\b/i],
  ["fee", /\bfees?\b|\bfee tier\b/i],
  ["locked", /\bvalue locked\b|\btvl\b|\bdeposits?\b/i],
  ["volume", /\bvolume\b/i],
  ["users", /\b(?:users|wallets|holders|addresses)\b/i],
  ["decimals", /\bdecimals\b/i],
  ["threshold", /\b(?:threshold|signers|signatures)\b|\bof\s+\d+\s+(?:owners|signers)\b/i],
  ["reward", /\b(?:rewards?|emissions?|yield|apy|apr)\b/i],
  ["price", /\b(?:costs?|price|priced|charges?)\b/i],
];
/** Qualifiers that make a different figure of the same metric: these must be the same on all three lines. */
const KINDS: [string, RegExp][] = [
  ["circulating", /\bcirculating\b/i],
  ["maximum", /\b(?:max(?:imum)?|capped|hard cap|cap of|at most|up to)\b/i],
  ["initial", /\b(?:initial(?:ly)?|at launch|genesis)\b/i],
  ["locked", /\b(?:locked|vested|vesting|unlocked)\b/i],
  ["staked", /\bstaked\b/i],
  ["burned", /\bburn(?:ed|t)?\b/i],
  ["share", /\b(?:of (?:the |its )?(?:total )?supply|allocated|reserved|share of)\b/i],
];
const NETWORK = /\b(?:on|in|across)\s+(?:the\s+)?(Ethereum|Base|Arbitrum(?: One)?|Optimism|OP Mainnet|Polygon(?: PoS)?|Solana|BNB Chain|BSC|Avalanche|Zora(?: Network)?|Unichain|Blast|Linea|Scroll|zkSync(?: Era)?|Gnosis|Celo|Mantle|Sepolia|Goerli|Holesky|devnet|testnet|mainnet)\b/gi;
const PERIOD = /\b(daily|weekly|monthly|yearly|annual(?:ly)?|24[- ]?hours?|24h|per (?:day|week|month|year)|a (?:day|week|month|year))\b/gi;
const YEAR = /\b(?:19|20)\d{2}\b/g;
const ADDRESS = /0x[0-9a-fA-F]{40}/g;

export interface FactKey {
  metrics: string[];
  values: string[];
  kinds: string;
  networks: string[];
  times: string[];
  contracts: string[];
}

/** Drops "DefiLlama says that", "Uniswap's docs state", "According to X," so the fact itself is compared. */
export function withoutPublisher(text: string): string {
  const t = text.trim();
  const said = /^(?:[^.;:]{0,80}?)\b(?:says|said|states|stated|reports|reported|writes|wrote|notes|noted|lists|listed|shows|showed|puts|put|gives|gave|puts|publishes|published|confirms|confirmed|estimates|estimated)(?:\s+that)?\s+/i.exec(t);
  if (said && said[0].split(/\s+/).length <= 10) return t.slice(said[0].length);
  const per = /^(?:according to|per)\s+[^,]{1,60},\s*/i.exec(t);
  return per ? t.slice(per[0].length) : t;
}

const uniq = (xs: string[]) => [...new Set(xs)].sort();
export function factKeyOf(text: string, kind = "claim"): FactKey {
  // A statement's or claim's publisher ("CoinGecko says", "The supply page reports") is not part of the fact: its
  // values and qualifiers are read after it. A proof has no publisher. The metric, network, time and contract are
  // read from the whole sentence ("The UNI contract on Ethereum reports a total supply …" names them before the verb).
  const t = kind === "proof" ? text : withoutPublisher(text);
  return {
    metrics: METRICS.filter(([, re]) => re.test(text)).map(([n]) => n),
    values: valuesIn(t),
    kinds: KINDS.filter(([, re]) => re.test(t)).map(([n]) => n).join(","),
    networks: uniq([...text.matchAll(NETWORK)].map((m) => m[1]!.toLowerCase().replace(/\s+(?:one|pos|network|era)$/, "").replace(/^op mainnet$/, "optimism").replace(/^bsc$/, "bnb chain"))),
    times: uniq([...[...text.matchAll(YEAR)].map((m) => m[0]), ...[...text.matchAll(PERIOD)].map((m) => m[1]!.toLowerCase().replace(/^(?:per|a) /, "").replace(/^(?:24[- ]?hours?|24h|day)$/, "daily").replace(/^(?:annual(?:ly)?|year)$/, "yearly").replace(/^week$/, "weekly").replace(/^month$/, "monthly"))]),
    contracts: uniq([...text.matchAll(ADDRESS)].map((m) => m[0].toLowerCase())),
  };
}

/** Two optional qualifiers agree when either leaves it out or both give the same. */
const agree = (a: string[], b: string[]) => !a.length || !b.length || (a.length === b.length && a.every((x, i) => x === b[i]));

/** The metric and value three keys share, or null when they do not assert one fact. */
export function sharedFact(keys: FactKey[]): { metric: string; value: string } | null {
  const [first, ...rest] = keys;
  if (!first) return null;
  for (let i = 0; i < keys.length; i++)
    for (let j = i + 1; j < keys.length; j++) {
      const a = keys[i]!;
      const b = keys[j]!;
      if (a.kinds !== b.kinds || !agree(a.networks, b.networks) || !agree(a.times, b.times) || !agree(a.contracts, b.contracts)) return null;
    }
  const metric = first.metrics.find((m) => rest.every((k) => k.metrics.includes(m)));
  if (!metric) return null;
  // The most specific shared value: a token amount, then a percentage or dollar figure, then a bare number.
  const shared = first.values.filter((v) => rest.every((k) => k.values.includes(v)));
  const value = shared.find((v) => !/^[%$n] /.test(v)) ?? shared.find((v) => /^[%$] /.test(v)) ?? shared[0];
  if (!value) return null;
  // A token amount that one line gives for another token is a different fact.
  const tokens = (k: FactKey) => uniq(k.values.filter((v) => !/^[%$n] /.test(v)).map((v) => v.split(" ")[0]!));
  if (!keys.every((k, i) => keys.slice(i + 1).every((o) => agree(tokens(k), tokens(o))))) return null;
  return { metric, value };
}

const LONGEST = 160;

/**
 * A proof, a statement and a claim of one record that assert the same fact (sharedFact). A contradicted or superseded
 * line is never used. The first proof, in record order, with a matching statement and claim wins. Null when the record
 * has no such three.
 */
export function exampleOf(lines: Line[]): Example | null {
  const settled = settleAll(lines);
  const ok = lines
    .filter((l) => {
      const s = settled.by.get(l.id)?.state;
      return l.text.trim().length <= LONGEST && s !== "contradicted" && s !== "outdated";
    })
    .map((l) => ({ kind: l.kind, text: l.text.trim(), key: factKeyOf(l.text, l.kind) }))
    .filter((x) => x.key.metrics.length && x.key.values.length);
  const of = (kind: string) => ok.filter((x) => x.kind === kind);
  const claims = of("claim");
  const statements = of("statement");
  for (const p of of("proof"))
    for (const s of statements) {
      if (!sharedFact([p.key, s.key])) continue;
      const c = claims.find((x) => sharedFact([p.key, s.key, x.key]));
      if (c) return { claim: c.text, statement: s.text, proof: p.text };
    }
  return null;
}
