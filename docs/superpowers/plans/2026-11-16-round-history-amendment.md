# Round History Amendment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the amended spec's changes on the built round history: the outcome Unsettled renamed Parked everywhere, the dialog's legend kept while sending, the history rows' outcome column, and the estimate chips in the deck card's colours.

**Architecture:** The rename is a scripted rewrite judged by the existing tests. The legend's short form rides in the dialog's Sending state. The history list becomes a grid whose rows are subgrids, so the outcomes share one column sized by a hidden `Parked` and capped at 40%. The chips and the mockup take the settled look.

**Tech Stack:** Scala 3 + Pekko typed + tapir + circe (ScalaTest); React 19 + TypeScript 5.9, Vitest, Playwright (Chromium and Firefox).

**Spec:** `docs/superpowers/specs/2026-11-16-round-history-design.md` (amended); this plan builds decisions 3 and 6's look changes, the legend in Sending, and the rename (Documents). The first plan, `docs/superpowers/plans/2026-11-16-round-history.md`, is the record of Tasks 1 to 6 and is not edited; numbering continues from it.

## Global Constraints

- Wire: the outcome `{ "type": "Parked" }` in the request and the snapshot; a request with `{ "type": "Unsettled" }` answers `400`, as any unknown type.
- Copy, exactly: radios the deck values, then `Parked`, `Skip`; message `Choose an estimate, Parked or Skip`; a row's outcome the value, or `Parked`. Other copy as the first plan's Global Constraints.
- History rows: latest row `--weight-bold`, the others `--weight-regular`; outcome `--text-md`, centred, padded `0 var(--space-2)`; the column at least `Parked` in `--weight-bold`, at most 40% of the row's content box.
- Chips: `--paper-warm` fill, `--mute-soft` border, `--radius-card` corners; checked text `--paper-warm`; every chip `--weight-bold`; `.next-form` gap `--space-5`.
- Comments: one or two lines each; spec citations read "round history decision N".
- Browser cases run through `npm run e2e`; after a reverted mutation, `npm run build`.
- `docs/superpowers/**` and `.superpowers/**` keep the word Unsettled where they record history.

## Rulings

Each choice the spec left open, with the simpler alternative.

1. **The rename is scripted.** `git grep -l Unsettled` and `git grep -l unsettled`, excluding `docs/superpowers`, `.superpowers` and `docs/design/room.html` (Task 10 rewrites the mockup), then `sed -i 's/Unsettled/Parked/g; s/unsettled/parked/g'`; then regenerate the OpenAPI files and fix any `an Parked`/`an parked` by hand. Hand edits are no simpler and miss spots.
2. **The legend in Sending.** The `submit` event gains `legend: string`; Sending gains `legend: string`; `shows` returns `legend: string | null`, the submitted legend in Sending and `null` otherwise; a failed answer drops it, so Open's legend follows the issue again. The hook's `submit(legend: string)` dispatches it; `NextIssueDialog` renders `next.legend ?? shortForm(issue, position).text` and passes that text to `submit` from Enter and the button. The simpler-looking alternative, the hook taking `position` and working out the short form itself, ties the hook to the history.
3. **The column is a subgrid.** `.round-history ol`: `display: grid; grid-template-columns: minmax(0, 1fr) fit-content(40%); column-gap: var(--space-2); align-content: start; padding-inline: var(--space-2); margin-inline: calc(-1 * var(--space-2)); scrollbar-gutter: stable`. `li`: `display: grid; grid-column: 1 / -1; grid-template-columns: subgrid; align-items: center`, its `gap` and `flex` rules dropped. The inset is the list's padding, not each row's, so `fit-content(40%)` resolves against the rows' content box, which the cap test measures; row padding would add itself to the edge tracks and move the cap. The simpler alternative, a fixed-width slot per row, has no shared column for an off-deck value.
4. **The floor from the text.** `.round-history-outcome::after { content: 'Parked'; display: block; height: 0; visibility: hidden; font-weight: var(--weight-bold) }`; the slot `padding: 0 var(--space-2); font-size: var(--text-md); text-align: center; white-space: nowrap; overflow: hidden`, an ellipsis welcome but not required; `overflow: hidden` is what holds the cap, as it drops the slot's minimum contribution to 0. Generated content, not an `aria-hidden` element: an element puts `Parked` into every row's `textContent` and breaks every `historyRows` `toHaveText`. Spiked in both browsers: `visibility: hidden` keeps it out of `ariaSnapshot()`, and a centred value wider than its slot shows its start.
5. **The latest row** is `li:last-child { font-weight: var(--weight-bold) }`, in place of `--weight-strong`.
6. **The width-only resize** is already filtered by `useStickToEnd`'s height check; Task 9 adds the test only.
7. **`recordRounds`** gains a fifth parameter, `outcomes` (an array of `Choice`, entry `i` for move `i`), defaulting each move to `{ type: 'Estimate', value: '3' }`, so existing calls are unchanged.
8. **The chips** change in `.next-chip` (`background`, `border-color`, `border-radius`), `.next-chip:has(:checked)` (`color`), `.next-chip-word` (its `font-weight` dropped, its `padding-inline` kept) and `.next-form` (`gap`). The forced-colours rule stays.
9. **The mockup** is rewritten in Task 10 to the settled look: its `row`, `word` and `chip` query parameters and their rules removed, the app's rules from rulings 3 to 5 and 8 in place, `Parked` for the word, its sample history (mostly links, `rounds` 0 to 10) kept, and its bare "(decision 5)" reading "round history decision 5". Its stronger selector for hiding the desktop toggle stays (user, E: leave).
10. **Scrollbars shown for the column case.** Playwright's headless Chromium hides scrollbars, so a list without `scrollbar-gutter` takes 0 px when it scrolls; without `--hide-scrollbars` it takes 15 px, which moves the rows (spiked). Firefox shows none either way, so the gutter's mutation is proven in Chromium only. A hand check on a classic-scrollbar desktop is simpler to write but nobody is due to run it.
11. **Delivery.** Same branch and PR as Tasks 1 to 6 (first plan, ruling 18); this plan is committed with Task 7.

