# UI Refresh Step 4c1-wide: The Wide Room Page's Look, Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The room page is rebuilt in `room.html`'s structure on the area files, at every width, and step 4's wide layout cases pin it.

**Architecture:**
- `RoomPage` renders beside `App`'s legacy wrapper, which keeps the lobby and the banners. One component per CSS prefix, each importing its area file.
- The parts move in one at a time. Task 3's frame holds the old body in an interim `legacy-page` wrapper, and each later task moves its part out of it with the contract changes that part causes. The suite stays green after every task.
- The fit's search and row balance are pure functions (Task 1). `useFitEntries` only measures and applies.

**Tech Stack:** React 19 and TypeScript; plain CSS (cascade layers, container queries); `lucide-react`; Vitest; Playwright with Chromium and Firefox; 4c1-voters' protocol voters.

**Spec:** `docs/superpowers/specs/2026-10-22-ui-refresh-4c1-wide-design.md`. Its parents for the look and the contract: 3b1's spec ("Contract changes for step 4"), `docs/design/ui-reference.md` ("Contract reads the look keeps"), 3b2's Disclosure table.

## How this plan was verified

- **Probed on `room.html`, 2026-10-23,** with Inter routed to the app's font files. The scripts are in this session's scratchpad, `planprobe-wide/`.
  - The two-line issue below is two lines in both browsers at 1280 px: its heading is 46 px, where `PP-1`'s is 23 px.
  - The long issue brings the table to 80 px (5 rem) at 1280 by 600, in both browsers and on both pages, and the page scrolls 26 px. The two-line issue at 1280 by 450 scrolls 38 px, with the table at 80 px.
  - Entry scale at 1280 by 600: one voter gives 1.06 on the voter's page and 1.2 on the facilitator's; 14 voters give 1. Four voters give the same as one, and so does 1280 by 680 with one voter at the cap, 1.42.
  - With no voter, `fitEntries` throws on `items[0]` in both browsers.
  - **At 1280 by 680 with the two-line issue, 7 of 14 entries are clipped by the table** on the voter's page, and on the facilitator's once revealed. With the one-line default issue, all 14 are in view at 1.02, as 3b1 measured (ruling R6).
  - The phase line's box is the same voting, revealed and after a Re-vote, in both browsers, with Inter loaded.
  - Each CSS mutation named in Task 7 breaks its case on the mockup:
    - `.voters { min-height: 20rem }` scrolls the floor by 128 px;
    - `.voters { min-height: 0 }` leaves the table 30 px at 1280 by 450 without scrolling;
    - `.voters { flex: none }` moves the round bar between a room of 2 and of 14 on both pages;
    - `.round-panel-slot { height: auto }` gives the deck's slot 93 px and the nobody-voted result's 36 px;
    - `.room-header-copy-note { flex: none }` moves the role line and Leave by 80 px on a copy;
    - `.round-bar .button { min-width: 0 }` widens the phase line by 30 px once revealed.
- **Checked in the code:**
  - `applySnapshot` sorts the entries by name (`byName`), so join order never reorders a page.
  - `joinVoters` joins voters only, and the fixture closes them only at teardown, so a case's room can only grow.
  - The server accepts any non-blank estimation (`Requests.scala`), so a value outside the deck can reach the tally (ruling R5).
  - The suite has no React component tests. Vitest runs in Node without a DOM, so components are judged by the browser cases.

## Rulings this plan makes, for the user's review

- **R1. The parts move in one task at a time,** behind an interim `legacy-page` wrapper inside the new page (Task 3), so each task carries only its own contract changes. The cost: the page looks half-built between tasks, which never ships, as the stack deploys together.
- **R2. The avatar pair count lives in one place for the app:** `AVATAR_PAIRS` in `frontend/src/room/avatar.ts`, imported by `gate.ts` and `Roster`. A gate case holds `colours.css` to exactly that many pairs. `room.html` cannot import it, so it counts the pairs it finds in its stylesheet and holds no number. Prep decision 5's exact names stay.
- **R3. The issue's read view is read by a new test id, `issue-text`, on its heading.** 3b1 names the fixture without a locator, and the panel has other `h2`s.
- **R4. Fixture names:**
  - `hiddenMark` becomes `keptMark`, since the reference makes it the kept mark's read.
  - `facilitatorMark` becomes `facilitatorName(page, name)`.
  - New: `noVoteMark`, `phaseLine`, `issueText`, `roundSlot`, `copyHint` and `readBoxes`.
- **R5. The result's columns are the deck's values in deck order, then any voted value outside the deck,** in `votesSummary`'s order. A value posted directly then still shows in the tally and its spoken reading, and `expectSummaryMatchesParticipants` holds. The mockup draws the deck only.
- **R6. The comfort target's every-entry check uses a one-line issue.** The spec's sentence reads as if it holds with the floor case's two-line issue. The mockup clips 7 of 14 there, and 3b1 measured its "all 14 in view" with the one-line default. With the two-line issue, the comfort target checks what the floor checks.
- **R7. `page.css` reaches the lobby's root and body outside the fence (inferred):** the fluid root, the pale ground and the ink colour. The lobby's Bootstrap sizes then follow the fluid root: 16 px at 1280 by 720, and larger on big screens (19.3 px at 1920 by 1080, computed from `--root-size`). Decision 3 implies it but the spec does not name it. It is accepted because 4c2 redraws the lobby and the stack deploys together; the PR names it.
- **R8. A room with no facilitator draws no facilitators' line** in the table and no separator in the roster. The mockup always has one.
- **R9. `e2e/voters.spec.js`'s case counts 13 entries and Alice in the roster,** since facilitators leave the table. It is retitled 'a room filled by protocol voters keeps its 13 voters past the grace period'. This is a change the build turns up (the spec's Contract), named in the PR.
- **R10. The scale-through-a-reveal case uses a room of 4.** Its scale at the floor (1.06 and 1.2) sits above 1 and below the cap, so a fit that drops the reserve fails it on the facilitator's page.

## Global Constraints

