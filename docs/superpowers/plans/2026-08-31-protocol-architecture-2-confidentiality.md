# Pre-Reveal Vote Confidentiality Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop another participant's estimation from reaching the wire before the
room reveals, without changing what the participant table renders.

**Architecture:** `RoomSnapshot.of` already builds one snapshot per recipient, so
redaction is a change in one function: an estimation travels only to its own
owner until `votesRevealed`. `Participant` gains `hasEstimation`, computed from
the unredacted value, because the client's hidden-value icon reads the estimation
string today and blanking it would take the icon with it. The client repoints
that one predicate at the new field.

**Tech Stack:** Scala 3, Pekko typed actors, circe, ScalaTest
(`AnyWordSpec` + `must.Matchers`), Vue 2 loaded from a CDN in a single inline
script, Playwright.

**Spec:** `docs/superpowers/specs/2026-08-31-protocol-target-architecture-design.md`,
step 2 at `:1663`. Section 2 owns `hasEstimation` and the projection, section 3
invariant 2 owns the redaction rule, section 5 at `:1303` owns the client change,
section 6 at `:1405` owns the browser case.

**Branch:** `20260831.protocol_architecture_2_confidentiality`, based on
`20260831.protocol_architecture_1_snapshot` at `bc4b958`. The stack is not
rebased or merged by this plan, and that SHA is rewritten by the ordered rebase
that eventually lands it.

## Global Constraints

- **Everything is built against today's `RoomData`.** `RoomState`, `Round`,
  `members` and `connections` arrive at step 4. `hasEstimation` is therefore
  `estimation.nonEmpty` here, not an entry existing in a map, and `voted` stays
  `User.voted`.
- **The tally is not touched.** The voted-only filter is step 3 and lands with
  the template guard it requires. Pre-reveal the tally now collapses every voter
  into one bucket, which is harmless because the summary only renders when
  revealed, and is not a bug to fix here.
- **Reveal stays a latch.** Nothing in this step reads or re-derives
  `everyUserHasVoted`. A membership change must not reveal anything, which is
  what makes the browser case in task 2 a guard rather than a demonstration.
- **A field with no consumer does not travel.** `hasEstimation` arrives because
  `showUserEstimation` consumes it. `history` is step 9; `version`, `roomId`,
  `scale` and `role` are never added.
- **The recipient always sees their own estimation.** `ownVoteConfirmed` and the
  selected-card styling derive from it, so redacting it would break the client's
  own view.
- **Comments are one or two lines.** Never a multi-line block, including for
  non-obvious rationale. Longer context belongs in the commit message.
- **Conventional Commits**, and documentation commits are `docs:`, never `doc:`.
- **No em dash in any document.**
- `scalafmt` runs at 100 columns. Run `sbt scalafmtAll` before any commit that
  touches Scala.

---

## File Structure

**Server, modified:**

- `actors/RoomSnapshot.scala` `Participant` gains `hasEstimation`, and `of`
  withholds an estimation from every recipient but its owner until
  `data.revealed`. This is the whole behaviour change: one function, which is
  the choke-point property section 2 argues the projection exists for.
- `actors/Room.scala` Comment only, in `publish`: recipient and redaction target
  are one value here, and `RoomSpec`'s two-probe cases guard that. Deviation 4.

**Client, modified:**

- `src/main/resources/pages/index.html` `showUserEstimation` reads
  `u.hasEstimation` instead of `u.estimation`.

**Tests, modified:**

- `src/test/scala/.../actors/RoomSnapshotSpec.scala` Seven redaction cases,
  `hasEstimation` added to the serialized field set, and the field set pinned on
  a redacted frame's rows too. Deviation 6.
- `src/test/scala/.../actors/RoomSpec.scala` The two cases that assert one
  participant's estimation in another's snapshot now assert the withholding.
- `src/test/scala/.../sse/SSESpec.scala` Its `snapshot` helper constructs a
  `Participant`, so it takes the new argument, and now names every argument it
  passes. Deviation 7.
- `e2e/fixtures.js` A `hiddenMark` locator beside `votedMark`.
- `e2e/room.spec.js` One case for the icon the redaction would otherwise remove,
  and two for the confidentiality property.

**Docs, modified:**

- `docs/known-issues.md` The "Pre-reveal estimations are broadcast to every
  participant" entry is removed, the ghost-participant entry loses a claim the
  browser cases falsified, and a cached-page entry is added. Deviations 3 and 8.
