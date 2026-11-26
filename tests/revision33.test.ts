/**
 * Revision 33: data for the next layout. The page request names four screenshot outputs; the rebuild instructions add
 * screenshots, explained, ask, subject.category and subject.app; the changes instructions let a patch name an explained
 * sentence. The job check reads pages with and without the new parts, and jobs sent with older files exactly as before.
 * The only new thing shown is the first screenshot, above the Summary.
 */
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { fillTemplate, rebuildBody, REBUILD_OUTPUTS, REBUILD_TEMPLATE, REBUILD_TEMPLATE_V2 } from "../src/bodies";
import { shapeOf, templatesFor } from "../src/counts";
import { fetchUrlOf, INSTRUCTIONS } from "../src/instructions";
import { INSTRUCTIONS_FALLBACK_GATEWAY } from "../src/config";
import { hasLogoOnlyObjective, LOGO_ONLY_HASHES } from "../src/openings";
import { parseAsk, parseChanges, parseExplained, parsePage, parsePatches, parseScreenshots } from "../src/page";
import { pngWidth } from "../src/api";
import { resultNamesOf } from "../src/requests";
import { FirstShot } from "../src/Record";
import { refFromId } from "../src/subject";
import fixture from "./fixtures/live-pages.json";

const read = (p: string) => readFileSync(p, "utf8");
const flat = (s: string) => s.trim().replace(/\s*\n\s*/g, " ");
const sentences = (s: string) => flat(s).split(/(?<=[.!?])\s+(?=[A-Z"'(])/);
const NEW = flat(INSTRUCTIONS.rebuild.text);
const OLD_FILE = "rebuild-1cb3032ca031.txt";
const OLD = read(`public/instructions/${OLD_FILE}`);
const IMD = refFromId("imd.fun");

describe("A-D. the rebuild instructions", () => {
  it("is a new file with a new hash; the last one stays served", () => {
    expect(INSTRUCTIONS.rebuild.file).not.toBe(OLD_FILE);
    expect(INSTRUCTIONS.rebuild.file).toBe(`rebuild-${INSTRUCTIONS.rebuild.sha256.slice(0, 12)}.txt`);
    expect(read(`public/instructions/${INSTRUCTIONS.rebuild.file}`)).toBe(INSTRUCTIONS.rebuild.text);
    expect(INSTRUCTIONS.changes.file).not.toBe("changes-76bb018d8c8b.txt");
  });
  it("keeps every earlier sentence word for word, except the summary and one_line rules", () => {
    const keys = OLD.indexOf("JSON keys:");
    const missing = sentences(OLD.slice(0, keys)).filter((s) => !NEW.includes(s));
    expect(missing).toEqual(["Write summary: 5 to 9 plain sentences in 2 or 3 paragraphs for a friend new to it: what it is, who runs it, how to use it, what it costs, what is uncertain; no block numbers, raw token values, contract names or addresses."]);
    // D9 and D10.
    expect(NEW).toContain("in 2 or 3 paragraphs. The first paragraph is 2 or 3 sentences that stand alone: what it is and what a person does with it.");
    expect(NEW).toContain("for a friend new to it: what it is, who runs it, how to use it, what it costs, what is uncertain; no block numbers, raw token values, contract names or addresses.");
    expect(NEW).toContain("one_line says what the project is and what it does. At most 14 words.");
  });
  it("adds the brief's sentences at the end, before the JSON keys line", () => {
    const keys = NEW.indexOf("JSON keys:");
    const tail = NEW.slice(NEW.indexOf("Sections: what_it_does"), keys);
    for (const s of [
      "Capture up to 4 screenshots of the project's live app or site, each a PNG 1280 pixels wide. Choose screens that show what a person does there, the main one first; not a banner or a cookie notice. Public pages only: connect no wallet, sign in nowhere, show nothing personal. A screenshot is a real capture of the live page: never generate, draw or edit one. List each in screenshots with file, a caption of at most 8 words, the url captured and the time. For every slot you cannot fill, write a 1 by 1 transparent PNG and leave it out of the list.",
      "Each sentence has text and the line ids it rests on, like a summary sentence, at most 25 words. It says nothing no line supports. Leave a list empty when it does not apply.",
      "up to 6 sentences in the order a person meets them: what you do with it, step by step; what it costs; where the money goes; who runs it.",
      "what the token is for; what holding it gives you (a vote, a share of fees, access, nothing stated); how you get it; how many exist and whether more can be created or destroyed, and by whom; what moves value to or away from holders. Never say what a token is worth or whether to buy it.",
      "what it is for; who can change it and exactly what (fees, pausing, upgrading the code, creating tokens, moving funds), and whether changes are delayed; what that means for a user's funds. Mark those last two groups with part \"who_can_change\" and \"what_it_means\".",
      "In tokens and contracts, rest each sentence on proofs wherever you can. Say something is absent only when you read the full verified source and it is not there; otherwise write a sentence with kind not_checked. No jargon: do not use proxy, EOA, multisig, timelock, mint, burn, governance or liquidity without saying what it means in the same sentence.",
      "up to 3 entries, each with a question of at most 10 plain words about the current state (\"What does a job cost right now?\"), the id of the proof line it re-runs",
      "call: chain_id, to, data, returns (uint, address, bool or string), decimals and unit. Use only proofs that are one eth_call at the latest block on an EVM chain and return one value. The line's own rerun text stays as it is.",
      "one of protocol, app, network, token, ai, tool, other: what the product mainly is. Leave subject.type as it is.",
      "a label of at most 3 words (\"Open the app\", \"Start a job\"). It must be on the project's own domain or a listed channel. Leave it out when there is no usable app.",
      "Output artifacts/shot-1.png to artifacts/shot-4.png.",
    ])
      expect(tail).toContain(s);
    const k = NEW.slice(keys);
    expect(k).toContain("subject{type,category,name,one_line,app{url,label},channels[");
    expect(k).toContain("logo{url,fetched_at}, screenshots[{file,caption,url,captured_at}], explained{how_it_works[{text,lines[],kind}],tokens[{token,sentences[{text,lines[],kind}]}],contracts[{address,chain,sentences[{text,lines[],part,kind}]}]}, ask[{question,line,call{chain_id,to,data,returns,decimals,unit}}], differs");
    // The old keys line is a prefix-and-suffix of the new one: only keys were added.
    const oldKeys = flat(OLD).slice(flat(OLD).indexOf("JSON keys:"));
    expect(k.replace("category,", "").replace("app{url,label},", "").replace(/screenshots\[.*?\], explained\{.*?\]\}\]\}, ask\[.*?\}\}\], /, "")).toBe(oldKeys);
  });
  it("E13: the changes file lets a patch name an explained sentence, and keeps every earlier sentence", () => {
    const c = flat(INSTRUCTIONS.changes.text);
    expect(c).toContain("A patch may name an explained sentence, the same way it names a summary sentence.");
    const old = read("public/instructions/changes-76bb018d8c8b.txt");
    expect(sentences(old).filter((s) => !c.includes(s))).toEqual([]);
    expect(c.indexOf("A patch may name an explained sentence")).toBeLessThan(c.indexOf("JSON keys:"));
  });
});