**Branch and commits:**
- Branch `20260930.ui_refresh_4c1_wide`, stacked on `20260930.ui_refresh_4c1_voters` (#462). The spec's commits already exist.
- New commits only: no amend, rebase or force-push. Nothing is pushed until the user asks.
- Commit subjects, verbatim, in Conventional Commits:
  - Task 0: `docs: plan the wide room page's look (ui refresh step 4c1-wide)`
  - Task 1: `feat: fit the entries with pure search and balance functions (ui refresh step 4c1-wide)`
  - Task 2: `feat: count the avatar pairs in one place (ui refresh step 4c1-wide)`
  - Task 3: `feat: draw the room page's frame and header (ui refresh step 4c1-wide)`
  - Task 4: `feat: draw the issue panel (ui refresh step 4c1-wide)`
  - Task 5: `feat: draw the round panel and the round bar (ui refresh step 4c1-wide)`
  - Task 6: `feat: draw the voters' table and the roster (ui refresh step 4c1-wide)`
  - Task 7: `test(e2e): pin the wide layout's guarantees (ui refresh step 4c1-wide)`
  - Task 8, only if a ruling changes a file: `fix: apply the product owner's rulings on the app's diff (ui refresh step 4c1-wide)`
  - Task 9: `docs: record the wide room page in the reference and known issues (ui refresh step 4c1-wide)`
- No "Generated with Claude Code" or co-author line.

**Code:**
- Comments are one or two lines, with no em dash.
- The surrounding style: no semicolons, single quotes, two-space indent, lines under about 100 characters.
- Markup, classes and texts follow `room.html` at `later` off and layout f, except where a ruling or the spec says otherwise. Not in this step:
  - the progress, Next issue and the round history;
  - ☰'s Escape and width rows, the zoom, 320 px and the phone's copy hint (4c1-narrow);
  - the editing view's and the banners' look (4c1-editor).
- Icons are `lucide-react`'s components by 4c1-wide-prep's names: `Pencil`, `Trash`, `Link`, `LogOut`, `Menu`, `Eye`, `RotateCcw`. They get no `size` prop, since `page.css` sizes every `svg`. The brand mark is `room.html`'s SVG.
- Each component sits in `frontend/src/components/` and imports its area file first, before any child component. `RoomPage` imports `./room-page.css`, then its children in `room.html`'s link order, so the bundle keeps the mockup's CSS order.
- The test contract is roles, names, text and test ids only (step 1).
- A case rewritten for a contract change keeps its intent. A change beyond the lists cited per task joins the PR's list (the spec's Contract).

**Running:**
- The mockup diff is 4c1-mockups' `mockdiff.mjs` (a copy is in this session's scratchpad), run as `ONLY=room node mockdiff.mjs <before> <after>` on two checkouts.
- A case's mutation is applied, run, then restored with `git checkout -- <file>` before the next step.

**Writing:**
- Cite symbols, case titles and PR numbers, never line numbers.
- No counts of commits, edits, items or lines in docs.
- Spec status lines stay as they are.

## Review Focus

