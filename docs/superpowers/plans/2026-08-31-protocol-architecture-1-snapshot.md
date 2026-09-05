# Snapshot Protocol Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the eight-message event protocol with one complete-state
`RoomSnapshot` published per recipient, and close the four defects that only a
snapshot can close.

**Architecture:** The room actor stops broadcasting deltas and starts publishing
its whole state. `RoomSnapshot.of(data, forUser)` is the single place room state
is serialized, `publish` sends one snapshot per user, and the client replaces
eight event handlers with one pure `applySnapshot` that returns the next view
state. Reveal becomes a stored latch on `RoomData` instead of a predicate the
client re-derives, and a reconnect stops resetting the reconnecting
participant's vote.

**Tech Stack:** Scala 3, Pekko typed actors, Pekko HTTP with
`EventStreamMarshalling`, circe, ScalaTest (`AnyWordSpec` + `must.Matchers`),
Vue 2 loaded from a CDN in a single inline script, Playwright, `node --test`.

**Spec:** `docs/superpowers/specs/2026-08-31-protocol-target-architecture-design.md`,
step 1 at `:1575`. Section 2 owns the wire format, section 3 the `publish` shape
and the latch, section 5 the client, section 6 the testing.

**Branch:** `20260831.protocol_architecture_1_snapshot`, based on
`20260831.protocol_architecture_0_playwright` at `a19e57f`. The stack is not
rebased or merged by this plan.

## Global Constraints

- **Everything is built against today's `RoomData`.** `RoomState`, `Round`,
  `members` and `connections` arrive at step 4 and section 3 is written entirely
  in their terms. Do not introduce them here. A user has exactly one `ref`,
  because `joinUser` replaces the whole entry.
- **A field with no consumer does not travel.** `hasEstimation` is step 2,
  `history` is step 9, `version`, `roomId`, `scale` and `role` are never added.
  Do not put them on `RoomSnapshot`.
- **The tally keeps counting every participant.** The voted-only filter is step 3
  and lands with the template guard it requires. Shipping it here turns Show in a
  room where nobody voted into a render error.
- **Reveal is a latch, never re-derived at publish time.** Only `ShowVotes` and a
  `Vote` that completes the round may set it. `clear()` and `reVote()` clear it.
- **Problem C is not in this step.** It moves to step 4. Do not re-key the
  `ConfirmLeave` timer.
- **Redaction is not in this step.** `RoomSnapshot.of` takes `forUser` because
  `you` needs it, and every participant's `estimation` still travels. Step 2 adds
  the withholding.
- **Comments are one or two lines.** Never a multi-line block, including for
  non-obvious rationale. Longer context belongs in the commit message.
- **Conventional Commits**, and documentation commits are `docs:`, never `doc:`.
- **No em dash in any document.**
- `scalafmt` runs at 100 columns. Run `sbt scalafmtAll` before any commit that
  touches Scala.

---

## File Structure

**Server, created:**

- `src/main/scala/com/lunatech/pointingpoker/actors/RoomSnapshot.scala` The wire
  type, its `Participant` projection, their circe encoders, and
  `RoomSnapshot.of`. One responsibility: turning room state into the thing that
  reaches a named recipient. It is the only place room state is serialized, which
  is what makes step 2's redaction a change in one function.

**Server, modified:**

- `actors/Room.scala` `RoomData` gains `revealed` and loses `issueLastEditBy`;
  `joinUser` preserves vote state; `publish` replaces `broadcast`;
  `setupNewUser` goes.
- `actors/RoomManager.scala` The `BufferOverflowException` branch of
  `ConnectionFailure` goes, leaving the generic error log.
- `sse/SSE.scala` Element type becomes `RoomSnapshot`, `mapConcat` goes,
  `OverflowStrategy.fail` becomes `dropHead`.
- `API.scala` The SSE route gains `Cache-Control: no-cache` and
  `X-Accel-Buffering: no`.

**Server, deleted:**

- `actors/RoomEvent.scala` (65 lines). Its `MessageType` companion's
  `apply`/`unapply` pair goes with it.

**Client, modified:**

- `src/main/resources/pages/index.html` The eight event handlers become one
  `applySnapshot` call, the editable issue input gains focus and blur handlers,
  `updateSummary` and `allVoted` go, and the page stops remembering its own
  `userId`.

**Tests, modified:**

- `src/test/scala/.../actors/RoomSpec.scala` Event assertions become snapshot
  assertions. New cases for the latch and for vote survival.
- `src/test/scala/.../actors/RoomManagerSpec.scala` Gains the reconnect case
  driven through `ConnectToRoom`, which is the path that actually resets a vote.
- `src/test/scala/.../sse/SSESpec.scala` The batching case goes with `mapConcat`,
  and the overflow case inverts to `dropHead`.
- `src/test/scala/.../APISpec.scala` Gains the anti-buffering header assertion.
- `e2e/room.spec.js` Four `test.fail()` annotations go, and four cases are added
  at task 6. Deviation 2 adds a fifth and extends one of the four.

**Testkit, modified, per deviation 1:**

- `package.json` `pretest` and `pree2e` hooks stage before either suite runs.
- `.github/workflows/ci.yml` Loses its own stage step, and runs `npm test`.
- `testkit/app.js`, `test/startup.test.js` The staleness guard and its case,
  added and then removed within this branch.

**Tests, deleted:**

- `src/test/scala/.../actors/BackpressureReconnectSpec.scala` (124 lines). Its
  single case asserts the `fail` behaviour `dropHead` deletes. Its replacement is
  the opposite assertion and lands in `SSESpec`.

**Docs, modified:**

- `README.md` The messaging section describes a snapshot, and the empty
  deployment section gains the proxy-buffering note.
- `docs/known-issues.md` Four entries removed.
- `docs/roadmap.md` One Phase 4 item checked off.

### Why the tasks are ordered as they are

Task 4 is the only irreducible one. The server's element type, the client's
handlers and the deletion of `RoomEvent` are one change seen from two ends, so
they cannot be split without a commit where the app does not work. Tasks 2 and 3
exist to shrink it: both are additive, both leave every test green, and both are
things task 4 would otherwise carry.

**Declare this rather than discover it: between task 4 and task 5 the browser is
broken.** `sbt test` is green at the end of task 4 and `npm test` is unaffected
throughout, but the page still parses `messageType` and the server no longer
sends it, so `npm run e2e` fails. Task 5 restores it. That window is inside the
branch and never reaches `main`, which squash-merges.

---

## Deviations from the plan, and why

Each of these is a decision this plan did not anticipate. They are listed so a
reviewer can reject one without re-deriving it.

1. **`npm test` and `npm run e2e` stage before they run**, against this plan's own
   file list, which touches `package.json`, `testkit/app.js`,
   `test/startup.test.js`, the README and the CI workflow. The harness runs the
   staged launcher, not `sbt run`, so a client change that is never restaged is
   tested in its previous form and the suite reports green on code that is not
   under test. Task 5 is a client-only task, which is exactly where that silently
   costs a real result.

   **This landed twice, and the first answer was wrong.** It first shipped as a
   guard: `startApp` compared the newest mtime under `src/main`, `build.sbt` and
   `project` against the launcher and refused with the restage command rather
   than rebuilding, on the grounds that a test run silently invoking `sbt` would
   turn a 3 second suite into a minute on a cold build. Two things undid that.
   The measured cost of a no-op stage is 4.4 seconds, not a minute. And the
   guard's own test had to make the real source tree look stale for the duration
   of one `startApp` call, which `node --test` can overlap with
   `reproduction.test.js`'s own `startApp` in a parallel worker: measured at 2
   failures in 36 runs, each one reporting a stale stage against whichever case
   was unlucky. Staging from an npm pre-hook makes staleness unrepresentable
   instead of detectable, so the guard, its test and that flake are all gone. The
   cost is about 4 seconds per `npm test`, which the product owner accepted on
   2026-09-05 on the grounds that it is a fixed cost against a suite that will
   grow. `node --test` or `npx playwright test` invoked directly still skip the
   hook, which the README now says.
2. **A fifth browser case, and a follow-up assertion on one of task 6's four.**
   Task 5 step 1's focus guard has no reset other than a `blur` event, and
   `doEdit` removes the focused input by setting `editing` false. Browsers fire no
   blur when a focused element leaves the DOM, so the guard survives the commit
   and `applySnapshot` returns `prev.currentIssue` for the rest of the session,
   which is the freeze the known-issues entry says the focus guard was chosen to
   avoid. On Linux and Windows the mousedown on the commit button blurs first and
   hides this; on macOS, where clicking a button moves no focus, it does not.
   `doLeave` strands the flag the same way across a rejoin. Both now clear it.
   Task 6's committed-edit case could not catch this, because Alice's own typed
   value reads the same whether the snapshot applied or was blocked, so it gains a
   follow-up edit by the other browser. The new case commits through
   `dispatchEvent('click')`, which carries no mousedown and therefore reproduces
   the macOS sequence on any platform: it failed in both engines before the fix
   and passes after.

