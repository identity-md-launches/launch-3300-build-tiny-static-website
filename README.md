# IMD on the record

A static, one-page public record for one subject, **IMD (imd.fun)**. Every line shows who said it, its
source, and how it was checked. Visitors pay the IMD swarm from their own wallet, on Ethereum mainnet
(chain 1), to research the page or to confirm a single fact. The page shows what comes back.

There is no backend, no token and no contract of ours. Reading needs no wallet.

## Install, preview, rebuild

```sh
npm ci                 # install from package-lock.json
npm run dev            # local dev server
npm run build          # tsc --noEmit, then vite build into dist/
npm run preview        # serve the built dist/ locally
npm run typecheck      # tsc --noEmit only
npm test               # vitest unit tests (tests/unit.test.ts)
npx vite-node scripts/agents-md.ts   # rewrite public/agents.md from src/bodies.ts, then npm run build
# browser interaction checks on dist/, with every chain and api.imd.fun read answered from a fixture
# (needs Playwright with a Chromium that can start):
npx vite-node tests/make-fixture.ts test/scratch/fx.json
IMD_PLAYWRIGHT=/path/to/playwright/index.mjs node tests/e2e.mjs test/scratch/fx.json test/scratch/e2e
```

`dist/` is committed and is what gets hosted. Vite's `base` is `./`, so every asset URL is relative and
the export works under an IPFS gateway subpath or an ENS name. It is a single page with five tabs on `#` links
(`#overview`, the default, `#record`, `#sources`, `#activity`, `#contribute`), so it needs no rewrites. Old links
still work: `#actions` and `#add-sources` open Contribute, `#activity` opens Activity, `#line-…` opens Record at
that line and `#source-N` opens Sources.

## Layout

| Path | What it holds |
| --- | --- |
| `templates/research.txt` | The research objective: the first brief's text plus this job's additions before "Sections:". Shown to the visitor and sent as `objective` |
| `templates/rebuild.txt` | "Rebuild the page": the research text plus this job's insertion before "Sections:" and the new keys; `<PRIOR>` filled in by `src/bodies.ts` |
| `templates/edit.txt` | "Suggest an edit", with `<TEXT>`, `<PRIOR>` and `<URLS>` filled in by `src/bodies.ts` |
| `templates/source.txt` | The "Add sources" objective, with `<URLS>`, `<CHANNELS>` and `<MAIN>` filled in by `src/bodies.ts` |
| `public/agents.md` | Published at the site root as `./agents.md` and linked in the footer. Written by `scripts/agents-md.ts` from the same functions the site uses, so its bodies are the site's bytes |
| `tests/fixtures/drafted.txt` | The oracle requests IMD's free check drafted on 2026-11-19; the unit tests pin our bodies to them |
| `src/config.ts` | Every address, chain id, action id, ABI, RPC, route and the launch block |
| `src/bodies.ts` | The exact request bodies (rebuild, sources, edit, P1 to P4), `<PRIOR>` and reading it back, the wording matcher and the link rules |
| `src/model.ts` | What the site shows: the newest completed page, the sources and edit results completed after it, the summary (an accepted edit wins), `<PRIOR>`, panel answers A1…, and the accounting check after a rebuild |
| `src/chain.ts` | Reads `Requested` and `Completed` logs from public RPCs and decodes them |
| `src/api.ts` | IMD API reads, SHA-256 check, IPFS fallback, localStorage cache |
| `src/page.ts` | Parses untrusted `page.json` and `lines.json` into plain strings; the Statement label rule; facts; `differs` levels and pairs; source outcomes; merges source lines and the one numbered source list |
| `src/Record.tsx` | The Overview (key facts box, summary with kind dots, panel answers), Record (accounting, filter, sections, one facts table, Confirmed/Contradicted by) and Sources tabs |
| `src/ActivityList.tsx` | Activity, including each source job's per-source outcome and each edit sentence's verdict |
| `src/format.ts` | Shared display helpers (kind names, tie words, job links, line anchors) |
| `src/useActivity.ts` | Follows every request of this site to completion; refusal reasons; source files; ENS names; polling |
| `src/wallet.tsx`, `src/wallet-icons.ts` | wagmi config and the connect sheet (EIP-6963, "Open in" links, Coinbase Smart Wallet) |
| `src/App.tsx`, `src/styles.css` | Tabs and their links, Contribute (rebuild, confirm, add sources, suggest an edit), pay dialog and About line; all styles |
| `tests/` | Unit tests, the fixture builder `make-fixture.ts` and the Playwright interaction script |

## How a paid action works

