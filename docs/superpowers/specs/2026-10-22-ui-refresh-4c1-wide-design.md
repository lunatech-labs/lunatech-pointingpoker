# UI Refresh, Step 4c1-wide: The Wide Room Page's Look

Date: 2026-10-22
Status: In discussion
Parent: `docs/superpowers/specs/2026-09-30-ui-refresh-design.md`, step 4

## Purpose

The room page today is Bootstrap's rows and cards inside the legacy wrapper
(4c1-foundation decision 3). This step rebuilds it in `room.html`'s structure
on the area files 4c1-mockups moved into the app, so the room looks as 3b1's
spec decides (J10,
`docs/superpowers/specs/2026-10-09-ui-refresh-3b1-wide-room-page-design.md`),
and writes step 4's layout cases for the wide layout. The look is settled;
this spec decides how the page is built, where the step stops, and which
cases it writes.

## Terms

- **The area files**, **the mockups**: as in 4c1-mockups' spec.
- **A protocol voter**: as in 4c1-voters' spec.
- **The floor** and **the comfort target**: J1's 1280 by 600 and 1280 by 680.

## Decisions

1. **The whole room page at every width, but the editing view and the
   banners** (product owner's ruling). The area files hold the phone rules
   too, and below 51.75 rem `room-header.css` hides the role switch and Leave
   for ☰, so ☰ and its row, opening and closing on a press, come here, as
   does the phone's line naming the facilitators: no width loses a control.
   4c1-narrow adds ☰'s other closes (Escape, the window widening), the
   Firefox scroll above the pinned sheet and its cases; 4c1-editor gives the
   editing view and the banners J12's look. Until then both keep today's
   markup, each in its own legacy wrapper set into the new page. Set aside, and
   the fallback if this proves too much for one step: no ☰ until 4c1-narrow,
   the phone without Switch and Leave in between, as the stack deploys
   together.
2. **One component per CSS prefix, named after it** (product owner's ruling):
   `RoomPage`, `RoomHeader`, `IssuePanel`, `IssueEditor`, `RoundPanel` with
   `Deck` or `Result` in its slot, `RoundBar`, `Voters` and `Roster`, each in
   `frontend/src/components/` beside its area file, which it imports. A panel
   is suffixed only where its noun alone names something else: the issue is
   the text and the round its state. `Controls` becomes `RoundBar`, keeping
   4b's guard and press rules; `RoleLine` and its press rules serve the header
   and ☰'s row; `Participants` and `Results` give way to `Voters` and
   `Result`. Set aside: `Panel` on every panel, which renames 4c1-mockups'
   classes.
3. **Only the room leaves the wrapper.** The lobby keeps `container
   legacy-page` until 4c2. `base.css` imports `page.css` into `base`, before
   the fence (4c1-foundation decision 3), then `looks.css` unlayered, so the
   shared looks come before every area file whatever order the components
   load them in (4c1-mockups' plan, Review Focus 3; decision 10's diff
   checks it). Its unlayered `body` and `.room-header-id` rules leave it, now
   said by `page.css` and `room-header.css`.
4. **The entries' scale is a hook, `useFitEntries`** (product owner's
   ruling), doing what `room.html`'s `fitEntries` does: in a layout effect,
   so the first paint is fitted, and again when the panel resizes, the fonts
   load, or the voters, the phase or the role change, it searches the largest
   `--s` from 1 to the deck card that fits the panel, reserving the slot on
   the facilitator's page while voting (3b1 decision 5), and narrows the list
   so wrapped rows come out even. In the phone layout it clears its inline
   values, so the phone's fixed scale applies (moved here from 4c1-narrow by
   the product owner's ruling). Set aside: CSS alone, which cannot solve for
   the rows; a scale computed from the tokens, which a font or a long name
   breaks.
5. **lucide's icons, from `lucide-react`**, the names 4c1-wide-prep gave the
   mockups; the brand glyph is the mockups' SVG.
6. **The avatar's colours from the tokens.** `Roster` hashes the name as
   `room.html` does, so a name gets the same pair in both, and sets `--h`
   and `--t` to that pair's tokens (4c1-wide-prep decision 4).
7. **A `Figure` component draws a value** wherever one shows, the deck, the
   result, the entries and the roster, setting "0.5"'s point tight, its text
   still "0.5" (3b1 decision 13).
8. **The copy hint moves into the header** as a `role="status"` region,
   always rendered and empty but for the 2 s after a copy, as Appendix C
   says, leaving the alerts. `App` keeps its timer.
9. **Layout f only, and none of the later steps' parts** (my call): the
   slot below the table, as `room.html`'s default; g stays the open swap, the
   progress, Next issue and the recent rounds their steps'. The most voted
   keeps today's tie-break, the first of `votesSummary`.
10. **Also judged by a computed-style diff of the app against `room.html`**
    (my call): the app driven to the mockup's default states (its names, its
    issue, its sample votes, through protocol voters), each element paired by
    its path from `.room-page`, in Chromium at the cells pages' wide widths,
    1280 and 1000 px. The product owner rules on each difference, as in
    4c1-mockups. Expected ones: the text the mockup fakes, and the editing
    view and the banners, still today's.

