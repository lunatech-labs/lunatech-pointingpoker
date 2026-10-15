# UI Refresh, Step 3b2: Narrow and Large Screens

Date: 2026-10-15
Status: In discussion
Parent: `docs/superpowers/specs/2026-09-30-ui-refresh-design.md`, step 3

## Purpose

Step 3b2 draws the room page below 3b1's 65.75 rem breakpoint and caps it on
wide screens: the reference's L5 (the deck's reflow), L10 (the width cap) and
L11 (the layout below the breakpoint). It builds on 3b1's page
(`docs/superpowers/specs/2026-10-09-ui-refresh-3b1-wide-room-page-design.md`)
and 3a2's tokens. The product owner judges it on `docs/design/room.html`.
Phones are hand-tested on the deployed app only and never gate a merge.

## Terms

- **Width**: the page's own width in rem, as a container query reads it, at
  the fluid root (J2). In px it moves with the root: at a 16 px root, the root
  of every window under about 975 px wide, 51.75 rem is about 843 px and
  65.75 rem about 1067 px, a classic scrollbar included; a tall window's root
  grows with its width, so 65.75 rem is about 1130 px at 1528 px tall.
- **Phone layout**: the page below 51.75 rem.
- **Band**: the page from 51.75 to 65.75 rem.
- **Wide layout**: 3b1's page, from 65.75 rem.
- **Foot**: the slot and the round bar, the column's last two panels.
- **Sheet**: the foot pinned at the viewport's bottom (decision 4).
- **Multi-row deck**: a deck whose 13 cards wrap onto more than one row.
- **Top line**: the slot's padding above a multi-row deck (decision 7).

## Decisions

**The three layouts**

1. **The phone layout, the band and the wide layout**, switched by container
   queries on the width. 51.75 rem is where the full header holds the longest
   room id (`charming-speckled-anteater`) with "Link copied" (measured 51.5)
   and where the band's result still holds a three-way tie, with 36 px bars at
   840 px.
2. **The band is 3b1's page** with its sidebar and full header, "Pointing
   Poker" hidden, and three changes: the deck wraps (decision 6), the slot
   becomes a multi-row slot (decisions 7 and 8), and the round bar follows
   decision 9.
3. **The width cap is 106 rem** (`--page-max`), a 1080p monitor's page. The
   page stops growing there, centred on the ground; the header's bar stays full
   width, its content aligned with the page. It caps 1440p (117 rem), 4K at
   100% scaling (137) and ultrawides (157), and must stay above 65.75 rem.

**The phone layout**

4. **One column, in the wide layout's order**: the issue, the table, the
   slot, the round bar. The roster is hidden; the facilitators get one line
   under the table. The foot is the sheet (`position: sticky`, bottom 0) where
   the viewport is at least 47 rem tall (a media query, at the reader's default
   size): phones 800 px tall and up pin, a 740 px phone and an iPhone SE do
   not. The tallest sheet is 23.75 rem (a 430 px phone, five full cards a row),
   so `scroll-padding-bottom: 24rem` keeps focus clear of it (2.4.12).
5. **The header is one row**: the mark, the chip with Copy link as its icon
   alone (accessible name "Copy link", a 44 px target unseen), and a ☰ button
   that discloses the role sentence, its switch and Leave (Disclosure).
   "Pointing Poker" is hidden. "Link copied" takes the room id's place in the
   chip for its 2 s (J6).
6. **The deck reflows in balanced rows**, by container queries on the deck's
   own width: 5, 5 and 3 cards; 7 and 6 from 22.25 rem (seven 44 px cards and
   their gaps); one row of 13 from 41.75 rem. A card is never under 44 px nor
   over the wide page's `--deck-card`. The rule holds in the band too.
