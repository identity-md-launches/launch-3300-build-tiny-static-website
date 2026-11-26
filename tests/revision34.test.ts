/**
 * Revision 34: the reviewed findings on revision 33.
 * - 41a30fb5: the rebuild file says where a patch of kind explained goes; the changes file lists explained as a patch kind.
 * - a7f3cd8e: screenshots are checked with their own limits (exactly 1280 wide, up to 32 MiB), the logo keeps its own.
 * - 3487bb04: Ask keeps a call's calldata byte for byte, bare 0x included, and refuses (never cuts) what it cannot keep.
 * - 37abf1a8: the page reaches the Overview without waiting for its screenshot.
 * - 3bdbc10b: the screenshot scales down whole instead of being cropped.
 */
import { createHash, randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { deflateSync } from "node:zlib";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { isPng, MAX_LOGO_BYTES, pngDecodes, SHOT_LIMITS, shotOf } from "../src/api";
import { INSTRUCTIONS } from "../src/instructions";
import { parseAsk, parsePage } from "../src/page";
import { FirstShot, LatestShot } from "../src/Record";
import type { Activity } from "../src/useActivity";

const read = (p: string) => readFileSync(p, "utf8");

/* ---------- PNG files made here: real zlib data, CRCs and sizes ---------- */
const CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
const crc = (b: Uint8Array) => {
  let c = 0xffffffff;
  for (const x of b) c = CRC[(c ^ x) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
function chunk(type: string, data: Uint8Array): Buffer {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, "ascii");
  Buffer.from(data).copy(out, 8);
  out.writeUInt32BE(crc(out.subarray(4, 8 + data.length)), 8 + data.length);
  return out;
}
/** An RGB PNG of the given size; noise makes it large (hard to compress), as a detailed capture is. */
function png(width: number, height: number, noise = false): Uint8Array {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr.set([8, 2, 0, 0, 0], 8);
  const row = 1 + width * 3;
  const raw = noise ? randomBytes(height * row) : Buffer.alloc(height * row);
  for (let y = 0; y < height; y++) raw[y * row] = 0; // filter type none on every row
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  return new Uint8Array(Buffer.concat([sig, chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw)), chunk("IEND", new Uint8Array())]));
}
const sha = (b: Uint8Array) => createHash("sha256").update(b).digest("hex");

describe("41a30fb5: an explained patch has a destination in the next rebuild", () => {
  // The file this revision published; revision 36 publishes a newer one and this stays served byte for byte.
  const rebuild = read("public/instructions/rebuild-7d51ee3b35d9.txt");
  const changes = INSTRUCTIONS.changes.text;
  const RULE = "For a patch with kind explained, use the explained sentence with that exact text as its target. Apply the new text and supporting line ids to that sentence, unless newer evidence says otherwise.";
  it("the rebuild file adds the rule at the end, before the JSON keys line, and changes nothing else", () => {
    const prev = read("public/instructions/rebuild-2d329d7d77e8.txt");
    expect(rebuild).toBe(prev.replace("\n\nJSON keys:", `\n\n${RULE}\n\nJSON keys:`));
    expect(rebuild.indexOf(RULE)).toBeLessThan(rebuild.indexOf("JSON keys:"));
  });
  it("the changes file says a patch's kind may be explained, after the sentence that introduced it, and changes nothing else", () => {
    const prev = read("public/instructions/changes-6f7e0f27ff1a.txt");
    const intro = "its target the sentence's exact text, and it always has op set and the sentence's new text.";
    expect(changes).toBe(prev.replace(intro, `${intro} A patch's kind is therefore infobox, summary or explained.`));
  });
  it("both are new files with new hashes; the files they replace stay served", () => {
    expect(INSTRUCTIONS.rebuild.file).toBe("rebuild-7351e67f471b.txt"); // revision 36
    expect(INSTRUCTIONS.changes.file).toBe("changes-d73d152f1764.txt");
    for (const f of [INSTRUCTIONS.rebuild.file, INSTRUCTIONS.changes.file]) expect(sha(readFileSync(`public/instructions/${f}`)).slice(0, 12)).toBe(f.slice(-16, -4));
    const published = JSON.parse(read("src/instructions.published.json")) as { file: string }[];
    for (const f of ["rebuild-2d329d7d77e8.txt", "changes-6f7e0f27ff1a.txt", "rebuild-7d51ee3b35d9.txt", "changes-d73d152f1764.txt"]) expect(published.some((p) => p.file === f)).toBe(true);
  });
});

