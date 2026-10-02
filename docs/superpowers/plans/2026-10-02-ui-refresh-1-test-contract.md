# UI Refresh Step 1: Test Contract Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the e2e suite off class names, tags and table structure onto the test contract, give the page the accessible names that contract reads, and pin two principle 8 behaviours, with no visible change.

**Architecture:** The markup gains labels, ARIA names, `aria-pressed`, a hidden description for the unconfirmed card, and `data-testid`s, all on existing elements, so no tag and no class changes. `e2e/fixtures.js` then reads only roles, names, text and test ids, and the spec files' inline selectors follow. Two new cases pin Re-vote to a revealed round and the copy hint's 2 s to its first copy.

**Tech Stack:** React 19, TypeScript, Bootstrap 4.6 classes, `lucide-react` 1.48, Playwright 1.63 (Chromium and Firefox) against the testkit stub.

**Spec:** `docs/superpowers/specs/2026-09-30-ui-refresh-design.md`, "Step 1. Test contract and accessibility" (scope, pass condition, the test contract table and its reasons, commits, accepted costs), and principles 8 and 9. Steps 1a, 1b and after are out of scope.

## How the code in this plan was verified

Every patch below was applied and run in a scratch worktree on 2026-10-02, one commit at a time, on this branch at `7f15d96`:

- **Green at each commit.** After Task 1, `npm run typecheck`, `npm run lint`, `npm run test:unit` (83 tests) and the whole e2e suite with no test changed, 104 of 104 in Chromium and Firefox. After Task 2, 104 of 104. After Task 3, the two new cases passed 20 of 20 over `--repeat-each 5` in both browsers.
- **The greps.** After Task 2, the first grep's only hits are `hit.closest('[role="status"]')` in `slug.spec.js` and `document.querySelector('[role="alert"]')` in `room.spec.js`, both role attribute selectors. The second grep finds nothing.
- **Every attribute bites.** Each attribute Task 1 adds was removed in turn and Chromium's suite run with `--max-failures=1`. The first failing case per removal is recorded in Task 4, Step 3. With the issue box's placeholder removed instead, all 54 Chromium cases passed.
- **Teeth for Task 3.** "Re-vote is offered only while the round is revealed" failed with `Expected: 0, Received: 1` once Re-vote was always rendered. "The copy hint lasts 2 s from the first copy" failed at its final `toBeHidden` once the timer was reset on each copy, and at the 1.99 s `toBeVisible` once the timeout was cut to 1.9 s. The reset mutation failing also shows the fake clock took over the already loaded page: with real timers the hint would have hidden within `toBeHidden`'s 5 s retry.
- **The look.** The throwaway script in Task 4, Step 1 took 16 screenshots on `7f15d96` (four states, two viewports, two browsers), matched itself on a second run, and then matched the spike branch's pixels exactly. With the note's `hidden` removed, the re-vote screenshots failed at both viewports (1280 by 764 against 720, 390 by 1196 against 1172), which is the spec's evidence for the note's `hidden`.
- **Formatting.** Touched files pass `npx prettier --check --single-quote --no-semi --print-width 100 --trailing-comma none --arrow-parens avoid`, except `Deck.tsx`'s `<Lock size={20} />{' '}` line, which Prettier flagged before this step and this plan leaves alone.

## Decisions this plan takes that the spec does not settle

Each is implemented as written unless review changes it.