7. **A multi-row slot keeps the deck's height through a reveal**, computed in
   CSS from the deck's columns and card width (`calc()` on `cqi`), the deck's
   gaps and one extra `--space-2` above it. That top line holds the voter's
   progress at its left (a later step's, text only) and the kept tag at its
   right, clear of a lifted card.
8. **The result in a multi-row slot**: "Most voted" on two rows (the label
   and the count, then the figure, a tie's list at the 2xl step, or "Tie" or
   "None"); the bars fill what is left, the tallest at most `--deck-card`. The
   figures share a baseline, the empty ones and the counts at
   `min(var(--text-lg), var(--value-fit))`.
9. **The round bar is one row**: the phase word, Clear as its icon (set apart
   as 3b1 decision 6), then the phase's main action with its word. Show votes
   and Re-vote keep their words today; once Next issue exists (step 5),
   Re-vote becomes its icon, and below about 21 rem Next issue's visible word
   shortens to "Next", its name staying "Next issue" (WCAG 2.5.3). Every icon
   keeps an accessible name.
10. **The deck leaves at a reveal**, the result taking its place, as on the
    wide page. No deck stays frozen anywhere.
11. **The table's entries are at a fixed scale of 0.8**, their names at the
    xs step: the table flows with the page, so it has no height to fill.
12. **The issue**: a link breaks only before a path slash or after a dot in
    its host, at every width (3b1 decision 4 extended). Edit is the pencil
    alone, its name "Edit issue" kept.
13. **The facilitator's page follows the voter's rules**, the slot holding no
    deck but as tall as a voter's: nothing while voting until the progress
    step fills it, the result once revealed.

**What later steps inherit**

14. **The shared screen is the wide layout.** A larger screen matches the
    laptop target at about 125% (1080p) to 170% (4K at 100%) zoom, which stays
    wide; zoom past that may degrade the layout but never breaks it. This
    replaces principle 4's last row.
15. **Constraints**: the progress (a later step) sits on the top line below
    65.75 rem; step 5's Next issue follows decision 9; step 9's round history
    sits at the phone layout's end, after the round bar, to confirm in its own
    design; a feature that needs the roster below 51.75 rem brings it back or
    uses the room the phone layout has.

## Disclosure

The ☰ is a disclosure: a button with `aria-expanded` and the list after it in
the DOM, not an ARIA menu. Its items are the role sentence, the switch and
Leave.

| Event | Closed | Open |
| --- | --- | --- |
| Tap or Enter on ☰ | open, focus stays on ☰ | close, focus stays on ☰ |
| Escape | nothing | close, focus to ☰ |
| Tap outside the list and ☰ | nothing | close, focus where tapped |
| Tab out of the list | cannot happen | stays open |
| Switch | cannot happen | the role changes, close, focus to ☰ |
| Leave | cannot happen | the lobby, as today |
| Role changed from another tab | the sentence follows | the sentence and switch follow, stays open |
| Banner, reconnect or phase change | nothing | stays open |
| Width crosses 51.75 rem | ☰ shows or hides | hidden with ☰; open again if the width comes back |

Accepted: the last cell keeps the open state while the wide header shows,
which needs a resize across the threshold with the list open.

## Measured

At 390 by 844, 14 voters, Chromium:

- The sheet is 344 px voting (41%), the same revealed; 10 of 14 entries show
  above it at load (8 at scale 1).
- The kept tag fits the 22 px above a deck's first row; it touched the
  top-right card by 1 px and its hover lift before the extra `--space-2`.
- The header is 61 px; the chip with the longest room id fits beside ☰.
- A Jira link takes 2 lines, not 3 broken inside its host.

In the band, at 960 by 900 and 960 by 1600 (59 rem), all 14 entries show and
the page does not scroll, with a three-way tie, Next issue and the progress
drawn. At 1000 by 700 the table shows 7 of 14 and scrolls in its region.

## Accepted costs

- The band on a short window: the two-row slot takes the table's room, so it
  scrolls in its region sooner (7 of 14 at 1000 by 700).
- Until the progress step fills it, a reveal grows the facilitator's sheet
  over the table; scrolled to the very end, the round bar moves down.
- The kept tag sits on the top line, away from its card; the kept frame marks
  which card.
- The phone layout reaches 843 px windows, where it is a wide phone.
- 120 or 140 rem would leave 1440p or 4K at 100% uncapped; 106 was chosen on
  the user's screen and is one token to tune on feedback (about 140 rem is the
  ergonomic edge of eye movement without turning the head).

## Contract

No e2e case changes. Every case but one runs at the default viewport, in the
wide layout. `slug.spec.js`'s phone case, at 390 by 844, waits for a visible
Show votes, votes from the deck and dismisses a banner: the sheet keeps the
first two in view and above the page, and the banner stays in the flow under
the header. Step 4 runs it.

## The docs' changes

- **Parent**: principle 4's last row gives way to decision 14; step 3's
  paragraph points here and says the deck leaves at a reveal at every width;
  the phase line's "where one stays after a reveal (3b2)" goes.
- **Reference**: L5, L10 and L11 leave Open for a section on the phone layout,
  the band and the cap; the frozen deck's rules go (the "Revealed, where a deck
  stays" row, J8's frozen deck); Open gains the issue at full width in the band
  (dropped until users find two-line issues annoying) and a shortened issue
  shown on a phone (the Jira key, the text kept); the log gains a 3b2 entry
  with what was set aside, which the plan lists.
- **Mockup**: `room.html` draws the three layouts and the cap; `tokens.css`
  gains `--page-max`, the narrow entry scale and the sheet's focus padding.

## Branches and commits

One PR on `20260930.ui_refresh_3b2_narrow_and_large`, stacked on 3a2's
`20260930.ui_refresh_3a2_root_height` (#446): this document and the parent's
change first, then the tokens and the mockup, then the reference.
