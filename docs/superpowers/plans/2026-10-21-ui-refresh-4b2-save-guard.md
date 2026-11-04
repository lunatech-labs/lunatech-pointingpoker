# UI Refresh Step 4b2: The Editor's Save Guard and Closing Focus, Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep focus on Save issue and Cancel editing while saving, return focus to Edit issue when the editor closes, and drop a double-click's second press and a held Enter's repeats in the editor, on today's look.

**Architecture:**
- All the code is in `frontend/src/components/IssueEditor.tsx`. `room/issueEditor.ts` and `useIssueEditor.ts` are unchanged: their checks already ignore a press outside editing.
- While saving, Save and Cancel carry `aria-disabled` and Bootstrap's `disabled` class, never `disabled`. Two effects decide focus: the failure effect, narrowed to "only if focus fell", and a new close effect.
- Capture handlers on the editor's outer element hold the press rules. The field has its own repeat check.
- Eight new cases in `e2e/room.spec.js` and one changed case prove effects by focus and by counting issue saves. Task 4 runs each mutation of the spec's Contract table against the finished editor, then reverts it; none is committed.

**Tech Stack:** React 19 and Vite; Bootstrap 4.6.2; Playwright 1.63 (Chromium and Firefox) against the testkit stub.

**Spec:** `docs/superpowers/specs/2026-10-20-ui-refresh-4b2-save-guard-design.md` (approved 2026-10-21). Its parent is `docs/superpowers/specs/2026-09-30-ui-refresh-design.md`, step 4.

## How this plan was verified

- **The spike, 2026-10-20.** It measured where the buttons sit and what a double-click on Edit does with no rule, with the click rule, and with the click and mousedown rules. It also checked that a click rule leaves word selection in the field working. Both browsers were used. Case 5 and the mousedown rule follow it.
- **Read, not run:** each case's RED below is reasoned from today's code and the spike, and so is each mutation's failing case. Task 4 checks them.

## Rulings this plan makes, for the user's review

- **R1. The order is the Save guard, then the closing focus, then the press rules (Tasks 1 to 3).** Each RED is then a real failure on the code before it. Between Task 1 and Task 2, a successful mouse save drops focus to the page, as `disabled` does today. It never ships alone: one PR.
- **R2. A close is detected by an effect on `editor.mode`.** The last mode is kept in a ref that only the effect writes. On mount, StrictMode's double effect sees viewing twice, so it finds no close. Set aside: focusing Edit from each close's own handler. A successful save ends in a promise, which would need `flushSync` to reach a mounted Edit.
- **R3. The mousedown and click rules act only on a target inside a `<button>`,** found with `closest('button')`, so a double-click in the field still selects a word (decision 4, "a button's click"). The Enter rule is one `onKeyDownCapture` on the editor, as on the round bar.
- **R4. Three new helpers in `e2e/room.spec.js`:** `issueSaves`, `holdSaves` and `laterVote`.
  - 'a double-clicked Save issue posts once' keeps its inline counter, since the spec leaves every other case unchanged.
  - The later point is Bob's vote, not 4b's `laterSnapshot`. An issue edit by Bob would raise the conflict notice in an editor a mutation left open.
- **R5. Case 1 also reads `aria-disabled="true"` on Save while the save is held.** This is the only check of decision 1's attribute, and it cannot wait anything out: the save stays held until the case releases it.
- **R6. One module function, `focusFell(): boolean`, serves both effects.**
- **R7. Two hand checks.**
  - The StrictMode check is a scratch Playwright script against `npm run dev` (Task 4).
  - The Orca check is the user's, after the final review (Task 6). Its result decides the screen reader entry's commit. If Orca is not at hand, the entry stays, its text updated to the built mechanism and marked unheard.

## Global Constraints

**Branch and commits:**
- Branch `20260930.ui_refresh_4b2_save_guard`, stacked on 4b's `20260930.ui_refresh_4b_round_toggle` (#456).
- New commits only: no amend, rebase or force-push. Nothing is pushed until the user asks.
- Commit subjects, verbatim, in Conventional Commits:
  - Task 0: `docs: plan the editor's save guard and closing focus (ui refresh step 4b2)`
  - Task 1: `feat: keep focus on Save issue and Cancel editing while saving (ui refresh step 4b2)`
  - Task 2: `feat: return focus to Edit issue when the editor closes (ui refresh step 4b2)`
  - Task 3: `feat: drop a double-click's second press and a held Enter's repeats in the issue editor (ui refresh step 4b2)`
  - Task 5: `docs: extend the re-click known issue to the issue editor (ui refresh step 4b2)`
  - Task 6: `docs: close the known issue of a failed save unheard from Save issue (ui refresh step 4b2)`, or with `narrow` or `update` in place of `close`, as the check decides.
