# Validation: reading the record, label rule, new templates (job 3)

## Scope and assumptions

- Changed surfaces: the record (rows with details, filter, Summary, on-chain fact tables, differs levels, one
  source list), the Activity row for source jobs, the source and research templates, `public/agents.md`.
  The wallet code, request bodies' fields, oracle questions and the pay dialog are unchanged.
- Export: `dist/`, built by `npm run build` (Vite, `base: "./"`).
- Inferred choices: a research line's publisher is its `by` (matched to a channel label) or its sources' URLs
  (a URL at or under a channel URL); a source line's publisher is its source's `publisher` or URL. The job's own
  `publisher_is_subject_channel` is not trusted. Chain and block in the fact table come from `fact.chain` /
  `fact.block` if a result gives them, else from the line's text and re-run steps. `<MAIN>` reads "not known" and
  `<CHANNELS>` "none known" when there is no record.

## Verification (commands run on this machine, 2026-11-19)

| Command | Result |
| --- | --- |
| `npm run typecheck` | exit 0 |
| `npm test` | 22 of 22 pass |
| `npm run build` | exit 0; `dist/index.html` uses only `./` URLs |
| `POST https://api.imd.fun/requests/check` (research and source bodies) | both 200, `blockers: []`, `suggestions: []`, `judged: true` (README has details) |
| `node tests/e2e.mjs test/scratch/e2e test/scratch/harness-dist` (Chromium 1248 headless shell, live chain and api.imd.fun) | 44 of 44 pass |
| `node .imd/reads/skills/design-critic/scripts/taste.mjs --out test/scratch/taste` | 16 of 16 pass |

Browser setup: this machine's Chromium lacked system libraries (`libnspr4.so` and others). I extracted them from
Ubuntu packages into `test/scratch/libs` and ran with `LD_LIBRARY_PATH`. A shim in `test/scratch/pw` points
Playwright's `chromium.launch` at the cached headless shell. Neither is part of the repository.

**Interaction checks (e2e), at 390 and 1440 wide, against the live record** (60 lines: 40 from research, 20 from
the completed source job). Rows render closed. Clicking a row opens Checked and Added by. Enter on the row
button closes it and opens it again. The filter counts add up (All 60 = Proof 14 + Statement 11 + Claim 35),
and each filter shows only its kind. The source list is numbered 1 to 25 across research and added sources.
Activity lists every source of the source job with "N lines" or "could not open". There is no horizontal scroll
and no console or page error.

**With fixture data** (`test/scratch/harness`: the live page plus a summary, four `fact`s, a conflict and a
question pair, a `read_via`, and one source marked not about the subject), at 390 and 1440:
- The Summary has its heading and note. A line-id link switches the filter to All, opens that line and focuses
  it.
- Both differs wordings show.
- The fact table shows 4 rows with "Ethereum, block 26,445,903", and a table row opens to the sentence and
  re-run steps.
- "read via web.archive.org" shows.
- "read, not about this subject: …" shows.

Screenshots I looked at: `live-390.png`, `live-1440.png`, `fixture-390-facts.png`, `fixture-1440-facts.png`,
`fixture-390-differs.png`, `fixture-1440-differs.png` and the probe's `390.png`, `1440.png` (all under
`test/scratch/`, not submitted). At 390 the first screen shows the title, the one-line description and the
Research again / Confirm a fact / Add sources buttons.

**Probe (taste@1), final export:**
- render, layout, targets, contrast, casing, tracking, eyebrows: pass.
- type-sizes: 4 sizes used more than once, 5 counting one-offs.
- type-faces: 2 families, 2 weights.
- glyphs, slogans, repetition: pass.
- copy-budget: 57 words of prose on the first screen at 390 (bar 60).
- chrome, motion: pass.
- share: title, favicon, og:title, og:image and description all present.

## Better Interface review (six domains)

| Domain | Coverage |
| --- | --- |
| Accessibility | Checked. Each row toggle is a native `<button>` with `aria-expanded`/`aria-controls`. Clicking the row is an extra pointer shortcut, and its links stay separate tab stops. The filter is `role="group"` with `aria-pressed`. The fact table has a caption and row headers. A Summary link moves focus to the opened row. Kinds are shown by dot plus word, never colour alone. The chevron transition is off under reduced motion. Keyboard Enter was tested in Chromium. Not verified: a screen-reader session, forced-colours mode, native 200% zoom. |
| Layout | Checked at 320 (probe), 390 and 1440. The sentence comes first and evidence is behind disclosure, with a chevron to show there is more. Differs pairs stay together. Fact rows that are part of a differs pair stay as rows. |
| Writing | Checked. Labels are worded as the brief asks. The Checked text says why a marked statement is shown as a claim. Outcome text is "N lines", "could not open" or "read, not about this subject: why". |
| Typography | Checked. The existing five-size scale and two weights are kept. Counts and table numbers use tabular numbers. Long URLs wrap. |
| Colors | Checked. Existing tokens are reused, plus `--red-800` for conflicts. The probe measured contrast: all text passes 4.5:1. |
| UI | Checked. States: closed, open, pressed filter, hover gated by `(hover: hover)`, empty filter result ("No lines of this kind."). There is no `transition: all`. |

## Findings and fixes

1. **MEDIUM, layout:** at 390 the row chevron wrapped onto its own line above the sentence (`src/styles.css`
   `.row-toggle`, first version: flex-wrap with a 20rem text basis). This was seen in
   `fixture-390-facts.png`. Fix: the toggle is now a grid (`auto | 1fr`, plus `auto` above 40rem), and the
   chevron is aligned to the first line. Rechecked in `fixture-390-differs.png`: fixed.
2. **LOW, test race:** the e2e first read the filter counts while only the source-job lines had loaded (3 fails at
   390). This was a test problem, not a site bug: until the research page arrives, source lines show as claims
   because there are no channels yet. Fix: `tests/e2e.mjs` now waits for the research page's Channels block.
   Rerun: 44 of 44.

## Completion

Complete for the stated scope. Limits:
- Paying, approving and connecting were not run, because there is no wallet on this machine.
- No live result has `summary`, `fact` or `level` yet, so those were checked with fixture data in the real
  browser.
- No screen-reader or physical-device session was run.
