# UI Refresh Step 1b: Alphabetical Participants Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** List participants in name order, the same on every screen, with nothing else changing, the results table included.

**Architecture:** `applySnapshot` in `frontend/src/room/view.ts` returns a sorted copy of its rows, compared by a module-level `Intl.Collator('en', { numeric: true })` over the trimmed name, with ties broken by user id in code-unit order. The tally and the reader's own row keep reading the snapshot's order. Seven `view.test.ts` cases prove the sort, and each rule has a case that fails without it. One `room.spec.js` case checks that the order reaches the screen.

**Tech Stack:** React 19, TypeScript, Vitest, Playwright 1.63 (Chromium and Firefox) against the testkit stub.

**Spec:** `docs/superpowers/specs/2026-09-30-ui-refresh-design.md`, "Step 1b. Alphabetical participants" (scope and pass condition, the order, the contract, commits, accepted costs), with principle 9 and step 1's "The test contract". Steps 2 and after are out of scope.

## How the code in this plan was verified

Every patch below was applied and run in a scratch worktree on 2026-10-03, on this branch at `a2e1a56`:

- **The cases fail first.** Against step 1a's product code, all seven new unit cases failed and the three existing ones passed.
- **Green after.** With the sort, `npm run test:unit` passed 90 tests, and the whole e2e suite passed, 112 cases. `npm run typecheck` and `npm run lint` were clean.
- **The bites.** Each mutation in Task 2, Step 1 was applied alone to the finished `view.ts`; each failed exactly the cases its row names. The temporary tally case passed without its mutation and failed with it, `expected [ '?', 1 ] to deeply equal [ '0.5', 1 ]`.
- **The e2e case.** It passed 10 of 10 with `--repeat-each 5` in both browsers, and failed 20 of 20 with `--repeat-each 10` against an unsorted list.
- **Formatting.** The new lines pass `npx prettier --check --single-quote --no-semi --print-width 100 --trailing-comma none --arrow-parens avoid`. `view.ts` and `view.test.ts` already fail that check on `main` for lines this step does not touch; leave them alone (see Task 1, Step 6).

## Decisions this plan takes that the spec does not settle

Each is implemented as written unless review changes it.

- **P1. The sort is a module-level `collator` and `byName` comparator in `view.ts`,** above `View`, and `applySnapshot` returns `users: [...users].sort(byName)`. A copy, since `me` and the tally read `users` in the snapshot's order; `toSorted` would need `lib` raised to ES2023 in `frontend/tsconfig.json`, a config change outside this step (see the known issue "The frontend's type check stops at ES2022 APIs").
- **P2. The unit cases sit in a nested `describe('lists participants in name order')`** inside the existing `describe('applySnapshot')`, with two local helpers: `named(id, name)` builds a row with no estimation, and `order(...users)` returns the rendered names.
- **P3. Each case feeds two rows in the wrong order.** The tie case reads ids instead of names, since the names are equal.
- **P4. The blank-name case has no rule of its own.** A blank name sorts first with or without the trim, so it fails only against step 1a. It guards a comparator change that would push blank names last.
- **P5. The e2e case joins `Dev 10`, `Dev 2`, `bob`, then `Ålice` and reads the first joiner's page,** so the page under test is the one that saw every later join arrive. The names need the accent, case and numeric rules, so a plain compare or a collator without `numeric` fails the case in both browsers. Join order does not set the order, since the server orders by id; reversing it only keeps a join-order regression from passing. It sits after "the participant list follows a join and a leave".
- **P6. Commit subjects follow steps 1 and 1a:** the code commit ends with "(ui refresh step 1b)", this plan lands as a `docs` commit before Task 1, and the last commit sets `Status: landed.`

## Global Constraints

- No em dash anywhere: code, comments, docs, commit messages and the PR body.
- Code comments are one or two lines, never more.
- Conventional Commits, and no generated-with or co-authored-by attribution line.
- TypeScript and JavaScript: single quotes, no semicolons, print width 100, no trailing commas, `arrow-parens avoid`.
- The collator, verbatim: `new Intl.Collator('en', { numeric: true })`. No `sensitivity` option.
- The tie-break, verbatim: `a.id < b.id ? -1 : a.id > b.id ? 1 : 0`, not the collator.
- Trimming applies to the comparison only: the rendered name is unchanged.
- `votesSummary` and `userEstimation` must not change: the tally reads the snapshot's order.
- The suite reads the order only through `participantEntries(page)` with `toHaveText([...])` (spec, "The contract").
- The e2e suite must never contact a host other than `127.0.0.1`.
- The unit count assumes `target/contract/` exists from an earlier `sbt test`; without it `snapshot.contract.test.ts` fails with "run sbt test first".
- Frontend-only changes need `npm run build` before `npx playwright test`; `npm run e2e` builds and stages everything.
- Do not push or merge: steps 1, 1a and 1b merge in one window with no live rooms (spec, "Order"; every merge to main restarts the server).

## Review Focus

The inputs most likely to bite a person, most likely first.