1. **A role switch made in another tab while ☰'s row is open:** the row's sentence and switch follow it and the row stays open (3b2's Disclosure table, "Role changed from another tab"). There is no case until 4c1-narrow.
2. **The phone layout's scale:** below 51.75 rem `useFitEntries` clears its inline `--s` and `max-width`, so `--entry-scale-narrow` applies. The decision was moved into this step, but its cases are 4c1-narrow's.
3. **The fit never loops:** the `ResizeObserver` watches the table, whose size `--s` does not change. A fonts event and StrictMode's double effects each refit once, and an unmounted table leaves no observer or listener behind.
4. **A name that changes width:** a long unbroken name, or one renamed through a rejoin, refits, as decision 4's "the voters change" includes names. The roster shows it whole on hover through its `title`.
5. **A room with no facilitator, and a facilitator alone:** no facilitators' line and no separator (R8). "Voters · 0" with an empty, fitted table (Task 7 covers the last).

---

### Task 0: Commit this plan

- [ ] **Step 1: Commit**

```bash
git add docs/superpowers/plans/2026-10-23-ui-refresh-4c1-wide.md
git commit -m "docs: plan the wide room page's look (ui refresh step 4c1-wide)"
```

### Task 1: The fit's search and balance

**Files:**
- Create: `frontend/src/room/fit.ts`, `frontend/src/room/fit.test.ts`
- Modify: `docs/design/room.html` (`fitEntries`)

**Interfaces:**
- Produces:
  - `largestFit(fits: (scale: number) => boolean, cap: number): number`
  - `balancedWidth(count: number, rows: number, entryWidth: number): number | null`

- [ ] **Step 1: Write the failing cases in `fit.test.ts`**

```ts
const cap = 5.5 / 3.85 // --deck-card over --entry-mark
describe('largestFit', () => {
  it('takes the cap when the cap fits', () => expect(largestFit(() => true, cap)).toBe(1.42))
  it('stays at 1 when nothing above 1 fits', () => expect(largestFit(s => s <= 1, cap)).toBe(1))
  it('stays at 1 when even 1 does not fit', () => expect(largestFit(() => false, cap)).toBe(1))
  it('finds the largest step of 0.02 below the threshold', () =>
    expect(largestFit(s => s <= 1.21, cap)).toBe(1.2))
  it('returns a scale that fits, within a step of the threshold', () => {
    for (let t = 1.05; t < cap; t += 0.05) {
      const s = largestFit(v => v <= t, cap)
      expect(s).toBeLessThanOrEqual(t)
      expect(s).toBeGreaterThan(t - 0.03)
    }
  })
  it('asks at most 11 times, the cap then 10 halvings', () => {
    let asked = 0
    largestFit(s => (asked++, s <= 1.21), cap)
    expect(asked).toBeLessThanOrEqual(11)
  })
})
describe('balancedWidth', () => {
  it('leaves a room of 0 alone', () => expect(balancedWidth(0, 0, 78)).toBeNull())
  it('leaves a room of 1 alone', () => expect(balancedWidth(1, 1, 78)).toBeNull())
  it('leaves one row alone', () => expect(balancedWidth(9, 1, 78)).toBeNull())
  it('splits 14 over two rows as 7 and 7', () => expect(balancedWidth(14, 2, 78)).toBe(547))
  it('splits 14 over three rows as 5, 5 and 4', () => expect(balancedWidth(14, 3, 78)).toBe(391))
  it('splits 13 over two rows as 7 and 6', () => expect(balancedWidth(13, 2, 78)).toBe(547))
})
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npm run test:unit -- fit`
Expected: FAIL, `./fit` not found.

- [ ] **Step 3: Implement both in `fit.ts`**

They are `room.html`'s `fitEntries`, minus the measuring:
- **`largestFit`:** from `lo = 1` and `hi = cap`, take `cap` if it fits, else bisect 10 times. Return `Math.floor(lo * 50) / 50`, in steps of 0.02, clear of subpixel rounding.
- **`balancedWidth`:** `null` for `rows <= 1`, else `Math.ceil(count / rows) * entryWidth + 1`.

Each gets a one-line comment.

- [ ] **Step 4: Run them to verify they pass**

Run: `npm run test:unit -- fit`
Expected: PASS, 12/12.

- [ ] **Step 5: Prove they can fail**

- In `largestFit`, drop the floor to a step of 0.02. Expected: FAIL at 'takes the cap' and 'finds the largest step'.
- In `balancedWidth`, drop the `rows <= 1` guard. Expected: FAIL at the 0, 1 and one-row cases.

- [ ] **Step 6: Fix the mockup's throw with no voter**

In `room.html`'s `fitEntries`, read `items[0]`'s width only inside the `rows > 1` branch.
Check: open `room.html?role=facilitator&voters=0` from `file://` in Chromium and Firefox. Expected: no page error, where both threw before (see How this plan was verified).
Then run the mockup diff against this task's base. Expected: no difference.

- [ ] **Step 7: Run the unit suite and commit**

Run: `npm run test:unit && npm run typecheck && npm run lint`
Expected: PASS.

```bash
git add frontend/src/room/fit.ts frontend/src/room/fit.test.ts docs/design/room.html
git commit -m "feat: fit the entries with pure search and balance functions (ui refresh step 4c1-wide)"
```

### Task 2: The avatar pairs from one count

**Files:**
- Create: `frontend/src/room/avatar.ts`, `frontend/src/room/avatar.test.ts`
- Modify: `frontend/src/design/gate.ts` (the `avatars` list), `frontend/src/design/tokens.gate.test.ts`, `docs/design/room.html` (`avatarPairs`)

**Interfaces:**
- Produces:
  - `AVATAR_PAIRS = 14`
  - `avatarPair(name: string): number`, from 1 to `AVATAR_PAIRS`
  - `initials(name: string): string`

- [ ] **Step 1: Write the failing cases**

In `avatar.test.ts`:
- **The pair matches the mockup's hash.** These values were computed with `room.html`'s `hash(n) % 14 + 1`:

```ts
expect(['Alexandra Vasquez-Ferreira', 'Bob', 'Ivan', 'Peggy', 'Victor', 'Łukasz', ''].map(avatarPair))
  .toEqual([12, 11, 12, 2, 9, 5, 8])
```

- **The initials are the first two words' first letters, split at spaces and hyphens.**
  - `initials('Alexandra Vasquez-Ferreira')` is `'AV'`.
  - `initials('ivan')` is `'I'`.
  - `initials('  Jean-Luc  Picard ')` is `'JL'`.

In `tokens.gate.test.ts`, add the case 'declares exactly AVATAR_PAIRS avatar pairs'. Over the base run's names, the tokens matching `/^--avatar-(ink|ground)-\d+$/` are exactly `--avatar-ink-N` and `--avatar-ground-N` for N from 1 to `AVATAR_PAIRS`.

- [ ] **Step 2: Run them to verify they fail**

Run: `npm run test:unit -- avatar tokens.gate`
Expected: FAIL: `./avatar` not found, and the gate file's import of it.

- [ ] **Step 3: Implement, then point `gate.ts` at the count**

- **`avatar.ts`:** `room.html`'s `hash` and `initials`, verbatim in behaviour, with `avatarPair = name => hash(name) % AVATAR_PAIRS + 1`. Its comment says that `colours.css` holds the pairs and `tokens.gate.test.ts` holds them to the count.
- **`gate.ts`:** the `avatars` list takes its length from `AVATAR_PAIRS`.

- [ ] **Step 4: Run them to verify they pass**

Run: `npm run test:unit`
Expected: PASS, with the gate's existing `--avatar-ink-15` case unchanged.

- [ ] **Step 5: Prove the count case can fail**

Delete `--avatar-ink-14` and `--avatar-ground-14` from `colours.css`. Expected: FAIL at 'declares exactly AVATAR_PAIRS avatar pairs'.

- [ ] **Step 6: The mockup counts its pairs**

`avatarPairs` becomes the number of `--avatar-ink-N` that `getComputedStyle(document.documentElement)` finds, counting from 1 until one is empty. Its comment names `colours.css` as the source.
Run the mockup diff against this task's base. Expected: no difference.

- [ ] **Step 7: Commit**

Run: `npm run test:unit && npm run typecheck && npm run lint`
Expected: PASS.

```bash
git add frontend/src/room/avatar.ts frontend/src/room/avatar.test.ts frontend/src/design/gate.ts frontend/src/design/tokens.gate.test.ts docs/design/room.html
git commit -m "feat: count the avatar pairs in one place (ui refresh step 4c1-wide)"
```

### Task 3: The frame and the header

**Files:**
- Create:
  - `frontend/src/components/RoomPage.tsx`, replacing `Room.tsx`
  - `frontend/src/components/useRoleSwitch.ts`
- Delete: `frontend/src/components/Room.tsx`, `frontend/src/components/RoleLine.tsx`
- Modify:
  - `frontend/src/components/RoomHeader.tsx`, `App.tsx`, `Alerts.tsx`
  - `frontend/src/base.css`
  - `frontend/src/components/room-header.css`, the phone block's `.room-header-copy-note:empty` rule
  - `e2e/fixtures.js`, `e2e/room.spec.js`, `e2e/fonts.spec.js`

**Interfaces:**
- Consumes: `applySnapshot`, `View` from `room/view.ts`.
- Produces:
  - `RoomPage({ roomId, snapshot, copied, onCopied, onLeave, onRefused, onSwitched })`
  - `RoomHeader({ roomId, role, copied, onCopy, onLeave, onSwitch }: { roomId: string; role: Role | null; copied: boolean; onCopy: () => void; onLeave: () => void; onSwitch: (role: Role) => void })`
  - `useRoleSwitch(role: Role, onSwitch: (role: Role) => void): { sentence: string; label: string; press: { onClick: MouseEventHandler<HTMLButtonElement>; onKeyDown: KeyboardEventHandler<HTMLButtonElement> } }`
  - fixture `copyHint = page => page.getByRole('banner').getByRole('status')`

- [ ] **Step 1: Rewrite the copy hint's case to the new hint**

In 'the copy hint lasts 2 s from the first copy, not the last':
- `hint` becomes `copyHint(page)`;
- each `toBeVisible()` becomes `toHaveText('Link copied')`;
- the last `toBeHidden()` becomes `toBeEmpty()`, since the region is always rendered.

Drop its comment on step 4's move. Add `copyHint` to `fixtures.js` beside `inRoom`.

In "today's lobby stays centred…" (`fonts.spec.js`), measure `right` against `document.documentElement.clientWidth` in place of the viewport's width (the spec's Contract).

- [ ] **Step 2: Run them to verify the copy case fails**

Run: `npx playwright test e2e/room.spec.js -g "copy hint" --project=chromium`
Expected: FAIL: no status in the banner, as today's page has no `header`.

- [ ] **Step 3: The frame**

- **`base.css`:**
  - After `reset.css`, import `./page.css` with `layer(base)`, then `./components/looks.css` unlayered (decision 3).
  - Remove its unlayered `body` and `.room-header-id` rules and their comment.
  - The fence stays the last rule in `base`.
- **`App.tsx`:**
  - It returns a fragment: the `container legacy-page` wrapper with `Alerts` and, while there is no snapshot, the `Lobby`; then `RoomPage` beside it once there is one.
  - Its comment says that the room page renders beside the wrapper (4c1-wide decision 3).
  - It passes `copied` to `RoomPage`, and `Alerts` no longer gets it.
- **`Alerts.tsx`:** loses `copied` and its alert.
- **`RoomPage.tsx`:** keeps `Room`'s handlers (`report`, `run`, `saveIssue`, `vote`) and renders:

```tsx
<div className="room-page" data-testid="room">
  <div className="room-page-stack">
    <RoomHeader … />
    <main className="room-page-main">
      <div className="room-page-column">
        {/* Interim, until Task 6: the parts not yet moved keep today's look. */}
        <div className="legacy-page">{today's IssueEditor, Deck (voters only), Controls, Results, Participants}</div>
      </div>
      <div className="room-page-sidebar" />
    </main>
  </div>
</div>
```

- [ ] **Step 4: The header**

`RoomHeader` draws `room.html`'s header at `later` off:
- **The brand:** the brand logo with its SVG, then "Pointing Poker" as `brand-logo-name`.
- **The chip:**
  - The room id is an `h1.room-header-id`.
  - "Copy link" is an `<a className="room-header-copy" href="#" aria-label="Copy link">` holding `<Link />` and the word.
  - Its click keeps `RoomHeader`'s copy, then calls `onCopy`.
- **The copy note:** `span.room-header-copy-note` with `role="status"`, holding `Link copied` while `copied` and empty otherwise. The header gains `room-header-copied` while `copied`.
- **The role:** `span.room-header-role`, holding `{sentence} ` and a `<button type="button" {...press}>{label}</button>`. It renders only with a role.
- **Leave:** `<a className="room-header-leave" href="#">`, holding `<LogOut />` and "Leave", calling `onLeave`.
- **☰:** `button.room-header-menu-button.button-quiet` with `aria-expanded` and `aria-label="Menu"`, holding `<Menu />`. A press toggles a `useState(false)`, and focus stays on it.
  - While open, the row follows it: `div.room-header-menu.panel`, holding `span.room-header-menu-role` with the sentence, a `button.button-quiet` with the same `press` and label, and a `<a className="button-quiet" href="#">` holding `<LogOut />` and "Leave".
  - No Escape or width rule (4c1-narrow).

