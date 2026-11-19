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
# browser interaction checks on dist/ (needs Playwright with a Chromium that can start):
IMD_PLAYWRIGHT=/path/to/playwright/index.mjs node tests/e2e.mjs test/scratch/e2e
```

`dist/` is committed and is what gets hosted. Vite's `base` is `./`, so every asset URL is relative and
the export works under an IPFS gateway subpath or an ENS name. It is a single page with `#` anchors, so it
needs no rewrites.

## Layout

| Path | What it holds |
| --- | --- |
| `templates/research.txt` | The research objective: the first brief's text plus this job's additions before "Sections:". Shown to the visitor and sent as `objective` |
| `templates/source.txt` | The "Add sources" objective, with `<URLS>` and `<CHANNELS>` filled in by `src/bodies.ts` |
| `public/agents.md` | Published at the site root as `./agents.md` and linked in the footer. Written by `scripts/agents-md.ts` from the same functions the site uses, so its bodies are the site's bytes |
| `tests/fixtures/drafted.txt` | The oracle requests IMD's free check drafted on 2026-11-19; the unit tests pin our bodies to them |
| `src/config.ts` | Every address, chain id, action id, ABI, RPC, route and the launch block |
| `src/bodies.ts` | The exact request bodies (research, sources, P1 to P4), the wording matcher and the link rules |
| `src/chain.ts` | Reads `Requested` and `Completed` logs from public RPCs and decodes them |
| `src/api.ts` | IMD API reads, SHA-256 check, IPFS fallback, localStorage cache |
| `src/page.ts` | Parses untrusted `page.json` and `lines.json` into plain strings; orders `differs` pairs; merges source lines into sections |
| `src/useActivity.ts` | Follows every request of this site to completion; refusal reasons; source files; ENS names; polling |
| `src/wallet.tsx`, `src/wallet-icons.ts` | wagmi config and the connect sheet (EIP-6963, "Open in" links, Coinbase Smart Wallet) |
| `src/App.tsx`, `src/styles.css` | The record, actions, pay dialog, activity and About line |
| `tests/` | Unit tests and the Playwright interaction script |

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
the record's channel URLs joined by `, ` (`none known` if there is no record). The button waits until the
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
sections after the research lines, each with its label, who said it, a chip linking to its source URL and
a grey line "added from a source by <payer>, research job". A line is a statement only when its source has
`publisher_is_subject_channel: true`; anything else, `proof` included, is shown as a claim. Where `differs`
names two lines, the second sits directly under the first. Sources with `could_open: false` add nothing
and are listed in the Activity row as "could not open: <url>".

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

## Free request check, run before building

`POST https://api.imd.fun/requests/check` with `{"action":"job.open" | "oracle.request","input":…}`, run on
2026-11-19 against the bodies this build sends (generated from `src/bodies.ts`). Results as returned:

| Body | Result |
| --- | --- |
| Research, exact body (`job.open`, with this job's additions) | 200, `blockers: []`, `suggestions: []`, `judged: true`, kind `report`, plan: one step "Research and write the report, with sources" (`research-report`) |
| Sources, exact body (`job.open`), 3 links (an X post, `github.com/Identity-md/worker`, `imd.fun/docs/api/`) and the 10 channel URLs of the live record | 200, `blockers: []`, `suggestions: []`, `judged: true`, kind `report`, the same one-step plan |
| P1, short form (`question, panelSize 5, answerType bool, evidence panel, chainId 1`) | 200, `blockers: []`, `suggestions: []`. The drafted `request` is byte for byte our P1 body |
| P2, short form | 200, `blockers: []`, `suggestions: []`; drafted request equals our P2 body |
| P3, short form (`evidence chain`) | 200, `blockers: []`; one suggestion `wording`: "It may be read more than one way. Naming the period, the unit or the term you mean makes a split less likely." The drafted request adds `"evidence":"chain"`, which is the default our body leaves out |
| P4, short form, with the post from the refused request | 200, `blockers: []`, `suggestions: []`; drafted request equals our P4 body |
| P1 exact body sent to the check | 400 `invalid_request`: the check takes the short form only |

The drafted P1 and P4 requests are saved in `tests/fixtures/drafted.txt`, and a unit test requires our
bodies to equal them byte for byte. None of the drafted requests has a `tag`. The exact oracle bytes can
only be validated by `POST /requests/quote`, which needs a request token, so that was not run.

The P3 `wording` suggestion is not a blocker, and P3 keeps the first brief's wording.

## Validation results

Details, the design review and its limits are in `artifacts/validation.md`.

- `npm run typecheck`: exit 0.
- `npm test`: 19 of 19 unit tests pass. They pin the research objective's additions, the tag-free oracle
  bytes (equal to the check's drafted requests), the source body bytes and template, the link rules (https
  only, 300 characters, no quotes or spaces, repeats, 20 links, under 7,500 characters), finding oracle
  requests by wording, `lines.json` parsing (kinds never raised, unopened sources dropped), the merge order
  with `differs` pairs, refusal text, `agents.md` holding the exact bodies, log decoding and the real topics.
- `npm run build`: exit 0. `dist/` holds `index.html`, `agents.md`, `favicon.svg`, `og.png` and
  `assets/`; `index.html` uses only `./` URLs.
- **Interaction test (DOM, not a browser):** the real `App` rendered in happy-dom with the RPC and
  api.imd.fun mocked and the live record's real `page.json` as data: 8 of 8 checks pass (tie wording and
  key; "Checked by a panel" above the sections with title, answer, agreement, label and link; source lines
  after research lines with the differs pair together and the grey line; Activity keeping requests by tag
  or wording, refusal reason and detail as text, "could not open"; no free-text box; agents.md link; P1
  body without tag and the live price; Add sources live count, left-out lines, full body and the empty
  error). happy-dom was installed only under `test/scratch/`, which is not submitted, so this test is not
  in the repository.
- Live reads from this machine on 2026-11-19: `GET /intake/1/0xadda56ad…d8df` returned
  `reason: "body_invalid"`, `detail: ": Unrecognized key: \"tag\""` with `access-control-allow-origin: *`;
  the Intake's `Requested` logs since the launch block hold this site's research job (completed, job
  `1aac4211-…`) and the refused oracle request.
- **Not run:** any browser check. On this machine the sandbox stops Chromium at start
  (`bootstrap_check_in … MachPortRendezvousServer: Permission denied`), Firefox and WebKit did not start
  within 200 seconds, and binding a local port fails with `listen EPERM`. So `tests/e2e.mjs` (updated for
  this job) and the design probe `taste.mjs` did not run, and there are no screenshots.
- **Not testable here:** paying, approving and connecting, because there is no wallet on this machine.

## Limits

- Public RPCs can rate-limit `eth_getLogs`. The site falls back across three, and Activity offers
  Refresh.
- The Rabby "Open in" row opens rabby.io, because Rabby documents no in-app browser link.
- Payments go to IMD and are not refunded. A refused body is a spent payment.
