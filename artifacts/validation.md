# Validation

## This build: revision 33, data for the next layout (2026-11-26)

See README "Revision 33" for the command results table. Summary:
- Typecheck and production build passed.
- 627 of 627 unit tests passed.
- The job check was run on the 35 live tagged requests with this code and with the previous code. The verdicts are identical, so there is no new "Not read" and all seven subjects keep their pages.
- The design-critic probe passed all 16 checks at 320, 390 and 1440. Its screenshots are in `test/scratch/taste/shots/`, not committed.
- The new screenshot block was rendered with the built CSS at 320, 390 and 1440 and passed.
- IMD's free request check judged the new bodies. Its only blocker was that the new instruction files are not yet reachable on IPFS, which they will be after publication.

Not performed: a live subject page with a screenshot in a browser. None exists until a rebuild runs with the new file.

### Better Interface review of revision 33

Coverage: all six domains were reviewed against the source for the one visible change, `FirstShot` (`src/Record.tsx`, `src/styles.css`). The rendered checks were made with Playwright on a scratch page that uses the built CSS. No subject page was rendered.

- **Accessibility.** The image has alt text naming the project and the screen (`src/Record.tsx` `FirstShot`). Without a caption it falls back to "A screen of <name>". The source link is a real anchor with `rel="noopener noreferrer"`. The figure adds no focus stop besides that link.
- **Layout.** The figure sits in the reading column, above the Summary heading, with an 8px gap. It never exceeds the column or 480px in height. Measured at 320, 390 and 1440 with no horizontal scroll.
- **Writing.** The caption is the job's own (at most 8 words by the instructions). The link text is the bare host. Nothing else new is visible.
- **Typography.** No new size: the caption is the existing 13px small text. The probe still counts at most 6 sizes, one family and two weights.
- **Colours.** Only existing tokens: border, subtle background and secondary text. The probe measured all visible text at 4.5:1 or better on Home. The caption colour is the same token the probe already measured.
- **UI.** A 1 by 1 placeholder slot is never shown (narrower than 320px reads as none). The image is a checked data: URL, so no third-party request.

Finding fixed: none was found in the rendered check.

Remaining limitation: the caption's middle dot was seen as mojibake only on the scratch page, which had no charset. The site's `index.html` declares UTF-8.

## This build: revision 32, layout (2026-11-25)

