# UI Refresh Step 4c1-voters: Voters Without a Browser, Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The test process can fill a room with voters that join and vote over the protocol, holding their event streams open, so a layout case needs one page, not 14.

**Architecture:**
- `testkit/voters.js` exports `joinVoters`, which joins each name over HTTP, opens its event stream, and resolves once every stream has sent its first frame.
- `test/voters.test.js` runs the testkit's cases under `node --test`, against an app started by `testkit/app.js`.
- A `voters` fixture in `e2e/fixtures.js` binds `joinVoters` to the case's room and closes what it joined at teardown. `e2e/voters.spec.js` holds the one browser case.

**Tech Stack:** Node 24's `fetch` and web streams; `node:test`; Playwright, Chromium and Firefox.

**Spec:** `docs/superpowers/specs/2026-10-22-ui-refresh-4c1-voters-design.md`. The parent's change it names already landed with the spec's first commit.

## How this plan was verified

- **Probed, 2026-10-23:**
  - A draft of both tasks passed: 3/3 under `node --test test/voters.test.js`, and the browser case in both browsers.
  - The spec's mutations each failed their case:
    - a call that waits on nothing failed case 1 five runs out of five, each time with a vote's 403;
    - ignoring the join's status failed case 2 with the events request's 404 in place of the join's;
    - ignoring the vote's status failed case 3 with "Missing expected rejection";
    - a voter that cancels its stream after the first frame failed the browser case at the count after the wait, with 1 entry in place of 14.
  - The draft files were then removed. A copy is in this session's scratchpad, `planprobe-voters/`.