**`useRoleSwitch`:**
- `sentence` is `You are a voter.` or `You are a facilitator.`; `label` is `Switch to facilitator` or `Switch to voter`.
- `press` holds `RoleLine`'s two rules, with their comments: a click with `detail > 1` does nothing, and a repeated Enter is prevented.
- Both switches are one element across a switch, never re-keyed, so focus survives (3b2's "Switch" row).

**Decision 9:** remove the phone block's `.room-header-copy-note:empty { display: none }` from `room-header.css`.

- [ ] **Step 5: Run the touched cases, then the suite**

Run: `npx playwright test e2e/room.spec.js e2e/roles.spec.js e2e/fonts.spec.js e2e/lobby.spec.js`
Expected: PASS in both browsers.
Run: `npm run test:unit && npm run typecheck && npm run lint && npm run e2e`
Expected: PASS.

- [ ] **Step 6: Re-prove the switch's press rules on the new header**

Each mutation is in `useRoleSwitch`.
- **Drop the `detail > 1` rule.** Expected: "a double-click's second click does not switch back" (`roles.spec.js`) FAILS, with two switch requests.
- **Drop the repeated Enter rule (M2).** Expected: 'a held Enter does not switch back' FAILS, with two switch requests. A pass here means the switch remounted and the repeat went nowhere: fix the markup, not the case.

- [ ] **Step 7: Check decision 9 on the mockup**

Run the mockup diff against this task's base.
Expected: the only differences are on the empty `.room-header-copy-note` at 800 and 392 px: its `display`, and the properties that follow from it now being drawn. Nothing else moves.
Keep the diff's output for the PR.

- [ ] **Step 8: Commit**

```bash
git add -A frontend/src e2e
git commit -m "feat: draw the room page's frame and header (ui refresh step 4c1-wide)"
```

### Task 4: The issue panel

**Files:**
- Create: `frontend/src/components/IssuePanel.tsx`
- Modify:
  - `frontend/src/components/IssueEditor.tsx`, now the legacy editing view only
  - `RoomPage.tsx`
  - `e2e/fixtures.js`, `e2e/room.spec.js`, `e2e/refusal.spec.js`

**Interfaces:**
- Consumes: `useIssueEditor` unchanged.
- Produces:
  - `IssuePanel({ issue, onSave }: { issue: string; onSave: (issue: string) => Promise<void> })`
  - fixture `issueText = page => page.getByTestId('issue-text')`

- [ ] **Step 1: Rewrite the issue reads (3b1's third contract change)**

- **The reads while viewing:** every `issueBox(p)` read on a page that is not editing becomes `issueText(p)`. That covers `setIssue`'s and `laterSnapshot`'s other page and `departureWhileCut`.
  - `toHaveValue(x)` becomes `toHaveText(x)`.
  - `toHaveValue('')` becomes `toHaveText('No issue yet')`. That includes 'a save refused by a different instance recovers like any command' (`refusal.spec.js`).
- **'the issue box is readonly until Edit issue is pressed',** retitled 'the issue is text until Edit issue is pressed':
  - before Edit, `issueBox` has count 0 and `issueText` shows the issue;
  - after Edit, `issueBox` is editable and focused.
- **'Enter saves and Escape cancels':**
  - The focus listener moves to the document, before Edit: `document.addEventListener('focusin', e => (document.body.dataset.readOnlyAtFocus = String(e.target.readOnly)), { once: true })`. The assertion reads `body`'s `data-read-only-at-focus` as `'false'`, keeping the iOS guard.
  - Each `readOnly` read becomes: while editing, `issueBox` is editable; once closed, `issueBox` has count 0 and `issueText` holds the text.
- Every read made while editing keeps `issueBox`, the textbox "Current issue".

- [ ] **Step 2: Run them to verify they fail**

Run: `npx playwright test e2e/room.spec.js e2e/refusal.spec.js --project=chromium`
Expected: FAIL, as `issue-text` does not exist yet.

- [ ] **Step 3: Build `IssuePanel` (decisions 7 and 11)**

**The panel:**
- `section.panel.issue-panel` is the group, holding `IssueEditor`'s refs, effects and three capture handlers, with their comments, moved over.
- Its children: while `mode === 'viewing'` the read view, else `IssueEditor`; then the status region, rendered once in both.

**The read view:**
- `div.issue-panel-view`, holding `<h2 data-testid="issue-text">` and Edit.
- The heading holds `editor.text`, or `No issue yet` with the class `issue-panel-empty` when that text is empty.
- An issue matching `/^https?:\/\//` is drawn as `room.html`'s segments, as plain text, never a link:
  - the scheme and host form the first `span.issue-panel-seg`, with a `<wbr />` after each dot of the host;
  - each later path piece is its own `span.issue-panel-seg`, opening with its `/`.
- Edit is `<button ref={edit} className="button-quiet" type="button" aria-label="Edit issue" onClick={open}>`, holding `<Pencil />` and "Edit".

**The status region:**
- `<div className="issue-panel-status" role="status" data-testid="issue-status">`.
- It holds `<div className="legacy-page">` with today's two `small` notices, only while a notice or a failure shows, so `.issue-panel-status:not(:empty)` holds.

**`IssueEditor`:**
- Today's `div.input-group` (input, Save, Cancel, their handlers and classes) inside one `<div className="legacy-page">`.
- It takes `text`, `editing`, `boxRef`, `onType`, `onSubmit` and `onCancel`, and imports `./issue-editor.css`.
- `open()` keeps `flushSync` before `box.current?.focus()`: the field mounts editable, so it is never readonly at focus.

`RoomPage` renders `IssuePanel` first in `room-page-column`, before the interim wrapper.

- [ ] **Step 4: Run the issue cases, then the suite**

Run: `npx playwright test e2e/room.spec.js e2e/refusal.spec.js`
Expected: PASS in both browsers.
Run: `npm run e2e`
Expected: PASS.

- [ ] **Step 5: Re-prove 4b2's double-click cases and the one region on the new panel**

Each mutation is in `IssuePanel`:
- Drop `onClickCapture`'s `detail > 1` rule. Expected: 'a double-clicked Save issue posts once' FAILS.
- Drop `onMouseDownCapture`. Expected: 'a double-click on Edit issue leaves the editor open, focus in the field' FAILS.
- Render the status region inside the read view and inside `IssueEditor`, rather than once. Expected: "the editor's notices are announced from one live region" FAILS at `expectLiveRegion`, re-created since `markRegion`.

- [ ] **Step 6: Commit**

```bash
git add -A frontend/src e2e
git commit -m "feat: draw the issue panel (ui refresh step 4c1-wide)"
```

### Task 5: The round panel and the round bar

**Files:**
- Create:
  - `frontend/src/components/RoundPanel.tsx`, `RoundBar.tsx`, `Result.tsx`, `Figure.tsx`
  - `frontend/src/room/result.ts`, `frontend/src/room/result.test.ts`
- Delete: `Controls.tsx`, `Results.tsx`
- Modify:
  - `Deck.tsx`, which exports `estimationValues`
  - `RoomPage.tsx`
  - `e2e/fixtures.js`, `e2e/room.spec.js`, `e2e/roles.spec.js`

**Interfaces:**
- Consumes: `useRoundGuard`; `View`.
- Produces:
  - `resultColumns(deck: readonly string[], summary: [string, number][]): [string, number][]`
  - `Figure({ value }: { value: string })`
  - `RoundPanel({ view, onVote })`, which returns `null` on a facilitator's page while voting
  - `RoundBar({ revealed, onShow, onRevote, onClear })`
  - fixtures `phaseLine = page => page.getByTestId('phase-line')` and `roundSlot = page => page.getByTestId('round-slot')`

- [ ] **Step 1: Write the failing unit cases in `result.test.ts`**

- 'keeps the deck's order, a value nobody voted for at 0': `resultColumns(['1', '2', '3'], [['3', 2], ['1', 1]])` is `[['1', 1], ['2', 0], ['3', 2]]`.
- 'puts a value outside the deck after it, in the summary's order': `resultColumns(['1', '2'], [['7', 2], ['2', 1], ['x', 1]])` is `[['1', 0], ['2', 1], ['7', 2], ['x', 1]]`.
- 'draws an empty deck for nobody voted': `resultColumns(['1'], [])` is `[['1', 0]]`.

- [ ] **Step 2: Rewrite the round's reads (3b1's first, second, fourth and sixth changes)**

- **The phase line replaces `frozenNotice`,** which is dropped from `fixtures.js`:
  - `frozenNotice(p)` visible becomes `phaseLine(p)` with the text `Revealed`;
  - hidden becomes `Voting`;
  - in "a facilitator's page has no deck, and keeps Show, Re-vote and Clear", the facilitator's count of 0 becomes her `phaseLine` reading `Revealed`.
- **'a revealed round takes no more votes until Re-vote':** its three `toBeDisabled()` card reads become `deck(…)` with count 0 on Alice's and Bob's pages.
- **'a re-vote leaves the caster shown as selected but unconfirmed':** Bob joins after Alice, so her vote leaves the round open. Her card reads happen while voting, then she presses Show votes before Re-vote. After Re-vote the kept card reads as before.
- **'a switch to facilitator drops the vote from the results':**
  - After the switch back, `deck(bob.page)` has count 0 and `results(bob.page)` is visible.
  - Bob's estimation read moves to Alice's page: his revealed entry holds an empty estimation and the `No vote` image (`getByRole('img', { name: 'No vote', exact: true })`; Task 6 names it `noVoteMark`).
  - The `card(…).toBeDisabled()` read is dropped.
- **'a Show in a room where nobody voted renders no summary'** adds `expect(results(page)).toContainText('Nobody voted')`.
- Add `phaseLine` and `roundSlot` to `fixtures.js`.

- [ ] **Step 3: Run them to verify they fail**

Run: `npm run test:unit -- result`
Expected: FAIL, `./result` not found.
Run: `npx playwright test e2e/room.spec.js e2e/roles.spec.js --project=chromium`
Expected: FAIL on the phase line reads.

- [ ] **Step 4: Build the round's parts**

**`Figure`:**
- `0.5` renders `<span>0<span className="tight-point">.</span>5</span>`, its text still `0.5`; any other value renders as itself.
- It is the one component outside the prefix rule, and imports nothing (decision 8).

**`Deck`** draws `room.html`'s deck. It renders only while voting, so it has no `disabled`:
- `div.deck` with `role="group"` and `aria-label="Estimation cards"`, opening with one hidden note, `Previous vote, not confirmed`, whose id comes from `useId`;
- per value, a `div.deck-place` holding `button.deck-card`:
  - the button carries `deck-card-kept`, and an `aria-describedby` naming the note, while it holds the own unconfirmed value;
  - its `aria-pressed` is true for the own confirmed value;
  - it holds a `Figure`;
- for the kept card, `<span className="deck-tag" aria-hidden="true">Not confirmed</span>` follows the button.

`estimationValues` is exported.

**`Result`** draws `room.html`'s chart:
- **The most voted:** `result-most` holds the label `Most voted`, the `Figure` of `votesSummary[0][0]` in `result-figure` with test id `most-voted`, and `${top} of ${votes} votes` in `result-sub`. With an empty summary it holds the label `Nobody voted` alone.
- **The columns:** `result-columns` takes `role="list"` while the summary is not empty. Each column is drawn from `resultColumns(estimationValues, votesSummary)`:
  - **A value with a count:** a `listitem` with test id `tally-entry`. It holds the spoken `result-sr` (`3: 2 votes`, `1 vote`), the count (`tally-count`), the bar with `--share: count / top`, and the value (`tally-value`, a `Figure`).
  - **A value at 0:** `result-column-empty`, `aria-hidden`.
- **The top column:** `result-column-top` marks the column of `votesSummary[0][0]`, today's tie-break (decision 10).

**`RoundPanel`:**
- It renders `section.panel.round-panel > div.round-panel-slot`, with test id `round-slot`, holding `Deck` on a voter's page while voting, or `Result` while revealed.
- Otherwise it renders `null`.
- It takes the vote handler from `RoomPage`.

**`RoundBar`** draws `section.panel.round-bar` with `aria-label="Round"`. It keeps `Controls`' guard and capture handlers, with their comments, and holds:
- the phase line: `div.round-bar-phase` with test id `phase-line`, holding `h2.panel-label`, `Voting` or `Revealed`;
- Clear: `button.button-quiet`, holding `<Trash />` and "Clear votes";
- the toggle: `button.button.button-primary`, holding `<Eye />` or `<RotateCcw />` and a `span.button-word`, `Show votes` or `Re-vote`, as one element across the flip;
- `aria-disabled` while guarded, as today.

**`RoomPage`:**
- In `room-page-column`: `IssuePanel`, the interim wrapper now holding only `Participants`, then `RoundPanel` and `RoundBar`.
- `Deck`, `Controls` and `Results` leave the wrapper.

- [ ] **Step 5: Run the unit cases, the round's cases, then the suite**

Run: `npm run test:unit -- result`
Expected: PASS, 3/3.
Run: `npx playwright test e2e/room.spec.js e2e/roles.spec.js e2e/session.spec.js e2e/slug.spec.js`
Expected: PASS in both browsers.
Run: `npm run test:unit && npm run typecheck && npm run lint && npm run e2e`
Expected: PASS.

- [ ] **Step 6: Prove the new reads can fail**

- In `resultColumns`, drop the off-deck values. Expected: FAIL at 'puts a value outside the deck after it'.
- In `Result`, render nothing when the summary is empty, as `Results` did. Expected: 'a Show in a room where nobody voted renders no summary' FAILS at "Nobody voted".

- [ ] **Step 7: Commit**

```bash
git add -A frontend/src e2e
git commit -m "feat: draw the round panel and the round bar (ui refresh step 4c1-wide)"
```

### Task 6: The voters' table, the roster and the fit

**Files:**
- Create: `frontend/src/components/Voters.tsx`, `Roster.tsx`, `useFitEntries.ts`
- Delete: `Participants.tsx`
- Modify:
  - `frontend/src/room/view.ts` and `view.test.ts`: `ParticipantRow` gains `self`
  - `RoomPage.tsx`
  - `e2e/fixtures.js`, `e2e/room.spec.js`, `e2e/roles.spec.js`, `e2e/session.spec.js`, `e2e/smoke.spec.js`, `e2e/refusal.spec.js`, `e2e/fonts.spec.js`, `e2e/voters.spec.js`

**Interfaces:**
- Consumes:
  - Task 1's `largestFit` and `balancedWidth`;
  - Task 2's `avatarPair` and `initials`;
  - Task 5's `Figure`.
- Produces:
  - `ParticipantRow.self: boolean` (`id === snapshot.you`)
  - `useFitEntries({ reserve, revealed, names }: { reserve: boolean; revealed: boolean; names: string[] }): { box: RefObject<HTMLElement | null>; list: RefObject<HTMLUListElement | null> }`
  - `Voters({ view })` and `Roster({ view })`
  - fixtures:
    - `keptMark = entry => entry.getByRole('img', { name: 'Previous vote, not confirmed', exact: true })`
    - `noVoteMark = entry => entry.getByRole('img', { name: 'No vote', exact: true })`
    - `facilitatorName = (page, name) => page.getByRole('complementary', { name: 'Participants' }).getByTestId('facilitator').and(page.getByText(name, { exact: true }))`

- [ ] **Step 1: Write the failing unit case**

In `view.test.ts`, 'marks the reader's own row': of a snapshot's two rows, only the one whose id is `you` has `self: true`.

- [ ] **Step 2: Rewrite the participants' reads**

These are 3b1's fifth and sixth changes, the reference's first two reads, and R9.

**`fixtures.js`:**
- `participantEntries` reads the region `Voters`.
- `votedMark` reads `Voted` with `exact: true`.
- `hiddenMark` becomes `keptMark`.
- Add `noVoteMark` and `facilitatorName`; `facilitatorMark` goes.

**The reads, by the reference's rules:**
- A confirmed entry no longer shows "Vote hidden": a `hiddenMark` read on it is dropped where a `votedMark` or value read sits beside it. The read in `stragglerDepartsWithVotesHidden` becomes `votedMark`.
- A kept entry's read becomes `keptMark`.
- The five `facilitatorMark(participantEntry(…))` reads become `facilitatorName(page, name)` with count 1. 'a switch to facilitator drops the vote from the results' reads that Bob has no entry on Alice's page while a facilitator (count 0).
- Entry counts that included a facilitator drop them, since the table holds voters only.
- Task 5's `No vote` image read becomes `noVoteMark`.

**'a session of rounds keeps the summary honest across them':** at its third reveal, only Alice's and Bob's entries carry `keptMark`, and only Dave's `noVoteMark`. That is a count of 1 on each named entry and 0 on the others (the reference's contract addition).

