# Progress

Date: 2026-11-06
Status: In discussion
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
  "k of n voted" counts these, so n of n is exactly when auto-reveal fires
  (`complete` in `Room.scala`).
- **Not confirmed**: a voter holding the previous round's card after a Re-vote
  (`kept`). Only a Re-vote round has them.
- **No vote**: a voter with no card (`none`).
- **Voters**: the table's voters, members in their grace period included, as
  the table and `complete` count them.
- **Progress panel**: the facilitator's slot while voting.
- **Name line**: one of the progress panel's two lists, "No vote: …" and
  "Not confirmed: …".

## Behaviour

**The table's heading.**

| Page | Voting | Revealed |
|---|---|---|
| Voter | `Voters · 4 of 6 voted` | `Voters · 6` |
| Facilitator | `Voters · 6` | `Voters · 6` |

Nothing else in the table changes. No line is added under it.

**The progress panel.** A pure function in `frontend/src/room/progress.ts`
takes the view's voters and returns the count, the bar's segments and each
name line's names; the component only lays it out. From top to bottom:

1. The count, `4 of 6 voted`, at `--text-xl`, weight 700.
2. The bar: one segment per voter, grouped voted, then not confirmed, then no
   vote, each drawn as the table's mark of that state (fill, frame, dashed
   outline), under forced colours too. `aria-hidden`: the words carry it.
3. The name lines at `--text-lg`, label in weight 600, names in table order:

| Voters' states | Line 1 | Line 2 |
|---|---|---|
| some with no vote, none kept | `No vote: …` | empty |
| none with no vote, some kept | `Not confirmed: …` | empty |
| both | `No vote: …` | `Not confirmed: …` |
| all voted (a departure, never a vote, left it so) | `Everybody voted` | empty |
| no voters | the panel reads `No voters yet` alone: no count, no bar | |

The name lines' block always holds two lines' height, and the whole is
centred on that, so a list that empties moves neither the count nor the bar.

**Fitting a name line.** One line each, never wrapping. In this order, the
first that fits the line's width:

1. Every name.
2. The first k names and `and N more`, for the largest k of at least 1 that
   fits, with N at least 2: one name left over shows as its name.
3. The count alone: `Not confirmed: 5`.

It is measured in the browser and re-runs when the line resizes, a font loads
or the names change, as `useFitEntries` does. A pure function builds each
candidate's text.

**The slot's height.** The panel takes the slot's height on each layout, so a
reveal swaps it for the result in place: 7.5 rem at 65.75 rem and up, the
deck's rows (at least the result's least height) in the middle layout. On the
phone, while voting, the slot is as tall as the panel, and grows to the
result's height at a reveal (decision 6).

**Silent.** No live region: the panel is a region named "Progress", read on
demand. The phase line keeps the round's announcements.

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
- A segment narrower than its kept frame draws as a fill, so a kept card
  looks voted in the bar: past about 23 voters at 320 px, 30 at 392 px, 87 on
  a wide screen. The words stay right; leading a room that size from a phone
  is unlikely.
- On a phone the facilitator's sheet grows at a reveal (decision 6), as it does
  today; below 39 rem tall it is not pinned, and the panel scrolls with the
  page as a voter's deck does.
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

- `docs/design/room.html`: the default view draws this design (the
  `progress=v3` draft committed with this spec, which holds the bar's and
  spacing's values and becomes unconditional), and the decision G
  progress (`round-progress`, `round-progress-top`, `bigProgress`) goes.
- `docs/design/ui-reference.md`:
  - Terms, "Shared-screen elements": the facilitator's progress and the result.
  - Decision G's voter half reversed, in the decisions log, pointing here.
  - J11's middle layout drops "the voter's progress on the line above the
    deck".
  - The Contract lines above.
- The parent spec (`2026-09-30-ui-refresh-design.md`):
  - "Steps after 5", the progress bullet, keeps its lead words and points here.
  - Principle 5's "the progress" and the Terms' "Progress" point to decisions
    3 and 4.
  - Step 4a's phase line paragraphs, where the reserve and the 320 px case
    "wait for the progress step": the wait ends with nothing to add (decision
    9).
- Stale comments: `.voters-reserve`'s, `useFitEntries`' on the reserve,
  `keepClearOfSheet`'s, and any "until the progress step".
- A note on #497 for the designer: the count with name lines and a grouped bar
  replaces the mockup's bare "4 of 6 have voted", and why. Shown in chat
  before it is posted.

## Verification

- Unit, `progress.test.ts`: a first round; a Re-vote with all three states,
  the bar's grouping included; all voted; no voters.
- Unit, the candidate texts: every name; k names and `and N more`; one left
  over shown as its name; the count alone.
- Browser, both browsers, a facilitator and voters:
  - the Progress region's aria snapshot through a first round's votes, a
    Re-vote with kept cards, and a Leave that leaves everyone voted
    (`Everybody voted`);
  - the voter's heading while voting and once revealed;
  - the phone: the name line falls back to the count, and the facilitator's
    sheet is as tall as the panel while voting.
- Layout cases restated for the facilitator's slot while voting, in
  `layout.spec.js`: 'nobody voted: the slot keeps its height through a
  reveal', 'no scroll at the floor' (`parts`), the two `scrollsAndCutsNothing`
  cases, 'a copy moves and covers nothing in the header or the round', 'two
  wrapping names in different rows keep every entry in view' (its comment),
  and 'the middle layout, 860 by 600, on both pages' (Bob's page).
  "The entries' scale holds through a reveal" stays and now holds at every
  width above the phone.
- The focus-clear-of-the-sheet case also runs on a facilitator's phone page
  while voting.
- Each new or changed case is shown red by breaking the mechanism it names.

## Decisions

1. **Names lead, the count follows** (user). The facilitator calls people out.
2. **Minimum for everyone, extras for the facilitator** (user). Every page
   gets the count in an existing line; the names and bar go in the
   facilitator's slot. A line under the table would de-centre it or move it.
3. **The voter's count stays small** (user). It reverses decision G's voter
   half and narrows principle 5's shared-screen progress to the facilitator's
   panel. The round bar (option B) was too cramped in the middle and phone
   layouts.
4. **The heading may leave view** (user). Pinning it costs every phone voter
   a strip of screen for a rare case.
5. **"Voted" means confirmed everywhere** (user), so the count meets
   auto-reveal. Counting kept cards as voted would show n of n with nothing
   revealing.
6. **The phone's sheet fits the panel while voting** (user). Holding the deck's
   13 rem hid half the table for the whole round, to spare one grow at a
   reveal.
7. **"No vote", and the roster follows** (user). "Not voted" is not the
   negation of voted; "Choosing…" guessed what people were doing. The table's
   spoken mark already says "No vote".
8. **Fit whole names, then the count** (user). Measured at 20 px: "Not
   confirmed: and 12 more" alone needs 267 px, the 320 px phone's line has
   227, so neither a name length limit nor a cut name fixes the phone; the
   count always fits. The limit (#542) only makes step 2 succeed more often.
9. **No progress on the phase line** (user). 4c1-narrow-cases decision 4 held
   the line's reserve for it; with the progress elsewhere no case of that
   line could fail, as decision 4 found.
10. **The `--text-xl` count** (user). Both it and the 3 m step fit 120 px
    (measured in the mockup at 1280 by 600 and 680), but nothing else on the
    page is as big as the 3 m step, so it looked out of place.
11. **Lines are read as drawn** (my call). One element per line, no hidden
    full list: a screen reader user hears what is on screen.
12. **No states x events matrix, no spike** (my call). The panel is a pure
    function of the snapshot; the fit has the table's triggers.
