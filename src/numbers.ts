/**
 * Numbers from result files, shown readably: thousands separators, at most 2 decimal places, and at most 4
 * significant digits for values below 1. "59822.623566003452582778 imdUSD" shows as "59,822.62 imdUSD".
 * The arithmetic is on the digit strings (BigInt), so a 30-digit raw supply keeps every digit.
 *
 * Left as written: anything inside a word or hex string (0x addresses, hashes, L12, F1:L3, v2.1, @handle2000), dotted
 * versions (2.19.5), dates and times (2024-05-01, 12/05/2024, 12:30), hyphen-joined ids such as UUIDs, numbers after
 * "block", "#", "id", "nonce" or "chain" (also with a colon: "Block: 26446763", "Request ID: …"), and every whole
 * four-digit number from 1000 to 2999: a year or a plain identifier ("founded 2020", "EIP 1559"). Such a number is
 * a quantity only when a unit or a token symbol follows it directly, or a currency sign comes before it:
 * "2000 seats" reads "2,000 seats", "2500 IMD" reads "2,500 IMD", "$1500" reads "$1,500".
 */

const NUM = /(?<![\p{L}\p{N}_.,:#/@]|[\p{L}\p{N}]-)(\d{1,3}(?:,\d{3})+|\d+)(\.\d+)?(?![\p{L}\p{N}_:/@]|[.,]\d|-[\p{N}a-fA-F])/gu;
const KEEP_AFTER = /(?:\bblocks?|\bid|\bids|\bnonce|\bchain(?:\s*id)?|\bchainid|\btoken\s*id|\bno\.|\bnumber)\s*[:#]?\s*#?\s*$/i;
/**
 * What makes a whole number from 1000 to 2999 a quantity: a unit or a token symbol directly after it ("2000 seats",
 * "2500 IMD", "1200 sIMD", "1500%"). A token symbol has two capitals in a row, perhaps after a short lowercase prefix.
 */
const UNIT_AFTER = new RegExp(
  "^(?:\\s?%|\\s(?:" +
    [
      "seats?", "tokens?", "coins?", "shares?", "units?", "users?", "holders?", "wallets?", "addresses", "accounts?", "members?", "people",
      "persons?", "transactions?", "txs?", "trades?", "swaps?", "nfts?", "items?", "passes", "mints?", "validators?", "nodes?", "pools?",
      "markets?", "projects?", "apps?", "developers?", "contributors?", "employees?", "followers?", "stars?", "downloads?", "votes?",
      "voters?", "proposals?", "days?", "hours?", "minutes?", "seconds?", "weeks?", "months?", "blocks", "gwei", "wei", "ether",
      "dollars?", "euros?", "bps", "basis points?", "percent", "times", "kb", "mb", "gb", "tb", "requests?", "jobs?", "chains?",
      "contracts?", "copies", "editions?", "pieces?", "collectors?", "creators?", "artists?", "customers?", "clients?", "subscribers?",
    ].join("|") +
    ")\\b)",
  "i",
);
/** A token symbol directly after the number: IMD, USDC.e, sIMD, veCRV, $UNI. Case matters here. */
const SYMBOL_AFTER = /^\s\$?[a-z]{0,3}[A-Z]{2,}[A-Za-z0-9.]*(?![a-z])/;
/** A currency sign just before the number: "$1500", "€2000". */
const MONEY_BEFORE = /[$€£¥]\s?$/;
/** Words before a year, which keep it a year even when a symbol follows: "In 2024 IMD launched", "since 2021", "March 2024". */
const YEAR_BEFORE = /(?:\b(?:in|since|until|till|during|early|mid|late|circa|around|before|after|fy|q[1-4]|(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?(?:\s+\d{1,2}(?:st|nd|rd|th)?,?)?)|[(–])\s*$/i;
/** A whole four-digit number from 1000 to 2999 with no separators: a year or identifier unless a unit follows. */
const yearLike = (int: string, frac: string, commas: boolean) => !frac && !commas && /^[12]\d{3}$/.test(int);

const group = (digits: string) => digits.replace(/\B(?=(\d{3})+(?!\d))/g, ",");

/** One number, given its integer digits (no commas) and its fraction digits (no dot). */
export function formatDigits(intRaw: string, frac: string): string {
  const int = intRaw.replace(/^0+(?=\d)/, "");
  if (int !== "0") {
    const scaled = BigInt(int + (frac + "00").slice(0, 2)) + ((frac[2] ?? "0") >= "5" ? 1n : 0n);
    const whole = (scaled / 100n).toString();
    const cents = (scaled % 100n).toString().padStart(2, "0").replace(/0+$/, "");
    return group(whole) + (cents ? `.${cents}` : "");
  }
  const z = frac.search(/[1-9]/);
  if (z < 0) return "0";
  const keep = frac.slice(0, z + 4);
  const up = (frac[z + 4] ?? "0") >= "5" ? 1n : 0n;
  const s = (BigInt(keep) + up).toString().padStart(keep.length, "0");
  if (s.length > keep.length) return "1";
  const out = s.replace(/0+$/, "");
  return out ? `0.${out}` : "0";
}

/** Whether a number as written already meets the rule, so it is shown exactly as the file has it. */
function alreadyShort(int: string, frac: string, commas: boolean): boolean {
  if (int.replace(/^0+(?=\d)/, "") === "0") {
    const z = frac.search(/[1-9]/);
    return z < 0 || frac.length - z <= 4;
  }
  return (commas || int.length <= 3) && frac.length <= 2;
}

/** Every number in a sentence or value, formatted by the rule above; everything else unchanged. */
export function formatNumbers(text: string): string {
  if (!text || !/\d/.test(text)) return text;
  return text.replace(NUM, (match: string, intPart: string, fracPart: string | undefined, offset: number) => {
    const commas = intPart.includes(",");
    const int = intPart.replace(/,/g, "");
    const frac = fracPart ? fracPart.slice(1) : "";
    if (KEEP_AFTER.test(text.slice(Math.max(0, offset - 16), offset))) return match;
    if (yearLike(int, frac, commas)) {
      const after = text.slice(offset + match.length, offset + match.length + 32);
      const before = text.slice(Math.max(0, offset - 2), offset);
      if (YEAR_BEFORE.test(text.slice(Math.max(0, offset - 24), offset))) return match;
      if (!UNIT_AFTER.test(after) && !SYMBOL_AFTER.test(after) && !MONEY_BEFORE.test(before)) return match;
    }
    if (alreadyShort(int, frac, commas)) return match;
    return formatDigits(int, frac);
  });
}