## Review Focus

1. **A `0.5` outcome**: its tight point inside the slot, whole and in the one column. Test: Task 9's column case records a `0.5`.
2. **Parked going from the latest row to an older one**: its weight drops, the column does not move. Test: Task 9's column case keeps checking after later entries.
3. **An off-deck value past the cap in the closed phone panel**: one line, the issue keeping at least half the row, no sideways scroll. Test: Task 9's layout case checks the closed panel as well as the opened one.
4. **An empty issue left while sending**: the legend keeps `Estimate for Round 3` when the entry lands and the position becomes 4. Test: Task 8's `shows` case submits `legend: 'Round 3'`.
5. **The old wire word after the rename**: a request carrying `Unsettled` answers `400`, not `204`. Test: Task 7's APISpec case.

---

### Task 7: Unsettled becomes Parked

**Files:**
- Modify (by script, ruling 1): `README.md`, `src/main/scala/.../Requests.scala`, `actors/Room.scala`, `actors/RoomSnapshot.scala`, their specs (`RoomSpec`, `RoomSnapshotSpec`, `SnapshotContractSpec`), `frontend/src/protocol/snapshot.ts` and `.test.ts`, `frontend/src/room/nextIssue.ts` and `.test.ts`, `frontend/src/room/view.test.ts`, `frontend/src/components/NextIssueDialog.tsx`, `RoundHistory.tsx`, `e2e/fixtures.js`, `e2e/history.spec.js`, `e2e/next.spec.js`; regenerate `frontend/src/protocol/generated/openapi.json` and `openapi.d.ts`
- Test: `src/test/scala/.../APISpec.scala`

**Interfaces:**
- Produces: `Room.Outcome.Parked`; `Choice.Parked`; page `Choice` `{ type: 'Parked' }`.

- [ ] **Step 1: Rename** per ruling 1, then `sbt genOpenApi && npm run gen:api`; the script runs before the new case, which it would otherwise rewrite.
- [ ] **Step 2: Write the new cases.** `APISpec`, "answer 400 for a blank estimate or an unknown outcome" gains the raw body `{"round":4,"issue":"PP-2","outcome":{"type":"Unsettled"}}`, asserting `400` and nothing dispatched; a new run in "dispatch a next-issue command" sends `Choice.Parked` and the manager receives `Some(Room.Outcome.Parked)`.
- [ ] **Step 3: Run** `git grep -n -i unsettled -- ':!docs/superpowers' ':!.superpowers' ':!docs/design/room.html'` — Expected: only the new APISpec body.
- [ ] **Step 4: Run** `sbt test styleCheck && npm run typecheck && npm run lint && npm run test:unit && npm run e2e -- e2e/next.spec.js e2e/history.spec.js` — Expected: PASS in both browsers.
- [ ] **Step 5: Prove the new case can fail.** Decode `"Unsettled"` as `Parked` too: the `Unsettled` body answers `204` and goes red. Revert.
- [ ] **Step 6: Commit** this plan and the spec's decision 6 wording with the change: `refactor: rename the Unsettled outcome to Parked`

