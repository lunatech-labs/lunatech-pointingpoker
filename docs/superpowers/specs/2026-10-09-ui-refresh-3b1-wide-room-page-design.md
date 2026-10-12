# UI Refresh, Step 3b1: The Wide Room Page

Date: 2026-10-09
Status: In discussion
Parent: `docs/superpowers/specs/2026-09-30-ui-refresh-design.md`, step 3

## Purpose

Step 3b1 decides the wide room page: the reference's L1, L2, L3, L4, L6, L5's
card size and L11's breakpoint for this page. The look is the mockup,
`docs/design/room.html`, with its layout cells side by side in
`docs/design/room-cells.html`. This document holds the rules and the
trade-offs; the reference's decisions log keeps the reasons and what was set
aside, and its J10 points here. The reference's Terms and rules apply and are
not repeated.

The step adds no state. Every element it draws is a function of the snapshot,
the role and the viewport, but the toggle's 1 s window (decision 6) and the
copy hint's 2 s timer, which is today's.

## Terms

- **Floor**: the 1280 by 600 viewport, principle 4's height floor for the wide
  layout.
- **Comfort target**: the 1280 by 680 viewport, provisional until a Windows
  laptop is measured.
- **Wide layout**: this page, wherever it has at least 68.25 rem of its own
  width.
- **Panel**: a content surface: the messages, the issue, the round, the table.
- **Slot**: the round panel's area under the phase line, which holds the deck,
  the progress or the result.
- **Entry scale**: the factor every entry in the table is drawn at, from 1 to a
  deck card's height.
- **Progress step**: the step 5+ candidate that adds the count (decision 11).

## Decisions

**Heights and widths**

1. **Two heights replace J1's one.** At the floor, with an issue of up to two
   lines, the page never scrolls, and the issue, the phase line, the actions and
   the slot are wholly in view; only the table may scroll, in its own region. At
   the comfort target 14 entries are in view too; a 15th scrolls the table.
   The table never gets less than 5 rem (its title and a strip of cards); past
   that, with a longer issue, a notice or below the floor, the page scrolls as
   well, so nothing is out of reach. This reopens principle 4's table, which
   let the table flow with the page in those cases. The table region takes
   focus, so a keyboard scrolls it in every browser.
2. **The wide layout holds from 68.25 rem of its own width**: the deck's 13
   cards and their gaps (62.1 rem) plus the panel and page padding (6.1 rem),
   rounded up to the quarter, so the number follows those tokens. It keeps no
   margin past them: a classic scrollbar takes 15 to 17 px from the page once
   it scrolls, which leaves half of a 2560 by 1440 monitor (1280 by 1300) 68.28
   to 68.39 rem; a window within a scrollbar's width above it still takes
   3b2's layout while the page scrolls (L11). Narrower, the deck pushed the actions out of the panel and the toggle moved on a reveal. It is a
   container query, since a media query in `rem` reads the default size, not
   the root. Below it, 3b2's layout takes over.

**The page (L1)**

3. **Four bands on paper-pale: the header, then three paper-warm panels**: the
   issue, the round and the table, each with a hairline edge. While a problem
   or a notice shows, the banners sit in a panel of their own above them, each
   in J6's look, since a notice's paper-pale ground vanishes on the page; its
   place, stacking and Dismiss are 3b3's: its live region stays mounted while
   no banner shows, so a screen reader hears the first one, and a banner
   arriving while the page is scrolled comes into view, since scroll anchoring
   otherwise keeps it above the view.
4. **The issue** is at J7's 4 m step and is never cut. An issue that is a link
   breaks only before a single slash, each path segment kept whole, so a ticket
   key never splits; free text wraps at spaces, and a word wider than the line
   anywhere. The issue panel keeps no inner padding of its own. Step 9's recent
   rounds sit in one line under the issue; how an issue is shortened, there and
   for the current issue, is step 9's.
5. **The round panel**: the phase line and the actions on one line, the slot
   under them.
   - The phase line: the phase in the label style, as an `h2`, then a sentence
     in ink that says the way out: "Votes stay hidden until someone shows
     them." and "Talk it through, then re-vote or move on."
   - The voter's slot holds the deck, then the result in its place: the deck
     leaves on a reveal, and the voter's own value shows on their entry.
   - The facilitator's slot appears on a reveal and the table moves down, as
     today. Once the progress step lands, the slot holds the progress while
     voting and nothing moves on a reveal. No slot is ever shown empty.