---

## Task 1: Anti-buffering headers and the deployment note

Independent of the protocol change, so it goes first and can be reviewed on its
own. It closes the "SSE reverse-proxy buffering is undocumented" known issue.

**Files:**
- Modify: `src/main/scala/com/lunatech/pointingpoker/API.scala:125-135`
- Modify: `README.md:164` (the `### Deployment` heading, currently the last line
  and with no body)
- Test: `src/test/scala/com/lunatech/pointingpoker/APISpec.scala:204-210`

**Interfaces:**
- Consumes: nothing.
- Produces: nothing other tasks read.

- [x] **Step 1: Write the failing test**

Extend the existing case in `APISpec.scala`. Replace it wholesale:

```scala
    "open an SSE events stream for a resolved session" in
      Get(s"/rooms/$roomId/events") ~> addHeader(
        Cookie("session", validToken.raw)
      ) ~> apiRoute ~> check {
        status.isSuccess() mustBe true
        mediaType.toString mustBe "text/event-stream"
        // The stub cannot stand in for these: it buffers on its own flag and never reads
        // the upstream response headers.
        header("Cache-Control").map(_.value) mustBe Some("no-cache")
        header("X-Accel-Buffering").map(_.value) mustBe Some("no")
      }
```

- [x] **Step 2: Run the test to verify it fails**

Run: `sbt "testOnly com.lunatech.pointingpoker.APISpec -- -z \"open an SSE events stream\""`
Expected: FAIL, `None was not equal to Some("no-cache")`.

- [x] **Step 3: Add the headers**

In `API.scala`, add to the imports beside the existing `headers` imports:

```scala
import org.apache.pekko.http.scaladsl.model.headers.`Cache-Control`
import org.apache.pekko.http.scaladsl.model.headers.CacheDirectives.`no-cache`
import org.apache.pekko.http.scaladsl.model.headers.RawHeader
```

Replace the `Success(Room.Resolved(...))` branch at `:125-135`:

```scala
                  case Success(Room.Resolved(userId, name)) =>
                    // Proxies that buffer a response body turn SSE into batches or silence;
                    // X-Accel-Buffering is nginx's opt-out and README records the rest.
                    respondWithHeaders(`Cache-Control`(`no-cache`), RawHeader("X-Accel-Buffering", "no")) {
                      complete(
                        SSE.source(
                          roomManager.toClassic,
                          roomId,
                          userId,
                          name,
                          token,
                          sseConfig.retryMillis
                        )
                      )
                    }
```

- [x] **Step 4: Run the test to verify it passes**

Run: `sbt scalafmtAll && sbt "testOnly com.lunatech.pointingpoker.APISpec"`
Expected: PASS, all cases.

- [x] **Step 5: Write the deployment note**

`README.md` ends at `### Deployment` with no body. Append under it:

```markdown
### Deployment

**Do not let a reverse proxy buffer the SSE response.** The server pushes room
updates over a long-lived `text/event-stream` on `GET /rooms/{roomId}/events`. A
proxy that buffers response bodies holds those frames until its buffer fills or
the connection closes, so the room appears frozen and then updates in a burst.
The symptom looks like a server bug and is not one.

The app sets `Cache-Control: no-cache` and `X-Accel-Buffering: no` on that
response, which nginx honours. Other proxies need their own setting:

| Proxy | Setting |
|-------|---------|
| nginx | Honours `X-Accel-Buffering: no`. Otherwise `proxy_buffering off;` in the location block |
| Apache `mod_proxy` | `SetEnv proxy-sendchunked` and no `mod_deflate` on this path |
| HAProxy | Buffers responses but streams them, so no change is needed |
| Envoy | No response buffering by default. Do not enable the buffer filter on this route |

Response-scanning appliances are the harder case, since they may buffer to
inspect the body regardless of headers. `testkit/stub.js` reproduces one locally
and the testing section above says how to run it.
```

- [x] **Step 6: Commit**

```bash
git add src/main/scala/com/lunatech/pointingpoker/API.scala \
        src/test/scala/com/lunatech/pointingpoker/APISpec.scala README.md
git commit -m "feat(sse): set anti-buffering headers and document proxy buffering"
```

---

## Task 2: The reveal latch and the reconnect vote fix

Two `RoomData` changes that need no wire format, so they land before it and
shrink task 4. `revealed` has no consumer until task 4 gives it one, which is
fine within the branch: the rule in the spec is about what travels, not about
what a mid-branch commit holds.

**Files:**
- Modify: `src/main/scala/com/lunatech/pointingpoker/actors/Room.scala:61-101`
  (`RoomData`), `:173-181` (`ShowVotes`)
- Test: `src/test/scala/com/lunatech/pointingpoker/actors/RoomSpec.scala`
- Test: `src/test/scala/com/lunatech/pointingpoker/actors/RoomManagerSpec.scala`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `Room.RoomData.revealed: Boolean`, defaulting to `false`. Task 3 reads it.
  - `Room.RoomData.show(): RoomData` sets it.
  - `Room.RoomData.joinUser(user: User): RoomData` now preserves the existing
    entry's `voted` and `estimation`.

- [x] **Step 1: Write the failing tests**

Add to `RoomSpec.scala`, inside the `"Room Actor" should { ... }` block:

```scala
    "reveal the round when the last outstanding vote lands" in {
      val (user, _)         = createUser(UUID.randomUUID(), "user1", true, "3")
      val (user2, _)        = createUser(UUID.randomUUID(), "user2", false, "")
      val dataProbe         = testKit.createTestProbe[Room.DataStatus]()
      val (_, roomRef)      = createRoom(
        UUID.randomUUID(),
        RoomData.empty.copy(users = List(user, user2))
      )

      roomRef ! Room.Vote(user2.token, "5")
      roomRef ! Room.GetData(dataProbe.ref)

      dataProbe.expectMessageType[Room.DataStatus].data.revealed mustBe true
    }

    "leave the round hidden while anyone is still outstanding" in {
      val (user, _)    = createUser(UUID.randomUUID(), "user1", false, "")
      val (user2, _)   = createUser(UUID.randomUUID(), "user2", false, "")
      val dataProbe    = testKit.createTestProbe[Room.DataStatus]()
      val (_, roomRef) = createRoom(
        UUID.randomUUID(),
        RoomData.empty.copy(users = List(user, user2))
      )

      roomRef ! Room.Vote(user.token, "5")
      roomRef ! Room.GetData(dataProbe.ref)

      dataProbe.expectMessageType[Room.DataStatus].data.revealed mustBe false
    }

    "store the reveal on ShowVotes rather than only broadcasting it" in {
      val (user, _)    = createUser(UUID.randomUUID(), "user1", true, "3")
      val (user2, _)   = createUser(UUID.randomUUID(), "user2", false, "")
      val dataProbe    = testKit.createTestProbe[Room.DataStatus]()
      val (_, roomRef) = createRoom(
        UUID.randomUUID(),
        RoomData.empty.copy(users = List(user, user2))
      )

      roomRef ! Room.ShowVotes(user.token)
      roomRef ! Room.GetData(dataProbe.ref)

      dataProbe.expectMessageType[Room.DataStatus].data.revealed mustBe true
    }

    "keep the round revealed when a straggler joins" in {
      val (user, _)     = createUser(UUID.randomUUID(), "user1", true, "3")
      val dataProbe     = testKit.createTestProbe[Room.DataStatus]()
      val (_, roomRef)  = createRoom(
        UUID.randomUUID(),
        RoomData.empty.copy(users = List(user), revealed = true)
      )
      val newUserProbe  = TestProbe()(testKit.system.classicSystem)
      val newUser       = Room.User(
        UUID.randomUUID(),
        "new user",
        false,
        "",
        newUserProbe.ref,
        Room.SessionToken.mint()
      )

      roomRef ! Room.Join(newUser)
      roomRef ! Room.GetData(dataProbe.ref)

      dataProbe.expectMessageType[Room.DataStatus].data.revealed mustBe true
    }

    "hide the round again on a clear and on a revote" in {
      val (user, _)    = createUser(UUID.randomUUID(), "user1", true, "3")
      val dataProbe    = testKit.createTestProbe[Room.DataStatus]()
      val (_, roomRef) = createRoom(
        UUID.randomUUID(),
        RoomData.empty.copy(users = List(user), revealed = true)
      )

      roomRef ! Room.ClearVotes(user.token)
      roomRef ! Room.GetData(dataProbe.ref)
      dataProbe.expectMessageType[Room.DataStatus].data.revealed mustBe false

      roomRef ! Room.Vote(user.token, "5") // re-reveals: the only member has voted
      roomRef ! Room.ReVote(user.token)
      roomRef ! Room.GetData(dataProbe.ref)
      dataProbe.expectMessageType[Room.DataStatus].data.revealed mustBe false
    }

    "keep a reconnecting user's vote instead of resetting it" in {
      val (user, _)    = createUser(UUID.randomUUID(), "user1", true, "5")
      val dataProbe    = testKit.createTestProbe[Room.DataStatus]()
      val (_, roomRef) = createRoom(UUID.randomUUID(), RoomData.empty.copy(users = List(user)))

      // What RoomManager.ConnectToRoom actually builds on a reconnect: a fresh User with
      // InitialVoteState and InitialEstimation, differing from the stored one only by ref.
      val newRefProbe = TestProbe()(testKit.system.classicSystem)
      roomRef ! Room.Join(Room.User(user.id, user.name, false, "", newRefProbe.ref, user.token))
      roomRef ! Room.GetData(dataProbe.ref)

      val users = dataProbe.expectMessageType[Room.DataStatus].data.users
      users.map(u => (u.voted, u.estimation)) mustBe List((true, "5"))
      users.map(_.ref) mustBe List(newRefProbe.ref)
    }
```