- `README.md` The snapshot example gains `hasEstimation`, the messaging section
  says what is withheld, and the restart paragraph stops claiming no client
  outlives the server. Deviation 8.

`docs/roadmap.md` is not touched. Hidden voting is not a roadmap feature, it is
the behaviour the app already claimed to have.

### Why the tasks are ordered as they are

Task 1 is deliberately not split down the server/client seam. The client
predicate is not an independent improvement, it is the repair for what the server
change would otherwise break: after redaction alone, every participant's
hidden-value icon disappears and no existing test notices, since the suite
asserts that another's *value* is absent and never that the marker is present.
Splitting would put a silent visual regression in its own commit and hand the
reviewer a reason to approve it.

Task 2 is a guard rather than a fix. Its cases pass the moment they are written,
because step 1's reveal latch already holds the property. They are written here
because this is the step that makes a stray reveal a disclosure rather than a
display toggle, and because the reload variant only turns hostile at step 6,
where a beacon makes a reload a departure. A guard that arrives beside the change
that would break it arrives too late to have watched.

---

## Deviations from the plan, and why

Listed so a reviewer can reject one without re-deriving it.

1. **The reload case models a rejoin, because this plan's premise about a reload
   was wrong.** It claimed no rejoin follows, "since `created()` only opens the
   join form". `created()` also calls `doJoin()` whenever `localStorage` holds
   both a room id and a name (`index.html:522-524`), which it does after any
   join, so a reload rejoins immediately and `POST /join` mints a second id for
   the same person. That is the ghost-participant entry already in
   `docs/known-issues.md`, and it made the case fail deterministically in both
   engines on a roster assertion that expected Carol gone.

   Rather than delete the case or fake a departure by clearing `localStorage`
   first, which would be the close case under another name, the helper now takes
   the settled-roster assertion as a callback: the close case waits for no Carol,
   the reload case for Carol listed twice and then once. The confidentiality
   assertions stay shared, which is what the helper is for.

   Two costs, both accepted. Today the reload case is vacuous for the latch,
   because the last non-voter is replaced rather than removed, so no re-derived
   reveal predicate would fire and the close case carries the property alone.
   And step 6's idempotent `/join` removes the duplicate, so its
   `toHaveCount(2)` becomes `1` throughout and that step has to revisit the
   expectation.

2. **A seventh `RoomSnapshotSpec` case was added**, `"disclose every estimation
   to a non-member once the room has revealed"`. The sixth case pins the
   withholding for a non-member and a reader could take that as the whole rule,
   so its post-reveal twin states that the disclosure there is intentional:
   those values are public in the room and the recipient held a valid room
   token. File Structure was updated to say seven cases; this section was not.

3. **`docs/known-issues.md`'s ghost-participant entry was edited**, against Task
   3 Step 1's "Leave every other entry alone". The paragraph that instruction
   names, the tally counting a ghost's vote, is untouched. What changed is a
   claim the new browser cases falsified: the entry said no test covered
   pruning-cannot-disclose, and the straggler-close case now covers it directly.

4. **`Room.scala` was modified**, against File Structure's "This is the whole
   server change: one function". Comment only. `publish` now says that its
   recipient and its redaction target are one value, and names `RoomSpec`'s
   two-probe cases as the guard step 4 has to keep once a connections map turns
   that pairing into a lookup. The two lines sit above `data.users.foreach`
   rather than at the head of the method, so they do not stack with the
   pre-existing dropHead pair into a four-line block.

5. **This plan's non-member snippet claimed `publish` iterates connections.** It
   iterates `users` today, which makes that case unreachable rather than live,
   and the landed comment says so. The snippet in task 1 has been corrected.

6. **The redacted frame's field set is pinned, beyond the one-line edit this
   plan described.** The plan changed only the participant key list in
   `"serialize exactly the agreed field set"`, whose fixture is revealed with a
   single participant who is also the recipient, so no key-list assertion ran on
   a redacted frame and its shape rested on a substring check that would still
   pass if the key were dropped. `"keep a withheld estimation out of the
   serialized frame entirely"` now asserts both rows' key lists on the frame it
   already builds. Asserting one row would have been order-dependent, since rows
   sort by random UUID and the owner's row is disclosed.

   Recorded with it, since it is the reason that assertion matters: neither
   browser case pins server redaction. `index.html:308` renders another
   participant's value only under `v-if="votesRevealed"`, so the helper's
   `not.toContainText` and `hiddenMark` assertions hold with or without
   redaction. `RoomSnapshotSpec` and `RoomSpec` pin the wire; the browser cases
   pin the latch and the icon.

