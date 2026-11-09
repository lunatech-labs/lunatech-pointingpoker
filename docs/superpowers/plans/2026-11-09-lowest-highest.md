# Lowest and Highest Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** On a reveal with a spread, the cards holding the lowest and the highest value are tinted, one colour each, on the table and in the roster.

**Architecture:** A pure function beside `resultColumns` finds the lowest and highest ranked values in the tally. `Voters` and `Roster` compare each voter's estimation with it, put a class on the entry or the slot, and add a visually hidden word. Two colour tokens carry the tints, and the contrast gate checks ink on them. The browser checks ride the session journey.

**Tech Stack:** React 19 + TypeScript 5.9, Vitest, Playwright (Chromium and Firefox).

**Spec:** `docs/superpowers/specs/2026-11-09-lowest-highest-design.md`

## Global Constraints

- Ranked values are `estimationValues` without `'?'`, in deck order. No number parsing.
- Spread: at least two different ranked values in `view.votesSummary`. Otherwise nothing is tinted.
- Computed only when `view.votesRevealed`.
- Classes: `voters-low` / `voters-high` on the `li` with `data-testid="participant"`; `roster-value-low` / `roster-value-high` on the `roster-value-figure` slot.
- Tokens in `colours.css`: `--tint-low: #D6E6F5`, `--tint-high: #F7DDB8` (computed `rgb(214, 230, 245)`, `rgb(247, 221, 184)`).
- The spoken word is a `<span className="visually-hidden">` holding `, lowest` or `, highest`, exactly.
- `participant-estimation` still holds the value alone; the slot's text is the value alone; "not confirmed" stays outside the slot.
- No motion. The chart, the headline and the deck are untouched.
- Comments: one or two lines each.

## Rulings

The choices the spec left open, each with the simpler alternative.

1. **Return shape.** `{ low: string; high: string } | null`, with no named type. A named `Extremes` type is one more export nobody else imports.
2. **`?`.** A literal `'?'` filtered inside `resultExtremes`. A parameter for the unranked values would generalise a deck that has one.
3. **The comparison in each component.** A local `end(estimation)` returning `'low' | 'high' | null`, `null` when the extremes are `null`, and a `{ low: 'lowest', high: 'highest' }` map for the word. It is written twice, once per component. A shared helper in `result.ts` would be simpler to test, but the spec's decision 7 keeps the components to a comparison, and a helper is a second export the spec did not name.
4. **Table CSS.** `.voters-low .voters-face { background: var(--tint-low) }`, the same for high, in `voters.css`. The class on the face as well would be simpler CSS but it would put the class in two places.
5. **Roster DOM.** `VoterEnd` wraps `<Figure>` in `<span className="roster-value-figure …">` and puts the hidden word after it, inside `.roster-value`. The no-vote branch keeps its single `roster-value roster-value-none` span.
6. **Roster CSS.** The mockup's rule moves to `roster.css` as it stands: `.roster-value-figure, .roster-value-none { min-width: 2.75em; padding: 0 var(--space-2); border-radius: var(--radius-mark); text-align: center; justify-content: center; }`, then the two tint rules. Dropping the padding is simpler, but a tinted `89` would then touch its slot's edges.
7. **Gate.** One line in `pairs`: `...on('--ink', [...only('--tint-low'), ...only('--tint-high')], TEXT)`. The pairs' comment stays: earlier additions (notice, pills) left it too.
8. **Mockup rule.** `room.html` ranks the tally in deck order, as the app does (`deck` without `'?'`, kept where `counts[v]`), replacing `numeric`, `nums`, `lo`, `hi`, `rank`, `byValue` and `endNames`. The unrelated `lo`/`hi` in the fit search stay.
9. **Hidden text, the full standard practice: the standard class inside a positioned container.** `.visually-hidden` in `looks.css` becomes the standard "sr-only" class with its px written in rem, as `literalProblems` requires: `position: absolute; width: 0.0625rem; height: 0.0625rem; padding: 0; margin: -0.0625rem; overflow: hidden; clip: rect(0, 0, 0, 0); clip-path: inset(50%); white-space: nowrap; border-width: 0; text-transform: none;` (its comment stays). `.voters` (`voters.css`) and `.roster` (`roster.css`) gain `position: relative`. Measured on `room.html` with the app's stylesheets and the words placed as Task 2 places them, both browsers, scrollbars drawn: today the page scrolls 225 px at 30 voters (617 at 44); the positioned panels alone stop that but scroll the roster sideways 6 px (a scrollbar in Chromium); the class alone still scrolls the page in Chromium; both together give 0 page scroll and 0 sideways scroll in either panel at 1280 and 843 wide, 14, 30 and 44 voters. User's choice, 2026-11-09.
10. **Delivery.** This branch, `20261109.lowest-highest-mockup`, becomes #536's branch (as recorded when the group was designed) and one PR holds the mockup, the spec, the code and the docs.