- **Checked:**
  - The join answers 204 and sets the `session` cookie.
  - A join to `no-such-room` answers 404.
  - A blank estimation answers 400 (`Requests.scala`'s `an estimation needs a value`).
  - `Deck.tsx`'s `estimationValues` holds 13 values.
  - `testProfile.ROOM_GRACE_PERIOD` is `'4s'`.
  - Nothing under `test/` imports `@playwright/test`.

## Rulings this plan makes, for the user's review

- **R1. `joinVoters(baseUrl, room, names)` resolves `{ voters, close }`, and each voter is `{ name, vote(value) }`.** The fixture's call returns only `voters`: the fixture owns `close`, so a case cannot shrink its room by closing early, which decision 2 already rules out in effect.
- **R2. A call joins every name first, then opens every stream.** A refused join therefore leaves no stream open. A stream that fails aborts the others the call opened before the call rejects, so a failed call leaves nothing for teardown.
- **R3. R2's abort has no case.** Provoking it needs a server that refuses one stream of several, which the started app does not do. The final review reads it instead (Review Focus 1).
- **R4. The browser case's page is a facilitator.** The 13th vote then leaves every voter confirmed and reveals the round by itself (decision 4), so the case reads the tally without a command.

## Global Constraints

**Branch and commits:**
- Branch `20260930.ui_refresh_4c1_voters`, stacked on `20260930.ui_refresh_4c1_wide_prep` (#461). The spec's commits already exist.
- New commits only: no amend, rebase or force-push. Nothing is pushed until the user asks.
- Commit subjects, verbatim, in Conventional Commits:
  - Task 0: `docs: plan the voters without a browser (ui refresh step 4c1-voters)`
  - Task 1: `test: join voters over the protocol without a browser (ui refresh step 4c1-voters)`
  - Task 2: `test(e2e): fill a case's room with protocol voters (ui refresh step 4c1-voters)`
- No "Generated with Claude Code" or co-author line.

**Code:**
- Comments are one or two lines, with no em dash.
- The surrounding style: ES modules, no semicolons, single quotes, two-space indent, lines under about 100 characters.
- The voters talk to the app's `baseUrl`, never the stub's (decision 3).
- Every failure names its request and status in these forms, so the cases can match them exactly:
  - `POST /rooms/${room}/join for ${name} answered ${status}`
  - `GET /rooms/${room}/events for ${name} answered ${status}`
  - `POST /rooms/${room}/vote for ${name} answered ${status}`
- No case outside this step's two new files changes.

**Writing:**
- Cite symbols, case titles and PR numbers, never line numbers.

## Review Focus

1. A call whose second stream fails, after its first has opened: the first is aborted before the call rejects (R2, R3; no case).
2. A name the join refuses, such as a blank one: the call rejects with the join's 400 through the same check as case 2, and opens no stream.
3. A case that fails after its voters joined: the fixture's teardown still closes every call that resolved.
4. A case that turns the stub's buffering on or cuts a page: the voters are unaffected, as they go to `app.baseUrl` (decision 3).
5. A case that runs for minutes: each voter keeps reading its stream, so the server's heartbeats never fill an unread buffer.

---

### Task 0: Commit this plan

- [ ] **Step 1: Commit**

```bash
git add docs/superpowers/plans/2026-10-23-ui-refresh-4c1-voters.md
git commit -m "docs: plan the voters without a browser (ui refresh step 4c1-voters)"
```

### Task 1: The voters and their own cases

**Files:**
- Create: `testkit/voters.js`
- Create: `test/voters.test.js`
- Modify: `README.md`, the testkit paragraph that opens "There is also a Node testkit under `testkit/`"

**Interfaces:**
- Consumes: `startApp` from `testkit/app.js`.
- Produces: `export const FIRST_FRAME_TIMEOUT_MS = 5000` and `export async function joinVoters(baseUrl: string, room: string, names: string[]): Promise<{ voters: { name: string, vote(value: string): Promise<void> }[], close(): void }>`.

- [ ] **Step 1: Write the failing cases in `test/voters.test.js`**

One app for the file, started in a top-level `before` with `{ timeout: 45_000 }` (above `app.js`'s readiness cap, as `reproduction.test.js` explains) and stopped in `after`. A local `createRoom()` posts `/create-room` and asserts 200, since `e2e/fixtures.js` imports Playwright. `names` is 14 names.

```js
test("every voter's vote succeeds as soon as the call resolves", async t => {
  const { voters, close } = await joinVoters(app.baseUrl, await createRoom(), names)
  t.after(close)
  await Promise.all(voters.map(voter => voter.vote('3')))
})

test("a refused join fails the call with the join's status", async () => {
  await assert.rejects(joinVoters(app.baseUrl, 'no-such-room', ['Ada']), {
    message: 'POST /rooms/no-such-room/join for Ada answered 404'
  })
})

test('a blank vote fails its call with 400', async t => {
  const room = await createRoom()
  const { voters, close } = await joinVoters(app.baseUrl, room, ['Ada'])
  t.after(close)
  await assert.rejects(voters[0].vote(''), { message: `POST /rooms/${room}/vote for Ada answered 400` })
})
```

- [ ] **Step 2: Run them to verify they fail**

Run: `node --test test/voters.test.js`
Expected: FAIL, the module `../testkit/voters.js` not found.

- [ ] **Step 3: Implement `joinVoters` in `testkit/voters.js`**

- **Requests:** one shared check, as `createRoom` does: a response that is not `ok` has its body cancelled and throws the Global Constraints' message.
- **Joins:** `POST /rooms/${room}/join` with `{ name, role: 'Voter' }`, all names at once. The cookie header is built from `getSetCookie()` as `reproduction.test.js` builds it.
- **Streams:** once every join has answered, `GET /rooms/${room}/events?connectionId=${crypto.randomUUID()}`, with the cookie, `accept: text/event-stream` and an `AbortController` per voter.
- **First frame:** the call waits for each stream's first `read()`. It fails, naming the voter, if the stream ends first (`the events stream of ${name} ended before its first frame`), if it errors, or if nothing arrives within `FIRST_FRAME_TIMEOUT_MS` (`the events stream of ${name} sent nothing for 5000ms`).
- **After the first frame:** the voter keeps reading and dropping chunks until the stream ends, swallowing the abort's error.
- **Failure:** any stream failure aborts all the call's streams before the call rejects (R2).
- **The result:**
  - `close()` aborts the call's streams and nothing else.
  - `vote(value)` posts `{ estimation: value }` to `/rooms/${room}/vote` with the cookie, checks the answer and drains the body.

- [ ] **Step 4: Run them to verify they pass**

Run: `node --test test/voters.test.js`
Expected: PASS, 3/3.

- [ ] **Step 5: Prove each case can fail, restoring the file after each**

- Waiting on nothing: drop the call's wait for the streams (`void` in place of `await` on their `Promise.all`). Run case 1 three times. Expected: FAIL each run, naming a vote's 403.
- Ignoring the join's status: skip the check on the join. Expected: case 2 FAILS, its message naming `GET /rooms/no-such-room/events` in place of the join.
- Ignoring the vote's status: skip the check on the vote. Expected: case 3 FAILS with "Missing expected rejection".

- [ ] **Step 6: Name the voters in the README**

The testkit paragraph lists three tools: the stub, the harness, and "voters that join a room and vote over the protocol without a browser, for the cases that need a full room". Keep the paragraph's line wrapping.

- [ ] **Step 7: Run the node suite and commit**

Run: `npm test`
Expected: PASS, every node case, `voters.test.js`'s three included.

```bash
git add testkit/voters.js test/voters.test.js README.md
git commit -m "test: join voters over the protocol without a browser (ui refresh step 4c1-voters)"
```

### Task 2: The fixture and its browser case

**Files:**
- Modify: `e2e/fixtures.js`, a `voters` fixture after `join`
- Create: `e2e/voters.spec.js`

**Interfaces:**
- Consumes: Task 1's `joinVoters`; the `app`, `room` and `join` fixtures; `participantEntries`, `tallyEntries` from `e2e/fixtures.js`; `testProfile` from `testkit/app.js`.
- Produces: the fixture `voters: (names: string[]) => Promise<{ name, vote(value) }[]>`, joined in the case's room on `app.baseUrl`. Every call that resolved is closed at teardown (R1).

- [ ] **Step 1: Write the failing case in `e2e/voters.spec.js`**

`names` is 13 names and `estimations` is `Deck.tsx`'s 13 values in order. `graceMs` is `Number.parseInt(testProfile.ROOM_GRACE_PERIOD) * 1000`, with a one-line comment that the profile writes it in seconds.

```js
test('a room filled by protocol voters keeps its 14 entries past the grace period', async ({ join, voters }) => {
  // A facilitator, so the 13th vote leaves every voter confirmed and reveals the round.
  const { page } = await join('Alice', { role: 'Facilitator' })
  const joined = await voters(names)
  await expect(participantEntries(page)).toHaveCount(14)
  await Promise.all(joined.map((voter, i) => voter.vote(estimations[i])))
  await page.waitForTimeout(graceMs + 2000)
  await expect(participantEntries(page)).toHaveCount(14)
  await expect(tallyEntries(page)).toHaveCount(13)
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx playwright test e2e/voters.spec.js`
Expected: FAIL in both browsers: the fixture `voters` is not defined.

- [ ] **Step 3: Add the `voters` fixture to `e2e/fixtures.js`**

It imports `joinVoters`, keeps each call's result, returns its `voters`, and closes every kept call after `use`. Its comment says the voters go to the app, not the stub, so a case's cuts leave them alone.

- [ ] **Step 4: Run it to verify it passes**

Run: `npx playwright test e2e/voters.spec.js`
Expected: PASS, 2/2.

- [ ] **Step 5: Prove it can fail**

In `testkit/voters.js`, replace the reading after the first frame with `reader.cancel()`, then restore it.
Run: `npx playwright test e2e/voters.spec.js --project=chromium`
Expected: FAIL at the count after the wait, receiving fewer than 14.

- [ ] **Step 6: Run the browser suite and commit**

Run: `npm run e2e`
Expected: PASS, every case in both browsers.

```bash
git add e2e/fixtures.js e2e/voters.spec.js
git commit -m "test(e2e): fill a case's room with protocol voters (ui refresh step 4c1-voters)"
```