7. **`SSESpec`'s `snapshot` helper names every argument** of both `RoomSnapshot`
   and `Participant`, where this plan had it take the new one positionally.
   `voted` and `hasEstimation` are adjacent booleans and `of` already constructs
   with named arguments, so the helper matches it rather than leaving a silent
   transposition for a later edit to hit. Both values are `false` today and no
   case in that file reads either, so this buys nothing now and removes a hazard
   from the next change.

8. **The README's version-field claim was qualified and `known-issues.md` gained
   an entry.** The README said no client outlives the server that served it. No
   session does, but the page is served with `Last-Modified` and `ETag` and no
   `Cache-Control`, measured against the staged build, so a cached page can
   outlive a deploy. At this step that costs a missing withheld-value marker
   until the page revalidates, because the step 1 page's `showUserEstimation`
   reads an `estimation` this step blanks. The new entry records the window and
   what would close it; nothing is scheduled.

---

## Task 1: Per-recipient redaction and `hasEstimation`

**Files:**
- Modify: `src/main/scala/com/lunatech/pointingpoker/actors/RoomSnapshot.scala:21-44`
- Modify: `src/main/resources/pages/index.html:507-509` (`showUserEstimation`)
- Test: `src/test/scala/com/lunatech/pointingpoker/actors/RoomSnapshotSpec.scala`
- Test: `src/test/scala/com/lunatech/pointingpoker/actors/RoomSpec.scala:48-91`, `:107-132`
- Test: `src/test/scala/com/lunatech/pointingpoker/sse/SSESpec.scala:38-39`
- Test: `e2e/fixtures.js:164`, `e2e/room.spec.js`

**Interfaces:**
- Consumes: `RoomSnapshot.of(data: Room.RoomData, forUser: UUID)` and
  `RoomSnapshot.Participant`, both from step 1.
- Produces:
  - `RoomSnapshot.Participant(id: UUID, name: String, voted: Boolean, hasEstimation: Boolean, estimation: String)`,
    in that order, since the case class order is the JSON key order.
  - `RoomSnapshot.of` unchanged in signature. Its `estimation` is `""` for every
    participant but `forUser` while `data.revealed` is false.
  - `hiddenMark(row)` in `e2e/fixtures.js`, the withheld-value icon in a
    participant row.

- [x] **Step 1: Write the failing tests**

Add to `RoomSnapshotSpec.scala`, inside the `"RoomSnapshot.of" should { ... }`
block. The `user` helper at `:21` already takes `(id, name, voted, estimation)`:

```scala
    "withhold another participant's estimation until the room reveals" in {
      val alice = user(UUID.randomUUID(), "Alice", true, "5")
      val bob   = user(UUID.randomUUID(), "Bob", true, "13")
      val data  = RoomData.empty.copy(users = List(alice, bob))

      val forAlice = RoomSnapshot.of(data, alice.id)
      forAlice.users.find(_.id == alice.id).map(_.estimation) mustBe Some("5")
      forAlice.users.find(_.id == bob.id).map(_.estimation) mustBe Some("")

      val forBob = RoomSnapshot.of(data, bob.id)
      forBob.users.find(_.id == bob.id).map(_.estimation) mustBe Some("13")
      forBob.users.find(_.id == alice.id).map(_.estimation) mustBe Some("")
    }

    "keep a withheld estimation out of the serialized frame entirely" in {
      val alice = user(UUID.randomUUID(), "Alice", true, "5")
      val bob   = user(UUID.randomUUID(), "Bob", true, "13")
      val data  = RoomData.empty.copy(users = List(alice, bob))

      // The property is about the wire, not the projection: devtools is the threat.
      (RoomSnapshot.of(data, alice.id).asJson.noSpaces must not).include("\"13\"")
    }

    "hand every estimation over once the room has revealed" in {
      val alice = user(UUID.randomUUID(), "Alice", true, "5")
      val bob   = user(UUID.randomUUID(), "Bob", true, "13")
      val data  = RoomData.empty.copy(users = List(alice, bob), revealed = true)

      RoomSnapshot.of(data, alice.id).users.map(_.estimation).toSet mustBe Set("5", "13")
    }

    "say that another participant has an estimation without saying what it is" in {
      val alice = user(UUID.randomUUID(), "Alice", false, "")
      val bob   = user(UUID.randomUUID(), "Bob", true, "13")
      val data  = RoomData.empty.copy(users = List(alice, bob))

      val bobsRow = RoomSnapshot.of(data, alice.id).users.find(_.id == bob.id)
      // Computed from the unredacted value, so the hidden-value icon renders as it does today.
      bobsRow.map(_.hasEstimation) mustBe Some(true)
      bobsRow.map(_.estimation) mustBe Some("")
      RoomSnapshot.of(data, alice.id).users.find(_.id == alice.id).map(_.hasEstimation) mustBe
        Some(false)
    }

    "distinguish a re-vote from a clear on another participant's row" in {
      val alice    = user(UUID.randomUUID(), "Alice", false, "")
      val revoting = user(UUID.randomUUID(), "Revoting", false, "13")
      val cleared  = user(UUID.randomUUID(), "Cleared", false, "")
      val data     = RoomData.empty.copy(users = List(alice, revoting, cleared))

      val snapshot = RoomSnapshot.of(data, alice.id)
      // voted false with hasEstimation true is the re-vote state, and it has to survive
      // redaction or every row looks cleared.
      snapshot.users.find(_.id == revoting.id).map(_.hasEstimation) mustBe Some(true)
      snapshot.users.find(_.id == cleared.id).map(_.hasEstimation) mustBe Some(false)
    }

    "withhold every estimation from a snapshot built for someone who is not a member" in {
      val alice = user(UUID.randomUUID(), "Alice", true, "5")
      val bob   = user(UUID.randomUUID(), "Bob", true, "13")
      val data  = RoomData.empty.copy(users = List(alice, bob))

      // Unreachable today: publish iterates users. Step 4's connections let a departing tab
      // still be handed one snapshot.
      RoomSnapshot.of(data, UUID.randomUUID()).users.map(_.estimation) mustBe List("", "")
    }
```

Update the existing `"serialize exactly the agreed field set"` case at `:76-88`.
Only the participant key list changes, and the comment with it:

```scala
      // history is step 9; a field with no consumer must not travel.
      json.hcursor.downField("users").downArray.keys.map(_.toList) mustBe Some(
        List("id", "name", "voted", "hasEstimation", "estimation")
      )
```

In `RoomSpec.scala`, replace the assertion loop of
`"revote and publish a room that keeps the estimations but clears the votes"`
(`:84-90`):

```scala
      for (probe, member) <- List((userProbe, user), (user2Probe, user2)) do
        val snapshot = expectSnapshot(probe)
        snapshot.you mustBe member.id
        snapshot.votesRevealed mustBe false
        snapshot.users.map(_.voted) mustBe List(false, false)
        // The estimations survive a re-vote, and hasEstimation is now what carries that,
        // since the values themselves reach nobody but their owner.
        snapshot.users.map(_.hasEstimation) mustBe List(true, true)
        snapshot.users.find(_.id == member.id).map(_.estimation) mustBe Some(member.estimation)
        snapshot.users.filterNot(_.id == member.id).map(_.estimation) mustBe List("")
```

Replace the assertion loop of `"vote and publish it to everyone"` (`:120-125`):

```scala
      for (probe, member) <- List((userProbe, user), (user2Probe, user2)) do
        val snapshot = expectSnapshot(probe)
        snapshot.you mustBe member.id
        val voter = snapshot.users.find(_.id == user.id)
        voter.map(_.voted) mustBe Some(true)
        voter.map(_.hasEstimation) mustBe Some(true)
        // Unrevealed, so the value itself is in the voter's own snapshot and no other.
        voter.map(_.estimation) mustBe Some(if member.id == user.id then estimation else "")
```

Extend the assertion in `"clear votes and publish the cleared room"` (`:60`), so
the cleared row is pinned against the re-vote row above rather than merely
happening to match it:

```scala
        snapshot.users.map(u => (u.voted, u.estimation)) mustBe List((false, ""), (false, ""))
        snapshot.users.map(_.hasEstimation) mustBe List(false, false)
```

In `SSESpec.scala:38-39`, the helper constructs a `Participant` positionally and
needs the new argument:

```scala
  private def snapshot(userId: UUID, issue: String) =
    RoomSnapshot(
      userId,
      issue,
      false,
      List(RoomSnapshot.Participant(userId, "Alice", false, false, ""))
    )
```

- [x] **Step 2: Run the tests to verify they fail**

Run: `sbt test`
Expected: FAIL to compile, `value hasEstimation is not a member of RoomSnapshot.Participant`
in `RoomSnapshotSpec` and `RoomSpec`, and a wrong-arity `Participant` in
`SSESpec`. A compile failure is the expected red here: the field does not exist
yet, so no case can run.

- [x] **Step 3: Add the field and the redaction**

In `RoomSnapshot.scala`, add `hasEstimation` to `Participant` between `voted` and
`estimation`, matching the spec's field order because that order is the JSON key
order:

```scala
  final case class Participant(
      id: UUID,
      name: String,
      voted: Boolean,
      hasEstimation: Boolean,
      estimation: String
  )
```

Replace `of` and the comment above it:

```scala
  // forUser is both the identity this was built for and the only one whose estimation it
  // discloses before the reveal, so redaction and identity cannot disagree.
  def of(data: RoomData, forUser: UUID): RoomSnapshot =
    RoomSnapshot(
      you = forUser,
      currentIssue = data.currentIssue,
      votesRevealed = data.revealed,
      users = data.users
        .sortWith((a, b) => a.id.compareTo(b.id) < 0)
        .map { u =>
          val disclose = data.revealed || u.id == forUser
          Participant(
            id = u.id,
            name = u.name,
            voted = u.voted,
            // From the unredacted value: the client's hidden-value icon reads this, not the string.
            hasEstimation = u.estimation.nonEmpty,
            estimation = if disclose then u.estimation else ""
          )
        }
    )
```

- [x] **Step 4: Run the whole Scala suite**

Run: `sbt scalafmtAll && sbt test`
Expected: PASS, every spec. If `RoomManagerSpec` fails, it is asserting a
participant's estimation somewhere this plan did not find; redact-or-assert is
the same decision as in `RoomSpec` above, and the recipient's own row is the one
that keeps its value.

- [x] **Step 5: Write the failing browser case for the withheld-value icon**

Add the locator to `e2e/fixtures.js`, beside `votedMark` at `:164`:

```js
// The withheld-value icon in the estimation cell, counted rather than asked about for the
// same reason as votedMark: an empty <i> has no size.
export const hiddenMark = row => row.locator('td').nth(2).locator('svg, i')
```

Add `hiddenMark` to the import list at the top of `e2e/room.spec.js`, and add the
case after `'a straggler keeps the votes hidden until Show is pressed'`:

```js
test('a cast vote shows as withheld in the other browser until the reveal', async ({ join }) => {
  const alice = await join('Alice')
  const bob = await join('Bob')

  await vote(alice.page, '5')
  const aliceOnBob = participantRow(bob.page, 'Alice')
  await expect(votedMark(aliceOnBob)).toHaveCount(1)
  // Redaction blanks the estimation, so this marker can only come from hasEstimation.
  await expect(hiddenMark(aliceOnBob)).toHaveCount(1)
  await expect(aliceOnBob).not.toContainText('5')

  await alice.page.getByRole('button', { name: 'Show votes' }).click()
  await expect(aliceOnBob).toContainText('5')
  await expect(hiddenMark(aliceOnBob)).toHaveCount(0)
})
```

- [x] **Step 6: Run it to verify it fails**

Run: `npm run e2e -- --grep "shows as withheld"`
Expected: FAIL in both projects on `hiddenMark` expecting 1 and receiving 0. The
server now sends `""` for Alice's estimation and `showUserEstimation` still reads
that string, so the icon is gone. This is the regression the client change
repairs, and it is why this case is written before it.

- [x] **Step 7: Repoint the client predicate**

In `index.html`, replace `showUserEstimation` at `:507-509`:

```js
        showUserEstimation: function(u) {
          return u.hasEstimation && !this.votesRevealed;
        }
```

`applySnapshot` needs no change. The recipient's own estimation is never
redacted, so `userEstimation` and `ownVoteConfirmed` are unaffected, and the
tally stays as step 1 left it.

- [x] **Step 8: Run both suites to verify they pass**

