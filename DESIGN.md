# DESIGN.md: IMD on the record

Taken from the final source: `src/styles.css`, `src/App.tsx`, `src/wallet.tsx`, `index.html`.
Rendered behaviour has not been observed in a browser (see `artifacts/validation.md`); the DOM checks in
happy-dom confirm structure and text, not layout. The footer links `./agents.md`, the plain-text guide for agents.

## Direction

The brief asks for a white background, rounded cards, large plain headings, monospace for addresses,
ids and source numbers, and one accent colour for buttons. The page is a record people read to check
facts, so it stays quiet. Colour is reserved for the three evidence labels and the one filled primary
action.

## Colour tokens (`:root` in `src/styles.css`)

Primitives are named by hue; components use only the semantic tokens.

| Semantic token | Value | Role |
| --- | --- | --- |
| `--color-bg` | `#ffffff` (`--gray-0`) | Page, line rows, inputs, neutral buttons |
| `--color-bg-subtle` | `#f6f7f9` | Cards, the body preview |
| `--color-bg-hover` | `#eceef2` | Hover, source chips, the close button, pending pill |
| `--color-border` | `#dde1e7` | Control borders, header rule, line separators |
| `--color-text` | `#14171c` | Body text |
| `--color-text-secondary` | `#5f6673` | Lead, meta lines, "how it was checked" |
| `--color-accent-solid` / `-hover` | `#5b21b6` / `#4c1d95` | The filled primary button, the only accent |
| `--color-on-accent` | `#ffffff` | Text on the accent |
| `--color-focus` | `#14171c` | 2px focus ring, offset 2px |
| `--color-error` | `#a1231b` | Field errors, refused and failed pills, the refusal line in Activity, the `false` answer pill |
| Proof label, `true` answer pill, "confirmed on chain" | `#146c36` on `#e9f7ee` (the tie word on the white page) | Green |
| Statement label | `#1e4fa8` on `#e8f0fd` | Blue |
| Claim label, warnings, `differs` rule, "Left out" link lines | `#9a3d00` on `#fff1e5` | Orange |

Contrast, computed from these declared pairs (WCAG formula, not measured in a rendered page): text
17.96, secondary on white 5.78, secondary on card 5.39, white on accent 8.98, proof 5.89, statement
6.69, claim 6.24, warning on card 6.44, error on card 7.07, error pill 6.63. Every pair passes 4.5:1.

## Typography

- Families: `--font-sans` is the system UI stack; `--font-mono` is `ui-monospace, SFMono-Regular, Menlo, Consolas, …`.
  Mono is used for addresses, ids, amounts and source numbers (`.mono`, `.chip`, `pre.body`), at the
  size of the text around it.
- Weights: 400 for body text, 600 for headings, buttons and labels.
- Scale: five sizes.

| Token | Size | Use |
| --- | --- | --- |
| `--text-display` | 32px | `h1`, the subject name; line-height 1.15, letter-spacing -0.02em |
| `--text-title` | 22px | Section titles ("Pay the swarm", "Activity"), the empty-state heading, the close × |
| `--text-heading` | 17px | Card headings (`h2` inside the record, `h3`) |
| `--text-body` | 16px | Body, buttons, inputs (16px so iOS does not zoom) |
| `--text-small` | 13px | Meta lines, labels, chips, sources, the About line |

Headings use `text-wrap: balance`; paragraphs use `pretty`. Long values use `overflow-wrap: anywhere`.
There is no uppercase and no tracked label anywhere.

## Spacing, radius, elevation

- Spacing steps: 4, 8, 12, 16, 24, 32px (`--space-1` to `--space-8`). Gaps between groups are at least
  twice the gaps within them (for example, sections 32px apart and cards 16px apart).
- Radius: cards and sheets 16px (`--radius-card`); controls, rows and the body preview 10px
  (`--radius-control`); pills fully round; chips 6px.
- Elevation: only the sheets have a shadow (`--shadow-sheet`), and they have no border. Cards are flat
  fills with neither border nor shadow.

## Components