1. **A tied "Most voted" changing after this step.** Expected: unchanged, since the tally reads the snapshot's order. Pinned by Task 2, Step 1's "sort before the tally" row, and by the existing tally case staying green.
2. **The reader's own vote read from the wrong row.** Expected: `userEstimation` and `ownVoteConfirmed` follow `s.you`, whatever the order. Pinned by the existing "reads the reader's own estimation" case, which runs on the sorted code.
3. **Two people with the same name.** Expected: one order on every screen. Pinned by the tie case, fed in descending id order.
4. **A name typed with leading spaces or left blank.** Expected: sorted by its visible letters, shown as typed, a blank one first. Pinned by the leading-spaces and blank-name cases.
5. **Firefox collating differently from Chromium.** Expected: the same order. Pinned by the e2e case running in both projects; the pinned locale is otherwise untested (spec, "Accepted costs").

---

### Before Task 1: commit this plan

```bash
git add docs/superpowers/plans/2026-10-03-ui-refresh-1b-alphabetical-order.md
git commit -m "docs: plan ui refresh step 1b" -m "Every code block was run in a scratch worktree first: the cases fail against step 1a, pass with the sort, and each rule's mutation fails its own case."
```

### Task 1: Participants are listed in name order

**Files:**
- Modify: `frontend/src/room/view.ts`
- Modify: `frontend/src/room/view.test.ts`
- Modify: `e2e/room.spec.js`

**Interfaces:**
- Consumes: `applySnapshot(s: RoomSnapshot): View` and `ParticipantRow` from `view.ts`; `participantEntries(page)` and the `join` fixture from `e2e/fixtures.js`.
- Produces: `View.users` in name order. No new export.

- [ ] **Step 1: Write the failing unit cases**

In `frontend/src/room/view.test.ts`, inside `describe('applySnapshot', ...)`, after the last `it` ("reads the reader's own estimation and whether it is confirmed"), add:

```ts

  // Each pair is fed in the wrong order, so a missing sort fails every case.
  describe('lists participants in name order', () => {
    const named = (id: string, name: string) => ({ id, name, estimation: none })
    const order = (...users: RoomSnapshot['users']) =>
      applySnapshot(snap(users)).users.map(u => u.name)

    it('puts a lowercase name among its letter, not after every capital', () => {
      expect(order(named('a', 'Bob'), named('b', 'alice'))).toEqual(['alice', 'Bob'])
    })

    it('puts a lowercase name before the same name capitalised', () => {
      expect(order(named('a', 'Alice'), named('b', 'alice'))).toEqual(['alice', 'Alice'])
    })

    it('puts an accented name among its base letter', () => {
      expect(order(named('a', 'Bob'), named('b', 'Ålice'))).toEqual(['Ålice', 'Bob'])
    })

    it('breaks a tie on name by user id', () => {
      const s = snap([named('b', 'Sam'), named('a', 'Sam')])
      expect(applySnapshot(s).users.map(u => u.id)).toEqual(['a', 'b'])
    })

    it('ignores leading spaces, and shows the name as typed', () => {
      expect(order(named('a', '  Zed'), named('b', 'Bob'))).toEqual(['Bob', '  Zed'])
    })

    it('puts Dev 2 before Dev 10', () => {
      expect(order(named('a', 'Dev 10'), named('b', 'Dev 2'))).toEqual(['Dev 2', 'Dev 10'])
    })

    it('puts a blank name first', () => {
      expect(order(named('a', 'Bob'), named('b', '   '))).toEqual(['   ', 'Bob'])
    })
  })
```

- [ ] **Step 2: Run them to see them fail against step 1a**

Run: `npx vitest run --root frontend src/room/view.test.ts`
Expected: `Tests  7 failed | 3 passed (10)`, the seven new cases failing on their `toEqual`. Record this for the PR's bite table.

- [ ] **Step 3: Write the e2e case**

In `e2e/room.spec.js`, directly before the comment `// Plain HTTP off localhost is not a secure context, and randomUUID is undefined there.`, add:

```js
// Ids are random, so without the sort four names come out in this order one run in 24.
// The names need the accent, case and numeric rules, so each browser's collator is exercised.
test('participants are listed in name order', async ({ join }) => {
  const first = await join('Dev 10')
  await join('Dev 2')
  await join('bob')
  await join('Ålice')
  // An array checks the count as well, so this cannot read before Ålice arrives.
  await expect(participantEntries(first.page)).toHaveText([/Ålice/, /bob/, /Dev 2/, /Dev 10/])
})

```

`participantEntries` is already imported at the top of the file.

- [ ] **Step 4: Add the sort**

In `frontend/src/room/view.ts`, directly above `export type View = {`, add:

```ts
// Pinned to one locale so every browser lists the room in the same order.
const collator = new Intl.Collator('en', { numeric: true })
const byName = (a: ParticipantRow, b: ParticipantRow) =>
  collator.compare(a.name.trim(), b.name.trim()) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)

```

In `applySnapshot`'s returned object, replace:

```ts
    users,
```

with:

```ts
    // A sorted copy: the tally above keeps the snapshot's order, so tied values stay as they were.
    users: [...users].sort(byName),
```

