/**
 * Writes public/agents.md from the same functions the site sends bodies with, so the published bodies
 * are byte for byte the site's. Run: npx vite-node scripts/agents-md.ts (then npm run build).
 */
import { writeFileSync } from "node:fs";
import { INSTRUCTIONS } from "../src/instructions";
import { MAX_OBJECTIVE } from "../src/bodies";
import { describeSubject, refFromId, refFromInput } from "../src/subject";
import { ACTIONS, API, IMD, INTAKE, INSTRUCTIONS_GATEWAY, TOPIC_COMPLETED, TOPIC_REQUESTED, APP_TAG } from "../src/config";
import { CHANGES_TEMPLATE, CHANGE_MAX_LINKS, NOTE_MAX, READ_MAX_LINKS, changesBody, itemsText, lineTarget, noTarget, sentenceTarget, type Change } from "../src/changes";
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
const EXAMPLE_CHANGES: Change[] = [
  { id: "1", type: "wrong", target: lineTarget("L3", "The token has a fixed supply of 1 billion."), note: "The supply was raised to 1.2 billion in March.", links: ["https://example.com/blog/supply"] },
  { id: "2", type: "reword", target: sentenceTarget("It is run by a small team."), note: "It is run by a team of three named founders.", links: [] },
  { id: "3", type: "links", target: noTarget(), note: "", links: ["https://example.com/docs", "https://example.org/review"] },
];
const example = {
  files: ["https://api.imd.fun/artifacts/<PAGE HASH>", "https://api.imd.fun/artifacts/<SOURCES HASH>"],
  answers: [{ title: "imd.fun/docs says that a job costs 0.5 IMD", answer: "true", agreed: 5, size: 5, url: "https://explorer.imd.fun/jobs/<JOB ID>" }],
};
const md = `# On the record (test): for agents

This site keeps a public record page for any project. Anyone can pay the IMD swarm from their own wallet, on
Ethereum mainnet (chain 1), to create or rebuild a project's page, to send a batch of suggested changes to it
(what is wrong, context, a source that backs a line up, a reworded summary sentence, a missing line, links to
read), or to have a panel confirm one fact. There is no backend. Everything below is what the site itself sends
and reads.

## Subjects

A subject is one project, never a person and never a name:

- by its **domain**: its registrable domain in lowercase, such as \`imd.fun\` or \`uniswap.org\`. The whole Public
  Suffix List decides it, ICANN and private rules with their wildcards and exceptions, resolved from the full
  hostname (\`app.uniswap.org\`, \`www.uniswap.org\` and \`docs.uniswap.org\` are all \`uniswap.org\`;
  \`app.test.k12.ak.us\` is \`test.k12.ak.us\`), and shared hosts such as \`github.io\`, \`vercel.app\`, \`netlify.app\`,
  \`pages.dev\` and \`imd.site\` count as suffixes, so a project on one of them owns only its own subdomain
  (\`me.github.io\`). A bare public suffix (\`github.io\`, \`co.uk\`) is never a subject. A subject's **own domain** is that
  registrable domain and every subdomain of it. A project added by a subdomain gets the registrable domain as its
  id; requests tagged with an older subdomain id (\`app.uniswap.org\`) belong to the registrable domain's record, and
  \`#/s/app.uniswap.org\` opens \`uniswap.org\`;
- or, when it has no domain, by **chain id and contract address**: \`<chain id>:<address in lowercase>\`,
  such as \`1:0xd34a99bc0f67ae1bbd63c660e6d0b0dd03e263b7\`. Any chain id: when an address has no page yet, the
  home bar's chain picker names six chains and takes any other as a number under "Other chain ID" (such as \`137:0x…\`).

**The home bar** is one input, "A domain or a 0x address", with one button, "Look it up". Typing filters the list
of projects. On submit it opens the subject whose id is that domain, or whose id or listed contracts include that
address (on the chain given as \`<chain id>:0x…\`, or on any chain when none is given; an address recorded on
another chain never matches). A pasted link is reduced to its host, even an explorer link with an address in its
path. With no match it shows "No page yet for <input>. Adding one costs <price> and starts one research job.", a
chain picker when the input is an address, and "Add this project", which opens the first-rebuild dialog. There is
no separate search box or add form. A subject's **Related** entries link to its page when one exists (matched the
same way), else "Add this project" opens the home bar filled in with the related id.

**First page.** A subject with no page shows, on Home and on its own Overview alike: "First page in progress" while
its first rebuild is pending, "First page refused: <reason>" (or "First page failed: <reason>") when IMD refused
or failed it, and "No project found: <notes>" when the job's file said \`found: false\`.

A result file (page, lines or edit) whose top-level \`found\` is \`false\` did not identify one real project. The
site never shows it as a page or as lines and never lists it in \`<PRIOR>\`. The subject stays on Home with
"No project found: <notes>", Activity shows the job with its \`notes\`, and the subject's Overview shows the same.

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
| Rebuild the page | \`${ACTIONS.research}\` (tag kind \`add\`, outputs \`artifacts/page.json\` and \`artifacts/logo.png\`) |
| Suggest changes | \`${ACTIONS.research}\` (tag kind \`changes\`, output \`artifacts/changes.json\`) |
| Add sources (older; no longer offered, results still read) | \`${ACTIONS.research}\` (tag kind \`source\`, output \`artifacts/lines.json\`) |
| Suggest an edit (older; no longer offered, results still read) | \`${ACTIONS.research}\` (tag kind \`edit\`, output \`artifacts/edit.json\`) |
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

## Instruction files and the objective shape

IMD refuses an objective longer than 8,000 characters (checked on 2026-11-20 with \`POST /requests/check\`: 8,000
passes, 8,001 returns \`objective: Too big: expected string to have <=8000 characters\`). So the rebuild and changes
objectives are short and fixed, with only what varies; everything that does not change from request to request is
a static text file on this site:

- **Where they live:** \`/instructions/<name>-<first 12 hex characters of its sha256>.txt\` on this site (current:
  \`${INSTRUCTIONS.rebuild.path}\` and \`${INSTRUCTIONS.changes.path}\`).
- **The address in the objective** is the same file by its content address at an HTTPS gateway that answers a plain
  GET with the bytes: \`${INSTRUCTIONS_GATEWAY}<CID>?filename=<file name>\`, where \`<CID>\` is the raw CIDv1 of the
  file's sha256 (\`b\` + base32 of \`01 55 12 20 <digest>\`). The site is pinned with raw leaves, so each file (one
  block) is served at that CID once the site version holding it is pinned, and the address can never serve other
  bytes. Current files, with the exact address and hash to put in an objective:
  - rebuild: ${INSTRUCTIONS.rebuild.url}, sha256 \`${INSTRUCTIONS.rebuild.sha256}\`
  - changes: ${INSTRUCTIONS.changes.url}, sha256 \`${INSTRUCTIONS.changes.sha256}\`
- **Why not the site's name:** an address containing the ENS name (on eth.limo or a gateway's \`/ipns/\` path) makes
  IMD's free check refuse the objective with \`unsafe_brief\`, and dweb.link and ipfs.io answer a plain client with
  HTTP 429 and a service-worker notice instead of the file (both seen on 2026-11-21).
- **They never change.** A new wording gets a new file name; every old file keeps being served, so a request already
  sent can always be re-read with the instructions it named.
- **An agent sending its own request must use the current file and its hash**, exactly as above. The site counts a
  page as "built with an older format" when the instruction hash in the objective of the request that produced it
  differs from the current file's hash (a page built before instruction files names none and counts as older).
- **The job** fetches the file first and checks its sha256. If it cannot, or the hash differs, it writes
  \`found\` false with "instructions unavailable" in \`notes\` and stops; the site then shows no page from it.
- **Room:** the objective may be at most ${MAX_OBJECTIVE.toLocaleString("en-US")} characters (100 below IMD's limit). Room for
  \`<PRIOR>\`, \`<ITEMS>\` and links is that minus the rest of the objective.

## Rebuild body (\`${ACTIONS.research}\`)

"Rebuild the page" (or "Create the page" for a new subject, from "Add this project" under the home bar) sends
\`templates/rebuild.txt\`:

${fence(REBUILD_TEMPLATE)}

\`<URL>\` and \`<HASH>\` are the current rebuild instruction file and its sha256 (above). \`<SUBJECT>\` is filled as
above, \`<CHANNELS>\` is the record's channels as \`url (tie: strong|weak|none)\`, comma-separated (\`none known\`
without any), and \`<PRIOR>\` is a numbered list:
\`[F1]\` the artifact URL of the page result shown now, then \`[F2]\`... the artifact URL of each completed page,
sources, edit and changes result of the same subject that is **not folded in** (see below), in time order, including
earlier pages that were replaced without being named; then, when the page shown has \`dropped\` entries, the
artifact URL of each file those entries came from (\`F<n>:<id>\` names file F<n> of the objective of the request
that produced the page shown; a bare \`<id>\` from an older page names every earlier file that has that id, all of them when
the id is ambiguous, so the site reads those files before it offers the rebuild), each once and followed by \`(reconsider dropped lines)\`, numbered on from the
others and left out if already listed; then \`[A1]\`... each completed panel answer of the subject
as \`question title = answer, N of M, request URL\`; all joined with \`; \`. With nothing yet, \`<PRIOR>\` is
\`none\`.

**A rebuild is always offered.** When everything does not fit, the site includes, in this order, as much as fits:
the page shown (F1, always); the results not folded in, newest first; then the files marked reconsider; then the
newest panel answers in the room left. The Contribute tab says what was left out. Left-out results stay "Not yet
folded in" and left-out dropped lines stay listed as dropped; a dropped entry whose file a rebuild was not given is
still owed, and the next rebuild lists that file marked \`(reconsider dropped lines)\`.

The rules the job follows (in the instruction file, not the objective): the record has no size limit, and the site
reads every line and every dropped entry, origin (\`from\`), speaker (\`by\`) and earlier reading (\`history\`) of a
page, however many.
A rebuild drops an earlier line only as not about the subject, or as replaced by a newer statement from the same
speaker. When a project has more than one token or product, the rebuild writes one line per flow between them (what
each is for, what value moves, and whether a contract moves it automatically or an operator by hand), never
presents a flow the project only describes as enforced by contracts, and gives the summary one short paragraph on
how the parts fit ("the project says" for stated flows). No line, infobox value or \`by\` says "an outside source"
or "a news site": the publisher is named. A first page (\`<PRIOR>\` is \`none\`) reads at least the home page,
the documentation index and main pages, linked repositories and the main contract's explorer page, looks for at
least 3 outside sources and aims for 5 lines per section and 8 proofs, without padding; a short section is
explained in \`notes\`. Notes are written afresh each run. Lines that say the same thing are **merged into one line**, even across files, speakers and dates: the
merged line lists every origin in \`from\` and every speaker in \`by\`, counts as carried forward, and its origins
are not also listed in \`dropped\`; the record never holds two lines with the same meaning. A check run at
different blocks stays one proof line with the newest reading, older readings in \`history\` as \`{block,value}\`.
A line a proof or panel answer settles is kept with links to what confirms or contradicts it. A link's \`type\` is
\`confirms\` only when the proof or panel answer establishes the whole sentence as written, including its tense (a value
read at deployment confirms "was X at launch", not "is X"); \`partly\` when it establishes only part; \`contradicts\`
when it shows the sentence was wrong when written; \`outdates\` (on the older line, targeting the newer one) when a
newer source shows that something it reported has since changed while it was accurate about its own source.
Settling a line never changes its \`kind\` or \`by\`. When an infobox value lists several things the job gives
them in \`values\` as objects with exactly the keys \`name\`, \`text\` (what follows the name; may be empty) and
optionally \`url\`, or \`address\` with \`chain\`, and no other shape; the infobox has at most 15 rows and never a value of "unverified" or "unknown".
For Founder or creator, Contributors and any line about a person's role the job uses every speaker, strongest first:
the project on its own channels, another person at the project, an outside publication, the person about themselves.

**Two outputs, both always written.** The body declares \`artifacts/page.json\` and \`artifacts/logo.png\`
(\`image/png\`). The job takes the logo only from the subject's own domain (apple-touch-icon, favicon or
og:image, converted to a PNG of at most 256 by 256) and sets \`logo{url,fetched_at}\` in the page file. When it
finds no icon it still writes a 1 by 1 transparent placeholder PNG, so the declared file exists, and leaves
\`logo\` out of the page file. The site shows the logo file only when the page's \`logo\` is present, after its
bytes match the listed SHA-256 and decode as a whole PNG; otherwise it shows a tile with the name's first letter.
It never loads an image from the project's server or any other site.

**Folded in.** A result (page, sources or edit) is folded into the page shown only if its artifact URL
(\`${API}/artifacts/<sha-256>\`) appears in the objective of the request that produced the page shown, read from
that request's body in the Intake's \`Requested\` event. Time order alone never counts.

The rebuild instruction file, in full (${INSTRUCTIONS.rebuild.file}):

${fence(INSTRUCTIONS.rebuild.text.trim())}

With no page yet, the whole body is:

${fence(encodeBody(rebuildBody(none, IMD_REF)), "json")}

With one page, one sources result after it and one panel answer, \`<PRIOR>\` reads:

${fence(priorText(example))}

When that page also dropped lines from a file of the rebuild that produced it, the file is listed again:

${fence(priorText({ ...example, reconsider: ["https://api.imd.fun/artifacts/<HASH OF A FILE THE PAGE DROPPED LINES FROM>"] }))}

## Suggest changes body (\`${ACTIONS.research}\`)

A visitor collects changes in a tray (kept in the browser per subject) and sends them as ONE request, one payment:

${fence(encodeBody({ ...changesBody([], none, [], IMD_REF, () => ""), tag: { app: APP_TAG, kind: "changes", subject: "<subject id>" }, objective: "<CHANGES_OBJECTIVE>" }), "json")}

\`<CHANGES_OBJECTIVE>\` is this text. \`<URL>\` and \`<HASH>\` are the current changes instruction file and its
sha256 (above), \`<SUBJECT>\` is filled as above, \`<PRIOR>\` is the same list as for a rebuild
without files to reconsider (F1 is the page shown, then every result not folded in), \`<CHANNELS>\` is the
subject's channels as \`url (tie: strong|weak|none)\`, comma-separated (\`none known\` without any), and \`<ITEMS>\`
is the numbered list of changes.

${fence(CHANGES_TEMPLATE)}

The changes instruction file, in full (${INSTRUCTIONS.changes.file}):

${fence(INSTRUCTIONS.changes.text.trim())}

Each item is \`(n) type: <type>; target: <target>; note: <JSON string or none>; links: <space-separated https links or none>\`,
items separated by one space. Types: \`wrong\`, \`context\`, \`backing\` (a record line or key fact), \`reword\`
(a summary sentence; the note is the new sentence), \`new_line\` and \`links\` (no target). The target is
\`F<n>:<line id> "<line text>"\` for a line (its file in \`<PRIOR>\`), \`F<n>:<line id> key fact "<Label: value>"\` for a key
facts row, \`summary sentence "<text>"\`, or \`none\`. A note is at most ${NOTE_MAX} characters; a change has at most
${CHANGE_MAX_LINKS} links (\`links\`: up to ${READ_MAX_LINKS}). Example:

${fence(itemsText(EXAMPLE_CHANGES, (id) => (id === "L3" ? "F1:L3" : "")))}

The whole objective may be at most ${MAX_OBJECTIVE.toLocaleString("en-US")} characters; the site shows "room for about N more" from that limit.

A changes job writes \`artifacts/changes.json\`: \`items[{n,type,target,verdict,why,lines[],final_text}]\` (verdict
\`kept\` or \`not_kept\`), \`sources[{id,url,type,publisher,published_at,read_at,could_open,read_via,about_subject}]\`,
\`lines[{id,source,section,text,kind,by,quote,rerun,fact{name,value,unit},links[{type,target}]}]\`,
\`affects[{kind,target,type,by_line}]\` (kind \`line\`, \`infobox\` or \`summary\`; type \`contradicts\` or \`outdates\`) and \`notes\`. The
site shows its new lines in the record, "raised by <payer>", labelled by the same rule as added-source lines (a proof
only with re-run steps). Each new line's link names its target; the target row shows "Contradicted by", "Confirmed by",
"Partly confirmed by" or "Context:" with the new line under it, and a new proof settles the target as Proven or
Contradicted by the settled-line rules. A kept \`reword\` replaces that summary sentence with \`final_text\`, marked
"reworded by <payer>". Activity lists every change with "Kept" or "Not kept: <why>". A rebuild folds changes results
in like sources results, keeping their links (link types \`confirms\`, \`partly\`, \`contradicts\`, \`context\`,
\`outdates\`, \`agrees\`).

**A new source is checked against the whole record.** The job compares each new line with every existing line, not
only its target, and links clear cases: \`confirms\`, \`partly\`, \`contradicts\`, \`outdates\`, or \`agrees\` (the same
thing said by another speaker; shown as "Also said by another speaker"). A link from a new statement or claim to an
existing proof line or panel answer says what that proof or answer does to the new line, and stays on it (it can
make the new line Proven or Contradicted). Everything a new line contradicts or outdates is listed in \`affects\`,
and the site marks it all at once: a line with its Contradicted or Superseded status; a Key facts row (by label)
with "Contradicted" or "Superseded" in place of its badge; a summary sentence (by its exact text) with a small red
or amber dot that opens the new line. Only the sentence the visitor targeted is rewritten; the rest wait for the
rebuild. When a changes job with a kept change lists anything in \`affects\`, Overview says "A newer source disputes
N parts of this page. Rebuild to update them." until a rebuild folds that job in.

## Suggest an edit body (older: no longer offered; its results still show and fold in)

${fence(encodeBody({ ...editBody("x", none, [], IMD_REF), objective: "<EDIT_OBJECTIVE>" }), "json")}

\`<EDIT_OBJECTIVE>\` is this text. \`<SUBJECT>\` is filled as above, \`<TEXT>\` is the visitor's summary text (at most ${EDIT_MAX_TEXT.toLocaleString("en-US")} characters,
spaces collapsed, paragraphs separated by one blank line), \`<PRIOR>\` is the same list as for a rebuild without files to reconsider, and
\`<URLS>\` is up to ${EDIT_MAX_LINKS} numbered links under the Add sources rules (\`none\` without links).

${fence(EDIT_TEMPLATE)}

## Add sources body (older: no longer offered; its results still show and fold in), in full

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
\`infobox[{label,value,values[],url,lines[]}]\`, \`summary[{text,lines[],paragraph}]\`,
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

The site applies one label rule to every result, old or new: a line shows as a **statement** only when it was
published on one of the record's channels labelled "Own domain" or "Verified on chain". When the line cites
http(s) source URLs, every one of them must be on the subject's domain (or a subdomain) or at or under such a
channel; a name match on \`by\` never makes an outside URL a statement. Only a line citing no URL is matched by
its publisher's name or handle. Every channel is shown with one label: **Own domain** when its host is the subject's domain
or a subdomain of it (never for a chain:address subject); else **Verified on chain** for tie \`strong\`; else
**Not verified** (tie \`weak\` or \`none\` off the domain). A line marked statement whose channel is Not verified,
or whose publisher is not a channel, shows as a **claim**. A source job's line is never a proof. Lines from a source with \`could_open: false\` or
\`about_subject: false\` are not shown; Activity lists each source as \`N lines\`, \`could not open\` or
\`read, not about this subject: <about_why>\`. \`differs\` with \`level: "conflict"\` shows as "Conflicts with the
line above"; \`"question"\` or no level as "Compare with the line above". Proof lines with \`fact\` show as a table
of name, value, chain and block (read from the line's text and re-run steps), all in one table under On chain.
The Overview's key facts table shows \`infobox\` rows, each with a badge the site works out only from the kinds
of the lines the row rests on: "Proven on chain" if any is a proof, else "Stated by <channel name>" for a
statement, else "Reported by <who>" for a claim. When a claim's \`by\` is missing or generic ("an outside source",
"a news site", "Unknown", "Anonymous" and the like), the badge names the host of the line's first source instead,
such as "Reported by news.example", and never says "an outside source". Every row shows exactly one badge. The Website and Official
accounts rows show only a channel label (Own domain, Verified on chain or Not verified) instead: Website from its
URL and the subject's domain (Own domain for the domain or a subdomain, even when that URL is not a listed channel);
Official accounts from each account's own tie in the result: "Linked from own site" (tie linked), "Verified on chain"
(tie strong), else "Not verified"; when the accounts' labels differ, each account shows its own badge beside it.
Each account is a link with a short name ("@zora on X", "ourzora on GitHub"), never an address in brackets: give
Official accounts \`values\` as entries \`{"name": "@zora on X", "text": "", "url": "https://x.com/zora"}\`. Without \`infobox\`, the table shows at most: Website (the channel at
the subject's domain), Main contract, and one token symbol proof and one token supply proof (a proof named for
the token's symbol or supply, or re-run with \`symbol()\` or \`totalSupply()\`; never a seat count; and only a proof
that names the subject's own token contract and whose re-run reads no other contract); it never
lists every channel and contract. The infobox rows a rebuild writes are, in order: Website, **Tokens**,
Main contract, Chains, Supply, Seats, Price, Size, Deployed by, Controlled by, Founder or creator, **Run by**, Contributors,
Official accounts, Launched, and up to 3 rows of its own. **Tokens** lists at most 3 tokens central to the project
(governance, product, staking); receipt or vault-share tokens, pool positions, collectibles and merchandise tokens
belong in lines, and a token with no contract address found is not listed. Each entry is
\`{"name": "UNI", "text": "governance token", "address": "0x…", "chain": "Ethereum"}\`. **One token on several
chains:** before listing tokens the job checks each for a bridge (on a LayerZero token it reads the peers, and on a
peer that is an adapter \`token()\`); a token and its bridged forms are one token even when the names differ, listed
once under the name the project uses now with its home chain and other chains, with a proof line of the contract
reads that show the link (or the project's own statement, marked stated). **Supply** covers only the Tokens entries,
each with its amount (\`{"name": "UNI", "text": "1 billion"}\`): the home chain's total, then each other chain's
amount, never added together. **Run by** is the organisation and the person leading it now ("Zora Labs; Dee Goens,
chief executive"); Contributors is for other people and teams, never the chief executive. **Launched** is the date
the project first went live, with the current version's date in the same value when it is much newer ("November 2018;
current version since January 2025"). **Size** comes from an established independent tracker or the project's own
published statistics, never an individual's social post, with the figure, its source and its date; the row is left
out only when neither publishes a figure about the project itself. Key facts shows each \`values\` entry on its own line: the
name in bold, then its text, then its link, or the shortened address with a Copy button and a link to the chain's
block explorer (Etherscan, Basescan, Arbiscan and the like; Blockscan for other chains), visible without opening
the row. Supply reads "UNI: 1 billion". An entry of another shape shows all of its text, never only a first word.
An older Tokens text value (\`SYM: purpose, <address> on <chain>\` joined by \`; \`) is still read per token. A
page built before the Tokens format with a singular **Token** row keeps its linked value. The Main contract and
Tokens values include the contract address and chain; Deployed by and Controlled by include the wallet address. Every completed panel answer of the subject
is listed under "Panel answers", always the last section of the Record tab, also before the first page.
**Settled lines.** A statement or claim with a \`confirms\` link to a proof line or a panel answer (\`A<n>\` from
the rebuild's \`<PRIOR>\`) is shown as ONE row: the sentence, a green "Proven" marker ("Confirmed by a panel, N of
M" when only panel answers confirm it), then, smaller, who said it: "Stated by <channel>" or "Claimed by <who>".
Its details show the proof's re-run steps and the original quote. The proof is not shown again as its own row
(proofs with \`fact\` stay in the On-chain facts table). With a \`contradicts\` link the row leads with a red
"Contradicted" marker and shows both sentences: what was said, and what the proof or panel answer shows.
Contradicts wins over confirms. A \`partly\` link keeps the line's own kind marker, with "Partly confirmed by: ..."
under it. Every count (the home list, section headers and the filter buttons) uses the same groups: **Proven** =
proof lines plus statements and claims with a confirming link; **Stated** = statements with no confirming link;
**Claimed** = claims with no confirming link; **Contradicted** and **Superseded** only when above zero (the home
list shows proven, stated, claimed and contradicted only, and leaves superseded lines out of its counts). A settled
row counts once, and a proof a settled row already shows is not counted again. The Record filter's Proven button
shows both kinds; each row still says which it is: a proof row reads "Proof, a check in its own right", a confirmed
row "Proven" with "Stated by <channel>, then confirmed" or "Claimed by <who>, then confirmed". The Key facts badges
read "Proven", "Contradicted", else "Proven on chain" / "Stated by" / "Reported by". The speaker always stays on the row.

**Summary wording.** Plain descriptions of what the project is and how it is used carry no attribution in words
when they rest on the project's own statements; the dots show that. A sentence is attributed in words, once and
after the fact, only for money flows, fees, control, safety or performance, a claim by someone else, or sources that
disagree, and never with the same phrase in two sentences running. Under the summary a one-line key reads: green dot
"proven on chain", blue dot "the project says", orange dot "others say", then "Summary written from the record by a
research job."

**Numbers.** Quantities get thousands separators ("2000 seats" reads "2,000 seats"). A whole four-digit number from
1000 to 2999 is left as written ("founded 2020") unless a unit or token symbol follows it directly, and numbers in
dates, addresses, hashes, version names, handles and after "block" are never changed ("block 26446763").

**Loading.** The site keeps the last block it scanned and the requests and completions it found in the browser's
IndexedDB (database \`imd-record\`, store \`scan\`), shows them at once on a return visit, then reads only
blocks after it (less 12, for reorganisations) and updates. Result files (page, lines, edit, artifacts, logos)
are kept in IndexedDB (store \`files\`), not localStorage. The home list keeps one small digest per subject
(name, one_line, counts, logo hash, changed date, contracts, the out-of-date count; store \`digests\`), and each
logo once under its SHA-256. On every visit Home reads, without the subject being opened, the page file, logo,
other result files and panel answers of each listed subject that has no digest, or whose digest predates newer
results or recorded a failed read: one queue, 3 subjects at a time, newest first (subjects with no digest first),
filling each row in as it arrives. A row being read is a light placeholder. A page that read while another of its
result files failed is still shown, with "Counts may be short" and Try again; a page file that failed shows its
error and Try again. A logo that failed is read again on the next visit. A lookup by contract address waits for
those reads ("Checking project contracts…") before it offers "Add this project".

**Superseded lines.** A line with an \`outdates\` link shows an amber "Superseded" marker with "Newer: <the newer
line>" under it, and is counted apart from Contradicted (its own filter button and section count). A Key facts row
whose lines are all superseded shows "Superseded" in place of its badge. When the same source reports the same figure
at different times (a tracker's value locked, a supply reading), the rebuild keeps one line with the newest reading
and the older readings in \`history\`, never a second line linked by \`outdates\`. A kept "This is wrong" on a summary sentence
with \`final_text\` replaces that sentence, marked "corrected by <payer>"; the visitor may send a suggested corrected
sentence with the change (\`; suggested final_text: "…"\` after its links).

**One row per text.** Lines with the same text, ignoring case and punctuation, show as ONE row whose details list
every origin, speaker and source; counts and filters count it once. Dropped lines, unaccounted earlier lines, how
many identical lines were shown as one, and panel answers no line links to are listed only under "Page upkeep" at
the bottom of Record (and Activity). Key facts values are shown as separate lines only when the result gives
\`values\`; a text value is never split on commas or "and". Addresses in Key facts are shortened with a copy button;
the full address is in the row's details.

**Panel questions from a line.** "Ask a panel to check it" fills the panel form from the line: "A post on X says"
when its source is an X post (link and handle from the URL), "A contract call returns" when it is a proof whose
rerun names an address, a function and a chain, and whose fact gives the value, else "A web page says" with its
source link. A line whose source fits none of these says so and offers "Write a question from scratch".

**Privacy.** On load the site contacts only its own host, IMD's API and the public RPCs. The wallet code (wagmi
and the EIP-6963 injected connector; browser-extension wallets only) is loaded only when the visitor presses
Connect. The site stores one wallet key, \`imd-record:wallet-connected\` = \`1\`, and no address. While a rebuild of a subject is pending, its Rebuild button is replaced by "A rebuild is running, started
<time> by <payer>" with a link to it.

**Needs a rebuild.** A page needs a rebuild when completed results or panel answers are not folded in (not listed in
the \`<PRIOR>\` of the request that produced it), or when that request's objective differs from what
\`templates/rebuild.txt\` sends now apart from \`<PRIOR>\`. Readers are told only about
results not folded in: Overview and the home row say "N additions not yet merged. Rebuild", and Overview says "A
newer source disputes N parts of this page" while a kept change's disputes wait. Which instruction format built a
page ("Out of date: built with an older format") is shown only on the Contribute tab and under Page upkeep, and
counts in Home's "Needs a rebuild" filter, which says "Checking which pages need a rebuild…" while reads are outstanding. When an RPC fails or limits a range, the scan tries the next RPC with half
the range, and the page says "Still reading the chain" rather than showing an empty list.

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
  \`edit\` (\`artifacts/edit.json\`), a changes job writes \`changes\` (\`artifacts/changes.json\`).
- **File bytes:** \`GET ${API}/artifacts/<hash>\`. The SHA-256 of the bytes must equal \`hash\`.
- **Fallback:** the completion's \`uri\` (\`ipfs://<CID>/result.json\`) through an IPFS gateway; its bytes must
  hash (keccak-256) to the event's \`resultHash\`, then fetch the named file as above.
- **Panel answer:** \`GET ${API}/oracle/requests/<id>?members=0\` gives \`status\`, \`agreement.answer\`,
  \`agreement.agreed\` and \`panelSize\`.
`;
writeFileSync("public/agents.md", md);
console.log(`public/agents.md: ${md.length} characters`);