**The room's fonts case** ('the room is drawn in Inter…', `fonts.spec.js`): `cell` becomes `participantEntry(page, name).getByText(name, { exact: true })`, the entry's name element.

**R9 (`e2e/voters.spec.js`):** retitle the case to 'a room filled by protocol voters keeps its 13 voters past the grace period'.
- Both entry counts become 13.
- Add `expect(facilitatorName(page, 'Alice')).toHaveCount(1)` after the first count.

- [ ] **Step 3: Run them to verify they fail**

Run: `npm run test:unit -- view`
Expected: FAIL, `self` is undefined.
Run: `npx playwright test e2e/roles.spec.js e2e/voters.spec.js --project=chromium`
Expected: FAIL: no region `Voters`.

- [ ] **Step 4: Add `self` to `toRow`'s output, then build the parts**

**`useFitEntries`** is `room.html`'s `fitEntries` around Task 1's functions:
- **When it fits:** in `useLayoutEffect` on `reserve`, `revealed` and `names.join('\n')`, so the first paint is fitted. Again from a `ResizeObserver` on `box`, and on `document.fonts`' `loadingdone`. Both are removed on cleanup.
- **The phone layout:** below 51.75 rem of the `.room-page`'s width, it removes `--s` and `max-width` from `list` and stops. Its comment says that container queries have no script API (3b2 decision 1).
- **The reserve:** while `reserve`, it holds `(--slot-height + 3 × --panel-gap) × rem + 2 × --line-hairline` back from `box.clientHeight`, reading the tokens from the root's computed style. The cap is `--deck-card / --entry-mark`.
- **The measure:** `fits(s)` sets `--s`, clears `max-width`, and compares the drawn children's heights, padding and row gaps with the room left, as `room.html` does. It applies `largestFit(fits, cap)`.
- **The balance:** with the rows counted from the entries' `offsetTop`, it sets `max-width` from `balancedWidth`, or clears it.
- **With no entry:** it neither reads one nor throws.