Add to `RoomManagerSpec.scala`, inside its `should` block. This is the case that
would actually have caught Problem A, since `RoomSpec`'s reconnect cases
hand-construct the user with `user.copy(ref = ...)` and preserve the vote by
construction:

```scala
    "keep a member's vote when ConnectToRoom re-registers them after a reconnect" in {
      val roomId        = UUID.randomUUID()
      val userId        = UUID.randomUUID()
      val token         = Room.SessionToken.mint()
      val firstProbe    = TestProbe()(testKit.system.classicSystem)
      val secondProbe   = TestProbe()(testKit.system.classicSystem)
      val roomRef       = testKit.spawn(Room(roomId))
      val responseProbe = testKit.createTestProbe[Room.Response]()
      val dataProbe     = testKit.createTestProbe[Room.DataStatus]()
      val managerRef    = testKit.spawn(
        RoomManager.receiveBehaviour(RoomManagerData(Map(roomId -> roomRef)), responseProbe.ref)
      )

      managerRef ! RoomManager.ConnectToRoom(roomId, userId, "Alice", token, firstProbe.ref)
      roomRef ! Room.Vote(token, "5")
      managerRef ! RoomManager.ConnectToRoom(roomId, userId, "Alice", token, secondProbe.ref)
      roomRef ! Room.GetData(dataProbe.ref)

      val users = dataProbe.expectMessageType[Room.DataStatus].data.users
      users.map(u => (u.voted, u.estimation)) mustBe List((true, "5"))
    }
```

`RoomManagerSpec` needs `import com.lunatech.pointingpoker.actors.RoomManager.RoomManagerData`
and `import org.apache.pekko.testkit.TestProbe` if they are not already present.

- [x] **Step 2: Run the tests to verify they fail**

Run: `sbt "testOnly com.lunatech.pointingpoker.actors.RoomSpec com.lunatech.pointingpoker.actors.RoomManagerSpec"`
Expected: FAIL to compile, `value revealed is not a member of RoomData`.

- [x] **Step 3: Add the field, the latch and the fix**

In `Room.scala`, change the `RoomData` case class and the three methods.
`revealed` goes immediately before `pendingSessions` so no positional
construction moves:

```scala
  final case class RoomData(
      users: List[User],
      currentIssue: String,
      issueLastEditBy: Option[UUID],
      revealed: Boolean = false,
      pendingSessions: Map[SessionToken, PendingSession] = Map.empty
  ):
    def joinUser(user: User): RoomData =
      // ConnectToRoom rebuilds the User with an empty vote, so keep the stored one; only
      // ref actually differs on a reconnect, there being no rename feature.
      val kept = this.users
        .find(_.id == user.id)
        .fold(user)(old => user.copy(voted = old.voted, estimation = old.estimation))
      this.copy(
        users = kept :: this.users.filterNot(_.id == user.id),
        pendingSessions = this.pendingSessions - user.token
      )
```

Replace `vote`, `clear` and `reVote`, and add `show`:

```scala
    def vote(userId: UUID, estimation: String): RoomData =
      val voted = this.users.map { u =>
        if userId == u.id then u.copy(voted = true, estimation = estimation)
        else u
      }
      // A latch, so only a vote or ShowVotes reveals; a departure satisfying the same
      // predicate must not, which is the disclosure step 2 exists to prevent.
      this.copy(users = voted, revealed = this.revealed || (voted.nonEmpty && voted.forall(_.voted)))

    def show(): RoomData =
      this.copy(revealed = true)

    def clear(): RoomData =
      this.copy(users = this.users.map(_.copy(voted = false, estimation = "")), revealed = false)

    def reVote(): RoomData =
      // Keeps estimation, which is what makes "estimation but not voted" mean re-vote.
      this.copy(users = this.users.map(u => u.copy(voted = false)), revealed = false)
```

Note `forall` reads `voted`, not the presence of an estimation. Without that a
`reVote` would leave every estimation in place and the first re-vote would
re-reveal the room instantly.

Change the `ShowVotes` handler at `:173-181` so it stores the flag. Keep the
broadcast for now, since the client is still on events until task 5:

```scala
        case ShowVotes(token) =>
          data.users.find(_.token == token) match
            case Some(user) =>
              val newData = data.show()
              broadcast(
                RoomEvent(MessageType.Show, roomId, user.id, RoomEvent.NoExtra),
                newData.users,
                context
              )
              receiveBehaviour(roomId, newData, gracePeriod, timers)
            case None => Behaviors.same
```

- [x] **Step 4: Run the whole Scala suite**

Run: `sbt scalafmtAll && sbt test`
Expected: PASS. Existing cases construct `RoomData` with named arguments or
`RoomData.empty.copy`, so the added field with a default breaks none of them. If
`"vote and broadcast it"` fails on its `expectedData`, the room has two users
and only one voted, so `revealed` must still be `false`; a failure there means
the latch predicate is wrong, not the test.

- [x] **Step 5: Commit**

```bash
git add src/main/scala/com/lunatech/pointingpoker/actors/Room.scala \
        src/test/scala/com/lunatech/pointingpoker/actors/RoomSpec.scala \
        src/test/scala/com/lunatech/pointingpoker/actors/RoomManagerSpec.scala
git commit -m "feat(room): latch the reveal and keep a reconnecting member's vote"
```

---

## Task 3: The RoomSnapshot wire type

Pure addition. Nothing sends one yet, so the build and every test stay green.

**Files:**
- Create: `src/main/scala/com/lunatech/pointingpoker/actors/RoomSnapshot.scala`
- Test: `src/test/scala/com/lunatech/pointingpoker/actors/RoomSnapshotSpec.scala`

**Interfaces:**
- Consumes: `Room.RoomData.revealed` from task 2.
- Produces:
  - `RoomSnapshot(you: UUID, currentIssue: String, votesRevealed: Boolean, users: List[RoomSnapshot.Participant])`
  - `RoomSnapshot.Participant(id: UUID, name: String, voted: Boolean, estimation: String)`
  - `RoomSnapshot.of(data: Room.RoomData, forUser: UUID): RoomSnapshot`
  - `given Encoder[RoomSnapshot]`, which task 4's `SSE.source` uses.

- [x] **Step 1: Write the failing test**

Create `src/test/scala/com/lunatech/pointingpoker/actors/RoomSnapshotSpec.scala`:

```scala
package com.lunatech.pointingpoker.actors

import java.util.UUID

import io.circe.syntax.*
import org.apache.pekko.actor.ActorSystem
import org.apache.pekko.testkit.TestProbe
import org.scalatest.BeforeAndAfterAll
import org.scalatest.matchers.must
import org.scalatest.wordspec.AnyWordSpec

import com.lunatech.pointingpoker.actors.Room.RoomData

class RoomSnapshotSpec extends AnyWordSpec with must.Matchers with BeforeAndAfterAll:

  given system: ActorSystem = ActorSystem("RoomSnapshotSpec")

  override def afterAll(): Unit =
    system.terminate()

  private def user(id: UUID, name: String, voted: Boolean, estimation: String): Room.User =
    Room.User(id, name, voted, estimation, TestProbe().ref, Room.SessionToken.mint())

  "RoomSnapshot.of" should {

    "name the recipient it was built for" in {
      val alice = user(UUID.randomUUID(), "Alice", false, "")
      val data  = RoomData.empty.copy(users = List(alice))

      RoomSnapshot.of(data, alice.id).you mustBe alice.id
    }

    "order participants by id so every recipient agrees and a reconnect cannot reshuffle" in {
      val low  = user(UUID.fromString("00000000-0000-0000-0000-000000000001"), "Low", false, "")
      val high = user(UUID.fromString("ffffffff-0000-0000-0000-000000000000"), "High", false, "")
      val data = RoomData.empty.copy(users = List(high, low))

      RoomSnapshot.of(data, low.id).users.map(_.name) mustBe List("Low", "High")
    }

    "carry the stored reveal flag rather than deriving one" in {
      val alice = user(UUID.randomUUID(), "Alice", false, "")
      val bob   = user(UUID.randomUUID(), "Bob", true, "5")
      val data  = RoomData.empty.copy(users = List(alice, bob), revealed = true)

      // Not every participant has voted, so a derived predicate would say false here.
      RoomSnapshot.of(data, alice.id).votesRevealed mustBe true
    }

    "carry the current issue" in {
      val alice = user(UUID.randomUUID(), "Alice", false, "")
      val data  = RoomData.empty.copy(users = List(alice), currentIssue = "PP-1")

      RoomSnapshot.of(data, alice.id).currentIssue mustBe "PP-1"
    }

    "build for a recipient who is not a member, rather than failing" in {
      val alice   = user(UUID.randomUUID(), "Alice", false, "")
      val departed = UUID.randomUUID()
      val data    = RoomData.empty.copy(users = List(alice))

      val snapshot = RoomSnapshot.of(data, departed)
      snapshot.you mustBe departed
      snapshot.users.map(_.id) must not contain departed
    }

    "put no session token on the wire" in {
      val alice = user(UUID.randomUUID(), "Alice", true, "5")
      val data  = RoomData.empty.copy(users = List(alice))

      RoomSnapshot.of(data, alice.id).asJson.noSpaces must not include alice.token.raw
    }

    "serialize exactly the agreed field set" in {
      val alice = user(UUID.randomUUID(), "Alice", true, "5")
      val data  = RoomData.empty.copy(users = List(alice), currentIssue = "PP-1", revealed = true)

      val json = RoomSnapshot.of(data, alice.id).asJson
      json.asObject.map(_.keys.toList) mustBe Some(
        List("you", "currentIssue", "votesRevealed", "users")
      )
      // hasEstimation is step 2 and history is step 9; a field with no consumer must not travel.
      json.hcursor.downField("users").downArray.keys.map(_.toList) mustBe Some(
        List("id", "name", "voted", "estimation")
      )
    }
  }
end RoomSnapshotSpec
```

- [x] **Step 2: Run the test to verify it fails**

Run: `sbt "testOnly com.lunatech.pointingpoker.actors.RoomSnapshotSpec"`
Expected: FAIL to compile, `Not found: RoomSnapshot`.

- [x] **Step 3: Write the type**

Create `src/main/scala/com/lunatech/pointingpoker/actors/RoomSnapshot.scala`:

```scala
package com.lunatech.pointingpoker.actors

import java.util.UUID

import io.circe.Encoder
import io.circe.generic.semiauto.deriveEncoder

import com.lunatech.pointingpoker.actors.Room.RoomData

final case class RoomSnapshot(
    you: UUID,
    currentIssue: String,
    votesRevealed: Boolean,
    users: List[RoomSnapshot.Participant]
)

object RoomSnapshot:

  // A projection rather than Room.User: a derived encoder over the domain type would put
  // every participant's session token on the wire to every other participant.
  final case class Participant(
      id: UUID,
      name: String,
      voted: Boolean,
      estimation: String
  )

  object Participant:
    given Encoder[Participant] = deriveEncoder[Participant]

  given Encoder[RoomSnapshot] = deriveEncoder[RoomSnapshot]

  // forUser is the identity this was built for, so who it was redacted for and who the
  // client thinks it is cannot silently disagree. Step 2 makes the redaction real.
  def of(data: RoomData, forUser: UUID): RoomSnapshot =
    RoomSnapshot(
      you = forUser,
      currentIssue = data.currentIssue,
      votesRevealed = data.revealed,
      users = data.users
        .sortWith((a, b) => a.id.compareTo(b.id) < 0)
        .map(u => Participant(u.id, u.name, u.voted, u.estimation))
    )
end RoomSnapshot
```

`sortWith` with an explicit `compareTo` rather than `sortBy(_.id)`, so the order
does not depend on an implicit `Ordering[UUID]` being resolved.

- [x] **Step 4: Run the tests to verify they pass**

Run: `sbt scalafmtAll && sbt test`
Expected: PASS, the new spec and every existing one.

- [x] **Step 5: Commit**

```bash
git add src/main/scala/com/lunatech/pointingpoker/actors/RoomSnapshot.scala \
        src/test/scala/com/lunatech/pointingpoker/actors/RoomSnapshotSpec.scala
git commit -m "feat(protocol): add the RoomSnapshot wire type and its per-recipient build"
```

---

## Task 4: The server swap

The irreducible one. At the end of it `sbt test` is green, `npm test` is
unaffected, and `npm run e2e` fails because the page still parses
`messageType`. Task 5 is what restores the browser.

**Files:**
- Modify: `src/main/scala/com/lunatech/pointingpoker/actors/Room.scala`
- Modify: `src/main/scala/com/lunatech/pointingpoker/actors/RoomManager.scala:10`, `:146-161`
- Modify: `src/main/scala/com/lunatech/pointingpoker/sse/SSE.scala`
- Delete: `src/main/scala/com/lunatech/pointingpoker/actors/RoomEvent.scala`
- Modify: `src/test/scala/com/lunatech/pointingpoker/actors/RoomSpec.scala`
- Modify: `src/test/scala/com/lunatech/pointingpoker/sse/SSESpec.scala`
- Delete: `src/test/scala/com/lunatech/pointingpoker/actors/BackpressureReconnectSpec.scala`

**Interfaces:**
- Consumes: `RoomSnapshot.of` and `given Encoder[RoomSnapshot]` from task 3.
- Produces:
  - `Room.publish(data: RoomData, context: ActorContext[Command]): RoomData`,
    returning the data it published so call sites read
    `receiveBehaviour(roomId, publish(next, context), ...)`.
  - `SSE.source` materializes an `ActorRef` accepting `RoomSnapshot`, not
    `List[RoomEvent]`.
  - `Room.RoomData.editIssue(issue: String): RoomData`, having lost the `userId`
    argument it took only to write `issueLastEditBy`.

- [x] **Step 1: Rewrite RoomSpec onto snapshots**

This is the largest part of the task. Every `userProbe.expectMsg(List(RoomEvent(...)))`
becomes an assertion on a `RoomSnapshot`. Add a helper to the `RoomSpec`
companion object so twenty cases do not each unpack a probe message:

```scala
  def expectSnapshot(probe: TestProbe): RoomSnapshot =
    probe.expectMsgType[RoomSnapshot]
```

Convert the cases as follows. Each keeps its existing setup and replaces only
its assertions.

`"update current issue and broadcast it"` becomes:

```scala
    "update the current issue and publish it to everyone" in {
      val issue               = "Issue test 1"
      val (user, userProbe)   = createUser(UUID.randomUUID(), "user1", false, "")
      val (user2, user2Probe) = createUser(UUID.randomUUID(), "user2", false, "")
      val dataProbe           = testKit.createTestProbe[Room.DataStatus]()
      val (_, roomRef)        = createRoom(
        UUID.randomUUID(),
        RoomData.empty.copy(users = List(user, user2))
      )

      roomRef ! Room.EditIssue(user.token, issue)
      roomRef ! Room.GetData(dataProbe.ref)

      expectSnapshot(userProbe).currentIssue mustBe issue
      expectSnapshot(user2Probe).currentIssue mustBe issue
      dataProbe.expectMessage(
        Room.DataStatus(data = RoomData.empty.copy(users = List(user, user2), currentIssue = issue))
      )
    }
```

`"clear votes and broadcast it"` becomes:

```scala
    "clear votes and publish the cleared room" in {
      val (user, userProbe)   = createUser(UUID.randomUUID(), "user1", true, "3")
      val (user2, user2Probe) = createUser(UUID.randomUUID(), "user2", true, "5")
      val dataProbe           = testKit.createTestProbe[Room.DataStatus]()
      val (_, roomRef)        = createRoom(
        UUID.randomUUID(),
        RoomData.empty.copy(users = List(user, user2), revealed = true)
      )

      roomRef ! Room.ClearVotes(user.token)
      roomRef ! Room.GetData(dataProbe.ref)

      for probe <- List(userProbe, user2Probe) do
        val snapshot = expectSnapshot(probe)
        snapshot.votesRevealed mustBe false
        snapshot.users.map(u => (u.voted, u.estimation)) mustBe List((false, ""), (false, ""))

      dataProbe.expectMessage(
        Room.DataStatus(data =
          RoomData.empty.copy(users =
            List(user.copy(voted = false, estimation = ""), user2.copy(voted = false, estimation = ""))
          )
        )
      )
    }
```

`"revote and broadcast it"` becomes:

```scala
    "revote and publish a room that keeps the estimations but clears the votes" in {
      val (user, userProbe)   = createUser(UUID.randomUUID(), "user1", true, "3")
      val (user2, user2Probe) = createUser(UUID.randomUUID(), "user2", true, "5")
      val (_, roomRef)        = createRoom(
        UUID.randomUUID(),
        RoomData.empty.copy(users = List(user, user2), revealed = true)
      )

      roomRef ! Room.ReVote(user.token)

      for probe <- List(userProbe, user2Probe) do
        val snapshot = expectSnapshot(probe)
        snapshot.votesRevealed mustBe false
        snapshot.users.map(_.voted) mustBe List(false, false)
        // The estimations survive, which is what makes the client's re-vote state derivable.
        snapshot.users.map(_.estimation).toSet mustBe Set("3", "5")
    }
```

`"broadcast show votes"` becomes:

```scala
    "publish a revealed room on ShowVotes" in {
      val (user, userProbe)   = createUser(UUID.randomUUID(), "user1", true, "3")
      val (user2, user2Probe) = createUser(UUID.randomUUID(), "user2", false, "")
      val (_, roomRef)        = createRoom(
        UUID.randomUUID(),
        RoomData.empty.copy(users = List(user, user2))
      )

      roomRef ! Room.ShowVotes(user.token)

      expectSnapshot(userProbe).votesRevealed mustBe true
      expectSnapshot(user2Probe).votesRevealed mustBe true
    }
```

`"vote and broadcast it"` becomes:

```scala
    "vote and publish it to everyone" in {
      val estimation          = "5"
      val (user, userProbe)   = createUser(UUID.randomUUID(), "user1", false, "")
      val (user2, user2Probe) = createUser(UUID.randomUUID(), "user2", false, "")
      val dataProbe           = testKit.createTestProbe[Room.DataStatus]()
      val (_, roomRef)        = createRoom(
        UUID.randomUUID(),
        RoomData.empty.copy(users = List(user, user2))
      )

      roomRef ! Room.Vote(user.token, estimation)
      roomRef ! Room.GetData(dataProbe.ref)

      for probe <- List(userProbe, user2Probe) do
        val voter = expectSnapshot(probe).users.find(_.id == user.id)
        voter.map(_.voted) mustBe Some(true)
        voter.map(_.estimation) mustBe Some(estimation)

      dataProbe.expectMessage(
        Room.DataStatus(data =
          RoomData.empty.copy(users = List(user.copy(voted = true, estimation = estimation), user2))
        )
      )
    }
```

`"ignore a vote from an unresolvable token"` keeps `expectNoMessage()` on both
probes and its `dataProbe` assertion unchanged. Only its name needs no change.

`"delay a Leave broadcast by the grace period instead of acting immediately"`
becomes:

```scala
    "delay a leave publish by the grace period instead of acting immediately" in {
      val (user, _)           = createUser(UUID.randomUUID(), "user1", false, "")
      val (user2, user2Probe) = createUser(UUID.randomUUID(), "user2", false, "")
      val roomResponseProbe   = testKit.createTestProbe[Room.Response]()
      val (_, roomRef)        = createRoom(
        UUID.randomUUID(),
        RoomData.empty.copy(users = List(user, user2)),
        gracePeriod = 200.millis
      )

      roomRef ! Room.Leave(user.id, user.ref, roomResponseProbe.ref)

      user2Probe.expectNoMessage(50.millis)
      expectSnapshot(user2Probe).users.map(_.id) mustBe List(user2.id)
    }
```

`"swallow a Leave entirely if the same user reconnects within the grace period"`:
the reconnect now publishes to everyone, so `user2Probe` sees one snapshot for
the Join and nothing after. Replace its two assertions:

```scala
      // The reconnect's own publish is the only thing user2 sees: no leave, no flicker.
      expectSnapshot(user2Probe).users.map(_.id).toSet mustBe Set(user.id, user2.id)
      user2Probe.expectNoMessage(300.millis)
```

Its `dataProbe` assertion stays as written.

`"reset the grace period if Leave is called twice for the same connection before it elapses"`:
replace `user2Probe.expectMsg(List(expectedMessage))` with
`expectSnapshot(user2Probe).users.map(_.id) mustBe List(user2.id)` and delete
the now-unused `expectedMessage`. The two `expectNoMessage` calls and the
`secondReplyProbe`/`firstReplyProbe` assertions are unchanged, and they are what
the case is actually about.

`"leave room and broadcast it"` becomes:

```scala
    "remove a user on leave and publish the smaller room" in {
      val (user, userProbe)   = createUser(UUID.randomUUID(), "user1", false, "")
      val (user2, user2Probe) = createUser(UUID.randomUUID(), "user2", false, "")
      val dataProbe           = testKit.createTestProbe[Room.DataStatus]()
      val roomResponseProbe   = testKit.createTestProbe[Room.Response]()
      val (roomId, roomRef)   = createRoom(
        UUID.randomUUID(),
        RoomData.empty.copy(users = List(user, user2)),
        gracePeriod = 50.millis
      )

      roomRef ! Room.Leave(user.id, user.ref, roomResponseProbe.ref)

      // Waits past the short grace period.
      expectSnapshot(user2Probe).users.map(_.id) mustBe List(user2.id)
      roomResponseProbe.expectMessage(Room.Running(roomId))

      roomRef ! Room.GetData(dataProbe.ref)

      // The departed user's ref is not published to, so nothing reaches their probe.
      userProbe.expectNoMessage()
      dataProbe.expectMessage(Room.DataStatus(data = RoomData.empty.copy(users = List(user2))))
    }
```

`"ignore a stale leave from a ref that already got replaced by a reconnect"`:
replace `user2Probe.expectMsgType[List[RoomEvent]]` with
`user2Probe.expectMsgType[RoomSnapshot]`. Everything else stands.

`"stop itself if empty"` uses `BehaviorTestKit` and asserts only `isAlive`, so it
needs no change.

`"replace an existing user's entry on rejoin instead of duplicating it"`: the
expected data now keeps the original vote, because task 2 changed `joinUser`.
Replace its assertion:

```scala
      dataProbe.expectMessage(
        Room.DataStatus(data =
          RoomData.empty.copy(users = List(rejoinedUser.copy(voted = true, estimation = "5")))
        )
      )
```

**Delete `"batch the entire join replay into a single message instead of one send per event"`
outright.** It asserts the exact shape of `setupNewUser`'s batched replay, which
this task removes. A snapshot is atomic by construction, so there is no batching
discipline left to assert.

`"join the room, get all info, and broadcast it"` becomes the case that proves a
joiner gets the whole room in one message:

```scala
    "publish the whole room to a joiner and to everyone already in it" in {
      val issue               = "current issue"
      val (user, userProbe)   = createUser(UUID.randomUUID(), "user1", true, "5")
      val (user2, user2Probe) = createUser(UUID.randomUUID(), "user2", false, "")
      val dataProbe           = testKit.createTestProbe[Room.DataStatus]()
      val internalData        =
        RoomData.empty.copy(users = List(user, user2), currentIssue = issue)
      val (_, roomRef) = createRoom(UUID.randomUUID(), internalData)

      val newUserProbe = TestProbe()(testKit.system.classicSystem)
      val newUser      = Room.User(
        UUID.randomUUID(),
        "new user",
        false,
        "",
        newUserProbe.ref,
        Room.SessionToken.mint()
      )

      roomRef ! Room.Join(newUser)
      roomRef ! Room.GetData(dataProbe.ref)

      val joinerView = expectSnapshot(newUserProbe)
      joinerView.you mustBe newUser.id
      joinerView.currentIssue mustBe issue
      joinerView.users.map(_.id).toSet mustBe Set(newUser.id, user.id, user2.id)
      // One message, not a replay: the catch-up and the announcement are the same send.
      newUserProbe.expectNoMessage()

      for probe <- List(userProbe, user2Probe) do
        expectSnapshot(probe).users.map(_.id).toSet mustBe Set(newUser.id, user.id, user2.id)

      dataProbe.expectMessage(
        Room.DataStatus(data =
          RoomData.empty.copy(users = List(newUser, user, user2), currentIssue = issue)
        )
      )
    }
```