Run: `npm run e2e`
Expected: PASS in both projects, with the one `test.fail()` case
(`'the tally counts only the votes that were cast'`) still reported as an
expected failure. That annotation belongs to step 3 and must not be touched here.

Run: `npm test`
Expected: PASS. These cover the stub and startup and never parse a room payload.

- [x] **Step 9: Commit**

```bash
git add src/main/scala/com/lunatech/pointingpoker/actors/RoomSnapshot.scala \
        src/test/scala/com/lunatech/pointingpoker/actors/RoomSnapshotSpec.scala \
        src/test/scala/com/lunatech/pointingpoker/actors/RoomSpec.scala \
        src/test/scala/com/lunatech/pointingpoker/sse/SSESpec.scala \
        src/main/resources/pages/index.html e2e/fixtures.js e2e/room.spec.js
git commit -m "feat(protocol): withhold a participant's estimation until the round reveals"
```

---

## Task 2: The confidentiality guard in the browser

Two cases over one helper, both green on arrival. They assert that a straggler
departing does not reveal the round, which is the property step 1's reveal latch
holds and this step turns into a confidentiality guarantee. Declare the greenness
in the PR rather than treating a passing new test as a mistake.

**Files:**
- Modify: `e2e/room.spec.js`

**Interfaces:**
- Consumes: `hiddenMark` from task 1, plus the existing `join`, `vote`,
  `issueBox`, `issueButton`, `participantRow`, `participantRows` and
  `summaryTable` fixtures.
- Produces: nothing other tasks read.

- [x] **Step 1: Write the two cases**

Add to `e2e/room.spec.js`, after
`'an auto-revealed round stays revealed when a straggler arrives'`. The helper
carries the assertions rather than returning, because both cases assert exactly
the same thing and only the departure differs:

```js
// Carol never votes and then leaves, which a re-derived everyone-has-voted predicate would
// answer by revealing the room. Shared so the two departure modes cannot drift apart.
async function stragglerDepartsWithVotesHidden(join, depart, prunedRoster) {
  const alice = await join('Alice')
  const bob = await join('Bob')
  const carol = await join('Carol')
  // Everyone must have seen all three, or the removal assertion below passes on a row that
  // was never rendered.
  for (const page of [alice.page, bob.page]) {
    await expect(participantRows(page)).toHaveCount(3)
  }

  await vote(alice.page, '5')
  await vote(bob.page, '3')
  await expect(summaryTable(alice.page)).toBeHidden()

  await depart(carol, alice)

  // Two commits stand in for the heartbeat 15s away: a dead stream shows only on a failed
  // write. Edits, not votes, since a vote after the prune could reveal the round legitimately.
  for (const issue of ['PP-1', 'PP-2']) {
    await issueButton(alice.page).click()
    await issueBox(alice.page).fill(issue)
    await issueButton(alice.page).click()
    // Bob's box is the proof the publish went out, and therefore that Carol was written to.
    await expect(issueBox(bob.page)).toHaveValue(issue)
  }

  // What the pruned roster looks like differs by departure mode, so each case brings its own.
  await prunedRoster(alice)

  // Both remaining members have voted, reached by a departure rather than by a vote, so the
  // latch must leave the room hidden.
  for (const page of [alice.page, bob.page]) {
    await expect(summaryTable(page)).toBeHidden()
  }
  await expect(participantRow(alice.page, 'Bob')).not.toContainText('3')
  await expect(participantRow(bob.page, 'Alice')).not.toContainText('5')
  await expect(hiddenMark(participantRow(alice.page, 'Bob'))).toHaveCount(1)
}

test('a straggler closing their tab leaves the votes hidden', async ({ join }) => {
  await stragglerDepartsWithVotesHidden(
    join,
    carol => carol.close(),
    // 25s for the reason the leave case above records: if detection ever falls back to the
    // 15s heartbeat the removal lands at about 20.1s, just outside a tighter cap.
    alice => expect(participantRow(alice.page, 'Carol')).toHaveCount(0, { timeout: 25_000 })
  )
})

test('a straggler reloading leaves the votes hidden', async ({ join }) => {
  await stragglerDepartsWithVotesHidden(
    join,
    // created() rejoins from localStorage, so a reload is a departure plus an immediate new
    // participant and /join mints a second id: Carol is listed twice until the prune.
    async (carol, alice) => {
      await carol.page.reload()
      await expect(participantRow(alice.page, 'Carol')).toHaveCount(2)
    },
    // Step 6's idempotent join removes the duplicate, so this count becomes 1 throughout and
    // this expectation is one the step has to revisit.
    alice => expect(participantRow(alice.page, 'Carol')).toHaveCount(1, { timeout: 25_000 })
  )
})
```