**`Voters`** draws `section.panel.voters` with `role="region"`, `aria-label="Voters"` and `tabIndex={0}`. It holds `box` and `list`, and carries `voters-reserve` on a facilitator's page while voting:
- `div.voters-top > h2.panel-label`, `Voters · {count}`;
- `ul.voters-entries`, one `li` per voter, with test id `participant`:
  - **While voting:** the mark, `span.voters-mark.voters-mark-{state}` with `role="img"` and its name: `No vote`, `Voted`, or `Previous vote, not confirmed`.
  - **While revealed, with a value:** `span.voters-face.voters-face-{state}`, holding `<span data-testid="participant-estimation">` with the `Figure`, then the kept image when kept.
  - **While revealed, without one:** `voters-face-none`, holding an empty `participant-estimation` and `<span role="img" aria-label="No vote">–</span>`.
  - **The name:** `span.voters-name`. The own row's is `<b>{name}</b> <span className="voters-you">(you)</span>`.
  - **The state:** confirmed is `voted`; kept is `hasEstimation && !voted`; otherwise none.
- `p.voters-facilitators`, `Facilitators: ` with two names, then `and N more` past two. It is drawn only with a facilitator (R8).

**`Roster`** draws `aside.panel.roster` with `aria-label="Participants"` and `tabIndex={0}`:
- `h2.panel-label`, `Participants · {all}`;
- a `ul` of voter rows;
- with a facilitator, `hr.roster-separator` and a `ul` of facilitator rows.

