# UI Refresh Step 4c1-narrow-keys: The Phone Layout's Keyboard, Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Escape closes ☰'s row, a keyboard focus behind the pinned sheet scrolls clear of it, and a new `e2e/narrow.spec.js` pins both with the row's other behaviours.

**Architecture:**
- The row's Escape is one handler, set as `onKeyDown` on ☰ and on the row in `RoomHeader`. It moves focus to ☰ by a ref.
- The sheet's listener is an `onFocus` on `.room-page` in `RoomPage`. React delegates it as `focusin`.
- The cases run on the desktop devices at 392 by 800 in both browsers. Each is shown to fail by its spec's mutation, applied by hand and reverted.

**Tech Stack:** React 19 and TypeScript; Playwright with Chromium and Firefox.

**Spec:** `docs/superpowers/specs/2026-10-28-ui-refresh-4c1-narrow-keys-design.md`. Its parents: 3b2's spec (Disclosure table, decision 7) and `docs/design/room.html`'s script.

## How this plan was verified

- **Checked in the code:**
  - `menuShown` is `RoomHeader`'s state, and nothing resets it on a resize.
  - The wide header's switch and Leave stay in the DOM on the phone, hidden by CSS, so `getByRole` sees only the row's. The wide role line's text includes its button, so the row's sentence is the only exact match for `You are a voter.`.
  - `useRoleSwitch`'s `onKeyDown` handles only a repeated Enter and does not stop propagation, so the switch's Escape bubbles to the row.
  - The voters table is a `region` named `Voters` with `tabIndex={0}`. The roster is a `complementary` named `Participants` with `tabIndex={0}`. The round bar is a `section` named `Round`. The round panel has no name; the deck is its only group.
  - The round panel and the round bar are `sticky` only inside `@media (min-height: 39rem)` and `@container page (width < 51.75rem)`. No CSS sets `scroll-behavior`, so `scrollIntoView` is instant.
  - No e2e case locates by CSS class.
- **Probed in the app, 2026-10-28,** both browsers, no listener, with a throwaway spec since deleted:
  - Alice alone as a Voter at 392 by 800 with `ISSUE_240`: the table spans 357 to 484 px in Chromium and 334 to 475 in Firefox, the round panel's top is at 454 and 442, and the round bar is pinned at 739 to 800. On a Tab from Edit issue, Chromium scrolls 60 px and clears the table (424 against 438); Firefox does not scroll.
  - On that page, a mouse click on the table and a Tab from it into the deck scroll nothing in either browser.
  - Alice alone as a Voter at 1280 by 450 with the default issue: the page scrolls 16 px, the roster spans 70 to 434, the round panel's top is at 240. A Tab from Show votes onto the roster scrolls nothing.
  - On a facilitator's page while voting, every setup putting the table's foot behind the round bar (1, 6 and 13 voters) is cleared by both browsers alone, so the spec dropped that case.
  - The voter count changes neither the wide layout's roster nor whether the page scrolls there.

## Rulings this plan makes, for the user's review

- **R1. One `closeOnEscape` handler, shared by ☰ and the row.** It returns early unless the key is Escape and the row is open, then focuses ☰ and closes. The simpler alternative, an inline handler on each, writes the check twice.
- **R2. The listener is a module-level function `keepClearOfSheet` in `RoomPage.tsx`.** The alternative, its own file beside `useFitEntries`, is a file for one caller and about ten lines.
- **R3. The cases reach the row by role:** ☰ as `getByRole('button', { name: 'Menu' })`, the row's switch by `switchTo`, its Leave by `getByRole('link', { name: 'Leave' })`, its sentence by exact text. This adds no test id or `aria-controls`; the wide header's twins are hidden on the phone.
- **R4. The round panel's box is read as the round slot's parent,** `roundSlot(page).locator('..')`, which finds it in both phases. The round bar is `layout.spec.js`'s `roundBar`, moved to `fixtures.js`. No markup changes. Set aside: the `section` around the deck, which misses a panel drawn without one; a name on the round panel, which changes what a screen reader announces.
- **R5. Each listener case asserts its own geometry before acting:** the table's foot between the two tops, through one helper `tableBehindPanel(join)` that the three phone cases share, or the roster in view. A setup that drifts later then fails loudly instead of passing without testing anything (known issues, "Tests that pass with the mechanism they name deleted"). The simpler alternative, probing once at build time, leaves that drift silent.
- **R6. The listener setups are the probe's:** Alice alone in each, the phone cases with `ISSUE_240`, the wide case with the default issue. No case joins protocol voters, so none waits for them. Moving `setIssue` and `ISSUE_240` to `fixtures.js` serves the phone cases.
- **R7. The wide case reaches the roster in a fixed way.** It focuses Show votes by script, scrolls to 0, then presses Tab once, and it asserts the roster wholly in view at scroll 0, as measured. That way the browser's own focus scroll cannot move the page. A Tab walk from the page's top would scroll on the deck's cards first.
- **R8. Scroll reads wait two animation frames,** through a local `scrollTop(page)`. The listener scrolls synchronously, but a browser's own focus scroll may land a frame later.
- **R9. The spec's status line stays "In discussion",** like its delivered siblings.
- **R10. No case beyond the spec's Contract.** The Review Focus lines are checked by the reviewer reading the code, because the spec's "Left without a case" was deliberate.