## Accepted costs

- Until 4c1-editor the editing view and the banners keep Bootstrap's look
  inside the new page; until 4c1-narrow ☰'s row closes only on a press, and
  focus outside the phone's pinned sheet can stay behind it in Firefox.
- Until 4c2, Bootstrap's base rules still reach the new markup wherever the
  reset sets nothing, and `page.css`'s `html` and `body` reach the lobby
  (4c1-foundation's Accepted costs).
- The fit runs a layout per step of its search, about 10, on each trigger,
  as the mockups do.

## Contract

The changes are 3b1's "Contract changes for step 4" and the reference's
"Contract reads the look keeps", each made by this step, but the banners'
region "Messages", which comes with them in 4c1-editor. With them, the
reference's addition: at the third reveal of 'a session of rounds keeps the
summary honest across them', only Alice's and Bob's entries carry the kept
mark, and only Dave's the no-vote mark, each by J3's name. The reads the look
keeps stay as they are: `tally-value` and `tally-count`, the cards' names
("0.5" included), "Copy link" as a link, the role switches and Edit's name.

New cases, at the floor and the comfort target unless said, on the voter's
and the facilitator's pages, in both browsers, the room filled with protocol
voters, each case shown to fail against a layout breaking it (parent's step
4, its list):

- **No scroll at the floor**: in each phase, with 14 voters, 13 distinct
  values once revealed, an issue of two lines and no banner, the page does
  not scroll and the header, the issue, the slot and the round bar are
  wholly in view; at the comfort target every entry is too.
- **A longer issue scrolls the page and cuts nothing**: an issue of three
  lines at the floor scrolls the page, the table keeps its 5 rem, and the
  slot and the round bar scroll wholly into view.
- **The entries' scale**: it does not change through a reveal, never puts an
  entry past a deck card's height, and a room of 0 or 1 voters gets one.
- **Nobody voted**: a reveal with no votes shows "Nobody voted" and no tally
  entry, and the slot keeps its height.
- **Nothing moves with the room's size**: the header, the issue, the slot and
  the round bar keep their boxes between a room of 2 and a room of 14.
- **The phase line**: its box is the same before a reveal, after it, after a
  Re-vote and after a vote.
- **The copy hint**: a copy moves none of the header's elements nor the
  round's, its box overlaps none of them, it is a live region (step 1a's
  helper), and it reads "Link copied", then nothing.

The zoomed page, the switches' crossings, 320 px and the phone's copy hint
are 4c1-narrow's.

## The docs' changes

- **Parent**: none; 4c1-wide-prep's and 4c1-voters' changes name this step.
- **Reference**: Contract reads moves each change this step makes into the
  past tense, the "Messages" region left for 4c1-editor.
- **Known issues**: none expected; the plan checks.

## Branches and commits

One PR on `20260930.ui_refresh_4c1_wide`, stacked on 4c1-voters'
`20260930.ui_refresh_4c1_voters`: this document first, then the page in
the plan's tasks, the contract changes with the cases they rewrite, the new
cases, and the reference's change.
