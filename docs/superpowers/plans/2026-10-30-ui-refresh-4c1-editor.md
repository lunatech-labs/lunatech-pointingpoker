# UI Refresh Step 4c1-editor: The Editing View's Look, Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the editing view 3b3 designed: a one-line draft in a growing textarea, Save and Cancel with their words and the inert saving look, and the editor's two messages as message panels, the failure first.

**Architecture:**
- `oneLine` is a pure function in `room/issueEditor.ts`, applied by `step` to the draft on `typed`, `pencil` and `theirs`.
- `IssueEditor.tsx` renders `room.html`'s markup, styled by `issue-editor.css`, which the spec's commits already carry.
- `IssuePanel.tsx` renders the messages with `looks.css`'s `.message` classes in its status region, which stays where it is.

**Tech Stack:** React 19, TypeScript, plain CSS, lucide-react; Vitest for the reducer, Playwright (Chromium and Firefox) for the cases.

**Spec:** `docs/superpowers/specs/2026-10-30-ui-refresh-4c1-editor-design.md`, building 3b3's decisions 7, 8 and 11 (`docs/superpowers/specs/2026-10-16-ui-refresh-3b3-issue-editor-and-messages-design.md`).

## How this plan was verified

- **Checked in the code:**
  - The spec's commits already made its docs' changes and the CSS ones: `issue-editor.css` holds the field (`field-sizing: content`, `width: 100%`) and the inert look on `.issue-editor-actions [aria-disabled="true"]`. `issue-panel.css` dropped `grid-column`, and `room.html` dropped the script fit. No task touches the docs or the CSS.
  - `room.html`'s editor markup is `div.issue-editor > textarea.issue-editor-field[rows=1][enterkeyhint=done] + div.issue-editor-actions > button.button.button-primary + button.button.button-secondary`, each button an icon then `span.button-word`. Its messages are `div.message.message-problem` and `div.message.message-notice`, each an icon then a `p`. The notice's Use theirs is a `button.button-quiet` inside the `p`. There is no placeholder.
  - `looks.css` hides `.button svg`; `issue-editor.css` shows it inside `.issue-editor-actions`.
  - lucide-react 1.49 sets `aria-hidden="true"` on an icon given no accessibility prop (`buildLucideIconNode`), so the panels' icons add no text (3b3 decision 11).
  - `room.spec.js` has its own `setIssue(member, issue)`, which clicks Save without waiting, so Save holds focus mid-save after it.
  - Besides `room.spec.js`, `refusal.spec.js` drives the editor ("a save refused by a different instance recovers like any command"). `narrow.spec.js` and `layout.spec.js` reach it through `fixtures.js`'s `setIssue`, and `narrow.spec.js` focuses Edit. `layout.spec.js` skips its group "the narrow layouts" outside Chromium with `test.skip(({ browserName }) => browserName !== 'chromium')`. It imports `ISSUE_240` but neither `issueEdit` nor `issueBox`.
  - No hover rule exists on `.button-primary` or `.button-secondary`, so the mouse resting on Save mid-save does not alter the inert look.

## Rulings this plan makes, for the user's review

- **R1. `oneLine(text)` is `text.replace(/^[\r\n]+|[\r\n]+$/g, '').replace(/[\r\n]+/g, ' ')`.** The spec's Term "a line break" is LF or CR. Set aside: one pattern with a callback, harder to read.
- **R2. The field drops today's "Current issue" placeholder**, as `room.html` and 3b3 draw none. The accessible name stays `aria-label="Current issue"`. Set aside: keeping it, a look the mockup never showed.
- **R3. The messages stay inline in `IssuePanel.tsx`**, with no `Message` component. 4c1-banners extracts one if the banners share it. Set aside: a component now, with one user.
- **R4. A case that drives code is written in that code's task.** The long issue and the inert look go in Task 2, the contract change in Task 3. Task 4 holds the cases that pin behaviour already built: the spec's "remaining cases".
- **R5. The long issue is `ISSUE_240` at 1280 by 680 on the voter's page**, typed into the opened field. The field's line height is its computed `line-height` in px. The test sits in its own `describe`, skipped outside Chromium as the narrow group is. Set aside: a measured three-line string, since the spec asks for at least three line-heights.
- **R6. The focus-fallen case is a new test** placed after "a failed save leaves focus the user moved elsewhere", copying that test's stall-then-abort route inline. Set aside: an abort option on `holdSaves`, which would change an existing case's setup for no new check.
- **R7. The double-click lands at `{ x: paddingLeft + 4, y: clientHeight / 2 }`** in the field, read from its computed style, on the draft "alpha beta". Playwright's `position` already adds the border.
- **R8. No case beyond the spec's Contract.** The reviewer checks the Review Focus lines by reading the code, as in 4c1-narrow-cases.

