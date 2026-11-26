/**
 * Revision 35: the reviewed findings on revision 34.
 * - ab1093ee: Ask keeps a valid call's input of any length (no 64 KiB cutoff), byte for byte.
 * - 12c82aab: the screenshot's frame and caption are the same while it is read and after, so the Summary does not move.
 */
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { parseAsk, parsePage } from "../src/page";
import { FirstShot, LatestShot } from "../src/Record";
import type { Activity } from "../src/useActivity";

const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
const ask = (data: unknown) => [{ question: "What number does the call return?", line: "L1", call: { chain_id: 1, to: "0x0000000000000000000000000000000000000002", data, returns: "uint", decimals: 0, unit: "" } }];
const proof = { id: "L1", section: "on_chain", text: "The call returns one word.", kind: "proof", rerun: "One Ethereum eth_call to the SHA-256 precompile at latest." };

describe("ab1093ee: Ask keeps calldata of any length", () => {
  it("65,537 bytes survive parsePage byte for byte (the reviewer's fixture)", () => {
    const data = "0x" + "ab".repeat(65537);
    const page = parsePage(JSON.stringify({ found: true, lines: [proof], ask: ask(data) }));
    expect(page.ask).toHaveLength(1);
    expect(page.ask![0]!.call.data).toBe(data);
    expect(page.ask![0]!.call.data.length).toBe(2 + 2 * 65537);
  });
  it("the 65,536-byte control and 1 MiB are kept too; mixed-case hex is not altered", () => {
    const ids = new Set(["L1"]);
    for (const n of [65536, 1 << 20]) expect(parseAsk(ask("0x" + "Ab".repeat(n)), ids)[0]!.call.data).toBe("0x" + "Ab".repeat(n));
  });
  it("only the form is checked: 0x, hex pairs, an even number of digits", () => {
    const ids = new Set(["L1"]);
    for (const d of ["0x" + "ab".repeat(65537) + "a", "0X12", "0x" + "ab".repeat(65537) + "zz", "0x12\n", "", 7]) expect(parseAsk(ask(d), ids)).toEqual([]);
    expect(read("src/page.ts")).not.toContain("MAX_ASK_DATA");
  });
});

describe("12c82aab: the Summary keeps its place when the screenshot arrives", () => {
  const ref = { slot: 1, caption: "The job form", source: "https://imd.fun/jobs", capturedAt: "" };
  const latest = { req: { requestId: "0x1" }, completion: {}, jobId: "j", shotRef: ref } as unknown as Activity;
  const strip = (h: string) => h.replace(/<img[^>]*>/, "").replace(' aria-busy="true"', "");
  it("pending and loaded render the same frame and the same caption, differing only by the image", () => {
    const pending = renderToStaticMarkup(createElement(LatestShot, { latest, name: "IMD" }));
    const loaded = renderToStaticMarkup(createElement(FirstShot, { shot: { ...ref, url: "data:image/png;base64,AA==", width: 1280, height: 2000 }, name: "IMD" }));
    expect(pending).toContain('aria-busy="true"');
    expect(pending).not.toContain("<img");
    expect(loaded).toContain('<div class="shot-frame"><img src="data:image/png;base64,AA=="');
    expect(strip(pending)).toBe(strip(loaded));
    expect(pending).toContain(">imd.fun</a>");
  });
  it("the frame is fixed at 16:9, at most 480px, and the image fits whole inside it", () => {
    const css = read("src/styles.css");
    const at = (sel: string) => css.slice(css.indexOf(sel), css.indexOf("}", css.indexOf(sel)));
    expect(at(".shot-frame {")).toContain("position: relative; box-sizing: border-box; width: 100%; aspect-ratio: 16 / 9; max-height: 480px;");
    expect(at(".shot-frame img {")).toContain("position: absolute; inset: 0; display: block; width: 100%; height: 100%; object-fit: contain;");
    expect(css).not.toContain(".shot-wait");
  });
});
