# Progress

Date: 2026-11-06
Status: Approved
Parent: issue #517

## Purpose

While a round is open, whoever leads the meeting asks "has everyone voted?
Bob, Alice, you're the last ones". Today they count the table's marks to
know whom to call out. The lead may be a facilitator, or a voter in teams
where everyone votes, and the page may be on a shared screen.

The progress shows the count and the names still missing, and stops there:
which proportion is enough stays the facilitator's call (roadmap, #517).

Out of scope: announcing the result (#546), validating names (#504, #542),
Next issue (#548), round history (#528).

## Terms

- **Voted**: a voter whose estimate is confirmed (`voteState` `confirmed`).
  "k of n voted" counts these, so n of n is exactly when `complete` holds
  (`Room.scala`). Auto-reveal checks it only on a vote or a role switch
  (`latched`).
- **Not confirmed**: a voter holding the previous round's card after a Re-vote
  (`kept`). Only a Re-vote round has them.
- **No vote**: a voter with no card (`none`).
- **Voters**: the table's voters, members in their grace period included, as
  the table and `complete` count them.
- **Progress panel**: what the facilitator's slot holds while voting.
- **Name line**: one of the progress panel's two lists, "No vote: …" and
  "Not confirmed: …".

## Behaviour

**The table's heading.**

| Page | Voting | Revealed |
|---|---|---|
| Voter | `Voters · 4 of 6 voted` | `Voters · 6` |
| Facilitator | `Voters · 6` | `Voters · 6` |

The voter's count is the one the progress panel shows. Nothing else in the
table changes, and no line is added under it.

**The progress panel.** A pure function in `frontend/src/room/progress.ts`
takes the view's voters and returns the count, the bar's segments and each
name line's names; the component only lays it out. From top to bottom:

1. The count, `4 of 6 voted`, weight 700, sized as below.
2. The bar: one segment per voter, grouped voted, then not confirmed, then no
   vote, each drawn as the table's mark of that state (fill, frame, dashed
   outline), under forced colours too. `aria-hidden`: the words carry it. The
   frame and the dashes are outlines inside the segment, never borders, each
   with an `outline-offset` of minus its own width, so every segment takes
   the same length (decision 16). The bar is
   `--progress-bar` tall, `--progress-bar-narrow` on the phone; the frame and
   the gaps are `--progress-band`, the dashes `--line-mark` (decision 17).
3. The name lines, label in weight 600, names in table order:

| Voters' states | Line 1 | Line 2 |
|---|---|---|
| some with no vote, none kept | `No vote: …` | empty |
| none with no vote, some kept | `Not confirmed: …` | empty |
| both | `No vote: …` | `Not confirmed: …` |
| all voted, left so by a departure or a rejoin under another role | `Everybody voted` | empty |
| no voters | the panel reads `No voters yet` alone: no count, no bar | |

The name lines' block always holds two lines' height at the names' size, and
the whole is centred on that, so a list that empties moves neither the count
nor the bar.

**The panel's text follows the table** (decision 15). Once `useFitEntries`
settles the table's scale, it writes the same value as `--table-scale` on
`.room-page-column`, which holds the table and the round panel; on the phone,
where the table's scale is fixed, it removes it, so a wide value does not
outlive a resize. The names are
`clamp(--text-md, --text-md × --table-scale, --text-lg)`, the count
`clamp(--text-lg, --text-lg × --table-scale, --text-xl)`, with 1 where no scale
is written. The table's fit never reads the panel: the slot's height is set by
the layout (below), so no loop forms. A new scale changes the line's font and
so its height, and the line's own resize refits it.

**Fitting a name line.** One line each, never wrapping. The candidates, in
order; the first that fits the line's width is drawn:

1. Every name.
2. The first k names and `and N more`, k from n − 2 down to 1, so N is at
   least 2.
3. The count alone: `Not confirmed: 5`.

The line stretches to the panel's width (`min-width: 0`, `overflow: hidden`);
its text never sizes it. React renders the chosen text; the fit never writes
into the line (decision 14). A pure selector takes the candidates and a
measure callback and returns the first that fits. The measure writes each
candidate into a scratch node that measures as the line draws: the line's
computed font, the label at weight 600, `nowrap`, an unconstrained width,
`aria-hidden`, outside the Progress region. It is created and removed within
one run of the layout effect, and compared with the line's content width.
The layout effect runs the selector synchronously, keyed on the line's label
and names as one joined string; the observers re-run it inside `flushSync`
when the line resizes or a font loads (the triggers `useFitEntries` watches),
never the effect itself. So the fitted text is drawn before paint every time.

**The slot's height.** The panel takes the slot's height on each layout, so a
reveal swaps it for the result in place: 7.5 rem at 65.75 rem and up, the
deck's rows (at least the result's least height) in the middle layout. On the
phone, while voting, the slot is as tall as the panel, and grows to the
result's height at a reveal (decision 6).

