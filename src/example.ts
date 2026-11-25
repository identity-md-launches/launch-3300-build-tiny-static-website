/**
 * Home's live example: one fact that a proof, a statement and a claim of the same record all assert. Pure, for tests.
 *
 * Lines are grouped by the fact they assert, not by shared words: a fact is its subject (a named pool or pair, a
 * version, the tokens and the contract it names), its predicate (a metric such as a supply, a fee or value locked, or
 * an event such as a launch), its value (an amount of a token, a percentage, a dollar figure or a number; for an event,
 * its date), its qualifiers (circulating, maximum, initial…), its network and its time. Three lines are one fact only
 * when all of these agree: a named pool or version must be the same on all three, and so must a date, to the day
 * when one is given ("1 March 2024" and "2 March 2024" are different facts). A network, contract or token a line
 * leaves out never conflicts with one another line gives, but a supply qualifier must be the same on all three.
 * A statement and a claim that each link to the proof as confirms are one fact with it whenever their details agree.
 */
import type { Line } from "./page";
import { settleAll } from "./settle";

export interface Example {
  claim: string;
  statement: string;
  proof: string;
  /** The proof's line id on its record, so Docs can link to its re-run steps. */
  proofId?: string;
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
const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const MONTH = String.raw`(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|June?|July?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)`;
const Y = String.raw`((?:19|20)\d{2})`;
const DAY = String.raw`(\d{1,2})(?:st|nd|rd|th)?`;
const monthOf = (m: string) => String(MONTHS.indexOf(m.slice(0, 3).toLowerCase()) + 1).padStart(2, "0");
const pad = (d: string) => d.padStart(2, "0");
/** Date forms, most precise first; each turns its match into "YYYY-MM-DD", "YYYY-MM", "YYYY-Qn" or "YYYY". */
const DATE_FORMS: [RegExp, (m: RegExpExecArray) => string][] = [
  [new RegExp(String.raw`\b${Y}-(\d{2})-(\d{2})\b`, "g"), (m) => `${m[1]}-${m[2]}-${m[3]}`],
  [new RegExp(String.raw`\b${DAY}\s+(?:of\s+)?${MONTH}\.?,?\s+${Y}\b`, "gi"), (m) => `${m[3]}-${monthOf(m[2]!)}-${pad(m[1]!)}`],
  [new RegExp(String.raw`\b${MONTH}\.?\s+${DAY},?\s+${Y}\b`, "gi"), (m) => `${m[3]}-${monthOf(m[1]!)}-${pad(m[2]!)}`],
  [new RegExp(String.raw`\b${Y}-(\d{2})\b(?!-)`, "g"), (m) => `${m[1]}-${m[2]}`],
  [new RegExp(String.raw`\b${MONTH}\.?,?\s+(?:of\s+)?${Y}\b`, "gi"), (m) => `${m[2]}-${monthOf(m[1]!)}`],
  [new RegExp(String.raw`\b(Q[1-4])\s+${Y}\b`, "gi"), (m) => `${m[2]}-${m[1]!.toUpperCase()}`],
  [new RegExp(String.raw`\b${Y}\b`, "g"), (m) => m[1]!],
];
/** Every date a sentence gives, each at its own precision, and the sentence with those dates blanked out. */
export function datesIn(text: string): { dates: string[]; rest: string } {
  let rest = text;
  const dates: string[] = [];
  for (const [re, as] of DATE_FORMS)
    rest = rest.replace(re, (...args) => {
      const groups = args.slice(0, -2) as string[];
      dates.push(as(Object.assign(groups, { index: 0, input: "" }) as unknown as RegExpExecArray));
      return " ";
    });
  return { dates: uniq(dates), rest };
}
/** A named pool or pair ("ETH/USDC", "WBTC-USDT pool"), written as its two symbols in order. */
const PAIR = /(?<![\w/])\$?([A-Za-z]{0,3}[A-Z]{2,}[A-Za-z0-9.]{0,6})\s?[/-]\s?\$?([A-Za-z]{0,3}[A-Z]{2,}[A-Za-z0-9.]{0,6})(?![\w/])/g;
/** A product version ("Uniswap v3", "V4"). */
const VERSION = /\b[vV](\d+(?:\.\d+)?)\b/g;
/** Ticker-like words that name a token (UNI, ETH, ZORA), not abbreviations of a metric or a standard. */
const TICKER = /(?<![\w$.-])\$?([A-Z][A-Z0-9]{1,9})(?![\w-])/g;
const NOT_TICKER = new Set(["TVL", "APY", "APR", "USD", "ERC", "EVM", "DAO", "NFT", "NFTS", "API", "ID", "URL", "FAQ", "CEO", "CTO", "DEX", "AMM", "UI", "UX", "AI", "PDF", "SDK", "L1", "L2", "OP", "BNB", "UTC", "GMT", "US", "EU", "UK", "IPO", "KYC", "DNS", "ENS", "IPFS", "MEV", "LP", "LPS", "CEX", "Q1", "Q2", "Q3", "Q4", "V1", "V2", "V3", "V4"]);
/** Events a fact can be about: its value is then the date. */
const EVENTS: [string, RegExp][] = [
  ["launch", /\b(?:launch(?:ed|es)?|went live|goes live|go live|released|debuted|introduced|went to mainnet)\b/i],
  ["founded", /\b(?:founded|established|incorporated)\b/i],
  ["deployed", /\b(?:deployed|deployment)\b/i],
  ["acquired", /\b(?:acquired|acquisition)\b/i],
  ["shutdown", /\b(?:shut down|sunset|deprecated|retired|discontinued|ended)\b/i],
  ["audit", /\baudit(?:ed)?\b/i],
  ["upgrade", /\b(?:upgraded|upgrade|migrated|migration)\b/i],
];
const ADDRESS = /0x[0-9a-fA-F]{40}/g;

export interface FactKey {
  /** The predicate: metrics ("fee", "supply"…), then events ("launch"…), in that order. */
  metrics: string[];
  /** The events among metrics: a fact about one of these takes its date as its value. */
  events: string[];
  /** Named pools or pairs, each as "A/B". */
  pairs: string[];
  /** Product versions ("3" for v3). */
  versions: string[];
  /** Token symbols the sentence names, outside its publisher. */
  symbols: string[];
  /** Every date the sentence gives, each at its own precision ("2024-03-01", "2021-05", "2021"). */
  dates: string[];
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
  // Dates are a time, not a value: "1 March 2024" gives no number 1.
  const { dates, rest } = datesIn(t);
  const events = EVENTS.filter(([, re]) => re.test(t)).map(([n]) => n);
  const pairs = uniq([...t.matchAll(PAIR)].map((m) => `${m[1]!.toUpperCase()}/${m[2]!.toUpperCase()}`));
  return {
    metrics: [...METRICS.filter(([, re]) => re.test(text)).map(([n]) => n), ...events],
    events,
    pairs,
    versions: uniq([...t.matchAll(VERSION)].map((m) => m[1]!)),
    symbols: uniq([...t.replace(ADDRESS, " ").matchAll(TICKER)].map((m) => m[1]!).filter((x) => !NOT_TICKER.has(x) && /[A-Z]{2}/.test(x))),
    dates,
    values: valuesIn(rest),
    kinds: KINDS.filter(([, re]) => re.test(t)).map(([n]) => n).join(","),
    networks: uniq([...text.matchAll(NETWORK)].map((m) => m[1]!.toLowerCase().replace(/\s+(?:one|pos|network|era)$/, "").replace(/^op mainnet$/, "optimism").replace(/^bsc$/, "bnb chain"))),
    times: uniq([...[...text.matchAll(PERIOD)].map((m) => m[1]!.toLowerCase().replace(/^(?:per|a) /, "").replace(/^(?:24[- ]?hours?|24h|day)$/, "daily").replace(/^(?:annual(?:ly)?|year)$/, "yearly").replace(/^week$/, "weekly").replace(/^month$/, "monthly"))]),
    contracts: uniq([...text.matchAll(ADDRESS)].map((m) => m[0].toLowerCase())),
  };
}

/** Two optional qualifiers agree when either leaves it out or both give the same. */
const agree = (a: string[], b: string[]) => !a.length || !b.length || same(a, b);
const same = (a: string[], b: string[]) => a.length === b.length && a.every((x, i) => x === b[i]);

/**
 * True when two lines' details agree: the same named pools and versions (a line that names a pool is about that pool
 * only), the same dates to the precision given, the same supply qualifier, and no different network, period, contract
 * or token symbols.
 */
export function detailsAgree(a: FactKey, b: FactKey): boolean {
  return (
    same(a.pairs, b.pairs) &&
    same(a.versions, b.versions) &&
    agree(a.dates, b.dates) &&
    a.kinds === b.kinds &&
    agree(a.networks, b.networks) &&
    agree(a.times, b.times) &&
    agree(a.contracts, b.contracts) &&
    agree(a.symbols, b.symbols)
  );
}

/** The metric and value three keys share, or null when they do not assert one fact. */
export function sharedFact(keys: FactKey[]): { metric: string; value: string } | null {
  const [first, ...rest] = keys;
  if (!first) return null;
  for (let i = 0; i < keys.length; i++)
    for (let j = i + 1; j < keys.length; j++) {
      const a = keys[i]!;
      const b = keys[j]!;
      if (!detailsAgree(a, b)) return null;
    }
  const metric = first.metrics.find((m) => rest.every((k) => k.metrics.includes(m)));
  if (!metric) return null;
  // An event (a launch…) is one fact only when every line gives its date, and the same one.
  if (first.events.includes(metric)) {
    const date = first.dates[0];
    if (!date || first.dates.length !== 1 || !rest.every((k) => same(k.dates, first.dates))) return null;
    return { metric, value: date };
  }
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
    .map((l) => ({ id: l.id, links: l.links ?? [], kind: l.kind, text: l.text.trim(), key: factKeyOf(l.text, l.kind) }))
    .filter((x) => x.key.metrics.length && (x.key.values.length || (x.key.events.length && x.key.dates.length)));
  const of = (kind: string) => ok.filter((x) => x.kind === kind);
  const claims = of("claim");
  const statements = of("statement");
  // An explicit link first: a statement and a claim that each name the proof as confirming them (or the claim the
  // statement), with no detail that disagrees.
  const confirms = (x: (typeof ok)[number], target: string) => x.links.some((k) => k.type === "confirms" && k.target === target);
  for (const p of of("proof"))
    for (const s of statements.filter((x) => confirms(x, p.id))) {
      const c = claims.find((x) => (confirms(x, p.id) || confirms(x, s.id)) && [p, s, x].every((a, i, all) => all.slice(i + 1).every((b) => detailsAgree(a.key, b.key))));
      if (c && detailsAgree(p.key, s.key)) return { claim: c.text, statement: s.text, proof: p.text, proofId: p.id };
    }
  // Else a text match: the same subject, predicate, value and date on all three.
  for (const p of of("proof"))
    for (const s of statements) {
      if (!sharedFact([p.key, s.key])) continue;
      const c = claims.find((x) => sharedFact([p.key, s.key, x.key]));
      if (c) return { claim: c.text, statement: s.text, proof: p.text, proofId: p.id };
    }
  return null;
}
