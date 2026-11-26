# Design

Taken from `src/styles.css`, `src/App.tsx`, `src/Home.tsx`, `src/Record.tsx`, `src/Suggest.tsx` and `src/ActivityList.tsx` as built.

## Tokens

| Token | Value | Use |
| --- | --- | --- |
| `--color-bg` | `#ffffff` (`--gray-0`) | Page, inputs, neutral buttons |
| `--color-bg-subtle` | `#f6f7f9` (`--gray-50`) | Cards, the request body box |
| `--color-bg-hover` | `#eceef2` (`--gray-100`) | Hover, chips, neutral pills |
| `--color-border` | `#dde1e7` (`--gray-200`) | Rules, input borders, the key facts box |
| `--color-text` | `#14171c` (`--gray-900`) | Body text |
| `--color-text-secondary` | `#5f6673` (`--gray-500`) | Meta lines, inactive tabs, infobox labels |
| `--color-accent-solid` | `#5b21b6` (`--violet-700`), hover `#4c1d95` | Primary button, active tab underline |
| Proof | `#146c36` on `#e9f7ee` | Proof marker and dots, "Confirmed by", supported verdicts, `true` answers |
| Statement | `#1e4fa8` | Statement marker and dots |
| Claim | `#9a3d00` on `#fff1e5` | Claim marker and dots, the unaccounted-lines warning |
| Error | `#a1231b` on `#fdecea` | Errors, conflicts, "Contradicted by", unsupported verdicts, `false` answers |
| `--radius-card` / `--radius-control` | 16px / 10px | Cards and the key facts box / buttons, inputs |
| Spacing | 4, 8, 12, 16, 24, 32px (`--space-1` to `--space-8`) | All gaps and padding |
| `--shadow-sheet` | two soft shadows | Dialogs only |
| `--shadow-menu` | `0 1px 2px` + `0 6px 20px`, 6–12% black | The account menu only |
| `--read-max` | 47.5rem (760px) | The summary's text column on Overview (`.summary-col`, `.summary-col .prose`) |
| `--page-max` / `--page-pad` | 60rem / `max(16px, safe-area insets)` | The one content column: the header row and `main` both use it, so the brand sits at the content's left edge and the wallet at its right edge at every width |
| Change tags (`.ctag-*`) | wrong red-800 on red-50; context and links blue-800 on blue-50; backing green-800 on green-50; reword and new line violet-800 on violet-50; "No source" orange-800 on orange-50 | Review's type tag and the amber "No source" tag |

## Typography

System sans (`system-ui, -apple-system, "Segoe UI", Roboto, …`) for everything, system mono for addresses,
amounts, ids and request bodies. Weights 400 and 600. Six sizes:

| Token | Size | Use |
| --- | --- | --- |
| `--text-display` | 32px | The page h1: "Crowdsourced research on any project or protocol." on Home, the subject's name (or id) on Overview |
| `--text-title` | 22px | Tab titles, "Summary" |
| `--text-heading` | 17px | Card headings, "Key facts" |
| `--text-body` | 16px | Body, buttons, rows, summary paragraphs (line height 1.6, at most 68ch) |
| `--text-nav` | 14px | The five tabs below 512px wide; the lookup hint below 640px |
| `--text-small` | 13px | Meta lines, infobox rows, kind markers, notes |

No tracked capitals, no eyebrows above headings.

## Components

- **Header**: brand "Swarmpedia" (a link to Home) with a small outlined "beta" tag (`.brand-beta`), the "How it works"
  link and the wallet's Connect control. The row (`.top-row`) has the page's own `--page-max` and `--page-pad`, so its
  edges line up with the content below. At 30rem and below it is two rows: the name and the wallet control, then How
  it works, also with a connected wallet, so nothing scrolls sideways at 320 to 480.
- **Chip outline** (`.acct-chip.acct-chip-ghost`, `ChipOutline` in `src/walletLazy.tsx`): while a remembered wallet
  reconnects on page load, the header shows the chip's shape in place of Connect: the same 44px pill, at least
  8.5rem wide, a grey dot (`--color-border`) and a 0.6rem rounded bar in `--color-bg-hover` where the name goes. It
  is `role="status"` and says "Reconnecting your wallet…" to screen readers. It has no animation.
