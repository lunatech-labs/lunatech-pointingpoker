# Lowest and Highest

Date: 2026-11-09
Status: Approved
Parent: issue #536

## Purpose

After a reveal, the talk is about the spread: who voted lowest and highest,
and why. Today the reader scans the table's values to find them. A tint marks
those cards where they sit.

It replaces the median and the mean, for the reasons in #536's "Decided"
section, whose group decisions this spec does not repeat.

Out of scope: the tints' final colours (#497), Next issue (#548), round
history (#528), and validating votes against the deck (#535, #504).

## Terms

- **Ranked values**: the deck's values but `?`, in deck order
  (`estimationValues`).
- **Spread**: a revealed round whose tally (`votesSummary`) holds at least two
  different ranked values.
- **Lowest**, **highest**: in a spread, the first and the last ranked value the
  tally holds, in deck order.
- **Extreme**: a voter whose shown value is the lowest or the highest. The tally
  counts a not-confirmed vote (`kept`), so an extreme may be one.

## Behaviour

A pure function `resultExtremes(deck, summary)` in `frontend/src/room/result.ts`
returns `{ low, high }` for a spread and `null` otherwise. `Voters` and `Roster`
each call it with `estimationValues` and `view.votesSummary`, only when
`view.votesRevealed`, and compare each voter's `estimation`, the string the
figure prints, with it.

| Revealed values | Lowest | Highest |
|---|---|---|
| 3, 5, `?`, no vote | 3 | 5 |
| 5, 5, 8 | both 5s | 8 |
| 3 not confirmed, 5 not confirmed, 8 | 3 | 8 |
| 0.5, 89 | 0.5 | 89 |
| 5, 5 | none | none |
| 5, `?` | none | none |
| 3, a value off the deck | none | none |
| `?` only, or nobody voted | none | none |

**The table**, both layouts. An extreme's entry (`data-testid="participant"`)
gets `voters-low` or `voters-high`, and its face takes `--tint-low` or
`--tint-high` as its background. A kept frame stays as it is: it is an outline
outside the face. Inside the face, after the `participant-estimation` span and
before the kept mark, a `.visually-hidden` `, lowest` or `, highest`: a screen
reader hears "3, lowest, Previous vote, not confirmed", and the test id still
reads `3`.

**The roster**, desktop. The figure sits in a slot, `roster-value-figure`;
it and `roster-value-none`, which holds the no vote's `–` unwrapped, take
`min-width: 2.75em`, centred, `--radius-mark` corners, so values and "not
confirmed" labels form columns. An extreme's slot gets
`roster-value-low` or `roster-value-high`, with the table's tint, and the same
visually hidden word after it, outside the slot, so the slot's text is the
value alone. "not confirmed" stays outside the slot, untinted.

**Tokens.** `colours.css` gains `--tint-low: #D6E6F5` and
`--tint-high: #F7DDB8`, the mockup's values, provisional until #497. The
contrast gate gains ink on each at the text floor.

**What stays.** The chart, the headline and the deck are untouched. No motion.

**Accepted costs.**

- Under forced colours the tint goes; the values remain (decision 1).
- The tints are under 3:1 against the paper. They highlight what the values
  already say, so WCAG 1.4.11 does not ask it of them (decision 1).
- Under tritanopia blue and amber may read alike; the values tell lowest from
  highest. Passed to the designer with the colours (#497).
- A value off the deck is never tinted, numeric or not (decision 2).
- A departure after a reveal changes the tally, so the tint can move or go,
  as the chart does.

## Contract

In `docs/design/ui-reference.md`, "Contract reads the look keeps", whose intro
gains a pointer to this spec's changes:

- `voters-low` and `voters-high` on a `participant` entry, read with
  `toContainClass`.
- The spoken word, found by its text inside the entry
  (`getByText(', lowest', { exact: true })`), read for its clip.
- `roster-value-low` and `roster-value-high` on the slot, found by its value
  inside the Participants landmark (`complementary`, as the fixtures find it;
  `getByText('3', { exact: true })`), read with
  `toContainClass`, the untinted reads included. It finds a value held by one
  voter only, and not `0.5`, whose figure nests spans; "not confirmed" is a
  `<small>` outside the slot, so a kept value still finds the slot alone.

## Docs

- `docs/design/room.html`: the revealed view draws the tint as shipped, with
  the real classes and tokens; the `extremes` parameter, its rejected variants
  (`tint`, `table-sort`, `roster-sort`, `result-line`) and their mockup-only
  CSS go (decision 6). `room-cells.html` loses the `extremes` row.
- `docs/design/ui-reference.md`: the Contract lines above; J3 gains a bullet
  for the tint, pointing here; J8 says the tints are grounds for ink in the
  gate.
- `frontend/src/tokens.css`: `--radius-mark`'s comment also names the roster's
  slot.
- The parent spec's bullet "Results that show the spread"
  (`docs/superpowers/specs/2026-09-30-ui-refresh-design.md`, "Steps after 5")
  keeps its lead words and points to this spec.
- A note on #497 gives the designer the two provisional colours and the
  tritanopia caveat, and asks for final values.
- On delivery, the user tells the two requesters why there is no median or
  mean (#536).

## Verification

- Unit, `result.test.ts`, `resultExtremes`: each row of the table above, and
  one test running every order of a summary with `0.5`, `1`, `89` and `?`,
  expecting `0.5` and `89` each time (deck order, not key order).
- Browser, both browsers, in "a session of rounds keeps the summary honest
  across them":
  - first reveal (Alice 3, Bob 5, Carol and Dave no vote): Alice's entry
    contains `voters-low`, Bob's `voters-high`, Carol's and Dave's neither;
    Alice's `, lowest` is clipped (`clip-path: inset(50%)`); Alice's and Bob's
    faces (the parent of `participant-estimation`) have the low and the high
    tint as `background-color`, written as `rgb(…)`, so a new colour from
    #497 updates the test;
  - third reveal (Alice 3 and Bob 5 not confirmed, Carol 8): Alice low, Carol
    high, Bob neither; in the roster, the `3` slot contains `roster-value-low`
    and has the low tint as `background-color`, the `8` slot
    `roster-value-high`, the `5` slot neither; the roster's `, lowest`, found
    inside the Participants landmark (the table holds one too), is clipped;
  - majority reveal (Alice 5, Bob 5, Carol 8): both 5s low, Carol high.
- A single voter and a round where everyone holds one value are covered by
  the unit rows only.
- Gate: the two new pairs pass, and `unreached` stays empty.

## Decisions

1. **The values are the words** (user). The lesson "never show a state by
   colour alone" is read as: lowest and highest are a relation the printed
   values state, not a state, so the tint only highlights them. No visible
   word is added; forced colours may drop the tint; 1.4.11's 3:1 does not apply.
2. **Deck order, minus `?`** (user). No number parsing, so `1e3`, `Infinity`
   and blanks need no rule. Off-deck values arrive only from requests made
   outside the app and stay untinted until #535 validates votes.
3. **Provisional tokens** (user). The mockup's values ship as tokens; the
   designer's answer on #497 changes only their values.
4. **The class sits on the entry, not the face** (my call). The entry carries
   the test id, so the contract reads it as `result-column-top` is read on
   `tally-entry`; CSS reaches the face through it.
5. **The roster speaks the word too** (my call). A sighted roster reader sees
   the tint, so a screen-reader one hears it.
6. **The mockup follows the shipped rule** (as tied vote's decision 12). The
   rejected variants stay in #536's record and in git history.
7. **One function on the tally** (my call). It takes `resultColumns`'
   arguments and is unit-tested once; the table and the roster only compare.
8. **No states x events matrix, no spike** (my call). The tint is a pure
   function of the reveal and the tally, with no state of its own, and the
   logic is a first and last in deck order.
9. **The checks ride the session journey** (my call). Its reveals already hold
   a two-value spread, an extreme not confirmed with an untinted middle, and a
   tie at an extreme, on a desktop viewport that draws the roster.