1. The visitor clicks an action. The site reads `priceOf(action, IMD)` on IMD Intake v2
   `0xa43e6f75ee006411f79ac1c84120606c2330de82` and opens a dialog. The dialog shows the amount (for
   example `0.5 IMD (500000000000000000)`), the Intake address, the action id and the **full body**. All
   of this appears before any wallet prompt.
2. On "Pay", the price is read again. If it changed, the site shows the new price and stops. The amount
   sent is exactly the value it just read.
3. If `allowance(payer, Intake)` is below that amount, the wallet is asked to `approve` **exactly** that
   amount, never more.
4. `request(action, body, (address(0), 0x00000000), IMD, amount)` with IMD
   `0xd34a99bc0f67ae1bbd63c660e6d0b0dd03e263b7`. The body is compact UTF-8 JSON.

The site sends no other transaction. Its reads are `priceOf` (Intake), `allowance` and `balanceOf`
(IMD), and ENS reverse lookups for payer names. Those lookups go through viem's ENS universal resolver,
because the brief asks for ENS names in Activity.

Job bodies (research and sources) carry `"tag":{"app":"rec-test-1","kind":"add" | "source"}`. **Oracle bodies
carry no tag.** IMD refused one that did with `body_invalid: Unrecognized key: "tag"` (tx
`0xadda56adefd755e63bab2c004de49056100962c5f91dbc461ea65fa4deb9d8df`, read back from `GET /intake/1/<tx>`).
An oracle body holds exactly `v, question, chainId, window, answerType, evidence` (only when `"panel"`),
`panelSize, quorum, validForSeconds`, in that order. The free-text question box is gone: only the three
presets and the post check (P4) are asked.

**Add sources** (`job.open@job-1`): the visitor pastes links, one per line. A link is used when it starts
with `https://`, parses as a URL, is at most 300 characters and has no quote (`"`, `'`, `` ` ``) or
whitespace. Repeats (same parsed URL) are dropped. Links are taken in order while there are at most 20
and the finished objective stays under 7,500 characters; every line left out is listed with why. A
live line says how many more fit ("2 of 20 links. 17 more will fit at full length (300 characters), more
if shorter: 5,100 characters left."). `<URLS>` becomes `[1] https://a; [2] https://b`; `<CHANNELS>` becomes
each of the record's channels as `url (tie: strong|weak|none)`, joined by `, ` (`none known` if there is no
record); `<MAIN>` becomes the address of the contract the record marks `main` (`not known` if none). The
template asks the job to judge each source `about_subject` (with `about_why`), to fill `read_via` when it read
through a mirror or cache, and to give each `differs` pair a `level`. The button waits until the
record has loaded, so the channels are real. The full body is shown before any wallet prompt.

## Finding and following requests

- **Requested events.** The site calls `eth_getLogs` on the Intake for topic
  `0x1c521a43…9063` = `Requested(bytes32 indexed requestId, address indexed payer, bytes32 indexed action, bytes body, address callbackTarget, bytes4 callbackSelector, address asset, uint256 amount)`.
  It starts at the launch block `26445600` (the mainnet head when the site was built; a scan of the
  200,000 blocks before it found no `rec-test-1` body). It keeps a log when its body contains
  `"app":"rec-test-1"` (jobs, and oracle requests sent before the tag was dropped), or when the action is
  `oracle.request@oracle-1` and the parsed `question` is exactly P1, P2 or P3, or matches
  `^Does the post at (\S+), published by the X account @([A-Za-z0-9_]{1,15}), state that (.+?)\? Answer true only if `.
  The kind comes from the tag when there is one, else from the template: P1 and P2 statement, P3 proof,
  the post check claim. Any other question is not this site's and is not shown.
- **Completion.** `Completed(bytes32 indexed requestId, uint8 status, bytes32 resultHash, string uri, bool delivered)`,
  topic `0xd4ad2d2e…6fa1`, filtered by request id. Status 0 is completed, 1 is refused, 2 is failed, and
  no event means pending. For refused and failed requests the Activity row reads `reason` and `detail`
  from `GET https://api.imd.fun/intake/1/<transactionHash>` and shows them as plain text, for example
  `Refused: body_invalid: Unrecognized key: "tag"`. (The refused request above has a zero `resultHash`,
  so the chain alone does not say why.)
  Both signatures were read from real Intake logs on mainnet and are pinned by a unit test.
- **RPCs.** `gateway.tenderly.co/public/mainnet` (49,000-block ranges) first, then
  `ethereum-rpc.publicnode.com` and `rpc.mevblocker.io` (9,000-block ranges).
- While anything is pending, the page re-reads every 30 seconds.

## Reading results: the paths used

