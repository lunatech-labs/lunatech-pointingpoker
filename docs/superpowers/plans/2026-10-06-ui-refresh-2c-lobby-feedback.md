# UI Refresh Step 2c Hand Test: Lobby Fixes

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Land what the hand test of step 2c decided for the lobby's default role: a legend
beside its radios, the radios on every visit in place of the line and Change, and a help
line that says a joined room keeps its role.

**Architecture:** One state and one rule fewer. `choosingRole`, the Change button, its
`flushSync` focus move and "the shape changes only at the next load" all go. `defaultOnLoad`
still decides the auto-join (decision 7).

**Tech Stack:** as the step 2c plan, `2026-10-06-ui-refresh-2c-roles-ui.md`.

**Spec:** `docs/superpowers/specs/2026-10-04-ui-refresh-2-roles-design.md`, step 2c, "The
lobby", "The contract", "Pass condition" and "Accepted costs", already edited.

**Branch:** `20260930.ui_refresh_2c_roles_ui` (PR #434, stacked on #433), on top of
`741d806`. These fixes land before the stack merges, so no rebase is involved.

## The hand test, and what it decided

| # | Observation | Decision |
|---|---|---|
| F1 | On a first visit, "Your default role" sits centred above the radios, which start at the card's left edge | A floated legend: Task 1 |
| F2 | Change reopens the first-visit fieldset, where the room's role line switches in one click | The fieldset on every visit, the stored default checked: Task 2 |
| F3 | A revisit joined with the room's old role, not the default just changed: as designed, but a surprise | The help line states the rule: Task 3 |

**Why F1 is a bug, not taste.** A fieldset draws its first `legend` child on its border, so
`col-sm-3` never applies and the flex row never sees it. A floated legend is not drawn that
way (HTML's "rendered legend" excludes floats), so it becomes the row's first column.
Checked on 2026-10-06 in Chromium and Firefox at
1100px: legend and radios on one row, and `getByRole('group', { name: 'Your default role' })`
still finds one group. At 400px the row stacks like the name's.

**Why F2 drops Change rather than turning it into a switch.** Radios change the default in
one click too, keep one shape on every visit, and take a third role without a redesign. A
tab loaded before another tab's choice shows the old default until a reload.
A first-visit tab already does the same, and "Accepted costs" lists it. What goes is
Change's re-read of storage. A click on the radio already checked stores nothing; a reload
shows the stored default.

**F3's wording** was chosen for non-native readers: "Used for rooms you have not joined
before. In a room you have joined before, you keep your previous role there." The repeated
"joined before" mirrors the two cases, and "there" ties "previous role" to the room rather
than to a previous default.

## Browser storage, the rows that change

The 2c plan's "Browser storage, states by events", same notation. In these rows only the
*N and D* and *N, D and K* cells change. The only other changes are the note under the
matrix, two cells of "Another tab stores a D", and P7, all listed below the table.

| Event | Was | Becomes |
| --- | --- | --- |
| Load the root | the line "Default role for new rooms: D", with Change | the fieldset, D checked |
| A choice in the fieldset | (after Change) D := choice; the fieldset stays open | D := choice, at once; the form stays |
| Change | the fieldset, holding D as stored now | row deleted: no Change |
| Another tab stores a D | the line keeps showing the old D until a load or Change | the fieldset keeps the old D checked until a load; its submit joins with the stored D |

The note under that matrix, *D* without *N*, now reads "the root shows the fieldset, D
checked". The *Nothing stored*, *N only* and *A bad D or K* columns already showed the
fieldset, so a first visit and a later one now differ only in what is checked.

In the *Nothing stored* and *N only* cells of "Another tab stores a D", "keeps its shape"
now reads "keeps its choice checked", since the form has one shape. P7 ("Change's fieldset
stays open until the next load") no longer applies.

## Global Constraints

As the 2c plan's, and:

- No server change: `src/` and `frontend/src/protocol/generated/` stay untouched.
- Layout gets no e2e case: the suite reads roles and names, not geometry, and step 3 lays out
  both pages. Task 1 is checked by screenshot.
- Push only once Task 4 passes. Do not merge: every merge to `main` ends every live room.

### Before Task 1: commit this plan

```bash
git add docs/superpowers/plans/2026-10-06-ui-refresh-2c-lobby-feedback.md \
  docs/superpowers/specs/2026-10-04-ui-refresh-2-roles-design.md
git commit -m "docs: plan the ui refresh step 2c lobby fixes from the hand test (ui refresh step 2c)"
```

### Task 1: Lay the default role's legend beside its radios

**Files:** `frontend/src/components/DefaultRole.tsx`

- [ ] Add `float-left` to the legend, and a second comment line:

```tsx
  // The legend names the group only as the fieldset's first child, so no row div wraps it.
  // Floated, the fieldset no longer draws it on its border, so it takes its column.
  return (
    <fieldset ref={fieldset} className="form-group row">
      <legend className="col-form-label col-sm-3 pt-0 float-left">Your default role</legend>
```

- [ ] Screenshot a first visit at 1100px in Chromium and Firefox, and at 400px, from
  `npx vite frontend` as the mockups were: legend and radios on one row, then stacked.
- [ ] Commit: `fix: lay the default role's legend beside its radios (ui refresh step 2c)`

### Task 2: Show the default role's radios on every lobby visit

**Files:** `e2e/roles.spec.js`, `e2e/fixtures.js`, `frontend/src/components/DefaultRole.tsx`,
`Lobby.tsx`, `App.tsx`

- [ ] Red first. Rewrite "a choice after Change is stored without a submit, and a new room
  takes it" so it needs no Change, and run it with
  `npm run e2e -- e2e/roles.spec.js --project=chromium` against the current code, where it
  must fail on the missing Voter radio. `npm run e2e` rebuilds and stages first; a bare
  `npx playwright test` would serve the last build.

```js
test('a choice on a later visit is stored without a submit, and a new room takes it', async ({
  visitor
}) => {
  const page = await visitor({ name: 'Alice', defaultRole: 'Voter' })
  await page.goto('/')
  await expect(defaultRoleRadio(page, 'Voter')).toBeChecked()
  await defaultRoleRadio(page, 'Facilitator').check()

  await page.reload()
  await expect(defaultRoleRadio(page, 'Facilitator')).toBeChecked()
  await page.getByRole('button', { name: 'Create' }).click()
  await expect(page).toHaveURL(ROOM_URL)
  await joinedAs(page, 'Facilitator')
})
```

- [ ] `DefaultRole.tsx`: drop `choosing`, `onChangeRole`, the line branch, `reopen`, the
  `ref` and the `flushSync`, `useRef` and `react-dom` imports. What remains is the fieldset.
- [ ] `Lobby.tsx`: drop the `choosingRole` and `onChangeRole` props, their comment and their
  pass-through to `DefaultRole`.
- [ ] `App.tsx`: drop the `choosingRole` state, `changeRole` and its comment, and the two
  props. `shownRole` and `defaultOnLoad` stay, and the comment over `defaultOnLoad` becomes
  `// Decision 7: the auto-join and the radio first checked follow the default role stored at load.`
- [ ] `e2e/fixtures.js`: drop `defaultRoleLine` and `changeDefaultRole`, and say "a radio
  group on every visit" in the comment over `defaultRoleChoice`.
- [ ] `e2e/roles.spec.js`, against the spec's "Pass condition":
  - delete "Change moves keyboard focus to the checked radio" and "Change shows the default
    another tab stored after this page loaded": the behaviour they pin is gone;
  - "a revisit takes the role the room's snapshot stored…": drop the Change click;
  - "a first-visit tab keeps its form, and another's submit keeps the choice it made":
    retitle "a submit from a tab showing Voter keeps the Facilitator another tab chose", drop
    `expect(defaultRoleChoice(first)).toBeVisible()`, add `await joinedAs(second, 'Facilitator')`
    after the `Show votes` wait, so the tab showing Voter is seen to join with the stored D, and
    end on `expect(defaultRoleRadio(later, 'Facilitator')).toBeChecked()`;
  - the case ending on the other room's default: `defaultRoleLine(page, 'Voter')` visible
    becomes `defaultRoleRadio(page, 'Voter')` checked;
  - drop the two imports, and `defaultRoleChoice` if nothing uses it any more.
- [ ] `npm run typecheck && npm run lint`, then `npm run e2e -- e2e/roles.spec.js --project=chromium`.
- [ ] Commit: `feat: show the default role's radios on every lobby visit (ui refresh step 2c)`

### Task 3: Say in the lobby that a joined room keeps its role

**Files:** `frontend/src/components/DefaultRole.tsx`

- [ ] Replace the help line's text with F3's wording. No case reads it.
- [ ] Commit: `fix: say in the lobby that a joined room keeps its role (ui refresh step 2c)`

### Task 4: Prove the step whole, and publish

- [ ] `npm run typecheck && npm run lint && npm run test:unit && npm run e2e`, both browsers.
- [ ] Grep for leftovers; it must print nothing (`flushSync` stays out: `IssueEditor` uses it):

```bash
grep -rnE "choosingRole|changeRole|ChangeRole|changeDefaultRole|defaultRoleLine|Default role for new rooms|name: 'Change'|>Change<" \
  e2e frontend/src README.md docs --exclude-dir=plans
```
- [ ] Check PR #434's body for the line and Change; reword it if it describes them.
- [ ] Push.
