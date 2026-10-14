# UI Refresh, Step 3b1: The Wide Room Page

Date: 2026-10-09
Status: In discussion
Parent: `docs/superpowers/specs/2026-09-30-ui-refresh-design.md`, step 3

## Purpose

Step 3b1 decides the wide room page: the reference's L1, L2, L3, L4, L6, L5's
card size and L11's breakpoint for this page. The look is the mockup,
`docs/design/room.html`, with its layout cells side by side in
`docs/design/room-cells.html`. It is the designer's visual language (his
Figma, 2026-10): Inter, white panels with rounded corners and a soft shadow on
paper-pale, his red family, a participants sidebar. The rules of this
document's first version hold on top of it: the fit, the entry scale, the
round bar's guard, the banners, the breakpoint and the contract. This document
holds the rules and the trade-offs; the reference's decisions log keeps the
reasons and what was set aside, and its J10 points here. The reference's Terms
and rules apply and are not repeated.

The step adds no state. Every element it draws is a function of the snapshot,
the role and the viewport, but the round bar's 1 s window (decision 6) and the
copy hint's 2 s timer, which is today's.

## Terms

- **Floor**: the 1280 by 600 viewport, principle 4's height floor for the wide
  layout.
- **Comfort target**: the 1280 by 680 viewport, provisional until a Windows
  laptop is measured.
- **Wide layout**: this page at or above its breakpoint (decision 2).
- **Panel**: a content surface, white with rounded corners: a banner, the
  issue, the table, the slot, the round bar, the roster.
- **Slot**: the panel that holds the deck, the progress or the result.
- **Round bar**: the panel at the foot of the column that holds the phase line
  and the actions (decision 5), the region "Round". A chart's bars and a
  banner's bar are other things.
- **Roster**: the sidebar's list of the room's people, one row each (decision
  17).
- **Entry scale**: the factor every entry in the table is drawn at, from 1 to a
  deck card's height.
- **Progress step**: the step 5+ candidate that adds the count (decision 11).

## Decisions

**Heights and widths**

1. **Two heights replace J1's one.** At the floor, with an issue of up to two
   lines, the page never scrolls, and the issue, the slot and the round bar are
   wholly in view; only the table may scroll, in its own region. At
   the comfort target 14 entries are in view too; a 15th scrolls the table.
   The table never gets less than 5 rem (its title and a strip of cards); past
   that, with a longer issue, a notice or below the floor, the page scrolls as
   well, so nothing is out of reach. This reopens principle 4's table, which
   let the table flow with the page in those cases. The table region takes
   focus, so a keyboard scrolls it in every browser.
2. **The wide layout holds from 65.75 rem of its own width**, where the deck's
   13 cards at their narrowest (decision 13), their gaps, the paddings and the
   sidebar fit, so the number follows those tokens. It is measured at 65.63
   rem and rounded up to the quarter. Narrower, a card would be under the
   touch target. The page keeps its scrollbar's gutter, as the table does
   (decision 10), so its width never depends on whether it scrolls, and no
   window alternates between the two layouts as a scrollbar comes and goes;
   with a classic scrollbar the window needs 15 to 17 px more, and both half
   monitors (1280 by 1300, 1472 by 1493) keep the wide layout. It is a
   container query, since a media query in `rem` reads the default size, not
   the root. Below it, 3b2's layout takes over.

**The page (L1)**

3. **Four areas on paper-pale.** The header; the banners, full width under it;
   then the column and, at its right, the sidebar, which holds the roster
   (decision 17) and later step 9's recent rounds at its top. The column holds
   the issue, the table, the slot and the round bar, in that order (layout f); g, the
   slot above the table, is the open swap, a panel swap cheap to make after
   the users' feedback. Each message is a banner panel of its own, with no
   panel around them, each with the hairline every panel has: a problem in
   burgundy-deep on burgundy-tint with a burgundy-deep bar, a notice in
   notice-ink on notice-ground with its icon and bar in notice-bar; J6's rule holds, the
   icon and the words carry the tone. Each keeps today's role, `alert` for a
   problem and `status` for a notice, in the region "Messages"; how the region
   mounts, stacks and dismisses is 3b3's. A banner arriving while the page is
   scrolled stays above the view, as the browser's scroll anchoring keeps it:
   bringing it into view would move the deck and the round bar under the
   pointer. The gap below the banners is their own, so no box around the view
   changes and anchoring holds.
