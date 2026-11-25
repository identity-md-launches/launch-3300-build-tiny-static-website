/** Review fixes to revision 27: question replay, digests, status tags, Solana addresses, one set of list controls, Docs cards. */
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { questionsOf } from "../src/questions";
import { parseChanges, parsePage, valueItemOf } from "../src/page";
import { ACTIONS } from "../src/config";
import type { Activity } from "../src/useActivity";
import { splitDigests } from "../src/digest";
import { base58Length, isAddressFor, shortAddr } from "../src/addr";
import { tokenOfItem, type KeyRow } from "../src/keyfacts";
import { KeyValue } from "../src/Record";

let n = 0;
const job = (kind: "add" | "changes", block: number, body: { page?: string; changes?: string }): Activity => {
  n += 1;
  return {
    req: { requestId: `0x${n.toString(16).padStart(64, "0")}`, subject: "example.org", action: ACTIONS.research, kind, blockNumber: BigInt(block) },
    completion: { blockNumber: BigInt(block), logIndex: 0 },
    state: "completed",
    jobId: `job-${n}`,
    doneTime: block * 1000,
    time: block * 1000,
    notRead: null,
    rejected: null,
    page: body.page ? parsePage(body.page, "example.org") : null,
    changes: body.changes ? parseChanges(body.changes) : null,
  } as unknown as Activity;
};

describe("questions keep their id through an answer in part (4d5b2731)", () => {
  it("rewords on the original id, then closes it for good", () => {
    n = 0;
    const page = job("add", 10, { page: JSON.stringify({ subject: { name: "Ex" }, lines: [], open_questions: ["Does the service extend to Europe?", "Who audits it?"] }) });
    const part = job("changes", 20, { changes: JSON.stringify({ found: true, items: [], lines: [{ id: "N1", text: "It serves Germany.", kind: "statement" }], questions: [{ target: "Does the service extend to Europe?", op: "reword", text: "Does the service extend to Germany?", lines: ["N1"] }] }) });
    let s = questionsOf([page, part], page);
    expect(s.open.map((q) => [q.id, q.text])).toEqual([["job-1:q1", "Does the service extend to Germany?"], ["job-1:q2", "Who audits it?"]]);
    expect(s.all.size).toBe(2);
    expect(s.all.get("job-1:q1")!.history![0]!.text).toBe("Does the service extend to Europe?");
    const close = job("changes", 30, { changes: JSON.stringify({ found: true, items: [], lines: [{ id: "N1", text: "It does.", kind: "statement" }], questions: [{ target: "Does the service extend to Germany?", op: "close", lines: ["N1"] }] }) });
    // Completion order decides, whatever order the list comes in.
    s = questionsOf([close, part, page], page);
    expect(s.open.map((q) => q.id)).toEqual(["job-1:q2"]);
    const q = s.all.get("job-1:q1")!;
    expect(q.state).toBe("answered");
    expect(q.by).toBe(close);
    expect(q.closedAt).toBe(30_000);
    expect(q.lines).toEqual(["N1"]);
    expect(s.byJob.get(part.req.requestId)!.map((x) => [x.op, x.text])).toEqual([["reword", "Does the service extend to Europe?"]]);
    expect(s.byJob.get(close.req.requestId)!.map((x) => [x.op, x.text])).toEqual([["close", "Does the service extend to Germany?"]]);
  });
  it("the Home digest counts the open questions questionsOf gives (78083b3c)", () => {
    expect(readFileSync("src/model.ts", "utf8")).toContain('open: core.page ? questionsOf(list, core.latest).open.length : 0');
  });
});

describe("digests (bb454360)", () => {
  it("keeps a v8 digest, with the figures it lacks unknown", () => {
    const { digests } = splitDigests([{ type: "digest", v: 8, id: "a.org", open: 3, launched: 5, name: "A" }, { type: "digest", v: 7, id: "b.org" }]);
    expect([...digests.keys()]).toEqual(["a.org"]);
    expect(digests.get("a.org")!.open).toBeUndefined();
    expect(digests.get("a.org")!.launched).toBeUndefined();
  });
  it("the home page reads no record unasked: only Try again plans reads", () => {
    const src = readFileSync("src/digest.ts", "utf8");
    expect(src).toContain(".filter((id) => wanted.current.has(id))");
  });
});