6. **The actions keep fixed places, right-aligned**: Clear votes, quiet and
   set apart; Next issue's place (step 5), kept while voting from step 5 on;
   one button at the edge, Show votes while voting and Re-vote once revealed.
   No button takes another's place, and the tab order is the visual order. For
   1 s after it changes meaning the toggle is `aria-disabled`, its look and its
   focus kept, so a click meant for Show that lands after the page flipped (an
   auto-reveal, someone else's Show, a slow page) cannot re-vote the room, nor
   can a double-click; a held Enter fires it once, as on the role line. A
   Re-vote already sent can still land after another one (known issues, "A
   late Re-vote unconfirms a vote cast in the round it reopened").

**The header (L6)**

7. **The brand mark, the room id with Copy link attached, the copy hint, the
   role line and Leave.** The brand mark is the card back of the table's marks
   in burgundy, the Lunatech glyph in place of its pip, pending marketing's
   approval; the fallback is the plain card back. The app's name leaves the
   header. The copy hint is J6's plain text, right after the room id.
   Headings: `h1` the room id; `h2` the issue, the round's phase and the
   voters.

**The table (L2, L3)**

8. **Entries are cards with the name under them.** While voting: the outline,
   the solid fill with a fine inset and a small diamond pip (a hairline and a
   pip, never a band), or the kept frame. Once revealed: a face up, outlined,
   the value in ink; a kept value with J3's band outside the face and no tag;
   "–" in a faint outline for no vote. The "–" and the kept band are named
   marks outside `participant-estimation` (J3). The title is "Voters · 14";
   facilitators share its line, absent with none. Every line that names people
   names two, then "and 3 more" (principle 4).
9. **The voter's own entry** shows the name in bold followed by "(you)", which
   also tells two people of one name apart. Never on the facilitator's page,
   which the room watches.
10. **The entry scale fills the table**: the largest that fits, never past a
    deck card's height (5.5 / 3.85, about 1.43), in steps of 0.02, the rows
    balanced (7 and 7, not 12 and 2). It is a pure function of the revealed
    phase's table box in whole pixels, the count and the names' widths, so a
    reveal changes no entry, and it reruns when any of them changes: the
    table's box is watched (a resize, an issue edit, a role switch, a banner, a
    wrapped line), as are the snapshot and font loading. The table keeps its
    scrollbar's gutter, so its width never depends on whether it scrolls. Its
    outcome moves by a few pixels between browsers, which measure text and
    scrollbars differently, so step 4's cases check its guarantees, never a
    scale or a row count at a given size.
11. **Progress (L2)**: in step 4 the table is the progress. The count is the
    step 5+ candidate, one component in two places: on the voter's page a line
    beside the table's title; on the facilitator's page the slot while voting,
    at J7's 4 m step, with the waiting names. Both go once revealed.

**The result (L4) and the cards (L5)**

12. **The result is the deck's 13 values as columns**, in deck order, on one
    baseline: bars on it, counts on the bars, values under it. It never scrolls
    and shows the spread by construction. Every reveal shows it: with no votes,
    the values stand alone and "Nobody voted" takes "Most voted"'s place. The
    chart is J7's one element at the 3 m step; the most-voted value is at the
    4xl step;
    a count reads "×2", its sign out of the text, and each column is read as
    "5: 6 votes".
13. **The deck's cards are playing cards**, 5:7 and 5.5 rem tall (63 by 88 px
    at the floor), in one row of 13. A chosen card lifts half a rem, which
    leaves room for the kept tag. "0.5" sets its point tight wherever it shows,
    its text staying "0.5": the face needs it at every size and the chart at
    the narrow end, and one look serves all.
14. **The card back stays ink** (J4).

**Process**

15. **The mockup shows only what was decided.** Its "later steps" parameter
    shows the recent rounds, Next issue and the progress, dashed; its
    `message` parameter draws today's messages for 3b3.
16. **Step 3a2's inputs.** 3a2, "The root follows the height", comes after
    3b1 and before 3b2, judged by the contrast gate's tests, each change shown
    to fail, with its own spec. It moves the mockup's "3a2's tokens" block to
    the value source: the root `clamp(1rem, min(1.05vh, 0.82vw) + 0.5rem,
    1.75rem)` and every size this page adds, the mockup's rules using tokens
    only, but step 9's recent rounds. The gate's root check follows the new
    shape (`rootShape`, `unitOnlyOn`, the "vmin of 757" rule); `em` gains the
    tag's tracking and the tight point; `--paper-pale` gains its second role,
    the room page's ground, and the gate its pairs there: grey 7.15, burgundy
    7.06; `--card-back`'s comment loses "until 3b's choice". The root's reasons
    are in the reference's J2 log.

## Measured

On the mockup, both roles, with and without the later steps, in all four
phases, at 1280 by 600, 1280 by 680, 1512 by 749, 1280 by 1300 and 1472 by
1493: the page never scrolls, the slot, the actions, the phase line and the
issue are in view, the deck fits, 14 entries are in view and each role keeps
its scale through every phase.

