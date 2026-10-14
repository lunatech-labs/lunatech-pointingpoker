# UI Refresh, Step 3a2: The Root Follows the Height

Date: 2026-10-14
Status: In discussion
Parent: `docs/superpowers/specs/2026-09-30-ui-refresh-design.md`, step 3

## Purpose

Step 3a2 moves the room page's tokens from the mockup to the value source and
makes the gate check them, as 3b1 decision 16 asks
(`docs/superpowers/specs/2026-10-09-ui-refresh-3b1-wide-room-page-design.md`).
3b2 then draws on them. It is judged by the gate's tests, each change shown to
fail. 3a's Terms (`docs/superpowers/specs/2026-10-07-ui-refresh-3a-tokens-design.md`)
apply here: value source, pair, vision and gate. Nothing imports the value
source before step 4, so the app does not change.

This step has no stateful part, so it has no states by events matrix.

## Terms

- **The block**: the `:root` rule headed "3a2's tokens" in `docs/design/room.html`,
  as PR #445 delivers it.
- **Decorative set**: the colour tokens the gate does not require a pair to
  reach: the hairline's `--pale`, and the colours drawn only in a `box-shadow`,
  `--mark-offset`, `--shadow-colour` and `--lift-colour`. They draw nothing a
  reader needs: forced colours drop shadows, and the hairline alone tells
  surfaces apart where a shadow is lost (J9).

## Decisions

1. **The block moves as it stands**, but for decisions 2 and 6, as 3b1
   decision 16 describes: an existing name is an override, and each item a
   diff of the block does not show applies.
2. **A shadow is two tokens**: its lengths in `tokens.css`, its colour in
   `colours.css`, joined where it is used, as in `box-shadow: var(--shadow)
   var(--shadow-colour)`. `--shadow` becomes `0 max(1px, 0.0625rem) max(2px,
   0.125rem)` and `--lift-shadow` `0 0.4rem 0.9rem`; `--shadow-colour` is
   `rgba(28, 25, 23, 0.05)` and `--lift-colour` `rgba(220, 47, 60, 0.25)`. The
   soft shadow so follows J2's floor rule: today's at a 1rem root, growing
   with the root above it.
3. **A unit allowed on named tokens maps to a list of them**: `em` on
   `--tracking-label` and `--tight-point`, `cqi` on `--value-fit`, `vh` and
   `vw` on `--root-size`, `dvh` on `--shell-height`. `vmin` leaves the list.
4. **The root's shape is `clamp(<min>rem, min(<a>vh, <c>vw) + <b>rem,
   <max>rem)`**, and only that shape passes. J2's three rules stay; the third
   applies to `a`, at a viewport 757 px tall. The `vw` term sits inside `min()`,
   so it can only lower the root and breaks none of the rules; nothing bounds
   `c` (Accepted costs). The new root passes: `b` is 0.5, 1.75 is under 2.5
   times 1, and 1.05 × 7.57 + 8 is 15.95 px, under 16.
5. **Only the decorative set is exempt** (Terms). The pip and the progress
   track show a shape on a shape, so they get pairs (The pairs).
6. **Five values darken to pass every vision**, as 3a decision 10 moves a
   value wherever J8 needs it: each to the lightest value with the block's hue
   and saturation that passes. The block's values were measured under normal
   vision only.

   | Token | Block | Now | Its worst pair, block then now |
   | --- | --- | --- | --- |
   | `--burgundy` | `#A31B26` | `#9B1A24` | paper-warm on it, deuteranopia: 6.56, 7.05 |
   | `--burgundy-deep` | `#A31B26` | `#931822` | on burgundy-tint, deuteranopia: 6.08, 7.05 |
   | `--ok` | `#10612E` | `#0F5D2C` | on ok-tint, protanopia: 6.69, 7.08 |
   | `--kept` | `#873E07` | `#7F3A07` | on paper-pale, deuteranopia: 6.46, 7.04 |
   | `--bar-other` | `#E06C74` | `#DE656D` | on paper-warm, deuteranopia: 2.86, 3.02 |

   This reopens L's entry ("#A31B26 stays") by the least the gate allows,
   chosen after comparing both phases side by side over keeping #A31B26 behind
   a weaker gate. The burgundies part, as only the problem's text needs the
   darker one.

## The pairs

3a's table stays, with paper-warm on card-back an indicator (3b1 decision 16).
`T` is a text pair, `I` an indicator pair. The new rows, in both runs:

| Foreground | Ground | Floor | Worst, under deuteranopia but where named |
| --- | --- | --- | --- |
| mute-soft | paper, paper-warm, paper-pale | I | 3.37 on paper-pale |
| bar-other | paper-warm | I | 3.02 |
| notice-ink | notice-ground | T | 8.51, tritanopia |
| notice-bar | notice-ground | I | 4.93, protanopia |
| ok | ok-tint | T | 7.08, protanopia |
| kept | kept-tint, paper-warm, paper-pale | T | 7.04 on paper-pale |
| pip over card-back | card-back | I | 3.16 |
| card-back | track | I | 3.29 |