describe("Find a project keeps focus (5b1a2a89)", () => {
  it("Home renders one ListTools and one ListFilter above both list states", () => {
    const src = readFileSync("src/Home.tsx", "utf8");
    expect(src.match(/<ListTools /g)!.length).toBe(1);
    expect(src.match(/<ListFilter /g)!.length).toBe(1);
  });
});

const row = (label: string, value: string, extra: Partial<KeyRow> = {}): KeyRow => ({ label, value, url: "", note: "", lines: [], channel: null, badge: null, status: null, accounts: [], tokens: [], values: [], ...extra }) as KeyRow;
const html = (r: KeyRow) => renderToStaticMarkup(createElement(KeyValue, { row: r, chain: "" }));

describe("status tags and short lists (e53252d3)", () => {
  it("a legacy text Supply shows 3 entries, then Show all 4", () => {
    const h = html(row("Supply", "ONE: 1; TWO: 2; THREE: 3; FOUR: 4"));
    expect(h).toContain("Show all 4");
    expect(h).not.toContain("FOUR");
  });
  it("a single Test networks value has its grey tag", () => {
    expect(html(row("Test networks", "Sepolia"))).toContain('class="live-tag">test network<');
  });
  it("a token's explicit status is carried and puts it after the live ones, tagged", () => {
    const old = valueItemOf({ name: "OLD", text: "first token", status: "past" })!;
    expect(tokenOfItem(old).status).toBe("past");
    const tokens = [old, valueItemOf({ name: "SOL", text: "gas" })!, valueItemOf({ name: "EX", text: "governance" })!].map(tokenOfItem);
    const h = html(row("Tokens", "", { tokens }));
    expect(h.indexOf("SOL")).toBeLessThan(h.indexOf("OLD"));
    expect(h.indexOf("EX")).toBeLessThan(h.indexOf("OLD"));
    expect(h).toContain('class="live-tag">past<');
  });
  it("the proof table is live first and tagged", () => {
    const src = readFileSync("src/Record.tsx", "utf8");
    expect(src).toContain('const shownFacts = liveFirst(factRows.filter(keep), (r) => r.line.status ?? "live");');
    expect(src).toContain("<LiveTag s={row.line.status} />");
  });
  it("the instructions name the status field on values and lines", () => {
    const r = readFileSync("templates/instructions/rebuild.txt", "utf8");
    expect(r).toContain("values[{name,text,url,address,chain,status,also[{chain,address}]}]");
    expect(r).toContain("fact{name,value,unit},status,history");
    expect(readFileSync("templates/instructions/changes.txt", "utf8")).toContain("fact{name,value,unit},status,links");
  });
});

describe("Solana addresses in an address field (073a6410)", () => {
  const SYS = "11111111111111111111111111111111";
  it("accepts the system program on Solana, as an address, shortened", () => {
    expect(base58Length(SYS)).toBe(32);
    expect(isAddressFor(SYS, "Solana")).toBe(true);
    expect(isAddressFor(SYS, "")).toBe(false);
    expect(valueItemOf({ name: "System program", chain: "Solana", address: SYS })!.address).toBe(SYS);
    expect(shortAddr(SYS)).toBe("1111…1111");
    const h = html(row("Contracts", "", { items: [valueItemOf({ name: "System program", chain: "Solana", address: SYS })!].map((v) => ({ ...v, explorer: "" })) as never }));
    expect(h).toContain("1111…1111");
    expect(h).toContain(`https://solscan.io/account/${SYS}`);
    expect(h).toContain(`Copy address ${SYS}`);
    expect(h).not.toContain("11,111");
  });
});

describe("Docs shows Home's cards (8943569b, f076f911)", () => {
  const src = readFileSync("src/Docs.tsx", "utf8");
  it("uses the shared cards and the example App picks for both", () => {
    expect(src).toContain("<ExampleCards example={example}");
    expect(readFileSync("src/App.tsx", "utf8")).toContain("<Docs quote={rebuildQuote} example={example}");
    expect(readFileSync("src/styles.css", "utf8")).toContain(".example .label-cards { grid-auto-rows: 1fr; }");
  });
  it("the short introduction", () => {
    expect(src).toContain("Swarmpedia is a public record of projects. The IMD swarm checks websites, posts and contracts");
  });
});