## Review Focus

1. **The hidden word escapes a scrolling panel.** Today's `.visually-hidden` is an absolutely placed box as wide as its text, and no ancestor of `.voters` or `.roster` (`overflow: auto`) is positioned, so neither panel clips or scrolls it. A word in a row below a panel's fold makes the desktop page scroll vertically (J1); a word in the roster, once the roster owns it, sticks out past its right edge. No hidden text sat in a scrolling panel before. Fixed by ruling 9; test: Task 2, Step 7, a throwaway probe that goes red before ruling 9 and green after.
2. **A tint lingers after a re-vote.** Cannot happen: while a round is open the server discloses each page's own value only (`disclose` in `RoomSnapshot.of`), so the tally holds at most one ranked value and `resultExtremes` returns `null`. The `votesRevealed` guard stays because the spec names it; no read can fail for it.
3. **A kept extreme.** The tint fills the face and the kept band stays outside it, both visible. Checked by eye in Task 3, Step 2, at `phase=revealed-revote`, the only phase whose reveal holds kept values.
4. **No vote and `?` are never tinted.** Covered: the first reveal reads Carol's and Dave's entries (no vote); `?` is a unit row, and a string compare cannot match it to a ranked value.
5. **A value off the deck.** Covered by its unit row only, as the spec says. It reaches the app only through requests made outside it.

---

### Task 1: The extremes function

**Files:**
- Modify: `frontend/src/room/result.ts`
- Test: `frontend/src/room/result.test.ts`

**Interfaces:**
- Produces: `export function resultExtremes(deck: readonly string[], summary: [string, number][]): { low: string; high: string } | null`

- [ ] **Step 1: Write the failing tests** in a new `describe('resultExtremes')`, with the same literal `DECK` as `resultHeadline`'s block:

| Case | Summary | Expected |
|---|---|---|
| `marks 3 and 5, past ? and no vote` | `[['3', 1], ['5', 1], ['?', 1]]` | `{ low: '3', high: '5' }` |
| `marks a tied lowest once` | `[['5', 2], ['8', 1]]` | `{ low: '5', high: '8' }` |
| `counts a not-confirmed vote like any other` | `[['3', 1], ['5', 1], ['8', 1]]` | `{ low: '3', high: '8' }` |
| `marks 0.5 and 89` | `[['0.5', 1], ['89', 1]]` | `{ low: '0.5', high: '89' }` |
| `marks nothing when everyone agrees` | `[['5', 2]]` | `null` |
| `marks nothing beside ?` | `[['5', 1], ['?', 1]]` | `null` |
| `ignores a value off the deck` | `[['3', 1], ['7', 1]]` | `null` |
| `marks nothing for ? only` | `[['?', 2]]` | `null` |
| `marks nothing when nobody voted` | `[]` | `null` |

Add `ranks by the deck whatever the summary order`: it loops over all 24 orders of `['0.5', '1', '89', '?']`, each at count 1, and expects `{ low: '0.5', high: '89' }` every time.

- [ ] **Step 2: Run them and see them fail**

Run: `npm run test:unit -- result`
Expected: FAIL, `resultExtremes is not a function`.

- [ ] **Step 3: Implement `resultExtremes`** in `result.ts` (rulings 1 and 2): the deck's values but `'?'` that the summary holds, in deck order; `null` below two, else the first and the last.

- [ ] **Step 4: Run the tests and see them pass**

Run: `npm run test:unit -- result && npm run typecheck && npm run lint`
Expected: PASS, no type or lint errors.

- [ ] **Step 5: Prove two cases can fail**, each run red, then reverted:
  - rank the summary's keys instead of the deck → the order case fails;
  - drop the `'?'` filter → `marks nothing beside ?` fails.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/room/result.ts frontend/src/room/result.test.ts
