# DESIGN.md: IMD on the record

Taken from the final source: `src/styles.css` (tokens and every class), `src/Record.tsx`, `src/ActivityList.tsx`
and `src/App.tsx` (components). There is no theme config, icon set or web font; the site uses system fonts.

## Overview

A one-page public record for one subject (imd.fun), read by people checking what is known and by people paying
the IMD swarm to add to it. The look is a quiet document: white page, light grey cards, one violet accent kept
for primary buttons, and three small kind colours (Proof green, Statement blue, Claim orange). Density is high
but scannable: every record line is one compact row and its evidence opens on demand. The order on the page is
title, one-line description, actions, Summary, Channels, panel answers, filter, sections, open questions,
Sources, then Pay the swarm and Activity.

## Colors

Hex, defined once in `:root` in `src/styles.css`. Primitives (`--gray-*`, `--violet-*`, `--green-*`, `--blue-*`,
`--orange-*`, `--red-800`) feed role tokens; components use role tokens except the kind and status colours,
which use the -50/-800 pairs directly.

| Role token | Value | Use |
| --- | --- | --- |
| `--color-bg` | `--gray-0` #ffffff | Page, buttons, inputs, sheets |
| `--color-bg-subtle` | `--gray-50` #f6f7f9 | Cards, request body |
| `--color-bg-hover` | `--gray-100` #eceef2 | Hover fill, chips, neutral pills |
| `--color-border` | `--gray-200` #dde1e7 | Row dividers, control borders, quiet differs bar |
| `--color-text` | `--gray-900` #14171c | Body text; the pressed filter button's fill |
| `--color-text-secondary` | `--gray-500` #5f6673 | Meta lines, `by`, labels in details, quiet differs note |
| `--color-accent-solid` / `-hover` | `--violet-700` #5b21b6 / `--violet-800` #4c1d95 | Primary buttons only |
| `--color-focus` | `--gray-900` | 2px focus ring |
| `--color-error` | `--red-800` #a1231b | Errors, refused states, conflict bar and note |

Kind marker: `.kind-proof` `--green-800` #146c36, `.kind-statement` `--blue-800` #1e4fa8, `.kind-claim`
`--orange-800` #9a3d00, always as a dot plus the word. Ties: `.tie-strong` green-800, others secondary.
Activity outcomes: `.outcome-lines` green-800, `.outcome-closed` error, `.outcome-off` secondary.
The design probe measured all rendered text at 4.5:1 or better at 320, 390 and 1440 (see
`artifacts/validation.md`). There is no dark theme.

## Typography

- Families: `--font-sans` (system-ui stack) for everything; `--font-mono` (ui-monospace stack) for addresses,
  amounts, source numbers and line ids only.
- Weights: 400 and 600.
- Scale, five sizes: `--text-display` 2rem (h1), `--text-title` 1.375rem (section titles, empty state),
  `--text-heading` 1.0625rem (card headings h2/h3), `--text-body` 1rem (body, rows, buttons),
  `--text-small` 0.8125rem (meta, kind markers, details, table labels).
- Line height 1.5 body, 1.4 rows and inputs, 1.15 headings. `text-wrap: balance` on headings, `pretty` on
  paragraphs. Numbers in counts and the fact table use `.num` (`tabular-nums`). Letter-spacing only on h1
  (-0.02em) and section titles (-0.01em). No uppercase text.

## Layout

- Spacing tokens `--space-1..8` (4, 8, 12, 16, 24, 32px). `main` is one column, max 52rem, padding 24/16px,
  32px gap between sections; cards have 16px padding, 24px from 40rem.
- Breakpoints: 40rem (header nav shows, cards pad more, sheets centre, record rows put the kind marker on the
  right, fact table becomes a real table); 52rem (Pay the swarm cards go to two columns).
- Record row (`.row-toggle`): grid `auto | 1fr` (chevron, sentence; marker and `by` on a second line) below
  40rem, `auto | 1fr | auto` (marker and `by` on the right) above. Source numbers sit outside the button, top
  right. Details indent under the sentence.
- Fact table below 40rem: the header row is visually hidden and each row becomes a two-column grid (name across,
  then Value and Chain and block, each labelled from `data-label`).
- Long URLs and addresses wrap with `overflow-wrap: anywhere`. The probe found no horizontal scroll at 320, 390
  or 1440.

## Elevation & Depth

Flat. Cards are tone (`--color-bg-subtle`) with no border or shadow; rows are separated by 1px `--color-border`
lines. Only sheets (pay dialog, connect sheet) have `--shadow-sheet` over a 45% dark backdrop. The header is
sticky with a 94% white background and a bottom border.

## Shapes

`--radius-card` 16px (cards, sheets; sheets are square at the bottom on phones), `--radius-control` 10px
(buttons, inputs), 6px chips, 999px pills (answers, Activity states), 50% kind dots. Differs rows carry a 3px
start border: `--color-border` for "Compare", `--red-800` for "Conflicts".

## Components

| Component | Source | Notes |
| --- | --- | --- |
| Button `.btn`, `.btn-primary` | `styles.css`, used everywhere | 44px tall; primary is the one violet action per group; `scale: 0.96` on press (off under reduced motion); hover only with `(hover: hover)` |
| Filter `.filter` / `.btn-filter` | `Record.tsx` `Record` | `role="group"`, buttons with `aria-pressed`, each with its count; pressed is dark fill. Opening a line from the Summary resets it to All |
| Kind marker `KindMark` | `Record.tsx` | Coloured dot plus Proof, Statement or Claim; also in filter buttons and panel answers |
| Record row `LineRow` | `Record.tsx` | `<li>` with a `<button aria-expanded aria-controls>` holding sentence, marker and `by` (statements and claims); clicking anywhere on the row that is not a link also toggles. Closed by default. Chevron rotates 150ms (no transition under reduced motion) |
| Details `Details` | `Record.tsx` | `<dl>`: Line (table only), Quote, Re-run, Checked (with the label-rule note when a statement was shown as a claim), Added by, Links (numbered sources and the job) |
| Differs note `DiffersNote` | `Record.tsx` | "Conflicts with the line above: why" (red, bold) or "Compare with the line above: why" (secondary) above the second line |
| Fact table `FactTable` | `Record.tsx` | Name (row header with the toggle button), Value, Chain and block; an open row adds a full-width details row |
| Summary `Summary` | `Record.tsx` | Card, heading "Summary", the note, a list of sentences each ending in line-id chips that open the line |
| Source list `SourceList` | `Record.tsx` | One `<ol>`: research sources, then each source job's; `id="source-N"`; "read via host" beside the URL |
| Activity row | `ActivityList.tsx` | State pill, what, refusal text, panel answer, per-source outcome list for source jobs |
| Sheet, form fields, Add sources, Pay dialog | `App.tsx`, `wallet.tsx` | Unchanged by this job |

## Do's and Don'ts

- Do show a record line as one `LineRow`; put evidence in `Details`, not on the row.
- Do pair every kind colour with its word (`KindMark`); never colour alone.
- Do use the role tokens for new surfaces and text; add a role token rather than a raw hex.
- Do keep the violet fill for the single main action of a group.
- Don't add a sixth type size or a third weight; don't add borders or shadows to cards.
- Don't render result text as HTML; links only through `safeHref`/`ExtLink`.
- New page recipe: a `<section>` in `main` with a `.section-title` h2, content in `.card`s, lists as `.lines`
  of `.row`s, actions in `.row-actions`.
