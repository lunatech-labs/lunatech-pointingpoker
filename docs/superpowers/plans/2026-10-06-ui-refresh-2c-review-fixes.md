# UI Refresh Step 2c Review Round: Fixes

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Land what the review round over step 2c decided: a double-click that switches
once, focus that survives Change, one list of roles, a pinned failed switch, one lobby
storage rule, and the names, fixture and matrix wording the round found loose.

**Architecture:** No new state, timer or storage key. The role line ignores a click whose
`detail` is above 1. `DefaultRole` commits Change's render with `flushSync`, then focuses the
checked radio. `joinRole.ts` exports the lobby's `roles` from its decoder table.

**Tech Stack:** as the step 2c plan, `2026-10-06-ui-refresh-2c-roles-ui.md`.

**Spec:** `docs/superpowers/specs/2026-10-04-ui-refresh-2-roles-design.md`, step 2c.

**Branch:** `20260930.ui_refresh_2c_roles_ui` (PR #434, stacked on #433), on top of
`e093779`. These fixes land before the stack merges, so no rebase is involved.

## The round, and what it decided

One wave of three fresh reviewers ran over `a6154e5..e093779`, one lens each: failure modes,
simplicity, consistency with the code. None found a Critical or an Important defect in the
code. Each finding was checked against the code before it was decided:

| # | Finding | Decision |
|---|---|---|
| 1 | A double-click on the role line can switch back: the second click reads the re-rendered label | Ignore a click with `detail > 1`: Task 1 |
| 2 | Change unmounts its own button, so focus falls to the body; known-issues deferred the fix to step 4, a restyle judged by unchanged cases | Fix it here and drop the entry: Task 2 |
| 3 | `DefaultRole` spells the roles in a `Role[]` a third role would still satisfy | One table, in `joinRole.ts`: Task 3 |
| 4 | The spec's "a failed request is logged and the line does not change" has no case; nothing pins that it leaves `role:<roomId>` alone | One e2e case: Task 4 |
| 5 | `joinHere`, `doCreate` and `doJoin` each store the name, then keep the default | One closure, `keepLobby`: Task 5 |
| 6 | `fa07e28` mixes a test retitle into a `docs:` commit, and `e093779` lacks the step suffix | No action: `main` squash-merges, so branch commits never reach it |
| 7 | Wording: `DefaultRole`'s `onChange` means two things, an unchecked inline create-room, the `visitor` comment, three matrix cells | Tasks 6 to 8 |
| - | `View.ownRole` typed `Seat['type']`, not `Role` | No action: the 2c plan's P3 chose it, and the `satisfies` literals make the two equal |
| - | `networkidle` as the proof no join was sent | No action: the auto-join would fire in a mount effect, before the network settles |
| - | Bare "decision 7" citations | No action: 2b's `Room.scala` cites "decision 1" the same way |
| - | The spec's Rejoin link with no default role has no case | No action: the link is a plain `href`, so it is the path load the pre-roles case already covers |

**Why 1 is not one human's cosmetic race.** A second click inside a round trip is harmless:
it posts the same role, and `RoomData.switchRole` ignores a same-role switch. Only a second
click after the switch's frame re-renders the line posts the other role, leaving one person
on the role they did not choose. Disabling the button in flight was rejected: disabling a
focused button can drop focus, which the spec's one-button rule protects.

**Why 2 uses `flushSync`, not an effect.** The fieldset also mounts on a first visit, where
focus belongs to the name field. Focusing inside Change's own handler moves it only on Change.

## Global Constraints

As the 2c plan's, and:

- No server change: `src/` and `frontend/src/protocol/generated/` stay untouched.
- Push only once Task 9 passes. Do not merge: every merge to `main` ends every live room.

## How the code in this plan was verified

Every patch below was applied and run on 2026-10-06 in a scratch worktree at `e093779`, as
one commit per task.

- `npm run typecheck` and `npm run lint` were clean, and `npm run test:unit` passed 114,
  after each task.
- `npm run e2e` passed 154 of 154 after Task 8: 148 plus the three new cases in each browser.
  `npm test` passed 17.
- Each mutation named in a task was applied alone and failed its case in both browsers.
- `npm run test:unit` in a fresh worktree needs `target/contract/` from an `sbt test` run;
  copy it from the main checkout, since the server is unchanged.

---

### Before Task 1: commit this plan

- [ ] `git add docs/superpowers/plans/2026-10-06-ui-refresh-2c-review-fixes.md`
- [ ] `git commit -m "docs: plan the ui refresh step 2c review fixes"`

### Task 1: Ignore a double-click's second click on the role line

**Judged by:** one new e2e case, and one mutation.

- [ ] **Step 1.** In `RoleLine.tsx`, the button's handler becomes:

```tsx
          // A double-click's second click would switch back once the first switch re-renders.
          onClick={e => e.detail <= 1 && onSwitch(facilitator ? 'Voter' : 'Facilitator')}
```

  A keyboard press has `detail` 0, so "a switch keeps keyboard focus on its one button" is
  unaffected.
- [ ] **Step 2.** In `roles.spec.js`, after "a switch keeps keyboard focus on its one button":

```js
// Spelled out, since a dblclick usually lands both clicks before the switch's frame.
test("a double-click's second click does not switch back", async ({ join, room }) => {
  const alice = await join('Alice')
  const switches = []
  alice.page.on('request', r => r.url().endsWith(`/rooms/${room}/role`) && switches.push(r))
  await switchTo(alice.page, 'facilitator').click()
  await joinedAs(alice.page, 'Facilitator')

  const box = await switchTo(alice.page, 'voter').boundingBox()
  await alice.page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await alice.page.mouse.down({ clickCount: 2 })
  await alice.page.mouse.up({ clickCount: 2 })
  // The click handler posts at once, so a second switch would have been seen by now.
  await alice.page.waitForTimeout(500)
  expect(switches).toHaveLength(1)
  await joinedAs(alice.page, 'Facilitator')
})
```

- [ ] **Step 3. The guard bites.** Restore `onClick={() => onSwitch(...)}`: the case fails in
  both browsers with two `/role` requests. Revert.
- [ ] **Step 4.** `git commit -am "fix: ignore a double-click's second click on the role line (ui refresh step 2c)"`

### Task 2: Move focus to the checked radio when Change opens the fieldset

**Judged by:** one new e2e case, and one mutation.

- [ ] **Step 1.** In `DefaultRole.tsx`, import `useRef` beside `useId` and `flushSync` from
  `react-dom`, give the `<fieldset>` `ref={fieldset}`, point Change's `onClick` at `reopen`,
  and add after `useId()`:

```tsx
  const fieldset = useRef<HTMLFieldSetElement>(null)
  // Change unmounts its own button, so focus moves to the radio the fieldset opens on.
  const reopen = () => {
    flushSync(onChange)
    fieldset.current?.querySelector<HTMLInputElement>('input:checked')?.focus()
  }
```

- [ ] **Step 2.** In `roles.spec.js`, before "Change shows the default another tab stored
  after this page loaded":

```js
test('Change moves keyboard focus to the checked radio', async ({ visitor }) => {
  const page = await visitor({ name: 'Alice', defaultRole: 'Facilitator' })
  await page.goto('/')
  await changeDefaultRole(page).focus()
  await page.keyboard.press('Enter')
  await expect(defaultRoleRadio(page, 'Facilitator')).toBeFocused()
})
```

- [ ] **Step 3.** Delete `docs/known-issues.md`, "Pressing Change in the lobby drops keyboard
  focus". Nothing else cites it.
- [ ] **Step 4. The focus bites.** Drop the `.focus()` line: the case fails in both browsers,
  the radio "inactive". Revert.
- [ ] **Step 5.** `git commit -am "fix: move focus to the checked radio when Change opens the fieldset (ui refresh step 2c)"`

### Task 3: Offer the lobby's roles from the decoder's one table

**Judged by:** the existing tests passing unchanged.

- [ ] **Step 1.** In `joinRole.ts`, rename the decoder's table `known` (in `decode` too) and
  export the list after it:

```ts
const known: Record<Role, true> = { Voter: true, Facilitator: true }
// Every role, in the order the lobby offers them.
export const roles = Object.keys(known) as Role[]
```

- [ ] **Step 2.** In `DefaultRole.tsx`, delete `const roles: Role[]` and import `roles` from
  `'../room/joinRole'`.
- [ ] **Step 3.** `git commit -am "refactor: offer the lobby's roles from the decoder's one table (ui refresh step 2c)"`

### Task 4: Pin that a failed switch leaves the remembered role

**Judged by:** one new e2e case, and one mutation.

- [ ] **Step 1.** In `roles.spec.js`, before "a switch survives a reload while the stream is
  frozen":

```js
test('a failed switch changes neither the line nor the role a reload joins with', async ({
  join,
  room
}) => {
  const alice = await join('Alice')
  const role = new RegExp(`/rooms/${room}/role$`)
  await alice.page.route(role, route => route.abort())
  // Logged after any write the failure made, so the reload below sees it.
  const logged = alice.page.waitForEvent('console', m => m.type() === 'log')
  await switchTo(alice.page, 'facilitator').click()
  await logged
  await joinedAs(alice.page, 'Voter')

  await alice.page.unroute(role)
  await alice.page.reload()
  await joinedAs(alice.page, 'Voter')
})
```

- [ ] **Step 2. The case bites.** In `Room.tsx`, make the switch
  `api.switchRole(roomId, role).finally(() => onSwitched(role))`: the case fails in both
  browsers after the reload, the page reading "You are a facilitator.". Revert.
- [ ] **Step 3.** `git commit -am "test: pin that a failed switch leaves the remembered role (ui refresh step 2c)"`

### Task 5: Store the name and the default role through one lobby rule

**Judged by:** the existing tests passing unchanged.

- [ ] **Step 1.** In `App.tsx`, before `joinHere`:

```tsx
  // Every lobby submit stores the name, and the shown default if none is stored.
  const keepLobby = () => {
    localStorage.setItem('name', name)
    return keepDefault(localStorage, shownRole)
  }
```

  `joinHere` reads `joinRole(localStorage, pathRoom, keepLobby())`, and `doCreate` and
  `doJoin` (after its id check) replace their two lines with `keepLobby()`.
- [ ] **Step 2.** `git commit -am "refactor: store the name and the default role through one lobby rule (ui refresh step 2c)"`

### Task 6: Name the Change callback `onChangeRole` in both lobby components

**Judged by:** the typecheck.

- [ ] **Step 1.** `DefaultRole`'s prop `onChange` becomes `onChangeRole`, in `Props`, the
  destructuring and `reopen`. `Lobby` passes `onChangeRole={onChangeRole}`.
- [ ] **Step 2.** `git commit -am "refactor: name the Change callback onChangeRole in both lobby components (ui refresh step 2c)"`

### Task 7: Create a second room through the checked fixture helper

**Judged by:** the e2e suite passing unchanged.

- [ ] **Step 1.** In `e2e/fixtures.js`, before `export const test`:

```js
// A new room on the app, checked, so a failed create fails here rather than at a later join.
export const createRoom = async baseUrl => {
  const response = await fetch(`${baseUrl}/create-room`, { method: 'POST' })
  if (!response.ok) {
    response.body?.cancel().catch(() => {})
    throw new Error(`POST /create-room answered ${response.status}`)
  }
  return (await response.text()).trim()
}
```

  The `room` fixture becomes `await use(await createRoom(app.baseUrl))`, and `visitor`'s
  teardown comment says "a half-built page".
- [ ] **Step 2.** In `roles.spec.js`, import `createRoom`, and "a switch in one room changes
  neither another room's role nor the default" reads
  `const other = await createRoom(app.baseUrl)`.
- [ ] **Step 3.** `git commit -am "test: create a second room through the checked fixture helper (ui refresh step 2c)"`

### Task 8: Complete the 2c plan's storage matrix

- [ ] **Step 1.** In the 2c plan's matrix:
  - "Create fails", *N and D*: "D kept; the error shows", as "Create succeeds" words it.
  - "Another tab stores a D", *N and D*: "…the old D until a load or Change".
- [ ] **Step 2.** Before the "Cannot happen" paragraph under it: "*D* without *N*, a choice in
  the fieldset and then no submit, reads as the *N and D* column with an empty name: the root
  shows the line, and a room's path shows its lobby, since the auto-join needs *N* too."
- [ ] **Step 3.** `git commit -am "docs: complete the 2c plan's storage matrix after the review (ui refresh step 2c)"`

### Task 9: Prove the step whole, and publish

- [ ] **Step 1.** At the root: `npm run typecheck`, `npm run lint`, `npm run test:unit` (114)
  and `npm test` (17) pass.
- [ ] **Step 2.** `npm run e2e` passes 154 of 154.
- [ ] **Step 3.** `git push`, once the user confirms.

## Second pass

One fresh reviewer, lens failure modes, ran over `e093779..4665bb8`. It found no Critical or
Important defect. Its three Minor findings were checked against the code:

| # | Finding | Decision |
|---|---|---|
| 1 | A held Enter repeats the role line's click with `detail` 0, so a repeat after the first switch's frame switches back | Prevent a repeated Enter's default: Task 10 |
| 2 | The `detail` guard also drops a deliberate click within the OS double-click time | A known-issues entry, in Task 10's commit |
| 3 | The failed-switch case's first `joinedAs` cannot fail, since only a snapshot changes the line | No action: the reload half is the one Task 4's mutation fails |

Space activates on keyup, so a held Space clicks once and needs no guard.

### Task 10: Ignore a held Enter's repeats on the role line

**Judged by:** a new e2e case, which sent two `/role` requests in both browsers before the fix.

- [ ] **Step 1.** In `RoleLine.tsx`, under the button's `onClick`:

```tsx
          // A held Enter repeats its click the same way.
          onKeyDown={e => e.repeat && e.key === 'Enter' && e.preventDefault()}
```

- [ ] **Step 2.** In `roles.spec.js`, after "a double-click's second click does not switch back":

```js
// A held key repeats its click, which would switch back once the first switch re-renders.
test('a held Enter does not switch back', async ({ join, room }) => {
  const alice = await join('Alice')
  const switches = []
  alice.page.on('request', r => r.url().endsWith(`/rooms/${room}/role`) && switches.push(r))
  await switchTo(alice.page, 'facilitator').focus()
  await alice.page.keyboard.down('Enter')
  await joinedAs(alice.page, 'Facilitator')

  // A second down without an up is a repeat.
  await alice.page.keyboard.down('Enter')
  await alice.page.keyboard.up('Enter')
  await alice.page.waitForTimeout(500)
  expect(switches).toHaveLength(1)
  await joinedAs(alice.page, 'Facilitator')
})
```

  Mutation: without Step 1's `onKeyDown`, the case receives 2 requests in both browsers.
- [ ] **Step 3.** Add the known-issues entry "A deliberate re-click on the role line within
  the double-click time is ignored".
- [ ] **Step 4.** `npm run typecheck`, `npm run lint`, `npm run test:unit` (114) and
  `npm run e2e` (156 of 156) pass.
- [ ] **Step 5.** `git commit -am "fix: ignore a held Enter's repeats on the role line (ui refresh step 2c)"`
