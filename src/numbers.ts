/**
 * Numbers from result files, shown readably: thousands separators, at most 2 decimal places, and at most 4
 * significant digits for values below 1. "59822.623566003452582778 imdUSD" shows as "59,822.62 imdUSD".
 * The arithmetic is on the digit strings (BigInt), so a 30-digit raw supply keeps every digit.
 *
 * Left as written: anything inside a word or hex string (0x addresses, hashes, L12, F1:L3, v2.1), dotted versions
 * (2.19.5), dates and times (2024-05-01, 12:30), hyphen-joined ids such as UUIDs, numbers after "block", "#", "id",
 * "nonce" or "chain" (also with a colon: "Block: 26445600", "Request ID: …"), and four-digit years (1800 to 2199)
 * where a date is meant: after "in", "since", "until", a month and the like, or in "(2021)". "2000 tokens" is a
 * quantity and reads "2,000 tokens".
 */

const NUM = /(?<![\p{L}\p{N}_.,:#/@]|[\p{L}\p{N}]-)(\d{1,3}(?:,\d{3})+|\d+)(\.\d+)?(?![\p{L}\p{N}_:/@]|[.,]\d|-[\p{N}a-fA-F])/gu;
const KEEP_AFTER = /(?:\bblocks?|\bid|\bids|\bnonce|\bchain(?:\s*id)?|\bchainid|\btoken\s*id|\bno\.|\bnumber)\s*[:#]?\s*#?\s*$/i;
/** Words before a year: "in 2024", "since 2021", "March 2024", "Q3 2025", "FY 2024", "early 2023". */
const YEAR_BEFORE = /(?:\b(?:in|since|until|till|during|year|years|early|mid|late|circa|around|before|after|fy|q[1-4]|(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?(?:\s+\d{1,2}(?:st|nd|rd|th)?,?)?)|[(–])\s*$/i;
/** After a year: "2024)", "2021–2023", "2024 AD". */
const YEAR_AFTER = /^(?:\)|\s*[–/]\s*\d|\s*(?:AD|BC|CE|BCE)\b)/;

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
    if (!frac && !commas && int.length === 4 && Number(int) >= 1800 && Number(int) <= 2199) {
      const before = text.slice(Math.max(0, offset - 24), offset);
      if (YEAR_BEFORE.test(before) || YEAR_AFTER.test(text.slice(offset + match.length, offset + match.length + 8))) return match;
    }
    if (alreadyShort(int, frac, commas)) return match;
    return formatDigits(int, frac);
  });
}
