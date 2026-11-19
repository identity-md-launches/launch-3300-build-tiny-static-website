import { writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { encodeAbiParameters, pad, stringToHex, toHex, type Hex } from "viem";
import { rebuildBody, sourceBody, editBody, oracleBody, Q_P1, encodeBody, artifactUrl, researchBody } from "../src/bodies";
import { LAUNCH_BLOCK, TOPIC_REQUESTED, TOPIC_COMPLETED } from "../src/config";
import { refFromId } from "../src/subject";
const IMD = refFromId("imd.fun");
const sha = (s: string) => createHash("sha256").update(Buffer.from(s, "utf8")).digest("hex");
const L = Number(LAUNCH_BLOCK);
const files: Record<string, string> = {};
const put = (o: unknown) => { const t = JSON.stringify(o); const h = sha(t); files[h] = t; return h; };
const page1 = put({ subject: { name: "Old" }, lines: [{ id: "L1", section: "what_it_does", text: "Old one", kind: "claim" }, { id: "L2", section: "what_it_does", text: "Old two", kind: "claim" }, { id: "L3", section: "on_chain", text: "Old three", kind: "proof" }, { id: "L4", section: "history", text: "Old four", kind: "claim" }] });
const src1 = put({ sources: [{ id: "S1", url: "https://news.example/a", publisher: "news", could_open: true, about_subject: true }], lines: [{ id: "E1", source: "S1", section: "history", text: "Old source one", kind: "claim" }, { id: "E2", source: "S1", section: "history", text: "Old source two lost", kind: "claim" }] });
const prior = { files: [artifactUrl(page1), artifactUrl(src1)], answers: [{ title: "The docs price a job at 0.5 IMD", answer: "true", agreed: 5, size: 5, url: "https://explorer.imd.fun/jobs/job-6" }] };
const page2 = put({
  subject: { name: "IMD (imd.fun)", one_line: "A swarm of agents you pay in IMD.", channels: [{ label: "imd.fun", url: "https://imd.fun/", tie: "weak" }], contracts: [{ address: "0xd34a99bc0f67ae1bbd63c660e6d0b0dd03e263b7", chain: "Ethereum", role: "token", main: true }] },
  infobox: [
    { label: "Token", value: "IMD", url: "https://etherscan.io/token/0xd34a99bc0f67ae1bbd63c660e6d0b0dd03e263b7", lines: ["L2"] },
    { label: "Seat supply", value: "2,000", lines: ["L2"] },
    { label: "Website", value: "imd.fun", url: "https://imd.fun/", lines: ["L1"] },
  ],
  summary: [
    { text: "IMD is a swarm.", lines: ["L1"], paragraph: 1 },
    { text: "There are 2,000 seats.", lines: ["L2", "L3"], paragraph: 1 },
    { text: "A job costs 0.5 IMD.", lines: ["L3"], paragraph: 2 },
  ],
  lines: [
    { id: "L1", section: "what_it_does", text: "IMD is a swarm of agents.", kind: "statement", by: "imd.fun", sources: ["R1"], quote: "a swarm", from: ["F1:L1", "F1:L2"] },
    { id: "L2", section: "money", text: "The seat collection has 2,000 tokens.", kind: "proof", sources: ["R2"], rerun: "Call totalSupply against the database index on Ethereum at block 0x1938720.", fact: { name: "Seat supply", value: "2,000", unit: "seats" }, from: ["F1:L3"], links: [{ type: "confirms", target: "A1" }] },
    { id: "L3", section: "money", text: "A post says a job costs 5 IMD.", kind: "claim", by: "someone", sources: ["R3"], quote: "5 IMD", from: ["F2:E1"], links: [{ type: "confirms", target: "L2" }, { type: "contradicts", target: "A1" }] },
  ],
  dropped: [{ id: "F2:E1x", why: "not about the subject" }, { id: "F1:L4", why: "duplicate of L1" }],
  sources: [{ id: "R1", ref: "https://imd.fun/" }, { id: "R2", ref: "https://etherscan.io/" }, { id: "R3", ref: "https://x.com/someone/status/1" }],
  open_questions: ["Who runs the seats?"],
});
const src2 = put({ sources: [{ id: "S1", url: "https://blog.example/b", publisher: "blog", could_open: true, about_subject: true }], lines: [{ id: "N1", source: "S1", section: "history", text: "A blog says IMD launched in 2026.", kind: "claim", quote: "launched" }] });
const edit = put({
  sentences: [
    { text: "IMD is a swarm of agents.", verdict: "supported", lines: ["L1"] },
    { text: "It is the best swarm.", verdict: "unsupported", why: "Praise is always unsupported." },
    { text: "Seats cost 1 ETH.", verdict: "supported_by_source", lines: ["L1"], why: "A visitor source says so." },
  ],
  accepted_summary: [{ text: "IMD is a swarm of agents.", lines: ["L1"], paragraph: 1 }, { text: "Seats cost 1 ETH.", lines: ["L1"], paragraph: 2 }],
  sources: [{ id: "V1", url: "https://seats.example/", publisher: "seats", could_open: true, about_subject: true }],
  lines: [{ id: "L1", source: "V1", section: "money", text: "Seats cost 1 ETH.", kind: "claim", quote: "1 ETH" }],
});
const reqs = [
  { n: 1, action: "job.open@job-1", body: researchBody(), file: ["page", page1], cb: 100 },
  { n: 2, action: "job.open@job-1", body: sourceBody(["https://news.example/a"], [], "", IMD), file: ["lines", src1], cb: 101 },
  { n: 6, action: "oracle.request@oracle-1", body: oracleBody(Q_P1, "panel"), file: null, cb: 102 },
  { n: 3, action: "job.open@job-1", body: rebuildBody(prior, IMD), file: ["page", page2], cb: 103 },
  { n: 4, action: "job.open@job-1", body: sourceBody(["https://blog.example/b"], [], "", IMD), file: ["lines", src2], cb: 104 },
  { n: 5, action: "job.open@job-1", body: editBody("x", prior, [], IMD), file: ["edit", edit], cb: 105 },
];
const hx = (n: number) => toHex(n) as Hex;
const out = { head: L + 200, requests: [] as unknown[], completions: [] as unknown[], intake: {} as Record<string, unknown>, results: {} as Record<string, unknown>, files, page2, src2, edit, oracleId: "11111111-2222-4333-8444-555555555555" };
for (const r of reqs) {
  const id = pad(toHex(r.n));
  const tx = pad(toHex(1000 + r.n));
  out.requests.push({ topics: [TOPIC_REQUESTED, id, pad("0x00856bd495941f3b95da5b7e374c76d822c9059e"), pad(stringToHex(r.action), { dir: "right" })], data: encodeAbiParameters([{ type: "bytes" }, { type: "address" }, { type: "bytes4" }, { type: "address" }, { type: "uint256" }], [stringToHex(encodeBody(r.body)), "0x0000000000000000000000000000000000000000", "0x00000000", "0xd34a99bc0f67ae1bbd63c660e6d0b0dd03e263b7", 500000000000000000n]), blockNumber: hx(L + r.n), transactionHash: tx, logIndex: "0x0" });
  out.completions.push({ topics: [TOPIC_COMPLETED, id], data: encodeAbiParameters([{ type: "uint8" }, { type: "bytes32" }, { type: "string" }, { type: "bool" }], [0, pad("0x01"), "", true]), blockNumber: hx(L + r.cb), transactionHash: pad(toHex(2000 + r.n)), logIndex: "0x0" });
  out.intake[tx] = { entries: [{ requestId: id, state: "completed", admission: { result: r.file ? { kind: "job", jobId: `job-${r.n}` } : { kind: "oracle", requestId: out.oracleId } } }] };
  if (r.file) out.results[`job-${r.n}`] = { jobId: `job-${r.n}`, files: [{ name: r.file[0], hash: r.file[1] }] };
}
writeFileSync(process.argv[2] ?? "test/scratch/fx.json", JSON.stringify(out));
console.log("fixture", Object.keys(files).length, "files");