## Global Constraints

**Branch and commits:**
- Branch `20260930.ui_refresh_4c1_narrow_keys`, stacked on `20260930.ui_refresh_4c1_wide` (#470). The spec's first commit already exists; Task 0 commits its revision.
- New commits only: no amend, rebase or force-push. Nothing is pushed until the user asks.
- Commit subjects, verbatim:
  - Task 0: `docs: leave the round bar's case to the progress step (ui refresh step 4c1-narrow-keys)`, then `docs: plan the phone layout's keyboard (ui refresh step 4c1-narrow-keys)`
  - Task 1: `docs: split 4c1-narrow and record the row's and the sheet's rulings (ui refresh step 4c1-narrow-keys)`
  - Task 2: `test(e2e): pin ☰'s row on the phone (ui refresh step 4c1-narrow-keys)`
  - Task 3: `feat: close ☰'s row on Escape (ui refresh step 4c1-narrow-keys)`
  - Task 4: `feat: scroll a keyboard focus clear of the pinned sheet (ui refresh step 4c1-narrow-keys)`
- No "Generated with Claude Code" or co-author line.

**Code:**
- Comments are one or two lines, with no em dash.
- The surrounding style: no semicolons, single quotes, two-space indent, lines under about 100 characters.
- `e2e/narrow.spec.js` wraps its cases in one `test.describe` with `test.use({ viewport: { width: 392, height: 800 } })`, with no `isMobile`, so both browsers run every case.
- No existing case changes.

**Mutations:** a mutation is applied in the working tree, run in the named browser(s), seen to FAIL on the named assertion, and reverted with `git checkout -- <file>` before the next. The task's report lists each mutation and its failing line.

**Running:** `npm run e2e` builds and stages. For a targeted run, run `npm run build && npx playwright test e2e/narrow.spec.js -g "<title>" --project=<browser>`. `build` alone reaches the app, as `testkit/app.js` points the staged launcher's `INDEX_PATH` at `frontend/dist/index.html`. Locally, pass `--workers=1`: the default ran the workstation out of memory on 2026-10-28.

## Review Focus

- Escape in the issue editor on the phone with the row open: the editor's Escape cancels and the row stays open, since neither handler sits on a common ancestor.
- Escape on ☰ with the row closed: nothing happens, and `preventDefault` is not called.
- A phone viewport under 39 rem tall: the bar is not `sticky`, so the listener reads no box and scrolls nothing.
- A focus event whose target is not an `Element`, or a page with no round panel: the listener neither throws nor reads `null`'s box.
- A tap on Edit issue that opens the editor, whose field the sheet hides: the field scrolls to the top (decision 3, by design).

---

### Task 0: Commit this plan

- [ ] **Step 1: Commit**

```bash
git add docs/superpowers/specs/2026-10-28-ui-refresh-4c1-narrow-keys-design.md
git commit -m "docs: leave the round bar's case to the progress step (ui refresh step 4c1-narrow-keys)"
git add docs/superpowers/plans/2026-10-28-ui-refresh-4c1-narrow-keys.md
git commit -m "docs: plan the phone layout's keyboard (ui refresh step 4c1-narrow-keys)"
```

### Task 1: The docs' changes

**Files:**
- Modify: `docs/superpowers/specs/2026-09-30-ui-refresh-design.md` (the steps table's `4c1-narrow` and `4c1-editor` rows, step 4's text near "4c1-narrow and 4c1-editor", the guarantee "the table's scale and ☰'s row included", the progress count among the steps after 5)
- Modify: `docs/design/room.html` (the comment above the Escape `keydown`, the `ResizeObserver` close after it, the `focusin` listener's comment)
- Modify: `docs/known-issues.md` (a new entry under `## Open`, after "On a phone, the lobby and the banners now lay out at the phone's width, unchecked"; the entry "On a phone, the virtual keyboard and the pinned sheet may leave the editing view little room")

Each change is the spec's "The docs' changes", item by item. Its wording is the spec's, fitted to the target's style.

- [ ] **Step 1: Edit the parent.** Replace the `4c1-narrow` row with two rows:
  - `4c1-narrow-keys`: "☰'s row and a keyboard focus on the phone", on `4c1-wide`, judged by "Its new cases, and the existing cases unchanged".
  - `4c1-narrow-cases`: "Step 4's remaining phone, zoom and width guarantees", on `4c1-narrow-keys`, judged as the old row was.

  The progress count, among the steps after 5, gains that it revisits the round bar's case 4c1-narrow-keys left without one. `4c1-editor` now depends on `4c1-narrow-cases`. Step 4's text names both steps. The guarantee becomes "the table's scale included, ☰'s row keeping its state (4c1-narrow-keys)".
- [ ] **Step 2: Edit `room.html`.**
  - Delete the `new ResizeObserver(() => { if (menuShown && !isPhone()) … })` line.
  - The comment above the Escape listener drops "crossing 51.75 rem closes it" and says the row keeps its state across widths.
  - The `focusin` comment says Firefox leaves a tall focus, the table, behind the sheet. It stays two lines.
- [ ] **Step 3: Edit `known-issues.md`.**
  - A new `###` entry on the Leave link's icon, from the spec's bullet. It says what looks off, the candidates, that the choice is made with Copy link's by mockup with the designer, and that the link's place and behaviour do not change.
  - The virtual keyboard's entry gains one sentence: a field the sheet hides scrolls to the top when focused, unchecked on a phone.
- [ ] **Step 4: Check the mockup still runs.** Open `docs/design/room.html?probe=1` in Chromium at 392 by 800: ☰ opens the row, and Escape from the row's switch closes it with focus on ☰. Reopen it, then resize to 1280 and back: the row is still open.
- [ ] **Step 5: Commit** the three files with Task 1's subject.

### Task 2: The row's cases that pass today

**Files:**
- Create: `e2e/narrow.spec.js`

**Interfaces:**
- Produces, local to `e2e/narrow.spec.js`: `menu = page => page.getByRole('button', { name: 'Menu' })`, and `PHONE = { width: 392, height: 800 }` used by the `describe`'s `test.use`. Tasks 3 and 4 add their cases to this file's `describe` and use both.

Each case joins `Alice` as a Voter with `join`, so the row's switch is `switchTo(page, 'facilitator')`. Titles and assertions:

- [ ] **Step 1: Write `'☰ opens its row and closes it again'`.**
  - Click `menu`. Expect `aria-expanded` to be `"true"` and `switchTo(page, 'facilitator')` visible.
  - Click `menu` again. Expect `aria-expanded` to be `"false"` and the switch hidden.
- [ ] **Step 2: Write `'the row stays open through a widen and a narrow'`.**
  - Click `menu`, then `setViewportSize({ width: 1280, height: 800 })`. Expect `switchTo(page, 'facilitator')` visible, which is now the wide header's.
  - `setViewportSize(PHONE)`. Expect `menu`'s `aria-expanded` `"true"` and the row's Leave visible.
- [ ] **Step 3: Write `'the row's switch changes the role and keeps the row open and focused'`.**
  - Click `menu`, then click `switchTo(page, 'facilitator')`.
  - Expect `switchTo(page, 'voter')` focused, `menu`'s `aria-expanded` `"true"`, and `getByText('You are a facilitator.', { exact: true })` visible.
- [ ] **Step 4: Write `'the row's Leave reaches the lobby'`.** Click `menu`, then the row's Leave. Expect `nameInput(page)` visible.
- [ ] **Step 5: Write `'the open row follows a switch in another tab'`.**
  - Click `menu`. Then `const tab = await alice.newTab()`; on `tab`, click `menu(tab)` and `switchTo(tab, 'facilitator')`.
  - On `page`, expect `getByText('You are a facilitator.', { exact: true })` and `switchTo(page, 'voter')` visible, and `menu`'s `aria-expanded` `"true"`.
- [ ] **Step 6: Run the file in both browsers.** Run `npm run e2e -- e2e/narrow.spec.js`. Expected: 10 passed.
- [ ] **Step 7: Show each case fails under its mutation, in Chromium.** These are all in `frontend/src/components/RoomHeader.tsx`:
  - Step 1's case: ☰'s `onClick` becomes `() => setMenuShown(true)`.
  - Step 2's case: add `useEffect` with a `ResizeObserver` on `document.documentElement` that closes the row when `innerWidth / rem >= 51.75`.
  - Step 3's case: the row's switch's `onClick` also calls `setMenuShown(false)`.
  - Step 4's case: the row's Leave loses `onClick={leave}`.
  - Step 5's case, mutation 1: `useEffect(() => setMenuShown(false), [role])`.
  - Step 5's case, mutation 2: the row draws `useRoleSwitch` from the role held when it opened, `useState(role)`'s first value.

- [ ] **Step 8: Commit** `e2e/narrow.spec.js` with Task 2's subject.

### Task 3: Escape closes the row

**Files:**
- Modify: `frontend/src/components/RoomHeader.tsx`
- Modify: `e2e/narrow.spec.js`

**Interfaces:**
- Consumes: `menu`, `PHONE` (Task 2).

- [ ] **Step 1: Write the three cases.**
  - `'Escape inside the row closes it and focuses ☰'`:
    - `menu(page).focus()`, press Enter, then Tab, and expect `switchTo(page, 'facilitator')` focused.
    - Press Escape. Expect the switch hidden, `menu` focused, and `aria-expanded` `"false"`.
  - `'Escape on ☰ closes the open row, and once closed does nothing'`:
    - `menu(page).focus()`, press Enter, and expect `aria-expanded` `"true"`.
    - Press Escape. Expect `"false"` and the switch hidden.
    - Press Escape again. Expect `"false"` and the switch hidden.
  - `'Escape elsewhere leaves the row open'`:
    - Click `menu`, then focus `getByRole('link', { name: 'Copy link' })`.
    - Press Escape. Expect `aria-expanded` `"true"` and the switch visible.
- [ ] **Step 2: Run them.** Expected: the first two FAIL in both browsers (no handler), and the third passes.
- [ ] **Step 3: Implement it in `RoomHeader`.**
  - Add `const menuButton = useRef<HTMLButtonElement>(null)` and `closeOnEscape(event: KeyboardEvent): void` (R1), with React's `KeyboardEvent` imported as a type beside `MouseEvent`.
  - Set `ref={menuButton}` and `onKeyDown={closeOnEscape}` on ☰, and `onKeyDown={closeOnEscape}` on `.room-header-menu`.
  - The handler focuses ☰ before `setMenuShown(false)`, so focus never falls with the unmounting row.
- [ ] **Step 4: Run the file in both browsers.** Expected: 16 passed.
- [ ] **Step 5: Show each mutation fails its case, in Chromium.**
  - The handler on ☰ alone: the first case fails.
  - The handler without the focus call: the first case fails on `menu` focused.
  - The handler on the row alone: the second case fails at the first Escape.
  - `setMenuShown(shown => !shown)` without the open check: the second case fails at the second Escape.
  - Both handlers replaced by one on `<header>` that ignores the target: the third case fails.
- [ ] **Step 6: Commit** both files with Task 3's subject.

### Task 4: The sheet's listener

**Files:**
- Modify: `frontend/src/components/RoomPage.tsx`
- Modify: `e2e/narrow.spec.js`
- Modify: `e2e/fixtures.js`, `e2e/layout.spec.js` (Step 1's move)

**Interfaces:**
- Consumes: `PHONE` (Task 2); `deck`, `issueEdit`, `roundSlot`, `readBoxes` from `e2e/fixtures.js`.
- Produces, in `e2e/fixtures.js`, moved from `e2e/layout.spec.js`: `setIssue(page, text)`, `ISSUE_240`, `table(page)`, `roundBar(page)`.
- Produces, local to the spec file:
  - `scrollTop(page)`, resolving `scrollY` after two animation frames (R8).
  - `roundPanel(page)` (R4) and `roster = page => page.getByRole('complementary', { name: 'Participants' })`.
  - `tableBehindPanel(join)`, resolving Alice's page once its preconditions hold (R5, R6).

If a precondition fails, a run gives a result other than the one listed, or a mutation does not fail: **stop and report** before changing the case.

- [ ] **Step 1: Move the shared setup.**
  - Move `setIssue`, `ISSUE_240`, `table` and `roundBar`, with their comments, from `e2e/layout.spec.js` to exports of `e2e/fixtures.js`. `LONG` stays and is built from the import; `ISSUE_240`'s comment splits, its "cut to 600" part staying above `LONG`.
  - `layout.spec.js` imports them and drops the imports it no longer uses.
  - Run `npx playwright test e2e/layout.spec.js --workers=1`. Expected: it passes, unchanged.
- [ ] **Step 2: Write `tableBehindPanel(join)`.**
  - It joins Alice as a Voter, does `setIssue(page, ISSUE_240)`, scrolls to 0, and reads the table, `roundPanel` and `roundBar` with `readBoxes`.
  - It expects, in order: the round bar's bottom `toBeCloseTo(800, 0)`, as the sheet is pinned; the table's top above the round panel's top; the table's foot below the round panel's top; the foot above the round bar's top.
- [ ] **Step 3: Write the four cases.**
  - `'a keyboard focus behind the round panel scrolls clear of it'`:
    - `tableBehindPanel`, then `issueEdit(page).focus()`, press Tab, and expect `table(page)` focused.
    - Final assertion, by `readBoxes`: the table's top is at least 0 and its bottom at most the round panel's top.
  - `'a tap on the table scrolls nothing'`:
    - `tableBehindPanel`, then read the table's box and `page.mouse.click(box.x + 8, box.y + 8)`.
    - Expect `table(page)` focused and `scrollTop` 0.
  - `'a keyboard focus inside the sheet scrolls nothing'`: the tap case's steps, then Tab. Expect `deck(page).getByRole('button').first()` focused and `scrollTop` 0.
  - `'in the wide layout, a keyboard focus scrolls nothing'`:
    - Alice joins as a Voter, then `setViewportSize({ width: 1280, height: 450 })`.
    - After `evaluate(() => scrollTo(0, 0))`, `readBoxes` gives: `scrolls` over 0; the roster's top at least 0 and its bottom at most 450; the roster's bottom below the round panel's top.
    - Focus `getByRole('button', { name: 'Show votes' })`, then `evaluate(() => scrollTo(0, 0))`, then read `scrollTop`.
    - Press Tab. Expect `roster` focused (R7) and `scrollTop` unchanged.
- [ ] **Step 4: Run them.** Expected: the first case FAILS in Firefox and passes in Chromium; the other three pass in both.
- [ ] **Step 5: Implement `keepClearOfSheet(event: FocusEvent<HTMLDivElement>): void` in `RoomPage.tsx`** (R2), and set `onFocus={keepClearOfSheet}` on `.room-page`.
  - It is a port of `room.html`'s `focusin` listener, scoped to `event.currentTarget`.
  - Return early unless `event.target` is an `Element` matching `:focus-visible`, the round bar exists and is `sticky`, and the target is outside `.round-panel, .round-bar`. Only then read any box.
  - The sheet's top is `.round-panel`'s, else `.round-bar`'s. Scroll with `scrollIntoView({ block: 'start' })` when the target's top is below 0 or its bottom is past the sheet's top.
  - The two-line comment cites 3b2 decision 7 and Firefox.
- [ ] **Step 6: Run the file in both browsers.** Expected: 24 passed.
- [ ] **Step 7: Show each mutation fails its case.**
  - The listener removed: the first case fails in Firefox.
  - The sheet's top read from the round bar alone: the first case fails in Firefox.
  - The `:focus-visible` test dropped: the tap case fails in both.
  - The outside-the-sheet test dropped: the inside-the-sheet case fails in both.
  - The `sticky` test dropped: the wide case fails in both.
- [ ] **Step 8: Run everything.** Run `npm run test:unit && npm run typecheck && npm run lint && npm test && npm run e2e -- --workers=1`. Expected: all pass, with no existing case changed.
- [ ] **Step 9: Commit** the four files with Task 4's subject.