**Silent.** No live region and no tab stop: the panel is a region named
"Progress", read on demand. The phase line keeps the round's announcements.

**What goes.**

- The facilitator's reserve, both copies: `.voters-reserve` and `held` in
  `useFitEntries` (4c1-narrow-keys decision 4). The slot now exists while
  voting, so the table is fitted with it in place.
- `keepClearOfSheet`'s `?? bar` fallback: every room page now has a round
  panel, so the sheet's top is always the panel's.
- The roster's pill `Choosing…` becomes `No vote`.

**Accepted costs.**

- A voter's heading leaves view where the table scrolls: on the phone, and on
  wide screens past the table's fit, beyond 14 voters (decision 4).
- On a shared voter's screen the count is small; the table's marks show who is
  missing at their own scale (decision 3).
- A long first name in table order can drop a line to the count while later
  names would have fitted.
- A segment at most twice its kept frame wide draws as a fill, so a kept card
  looks voted in the bar: past about 19 voters at 320 px, 25 at 392 px, 72 at
  1280 px, from the bar's widths measured in the mockup. The words stay
  right; leading a room that size from a phone is unlikely.
- On a phone the facilitator's sheet grows at a reveal (decision 6), as it does
  today, and between no voters and one; below 39 rem tall it is not pinned,
  and the panel scrolls with the page as a voter's deck does.
- In a first round the second line's room stays empty.

## Contract

In `docs/design/ui-reference.md`, "Contract reads the look keeps", whose intro
gains a pointer to this spec's changes:

- `round-slot` (`roundSlot`): on a facilitator's page it holds the progress
  panel while voting. This rewrites "a facilitator's page has none while
  voting".
- The Progress region's text, read with `toMatchAriaSnapshot`: count and name
  lines, as drawn.
- The Voters heading on a voter's page while voting, `Voters · k of n voted`.

## Docs

- `docs/design/room.html`: the `progress=v3` draft committed with this spec,
  which holds the bar's and spacing's values, becomes the default view. The
  draft's scaffolding goes (the `progress` parameter, the v2 candidate, the
  `progress-${progress}` class, the red `.over` outline), as does decision G's
  progress (`round-progress`, `round-progress-top`, `bigProgress`) and the
  mockup's copy of the reserve (`voters-reserve` and the fit's `reserve`). The
  bar gains the marks' forced-colours rule, which the draft lacks.
- `docs/design/room.html`'s `fitEntries` writes `--table-scale` as the app
  does (decision 15); the bar and the text follow through the linked
  `progress.css`.
- `docs/design/room-cells.html`: the `later` option's label drops "progress".
- `docs/design/ui-reference.md`:
  - Terms, "Shared-screen elements": the result alone (decision 13).
  - "Mockups": the later steps' list drops the progress count.
  - Decision G's voter half reversed, in the decisions log, pointing here.
  - J11, "The compact foot": drops "the voter's progress on the line above the
    deck".
  - The Tokens table's "progress track" mentions, as the tokens below.
  - The Contract lines above.
