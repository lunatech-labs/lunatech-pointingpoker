# Retained Sessions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep a room's session resolvable past promotion, so a disconnection
that outlasts the grace period recovers on the browser's own retry instead of
telling the user their session has ended.

**Architecture:** `RoomData.pendingSessions` stops being consumed by `joinUser`
and becomes `sessions`, the single authority for resolving a token to an
identity. `ValidateToken` collapses from a map lookup plus a linear scan of
`users` to one map lookup, because the scan only ever existed to find the token's
last record after promotion had eaten the map entry. Nothing else moves: command
authorization keeps scanning `users` by token, which is the membership half of
invariant 6 and is what step 4 rewrites onto `members`.

**Tech Stack:** Scala 3, Pekko typed actors, ScalaTest (`AnyWordSpec` +
`must.Matchers`) with `ActorTestKit`, Playwright against the staged launcher.

**Spec:** `docs/superpowers/specs/2026-08-31-protocol-target-architecture-design.md`,
step 5 at `:1990`. Section 3 owns the `sessions` map and the single-lookup rule
(`:522-533`), invariant 6 owns the two checks (`:293`), section 4's first bullet
owns what retention is for (`:1100-1121`).

**Branch:** `20260831.protocol_architecture_5_retained_sessions`, based on
`main`. The design branch merged long ago, so this one is not stacked and needs
no `rebase --onto`. Steps 0 to 3b have landed; step 4 waits on this one.

## Global Constraints

- **Everything is built against today's `RoomData`.** `RoomState`, `Round`,
  `members` and `connections` arrive at step 4. `sessions` therefore sits beside
  `users` on `RoomData`, and `Member` does not exist yet.
- **Sessions carry no TTL and no expiry check.** The spec dropped both. A session
  lives as long as the actor, whose lifetime step 4 bounds. Do not add a sweeper,
  a timestamp, or a size cap.
- **Resolving a token and being allowed to act stay two checks.** This step
  changes only the first. `Vote`, `ClearVotes`, `ReVote`, `ShowVotes` and
  `EditIssue` keep finding their user in `users`, which is what makes a resolved
  non-member a no-op. Rewriting them onto `sessions` here would let anyone who
  ever joined act on a room they have left.
- **The vote does not survive grace expiry, and this step does not make it.**
  `ConfirmLeave` removes the `User`, so a reconnect after the window rejoins with
  an empty vote. Estimates outliving membership is step 4, where they move to
  `round.estimates`. Do not assert vote survival anywhere in this step.
- **Comments are one or two lines.** Never a multi-line block, including for
  non-obvious rationale. Longer context belongs in the commit message.
- **Conventional Commits**, and documentation commits are `docs:`, never `doc:`.
- **No em dash in any document.**
- `scalafmt` runs at 100 columns. Run `sbt scalafmtAll` before any commit that
  touches Scala.

---

## File Structure

**Server, modified:**

- `src/main/scala/com/lunatech/pointingpoker/actors/Room.scala` `PendingSession`
  becomes `Session`, `pendingSessions` becomes `sessions`, `joinUser` stops
  removing the promoted token, and `ValidateToken` resolves from the map alone.
  That is the whole production change, in one file.

**Tests, modified:**

- `src/test/scala/.../actors/RoomSpec.scala` Two cases invert (the promotion case
  now asserts retention, and a new one resolves a token after grace expiry), one
  is given the session it was relying on the scan to invent, and the helper
  object gains `sessionsFor`.
- `e2e/room.spec.js` One case: a cut that outlasts the grace period recovers on
  the retry, with the same identity and no reload.

**Docs, modified:**

- `docs/known-issues.md` The forced-reload entry goes. The pending-session leak
  entry is re-pitched around retention, which widens it from abandoned tabs to
  every session a room mints, and stays open for step 4. The stale-citation entry
  records this step's sweep.
- `docs/superpowers/specs/2026-08-31-protocol-target-architecture-design.md`
  A landed-state note on step 5 and on the section 3 sentence that argues from
  the scan, plus the `Room.scala` citations this step shifts.
- `README.md` The cookies section says how long a session lives and what that
  buys a dropped connection.

`docs/roadmap.md` is not touched. Retained sessions are not a roadmap item; they
are plumbing under Phase 1's identity work, which is already checked off.

### Why the tasks are ordered as they are

