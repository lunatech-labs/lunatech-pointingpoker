# Tied Vote

Date: 2026-11-05
Status: Approved
Parent: issue #513

## Purpose

When several values share the most votes, the result names one of them, picked
by JavaScript's key order (`Object.entries` lists array-index keys first, in
ascending order), so a 2-2 split on `0.5` and `89` reports `89`. The headline
then claims a winner the votes did not produce.

The result reports facts and draws no conclusion. Teams judge a round by their
own rule (everyone on one value, a clear majority, any tied value, the median
or mean), and the app holds no per-team rule: the result carries what each
rule needs.

Out of scope: the median and mean (#536), announcing the result on a reveal
(#546), any "highest when in doubt" pre-selection and the round history views
of `docs/superpowers/specs/2026-08-31-protocol-target-architecture-design.md`
("Round history, within the session"), both step 9's (#528).

## Terms

- **Chart order**: the order of `resultColumns`' columns.
- **Tied set**: the voted values sharing the highest count, in chart order.

## Behaviour

A pure function in `frontend/src/room/result.ts` takes the deck and the
summary, as `resultColumns` does, and returns the headline: the label, the
tied set, the figure, the sub line and the spoken figure. `Result` only lays it
out.

| Tied set | Label | Figure | Sub line | Spoken figure |
|---|---|---|---|---|
| empty | Nobody voted | none | none | none |
| 1 value | Most voted | `8` | `4 of 7 votes` | `8` |
| 2 or 3 values | Most voted | `5 · 8` | `Tied, 3 votes each` | `5 and 8`, `3, 5 and 13` |
| 4 or more | Most voted | `Tie` | `<tied set size> values, k votes each` | `Tie` |

- The tie line's "vote" is singular for k = 1: `Tied, 1 vote each`.
- The single-winner line's "vote" is singular for one vote cast: `1 of 1 vote`,
  where today it reads `1 of 1 votes`.
- Each drawn value goes through `Figure`, so `0.5` keeps its tight point. The
  list uses the existing `result-figure-list`.
- `Result` marks each column whose value is in the tied set as the top
  (`result-column-top`), red bar and count included.
- The drawn figure is `aria-hidden`; a visually hidden sibling outside it holds
  the spoken figure.

Accepted corner: values off the deck stay in the summary's order (count, then
key order), so two of them tied can list by key order. The summary's sort in
`applySnapshot` stays.

## Contract

In `docs/design/ui-reference.md`, "Contract reads the look keeps", whose intro
gains a pointer to this spec's changes:

- `most-voted` (`mostVoted`) holds the figure as drawn, `8`, `5 · 8` or `Tie`,
  so `toHaveText` reads what is shown. This rewrites the existing line in the
  `tally-entry` bullet.
- `result-column-top` on a `tally-entry` marks a column of the tied set, read
  with `toContainClass`.
- What the Results region's headline announces, read with
  `toMatchAriaSnapshot` as one text line: label, spoken figure, sub line.
- The spoken figure, found by its text inside the Results region
  (`getByText(…, { exact: true })`), read for its clip.

The shared setup these reads ride is weighed in decision 8.

## Docs

- `docs/design/room.html`: the default view follows Behaviour and Contract
  (decision 12), the spoken figure included, as the mockup models `tally-sr`.
  The `later=1` tie branches, the `.result-most.later` style, the key-order
  comment and the `first` pick go.
- `docs/design/room-cells.html`: the `later` option's "0" label, "Step 4
  only", becomes "Shipped steps only", and its "1" label drops "the tie rule".
- `docs/design/ui-reference.md`: the Contract lines above; "Mockups" says they
  show what is built rather than "what step 4 builds"; "Shared-screen text"
  says a tied list reads at the 3 m step, `--text-2xl`, with the chart that
  shows the same values.
- The parent spec's bullet "Ties shown rather than broken"
  (`docs/superpowers/specs/2026-09-30-ui-refresh-design.md`, "Steps after 5")
  keeps those lead words and points to this spec.
- Stale comments: `Result`'s "today's tie-break (decision 10)", the
  participants sort's comment in `applySnapshot`, and
  `expectSummaryMatchesParticipants`'s "the order of a tie is undecided".
- A short note on #497 tells the designer the mockup's `None` is dropped and a
  tied list stays at the 3 m step, and why.

## Verification

- Unit, `result.test.ts`, the function's outputs for: nobody; one value; a
  single voter (`1 of 1 vote`); two voters who differ; three tied with k = 2;
  four or more tied with k > 1, its tied set included; everyone different,
  four voters.
- Unit, chart order: one test runs every order of `0.5`, `89` and `?` as input
  and expects the tied set `0.5`, `89`, `?` each time.
- Browser, both browsers, in "a session of rounds keeps the summary honest
  across them":
  - the first reveal (Alice 3, Bob 5): `most-voted` reads `3 · 5`; the Results
    headline's aria snapshot reads `Most voted 3 and 5 Tied, 1 vote each`; the
    spoken `3 and 5` is clipped (`clip-path: inset(50%)`); both entries contain
    `result-column-top`;
  - the majority reveal (5, 5, 8), which reads `mostVoted` `'5'`: the `5` entry
    contains `result-column-top` and the `8` entry does not.
- Measured once while building, not a case: at 1280, the columns with
  `0.5 · 13 · 89` and with `Tie` over `13 values, 1 vote each`, against a
  single `13`. A visible squeeze comes back to the user as a finding, with a
  rule to pin.
- Incidental: the layout suite's reveals, all distinct values, now draw the
  list or `Tie`. They read boxes and scrolls only, so a failure there is layout
  fallout of this change.

## Decisions

1. **Show the tie, pick nothing** (user). Lowest-wins and highest-wins are team
   rules, not facts.
2. **No `None` figure** (user). It hid a 5-vs-8 split, read close to "Nobody
   voted", and was a verdict where `1 vote each` is a fact. The mockup was a
   space check; the parent spec left that wording open.
3. **A weak single winner needs nothing new** (user). `2 of 6 votes` already
   shows it; averaging teams get #536.
4. **Red on the tied set always** (my call). This reverses the parent bullet's
   "no red bar when every voted value ties": when every vote differs, every bar
   is red. One rule instead of an exception, and the words carry the meaning,
   never the colour alone.
5. **The function owns the whole headline** (user). Label, tied set and texts
   in one unit-tested place, nobody voted included; `Result` only draws, as it
   draws `resultColumns`' chart.
6. **Off-deck order stays an accepted corner** (user). Only a request made
   outside the app sends such a value, and two must tie to show it. It lasts
   until the server validates votes against a card scale (#535, then #504); a
   natural sort now would add a rule for it.
7. **No layout case** (user, revised while building). At 320 a tied list fits
   at `--text-2xl` with room and at `--text-3xl` with 3 px to spare (measured
   in both browsers), so no plausible break of this change wraps or overflows
   it, so a case reading it could not be proven red. The existing "no page
   scrolls sideways" sweep reveals a round at 320. At 1280 the block grows to
   its figure, so "fits" cannot fail there; the squeeze is measured once.
8. **The tie checks ride the session journey** (user). Its first reveal is
   already a 3-5 tie and its majority reveal a single winner, and the journey's
   purpose is an honest summary.
9. **`most-voted` holds the drawn figure** (contract change). The spoken figure
   sits beside it, outside the test id.
10. **`result-column-top` becomes a contract read** (user, contract change). The
    cheapest honest test of the red marking: all tied, the winner, and not the
    winner are each checked once.
11. **The headline's announcement is read as an aria snapshot** (user, contract
    change). One read fails on a missing spoken figure, a dropped `aria-hidden`
    or a wrong sub line, and holds through a wrapper element (probed in both
    browsers); a clip check covers the visual hiding it cannot see. #551 takes
    the technique to the phase line and tally tests.
12. **The mockup's default view follows the shipped rule** (user). A default
    showing dropped behaviour would mislead its readers.
13. **`1 of 1 vote`** (user). Most users would report the plural as a bug; the
    unit case is planned anyway.
14. **A tied list at the 3 m step** (user). The chart shows the same values at
    that size. 3xl would fit `0.5 · 13 · 89` on one line at 320, but with only
    3 px to spare (measured while building).
15. **No states x events matrix, no spike** (my call). The result is a pure
    function of the votes with no state, and the logic is a filter on counts.
