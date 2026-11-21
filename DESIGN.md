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
| `--page-max` / `--page-pad` | 60rem / `max(16px, safe-area insets)` | The one content column: the header row and `main` both use it, so the brand sits at the content's left edge and the wallet at its right edge at every width |
| Change tags (`.ctag-*`) | wrong red-800 on red-50; context and links blue-800 on blue-50; backing green-800 on green-50; reword and new line violet-800 on violet-50; "No source" orange-800 on orange-50 | Review's type tag and the amber "No source" tag |

## Typography

System sans (`system-ui, -apple-system, "Segoe UI", Roboto, …`) for everything, system mono for addresses,
amounts, ids and request bodies. Weights 400 and 600. Six sizes:

| Token | Size | Use |
| --- | --- | --- |
| `--text-display` | 32px | The page h1: "Projects, on the record" on Home, the subject's name (or id) on Overview |
| `--text-title` | 22px | Tab titles, "Summary" |
| `--text-heading` | 17px | Card headings, "Key facts" |
| `--text-body` | 16px | Body, buttons, rows, summary paragraphs (line height 1.6, at most 68ch) |
| `--text-nav` | 14px | The five tabs below 512px wide; the lookup hint and its button label below 368px |
| `--text-small` | 13px | Meta lines, infobox rows, kind markers, notes |

No tracked capitals, no eyebrows above headings.

## Components

- **Header**: brand "On the record (test)" (a link to Home) and the wallet's Connect control on one row. The row
  (`.top-row`) has the page's own `--page-max` and `--page-pad`, so its edges line up with the content below.
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
- **Home lookup** (`#/`, first screen): h1 "Look up any crypto project.", one lead line, and a 56px bar: an input
  with the hint "A domain or a 0x address" on a grey fill and a primary "Look it up" button. How it works has
  three steps; the first is "Contribute: add a project or suggest changes to its record."
- **Home list**: the search row (a search input and, below
  832px, an "Add a project" primary button that scrolls to and focuses the form), the count line and the subject
  list. Each subject is a row with a top rule: its name as a 17px link with the id in small mono beside it, the
  one_line (or "No page yet: …"), then the kind counts with their 9px coloured dots, "Changed <date>" and any
  pending requests. A subject whose only research came back `found: false` is not listed. While the chain read
  fails the list area shows only the error and "Try again"; "No projects yet" appears only after a good empty read.
- **Add a project**: a card with Website domain, Main contract address (optional, mono) and "Chain of that
  contract" (six named chains plus **Other chain ID**, which reveals a numeric mono "Chain ID" field). Errors
  sit under their field in red and the first wrong field takes focus. A small line shows the page it will make
  (`#/s/<id>`), then "Review the first rebuild" (primary) and the price. A failed chain read or an unread
  earlier result shows a red alert line instead of opening the dialog.
- **Subject tabs**: links `#/s/<id>/overview`, `/record`, `/sources`, `/activity`, `/contribute` with
  `aria-current="page"` and a 2px accent underline on the active one; old links open imd.fun. After a link the
  tab's heading or the target takes focus.
- **Overview**: h1 name (the subject id until a page names it; headings and paragraphs use
  `overflow-wrap: anywhere`, so a `1:0x…` id or a long domain wraps inside the column), `one_line` as the lead,
  then **Key facts** full width: a bordered box with a table of label, value (linked when it has a url;
  addresses mono, shortened, with a Copy button) and a badge pill ("Proven on chain", "Stated by …", "Reported
  by …", worked out only from the kinds of the row's lines; on the Website and Official accounts rows also the
  channel's "Own domain" (blue) / "Linked from own site" (blue, `.badge-linked`) / "Verified on chain" (green) / "Not
  verified" (grey)); a badge opens the lines
  in Record. An Official accounts row listing several accounts shows them as a list (`.kf-accounts`, 4px gap),
  each name linked to its channel with its own label pill. Badges wrap inside their cell (`max-width: 100%`,
  `overflow-wrap: anywhere`), so a long publisher name never widens the page. Without `infobox`, at most four
  rows: Website, Main contract, token symbol, token supply. Then the **summary** in short paragraphs with one 9px dot per kind after each sentence (24px round
  target). Each sentence is a `.sent` span (tabindex 0): hover tints it violet-50, a click or Enter opens the change
  panel under its paragraph, and an open one keeps the tint with a 2px violet underline. A kept rewording's dots
  are the lines its own changes result lists (`items[].lines`). Under the summary one small quiet block
  (`.ov-foot`, no card, no border box; a 1px top rule and 16px above it; 13px secondary text): "Something wrong or
  missing? Hover any row or click a sentence to suggest a change." and, on the next line, four 13px underlined text
  links of one style (`.foot-links`, 32px tall, 16px apart), all four real links: "Add a missing line"
  (`#/s/<subject>/add-line`) and "Add links to read" (`…/add-links`) open their panel under the block in place,
  and the same address opened in a new tab opens the page with that panel; "Ask a panel to check a fact" and
  "Rebuild the page". No buttons and no negative margins, so nothing overlaps it. With no page, a "No page yet" card; when the research said `found: false`, a "Not a project
  record" card with the job's notes and a link to Activity instead. There is no panel box on Overview.
- **Record**: the accounting warning (orange left rule on orange-50), a closed `details` "Dropped in the last
  rebuild", the kind filter (All, Proof, Statement, Claim with counts; pressed state is dark fill), then one card
  per section. "On chain" starts with the **facts table** (name, value with unit, chain and block). Each line row
  has a chevron, the sentence, a kind marker and the speaker, source number chips, and under it "Confirmed by:
  …" in green or "Contradicted by: …" in red, linking the line or panel answer. Then "Other channels" (channels
  not in key facts, with their labels), "Not known yet", and **Panel answers** always last (also with no page):
  each answer's title, a true/false pill, "panel, N of M agreed", its kind marker and a link to the request.
