# UI Refresh Step 4c2-rejoin-name: The Rejoin Row Joins With the Typed Name, Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Clicking the lobby's rejoin row runs `keepLobby()` before its link navigates, so the room joins with the name in the field.

**Architecture:** `RoomRow` puts an optional `onClick` on its link; `LobbyForm` passes `rejoin.onClick` through; `App` builds the `rejoin` object with `onClick: keepLobby`. The link keeps its native navigation.

**Tech Stack:** React 19, TypeScript; Playwright (Chromium and Firefox).

**Spec:** `docs/superpowers/specs/2026-10-31-ui-refresh-4c2-rejoin-name-design.md`

## How this plan was verified

- **Checked in the code:**
  - `App.tsx` builds `rejoin` as `{ href, id, line2 }` at `/` only; `keepLobby` stores the name, then returns `keepDefault(localStorage, shownRole)`.
  - `LobbyForm.tsx` types `rejoin` as `{ href: string; id: string; line2: string } | null` and renders `<RoomRow id={rejoin.id} line2={rejoin.line2} href={rejoin.href} />`.
  - `RoomRow.tsx` takes `{ id, line2, href }`; only the `href` branch renders an `<a>`.
  - 'the lobby offers the remembered room rather than joining it' (`lobby.spec.js`) joins Alice, goes to `/`, finds the row by `name: room`, reads "as Alice", clicks it and checks the URL and `inRoom`. `participantEntry(page, name)` is exported by `e2e/fixtures.js`.

## Rulings this plan makes, for the user's review

- **R1. `App` passes `keepLobby` itself**, not a wrapper: a function returning `Role` is assignable to `() => void`. Set aside: `() => void keepLobby()`, noise for the same effect.
- **R2. The new case follows the existing one's shape**: `join('Alice')`, `goto('/')`, the row found by `getByRole('link', { name: room })`, which still finds it after the label changes. Set aside: a shared helper for three lines.

## Global Constraints

**Branch and commits:**
- Branch `20260930.ui_refresh_4c2_rejoin_name`, stacked on `20260930.ui_refresh_4c2_form` (#476). The spec and the parent's step-table change are committed (fede937). New commits only: no amend, rebase or force-push, and nothing pushed until the user asks.
- Commit subjects, verbatim:
  - Task 0: `docs: plan the rejoin row joining with the typed name (ui refresh step 4c2-rejoin-name)`
  - Task 1: `fix: rejoin with the typed name (ui refresh step 4c2-rejoin-name)`
- No "Generated with Claude Code" or co-author line.

**Code:**
- Comments are one or two lines, with no em dash. No semicolons, single quotes, two-space indent, lines under about 100 characters.
- No `preventDefault` and no scripted navigation (spec decision 4); `keepLobby` is not changed (decision 1).

**Mutations:** apply the mutation, run the case, see it FAIL on the named assertion, then revert it with `git checkout -- <file>`. The task's report names the mutation and its failing line. If the case passes under it, **stop and report**: the case goes back to the spec.

**Running:**
- Checks: `npm run typecheck && npm run lint && npm run test:unit`.
- Browser: `npm run build && npx playwright test e2e/<file> -g "<title>" --workers=1`, adding `--project=chromium` for `layout.spec.js`. The default worker count ran the workstation out of memory on 2026-10-28.

## Review Focus

- An emptied field: clear the name at `/` and click the row; the room page shows its join form (spec decision 3). By hand, no case.
- Enter on the focused row: Tab to it, press Enter; it joins with the typed name as a click does.
- Middle-click: the new tab joins with the stored name (spec Accepted costs). By hand, to confirm the cost is only that.
- Firefox: the new case runs in both projects; a Firefox-only failure is a finding, not a flake to retry past.
- The badge on a pinned form takes no click: `RoomRow`'s `onClick` reaches only the `<a>`.

---

### Task 0: Commit the plan

- [ ] **Step 1:** Commit this plan with Task 0's subject.

### Task 1: The rejoin row's click

**Files:**
- Modify: `frontend/src/components/RoomRow.tsx`, `frontend/src/components/LobbyForm.tsx`, `frontend/src/components/App.tsx`
- Test: `e2e/lobby.spec.js`

**Interfaces:**
- Produces: `RoomRow({ id, line2, href, onClick }: { id: string; line2?: string; href?: string; onClick?: () => void })`; `LobbyForm`'s `rejoin: { href: string; id: string; line2: string; onClick: () => void } | null`.

- [ ] **Step 1: Write the case (R2).** In `e2e/lobby.spec.js`, right after 'the lobby offers the remembered room rather than joining it', which stays unchanged, importing `participantEntry`:

```js
test('the rejoin row joins with the name typed over the stored one', async ({ join, room }) => {
  const alice = await join('Alice')
  await alice.page.goto('/')
  const rejoin = alice.page.getByRole('link', { name: room })
  await nameInput(alice.page).fill('Bob')
  await expect(rejoin).toContainText('as Bob')
  await rejoin.click()
  await expect(inRoom(alice.page)).toBeVisible()
  await expect(participantEntry(alice.page, 'Bob')).toBeVisible()
})
```

- [ ] **Step 2: Run it to see it fail.** `npm run build && npx playwright test e2e/lobby.spec.js -g "typed over the stored one" --workers=1`. Expected: FAIL on the `participantEntry(alice.page, 'Bob')` line in both projects, the room joined as Alice.
- [ ] **Step 3: Wire the click.** `RoomRow` puts `onClick` on its `<a>` only; `LobbyForm` passes `onClick={rejoin.onClick}`; `App`'s `rejoin` object gains `onClick: keepLobby` (R1). `keepLobby`'s comment stays: "Every lobby submit" now covers the row (spec Terms).
- [ ] **Step 4: Run the checks and the cases.** `npm run typecheck && npm run lint && npm run test:unit`; then, after `npm run build`, the new case and 'a room remembered from before the cutover reopens under its derived name' (`slug.spec.js`) in both projects, and 'the lobby scrolls no page sideways, 320 by 640' (`layout.spec.js`) in Chromium. Expected: PASS.
- [ ] **Step 5: Commit** the four files with Task 1's subject, so the mutation's revert cannot undo the fix.
- [ ] **Step 6: Prove the case can fail.** Mutation: `RoomRow` puts no `onClick` on the link. Rebuild and run the new case. Expected: FAIL on the `participantEntry(alice.page, 'Bob')` line. Revert with `git checkout -- frontend/src/components/RoomRow.tsx`, and check `git status` is clean.