- **Account chip** (`.acct-chip`, connected only): a 44px pill (the Connect button's height) with a green 8px dot,
  the ENS name or the short `0x1234…abcd` address (mono, ellipsis past 14rem) and a small chevron. It opens a
  disclosure (`.acct-menu`, white, 1px border, 10px radius, `--shadow-menu`) under its right edge with "Copy
  address" (then "Copied" for 1.5s) and "Disconnect", 40px rows. Escape closes it and returns focus to the chip;
  a click outside or focus leaving closes it. The header itself never shows "Disconnect". On another chain the chip
  and its menu stay, with the primary "Switch to Ethereum" (`.btn-switch`, 13px text below 416px) beside it in
  `.acct-wrap`; only then may the header row wrap (`.top-row:has(.acct-wrap)`), putting both at its right edge on a
  second line where they do not fit beside the name.
- **Numbers** (`src/numbers.ts`): every number in Key facts values, summary sentences and line text shows with
  thousands separators, at most 2 decimals, and at most 4 significant digits below 1 ("59822.623566003452582778
  imdUSD" shows "59,822.62 imdUSD"; "2000 tokens" shows "2,000 tokens"). Addresses, hashes, hyphen-joined ids
  (UUIDs), numbers after "block", "id", "chain" or "#" (also after a colon: "Block: 26445600"), versions, dates,
  and years where a date is meant ("in 2024", "March 2024", "(2021)") are left as written. The facts table shows a
  block number as supplied. The exact value stays in the line's details ("Exact value" / "Exact text") and in the
  facts table cell's `title`.
- **Home lookup** (`#/`, first screen): h1 "Crowdsourced research on any project or protocol.", one lead line, and a
  56px bar: an input with the hint "A project's website or a contract address" (16px) on a grey fill, a primary "Look
  it up" button and the text link "or see an example" beside it. A lookup with no match waits while Ethereum is read
  ("Reading newer blocks from Ethereum…"); the offer then holds the price, a chain picker for an address, "Research to
  start from" (a mono text area) and "Add this project".
- **Home example** (`.example`): one fact shown as a Claim, a Statement and a Proof, three `.label-card`s in one row
  from 44rem and stacked below, each with its badge, in its own colours, then "From the page of <project>" when the
  three lines come from one record (`src/example.ts`); fixed text otherwise. Under "Projects" one line of totals
  (`.totals-line`), "Reading project totals…" until every count is read.
- **Home list**: All and Needs a rebuild filter buttons, the count line and the subject list. Each subject is a row with
  a top rule: its name as a 17px link with the id in small mono beside it, the one_line or the first page's status, then
  the counts with their coloured dots, "Changed <date>" and any pending requests.
- **Subject tabs**: links `#/s/<id>/overview`, `/record`, `/sources`, `/activity`, `/contribute` with
  `aria-current="page"` and a 2px accent underline on the active one; old links open imd.fun. After a link the
  tab's heading or the target takes focus.
- **Overview**: h1 name (the subject id until a page names it; headings and paragraphs use
  `overflow-wrap: anywhere`, so a `1:0x…` id or a long domain wraps inside the column), `one_line` as the lead,
  a note only when a newer source disputes parts no applied fix covers ("A newer source disputes…"), then `.overview`, one column at every width: the **Summary**
  (`.summary-col`, at most `--read-max` 760px wide), then **Key facts** (`.keyfacts`, a direct child of `.overview`) at the full content width,
  then **Related** chips. Key facts is a bordered box with a table, one row per fact: label, value (linked when it
  has a url; addresses mono, shortened, with a Copy button) and badge; the first 8 rows, then a "Show all N" text
  button (`.kf-more`). A row with `values` lists its entries (`.kf-items`, `.kf-tokens`; flex rows that wrap): the
  name in bold, its text, then the link or the shortened address (`.tok-addr`, nowrap) with Copy and an explorer
  link, visible without opening the row; Supply reads "UNI: 1 billion" and a badge pill ("Proven on chain", "Stated by …", "Reported
  by …", worked out only from the kinds of the row's lines; on the Website and Official accounts rows also the
  channel's "Own domain" (blue) / "Linked from own site" (blue, `.badge-linked`) / "Verified on chain" (green) / "Not
  verified" (grey)); a badge opens the lines
  in Record. An Official accounts row lists its accounts (`.kf-accounts`, 4px gap) in the same layout as every
  values entry: the account's short name in bold, its text, then its link; when the accounts carry different labels
  each item also has its own label pill. An entry whose text is a list shows every string, joined with commas. Badges wrap inside their cell (`max-width: 100%`,
  `overflow-wrap: anywhere`), so a long publisher name never widens the page. Without `infobox`, at most four
  rows: Website, Main contract, token symbol, token supply. The **summary** is in short paragraphs with one 9px dot per kind after each sentence (24px round
  target). A sentence and its marks (dots, dispute dot, pencil) sit in one `.sent-group` (`white-space: nowrap`, the
  sentence itself `normal`) joined by a U+2060 word joiner, so a dot never wraps away from its sentence's last word
  to lead the next line. Each sentence is a `.sent` span (tabindex 0): hover tints it violet-50, a click or Enter opens the change
  panel under its paragraph, and an open one keeps the tint with a 2px violet underline. A kept rewording's dots
  are the lines its own changes result lists (`items[].lines`). Directly under the summary one 13px line keys the
  dots (`.dot-key`, flex, wraps between its items, each item nowrap): green dot "proven on chain", blue dot "the
  project says", orange dot "others say", then "Summary written from the record by a research job." Below
  Key facts, one small quiet block
  (`.ov-foot`, no card, no border box; a 1px top rule and 16px above it; 13px secondary text): "Something wrong or
  missing? Use the pencil on any row, click a sentence, or say it in your own words." The link opens the open form
  on Contribute (`#/s/<subject>/suggest-changes`). No buttons and no negative margins, so nothing overlaps it. With no
  page and once the chain shows no finished page job, the footer is the one link "Create the page"; while the chain
  or the files are read it is empty, and with a finished page job that could not be read it is "See why in
  Activity". With no page, a "No page yet" card; when the research said `found: false`, a "Not a project
  record" card with the job's notes and a link to Activity instead. There is no panel box on Overview.
- **Record**: the accounting warning (orange left rule on orange-50), a closed `details` "Dropped in the last
  rebuild", the kind filter (All, Proof, Statement, Claim with counts; pressed state is dark fill), then one card
  per section. "On chain" starts with the **facts table** (name, value with unit, chain and block). Each line row
  has a chevron, the sentence, a kind marker and the speaker, its sources by site name, and under it "Confirmed by:
  …" in green or "Contradicted by: …" in red, linking the line or panel answer. Then "Other channels" (channels
  not in key facts, with their labels), "Not known yet", and **Panel answers** always last (also with no page):
  each answer's title, a true/false pill, "panel, N of M agreed", its kind marker and a link to the request.
- **Sources**: channels with their label (Own domain, Linked from own site, Verified on chain, Not verified) and a key saying what each
  means, then one numbered source list.
- **Activity**: one card per request of the subject, newest first: state pill, time, what it was (Page rebuild,
  Sources, Edit, Question; a finished changes job reads "Updated the page: 3 added, 1 not added" and lists each change
  as "Added" or "Not added" with the job's reason under it), the label "Shown now" or "Folded into the page shown",
  refusal reasons, "Not a project record: … Its notes: …" for a `found: false` result,
  panel answers, per-source outcomes, edit verdict pills with "Backed by" links, and links to the job and result
  file.
- **Pencil** (`.pencil`): a 16px pencil icon in a 32px button (40px on touch) at the right end of every Record
  line, facts-table row and Key facts row, label "Suggest a change". Opacity 0 until the row is hovered or holds
  focus; on touch screens always at 0.74 (secondary grey stroke, about 3:1 on white).
- **Change panel** (`.cpanel`): white box, 1px border, 10px radius, under the row or sentence. It is exactly as
  wide as its column (`width: 100%`, `max-width: 100%`, `min-width: 0`, one `minmax(0, 1fr)` track,
  `overflow-wrap: anywhere`; in the summary also at most 68ch) and never widens the page. At the top, **"This
  rests on"** (`.ev`): a bordered stacked list (`.ev-list`, 8px radius, 1px rules between rows), one supporting
  line per row with its marker (Proven green, Statement blue, Claim orange, Contradicted red; dot and word) and
  who said it in 13px grey, and the line's text in 13px clamped to two lines; each row is a link that opens that
  line in Record. At most 4 rows, then an "and N more" link that opens them all. On a Key facts row each row shows
  the line's whole quote (`.ev-quote-full`, never clamped, wrapping anywhere), or in grey italics "No quote: this
  line is a re-runnable check." (a proof) / "No quote given." before its text; on a Record line a grey-50 block (`.ev-own`) shows that line's own marker, speaker and quote.
  Opening a panel scrolls only as needed to show it between the sticky header and the tray bar; when it is taller
  than that room, its heading and "This rests on" start 8px under the header (`revealPanel`). The quick choices are tiles (`.opt`, 44px, bold word and one short hint line, checked = 1px inset dark ring, no
  radio circle; the grid's minimum is `min(9.5rem, 100%)`): This is wrong, Add context, Back this up on every
  target, and Reword it on a summary sentence. None is required; with none picked the change is a note. Above
  them "About: <text>" names the item. Then the note (a count of 1,000; 4 rows in the pencil's form so the whole
  placeholder shows at 390, 5 on Contribute), the Sources box (one link per line), and "Add to my changes" (dark
  `btn-ink`) and "Cancel". "Your wording is added if those lines, or a link you add, support it." appears only under
  Reword it. "Add to my changes" is natively disabled until there is a note or a link ("Write what is wrong or
  missing, or add a link."), Back this up needs a usable link, and Reword it waits until the new sentence differs
  from the current one; the reason is in 13px text under the buttons (`aria-describedby`). Closing it returns focus
  to the pencil, sentence, Edit or add button that opened it. A row with a pending change shows the violet pill "In your changes" and Edit.
- **Tray** (`.tray`): fixed to the bottom of every tab while a change is pending, gray-900 with white text:
  "N changes", "X with a source, Y without · room for about Z more · <price>" in 13px gray-200, and a white
  "Review and submit" button. The price is read when the tray appears, when Review opens and every 30 seconds;
  a failed read shows "Price unavailable" and Retry. `main` gets 9rem bottom padding so nothing hides under it.
- **Review** (wide sheet): one compact block per change, 12px padding, 1px rules between: a small coloured
  tag for its type (`.ctag`, 13px, pill) and, when it has no link, an amber "No source" tag beside it; the text it
  is about in 13px secondary grey clamped to two lines (full text in `title`; not shown for a rewording); then the
  note. A rewording shows only the new sentence, with the words that differ from the old one in bold (word LCS, `wordDiff`). Links in 13px mono,
  then "Add a link" (or "Edit links") next to "Remove". A change put back from Activity opens its link editor with
  the old links. Opening the link editor focuses its box; saving or cancelling returns focus to its button. A change whose row a rebuild removed, or whose file does not fit, shows an alert and holds Submit.
  Above the total, once and only when some change has no link, the orange note "N of your changes have no source.
  They only reach the page if the swarm finds one." The footer is one row at every width (`.review-foot`, a grid of
  three tracks `minmax(0, auto) minmax(0, 1fr) auto`, 16px gaps): the price in normal-weight body text ("0.5 IMD
  for all 3"), "Read the full request", an underlined link (`#review-body`) that shows and focuses the request in
  place, and the primary "Submit" at the right. A change Activity put back whose cited lines are all gone is held
  with the "choose the row again" alert.
- **Contribute**: a `.stack` of the open form card (`.note-card`): an `h2` "What's wrong or missing?", the 1,000
  character text area, "Sources" with its hint, "Add to my changes", and the three numbered lines (`.note-steps`);
  the open form's draft is kept above the tabs, so switching tabs does not lose it. Then one 13px line on payment,
  then **Page upkeep** (`details.upkeep`, closed by default, 1px top rule, 44px summary in the accent colour with a
  7px chevron drawn by `::before` that turns 90 degrees when open; "Read the objective" inside uses the same
  chevron). Inside, the rebuild card: the older-instructions line with its Rebuild link (opens the rebuild dialog),
  "Rebuild the page" (or "Create the page" only once the chain shows no page job), "It is given N earlier files and
  M panel answers", and the objective under "Read the objective". While the record is read the card says only
  "Reading the record from Ethereum…"; a subject with finished page jobs but no readable page shows "The page could
  not be loaded. Try again." Panel checks are hidden for now (`PANEL_CHECKS = false`). Every action opens the same
  pay dialog with amount, Intake, action id and the full body before any wallet prompt.
- **Dialog**: bottom sheet on phones, centred from 640px; Escape and the × close it. Escape goes to the top
  modal only: with the wallet sheet open over the pay dialog, one Escape closes the sheet and focus returns to the
  dialog's Connect button. While a dialog or the
  wallet sheet is open, everything else in the app (skip link, header, main) is inert, Tab and Shift+Tab cycle
  inside it (a wallet sheet opened over the pay dialog holds focus until it closes), and closing returns focus to
  the control that opened it (`src/modal.ts`). The pay dialog opens only once the exact price
  is read, so its Price is always an amount; a price that differs from the one the page showed says so above Pay. After
  an approval the price is read again, and a new one returns to review with its own Pay button. "Retry price" shows
  when a later read fails, and Pay is disabled until one succeeds. It closes when the wallet has signed.
- **Send bar** (`.send-bar`): a fixed dark bar, at most 36rem: "Sent to the swarm." and one link, "View the transaction"
  until IMD has assigned the job, then "Follow the job" (`sentLink` in `src/App.tsx`), with a dismiss button. With changes waiting it sits above the tray
  (`--tray-h`, the tray's measured height), never over "Review and submit".
- **Source names** (`.srcs`, `.src-pages`): under a line, each site once as 13px links to the page read; several pages of
  one site are a dotted-underlined disclosure, "api.imd.fun, 4 pages". The line's details list every page
  (`.src-groups`, `.src-list`), long hashes shortened. No numbers and no chips.
- **Re-run steps** (`.rerun`): a 13px mono `pre` that wraps, 1px border, 10px radius on `--color-bg-subtle`, focusable,
  with a Copy button under it. Also used for the proof inside a settled line's details.
- **Amounts** (`src/amounts.ts`): a proof's base-unit amount reads in whole tokens with its unit ("0.5 IMD") in the facts
  table and Earlier readings; the grouped integer is only under Exact value.

- **Toast** (`.toast`, `src/App.tsx`): a fixed notice over the bottom edge, inset `--space-4` (and the safe area)
  from the sides and bottom, at most 36rem wide, `--radius-control`, `--shadow-sheet`, small text. Dark
  (`--gray-900` on `--gray-0`, `role="status"`) while the site reads the price and checks the request (its instruction file, and Ethereum for a first page); `.toast-error`
  (`--red-800` on `--red-50` with a 1px `--red-800` border, `role="alert"`) saying why no dialog opened, with 44px
  "Try again" and Close buttons. Its text wraps (`overflow-wrap: anywhere`), so it fits at 320.
- **Size note** (`.warn`, orange-800, small, 600): in an Activity row, "This result is too large to show in full: N
  lines" under the line count.
- **Patched row or sentence**: a Key facts row a change patched keeps its normal badge; its details start with
  "Updated by a change from <payer>" and "Earlier value: …". A patched summary sentence carries a small "updated by
  a change from <payer>" (`.reworded small`), and its open details give the earlier text (`.sentence-updated`).

## Responsive behaviour

- Content column at most 60rem (960px), 16px side padding (or the safe-area inset when larger), shared by the
  header row and `main`. Long ids wrap inside it at 320 and 390 wide. `main` and the single-column grids
  (`.tab`, `.overview`, `.summary`, `.lines`, `.row`, `.details`, Review's blocks) use one `minmax(0, 1fr)`
  track, so no content (a change panel, a long URL) can widen the page.
- Overview at every width: `.overview` is one `minmax(0, 1fr)` track with a 24px gap: Summary (its text column at
  most 760px), then Key facts at the full 960px content width, then Related. There is no side column at any width,
  so a long Key facts table never leaves an empty area under the summary. See Key facts below for its phone layout.
- The change panel's choice tiles: as many 9.5rem columns as fit, one per row below about 20rem of panel width;
  below 384px the panel's padding drops to 12px.
- Review's footer stays one row (price, Read the full request, Submit). Below 480px the price and the link share
  two equal tracks (13px, 8px gaps), each wrapping by words inside its own track; Submit keeps its width at the
  right (measured: 57px tall at 390, 76px at 320).
- Home: one column at every width: the lookup, the example, the totals and list, then How it works.
- The subject tab bar wraps instead of scrolling: below 512px the tabs use 14px and spread across the width;
  every tab keeps its full label and a 44px target.
- Key facts: from 641px one table row per fact: an 11rem label column, the value, a 16rem badge column and a 2.5rem
  pencil. From 481 to 640px the same row with 30% and 24% columns. At 480px (30rem) and below each row is a grid: the
  label (never narrower than its longest word), the badge and the pencil on the first line, the value at 16px across
  the full width under them. An address keeps its copy button beside it and its chain tag takes the next line
  (`.addr` is a column), so no control meets a badge at 320. Explicit table roles keep the table's semantics. Main
  contract starts with a name (`.kf-main-name`), a Contracts row whose entries share a chain says "All on Ethereum"
  once (`.kf-shared`), and Supply shows one entry per line.
- Below 640px the facts table becomes stacked rows. Contribute's cards are always one full-width column.
- What to check: one column of equal buttons below 640px (40rem), three equal columns from 640px, so the longest
  label ("A contract returns") fits on one line inside its button.
- Home lookup: from 641px the input, the button and the example link share one row. At 640px and below the input takes
  the first row (hint 14px, 13px below 368px) so the whole hint shows at 320 and 390, and the button and the link share
  the second. An opened line's facts (`.details .facts`) are one column at 480px and below.
- The tray wraps its text above the button on narrow screens and respects the bottom safe area.
- Controls are at least 44px tall, except the pencil (32px with a pointer, 40px on touch), filter buttons (40px), the Edit button (36px), the Copy button and
  badges (24px) and the summary dots (24px targets).
- Reduced motion turns off the button press scale and the chevron rotation transition.

## Revision 17 additions (from src/styles.css, end of file)

- **Header link** `.top-link`: "How it works", `--text-nav` (14px), secondary text colour, 44px tall, never wraps; `aria-current="page"` on #/docs turns it to the body text colour.
- **Wallet menu** `.acct-menu`: Profile (a link to `#/w/<address>`) then Disconnect; both rows are 40px tall, body size, hover `--color-bg-hover`.
- **Copy icon** `.copy-icon`: 28px square (36px on coarse pointers), no border, secondary colour, an inline 14px SVG; the accessible name says what it copies ("Copy address 0x…"). Used beside token addresses and on the profile address. The text `.copy` button stays for "Copy citation".
- **Token line** `.tok-line`: flex row with wrap only between parts: `.tok-symbol` bold and nowrap, `.tok-purpose` secondary colour and the only part that wraps inside itself, `.tok-addr` keeps the linked short address and its copy icon together (nowrap), `.tok-chain` a small grey pill (`--text-small`, `--color-bg-hover` background, 999px radius). When every token names the same chain the pill is shown once after the list (`.tok-chain-row`).
- **Cited line** `.cited`: a card with a 3px accent left border above the Record when it is opened by `#/s/<subject>/l/<job id>:<line id>`; status word coloured green (confirmed), red (contradicted) or amber (superseded). The addressed row (`.row.is-addressed`, `tr.is-addressed`) gets `--color-accent-subtle` and a 3px inset accent bar.
- **How it works** `.docs`: the site's full content width (`.docs.tab { max-width: none }`). Below 1000px the menu is a wrapping row of links above the text; from 1000px `.doc-layout` is two columns, a 200px sticky menu and a text column up to 720px, 56px apart. Sections are `h2` at `--text-title`; the three kind badges reuse `.kind`; the build diagram `.doc-flow` is a wrapping row of bordered boxes joined by "→", so it stacks on phones.
- **Profile** `.profile`: address line (short address, copy icon, Etherscan link), then `.totals`, an auto-fit grid of four bordered cells (min 140px, so 2×2 at 390 and one row at desktop) with the value at `--text-title` weight 600, then the request list reusing the Activity `.card.act` rows.
- The type scale is unchanged: six sizes (`--text-display`, `--text-title`, `--text-heading`, `--text-body`, `--text-nav`, `--text-small`).

## Revision 22 additions (from src/styles.css, end of file)

- **Key facts on phones** (below 40rem): `.kf-tokens`, `.kf-items` and `.kf-values` are one `minmax(0, 1fr)` column,
  their items `min-width: 0`; `.addr` wraps and the short address with its copy button (`.addr-main`) never breaks. At
  30rem and below the row grid above applies.
- **Tokens on several chains**: home address and chain tag first, then `.tok-also` ("also on" in 13px secondary)
  with each other chain's short address, copy icon, its own chain tag and its own explorer (Polygon PoS:
  polygonscan.com; a chain the text does not name gets no tag and a Blockscan link).
- **Disclosure chevron**: `.upkeep > summary` and `.upkeep details > summary` are flex rows (8px gap) in
  `--color-accent-solid` with a 7px two-border chevron (`::before`) pointing right, turned down on `[open]`;
  the transition is off under reduced motion; the WebKit marker is hidden.

## Revision 29 additions

- **Rows before details** (`src/Home.tsx`, `src/useActivity.ts`): a row appears as soon as the scan lists its project. Its
  date reads "Reading when it changed…" until the block time arrives; the totals line starts with "About" meanwhile.
- **Awaiting figure** (`.row-figure`): "Count awaiting update" or "Launch date awaiting update", same size and colour as
  any sort figure, on rows placed after the known ones.
- **Lookup not settled** (`.offer` with `.unsure-links`): the offer's panel with one sentence, a wrapping row of project
  links (each 44px tall, up to 8, then "and N more in the list below") and a plain button "None of these: add it".
- **Key facts order** (`liveRowsFirst` in `src/keyfacts.ts`): rows with a live entry, then rows with only test entries,
  then only past ones, before the eight-row limit. Every row type draws from `shownEntries`, so each test or past entry
  has its `.live-tag`.

## Revision 30: layout (from `src/styles.css` lines 1046–1135)

- **Save star** `.save-star`: icon only, a 44×44px target, `aria-label="Save"`, secondary text colour, amber-800 when on,
  hover background `--color-bg-hover`. On a Home row it ends the name line (`.subject-head`, flex, space-between) with
  -10px block margins, so it adds no height; on a project page it ends the title line (`.title-row`, `margin-inline-start: auto`).
- **Home list bar** `.list-bar`: "Find a project" and "Sort by" (`.list-tools`, 44px fields, placeholders, labels
  `.sr-only`) and the filter buttons. Stacked below 60rem (one column under 480px); from 60rem one flex row, 12px gaps.
- **Example cards** `a.label-card`: each card is a link to the example project's page; no caption, no logo. On the docs
  page `.doc-example .label-cards` spans the text column, `repeat(auto-fit, minmax(200px, 1fr))`, labels `nowrap`.
- **Docs spacing**: 40px from the two buttons to the columns (`.docs .doc-layout`), 48px between sections
  (`.doc-sec`, 24px after a group title), 16px from a heading to its text. A section is a grid (the global
  `section` rule); its `row-gap: 16px` is that space, so the `h2` has no margin and the element after it no top margin.
  Menu links `.doc-toc a`: `--text-nav` (14px), secondary grey, no underline; the section in view has
  `aria-current` and the accent colour, weight 600.
- **Dark bars** (`.tray`, `.send-bar`): white (`--gray-0`) text only on the dark ground, body size, secondary text
  and links at `--text-nav` (14px). The tray reads "1 change · 0.5 IMD" and its button; the source counts and room
  left are in the review dialog (`.review-meta`).
- **Heading focus**: a page's h1 (or a tab's h2) takes focus with `tabindex="-1"`; no outline, except a 2px
  `--color-focus` outline when the visitor is using the keyboard (`html.kbd`, set in `src/main.tsx`).
- **Open questions** on Contribute (`.contrib-questions`): an "Open questions (N)" toggle (`.q-toggle`, 44px, a
  chevron that turns 90°, no motion under reduced motion), closed by default; each question once, its raw line
  references removed (`cleanQuestion`, which drops bracketed lists of L, A, Q and S references), and "Answer this".
- **Dates**: every moment (block time, job time, "Added" on Home) in the visitor's time zone, date and time from one
  clock (`src/dates.ts`); a Launched fact is a calendar date and is shown as written.


## Revision 32: layout (from the final source)

Tokens, type scale and colours are unchanged; every new rule uses the existing variables (`--space-*`, `--text-small`/`--text-body`, `--color-*`, `--radius-card`).

- **Header** (`src/SiteMenu.tsx`, `src/styles.css:1207`). From 768 px: name, search field, "How it works", "Contributors", Connect in one row. Below 768 px (`max-width: 47.99rem`): one row, no wrapping: name, search icon (44 px), Connect, menu button (44 px, `.site-menu-toggle`). The menu panel (`.site-menu-panel`) is a 12rem card under the button, right-aligned, links 44 px tall at body size; the current page's link is semibold.
- **Home search** (`src/Home.tsx:632`). Label `sr-only`. Placeholder: full text from 480 px, "Search, or enter a website" below (`useMedia("(max-width: 29.99rem)")`).
- **Related row** (`src/styles.css:305`). Flex row: text (name semibold, relation secondary) then `.rel-add`, a 44 x 44 round target with a 16 px "+" in the accent colour, pulled 12 px into the gutter so the glyph aligns with the row's end. Tooltip `.rel-tip` (`:308`): ink background, white small text, 6 px radius, above the button, shown on `:hover` and `:focus-visible`, 120 ms fade (none with reduced motion). The last row has no bottom rule.
- **About this page** (`src/styles.css:1224`). 40 px margin plus the tab's 16 px gap: 56 px from Related to its single top divider, then 24 px to the heading. Under the heading a small secondary line: "Last built …" and, when needed, "Built with older instructions Rebuild". Two columns from 60rem (2fr / 1fr): "Page contributors" table (Name, Notes added, Questions answered) and "Funded by" (an unindented list, `:1231`).
- **Sources channels** (`src/styles.css:492`). The four explanations as a four-line small list, the statement/claim legend under it, then four `<details>` groups, each with a top rule, a 44 px summary (rotating chevron, semibold body-size title, count in secondary tabular numerals). Not verified starts closed. Empty groups say "None.".
- **Activity fold** (`src/styles.css:537`). A full-width 44 px button with a dashed border and card radius: chevron, "N earlier rebuilds", and "Folded into the page shown" in small secondary text. Opened, the rebuilds follow in a list indented 16 px behind a 2 px rule.
- **Record section headers**: counts list only the kinds above zero.

## Revision 33: the first screenshot (from `src/styles.css` after `.summary-col .prose`, `src/Record.tsx` `FirstShot`)

- **Component.** `figure.shot` is the first child of `.summary-col`, above the Summary. It is drawn only when the page
  job listed a screenshot and its PNG passed the checks (`LatestShot` reads it after the page shows; while it is read the
  same figure is drawn with its frame and caption and no image, `aria-busy="true"`, so nothing below it moves when it
  arrives; revision 35). It holds a `div.shot-frame`, which contains an
  `img` (`width` and `height` from the PNG header, alt "<name>: <caption>")
  and a `figcaption.small`: the caption, a middle dot and a link to the captured host (www. dropped), opening in a new tab.
- **Tokens used, none added.** Border `1px solid var(--color-border)`, radius `var(--radius-control)` (10px), placeholder
  background `var(--color-bg-subtle)`, gap `var(--space-2)` (8px). The caption uses `--text-small` (13px) in
  `--color-text-secondary`; the link inherits that colour and keeps its underline.
- **Responsive (revision 35).** `.shot-frame` is `position: relative; box-sizing: border-box; width: 100%;
  aspect-ratio: 16 / 9; max-height: 480px; overflow: hidden` with the border, radius and subtle background, so its
  height comes from the reading column's width alone (at most 760 × 427.5 px; 16:9 of 288 px at 320 and of 358 px at
  390). The image is `position: absolute; inset: 0; width: 100%; height: 100%; object-fit: contain`: the whole PNG is
  fitted inside, never cropped or squeezed. A 1280 × 720 capture fills the frame; a tall one shows whole, centred, and
  the frame's subtle background shows on its sides. Its size cannot change the layout, loaded or not. These figures
  come from the CSS. None was rendered in revision 35, because no browser could launch here.
- No other visual change. category, app, explained and ask are parsed but not drawn until the next job.