**Research job** (`job.open@job-1`):
1. Job id: `GET https://api.imd.fun/intake/1/<transactionHash>` → `entries[].admission.result.jobId`.
   This route sends `access-control-allow-origin: *`; checked on 2026-11-19 with an `Origin` header,
   and it answered 200 for a real mainnet transaction.
2. `GET /jobs/:id/result`, then the file named `"page"`, then `GET /artifacts/{hash}`.
3. The bytes are hashed with SHA-256 and must equal the listed hash. (SHA-256 was confirmed on a real
   research-report file on 2026-11-19.) Only then are they parsed.
4. **Fallback:** the completion's `uri` (`ipfs://CID/result.json`) through `dweb.link`, then `ipfs.io`.
   The bytes must match `resultHash` (keccak-256) from the `Completed` event. Then the page file is
   downloaded and checked as in step 3.

**Source job** (`job.open@job-1`, tag kind `source`): the same steps as research, for the file named
`"lines"` (`artifacts/lines.json`), with the same SHA-256 check and IPFS fallback. Its lines go into their
sections after the research lines. Lines of sources with `could_open: false` or `about_subject: false` are not
shown. The Activity row lists every source of the job with its outcome: `N lines`, `could not open`, or
`read, not about this subject: <about_why>`.

### How the record reads

- **One line per row**: the sentence, a coloured kind marker with its word (Proof, Statement, Claim), who said
  it (statements and claims) and its source numbers. Clicking the row or pressing Enter on it opens the
  details: quote, re-run steps, how it was checked, who added it (research or source job and its payer) and
  the links. Rows start closed.
- **Filter**: All, Proof, Statement, Claim, each with its count, above the sections.
- **Summary**: when the page has `summary`, it sits at the top under "Summary" with the note "Written by the
  research job from the lines below. Not itself a checked line." Each sentence ends with links to its line ids;
  a link shows all kinds, opens that line and moves focus to it.
- **On-chain facts**: in each section, proof lines with `fact` show as a table of name, value (with unit),
  chain and block (from `fact.chain`/`fact.block` if given, else read from the line and its re-run steps). A
  table row opens to the sentence and re-run steps. Proof lines without `fact` stay rows.
- **Differs**: `level: "conflict"` shows "Conflicts with the line above: <why>" in red; `"question"` or no level
  shows a quieter grey "Compare with the line above: <why>". The second line sits directly under the first.
- **Sources**: one numbered list, research sources first, then each source job's. With `read_via`, the list
  shows "read via <host>".

### The label rule

A line shows as **Statement** only if its publisher is one of the record's channels with tie `strong` or
`weak`. For research lines the publisher is the line's `by` (matched to a channel label) or one of its sources'
URLs (at or under a channel URL). For source lines it is the source's `publisher` or URL. A line marked
statement whose channel has tie `none`, or whose publisher is not a channel, shows as **Claim**, and its
details say why. The job's own `publisher_is_subject_channel` is not trusted. A source job's line is never a
proof. The rule applies to every result already on chain: on the live record, the source job's lines from
`github.com/Identity-md` (tie none) now show as claims.

**Oracle question** (`oracle.request@oracle-1`): the oracle request id comes from the same intake route
(`admission.result.requestId`), or from the completion `uri`. Then
`GET /oracle/requests/:id?members=0`, a CORS-open oracle read route, gives `status`,
`agreement.answer`, `agreement.agreed` and `panelSize`. "Checked by a panel" sits above the record's
sections: one row per completed oracle request with its short title (the preset's title, or
"@handle posted that …"), the answer (true or false), "panel, N of M agreed", its label (Proof,
Statement or Claim) and a link to the request on explorer.imd.fun (the transaction until a job id is known).

Channel ties are worded for visitors: strong is "confirmed on chain", weak "names the contract", none
"not confirmed", with one line under the channels saying what each means.

Fetched pages, oracle reads, job ids, ENS names and block times are cached in `localStorage`. Every
cache access is wrapped in try/catch, and the page renders without it.

Every value from a result file is rendered as plain React text, never as HTML. Links are made only for
`http(s)` URLs. Explorer links go to `https://explorer.imd.fun/jobs/<jobId>`; before a job id is known,
they go to the transaction on Etherscan.

## Rebuild, edit and what the site shows

- **Rebuild the page** (was "Research again"): `job.open@job-1`, tag kind `add`, output `artifacts/page.json`,
  objective `templates/rebuild.txt` with `<PRIOR>` = `[F1] https://api.imd.fun/artifacts/<hash of the page shown>;
  [F2] …` (every sources or edit result completed after it, oldest first) `; [A1] <question title> = <answer>,
  N of M, <request URL>; …` (every completed panel answer, oldest first). With no page yet, `none`.
