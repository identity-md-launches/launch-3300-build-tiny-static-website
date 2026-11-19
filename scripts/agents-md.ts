/**
 * Writes public/agents.md from the same functions the site sends bodies with, so the published bodies
 * are byte for byte the site's. Run: npx vite-node scripts/agents-md.ts (then npm run build).
 */
import { writeFileSync } from "node:fs";
import { describeSubject, refFromId, refFromInput } from "../src/subject";
import { ACTIONS, API, IMD, INTAKE, TOPIC_COMPLETED, TOPIC_REQUESTED, APP_TAG } from "../src/config";
import { LEGACY_PRESETS, filedUnder, questionContract, questionPage, questionPost, templateBody, SOURCE_TEMPLATE, EDIT_TEMPLATE, REBUILD_TEMPLATE, EDIT_MAX_LINKS, EDIT_MAX_TEXT, editBody, encodeBody, oracleBody, priorText, questionP4, rebuildBody, sourceBody, SOURCE_MAX_LINKS, SOURCE_MAX_URL, SOURCE_MAX_OBJECTIVE } from "../src/bodies";

const fence = (s: string, lang = "") => "```" + lang + "\n" + s + "\n```";
const SUBJ = { id: "<SUBJECT ID>", domain: "<DOMAIN>", address: "<ADDRESS>", chainId: null };
const subjText = (s: typeof SUBJ) => describeSubject({ ...s, chainId: null, address: "" });
const IMD_REF = refFromId("imd.fun");
const EXAMPLE_REF = refFromInput({ domain: "example.com", address: "0x1111111111111111111111111111111111111111", chain: "8453" });
const src = sourceBody(["<URL 1>", "<URL 2>"], [{ url: "<CHANNEL URL 1>", tie: "strong" }, { url: "<CHANNEL URL 2>", tie: "none" }], "<MAIN CONTRACT>", IMD_REF);
void SUBJ;
void subjText;
const none = { files: [], answers: [] };
const example = {
  files: ["https://api.imd.fun/artifacts/<PAGE HASH>", "https://api.imd.fun/artifacts/<SOURCES HASH>"],
  answers: [{ title: "imd.fun/docs says that a job costs 0.5 IMD", answer: "true", agreed: 5, size: 5, url: "https://explorer.imd.fun/jobs/<JOB ID>" }],
};
const md = `# On the record (test): for agents

This site keeps a public record page for any project. Anyone can pay the IMD swarm from their own wallet, on
Ethereum mainnet (chain 1), to create or rebuild a project's page, to add sources to it, to suggest new summary
text, or to have a panel confirm one fact. There is no backend. Everything below is what the site itself sends
and reads.

## Subjects

A subject is one project, never a person and never a name:

- by its **domain**: the lowercase host without \`www.\`, such as \`imd.fun\`;
- or, when it has no domain, by **chain id and contract address**: \`<chain id>:<address in lowercase>\`,
  such as \`1:0xd34a99bc0f67ae1bbd63c660e6d0b0dd03e263b7\`. Any chain id: the home page's "Add a project" form
  names six chains and takes any other as a number under "Other chain ID" (such as \`137:0x…\`).

A result file (page, lines or edit) whose top-level \`found\` is \`false\` did not identify one real project. The
site never shows it as a page or as lines, never lists it in \`<PRIOR>\`, and does not list a subject on the
home page when its research came back that way and it has no page; Activity shows the job with its \`notes\`,
and the subject's link shows the notes.

Routes: \`#/\` is the list of subjects; \`#/s/<subject id>\` is a subject's page, with the tabs
\`#/s/<subject id>/record\`, \`/sources\`, \`/activity\` and \`/contribute\`. Older links (\`#record\`,
\`#actions\`, \`#line-…\`) open \`imd.fun\`.

Every job body carries \`"tag":{"app":"${APP_TAG}","kind":"add" | "source" | "edit","subject":"<subject id>"}\`.
A job whose tag has no \`subject\` belongs to \`imd.fun\`. The site also reads a tag whose \`subject\` is an
object holding \`"subject":"<subject id>"\`.

\`<SUBJECT>\` in the templates below is filled as \`the project at <domain>\`, plus
\`, whose main contract is <address> on chain <id>\` when the visitor gave a contract (or, for a later rebuild,
an earlier request of the subject named one, or the page marks a main contract on a known chain). A subject with
no domain is filled as \`the project whose main contract is <address> on chain <id>\`. For example:

${fence(describeSubject(EXAMPLE_REF))}

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
| Rebuild the page | \`${ACTIONS.research}\` (tag kind \`add\`, output \`artifacts/page.json\`) |
| Add sources | \`${ACTIONS.research}\` (tag kind \`source\`, output \`artifacts/lines.json\`) |
| Suggest an edit | \`${ACTIONS.research}\` (tag kind \`edit\`, output \`artifacts/edit.json\`) |
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

## Rebuild body (\`${ACTIONS.research}\`)

"Rebuild the page" (or "Create the page" for a new subject, from the home page's "Add a project") sends
\`templates/rebuild.txt\` with \`<SUBJECT>\` filled as above and \`<PRIOR>\` filled in as a numbered list:
\`[F1]\` the artifact URL of the page result shown now, then \`[F2]\`... the artifact URL of every completed page,
sources and edit result of the same subject that is **not folded in** (see below), oldest first, including
earlier pages that were replaced without being named; then, when the page shown has \`dropped\` entries, the
artifact URL of each file those entries came from (\`F<n>:<id>\` names file F<n> of the objective of the request
that produced the page shown; a bare \`<id>\` from an older page names the one earlier file that has that id, so the
site reads those files before it offers the rebuild), each once and followed by \`(reconsider dropped lines)\`, numbered on from the
others and left out if already listed; then \`[A1]\`... each completed panel answer of the subject
as \`question title = answer, N of M, request URL\`; all joined with \`; \`. With nothing yet, \`<PRIOR>\` is
\`none\`. If the list would push the objective to 7,500 characters or more, the site says so and keeps F1 and
every file to reconsider first (room is reserved for them), then the newest result files that fit (the oldest
are deferred first), then the newest panel answers that fit in the room left. If the files to reconsider alone do
not fit, the site does not offer the rebuild. The record has no size limit, and the site reads every line and
every dropped entry of a page, however many: a rebuild drops an earlier line only as an exact duplicate of a line
it kept (named in the dropped entry), as not about the subject, or as replaced by a newer statement from the same
speaker. It merges only exact duplicates of the same attributed line; lines by different speakers or with
different quotes stay separate even when they report the same fact, and a line a proof or panel answer settles is
kept with links to what confirms or contradicts it.

**Folded in.** A result (page, sources or edit) is folded into the page shown only if its artifact URL
(\`${API}/artifacts/<sha-256>\`) appears in the objective of the request that produced the page shown, read from
that request's body in the Intake's \`Requested\` event. Time order alone never counts.

${fence(REBUILD_TEMPLATE)}

With no page yet, the whole body is:

${fence(encodeBody(rebuildBody(none, IMD_REF)), "json")}

With one page, one sources result after it and one panel answer, \`<PRIOR>\` reads:

${fence(priorText(example))}

When that page also dropped lines from a file of the rebuild that produced it, the file is listed again:

${fence(priorText({ ...example, reconsider: ["https://api.imd.fun/artifacts/<HASH OF A FILE THE PAGE DROPPED LINES FROM>"] }))}

## Suggest an edit body (\`${ACTIONS.research}\`)

${fence(encodeBody({ ...editBody("x", none, [], IMD_REF), objective: "<EDIT_OBJECTIVE>" }), "json")}

\`<EDIT_OBJECTIVE>\` is this text. \`<SUBJECT>\` is filled as above, \`<TEXT>\` is the visitor's summary text (at most ${EDIT_MAX_TEXT.toLocaleString("en-US")} characters,
spaces collapsed, paragraphs separated by one blank line), \`<PRIOR>\` is the same list as for a rebuild without files to reconsider, and
\`<URLS>\` is up to ${EDIT_MAX_LINKS} numbered links under the Add sources rules (\`none\` without links).

${fence(EDIT_TEMPLATE)}

## Add sources body (\`${ACTIONS.research}\`), in full

${fence(encodeBody({ ...src, objective: "<SOURCE_OBJECTIVE>" }), "json")}

\`<SOURCE_OBJECTIVE>\` is this text, with \`<SUBJECT>\` filled as above (at every place it appears) and three
placeholders filled from the subject's current record (its page shown):

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
in this order: \`v, question, chainId, window, answerType, evidence, panelSize, quorum, validForSeconds\`.

${fence(encodeBody(oracleBody("<QUESTION>", "panel")), "json")}

Questions answered from chain data (the contract template) carry \`"evidence":"chain"\`, as IMD's free check drafted it:

${fence(encodeBody(oracleBody("<QUESTION>", "chain")), "json")}

### The three question templates

Every question this site asks ends with the sentence

${fence(filedUnder("<subject id>").trim())}

and the site finds a subject's oracle requests by it (they carry no tag). A question without it, including the
three IMD presets this site asked before subjects existed, belongs to \`imd.fun\`. Text fields are 3 to 400
characters with no closing full stop.

**A post says** (panel, kind claim). \`<URL>\` an https x.com or twitter.com \`/status/\` link, \`<HANDLE>\` 1 to 15
letters, digits or \`_\`, without \`@\`:

${fence(questionPost("<URL>", "<HANDLE>", "<TEXT>", "<subject id>"))}

**A web page says** (panel, kind claim). \`<URL>\` an https link of at most 300 characters:

${fence(questionPage("<URL>", "<TEXT>", "<subject id>"))}

**A contract returns** (chain evidence, kind proof; \`chainId\` in the body is the question's chain). \`<CHAIN ID>\`
one of 1, 8453, 42161, 56, 4663 or 11155111 (the chains IMD's check lists), \`<FUNCTION SIGNATURE>\` such as
\`totalSupply()\`, \`<ADDRESS>\` 0x and 40 hex characters, \`<VALUE>\` at most 200 characters:

${fence(questionContract("<CHAIN ID>", "<FUNCTION SIGNATURE>", "<ADDRESS>", "<VALUE>", "<subject id>"))}

For example, a contract question on Base filed under example.com:

${fence(encodeBody(templateBody("contract", questionContract(8453, "totalSupply()", "0x1111111111111111111111111111111111111111", "1000000", "example.com"), 8453)), "json")}

The site reads back the three IMD presets it asked before (P1 and P2 statements, P3 a proof, all filed under
imd.fun), and the post question without the closing sentence:

${LEGACY_PRESETS.map((p) => `- ${p.id}: ${p.question}`).join("\n")}

## What the results hold, and how the site shows them

A rebuild writes \`artifacts/page.json\` with these keys (the last sentence of the rebuild objective):
\`infobox[{label,value,url,lines[]}]\`, \`summary[{text,lines[],paragraph}]\`,
\`lines[{id,section,text,kind,by,sources[],quote,rerun,fact{name,value,unit},from[],links[{type,target}]}]\`,
\`differs[{lines[],why,level}]\`, \`dropped[{id,why}]\` and \`sources[{id,ref,type,read_at,could_open,read_via}]\`,
beside \`subject\`, \`open_questions\`, \`ignored_instructions\` and \`notes\`.

An edit writes \`artifacts/edit.json\`: \`sentences[{text,verdict,lines[],corrected,why}]\` (verdict
\`supported\`, \`supported_by_source\` or \`unsupported\`), \`accepted_summary[{text,lines[],paragraph}]\`,
\`sources[...]\` and \`lines[...]\` as in a sources result, and \`notes\`.

What the site shows for a subject: the newest completed page result (the page shown), plus the lines of every
completed sources and edit result that is not folded in (see "Folded in" above). Activity labels each result
"Shown now", "Folded into the page shown" or "Not yet folded in: included in the next rebuild". The newest
edit not folded in with a non-empty \`accepted_summary\` becomes the summary shown, marked
"edited by <payer>, checked by a research job"; its new lines join the record like added-source lines. After a
rebuild, the site fetches the files named in that rebuild's own \`<PRIOR>\` and warns on the Record tab when an
earlier line id (\`F<n>:<id>\`) appears neither in any line's \`from\` nor in \`dropped\`.

A source job writes \`artifacts/lines.json\`:
\`sources[{id,url,type,publisher,published_at,read_at,could_open,read_via,about_subject,about_why,publisher_is_subject_channel}]\`,
\`lines[{id,source,section,text,kind,by,quote}]\`, \`differs[{lines[],why,level}]\`, \`ignored_instructions[]\`, \`notes\`.

The site applies one label rule to every result, old or new: a line shows as a **statement** only when its
publisher (its \`by\`, or the URL of its source) is one of the record's channels labelled "Own domain" or
"Verified on chain". Every channel is shown with one label: **Own domain** when its host is the subject's domain
or a subdomain of it (never for a chain:address subject); else **Verified on chain** for tie \`strong\`; else
**Not verified** (tie \`weak\` or \`none\` off the domain). A line marked statement whose channel is Not verified,
or whose publisher is not a channel, shows as a **claim**. A source job's line is never a proof. Lines from a source with \`could_open: false\` or
\`about_subject: false\` are not shown; Activity lists each source as \`N lines\`, \`could not open\` or
\`read, not about this subject: <about_why>\`. \`differs\` with \`level: "conflict"\` shows as "Conflicts with the
line above"; \`"question"\` or no level as "Compare with the line above". Proof lines with \`fact\` show as a table
of name, value, chain and block (read from the line's text and re-run steps), all in one table under On chain.
The Overview's key facts table shows \`infobox\` rows, each with a badge the site works out only from the kinds
of the lines the row rests on: "Proven on chain" if any is a proof, else "Stated by <channel name>" for a
statement, else "Reported by <who>" for a claim. Only the Website and Official accounts rows also show their
channel's label (Own domain, Verified on chain or Not verified); an Official accounts row that lists several
accounts shows each account's own label. Without \`infobox\`, the table shows at most: Website (the channel at
the subject's domain), Main contract, and one token symbol proof and one token supply proof (a proof named for
the token's symbol or supply, or re-run with \`symbol()\` or \`totalSupply()\`; never a seat count); it never
lists every channel and contract. The infobox rows a rebuild writes are, in order: Website, Token,
Main contract, Chains, Supply, Seats, Price, Deployed by, Founder or creator, Contributors, Official accounts,
Launched. Every completed panel answer of the subject
is listed under "Panel answers", always the last section of the Record tab, also before the first page.
A line's \`links\` show as "Confirmed by" or "Contradicted by" with the linked proof line or panel answer (\`A<n>\`
from the rebuild's \`<PRIOR>\`).

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
- **Job result:** \`GET ${API}/jobs/<jobId>/result\` lists \`files[]\` with \`name\`, \`hash\`. A rebuild writes
  the file \`page\` (\`artifacts/page.json\`), sources write \`lines\` (\`artifacts/lines.json\`), an edit writes
  \`edit\` (\`artifacts/edit.json\`).
- **File bytes:** \`GET ${API}/artifacts/<hash>\`. The SHA-256 of the bytes must equal \`hash\`.
- **Fallback:** the completion's \`uri\` (\`ipfs://<CID>/result.json\`) through an IPFS gateway; its bytes must
  hash (keccak-256) to the event's \`resultHash\`, then fetch the named file as above.
- **Panel answer:** \`GET ${API}/oracle/requests/<id>?members=0\` gives \`status\`, \`agreement.answer\`,
  \`agreement.agreed\` and \`panelSize\`.
`;
writeFileSync("public/agents.md", md);
console.log(`public/agents.md: ${md.length} characters`);
