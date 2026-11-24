/**
 * Revision 20 (review of revision 19): G18 against IMD's current guide. Three real record lines, one per panel
 * template, go through the site's own seed and body builders; the bodies must equal what IMD's free check drafted
 * for them (2026-11-24), the contract body plus the definitions the check's wording suggestion asks for.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { seedFromLine } from "../src/changes";
import { contractDefinitions, encodeBody, questionContract, questionPage, questionPost, templateBody, type Template } from "../src/bodies";

interface Case {
  template: Template;
  subject: string;
  line: Parameters<typeof seedFromLine>[0];
  sourceUrl: string;
  check: { status: number; judged: boolean; blockers: unknown[]; suggestions: { code: string }[]; proposedToleranceBps: number | null; request: Record<string, unknown> };
  quoteStatus: number;
}
const { cases } = JSON.parse(readFileSync("tests/fixtures/panel-check-2026-11-24.json", "utf8")) as { cases: Case[] };

function bodyOf(c: Case) {
  const s = seedFromLine(c.line, c.sourceUrl);
  expect(s.type).toBe(c.template);
  const q =
    s.type === "post"
      ? questionPost(s.url, s.handle, s.text, c.subject)
      : s.type === "page"
        ? questionPage(s.url, s.text, c.subject)
        : questionContract(s.chain, s.signature, s.address, s.value, c.subject);
  const defs = s.type === "contract" ? contractDefinitions(s.chain, s.signature, s.address, s.value) : undefined;
  return templateBody(c.template, q, Number(s.chain || 1), defs);
}

describe("G18: the three panel bodies against IMD's free check (2026-11-24)", () => {
  it("covers one real line per template", () => {
    expect(cases.map((c) => c.template)).toEqual(["post", "page", "contract"]);
    for (const c of cases) {
      expect(c.check.status).toBe(200);
      expect(c.check.judged).toBe(true);
      expect(c.check.blockers).toEqual([]);
      expect(c.quoteStatus).toBe(201);
    }
  });
  for (const c of ["post", "page"] as const)
    it(`${c}: the body is byte for byte the request the check drafted, with no definitions, guards or toleranceBps`, () => {
      const k = cases.find((x) => x.template === c)!;
      expect(k.check.suggestions).toEqual([]);
      const body = bodyOf(k);
      expect(encodeBody(body)).toBe(encodeBody(k.check.request as never));
      expect(body).not.toHaveProperty("definitions");
      expect(body).not.toHaveProperty("guards");
      expect(body).not.toHaveProperty("toleranceBps");
    });
  it("contract: the drafted request plus definitions that pin the call and the match", () => {
    const k = cases.find((x) => x.template === "contract")!;
    expect(k.check.suggestions.map((s) => s.code)).toEqual(["wording"]);
    const { definitions, ...rest } = bodyOf(k) as ReturnType<typeof bodyOf> & { definitions?: Record<string, string> };
    expect(encodeBody(rest as never)).toBe(encodeBody(k.check.request as never));
    expect(Object.keys(definitions ?? {})).toEqual(["call", "match"]);
    expect(definitions!.call).toContain("symbol() to 0x61aAF8a992A3143e2B0C9cB0030b9fE702854a25 on chain 1");
    expect(definitions!.match).toContain('equals "imdUSD" exactly');
  });
  it("a bool answer takes no toleranceBps: the check proposes 0 and leaves it out of its request", () => {
    for (const c of cases) {
      expect(c.check.proposedToleranceBps).toBe(0);
      expect(c.check.request).not.toHaveProperty("toleranceBps");
    }
  });
  it("definitions stay within the guide's limits for the longest signature and value the form accepts", () => {
    const d = contractDefinitions(11155111, `f${"a".repeat(63)}(${"b".repeat(200)})`, "0x1111111111111111111111111111111111111111", "v".repeat(200));
    for (const [k, v] of Object.entries(d)) {
      expect(k.length).toBeLessThanOrEqual(64);
      expect(v.length).toBeGreaterThan(0);
      expect(v.length).toBeLessThanOrEqual(512);
    }
  });
  it("the panel form sends the definitions on a contract question only", () => {
    const app = readFileSync("src/App.tsx", "utf8");
    expect(app).toContain('templateBody(tpl, question, Number(f.chain), tpl === "contract" ? contractDefinitions(f.chain, f.signature, f.address, f.value) : undefined)');
    expect(templateBody("page", "q", 1, { a: "b" })).not.toHaveProperty("definitions");
  });
});