describe("A1. the page request names four more output files", () => {
  it("declares shot-1 to shot-4 as image/png after the logo, and the objective names them", () => {
    const b = rebuildBody({ files: [], answers: [] }, IMD);
    expect(b.outputs).toBe(REBUILD_OUTPUTS);
    expect(b.outputs.slice(1)).toEqual([
      { name: "logo", path: "artifacts/logo.png", mediaType: "image/png" },
      ...[1, 2, 3, 4].map((n) => ({ name: `shot-${n}`, path: `artifacts/shot-${n}.png`, mediaType: "image/png" })),
    ]);
    expect(b.objective).toContain("Whatever else: output artifacts/page.json, artifacts/logo.png and artifacts/shot-1.png to artifacts/shot-4.png;");
    expect(resultNamesOf("add")).toEqual(["page", "logo", "shot-1", "shot-2", "shot-3", "shot-4"]);
    expect(REBUILD_TEMPLATE_V2).toBe(REBUILD_TEMPLATE.replace("artifacts/page.json, artifacts/logo.png and artifacts/shot-1.png to artifacts/shot-4.png;", "artifacts/page.json and artifacts/logo.png;"));
  });
});

describe("E14. the job check reads old and new requests", () => {
  const old = "1cb3032ca031c1402694a41fa4c60f44806f98f49ba3ee728e944f0d64f5c927";
  const req = (objective: string) => ({ subject: "imd.fun", kind: "add", bodyJson: { tag: { app: "rec-test-1", kind: "add", subject: "imd.fun" }, objective } });
  const fill = (t: string, file: string, sha: string) =>
    fillTemplate(t, { ACTION: "Rebuild", SUBJECT: "imd.fun", MAIN: "", URL: fetchUrlOf(file, sha), FALLBACK: fetchUrlOf(file, sha, INSTRUCTIONS_FALLBACK_GATEWAY), HASH: sha, PRIOR: "none", LEADS: "", CHANNELS: "none known" });
  it("a job sent with an earlier Swarmpedia rebuild file is checked against the logo-only wording", () => {
    expect(hasLogoOnlyObjective(old)).toBe(true);
    expect(LOGO_ONLY_HASHES.size).toBe(6);
    expect(hasLogoOnlyObjective(INSTRUCTIONS.rebuild.sha256)).toBe(false);
    expect(shapeOf(req(fill(REBUILD_TEMPLATE_V2, OLD_FILE, old))).ok).toBe(true);
    expect(shapeOf(req(fill(REBUILD_TEMPLATE, OLD_FILE, old))).ok).toBe(false);
    expect(templatesFor("add", old)[0]).toContain("output artifacts/page.json and artifacts/logo.png;");
  });
  it("a job sent now passes, and the logo-only wording with the new file does not", () => {
    const { file, sha256 } = INSTRUCTIONS.rebuild;
    expect(shapeOf(req(rebuildBody({ files: [], answers: [] }, IMD).objective)).ok).toBe(true);
    expect(shapeOf(req(fill(REBUILD_TEMPLATE, file, sha256))).ok).toBe(true);
    expect(shapeOf(req(fill(REBUILD_TEMPLATE_V2, file, sha256))).ok).toBe(false);
  });
  it("pages built before the change parse exactly as before: no new key appears", () => {
    for (const p of fixture.pages) {
      const page = parsePage(JSON.stringify(p.raw), p.id);
      for (const k of ["category", "app", "screenshots", "explained", "ask"]) expect(page).not.toHaveProperty(k);
    }
  });
});