| Viewport | Entry scale |
| --- | --- |
| The floor | 1.02, 1.00 with the later steps |
| The comfort target | 1.02 |
| 1512 by 749 | 1.24 to 1.36 |
| Both half monitors | 1.42, the cap |

- From 64 to 69 rem wide, at 600, 1000 and 1300 px tall, the deck and the
  actions hold from 68.13 rem and fail at 68.01; at 1280 by 1300 a classic
  scrollbar leaves 68.39 rem at 15 px and 68.28 at 17.
- A two-line issue (55 to 60 characters) keeps the floor still; a 128-character
  link scrolls the page 33 px at the floor, a 251-character text 135 px at the
  floor and 55 at the comfort target; 1280 by 420 scrolls, nothing cut.
- One banner keeps the floor still; two take the table to its minimum and
  scroll the page 46 px; once the page scrolls, the table keeps 13 px under
  it.
- No reveal changes the scale or the rows in 192 cases: 12 viewports, both
  roles, with and without the later steps, and four banner states.
- With classic scrollbars, at 1280, 1461 and 1472 wide and every height
  from 600 to 900, the table never scrolls from 680 up and a fresh load
  matches a resized page; the scale steps down only where the issue wraps or
  the root grows.
- The 480 by 270 tile reads every look. Under forced colours, light and dark,
  every look and the bars hold, and a focused chosen card keeps its ring.

`room-cells.html` and `room.html?probe=1` repeat each reading.

## Contract changes for step 4

- The deck leaves on a reveal: 'a revealed round takes no more votes until
  Re-vote' and 'a re-vote leaves the caster shown as selected but unconfirmed'
  (`room.spec.js`, a card read after a lone vote reveals), and 'a switch to
  facilitator drops the vote from the results' (`roles.spec.js`, the deck and a
  disabled card in a revealed round).
- `frozenNotice` reads "The round is revealed", which the phase line no longer
  says; its reads move to the phase line. The count of 0 on the facilitator's
  page would pass with the text gone, so it is rewritten, not dropped.
- The issue's read view is a heading holding the text, since a text box cannot
  wrap before a slash (decision 4); `issueBox`'s reads while viewing move to a
  fixture for that text, and the editing view keeps the textbox "Current
  issue" (3b3's). The edit button shows "Edit" and keeps the name "Edit issue".
- 'a Show in a room where nobody voted renders no summary' guards against an
  empty tally aborting the render; step 1c rewrites it to read no tally entry
  rather than a hidden region, which today's page passes, and step 4 adds the
  "Nobody voted" read.
- Facilitators leave the participant list for the table's title line, each
  named one an element with the test id `facilitator`. The five reads of
  `facilitatorMark(participantEntry(…))` in `roles.spec.js` become a read of
  that name on the line, matched exactly, as `participantEntry` matches a
  substring, and 'a switch to facilitator drops the vote from the
  results' reads that the switched person has no entry, not an empty
  estimation.
- The phase line is a `div` holding an `h2`; the progress and the phase line
  get test ids, as step 4 already plans.

## Accepted costs

- The comfort target rests on three Mac readings; a Windows laptop may move it.
- A long name grows its entry; the entry scale absorbs it, down to 1.
- On a tall window the table keeps empty height once the scale reaches a deck
  card's.
- The entry scale needs a script; step 4 writes it as decision 10's pure
  function, spiked first with scenario tests, 0 and 1 voters among them.
- The facilitator's table moves down on a reveal until the progress step lands.
- A third facilitator shows only in the count, as a third waiting voter does.
- A deliberate press of the toggle within 1 s of its change is ignored, a
  Re-vote right after a reveal or a Show right after a re-vote or a Clear, and
  a screen reader may call the toggle dimmed for that second.
- A banner panel takes 86 px with a problem and 106 px with a notice, about 40
  px more than a bare banner; at the comfort target a notice cuts the names
  under the cards.
- The brand mark waits on marketing; the fallback is ready.

## For the specialist

The minimal ink look; the presence of many black face-down cards; the revealed
faces outlined rather than filled; the phase in the label style.

## Branches and commits

One PR on `20260930.ui_refresh_3b1_wide_room_page`, stacked on 3a's
`20260930.ui_refresh_3a_tokens`, in three commits:

1. `docs: specify the wide room page (ui refresh step 3b1)`: this document and
   its changes to the parent spec, `docs/known-issues.md` and
   `docs/roadmap.md`, reviewed as their diff.
2. `docs: add the room page mockup (ui refresh step 3b1)`: `room.html` and
   `room-cells.html`.
3. `docs: give the design reference the wide room page (ui refresh step 3b1)`:
   J1 to J10, the Mockups, Tokens, Contract reads, Open and the decisions log of
   `docs/design/ui-reference.md`, reviewed as its diff.