Task 1 is one task and not two, though it carries a rename. The rename is not an
independent improvement: `pendingSessions` names a distinction the retention
deletes, and a reviewer reading `pendingSessions` that is never cleared has been
handed a bug report rather than a design. It is a separate commit inside the task
so the behaviour diff stays readable.

Task 2 is the only place the fix is visible as a user outcome. Every Room-level
case in task 1 asserts on `TokenResolution`, which is one hop from what the user
meets: a 401, `EventSource` giving up, and a terminal banner. It goes second
because it is red until task 1 lands and cannot be written any earlier.

Task 3 waits on both because the citation sweep it owes has to run against final
line numbers, and because the known-issue it removes is only false once the
browser case says so.

---

## Deviations from the plan, and why

Listed so a reviewer can reject one without re-deriving it.

1. **Task 1's grace-expiry case characterized nothing as planned, and was
   rewritten before review.** The planned case seeded `sessions` directly and
   never called `Join`, so promotion never consumed the entry and the case passed
   against the unfixed server: it would still pass with retention reverted. The
   landed case drives `RequestSession`, then `Join`, then `Leave` past the grace
   period, which is the sequence production actually walks, and its red was proven
   under a temporary revert of both production hunks. It keeps a second seeded
   member only so the room does not stop when the departing one goes.

   One knock-on: this plan's task 1 step 7 gives `sessionsFor` a seeding-site
   count. The corrected case mints Alice's session rather than seeding it, and a
   later case added a site, so take the count out rather than restate it. See
   deviation 6.

2. **Task 2's case forces detection rather than waiting for it.** The planned
   20 second timeout was not enough: in a quiet room a cut participant took about
   35.5 seconds to disappear, deterministic to 2ms across two runs, because
   detection of a dead stream rides on the room's own traffic and two 15 second
   heartbeat writes have to fail before the 4 second grace period starts. Raising
   the timeout to 40 seconds would have left 4.5 seconds of headroom on a loaded
   CI machine. Instead the case votes and clears immediately after the cut, which
   is what `departureWhileCut` already does for the same reason, taking the wait
   to about 5 seconds under an unchanged 20 second timeout. The case runs in
   roughly 7 seconds.

3. **Task 3 added a known-issues entry this plan did not schedule.** The entry it
   deletes was also the only record that detection is unbounded in a quiet room,
   which this step does not fix and step 6's beacon will not fix either, since a
   beacon only covers a page discarded deliberately. That fact is now its own
   entry, with task 2's measurement behind it rather than the original hand-wavy
   prose.

4. **Task 3's sweep covered four citations older than this branch.** They were
   stale before task 1 shifted anything, and this plan's step 3 did not list them.
   They were fixed anyway: the sweep note this task adds claims the file was
   swept, and leaving four known-stale citations in it would have made that note
   untrue. All four resolved against the design's original baseline rather than
   guessed at.

5. **This plan's step 7 grep expectation for "session has ended" was wrong.** It
   predicted no match in `docs/known-issues.md`; a pre-existing match sits in an
   unrelated open entry and claims nothing stale. No tree change.

6. **This plan's step 3 gave a citation count, and should not have.** It said the
   grep returns twelve sites; it returns fifteen lines carrying sixteen pointers.
   `docs/known-issues.md`'s own stale-citation entry warns against exactly this:
   "No totals are given here on purpose. Three review rounds produced a different
   count each time, and the count was never what a sweep needed." A future step's
   plan should name the rules and skip the total.

7. **Task 1 gained a test this plan did not schedule.** `RoomSpec.scala:483-516`
   refuses all five commands from a token whose member was removed at grace
   expiry, with six lines added alongside it in `e2e/room.spec.js`. It was added
   because the global constraint it guards, that resolving a token and being
   allowed to act stay two checks, had no executable guard: every other case would
   have stayed green with a command rewritten onto `sessions`. It compares whole
   `RoomData` before and after each command, so it catches a regression on any of
   the five rather than sampling one.

8. **Task 3 step 6 rewrote a README paragraph it scoped as needing no edit.** The
   step inserts a paragraph between `:75-80` and `:82`, and names only the restart
   paragraph as needing none. The identity-spoofing paragraph at `:82` was
   rewritten too, because retention makes its claim half true: the cookie no
   longer only prevents acting without ever having joined, now that a removed
   member's token still resolves. It says instead that holding the token is enough
   to rejoin as that identity but not to act as it.

