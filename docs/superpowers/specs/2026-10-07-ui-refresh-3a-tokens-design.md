# UI Refresh, Step 3a: Tokens

Date: 2026-10-07
Status: In discussion
Parent: `docs/superpowers/specs/2026-09-30-ui-refresh-design.md`, step 3

## Purpose

Step 3a gives the design reference, `docs/design/ui-reference.md`, its token
values: the "Tokens" section, J8's contrast script, J7's licence check and
J9's shapes. Step 3b draws the layouts with them and step 4 applies them. The
reference's Terms and rules apply here and are not repeated; the reasons behind
each decision below go to its decisions log, where they stay with the rules.

This step has no stateful part, so it has no states by events matrix.

## Terms

- **Value source**: `frontend/src/colours.css` for the colour tokens and
  `frontend/src/tokens.css` for the rest, the only place a token's value is
  written, each token with a one-line purpose comment.
- **Ground**: a colour text or an indicator sits on, as J8 lists them.
- **Pair**: one foreground on one ground, with its floor: 7:1 for text, 3:1 for
  an indicator (J8).
- **Vision**: normal, or one of Machado 2009's protanopia, deuteranopia and
  tritanopia at severity 1.
- **Gate**: the Vitest test that checks every pair under every vision.
- **Kept frame**: the kept look that replaces J3's hatching, a solid band in
  the card back's colour around a paper centre (decision 4).

## Decisions

1. **The value source is two files.** The reference's Tokens section keeps
   the kinds and the rules and points to the files; no value is written twice.
   Every colour token lives in `colours.css`, so the gate parses one file whole.
   Nothing imports either before step 4, and 3b's mockups link both. An alias
   exists only where its value can differ from its source.
2. **The gate runs in `test:unit`**, so a value 3b or step 4 changes is checked
   on every pull request.
3. **Shared-screen text is sized for 4 m** on a 40 inch TV at the laptop target:
   the `--text-3xl` step, 44 px. 3b may drop one element to the 3 m step, said
   so in the log. 3b's input: a 50-character ticket link fits one line at the
   laptop target, and a longer issue wraps, never truncated, until a
   clickable-link step brings an ellipsis that keeps the link's end.