Leave `const users = s.users.map(toRow)`, `me` and the tally as they are.

- [ ] **Step 5: Run the unit cases and the e2e case to see them pass**

Run: `npx vitest run --root frontend src/room/view.test.ts`
Expected: `Tests  10 passed (10)`.

Run: `npm run build && npx playwright test e2e/room.spec.js -g "name order" --repeat-each 5`
Expected: 10 passed.

- [ ] **Step 6: Check the format, types and lint**

Run: `npx prettier --check --single-quote --no-semi --print-width 100 --trailing-comma none --arrow-parens avoid e2e/room.spec.js`
Expected: all matched files use Prettier code style.

Run: `npx prettier --single-quote --no-semi --print-width 100 --trailing-comma none --arrow-parens avoid frontend/src/room/view.ts | diff frontend/src/room/view.ts -` and the same for `frontend/src/room/view.test.ts`.
Expected: the only differences are the ones already on `main`: the `shown` arrow in `view.ts` and the long `snap([...])` line in the tally case. Do not run `--write`: it would reformat lines this step does not own.

Run: `npm run typecheck && npm run lint`
Expected: no errors.

- [ ] **Step 7: Run everything**

Run: `npm run test:unit && npx playwright test`
Expected: 90 unit tests and 112 e2e cases passed.

Run: `git status --short`
Expected: exactly the three modified files.

- [ ] **Step 8: Commit**

```bash
git add frontend/src/room/view.ts frontend/src/room/view.test.ts e2e/room.spec.js
git commit -m "feat(frontend): list participants in name order (ui refresh step 1b)" -m "view.ts sorts a copy of the rows with a collator pinned to English, numeric, over the trimmed name, ties by user id in code-unit order. The tally keeps the snapshot's order, so a tied Most voted is unchanged."
```

### Task 2: The bites, and the status line

**Files:**
- Modify, then restore: `frontend/src/room/view.ts`
- Modify: `docs/superpowers/specs/2026-09-30-ui-refresh-design.md`

- [ ] **Step 1: Show each rule bites its own case**

Apply each mutation alone to the committed `view.ts`, run `npx vitest run --root frontend src/room/view.test.ts`, record the result, then `git checkout frontend/src/room/view.ts` before the next.

| Mutation | Edit | Expected failures |
| --- | --- | --- |
| No trim | `a.name.trim(), b.name.trim()` becomes `a.name, b.name` | leading spaces only |
| Plain `<` | `collator.compare(a.name.trim(), b.name.trim())` becomes `(a.name.trim() < b.name.trim() ? -1 : a.name.trim() > b.name.trim() ? 1 : 0)` | lowercase, lowercase before capitalised, accented, Dev 2 |
| No `numeric` | `{ numeric: true }` becomes `{}` | Dev 2 only |
| `sensitivity: 'base'` | `{ numeric: true }` becomes `{ numeric: true, sensitivity: 'base' }` | lowercase before capitalised only |
| No tie-break | delete ` \|\| (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)` | tie only |
| Sort before the tally | `const users = s.users.map(toRow)` becomes `const users = s.users.map(toRow).sort(byName)` | none in `view.test.ts`; see below |

The first four rows are the spec's "each rule's case is also shown failing against the sort without that rule", and the fifth was added after review; in the table, `\|\|` is a plain `||`. The last row is the Review Focus's tally check: with it applied, add this case temporarily at the end of the nested `describe`, run it, and expect it to fail with `['?', 1]` first, then delete it:

```ts
    it('leaves a tied Most voted in snapshot order', () => {
      const s = snap([
        { id: 'a', name: 'Zed', estimation: confirmed('0.5') },
        { id: 'b', name: 'Amy', estimation: confirmed('?') }
      ])
      expect(applySnapshot(s).votesSummary[0]).toEqual(['0.5', 1])
    })
```

Without the mutation the same case passes. It is not committed: the spec keeps the tie rule out of this step, so no test should pin today's arbitrary order. All rows go in the PR's bite table.

Run: `git status --short`
Expected: nothing, so no mutation is left behind. Then `npm run build` so `frontend/dist` matches the branch.

- [ ] **Step 2: Mark the step landed, as the PR's last commit**

In `docs/superpowers/specs/2026-09-30-ui-refresh-design.md`, under "## Step 1b. Alphabetical participants", change:

```
Status: proposed. Branch: `20260930.ui_refresh_1b_alphabetical_order`, stacked
on step 1a.
```

to:

```
Status: landed. Branch: `20260930.ui_refresh_1b_alphabetical_order`, stacked
on step 1a.
```

Run: `git status --short`
Expected: only the spec.

```bash
git add docs/superpowers/specs/2026-09-30-ui-refresh-design.md
git commit -m "docs: mark ui refresh step 1b landed"
```

- [ ] **Step 3: Hand over**

Do not push. Report to the user: the commits, the bite table, and the e2e case's repeat runs. The user opens the PR, stacked on step 1a's, and merges steps 1, 1a and 1b in one window with no live rooms.