9. **Task 3 step 3 renumbered `:1795`, which its own rule 3 lists as historical.**
   Rule 2 beats rule 3 where the sentence is a present-tense claim about live code
   rather than a statement of what the step changed. `:1795` says `reVote()` keeps
   `estimation`, which is true of the file today, so its pointer was corrected to
   `Room.scala:97-99` while the neighbouring step 1 pointers stayed put. Step 4's
   sweeper should read rule 3 as scoped to claims about what a step changed, not
   to every pointer sitting inside a step's paragraph.

10. **Task 3's sweep ran over `docs/known-issues.md` as well as the design.** Step
    3 is scoped to the design's citations and step 5 asks only that the sweep be
    recorded. Eight pointers in `docs/known-issues.md` were stale by the same
    diff, five into `Room.scala` and three into the design, and the sweep note
    this task adds would have been untrue with them left in place. Same reasoning
    as deviation 4.

---

## Task 1: Retain the session past promotion

**Files:**
- Modify: `src/main/scala/com/lunatech/pointingpoker/actors/Room.scala:58`,
  `:60-79`, `:210-218`
- Test: `src/test/scala/com/lunatech/pointingpoker/actors/RoomSpec.scala:381-444`,
  `:598-618` (the helper object)

**Interfaces:**
- Consumes: `Room.SessionToken`, `Room.User`, `Room.RoomData`,
  `Room.ValidateToken(token, replyTo)`, `Room.Resolved(userId, name)`,
  `Room.Unresolved`, `Room.RequestSession(name, replyTo)` and
  `Room.SessionMinted(userId, token)`, all unchanged from step 1.
- Produces:
  - `Room.Session(userId: UUID, name: String)`, replacing
    `Room.PendingSession` under the same field order.
  - `RoomData.sessions: Map[SessionToken, Session] = Map.empty`, replacing
    `pendingSessions`. Same position in the parameter list, so
    `RoomData.empty.copy(sessions = ...)` is the only way tests seed it.
  - `RoomData.registerSession(token: SessionToken, userId: UUID, name: String): RoomData`
    unchanged in signature.
  - `RoomData.joinUser(user: User): RoomData` unchanged in signature, no longer
    touching the session map.
  - `RoomSpec.sessionsFor(users: Room.User*): Map[Room.SessionToken, Room.Session]`,
    a test helper that seeds one session per user.

- [ ] **Step 1: Write the failing tests**

Two new assertions, plus one preparatory edit. All three are written against
today's `pendingSessions` name, so the red they produce is an assertion failure
rather than a compile error. The rename lands at step 5 of this task.

First the preparatory edit, which is green before and after. `RoomSpec.scala:410-418`
resolves a token that was never minted by `RequestSession`, and passes today only
because `ValidateToken` falls through to a scan of `users`. That scan is what
this task deletes, so give the case the session that production would always
have. Replace the whole case with:

```scala
    "resolve a token whose member is connected" in {
      val (user, _)    = createUser(UUID.randomUUID(), "user1", false, "")
      val resultProbe  = testKit.createTestProbe[Room.TokenResolution]()
      val (_, roomRef) = createRoom(
        UUID.randomUUID(),
        RoomData.empty.copy(users = List(user), pendingSessions = sessionsFor(user))
      )

      roomRef ! Room.ValidateToken(user.token, resultProbe.ref)

      resultProbe.expectMessage(Room.Resolved(user.id, user.name))
    }
```

Add the helper it needs to `object RoomSpec`, after `createUser`:

```scala
  def sessionsFor(users: Room.User*): Map[Room.SessionToken, Room.PendingSession] =
    users.map(u => u.token -> Room.PendingSession(u.id, u.name)).toMap
```

Now the first failing case. Replace `RoomSpec.scala:429-444`, currently titled
`"clear the pending session once Join promotes it to a member"`, with its
inverse:

```scala
    "keep the session once Join promotes it to a member" in {
      val sessionProbe = testKit.createTestProbe[Room.SessionMinted]()
      val dataProbe    = testKit.createTestProbe[Room.DataStatus]()
      val userProbe    = TestProbe()(testKit.system.classicSystem)
      val (_, roomRef) = createRoom(UUID.randomUUID(), RoomData.empty)

      roomRef ! Room.RequestSession("Alice", sessionProbe.ref)
      val minted = sessionProbe.expectMessageType[Room.SessionMinted]

      roomRef ! Room.Join(Room.User(minted.userId, "Alice", false, "", userProbe.ref, minted.token))
      roomRef ! Room.GetData(dataProbe.ref)

      val data = dataProbe.expectMessageType[Room.DataStatus]
      // Retained, so the member entry is no longer the token's only record.
      data.data.pendingSessions.get(minted.token) mustBe Some(
        Room.PendingSession(minted.userId, "Alice")
      )
      data.data.users.map(_.id) must contain(minted.userId)
    }
```