Every pair, old and new, passes with decision 6's values under every vision,
computed with `contrast.ts`; the tightest are grey on paper-pale at 7.02 and
bar-other at 3.02.

## The gate's changes

Each change has a case that fails before it.

- Decision 3's lists, in `gate.test.ts`: `em` on `--tight-point`, `cqi` on
  `--value-fit`, and `vh` and `vw` on `--root-size` pass, and `vmin` on
  `--root-size` fails; `em` on any other token still fails.
- Decision 4's shape, in `gate.test.ts`: the new root passes and the old
  `vmin` form fails; a missing `min()` and an `a` that lifts the root above its
  minimum at 757 px tall still fail, and a large `c` passes. The existing root
  cases, all in the `vmin` form, are rewritten to the new shape, each keeping
  its rule.
- Decision 5's set, in `gate.test.ts`: an unreached `--mark-offset` passes;
  the existing `--spare` case shows any other unreached colour still fails.
  The unreached cases' fixture gains every token the new pairs name, and the
  case of a token only an unchecked `var()` reaches takes a fresh one, since
  `--mute-soft` now has its own pairs.
- The pairs: `pairs` gains The pairs' rows, and paper-warm on card-back moves
  from text to indicator. `tokens.gate.test.ts` runs them on the real files,
  where they fail until the files move: today's `colours.css` lacks the new
  tokens, and white on the block's card back is 3.89 under deuteranopia.

## The mockup's changes

`room.html` loses the block and reads the value source; its three shadow uses,
the panel's, the messages' and the chosen card's lift, join the two tokens.
Its look changes only by decision 6's values, and by the soft shadow growing
with the root above 1rem.

## The docs' changes

- **Parent**: step 3's paragraph points to this document beside 3b1's.
- **3b1's figures**: Measured's contrast line and decision 14's "(7.66)" say
  they are normal vision, and point to decision 6 here.
- **Reference**:
  - J2's first bullet names decision 4's shape; the units and lines bullets
    drop "3a2 settles" and "wait on 3a2";
  - J8's exempt list gains the decorative set, and its bullet pointing to
    3b1's Measured goes, since its gate bullet already points to `gate.ts`;
  - J9's surfaces say a shadow is two tokens;
  - the Brand source's red line takes decision 6's values and names the
    vision of its figures; `contrast.test.ts` checks every figure in the Brand
    source, so it gains the new ones;
  - the Tokens section: the bullet on 3b1's tokens says they are in the value
    source; in the table, the colour row's shadows become the shadows' colours,
    the shape row gains the shadows' lengths, and a new row holds the room
    page's layout sizes, such as the sidebar, the header and the deck card;
  - the log: L's entry gains decision 6, and a 3a2 entry points here and gives
    the reasons above with what was set aside: a shadow kind in the gate, which
    adds a parser; shadows as literals, outside the value source; a viewport
    grid for the root, which turns the rules into samples; exempting the pip
    and the track; checking the simulations on shapes only, or exempting the
    button's white, either of which keeps #A31B26 by weakening the gate.

## Accepted costs

The gate checks tokens, not their uses; step 4's review checks these:

- `--value-fit` outside a size container: `cqi` falls back to the viewport.
  Step 4's component provides the container.
- A use that writes `var(--shadow)` without its colour is valid CSS and draws
  the shadow in `currentColor`: ink, a notice's blue or a problem's red.
- Nothing bounds the root's `vw` coefficient `c` until 3b2: a large one never
  caps the root, so it follows the height alone on tall, narrow windows, and
  one near 0 keeps the root at its minimum everywhere.
- `--font-sans` names Inter and `--tight-point` is tuned to it, but the app
  loads no font yet; until step 4 serves it (J7), the fallback font shows.

## Branches and commits

One PR on `20260930.ui_refresh_3a2_root_height`, stacked on 3b1's
`20260930.ui_refresh_3b1_wide_room_page` (#445), in three commits:

1. `docs: specify the root and the room page's tokens (ui refresh step 3a2)`:
   this document and the parent's change.
2. `feat: move the room page's tokens into the value source (ui refresh step
   3a2)`: the gate's changes test first, `colours.css`, `tokens.css` and
   `room.html`. The gate and the files change together, since the real-file
   test cannot pass with either alone.
3. `docs: give the design reference the room page's tokens (ui refresh step
   3a2)`: the reference's changes, 3b1's figures, and
   `contrast.test.ts`'s Brand source figures, which follow the reference.
