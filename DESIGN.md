# Design

Taken from `src/styles.css`, `src/App.tsx`, `src/Home.tsx`, `src/Record.tsx` and `src/ActivityList.tsx` as built.

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

## Typography

System sans (`system-ui, -apple-system, "Segoe UI", Roboto, …`) for everything, system mono for addresses,
amounts, ids and request bodies. Weights 400 and 600. Six sizes:

| Token | Size | Use |
| --- | --- | --- |
| `--text-display` | 32px | The page h1: "Projects, on the record" on Home, the subject's name (or id) on Overview |
| `--text-title` | 22px | Tab titles, "Summary" |
| `--text-heading` | 17px | Card headings, "Key facts" |
| `--text-body` | 16px | Body, buttons, rows, summary paragraphs (line height 1.6, at most 68ch) |
| `--text-nav` | 14px | The five tabs below 512px wide |
| `--text-small` | 13px | Meta lines, infobox rows, kind markers, notes |

No tracked capitals, no eyebrows above headings.

## Components

- **Header**: brand "On the record (test)" (a link to Home) and the wallet's Connect control on one row.
- **Home** (`#/`): h1 "Projects, on the record" and one lead line, then the search row (a search input and, below
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
  channel's "Own domain" (blue) / "Verified on chain" (green) / "Not verified" (grey)); a badge opens the lines
  in Record. An Official accounts row listing several accounts shows them as a list (`.kf-accounts`, 4px gap),
  each name linked to its channel with its own label pill. Badges wrap inside their cell (`max-width: 100%`,
  `overflow-wrap: anywhere`), so a long publisher name never widens the page. Without `infobox`, at most four
  rows: Website, Main contract, token symbol, token supply. Then the **summary** in short paragraphs with one 9px dot per kind after each sentence (24px round
  target) and an Edit button beside its heading, then Rebuild the page / Create the page (primary), Contribute
  and the price. With no page, a "No page yet" card; when the research said `found: false`, a "Not a project
  record" card with the job's notes and a link to Activity instead. There is no panel box on Overview.
- **Record**: the accounting warning (orange left rule on orange-50), a closed `details` "Dropped in the last
  rebuild", the kind filter (All, Proof, Statement, Claim with counts; pressed state is dark fill), then one card
  per section. "On chain" starts with the **facts table** (name, value with unit, chain and block). Each line row
  has a chevron, the sentence, a kind marker and the speaker, source number chips, and under it "Confirmed by:
  …" in green or "Contradicted by: …" in red, linking the line or panel answer. Then "Other channels" (channels
  not in key facts, with their labels), "Not known yet", and **Panel answers** always last (also with no page):
  each answer's title, a true/false pill, "panel, N of M agreed", its kind marker and a link to the request.
- **Sources**: channels with their label (Own domain, Verified on chain, Not verified) and a key saying what each
  means, then one numbered source list.
- **Activity**: one card per request of the subject, newest first: state pill, time, what it was (Page rebuild,
  Sources, Edit, Question), the label "Shown now", "Folded into the page shown" or "Not yet folded in: included
  in the next rebuild", refusal reasons, "Not a project record: … Its notes: …" for a `found: false` result,
  panel answers, per-source outcomes, edit verdict pills with "Backed by" links, and links to the job and result
  file.
- **Contribute**: Rebuild the page (filled objective under "Read the objective", "It is given N earlier files
  and M panel answers", a left-out note past 7,500 characters; disabled with a reason until everything is read),
  Confirm a fact (three template choices as 44px radio tiles, each with its short form; the contract template's
  chain picker lists only chains the oracle accepts), Add sources and Suggest an edit. Every action opens the
  same pay dialog with amount, Intake, action id and the full body before any wallet prompt.
- **Dialog**: bottom sheet on phones, centred from 640px; Escape and the × close it. While a dialog or the
  wallet sheet is open, everything else in the app (skip link, header, main) is inert, Tab and Shift+Tab cycle
  inside it (a wallet sheet opened over the pay dialog holds focus until it closes), and closing returns focus to
  the control that opened it (`src/modal.ts`). The pay dialog's Amount reads "Reading price…", then the price, or
  "Price unavailable" with a secondary "Retry price" button beside the actions when the read fails; Pay stays
  disabled until a price is read.

## Responsive behaviour

- Content column at most 60rem (960px), 16px side padding. Long ids wrap inside it at 320 and 390 wide.
- Home: one column below 832px (list, then the Add form, with an "Add a project" button beside search on the
  first screen); from 832px the list and a 20rem Add form side by side, and the jump button is hidden.
- The subject tab bar wraps instead of scrolling: below 512px the tabs use 14px and spread across the width;
  every tab keeps its full label and a 44px target.
- Key facts: below 640px each row stacks label, value, then badge; from 640px label (11rem), value and badge
  (16rem) are three columns of a fixed-layout table, and badges wrap within the badge column.
- Below 640px the facts table becomes stacked rows. From 832px Contribute's cards are two columns.
- Controls are at least 44px tall, except filter buttons (40px), the Edit button (36px), the Copy button and
  badges (24px) and the summary dots (24px targets).
- Reduced motion turns off the button press scale and the chevron rotation transition.