- **P1. Roles go on the existing `div`s** (`role="region"`, `role="group"`), not on new `section` or `fieldset` tags. A `fieldset` brings a border, padding and a min-width, and keeping every tag keeps "nothing looks different" literally true.
- **P2. Ids come from React's `useId`,** for the name label in `Lobby` and the unconfirmed note in `Deck`. Only one name field and one note render at a time.
- **P3. The unconfirmed note is a `<span hidden>` after the button, inside the card's `col`.** It is outside the button as the spec requires, so it stays out of the card's name, and it is rendered only while the card is unconfirmed.
- **P4. Helper names.** `summaryTable` becomes `results`, and `summaryTable(page).locator('tbody tr')` becomes `tallyEntries(page)`. `mostVoted`, `deck`, `roomIdInput` and `unconfirmedCard` are new. `participantRows` and `participantRow` become `participantEntries` and `participantEntry`, matching `tallyEntries`: after this step they return test-id entries, not table rows, and step 4 may drop the table. The shorter `participant` would shadow the local of that name in the `join` fixture and in "two browsers exchange votes". `votedMark`, `hiddenMark` and `revealedCell` take `entry` for the same reason. `expectSummaryMatchesTable` becomes `expectSummaryMatchesParticipants`, and the 17 comment phrases that say "row" or "table" for an entry or the list say "entry" or "list". The comment on the deck's two layout rows keeps "row", which stays true whatever step 4 does to the tables. `issuePencil` and `issueCheck` become `issueEdit` and `issueSave`, named by action like `issueCancel` rather than by an icon a restyle may swap, and the three test titles and two comments that say "pencil" or "check" say "Edit issue" or "Save issue". `revealedCell` becomes `revealedEstimation`, after its test id, and "...tallies the estimations on the table" becomes "...tallies the estimations it shows". Older plans and the delivered rewrite spec cite the old titles; they stay as written, since they record what was true then. `card` and `vote` stay unscoped, as the spec keeps a card's lookup as it is.
- **P5. The "takes no more votes" comment on `frozenNotice` is reworded,** since `votedMark` and `hiddenMark` now have names and no longer "lack" text to key on.
- **P6. Task 3's cases go at the end of `room.spec.js`.** The Re-vote case joins two participants, since a lone vote completes the round and auto-reveals. It also checks Re-vote is gone again after Clear, which the same mutation catches.
- **P7. The clock is paused at `Date.now() + 2000`,** two seconds past the test runner's real time, which stays far below `STALE_MS` (35 s).
- **P8. Commit subjects end with "(ui refresh step 1)",** as step 8b's ended with "(step 8b)".
- **P9. This plan lands in its own `docs` commit,** first on the branch after the design commit, as the 8b plan did.
- **P10. The spec's status line becomes `Status: landed. Branch: ...`** in the last commit, matching the rewrite spec's "landed".

## Global Constraints

- No em dash anywhere: code, comments, docs, commit messages and the PR body.
- Code comments are one or two lines, never more.
- Conventional Commits, and no generated-with or co-authored-by attribution line.
- TypeScript and JavaScript: single quotes, no semicolons, print width 100, no trailing commas, `arrow-parens avoid`.
- Nothing looks different: no class, tag, style or CSS changes in product code.
- Copy, verbatim: "User name", "Room id", "Current issue", "Estimation cards", "Previous vote, not confirmed", "Voted", "Vote hidden", "Participants", "Results".
- Test ids, verbatim: `participant`, `participant-estimation`, `tally-entry`, `tally-value`, `tally-count`, `most-voted`.
- Tasks 2 and 3 change no product code.
- The e2e suite must never contact a host other than `127.0.0.1`.
- The unit counts assume `target/contract/` exists from an earlier `sbt test`; without it `snapshot.contract.test.ts` fails with "run sbt test first".
- Frontend-only changes need `npm run build` before `npx playwright test`; `npm run e2e` builds and stages everything.
- Do not push or merge: steps 1, 1a and 1b merge in one window with no live rooms (spec, "Order"; every merge to main restarts the server).

## Review Focus

The inputs most likely to bite a person that the spec leaves unsaid, most likely first.

1. **A screen reader on the deck.** Expected: a card reads "5, toggle button, pressed" once confirmed, "not pressed" otherwise, and the unconfirmed card adds "Previous vote, not confirmed" once, not twice. No automated test can hear it. Task 4, Step 4 checks the accessibility tree in Firefox's Accessibility inspector or Chromium's Accessibility pane, and the PR says which.
2. **The phone viewport.** Expected: the named regions and the hidden note change nothing at 390 px. Pinned by the look check's phone screenshots in Task 4, Step 1.
3. **Firefox's accessible-name computation.** Expected: `getByRole` with `description` and `pressed` behaves as in Chromium. Pinned by running the whole suite in both projects in Tasks 2 and 3.
4. **A participant whose name contains "Voted" or "Vote hidden".** Expected: the marks are still told apart, since they are read by the icon's role and name, not the entry's text. No case needed: `getByRole('img', ...)` never matches the name cell's text.
5. **The lobby's two tabs.** Expected: `getByLabel('User name')` finds one field on either tab, since only one tab's body renders. Pinned by `lobby.spec.js`, which runs both the Create and Join paths.

---

### Before Task 1: commit this plan

```bash
git add docs/superpowers/plans/2026-10-02-ui-refresh-1-test-contract.md
git commit -m "docs: plan ui refresh step 1"
```

### Task 1: The markup carries the contract's names

**Files:**
- Modify: `frontend/src/components/Deck.tsx`
- Modify: `frontend/src/components/Participants.tsx`
- Modify: `frontend/src/components/Results.tsx`
- Modify: `frontend/src/components/Lobby.tsx`
- Modify: `frontend/src/components/IssueEditor.tsx`