- No "Generated with Claude Code" or co-author line.

**Code:**
- While saving, Save and Cancel are `aria-disabled="true"`, never `disabled`, and carry the class `disabled` beside `btn btn-outline-secondary`.
- Focus fell: `document.activeElement` is `document.body` or `null`.
- A close is a change of mode to viewing, from editing or saving. The mount is not a close.
- Comments are one or two lines.
- JavaScript style: `npx prettier --check --single-quote --no-semi --print-width 100 --trailing-comma none --arrow-parens avoid e2e/*.js` passes. TypeScript: `npm run typecheck` and `npm run lint` pass.
- The test contract reads roles, names, text and test ids only (`e2e/fixtures.js`).

**Running:**
- Once per session before any e2e run: `npm run pree2e`.
- After any change to `frontend/src/`: `npm run build`.
- Use `npx playwright test`, not `npm run e2e`.
- Mutation runs are Chromium only. Green runs are both browsers.
- The new and changed cases' grep, used below as `$NEW`:
  `NEW="mouse save keeps focus|each end with focus on Edit|moved elsewhere during a save|page load leaves focus|double-click on Edit issue|held Enter in the field|held Enter on Edit issue|network drops keeps"`

**Writing:**
- Cite symbols and case titles, never line numbers.
- No counts of commits, edits, items or lines in docs.
- No em dash.
- The spec's Status line stays as it is.

## Review Focus

The spec's Contract fixes the cases, so these go to the final reviewer rather than becoming new cases.

1. **A browser where a click does not focus a button (Safari, macOS).** Focus stays in the field through the save. A failure should leave it there, and a success should put it on Edit. 'a commit that never blurred the box' stands in for the click but reads no focus.
2. **Space or a tap on Save or Cancel mid-save.** These reach the editor as clicks with `detail` 0 or 1, past the capture rules. `submit`'s check and `step`'s `cancel` rule must drop them; case 1 proves it only for a forced mouse click.
3. **A hung save, until `timed` ends it after `REQUEST_TIMEOUT_MS`.** Save and Cancel should stay faded and keep focus, and the failure should leave focus on Save. No case waits that long.
4. **StrictMode's double render and double effect on the close rule.** Only Task 4's dev check runs them. The failures to look for are a close found on mount, and Edit focused twice or not at all.
5. **A double-click on a word in the field still selects it.** The mousedown rule must stay the buttons' alone (R3; the spike). No case covers it.

---

### Task 0: Commit the plan

**Files:**
- Create: `docs/superpowers/plans/2026-10-21-ui-refresh-4b2-save-guard.md`

- [ ] **Step 1: Commit**

```bash
git add docs/superpowers/plans/2026-10-21-ui-refresh-4b2-save-guard.md
git commit -m "docs: plan the editor's save guard and closing focus (ui refresh step 4b2)"
```

### Task 1: The Save guard (decisions 1 and 2)

**Files:**
- Modify: `frontend/src/components/IssueEditor.tsx`
- Test: `e2e/room.spec.js`

**Interfaces:**
- Produces, in `IssueEditor.tsx`: the module function `focusFell(): boolean`, which Task 2 uses.
- Produces, in `e2e/room.spec.js`, used by Tasks 2 and 3:
  - `issueSaves(page, room): string[]`
  - `holdSaves(page, room): Promise<() => void>`
  - `laterVote(voter, watcher): Promise<void>`

- [ ] **Step 1: Change the contract case**

In 'a save the network drops keeps the draft and says so', replace the comment and the box's `toBeFocused` with:

```js
  // Save issue keeps focus through the failure, so the failure is read from it and Enter retries.
  await expect(issueSave(alice.page)).toBeFocused()
```

Its `keyboard.press('Enter')` is unchanged, and now presses Save.

- [ ] **Step 2: Add the helpers and case 1**

Add them after 'a failed save leaves focus the user moved elsewhere':

