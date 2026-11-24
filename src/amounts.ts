/**
 * On-chain amounts in whole tokens. A proof's fact gives its amount in base units ("500000000000000000", unit "IMD
 * base units"); the page shows "0.5 IMD" and keeps the integer under Exact value. The arithmetic is on digit strings.
 */
import { formatDigits } from "./numbers";
import type { Fact, Line } from "./page";

const SYMBOL = /^\$?[A-Za-z]{0,4}[A-Z]{2,}[A-Za-z0-9.]*$/;
/** "IMD base units", "base units (18 decimals)", "raw imdUSD units per task", "wei (18 decimals)", "USD scaled by 10^18". */
const BASE = /^(?:(.+?)\s+)?(?:(?:base|raw|smallest)\s+units?|wei)(\s+per\s+.+?)?(?:\s*\((\d{1,2})\s+decimals?\))?$/i;
const RAW = /^raw\s+(.+?)\s+units?(\s+per\s+.+?)?(?:\s*\((\d{1,2})\s+decimals?\))?$/i;
const SCALED = /^(.+?)\s+scaled by 10\^(\d{1,2})$/i;

/** The parts of a unit that counts base units, or null for a unit that already counts whole things. */
export function baseUnit(unit: string): { symbol: string; per: string; decimals: number | null; plainWei: boolean } | null {
  const u = unit.trim();
  const s = SCALED.exec(u);
  if (s) return { symbol: s[1]!, per: "", decimals: Number(s[2]), plainWei: false };
  const m = RAW.exec(u) ?? BASE.exec(u);
  if (!m) return null;
  const symbol = (m[1] ?? "").replace(/^raw$/i, "");
  return { symbol, per: (m[2] ?? "").trim(), decimals: m[3] ? Number(m[3]) : null, plainWei: /^wei$/i.test(u) };
}

/** Decimals of tokens whose count is not 18 and is the same on every chain they are read on here. */
const KNOWN: Record<string, number> = { usdc: 6, "usdc.e": 6, usdt: 6, usdt0: 6, eurc: 6, pyusd: 6, wbtc: 8, cbbtc: 8 };
const SCALE: Record<string, number> = { thousand: 1e3, million: 1e6, billion: 1e9, trillion: 1e12 };

/** Decimals a record proves: "ZORA decimals", "Token decimals" (the token its "Token symbol" names). Keys in lower case. */
export function decimalsOf(lines: Pick<Line, "kind" | "fact">[]): Map<string, number> {
  const out = new Map<string, number>();
  const facts = lines.flatMap((l) => (l.kind === "proof" && l.fact ? [l.fact] : []));
  const main = facts.find((f) => /^token symbol$/i.test(f.name.trim()))?.value.trim().toLowerCase() ?? "";
  for (const f of facts) {
    const m = /^(.+?)\s+decimals$/i.exec(f.name.trim());
    if (!m || !/^\d{1,2}$/.test(f.value.trim())) continue;
    const who = m[1]!.trim().toLowerCase();
    const key = who === "token" ? main : who;
    if (key) out.set(key, Number(f.value));
  }
  return out;
}

/** The decimals at which the raw integer is the amount of the symbol the sentence itself states, or null. */
function decimalsFromText(raw: string, symbol: string, text: string): number | null {
  const sym = symbol.replace(/[.*+?^${}()|[\]\\-]/g, "\\$&");
  const re = new RegExp(`(\\d[\\d,]*(?:\\.\\d+)?)(?:\\s+(thousand|million|billion|trillion))?\\s+${sym}\\b`, "gi");
  const r = Number(raw);
  for (const m of text.matchAll(re)) {
    const n = Number(m[1]!.replace(/,/g, "")) * (m[2] ? SCALE[m[2].toLowerCase()]! : 1);
    if (!(n > 0) || !(r > 0)) continue;
    const d = Math.round(Math.log10(r / n));
    if (d >= 2 && d <= 36 && Math.abs(r / 10 ** d / n - 1) < 0.006) return d;
  }
  return null;
}

/** The symbol a unit without one counts: the first token symbol of the fact's name ("ZORA total supply"), or of the line. */
function symbolIn(name: string, text: string): string {
  const of = (s: string) => s.split(/[\s,;()]+/).map((w) => w.replace(/[.]+$/, "")).find((w) => SYMBOL.test(w) && !/^(?:EIP|ERC|NFT|API|URI|URL|ID|UTC|ENS|DAO|USD)$/.test(w)) ?? "";
  return of(name) || of(text);
}

export interface AmountContext {
  name?: string;
  text?: string;
  decimals?: Map<string, number>;
}

/**
 * "0.5 IMD" for the raw integer of a base-unit fact, or null when the value is not one (or its decimals are unknown).
 * Decimals come from the unit, a decimals proof of the record, the amount the sentence states, a known token, and
 * last the ERC-20 default of 18 for an integer too long to be anything else.
 */
export function wholeAmount(value: string, unit: string, ctx: AmountContext = {}): string | null {
  const raw = value.trim().replace(/,/g, "");
  if (!/^\d+$/.test(raw)) return null;
  const b = baseUnit(unit);
  if (!b) return null;
  const symbol = b.symbol || (b.plainWei ? "ETH" : symbolIn(ctx.name ?? "", ctx.text ?? "")) || "tokens";
  const key = symbol.toLowerCase();
  const d = b.decimals ?? ctx.decimals?.get(key) ?? decimalsFromText(raw, symbol, ctx.text ?? "") ?? KNOWN[key] ?? (b.plainWei || raw === "0" || raw.length >= 13 ? 18 : null);
  if (d === null) return null;
  const padded = raw.padStart(d + 1, "0");
  const whole = d ? formatDigits(padded.slice(0, -d), padded.slice(-d)) : formatDigits(padded, "");
  return `${whole} ${symbol}${b.per ? ` ${b.per}` : ""}`;
}

/** A fact's amount in whole tokens, or null when it is not a base-unit amount. */
export const wholeFact = (f: Pick<Fact, "name" | "value" | "unit">, text: string, decimals: Map<string, number>, value = f.value) => wholeAmount(value, f.unit, { name: f.name, text, decimals });

/** "500,000,000,000,000,000 IMD base units": the raw integer, grouped, for Exact value only. */
export const exactAmount = (value: string, unit: string) => `${/^\d+$/.test(value.trim()) ? BigInt(value.trim()).toLocaleString("en-US") : value}${unit ? ` ${unit}` : ""}`;
