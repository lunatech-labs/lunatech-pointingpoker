# UI Refresh Step 1c: Test Contract Audit, Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rewrite every e2e case that reaches its behaviour through Show votes, Clear votes, a "Voted" mark on a revealed entry, a hidden Results region or the rejoin link's word order, so that steps 4 and 5 can change which controls show without touching them.

**Architecture:**
- `e2e/` changes, and one product line: the test id `room` on the room view's root, the room's marker, which the new fixture `inRoom` reads as the sign a join reached the room. A new case holds the marker to its rule.
- Each task rewrites one kind of incidental read, runs its cases green on today's page, commits, then shows each rewritten read failing against a mutation that is built, run and reverted, never committed.
- Three forward simulations apply what steps 4, 5 and 3b4 will change to today's page: Show hidden while revealed, Clear removed, and 3b4's rejoin name. They prove the step's purpose, and none is committed.
- The last task records the completed list in the UI refresh design and the design reference.

**Tech Stack:** Playwright 1.63 (Chromium and Firefox) against the testkit stub; React 19 and Vite for the mutations' rebuilds.

**Spec:** `docs/superpowers/specs/2026-09-30-ui-refresh-design.md`, "Step 1c. Test contract audit", whose pass condition is in the steps table: "Every case passing on today's page, each rewritten one shown to fail". Also the 1c lines of `docs/superpowers/specs/2026-10-09-ui-refresh-3b1-wide-room-page-design.md` ("Contract changes for step 4", the nobody-voted case) and `docs/superpowers/specs/2026-10-19-ui-refresh-3b4-lobby-design.md` ("Contract", the rejoin link), and the reference's "Contract reads the look keeps" (`docs/design/ui-reference.md`).

## How this plan was verified

Every rewrite below was applied uncommitted on this branch, stacked on #454 (3b4), on 2026-10-20, then reverted. The whole suite passed in Chromium and Firefox, and Prettier was clean. Every mutation and simulation gave the result its task's Expected line states, in Chromium. With Task 4's new traffic deleted, the pruned and grace cases failed at their 20 s removal waits, so the traffic is load-bearing. Before any rewrite, Show hidden while revealed failed exactly the cases the umbrella's first item names.

## Rulings this plan makes, for the user's review