```js
// The issue saves a page sends; read only once a later frame has landed.
const issueSaves = (page, room) => {
  const sent = []
  page.on('request', request => {
    if (request.url().endsWith(`/rooms/${room}/edit-issue`)) sent.push(request.postData())
  })
  return sent
}

// Holds every issue save in flight until the returned release is called.
const holdSaves = async (page, room) => {
  let release
  const held = new Promise(resolve => (release = resolve))
  await page.route(new RegExp(`/rooms/${room}/edit-issue$`), async route => {
    await held
    await route.continue()
  })
  return release
}

// By the time the voter's vote shows on the watcher's page, an earlier press has sent its request.
const laterVote = async (voter, watcher) => {
  await vote(voter.page, '5')
  await expect(votedMark(participantEntry(watcher.page, voter.name))).toHaveCount(1)
}

test('a mouse save keeps focus on Save issue, and presses on it or Cancel mid-save do nothing', async ({
  join,
  room
}) => {
  const alice = await join('Alice')
  const bob = await join('Bob')
  const saves = issueSaves(alice.page, room)
  const release = await holdSaves(alice.page, room)

  await issueEdit(alice.page).click()
  await issueBox(alice.page).fill('mine')
  await issueSave(alice.page).click()
  await expect(issueSave(alice.page)).toHaveAttribute('aria-disabled', 'true')
  await expect(issueSave(alice.page)).toBeFocused()
  await expect(issueBox(alice.page)).toHaveJSProperty('readOnly', true)

  // Forced, since a plain click waits while the button is aria-disabled.
  await issueSave(alice.page).click({ force: true })
  await issueCancel(alice.page).click({ force: true })
  await expect(issueCancel(alice.page)).toBeFocused()
  await expect(issueEdit(alice.page)).toHaveCount(0)
  await expect(issueBox(alice.page)).toHaveValue('mine')
  await expect(issueBox(alice.page)).toHaveJSProperty('readOnly', true)

  release()
  await expect(issueBox(bob.page)).toHaveValue('mine')
  await laterVote(bob, alice)
  expect(saves).toHaveLength(1)
})
```

- [ ] **Step 3: Run them on today's editor**

Run: `npm run pree2e && npx playwright test --project=chromium -g "mouse save keeps focus|network drops keeps"`
Expected: both FAIL.
- Case 1 fails at `aria-disabled`, since Save is `disabled`.
- The contract case fails at Save's `toBeFocused`, since the box took focus.

- [ ] **Step 4: Guard Save and Cancel, and narrow the failure effect**

In `IssueEditor.tsx`:
- On Save and Cancel, replace `disabled={!editing}` with `aria-disabled={!editing || undefined}`. Their class is `btn btn-outline-secondary`, plus ` disabled` when `!editing`.
- Add the module function `focusFell(): boolean`: true when `document.activeElement` is `null` or `document.body`.
- The `editor.failed` effect focuses the box only when `editor.failed && focusFell()`. Its comment becomes one line: after a failed save, the field takes focus only if focus fell to the page.

- [ ] **Step 5: Run the two cases, then the whole suite in both browsers**

Run: `npm run build && npx playwright test -g "mouse save keeps focus|network drops keeps"`
Expected: PASS, 4 of 4.
Run: `npx playwright test > "$WS/task1-suite.log" 2>&1; tail -5 "$WS/task1-suite.log"`, where `$WS` is the plan's workspace.
Expected: every case passes, none flaky.

- [ ] **Step 6: Check style and types**

Run: `npm run typecheck && npm run lint && npx prettier --check --single-quote --no-semi --print-width 100 --trailing-comma none --arrow-parens avoid e2e/*.js`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/components/IssueEditor.tsx e2e/room.spec.js
git commit -m "feat: keep focus on Save issue and Cancel editing while saving (ui refresh step 4b2)"
```

### Task 2: The closing focus (decision 3)

**Files:**
- Modify: `frontend/src/components/IssueEditor.tsx`
- Test: `e2e/room.spec.js`

**Interfaces:**
- Consumes: `focusFell()`, the `group` ref; `issueSaves`, `holdSaves` and `laterVote` in `e2e/room.spec.js`.
- Produces: the close effect, and an `edit` ref on Edit issue.

- [ ] **Step 1: Add cases 2 to 4**

Add them after case 1:

```js
test('Escape, Cancel and a save each end with focus on Edit issue', async ({ join }) => {
  const alice = await join('Alice')

  await issueEdit(alice.page).click()
  await alice.page.keyboard.press('Escape')
  await expect(issueEdit(alice.page)).toBeFocused()

  await issueEdit(alice.page).click()
  await issueCancel(alice.page).click()
  await expect(issueEdit(alice.page)).toBeFocused()

  // Save issue unmounts with the save, which would drop focus to the page.
  await setIssue(alice, 'PP-1')
  await expect(issueEdit(alice.page)).toBeFocused()
})

