# UI Refresh Step 4c2-banners: The Lobby's Banners in the New Look, Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** One `Banners` component draws the Messages section on both pages, so the lobby's banners take the new look and `Alerts` goes.

**Architecture:** `App` builds one `<Banners>` and hands it to the page shown through a `banners` slot. `Banners` draws each banner through `Message` and, on Dismiss, focuses the element marked `data-dismiss-focus`. `banners.css` stacks the panels; each page's stylesheet places `.banners` by a context selector.

**Tech Stack:** React 19, TypeScript, plain CSS; Playwright (Chromium and Firefox).

**Spec:** `docs/superpowers/specs/2026-10-31-ui-refresh-4c2-banners-design.md`

## How this plan was verified

- **Checked in the code:**
  - `Alerts` takes `error`, `moved`, `restarted` and two dismiss handlers, in a `legacy-page` div; `App` is its one user. `RoomPage` draws `section.room-page-banners` from `lost`, `moved`, `restarted`, focusing `RoomHeader`'s `h1` through `idRef` before each dismiss handler.
  - `connection.join` opens the stream synchronously before resolving `'joined'`, so `App`'s `setError('')` runs before any snapshot: on the room page the problem text is the lost text or empty (spec decision 2).
  - `LobbyPage` renders a fragment, no root element: `header.lobby-page-header`, then `main.lobby-page-main > .lobby-page-column > {banners}, .panel.lobby-page-panel`. `lobby-page.css` already holds `.lobby-page-banners`, which nothing draws.
  - `room-header.css` selects `.room-header .brand-logo`, the context-selector precedent (spec decision 4).
  - `layout.spec.js` has `moved(before, after, fields)` (0.5 px tolerance) and imports `messages`, `movedBanner`, `restartNotice`, `readBoxes`; 'the narrow layouts' skips Firefox. `lobby.spec.js` visits with `{ page, origin }`.
  - `tokens.gate.test.ts` scans every component stylesheet for literal values, so `banners.css` is checked by `npm run test:unit`.

## Rulings this plan makes, for the user's review

- **R1. `Banners` takes `problem`**, not `Alerts`' `error`, naming the spec's term (the problem text). The other four props keep `Alerts`' names. Set aside: `error`, which the lost and ended texts are not.
- **R2. `Banners` queries the document**, `document.querySelector<HTMLElement>('[data-dismiss-focus]')?.focus()`: the section and the `h1` share no ancestor but the page. Set aside: a scoped query from the section, which needs a ref for no gain.
- **R3. The lobby's context selector is `.lobby-page-main .banners`**: `LobbyPage` has no root element, so the rule names the page's `main`, as the room's, `.room-page .banners`, names its page.
- **R4. `base.css`'s `.legacy-page` fence stays**: nothing carries the class after this step, and 4c2-bootstrap deletes the fence with Bootstrap (`bootstrap-undo.css`'s comment). Set aside: deleting it here, a step judged by different cases.
- **R5. Both new cases visit the pinned form at `/${room}?moved=1&restarted=1`** with nothing stored: the layout case through `visitor()`, as 'the lobby scrolls no page sideways' does, the lobby case through `{ page, origin }`, as its file does.

## Global Constraints

