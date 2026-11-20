/**
 * Runs a rebuild body and a changes body, each with a long <PRIOR>, through IMD's free request check and prints the
 * objective lengths and results (README, "Free request check"). The bodies come from the site's own functions; the
 * artifact hashes are example values (1, 2, 3 … as 64 hex digits), since the check judges wording, not files.
 * Each <PRIOR> holds as many files as the site fits under MAX_OBJECTIVE (7,900 characters).
 * Run: npx vite-node scripts/check-objectives.ts
 */
import { artifactUrl, fitsObjective, MAX_OBJECTIVE, rebuildBody } from "../src/bodies";
import { changesBody, lineTarget, type Change } from "../src/changes";
import { API } from "../src/config";
import { refFromId } from "../src/subject";
import type { ChannelTie } from "../src/bodies";

const IMD = refFromId("imd.fun");
const channels: ChannelTie[] = [{ url: "https://imd.fun/", tie: "strong" }];
const files = (k: number) => Array.from({ length: k }, (_, i) => artifactUrl((i + 1).toString(16).padStart(64, "0")));
const change: Change = {
  id: "c1",
  type: "context",
  target: lineTarget("L1", "IMD is a swarm of agents."),
  note: "Check how the protocol describes agent coordination.",
  links: ["https://imd.fun/docs/"],
};

/** The most files whose objective still fits, as the site's planner would send. */
function longest(make: (k: number) => { objective: string }) {
  let k = 1;
  while (fitsObjective(make(k + 1).objective.length)) k++;
  return { k, body: make(k) };
}

const bodies = {
  rebuild: longest((k) => rebuildBody({ files: files(k), answers: [] }, IMD, channels)),
  changes: longest((k) => changesBody([change], { files: files(k), answers: [] }, channels, IMD, (id) => `F1:${id}`)),
};

for (const [name, { k, body }] of Object.entries(bodies)) {
  const res = await fetch(`${API}/requests/check`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ action: "job.open", input: body }),
  });
  const text = await res.text();
  let j: { judged?: boolean; blockers?: unknown; suggestions?: unknown } = {};
  try {
    j = JSON.parse(text);
  } catch {
    /* printed raw below */
  }
  console.log(
    JSON.stringify({
      name,
      at: new Date().toISOString(),
      priorFiles: k,
      objectiveLength: body.objective.length,
      max: MAX_OBJECTIVE,
      status: res.status,
      judged: j.judged,
      blockers: j.blockers,
      suggestions: j.suggestions,
      ...(j.blockers === undefined ? { raw: text.slice(0, 400) } : {}),
    }),
  );
}