**Interfaces:**
- Produces, for Task 2: a `role="group"` named "Estimation cards" around the cards; every card with `aria-pressed` `"true"` or `"false"`; the unconfirmed card with the description "Previous vote, not confirmed"; `role="region"` named "Participants" with `participant` entries, `img`s named "Voted" and "Vote hidden", and `participant-estimation`; `role="region"` named "Results" with `tally-entry`, `tally-value`, `tally-count` and `most-voted`; the name input labelled "User name"; the issue box named "Current issue".

This task adds no test: the spec judges it by the existing suite staying green unchanged, which shows the markup alone changes nothing the suite checks. Task 2 reads every attribute, and Task 4 shows each one bites.

- [ ] **Step 1: Name the deck, its pressed card and the unconfirmed note**

In `frontend/src/components/Deck.tsx`, add the import above the `lucide-react` one:

```tsx
import { useId } from 'react'
```

At the top of `Deck`, before `cardClass`:

```tsx
  const noteId = useId()
  const unconfirmed = (e: string) => e === view.userEstimation && !view.ownVoteConfirmed
```

Replace the cards' row and button with:

```tsx
        <div className="row" role="group" aria-label="Estimation cards">
          {estimationValues.map(e => (
            <div className="col" key={e}>
              <button
                type="button"
                className={cardClass(e)}
                aria-pressed={e === view.userEstimation && view.ownVoteConfirmed}
                aria-describedby={unconfirmed(e) ? noteId : undefined}
                disabled={view.votesRevealed}
                onClick={() => onVote(e)}
              >
                {e}
              </button>
              {unconfirmed(e) && (
                <span id={noteId} hidden>
                  Previous vote, not confirmed
                </span>
              )}
            </div>
          ))}
        </div>
```

React renders `aria-pressed={false}` as `aria-pressed="false"`, which the spec requires on every other card.

- [ ] **Step 2: Name the participants and their marks**

In `frontend/src/components/Participants.tsx`, the outer `div` becomes:

```tsx
    <div className="row mt-4" role="region" aria-label="Participants">
```

and the body row becomes:

```tsx
              <tr key={u.id} data-testid="participant">
                <td>{u.voted && <CircleCheckBig size={20} role="img" aria-label="Voted" />}</td>
                <td>{u.name}</td>
                <td>
                  {u.hasEstimation && !view.votesRevealed && (
                    <ShieldOff size={20} role="img" aria-label="Vote hidden" />
                  )}
                  {view.votesRevealed && (
                    <div data-testid="participant-estimation">{u.estimation}</div>
                  )}
                </td>
              </tr>
```

lucide-react sets `aria-hidden="true"` only on an icon with no `aria-*`, `role` or `title` prop, so these two are exposed.

- [ ] **Step 3: Name the results and their fields**

In `frontend/src/components/Results.tsx`, the outer `div` becomes:

```tsx
    <div className="row mt-4" role="region" aria-label="Results">
```

the most voted value becomes:

```tsx
              <div className="estimation-text" data-testid="most-voted">
                {view.votesSummary[0][0]}
              </div>
```

and the tally row becomes:

```tsx
              <tr key={estimation} data-testid="tally-entry">
                <td data-testid="tally-value">{estimation}</td>
                <td data-testid="tally-count">{count}</td>
              </tr>
```

- [ ] **Step 4: Label the name field and name the issue box**

In `frontend/src/components/Lobby.tsx`, the import becomes:

```tsx
import { useId, type KeyboardEvent, type MouseEvent } from 'react'
```

After the props are destructured (`} = props`):

```tsx
  const nameId = useId()
```

and `nameRow`'s label and input open as:

```tsx
      <label htmlFor={nameId} className="col-sm-3 col-form-label">
        User name
      </label>
      <div className="col-sm-9">
        <input
          id={nameId}
          type="text"
```

In `frontend/src/components/IssueEditor.tsx`, below `placeholder="Current issue"`:

```tsx
            aria-label="Current issue"
```

- [ ] **Step 5: Run the checks and the unchanged suite**

Run: `npm run typecheck && npm run lint && npm run test:unit`
Expected: no errors, 83 tests pass.

Run: `npm run e2e`
Expected: 104 passed, with no file under `e2e/` changed.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components
git commit -m "feat(frontend): name the page's controls and regions for the test contract (ui refresh step 1)"
```

---

### Task 2: The suite reads only the contract

**Files:**
- Modify: `e2e/fixtures.js` (the helpers below `export const test`)
- Modify: `e2e/room.spec.js`, `e2e/session.spec.js`, `e2e/lobby.spec.js`, `e2e/slug.spec.js`

**Interfaces:**
- Consumes: Task 1's names and test ids.
- Produces, in `e2e/fixtures.js`: `nameInput(page)`, `roomIdInput(page)`, `issueBox(page)`, `issueEdit(page)`, `issueSave(page)`, `results(page)`, `tallyEntries(page)`, `mostVoted(page)`, `participantEntries(page)`, `participantEntry(page, name)`, `votedMark(entry)`, `hiddenMark(entry)`, `revealedEstimation(entry)`, `deck(page)`, `ownEstimation(page)`, `unconfirmedCard(page)`, and `expectSummaryMatchesParticipants(page)`, each returning a Playwright `Locator` except the last. `summaryTable`, `issuePencil`, `issueCheck` and `revealedCell` are removed. Task 3 uses `vote` and `ownEstimation`.

- [ ] **Step 1: Rewrite the fixture helpers**

In `e2e/fixtures.js`, replace everything from the `// Step 8 revisits selectors` comment down to and including `ownEstimation`'s definition with:

