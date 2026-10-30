# UI Refresh, Step 4c1-narrow-cases: The Narrow Layouts' Cases

Date: 2026-10-30
Status: Approved
Parent: `docs/superpowers/specs/2026-09-30-ui-refresh-design.md`, step 4

## Purpose

Step 4's layout guarantees have cases in the desktop layout alone: every
`layout.spec.js` case runs at 1280 wide, `narrow.spec.js` pins only ☰'s row
and the sheet's focus scroll, and `phone.spec.js`'s one case at 392 pins the
viewport meta (checked). The middle layout, the phone layout, 320 px and a
width crossing have none. By hand, nothing looks wrong at those widths
(product owner, 2026-10-30). This step adds their cases and changes no product
code. It holds no state, so it has no states x events matrix.

It also restates parent rules that drifted, and adds a test budget for this
step and every later one.

## Terms

- **Wide layout**, **phone layout**, **compact foot**: 3b2's Terms, unchanged.
  The wide layout is from 51.75 rem, the compact foot below 65.75 rem.
- **Desktop layout**: the wide layout from 65.75 rem, the laptop target's.
- **Middle layout**: the wide layout below 65.75 rem, with its compact foot.
- **The floor**: J1's height floor, 600 px.
- **Effective viewport**: the viewport in CSS px, zoom included. A zoomed page
  is a smaller viewport, as principle 4 says.
- **A journey**: one case that walks a round and checks a guarantee at each
  stop.

## Decisions

