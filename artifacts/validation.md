# Validation: tabs, key facts, rebuild and Suggest an edit

Run on 2026-11-19 on this machine, after the last source change (the revision answering the review findings,
see `.imd-responses.json`).

## Commands and results

| Command | Result |
| --- | --- |
| `npm ci` | exit 0 |
| `npm run typecheck` (`tsc --noEmit`, covers `src`, `tests`, `vite.config.ts`) | exit 0 |
| `npm test` (vitest) | 47 of 47 pass: 22 in `tests/unit.test.ts`, 12 in `tests/rebuild.test.ts`, 13 in `tests/revision.test.ts` |
| `npm run build` | exit 0; `dist/index.html` uses only `./` URLs |
| `npx vite-node tests/make-fixture.ts test/scratch/fx.json` then `node tests/e2e.mjs test/scratch/fx.json test/scratch/e2e` (Playwright chromium-headless-shell 1255; its missing system libraries and DejaVu fonts were unpacked from Ubuntu packages under `/tmp`, outside the repository) | 147 of 147 pass at 390, 1440 and 320 wide plus four 390 scenarios |
| `node .imd/reads/skills/design-critic/scripts/taste.mjs --out test/scratch/taste` (live chain) | 15 of 16; `copy-budget` fails (93 words at 390 and at 1440), see below |
| `POST https://api.imd.fun/requests/check` with the rebuild, sources and edit bodies | 200, `blockers: []`, `suggestions: []`, `judged: true` for all, see README (run before this revision; templates and body shapes unchanged, not re-run) |

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
- No horizontal scroll on any tab; at every width each tab label lies fully inside the tab bar, which never
  scrolls, and every tab is at least 44px tall (at 320 Contribute wraps to a second row); no console errors.

Added for the review findings (fixture: the edit's own new line is also called `L1`; the Seat supply proof's
re-run is "…against the database index on Ethereum at block 0x1938720." with a `confirms A1` link; a second
drop `F1:L4` names a real earlier line):

- The supported sentence's dot opens page `#line-L1`; the supported_by_source sentence's dot opens the edit's own
  line `#line-0x…05-L1` ("Seats cost 1 ETH."), not the page's L1.
- The facts table reads "Ethereum, block 26,445,600" and shows "Confirmed by: The docs price a job at 0.5 IMD =
  true, 5 of 5" under the closed Seat supply row; the expanded claim no longer says "Nobody has confirmed it".
- The dropped list reads `F1:L4 “Old four”: duplicate of L1`.
- Activity: the old sources result, given to the rebuild as F2 but with F2:E2 unaccounted, reads "Completed
  before the page shown" and "2 lines in result" (never "Folded into"); the supported verdict shows "Backed by
  IMD is a swarm of agents." linked to `#line-L1`.
- Edit form: "IMD runs jobs." opens the review; "The string <PRIOR> is literal and <URLS> is also literal."
  stays literal and the record and sources fields hold the artifact list and the link.
- Overview's Rebuild is a link to `#rebuild`; the summary note is "… Not itself a checked line. Dots open
  supporting lines."; the contribution card has no helper paragraph.
- Scenarios at 390: `#%` loads Overview with no page error; with `eth_getLogs` delayed 2 s the Contribute
  rebuild button is disabled ("Reading the record…") and after loading its body names F1–F3 and A1; with an
  RPC error on `eth_blockNumber` the rebuild button stays disabled, Refresh is offered, and the edit does not
  open a review; with both page jobs removed, Overview shows "No page yet", "Run a rebuild to publish the first
  record." and the two accepted sentences with "Edited by", the supported one without a dot.

## Better Interface review

Guide: `.imd/reads/skills/better-interface/REFERENCE.md`, workflow section and the core principles of all six
domains, applied while building. Coverage: accessibility, layout, writing, typography, colours, UI. Rendered
checks were made with the headless Chromium above (screenshots in `test/scratch`, not submitted); contrast
was measured by the taste probe's `contrast` check, not by hand.

| Domain | Finding | Fix |
| --- | --- | --- |
| Layout | `src/styles.css` tabs: at 390 the fifth tab ("Contribute") was cut off at 16px (first probe screenshot) | Below 512px tabs use `--text-nav` 14px and spread across the width |
| Layout / accessibility | `src/styles.css:89` (review finding): at 320 the tab bar scrolled with its scrollbar hidden and clipped "Contribute" | The bar wraps instead; e2e checks no label is clipped and each is 44px tall at 320, 390 and 1440 |
| Writing | `src/Record.tsx:185,202,222` (review finding): boilerplate lead, empty-state and helper paragraph | Shorter lead, "Run a rebuild to publish the first record.", helper paragraph removed, shorter summary note |
| UI | `src/App.tsx:521` (review finding): Overview opened the paid dialog while the record loaded | Overview links to the Contribute card; review waits for the full read and offers Refresh after a failure |
| UI | `src/Record.tsx` Overview: price sat between the two buttons and wrapped them onto two rows | Buttons first, price after |
| Typography | summary dots sat below the baseline and pushed line height (`.sdots` vertical-align -7px) | `vertical-align: middle` with negative block margin |
| Accessibility | tabs are links with their own URLs, so they use `nav` + `aria-current="page"`, not `role=tablist`; after a link, focus moves to the tab heading or the target (`src/App.tsx`, route effect) | Done in source |
| Accessibility | summary dots carry `aria-label` "Open N proof lines in Record" and a 24px target; infobox line links name the row | Done in source |
| Writing | "Research again" renamed "Rebuild the page"; empty states say what to do ("Pay for one page job with Rebuild the page") | Done |
| Colours | link notes use the proof green and the error red, and always carry the words "Confirmed by"/"Contradicted by", so colour is never the only signal | Done |

Remaining finding, not fixed: the probe's `copy-budget` counts 93 words of prose on the first screen at 390
(bar 60) and 93 at 1440 (bar 90), down from 104 and 129 before this revision. What remains is the summary,
the one-line lead and the required "not itself a checked line" note. The brief makes the summary "the main text" of the default tab, so it is
on the first screen by design. On the live chain the shown page predates the rebuild, so it has no key facts
box; after a rebuild the box sits above the summary on phones and pushes most of the summary below the first
screen.

## Limitations

- Paying, approving and connecting a wallet were not tested: there is no wallet on this machine.
- The e2e run uses Chromium only; WebKit was not run here. The probe and e2e render with DejaVu fonts (no
  system fonts on this machine), which are wider than phone system fonts, so at 390 the tab bar wrapped in the
  e2e run but not in the probe's screenshots.
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