```js
// The test contract: roles, names, text and test ids only (ui refresh design, step 1).
export const nameInput = page => page.getByLabel('User name')
export const roomIdInput = page => page.getByLabel('Room id')
export const issueBox = page => page.getByRole('textbox', { name: 'Current issue' })
export const issueEdit = page => page.getByRole('button', { name: 'Edit issue' })
export const issueSave = page => page.getByRole('button', { name: 'Save issue' })
export const issueCancel = page => page.getByRole('button', { name: 'Cancel editing' })
export const results = page => page.getByRole('region', { name: 'Results' })
export const tallyEntries = page => results(page).getByTestId('tally-entry')
export const mostVoted = page => results(page).getByTestId('most-voted')
export const participantEntries = page =>
  page.getByRole('region', { name: 'Participants' }).getByTestId('participant')
// not.toContainText needs exactly one match: zero fails as element(s) not found and two as a
// strict mode violation, so an entry assertion cannot pass vacuously and needs no existence pin.
export const participantEntry = (page, name) => participantEntries(page).filter({ hasText: name })
export const votedMark = entry => entry.getByRole('img', { name: 'Voted' })
export const hiddenMark = entry => entry.getByRole('img', { name: 'Vote hidden' })
// Rendered only while the round is revealed, so it is the one signal a reveal landed in a room
// where nobody has voted and the value is empty.
export const revealedEstimation = entry => entry.getByTestId('participant-estimation')
// Any alert, for asserting a reconnect cleared the banner: filtering by text would report
// hidden when it merely switched to the "session has ended" message a refused page shows.
export const connectionAlert = page => page.getByRole('alert')
// The banner specifically, so a page that stopped at the ended-session message is not a blip.
export const connectionLost = page =>
  page.getByRole('alert').filter({ hasText: 'Connection to the room was lost' })
// Two renderings of one set, so a revealed round shows the same estimations in both. Compared as
// multisets: the order of a tie is undecided, and pinning it here would choose a rule nobody has.
export const expectSummaryMatchesParticipants = async page => {
  // Two empty renderings agree trivially, so this gate is what makes the comparison mean
  // anything, and being retrying it also settles the DOM before the reads below, which are not.
  await expect(tallyEntries(page)).not.toHaveCount(0)
  const tally = {}
  for (const entry of await participantEntries(page).all()) {
    const estimation = (await revealedEstimation(entry).innerText()).trim()
    if (estimation !== '') tally[estimation] = (tally[estimation] || 0) + 1
  }
  const summary = []
  for (const entry of await tallyEntries(page).all()) {
    const value = await entry.getByTestId('tally-value').innerText()
    const count = await entry.getByTestId('tally-count').innerText()
    summary.push([value.trim(), Number(count.trim())])
  }
  expect(summary.sort()).toEqual(Object.entries(tally).sort())
}
// A card by its face value, for asserting its state rather than pressing it.
export const card = (page, value) => page.getByRole('button', { name: value, exact: true })
export const deck = page => page.getByRole('group', { name: 'Estimation cards' })
export const vote = (page, value) => card(page, value).click()
// The line under the deck that says why the cards are frozen, keyed on its text rather than
// its lock icon.
export const frozenNotice = page => page.getByText('The round is revealed')
// The recipient's own confirmed estimation, read as the pressed card rather than the large one.
export const ownEstimation = page => deck(page).getByRole('button', { pressed: true })
// After a Re-vote the cast card is not pressed but keeps this description.
export const unconfirmedCard = page =>
  deck(page).getByRole('button', { description: 'Previous vote, not confirmed' })
```

`movedBanner`, `restartNotice` and `export { expect }` below stay as they are. The third-column guard in what was `expectSummaryMatchesTable` is dropped as the spec says: a new field would need a test id, which is a contract change.

- [ ] **Step 2: Rename the results and participant helpers in the spec files**

Run:

```bash
perl -0pi -e "s/summaryTable\((\w+(?:\.page)?)\)\.locator\('tbody tr'\)/tallyEntries(\1)/g; s/summaryTable\(/results(/g; s/  summaryTable,\n/  results,\n  tallyEntries,\n/" e2e/room.spec.js e2e/session.spec.js
grep -c "tallyEntries(" e2e/room.spec.js e2e/session.spec.js
grep -c "results(" e2e/room.spec.js e2e/session.spec.js
```

Expected: `tallyEntries(` 4 in `room.spec.js` and 7 in `session.spec.js`; `results(` 18 and 10. `grep -n summaryTable e2e/` finds nothing.

Then run:

```bash
perl -pi -e 's/\bparticipantRows\b/participantEntries/g; s/\bparticipantRow\b/participantEntry/g' e2e/*.spec.js
grep -c "participantEntries(" e2e/room.spec.js e2e/session.spec.js
grep -c "participantEntry(" e2e/room.spec.js e2e/session.spec.js e2e/refusal.spec.js e2e/smoke.spec.js
```

Expected: `participantEntries(` on 17 lines in `room.spec.js` and 1 in `session.spec.js`; `participantEntry(` on 45, 6, 2 and 1 lines (`grep -c` counts lines, and the import lines carry no parenthesis). `grep -rnE "participantRows?\b" e2e/` finds nothing.

Then rename the summary check and reword the comments. The script fails on any phrase it does not find exactly once:

```bash
perl -pi -e 's/\bexpectSummaryMatchesTable\b/expectSummaryMatchesParticipants/g' e2e/*.spec.js
python3 - <<'PY'
import sys
subs = {
 'e2e/session.spec.js': [
  ('counts rows first', 'counts entries first'),
  ('where the table and the summary', 'where the list and the summary'),
  ('the cleared table proves', 'the cleared list proves'),
  ('One row and one row only', 'One entry and one entry only'),
  ('a stale table.', 'a stale list.'),
 ],
 'e2e/room.spec.js': [
  ('the row still has one', 'the entry still has one'),
  ("Carol's row proves", "Carol's entry proves"),
  ('passes on a row that', 'passes on an entry that'),
  ('Her own table is empty', 'Her own list is empty'),
  ('render four rows here', 'render four entries here'),
  ('was a row of its own', 'was an entry of its own'),
  ('so the table shows both', 'so the list shows both'),
  ('beside that table', 'beside that list'),
  ('so her row for', 'so her entry for'),
  ("on Alice's row,", "on Alice's entry,"),
  ("Bob's own row going", "Bob's own entry going"),
  ('since his row', 'since his entry'),
 ],
}
for f, pairs in subs.items():
    s = open(f).read()
    for a, b in pairs:
        n = s.count(a)
        if n != 1: sys.exit(f'{f}: {a!r} found {n} times')
        s = s.replace(a, b)
    open(f, 'w').write(s)
PY
perl -pi -e 's/\bissuePencil\b/issueEdit/g; s/\bissueCheck\b/issueSave/g; s/\brevealedCell\b/revealedEstimation/g; s/still tallies the estimations on the table/still tallies the estimations it shows/' e2e/*.spec.js
python3 - <<'PY'
import sys
pairs = [
 ('readonly until the pencil is pressed', 'readonly until Edit issue is pressed'),
 ('committed with the check button reaches', 'committed with the Save issue button reaches'),
 ('// The pencil focuses the box', '// Edit issue focuses the box'),
 ('a double-clicked check posts once', 'a double-clicked Save issue posts once'),
 ('// The disabled check dropped focus', '// The disabled Save issue dropped focus'),
]
f = 'e2e/room.spec.js'
s = open(f).read()
for a, b in pairs:
    n = s.count(a)
    if n != 1: sys.exit(f'{f}: {a!r} found {n} times')
    s = s.replace(a, b)
open(f, 'w').write(s)
PY
grep -rniE "//.*\b(rows?|tables?)\b" e2e/
grep -rniE "pencil|\bcheck (button|posts|dropped)|\bcells?\b|on the table" e2e/
```

Expected: the `rows?|tables?` grep prints only `room.spec.js`'s two lines in "the reveal notice claims its space before the reveal" ("Two rows, since a reveal adds the notice..." and "...the notice's row also sizes the estimation card"), which mean layout rows. The `pencil|check` grep prints nothing. `grep -rnE "expectSummaryMatchesTable|issuePencil|issueCheck|revealedCell" e2e/` finds nothing.

- [ ] **Step 3: Read the most voted value by its test id**

In `e2e/session.spec.js`, replace:

```js
  // Scoped to the card: .estimation-text is also every revealed cell in the table.
  await expect(bob.page.locator('.summary-card .estimation-text')).toHaveText('5')
```

with:

```js
  await expect(mostVoted(bob.page)).toHaveText('5')
```