## Global Constraints

**Branch and commits:**
- Branch `20260930.ui_refresh_4c1_editor`, stacked on `20260930.ui_refresh_4c1_narrow_cases` (#473). New commits only: no amend, rebase or force-push, and nothing pushed until the user asks.
- Commit subjects, verbatim:
  - Task 0: `docs: approve and plan the editing view (ui refresh step 4c1-editor)`
  - Task 1: `feat: keep the issue draft on one line (ui refresh step 4c1-editor)`
  - Task 2: `feat: draw the editing view's growing field and worded buttons (ui refresh step 4c1-editor)`
  - Task 3: `feat: show the editor's messages as panels, the failure first (ui refresh step 4c1-editor)`
  - Task 4: `test(e2e): pin the editor's Enter, focus and double-click guards (ui refresh step 4c1-editor)`
- No "Generated with Claude Code" or co-author line.

**Code:**
- Comments are one or two lines, with no em dash. No semicolons, single quotes, two-space indent, lines under about 100 characters.
- No Bootstrap class and no `legacy-page` wrapper left in `IssueEditor.tsx` or the status region.
- No `preventDefault` on Enter in the field (spec decision 8). The field's `onKeyDown` guards stay as they are.
- Existing cases only gain checks, except the one contract change (Task 3).

**Mutations:** apply each mutation, run the case, see it FAIL on the named assertion, then revert it with `git checkout -- <file>` before the next one. The task's report lists each mutation and its failing line. If a case passes under its mutation, **stop and report**: the case goes back to the spec.

**Running:**
- Unit: `npm run test:unit`.
- Checks: `npm run typecheck && npm run lint`.
- Browser: `npm run build && npx playwright test e2e/<file> -g "<title>" --workers=1`, adding `--project=chromium` for `layout.spec.js`. The default worker count ran the workstation out of memory on 2026-10-28.

## Review Focus

- An input method's Enter mid-composition: `oneLine` is its only guard, pinned by the unit table, with no browser case.
- A paste holding a line break mid-draft: it becomes a space and the caret moves to the end (3b3's Accepted costs).
- A long unbroken token, such as a URL, in the field: `overflow-wrap: anywhere` wraps it, untested.
- The inert look under forced colours: `GrayText` words and edge, untested.
- The field's growth in Firefox: the long-issue case runs in Chromium alone (spec decision 6 checked both browsers support it).

---

### Task 0: Approve the spec and commit the plan

- [ ] **Step 1:** The spec's Status line already reads `Status: Approved`. Commit it with this plan.

```bash
git add docs/superpowers/specs/2026-10-30-ui-refresh-4c1-editor-design.md docs/superpowers/plans/2026-10-30-ui-refresh-4c1-editor.md
git commit -m "docs: approve and plan the editing view (ui refresh step 4c1-editor)"
```

### Task 1: `oneLine` in `step`

**Files:**
- Modify: `frontend/src/room/issueEditor.ts`
- Test: `frontend/src/room/issueEditor.test.ts`

**Interfaces:**
- Produces: `export function oneLine(text: string): string`. `step`'s `typed`, `pencil` and `theirs` cases set `draft` through it; `start` keeps the unnormalised room issue.

- [ ] **Step 1: Write the failing tests.** Import `oneLine` beside `initial, shows, step`. Add `describe('oneLine', …)` with one `it` per row:

```ts
expect(oneLine('\na\n')).toBe('a')
expect(oneLine('\r\na\r\n')).toBe('a')
expect(oneLine('a\r\n\r\nb')).toBe('a b')
expect(oneLine('a\rb')).toBe('a b')
expect(oneLine('a ')).toBe('a ')
```

Add `describe('the editor keeps the draft on one line', …)`, its room's issue set by a frame:

```ts
expect(after(pencil, typed('a\nb'))).toEqual(editing('a b'))
expect(after(frame('a\nb'), pencil)).toEqual(editing('a b'))
expect(after(...editingMine, frame('x\ny'), theirs)).toEqual(editing('x y'))
```

- [ ] **Step 2: Run** `npm run test:unit`. Expected: FAIL, the `oneLine` rows with "oneLine is not a function" and the `step` rows on the draft.
- [ ] **Step 3: Implement** `oneLine` by R1, and apply it in the three cases.
- [ ] **Step 4: Run** `npm run test:unit && npm run typecheck && npm run lint`. Expected: PASS.
- [ ] **Step 5: Mutations**, each on `issueEditor.ts`, run by `npm run test:unit`:
  - The first replace as a `trim()`: the `'a '` row fails.
  - The second pattern as `/[\r\n]/g`: the `'a\r\n\r\nb'` row fails.
  - Both patterns over `\n` alone: the `'a\rb'` row fails.
  - Both patterns over `\r?\n`: the `'a\rb'` row fails.
  - `oneLine` dropped from each of `typed`, `pencil` and `theirs` in turn: that event's row fails.
  - `start` set through `oneLine` in `pencil` and in `theirs`: the Edit row and the Use theirs row fail on the notice.
- [ ] **Step 6: Commit** both files with Task 1's subject.

### Task 2: The field and the buttons

**Files:**
- Modify: `frontend/src/components/IssueEditor.tsx`, `frontend/src/components/IssuePanel.tsx`
- Test: `e2e/layout.spec.js`, `e2e/room.spec.js`

**Interfaces:**
- Consumes: the classes in `issue-editor.css`.
- Produces: `IssueEditor`'s `boxRef: RefObject<HTMLTextAreaElement | null>`. `IssuePanel`'s `box` becomes `useRef<HTMLTextAreaElement>(null)`.

- [ ] **Step 1: Write the long-issue case** at the end of `layout.spec.js`, importing `issueEdit` and `issueBox`:

```js
test.describe('the editing view', () => {
  test.skip(({ browserName }) => browserName !== 'chromium')
  test.use({ viewport: comfort })

  test("a long issue shows whole while edited, 1280 by 680, on the voter's page", async ({ join }) => {
    // open the editor, fill ISSUE_240, then read after document.fonts.ready and two frames, as `sideways` does
    expect(read.client).toBeGreaterThanOrEqual(3 * read.line)
    expect(read.scroll - read.client).toBeLessThanOrEqual(1)
  })
})
```

`read` is `{ client: clientHeight, scroll: scrollHeight, line: parseFloat(getComputedStyle(field).lineHeight) }`.

- [ ] **Step 2: Grow "a mouse save keeps focus on Save issue, …"** after its first `readOnly` check. Read `{ color, background: backgroundColor, border: borderTopColor }` from Save and from Cancel. Read the same from a probe `span` appended to `document.body` with `color: var(--grey)` and `background-color: var(--paper-pale)`, removed after. Then:

```js
expect(save).toEqual(cancel)
expect([save.color, save.background]).toEqual([probe.color, probe.background])
```

- [ ] **Step 3: Run both cases.** Expected: FAIL. The input is one line tall, and the Bootstrap buttons do not take the inert look.
- [ ] **Step 4: Implement `IssueEditor`** as `room.html`'s markup:
  - `div.issue-editor` holds the field, then `div.issue-editor-actions`.
  - The field is a `textarea`: `className="issue-editor-field"`, `rows={1}`, `enterKeyHint="done"`, the same `aria-label`, `value`, `readOnly`, `onChange` and `onKeyDown`, and no placeholder (R2).
  - The buttons have classes `button button-primary` and `button button-secondary` and keep their `aria-label`, `aria-disabled` and `onClick`. Each holds `<Check />` or `<X />`, then `<span className="button-word">Save</span>` or `Cancel`.
  - The header comment drops "legacy until 4c1-editor".
- [ ] **Step 5: Retype** `IssuePanel`'s `box` ref to the textarea. Its iOS comment says "a readonly field".
- [ ] **Step 6: Run** both cases, then `room.spec.js` and `refusal.spec.js` whole in both browsers, `narrow.spec.js` and `layout.spec.js` whole in Chromium, then `npm run typecheck && npm run lint`. Expected: PASS.
- [ ] **Step 7: Mutations**:
  - Long issue, on `issue-editor.css`: `field-sizing: content` dropped (the line-height check fails). No width mutation (spec, Contract).
  - Inert look, on `issue-editor.css`, run in Chromium:
    - add `.issue-editor-actions .button-primary[aria-disabled="true"] { background: var(--track) }`: `toEqual(cancel)` fails;
    - the shared rule's background set to `var(--track)`: the probe check fails;
    - the shared rule's colour set to `var(--ink)`: the probe check fails.
- [ ] **Step 8: Commit** the four files with Task 2's subject.

### Task 3: The messages, the failure first

**Files:**
- Modify: `frontend/src/components/IssuePanel.tsx`
- Test: `e2e/room.spec.js`

- [ ] **Step 1: Make the contract change.** In "the editor's notices are announced from one live region", `conflict + failure` becomes `failure + conflict` (3b3 decision 11).
- [ ] **Step 2: Run it.** Expected: FAIL, the notice renders first.
- [ ] **Step 3: Implement the status region's children**, with no wrapper (R3):
  - First, when `editor.failed`: `div.message.message-problem` holding `<TriangleAlert />` and `<p>Could not save the issue</p>`.
  - Then, when `editor.notice !== null`: `div.message.message-notice` holding `<Info />` and a `p` with `Changed by someone else to: "{editor.notice}"{' '}`, then, inside the same `p`, `button.button-quiet` "Use theirs" calling `takeTheirs`.
  - The region stays `.issue-panel-status`, rendered empty when neither shows.
- [ ] **Step 4: Run** `room.spec.js` and `refusal.spec.js` whole in both browsers, then `npm run typecheck && npm run lint`. Expected: PASS.
- [ ] **Step 5: Commit** both files with Task 3's subject.

### Task 4: The remaining cases

**Files:**
- Test: `e2e/room.spec.js`

These pin behaviour already built, so each passes at once. Its proof is its mutation.

- [ ] **Step 1: Grow "a held Enter in the field while saves fail sends one request".** After the field-focused check, move the caret mid-text with `issueBox(alice.page).evaluate(f => f.setSelectionRange(2, 2))`. After `laterVote`, also check `await expect(issueBox(alice.page)).toHaveValue('mine')`.
- [ ] **Step 2: Add "a failed save with focus fallen puts focus in the field"** after "a failed save leaves focus the user moved elsewhere", using that test's stall-then-abort route (R6). The steps:
  - `setIssue(alice, 'mine')`, then check `issueSave` is focused;
  - `alice.page.evaluate(() => document.activeElement.blur())`, then check `alice.page.locator('body')` is focused;
  - `release()`, then check "Could not save the issue" is visible and `issueBox` is focused.
- [ ] **Step 3: Grow "a double-click on Edit issue leaves the editor open, focus in the field".**
  - Fill "alpha beta" and double-click at R7's position.
  - `issueBox.evaluate(f => f.value.slice(f.selectionStart, f.selectionEnd).trim())` is `'alpha'`.
  - `issueCancel` is visible and the field's `readOnly` is false.
- [ ] **Step 4: Run** the three cases in both browsers. Expected: PASS.
- [ ] **Step 5: Mutations**, on `IssuePanel.tsx`:
  - The capture rule narrowed to buttons (`e.repeat && e.key === 'Enter' && onButton(e) && …`): the held Enter's `toHaveValue('mine')` fails.
  - The `editor.failed` effect's body emptied: the focus-fallen case fails on the field's focus.
  - `onButton(e)` dropped from `onMouseDownCapture`: the double-click's selection check fails.
- [ ] **Step 6: Run** `npm run test:unit && npm run typecheck && npm run lint`, then `npm run build && npx playwright test --workers=2`. Expected: PASS.
- [ ] **Step 7: Commit** with Task 4's subject.