The four session cases (`"mint a session..."`, `"resolve a pending session..."`,
`"resolve a confirmed member..."`, `"return Unresolved..."`) assert on
`SessionMinted` and `TokenResolution`, never on events, so they are unchanged.

`"clear the pending session once Join promotes it to a member"` is unchanged.

Finally, update the imports at the top of `RoomSpec.scala`: drop
`import RoomEvent.MessageType` and add `TestProbe` to the companion helper's
signature if it is not already imported.

- [x] **Step 2: Run RoomSpec to verify it fails**

Run: `sbt "testOnly com.lunatech.pointingpoker.actors.RoomSpec"`
Expected: FAIL to compile, `Not found: type RoomSnapshot` in the helper and
`value publish is not a member of Room`.

- [x] **Step 3: Swap the room actor**

In `Room.scala`, delete the `import RoomEvent.MessageType` line and add nothing
in its place. Remove `issueLastEditBy` from `RoomData` and simplify `editIssue`:

```scala
  final case class RoomData(
      users: List[User],
      currentIssue: String,
      revealed: Boolean = false,
      pendingSessions: Map[SessionToken, PendingSession] = Map.empty
  ):
```

```scala
    def editIssue(issue: String): RoomData =
      this.copy(currentIssue = issue)
```

```scala
  object RoomData:
    val empty: RoomData = RoomData(List.empty[User], "")
```

Replace `broadcast` and `setupNewUser` at `:251-274` with one function:

```scala
  private[actors] def publish(data: RoomData, context: ActorContext[Command]): RoomData =
    // The Join to publish hop still races a new connection's downstream demand; 08-24's
    // empirical finding stands, so re-check it if this chain is ever restructured.
    context.log.debug("Publishing to {} users", data.users.size)
    data.users.foreach(user => user.ref ! RoomSnapshot.of(data, user.id))
    data
  end publish
```

Rewrite the seven handlers that used to broadcast. `Join` loses `setupNewUser`
entirely, since one publish is both the catch-up and the announcement:

```scala
        case Join(user) =>
          receiveBehaviour(roomId, publish(data.joinUser(user), context), gracePeriod, timers)
```

```scala
        case Vote(token, estimation) =>
          data.users.find(_.token == token) match
            case Some(user) =>
              receiveBehaviour(roomId, publish(data.vote(user.id, estimation), context), gracePeriod, timers)
            case None => Behaviors.same
        case ClearVotes(token) =>
          data.users.find(_.token == token) match
            case Some(_) => receiveBehaviour(roomId, publish(data.clear(), context), gracePeriod, timers)
            case None    => Behaviors.same
        case ReVote(token) =>
          data.users.find(_.token == token) match
            case Some(_) => receiveBehaviour(roomId, publish(data.reVote(), context), gracePeriod, timers)
            case None    => Behaviors.same
        case ShowVotes(token) =>
          data.users.find(_.token == token) match
            case Some(_) => receiveBehaviour(roomId, publish(data.show(), context), gracePeriod, timers)
            case None    => Behaviors.same
```

`ShowVotes` now returns a new behaviour rather than `Behaviors.same`, because
the reveal is stored state.

```scala
        case EditIssue(token, issue) =>
          data.users.find(_.token == token) match
            case Some(_) => receiveBehaviour(roomId, publish(data.editIssue(issue), context), gracePeriod, timers)
            case None    => Behaviors.same
```

```scala
        case ConfirmLeave(userId, ref, replyTo) =>
          if data.users.exists(u => u.id == userId && u.ref == ref) then
            val newData = publish(data.leave(userId, ref), context)
            if newData.users.isEmpty then
              replyTo ! Stopped(roomId)
              Behaviors.stopped
            else
              replyTo ! Running(roomId)
              receiveBehaviour(roomId, newData, gracePeriod, timers)
          else
            // Stale teardown: this userId already reconnected under a different ref.
            Behaviors.same
```

Leave the long explanatory comments on `Leave` and `ConfirmLeave` in place. They
describe the grace-period timer, which this task does not touch.

- [x] **Step 4: Swap the SSE source**

In `SSE.scala`, change the import line to
`import com.lunatech.pointingpoker.actors.{Room, RoomManager, RoomSnapshot}` and
delete `import com.lunatech.pointingpoker.actors.RoomEvent.given`.

Replace the `bufferSize` comment and the source:

```scala
  // dropHead makes 1 hold the newest snapshot; larger only stores staler ones. Never 0: it
  // silently drops without consulting the strategy, so the client goes quiet with no reconnect.
  val bufferSize = 1
```

```scala
    Source
      .actorRef[RoomSnapshot](
        completionMatcher,
        failureMatcher,
        bufferSize,
        OverflowStrategy.dropHead
      )
      .mapMaterializedValue { user =>
        roomManager ! RoomManager.ConnectToRoom(roomId, userId, name, token, user)
        user
      }
      .watchTermination() { (user, done) =>
        done.onComplete {
          case Success(_) => roomManager ! RoomManager.ConnectionCompleted(roomId, userId, user)
          case Failure(t) => roomManager ! RoomManager.ConnectionFailure(roomId, userId, user, t)
        }
        user
      }
      .map(snapshot => ServerSentEvent(data = snapshot.asJson.noSpaces, retry = Some(retryMillis)))
      .keepAlive(heartbeatInterval, () => ServerSentEvent.heartbeat)
```

`.mapConcat(identity)` is gone: a snapshot is one element and one frame.

- [x] **Step 5: Delete the unreachable overflow branch**

In `RoomManager.scala`, delete `import org.apache.pekko.stream.BufferOverflowException`
at `:10` and collapse the handler at `:146-161`:

```scala
          case ConnectionFailure(roomId, userId, ref, t) =>
            context.log.error("ConnectionFailure: {}", t)
            data.rooms
              .get(roomId)
              .foreach(room => room ! Room.Leave(userId, ref, roomResponseWrapper))
            Behaviors.same
```

Overflow no longer fails the stream, so the self-healing-path rationale has
nothing left to describe.

- [x] **Step 6: Delete RoomEvent and the retired spec**

```bash
git rm src/main/scala/com/lunatech/pointingpoker/actors/RoomEvent.scala \
       src/test/scala/com/lunatech/pointingpoker/actors/BackpressureReconnectSpec.scala
```

`BackpressureReconnectSpec` asserts that a stalled client's stream fails and
silently reconnects, which is exactly the behaviour `dropHead` removes. Porting
it would mean asserting the opposite of what it was written to prove.

- [x] **Step 7: Rewrite SSESpec**

Replace the whole file body's imports and cases. The `wire()` helper is
unchanged. Drop `import com.lunatech.pointingpoker.actors.RoomEvent.MessageType`
and import `RoomSnapshot` instead. Add a snapshot builder beside `wire()`:

```scala
  private def snapshot(userId: UUID, issue: String) =
    RoomSnapshot(userId, issue, false, List(RoomSnapshot.Participant(userId, "Alice", false, "")))
```

Delete `"flatten a batched list of events into individual SSE frames, in order"`.
It exists to test `mapConcat`, which is gone.

Replace `"fail the stream when the buffer overflows, instead of silently dropping events"`
with the assertion `dropHead` is chosen for. This is the replacement
`BackpressureReconnectSpec` gave up its 124 lines for:

```scala
    "keep a stalled client's stream open and hand it the newest snapshot, not a stale queued one" in {
      val (_, userId, user, probe) = wire()
      probe.ensureSubscription()

      // No demand yet, so these queue past the buffer's tolerance. Under fail this errored;
      // under dropHead the superseded ones are discarded and the stream stays open.
      (1 to 5).foreach(i => user ! snapshot(userId, s"issue $i"))

      probe.request(5)
      probe.expectNext().data must include("issue 5")
      probe.expectNoMessage()
    }
```

Update the retry case to send a snapshot rather than a list:

```scala
    "set an explicit retry hint so clients reconnect on a value this app controls" in {
      val (_, userId, user, probe) = wire()
      probe.request(1)

      user ! snapshot(userId, "")

      probe.expectNext().retry mustBe Some(2000)
    }
```

