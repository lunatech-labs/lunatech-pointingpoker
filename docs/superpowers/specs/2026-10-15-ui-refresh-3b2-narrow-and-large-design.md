# UI Refresh, Step 3b2: Narrow and Large Screens

Date: 2026-10-15
Status: In discussion
Parent: `docs/superpowers/specs/2026-09-30-ui-refresh-design.md`, step 3

## Purpose

Step 3b2 draws the room page below 3b1's 65.75 rem breakpoint and caps it on
wide screens: the reference's L5 (the deck's reflow), L10 (the width cap) and
L11 (the layout below the breakpoint). It builds on 3b1's page
(`docs/superpowers/specs/2026-10-09-ui-refresh-3b1-wide-room-page-design.md`)
and 3a2's tokens, and reopens 3b1's decisions 2 (the breakpoint), 7 (the
header), 11 (the voter's progress) and 13 (the kept tag), each below a switch. The product owner judges it
on `docs/design/room.html`. Phones are hand-tested on the deployed app only and
never gate a merge.

## Terms

- **Width**: the page's own width in rem, as a container query reads it, at
  the fluid root (J2). Its px equivalents are in Measured.
- **Wide layout**: 3b1's page, with its sidebar (3b1's Terms), from 51.75 rem.
- **Phone layout**: the page below 51.75 rem, one column without the sidebar.
- **Compact foot**: the slot and the round bar below 65.75 rem, in either
  layout (decisions 3 to 6).
- **Multi-row deck**: a deck whose 13 cards wrap onto more than one row, as
  every deck in the compact foot does.
- **Top line**: the slot's padding above a multi-row deck (decision 4).
- **Sheet**: the phone layout's slot and round bar, pinned together at the
  viewport's bottom (decision 7).

## Decisions

**Two switches**

1. **51.75 rem switches the page's structure**: the wide layout at and above
   it, the phone layout below, by a container query on the width. It is where
   the full header holds the longest room id (`charming-speckled-anteater`)
   with "Link copied" (measured 51.5). 3b1's breakpoint moves here; J2's and
   principle 4's wide and narrow layouts are these two.
2. **65.75 rem switches the foot**: below it, in both layouts, the compact
   foot, and "Pointing Poker" is hidden; at and above, 3b1's foot. 65.75 rem
   stays 3b1's measure: 13 cards at the touch target beside the sidebar.

**The compact foot**

3. **The deck wraps in balanced rows**, by container queries on the deck's own
   width: 5, 5 and 3 cards; 7 and 6 from 22.25 rem (seven 44 px cards and
   their gaps). A card is never under `--target-min` nor over `--deck-card`.
   One row of 13 is 3b1's foot only: a one-row slot is too short for the
   result (Measured).
4. **The slot keeps one height through a reveal**, computed in CSS: the
   deck's height from its columns and card width, a card at least
   `--target-min` (`calc()` on `--deck-width`, a token whose value is
   `100cqi`), its gaps and one extra `--space-2` above it, and at least the
   result's least height (`--result-least`, `--result-least-narrow` in the phone layout), a `max()` of the two. A deck
   shorter than that floor sits centred in the slot while voting. That top line holds the voter's progress at its left (a later step's,
   text only; 3b1 decision 11 had it in the round bar) and the kept tag
   at its right, clear of a lifted card: the tag leaves its card (3b1 decision
   13), and the kept frame marks which card.
5. **The result in the compact slot**: "Most voted" on two rows (the label and
   the count, then the figure: a single value at the 3xl step, a tie's list at
   the 2xl step, or "Tie" or "None"); the bars fill what is left, the tallest
   at most `--deck-card`. The figures share a baseline; the voted values are
   at `min(var(--text-xl), var(--value-fit))`, so they hold the value row, and
   values with no votes and the counts at `min(var(--text-lg),
   var(--value-fit))`.
6. **The round bar is one row**: the phase word, Clear set apart (3b1 decision
   6), then the phase's main action with its word, at most `--action-width`
   and right-aligned, as in the wide layout. Show votes and Re-vote keep
   their words today; once Next issue exists (step 5), Re-vote becomes its
   icon. In the wide layout Clear keeps its words (decision 10 for the phone
   layout). Every icon keeps an accessible name.

**The phone layout**

