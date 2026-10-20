# UI Refresh Step 4b: The Round Bar's Toggle and Guard, Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Show votes and Re-vote one button, the toggle, and guard every action in the round bar for 1 s after each flip, on today's look.

**Architecture:**
- `frontend/src/components/Controls.tsx` renders the toggle in Show's place and Clear votes. Two capture handlers on the bar hold its rules: a click is dropped while guarded or when its `detail` is above 1, and a repeated Enter is dropped.
- A new hook, `useRoundGuard(revealed: boolean): boolean` in `frontend/src/components/useRoundGuard.ts`, computes guarded in the render that shows the flip.
- Seven new cases in `e2e/room.spec.js` prove effects by counting command requests. Task 3 builds each mutation of the spec's Contract table against the finished bar, runs it and reverts it; none is committed.

**Tech Stack:** React 19 and Vite; Playwright 1.63 (Chromium and Firefox) against the testkit stub.

**Spec:** `docs/superpowers/specs/2026-10-20-ui-refresh-4b-round-toggle-design.md` (approved 2026-10-20). Its parent is `docs/superpowers/specs/2026-09-30-ui-refresh-design.md`, step 4.

## How this plan was verified

- **The spike, 2026-10-20.** The spike guard implemented decisions 1 to 4 without the `detail` rule. With it, the whole suite passed three times in both browsers, none flaky. Its mutations failed the cases the spec's spike table names. The cases below follow the spike's draft cases, with request counting (decision 6) in place of reads of the round's state.
- **The lint check.** The hook's shape in Task 2 passed `npx eslint` with the repo's react-hooks rules: a probe file, deleted at once.
- **Not run yet:** the cases as written here, and the `detail` rule.

## Rulings this plan makes, for the user's review

- **R1. The toggle lands before the guard (Task 1, then Task 2).** Each RED is then a real failure on the code before it: the toggle's cases fail on today's two buttons, and the guard's cases fail on the bare toggle. The commit between them has the unguarded toggle, which the spec says cannot ship. It never ships alone: one PR.
- **R2. The mutations run on the finished bar, in their own task (Task 3).** A rule checked before the guard exists could be masked by the guard once it does.
- **R3. Case 3 also forces a press on Clear.** The bar's rule covers every action (decision 4). No other case presses Clear while guarded, so this is the case that proves it.
- **R4. The later snapshot is an issue edit by Bob, read on Alice's box,** through the file's `setIssue`. While revealed, votes are refused, so they cannot serve.
- **R5. The class follows the label:** `btn show-bt` while voting, `btn revote-bt` while revealed. Today's colours stay; 4c1 restyles.
- **R6. A scratch Playwright script drives the dev hand check** against `npm run dev`, so its timings are measured. It is never committed.

## Global Constraints

**Branch and commits:**
- Branch `20260930.ui_refresh_4b_round_toggle`, stacked on #455 (1c). New commits only: no amend, rebase or force-push. Nothing is pushed until the user asks.
- Commit subjects, verbatim, in Conventional Commits:
  - Task 0: `docs: plan the round bar's toggle and guard (ui refresh step 4b)`
  - Task 1: `feat: make Show votes and Re-vote one toggle, dropping a double-click's and a held Enter's repeats (ui refresh step 4b)`
  - Task 2: `feat: guard the round bar for 1 s after each flip (ui refresh step 4b)`
  - Task 4: `docs: record step 4b in the reference and the known issues`
- No "Generated with Claude Code" or co-author line.

**Code:**
- The bar's buttons carry `aria-disabled="true"` while guarded, never `disabled`. The toggle is one element whose label changes.
- The guard lasts 1000 ms from the latest flip. A flip is a change of `revealed` between two renders of the mounted bar; the first render is never a flip.
- The hook writes no ref during render (decision 3).
- Comments are one or two lines.
- JavaScript style: `npx prettier --check --single-quote --no-semi --print-width 100 --trailing-comma none --arrow-parens avoid e2e/*.js` passes. TypeScript: `npm run typecheck` and `npm run lint` pass.
- The test contract reads roles, names, text and test ids only (`e2e/fixtures.js`).