- [x] **Step 8: Run the whole Scala suite**

Run: `sbt scalafmtAll && sbt test`
Expected: PASS. If `RoomManagerSpec`'s `"connect user to room"` or
`"handle connection failure..."` fail on a probe message type, change their
`expectMsg` calls to `expectMsgType[RoomSnapshot]`.

- [x] **Step 9: Confirm the declared breakage is only what was declared**

Run: `npm test`
Expected: PASS, 14/14. These cover the stub and startup and never parse a room
payload.

Run: `npm run e2e`
Expected: FAIL. The page still branches on `message.messageType`, which no
longer exists, so participants never render. This is the window task 5 closes.
Confirm the failures are that and not something else before continuing.

- [x] **Step 10: Commit**

```bash
git add -A src/main src/test
git commit -m "feat(protocol): publish room snapshots in place of the event stream"
```

---

## Task 5: The client swap

Closes the window. The four `test.fail()` annotations must go in this same
commit: Playwright fails a run when an annotated test passes, so leaving them
would turn the suite red from the other direction.

**Files:**
- Modify: `src/main/resources/pages/index.html:192` (focus and blur handlers),
  `:335-356` (the data block), `:380-492` (`doJoin`), `:546-555` (`updateSummary`
  and `allVoted`)
- Modify: `e2e/room.spec.js:129`, `:144`, `:171`, `:190`

**Interfaces:**
- Consumes: the `RoomSnapshot` JSON shape from task 3, namely
  `{ you, currentIssue, votesRevealed, users: [{ id, name, voted, estimation }] }`.
- Produces: `applySnapshot(prev, s)` in the page's inline script, taking
  `prev = { issueFocused, currentIssue }` and returning
  `{ inRoom, users, votesRevealed, currentIssue, userEstimation, ownVoteConfirmed, votesSummary }`.
  Step 8 turns this into a module; it stays inline here, since the one branch a
  unit test would uniquely buy is `me` being undefined and nothing can reach that
  until step 6's leave endpoint.

- [x] **Step 1: Add the focus guard to the editable input**

`index.html:192`, the input inside `v-if="editing"`. The readonly input at `:201`
gets no handlers, so focusing it does not arm the guard:

```html
                    <input type="text" placeholder="Current issue" class="form-control" v-model="currentIssue" v-on:focus="issueFocused = true" v-on:blur="issueFocused = false">
```

- [x] **Step 2: Add issueFocused and drop the remembered userId**

In the `data` block at `:335-356`, add `issueFocused` and remove `id` from
`user`:

```js
        editing: false,
        issueFocused: false,
        inRoom: false,
```

```js
        user: {
          name: localStorage.getItem("name"),
          estimation: ""
        }
```

`user.id`'s only readers were the two handlers this task deletes, so the field
goes with them. `/join`'s response body keeps `userId` until step 6, where tapir
describes the endpoint; nothing reads it in between and the status is what
confirms the call.

- [x] **Step 3: Write applySnapshot**

Insert it just above `var app = new Vue({`, at `:333`:

```js
    // Pure, so the framework migration at step 8 inherits it unchanged. prev carries only
    // what the next state depends on: { issueFocused, currentIssue }.
    function applySnapshot(prev, s) {
      var me = s.users.find(u => u.id === s.you);
      var tally = {};
      // The u.voted filter arrives at step 3, with the template guard it requires.
      s.users.forEach(u => { tally[u.estimation] = (tally[u.estimation] || 0) + 1; });
      return {
        inRoom: true,
        users: s.users,
        votesRevealed: s.votesRevealed,
        // Do not clobber the issue input while the user is typing in it.
        currentIssue: prev.issueFocused ? prev.currentIssue : s.currentIssue,
        userEstimation: me ? me.estimation : "",
        ownVoteConfirmed: !me || me.voted || !me.estimation,
        votesSummary: Object.entries(tally).sort(function (a, b) { return b[1] - a[1]; })
      };
    }
```

`ownVoteConfirmed` is derived rather than carried. `reVote()` clears `voted` and
keeps `estimation` while `clear()` clears both, so "an estimation showing but
not counted as voted" is the re-vote state and nothing else.

- [x] **Step 4: Replace the eight handlers with one**

In `doJoin`, replace everything from `var userId = response.data.userId;` at
`:386` through the closing `};` of `onmessage` at `:471`. The `onopen` and
`onerror` handlers are unchanged and stay where they are:

```js
            ref.eventSource = new EventSource('/rooms/' + ref.roomId + '/events');
            ref.eventSource.onopen = function() {
              // EventSource retries automatically on transient network blips; a
              // successful (re)connection means any earlier "connection lost"
              // banner from a prior onerror is now stale.
              ref.showError = false;
              ref.errorMessage = "";
            };
            ref.eventSource.onmessage = function(event) {
              // Keep-alive heartbeats arrive as an event with an empty data payload.
              if (!event.data) {
                return;
              }
              var next = applySnapshot(
                { issueFocused: ref.issueFocused, currentIssue: ref.currentIssue },
                JSON.parse(event.data)
              );
              ref.inRoom = next.inRoom;
              ref.users = next.users;
              ref.votesRevealed = next.votesRevealed;
              ref.currentIssue = next.currentIssue;
              ref.ownVoteConfirmed = next.ownVoteConfirmed;
              ref.votesSummary = next.votesSummary;
              // The one key that does not match a top-level data entry; step 8 flattens it.
              ref.user.estimation = next.userEstimation;
            };
```

- [x] **Step 5: Delete the two retired methods**

Remove `updateSummary` at `:546-552` and `allVoted` at `:553-555`. The tally is
`applySnapshot`'s job now, and reveal comes from the server. Leave
`showUserEstimation` exactly as it is: it re-points at `hasEstimation` at step 2,
not here. Take care with the trailing comma on the method before them.

- [x] **Step 6: Flip the four annotations**

In `e2e/room.spec.js`, delete these four lines and nothing else:

- `:129` `test.fail(true, 'step 1: revealed becomes a stored latch instead of a client-side allVoted()')`
- `:144` the same line in `'an auto-revealed round stays revealed when a straggler arrives'`
- `:171` `test.fail(true, 'step 1: a snapshot replaces the replay that pushes a second entry')`
- `:190` `test.fail(true, 'step 1: a snapshot is the whole list, so a departure cannot be missed')`

**Leave `:158` in place.** That one is annotated to step 3, and the tally still
counts every participant.

- [x] **Step 7: Run the browser suite**

Run: `sbt "; coverageOff; Universal/stage" && npm run e2e`
Expected: PASS, 22 passed with 2 expected failures, 24 results in total. Both
projects run every file, so the expected-failure count drops from 10 to 2 as four
of the five annotated cases turn real in two engines each.

If `'a participant who departed during the gap is pruned on reconnect'` still
fails, the cause is the shared `departureWhileCut` helper rather than the
snapshot: check that Bob's restore actually reconnects before asserting.

- [x] **Step 8: Commit**

```bash
git add src/main/resources/pages/index.html e2e/room.spec.js
git commit -m "feat(client): apply room snapshots and retire the event handlers"
```

---

## Task 6: The browser cases step 1 adds

Three cases the spec assigns here. Two guard the issue-input trap, one is the
vote-survival assertion step 0 deliberately could not make.

**Files:**
- Modify: `e2e/room.spec.js`

**Interfaces:**
- Consumes: the fixtures already exported by `e2e/fixtures.js`, namely `join`,
  `issueBox`, `issueButton`, `participantRow`, `votedMark`, `vote`,
  `connectionLost`, `connectionAlert`.
- Produces: nothing other tasks read.

- [x] **Step 1: Add the vote-survival case**

Append to `e2e/room.spec.js`. Step 0 could not write this: a reconnecting
browser kept its own `user.estimation` and every other browser kept its stale
row, so the assertion would have passed on stale client state while the room had
already reset the participant:

```javascript
test('a vote survives its own reconnect', async ({ join }) => {
  const alice = await join('Alice')
  const bob = await join('Bob')

  await vote(bob.page, '8')
  await expect(votedMark(participantRow(alice.page, 'Bob'))).toHaveCount(1)

  await bob.cut()
  await expect(connectionLost(bob.page)).toBeVisible()
  await bob.restore()
  await expect(connectionAlert(bob.page)).toBeHidden({ timeout: 10_000 })

  // The room's own state, not Bob's stale copy: Alice never disconnected, so her row for
  // Bob is redrawn from a snapshot published after the reconnect.
  await vote(alice.page, '5')
  await expect(votedMark(participantRow(alice.page, 'Bob'))).toHaveCount(1, { timeout: 10_000 })
  await expect(participantRow(alice.page, 'Bob')).toContainText('8')
})
```