- [x] **Step 2: Run them to verify they pass**

Run: `npm run e2e -- --grep "leaves the votes hidden"`
Expected: PASS, four runs across the two projects. A failure on either roster
count is the departure never being noticed, which is a test problem: check that
both issue commits reached Bob. A failure on `summaryTable` being visible is the
real thing these cases exist to catch, and means something re-derives the reveal.

- [x] **Step 3: Run the whole browser suite**

Run: `npm run e2e`
Expected: PASS, with the step 3 `test.fail()` case still expected-failing. The
suite gains about 14 seconds per project, 13.8s in chromium and 14.9s in
firefox, which is worth stating in the PR. Both land inside the existing 6 to 8
second reconnect and departure cluster rather than above it.

- [x] **Step 4: Commit**

```bash
git add e2e/room.spec.js
git commit -m "test(e2e): pin that a straggler's departure reveals nothing"
```

---

## Task 3: Close the known issue and document what is withheld

**Files:**
- Modify: `docs/known-issues.md:287-299`
- Modify: `README.md:6-34`

**Interfaces:**
- Consumes: nothing.
- Produces: nothing other tasks read.

- [x] **Step 1: Remove the known-issues entry**

Delete the whole `### Pre-reveal estimations are broadcast to every participant`
section, its three bullets included. Its own resolution says to remove it when
step 2 lands, and task 1 is that.

Leave every other entry alone. In particular the ghost-participant entry's
paragraph about the tally counting a ghost's vote stays exactly as it is: that
disclosure is post-reveal and step 6 owns it.

- [x] **Step 2: Document the redaction**

In `README.md`, add `hasEstimation` to the JSON example at `:20-27`, keeping the
key order the encoder produces:

```json
        {
            "id": "9f3820e1-37aa-4602-8994-2ce1da8e1e54",
            "name": "John Doe",
            "voted": true,
            "hasEstimation": true,
            "estimation": "5"
        }
```

Then extend the paragraph at `:31-34`, which currently ends with the
`votesRevealed` sentence:

```markdown
`you` is the identity the snapshot was built for, so a client never has to infer
which participant it is. `users` is ordered by `id`, the same order for every
recipient. `votesRevealed` is stored on the server, set by `Show` and by the vote
that completes the round, and cleared by `Clear` and `Re-vote`.

**Each snapshot is redacted for its recipient.** While `votesRevealed` is false,
`estimation` carries a value only for the participant the snapshot was built for
and is `""` for everyone else, so a colleague's vote is not on the wire before
the reveal rather than merely unrendered. `hasEstimation` says that a
participant holds an estimation without saying which, which is what lets a client
mark a withheld vote. `voted` is the confirmed flag, so `voted: false` with
`hasEstimation: true` is a participant who has been asked to re-vote.
```

- [x] **Step 3: Verify no other document claims the old behaviour**

Run: `grep -rn "hidden client-side\|only hidden\|broadcast to every participant" README.md docs/`
Expected: matches only inside
`docs/superpowers/specs/2026-08-31-protocol-target-architecture-design.md` and
the plan files, which are the design record and describe the problem in the past
tense by design. Do not edit the specs.

- [x] **Step 4: Commit**

```bash
git add docs/known-issues.md README.md
git commit -m "docs: record that a snapshot is redacted for its recipient"
```

---

## Verification before opening the PR

- [x] `sbt scalafmtAll && sbt test` passes.
- [x] `npm test` passes.
- [x] `npm run e2e` passes in both projects, with exactly two expected
      failures: the step 3 tally case, reported once per project.
- [ ] `git log --oneline` shows the code commits above plus this plan and its
      corrections, and the branch is still based on
      `20260831.protocol_architecture_1_snapshot`. No count is stated here on
      purpose: it goes stale on every commit, including the ordered rebase that
      lands the stack. Do not rebase or retarget the branch: the stack merges in
      one ordered pass and the base moves then, not now.
- [ ] The PR body states what waits on this (nothing; steps 3 and 5 are its
      independent siblings and step 4 wants both 2 and 3 first), and that task
      2's cases were green on arrival.