**Running:**
- Once per session before any e2e run: `npm run pree2e` (builds the page and stages the app).
- After any change to `frontend/src/`: `npm run build`. The staged app serves `frontend/dist`, so no restage is needed.
- Use `npx playwright test`, not `npm run e2e`, whose `pree2e` restages every time.
- Mutation runs are Chromium only. Green runs are both browsers.
- The new cases' grep, used below as `$NEW`:
  `NEW="forced single press|double-click sends one|someone else's Show|held Enter fires once|second flip restarts|Clear while voting starts|first snapshot mounts"`

**Writing:**
- Cite symbols and case titles, never line numbers.
- No counts of commits, edits, items or lines in docs.
- No em dash.
- The spec's Status line stays as it is.

## Review Focus

1. **A reconnect that finds the phase changed.** It should guard like any flip (decision 1), which holds only if `Controls` stays mounted while the stream is lost. Check that `App` and `Room` keep it mounted under the connection banner. No case covers it.
2. **Space and touch.** They reach the bar as clicks, `detail` 0 for Space and 1 for a tap, so the capture handler must judge the click, not the keydown. No case presses Space.
3. **A command that fails while guarded.** The bar should stay as it was: no flip, and the timer runs on. `Room`'s `run` and its catch are unchanged; check that nothing new resets the guard.
4. **StrictMode's double render and double effect.** The suite runs the production build, so only Task 3's dev check exercises them. A guard that never ends, or ends at once, is the failure to look for.
5. **Every action is dropped while guarded, not just the toggle.** Case 3's forced Clear covers it (R3). A later button added outside the bar's element (step 5's Next issue) would escape the rule.

---

### Task 0: Commit the plan

**Files:**
- Create: `docs/superpowers/plans/2026-10-20-ui-refresh-4b-round-toggle.md`

- [ ] **Step 1: Commit**

```bash
git add docs/superpowers/plans/2026-10-20-ui-refresh-4b-round-toggle.md
git commit -m "docs: plan the round bar's toggle and guard (ui refresh step 4b)"
```

### Task 1: The toggle, and the bar's click and key rules

**Files:**
- Modify: `frontend/src/components/Controls.tsx`
- Test: `e2e/room.spec.js`

**Interfaces:**
- Produces: `Controls`' props are unchanged (`revealed`, `onShow`, `onRevote`, `onClear`). The bar is the `d-flex` element holding the buttons, with `onClickCapture` and `onKeyDownCapture`. In `e2e/room.spec.js`: `toggle(page)`, `commandsSent(page, room): string[]` and `laterSnapshot(from, to, issue)`, which Task 2's cases use.

- [ ] **Step 1: Add the helpers and the toggle's two cases**

Add `'a double-click sends one request'` and `'a held Enter fires once, and focus stays on the toggle across the flip'` after `'Re-vote is offered only while the round is revealed'`, with the helpers above them:

```js
// The round bar's toggle: Show votes while voting, Re-vote while revealed, one element.
const toggle = page => page.getByRole('button', { name: /^(Show votes|Re-vote)$/ })

// The round commands a page sends, in order; read only once a later snapshot has landed.
const commandsSent = (page, room) => {
  const sent = []
  const command = new RegExp(`/rooms/${room}/(show|revote|clear)$`)
  page.on('request', request => {
    const match = request.url().match(command)
    if (match) sent.push(match[1])
  })
  return sent
}

// By the time this shows on the other page, a press made before it would have sent its request.
const laterSnapshot = async (from, to, issue) => {
  await setIssue(from, issue)
  await expect(issueBox(to.page)).toHaveValue(issue)
}

// Both clicks usually land before the flip, so only the detail rule drops the second.
test('a double-click sends one request', async ({ join, room }) => {
  const alice = await join('Alice')
  const bob = await join('Bob')
  const sent = commandsSent(alice.page, room)

  await toggle(alice.page).dblclick()
  await expect(toggle(alice.page)).toHaveText('Re-vote')
  await laterSnapshot(bob, alice, 'PP-1')
  expect(sent).toEqual(['show'])
})

test('a held Enter fires once, and focus stays on the toggle across the flip', async ({
  join,
  room
}) => {
  const alice = await join('Alice')
  const bob = await join('Bob')
  const sent = commandsSent(alice.page, room)

  await toggle(alice.page).focus()
  await alice.page.keyboard.down('Enter')
  await expect(toggle(alice.page)).toHaveText('Re-vote')
  await expect(toggle(alice.page)).toBeFocused()
  // Past the guard, so only the Enter rule drops them; a down without an up is a repeat.
  await expect(toggle(alice.page)).not.toHaveAttribute('aria-disabled')
  await alice.page.keyboard.down('Enter')
  await alice.page.keyboard.down('Enter')
  await alice.page.keyboard.up('Enter')
  await laterSnapshot(bob, alice, 'PP-1')
  expect(sent).toEqual(['show'])
})
```

- [ ] **Step 2: Run them on today's page**

Run: `npm run pree2e && npx playwright test --project=chromium -g "double-click sends one|held Enter fires once"`
Expected: both FAIL.
- The double-click: `sent` is `['show', 'show']`.
- The held Enter: `toggle` matches two buttons while revealed, a strict mode violation.

- [ ] **Step 3: Rewrite `Controls`' bar as the toggle and Clear votes**

The toggle is one `<button>` in today's `mr-auto` slot:
- its label is `revealed ? 'Re-vote' : 'Show votes'`;
- its class follows R5;
- its `onClick` is `revealed ? onRevote : onShow`.

Delete the `mx-2` Re-vote slot. Clear votes stays as it is. On the `d-flex` element:
- `onClickCapture` calls `stopPropagation()` and `preventDefault()` when `e.detail > 1`.
- `onKeyDownCapture` calls `preventDefault()` when `e.repeat && e.key === 'Enter'`.

Give each handler a one-line comment, in `RoleLine`'s manner.

- [ ] **Step 4: Run the two cases, then the whole suite in both browsers**

Run: `npm run build && npx playwright test -g "double-click sends one|held Enter fires once"`
Expected: PASS, 4 of 4.
Run: `npx playwright test > "$WS/task1-suite.log" 2>&1; tail -5 "$WS/task1-suite.log"`, where `$WS` is the plan's workspace.
Expected: every case passes, none flaky.

- [ ] **Step 5: Check style and types**

Run: `npm run typecheck && npm run lint && npx prettier --check --single-quote --no-semi --print-width 100 --trailing-comma none --arrow-parens avoid e2e/*.js`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/Controls.tsx e2e/room.spec.js
git commit -m "feat: make Show votes and Re-vote one toggle, dropping a double-click's and a held Enter's repeats (ui refresh step 4b)"
```

### Task 2: The guard

**Files:**
- Create: `frontend/src/components/useRoundGuard.ts`
- Modify: `frontend/src/components/Controls.tsx`, `e2e/roles.spec.js`
- Test: `e2e/room.spec.js`

**Interfaces:**
- Consumes: Task 1's bar and its `onClickCapture`; `toggle`, `commandsSent` and `laterSnapshot` in `e2e/room.spec.js`.
- Produces: `export function useRoundGuard(revealed: boolean): boolean`.

- [ ] **Step 1: Add the guard's five cases**

Add them after Task 1's cases:

```js
test('a forced single press just after a flip sends nothing, and one after the 1 s acts', async ({
  join,
  room
}) => {
  const alice = await join('Alice')
  const bob = await join('Bob')
  const sent = commandsSent(alice.page, room)

  await toggle(alice.page).click()
  await expect(toggle(alice.page)).toHaveText('Re-vote')
  // Forced, since a plain click waits while the button is aria-disabled.
  await toggle(alice.page).click({ force: true })
  await laterSnapshot(bob, alice, 'PP-1')
  expect(sent).toEqual(['show'])

  await expect(toggle(alice.page)).not.toHaveAttribute('aria-disabled')
  await toggle(alice.page).click({ force: true })
  await expect(toggle(alice.page)).toHaveText('Show votes')
  expect(sent).toEqual(['show', 'revote'])
})

test("someone else's Show guards my bar", async ({ join, room }) => {
  const alice = await join('Alice')
  const bob = await join('Bob')
  const sent = commandsSent(alice.page, room)

  await toggle(bob.page).click()
  await expect(toggle(alice.page)).toHaveText('Re-vote')
  await toggle(alice.page).click({ force: true })
  await alice.page.getByRole('button', { name: 'Clear votes' }).click({ force: true })
  await laterSnapshot(bob, alice, 'PP-1')
  expect(sent).toEqual([])
})

test('a second flip restarts the guard', async ({ join, room }) => {
  const alice = await join('Alice')
  const bob = await join('Bob')
  const sent = commandsSent(alice.page, room)

  await toggle(alice.page).click()
  await expect(toggle(alice.page)).toHaveText('Re-vote')
  await alice.page.waitForTimeout(600)
  // Straight to the API: every bar is guarded, so a second flip comes from outside them.
  expect((await bob.page.request.post(`/rooms/${room}/revote`)).ok()).toBe(true)
  await expect(toggle(alice.page)).toHaveText('Show votes')
  // Past the first flip's 1 s, within the second's.
  await alice.page.waitForTimeout(500)
  await toggle(alice.page).click({ force: true })
  await laterSnapshot(bob, alice, 'PP-1')
  expect(sent).toEqual(['show'])
})

test('a Clear while voting starts no guard', async ({ join, room }) => {
  const alice = await join('Alice')
  const bob = await join('Bob')
  const sent = commandsSent(alice.page, room)

  await vote(bob.page, '5')
  await expect(votedMark(participantEntry(alice.page, 'Bob'))).toHaveCount(1)
  await alice.page.getByRole('button', { name: 'Clear votes' }).click()
  await expect(votedMark(participantEntry(alice.page, 'Bob'))).toHaveCount(0)
  await toggle(alice.page).click({ force: true })
  await expect(toggle(alice.page)).toHaveText('Re-vote')
  expect(sent).toEqual(['clear', 'show'])
})

test('the first snapshot mounts the bar unguarded', async ({ join, room }) => {
  const alice = await join('Alice')
  const sent = commandsSent(alice.page, room)

  await toggle(alice.page).click({ force: true })
  await expect(toggle(alice.page)).toHaveText('Re-vote')
  expect(sent).toEqual(['show'])
})
```

- [ ] **Step 2: Run them on Task 1's bar**

Run: `npx playwright test --project=chromium -g "forced single press|someone else's Show|second flip restarts|Clear while voting starts|first snapshot mounts"`
Expected:
- The forced press, someone else's Show and the restart FAIL; the first has `sent` `['show', 'revote']`.
- The Clear while voting and the first snapshot PASS: they pin the unguarded bar, and Task 3's mutations are their RED.

- [ ] **Step 3: Implement `useRoundGuard(revealed: boolean): boolean` in `frontend/src/components/useRoundGuard.ts`**

The construction is decision 3's. The lint check passed this exact shape:

```ts
const [seen, setSeen] = useState(revealed)
const [flips, setFlips] = useState(0)
const [guarded, setGuarded] = useState(false)
if (seen !== revealed) {
  setSeen(revealed)
  setFlips(f => f + 1)
  setGuarded(true)
}
useEffect(() => {
  if (flips === 0) return
  const timer = setTimeout(() => setGuarded(false), GUARD_MS)
  return () => clearTimeout(timer)
}, [flips])
return guarded
```

`GUARD_MS = 1000` is a module constant. Give the function a comment of one or two lines: guarded for 1 s after each flip, computed in the render that shows it.

- [ ] **Step 4: Guard the bar in `Controls`**

- Call `const guarded = useRoundGuard(revealed)`.
- The capture handler drops a click when `guarded || e.detail > 1`.
- Both buttons get `aria-disabled={guarded || undefined}`.

- [ ] **Step 5: Add the roles case's wait (decision 5)**

In `e2e/roles.spec.js`, `"a facilitator's page has no deck, and keeps Show, Re-vote and Clear"`, add this before Alice's Clear votes click:

```js
  // Alice's own page must have flipped, or her Clear can land as the flip guards it.
  await expect(alice.page.getByRole('button', { name: 'Re-vote' })).toBeVisible()
```

- [ ] **Step 6: Run the five cases, then the whole suite in both browsers**

Run: `npm run build && npx playwright test -g "forced single press|someone else's Show|second flip restarts|Clear while voting starts|first snapshot mounts"`
Expected: PASS, 10 of 10.
Run: `npx playwright test > "$WS/task2-suite.log" 2>&1; tail -5 "$WS/task2-suite.log"`
Expected: every case passes, none flaky.

- [ ] **Step 7: Check style, types and the unit tests**

Run: `npm run typecheck && npm run lint && npm run test:unit && npx prettier --check --single-quote --no-semi --print-width 100 --trailing-comma none --arrow-parens avoid e2e/*.js`
Expected: no errors; the unit tests pass.

- [ ] **Step 8: Commit**

```bash
git add frontend/src/components/useRoundGuard.ts frontend/src/components/Controls.tsx e2e/room.spec.js e2e/roles.spec.js
git commit -m "feat: guard the round bar for 1 s after each flip (ui refresh step 4b)"
```

### Task 3: Prove each case can fail, and check StrictMode by hand

No commit. Every result goes to the ledger, one line per mutation, and the dev check's result also goes into the PR body when the user asks to push.

**Files:**
- Temporarily modify, never commit: `frontend/src/components/Controls.tsx`, `frontend/src/components/useRoundGuard.ts`, `frontend/src/components/Room.tsx`
- Scratch only: a Playwright script in the session's scratchpad

- [ ] **Step 1: Run each mutation against the new cases**

For each row:
1. Apply the edit to the committed code.
2. Run `npm run build && npx playwright test --project=chromium -g "$NEW"`.
3. Compare the result with the row.
4. Restore with `git checkout -- frontend/src`.

A case in brackets may also fail; any other failure is a finding.

| Mutation | Edit | Fails |
| --- | --- | --- |
| No guard | `useRoundGuard` returns `false` | the forced press, someone else's Show, the restart |
| The drop removed, `aria-disabled` kept | the capture handler tests only `e.detail > 1` | the forced press, someone else's Show, the restart |
| No `detail` rule | the capture handler tests only `guarded` | the double-click |
| The guard started only by this page's own press | `Controls` keeps `presses` in state, its toggle's `onClick` adds one, and it calls `useRoundGuard(presses % 2 === 1)` | someone else's Show, the restart |
| No Enter rule | `onKeyDownCapture` removed | the held Enter |
| The toggle as two elements | `revealed ? <button key="revote">… : <button key="show">…`, one per label | the held Enter, at `toBeFocused` |
| No restart | the render-time block bumps `flips` and sets `guarded` only when `!guarded` | the restart |
| Any snapshot starts the guard | `Room` passes `snapshot={snapshot}` and `Controls` calls `useRoundGuard(snapshot as never)` | the Clear while voting (the first snapshot, if a join sends a second snapshot) |
| The guard started on mount | `guarded` starts `true`, and the effect drops its `flips === 0` return | the first snapshot (the held Enter, if Alice's bar mounted under 1 s before her Enter) |

- [ ] **Step 2: Check the restore**

Run: `git status --short && npm run build`
Expected: a clean tree; the build passes.

- [ ] **Step 3: Check the guard by hand under StrictMode**

1. Start the backend with `sbt run` (port 8080) and `npm run dev` (port 5173) in the background.
2. Run a scratch Playwright script against `http://localhost:5173` that:
   - creates a room with `POST /create-room` and joins Alice and Bob through the lobby, each in a context of their own;
   - collects console errors;
   - after Alice's Show, polls her toggle's `aria-disabled` every 50 ms and logs when it appears and when it clears;
   - posts `revote` as Bob 600 ms after the first flip, and logs again when Alice's guard clears.

Expected:
- The guard clears about 1 s after the first flip when nothing follows it, and about 1 s after the second flip when one does.
- It never stays on, and it never clears at once.
- No console errors.

Stop both servers afterwards.

- [ ] **Step 4: Ledger the results**

Write one ledger line per mutation, then the dev check's timings.

### Task 4: The reference and the known issues

**Files:**
- Modify: `docs/design/ui-reference.md`, `docs/known-issues.md`

- [ ] **Step 1: Edit the reference's J5 Show line**

In J5's list, replace "Show is hidden while revealed (a contract change of step 4, after step 1c has removed Show's incidental uses)." with:

"Show is hidden while revealed by becoming the toggle, built with its guard in step 4b (a contract change, after step 1c removed Show's incidental uses)."

- [ ] **Step 2: Add the reference's 4b log entry**

Add after the `**1c.**` entry in the Decisions log:

```markdown
- **4b.** The round bar's toggle and guard (the UI refresh design's step 4b)
  reopened J5's set-aside "a separate step to hide Show": Show is now hidden
  by becoming the toggle, and the toggle needs the guard, a behaviour judged
  by its own cases. Set aside: hiding Show inside the restyle.
```

- [ ] **Step 3: Point the reference's not-a-room line at 4d**

In Open, replace "which step 4's brainstorm raises first" with "which step 4d's brainstorm raises first".

- [ ] **Step 4: Add the late Clear's known issue**

Add it after "A late Re-vote unconfirms a vote cast in the round it reopened":

```markdown
### A late Clear discards the votes cast in the round a Re-vote reopened

- **Where:** `src/main/scala/com/lunatech/pointingpoker/actors/Room.scala`
  (`RoomData.clear`, which applies whatever the phase).
- **Issue:** Alice presses Clear votes on a revealed round while Bob presses
  Re-vote. Bob's lands first and reopens the round, and Carol votes. Then
  Alice's lands and clears Carol's fresh vote. The round bar's guard (step 4b)
  acts on one page only, so it cannot stop a press already sent. It needs two
  people within a round trip, and it is the page's behaviour before 4b.
- **Resolution:** Stays open. Only a round number in the command would close
  it, as for the late Re-vote above.
```

- [ ] **Step 5: Extend the role line's re-click entry to the bar**

- Retitle it "A deliberate re-click on the role line or the round bar within the double-click time is ignored".
- Add `frontend/src/components/Controls.tsx` (the bar's `onClickCapture`) to Where.
- Append to Issue: "The round bar does the same since step 4b. There it matters only for a press that flips nothing, such as Clear votes pressed twice while voting; after a flip, the 1 s guard ignores the second click anyway."

- [ ] **Step 6: Add the double-tap phone risk**

Add it after the virtual keyboard entry:

```markdown
### A fast double-tap on the round bar may send its command twice

- **Where:** `frontend/src/components/Controls.tsx` (the bar's
  `onClickCapture`).
- **Issue:** The bar drops a click whose `detail` is above 1. A browser that
  reports a fast double-tap as two single clicks lets the second through if it
  lands before the flip reaches the page (inferred for iOS, not checked on a
  phone). The second command acts on the phase it was aimed at, as a second
  Show does.
- **Resolution:** Stays open until a phone is at hand on the deployed app; never
  a merge gate.
```

- [ ] **Step 7: Check the docs**

Run: `git diff --stat && git diff -U0 | grep '^+' | grep -c '—'`
Expected: only the two docs changed; the count is `0`.

- [ ] **Step 8: Commit**

```bash
git add docs/design/ui-reference.md docs/known-issues.md
git commit -m "docs: record step 4b in the reference and the known issues"
```

After Task 4, the execution skill's whole-branch review runs on the most capable model, with this plan's Review Focus.
