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
this spec decides how the page is built, where the step stops, and which cases
it writes.

## Terms

- **The area files**, **the mockups**: as in 4c1-mockups' spec.
- **A protocol voter**: as in 4c1-voters' spec.
- **The floor** and **the comfort target**: J1's 1280 by 600 and 1280 by 680.

## Decisions

1. **The whole room page at every width, but the editing view and the
   banners** (product owner's ruling). Below 51.75 rem `room-header.css` hides
   the role switch and Leave for ☰, so ☰ and its row come here, as does the
   phone's line naming the facilitators: no width loses a control. ☰ follows
   3b2's Disclosure table but for its Escape and width rows, which 4c1-narrow
   adds with the row's cases. Until 4c1-editor gives them J12's look and
   place, the editing view stays legacy inside the issue panel (decision 7)
   and the banners stay in `App`'s wrapper, above the room page (product
   owner's ruling, so they get both in one move). Set aside, and the fallback
   if this proves too much for one step: no ☰ until 4c1-narrow, the phone
   without Switch and Leave in between, as the stack deploys together.
2. **One component per CSS prefix, named after it** (product owner's ruling):
   `RoomPage`, `RoomHeader`, `IssuePanel`, `IssueEditor`, `RoundPanel` with
   `Deck` or `Result` in its slot, `RoundBar`, `Voters` and `Roster`, each in
   `frontend/src/components/` beside its area file, which it imports. `Room`
   becomes `RoomPage`, `Controls` `RoundBar`, keeping 4b's guard and press
   rules, and `Participants` and `Results` give way to `Voters` and `Result`.
   `RoleLine` goes: `RoomHeader` draws the header's sentence and ☰'s row's
   quiet button, both switching through one hook holding the press rule
   (product owner's ruling). `Figure` (decision 8) is the one component
   outside the prefix rule, its class `looks.css`'s `tight-point`.
3. **The room page renders beside `App`'s wrapper, which keeps the lobby and
   the banners.** The lobby keeps `container legacy-page` until 4c2.
   `base.css` imports `page.css` into `base`, then `looks.css` unlayered, so
   the shared looks come before every area file (4c1-mockups' plan, Review
   Focus 3; decision 12's diff checks it). `base.css`'s unlayered `body` and
   `.room-header-id` rules leave it, now said by `page.css` and
   `room-header.css`.
4. **The entries' scale is a hook, `useFitEntries`** (product owner's ruling),
   doing what `room.html`'s `fitEntries` does: in a layout effect, so the
   first paint is fitted, and again when the panel resizes, the fonts load, or
   the voters, the phase or the role change, it searches the largest `--s`
   from 1 to the deck card that fits the panel, reserving the slot on the
   facilitator's page while voting (3b1 decision 5), and narrows the list so
   wrapped rows come out even. In the phone layout it clears its inline
   values, so the phone's fixed scale applies (moved here from 4c1-narrow by
   the product owner's ruling). "The voters change" includes their names, as a
   longer name can wrap. The search, given whether a scale fits, and the rows'
   balance are pure functions with scenario tests, 0, 1 and 14 voters among
   the balance's, as 3b1's Accepted costs ask; the hook only measures (product
   owner's ruling). `room.html`'s script served as the spike, and its throw
   with no voter is fixed in the mockup too. Set aside: CSS alone, which
   cannot solve for the rows; a scale computed from the tokens, which a font
   or a long name breaks.
5. **lucide's icons, from `lucide-react`**, the names 4c1-wide-prep gave the
   mockups; the brand glyph is the mockups' SVG.
6. **The avatar's colours from the tokens.** `Roster` hashes the name as
   `room.html` does, so a name gets the same pair in both, and sets `--h` and
   `--t` to that pair's tokens (4c1-wide-prep decision 4).
7. **The issue's status region and press rules belong to `IssuePanel`**,
   around both views: the region (`issue-panel-status`, `role="status"`, test
   id `issue-status`) is rendered once, so 'the editor's notices are announced
   from one live region', which marks the region while viewing, still finds it
   after Edit; the double-click and focus-return rules of 4b2 keep one group
   around Edit, Save and Cancel. Two legacy wrappers keep today's look: one
   around the field, Save and Cancel, and one inside the region around the
   messages, rendered only with a message, so
   `.issue-panel-status:not(:empty)` still holds, and never around the region,
   which would re-create it. The mockup's markup follows.
8. **A `Figure` component draws a value** wherever one shows, the deck, the
   result, the entries and the roster, setting "0.5"'s point tight, its text
   still "0.5" (3b1 decision 13).
9. **The copy hint moves into the header** as a `role="status"` region, always
   rendered and empty but for the 2 s after a copy, as the parent's Appendix C
   says, leaving the alerts; `App` keeps its timer. The phone's rule hiding
   the note while empty goes, as `display: none` takes the region out of the
   accessibility tree and the copy would not be announced; nothing shows in
   its place, which a before-and-after diff of the mockup at 800 and 392 px
   checks, the app's diff linking the same file.
10. **Layout f only, and none of the later steps' parts** (my call): the slot
    below the table, as `room.html`'s default; g stays the open swap, the
    progress, Next issue and the recent rounds their steps'. The most voted
    keeps today's tie-break, the first of `votesSummary`.
11. **An issue that is a link is not clickable yet** (product owner's ruling):
    it keeps its segments, so it breaks only before a slash (3b1 decision 4)
    and, on the phone, after its host's dots (3b2 decision 12), as plain text;
    making it a link is the parent's improve 8, a step of its own.
12. **Also judged by a computed-style diff of the app against `room.html`**
    (my call, narrowed by the product owner's ruling): the voter's and the
    facilitator's pages, voting and revealed, at the mockup's default
    parameters, at the cells pages' four widths, 1280, 1000, 800 and 392 px,
    680 px tall, in Chromium, each element paired by its path from
    `.room-page`. Ivan, Peggy and Victor have pages, Peggy's compared as the
    facilitator's; the mockup's other voters are protocol voters. The mockup's
    font request is routed to the app's own font files, and both sides are
    read as the cases read (the Contract's preamble to the new cases), once
    each page shows its state. A throwaway script, as 4c1-mockups' was. The
    product owner rules on each difference. Expected ones: the text the mockup
    fakes, the issue not a link (decision 11), and Bootstrap's base rules
    where the reset sets nothing, such as the labels' line height and Copy
    link's underline (4c1-foundation's Accepted costs).

## Accepted costs

- Until 4c1-editor the editing view keeps Bootstrap's look inside the new
  page, and the banners sit above the header rather than below it, the page
  scrolling by a banner's height while one shows; until 4c1-narrow ☰'s row
  closes only on a press, an open row coming back open after a widen and a
  narrow, and focus outside the phone's pinned sheet can stay behind it in
  Firefox.
- The fit runs a layout per step of its search, about 10, on each trigger, as
  the mockups do.

## Contract

The changes are 3b1's "Contract changes for step 4" and those the reference's
"Contract reads the look keeps" adds, its `participant-estimation` read among
them, all but the banners' region "Messages", which waits for 4c1-editor. Two
more, found after 3b1's list:

- 'the room is drawn in Inter…' (`fonts.spec.js`) reads the name as a table
  `cell`, and reads the entry's name element instead;
- 'today's lobby stays centred and keeps Bootstrap's form spacing'
  (`fonts.spec.js`) measures against the viewport's width, which `page.css`'s
  scrollbar gutter, now reaching the lobby, narrows in Chromium, and measures
  against the root's `clientWidth` instead;
- 'an old UUID link opens its derived room under a banner that covers no card'
  (`slug.spec.js`) reads the lone voter's vote as the pressed card, gone with
  the deck once the vote reveals, and reads it as the most voted instead;
- 'the reveal notice claims its space before the reveal' (`room.spec.js`)
  guarded the slot's swap on a reveal, which layout f draws below the table,
  so it can no longer move the first entry; retitled 'a reveal with no vote
  moves no entry', it guards what sits above the table and the entries' scale,
  and 'nobody voted: the slot keeps its height through a reveal'
  (`layout.spec.js`) takes over the slot's guarantee.

A change the build turns up beyond these joins this list in the commit that
rewrites its case, and the PR names it. Every other read the reference's
"Contract reads the look keeps" lists stays, the new markup carrying it; this
step's reference change adds the reads it lacks: `most-voted`, `tally-value`
and `tally-count`, `issue-status`, the cards' names ("0.5" included), "Copy
link" as a link, the role switches and Edit's name, and the new cases' reads,
`round-slot` and the header's status. 4b2's double-click cases are shown to
fail again on the new page, by their mutation, since its geometry moves the
second click; so is 'a double-click's second click does not switch back'
(`roles.spec.js`), which aims at the switch drawn after the first switch, now
`RoomHeader`'s.

New cases, at the floor and the comfort target unless said, on the voter's and
the facilitator's pages, in both browsers, the room filled with protocol
voters, each case shown to fail against a layout breaking it (parent's step 4,
its list). A case first waits, retrying, for the page to show the state it
measures (the entry count, the toggle's text, a voted mark), then reads every
box in one call of a helper that waits for the fonts and two frames, so a swap
or the fit's rerun lands before the read. A case measuring voting leaves one
voter unvoted, as the vote completing a round reveals it. The slot is read by
its test id, `round-slot`, on `.round-panel-slot`; the facilitator's page
while voting has none, and its cases read the round bar and the table's top in
its place:

- **No scroll at the floor**: in each phase, with 14 voters, 13 distinct
  values once revealed, an issue drawn on two lines in each browser (the case
  checks it) and no banner, the page does not scroll and the header, the
  issue, the slot and the round bar are wholly in view; at the comfort target
  every entry is too.
- **A longer issue, or a window short enough, scrolls the page and cuts
  nothing**: at the floor an issue long enough to bring the table to its 5 rem
  (3b1's Measured: 240 characters are not), and at 1280 by 450 the floor's
  two-line issue (the mockup scrolls from about 480 px), each scroll the page,
  the table keeps its 5 rem, and the slot and the round bar scroll wholly into
  view.
- **The entries' scale**: it does not change through a reveal, never puts an
  entry's card past `--deck-card`'s height (3b1 decision 10's 5.5 / 3.85), and
  a room of 0 voters, on the facilitator's page, its "Voters · 0" heading
  shown, or of 1 is fitted.
- **Nobody voted**: the slot keeps its height through a reveal with no votes
  (its text and tally stay with 'a Show in a room where nobody voted renders
  no summary').
- **Nothing moves with the room's size**: the header, the issue, the slot and
  the round bar keep their boxes between a room of 2 and a room of 14.
- **The phase line**: its box is the same before a reveal, after it, after a
  Re-vote and after a vote.
- **The copy hint**: a copy moves none of the header's elements nor the
  round's, its box overlaps none of them, and it is a live region (step 1a's
  helper, the region found empty as the header's status and marked before the
  copy). On the real clock, since a fake one stops the helper's frames, its
  text is read before and after the boxes, so they were read while it showed;
  its 2 s stay with 'the copy hint lasts 2 s from the first copy, not the
  last'.

The zoomed page, the switches' crossings, 320 px and the phone's copy hint are
4c1-narrow's.

## The docs' changes

- **Parent**: step 4's text gives this spec's path, as it gives its siblings'.
- **Reference**: Contract reads moves each change this step makes into the
  past tense, the "Messages" region left for 4c1-editor, and gains the reads
  it lacks (Contract).
- **Known issues**: 'A reveal with votes still pushes the participants list
  down' and 'A tied vote is broken by JavaScript key order' cite today's
  components and the "Most voted estimation" heading; both follow the new
  page.

## Branches and commits

One PR on `20260930.ui_refresh_4c1_wide`, stacked on 4c1-voters'
`20260930.ui_refresh_4c1_voters`: this document first, then the page in the
plan's tasks, the contract changes with the cases they rewrite, the new cases,
and the reference's change.