/**
 * Writes public/agents.md from the same functions the site sends bodies with, so the published bodies
 * are byte for byte the site's. Run: npx vite-node scripts/agents-md.ts (then npm run build).
 */
import { writeFileSync } from "node:fs";
import { ACTIONS, API, IMD, INTAKE, TOPIC_COMPLETED, TOPIC_REQUESTED, APP_TAG } from "../src/config";
import { PRESETS, SOURCE_TEMPLATE, encodeBody, oracleBody, questionP4, researchBody, sourceBody, SOURCE_MAX_LINKS, SOURCE_MAX_URL, SOURCE_MAX_OBJECTIVE } from "../src/bodies";

const fence = (s: string, lang = "") => "```" + lang + "\n" + s + "\n```";
const src = sourceBody(["<URL 1>", "<URL 2>"], [{ url: "<CHANNEL URL 1>", tie: "strong" }, { url: "<CHANNEL URL 2>", tie: "none" }], "<MAIN CONTRACT>");
const md = `# IMD on the record: for agents

This page is a public record for one subject, IMD (imd.fun). Anyone can pay the IMD swarm from their own
wallet, on Ethereum mainnet (chain 1), to research it, to add sources to it, or to have a panel confirm one
fact. There is no backend. Everything below is what the site itself sends and reads.

## The call

- Chain: Ethereum mainnet, chain id 1.
- IMD Intake v2: \`${INTAKE}\`
- Asset: IMD \`${IMD}\` (18 decimals). IMD has no permit.
- Call: \`request(bytes32 action, bytes body, (address,bytes4) callback, address asset, uint256 amount)\`
  with an empty callback \`(0x0000000000000000000000000000000000000000, 0x00000000)\`, asset IMD and the amount
  read in step 1.
- \`body\` is the compact UTF-8 JSON shown below, as bytes.
- \`action\` is the action id as UTF-8, right-padded with zeros to 32 bytes.

| Action | Id |
| --- | --- |
| Research the page | \`${ACTIONS.research}\` |
| Add sources | \`${ACTIONS.research}\` (same action, a different body) |
| Confirm a fact | \`${ACTIONS.oracle}\` |

## Paying, in order

1. **Read the price first:** \`priceOf(bytes32 action, address asset)\` on the Intake, with asset IMD. On
   2026-11-19 it returned \`500000000000000000\` (0.5 IMD) for both actions. Do not hard-code it.
2. **Approve exactly that amount**, and only if \`allowance(payer, Intake)\` on IMD is below it:
   \`approve(${INTAKE}, <price>)\`. Never approve more.
3. Read the price again. If it changed, stop and review. Otherwise send
   \`request(action, body, (address(0), 0x00000000), IMD, <price>)\`.

Payments go to IMD and are not refunded. A body the Intake refuses is a spent payment, so check it first
for free with \`POST ${API}/requests/check\` and \`{"action":"job.open" | "oracle.request","input":<body or short form>}\`,
and send only when \`blockers\` is \`[]\`.

## Research body (\`${ACTIONS.research}\`), in full

${fence(encodeBody(researchBody()), "json")}

## Add sources body (\`${ACTIONS.research}\`), in full

${fence(encodeBody({ ...src, objective: "<SOURCE_OBJECTIVE>" }), "json")}

\`<SOURCE_OBJECTIVE>\` is this text, with three placeholders filled from the current record (the newest research
page):

- \`<URLS>\`: the numbered links, \`[1] https://a.example/x; [2] https://b.example/y\`.
- \`<CHANNELS>\`: each of \`subject.channels[]\` as \`url (tie: strong|weak|none)\`, joined with \`, \`
  (\`none known\` if there is no record yet).
- \`<MAIN>\`: the address of the contract marked \`main\` in \`subject.contracts[]\` (\`not known\` if none).

${fence(SOURCE_TEMPLATE)}

Rules the site applies to the links: one per line, https only, at most ${SOURCE_MAX_URL} characters each, no
quotes, spaces or line breaks, repeats dropped, at most ${SOURCE_MAX_LINKS} links, and the finished objective
under ${SOURCE_MAX_OBJECTIVE.toLocaleString("en-US")} characters.

With two placeholder links, two placeholder channels and a placeholder main contract, the whole body is:

${fence(encodeBody(src), "json")}

## Oracle body (\`${ACTIONS.oracle}\`), with no tag

The Intake refuses an oracle body with any key it does not know. A body carrying \`"tag"\` was refused with
\`body_invalid: Unrecognized key "tag"\` (transaction
\`0xadda56adefd755e63bab2c004de49056100962c5f91dbc461ea65fa4deb9d8df\`). Oracle bodies hold exactly these keys,
in this order: \`v, question, chainId, window, answerType, evidence\` (only when \`"panel"\`)\`, panelSize, quorum, validForSeconds\`.

${fence(encodeBody(oracleBody("<QUESTION>", "panel")), "json")}

Questions answered from chain data leave out \`evidence\` (the default is \`"chain"\`):

${fence(encodeBody(oracleBody("<QUESTION>", "chain")), "json")}

### Preset questions, word for word

${PRESETS.map((p) => `**${p.id}. ${p.title}** (${p.kind}, evidence ${p.evidence})\n\n${fence(p.question)}\n\nBody:\n\n${fence(encodeBody(oracleBody(p.question, p.evidence)), "json")}`).join("\n\n")}

**P4. A post on X** (claim, evidence panel). Fill \`<url>\` (an https x.com or twitter.com \`/status/\` link),
\`<handle>\` (1 to 15 letters, digits or \`_\`, without \`@\`) and \`<text>\` (3 to 400 characters, no closing full stop):

${fence(questionP4("<url>", "<handle>", "<text>"))}

The site finds oracle requests by this wording, since they carry no tag: a question that is exactly P1, P2 or
P3, or that matches \`Does the post at <url>, published by the X account @<handle>, state that <text>? Answer true only if ...\`.
P1 and P2 are statements, P3 a proof, P4 a claim. Job bodies carry \`"tag":{"app":"${APP_TAG}","kind":"add" | "source"}\`.

## What the results hold, and how the site shows them

Research writes \`artifacts/page.json\` with these keys (the last sentence of the research objective):
\`summary[{text,lines[]}]\` (3 to 5 sentences, each naming the line ids it rests on),
\`lines[{id,section,text,kind,by,sources[],quote,rerun,fact{name,value,unit}}]\`,
\`differs[{lines[],why,level}]\` and \`sources[{id,ref,type,read_at,could_open,read_via}]\`, beside \`subject\`,
\`open_questions\`, \`ignored_instructions\` and \`notes\`.

A source job writes \`artifacts/lines.json\`:
\`sources[{id,url,type,publisher,published_at,read_at,could_open,read_via,about_subject,about_why,publisher_is_subject_channel}]\`,
\`lines[{id,source,section,text,kind,by,quote}]\`, \`differs[{lines[],why,level}]\`, \`ignored_instructions[]\`, \`notes\`.

The site applies one label rule to every result, old or new: a line shows as a **statement** only when its
publisher (its \`by\`, or the URL of its source) is one of the record's channels with tie \`strong\` or \`weak\`.
A line marked statement whose channel has tie \`none\`, or whose publisher is not a channel, shows as a
**claim**. A source job's line is never a proof. Lines from a source with \`could_open: false\` or
\`about_subject: false\` are not shown; Activity lists each source as \`N lines\`, \`could not open\` or
\`read, not about this subject: <about_why>\`. \`differs\` with \`level: "conflict"\` shows as "Conflicts with the
line above"; \`"question"\` or no level as "Compare with the line above". Proof lines with \`fact\` show as a table
of name, value, chain and block (read from the line's text and re-run steps).

## Read routes

No wallet is needed for any of these.

- **Requests:** \`eth_getLogs\` on the Intake, topic0 \`${TOPIC_REQUESTED}\` =
  \`Requested(bytes32 indexed requestId, address indexed payer, bytes32 indexed action, bytes body, address callbackTarget, bytes4 callbackSelector, address asset, uint256 amount)\`.
- **Completions:** topic0 \`${TOPIC_COMPLETED}\` =
  \`Completed(bytes32 indexed requestId, uint8 status, bytes32 resultHash, string uri, bool delivered)\`.
  Status 0 completed, 1 refused, 2 failed; no event means pending.
- **What IMD knows about a request:** \`GET ${API}/intake/1/<transactionHash>\` gives \`entries[].state\`,
  \`reason\` and \`detail\` (why it was refused or failed), \`admission.result.jobId\` for jobs and
  \`admission.result.requestId\` for oracle questions.
- **Job result:** \`GET ${API}/jobs/<jobId>/result\` lists \`files[]\` with \`name\`, \`hash\`. Research writes
  the file \`page\` (\`artifacts/page.json\`), sources write \`lines\` (\`artifacts/lines.json\`).
- **File bytes:** \`GET ${API}/artifacts/<hash>\`. The SHA-256 of the bytes must equal \`hash\`.
- **Fallback:** the completion's \`uri\` (\`ipfs://<CID>/result.json\`) through an IPFS gateway; its bytes must
  hash (keccak-256) to the event's \`resultHash\`, then fetch the named file as above.
- **Panel answer:** \`GET ${API}/oracle/requests/<id>?members=0\` gives \`status\`, \`agreement.answer\`,
  \`agreement.agreed\` and \`panelSize\`.
`;
writeFileSync("public/agents.md", md);
console.log(`public/agents.md: ${md.length} characters`);