**Branch and commits:**
- Branch `20260930.ui_refresh_4c2_banners`, stacked on `20260930.ui_refresh_4c2_rejoin_name` (#477). The spec and the parent's step 4 change are committed (c124343). New commits only: no amend, rebase or force-push, and nothing pushed until the user asks.
- Commit subjects, verbatim:
  - Task 0: `docs: plan the lobby's banners in the new look (ui refresh step 4c2-banners)`
  - Task 1: `refactor: draw the room page's banners with a shared Banners (ui refresh step 4c2-banners)`
  - Task 2: `feat: draw the lobby's banners in the new look (ui refresh step 4c2-banners)`
- No "Generated with Claude Code" or co-author line.

**Code:**
- Comments are one or two lines, with no em dash. No semicolons, single quotes, two-space indent, lines under about 100 characters.
- `Banners`' one comment, above its dismiss helper, verbatim: `// The dismiss target: the page's one h1 marked data-dismiss-focus (4c2-banners decision 3).`
- The notice texts, the order (problem, moved, restarted) and the roles (`alert`, then `status`) are `RoomPage`'s today, moved unchanged.

**Mutations:** apply the mutation, run the case, see it FAIL on the named assertion, then revert it with `git checkout -- <file>`. The task's report names the mutation and its failing line. If the case passes under it, **stop and report**: the case goes back to the spec.

**Running:**
- Checks: `npm run typecheck && npm run lint && npm run test:unit`.
- Browser: `npm run build && npx playwright test e2e/<file> -g "<title>" --workers=1`, adding `--project=chromium` for cases inside 'the narrow layouts'. The default worker count ran the workstation out of memory on 2026-10-28.

## Review Focus

- Dismiss after "session ended" on the lobby: the panel takes the inert look, not `inert`, so the `h1` still takes focus (spec States, Dismiss row). By hand.
- The lost text on the lobby leads the section as a problem panel, above any notice (spec "Left without a case"). By hand, with the server stopped.
- A typed Join on the pinned form after a Dismiss: the focused `h1` leaves as the room mounts, and the room's banners show any notice not dismissed. By hand.
- A phone: the lobby's banners on the panel's edges at the phone's width (known-issues, hand test remaining). On the deployed app when a phone is at hand; never a gate.
- Firefox: both new cases run in both projects; a Firefox-only failure is a finding, not a flake to retry past.

---

### Task 0: Commit the plan

- [ ] **Step 1:** Commit this plan with Task 0's subject.

### Task 1: `Banners`, and the room page on it

Judged by the existing cases unchanged (spec, Branches and commits).

**Files:**
- Create: `frontend/src/components/Banners.tsx`, `frontend/src/components/banners.css`
- Modify: `frontend/src/components/RoomPage.tsx`, `frontend/src/components/RoomHeader.tsx`, `frontend/src/components/room-page.css`, `frontend/src/components/App.tsx`

**Interfaces:**
- Produces: `Banners({ problem, moved, restarted, onDismissMoved, onDismissRestarted }: { problem: string; moved: boolean; restarted: boolean; onDismissMoved: () => void; onDismissRestarted: () => void })`, returning `null` when nothing shows, else `<section className="banners" aria-label="Messages">`. `RoomPage` takes `banners: ReactNode` in place of `lost`, `moved`, `restarted`, `onDismissMoved`, `onDismissRestarted`.

- [ ] **Step 1: `Banners` and `banners.css`.** `Banners` imports `./banners.css` and draws the problem through `<Message tone="problem" role="alert">`, then the two notices as `RoomPage` draws them today, each Dismiss focusing the dismiss target (R2) then calling its handler. `banners.css` holds `.banners { display: flex; flex-direction: column; gap: var(--space-2) }` under a one-line comment naming 4c2-banners decision 4.
- [ ] **Step 2: The room page takes the slot.** `RoomPage` renders `{banners}` where its section was, imports `type ReactNode`, and drops the five props, `useRef`, `id`, `dismiss` and its comment, and the `Message` import. `RoomHeader` drops `idRef` and `RefObject`; its `h1` keeps `tabIndex={-1}` and gains `data-dismiss-focus`. `App` builds `const banners = <Banners problem={connectionMessage || error} … />` from its existing state and handlers and passes `banners={banners}` to `RoomPage`; the lobby keeps `Alerts` until Task 2.
- [ ] **Step 3: The room page's CSS.** In `room-page.css`, `.room-page-banners` becomes `.room-page .banners` holding only `flex: none`, `padding` and `margin-bottom`, both comments kept; the phone rule's selector becomes `.room-page .banners`.
- [ ] **Step 4: Run the checks and the cases.** Checks; then, after `npm run build`, `e2e/room.spec.js`, `e2e/refusal.spec.js` and `e2e/slug.spec.js` whole in both projects, and 'no page scrolls sideways' (`layout.spec.js`, Chromium). Expected: PASS, no case edited.
- [ ] **Step 5: Commit** the six files with Task 1's subject.

### Task 2: The lobby on `Banners`, `Alerts` removed

**Files:**
- Modify: `frontend/src/components/App.tsx`, `frontend/src/components/LobbyPage.tsx`, `frontend/src/components/LobbyForm.tsx`, `frontend/src/components/lobby-page.css`, `e2e/fixtures.js`, `e2e/layout.spec.js`, `e2e/lobby.spec.js`, `docs/design/room.html`, `docs/design/lobby.html`, `docs/design/ui-reference.md`, `docs/known-issues.md`
- Delete: `frontend/src/components/Alerts.tsx`

**Interfaces:**
- Consumes: `Banners` and the `banners` const in `App` (Task 1).
- Produces: `lobbyPanel = page => page.getByTestId('lobby-panel')` in `e2e/fixtures.js`.

- [ ] **Step 1: The fixtures.** Beside `inRoom`, add `lobbyPanel` with a one-line comment: the lobby's panel, by its test id (4c2-banners decision 5). The `messages` comment becomes "The Messages section, on either page, mounted only while a banner shows."
- [ ] **Step 2: Write the cases.** In `layout.spec.js`, a `test.describe` of its own after 'the narrow layouts', at 320 by 640 (both browsers), importing `lobbyPanel`:

```js
test("the lobby's banners sit in the column above the panel, 320 by 640", async ({
  visitor,
  room
}) => {
  const page = await visitor()
  await page.goto(`/${room}?moved=1&restarted=1`)
  await expect(movedBanner(page), 'the moved notice').toBeVisible()
  await expect(restartNotice(page), 'the restart notice').toBeVisible()
  const { region, panel, old, back } = (await readBoxes(page, {
    region: messages(page), panel: lobbyPanel(page),
    old: movedBanner(page), back: restartNotice(page)
  })).boxes
  expect(region.y + region.height, 'the region above the panel').toBeLessThanOrEqual(panel.y + 0.5)
  const sides = moved({ old: panel, back: panel }, { old, back }, ['x', 'width'])
  expect(sides, "each notice on the panel's edges").toEqual([])
})
```

In `lobby.spec.js`, after 'the h1 names the form and the active tab is marked', importing `movedBanner`:

```js
test('Dismiss on the lobby focuses its h1', async ({ page, origin, room }) => {
  await page.goto(`${origin}/${room}?moved=1&restarted=1`)
  await movedBanner(page).getByRole('button', { name: 'Dismiss' }).click()
  await expect(movedBanner(page)).toHaveCount(0)
  await expect(page.getByRole('heading', { name: 'Join room' })).toBeFocused()
})
```

- [ ] **Step 3: Run them to see them fail.** Build, then both titles in both projects. Expected: the layout case FAILs on the 60 s test timeout in `readBoxes`, whose `elementHandle()` waits for the missing region and test id; the lobby case FAILs on `toBeFocused`.
- [ ] **Step 4: The lobby on `Banners`.** `App` passes `banners={banners}` to `LobbyPage`, drops `Alerts`' import and the "keep today's markup" comment; delete `Alerts.tsx`. `LobbyPage`'s panel div gains `data-testid="lobby-panel"`. `LobbyForm`'s `h1` gains `data-dismiss-focus`. In `lobby-page.css`, `.lobby-page-banners` becomes `.lobby-page-main .banners` (R3) holding only `margin-bottom: var(--panel-gap)`, its comment kept.
- [ ] **Step 5: Run the checks and the cases.** Checks; then, after `npm run build`, both new cases, `e2e/lobby.spec.js`, `e2e/refusal.spec.js` and `e2e/slug.spec.js` whole in both projects, and 'the lobby scrolls no page sideways, 320 by 640' (Chromium). Expected: PASS.
- [ ] **Step 6: The docs' changes**, as the spec's "The docs' changes" lists them, the parent's already made: `room.html` and `lobby.html` (class `banners`, `banners.css` linked after `message.css`, the markers, `tabindex="-1"` on `room.html`'s room id, `lobby.html`'s Dismiss focusing `[data-dismiss-focus]`); `ui-reference.md` (J12's Dismiss, the Mockups line, "Contract reads the look keeps" after 4c1-banners' sentence, a **4c2-banners.** log entry after 4c2-form's for decisions 1, 3 and 4 with their set-asides); `known-issues.md`'s three entries. Open `lobby.html?message=moved,restarted` and `room.html?message=lost,moved,restarted`: the banners keep their look, and on `lobby.html` a Dismiss focuses the `h1` (`room.html` wires no Dismiss).
- [ ] **Step 7: Commit** the code, cases and docs with Task 2's subject, so a mutation's revert cannot undo them.
- [ ] **Step 8: Prove the cases can fail.** Rebuild after each mutation and run the case with `--project=chromium`; revert each with `git checkout -- <file>` and check `git status` is clean.
  - `LobbyPage` renders `{banners}` after the panel div: the layout case FAILs on 'the region above the panel'.
  - `LobbyPage` renders `{banners}` in `main`, before the column: the layout case FAILs on "each notice on the panel's edges".
  - `LobbyForm`'s `h1` without `tabIndex`: the lobby case FAILs on `toBeFocused`.
  - `LobbyForm`'s `h1` without `data-dismiss-focus`: the lobby case FAILs on `toBeFocused`.
