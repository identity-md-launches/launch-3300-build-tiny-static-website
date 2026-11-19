# Validation: IMD on the record, revision 2

This revision: oracle bodies without `tag`, oracle requests found by wording, refusal reasons in
Activity, "Checked by a panel" above the sections, the "Add sources" action, the research objective
additions, tie wording, `/agents.md`, and the request checks. Look, wallet code and the research body's
tag are unchanged.

## 1. Scope and assumptions

- Scope: `src/`, `templates/`, `public/agents.md`, exported to `dist/`.
- Assumptions:
  - `<URLS>` is filled as `[1] https://a; [2] https://b`, so each source has an id the job can name.
  - `<CHANNELS>` is the record's channel URLs joined by `, `, or `none known` before any research. The
    Add sources button waits until the record has loaded.
  - "How many more will fit" is counted for links of the longest allowed length (300 characters), so the
    number is never too high; the characters left are shown too.
  - A source line is shown as a statement only when its source has `publisher_is_subject_channel: true`;
    otherwise as a claim (kinds are never raised, and the template forbids `proof`).
  - The "link to the request" for a panel row is explorer.imd.fun's job page for the oracle's job
    (explorer has no oracle page: `/oracle/<id>` answered 404), or the transaction before a job id is known.
- Excluded: themes and localisation (not asked).

## 2. Request checks (item 9)

Run on 2026-11-19 against `POST https://api.imd.fun/requests/check`; the full table is in `README.md`.
Research body, sources body, P1, P2, P3 and P4 short forms: all 200 with `blockers: []`. P3 has one
`wording` suggestion (not a blocker). The drafted P1, P2 and P4 requests are byte for byte the bodies this
site sends; none has a `tag`.

## 3. Coverage, the six Better Interface domains

| Domain | Status | What was checked |
| --- | --- | --- |
| Accessibility | Checked (source, DOM) | Native `textarea` with a visible label; the live count is `aria-live="polite"` (`src/App.tsx:331`); the error is linked by `aria-describedby` and focus moves to the field; refusal text is plain text, and HTML in `detail` renders as text (DOM test); every new link has a descriptive name, and the source chip has `aria-label="Source: <url>"`; answers carry the word, not only a colour. **Unperformed:** keyboard walk and screen reader in a browser |
| Layout | Checked (source) | New cards reuse `.card`; Add sources falls into the action grid; long URLs wrap (`.break`, `.chip-wide` with `overflow-wrap: anywhere`); no fixed heights. **Unperformed:** rendered overflow at 320, 390, 1440 |
| Writing | Checked | Verb-first buttons ("Review the source job", "Open the request"); tie words in plain language with one key line; errors say what to do ("Paste at least one https link, one per line."); left-out lines say why; no exclamation marks, no em dashes in new copy |
| Typography | Checked (source) | No new font size, weight or family: the new rules use `--text-small` and existing weights, so the scale stays at five sizes |
| Colors | Checked (declared pairs) | New uses reuse existing pairs: `true` pill green 5.89:1, `false` pill error on `#fdecea` 6.63:1, "confirmed on chain" `#146c36` on white, "Left out" orange on card 6.44:1. Computed from declared hex values, not measured |
| UI | Checked (source) | One accent per area (fix F2); answer and state pills reuse the pill shape; no card inside a card; no `transition: all` |

## 4. Findings and fixes

| # | Sev | Where | Finding | Fix | Recheck |
| --- | --- | --- | --- | --- | --- |
| F1 | High (brief) | `src/bodies.ts:26` | Oracle bodies carried `tag`, which the Intake refuses (`body_invalid`) | Tag removed; key order pinned by a unit test and equal to the check's drafted request | `npm test` |
| F2 | Medium | `src/App.tsx:344` | Add sources used a second accent-filled button in the actions area | Neutral `.btn`, like "Review the post check" | Source rechecked |
| F3 | Low | `src/App.tsx:170` | The panel row's link read "the request" | "Open the request" / "Open the transaction" | DOM test |
| F4 | Low | `src/App.tsx:72` | The source chip's name was only the host | `aria-label="Source: <url>"`, `title` keeps the full URL | Source rechecked |
| F5 | Low | `src/App.tsx:229` | The tie key line was long for the first screen's word budget | Shortened to 25 words | Source rechecked |
| F6 | Low, open | `src/wallet.tsx` | In the DOM test the Coinbase wallet SDK tried to reach `cca-lite.coinbase.com` | Not changed: the brief says to keep the wallet code as it is | — |
| F7 | Low, open | `src/App.tsx` (header outside `main`) | While a dialog is open the header stays in the tab order (carried from revision 1) | Not fixed | — |

## 5. Verification (commands actually run)

- `npm run typecheck` / the `tsc --noEmit` step of `npm run build`: exit 0.
- `npm test`: 19 of 19 unit tests pass (`tests/unit.test.ts`).
- `npm run build`: exit 0; `dist/index.html` refers only to `./` URLs; `dist/agents.md` is present.
- `npx vite-node scripts/agents-md.ts`: wrote `public/agents.md`; a unit test checks it holds the exact
  research body, the source template, the tag-free oracle body and every preset question.
- DOM interaction test (happy-dom, scratch only, not submitted): 8 of 8 pass. It renders the real `App`
  with mocked RPC (including Multicall3, which wagmi's config batches price reads through) and mocked
  api.imd.fun, using the live record's real `page.json`.
- **Taste probe:** `node .imd/reads/skills/design-critic/scripts/taste.mjs --out test/scratch/taste` with
  Playwright 1.62 installed outside the repository. It exited 1: `listen EPERM: operation not permitted
  127.0.0.1`, because this machine's sandbox does not allow binding a local port. Chromium also cannot
  start here (`bootstrap_check_in … MachPortRendezvousServer: Permission denied`), and Firefox and WebKit
  did not start within 200 seconds. **The probe did not run; no screenshot exists.** To run it, allow
  local binding (`sandbox.network.allowLocalBinding: true`) and run the command above.
- **`tests/e2e.mjs`:** updated for this revision (untagged oracle fixtures, refusal detail, panel card
  position, tie wording, Add sources, agents.md link, no free text) and syntax-checked with
  `node --check`; **not executed**, for the same reason.

## 6. Completion

The requested changes are built, unit-tested and checked in a DOM. Browser rendering at 320, 390 and
1440, the probe's measurements and screenshots, the keyboard walk and measured contrast remain
unperformed on this machine. Wallet flows (connect, approve, pay) cannot be exercised without a wallet.
This is the worker's own report, not an independent certification.
