# Validation: IMD on the record

## 1. Scope and assumptions

- Scope: the one-page site in `src/`, exported to `dist/`, covering the record, the actions (research,
  P1 to P4, free text), the pay dialog, the connect sheet, Activity and the About line.
- Assumptions:
  - The launch block is `26445600`, the mainnet head at build time. No `rec-test-1` body exists in the
    200,000 blocks before it.
  - Every oracle body adds `window: {hours: 24}`, and web or post questions add `evidence: "panel"`,
    as the free check drafted. This is because IMD's docs mark `window` as required by the Intake.
  - Panel answers are shown in a "Checked by a panel" card, because the brief does not tie a preset
    question to a research line id.
  - ENS names come from viem's reverse lookup (a read).
- Excluded: themes and localization, since the brief asks for neither.

## 2. Coverage, the six Better Interface domains

| Domain | Status | What was checked |
| --- | --- | --- |
| Accessibility | Checked (source) | Native buttons and links; one `h1` with h2/h3 below; skip link; `:focus-visible` ring 2px; Escape closes both dialogs and focus returns; `inert` on `main` while a dialog is open; labelled inputs; inline errors with `aria-invalid` and `aria-describedby`; focus moves to the first error; `role="status"` lines; × has `aria-label`; targets at least 44px (chips 24px); reduced motion turns off the press scale. **Unperformed:** keyboard walk in a browser, screen reader, forced colours, 200% zoom |
| Layout | Checked (source) | Space before lines; group gaps at least twice the in-group gaps; one 16px inline margin; no fixed heights on text; wrapping rows; late breakpoints at 40rem and 52rem; safe-area insets on header and sheet. **Unperformed:** rendered overflow at 320, 390 and 1440 |
| Writing | Checked | Verb-first buttons ("Research this page", "Review your question", "Pay 0.5 IMD"); sentence case; errors say how to fix; the empty state points to the next action; links describe their destination; no "oops" and no exclamation marks |
| Typography | Checked (source) | Five sizes; two families; two weights; 16px inputs; balance and pretty wrapping; mono only for data. **Unperformed:** rendered wrapping |
| Colors | Checked (declared pairs) | Primitive and semantic token tiers; one accent; contrast computed from declared hex pairs (all at least 5.39:1, listed in DESIGN.md). Status is never colour alone: every label and state carries text. **Unperformed:** measurement on the rendered page |
| UI | Checked (source) | Concentric radii (16 outer, 10 inner); shadow only on sheets with no border; no cards inside cards after fix F2; named transition properties; press scale 0.96; icons sized by attribute |

## 3. Findings and fixes

| # | Sev | Where | Finding | Fix | Recheck |
| --- | --- | --- | --- | --- | --- |
| F1 | Medium | `src/styles.css:71` | `.mono` at 0.9em added 14.4px and 11.7px sizes, pushing the scale past six sizes | `.mono` inherits the size around it | `grep font-size` shows five tokens only |
| F2 | Medium | `src/styles.css:124` | `.line` was a white rounded box inside a grey card (a card inside a card) | Lines are now padded rows with a 1px separator; `differs` uses a leading rule | Source rechecked |
| F3 | Low | `src/styles.css:185` | The × used a one-off 20px size | It uses `--text-title` | Source rechecked |
| F4 | Medium | `src/wallet.tsx:56` | The connect sheet opened inside the pay dialog cleared the dialog's `inert` when it closed | The sheet only removes `inert` if it set it | Typecheck and build pass |
| F5 | High (brief) | `src/bodies.ts:26` | The brief's oracle body has no `window`, which the docs say is required; a refused body is a spent payment | Added the check's drafted `window` (and `evidence: "panel"` for web or post questions) | Unit test pins the body |
| F6 | Low, open | `src/App.tsx` (header outside `main`) | While a dialog is open the header stays in the tab order, so focus is not fully trapped | Not fixed. The header holds only the brand, links and the wallet control | — |

## 4. Verification (commands actually run)

- `npm run typecheck` (`tsc --noEmit`): exit 0, after `@types/node` was added for the tests.
- `npm test` (vitest): 1 file, 10 of 10 tests pass.
- `npm run build`: exit 0. Output: `dist/index.html`, 6 JS chunks, 1 CSS file, `favicon.svg`,
  `og.png`; 1,337,142 bytes. `index.html` refers only to `./` URLs and has a title, description,
  favicon, `og:title` and `og:image`.
- Search of `dist/assets/*.js` for analytics hosts (googletagmanager, google-analytics, segment,
  mixpanel, posthog): none found.
- Live reads from Node on 2026-11-19:
  - `priceOf("job.open@job-1", IMD)` and `priceOf("oracle.request@oracle-1", IMD)` both returned
    `500000000000000000`.
  - Real Intake logs were decoded into `Requested` and `Completed`.
  - `GET /intake/1/<tx>` returned 200 with ACAO `*`; `/jobs`, `/oracle/requests` and `/artifacts`
    also send ACAO `*`.
  - The artifact hash is SHA-256 (matched on job `e985fe54-…` file `report`).
- The free request check: results are in `README.md`. Research `blockers: []`; P1, P2 and P3 (short
  form) `blockers: []`; P3 has one `wording` suggestion.
- **Taste probe:** run as
  `node .imd/reads/skills/design-critic/scripts/taste.mjs --out test/scratch/taste`. First result:
  Playwright not found. It was installed outside the repo (`$HOME/.imd-taste`), but its Chromium
  exited 127 with `libglib-2.0.so.0: cannot open shared object file`, and 19 more system libraries are
  missing. `apt-get download` could not fetch them without root. **The probe did not run**, and there
  are no screenshots.
- **Interaction test** `tests/e2e.mjs` (Playwright, mocked RPC and API, 29 check calls at 320, 390 and
  1440, including the pay dialog, presets, P4 errors, free-text warning, connect sheet, phone rows and
  the empty state): written but **not executed**, for the same Chromium failure.

## 5. Completion

**Incomplete.** The build, typecheck, unit tests and design review from source are done for the stated
scope. The required browser checks are missing: the taste probe, rendered screenshots at 320, 390 and
1440, the keyboard walk, and measured contrast. Chromium cannot start on this machine. Wallet flows
(connect, approve, pay) cannot be exercised without a wallet. This is the worker's own report, not an
independent certification.