Then the case that is the point of the step, added directly after it. Two
participants and not one, because a room whose last member leaves stops, and a
token cannot resolve against an actor that is gone. That is step 4's
stop-after-idle, not this step's retention:

```scala
    "resolve a token whose member was removed at grace expiry" in {
      val (user, _)         = createUser(UUID.randomUUID(), "user1", false, "")
      val (user2, _)        = createUser(UUID.randomUUID(), "user2", false, "")
      val resultProbe       = testKit.createTestProbe[Room.TokenResolution]()
      val responseProbe     = testKit.createTestProbe[Room.Response]()
      val (roomId, roomRef) = createRoom(
        UUID.randomUUID(),
        RoomData.empty.copy(
          users = List(user, user2),
          pendingSessions = sessionsFor(user, user2)
        ),
        gracePeriod = 50.millis
      )

      roomRef ! Room.Leave(user.id, user.ref, responseProbe.ref)
      // Running is the confirmation that ConfirmLeave fired and removed the member while the
      // room stayed up, which is the state a reconnect past the window actually arrives in.
      responseProbe.expectMessage(Room.Running(roomId))

      roomRef ! Room.ValidateToken(user.token, resultProbe.ref)

      resultProbe.expectMessage(Room.Resolved(user.id, user.name))
    }
```

- [ ] **Step 2: Run the tests and watch them fail for the right reason**

Run: `sbt "testOnly com.lunatech.pointingpoker.actors.RoomSpec"`

Expected: exactly two failures.

- `"keep the session once Join promotes it to a member"` fails on
  `None was not equal to Some(PendingSession(...))`, because `joinUser` removes
  `user.token` from the map (`Room.scala:74`).
- `"resolve a token whose member was removed at grace expiry"` fails on
  `Unresolved was not equal to Resolved(...)`: the map entry went at promotion
  and the `users` scan has nothing left to find.

`"resolve a token whose member is connected"` must pass. If it fails, the helper
or the seeding is wrong, not the production code.

- [ ] **Step 3: Retain the session in `joinUser`**

In `Room.scala:66-76`, drop the map edit from the copy. The method keeps its
comment and its `end` marker:

```scala
    def joinUser(user: User): RoomData =
      // ConnectToRoom rebuilds the User with an empty vote, so keep the stored one; only
      // ref actually differs on a reconnect, there being no rename feature.
      val kept = this.users
        .find(_.id == user.id)
        .fold(user)(old => user.copy(voted = old.voted, estimation = old.estimation))
      this.copy(users = kept :: this.users.filterNot(_.id == user.id))
    end joinUser
```

- [ ] **Step 4: Make `ValidateToken` one lookup**

Replace `Room.scala:210-218` with:

```scala
        case ValidateToken(token, replyTo) =>
          // The map is the single authority now that it is retained: a member removed at
          // grace expiry still resolves, which is what makes their retry a rejoin, not a 401.
          val resolution = data.pendingSessions.get(token) match
            case Some(session) => Resolved(session.userId, session.name)
            case None          => Unresolved
          replyTo ! resolution
          Behaviors.same
```

The scan of `users` goes. It is safe to delete because every token that reaches
this actor was minted by its own `RequestSession`, so the map is a superset of
what the scan could find once nothing consumes entries. A token from a room that
has since stopped resolves nowhere either way.

- [ ] **Step 5: Run the tests and watch them pass**

Run: `sbt "testOnly com.lunatech.pointingpoker.actors.RoomSpec"`
Expected: PASS, all cases.

Then the rest of the suite, since `RoomData` is constructed in four spec files:

Run: `sbt test`
Expected: PASS.

- [ ] **Step 6: Commit the behaviour**

```bash
sbt scalafmtAll
git add src/main/scala/com/lunatech/pointingpoker/actors/Room.scala \
        src/test/scala/com/lunatech/pointingpoker/actors/RoomSpec.scala
git commit -m "feat(protocol): keep a session resolvable past promotion"
```

- [ ] **Step 7: Rename the map for what it now holds**