describe("a7f3cd8e: screenshots are read with their own limits", () => {
  const detailed = png(1280, 720, true);
  it("a detailed 1280 x 720 capture larger than the logo limit is shown, with its size", async () => {
    expect(detailed.length).toBeGreaterThan(MAX_LOGO_BYTES);
    const s = await shotOf(detailed, sha(detailed));
    expect(s.url?.startsWith("data:image/png;base64,")).toBe(true);
    expect([s.width, s.height]).toEqual([1280, 720]);
  });
  it("a tall 1280 x 6000 capture is shown", async () => {
    const tall = png(1280, 6000);
    expect((await shotOf(tall, sha(tall))).height).toBe(6000);
  });
  it("any width but 1280 is refused, saying so", async () => {
    await expect(shotOf(png(640, 720), "x")).rejects.toThrow("640 pixels wide, not 1280");
    await expect(shotOf(png(1440, 900), "x")).rejects.toThrow("1440 pixels wide, not 1280");
    await expect(shotOf(png(320, 600), "x")).rejects.toThrow("320 pixels wide");
  });
  it("the 1 by 1 placeholder is an empty slot", async () => {
    expect(await shotOf(png(1, 1), "x")).toEqual({ url: null, hash: null });
  });
  it("a cut-off or foreign file is refused", async () => {
    await expect(shotOf(detailed.slice(0, detailed.length - 12), "x")).rejects.toThrow("not a whole PNG");
    await expect(shotOf(new TextEncoder().encode("GIF89a........................................"), "x")).rejects.toThrow("not a whole PNG");
  });
  it("the logo path keeps 512 KiB and 4,096 pixels", async () => {
    expect(isPng(detailed)).toBe(false);
    expect(isPng(detailed, SHOT_LIMITS)).toBe(true);
    expect(await pngDecodes(detailed, SHOT_LIMITS)).toBe(true);
    expect(isPng(png(4097, 2))).toBe(false);
    expect(isPng(png(512, 512))).toBe(true);
    const api = read("src/api.ts");
    expect(api).toContain('if (!isPng(read.bytes)) throw new Error("The logo is not a whole PNG file");');
    expect(api).not.toContain("width < 320");
  });
});

describe("3487bb04: Ask keeps the proof's exact call", () => {
  const ask = (data: unknown) => [{ question: "What number does the call return?", line: "L1", call: { chain_id: 1, to: "0x0000000000000000000000000000000000000002", data, returns: "uint", decimals: 0, unit: "" } }];
  const ids = new Set(["L1"]);
  it("bare 0x (a call with no input) is kept", () => {
    expect(parseAsk(ask("0x"), ids).map((a) => a.call.data)).toEqual(["0x"]);
  });
  it("1,024 bytes of calldata are kept byte for byte", () => {
    const data = "0x" + "ab".repeat(1024);
    expect(parseAsk(ask(data), ids)[0]!.call.data).toBe(data);
  });
  it("through parsePage too", () => {
    const data = "0x" + "ab".repeat(1024);
    const page = parsePage(JSON.stringify({ found: true, lines: [{ id: "L1", section: "on_chain", text: "The call returns a word.", kind: "proof", rerun: "eth_call 0x…02 at latest" }], ask: ask(data) }));
    expect(page.ask?.[0]?.call.data).toBe(data);
  });
  it("malformed calldata is refused, never altered", () => {
    for (const d of ["0x123", "ab12", "0xzz", " 0x12", "0x12 ", 12, null]) expect(parseAsk(ask(d), ids)).toEqual([]);
    // Revision 35: no length cutoff; 65,537 bytes and more are kept (tests/revision35.test.ts).
    expect(parseAsk(ask("0x" + "00".repeat(65536)), ids)[0]!.call.data.length).toBe(2 + 2 * 65536);
  });
});

describe("37abf1a8: the page does not wait for its screenshot", () => {
  it("follow names the first screenshot and never reads its bytes", () => {
    const ua = read("src/useActivity.ts");
    expect(ua).not.toContain("fetchShot(");
    expect(ua).toContain("shotRef = { slot: first.slot, caption: first.caption, source: first.url, capturedAt: first.capturedAt };");
  });
  it("Overview reads it on its own, holding a box in its place while it is read", () => {
    const latest = { req: { requestId: "0x1" }, completion: {}, jobId: "j", shotRef: { slot: 1, caption: "Home", source: "https://imd.fun/", capturedAt: "" } } as unknown as Activity;
    // Revision 35: the pending state is the same frame and caption as the loaded one (tests/revision35.test.ts).
    expect(renderToStaticMarkup(createElement(LatestShot, { latest, name: "IMD" }))).toContain('<figure class="shot" aria-busy="true"><div class="shot-frame"></div>');
    expect(renderToStaticMarkup(createElement(LatestShot, { latest: { ...latest, shotRef: null }, name: "IMD" }))).toBe("");
    expect(read("src/Record.tsx")).toContain("fetchShot(req, completion, jobId, ref.slot)");
  });
});

describe("3bdbc10b: a tall capture is scaled down whole, never cropped", () => {
  it("the image keeps its shape within the column and 480px", () => {
    // Revision 35: the whole capture is fitted inside a fixed 16:9 frame (contain: scaled, never cropped).
    const css = read("src/styles.css");
    const rule = css.slice(css.indexOf(".shot-frame img {"), css.indexOf("}", css.indexOf(".shot-frame img {")));
    expect(rule).toContain("object-fit: contain;");
    expect(rule).not.toMatch(/object-fit: (cover|fill)/);
  });
  it("carries the PNG's own width and height", () => {
    const h = renderToStaticMarkup(createElement(FirstShot, { shot: { slot: 1, url: "data:image/png;base64,AA==", caption: "Tall", source: "", capturedAt: "", width: 1280, height: 2000 }, name: "IMD" }));
    expect(h).toContain('width="1280" height="2000"');
  });
});