4. **The kept look is the kept frame**, on cards and entries. A card's band is
   `--frame-band`, a fixed line; an entry's is a fifth of its mark's width in
   the mark's viewBox, the stroke inset. It reads as no fill, some, full: no
   estimate, kept, confirmed. The card's size is 3b's, with a token 3b adds:
   a kept card shows its widest figure inside the band with room around it.
   If the frame fails L3 on the smallest entry mark, 3b sends the band back
   to 3a (the reference's Tokens rules).
5. **Two control weights.** Controls keep the brand's 1 px; J3's marks take
   2 px. Under `prefers-contrast: more` the control line takes the mark line's
   weight and the hairline turns mute-soft.
6. **Cards are rounded, the deck's and L3's card entries; nothing else is.**
   Buttons, inputs, surfaces, messages and the not-confirmed tag (J3's pill,
   renamed) stay square.
7. **The card back is a token, ink for now.** 3b tries burgundy on the
   assembled mockups and the product owner chooses; burgundy would reopen J4.
   The frozen chosen card fades to the grey whatever the back.
8. **One grey for supporting text and the frozen deck**, `--grey`, on the
   site's mute hue. Supporting text keeps the body size; the hierarchy comes
   from a 600-weight lead in ink. No italics.
9. **Steps, not roles, name the type scale**, so 3b assigns a step to an
   element without renaming a token.
10. **The site's gist, not its values.** lunatech.com was not built for
    contrast, so a value moves wherever J8 needs it, the hue kept.

## The tokens

Values at the laptop target, where the root is 16 px. The Colour rows are
`colours.css`, the rest `tokens.css`.

| Kind | Token | Value | Purpose |
| --- | --- | --- | --- |
| Colour | `--paper` | `#FCFAF6` | the page |
| | `--paper-warm` | `#FEFDFB` | content surfaces; figures and labels on a fill |
| | `--paper-pale` | `#F0EBE2` | a notice's ground |
| | `--pale` | `#D6CABB` | hairlines, decorative |
| | `--mute-soft` | `#8A7A70` | hairlines under `prefers-contrast: more`; 3.42 at worst, on paper-pale under deuteranopia |
| | `--ink` | `#1E1815` | text, controls, the focus ring |
| | `--grey` | `#554B43` | supporting text; the frozen deck |
| | `--burgundy` | `#8E292E` | the brand, the one primary per phase |
| | `--burgundy-deep` | `#5C1C20` | a problem's text and bar |
| | `--burgundy-tint` | `rgba(142, 41, 46, 0.08)` | a problem's ground |
| | `--hairline-colour` | `var(--pale)`, `var(--mute-soft)` under more | dividers and surface edges |
| | `--card-back` | `var(--ink)` | J3's looks: the outline, the solid fill, the kept frame (decision 7) |
| Root | `--root-size` | `clamp(1rem, 1.05vmin + 0.5rem, 1.75rem)` | J2's root |
| Shell | `--shell-height` | `100dvh` | J2 |
| Type | `--font-sans`, `--font-mono`, `--font-serif` | DM Sans, JetBrains Mono, Instrument Serif, each with a system fallback | J7 |
| | `--text-sm`, `--text-md`, `--text-lg`, `--text-xl`, `--text-2xl`, `--text-3xl`, `--text-4xl` | 0.875, 1, 1.25, 1.625, 2.125, 2.75, 3.5 rem | labels; body; headings and deck figures; own-page emphasis; the 3 m step; the 4 m step; result figures |
| | `--weight-regular`, `--weight-medium`, `--weight-strong` | 400, 500, 600 | DM Sans uses 400 and 600, JetBrains Mono 400 and 500 |
| | `--leading-body`, `--leading-tight` | 1.5, 1.15 | WCAG 1.4.8; the large steps |
| | `--tracking-label` | 0.12em | uppercase mono labels |
| Spacing | `--space-1` … `--space-8` | 0.25, 0.5, 0.75, 1, 1.5, 2, 3, 4 rem | gaps and padding |
| Shape | `--radius`, `--radius-card` | `0`, `0.25rem` | decision 6 |
| | `--target-min` | `max(44px, 2.75rem)` | a control's least width and height (WCAG 2.5.5) |
| Lines | `--line-hairline` | `1px` | the hairline's width |
| | `--line-control` | `max(1px, 0.0625rem)`, the mark's under more | buttons, inputs, unchosen card edges |
| | `--line-mark` | `max(2px, 0.125rem)` | J3's outline mark |
| | `--frame-band` | `max(2px, 0.5rem)` | a card's kept frame (decision 4) |
| | `--line-bar` | `max(3px, 0.1875rem)` | a message's bar |
| | `--focus-width`, `--focus-gap` | `max(2px, 0.125rem)` each | J8's ring |
| Motion | `--duration` | `180ms` | J9; lunatech.com's shortest |

## The gate

**Method.** A ground with alpha is composited over its surface in sRGB and
rounded to 8 bits, as the browser paints it. Each colour is simulated under
each vision, the matrices applied in linear RGB and clamped, then WCAG's
contrast ratio is taken. This method reproduces every figure in the
reference's "Brand source" and J6 log; the gamma-space variant does not.

**Method tests.** Every figure in the reference's "Brand source" and J6 log is
a fixture, to two decimals, from the colours the figure names; J6's tint is the
site's `rgba(149, 43, 48, 0.08)`, not the token. Black on white is 21.

**Pairs.** `T` is a text pair, `I` an indicator pair (Terms). A floor compares
the unrounded ratio; only the method tests round.

| Foreground | paper | paper-warm | paper-pale | tint over paper, paper-warm | card-back | grey | burgundy |
| --- | --- | --- | --- | --- | --- | --- | --- |
| ink | T | T | T | T | | | |
| grey | T | T | T | T | | | |
| burgundy-deep | I | I | | T | | | |
| paper-warm | | | | | T | T | T |
| card-back, burgundy | I | I | I | | | | |
| hairline-colour, `more` run only | I | I | I | | | | |

- Ink and grey at 7:1 cover their indicators (lines, marks, the focus ring, the
  notice's bar, the frozen fill) at 3:1.
- The pairs follow the tokens' current values, so the card back is checked as
  whatever 3b sets it to.

**Parsing.** The gate finds the files through `import.meta.url`, as
`snapshot.contract.test.ts` does, and reads them with PostCSS and
`postcss-value-parser`, so a comment or a quoted string never reaches a
check. Each file holds one
`:root` block and one `@media (prefers-contrast: more)` block, read as two runs:
the `:root` values, then the `more` block over them. Every check runs on both.
The gate resolves `colours.css`'s `var()` within a run and runs the table on
each. These fail rather than pass quietly:

- any other rule in either file; in a block, a name outside `--[a-z0-9-]+`,
  an empty value, `!important` or a token declared twice; or a colour token
  declared in `tokens.css`;
- a value in `colours.css` that is not a hex, an `rgba()` or a `var()` to
  another colour;
- a colour token reached by a pair in neither run, as foreground or ground,
  directly or through `var()`, except `--pale`, decorative (J8);
- in `tokens.css`, a `px` outside a `max()`, but on `--line-hairline` (J2);
- in `tokens.css`, a unit but `rem`, `ms` and `px`, except `em` on
  `--tracking-label`, `vmin` on `--root-size` and `dvh` on `--shell-height`
  (J2);
- in `tokens.css`, a function but `calc()`, `min()`, `max()`, `clamp()` and
  `var()`, a hex, `transparent` or `currentColor` in any case, or a `var()` to
  a token `colours.css` declares (decision 1).

**J2.** From the three terms of `tokens.css`'s `--root-size` clamp in each
run, which must be there, at a default font size of 16 px:

- the `rem` term is above zero;
- the maximum is at most 2.5 times the minimum;
- at a `vmin` of 757, J1's tallest laptop size, the root is still at its
  minimum.

## The parent's changes

- **Steps table**: row 3 stays, and two rows follow it: `3a | Tokens | 3 |
  The contrast gate, then the product owner` and `3b | Layouts | 3a | The
  product owner, then the specialist`; 1c and 4 wait on 3b.
- **Step 3**: the values live in the value source, not the reference, and the
  paragraph points to this document, as step 2's does.

## The reference's changes

Commit 4 edits `ui-reference.md` directly and is reviewed as its diff: the
Tokens section and its token list point to the value source, J2, J3, J8 and J9
follow decisions 1 to 10 and the tokens above, "hatching" becomes the kept
frame, defined where J3 defines the fill, and "pill" becomes the tag. Beyond
the decisions it records:

- **J7**: the licences confirmed: all three families are SIL OFL 1.1 with no
  Reserved Font Name (google/fonts, `OFL.txt` and `METADATA.pb`), so subsetting
  and woff2 need no renaming, and the licence text ships beside the files.
- **J9**: the shapes as measured on 2026-10-07: corners square but the
  scrollbars' 2 and 3 px and the 50% dots; 1 px lines; 2 and 3 px burgundy
  bars; a 2 px focus outline, offset 2 px; transitions of 0.18 to 0.25 s;
  buttons at least 44 px tall, kept as `--target-min`.
- **Open**: L3 checks the kept frame on its smallest entry mark; L1 and L7 take
  decision 3's one-line input; 3b sizes the card to its widest figure, "0.5",
  and may instead show every `0.5` as "½", a contract change of step 4.
- **Decisions log**: each reason goes in the entry of the rule it changes. The
  reasons, and what was set aside:
  - 3: cap height at least a two-hundredth of the distance, at 0.65 mm per CSS
    px measured on a 40 inch TV, is 44 px of DM Sans (cap 0.70 em); a 3 m or a
    5 m target set aside.
  - 4: the frame reads as focused where hatching blurred, at full size and at
    the tile; hatching and partial borders (top and bottom, left and right)
    set aside, and a card band a fifth of a card width 3a would have to guess
    before 3b's layouts.
  - 5: a 1 px or a 2 px line everywhere set aside.
  - 6: a playing card's corner tells a card from a button; the site's corners
    are square.
  - 7: a burgundy back cannot fade within 7:1 (paper-warm on it 7.31 at full
    strength, 6.57 at 95%, at worst); a blue back set aside, a colour from
    outside the brand.
  - 8: the lightest grey found on the site's mute hue at 7:1 on every ground
    under every vision; italics and a smaller helper set aside.

## Accepted costs

- The gate checks pairs of tokens, not rendered pages. A component that puts a
  foreground on a ground outside the table escapes it until review catches it
  or 3b or step 4 adds the pair. A named or system colour, such as `red` or
  `Canvas`, put in `tokens.css` escapes it until review.
- Full-severity dichromacy only: the anomalous trichromacies are milder and not
  simulated.
- The type scale is judged on assembled mockups, which 3b draws; until then it
  is provisional, and 3b may send a step back (the reference's Tokens rules).
- The tile checks here scaled and blurred the page; real video compression is
  3b's check.
- Font files, and how the mockups load the fonts, are 3b's and step 4's.

## Branches and commits

One PR on `20260930.ui_refresh_3a_tokens`, stacked on step 3's
`20260930.ui_refresh_3_design_direction` (#436), in four commits:

1. `docs: specify the tokens (ui refresh step 3a)`: this document and the
   parent's changes.
2. `test: compute contrast under colour-blind simulation (ui refresh step 3a)`:
   the method, under `frontend/src/design/`, with its fixture tests.
3. `feat: add the design tokens behind a contrast gate (ui refresh step 3a)`:
   `colours.css`, `tokens.css` and the gate.
4. `docs: give the design reference its token values (ui refresh step 3a)`:
   the reference's changes.
