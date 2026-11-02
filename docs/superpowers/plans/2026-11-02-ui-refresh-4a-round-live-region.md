# UI Refresh Step 4a: The Round's Live Region, Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The round bar's phase line becomes a `role="status"` region that announces each flip with a heard sentence, while the screen keeps the seen word.

**Architecture:** The Result's `.result-sr` rule moves to `looks.css` as a shared `visually-hidden` class. `RoundBar` renders, inside the phase line's `h2`, the seen word (`aria-hidden`) and the heard sentence (`visually-hidden`), both from `revealed`. The e2e fixtures follow the spec's Terms: `phaseLine` is the region, `phaseWord` the seen word.

**Tech Stack:** React 19, TypeScript, plain CSS; Playwright (Chromium and Firefox).

**Spec:** `docs/superpowers/specs/2026-11-02-ui-refresh-4a-round-live-region-design.md`

## How this plan was verified

- **Checked in the code:**
  - `RoundBar.tsx` renders `<div className="round-bar-phase" data-testid="phase-line"><h2 className="panel-label">{revealed ? 'Revealed' : 'Voting'}</h2></div>`.
  - `.result-sr` (`result.css`) is `position: absolute; overflow: hidden; clip-path: inset(50%); white-space: nowrap`, used by `Result.tsx` (inside each `tally-entry`) and `docs/design/room.html` (its result template).
  - `e2e/fixtures.js`: `phaseLine = page => page.getByTestId('phase-line')`; `issueStatus` is `page.getByRole('status').and(page.getByTestId('issue-status'))`; `markRegion`, `expectLiveRegion`, `connectionLost`, `connectionAlert`, `results`, `tallyEntries` are exported; `join(name)` returns `{ page, cut, restore }`.
  - `phaseLine` is read by `toHaveText` in `roles.spec.js`, `room.spec.js` and `layout.spec.js`, and by two `readBoxes` calls in `layout.spec.js`. The `readBoxes` calls keep working unchanged: the new `phaseLine` finds the same wrapper.
  - 'a revealed round takes no more votes until Re-vote' clicks Show then Re-vote on one page with no explicit wait; Playwright's actionability check waits out the round guard's `aria-disabled` (4b's "one wait").

## Rulings this plan makes, for the user's review

- **R1. `phaseLine` is `page.getByRole('status').and(page.getByTestId('phase-line'))`**, the `issueStatus` shape. `phaseWord` is `page => page.getByTestId('phase-word')`. Set aside: scoping `phaseWord` under `roundBar`, as the test id is unique.
- **R2. Heard is read as `phaseLine(page).getByRole('heading')` with `toHaveAccessibleName`**, with no fixture of its own (spec decision 4). Set aside: a `phaseHeard` fixture, one more name for a one-line read.
- **R3. The Result's assertion goes in 'the tally counts only the votes that were cast'**, on `tallyEntries(alice.page).first().getByTestId('tally-sr')`. Set aside: a new case, a setup for one line.
- **R4. The shared rule is `.result-sr`'s four declarations verbatim plus `text-transform: none`.** Set aside: adding the classic `width: 1px; height: 1px; margin: -1px`, which the Result never needed and which no case asks for.
- **R5. The flip cases rely on Playwright's actionability wait for the round guard**, as the existing Show-then-Re-vote case does. Set aside: an explicit `toBeEnabled` wait, a second spelling of the same wait.
- **R6. One task for the region, its fixtures and its cases.** The fixture switch only makes sense once `phase-word` exists, and the two cases are its proof. Set aside: a fixture-only commit first, which would fail every phase-line assertion until the markup lands.

## Global Constraints

**Branch and commits:**
- Branch `20260930.ui_refresh_4a_round_live_region`, stacked on `20260930.ui_refresh_4d_not_a_room` (#481). The spec, the parent's changes and the known issue are committed. New commits only: no amend, rebase or force-push, and nothing pushed until the user asks.
- Commit subjects, verbatim:
  - Task 0: `docs: plan the round's live region (ui refresh step 4a)`
  - Task 1: `refactor: share the visually hidden rule (ui refresh step 4a)`
  - Task 2: `feat: announce the round's phase from its line (ui refresh step 4a)`
- No "Generated with Claude Code" or co-author line.

**Code:**
- Comments are one or two lines, with no em dash. No semicolons, single quotes, two-space indent, lines under about 100 characters.
- Texts, verbatim: seen "Voting" / "Revealed"; heard "Voting open" / "Votes revealed".
- Test ids, verbatim: `phase-line` (kept), `phase-word`, `phase-heard`, `tally-sr`.

**Mutations:** first `git add` the task's files, so a revert restores the task's work rather than HEAD. Then, for each: apply the mutation, run the case, see it FAIL on the named assertion, then revert it with `git checkout -- <file>`. The task's report names each mutation and its failing line. If a case passes under its mutation, **stop and report**: the case goes back to the spec.

**Running:**
- Once per worktree, before any browser run: `npm run stage` (sbt; this worktree has never staged).
- Checks: `npm run typecheck && npm run lint && npm run test:unit`. `snapshot.contract.test.ts` needs `target/contract/`, written by `sbt test`; run `sbt test` once if it reports no snapshots.
- Browser: `npm run build && npx playwright test e2e/<file> -g "<title>" --workers=1`, adding `--project=chromium` for `layout.spec.js`. The default worker count ran the workstation out of memory on 2026-10-28.

## Review Focus

- No sideways scroll at phone widths: the absolutely positioned heard span keeps its static place, right after the seen word in the `h2`; the existing "scrolls no page sideways" layout cases cover it, so a failure there is this step's.
- The mockup's revealed view (`docs/design/room.html`) shows no "5: 2 votes" text after Task 1: by eye, no case reads the mockup.
- Firefox: every new case runs in both projects; a Firefox-only failure is a finding, not a flake to retry past.
- A reload mid-round (Bob reloads after a Show): the line appears holding "Votes revealed" heard and "Revealed" seen; covered by the matrix's join/reload row, by hand in Task 3.
- StrictMode in `npm run dev`: the region is still one element after the double mount, which `markRegion` would show; by hand only if a case flakes.

---

### Task 0: Commit the plan

- [ ] **Step 1:** Commit this plan with Task 0's subject.

### Task 1: The shared visually hidden rule (spec decision 3)

**Files:**
- Modify: `frontend/src/components/looks.css`, `frontend/src/components/result.css`, `frontend/src/components/Result.tsx`, `docs/design/room.html`
- Test: `e2e/room.spec.js` ('the tally counts only the votes that were cast')

**Interfaces:**
- Produces: the class `visually-hidden` in `looks.css`; `data-testid="tally-sr"` on each column's hidden text.

- [ ] **Step 1: Add the failing assertion** to 'the tally counts only the votes that were cast', after its `tallyEntries` count:

```js
await expect(tallyEntries(alice.page).first().getByTestId('tally-sr')).toHaveCSS(
  'clip-path',
  'inset(50%)'
)
```

- [ ] **Step 2: Run it** (both projects): FAIL, no element for `tally-sr`.
- [ ] **Step 3: Move the rule.** Delete `.result-sr` from `result.css`; add `.visually-hidden` to `looks.css` with the same four declarations plus `text-transform: none` (R4), and a one-line comment saying hidden text is exposed as written. In `Result.tsx` and `room.html`'s result template, the span takes `visually-hidden` and `data-testid="tally-sr"`.
- [ ] **Step 4: Run it again**: PASS in both projects.
- [ ] **Step 5: Mutations**, after `git add` of the task's files, each FAIL on the new assertion: the class misspelt in `Result.tsx`; `clip-path` dropped from `.visually-hidden`.
- [ ] **Step 6: Checks** and `npx playwright test e2e/room.spec.js --workers=1`: PASS. Open `docs/design/room.html` in its revealed state: no column's count text shows twice.
- [ ] **Step 7: Commit** with Task 1's subject.

### Task 2: The phase line's region, fixtures and cases (spec decisions 1, 2, 4)

**Files:**
- Modify: `frontend/src/components/RoundBar.tsx`, `e2e/fixtures.js`, `e2e/roles.spec.js`, `e2e/room.spec.js`, `e2e/layout.spec.js`
- Test: `e2e/room.spec.js` (two new cases)

**Interfaces:**
- Consumes: `visually-hidden` (Task 1).
- Produces: `phaseLine` (the region, R1), `phaseWord` (the seen word), both exported from `e2e/fixtures.js`.

- [ ] **Step 1: Fixtures.** `phaseLine` becomes R1's locator, its comment one line: the phase line, the round's live region. Add `phaseWord` below it: the seen word, "Voting" or "Revealed".
- [ ] **Step 2: Switch the text assertions.** Every `expect(phaseLine(…)).toHaveText(…)` in `roles.spec.js`, `room.spec.js` and `layout.spec.js` reads `phaseWord(…)`, messages unchanged; import `phaseWord` where needed. `readBoxes` calls stay on `phaseLine`.
- [ ] **Step 3: Write the two cases** in `room.spec.js`, after 'a revealed round takes no more votes until Re-vote':

```js
test('the phase line announces each flip from one region', async ({ join }) => {
  const alice = await join('Alice')
  const bob = await join('Bob')
  const line = phaseLine(bob.page)
  const heard = line.getByRole('heading')
  const hidden = line.getByTestId('phase-heard')

  await expect(heard).toHaveAccessibleName('Voting open')
  await expect(hidden).toHaveCSS('clip-path', 'inset(50%)')
  await expect(hidden).toHaveCSS('text-transform', 'none')
  await markRegion(line)

  await alice.page.getByRole('button', { name: 'Show votes' }).click()
  await expect(heard).toHaveAccessibleName('Votes revealed')
  await expectLiveRegion(line)

  await alice.page.getByRole('button', { name: 'Re-vote' }).click()
  await expect(heard).toHaveAccessibleName('Voting open')
  await expectLiveRegion(line)
})
```

Then **'the phase line stays one region through a reconnect that finds the round changed'**, declaring its own `line` and `heard` as above: Bob's `line` marked; `bob.cut()`, `connectionLost(bob.page)` visible; Alice's Show, `results(alice.page)` visible; `bob.restore()`, `connectionAlert(bob.page)` hidden within 10 s (as 'a vote survives its own reconnect'); then `heard` is "Votes revealed" and `expectLiveRegion(line)` passes.

- [ ] **Step 4: Run the two cases**: FAIL, `phaseLine` finds no `status` (the reconnect case only at the 60 s test timeout, as `markRegion` waits for the element).
- [ ] **Step 5: The markup.** In `RoundBar.tsx`, the wrapper takes `role="status"`; its `h2` holds `<span aria-hidden="true" data-testid="phase-word">` with the seen word and `<span className="visually-hidden" data-testid="phase-heard">` with the heard sentence, both from `revealed`. One comment line: the word is seen, the sentence heard, and the wrapper announces each flip.
- [ ] **Step 6: Run the two cases**: PASS in both projects.
- [ ] **Step 7: Mutations**, after `git add` of the task's files, each FAIL where named:
  - the wrapper keyed by `revealed` (`key={String(revealed)}`): `expectLiveRegion` after the Show;
  - `role="status"` removed: the opening `toHaveAccessibleName`;
  - `aria-hidden` removed from the seen word: the opening `toHaveAccessibleName`;
  - the two sentences swapped: the opening `toHaveAccessibleName`;
  - the heard span's class misspelt: the `clip-path` assertion;
  - `clip-path` dropped from `.visually-hidden`: the `clip-path` assertion;
  - `text-transform: none` dropped: the `text-transform` assertion;
  - `RoomPage` keyed by the lost flag in `App.tsx` (`key={String(room.lost)}`): the reconnect case's `expectLiveRegion`.
- [ ] **Step 8: Full run**: checks, then `npx playwright test e2e/room.spec.js e2e/roles.spec.js e2e/slug.spec.js --workers=1` and `npx playwright test e2e/layout.spec.js --project=chromium --workers=1`: PASS. `slug.spec.js` runs because the phase line joins its no-cover check through `closest('[role="status"]')`, with no edit.
- [ ] **Step 9: Commit** with Task 2's subject.

### Task 3: The hand check (the user's, after the final review)

Orca on Firefox, against the app the executor starts for the user (`SECURE_COOKIES=false sbt run` and `npm run dev`, as in the README; if port 8080 is taken, ask the user first). Two windows: Alice and Bob; the user listens on Bob.

- [ ] **Judged runs** (spec, Hand check). Each flip is announced, speaking the heard sentence once and never the seen word:
  - Alice's Show, then her Re-vote, Bob's focus elsewhere than a card;
  - Bob's own Show;
  - heading navigation to the phase line reads the sentence.
- [ ] **Recorded runs**, which cannot stop the step: Alice's Show, and Bob's own last vote auto-revealing, each with Bob's focus on a card; Bob reloading a revealed round (nothing announced, the accepted cost).
- [ ] **Record** what was heard, the button's rename and any focus loss included, for the PR's Verified section. A judged failure stops the plan; the finding goes back to the spec.
