/**
 * Writes src/published.json: one compact record per project (its digest, as the site takes it when a page is opened),
 * read from the Intake and api.imd.fun with the site's own code. Home uses it on a first visit, for a project whose
 * scan holds every result the record was taken from, so names, counts, launch dates and contract lookups need no full
 * record. Run: npx vite-node scripts/published.ts [rpc url] (then npm run build). It prints any result it could not read.
 */
import { writeFileSync } from "node:fs";
import { loadTaggedRequests } from "../src/chain";
import { RPCS } from "../src/config";
import { firstNamedBlock } from "../src/counts";
import { digestOf, isCurrent, leftOut } from "../src/model";
import { follow, markNotRead, readable, scannedActivity, settleReads } from "../src/useActivity";

const rpc = process.argv[2];
const scan = await loadTaggedRequests(null, { rpcs: rpc ? [{ url: rpc, span: 9_000n }] : RPCS });
const firstNamed = firstNamedBlock(scan.requests);
const done = (id: string) => scan.completions.get(id.toLowerCase());
const light = readable(markNotRead(scan.requests.map((r) => scannedActivity(r, done(r.requestId))), { firstNamed }));
const out = [];
for (const id of [...new Set(scan.requests.map((r) => r.subject))].sort()) {
  const reqs = scan.requests.filter((r) => r.subject === id);
  const base = await Promise.all(reqs.map((r) => follow(r, done(r.requestId), "meta")));
  const all = await settleReads(base, (a) => follow(a.req, a.completion, true), { firstNamed });
  for (const a of all) if (a.sourcesError) console.error(`${id}: ${a.req.requestId}: ${a.sourcesError}`);
  const mine = light.filter((a) => a.req.subject === id);
  const d = digestOf(id, readable(all), leftOut(mine, readable(all)));
  console.log(id, d ? `${d.name}: ${d.counts.all} lines, ${d.open} open, launched ${d.launched}, ${d.contracts.length} contracts, logo ${d.logo}, failed ${d.failedReads}, left out ${d.uncounted?.length ?? 0}, current: ${isCurrent(d, mine)}` : "no digest");
  // The example's lines and the logo image are read with the page; the published record only lists.
  if (d && d.failedReads === 0) out.push({ ...d, logo: d.logo === "failed" ? "none" : d.logo, example: null });
}
writeFileSync(new URL("../src/published.json", import.meta.url), `${JSON.stringify(out)}\n`);
console.log(`src/published.json: ${out.length} projects, head ${scan.lastBlock}`);