7. **One column, in the wide layout's order**: the issue, the table, the slot,
   the round bar. The roster is hidden; the facilitators get one line under
   the table, which names two, then "and 3 more" (3b1 decision 8). The slot
   and the round bar are the sheet (`position: sticky`, bottom 0) where the
   viewport is at least 39 rem tall, a media query at the reader's default
   size: every portrait phone from a 629 px viewport up pins; landscape
   phones, the first iPhone SE and a laptop at 200% flow. Phone users'
   feedback tunes the 39. The tallest sheet is 23.75 rem, at a 430 px page,
   so `scroll-margin-bottom: var(--sheet-clearance)` (24 rem) on the
   focusable elements outside the sheet, where it pins, keeps focus clear of
   it (2.4.11, 2.4.12). Firefox does not scroll to a focus already in the
   viewport, margin or not, so a keyboard focus (`:focus-visible`) not wholly
   in view above the pinned sheet scrolls to the top (`scrollIntoView`),
   which clears the sheet wherever it fits; a tap scrolls nothing.
   `scroll-padding` on `html` would scroll the page as focus moves through
   the sheet in Chromium, would reach the wide layout, and fails in Firefox
   alike.
8. **The header is one row**: the mark, the chip with Copy link as its icon
   alone (its name "Copy link"), and ☰ (its name "Menu"), each a 44 by 44
   target. ☰ shows or hides a second row in the header's flow, the wide
   header's role sentence, its switch and Leave (Disclosure). "Link copied"
   takes the room id's place in the chip for its 2 s (J6).
9. **The table's entries are at the phone layout's own scale**,
   `--entry-scale-narrow` (0.8), their names at the xs step: the table flows
   with the page, so it has no height to fill. 3b1's scale, from 1, holds in
   the wide layout.
10. **Clear and Edit are their icons alone**, their names "Clear votes" and
    "Edit issue" kept. Clear is marked by its icon, its quiet look and its
    distance (J5 gains this); its words wrap at 392 px even today.
11. **The facilitator's page follows the voter's**: while voting the sheet is
    the round bar alone; the slot appears at a reveal, as tall as a voter's.
    Until the progress step fills it while voting, the reveal moves the round
    bar (Accepted costs).

**Every width**

12. **A link in the issue breaks only before a path slash or after a dot in
    its host** (3b1 decision 4 extended); a piece wider than the line still
    breaks anywhere (1.4.10).
13. **The width cap is 106 rem** (`--page-max`), a 1080p monitor's page. The
    page stops growing there, centred on the ground; the header's bar stays
    full width, its content aligned with the page. It must stay above 65.75
    rem.
14. **The shared screen is the wide layout**, as principle 4's last row says.

**What later steps inherit**

15. **Constraints**: step 5 shortens Next issue's visible word to "Next" where
    the round bar cannot hold it (about a 21 rem page), its name staying "Next
    issue" (2.5.3), and rechecks Clear's words at 51.75 rem; the progress's
    order in the DOM is the progress step's call; its place on the top line
    must clear a lifted card in the first row, which the drawn progress does
    not (a lift is `--space-2`); step 9's round history sits
    at the phone layout's end, after the round bar, to confirm in its own
    design; a feature that needs the roster below 51.75 rem brings it back or
    uses the room the phone layout has.

## Disclosure

☰ is a disclosure: a button with `aria-expanded` and the row after it in the
DOM, not an ARIA menu. The row is in the header's flow, so it covers nothing.
The table is the phone layout's; crossing 51.75 rem leaves it.

| Event | Closed | Open |
| --- | --- | --- |
| Tap or Enter on ☰ | open, focus stays on ☰ | close, focus stays on ☰ |
| Escape, focus in the row or on ☰ | nothing | close, focus to ☰ |
| Escape, focus elsewhere | nothing | stays open |
| Tap or Tab elsewhere | nothing | stays open |
| Switch | cannot happen | the role changes, stays open, focus stays on the switch |
| Leave | cannot happen | the lobby, as today |
| Role changed from another tab | the row follows, hidden | the sentence and switch follow |
| Banner, reconnect or phase change | nothing | stays open |
| Width crosses 51.75 rem | ☰ shows or hides | closes; the wide header shows the row's content |

Accepted: focus on ☰, in the row, or on the wide header's switch or Leave falls
to the page when the width crosses 51.75 rem, which needs a resize.

## Measured

Chromium, 14 voters, the mockup:

- At 390 by 844 the sheet is 344 px (41%), voting and revealed; 10 of 14
  entries show above it at load (8 at scale 1).
- Phone viewports, from Playwright's device list: the sheet is 50 to 53% on
  every iPhone (659 to 739 px tall), 48% at 392 by 743, 41 to 43% on Pixels
  and a Galaxy S24; at 39 rem all of them pin.
- The kept tag fits the 22 px above a deck's first row; it touched the
  top-right card by 1 px and its hover lift before the extra `--space-2`.
- The header is 61 px closed and 143 px open; the chip with the longest room
  id fits beside ☰.
