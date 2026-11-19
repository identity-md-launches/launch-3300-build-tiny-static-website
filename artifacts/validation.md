# Validation: tabs, key facts, rebuild and Suggest an edit

Run on 2026-11-19 on this machine, after the last source change.

## Commands and results

| Command | Result |
| --- | --- |
| `npm ci` | exit 0 |
| `npm run typecheck` (`tsc --noEmit`, covers `src`, `tests`, `vite.config.ts`) | exit 0 |
| `npm test` (vitest) | 34 of 34 pass: 22 in `tests/unit.test.ts`, 12 in `tests/rebuild.test.ts` |
| `npm run build` | exit 0; `dist/index.html` uses only `./` URLs |
| `npx vite-node tests/make-fixture.ts test/scratch/fx.json` then `node tests/e2e.mjs test/scratch/fx.json test/scratch/e2e` (headless Chromium 1248) | 118 of 118 pass at 390, 1440 and 320 wide |
| `node .imd/reads/skills/design-critic/scripts/taste.mjs --out test/scratch/taste` (live chain) | 15 of 16; `copy-budget` fails, see below |
| `POST https://api.imd.fun/requests/check` with the rebuild, sources and edit bodies | 200, `blockers: []`, `suggestions: []`, `judged: true` for all, see README |

`tests/rebuild.test.ts` pins `templates/rebuild.txt` (the research text plus the brief's insertion before
"Sections:" and the new keys), the rebuild body's tag, output and `<PRIOR>` list, `parsePrior` reading it
back, the edit body and `templates/edit.txt`, the edit links rule (at most 5), `edit.json` verdicts and
accepted summary, `infobox`, `from`, `links`, `dropped` and `paragraph`, the paragraph fallback, the
unaccounted-lines check and completion ordering.

## What the interaction test covers

`tests/e2e.mjs` serves `dist/` and answers every JSON-RPC and api.imd.fun read from a fixture built with the
site's own body functions: an old page, a sources result, a panel answer, a rebuild of those (its `<PRIOR>`
names them as F1, F2 and A1), then a sources result and an edit completed after the rebuild. At each width:

- Overview is the default tab; the key facts box is above the summary at 390 and 320 and beside it at 1440;
  values with a url are links; the accepted edit is the summary, in two paragraphs, marked
  "Edited by 0x0085…059e, checked by a research job"; "Checked by a panel" is on Overview; at 390 the
  Rebuild button is on the first screen.
- A summary dot opens its line in the Record tab, open.
- Record has exactly one facts table, in "On chain", with name, value with unit, chain and block.
- "Confirmed by: <proof line>" is green (rgb 20,108,54), "Contradicted by: <panel answer A1>" red
  (rgb 161,35,27); Confirmed by opens the proof line.
- The accounting warning reads "1 earlier line is unaccounted for" and lists `F2:E2`; "Dropped in the last
  rebuild" is closed and lists `F2:E1x` with its reason.
- Lines from the later sources result and the edit join the record; the old sources result folded into the
  rebuild does not show. The Proof filter shows only the fact row.
- `#actions`, `#add-sources`, `#activity`, `#sources`, `#source-1` open the right tab.
- Activity lists each edit sentence with its verdict and reason, and says which results are shown now,
  replaced or folded.
- The rebuild dialog body has kind `add`, `artifacts/page.json` and
  `Start from the earlier results: [F1] <shown page>; [F2] <later sources>; [F3] <later edit>; [A1] … = true, 5 of 5, <request URL>.`
- The edit box holds the current summary; 1,501 characters is flagged and does not open the dialog; a
  non-https link is left out; the edit dialog body has kind `edit`, `artifacts/edit.json`, the text, the prior
  list and the numbered link. The Edit button beside the summary moves focus to the edit form.
- No horizontal scroll on any tab; at 390 and 1440 all five tabs fit without scrolling the tab bar (at 320 the
  tab bar scrolls inside itself); no console errors.

## Better Interface review

Guide: `.imd/reads/skills/better-interface/REFERENCE.md`, workflow section and the core principles of all six
domains, applied while building. Coverage: accessibility, layout, writing, typography, colours, UI. Rendered
checks were made with the headless Chromium above (screenshots in `test/scratch`, not submitted); contrast
was measured by the taste probe's `contrast` check, not by hand.

| Domain | Finding | Fix |
| --- | --- | --- |
| Layout | `src/styles.css` tabs: at 390 the fifth tab ("Contribute") was cut off at 16px (first probe screenshot) | Below 512px tabs use `--text-nav` 14px and spread across the width; e2e checks they fit at 390 |
| UI | `src/Record.tsx` Overview: price sat between the two buttons and wrapped them onto two rows | Buttons first, price after |
| Typography | summary dots sat below the baseline and pushed line height (`.sdots` vertical-align -7px) | `vertical-align: middle` with negative block margin |
| Accessibility | tabs are links with their own URLs, so they use `nav` + `aria-current="page"`, not `role=tablist`; after a link, focus moves to the tab heading or the target (`src/App.tsx`, route effect) | Done in source |
| Accessibility | summary dots carry `aria-label` "Open N proof lines in Record" and a 24px target; infobox line links name the row | Done in source |
| Writing | "Research again" renamed "Rebuild the page"; empty states say what to do ("Pay for one page job with Rebuild the page") | Done |
| Colours | link notes use the proof green and the error red, and always carry the words "Confirmed by"/"Contradicted by", so colour is never the only signal | Done |

Remaining finding, not fixed: the probe's `copy-budget` counts 104 words of prose on the first screen at 390
(bar 60) and 129 at 1440 (bar 90). The brief makes the summary "the main text" of the default tab, so it is
on the first screen by design. On the live chain the shown page predates the rebuild, so it has no key facts
box; after a rebuild the box sits above the summary on phones and pushes most of the summary below the first
screen.

## Limitations

- Paying, approving and connecting a wallet were not tested: there is no wallet on this machine.
- In this sandbox's browser the price read (`priceOf` through wagmi's transport, `gateway.tenderly.co`, which
  the brief keeps unchanged with the wallet code) fails its CORS preflight, so the live page and the probe show
  "Price unavailable". The record itself loads, through the other public RPCs `src/chain.ts` falls back to.
  The pay dialog reads the price again before paying and does not allow payment without it.
- No rebuild or edit has run on chain yet, so the key facts box, links, accounting and edit display were
  checked only against the fixture, not against a real job result.
- The rebuild objective keeps the research text verbatim, including its "Write summary: 3 to 5 plain
  sentences"; the added text then asks for "5 to 9 plain sentences in 2 or 3 paragraphs". IMD's check raised
  no blocker or suggestion for it.
- With many panel answers `<PRIOR>` grows; the rebuild dialog warns and the edit form refuses when the
  objective would reach 7,500 characters.