A pure rename, in one pass over `Room.scala` and `RoomSpec.scala`:

- `final case class PendingSession(userId: UUID, name: String)` becomes
  `final case class Session(userId: UUID, name: String)`.
- `pendingSessions: Map[SessionToken, PendingSession] = Map.empty` becomes
  `sessions: Map[SessionToken, Session] = Map.empty`, in the same position.
- `registerSession`'s body becomes
  `this.copy(sessions = this.sessions + (token -> Session(userId, name)))`.
- `ValidateToken` reads `data.sessions.get(token)`.
- In `RoomSpec.scala`, `sessionsFor` returns
  `Map[Room.SessionToken, Room.Session]`, the three seeding sites pass
  `sessions = ...`, and the two assertion sites read `data.data.sessions`.
- Retitle `"mint a session and store it as pending on RequestSession"` to
  `"mint a session and store it on RequestSession"`, and `"resolve a pending
  session by token"` to `"resolve a session minted for a tab that has not
  connected"`. Both keep their bodies apart from the field name.

Run: `grep -rn "pendingSessions\|PendingSession" src/`
Expected: no matches.

- [ ] **Step 8: Run the tests and commit the rename**

Run: `sbt scalafmtAll && sbt test`
Expected: PASS. A rename that changes a result means step 7 was not a rename.

```bash
git add src/main/scala/com/lunatech/pointingpoker/actors/Room.scala \
        src/test/scala/com/lunatech/pointingpoker/actors/RoomSpec.scala
git commit -m "refactor(protocol): name the session map for what it now holds"
```

---

## Task 2: The recovery a user can see

**Files:**
- Test: `e2e/room.spec.js`, after `"a vote survives its own reconnect"` at `:399-416`

**Interfaces:**
- Consumes: `join`, `connectionAlert`, `connectionLost`, `participantRow`,
  `participantRows`, `votedMark` and `vote` from `e2e/fixtures.js`, all already
  imported by `room.spec.js:1-18`. `participant.cut()` and `participant.restore()`
  come from the `join` fixture (`e2e/fixtures.js:115-121`).
- Produces: nothing other tasks read.

- [ ] **Step 1: Write the case**

The existing `departureWhileCut` helper (`room.spec.js:109-134`) cuts Bob and
restores him, but it waits only for *Carol's* removal, which starts on a clock
that began before Bob was cut, so Bob is back inside his own grace window and no
case in the suite covers a reconnect past it. This one waits for Bob's own row
to disappear from Alice's list, which is the grace period expiring by definition.

Add to `e2e/room.spec.js`:

```js
test('a disconnection outlasting the grace period comes back without a reload', async ({
  join
}) => {
  const alice = await join('Alice')
  const bob = await join('Bob')

  await bob.cut()
  await expect(connectionLost(bob.page)).toBeVisible()
  // Bob's own row going is the grace period expiring, which is what this case needs and what
  // departureWhileCut's reconnect stays inside: restoring sooner would prove nothing.
  await expect(participantRow(alice.page, 'Bob')).toHaveCount(0, { timeout: 20_000 })

  await bob.restore()
  // Any alert, not just the transient one: a consumed session ends here on the terminal
  // "session has ended" banner, which is also an alert and would pass a filtered assertion.
  await expect(connectionAlert(bob.page)).toBeHidden({ timeout: 10_000 })

  // One row and not two: the retained session brings Bob back under the id he already had.
  await expect(participantRow(alice.page, 'Bob')).toHaveCount(1, { timeout: 10_000 })
  await expect(participantRows(bob.page)).toHaveCount(2, { timeout: 10_000 })

  // A frame arriving after the reconnect, since the alert clearing is only onopen firing.
  await vote(alice.page, '5')
  await expect(votedMark(participantRow(bob.page, 'Alice'))).toHaveCount(1, { timeout: 10_000 })
})
```

Two participants, for the same reason task 1's case has two: with one, the room
stops when its last member's grace expires and the token resolves against
nothing. Nothing here asserts Bob's vote, because it does not survive his
removal until step 4.

- [ ] **Step 2: Watch it fail against the pre-task-1 server**

The staged binary now carries task 1, so build one without it:

Run: `git stash push src/main/scala/com/lunatech/pointingpoker/actors/Room.scala && npm run e2e -- -g "outlasting the grace period"`
Expected: FAIL in both projects, at
`await expect(connectionAlert(bob.page)).toBeHidden(...)`, with the page showing
"Your session has ended. Please reload the page to rejoin."