- **R1. The room's marker is the sign a join reached the room** (the user's choice of 2026-10-20). The umbrella's 1c section names "Leave or the role line", but 3b2 put both behind ☰ below 51.75 rem, where 'an old UUID link opens its derived room under a banner that covers no card' joins. The room id heading was set aside: a lobby giving the id a heading would pass it before the join. Edit issue and the round region were weighed too; the region does not exist on today's page. `data-testid="room"` on `Room`'s root renders exactly when Show votes did, on the first snapshot. Its rule (on what renders from a snapshot, never on a look drawn while joining) rests on a convention, so the new case "the room's marker waits for the first snapshot" holds it, with the stream held open until the read. The reference's contract reads state the rule once; the umbrella's 1c section and the reference's log record the reopened choice.
- **R2. Traffic is a publish another page reads.** Clear clicked to send traffic becomes `setIssue`, read on the other page's issue box, as `stragglerDepartsWithVotesHidden` already does ("Edits, not votes"). Where only the sender's page is live (the grace case before its reconnect), a second vote with another value, read on the sender's deck, is the second write; that leaves Alice voted, so the same case's later frame becomes an issue edit too. In the draft case Alice's own box holds her draft, so the publish she reads is Carol joining. Step 4 rewrites the issue box's reads while viewing (3b1's Contract), so these follow with the rest.
- **R3. The rejoin link is found by the room id, or "your last room", and its text read for "as Alice"** (the user's choice of 2026-10-20, from 3b4's Contract).
- **R4. Two rewrites are shown failing through `join`, not on their own line.** `newTab`'s wait reads the same locator as `join`'s, and every case using it joins first. The roles case's Show votes line is deleted, not rewritten, since `joinedAs` on the next line already waits for the room view.

## Global Constraints

**Branch and commits:**
- Branch `20260930.ui_refresh_1c_test_contract_audit`, stacked on #454 (3b4). New commits only: no amend, rebase or force-push. Nothing is pushed until the user asks.
- Commit subjects, verbatim, in Conventional Commits:
  - Task 0: `docs: plan the test contract audit (ui refresh step 1c)`
  - Task 1: `test(e2e): mark the room view and wait for it as the sign a join reached the room (ui refresh step 1c)`
  - Task 2: `test(e2e): find the rejoin link by its room id and name, in either order (ui refresh step 1c)`
  - Task 3: `test(e2e): read a revealed round without Show votes or the voted mark (ui refresh step 1c)`
  - Task 4: `test(e2e): send traffic and hold focus without Clear votes (ui refresh step 1c)`
  - Task 5: `docs: record step 1c's completed list in the ui refresh design and the reference`
- No "Generated with Claude Code" or co-author line.

**Code:**
- No product code changes but Task 1's `data-testid="room"`. A mutation touches only `frontend/src/` and is reverted with `git checkout -- <that file>`, except Task 4's traffic check, which edits the committed `e2e/room.spec.js` and restores it the same way. A mutation never runs against uncommitted work.
- Comments are one or two lines; a rewrite merging two comments keeps the result at two.
- JavaScript style: `npx prettier --check --single-quote --no-semi --print-width 100 --trailing-comma none --arrow-parens avoid e2e/*.js` passes.
- The test contract reads roles, names, text and test ids only (`e2e/fixtures.js`, principle 9).

**Running:**
- Once per session before any e2e run: `npm run pree2e` (builds the page and stages the app).
- A mutation needs `npm run build` before its run, and again after its revert. The staged app serves `frontend/dist`, so no restage.
- Mutation runs are Chromium only: `npx playwright test --project=chromium -g '<title regex>'`. Green runs are both browsers.

**Writing:** cite symbols and case titles, never line numbers; no counts of commits, edits, items or lines in docs; no em dash. The 3b1 and 3b4 specs are delivered and stay as written: their "step 1c rewrites" and "step 1c may re-frame" stay true as a record.

## Review Focus

1. **A room view that renders blank.** `inRoom` proves the view mounted, not that it shows anything. Cases that stop right after joining, such as 'Enter in the name field creates a room', would pass on a blank view; every case that reads content after joining would fail. Accepted with the marker (R1).
2. **What the marker's case holds.** It reads no marker when the `/events` request is seen, which today follows the join request's answer, so a look drawn on the press has rendered by then. A look drawn only once the join answers commits about when the stream opens, so the case catches it by timing alone; a join that opened the stream first would let the read run early. The case's comment states the assumption.
3. **A rejoin lookup by substring.** `getByRole('link', { name: room })` matches any link whose name contains the room id. At `/` the rejoin row is the only one; step 4 keeps it so.

---

### Task 0: Commit the plan

- [ ] **Step 1: Commit**

```bash
git add docs/superpowers/plans/2026-10-20-ui-refresh-1c-test-contract-audit.md
git commit -m "docs: plan the test contract audit (ui refresh step 1c)"
```

### Task 1: The room's marker as the join signal

**Files:** Modify `frontend/src/components/Room.tsx`, `e2e/fixtures.js`, `e2e/smoke.spec.js`, `e2e/lobby.spec.js`, `e2e/slug.spec.js`, `e2e/room.spec.js`, `e2e/roles.spec.js`.

**Interfaces:**
- Produces: `inRoom(page)`, exported from `e2e/fixtures.js`, the locator `page.getByTestId('room')`. Task 2 imports it.

- [ ] **Step 1: Mark the room view.** In `Room`'s returned JSX, the root `<div className="row">` becomes `<div className="row" data-testid="room">`. Nothing else in product code changes.

- [ ] **Step 2: Add the fixture** after `roomIdInput` in `e2e/fixtures.js`:

```js
// The room's marker: the room view's root, rendered on the first snapshot, never before.
export const inRoom = page => page.getByTestId('room')
```

- [ ] **Step 3: Replace each wait on Show votes as the join signal** with `await expect(inRoom(<page>)).toBeVisible()`, importing `inRoom` where used:
  - `join` and `newTab` in `e2e/fixtures.js`: `inRoom(page)` and `inRoom(tab)`; the comment above `join`'s wait stays.
  - 'create a room through the stub and reach the room view' (`smoke.spec.js`).
  - `lobby.spec.js`: 'Enter in the name field creates a room', 'a room name pasted with spaces into the Join form still joins' (its read of the room id heading after it stays) and both waits in 'Create, Leave and Join change the address, and Leave keeps the name'.
  - `joinAs` in `slug.spec.js`.
  - 'a reload keeps its identity and its vote' (`room.spec.js`): `inRoom(bob.page)`.
  - 'a submit from a tab showing Voter keeps the Facilitator another tab chose' (`roles.spec.js`): delete the Show votes line (R4).

  Leave 'the lobby offers the remembered room rather than joining it' and 'a room remembered from before the cutover reopens under its derived name' to Task 2.

- [ ] **Step 4: The marker's case**, at the end of `smoke.spec.js`:

```js
test("the room's marker waits for the first snapshot", async ({ page, origin, room }) => {
  let release
  const held = new Promise(resolve => (release = resolve))
  await page.route(/\/events\?/, async route => {
    await held
    await route.continue()
  })
  await page.goto(`${origin}/${room}`)
  await nameInput(page).fill('Alice')
  const opening = page.waitForRequest(/\/events\?/)
  await page.getByRole('button', { name: 'Join' }).click()

  // The join's request answers before its stream opens, so whatever the press draws shows here.
  await opening
  await expect(inRoom(page)).toHaveCount(0)
  release()
  await expect(inRoom(page)).toBeVisible()
})
```

- [ ] **Step 5: Run green**

Run: `npm run build && npx prettier --check --single-quote --no-semi --print-width 100 --trailing-comma none --arrow-parens avoid e2e/*.js frontend/src/components/Room.tsx && npx playwright test`
Expected: Prettier clean; every case passes in both browsers.

- [ ] **Step 6: Commit**

```bash
git add e2e frontend/src/components/Room.tsx
git commit -m "test(e2e): mark the room view and wait for it as the sign a join reached the room (ui refresh step 1c)" -m "Show votes hides while revealed in step 4, and Leave and the role line sit behind the phone header's menu. The test id on the room view's root renders on the first snapshot, and a case holding the stream open reads no marker before it."
```

- [ ] **Step 7: Show it failing**, each in `frontend/src/components/App.tsx`, built, run, then reverted with `git checkout -- frontend/src/components/App.tsx && npm run build`:
  - **The room view never renders.** Replace `{room.snapshot === null ? (` with `{true ? (`. Run:

    ```
    npx playwright test --project=chromium -g 'create a room through the stub|Enter in the name field creates a room|pasted with spaces|Create, Leave and Join|an old UUID link opens its derived room|a reload keeps its identity and its vote'
    ```

    Expected: each fails at its own `inRoom(…)).toBeVisible()`, `element(s) not found` (the slug case inside `joinAs`, the reload case inside `join`).
  - **A reloaded page never shows the room.** Replace `{room.snapshot === null ? (` with:

    ```tsx
    {room.snapshot === null || (performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined)?.type === 'reload' ? (
    ```

    Run `-g 'a reload keeps its identity and its vote'`. Expected: fails at `inRoom(bob.page)).toBeVisible()` after the reload.
  - **A "Joining…" look carrying the marker**, gone once lost or fatal. After `const [copied, setCopied] = useState(false)` add `const [pressed, setPressed] = useState(false)`; at the top of `joinHere` add `setPressed(true)`; before `<Alerts` add:

    ```tsx
    {pressed && !reached && !room.lost && !room.fatal && <div data-testid="room">Joining…</div>}
    ```

    Run `-g "the room's marker waits for the first snapshot"`. Expected: fails at `toHaveCount(0)`, `Received: 1`.

### Task 2: The rejoin link by its room id and name

**Files:** Modify `e2e/lobby.spec.js`, `e2e/slug.spec.js`.

**Interfaces:** Consumes `inRoom` (Task 1).

- [ ] **Step 1: 'the lobby offers the remembered room rather than joining it'** (`lobby.spec.js`): after `await alice.page.goto('/')`, the rest becomes

```js
  // By the room id and the name it rejoins as, whatever their order in the link.
  const rejoin = alice.page.getByRole('link', { name: room })
  await expect(rejoin).toContainText('as Alice')
  await expect(inRoom(alice.page)).toBeHidden()
  await rejoin.click()
  await expect(alice.page).toHaveURL(new RegExp(`/${room}$`))
  await expect(inRoom(alice.page)).toBeVisible()
```

- [ ] **Step 2: 'a room remembered from before the cutover reopens under its derived name'** (`slug.spec.js`): after its comment, the click becomes

```js
  const rejoin = page.getByRole('link', { name: 'your last room' })
  await expect(rejoin).toContainText('as Alice')
  await rejoin.click()
```

and its final wait becomes `await expect(inRoom(page)).toBeVisible()`.

- [ ] **Step 3: Run green**

Run: Prettier as in Task 1, then `npx playwright test e2e/lobby.spec.js e2e/slug.spec.js`
Expected: every case passes in both browsers.

- [ ] **Step 4: Commit**

```bash
git add e2e
git commit -m "test(e2e): find the rejoin link by its room id and name, in either order (ui refresh step 1c)" -m "Step 3b4 names the link <id> Rejoin as <name>; both lookups pass on today's name and on that one."
```

- [ ] **Step 5: Show them failing**, each in `frontend/src/components/App.tsx`, built, run, then reverted and rebuilt:
  - **A nameless link.** In `rejoinLabel`, replace `` ${name ? ` as ${name}` : ''} `` with nothing. Run `-g 'the lobby offers the remembered room|a room remembered from before the cutover'`. Expected: both fail at `toContainText('as Alice')`.
  - **The lobby joins rather than offers.** After `if (pathRoom && name && defaultOnLoad !== null) joinHere()` in the mount effect, add `if (!pathRoom && remembered) goTo(remembered)`. Run `-g 'the lobby offers the remembered room'`. Expected: fails at `toContainText('as Alice')`, `element(s) not found`.
  - **Simulation, 3b4's name.** In `rejoinLabel`, move `Rejoin` after the id:

    ```ts
    `${/^[a-z]+-[a-z]+-[a-z]+$/.test(id) ? id : 'your last room'} Rejoin${name ? ` as ${name}` : ''}`
    ```

    Run the first test-name filter. Expected: both pass.

### Task 3: A revealed round without Show votes or the voted mark

**Files:** Modify `e2e/room.spec.js`.

**Interfaces:** Consumes `inRoom` (Task 1) only through `join`.

- [ ] **Step 1: 'the reveal notice claims its space before the reveal'** measures the first participant entry alone, since the notice and Re-vote both appear above the list:

```js
  const alice = await join('Alice')
  // The notice and the Re-vote button both appear above the list, so its first entry stays put
  // only if neither takes height: the notice's row also sizes the estimation card.
  const top = async () => (await participantEntries(alice.page).first().boundingBox()).y

  // Nobody votes, so no summary block appears and what is left is the two in-place appearances.
  const before = await top()
  await alice.page.getByRole('button', { name: 'Show votes' }).click()
  await expect(frozenNotice(alice.page)).toBeVisible()
  await expect(alice.page.getByRole('button', { name: 'Re-vote' })).toBeVisible()
  expect(await top()).toEqual(before)
```

- [ ] **Step 2: 'a Show in a room where nobody voted renders no summary'** reads no tally entry: its last line becomes

```js
  // No entry rather than no region, so a region saying nobody voted still passes.
  await expect(tallyEntries(alice.page)).toHaveCount(0)
```

- [ ] **Step 3: The two "Voted" reads on a revealed entry read the value.**
  - 'two tabs on one room are one participant': the comment before Alice's vote and the `votedMark` read become

    ```js
      // The surviving tab keeps the member: only its own ref went. Alice's vote reveals the round,
      // so her value is what reaches the surviving tab.
    ```

    and `await expect(revealedEstimation(participantEntry(bob.page, 'Alice'))).toHaveText('3')`.
  - 'a vote survives its own reconnect': the comment before Alice's vote becomes

    ```js
      // The room's own state, not Bob's stale copy: Alice never disconnected, and her vote reveals
      // the round, so Bob's value on her page comes from a snapshot published after the reconnect.
    ```

    and the `votedMark` read and the `toContainText('8')` after it become one read, `revealedEstimation(participantEntry(alice.page, 'Bob'))` with `toHaveText('8', { timeout: 10_000 })`.

- [ ] **Step 4: Run green**

Run: Prettier as in Task 1, then `npx playwright test e2e/room.spec.js`
Expected: every case passes in both browsers.

- [ ] **Step 5: Commit**

```bash
git add e2e
git commit -m "test(e2e): read a revealed round without Show votes or the voted mark (ui refresh step 1c)" -m "Step 4 hides Show votes while revealed and names each mark exactly, and 3b1 gives a reveal nobody voted in a region saying so."
```

- [ ] **Step 6: Show them failing**, each built, run, then reverted and rebuilt:
  - **The notice takes no space until the reveal.** In `Deck.tsx`, replace `style={{ visibility: view.votesRevealed ? 'visible' : 'hidden' }}` with `style={{ display: view.votesRevealed ? undefined : 'none' }}`. Run `-g 'the reveal notice claims its space'`. Expected: fails at `toEqual(before)`.
  - **Re-vote takes a line of its own.** In `Controls.tsx`, before `      <div className="col"></div>`, add `      {revealed && <div className="w-100" style={{ height: '2rem' }} />}`. Same run. Expected: fails at `toEqual(before)`.
  - **A tally entry for nobody.** In `Results.tsx`, replace `if (!view.votesRevealed || view.votesSummary.length === 0) return null` with:

    ```tsx
    if (!view.votesRevealed) return null
    if (view.votesSummary.length === 0) return <div role="region" aria-label="Results"><table><tbody><tr data-testid="tally-entry"><td>-</td></tr></tbody></table></div>
    ```

    Run `-g 'a Show in a room where nobody voted'`. Expected: fails at `toHaveCount(0)`, `Received: 1`.
  - **Simulation, step 4's result** (3b1's decision 12: the deck's values with "Nobody voted", no `tally-entry` on a value nobody chose). The same guard becomes:

    ```tsx
    if (!view.votesRevealed) return null
    if (view.votesSummary.length === 0) return <div role="region" aria-label="Results"><p>Nobody voted</p>{Array.from({ length: 13 }, (_, i) => <span key={i}>{i}</span>)}</div>
    ```

    Same run. Expected: passes.
  - **A revealed frame never lands.** In `room/connection.ts`, before `      update({ snapshot: parsed, lost: false })`, add `      if (parsed.votesRevealed) return`. Run `-g 'two tabs on one room are one participant|a vote survives its own reconnect'`. Expected: both fail at `revealedEstimation(…).toHaveText`, `element(s) not found`.

- [ ] **Step 7: Simulation, step 4's hidden Show.** In `Controls.tsx` wrap the Show votes button in `{!revealed && …}`, build, and run `npx playwright test --project=chromium`. Expected: every case passes. Revert and rebuild.

### Task 4: Traffic and focus without Clear votes

**Files:** Modify `e2e/room.spec.js`.

- [ ] **Step 1: Traffic becomes an issue edit or a join** (R2). `setIssue` is the file's own helper.
  - `departureWhileCut`: the Clear click and the `votedMark` count of 0 after it become `await setIssue(alice, 'PP-1')` and `await expect(issueBox(bob.page)).toHaveValue('PP-1')`.
  - 'a disconnection outlasting the grace period comes back without a reload': the comment's "both are asserted on Alice's entry" becomes "both are asserted on Alice's page"; the Clear click and its count of 0 become `await vote(alice.page, '8')` and `await expect(ownEstimation(alice.page)).toHaveText('8')`. After the reconnect, the frame Alice sends becomes `await setIssue(alice, 'PP-1')` and `await expect(issueBox(bob.page)).toHaveValue('PP-1', { timeout: 10_000 })`, in place of her vote and Bob's read of her mark.
  - 'a stream frozen without an error is noticed and reopened on its own': the Clear click and the count of 0 become `await setIssue(alice, 'PP-1')` and `await expect(issueBox(bob.page)).toHaveValue('PP-1')`.
  - 'a draft survives blur and room activity': the comment and the two lines after it become

    ```js
      // A join, since Carol's entry only appears once the frame lands.
      await join('Carol')
      await expect(participantEntry(alice.page, 'Carol')).toHaveCount(1)
    ```

- [ ] **Step 2: A card holds the focus** in 'a failed save leaves focus the user moved elsewhere', since a deck card is a button present while voting in every step's design: `const clear = …'Clear votes'…` becomes `const elsewhere = card(alice.page, '5')`, and its two uses follow the new name.

- [ ] **Step 3: Run green**

Run: Prettier as in Task 1, then `npx playwright test e2e/room.spec.js`
Expected: every case passes in both browsers.

- [ ] **Step 4: Commit**

```bash
git add e2e
git commit -m "test(e2e): send traffic and hold focus without Clear votes (ui refresh step 1c)" -m "Step 5 decides whether Clear stays. The cases that click it for its own behaviour are step 5's contract changes; these only needed a publish or a focusable element."
```

- [ ] **Step 5: Show them failing.**
  - **No traffic**, test-side: delete the new `setIssue` and its read from `departureWhileCut`, and the new second vote and its read from the grace case, then run `-g 'a participant who departed during the gap is pruned on reconnect|a disconnection outlasting the grace period'`. Expected: both fail at their `toHaveCount(0, { timeout: 20_000 })`, `Received: 1`. Restore with `git checkout -- e2e/room.spec.js`.
  - **A reopened stream delivers only its first frame.** In `room/connection.ts`, before `  const connect = (id: string) => {` add `  let opens = 0` and `  let frames = 0`; at the top of `opened.onopen` add `      opens++` and `      frames = 0`; before `      update({ snapshot: parsed, lost: false })` add `      if (opens > 1 && ++frames > 1) return`. Run `-g 'a stream frozen without an error|a disconnection outlasting the grace period'`. Expected: both fail at `issueBox(bob.page)).toHaveValue('PP-1')`, `unexpected value ""`.
  - **Blur ends editing.** In `IssueEditor.tsx`, add `onBlur={editor.cancel}` after the input's `onChange`. Run `-g 'a draft survives blur'`. Expected: fails at the last `toHaveValue('Alice is still typing')`, `Received: ""`.
  - **A failed save always takes the focus.** In `IssueEditor.tsx`, replace `if (editor.failed && dropped) box.current?.focus()` with `if (editor.failed) box.current?.focus()`. Run `-g 'a failed save leaves focus the user moved elsewhere'`. Expected: fails at `toBeFocused()`.

  Revert and rebuild after each frontend mutation.

- [ ] **Step 6: Simulation, Clear removed.** Delete the Clear votes button from `Controls.tsx`, build, run `npx playwright test --project=chromium`. Expected: exactly these fail, step 5's own list: 'a clear re-arms the auto-reveal, and the last vote fires it', 'a re-vote leaves the caster shown as selected but unconfirmed', 'Re-vote is offered only while the round is revealed', 'a session of rounds keeps the summary honest across them', "a facilitator's page has no deck, and keeps Show, Re-vote and Clear". Revert and rebuild.

### Task 5: The record

**Files:** Modify `docs/superpowers/specs/2026-09-30-ui-refresh-design.md`, `docs/design/ui-reference.md`.

- [ ] **Step 1: The umbrella's "Step 1c" section.** Replace from `**Step 1c. Test contract audit.**` through `Its list is completed from step 3b's layouts, hence its place after 3b.` with:

```markdown
**Step 1c. Test contract audit.** Each case keeps the behaviour it guards and
loses the elements it reaches it through by chance, so step 4 and step 5 can
change which controls show. Its list, completed from step 3b's layouts:

- Show votes read while revealed, the cases step 4 would fail: the reveal's
  layout-shift case ('the reveal notice claims its space before the reveal'),
  which measures the first participant entry alone, and 'a Show survives
  someone joining' and 'an auto-revealed round stays revealed when a straggler
  arrives', whose `join` enters a revealed room.
- Show votes as the sign a join or rejoin succeeded, in every helper and case
  that waited for it (`join`, `newTab`, `joinAs`, the lobby, smoke and reload
  cases, 'a submit from a tab showing Voter keeps the Facilitator another tab
  chose', and 'a room remembered from before the cutover reopens under its
  derived name'). The room's marker serves (the reference's "Contract reads").
  Leave and the role line, chosen first, sit behind ☰ in the phone layout
  (3b2), where the moved-banner case joins; a room id heading would pass in a
  lobby that gave the id a heading.
- Clear votes clicked only to send traffic or to hold focus. An issue edit
  sends it where another page reads it (`departureWhileCut`, the grace-period
  and frozen-stream cases), a second vote where only the sender's page is
  live, and a join in 'a draft survives blur and room activity'; a card holds
  the focus in 'a failed save leaves focus the user moved elsewhere'.
- Every "Voted" mark read on a revealed entry, where the revealed value serves
  (the reference's "Contract reads"): 'a vote survives its own reconnect' and
  'two tabs on one room are one participant'.
- 'a Show in a room where nobody voted renders no summary' reads no tally entry
  rather than a hidden region (3b1's Contract).
- The rejoin link is found by the room id, or "your last room", with "as
  <name>" in its text, so 3b4's `<id> Rejoin as <name>` passes unchanged.

Simulated on today's page and not kept: with Show hidden while revealed every
case passes, where the first item's cases failed before; with Clear removed
only the cases step 5 names below fail; 3b4's rejoin name passes.
```

- [ ] **Step 2: The reference** (`docs/design/ui-reference.md`), each wrapped at the file's width:
  - In "Contract reads the look keeps", `Step 1c moves every read of "Voted" on a revealed entry to the value (its list` becomes `Step 1c moved every read of "Voted" on a revealed entry to the value (its list`.
  - After `- The room id as a heading, any level (`lobby.spec.js`).`, add:

    ```markdown
    - The room's marker, the test id `room` on the room view's root (`inRoom`),
      the sign a join reached the room: it sits on what renders from a snapshot,
      never on a look drawn while joining, as 'the room's marker waits for the
      first snapshot' (`smoke.spec.js`) holds it.
    - `tally-entry`, inside the region "Results", marks a value someone voted
      for; `expectSummaryMatchesParticipants` holds each summary it reads to it,
      and the nobody-voted case reads none.
    ```

  - In the "Decisions log", after the **3b4.** entry, add:

    ```markdown
    - **1c.** The test contract audit (the UI refresh design's step 1c)
      reopened its sign that a join reached the room, "Leave or the role line":
      3b2 puts both behind ☰ in the phone layout, where a case joins. The
      room's marker serves (Contract reads). Set aside: the room id as a
      heading, which a lobby giving the id a heading would pass; Edit issue;
      the round region, absent from today's page.
    ```

- [ ] **Step 3: Check and commit**

Run: `git diff --stat` shows only the two docs; `npm run test:unit` from the repository root passes.

```bash
git add docs/superpowers/specs/2026-09-30-ui-refresh-design.md docs/design/ui-reference.md
git commit -m "docs: record step 1c's completed list in the ui refresh design and the reference"
```

- [ ] **Step 4: Report** to the user: the commits, each mutation's result, the simulations' results, and the rulings above. Do not push.