- Tokens: `--progress-width` and `--track` go, with `--track`'s gate pair in
  `gate.ts` and its value in `gate.test.ts`'s fixture, and `lobby-page.css`'s
  comment stops citing the track by name; the comments of
  `--radius-small` and `--bar-min` name their remaining uses, and
  `--line-mark`'s names the bar's dashes. `--progress-bar` (the bar's height,
  1 rem), `--progress-bar-narrow` (0.75 rem, the phone's) and
  `--progress-band` (the segments' gap and the kept frame,
  `max(2px, 0.25rem)`) come, as the mockup's literals become tokens;
  ui-reference's Tokens row for the bar gains `--progress-bar-narrow`.
  `--frame-band` would fill a kept segment and change the accepted 19-voter
  figure.
- The parent spec (`2026-09-30-ui-refresh-design.md`):
  - "Steps after 5", the progress bullet, keeps its lead words and points here.
  - Principle 5: the progress leaves the list as the issue did (decision 13).
  - Terms, "Progress": "kept in view" points to decision 4.
  - Step 3, the phase line: "until the progress step fills its slot while
    voting" becomes the facilitator's phone sheet growing at a reveal
    (decision 6); "It may share a line with the progress" goes (decision 9).
  - Step 4's cases: "below it, until the progress step, a reveal refits them"
    becomes a hold at every width above the phone.
  - Appendix B, "The phase text alone", and Appendix C's "across a vote that
    changes a progress sharing its line": no progress shares the line
    (decision 9).
  - Appendix C, where the phase line's reserve and its 320 px case "wait for
    the progress step": the wait ends with nothing to add (decision 9).
- Stale comments: `.voters-reserve`'s, `useFitEntries`' on the reserve,
  `keepClearOfSheet`'s, `RoundPanel`'s on the slot, `roundSlot`'s in
  `fixtures.js`; in `layout.spec.js`, those on `parts`, `nobodyVoted`,
  "the entries' scale holds through a reveal" ("a dropped reserve shows") and
  'two wrapping names in different rows keep every entry in view'; and any
  "until the progress step".
- A note on #497 for the designer: the count with name lines and a grouped bar
  replaces the mockup's bare "4 of 6 have voted", and why. Shown in chat
  before it is posted.

## Verification

- Unit, `progress.test.ts`: a first round; a Re-vote with kept cards and no
  "no vote" (line 1 is `Not confirmed`); a Re-vote with all three states, the
  bar's grouping included; all voted; no voters.
- Unit, the fit: each candidate's text (N is never 1); the selector, given a
  fake measure, picks every name, the largest k, or the count.
- Browser, both browsers, a facilitator and voters:
  - the Progress region's aria snapshot through a first round's votes, a
    Re-vote with kept cards, and a Leave that leaves everyone voted
    (`Everybody voted`);
  - the voter's heading while voting, during a Re-vote with kept cards (they
    are not counted), and once revealed;
  - the phone: the facilitator's page opens at 1280 wide showing every name,
    shrinks to 320, and the name line shows the count, in a room where no
    name fits there; the sheet is as tall as the panel while voting;
  - a change of names, no resize: on a narrow page a line showing every name
    falls back once another voter joins, the line's width the same before and
    after;
  - in every fit case, the drawn line does not overflow (`scrollWidth` at
    most `clientWidth`), whatever the measure got wrong;
  - the fit cases chose their names for 20 px lines, and decision 15 changes
    the size each draws at: 'the phone shows the count where no name fits'
    (`PAIR` at 320 px, and `MORE`'s height-only refit, which varies only the
    window's height and pins the refit on a font change, whatever grows the
    font), 'a voter joining drops a line
    from every name' (`THREE`, `FOURTH`) and 'a name written as markup is
    measured as text' (`MARKUP`). Each case's names are re-chosen for the
    size drawn there, its premise re-measured in both browsers, and the case
    shown red again;
  - in a Re-vote with all three states, every segment of the bar has the same
    width, within a subpixel, and each kept and no-vote segment's
    `outline-offset` is minus its `outline-width`;
  - the panel's names and count measure their clamps of the table's scale in
    a middle-layout window where that scale lies above 1 and below 1.25 (past
    it the names stop growing, past 1.3 the count), their least sizes once
    the window narrows to the phone, and their clamps again once it widens
    back. The case reads the settled `--table-scale` and asserts that range
    first, choosing a height per browser if their fonts differ, and waits for
    the sizes to settle after each resize. Where the scale is at its cap in
    the wide layout, asserted the same way, the Progress region's content is
    no taller than the slot (about 4 px to spare at a 16 px root);
- Layout cases restated for the facilitator's slot while voting, in
  `layout.spec.js`: 'nobody voted: the slot keeps its height through a
  reveal', 'nothing moves between a room of 2 and a room of 14', 'no scroll at
  the floor' (`parts`), the two `scrollsAndCutsNothing` cases, 'a copy moves
  and covers nothing in the header or the round', 'two wrapping names in
  different rows keep every entry in view', and the middle and phone journeys,
  whose `nobodyVoted` reads Bob's slot too: it holds in the middle layout and
  grows on the phone. "The entries' scale holds through a reveal" also runs at
  860 by 600 only if its 4 entries sit above the scale's floor and below its
  cap there, as at 1280 by 600. At 860 by 600 `--s` sits at the floor (1), where
  the case cannot go red, so `nobodyVoted`'s read of Bob's slot covers it.
- 'a keyboard focus behind the round panel scrolls clear of it'
  (`narrow.spec.js`) also runs on a facilitator's phone page while voting,
  with voters, so the panel is full height with the table behind it.