- **Sources**: channels with their label (Own domain, Linked from own site, Verified on chain, Not verified) and a key saying what each
  means, then one numbered source list.
- **Activity**: one card per request of the subject, newest first: state pill, time, what it was (Page rebuild,
  Sources, Edit, Question), the label "Shown now", "Folded into the page shown" or "Not yet folded in: included
  in the next rebuild", refusal reasons, "Not a project record: … Its notes: …" for a `found: false` result,
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
  than that room, its heading and "This rests on" start 8px under the header (`revealPanel`). "Ask a panel to
  check it" is a tile-styled button (`.opt-action`) beside the radios, not one of them, so arrow keys stay in the form.
  Then the choices as tiles (`.opt`, 44px, bold word and one short hint line, checked = 1px inset dark ring, no
  radio circle; the grid's minimum is `min(9.5rem, 100%)`, so one tile per row on the narrowest phones), the note
  (count of 300, "at least 10" while short), the links box (3, or 20 for Add links to read), the orange no-source
  note while there is no link, and "Add to my changes" (dark `btn-ink`) and "Cancel". "Your wording is kept if
  those lines, or a link you add, support it." appears only under Reword it. "Add to my changes" is natively
  disabled until the note has 10 characters (Back this up and Add links to read need a usable link instead) and,
  for Reword it, until the new sentence differs from the current one; the reason is in 13px text under the
  buttons (`aria-describedby`). Closing it returns focus to the pencil, sentence, Edit
  or add button that opened it. A row with a pending change shows the violet pill "In your changes" and Edit.
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
- **Contribute**: three full-width cards in a `.stack`: Suggest changes (three numbered steps and the two add
  buttons), Ask a panel to check a fact ("What to check" as three equal 44px segment buttons, label on one line,
  selected = dark fill; the contract template's chain picker lists only chains the oracle accepts), and Rebuild the
  page last with a secondary button, "It is given N earlier files and M panel answers", and the objective under
  "Read the objective". Every action opens the same pay dialog with amount, Intake, action id and the full body
  before any wallet prompt.
- **Dialog**: bottom sheet on phones, centred from 640px; Escape and the × close it. Escape goes to the top
  modal only: with the wallet sheet open over the pay dialog, one Escape closes the sheet and focus returns to the
  dialog's Connect button. While a dialog or the
  wallet sheet is open, everything else in the app (skip link, header, main) is inert, Tab and Shift+Tab cycle
  inside it (a wallet sheet opened over the pay dialog holds focus until it closes), and closing returns focus to
  the control that opened it (`src/modal.ts`). The pay dialog's Amount reads "Reading price…", then the price, or
  "Price unavailable" with a secondary "Retry price" button beside the actions when the read fails; Pay stays
  disabled until a price is read.

- **Toast** (`.toast`, `src/App.tsx`): a fixed notice over the bottom edge, inset `--space-4` (and the safe area)
  from the sides and bottom, at most 36rem wide, `--radius-control`, `--shadow-sheet`, small text. Dark
  (`--gray-900` on `--gray-0`, `role="status"`) while the site checks a job's instruction file; `.toast-error`
  (`--red-800` on `--red-50` with a 1px `--red-800` border, `role="alert"`) with the "cannot be reached right now"
  message and a 44px Close button when it fails. Its text wraps (`overflow-wrap: anywhere`), so it fits at 320.
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
- The change panel's choice tiles: as many 9.5rem columns as fit, one per row below about 20rem of panel width;
  below 384px the panel's padding drops to 12px.
- Review's footer stays one row (price, Read the full request, Submit). Below 480px the price and the link share
  two equal tracks (13px, 8px gaps), each wrapping by words inside its own track; Submit keeps its width at the
  right (measured: 57px tall at 390, 76px at 320).
- Home: one column below 832px (list, then the Add form, with an "Add a project" button beside search on the
  first screen); from 832px the list and a 20rem Add form side by side, and the jump button is hidden.
- The subject tab bar wraps instead of scrolling: below 512px the tabs use 14px and spread across the width;
  every tab keeps its full label and a 44px target.
- Key facts: below 640px each row stacks label, value, then badge; from 640px label (11rem), value and badge
  (16rem) are three columns of a fixed-layout table, and badges wrap within the badge column.
- Below 640px the facts table becomes stacked rows. Contribute's cards are always one full-width column.
- What to check: one column of equal buttons below 640px (40rem), three equal columns from 640px, so the longest
  label ("A contract returns") fits on one line inside its button.
- Home lookup: up to 400px (25rem) both controls use 8px inline padding; up to 384px the bar takes 8px of the
  gutter on each side with a 4px gap and a 16px button label; below 368px the gap is 2px, the button padding 6px,
  and the hint and button label are 14px.
- The tray wraps its text above the button on narrow screens and respects the bottom safe area.
- Controls are at least 44px tall, except the pencil (32px with a pointer, 40px on touch), filter buttons (40px), the Edit button (36px), the Copy button and
  badges (24px) and the summary dots (24px targets).
- Reduced motion turns off the button press scale and the chevron rotation transition.