### Task 8: The legend kept while sending

**Files:**
- Modify: `frontend/src/room/nextIssue.ts`, `frontend/src/components/useNextIssue.ts`, `NextIssueDialog.tsx`
- Test: `frontend/src/room/nextIssue.test.ts`, `e2e/next.spec.js`

**Interfaces:**
- Produces: `NextEvent` `{ type: 'submit'; request: number; legend: string }`; Sending `legend: string`; `shows(...)` gains `legend: string | null`; the hook's `submit(legend: string)`.

- [ ] **Step 1: Write the failing unit tests.** `submit` with a choice and `legend: 'Round 3'` gives Sending with `legend: 'Round 3'`; `shows` of that Sending gives `legend: 'Round 3'` for its own round and the next; `shows` of Open and Closed gives `legend: null`; a failed answer gives Open, whose `shows` gives `legend: null`. The existing exact-shape expectations on Sending and `shows` gain `legend`.
- [ ] **Step 2: Run** `npm run test:unit` — Expected: FAIL.
- [ ] **Step 3: Implement** ruling 2. **Run** — Expected: PASS.
- [ ] **Step 4: Extend "Next issue moves the room on"**, in the held run: after `nextField` is visible again, `estimateRow(alice.page)` has the accessible name `Estimate for PP-2` while the room shows `PP-3`.
- [ ] **Step 5: Run** `npm run typecheck && npm run lint && npm run e2e -- e2e/next.spec.js` — Expected: PASS in both browsers.
- [ ] **Step 6: Prove two tests can fail**, reverting and rebuilding after each: the dialog renders `shortForm(issue, position).text` always (the held run goes red); `shows` returns `legend: null` in Sending (the unit case goes red).
- [ ] **Step 7: Commit** `fix: keep the estimate legend's issue while the move is sending`

### Task 9: The history rows' outcome column

**Files:**
- Modify: `frontend/src/components/round-history.css`, `e2e/fixtures.js` (ruling 7)
- Test: `e2e/history.spec.js`, `e2e/layout.spec.js`

**Interfaces:**
- Consumes: `Parked` (Task 7).
- Produces: `recordRounds(page, room, from, issues, outcomes?)`.

- [ ] **Step 1: Write the failing cases** in `e2e/history.spec.js`, at 1280 by 680 unless named:
  - "the outcomes form one column", in its own describe with `test.use({ launchOptions: { ignoreDefaultArgs: ['--hide-scrollbars'] } })` (ruling 10): record `3`, `13`, `0.5`: every row's issue cell ends at the same x (±0.5), noted as `x0`; record `Parked`: it is the latest row, its text's range lies within its slot's content box (±0.5), and every issue cell still ends at `x0`; record two more (`5`) so the list scrolls (`scrollHeight > clientHeight`): every issue cell still ends at `x0`. The latest row's computed `font-weight` is `700`, every other row's `400`. `historyList(page).ariaSnapshot()` lists each row as its issue and its outcome only, with no extra `Parked`.
  - "an off-deck value widens the column up to its cap": record `3`, noting the outcome slot's width `w0`; record `1000000`: its slot shows it whole (`scrollWidth <= clientWidth`) and is wider than `w0`; record `W` repeated 30 times: its slot is one line high (its height within the row's), its text starts at the slot's content left (±0.5), `scrollWidth > clientWidth`, and the slot is no wider than 40% of the row's content box (+0.5).
  - In the phone describe, "a width change within the phone layout leaves the scroll": 6 entries at 392 by 800, Show more, the list scrolled to 0; `setViewportSize` 360 by 800 and two animation frames: `scrollTop` still 0.