and add `mostVoted,` to its import list, above `results,`.

- [ ] **Step 4: Read the re-vote case's cards by state, and check the confirmed state**

In `e2e/room.spec.js`, in "a re-vote leaves the caster shown as selected but unconfirmed", replace:

```js
  const selected = alice.page.locator('.estimation-button-selected')
  const unconfirmed = alice.page.locator('.estimation-button-uncomfirmed')

  await vote(alice.page, '5')
  await expect(selected).toHaveText('5')
```

with:

```js
  const selected = ownEstimation(alice.page)
  const unconfirmed = unconfirmedCard(alice.page)

  await vote(alice.page, '5')
  await expect(selected).toHaveText('5')
  await expect(unconfirmed).toHaveCount(0)
  // The role filter pressed: false would also match a card with no aria-pressed at all.
  await expect(card(alice.page, '3')).toHaveAttribute('aria-pressed', 'false')
```

The rest of the case is unchanged. Change the import list's last entry from `  restartNotice` to `  restartNotice,` followed by `  unconfirmedCard`.

- [ ] **Step 5: Read the room id field by its label**

In `e2e/lobby.spec.js`, replace both `page.locator('#join-roomId')` with `roomIdInput(page)`, and make the import:

```js
import { test, expect, nameInput, roomIdInput } from './fixtures.js'
```

In `e2e/slug.spec.js`, replace `page.locator('#join-roomId')` with `roomIdInput(page)`, and make the import:

```js
import {
  test,
  expect,
  deck,
  movedBanner,
  nameInput,
  ownEstimation,
  roomIdInput,
  vote
} from './fixtures.js'
```

- [ ] **Step 6: Count the cards before the banner's hit test**

In `e2e/slug.spec.js`, replace:

```js
  const covered = await page.$$eval('.estimation-button', buttons =>
```

with:

```js
  const cards = deck(page).getByRole('button')
  // Counted first, so the hit test below cannot pass on no cards at all.
  await expect(cards).toHaveCount(13)
  const covered = await cards.evaluateAll(buttons =>
```

The callback body is unchanged; its `hit.closest('[role="status"]')` is a role attribute selector.

- [ ] **Step 7: Run the pass condition's greps**

Run:

```bash
grep -nE "locator\(|\\\$eval|\\\$\\\$eval|querySelector|closest\(" e2e/
grep -nE "'(table|rowgroup|row|columnheader|cell)'" e2e/
```

Expected: the first prints exactly `slug.spec.js`'s `hit.closest('[role="status"]')` and `room.spec.js`'s `document.querySelector('[role="alert"]')`; the second prints nothing. Paste both outputs into the PR body.

- [ ] **Step 8: Format, lint and run the suite**

Run: `npx prettier --check --single-quote --no-semi --print-width 100 --trailing-comma none --arrow-parens avoid e2e/*.js && npx eslint e2e`
Expected: clean.

Run: `npx playwright test`
Expected: 104 passed.

- [ ] **Step 9: Commit**

```bash
git add e2e
git commit -m "test(e2e): read the page through the test contract only (ui refresh step 1)"
```

---

### Task 3: Re-vote and the copy hint are pinned

**Files:**
- Modify: `e2e/room.spec.js` (two cases appended at the end)

**Interfaces:**
- Consumes: `vote` and `ownEstimation` from Task 2's `e2e/fixtures.js`, both already imported in `room.spec.js`.

- [ ] **Step 1: Write the two cases**

Append to `e2e/room.spec.js`:

```js

// The server's re-vote has no guard, so one click during voting would unconfirm every vote.
test('Re-vote is offered only while the round is revealed', async ({ join }) => {
  const alice = await join('Alice')
  await join('Bob')
  const reVote = alice.page.getByRole('button', { name: 'Re-vote' })

  await vote(alice.page, '5')
  await expect(ownEstimation(alice.page)).toHaveText('5')
  await expect(reVote).toHaveCount(0)
  await alice.page.getByRole('button', { name: 'Show votes' }).click()
  await expect(reVote).toBeVisible()
  await alice.page.getByRole('button', { name: 'Clear votes' }).click()
  await expect(reVote).toHaveCount(0)
})

test('the copy hint lasts 2 s from the first copy, not the last', async ({ join }) => {
  const alice = await join('Alice')
  const page = alice.page
  const copy = page.getByRole('link', { name: 'Copy link' })
  // By its text, so step 4's move to a status region breaks no lookup.
  const hint = page.getByText('Link copied to clipboard')
  // Paused just after real time: the tick's heartbeat was heard on the real clock.
  await page.clock.install()
  await page.clock.pauseAt(Date.now() + 2000)

  await copy.click()
  await expect(hint).toBeVisible()
  await page.clock.runFor(1500)
  await copy.click()
  await expect(hint).toBeVisible()
  await page.clock.runFor(490)
  await expect(hint).toBeVisible()
  await page.clock.runFor(10)
  await expect(hint).toBeHidden()
})
```