- **Suggest an edit**: `job.open@job-1`, tag kind `edit`, output `artifacts/edit.json`, objective
  `templates/edit.txt` with the visitor's text (at most 1,500 characters), the same `<PRIOR>` and up to 5 https
  links. From Contribute and from the Edit button beside the summary. The full body is shown before the wallet.
- **What is shown**: the newest completed page result (by its `Completed` event), plus the sources and edit
  results completed after it. Earlier ones are folded in and reachable from Activity ("Replaced by a newer
  page", "Folded into a newer page", with links to the job and its result file). The newest such edit with an
  `accepted_summary` becomes the summary, marked "Edited by <payer>, checked by a research job"; its lines join
  the record like added-source lines; Activity lists each sentence with its verdict and reason.
- **Accounting**: the site reads the `<PRIOR>` back from the shown rebuild's own request body, downloads each
  `F` file (SHA-256 checked), and warns on Record "N earlier lines are unaccounted for" for every `F<n>:<id>`
  that is in no line's `from` and not in `dropped`. `dropped` shows in a closed "Dropped in the last rebuild".
  The same `<PRIOR>` resolves `links` targets `A<n>` to the panel answer.

## Free request check, run before building

`POST https://api.imd.fun/requests/check` with `{"action":"job.open","input":<exact body>}`, run on 2026-11-19,
bodies generated from `src/bodies.ts` (`test/scratch/bodies.ts`, not submitted):

| Body | Result |
| --- | --- |
| Rebuild, with a `<PRIOR>` of three artifact URLs and two panel answers (4,659-character objective) | 200, `blockers: []`, `suggestions: []`, `judged: true`, kind `report`, plan: one step "Research and write the report, with sources" (`research-report`) |
| Rebuild with no page yet, `<PRIOR>` = `none` (4,083 characters) | 200, `blockers: []`, `suggestions: []`, `judged: true`, the same plan |
| Sources: 2 links, 2 channels with ties, `<MAIN>` = `0xd34a99bc0f67ae1bbd63c660e6d0b0dd03e263b7` (2,123 characters) | 200, `blockers: []`, `suggestions: []`, `judged: true`, the same plan |
| Edit: three sentences in two paragraphs, the same `<PRIOR>`, one link (1,818 characters) | 200, `blockers: []`, `suggestions: []`, `judged: true`, the same plan |

The artifact hashes in the checked `<PRIOR>` were example values (no rebuild has run yet); the check judges
the wording, not the files. The oracle bodies and questions did not change; the earlier results for them still
hold (P1, P2 and P4 drafted byte for byte as sent, P3 one non-blocking `wording` suggestion), and a unit test
pins our bodies to the drafted P1 and P4 in `tests/fixtures/drafted.txt`.

## Validation results

Details, the Better Interface review and its limits are in `artifacts/validation.md`.

- `npm run typecheck`: exit 0.
- `npm test`: 34 of 34 pass (22 in `tests/unit.test.ts`, 12 new in `tests/rebuild.test.ts`: rebuild template,
  body and `<PRIOR>`, reading `<PRIOR>` back, the edit body, template and link rules, `edit.json`, `infobox`,
  `from`, `links`, `dropped`, paragraphs, the accounting check, completion order; `agents.md` now pins the
  rebuild and edit bodies).
- `npm run build`: exit 0. `dist/` holds `index.html`, `agents.md`, `favicon.svg`, `og.png` and `assets/`, and
  `index.html` uses only `./` URLs.
- `node tests/e2e.mjs` in headless Chromium with the fixture: 118 of 118 pass at 390, 1440 and 320 (tabs and
  old links, key facts placement, summary dots, one facts table, Confirmed/Contradicted by, accounting warning
  and dropped list, edit display and verdicts, rebuild and edit bodies, the 1,500-character limit, no
  horizontal scroll, no console errors).
- Design probe `taste.mjs` on the live chain: 15 of 16. `copy-budget` fails (104 prose words on the first
  screen at 390, bar 60) because the brief makes the summary the default tab's main text; see
  `artifacts/validation.md`.
- **Not tested here:** paying, approving and connecting (no wallet on this machine). In this sandbox's browser
  the price read through `gateway.tenderly.co` fails its CORS preflight, so the page shows "Price unavailable";
  the wallet code that sets that transport is unchanged, as the brief asks.

## Limits

- Public RPCs can rate-limit `eth_getLogs`. The site falls back across three, and Activity offers
  Refresh.
- The Rabby "Open in" row opens rabby.io, because Rabby documents no in-app browser link.
- Payments go to IMD and are not refunded. A refused body is a spent payment.