- **Header** (`.top`): sticky. "IMD record" at the leading edge; Actions and Activity links from 640px
  up; the wallet control at the trailing edge.
- **Buttons** (`.btn`, `.btn-primary`): at least 44px tall. Hover is gated by `@media (hover: hover)`;
  press scales to 0.96 (off under reduced motion); the focus ring is `:focus-visible`; disabled dims to
  60%. Transitions list their properties, never `all`.
- **Record line** (`.line`): text, then the quote or re-run note, then a meta row with the evidence
  label, numbered source chips (mono, each linking to `#source-n`) and a grey "research job" or
  "panel, N of M agreed" link to explorer.imd.fun. The second line of a `differs` pair sits directly
  under the first, with an orange rule on its leading edge and a "Differs from the line above" note.
- **Source line**: a record line added by a source job. Its label always names who said it
  ("Statement · imd.fun", "Claim · @someone"); a wide chip (`.chip.chip-wide`) shows the source's host and
  links to the source URL; a grey `.small` line under it reads "added from a source by <payer>, research
  job", with "research job" linking to the job. It follows the research lines of its section.
- **Channels** (`.channels`): each channel link with its tie in words: "confirmed on chain" (green),
  "names the contract" or "not confirmed" (secondary grey). One `.small.tie-key` line under the list says
  what the three mean.
- **Checked by a panel**: the first card above the sections. One row per completed oracle request: the
  short title, an answer pill (`.answer-true` green, `.answer-false` red, the word always shown),
  "panel, N of M agreed", the evidence label and a link to the request.
- **Cards** (`.card`): grey rounded blocks for each section, "Checked by a panel", "Not known yet",
  "Sources", the three action cards and each Activity row.
- **Empty state** (`.empty`): "No research yet", one line on how the record fills, and the Research
  button with its live price.
- **Pay dialog** (`.sheet.sheet-wide`): a definition list (amount in IMD and wei, the Intake address,
  the action id), the full body in a scrollable `pre`, a no-refund line, then Connect, Switch, Approve
  and pay, or Pay. It closes by Escape, the backdrop or ×, and returns focus to the button that opened
  it. Status goes to a `role="status"` line.
- **Connect sheet**: wallets found by EIP-6963, by name and icon, then Coinbase Wallet. On a phone:
  Open in MetaMask, Coinbase Wallet, Rabby and Phantom, then Coinbase Smart Wallet. Rows are 48px.
  It is a bottom sheet under 640px. Connected, the control shows the short address and Disconnect; on
  the wrong chain, "Switch to Ethereum".
- **Add sources** (`#add-sources`): a textarea "Links, one per line", a live `aria-live="polite"` line
  ("2 of 20 links. 17 more will fit …"), an orange list of lines left out with why ("Left out, already
  listed: …"), the link rules in one grey line, then a neutral "Review the source job" button with the live price (the accent stays on Research).
- **Forms** (P4, Add sources): visible labels, examples as placeholders, and checks on submit. Each error
  sits under its field (`aria-invalid`, `aria-describedby`), and focus moves to the first invalid field.
- **Activity row**: state pill (pending, completed, refused, failed), local time, what was asked
  (Research, Sources, or Question with its kind) with the oracle answer, a red `.why` line
  "Refused: <reason>: <detail>" as plain text, the question's short title, "could not open: <url>" lines and
  the line count for source jobs, the payer (ENS name or short address, mono) and
  a link.

## Responsive behaviour

- One column, inline padding 16px, content up to 52rem.
- From 640px (40rem): header links appear, cards get 24px padding, sheets centre instead of sitting at
  the bottom.
- From 832px (52rem): the action cards sit in two columns (1fr and 1.4fr); Add sources takes the
  second row's first column, under Research.
- At 390 wide the header, the subject heading, the lead line, the channels with the tie key and the
  "Research again", "Confirm a fact" and "Add sources" buttons come first (or the empty-state card with
  "Research this page" before any research). This is reasoned from the source and was not checked in a browser.

## Assets

`public/favicon.svg` is the accent square with three white lines. `public/og.png` is 1200×630,
drawn by a script: the mark, heading blocks and the three label pills, with no text.