The fixture joins before `install`, so `connection.ts`'s tick stays a real interval. A fixed date for `pauseAt` would put the paused `Date.now` far from the heartbeat heard on the real clock, and a gap of `STALE_MS` reconnects mid-case.

- [ ] **Step 2: Run them, repeated**

Run: `npx playwright test e2e/room.spec.js -g "Re-vote is offered|copy hint" --repeat-each 5`
Expected: 20 passed.

- [ ] **Step 3: Show each failing against its mutation**

Each mutation is applied, built and reverted; none is committed.

Re-vote always rendered: in `frontend/src/components/Controls.tsx`, change `{revealed && (` to `{(`.

Run: `npm run build && npx playwright test e2e/room.spec.js --project chromium -g "Re-vote is offered"; git checkout frontend`
Expected: FAIL at the first `toHaveCount(0)` with `Expected: 0` and `Received: 1`.

The timer reset on each copy: in `frontend/src/components/App.tsx`'s `onCopied`, replace the `window.setTimeout(...)` line with:

```tsx
    window.clearTimeout((window as any).copyTimer)
    ;(window as any).copyTimer = window.setTimeout(() => setCopied(false), 2000)
```

Run: `npm run build && npx playwright test e2e/room.spec.js --project chromium -g "copy hint"; git checkout frontend`
Expected: FAIL at the final `toBeHidden` with `Received: visible`.

An early clear: change `2000` to `1900` in the same `setTimeout`.

Run the same command.
Expected: FAIL at the 1.99 s `toBeVisible` with `element(s) not found`.

Then run `npm run build` once more so `frontend/dist` matches the branch. Record the three failures in the PR body.

- [ ] **Step 4: Run the whole suite**

Run: `npx playwright test`
Expected: 108 passed.

- [ ] **Step 5: Commit**

```bash
git add e2e/room.spec.js
git commit -m "test(e2e): pin Re-vote to a revealed round and the copy hint to its first copy (ui refresh step 1)"
```

---

### Task 4: The look, the bites, and the status line