- Not tested: a font load during the fit (the font is preloaded, J7), the
  roster's pill, as today, the panel having no tab stop, the fit landing
  before paint, and the bar under forced colours (decision 16 leaves it no
  transparent border to paint; voted, kept and no-vote checked side by side
  by hand in the mockup: fill, solid frame, dashed outline, each distinct).
- Each new or changed case is shown red by breaking the mechanism it names.

## Decisions

1. **Names lead, the count follows** (user). The facilitator calls people out.
2. **The minimum on a voter's page, the rest in the facilitator's panel**
   (user). A voter's page gets the count in an existing line; a line under the
   table would de-centre it or move it. The facilitator's heading keeps
   `Voters · n`: the panel is the home of all its progress, at the cost of a
   heading that differs by role.
3. **The voter's count stays small** (user). It reverses decision G's voter
   half. The round bar (option B) was too cramped in the middle and phone
   layouts.
4. **The heading may leave view** (user). Pinning it costs every phone voter
   a strip of screen for a rare case.
5. **"Voted" means confirmed everywhere** (user), so the count meets
   `complete`. Counting kept cards as voted would show n of n with nothing
   revealing.
6. **The phone's sheet fits the panel while voting** (user). Holding the deck's
   13 rem hid half the table for the whole round, to spare one grow at a
   reveal.
7. **"No vote", and the roster follows** (user). "Not voted" is not the
   negation of voted; "Choosing…" guessed what people were doing. The table's
   spoken mark already says "No vote".
8. **Fit whole names, then the count** (user). Measured at 20 px, before
   decision 15: "Not confirmed: and 12 more" alone needs 267 px, the 320 px
   phone's line has 227, so neither a name length limit nor a cut name fixed
   the phone; the count always fits. The limit (#542) only makes step 2
   succeed more often. Under decision 15, at the phone's 16 px, that line
   needs about 214 px and fits, so step 2 succeeds more often there; a long
   first name still needs the count.
9. **No progress on the phase line** (user). 4c1-narrow-cases decision 4 held
   the line's reserve for it; with the progress elsewhere no case of that
   line could fail, as decision 4 found.
10. **The `--text-xl` count** (user). Both it and the 3 m step fit 120 px
    (measured in the mockup at 1280 by 600 and 680), but nothing else on the
    page is as big as the 3 m step, so it looked out of place. The count's
    size now follows the table (decision 15).
11. **Lines are read as drawn** (my call). One element per line, no hidden
    full list: a screen reader user hears what is on screen.
12. **No states x events matrix, no spike** (my call). The panel is a pure
    function of the snapshot; the fit has the table's triggers.
13. **The progress is not a shared-screen element** (user, review). It leaves
    principle 5's list as the issue did in 3b1: the facilitator reads the
    names aloud, and remote people read them on their own screen. The result
    is the one shared-screen element; J7 is unchanged.
14. **React renders the fitted text; a scratch node measures it** (user,
    review). Writing candidates into a node React owns can break its next
    update. The scratch node measures what the browser draws, as the mockup
    did; canvas `measureText` was set aside for its hand-built font strings and
    subpixel drift. A state set from an observer renders after paint, hence
    the synchronous run and `flushSync`.
15. **The panel's text follows the table** (user, hand test). At fixed sizes
    the panel's names were the page's largest text where the table shrinks,
    and smaller than the table's names on a tall middle window. Chosen in the
    mockup at 2944 by 1493, 1472 by 703, 981 by 703 and 1493, 736 by 703 and
    304 by 800. A copy of the scale, not the fit's own `--s`: the list
    declares its own `--s` (a default and the phone's value) and the panel is
    not under it, so only a settled copy on an ancestor of both reaches it.
16. **Marks are outlines inside the segment** (my call, hand test). A border
    is added to a flex item's share, so kept and no-vote segments drew wider
    than voted ones. One transparent border on every segment fixed the
    lengths, but forced colours paints a transparent border, which framed a
    no-vote segment like a kept one, and Firefox draws a thick dashed border's
    corners as brackets. The outline's offset is set in "The progress panel",
    item 2.
17. **A taller bar, thicker frame** (user, hand test). At a 16 px root, the
    8 px bar's 3 px frame and 2 px dashes were hard to see; 16 px, 12 px on
    the phone, with a 4 px frame read best. The dashes stay the table's 2 px:
    thicker ones hit Firefox's corners (decision 16).
