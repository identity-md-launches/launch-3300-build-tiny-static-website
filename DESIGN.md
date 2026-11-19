# Design

Taken from `src/styles.css`, `src/App.tsx`, `src/Record.tsx` and `src/ActivityList.tsx` as built.

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
| `--text-display` | 32px | The subject's name (h1 on Overview) |
| `--text-title` | 22px | Tab titles, "Summary" |
| `--text-heading` | 17px | Card headings, "Key facts" |
| `--text-body` | 16px | Body, buttons, rows, summary paragraphs (line height 1.6, at most 68ch) |
| `--text-nav` | 14px | The five tabs below 512px wide |
| `--text-small` | 13px | Meta lines, infobox rows, kind markers, notes |

No tracked capitals, no eyebrows above headings.

## Components

- **Header**: sticky; brand and the wallet's Connect control on one row, the tab bar below. Tabs are links
  (`#overview`, `#record`, `#sources`, `#activity`, `#contribute`) with `aria-current="page"` and a 2px accent
  underline on the active one. Old links `#actions`, `#add-sources` and `#activity` open Contribute, Contribute
  (scrolled to Add sources) and Activity; `#line-…`, `#source-N` and `#panel-…` open Record, Sources and Overview
  at that item. After a link the tab's heading or the target takes focus.
- **Overview**: h1 name, `one_line` as the lead (fallback "Public sources and checks for imd.fun."), then
  Rebuild the page (primary, a link to the Contribute card `#rebuild`), Contribute and the price. With no page,
  a "No page yet" card ("Run a rebuild to publish the first record.") and, if an edit was accepted, the summary.
  The **key facts box** is a bordered `aside` with a two-column table (label in secondary 13px, value linked
  when it has an http(s) url), each row with a small "line"/"N lines" link that opens those lines in Record.
  The **summary** is short paragraphs (by the job's `paragraph`, else three sentences each); after each sentence
  one 9px dot per kind among its lines inside a 24px round target; a dot opens those lines in Record. An
  **Edit** button sits beside the "Summary" heading. The note under it reads "Written from Record by a research
  job. Not itself a checked line. Dots open supporting lines.", or "Edited by <payer>, checked by a research
  job. …" for an accepted edit. Then "Checked by a panel" and a "Help build this record" card with just its
  three links to the paid actions.
- **Record**: the accounting warning (orange left rule on orange-50, "N earlier lines are unaccounted for" and
  the list), a closed `details` "Dropped in the last rebuild" with each reference, the earlier line's text in
  quotes and the reason, the kind filter (All,
  Proof, Statement, Claim with counts; pressed state is dark fill), then one card per section. "On chain"
  starts with the one **facts table** (name, value with unit, chain and block) holding every proof line with
  `fact`; rows open in place, and a row with links has its "Confirmed by"/"Contradicted by" notes in a row of
  their own under it, shown while closed. A claim's "Checked" detail ends with who said it and where; the link
  notes say what settled it. Each line row has a chevron, the sentence, a kind marker and the speaker, its
  source number chips, and under it "Confirmed by: …" in green or "Contradicted by: …" in red, each a link to
  the linked line or panel answer. Then "Not known yet".
- **Sources**: channels with tie words and their key, then one numbered source list.
- **Activity**: one card per request, newest first: state pill, time, what it was (Page rebuild, Sources, Edit,
  Question), whether it is shown now, replaced, folded into the page shown (only when that rebuild's accounting
  covers it) or completed before the page shown, refusal reasons, panel answers, per-source outcomes, "N lines
  added to the record" or "N lines in result", and for edits every sentence with a verdict pill (supported by
  the record, supported by a new source, not supported), any corrected wording, the reason and "Backed by"
  links to the lines it cites. Links to the job and the result file.
- **Contribute**: Rebuild the page (with the filled objective under "Read the objective"; until the chain,
  the page shown, later results and panel answers are all read, the button is disabled and a status line says
  why, with a Refresh link after a failure), Confirm a fact,
  Add sources, and Suggest an edit (summary textarea prefilled with the current summary, a live
  "N of 1,500 characters" count that turns red over the limit, an optional links box under the Add sources
  rules, up to 5). Every action opens the same pay dialog, which shows amount, Intake, action id and the full
  body before any wallet prompt.
- **Dialog**: bottom sheet on phones, centred above 640px; Escape and the × close it; the page behind is inert.

## Responsive behaviour

- Content column at most 60rem (960px), 16px side padding.
- The tab bar wraps (`flex-wrap: wrap`) instead of scrolling: below 512px the tabs use 14px, 1px side padding
  and spread across the width; where the five labels do not fit (320px, or wide fallback fonts) the last tab
  moves to a second row. Every tab keeps its full label and a 44px target.
- From 832px the Overview is two columns: summary on the left, the key facts box (20rem) on the right; below
  that the key facts box sits above the summary.
- From 832px Contribute's cards are two columns.
- Below 640px the facts table becomes stacked rows (name, then value and chain and block with labels).
- Controls are at least 44px tall, except filter buttons (40px), the Edit button (36px) and the summary dots
  (24px targets).
- Reduced motion turns off the button press scale and the chevron rotation transition.