1. **A test budget** (product owner's ruling), in the parent as principle 11
   for every step from here on. CI takes about 10.5 min, 411 s of it the 318
   browser cases on 2 workers (checked, the 4c1-narrow-keys run), and a stacked
   merge pays it once per PR. Layout cases run in Chromium alone, and both
   browsers only where they are known to differ, such as Firefox's focus
   scroll. One setup checks several guarantees, each still failed by its own
   mutation. One width stands for each layout. Set aside: `layout.spec.js`'s
   pattern, each guarantee at two roles, two browsers and two heights, about 95
   cases for this step against about 12.
2. **The middle layout never scrolls at or above the floor, as a goal**
   (product owner's ruling). The rule was written when "wide" meant the
   desktop; the compact foot later stretched the wide layout down to 51.75
   rem. A step may give the goal up by weighing it in its spec and listing the
   contract change; the desktop layout's rule stays a guarantee. Its case runs
   at 860 by 600, near the band's narrow edge (828 px): a middle width that
   fits there and scrolls wider is a bug of its own. Measured 2026-10-30 at
   860, 960 and 1040 by 600, both browsers, both roles and phases, 14 voters:
   no scroll. Set aside: the guarantee in full; no rule for the band.
3. **Guarantees are stated by effective viewport** (product owner's ruling),
   reopening step 4's zoom bullet. The uses are a laptop at 100%, 1280 by 600
   to 700; a 1920 by 1080 screen at 100% or 150%, shared, about 1280 by 630 at
   150% (inferred, the browser's chrome taken off); a 4K screen at 100 to
   200%. Each is the desktop layout at or above the floor, which
   `layout.spec.js` pins. The facilitator's page at 150% of the laptop, 853 by
   400, is no use, and its "result in view" fails today: 115 of the slot's 187
   px show, and 5 px are cut at 853 by 467 and 16 at 981 by 469, the headline
   always in view (measured). It goes. "At 200% it scrolls only vertically"
   stays, as 640 by 300 in the sideways case (measured: no sideways scroll).
   The progress's part waits for the progress step.
4. **The phase line waits for the progress step outside the desktop layout**
   (product owner's ruling), reversing Appendix C's "reserved by sizing" for
   now. The line holds one heading whose height never changes (checked,
   `RoundBar.tsx`), and below 65.75 rem its left edge is held by its order,
   Clear votes taking `margin-left: auto` (checked, `round-bar.css`). So
   neither a `min-height` nor a case of its place and height could fail
   today. The progress step puts the progress on that line and can show both
   matter. The line is as wide as its text there (`flex: none`), so a later
   case compares its place and height, not its width.
5. **One journey per layout** (product owner's ruling), the middle at 860 by
   600 and the phone at 392 by 800, `narrow.spec.js`'s width, the crossing the
   phone journey's last stop. A journey's failures name the case alone; each
   assertion carries a message naming its guarantee (my call). Set aside:
   Appendix C's phase line check at 320 px; 392 stands for the phone layout,
   and 320 px gets the sideways case alone.
6. **A crossing compares with a reload**: at each size the page's boxes are
   read, the page reloaded, which keeps its size, and read again. The case
   writes no expected sizes, so a later look change leaves it alone. Set
   aside: expected boxes per width; a second tab, which `newTab` opens at the
   context's size, so it would cross too (checked, `fixtures.js`).
7. **The existing cases stay unchanged** (product owner's ruling): the five
   that the inventory suspected of passing with their mechanism removed are
   another step's, if any.

## Contract

The new cases go in `layout.spec.js`, beside the helpers they use, as plain
`test`s rather than its `cases()` wrapper, in a `describe` skipped outside
Chromium by `test.skip(({ browserName }) => browserName !== 'chromium')` (my
calls). Each is
shown to fail by the mutation named, applied by hand and reverted, the task
report listing the failing line, as 4c1-narrow-keys' plan did. If a case's
setup does not fail under its mutation, the plan stops and the case comes back
here (my call). A two-line issue for 860 sits beside `TWO_LINES`, which is cut
for 1280 and wraps to three below 1040 (measured: 66 characters at 860).

The journeys' room (my calls): Alice's voter page and Bob's facilitator page,
with 13 protocol voters, `NAMES` without Bob, voting 13 distinct values; so 14
voters and Bob no entry. Bob presses Show votes and Re-vote.

**The middle journey**, 860 by 600, both pages:

1. A room of 2 grows to 14: the header, the issue, the round bar and the slot
   (voter) or the table's top (facilitator) keep their boxes (killed by the
   table's region growing past its least height into the page).
2. At 14 with the two-line issue, voting: neither page scrolls, every part in
   view (killed by the compact foot's rules removed).
3. A reveal: the voter's entries keep their scale; neither page scrolls; Show
   votes is absent (killed by a refit on reveal; a "Show votes" kept beside
   Re-vote). The facilitator's page refits, as 3b2 accepts below 65.75 rem.
4. The roster: the facilitators are its last rows, after every voter (killed
   by facilitators sorted with the voters).
5. Re-vote, then a reveal where nobody voted: "Nobody voted" shows and the
   slot keeps its height (killed by the compact slot's height rule replaced by
   its content's height).
6. `LONG`: the page scrolls, the table keeps its 5 rem, and the slot (voter)
   and the round bar can be scrolled to (killed by the table's least height
   removed).

**The phone journey**, 392 by 800, both pages, boxes read at scroll 0 in
viewport coordinates, the two-line issue:

1. The "Facilitators: …" line follows the voters (killed by the line drawn
   before them).
2. Middle stop 5, with its mutation.
3. The crossing, on Alice's page, voting again after Bob's Re-vote: resized
   to 860, 1280, 860 and 392, all 800 tall, at or above the floor and pinning
   the sheet (my call). At each size, before and after a reload (decision 6),
   the case waits for 14 entries, scrolls to 0 and reads through `readBoxes`
   the header, the issue, the table, the slot, the round bar and the entries'
   computed `--s`: the boxes match within 0.5 px and the `--s` is equal. Killed by the table's observer disconnected after
   its first callback, and, entering the phone layout, by `fitEntries`' phone
   branch keeping the wide fit's `--s`. If the fit depends on its history, the
   plan stops and the case comes back here.

Set aside for the phone (checked): the sheet from 2 to 14, which moves by
design, sticky, in the flow on a short page and pinned once the page outgrows
the viewport; the header and the issue from 2 to 14, nothing that grows
sitting above them; the no-scroll checks; the scale
through a reveal, fixed at `--entry-scale-narrow` with `fitEntries` returning
early; the table's 5 rem, the table flowing with the page; the round bar
pinned at a long issue, `narrow.spec.js`'s `tableBehindPanel`; Show votes,
the same on every width.

**The sideways case**, at 320 by 640 and at 640 by 300: Alice and Bob join,
then load the room with `?moved=1&restarted=1`, which `App.tsx` reads on load,
so no restart (checked; `join` takes no query); one protocol voter is named 60
characters without a space, which nothing caps (inferred from a search); the
two-line issue; voting and revealed, both pages: the page never scrolls
sideways, `scrollWidth` at most the viewport's width (killed by the voters'
names losing `overflow-wrap: anywhere`, and by `white-space: nowrap` on
`.alert`). At 320, a copy of the link: the room id is hidden while "Link
copied" shows; the header, the issue, Copy link and ☰ keep their boxes; and
the hint's text, read through a `Range` since its box spans the chip's cell,
overlaps neither Copy link nor ☰ (killed by the hint's `grid-area: 1 / 2`
removed, which gives it a row of its own, and by the room id kept beside the
hint). Set aside: the third banner, a connection message or a lobby error,
the same `div.alert` in `Alerts.tsx`'s wrapper as moved and restarted
(checked).

## Accepted costs

- A layout break in Firefox alone goes uncaught (decision 1), until a hand
  test or a user finds it.
- A failing journey stops at its first broken stop, hiding later ones until
  that one is fixed.
- The laptop at 200%, 640 by 300, drawn in the phone layout, has the
  facilitator's round bar below the fold at load; the parent allows it.
- 1920 by 1080 at 150% sits between the floor and the comfort target: with 14
  voters the table scrolls inside itself (inferred).
- The compact slot's least height goes untested: at 860 and 392 the deck's
  rows are taller (inferred from the tokens). It sets the height on a
  7-column deck, such as a phone page above about 430 px.

## The docs' changes

- **Parent**: Terms gain the desktop and middle layouts. Principle 4's table:
  the "wide layout at or above the floor" row becomes the desktop layout's, a
  middle-layout row says decision 2's goal, the narrow layout's row becomes
  the phone layout's, and the shared-screen row goes, since by effective
  viewport the other rows cover a zoomed screen. Principle 5's zoom bullet
  becomes "Browser zoom is the facilitator's own lever; a zoom gives the
  layout of its effective viewport (principle 4)". Principle 11 is decision
  1's budget. Step 4's zoom bullet becomes decision 3's uses; the "result in
  view" at 150% goes. Appendix C's phase line reserve points to the progress
  step, and the progress step among the steps after 5 notes the reserve and
  the phase line's cases outside the desktop layout (decision 4). The steps
  table's row for this step drops "but for its listed contract changes".
- **The 4c1-editor row** gains "the field as 3b3 decision 7's wrapping
  `<textarea>`", which today is an `<input>` (checked, `IssueEditor.tsx`).
- 3b2's spec, delivered, stays as written.

## Branches and commits

One PR on `20260930.ui_refresh_4c1_narrow_cases`, stacked on
`20260930.ui_refresh_4c1_narrow_keys` (#471): this document with the docs'
changes first, then one commit per case.