The final `toContainText` is reachable because both participants have now voted,
which latches the reveal server-side.

- [x] **Step 2: Add the two issue-input cases**

```javascript
test('the issue box resyncs once the editor loses focus', async ({ join }) => {
  const alice = await join('Alice')
  const bob = await join('Bob')

  await issueButton(alice.page).click()
  await issueBox(alice.page).fill('Alice is still typing')

  // Any publish carries the issue, so a vote by anyone would clobber an unguarded box.
  await vote(bob.page, '5')
  await expect(issueBox(alice.page)).toHaveValue('Alice is still typing')

  await issueBox(alice.page).blur()
  await vote(bob.page, '3')
  await expect(issueBox(alice.page)).toHaveValue('')
})

test('an edit committed with the check button reaches the other browser', async ({ join }) => {
  const alice = await join('Alice')
  const bob = await join('Bob')

  await issueButton(alice.page).click()
  await issueBox(alice.page).fill('PP-42')
  // The guard keys on focus, and pressing the button blurs first: a guard scoped to
  // `editing` instead would tear out this button on that very blur.
  await issueButton(alice.page).click()

  await expect(issueBox(bob.page)).toHaveValue('PP-42')
  await expect(issueBox(alice.page)).toHaveValue('PP-42')
})
```

- [x] **Step 3: Add the re-vote confirmation case**

This is the one covering `ownVoteConfirmed`'s derivation, which the 08-28 design
covered with a unit test that did not survive into the current spec:

```javascript
test('a re-vote leaves the caster shown as selected but unconfirmed', async ({ join }) => {
  const alice = await join('Alice')
  const selected = alice.page.locator('.estimation-button-selected')
  const unconfirmed = alice.page.locator('.estimation-button-uncomfirmed')

  await vote(alice.page, '5')
  await expect(selected).toHaveText('5')

  await alice.page.getByRole('button', { name: 'Re-vote' }).click()
  // reVote clears voted and keeps estimation, which is the only state this styling means.
  await expect(unconfirmed).toHaveText('5')
  await expect(selected).toHaveCount(0)

  await alice.page.getByRole('button', { name: 'Clear votes' }).click()
  await expect(unconfirmed).toHaveCount(0)
})
```

The Re-vote button only renders under `v-if="votesRevealed"` (`index.html:245`),
and Alice voting alone latches the reveal, so it is present by the time this
clicks it. The class name is misspelled in the page as
`estimation-button-uncomfirmed`; match the page, and leave the spelling to step 8.

- [x] **Step 4: Run the browser suite**

Run: `npm run e2e`
Expected: PASS, 30 passed with 2 expected failures, 32 results in total. Four new
cases in two engines each.

- [x] **Step 5: Commit**

```bash
git add e2e/room.spec.js
git commit -m "test(e2e): cover vote survival, the issue guard and the re-vote state"
```

---

## Task 7: Close the four issues and correct the docs

The README still documents a protocol that no longer exists, which is the part
most likely to be forgotten.

**Files:**
- Modify: `README.md:6-37` (the messaging section)
- Modify: `docs/known-issues.md`
- Modify: `docs/roadmap.md:85-91`

**Interfaces:**
- Consumes: nothing.
- Produces: nothing.

- [x] **Step 1: Rewrite the messaging section**

`README.md:6-37` describes `RoomEvent` and lists eight `messageType` values.
Replace from `### Messaging` through the heartbeat paragraph:

```markdown
### Messaging

Clients send commands as plain HTTP POST requests (see the API table below). The
server pushes room updates the other way, over a long-lived SSE stream opened on
`GET /rooms/{roomId}/events`. Every pushed message carries one complete
`RoomSnapshot` as its `data` payload, built for the participant receiving it.
There is one message type, so a client applies whatever arrives and never
reconstructs state from a sequence. Json example:

```json
{
    "you": "9f3820e1-37aa-4602-8994-2ce1da8e1e54",
    "currentIssue": "PP-42",
    "votesRevealed": false,
    "users": [
        {
            "id": "9f3820e1-37aa-4602-8994-2ce1da8e1e54",
            "name": "John Doe",
            "voted": true,
            "estimation": "5"
        }
    ]
}
```

`you` is the identity the snapshot was built for, so a client never has to infer
which participant it is. `users` is ordered by `id`, the same order for every
recipient. `votesRevealed` is stored on the server, set by `Show` and by the vote
that completes the round, and cleared by `Clear` and `Re-vote`.

The stream also emits an SSE heartbeat comment every 15 seconds, so an idle
connection is not closed by the server's idle timeout.
```

Also correct the `/rooms/{roomId}/events` row of the API table, which still says
the stream carries events.

- [x] **Step 2: Remove the four closed known issues**

Delete these entire entries from `docs/known-issues.md`, each of which says
"Remove this entry when that lands":

- `### SSE reverse-proxy buffering is undocumented` (`:75`), closed by task 1.
- `### Resync doesn't replay whether votes are currently revealed` (`:153`),
  closed by the latch and by `votesRevealed` travelling.
- `### A transparently reconnecting client duplicates every known participant`
  (`:249`), closed because applying a complete snapshot cannot duplicate.
- `### A participant who departs during a reconnect gap is never pruned`
  (`:263`), closed because an absent participant is absent from a snapshot.

Check the surrounding entries for cross-references to any of the four before
deleting, and repair them rather than leaving a dangling pointer.

- [x] **Step 3: Check off the roadmap item**

In `docs/roadmap.md:85-91`, tick `Server-authoritative auto-reveal`, which says
"Check this off when that lands":

```markdown
- [x] Server-authoritative auto-reveal. Today "everyone voted" is computed
```

**Leave `Latched reveal, narrowed` at `:92` unticked.** Only its auto-reveal half
moved into step 1. What is still open is whether a revealed round should survive
a `reVote`, plus the paired undo and re-hide.

- [x] **Step 4: Verify the whole gate**

Run: `sbt scalafmtCheckAll && sbt test && npm test && npm run e2e`
Expected: all green.

Run: `git status --short`
Expected: empty.

Confirm that the only files changed under `src/main` are the seven this plan
names, and that no file outside `src/`, `e2e/`, `docs/` and `README.md` was
touched other than the two deviation 1 declares.

- [x] **Step 5: Commit**

```bash
git add README.md docs/known-issues.md docs/roadmap.md
git commit -m "docs: retire the event protocol from the docs and close four issues"
```

---

## Merge gate

Step 1 is done when all of the following hold. Do not merge or rebase: the stack
lands as one ordered pack after step 2 and the user drives it.

- `sbt scalafmtCheckAll` clean, `sbt test` green.
- `npm test` green, 14 cases.
- `npm run e2e` green, 32 passed and exactly 2 expected failures, 34 results in
  total, both failures the step 3 tally case in its two engines.
- `git status --short` empty.
- `RoomEvent.scala` and `BackpressureReconnectSpec.scala` are gone, and no file
  references them.
- No `hasEstimation`, `history`, `version`, `roomId`, `scale` or `role` field on
  `RoomSnapshot`.
- The four known issues are deleted and the roadmap item is ticked.

## What this step deliberately does not do

Recorded here so a reviewer does not read any of it as an omission.

- **Redaction.** Every participant's `estimation` still travels to everyone. That
  is today's behaviour, unchanged, and step 2 fixes it. This step makes the fix a
  change in one function by giving `RoomSnapshot.of` its `forUser` argument now.
- **The voted-only tally.** Step 3, with the template guard. Shipping the filter
  here would make Show in a room where nobody voted a render error.
- **Problem C**, the superseded `ConfirmLeave` timer. Step 4, which makes it
  unrepresentable. Fixing it here costs a re-key plus a moved staleness check, and
  getting half of it produces a phantom participant for the life of the process.
- **The rejoin on a snapshot that does not name the client.** Step 6, which is the
  step whose leave endpoint makes it reachable. `applySnapshot` already copes with
  `me` being undefined, which is the survival half of that rule.
- **Extracting the client into modules.** Step 8, which absorbs the `connection.js`
  extraction the 08-28 design had scheduled separately. `applySnapshot` stays in
  the page's inline script until then.
- **Problem A's fix is throwaway**, and that is deliberate. Step 4's state split
  makes vote loss on reconnect unrepresentable and deletes the `joinUser` merge
  this step adds. It is written anyway because the loss is live today and step 4
  is three steps away.