git commit -m "feat: find the lowest and highest estimates of a reveal"
```

### Task 2: The table and the roster draw the tint

**Files:**
- Modify: `frontend/src/colours.css`, `frontend/src/design/gate.ts`, `frontend/src/tokens.css` (comment only), `frontend/src/components/looks.css`
- Modify: `frontend/src/components/Voters.tsx`, `voters.css`, `Roster.tsx`, `roster.css`
- Modify: `e2e/session.spec.js`, `docs/design/ui-reference.md` ("Contract reads the look keeps")

**Interfaces:**
- Consumes: `resultExtremes` from Task 1; `estimationValues` from `components/Deck`.

- [ ] **Step 1: Tokens, gate red.** Add the two tokens to `colours.css` after `--kept-tint`, each with a one-line comment (`the lowest estimate's ground; provisional until #497`, likewise highest). Run `npm run test:unit -- gate`. Expected: FAIL, `unreached` lists `--tint-low` and `--tint-high`.

- [ ] **Step 2: Gate green.** Add ruling 7's line. Run `npm run test:unit -- gate`. Expected: PASS, with new ink-on-tint cases.

- [ ] **Step 3: Components and CSS.** `Voters` and `Roster` each call `resultExtremes(estimationValues, view.votesSummary)` when `view.votesRevealed`, else take `null`, and apply ruling 3. Table: the `li` gets the class (`className` only when set); `Face` takes the end and puts the hidden word after the `participant-estimation` span, before the kept mark. Roster: rulings 5 and 6. CSS: ruling 4. `tokens.css`: `--radius-mark`'s comment becomes `/* small cards: the header mark, the table's marks and the roster's value slot */`.

- [ ] **Step 4: Journey reads** in "a session of rounds keeps the summary honest across them". Add `const ends = ['voters-low', 'voters-high']` and a roster locator `const roster = page => page.getByRole('complementary', { name: 'Participants' })`. Faces are `participantEntry(page, name).getByTestId('participant-estimation').locator('..')`.
  - First reveal, on `carol.page`, after the result reads: Alice's entry `toContainClass('voters-low')`, Bob's `voters-high`, Carol's and Dave's `not.toContainClass` each of `ends`; Alice's entry `getByText(', lowest', { exact: true })` has `clip-path` `inset(50%)`; Alice's face `background-color` `rgb(214, 230, 245)`, Bob's `rgb(247, 221, 184)`.
  - Third reveal, on `alice.page`, after the marks loop: Alice `voters-low`, Carol `voters-high`, Bob neither; `roster(alice.page).getByText('3', { exact: true })` contains `roster-value-low` with `background-color` `rgb(214, 230, 245)`, the `8` slot `roster-value-high`, the `5` slot neither class; `roster(alice.page).getByText(', lowest', { exact: true })` has `clip-path` `inset(50%)`.
  - Majority reveal, on `bob.page`, after the `result-column-top` reads: Alice and Bob `voters-low`, Carol `voters-high`.

- [ ] **Step 5: Run and see them pass**

Run: `npm run typecheck && npm run lint && npm run e2e -- session -g "session of rounds"`
Expected: PASS in chromium and firefox.

- [ ] **Step 6: Prove the reads can fail**, each run red, then reverted:
  - the class on the face instead of the `li` → the first reveal's class read;
  - drop the `.voters-low .voters-face` rule → Alice's background read;
  - `Roster` never sets the slot's class → the third reveal's slot read;
  - drop `visually-hidden` from the table's word → the clip read;

- [ ] **Step 7: Probe the scrolling panels (Review Focus 1, ruling 9).** A throwaway case in `e2e/layout.spec.js`, never committed, run at 1280 by 720 and at 843 by 720 (the narrowest width drawing the roster in both browsers: Chromium's stable gutter moves J11's switch from 828 to 843). Alice joins as a facilitator; 30 pageless voters (`voters([...])`) with generated names (`NAMES` holds only 14) all vote `5`, but the two whose names sort last (`byName`) vote `3` and `8`, so the extremes are the last voter rows in both panels; Alice reveals. Reads, all `<= 0` or true:
  - both panels scroll: `scrollHeight > clientHeight` on `.voters` and `.roster` (else the case proves nothing: stop and report);
  - the page: `readBoxes`' `scrolls` and the file's `sideways`;
  - each panel sideways: `scrollWidth - clientWidth` of `.voters` and `.roster`;
  - each word moves with its panel: scroll the panel to its end; the word's top relative to the panel drops by exactly `scrollTop`, and its box lies inside the panel's box.

  Run it before ruling 9 and see the page read and both "moves with its panel" reads go red, in both browsers (if any stays green, stop and report). Apply ruling 9, see every read green. Report the numbers, then delete the case.
  Then re-run the other hidden text's reads, which the class change reaches: `npm run e2e -- room session -g "tally counts only|phase line announces|session of rounds"`, expected PASS in both browsers.