Run: `git stash pop`

If the stash leaves the tree dirty in any other file, stop and resolve it before
going on: `npm run e2e` restages the app from whatever is in the tree.

- [ ] **Step 3: Run it against the fix**

Run: `npm run e2e -- -g "outlasting the grace period"`
Expected: PASS in both chromium and firefox.

Run it twice. The case turns on a 4 second grace period from the test profile
(`testkit/app.js:21`) against a 200ms retry, and a case that only passes on a
quiet machine is worse than no case.

- [ ] **Step 4: Run the whole browser suite**

Run: `npm run e2e`
Expected: PASS, no expected failures. Steps 1 and 3 emptied the `test.fail()`
ledger, so anything red here is a regression from task 1.

- [ ] **Step 5: Commit**

```bash
git add e2e/room.spec.js
git commit -m "test(e2e): recover a disconnection that outlasts the grace period"
```

---

## Task 3: Close the issue, sweep what moved

**Files:**
- Modify: `docs/known-issues.md:54-73`, `:237-261`, `:443-506`
- Modify: `docs/superpowers/specs/2026-08-31-protocol-target-architecture-design.md:524`, `:1990-1993`
- Modify: `README.md:75-80`

**Interfaces:**
- Consumes: nothing.
- Produces: nothing other tasks read.

- [ ] **Step 1: Remove the entry this step closes**

Delete the whole `### A disconnection outlasting the grace period forces a page
reload` section from `docs/known-issues.md` (`:237-261`), its three bullets
included. Its own resolution says to remove it when step 5 lands.

`src/main/resources/pages/index.html:449-462` needs no edit. Its `onerror`
comment attributes the terminal 401 to the room having been reaped, which the
deleted entry called out as the rarer of two causes. Retention removes the other
one, so the comment is now simply correct.

- [ ] **Step 2: Re-pitch the leak entry around retention**

`docs/known-issues.md:54-73` is phrased around a pending/promoted distinction
this step deletes, and retention widens what it describes: not just abandoned
tabs, but every session a room ever mints. Replace the whole section with:

```markdown
### Every session a room mints lives as long as the room does

- **Where:** `src/main/scala/com/lunatech/pointingpoker/actors/Room.scala`
  (`RoomData.sessions`, `registerSession`).
- **Issue:** Same shape as the room-level GC issue above, one level deeper. A
  `Session` created by `RequestSession` (backing `/join`) is never removed. Step
  5 retains it past promotion, so that a member removed at grace expiry can still
  reconnect, and it deliberately adds no TTL. A room therefore accumulates one
  entry per `/join` it ever answered: tabs that connected, tabs that failed
  between `/join` and `/events`, and people who joined and left hours ago.
- **Resolution:** Scheduled as step 4 of
  `docs/superpowers/specs/2026-08-31-protocol-target-architecture-design.md`,
  which replaces stop-when-empty with stop-after-idle, so a room's sessions go
  with it two to four hours after its last connection instead of living for the
  process. A TTL was considered there and dropped: its useful range is squeezed
  below by needing to outlast a realistic in-meeting outage and above by the idle
  stop, and what it would reclaim is a hundred bytes per abandoned session. What
  is left after step 4 is a room held open for hours with heavy tab churn, which
  is abuse-shaped and belongs to the rate-limiting entry below. Remove this entry
  when step 4 lands.
```

- [ ] **Step 3: Sweep the design's `Room.scala` citations**

Task 1 shifts every line below `joinUser` in `Room.scala` and deletes the code
two citations describe. Run:

Run: `grep -n "Room\.scala:" docs/superpowers/specs/2026-08-31-protocol-target-architecture-design.md`

Twelve sites come back. Three rules, from the traps recorded at
`docs/known-issues.md:443`:

- **Verify the claim, not just the line.** A citation landing on plausible code
  whose sentence is now false is the failure mode that caught the step 2 sweep.
- **Renumber only present-tense claims about live code.** `:547`'s list
  (`Room.scala:141`, `152`, `163`, `174`, `227`) is the command path's
  `data.users.find(_.token == token)`, which survives this step and moves by a
  line or two. Renumber it to where those five sites actually sit.