test('focus moved elsewhere during a save stays there after it succeeds', async ({
  join,
  room
}) => {
  const alice = await join('Alice')
  const bob = await join('Bob')
  const release = await holdSaves(alice.page, room)

  await setIssue(alice, 'mine')
  const elsewhere = card(alice.page, '5')
  await elsewhere.focus()
  release()
  await expect(issueBox(bob.page)).toHaveValue('mine')
  // The close's effect has run by a later frame, so a focus it moved would show.
  await laterVote(bob, alice)
  await expect(elsewhere).toBeFocused()
})

test('a page load leaves focus off Edit issue', async ({ join }) => {
  const alice = await join('Alice')
  const bob = await join('Bob')

  await laterVote(bob, alice)
  await expect(issueEdit(alice.page)).not.toBeFocused()
})
```

- [ ] **Step 2: Run them on Task 1's editor**

Run: `npx playwright test --project=chromium -g "each end with focus on Edit|moved elsewhere during a save|page load leaves focus"`
Expected:
- Case 2 FAILS at its first `toBeFocused`: Escape leaves focus in the box.
- Cases 3 and 4 PASS. They pin focus left alone, and Task 4's mutations are their RED.

- [ ] **Step 3: Implement the close effect in `IssueEditor.tsx`**

- Add `edit = useRef<HTMLButtonElement>(null)` on Edit issue.
- Add `was = useRef(editor.mode)`. The ref is written only in the effect (R2).
- Add an effect on `[editor.mode]`:
  - A close is `was.current !== 'viewing' && editor.mode === 'viewing'`.
  - The effect sets `was.current = editor.mode`.
  - On a close, it focuses `edit.current` when `focusFell()` or `group.current` contains `document.activeElement`.
- Give it a one-line comment: on a close, Edit takes focus if focus was in the editor or fell.

- [ ] **Step 4: Run the three cases, then the whole suite in both browsers**

Run: `npm run build && npx playwright test -g "each end with focus on Edit|moved elsewhere during a save|page load leaves focus"`
Expected: PASS, 6 of 6.
Run: `npx playwright test > "$WS/task2-suite.log" 2>&1; tail -5 "$WS/task2-suite.log"`
Expected: every case passes, none flaky.

- [ ] **Step 5: Check style and types**

Same command as Task 1, Step 6. Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/IssueEditor.tsx e2e/room.spec.js
git commit -m "feat: return focus to Edit issue when the editor closes (ui refresh step 4b2)"
```

### Task 3: The press rules (decision 4)

**Files:**
- Modify: `frontend/src/components/IssueEditor.tsx`
- Test: `e2e/room.spec.js`

**Interfaces:**
- Consumes: Task 2's close effect, which puts focus on Edit where a held Enter's repeats then land; `issueSaves`, `holdSaves` and `laterVote`.

- [ ] **Step 1: Add cases 5 to 8**

Add them after case 4:

```js
// Cancel editing takes Edit issue's place, under the second click.
test('a double-click on Edit issue leaves the editor open, focus in the field', async ({
  join
}) => {
  const alice = await join('Alice')

  await issueEdit(alice.page).dblclick()
  await expect(issueCancel(alice.page)).toBeVisible()
  await expect(issueBox(alice.page)).toBeFocused()
  await expect(issueBox(alice.page)).toHaveJSProperty('readOnly', false)
})

test('a held Enter in the field saves once and leaves the editor closed', async ({
  join,
  room
}) => {
  const alice = await join('Alice')
  const bob = await join('Bob')
  const saves = issueSaves(alice.page, room)

  await issueEdit(alice.page).click()
  await issueBox(alice.page).fill('PP-1')
  await alice.page.keyboard.down('Enter')
  await expect(issueBox(bob.page)).toHaveValue('PP-1')
  await expect(issueEdit(alice.page)).toBeFocused()
  // A down without an up is a repeat, sent where it could reopen the editor.
  await alice.page.keyboard.down('Enter')
  await alice.page.keyboard.down('Enter')
  await alice.page.keyboard.up('Enter')
  await laterVote(bob, alice)
  await expect(issueEdit(alice.page)).toBeVisible()
  expect(saves).toHaveLength(1)
})

test('a held Enter on Edit issue opens the editor and saves nothing', async ({ join, room }) => {
  const alice = await join('Alice')
  const bob = await join('Bob')
  const saves = issueSaves(alice.page, room)

  await issueEdit(alice.page).focus()
  await alice.page.keyboard.down('Enter')
  await expect(issueBox(alice.page)).toBeFocused()
  // Sent once the field has focus, where a repeat would save the unchanged text.
  await alice.page.keyboard.down('Enter')
  await alice.page.keyboard.down('Enter')
  await alice.page.keyboard.up('Enter')
  await laterVote(bob, alice)
  await expect(issueBox(alice.page)).toHaveJSProperty('readOnly', false)
  expect(saves).toHaveLength(0)
})

test('a held Enter in the field while saves fail sends one request', async ({ join, room }) => {
  const alice = await join('Alice')
  const bob = await join('Bob')
  const saves = issueSaves(alice.page, room)
  await alice.page.route(new RegExp(`/rooms/${room}/edit-issue$`), route => route.abort())

  await issueEdit(alice.page).click()
  await issueBox(alice.page).fill('mine')
  await alice.page.keyboard.down('Enter')
  await expect(alice.page.getByText('Could not save the issue')).toBeVisible()
  await expect(issueBox(alice.page)).toBeFocused()
  // Sent after the failure, where each repeat would retry.
  await alice.page.keyboard.down('Enter')
  await alice.page.keyboard.down('Enter')
  await alice.page.keyboard.up('Enter')
  await laterVote(bob, alice)
  expect(saves).toHaveLength(1)
})
```