**Files:**
- Throwaway, never committed: `e2e/look.spec.js` and `e2e/look.spec.js-snapshots/`, in a worktree of the base commit and on the branch
- Modify: `docs/superpowers/specs/2026-09-30-ui-refresh-design.md` (step 1's status line only)

- [ ] **Step 1: Check the look against the base commit**

Create a worktree of the design commit, sharing the branch's staged app:

```bash
git worktree add --detach ../pp-base 7f15d96
ln -s "$PWD/node_modules" ../pp-base/node_modules
ln -s "$PWD/target" ../pp-base/target
```

Write `../pp-base/e2e/look.spec.js`:

```js
// Throwaway, never committed: the four states at two viewports, compared main against branch.
import { test, expect } from './fixtures.js'

const sizes = { default: null, phone: { width: 390, height: 844 } }
// The room id is random per run, so it is masked wherever it shows.
const shot = (page, size, name) =>
  expect(page).toHaveScreenshot(`${size}-${name}.png`, {
    fullPage: true,
    mask: [page.getByRole('heading', { level: 5 }), page.getByLabel('Room id')]
  })

// One participant, since two would sort by random id: a lone vote reveals, which shows the
// voted mark, and the Re-vote then shows the hidden-vote mark and the unconfirmed card.
for (const [size, viewport] of Object.entries(sizes)) {
  test(`look at ${size}`, async ({ page, origin, join }) => {
    if (viewport) await page.setViewportSize(viewport)
    await page.goto(`${origin}/`)
    await expect(page.getByRole('button', { name: 'Create' })).toBeVisible({ timeout: 15_000 })
    await shot(page, size, 'lobby')

    const alice = await join('Alice')
    const p = alice.page
    if (viewport) await p.setViewportSize(viewport)
    await shot(p, size, 'before-reveal')
    await p.getByRole('button', { name: '5', exact: true }).click()
    await expect(p.getByRole('button', { name: 'Re-vote' })).toBeVisible()
    await shot(p, size, 'after-reveal')
    await p.getByRole('button', { name: 'Re-vote' }).click()
    await expect(p.locator('.estimation-button-uncomfirmed')).toHaveText('5')
    await shot(p, size, 're-vote')
  })
}
```

It reads classes because it must run unchanged on the base commit, and it is never committed.

Run, in `../pp-base`: `npm run build && npx playwright test e2e/look.spec.js --update-snapshots && npx playwright test e2e/look.spec.js`
Expected: 16 screenshots written, then 4 passed, so the baseline is stable.

Run, on the branch: `npm run build && cp ../pp-base/e2e/look.spec.js e2e/ && cp -r ../pp-base/e2e/look.spec.js-snapshots e2e/ && npx playwright test e2e/look.spec.js`
Expected: 4 passed, pixel-identical at both viewports in both browsers.

- [ ] **Step 2: Show the re-vote screenshot guards the note's `hidden`**

In `frontend/src/components/Deck.tsx`, change `<span id={noteId} hidden>` to `<span id={noteId}>`.

Run: `npm run build && npx playwright test e2e/look.spec.js; git checkout frontend && npm run build`
Expected: FAIL on the re-vote screenshots at both viewports, the page taller by the note's line.

Then remove the throwaway files and the worktree:

```bash
rm -rf e2e/look.spec.js e2e/look.spec.js-snapshots test-results
git worktree remove --force ../pp-base
git status --short
```

Expected: `git status` shows nothing.

- [ ] **Step 3: Show every attribute bites**

For each row, remove the attribute from the branch tip, `npm run build`, run `npx playwright test --project chromium --max-failures=1`, record the first failing case, and `git checkout frontend`. The spike's results, for the PR body:

| Removed | First failing case |
| --- | --- |
| `htmlFor` on the name label | `refusal.spec.js` "a session ended by a restart rejoins under its name, with the restart notice" |
| `id` on the name input | the same |
| The issue box's placeholder, `aria-label` kept | none: 54 passed, so the `aria-label` carries the name |
| `role="group"` on the deck | `room.spec.js` "two tabs on one room are one participant" |
| `aria-label="Estimation cards"` | the same |
| `aria-pressed` | the same |
| `aria-pressed="false"`, as `\|\| undefined` | `room.spec.js` "a re-vote leaves the caster shown as selected but unconfirmed" |
| `aria-describedby` | the same |
| The note's `id` | the same |
| `aria-label="Voted"`, `role="img"` kept | `room.spec.js` "two browsers exchange votes" |
| `aria-label="Vote hidden"`, `role="img"` kept | `room.spec.js` "a cast vote is withheld, shown on the reveal, and withheld again on a re-vote" |
| `role="region"` on Participants | `room.spec.js` "two browsers exchange votes" |
| `aria-label="Participants"` | the same |
| `participant` | the same |
| `participant-estimation` | `room.spec.js` "a re-vote re-arms the auto-reveal, and the last vote fires it" |
| `role="region"` on Results | `room.spec.js` "two browsers exchange votes" |
| `aria-label="Results"` | the same |
| `tally-entry` | `room.spec.js` "a re-vote re-arms the auto-reveal, and the last vote fires it" |
| `tally-value` | the same |
| `tally-count` | the same |
| `most-voted` | `session.spec.js` "a session of rounds keeps the summary honest across them" |

The note's `hidden` is shown by Step 2 instead, since no locator reads it. Then `npm run build` so `frontend/dist` matches the branch.

- [ ] **Step 4: Check the accessibility tree by hand**

Run `npm run build`, then `SECURE_COOKIES=false sbt run`, as the README's "Running locally" says, and open a room in Firefox's Accessibility inspector, or Chromium's DevTools Accessibility pane. Check:
- a confirmed card is a toggle button, pressed, and every other card not pressed;
- after a Re-vote the cast card is not pressed and its description is "Previous vote, not confirmed", and the note appears nowhere else in the tree;
- the check and shield icons are images named "Voted" and "Vote hidden".

Record which browser was checked in the PR body. A screen reader is not required.

- [ ] **Step 5: Run everything once more**

Run: `npm run typecheck && npm run lint && npm run test:unit && npm run e2e`
Expected: no errors, 83 unit tests, 108 e2e cases passed.

- [ ] **Step 6: Mark the step landed, as the PR's last commit**

In `docs/superpowers/specs/2026-09-30-ui-refresh-design.md`, under "## Step 1. Test contract and accessibility", change:

```
Status: proposed. Branch: `20260930.ui_refresh_1_test_contract`.
```

to:

```
Status: landed. Branch: `20260930.ui_refresh_1_test_contract`.
```

```bash
git add docs/superpowers/specs/2026-09-30-ui-refresh-design.md
git commit -m "docs: mark ui refresh step 1 landed"
```

- [ ] **Step 7: Hand over**

Do not push. Report to the user: the commits, the two greps' output, each selector change with its reason (Task 2's helpers and steps), the bite table, the three Task 3 mutations, the look check, and the hand check's browser. The user opens the PR and merges steps 1, 1a and 1b in one window with no live rooms.