- **Leave deliberately historical citations where they are.** `:111` describes
  the pre-step-2 leak on purpose, and `:1781`, `:1795`, `:1809`, `:1826`,
  `:1830` and `:1850` sit inside step 1's own paragraph listing what step 1
  changed. Renumbering those would make the prose false rather than current.

One citation needs an annotation rather than either treatment. `:524` reads
"Today it takes two (`Room.scala:236-243`): a lookup in `pendingSessions`, then a
linear scan of `users` by token". That code no longer exists, and the sentence is
the argument for why retention is a precondition, so it keeps its historical
citation and gains a note in the same voice the step 2 and step 3 sweeps used:

```markdown
Landed at step 5: the scan is gone and `ValidateToken` is the single lookup this
paragraph specifies. The citation is to the pre-step-5 file, which is what the
argument is about.
```

- [ ] **Step 4: Annotate step 5 in the design**

Append to the step 5 paragraph at `:1990-1993`, matching how steps 1 and 3
annotate rather than re-tense:

```markdown
Landed. `sessions` is retained past promotion and is the single authority
`ValidateToken` reads; the `users` scan went with it. `e2e/room.spec.js` pins the
outcome with a cut that outlasts the grace period and recovers on the retry, and
`docs/known-issues.md` lost the forced-reload entry. The pending-session leak
entry stayed open and was re-pitched around retention, which widened it from
abandoned tabs to every session a room mints.
```

- [ ] **Step 5: Record the sweep**

In `docs/known-issues.md`'s `### The target design's citations and step claims go
stale as its steps land`, add one sentence to the paragraph that tracks which
sweeps have run, after the step 3 sentence:

```markdown
Step 5 swept the `Room.scala` citations, renumbering the command-path list its
own diff shifted and annotating the `ValidateToken` sentence whose code it
deleted.
```

Leave the resolution bullet alone. `RoomManager.scala`, `SSE.scala` and
`API.scala` are still unverified, and this step touched none of them.

- [ ] **Step 6: Say in the README how long a session lives**

In `README.md`, after the cookies paragraph at `:75-80` and before the
identity-spoofing paragraph at `:82`, add:

```markdown
The session outlives any single connection. `/join` mints it and the room keeps
it for as long as the room itself lives, so a drop that outlasts the grace period
removes the participant from the list but leaves their token resolvable: the
browser's own `EventSource` retry rejoins under the same identity, with no reload
and no second entry in the list. Their vote does not survive that window, since
it is held against their membership.
```

The restart paragraph at `:202-211` needs no edit: a restart still takes every
session with it, which is why its 401 and its terminal banner are still what a
tab meets.

- [ ] **Step 7: Verify no document still claims the old behaviour**

Run: `grep -rn "pendingSessions\|PendingSession" docs/ README.md`
Expected: matches only in `docs/superpowers/plans/2026-08-20-*`,
`docs/superpowers/plans/2026-08-31-protocol-architecture-1-snapshot.md`,
`docs/superpowers/specs/2026-08-20-*`, `docs/superpowers/specs/2026-08-26-*`,
`docs/superpowers/specs/2026-08-28-*`, and `:532` of the target design, which
credits 08-20 with putting the name on `PendingSession`. Delivered plans and
frozen specs are records of what was true when written and are not edited.

Run: `grep -rn "session has ended" docs/ README.md`
Expected: `README.md:205` (the restart paragraph, still true) and the design's
own passages about the terminal path. No entry in `docs/known-issues.md`.

- [ ] **Step 8: Commit**

```bash
git add docs/known-issues.md README.md \
        docs/superpowers/specs/2026-08-31-protocol-target-architecture-design.md
git commit -m "docs: close the forced-reload issue and record how long a session lives"
```

---

## Verification before opening the PR

- [ ] `sbt scalafmtAll && sbt test` passes.
- [ ] `npm test` passes.
- [ ] `npm run e2e` passes in both chromium and firefox, with no expected
      failures. The `test.fail()` ledger has been empty since step 3.
- [ ] `grep -rn "pendingSessions\|PendingSession" src/` returns nothing.
- [ ] `git log --oneline` shows this plan plus the commits the tasks above
      specify, and the branch is based on `main`. No count here on purpose; see
      deviation 6.
- [ ] The PR body says that step 4 waits on this one, and why: `Member` carries
      no token, so resolution has to live in `sessions` before the state split
      lands or every reconnect becomes a 401.
- [ ] Do not merge without confirming no rooms are live. A merge to `main`
      auto-deploys, which restarts the server and ends every session in progress.