- [ ] **Step 2: Run them on Task 2's editor**

Run: `npx playwright test --project=chromium -g "double-click on Edit issue|held Enter in the field|held Enter on Edit issue"`
Expected: all four FAIL.
- Case 5: the second click closes the editor, so Cancel never shows.
- Case 6: the first repeat reopens the editor and the second saves again, so `saves` has length 2.
- Case 7: a repeat in the field saves, so `saves` has length 1.
- Case 8: the repeats retry, so `saves` has length above 1.

- [ ] **Step 3: Add the press rules to `IssueEditor.tsx`**

- Add the module function `onButton(e: SyntheticEvent): boolean`: true when `e.target` is an `Element` inside a `button` (R3).
- On the outer `group` element:
  - `onMouseDownCapture` calls `preventDefault()` when `e.detail > 1 && onButton(e)`, so a double-click's second press moves no focus.
  - `onClickCapture` calls `stopPropagation()` and `preventDefault()` when `e.detail > 1 && onButton(e)`.
  - `onKeyDownCapture` calls `preventDefault()` when `e.repeat && e.key === 'Enter'`, as the round bar's does.
- In the field's `onKeyDown`, add `if (e.repeat) return` before the composition check, with its own comment line: a capture `preventDefault` does not stop the field's own handler.
- Give each handler on the group a one-line comment, in `Controls`' manner.

- [ ] **Step 4: Run the four cases, then the whole suite in both browsers**

Run: `npm run build && npx playwright test -g "double-click on Edit issue|held Enter in the field|held Enter on Edit issue"`
Expected: PASS, 8 of 8.
Run: `npx playwright test > "$WS/task3-suite.log" 2>&1; tail -5 "$WS/task3-suite.log"`
Expected: every case passes, none flaky.

- [ ] **Step 5: Check style, types and the unit tests**

