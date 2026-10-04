# UI Refresh Step 1a: The Editor's Live Region Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Put the issue editor's two notices inside one always-rendered `role="status"` region, so a screen reader announces them, with no visible change.

**Architecture:** `IssueEditor` wraps its conflict notice and its "Could not save the issue" line in an unstyled `div` with `role="status"` and `data-testid="issue-status"`, rendered for the room's life and adding no state. `e2e/fixtures.js` gains a lookup for it and a reusable region helper that proves the element was not re-created and that no attribute silences it. One case in `room.spec.js` walks the region through every notice it can hold.

**Tech Stack:** React 19, TypeScript, Bootstrap 4.6 classes, Playwright 1.63 (Chromium and Firefox) against the testkit stub.

**Spec:** `docs/superpowers/specs/2026-09-30-ui-refresh-design.md`, "Step 1a. The editor's live region" (scope and pass condition, the region, the contract, commits, accepted costs), with principles 4, 8 and 9 and step 1's "The test contract". Steps 1b and after are out of scope.

## How the code in this plan was verified

Every patch below was applied and run in a scratch worktree on 2026-10-03, on this branch at `71e885f`:

- **The case fails first.** Against step 1's product code, the new case failed in both browsers at its first `toBeAttached`, `element(s) not found`.
- **Green after.** With the region, the case passed in both browsers, then 20 of 20 over `--repeat-each 10`. The whole e2e suite passed, 110 cases, alongside the 4 look cases. `npm run typecheck`, `npm run lint` and `npm run test:unit` (83 tests) were clean.
- **The bites.** Each mutation in Task 2, Step 1 was built and the case run in Chromium; each failed at the check the table names.
- **The look.** The throwaway script in Task 1 took 28 screenshots on `71e885f` (the spec's six states plus both notices at once, two viewports, two browsers), matched itself on a second run, and then matched with the region in place. A first version that masked the room id was unstable in Firefox at 390 px, since the random slug's length moves the wrapping; pinning its text fixed that, over three reruns. With `className="pt-1"` on the region, the "before reveal" screenshots failed at both viewports in both browsers, so the check sees an empty region that takes height.
- **Formatting.** Touched files pass `npx prettier --check --single-quote --no-semi --print-width 100 --trailing-comma none --arrow-parens avoid`.

## Decisions this plan takes that the spec does not settle

Each is implemented as written unless review changes it.

- **P1. The region sits inside the editor's `col`, below the `input-group`,** wrapping both `small`s.
- **P2. Names.** `issueStatus(page)` is the lookup, named after the test id. The helper is two functions: `markRegion(region)` tags the element once, and `expectLiveRegion(region)` asserts the tag is still there and no attribute silences it; step 4a reuses both. A case marks once, before the first change, since re-marking would hide a re-creation between two checks.
- **P3. The helper reports problems as a list,** asserted equal to `[]`, so a failure names every cause at once ("re-created since markRegion", `aria-live="off"`, `aria-busy on <div>`).
- **P4. The case walks four states in one page:** the conflict notice alone, both notices, the failure line alone after "Use theirs", and empty after a successful save. The save goes through Enter, since "Use theirs" leaves focus in the box. The last state waits for the Edit button, which renders only in viewing: the box is read-only while saving too, when the region is briefly empty. It sits after "a failed save leaves focus the user moved elsewhere", with the other editor cases.
- **P5. The case reads the region's whole text with `toHaveText`,** since an atomic region is read whole. Playwright reads `textContent`, so both notices together read `...Use theirsCould not save the issue`, with no space between the two `small`s.
- **P6. The hand-run helper mutations** (spec: `aria-atomic="false"`, an ancestor with `aria-busy="true"`) put `aria-busy` on the editor's outer `div ref={group}`, an ancestor a restyle would touch.
- **P7. Commit subjects, the plan commit and the status line follow step 1's conventions:** the code commit ends with "(ui refresh step 1a)", this plan lands as a `docs` commit before Task 1, and the last commit sets `Status: landed.`

## Global Constraints

- No em dash anywhere: code, comments, docs, commit messages and the PR body.
- Code comments are one or two lines, never more.
- Conventional Commits, and no generated-with or co-authored-by attribution line.
- TypeScript and JavaScript: single quotes, no semicolons, print width 100, no trailing commas, `arrow-parens avoid`.
- Nothing looks different: the region has no class and no style.
- Test id, verbatim: `issue-status`. Role: `status`, with no explicit `aria-live`, `aria-atomic`, `aria-relevant` or `aria-busy`.
- The notices' copy is unchanged: `Changed by someone else to: "<issue>"`, "Use theirs", "Could not save the issue".
- The suite reads the region with `toBeAttached`, `toBeEmpty` and `toHaveText`, never visibility.
- The existing editor cases' page-wide text lookups stay unchanged (spec, "The contract").
- The e2e suite must never contact a host other than `127.0.0.1`.
- The unit count assumes `target/contract/` exists from an earlier `sbt test`; without it `snapshot.contract.test.ts` fails with "run sbt test first".
- Frontend-only changes need `npm run build` before `npx playwright test`; `npm run e2e` builds and stages everything.
- Do not push or merge: steps 1, 1a and 1b merge in one window with no live rooms (spec, "Order"; every merge to main restarts the server).

## Review Focus

The inputs most likely to bite a person, most likely first.

1. **What a screen reader actually speaks.** Expected: each notice heard once when it appears, both read when either changes, nothing on removal. No browser exposes speech, so Task 2, Step 2 is the user's hand check with Orca.
2. **The phone viewport with a notice shown.** Expected: the region changes nothing at 390 px. Pinned by the look check's phone "conflict", "both-notices" and "failed-save" screenshots in Task 1.
3. **Firefox's accessibility tree.** Expected: `getByRole('status')` finds the `div` as in Chromium. Pinned by running the case and the suite in both projects in Task 1.
4. **Another status element on the page at the same time,** the moved-link banner or the restart notice: settled by the spec's "The region".
5. **The "banner covers no card" case in `slug.spec.js`,** which hit-tests every card for any `status`: settled by the spec's "The region".

---

### Before Task 1: commit this plan

```bash
git add docs/superpowers/plans/2026-10-03-ui-refresh-1a-editor-live-region.md
git commit -m "docs: plan ui refresh step 1a" -m "Every code block was run in a scratch worktree first: the case fails against step 1, passes with the region, and fails against each of the spec's mutations."
```

### Task 1: The editor's notices live in one status region

**Files:**
- Modify: `frontend/src/components/IssueEditor.tsx`
- Modify: `e2e/fixtures.js`
- Modify: `e2e/room.spec.js`
- Throwaway, never committed: `e2e/look.spec.js` and `e2e/look.spec.js-snapshots/`

**Interfaces:**
- Produces, for Task 2 and for step 4a: `issueStatus(page)`, a locator; `markRegion(region)`, which returns a promise; `expectLiveRegion(region)`, an async assertion. `region` is any Playwright locator resolving to one element.

- [ ] **Step 1: Take the look's baseline screenshots**

Run: `git diff --stat 8d09668 -- frontend`
Expected: nothing, so the screenshots taken now are step 1's look, as the spec's look check asks ("against step 1's branch"). (`8d09668` is step 1's last commit.)

Write `e2e/look.spec.js`:

```js
// Throwaway, never committed: seven states at two viewports, before and after the region.
import { test, expect, issueBox, issueEdit, issueSave, unconfirmedCard, vote } from './fixtures.js'

const sizes = { default: null, phone: { width: 390, height: 844 } }
// The room id is a random slug whose length moves the phone layout, so its text is pinned.
const shot = async (page, size, name) => {
  await page.evaluate(() => {
    for (const h of document.querySelectorAll('.card-title')) {
      if (!h.textContent.endsWith(' Room')) h.textContent = 'room-id'
    }
  })
  await expect(page).toHaveScreenshot(`${size}-${name}.png`, { fullPage: true })
}

for (const [size, viewport] of Object.entries(sizes)) {
  test(`look at ${size}`, async ({ page, origin, join, room }) => {
    if (viewport) await page.setViewportSize(viewport)
    await page.goto(`${origin}/`)
    await expect(page.getByRole('button', { name: 'Create' })).toBeVisible({ timeout: 15_000 })
    await shot(page, size, 'lobby')

    const alice = await join('Alice')
    const p = alice.page
    if (viewport) await p.setViewportSize(viewport)
    await shot(p, size, 'before-reveal')

    // Bob changes the issue under Alice's draft, then leaves, since two entries sort by random id.
    const bob = await join('Bob')
    await issueEdit(p).click()
    await issueBox(p).fill('mine')
    await issueEdit(bob.page).click()
    await issueBox(bob.page).fill('PP-2')
    await issueSave(bob.page).click()
    await expect(p.getByText('Changed by someone else to:')).toBeVisible()
    await bob.page.getByRole('link', { name: 'Leave' }).click()
    await expect(p.getByText('Bob')).toHaveCount(0)
    await shot(p, size, 'conflict')

    const editIssue = new RegExp(`/rooms/${room}/edit-issue$`)
    await p.route(editIssue, route => route.abort())
    await issueSave(p).click()
    await expect(p.getByText('Could not save the issue')).toBeVisible()
    await shot(p, size, 'both-notices')

    await p.getByRole('button', { name: 'Use theirs' }).click()
    await issueBox(p).fill('again')
    await issueSave(p).click()
    await expect(p.getByText('Could not save the issue')).toBeVisible()
    await shot(p, size, 'failed-save')
    await p.unroute(editIssue)
    await p.keyboard.press('Escape')

    // A lone vote reveals, and the Re-vote then shows the unconfirmed card.
    await vote(p, '5')
    await expect(p.getByRole('button', { name: 'Re-vote' })).toBeVisible()
    await shot(p, size, 'after-reveal')
    await p.getByRole('button', { name: 'Re-vote' }).click()
    await expect(unconfirmedCard(p)).toHaveText('5')
    await shot(p, size, 're-vote')
  })
}
```

It reads only contract lookups and visible text, so it runs unchanged before and after the region.

Run: `npm run stage && npm run build && npx playwright test e2e/look.spec.js --update-snapshots && npx playwright test e2e/look.spec.js`
Expected: 28 screenshots written, then 4 passed, so the baseline is stable.

- [ ] **Step 2: Add the region lookup and the region helper**

In `e2e/fixtures.js`, between the `restartNotice` line and `export { expect }`, insert:

```js

// The issue editor's notices as a screen reader hears them: a role lookup skips a hidden region.
export const issueStatus = page => page.getByRole('status').and(page.getByTestId('issue-status'))

// A live region announces changes only to the element it is, so markRegion tags that element
// and expectLiveRegion fails once a re-render has replaced it or something silences it.
export const markRegion = region => region.evaluate(el => (el.__probe = 1))
// The values role="status" implies; each attribute may also be absent.
const implied = { 'aria-live': 'polite', 'aria-atomic': 'true', 'aria-busy': 'false' }
export const expectLiveRegion = async region => {
  const problems = await region.evaluate((el, implied) => {
    const read = (node, name) => node.getAttribute(name)?.trim().toLowerCase() ?? null
    const found = el.__probe === 1 ? [] : ['re-created since markRegion']
    for (const [name, value] of Object.entries(implied)) {
      if (![null, value].includes(read(el, name))) found.push(`${name}="${read(el, name)}"`)
    }
    const relevant = read(el, 'aria-relevant')
    const tokens = new Set(relevant?.split(/\s+/))
    if (relevant !== null && !(tokens.size === 2 && tokens.has('additions') && tokens.has('text')))
      found.push(`aria-relevant="${relevant}"`)
    for (let up = el.parentElement; up; up = up.parentElement) {
      if (read(up, 'aria-busy') === 'true') found.push(`aria-busy on <${up.localName}>`)
    }
    return found
  }, implied)
  expect(problems, 'what keeps the region from announcing').toEqual([])
}
```

The file then ends with a blank line and `export { expect }`, as before.

- [ ] **Step 3: Write the failing case**

In `e2e/room.spec.js`, add three names to the import list, after `issueSave,`:

```js
  issueStatus,
  markRegion,
  expectLiveRegion,
```

Then insert this case after "a failed save leaves focus the user moved elsewhere" and before "a re-vote leaves the caster shown as selected but unconfirmed":

```js
// Read by its own text throughout, since a region's text is announced as a whole.
test("the editor's notices are announced from one live region", async ({ join, room }) => {
  const alice = await join('Alice')
  const bob = await join('Bob')
  const status = issueStatus(alice.page)
  const conflict = 'Changed by someone else to: "PP-2" Use theirs'
  const failure = 'Could not save the issue'
  await expect(status).toBeAttached()
  await expect(status).toBeEmpty()
  await markRegion(status)

  await issueEdit(alice.page).click()
  await issueBox(alice.page).fill('mine')
  await setIssue(bob, 'PP-2')
  await expect(status).toHaveText(conflict)
  await expectLiveRegion(status)

  const editIssue = new RegExp(`/rooms/${room}/edit-issue$`)
  await alice.page.route(editIssue, route => route.abort())
  await issueSave(alice.page).click()
  await expect(status).toHaveText(conflict + failure)
  await expectLiveRegion(status)

  await alice.page.getByRole('button', { name: 'Use theirs' }).click()
  await expect(status).toHaveText(failure)
  await expectLiveRegion(status)

  await alice.page.unroute(editIssue)
  await alice.page.keyboard.press('Enter')
  await expect(issueEdit(alice.page)).toBeVisible()
  await expect(status).toBeEmpty()
  await expectLiveRegion(status)
})
```

`setIssue` is the file's existing helper, defined above the editor cases.

- [ ] **Step 4: Run it to see it fail against step 1's product code**

Run: `npx playwright test e2e/room.spec.js -g "announced from one live region"`
Expected: 2 failed, each at `expect(locator).toBeAttached()` with `element(s) not found`, locator `getByRole('status').and(getByTestId('issue-status'))`. Record this for the PR's bite table.

- [ ] **Step 5: Add the region**

In `frontend/src/components/IssueEditor.tsx`, replace:

```tsx
        {editor.notice !== null && (
          <small className="form-text text-muted">
            Changed by someone else to: "{editor.notice}"{' '}
            <button type="button" className="btn btn-link btn-sm p-0" onClick={takeTheirs}>
              Use theirs
            </button>
          </small>
        )}
        {editor.failed && <small className="form-text text-danger">Could not save the issue</small>}
```

with:

```tsx
        {/* Always rendered: a screen reader announces changes to a region, not one appearing. */}
        <div role="status" data-testid="issue-status">
          {editor.notice !== null && (
            <small className="form-text text-muted">
              Changed by someone else to: "{editor.notice}"{' '}
              <button type="button" className="btn btn-link btn-sm p-0" onClick={takeTheirs}>
                Use theirs
              </button>
            </small>
          )}
          {editor.failed && (
            <small className="form-text text-danger">Could not save the issue</small>
          )}
        </div>
```

Nothing else in the component changes: no state, no effect, no class.

- [ ] **Step 6: Run the case to see it pass, and repeat it**

Run: `npm run build && npx playwright test e2e/room.spec.js -g "announced from one live region" --repeat-each 10`
Expected: 20 passed.

- [ ] **Step 7: Check the format, then the look**

The format comes first, so the look check sees the code as it will be committed.

Run: `npx prettier --check --single-quote --no-semi --print-width 100 --trailing-comma none --arrow-parens avoid frontend/src/components/IssueEditor.tsx e2e/fixtures.js e2e/room.spec.js`
Expected: all files use Prettier code style.

Run: `npm run typecheck && npm run lint`
Expected: no errors.

If any of these needed a fix, rerun Step 6 first. Then run: `npm run build && npx playwright test e2e/look.spec.js`
Expected: 4 passed, against the baseline from Step 1.

Then delete the throwaway files so they are never committed: `rm -rf e2e/look.spec.js e2e/look.spec.js-snapshots`.

- [ ] **Step 8: Run everything**

Run: `npm run test:unit && npx playwright test`
Expected: 83 unit tests and 110 e2e cases passed.

Run: `git status --short`
Expected: exactly the three modified files, no `look.spec.js`.

- [ ] **Step 9: Commit**

```bash
git add frontend/src/components/IssueEditor.tsx e2e/fixtures.js e2e/room.spec.js
git commit -m "feat(frontend): announce the issue editor's notices from one live region (ui refresh step 1a)" -m "The conflict notice and the failed-save line now sit in an always-rendered role=status region, so a screen reader hears them; the look is unchanged. The region helper in fixtures.js proves the element survives each change and that no attribute silences it, for step 4a to reuse."
```

### Task 2: The bites, the hand check, and the status line

**Files:**
- Modify: `docs/superpowers/specs/2026-09-30-ui-refresh-design.md` (step 1a's status line and one accepted cost)
- Possibly modify: `docs/known-issues.md` (only for what Step 2 hears that the spec does not promise)

- [ ] **Step 1: Show the case bites, and run the helper against two more mutations**

For each row, edit the opening tag of the region in `IssueEditor.tsx` (or, for the last row, the outer `div`) as shown, run `npm run build && npx playwright test e2e/room.spec.js -g "announced from one live region" --project chromium`, record where it fails, then `git checkout frontend e2e`. The "Retry still blocked" row edits the case instead. Edit with an editor or a script, not `sed` with `|` as the delimiter: the `key` row contains `|`, and a broken build silently reruns the previous bundle. Check `npm run build` exits 0 each time.

| Mutation | Change | Fails at, in the dry run |
| --- | --- | --- |
| Step 1's product code | (Task 1, Step 4) | `toBeAttached`: `element(s) not found` |
| Test id, no role | `<div data-testid="issue-status">` | `toBeAttached`: `element(s) not found` |
| `aria-live="off"` | `<div role="status" aria-live="off" data-testid="issue-status">` | `expectLiveRegion` after the conflict notice: `aria-live="off"` |
| Re-created per text | ``<div role="status" data-testid="issue-status" key={`${editor.notice}\|${editor.failed}`}>`` | `expectLiveRegion` after the conflict notice: `re-created since markRegion` |
| Retry still blocked | delete `await alice.page.unroute(editIssue)` in the case | `issueEdit` `toBeVisible`: `element(s) not found` |
| By hand: `aria-atomic="false"` | `<div role="status" aria-atomic="false" data-testid="issue-status">` | `expectLiveRegion` after the conflict notice: `aria-atomic="false"` |
| By hand: a busy ancestor | `<div ref={group} className="form-group row" aria-busy="true">` | `expectLiveRegion` after the conflict notice: `aria-busy on <div>` |

The first four rows are the spec's "shown failing" list, and the two "By hand" rows are its "run by hand" pair. "Retry still blocked" shows the last state waits for a finished save. All seven go in the PR's bite table. The `key` row stands for the spec's `key={text}`: the region's text comes from `editor.notice` and `editor.failed`, so the key joins both; `\|` in the table is a plain `|`. Then `npm run build` so `frontend/dist` matches the branch.

- [ ] **Step 2: The screen reader check, by the user**

This step is the user's; an agentic worker stops here and asks for it. It is not a merge gate.

Run `npm run build`, then `SECURE_COOKIES=false sbt run`, as the README's "Running locally" says, and open one room in two browser windows, Alice and Bob, with Orca on and Alice's window in Firefox or Chromium. With Alice editing:
1. Bob saves another issue. Expected: the conflict notice and its "Use theirs" button are heard.
2. In Alice's DevTools, block the request URL `*/edit-issue` (Network, "Block request URL"). Alice clicks Save issue. Record whether "Could not save the issue" is heard, or cut off by the box taking focus back.
3. Alice presses Enter, still blocked: the spec's "failed save by Enter" and "retry" in one. Expected: the region is heard again (spec, Accepted costs).
4. With both notices shown, Alice activates "Use theirs". Record what is heard; some screen readers reread the remaining line.
5. Unblock, press Enter. Expected: silence as the line goes.
6. Alice clicks Edit issue and replaces the text with `PP-9`. Bob edits and saves `PP-8`, then `PP-9`. Expected: the conflict notice is heard, then silence as it goes because the room's issue caught up.

Record the browser and what was heard in each step for the PR body.

- [ ] **Step 3: Record what was heard**

In `docs/superpowers/specs/2026-09-30-ui-refresh-design.md`, under "## Step 1a. The editor's live region", "### Accepted costs", the bullet beginning "A failed save by mouse may go unheard" is replaced by the one of these that matches Step 2's item 2, with `<browser>` filled in:

If the line was heard:

```
- A failed save by mouse was heard in Orca with <browser>, though Save is
  disabled while saving and the editor moves focus back to the box; another
  screen reader may let reading the box cut off the polite line. Enter keeps
  focus.
```

If it was cut off:

```
- A failed save by mouse goes unheard in Orca with <browser>: Save is disabled
  while saving, so the editor moves focus back to the box, and reading the box
  cuts off the polite line. The line stays on screen, and Enter keeps focus.
```

Anything heard in Step 2 that the region's section and the accepted costs do not promise gets its own entry in `docs/known-issues.md` under "## Open", in the shape of "A screen reader hears the connection lost, but never that it came back": `**Where:**`, `**Issue:**`, `**Resolution:**`. If nothing differs, `docs/known-issues.md` is untouched.

- [ ] **Step 4: Mark the step landed, as the PR's last commit**

In the same file, under "## Step 1a. The editor's live region", change:

```
Status: proposed. Branch: `20260930.ui_refresh_1a_editor_live_region`, stacked
on step 1.
```

to:

```
Status: landed. Branch: `20260930.ui_refresh_1a_editor_live_region`, stacked
on step 1.
```

Run: `git status --short`
Expected: only the spec, and `docs/known-issues.md` if Step 3 added an entry; no file under `frontend/` or `e2e/`, so no mutation from Step 1 is left behind.

```bash
git add docs/superpowers/specs/2026-09-30-ui-refresh-design.md docs/known-issues.md
git commit -m "docs: mark ui refresh step 1a landed" -m "The mouse-save accepted cost now records what Orca was heard to say, from the hand check."
```

- [ ] **Step 5: Hand over**

Do not push. Report to the user: the commits, the bite table, the look check's 28 screenshots and their match, and the hand check's browser and findings. The user opens the PR, stacked on step 1's, and merges steps 1, 1a and 1b in one window with no live rooms.