A row is `li.roster-row`, carrying `roster-row-me` on the reader's own voter row:
- **The avatar:** `span.roster-avatar`, `aria-hidden`, holding `initials(name)`. Its style sets `--h` to `var(--avatar-ink-N)` and `--t` to `var(--avatar-ground-N)`, with N from `avatarPair(name)` (decision 6).
- **The name:** `span.roster-who` with `title={name}`, holding a `span` with the name (test id `facilitator` on a facilitator's) and `<small>(you)</small>` on the own voter row.
- **Its end, for a voter while voting:** `span.roster-pill.roster-pill-{state}`, `Choosing…`, `Voted` or `Not confirmed`.
- **Its end, for a voter while revealed:** `span.roster-value`, holding `<small>not confirmed</small>` when kept and the `Figure`, or `roster-value roster-value-none` with `–`.
- **Its end, for a facilitator:** `span.roster-facilitator`, `Facilitator`.

**`RoomPage`:**
- In `room-page-column`: `IssuePanel`, `Voters`, `RoundPanel`, then `RoundBar`, layout f.
- In `room-page-sidebar`: `Roster`.
- The interim wrapper and its comment go.

- [ ] **Step 5: Run the unit suite, the touched cases, then everything**

Run: `npm run test:unit -- view`
Expected: PASS.
Run: `npx playwright test e2e/room.spec.js e2e/roles.spec.js e2e/session.spec.js e2e/voters.spec.js e2e/fonts.spec.js e2e/smoke.spec.js e2e/refusal.spec.js`
Expected: PASS in both browsers.
Run: `npm run test:unit && npm run typecheck && npm run lint && npm test && npm run e2e`
Expected: PASS.

- [ ] **Step 6: Prove the session case's addition can fail**

Draw the kept image on every revealed face with a value. Expected: the session case FAILS at Carol's `keptMark` count.

- [ ] **Step 7: Commit**

```bash
git add -A frontend/src e2e
git commit -m "feat: draw the voters' table and the roster (ui refresh step 4c1-wide)"
```

### Task 7: The wide layout's cases

**Files:**
- Create: `e2e/layout.spec.js`
- Modify: `e2e/fixtures.js` (`readBoxes`)

**Interfaces:**
- Consumes:
  - the `join` and `voters` fixtures;
  - `participantEntries`, `phaseLine`, `roundSlot`, `copyHint`, `issueText`, `issueEdit`, `issueBox`, `issueSave`, `vote`, `markRegion` and `expectLiveRegion`.
- Produces: `readBoxes(page, locators: Record<string, Locator>): Promise<{ rem: number; scrolls: number; boxes: Record<string, { x: number; y: number; width: number; height: number }> }>`. It resolves each locator's element handle, then makes one `page.evaluate`. That call awaits `document.fonts.ready` and two animation frames, then reads every box, the root's font size, and `scrollHeight - clientHeight` of the root.

**The setup, in `layout.spec.js`:**
- **Viewports:** `floor = { width: 1280, height: 600 }` and `comfort = { width: 1280, height: 680 }`. A case runs at both unless it names its own. Cases loop over `['Voter', 'Facilitator']`, titled `… on the voter's page` or `… on the facilitator's page`.
- **The data:**
  - `NAMES` is Bob to Sybil, 14 names.
  - `ESTIMATIONS` is `Deck.tsx`'s 13 values.
  - `TWO_LINES = 'Rework the login page so that a returning user lands on their last room, and keep the room list in sync'`.
  - `LONG` is `room.html`'s 240-character issue, `'Rework the login page so that a returning user lands on their last room, and keep the room list in sync with the rooms they were invited to since their last visit, including the rooms that were renamed or archived meanwhile by a facilitator'`, joined three times with `'. '` and cut to 600 characters.
- **`fill(join, voters, role, count)`:**
  - The page joins as Alice in `role` and counts as a voter on the voter's page.
  - Protocol voters make up the rest.
  - It waits for `count` entries and returns `{ page, joined }`.
  - A second `voters(...)` call grows the room.
- **`setIssue(page, text)`:** Edit, fill, Save, then wait for `issueText` to hold it.
- **Voting:** every voter but one votes, so the round stays open. The page votes through `vote`, and the protocol voters vote `ESTIMATIONS[i % 13]`. The case waits for that many `Voted` images in the table.
- **Revealed:** the last vote reveals. The case waits for the phase line to read `Revealed` and the tally to hold 13 entries.
- **The parts:**
  - the header, `getByRole('banner')`;
  - the issue, `issueText`;
  - the slot, `roundSlot`;
  - the round bar, the region `Round`;
  - the table, the region `Voters`.
- **The facilitator's page while voting** has no slot. Its cases read the round bar and the table's top in its place.
- **"Wholly in view"** is within the viewport. For an entry, it is within the table's box too.

- [ ] **Step 1: Write the cases**

- **'no scroll at the floor' (both viewports):** a room of 14, `TWO_LINES` set and checked as two lines (`issueText`'s height, divided by its height with `PP-1`, rounds to 2), voting then revealed. In each phase, `scrolls` is 0 and every part is wholly in view.
- **'every entry in view at the comfort target' (comfort only, R6):** a room of 14 with the issue `PP-1`, voting then revealed. Every entry is wholly in view.
- **'a longer issue scrolls the page and cuts nothing' (floor only, `LONG`):**
  - voting, then revealed;
  - `scrolls` is above 0;
  - the table's height is at least `5 * rem - 0.5`;
  - after `window.scrollTo(0, scrollHeight)`, the slot and the round bar are wholly in view.
- **'a window below the floor scrolls the page and cuts nothing' (1280 by 450, `TWO_LINES`):** the same reads.
- **"the entries' scale holds through a reveal" (R10):** a room of 4. The first entry's width is the same, within 0.5 px, voting and revealed.
- **'a room of 1 is drawn larger than a room of 14' (M1):**
  - first entry's width with a room of 1, then the room grown to 14;
  - expect the first width larger than the second by more than 1 px.
- **"an entry's card never passes a deck card's height":** a room of 1, voting. The entry's `img` is at most `5.5 * rem + 0.5` tall.
- **'a room of 0 voters is fitted on the facilitator's page' (facilitator only):** with no protocol voter, `Voters · 0` shows, the room's marker stays, and no `pageerror` was heard.
- **'nobody voted: the slot keeps its height through a reveal':** a room of 14, nobody votes, and Show votes is pressed.
  - On the voter's page, the slot's height is the same before and after.
  - On the facilitator's, the round bar's box and the table's top are the same.
  - `Nobody voted` shows.
- **'nothing moves between a room of 2 and a room of 14':**
  - voting, a room of 2, then grown to 14;
  - the header, the issue and the round bar keep their boxes;
  - on the voter's page so does the slot, and on the facilitator's the table's top.
- **'the phase line keeps its box through a reveal, a Re-vote and a vote':** a room of 14, voting with one unvoted. Its box is the same:
  - before the last vote;
  - after it reveals;
  - after the page presses Re-vote;
  - after a protocol voter votes again.
- **'a copy moves and covers nothing in the header or the round':**
  - On the real clock: mark the empty hint with `markRegion(copyHint(page))`.
  - Read the boxes of the room id's heading, Copy link, the role switch, Leave, the phase line, the round bar and the slot, where present.
  - Click Copy link, then read `copyHint` as `Link copied`, all the boxes and the hint's own box, then `Link copied` again.
  - Expect:
    - every box unchanged;
    - the hint's box overlapping none of them;
    - `expectLiveRegion` on the hint.

- [ ] **Step 2: Run them**

Run: `npx playwright test e2e/layout.spec.js`
Expected: PASS in both browsers. Where a measured value differs from the mockup's (How this plan was verified), stop and find why before adjusting a case.

- [ ] **Step 3: Prove each case fails against a layout breaking it, restoring after each**

| Mutation | Expected to FAIL |
| --- | --- |
| `voters.css`: `.voters`' `min-height` becomes `20rem` | 'no scroll at the floor', at `scrolls` |
| `largestFit` returns `cap` | 'every entry in view at the comfort target' |
| `voters.css`: `.voters`' `min-height` becomes `0` | 'a longer issue…' and 'a window below the floor…', at the table's height |
| `useFitEntries` ignores `reserve` | the scale-through-a-reveal case, on the facilitator's page |
| `useFitEntries` never sets `--s` | 'a room of 1 is drawn larger than a room of 14', on both pages (M1) |
| `fit.ts`'s cap passed as `2` | "an entry's card never passes a deck card's height", at the comfort target |
| `useFitEntries` reads the first entry with no entry drawn | 'a room of 0 voters is fitted' |
| `round-panel.css`: `.round-panel-slot`'s `height` becomes `auto` | 'nobody voted…', on the voter's page |
| `RoomPage` renders `RoundPanel` before `Voters` (layout g) | 'nobody voted…', on the facilitator's page, at the table's top |
| `voters.css`: `.voters { flex: none }` | 'nothing moves between a room of 2 and a room of 14', on both pages |
| `round-bar.css`: `.round-bar .button`'s `min-width` becomes `0` | 'the phase line keeps its box…' |
| `room-header.css`: `.room-header-copy-note`'s `flex: 1` becomes `flex: none` | 'a copy moves and covers nothing…', at the role switch |
| `RoomHeader` renders the note only while copied | 'a copy moves and covers nothing…', at `markRegion` |

- [ ] **Step 4: Run the suite and commit**

Run: `npm run e2e`
Expected: PASS.

```bash
git add e2e/layout.spec.js e2e/fixtures.js
git commit -m "test(e2e): pin the wide layout's guarantees (ui refresh step 4c1-wide)"
```

### Task 8: The app against the mockup (decision 12)

**Files:** a throwaway script in the scratchpad, `appdiff.mjs`. Repo files change only by the product owner's rulings.

- [ ] **Step 1: Write and run the diff**

The comparison follows 4c1-mockups' `mockdiff.mjs`:
- the same snapshot of every computed property;
- each element paired by its path from `.room-page`.

The states and pages:
- **The states:** the voter's and the facilitator's pages, voting and revealed, at 1280, 1000, 800 and 392 px wide, 680 px tall, in Chromium.
- **The app's side:**
  - one room on the started app, at the mockup's default parameters;
  - the issue `https://lunatech.atlassian.net/browse/PP-1234`;
  - pages for Ivan (a voter, voting `5`), Peggy and Victor (facilitators);
  - the mockup's other 13 voters as protocol voters, casting the mockup's `sample` values where its `voting` states say `confirmed`;
  - Peggy presses Show votes for the revealed states.
- **The mockup's side:** `room.html?role=…&phase=…&room=<the app's room id>`. Its font request is routed to the app's font files.
- **When both are read:** as `readBoxes` waits, once each page shows its state.

- [ ] **Step 2: The product owner rules**

Bring the diff's tally to the user, grouped by element. The spec's expected differences:
- the text the mockup fakes;
- the issue not being a link (decision 11);
- Bootstrap's base rules where the reset sets nothing, such as the labels' line height and Copy link's underline.

Apply each ruling the user makes, rerun the touched suites, and commit with Task 8's subject. With no file to change, nothing is committed.

### Task 9: The docs

**Files:** `docs/design/ui-reference.md`, `docs/superpowers/specs/2026-09-30-ui-refresh-design.md`, `docs/known-issues.md`

- [ ] **Step 1: Write the changes (the spec's "The docs' changes")**

- **Parent:**
  - In step 4's text, `4c1-wide` gains its spec's path, as its siblings have theirs.
  - The steps table row is unchanged.
- **Reference:**
  - "Contract reads the look keeps" puts each change made here into the past tense; the "Messages" region stays future, for 4c1-editor.
  - It gains the reads it lacks: `most-voted`, `tally-value` and `tally-count`, `issue-status`, the cards' names (`0.5` included), "Copy link" as a link, the role switches and Edit's name, `issue-text`, `round-slot` and the header's status.
- **Known issues:**
  - 'A reveal with votes still pushes the participants list down' and 'A tied vote is broken by JavaScript key order' now cite `Result`, `Voters` and the "Most voted" label.
  - The first says the reveal now fills the slot, and keeps what still moves: a facilitator's page below 65.75 rem, until the progress step.

- [ ] **Step 2: Check the citations and commit**

Run: `grep -n "Participants.tsx\|Results.tsx\|Most voted estimation\|RoleLine\|Controls.tsx" docs/design/ui-reference.md docs/known-issues.md`
Expected: nothing, but in passages that record history.

```bash
git add docs
git commit -m "docs: record the wide room page in the reference and known issues (ui refresh step 4c1-wide)"
```
