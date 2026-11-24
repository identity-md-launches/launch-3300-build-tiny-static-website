/** Home's live example: one fact a claim, a statement and a proof of the same record all state. Pure, for tests. */
import type { Line } from "./page";
import { settleAll } from "./settle";

export interface Example {
  claim: string;
  statement: string;
  proof: string;
}

const WORDS: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 };
const SCALE: Record<string, number> = { million: 1e6, billion: 1e9, trillion: 1e12 };
const AMOUNT = /(?<![\w.,])(\d[\d,]*(?:\.\d+)?|one|two|three|four|five|six|seven|eight|nine|ten)(?:\s+(million|billion|trillion))?\s+\$?([A-Za-z]{0,4}[A-Z]{2,}[A-Za-z0-9.]*[A-Za-z0-9])/g;

/** Every token amount a sentence gives, as "<symbol> <number>": "ten billion ZORA" and "10,000,000,000 ZORA" are one. */
export function amountsIn(text: string): string[] {
  return [...text.matchAll(AMOUNT)].flatMap((m) => {
    const n = (WORDS[m[1]!.toLowerCase()] ?? Number(m[1]!.replace(/,/g, ""))) * (m[2] ? SCALE[m[2]]! : 1);
    return Number.isFinite(n) && n > 0 ? [`${m[3]} ${n}`] : [];
  });
}

const FACTS: RegExp[] = [/\bsupply\b/i];
const LONGEST = 160;

/**
 * Three lines of one record that state the same fact: each names the same kind of fact (a supply) and the same amount
 * of the same token. A contradicted or superseded line is never used. Null when the record has no such three.
 */
export function exampleOf(lines: Line[]): Example | null {
  const settled = settleAll(lines);
  const ok = lines.filter((l) => {
    const s = settled.by.get(l.id)?.state;
    return l.text.length <= LONGEST && s !== "contradicted" && s !== "outdated";
  });
  for (const fact of FACTS) {
    const of = (kind: string) => ok.filter((l) => l.kind === kind && fact.test(l.text)).map((l) => ({ text: l.text.trim(), amounts: amountsIn(l.text) }));
    const claims = of("claim");
    const statements = of("statement");
    for (const p of of("proof"))
      for (const amount of p.amounts) {
        const c = claims.find((x) => x.amounts.includes(amount));
        const s = statements.find((x) => x.amounts.includes(amount));
        if (c && s) return { claim: c.text, statement: s.text, proof: p.text };
      }
  }
  return null;
}