Run: `npm run typecheck && npm run lint && npm test && npm run test:unit && npx prettier --check --single-quote --no-semi --print-width 100 --trailing-comma none --arrow-parens avoid e2e/*.js`
Expected: no errors; the node and unit tests pass.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/IssueEditor.tsx e2e/room.spec.js
git commit -m "feat: drop a double-click's second press and a held Enter's repeats in the issue editor (ui refresh step 4b2)"
```

### Task 4: Prove each case can fail, and check StrictMode by hand

No commit. Every result goes to the ledger, one line per mutation. The dev check's result also goes into the PR body when the user asks to push.

**Files:**
- Temporarily modify, never commit: `frontend/src/components/IssueEditor.tsx`, `frontend/src/components/useIssueEditor.ts`, `frontend/src/room/issueEditor.ts`
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
| `disabled` kept | Save and Cancel get `disabled={!editing}` back | case 1 |
| The failure effect's old rule | it also focuses the box when `group` contains `document.activeElement` | 'a save the network drops keeps the draft and says so' |
| `submit`'s check removed | delete `if (state.mode !== 'editing') return` in `useIssueEditor` | case 1, `saves` of length 2 |
| `step` accepting `cancel` while saving | `case 'cancel'` returns viewing whenever the mode is not viewing | case 1 |
| The field read-only only while viewing | `readOnly={editor.mode === 'viewing'}` | case 1 |
| No close rule | the close effect removed | cases 2 and 6 |
| The close rule ignoring where focus is | the close effect focuses Edit on every close | case 3 |
| The close rule run on mount | `was` starts as `'editing'` | case 4 |
| No click rule | `onClickCapture` removed | case 5 |
| No mousedown rule | `onMouseDownCapture` removed | case 5, at the box's `toBeFocused` |
| No button Enter rule | `onKeyDownCapture` removed | case 6 |
| No field Enter rule | the field's `if (e.repeat) return` removed | cases 7 and 8 |

- [ ] **Step 2: Check the restore**

Run: `git status --short && npm run build`
Expected: a clean tree; the build passes.

- [ ] **Step 3: Check the closing focus by hand under StrictMode**

1. Start the backend with `sbt run` (port 8080) and `npm run dev` (port 5173) in the background.
2. Run a scratch Playwright script against `http://localhost:5173`, shaped like the scratchpad's `devcheck.cjs` from 4b. It creates a room, joins Alice and Bob through the lobby, each in a context of their own, and collects console errors. It logs `document.activeElement`'s accessible name after each of these:
   - Bob's vote, seen on Alice's page, just after the join;
   - Escape in the open editor;
   - Cancel editing;
   - a mouse save, once Bob's box shows it;
   - a reload, then Bob's vote seen again;
   - a double-click on Edit issue.

Expected:
- Edit issue has focus after Escape, Cancel and the save, and not after the join or the reload.
- The box has focus after the double-click, with the editor open.
- No console errors.

Stop both servers by their PIDs afterwards.

- [ ] **Step 4: Ledger the results**

Write one ledger line per mutation, then the dev check's log.

### Task 5: The re-click known issue

**Files:**
- Modify: `docs/known-issues.md`

- [ ] **Step 1: Extend the re-click entry to the editor**

In "A deliberate re-click on the role line or the round bar within the double-click time is ignored":
- Retitle it "A deliberate re-click on the role line, the round bar or the issue editor within the double-click time is ignored".
- Add `frontend/src/components/IssueEditor.tsx` (the editor's `onClickCapture` and `onMouseDownCapture`) to Where.
- Append to Issue: "The issue editor's buttons do the same since step 4b2, where a double-click's second click would land on Cancel editing in Edit issue's place. On a touch screen the window is the double-tap distance, which can reach a neighbouring button (inferred for Android)."

- [ ] **Step 2: Check the docs**

Run: `git diff --stat && git diff -U0 | grep '^+' | grep -c '—'`
Expected: only `docs/known-issues.md` changed; the count is `0`.

- [ ] **Step 3: Commit**

```bash
git add docs/known-issues.md
git commit -m "docs: extend the re-click known issue to the issue editor (ui refresh step 4b2)"
```

After Task 5, the execution skill's whole-branch review runs on the most capable model, with this plan's Review Focus.

### Task 6: The Orca check and the screen reader entry (decision 5)

This runs after the final review and its fixes. The check is the user's.

- [ ] **Step 1: Ask the user for the check**

In Orca with Firefox, against the app the executor starts for the user (`sbt run` and `npm run dev`, as in Task 4):
1. Block the save. This is done in the browser's dev tools, by blocking the request URL `/rooms/*/edit-issue`.
2. Open the editor and click Save issue with the mouse. Listen for "Could not save the issue".
3. Unblock the URL and press Enter on Save issue. Check that the save lands.

- [ ] **Step 2: Edit "A screen reader does not hear a failed save from the Save issue button" by the result**

- **Heard, and the retry saves:** remove the entry.
- **Cut off again:** keep the entry, narrowed to what was heard.
  - Where: `IssueEditor.tsx`, Save issue's `aria-disabled` and the failure effect.
  - Issue: focus now stays on Save, and what Orca read instead.
  - Resolution: stays open.
- **Orca not at hand:** keep the entry.
  - Where: as above.
  - Issue: unchanged in substance, but stating that Save now keeps focus (step 4b2).
  - Resolution: "Built in step 4b2; remove this entry once heard in Orca with Firefox."

- [ ] **Step 3: Commit**

```bash
git add docs/known-issues.md
git commit -m "docs: close the known issue of a failed save unheard from Save issue (ui refresh step 4b2)"
```

The subject's `close` becomes `narrow` or `update` to match Step 2's branch. The check's result goes into the PR body when the user asks to push.