See README "Revision 32: layout" for the command results table. Summary: typecheck and production build passed; 610 of 610 unit tests passed; the design-critic probe passed all 16 checks at 320, 390 and 1440 (screenshots were taken in `test/scratch/taste/shots/`, not committed); a Playwright run on the export confirmed the one-row header, the menu, the hidden label and the short placeholder at 320 and 390. Subject pages were not observed in a browser this round (the live log scan did not finish within the sandbox's time limit); that is a stated limitation, not a pass.

### Better Interface review of revision 32

Coverage: the six domains were checked without a browser against the source; the rendered checks named below were made with Playwright where stated, the rest are unperformed.

- Accessibility. Menu button has `aria-label="Menu"`, `aria-expanded`, `aria-controls`, Escape returns focus to it (`src/SiteMenu.tsx:50`). Related "+" has `aria-label="Add this project"` and `aria-describedby` naming the project (`src/Record.tsx:1073`); the visible tooltip is `aria-hidden` so the name is not read twice. The contributors tables are named by their headings via `aria-labelledby` instead of a second caption (`src/Record.tsx:1131`), which also fixes the doubled "Page contributors". Channel groups and the Activity fold are native `<details>` / a button with `aria-expanded` (`src/Record.tsx:2432`, `src/ActivityList.tsx:170`). All new targets are 44 px. Home's label remains for screen readers (`src/Home.tsx:632`).
- Layout. Header cannot wrap below 768 px (`src/styles.css:1207`); measured at 320: name 16 to 149, Connect 153 to 260, menu 260 to 304, no horizontal scroll. Related-to-About spacing on the 4 px grid (56 = 16 + 40, `src/styles.css:1224`).
- Writing. Labels are the requester's words ("Contributors", "Add this project", "3 earlier rebuilds", "Last built 24 Nov 2026", "Built with older instructions", "Rebuild"). Zero counts are left out (`src/settle.ts:175`).
- Typography. No new sizes: group titles and the fold use body size, counts and notes small size (probe: at most 6 sizes, one family, two weights).
- Colours. Only existing tokens; tooltip is ink on white (contrast above 4.5:1 by the tokens; the probe measured all visible text as passing, the tooltip was not visible during the probe).
- UI. Duplicate channels collapsed by address (`src/page.ts:558`); the not-verified group starts closed.

Findings fixed: doubled "Page contributors" (caption showing next to the heading); indented "Funded by" list (`.plain` padding); two rules between Related and About; header taking two rows on phones; stale header rules for `.top-row > .top-link` removed. Remaining: the tooltip, the open menu panel on a subject page and the subject tabs were not rendered in a browser this round.

## This build: suggest-a-change polish (job 10, 2026-11-20)

Run on this machine after the last source change.

| Command | Result |
| --- | --- |
| `npm ci` | exit 0 |
| `npx vite-node scripts/agents-md.ts` | rewrote `public/agents.md` (49,361 characters, no change: bodies and templates untouched) |
| `npm run typecheck` | exit 0 |
| `npm test` (vitest, `tests/`) | 175 of 175 pass in 12 files; 17 new in `tests/polish.test.ts`, 1 updated in `tests/changes.test.ts` (the note rule is now 10 characters) |
| `npx vitest run test/scratch` (jsdom 26 under `$TMPDIR`, not a dependency) | 4 of 4 pass: Reword it, Back this up, Review with three changes, account chip and menu (details in the README) |
| `npm run build` | exit 0; `dist/index.html` uses only `./` URLs; title, favicon, description, og:title, og:image present; `dist/` 1.6 MB |
| `node .imd/reads/skills/design-critic/scripts/taste.mjs --out test/scratch/taste` | **Did not render.** Playwright loaded, but stopped at `render`: no Chromium starts here (the cached `chromium_headless_shell-1248` is missing `libnss3`, `libnspr4`, `libatk-1.0`, `libXcomposite` and more; Playwright's own build wants revision 1255, which is not cached). No screenshot, measured width or contrast ratio is claimed |
| `node tests/e2e.mjs` | Not run, for the same reason |

A bug the interaction check found and that is fixed: with no supporting lines, the Reword it hint read "Your wording
is kept if a link you add support it." It now reads "…if a link you add supports it." (`src/Suggest.tsx`, the
`KEPT_RULE` replacement).

### Better Interface review of this job

Guide: `.imd/reads/skills/better-interface/REFERENCE.md`. All six domains were checked without a browser, on the
source of the changed parts: the change panel, Review, the Overview footer, the header and account chip, and number
formatting. The checks that need a browser were not performed (see above).

- **Accessibility.** The evidence rows are real links (`<a href>` to the line's anchor) that open the line, so
  Cmd/Ctrl-click works (`src/Suggest.tsx`, `EvidenceList`). The account control is a disclosure button with
  `aria-expanded`/`aria-controls`, not `role="menu"`, because it has no arrow-key behaviour; Escape closes it and
  focus goes back to the chip, and focus leaving or a click outside also closes it (`src/wallet.tsx`,
  `AccountChip`). "Read the full request" is a button with `aria-expanded`/`aria-controls="review-body"`.
  *Finding:* the guide's forms table says not to disable Submit until the form is valid
  (REFERENCE.md:253, :916). The brief explicitly requires Add to my changes to stay disabled, so the brief wins.
  The guide's fallback is applied: the reason is visible text under the buttons, linked by `aria-describedby`,
  and announced politely (`src/Suggest.tsx`, the `${id}-need` paragraph). Markers keep their word beside the
  colour dot; the "No source" tag is text, not just amber.
- **Layout.** *Finding:* `.rests { white-space: nowrap }` (old `src/styles.css:277`) let the "Rests on" sentence
  widen the panel and the page. Fixed by removing it together with the sentence. `.opts` used `minmax(9.5rem, 1fr)`,
  wider than a panel on a 320px phone; now `minmax(min(9.5rem, 100%), 1fr)`. `.cpanel` is `width/max-width: 100%;
  min-width: 0`, with one `minmax(0, 1fr)` track and `overflow-wrap: anywhere`. `main` and the one-column grids get
  `minmax(0, 1fr)` tracks. *Finding:* `.more-links` used `margin-top: -24px` to pull the links under the footer
  card, so they overlapped it; removed with the card. *Finding:* the header row was 60rem wide inside 16px padding
  while `main` was 60rem including its padding, so the brand and wallet sat 16px outside the content's edges;
  both now use `--page-max` and `--page-pad`.
- **Writing.** The new copy is the brief's words. Review's warning is singular for one change ("1 of your changes
  has no source. It only reaches…") and the brief's plural otherwise. Disabled reasons say what to do: "Write at
  least 10 characters.", "Back this up needs a link.", "Change the sentence first: it is the same as the current one."
- **Typography.** No new sizes: the panel, Review and footer use the existing 16px and 13px steps (six sizes in
  all). *Finding:* clamped text (Review's "about" line, the evidence row text) needs its full content reachable
  (guide, Truncate without losing content); each clamped element has the full text in `title`, the evidence row
  opens the full line, and the full request holds the exact text. Numbers use `tabular-nums` in the facts table.
- **Colours.** The change tags reuse the existing label pairs (red/blue/green/violet/orange-800 on their 50 tint);
  the "No source" tag is orange-800 on orange-50, the same pair as the existing no-source note. No new colours.
- **UI.** The account chip is the Connect button's height (44px). The menu uses one shadow token
  (`--shadow-menu`) and the control radius. The Overview footer has no card or button, so it reads as a quiet
  end of the page.

Remaining limitations: nothing was rendered, so the panel at 320/390 wide, the one-line Review footer, the header
edge alignment and the 390 first screen are not confirmed by screenshot; paying and real wallets were not tested.


## This build: fourth revision of the no-size-limit change (2026-11-19)

Run on this machine after the last source change. Answers to each review finding are in `.imd-responses.json`.

| Command | Result |
| --- | --- |
| `npm ci` | exit 0 |
| `npx vite-node scripts/agents-md.ts` | rewrote `public/agents.md` (36,307 characters) |
| `npm run typecheck` | exit 0 |
| `npm test` (vitest) | 89 of 89 pass in 5 files, including 5 new in `tests/findings.test.ts` for this round's four finding ids |
| `npm run build` | exit 0; `dist/index.html` uses only `./` URLs; `dist/` 1.5 MB |
| Escape routing in jsdom (`test/scratch/modal.test.ts`, jsdom under `/tmp`, not a project dependency) | 1 of 1 pass: with a sheet held over the pay dialog, one Escape calls only the sheet's close; releasing it makes Connect live and focused; the next Escape closes the dialog and focus returns to its opener |
| `node tests/e2e.mjs …` and `taste.mjs` | **Not run.** Playwright installed under `/tmp` and downloaded chromium-headless-shell 1255, but it cannot launch: 20 system libraries (`libglib-2.0`, `libnss3`, `libX11`, …) are missing and `apt-get download` finds no package source. No rendered check, screenshot or contrast figure is claimed for this round |

What the new tests pin:

- 32496e59: `L4` in both F1 (job-1 page) and F2 (job-2 sources): `candidateFiles` gives [1, 2]; Record's
  `droppedLines` still shows `L4` as given with no text; `planRebuild` waits for the reads, then marks both URLs
  `(reconsider dropped lines)` and the objective contains both. The 7,500-character gate still holds back the
  rebuild when the candidate set alone does not fit. The earlier test that expected an ambiguous id to mark no
  file now expects both files.
- e69669a6: the reviewer's page (ERC-20 main at `0xd34a…63b7`, an ERC-721 "Collectible badges" at `0x2222…2222`
  with `symbol()` and `totalSupply()` proofs) gives two rows, Website and Main contract. The token's own symbol proof
  is shown; a proof that names no contract is not (`provesToken`). The earlier fallback test now gives its supply
  proof the main contract's address in the re-run.
- d1dd68f7: `Official accounts: @imd` alone, channel "IMD on X" (tie strong), shows "Verified on chain" and "Stated
  by IMD on X"; in "@imd, @news" `@imd` shows the same label.
- 84df4beb: the jsdom check above (`src/modal.ts` now routes Escape to the top modal only).

### Better Interface review of this revision

The changes are behavioural: Key facts rows, rebuild planning, Escape routing. No new markup, tokens or sizes.
I checked the six domains without a browser for the changed parts. Accessibility: Escape now matches the
nested-dialog focus model (`src/modal.ts:29-37`), fixed. Writing: the README, agents.md and DESIGN.md describe the
new rules. Layout, typography, colours and UI: no change, so no finding. Rendered checks were not performed
(no browser, above). Paying and wallets were not tested (no wallet here).

## Earlier build: third revision of the no-size-limit change (2026-11-19, evidence for the previous source only)

Run on this machine after the last source change. Answers to each review finding are in `.imd-responses.json`.

| Command | Result |
| --- | --- |
| `npm ci` | exit 0 |
| `npm run build` (`tsc --noEmit`, then `vite build`) | exit 0; `dist/index.html` uses only `./` URLs (`./favicon.svg`, `./assets/…`); `dist/` 1.5 MB |
| `npm test` (vitest) | 86 of 86 pass in 7 files, including 15 new in `tests/findings.test.ts`, one block per finding id |
| `npx vite-node scripts/agents-md.ts` | rewrote `public/agents.md` (36,075 characters) from the site's own bodies |
| Focus-hold check in jsdom (`test/scratch/focus.test.ts`, jsdom installed under `/tmp`, not a project dependency) | 1 of 1 pass: skip link, header and main inert while the dialog is open; Tab from the last control goes to Close, Shift+Tab from the heading or Close goes to the last; a nested sheet holds focus and gives it back; release restores the opener; a node outside the app root stays usable |
| `node tests/e2e.mjs …` and `node .imd/reads/skills/design-critic/scripts/taste.mjs --out test/scratch/taste` | **Not run this round.** Playwright 1.49 installed under `/tmp` and downloaded chromium-headless-shell 1148, but the browser cannot start: 21 system libraries (`libglib-2.0`, `libnss3`, `libX11`, …) are missing, and this sandbox now refuses the Ubuntu package downloads (`apt-get download` finds no source; `archive.ubuntu.com/ubuntu/pool/…` answers 403). The previous round's 124-check e2e run and 16 of 16 probe result are for the earlier source |
| `POST https://api.imd.fun/requests/check` | Rebuild, sources and edit bodies not re-run that round (wording changed, no field or key). The Suggest changes body (`changesBody`, `tag.kind` `changes`) was run on 2026-11-20 for 3 bodies (2,737, 2,815 and 2,681 chars, all 6 change types): all 200, `judged: true`, `blockers: []`, `suggestions: []` (table in README) |

What the new unit tests pin (each reproduces the finding's own case):

- 52acaff0: a page with 2,001 claim lines and 2,001 dropped entries keeps all of them; an infobox row citing
  `L2001` resolves to it and shows "Reported by Example Weekly"; dropped entry 2,001 resolves to its earlier text.
- dc28a9b3: the rebuild template says "Merge only exact duplicates of the same attributed line. Keep separate lines
  for different speakers or quotations…" and no longer "Merge lines that say the same thing".
- 8fe1a504: page `f…f`, one dropped `F1:L2` from `1…1`, 60 later results: `<PRIOR>` lists the marked file, keeps the
  newest results that fit, stays under 7,500; `planRebuild` is `ok`. When the files to reconsider alone do not fit,
  `reconsiderLeftOut > 0` and the Contribute card and home form do not offer the rebuild.
- 45192b1a: a bare dropped `L4` that only F1 has resolves to F1 with the same reads Record's accounting makes; until
  those reads finish Contribute says "Reading the earlier files the dropped lines came from…", a failed read says
  so and offers Refresh (which retries the reads), and the home form sends the visitor to the subject's page.
- 1154ad1b: rebuild, Add sources and edit objectives make lines on Own domain (any tie) or tie strong channels
  statements and everything else claims; a `docs.imd.fun` channel with tie none gives "Stated by Docs".
- e3dbc6c6: Seat supply (L1) before Token supply (L2) gives one row, "Token supply 1000 EX"; a seat-only page gives
  no supply row; a proof on the token contract is preferred.
- e2b1fd57: the CSS has `table-layout: fixed`, a wrapping badge cell (no `nowrap`) and badges with `max-width: 100%;
  overflow-wrap: anywhere`. The rendered widths at 641 and 1440 were **not** measured (no browser, above).
- 9f1d8237: the README names the three drop reasons, settled lines kept, reconsidered files, Supply and Seats,
  badge precedence, the four-row fallback and the three labels; the old tie words are gone.
- 2ba970b7: `Official accounts: @imd, @news` shows `@imd` Verified on chain and `@news` Not verified, with one
  evidence badge for the row.

### Better Interface review of this revision

Guide `.imd/reads/skills/better-interface/REFERENCE.md`, six domains, checked without a browser for the changed
parts: the key facts table, the pay dialog's price state, the modal focus boundary and the Contribute wording.
Rendered checks (contrast measurement, screenshots, overflow at 320/390/641/1440) were not performed this round.

| Domain | Finding | Fix |
| --- | --- | --- |
| Layout | `src/styles.css:118-122`: automatic table layout with a `nowrap` badge cell let one long publisher name set the table's width | Fixed layout, 16rem badge column, wrapping badges (`src/styles.css:118-126`) |
| Accessibility | `src/App.tsx:442`, `src/wallet.tsx:50`: only `main` was inert; Tab reached the skip link and header behind the dialog, and focus return ran while the opener was still inert | `src/modal.ts` holds focus for both, restoring the opener after the background is live again |
| UI / writing | `src/App.tsx:512`: a failed price read still said "Reading price…" with no way to retry | "Price unavailable" plus a "Retry price" button; Pay stays disabled until a price is read |
| Writing | `src/App.tsx:102,168`, `src/Record.tsx:340`: "tied channels", "merges repeats", "not on a tied channel" described the old rules | Worded with the visitor labels: Own domain or Verified on chain; "merges only exact duplicates" |
| UI | `src/Record.tsx:84`: an Official accounts list hid which account is verified | Each account listed with its own label pill |
| Typography / colours | No new sizes or tokens: the new list uses `--space-1/2` and the existing badge tones | n/a |

Remaining limits: no browser run this round (above); paying and wallets not tested (no wallet here).

## Earlier build: subjects, second revision (2026-11-19, evidence for the previous source only)

Run on this machine after the last source change. Answers to the review findings are in `.imd-responses.json`.

| Command | Result |
| --- | --- |
| `npm ci` | exit 0 |
| `npm run typecheck` / `npm run build` (`tsc --noEmit` over `src`, `tests`, `vite.config.ts`, then `vite build`) | exit 0; `dist/index.html` uses only `./` URLs (`./favicon.svg`, `./assets/…`) |
| `npm test` (vitest) | 66 of 66 pass: 22 `tests/unit.test.ts`, 12 `tests/rebuild.test.ts`, 13 `tests/revision.test.ts`, 19 `tests/subjects.test.ts` |
| `npx vite-node tests/make-fixture.ts test/scratch/fx.json` then `node tests/e2e.mjs test/scratch/fx.json test/scratch/e2e` (Playwright 1.x chromium-headless-shell 1255; missing system libraries and DejaVu fonts unpacked from Ubuntu 24.04 packages under `$TMPDIR`, outside the repository) | 124 of 124 pass at 390, 1440 and 320 wide plus three 390 variants |
| `node .imd/reads/skills/design-critic/scripts/taste.mjs --out test/scratch/taste` (export against the live chain) | 16 of 16 pass; copy budget 36 words at 390 (bar 60), 84 at 1440 (bar 90); share: title, favicon, og:title, og:image, description |
| `POST https://api.imd.fun/requests/check`: 7 job bodies (rebuild, sources, edit, with and without the contract, and a chain-137 contract-only first rebuild) and the 3 oracle short forms | all 200, `judged: true`, `blockers: []`; job bodies no suggestions; post `not_answerable` and contract `wording` suggestions on the sample values; all 3 drafts equal the sent bodies byte for byte (table in README) |

New interaction checks for the findings (at each width unless marked 390):

- Add a project: "Other chain ID" with "polygon" shows the chain error and opens no dialog; with 137 the form shows
  `#/s/137:0x1111…1111`, and the dialog body has `"subject": "137:0x1111…"` and "the project whose main contract is
  0x1111… on chain 137".
- `#/s/1:0x1111111111111111111111111111111111111111` and `#/s/pneumaticstatisticsandtokenregistry.example`: no
  horizontal scroll (scrollWidth equals clientWidth at 320, 390 and 1440) and the heading keeps the full id.
- Record: `#panel-answers` is the last child of the tab section.
- 390, only the completed panel answer (request 06): Activity reads "answer: true (panel, 5 of 5 agreed)" and Record
  lists one row under Panel answers (before: no `#panel-answers`, "No lines yet").
- 390, a `person.example` rebuild whose page file says `found: false`: Home lists no project and never shows
  "Sample Person"; `#/s/person.example` shows "Not a project record" with the notes and `#record-title` is the id;
  Activity keeps the job with "Not a project record … Its notes: The domain identifies a person, not a project."
- 390, `eth_blockNumber` failing, after Try again fails too: no "No projects yet"; "Review the first rebuild" for
  imd.fun opens no dialog and shows "The project list could not be read. Try again before reviewing a rebuild."
- Unit test: the reviewer's size case (F1, one sources URL, 20 answers of 88-character titles) is 8,493 characters in
  full and now fits F1, the sources file and the newest 14 answers in 7,419 characters.

### Better Interface review of this revision

Guide `.imd/reads/skills/better-interface/REFERENCE.md`; all six domains considered for the changed views (Home form,
Overview empty and rejected states, Record end, Activity row). Rendered checks with the headless Chromium above;
screenshots `390-contract-subject.png` and `390-rejected-activity.png` in `test/scratch/e2e` (not submitted) were
looked at.

| Domain | Finding | Fix |
| --- | --- | --- |
| Layout | `src/Record.tsx:231` / `src/styles.css:64`: an unbroken subject id in h1 and the lead made the page 946px wide at 390 | `h1–h4, p { overflow-wrap: anywhere }` (`src/styles.css:66`); the id wraps inside the column |
| UI / writing | `src/Home.tsx:65`: no way to describe a contract on an unlisted chain | "Other chain ID" option and a numeric field with its own label, error and focus |
| UI | `src/App.tsx:641`: a failed read still opened a paid first-rebuild review with an empty `<PRIOR>` | Review refused with a plain retry message; "No projects yet" only after a good read |
| Writing | `src/Record.tsx`: a rejected result showed the person's name as the title | "Not a project record" card with the job's notes and a link to Activity |
| Layout | `src/Record.tsx:631`: Panel answers sat above "Other channels" and "Not known yet", and vanished without a page | Rendered as the last child of Record in every state |
| Accessibility | New field `#add-chain-other` has a visible label, `inputMode="numeric"`, `aria-invalid` and `aria-describedby` to its error | Done in source |
| Colours / typography | No new tokens or sizes; the rejection text uses the existing error red and the small size | n/a |

Remaining: WebKit not run; paying and wallets not tested (no wallet here); the price read through
`gateway.tenderly.co` fails CORS in this sandbox, so screenshots say "Price unavailable".

## Earlier build: tabs revision, before subjects (evidence for the previous version only)

The measurements below were taken on the earlier build and are kept as its record. Where they describe placement
or counts that changed (the panel list, 47 tests, 147 checks, the request check), the section above is current.

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
| `POST https://api.imd.fun/requests/check` with the rebuild, sources and edit bodies | 200, `blockers: []`, `suggestions: []`, `judged: true` for all, see README (run for that build; superseded by the 2026-11-19 subjects-revision table in README) |

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
  "Edited by 0x0085…059e, checked by a research job"; the panel list (then on Overview, now the last section of Record); at 390 the
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