- A Jira link takes 2 lines from 377 to 410 px, not 3 broken inside its host.
- A one-row deck at 800 px is 84 px tall; its result needs about 190. A 7 and
  6 deck of 44 px cards, at 433 px, is 147 px tall; the result's least height
  is 11.75 rem in the phone layout and about 10 rem in the wide one. With the
  floor and the xl cap, a sweep from 320 to 1170 px wide, both roles and
  phases, spills nothing from the slot.
- At 51.75 rem the round bar is 448 px: Clear's words leave 99 px today, 30
  with Next issue and Re-vote as an icon; with Re-vote's words it wraps.
- In the wide layout at 960 by 900 and 960 by 1600 (59 rem), all 14 entries
  show and the page does not scroll, with a three-way tie, Next issue and the
  progress drawn; at 1000 by 700 the table shows 7 of 14 and scrolls in its
  region.
- At a 16 px root, 51.75 rem is about 843 px and 65.75 rem about 1067 px, a
  classic scrollbar included. The root is 16 px in a window under about 975 px
  wide or 762 px tall; a taller window's root grows with its width, so 65.75
  rem is about 1174 px at 1528 px tall.

## Accepted costs

- The wide layout below 65.75 rem on a short window: the two-row slot takes
  the table's room, so it scrolls in its region sooner (7 of 14 at 1000 by
  700).
- The facilitator's phone page, until the progress step fills its slot while
  voting: a reveal grows the sheet over the table, and where the page ends on
  screen, or where the sheet flows, the round bar moves down by the result's
  height. The parent's phase
  line rule and step 4's check carry the exception. The facilitator's own Show
  causes it, but for a second facilitator's.
- The kept tag sits on the top line, away from its card.
- A 7 and 6 deck shorter than the floor, from 433 px wide, has up to about
  40 px of spare room in the slot while voting.
- The phone layout reaches 843 px windows, where its 7 and 6 sheet is about
  280 px.
- On an iPhone the pinned sheet takes about half the viewport; 5 entries show
  at load at 392 by 743.
- A banner arriving on a page scrolled down shows above the view (3b1's
  accepted cost); a phone scrolls more, so it happens more.
- Opening ☰'s row moves the page below it down by the row's height.

## Parked

- The issue at full width above the column and the sidebar, below 65.75 rem:
  until users find two-line issues annoying.
- A shortened issue on a phone (the Jira key, the full text kept).
- The phone layout's entries growing from 0.8 to the deck card where every
  entry fits above the sheet, fitted to `svh` and not to the ☰ row: 1.42 at
  600×1000 and 820×1180, 0.9 at 430×932, nothing at 392×743 (14 voters). After
  step 4, with phone feedback.

## Contract

No e2e case changes. Every case but one runs at the default viewport, in the
wide layout. `slug.spec.js`'s phone case, at 390 by 844, waits for a visible
Show votes, votes from the deck and dismisses a banner: the sheet pins (844 px
is over 39 rem) and keeps the first two in view and above the page, and the
banner stays in the flow under the closed header. Step 4 runs it.

## The docs' changes

- **Parent**, with this document: principle 4's last row (decision 14);
  principle 5's zoom bullet; the phase line's exception (Accepted costs) in
  step 3's paragraph and step 4's checks; step 4's copy hint and zoom checks;
  Appendix A's disabled deck; Appendix B's copy hint and phase line cases.
- **3b1**: its Status line points here for decisions 2, 4, 7, 11 and 13.
- **Tokens and gate**: `--page-max`, `--entry-scale-narrow`,
  `--sheet-clearance`, `--result-least`, `--result-least-narrow` and `--deck-width`, which the gate allows `cqi` on. J2's
  `vw` coefficient stays unbounded, as 3a2 left it to 3b2: these rules are in
  rem and hold for any coefficient.
- **Mockup**: `room.html` draws the two switches, the phone layout and the cap.
- **Reference**: L5, L10 and L11 leave Open for a section on the two switches,
  the phone layout and the cap; the frozen deck's rules go (the "Revealed,
  where a deck stays" row, J8's frozen deck); J2's units allow `cqi` on
  `--deck-width`; J5 gains decision 10; the Tokens
  section's exemption names the queries' values; Open gains Parked; the log
  gains a 3b2 entry with what was set aside, the cap's reasons and the
  three-way tie at 840 px behind decision 1, which the plan lists.
- **Known issues**: "A reveal with votes still pushes the participants list
  down" gains the facilitator's phone page.

## Branches and commits

One PR on `20260930.ui_refresh_3b2_narrow_and_large`, stacked on 3a2's
`20260930.ui_refresh_3a2_root_height` (#446): this document and the parent's
change first, then the tokens and the mockup, then the reference.