const PAGE = {
  found: true,
  subject: {
    type: "project",
    category: "Protocol",
    name: "IMD",
    one_line: "A swarm of AI agents that does paid research jobs.",
    app: { url: "https://app.imd.fun/jobs", label: "Start a job" },
    channels: [{ label: "X", url: "https://x.com/imdfun", tie: "linked" }],
    contracts: [],
  },
  lines: [
    { id: "L1", section: "money", text: "A job costs 0.5 IMD.", kind: "proof", sources: ["S1"], rerun: "eth_call on chain 1 at block 1" },
    { id: "L2", section: "people", text: "IMD runs the swarm.", kind: "statement", sources: ["S1"], quote: "we run it" },
  ],
  sources: [{ id: "S1", ref: "https://imd.fun/" }],
  screenshots: [
    { file: "artifacts/shot-2.png", caption: "The job form", url: "https://app.imd.fun/jobs", captured_at: "2026-11-26T00:00:00Z" },
    { file: "artifacts/shot-2.png", caption: "Twice", url: "https://imd.fun/" },
    { file: "artifacts/logo.png", caption: "Not a slot" },
    { file: "artifacts/shot-1.png", caption: "Home", url: "https://imd.fun/" },
  ],
  explained: {
    how_it_works: [{ text: "You post a job and pay in IMD.", lines: ["L1"] }, { text: "" }],
    tokens: [{ token: "IMD", sentences: [{ text: "IMD pays for jobs.", lines: ["L1"] }, { text: "Not checked whether more can be created.", lines: [], kind: "not_checked" }] }],
    contracts: [
      { address: "0x" + "1".repeat(40), chain: "Ethereum", sentences: [{ text: "One wallet can change the fee.", lines: ["L1"], part: "who_can_change" }, { text: "Fees could rise.", lines: [], part: "what_it_means" }] },
      { address: "not an address", chain: "Ethereum", sentences: [{ text: "x" }] },
    ],
  },
  ask: [
    { question: "What does a job cost right now?", line: "L1", call: { chain_id: 1, to: "0x" + "a".repeat(40), data: "0x12345678", returns: "uint", decimals: 18, unit: "IMD" } },
    { question: "Who runs it?", line: "L2", call: { chain_id: 1, to: "0x" + "a".repeat(40), data: "0x12345678", returns: "address" } },
    { question: "What is the fee?", line: "L1", call: { chain_id: 1, to: "0x" + "a".repeat(40), data: "0x123", returns: "uint" } },
    { question: "One two three four five six seven eight nine ten eleven?", line: "L1", call: { chain_id: 1, to: "0x" + "a".repeat(40), data: "0x12345678", returns: "uint" } },
  ],
};