- [ ] **Step 2: Write the failing layout case** in `e2e/layout.spec.js`, in the describe that holds `containerAt`: "the history list does not scroll sideways": entries recorded with a long link first and `W` × 30 last; at 1280 by 600, then at 320 closed and opened: the list's `scrollWidth` is not over its `clientWidth`; at 320 closed, the latest row's issue cell is at least 50% of the row's content box wide.
- [ ] **Step 3: Run** `npm run e2e -- e2e/history.spec.js e2e/layout.spec.js` — Expected: FAIL on the column, the cap and the weight; the width change and sideways cases may already pass.
- [ ] **Step 4: Implement** rulings 3 to 5 and 7.
- [ ] **Step 5: Run** `npm run lint && npm run e2e -- e2e/history.spec.js e2e/layout.spec.js e2e/phone.spec.js` — Expected: PASS in both browsers.
- [ ] **Step 6: Prove each case can fail**, reverting and rebuilding after each; a mutation that stays green is a finding: drop the `::after` sizer (one column, at `Parked`); the sizer in `--weight-regular` (one column, at `Parked`: the bold word then widens the column itself); the outcome track `fit-content(2rem)` (Parked within its slot); drop `scrollbar-gutter` (one column, at the scroll; red in Chromium only, ruling 10); drop `visibility: hidden` (the aria snapshot); the latest row `--weight-strong` (the weight); `fit-content(40%)` to `auto` (the cap); `max-content` for the outcome track (sideways, and the issue's share); drop the height check in `useStickToEnd` (the width change).
- [ ] **Step 7: Commit** `feat: line the round history's outcomes up in one column`

### Task 10: The chips' look and the mockup

**Files:**
- Modify: `frontend/src/components/next-issue-dialog.css`, `docs/design/room.html`
- Test: `e2e/layout.spec.js`

- [ ] **Step 1: Extend the layout case** "a legend with a one-segment link wider than the dialog wraps within it, 320 by 640": check a chip on the first line: once lifted, its box starts at least `--space-2` below the legend's bottom (−0.5); check a chip on the second line: once lifted, at least `--space-2` below the bottom of the first line's chips (−0.5). Stricter than "overlaps neither": it pins the room the fix 24f5c94 made, where touching was the defect.
- [ ] **Step 2: Run** `npm run e2e -- e2e/layout.spec.js` — Expected: PASS (the room for the lift is built); prove it can fail: `.next-chips` `padding-top: 0` reddens the first check, `row-gap: var(--space-2)` the second. Revert, `npm run build`.
- [ ] **Step 3: Implement** ruling 8.
- [ ] **Step 4: Rewrite the mockup** per ruling 9; `grep -n -i "data-row\|data-chip\|q.get('word\|unsettled" docs/design/room.html` prints nothing.
- [ ] **Step 5: Run** `npm run lint && npm run e2e -- e2e/next.spec.js e2e/layout.spec.js` — Expected: PASS in both browsers.
- [ ] **Step 6: Show the user** the app's dialog and history panel beside the mockup's (`?next=modal&phase=revealed&later=1`, and `rounds=10`), at 1280 and 392 wide; wait for their OK.
- [ ] **Step 7: Commit** `feat: draw the estimate chips as the deck's cards and settle the mockup`

### Task 11: The list's end at the panel's border

Added after Task 10's look check: the outcome's right space read larger than the issue's left, as the reserved scrollbar gutter sat beside the outcomes (spec decision 6, amended). It replaces ruling 3's `margin-inline` only.

**Files:**
- Modify: `frontend/src/components/round-history.css`, `docs/design/room.html`, the spec's decision 6 and Tests
- Test: `e2e/layout.spec.js`

- [x] **Step 1: Extend** "the history list does not scroll sideways": at 1280 by 600 and at 320 opened, the list's end meets the inside of the panel's border (±0.5).
- [x] **Step 2: Run** `npm run e2e -- e2e/layout.spec.js -g "does not scroll sideways"` — Expected: FAIL at 1280 by 600 in both browsers.
- [x] **Step 3: Implement** `.round-history ol { margin-inline: calc(-1 * var(--space-2)) calc(-1 * var(--panel-inline)) }`, in the app and the mockup.
- [x] **Step 4: Run** `npm run lint && npm run e2e -- e2e/layout.spec.js e2e/history.spec.js e2e/history-column.spec.js e2e/phone.spec.js` — Expected: PASS in both browsers.
- [x] **Step 5: Commit** `fix: let the round history's list reach the panel's border at its end`