4. **The issue** is at `--text-lg`, a heading's size, and is never cut; it
   leaves principle 5's list of what the room reads from afar, since the room
   hears it and remote people read it on their own screen. An issue that is a
   link breaks only before a single slash, each path segment kept whole, so a
   ticket key never splits; free text wraps at spaces, and a word wider than
   the line anywhere. An empty issue reads "No issue yet", in grey at regular
   weight, at the same size, so the panel keeps its shape. How an issue is shortened, in the
   recent rounds and for the current issue, is step 9's.
5. **The round bar and the slot.** The round bar holds the phase line, now the phase's
   word alone, "Voting" or "Revealed", in the label style as an `h2`, then the
   actions at its right. It reads as the round's status, and stays step 4a's
   live region. The slot has no heading line of its own.
   - The voter's slot holds the deck, then the result in its place: the deck
     leaves on a reveal, and the voter's own value shows on their entry.
   - The facilitator's slot appears on a reveal and the table gives it its
     height. While voting the table keeps that height in its minimum, so the
     page is as tall in both phases: where room is short, the page scrolls
     while voting, and the reveal moves nothing below the table. Once the
     progress step lands, the slot holds the progress while voting. No slot is
     ever shown empty.
6. **The actions, right-aligned, and the round bar's guard.** Clear votes,
   quiet and set apart, then the toggle at the edge, the primary in both
   phases: Show votes while voting and Re-vote once revealed. From step 5,
   Clear votes, the toggle, then Next issue at the edge, shown once revealed
   and the primary there, since the primary marks the way forward and Re-vote
   loops; no place is kept for Next issue while voting. The tab order is the
   visual order. A flip of the phase changes what a press at any place in the
   round bar does, so the guard is on the bar, not on a button: for 1 s after
   the phase the page shows changes, whoever changed it, every action in the
   bar is `aria-disabled`, its look kept, and focus stays on the button that
   had it.
   A click meant for Show that lands after the page flipped (an auto-reveal,
   someone else's Show, a slow page) acts on nothing, nor does a
   double-click's second click, whichever button stands there, in step 4 and
   from step 5 alike; a held Enter fires once, as on the role line. A Clear
   while voting changes no phase and starts no guard. A Re-vote already sent
   can still land after another one (known issues, "A late Re-vote unconfirms
   a vote cast in the round it reopened").

**The header (L6)**

7. **The brand mark, the app's name, the room id with Copy link attached, the
   copy hint, the role line and Leave.** The brand mark is the Lunatech glyph
   in white on the deck's red card back, with a pale card offset behind it;
   the fallback is the plain back with its pip. The app's name stays, since
   "Pointing Poker" is the address's own words and helps a search find it. The
   mark, its colour, the name and any mention of Lunatech are a later branding
   change's. The copy hint is J6's plain text, right after the room id.
   Headings: `h1` the room id; `h2` the issue, the phase line, the voters and
   the roster.

**The table (L2, L3)**

8. **Entries are cards with the name under them.** While voting: the dashed
   outline, the red back with a fine white inset and a small diamond pip (a
   hairline and a pip, never a band), or the red kept frame. Once revealed: a
   face up, outlined, the value in ink; a kept value with J3's red band
   outside the face and no tag; "–" in a faint outline for no vote. The "–"
   and the kept band are named marks outside `participant-estimation` (J3).
   The title is "Voters · 14". The table holds voters only: facilitators are
   the roster's last rows (decision 17). Every line that names people names
   two, then "and 3 more" (principle 4).
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
    first step 5+ candidate, one component in two places and nowhere else: on
    the voter's page small in the round bar, just before Clear votes, as a
    separate element; on the facilitator's page the slot while voting, at the
    most-voted value's 4xl step, with the waiting names (the parent's
    candidate; `later=1` draws the count alone). Both go once revealed.

**The result (L4) and the cards (L5)**

12. **The result is the deck's 13 values as columns**, in deck order, on one
    baseline: bars on it, counts on the bars, values under it. It never scrolls
    and shows the spread by construction. Every reveal shows it: with no votes,
    the values stand alone and "Nobody voted" takes "Most voted"'s place. The
    chart is J7's one element at the 3 m step, a value shrinking only where its
    column is narrower (Measured); the most-voted value is at the 4xl step. A
    count is the bare number, muted but over the most-voted bars, and each
    column is read as "5: 6 votes". The most-voted bars are red, the others
    `--bar-other` (3:1). "Most voted" is a block sized to its content at the
    chart's left, in the slot, whose outer size is fixed, so a reveal moves
    nothing around it. Step 4 keeps today's tie-break, for the figure and the
    red bar alike (known issues, "A tied vote is broken by JavaScript key
    order"); the ties step's rule is the parent's candidate "Ties shown rather
    than broken".
13. **The deck's cards are playing cards**, 5:7, in one row of 13, centred in
    the slot. They shrink with the column, from 5.5 rem tall down to the
    height whose width is `--target-min`, so the sidebar costs the deck, not
    the breakpoint: 5.30 rem at the comfort target, 4.15 rem on half of a 2560
    by 1440 monitor, 3.86 rem at the breakpoint. A confirmed card lifts half a
    rem; the kept tag sits under its card. "0.5" sets its point tight
    wherever it shows, its text staying "0.5": the face needs it at every size
    and the chart at the narrow end, and one look serves all.
14. **The card back is red** (`--card-back`): the voted back and the kept
    frame. Red marks the toggle, the voted back and, once revealed, the
    most-voted bars; faces, figures, links and the focus ring stay ink, and
    states differ by shape, never by red against ink. The chosen card is the
    one red fill with text, its figure in white, so it takes the toggle's
    `--burgundy` (7.66 under normal vision, darkened by 3a2's decision 6),
    not `--card-back` (4.65).

**Process**

15. **The mockup shows only what was decided.** Its parameters are listed at
    the top of its script; `later=1` draws the recent rounds, Next issue, the
    progress and the tie rule, dashed, and `issue=` the empty issue.
16. **Step 3a2's inputs.** 3a2, "The root follows the height", comes after
    3b1 and before 3b2, judged by the contrast gate's tests, each change shown
    to fail, with its own spec. It moves the mockup's "3a2's tokens" block to
    the value source as it stands, the root `clamp(1rem, min(1.05vh, 0.82vw) +
    0.5rem, 1.75rem)` with it; a name `colours.css` or `tokens.css` already
    has is an override. What a diff of the block does not show: `--paper-pale`
    becomes the room page's ground, the own row's and the waiting pill's, while
    a notice's ground moves to `--notice-ground`; `--card-back`'s comment loses
    "until 3b's choice"; `--card-back` carries no text any more (decision 14),
    so the gate's pair of paper-warm on it becomes an indicator, 3:1;
    `--radius` is no longer 0 (J9); the weights are named by weight, not by
    font, Inter using 400 to 700; `tokens.css`'s `--font-mono` comment drops
    the figures (J7). Three of the block's values pass neither file's checks,
    and 3a2 decides each: the two shadows mix a colour with `px` lengths;
    `--value-fit` is in `cqi`, a container unit; `--tight-point` is in `em`,
    which the gate allows on the label tracking only. The gate's changes are
    3a2's spec's; the new pairs are in Measured, and the root's reasons in the
    reference's J2 log.

**The sidebar (E)**

17. **The roster lists everyone in the room, one row each**, titled
    "Participants · 16": a soft avatar, the name on one line with an ellipsis,
    then the state as a word at the right edge, never on the avatar:
    "Choosing…", "Voted" or "Not confirmed" while voting, the value once
    revealed, a kept one after a small "not confirmed" in `--kept`. Voters first, in the table's order, then the facilitators in
    step 1b's order, each marked "Facilitator", however many, so they are the
    first rows to scroll out of view. On the voter's page the own row is tinted
    and says "(you)", kept whole when the name is cut; never on the
    facilitator's page (decision 9). The avatar is
    the initials on a pale ground, in a hue hashed from the name over the whole
    wheel: decoration, `aria-hidden`, exempt from text contrast as incidental
    (J8); the name carries the information, and the avatars break up the red.
    The roster scrolls in its own region and takes focus, as the table does
    (decision 1); step 9's recent rounds join the sidebar above it.

## Measured

On the mockup, layout f, both roles, with and without the later steps, in all
four phases, with no banner, one and two, at 1280 by 600, 1280 by 680, 1512 by
749, 1280 by 1300 and 1472 by 1493: the page never scrolls, the issue, the slot
and the round bar are in view, nothing spills from the deck, the chart or the
round bar,
and each role keeps its scale through every phase.

| Viewport | Entry scale | Table |
| --- | --- | --- |
| The floor | 1.00 | 7 of 14 entries in view, 74 px to scroll |
| The comfort target | 1.02 | all 14 in view |
| 1512 by 749 | 1.40; 1.12 with one banner, 1.00 with two | all 14 in view |
| Both half monitors | 1.42, the cap | all 14 in view |

- The breakpoint, from 900 to 1400 px wide in steps of 4, then of 1 near it,
  at 600, 1000 and 1300 px tall, later steps shown, both roles and every
  phase: nothing spills from 65.6 rem of the page's own width (1050 px at 600
  tall, 1153 px at the 17.58 px root of 1000 and 1300; 1065 and 1168 px
  windows with Chromium's 15 px gutter). Nothing spills at 1263 by 1300 and 1455 by 1493 either, half
  monitors less a 17 px scrollbar.
- A 240-character issue keeps the page still: the table keeps 153 px at the
  floor and 233 at the comfort target. Just above the breakpoint, a 1068 px
  window, it keeps 130 px at the floor, and with a banner its 80 px minimum.
- Banners: one at the comfort target leaves 7 of 14 entries in view; at the
  floor one leaves the table 148 px and two its 80 px minimum, the round bar
  then 2 px into the page's bottom margin; the page never scrolls. With two
  and a 240-character issue, either page scrolls 31 px at the floor and 54 px
  at the breakpoint in both phases, and the round bar stays put through the
  reveal.
- No reveal changes the scale, in all 60 sets of four phases: five viewports,
  both roles, with and without the later steps, three banner states.
- A chart value is the smaller of `--text-2xl` and 66% of its column, so none
  overflows: 33 px at the comfort target, 28.2 px on a half monitor, 21.3 px at
  the breakpoint.
- Contrast under normal vision, the gate's new pairs: text at 7:1, grey on
  paper-pale 7.06 and on paper-warm 7.68, burgundy on paper-warm 7.66 both
  ways, burgundy-deep on burgundy-tint 7.05, notice-ink on notice-ground 9.38,
  ok on ok-tint 7.06, kept on kept-tint 7.15, on paper-warm 7.71 and on
  paper-pale 7.09, the own row's note; shapes at 3:1, card-back 4.65,
  mute-soft 3.69 and bar-other 3.20 on paper-warm, paper-warm on card-back
  4.65, notice-bar on notice-ground 6.07. 3a2's decision 6 darkens five of
  these values to pass under every vision.
- Under forced colours the voted card and marks, the bars, the banners' bars
  and the header mark hold.

`room-cells.html` and `room.html?probe=1` repeat each reading.

## Contract changes for step 4

- The deck leaves on a reveal: 'a revealed round takes no more votes until
  Re-vote' and 'a re-vote leaves the caster shown as selected but unconfirmed'
  (`room.spec.js`, a card read after a lone vote reveals), and 'a switch to
  facilitator drops the vote from the results' (`roles.spec.js`, the deck and a
  disabled card in a revealed round). In the last, `ownEstimation`'s count of
  0 after the switch back would pass on an absent deck, so it moves to Bob's
  entry on Alice's page: no estimation, the "No vote" mark shown.
- `frozenNotice` reads "The round is revealed", which the phase line no longer
  says; its reads move to the phase line. The count of 0 on the facilitator's
  page would pass with the text gone, so it is rewritten, not dropped.
- The issue's read view is a heading holding the text, since a text box cannot
  wrap before a slash (decision 4); `issueBox`'s reads while viewing move to a
  fixture for that text, and the editing view keeps the textbox "Current
  issue" (3b3's). The edit button shows "Edit" and keeps the name "Edit issue".
  The reads that are not text reads change too: 'the issue box is readonly
  until Edit issue is pressed' and 'Enter saves and Escape cancels'
  (`room.spec.js`) read `readOnly` while viewing, which becomes "no textbox,
  and the read view shows the text"; the second also listens for focus on the
  box before Edit is pressed. 'a save refused by a different instance
  recovers like any command' (`refusal.spec.js`) reads an empty value, which
  becomes the read view's "No issue yet".
- 'a Show in a room where nobody voted renders no summary' guards against an
  empty tally aborting the render; step 1c rewrites it to read no tally entry
  rather than a hidden region, which today's page passes, and step 4 adds the
  "Nobody voted" read.
- The table is the region named "Voters" by its `aria-label`, and holds the
  `participant` entries; the name "Participants" goes to the roster, a
  complementary landmark (`aside`), whose rows carry no `participant`, so a
  page-wide read never counts a voter twice. `participantEntries` reads the
  region "Voters". The round bar is the region "Round", the banners the
  region "Messages".
- Facilitators leave the table for the roster's last rows, the name in each an
  element with the test id `facilitator`. The five reads of
  `facilitatorMark(participantEntry(…))` in `roles.spec.js` become a read of
  that name in the roster, matched exactly, as `participantEntry` matches a
  substring, and 'a switch to facilitator drops the vote from the results'
  reads that the switched person has no entry, not an empty estimation.
- The copy hint reads "Link copied", not "Link copied to clipboard": with the
  longest room id it had 1 px to spare at the breakpoint. Its read in
  `room.spec.js` follows.
- The phase line is a `div` holding an `h2`, in the round bar, with the new
  test id `phase-line`, the element step 4a makes the live region. The
  progress's test id is the progress step's.
- The round bar's guard needs no case rewritten: Playwright waits while a
  button is `aria-disabled`, so a click right after a phase change lands
  about 1 s later. 'the reveal notice claims its space before the reveal'
  reads Show votes' box after the reveal, which falls under "Show votes is
  absent while revealed".
- The kept card keeps its description, "Previous vote, not confirmed", which
  `unconfirmedCard` reads (J3's tag leaves it unchanged).

## Accepted costs

- The comfort target rests on three Mac readings; a Windows laptop may move it.
- A long name grows its entry; the entry scale absorbs it, down to 1.
- On a tall window the table keeps empty height once the scale reaches a deck
  card's.
- The entry scale needs a script; step 4 writes it as decision 10's pure
  function, spiked first with scenario tests, 0 and 1 voters among them.
- The facilitator's table gives the slot its height on a reveal until the
  progress step lands (decision 5), and its entries, centred in it, move up
  50 to 80 px; centred in each phase was preferred to a fix the progress step
  would undo.
- A deliberate press in the round bar within 1 s of a phase change is
  ignored, such as a Re-vote or a Clear right after a reveal, or a Show right
  after a re-vote, and a screen reader may call the round bar's actions dimmed
  for that second.
- Banners cost the table (Measured). Every case is temporary: a problem means
  the room is not working, and a notice has Dismiss.
- On a narrow wide window the deck's cards are smaller, down to the touch
  target (decision 13), and a long issue takes the table's height first.
- A leave or a role switch during a reveal can shift the chart inside its slot,
  with the changed result.
- On a page scrolled down, a sighted reader sees a new banner only on
  scrolling up; a screen reader hears it at once. A browser without scroll
  anchoring (Safari, as far as known) moves the page by the banner's height
  instead.
- The roster repeats each voter's state in words, and no case reads it, so a
  roster that disagrees with the table would pass the suite.

## For the specialist

Open after the designer's review of 2026-10-13: layout f or g (decision 3),
after the users' feedback; the button's and the chosen card's darker red
(`--burgundy`) against his brighter one, after the users' feedback or his word
on the final layout.

## Branches and commits

One PR on `20260930.ui_refresh_3b1_wide_room_page`, stacked on 3a's
`20260930.ui_refresh_3a_tokens`: the first version's commits, then the
designer's look.

1. `docs: specify the wide room page (ui refresh step 3b1)`: this document and
   its changes to the parent spec, `docs/known-issues.md` and
   `docs/roadmap.md`, reviewed as their diff.
2. `docs: add the room page mockup (ui refresh step 3b1)`: `room.html` and
   `room-cells.html`.
3. `docs: give the design reference the wide room page (ui refresh step 3b1)`:
   J1 to J10, the Mockups, Tokens, Contract reads, Open and the decisions log of
   `docs/design/ui-reference.md`, reviewed as its diff.
4. `docs: plan the room page's new look (ui refresh step 3b1)`: the plan.
5. `docs: give the room page mockup the designer's look (ui refresh step
   3b1)`: the port of the designer's look, measured.
6. `docs: fix the room page mockup after its review (ui refresh step 3b1)`:
   what the port lost and what the review wave found, re-measured.
7. `docs: specify the room page's new look (ui refresh step 3b1)`: this
   document and the parent spec, reviewed by one wave.
8. `docs: give the design reference the room page's new look (ui refresh step
   3b1)`: the reference's sections and its decisions log.
9. `docs: fix the room page after its final review (ui refresh step 3b1)`: the
   kept amber, the chosen card's red and 3a2's open token values.
10. `docs: correct the room page's figures and wording (ui refresh step 3b1)`:
   the final review's minor findings.
11. `docs: plan the room chip and issue panel fixes (ui refresh step 3b1)`: the
   plan, after a comparison with the designer's draft.
12. `docs: fix the room chip and the issue panel's margins (ui refresh step
   3b1)`: the chip's size and the issue panel's margins, re-measured.
13. `docs: fix the room page after the chip and issue panel review (ui refresh
   step 3b1)`: the issue editor's margins and that review's findings.