- [ ] **Step 8: Contract** in `docs/design/ui-reference.md`, "Contract reads the look keeps":
  - after the progress panel's paragraph: ``The lowest and highest tint's contract changes, for the table's entries and the roster's slots, are listed in its spec (`docs/superpowers/specs/2026-11-09-lowest-highest-design.md`, Contract).``
  - after the `participant-estimation` bullet, the spec's three Contract bullets, worded as the spec words them.

- [ ] **Step 9: Full gates**

Run: `npm run test:unit && npm run typecheck && npm run lint && npm run e2e`
Expected: all green. A failure elsewhere is fallout of this change, ruling 9's class included: report it rather than loosening a read.

- [ ] **Step 10: Commit**

```bash
git add frontend/src e2e/session.spec.js docs/design/ui-reference.md
git commit -m "feat: tint the lowest and highest estimates on a reveal"
```

### Task 3: Mockups and design docs

**Files:**
- Modify: `docs/design/room.html`, `docs/design/room-cells.html`, `docs/design/ui-reference.md`, `docs/superpowers/specs/2026-09-30-ui-refresh-design.md`

- [ ] **Step 1: `room.html`.** Remove the `extremes` parameter and every branch on it, the `/* Lowest/highest candidates … */` block of mockup-only CSS (the tints, the slot rule now in `roster.css`, `.result-extremes` and its container query) and the result line. Apply ruling 8. Draw as the app does: `voters-low`/`voters-high` on the `li`, the face's hidden word, the roster's `roster-value-figure` slot with its class and hidden word after it.

- [ ] **Step 2: Check it by hand.** Open `room.html` at `phase=revealed` and at `phase=revealed-revote`, each with `votes=sample` and `tie4`, at 1280 and at 390. The tint matches the rule. A kept extreme shows both its tint and its band (Review Focus 3): at `revealed-revote`, Frank's kept 13 with `sample` (highest), Dave's and Rupert's kept 1s with `tie4` (lowest).

- [ ] **Step 3: `room-cells.html`.** Remove the `extremes` option and its uses: `multi`, `state`, the grid's loop, the frame's URL, caption and title.

- [ ] **Step 4: `ui-reference.md`.**
  - J3, a bullet after "Marking a revealed kept value on entries is new…": ``- Once revealed, with at least two different values other than `?`, the lowest and the highest values are tinted on the table's faces and the roster's slots. The values say which is which, so the tint highlights a relation, not a state (`docs/superpowers/specs/2026-11-09-lowest-highest-design.md`).``
  - J8, a bullet after the indicators bullet: ``- The lowest and highest tints, `--tint-low` and `--tint-high`, are grounds for ink at 7:1 in the gate. They need no 3:1 against the paper: they highlight what the values already say (`docs/superpowers/specs/2026-11-09-lowest-highest-design.md`, decision 1).``
  - Rewrap both to the file's width.

- [ ] **Step 5: Parent spec.** In `2026-09-30-ui-refresh-design.md`, "Steps after 5", the bullet "Results that show the spread…" becomes ``- Results that show the spread and the lowest and highest voters (improve 5): `docs/superpowers/specs/2026-11-09-lowest-highest-design.md`.``, keeping its lead words, as the tied vote's bullet below it is worded.

- [ ] **Step 6: Commit**

```bash
git add docs/design docs/superpowers/specs/2026-09-30-ui-refresh-design.md
git commit -m "docs: draw the lowest and highest tint in the mockups and design docs"
```

### Task 4: Wrap-up

- [ ] **Step 1: Re-check citations** in every file the branch changed (`git diff --name-only main...`), verifying each claim, not just its place.
- [ ] **Step 2: #497 note.** Show the user this draft; post only after their OK:

  > The lowest and highest tint (#536, `docs/superpowers/specs/2026-11-09-lowest-highest-design.md`) ships two provisional colours as tokens: `--tint-low` `#D6E6F5` and `--tint-high` `#F7DDB8`, the faces of the lowest and highest cards on a reveal and their roster values. Ink passes 7:1 on both. Under tritanopia the blue and the amber may read alike; the values still tell lowest from highest. Could you give us final values? Only the tokens change.

- [ ] **Step 3: PR.** Use superpowers:finishing-a-development-branch. Title "Tint the lowest and highest estimates on a reveal", body `Closes #536`. Remind the user to tell the two requesters why there is no median or mean (#536).