describe("B-D. the new parts of the page file", () => {
  const page = parsePage(JSON.stringify(PAGE), "imd.fun");
  it("category is one of seven; subject.type is untouched", () => {
    expect(page.category).toBe("protocol");
    expect(parsePage(JSON.stringify({ ...PAGE, subject: { ...PAGE.subject, category: "game" } }), "imd.fun")).not.toHaveProperty("category");
  });
  it("app: kept on the own domain or under a listed channel, with a label of at most 3 words", () => {
    expect(page.app).toEqual({ url: "https://app.imd.fun/jobs", label: "Start a job" });
    const withApp = (app: unknown) => parsePage(JSON.stringify({ ...PAGE, subject: { ...PAGE.subject, app } }), "imd.fun").app;
    expect(withApp({ url: "https://x.com/imdfun/status/1", label: "Open" })).toEqual({ url: "https://x.com/imdfun/status/1", label: "Open" });
    expect(withApp({ url: "https://imd-fun.example.com/", label: "Open the app" })).toBeUndefined();
    expect(withApp({ url: "https://app.imd.fun/", label: "Open the app now please" })).toBeUndefined();
    expect(withApp({ url: "javascript:alert(1)", label: "Open" })).toBeUndefined();
  });
  it("screenshots: one per slot, in the job's order, at most 4", () => {
    expect(page.screenshots!.map((s) => [s.slot, s.caption])).toEqual([[2, "The job form"], [1, "Home"]]);
    expect(page.screenshots![0]!.capturedAt).toBe("2026-11-26T00:00:00Z");
    expect(parseScreenshots([1, 2, 3, 4, 1].map((n) => ({ file: `shot-${n}.png` }))).length).toBe(4);
  });
  it("explained: sentences with text and line ids, not_checked and the two contract parts", () => {
    const e = page.explained!;
    expect(e.howItWorks).toEqual([{ text: "You post a job and pay in IMD.", lines: ["L1"] }]);
    expect(e.tokens[0]!.sentences[1]).toEqual({ text: "Not checked whether more can be created.", lines: [], kind: "not_checked" });
    expect(e.contracts.length).toBe(1);
    expect(e.contracts[0]!.sentences.map((s) => s.part)).toEqual(["who_can_change", "what_it_means"]);
    expect(parseExplained({ how_it_works: Array(9).fill({ text: "a" }) })!.howItWorks.length).toBe(6);
    expect(parseExplained({ contracts: Array(5).fill({ address: "0x" + "2".repeat(40), sentences: Array(8).fill({ text: "b" }) }) })!.contracts.map((c) => c.sentences.length)).toEqual([5, 5, 5]);
    expect(parseExplained({ how_it_works: [], tokens: [], contracts: [] })).toBeNull();
  });
  it("ask: only a proof line, one call with hex calldata and one of four return types, at most 10 words", () => {
    expect(page.ask).toEqual([{ question: "What does a job cost right now?", line: "L1", call: { chainId: 1, to: "0x" + "a".repeat(40), data: "0x12345678", returns: "uint", decimals: 18, unit: "IMD" } }]);
    expect(parseAsk(Array(5).fill(PAGE.ask[0]), new Set(["L1"])).length).toBe(3);
  });
  it("E13: a changes result's explained patches are kept apart from the Key facts and summary patches", () => {
    const patches = [
      { kind: "explained", target: "You post a job and pay in IMD.", op: "set", value: "You post a job and pay 0.5 IMD.", lines: ["L9"] },
      { kind: "summary", target: "Old.", op: "set", value: "New.", lines: [] },
    ];
    const c = parseChanges(JSON.stringify({ items: [], patches }));
    expect(c.explainedPatches).toEqual([{ kind: "explained", target: "You post a job and pay in IMD.", value: "You post a job and pay 0.5 IMD.", lines: ["L9"], op: "set" }]);
    expect(c.patches.map((p) => p.kind)).toEqual(["summary"]);
    expect(parsePatches(patches).length).toBe(1);
    expect(parseChanges(JSON.stringify({ items: [], patches: [patches[1]] }))).not.toHaveProperty("explainedPatches");
  });
});

describe("E15. the first screenshot, above the Summary", () => {
  it("reads the width from the PNG header, so a 1 by 1 placeholder is never shown", () => {
    const head = new Uint8Array(24);
    head.set([0, 0, 5, 0], 16);
    expect(pngWidth(head)).toBe(1280);
    expect(read("src/api.ts")).toContain("read.width < 320 ? { url: null, hash: null } : read");
  });
  it("renders the capture with its caption and the host it was captured from", () => {
    const h = renderToStaticMarkup(createElement(FirstShot, { shot: { url: "data:image/png;base64,AA==", caption: "The job form", source: "https://www.app.imd.fun/jobs", capturedAt: "" }, name: "IMD" }));
    expect(h).toContain('<figure class="shot"><img src="data:image/png;base64,AA==" alt="IMD: The job form" width="1280"');
    expect(h).toContain("The job form");
    expect(h).toContain('href="https://www.app.imd.fun/jobs"');
    expect(h).toContain(">app.imd.fun</a>");
  });
  it("sits above the Summary, only when the page job gave one, and nothing else new is shown", () => {
    const rec = read("src/Record.tsx");
    expect(rec).toContain('{page && latest?.shot && <FirstShot shot={latest.shot} name={name} />}\n            <Summary m={m} ui={ui} />');
    const ui = ["src/Record.tsx", "src/Home.tsx", "src/App.tsx", "src/ActivityList.tsx"].map(read).join("\n");
    for (const k of ["page.explained", "page.ask", "page.category", "page.app", "page.screenshots", "explainedPatches"]) expect(ui).not.toContain(k);
    expect(read("src/useActivity.ts")).toContain("const first = page.screenshots?.[0];");
  });
});
