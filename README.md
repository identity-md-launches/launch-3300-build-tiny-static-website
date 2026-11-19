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
# browser interaction checks on dist/ (needs Playwright with a Chromium that can start):
IMD_PLAYWRIGHT=/path/to/playwright/index.mjs node tests/e2e.mjs test/scratch/e2e
```

`dist/` is committed and is what gets hosted. Vite's `base` is `./`, so every asset URL is relative and
the export works under an IPFS gateway subpath or an ENS name. It is a single page with `#` anchors, so it
needs no rewrites.

## Layout

| Path | What it holds |
| --- | --- |
| `templates/research.txt` | The research objective, word for word from the brief. It is shown to the visitor and sent as `objective` |
| `src/config.ts` | Every address, chain id, action id, ABI, RPC, route and the launch block |
| `src/bodies.ts` | The exact request bodies (research, P1 to P4, free text) |
| `src/chain.ts` | Reads `Requested` and `Completed` logs from public RPCs and decodes them |
| `src/api.ts` | IMD API reads, SHA-256 check, IPFS fallback, localStorage cache |
| `src/page.ts` | Parses untrusted `page.json` into plain strings; orders `differs` pairs |
| `src/useActivity.ts` | Follows every tagged request to completion; ENS names; polling |
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

Every body carries `"tag":{"app":"rec-test-1","kind":"..."}`.

## Finding and following requests

- **Requested events.** The site calls `eth_getLogs` on the Intake for topic
  `0x1c521a43…9063` = `Requested(bytes32 indexed requestId, address indexed payer, bytes32 indexed action, bytes body, address callbackTarget, bytes4 callbackSelector, address asset, uint256 amount)`.
  It starts at the launch block `26445600` (the mainnet head when the site was built; a scan of the
  200,000 blocks before it found no `rec-test-1` body) and keeps the logs whose body contains
  `"app":"rec-test-1"`.
- **Completion.** `Completed(bytes32 indexed requestId, uint8 status, bytes32 resultHash, string uri, bool delivered)`,
  topic `0xd4ad2d2e…6fa1`, filtered by request id. Status 0 is completed, 1 is refused, 2 is failed, and
  no event means pending. On 1 and 2 the bytes32 holds the reason code, which Activity shows.
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

**Oracle question** (`oracle.request@oracle-1`): the oracle request id comes from the same intake route
(`admission.result.requestId`), or from the completion `uri`. Then
`GET /oracle/requests/:id?members=0`, a CORS-open oracle read route, gives `status`,
`agreement.answer`, `agreement.agreed` and `panelSize`. The record shows these as
"panel, 4 of 5 agreed".

Fetched pages, oracle reads, job ids, ENS names and block times are cached in `localStorage`. Every
cache access is wrapped in try/catch, and the page renders without it.

Every value from a result file is rendered as plain React text, never as HTML. Links are made only for
`http(s)` URLs. Explorer links go to `https://explorer.imd.fun/jobs/<jobId>`; before a job id is known,
they go to the transaction on Etherscan.

## Free request check, run before building (2026-11-19)

`POST https://api.imd.fun/requests/check`, results as returned:

| Body | Result |
| --- | --- |
| Research, exact body (`job.open`) | 200, `blockers: []`, `suggestions: []`, `judged: true`, plan: one step "Research and write the report, with sources" (`research-report`) |
| P1, exact body | 400 `invalid_request`: `Unrecognized keys: "tag", "v", "quorum", "validForSeconds"`. The check takes only the oracle short form |
| P1, short form from the exact body (`question, panelSize 5, answerType bool, chainId 1`) | 200, `blockers: []`, `suggestions: []`; drafted request adds `window: {hours: 24}`, `evidence: "panel"` |
| P2, short form | 200, `blockers: []`, `suggestions: []`; drafted request adds `window: {hours: 24}`, `evidence: "panel"` |
| P3, short form | 200, `blockers: []`; one suggestion `wording`: "It may be read more than one way. Naming the period, the unit or the term you mean makes a split less likely."; drafted request adds `window: {hours: 24}`, `evidence: "chain"` |
| `POST /requests/quote` on the full bodies | 401 `request_token_required`, so the exact oracle bytes could not be validated for free from here |

**Fix applied.** IMD's docs list `window` as *required* in an oracle body, and the Intake validates
bodies the way the quote does. The brief's oracle body has no `window`, so it would probably be refused
after payment, and payments are not refunded. Every oracle body therefore adds what the check drafted:
`"window":{"hours":24}`. Questions about a web page or a post (P1, P2, P4, and free-text statement or
claim) also get `"evidence":"panel"`. P3 and free-text proofs keep the default `chain` evidence. P3 keeps
the brief's exact wording; the `wording` suggestion is not a blocker. All other fields are exactly the
brief's.

The free-text box cannot be checked from the browser: `/requests/check` sends no CORS headers. It is
marked "Unchecked wording, may be refused, payment is not refunded."

## Validation results

Details and the design review are in `artifacts/validation.md`.

- `npm run typecheck`: exit 0.
- `npm test`: 10 of 10 unit tests pass. They cover the exact bodies, P4 validation, decoding of
  `Requested` and `Completed` logs (including the real topic hashes), tag filtering, refusal reasons, the
  page parser, `differs` ordering, rejection of `javascript:` links, and the absence of `innerHTML`.
- `npm run build`: exit 0. `dist/` is 1,337,142 bytes, and `index.html` uses only `./` URLs.
- Live reads checked from Node on 2026-11-19: `priceOf` returned `500000000000000000` for both
  actions; `GET /intake/1/<tx>`, `/jobs`, `/oracle/requests` and `/artifacts` send
  `access-control-allow-origin: *`.
- **Not run:** the browser checks. Playwright installed, but its Chromium could not start on this
  machine (`libglib-2.0.so.0` and 19 other system libraries are missing, with no root to install them).
  So `tests/e2e.mjs` and the design probe `taste.mjs` were not executed. No screenshot or rendered
  measurement exists, and the layout at 320, 390 and 1440 is unverified in a browser.
- **Not testable here:** paying, approving and connecting, because there is no wallet on this machine.

## Limits

- Public RPCs can rate-limit `eth_getLogs`. The site falls back across three, and Activity offers
  Refresh.
- The Rabby "Open in" row opens rabby.io, because Rabby documents no in-app browser link.
- Payments go to IMD and are not refunded. A refused body is a spent payment.
