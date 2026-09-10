# RoomData Construction Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make a `RoomData` holding a member with no session unconstructible, so
the test suite stops normalising a state production cannot reach and step 4 can
rely on the coupling it is about to make load-bearing.

**Architecture:** `RoomData`'s constructor goes private, which in Scala 3 takes
`apply` and `copy` with it, and a validating `RoomData.of` in the companion
becomes the only way in from outside the class. Tests reach it through a
`RoomDataFixtures` object holding `withUsers` and three extensions. The `Join`
handler gains the matching runtime guard, warning rather than raising. No
production behaviour changes except that guard, which is unreachable today.

**Tech Stack:** Scala 3.8.4, Pekko typed actors, ScalaTest (`AnyWordSpec` +
`must.Matchers`) with `ActorTestKit` and `LoggingTestKit`.

**Spec:** `docs/superpowers/specs/2026-08-31-protocol-target-architecture-design.md`,
step 5a at `:2013`. Invariant 5 owns the rule this enforces (`:290-292`), and
section 3 owns the `Member` shape that makes step 4 restate it (`:502`).

**Branch:** `20260831.protocol_architecture_5a_roomdata_construction`, based on
`20260831.protocol_architecture_5_retained_sessions`. This one **is** stacked:
step 5 merges first, so this branch needs a `rebase --onto` afterwards, and
step 4 waits on both.

## Global Constraints

- **Everything is built against today's `RoomData`.** No `RoomState`, `Round`,
  `members` or `connections`, and no `users` to `members` rename. Step 4 owns
  those, and the spec records that step 4 restates the containment clause
  rather than inheriting it.
- **The only production behaviour change is the `Join` guard**, and it is task
  2, its own task and its own commit, so a reviewer can reject it without
  losing the construction API.
- **`Room.scala`'s ten internal `.copy` calls stay as they are.** `private`
  reaches the class and its companion, so they keep compiling. Rerouting them
  through `of` is not part of this step.
- **No new invariant in the design.** 5a enforces what invariant 5 already
  implies, and `docs/known-issues.md:106` says so.
- **`RoomSnapshotSpec`'s private `user` builder is not unified with
  `RoomSpec.createUser`.** Pre-existing duplication, deliberately left alone.
- **No e2e change and no `docs/roadmap.md` change.** Nothing user-visible
  moves, and test-construction safety is not a roadmap item.
- **Comments are one or two lines.** Never a multi-line block, including for
  non-obvious rationale. Longer context belongs in the commit message.
- **Conventional Commits**, and documentation commits are `docs:`, never `doc:`.
- **No em dash in any document.**
- `scalafmt` runs at 100 columns. Run `sbt scalafmtAll` before any commit that
  touches Scala.

---

## File Structure

**Server, modified:**

- `src/main/scala/com/lunatech/pointingpoker/actors/Room.scala` The `RoomData`
  constructor goes private (`:60`), the companion gains `of` (`:110-111`), and
  the `Join` case gains the guard (`:134`). That is the whole production
  change, in one file.

**Tests, created:**

- `src/test/scala/com/lunatech/pointingpoker/actors/RoomDataFixtures.scala` The
  construction API for tests: `withUsers`, and the `withIssue`, `withRevealed`
  and `withMemberlessSession` extensions. Absorbs `sessionsFor`, which after
  the migration has no direct caller and becomes private here.

**Tests, modified:**

- `src/test/scala/.../actors/RoomSpec.scala` Thirty-four fixture sites migrate,
  `sessionsFor` leaves the companion object, one case is rewritten because the
  guard would make it pass for the wrong reason, and two cases gain a
  memberless session. Two new cases: the guard, and the compile-time proof that
  the constructor is shut.
- `src/test/scala/.../actors/RoomSnapshotSpec.scala` Fourteen fixture sites
  migrate. Nothing else.
- `src/test/scala/.../actors/RoomManagerSpec.scala` One case seeds a session so
  its `ConnectToRoom` survives the guard.

**Docs, modified:**

- `docs/known-issues.md` The construction-gap entry goes.
- `docs/superpowers/specs/2026-08-31-protocol-target-architecture-design.md` A
  landed-state note on step 5a, plus the `Room.scala` citations the guard
  shifts.

### Why the tasks are ordered as they are

**Task 1 must precede task 2.** Nine `Join` sites exist across the suite. Five
reuse a seeded member's token or follow a real `RequestSession` and survive the
guard for free once fixtures seed sessions, which is task 1's work. The other
four need deliberate handling, and the guard is red against them until task 1
has landed.

**Task 1's own commits are ordered so each one compiles and is green.** `of` is
additive, the fixtures object is additive, the migrations are mechanical, and
only the last commit closes the constructor. A missed site is then a compile
error rather than a silent survival.

**Task 3 waits on both** because its citation sweep has to run against final
line numbers, and because the known-issue it deletes is only false once the
guard exists.

### A trap this plan is scheduled around

`RoomSpec.scala:299-318`, "stop itself if empty", drives two `Join`s into a
`BehaviorTestKit` room built from `Room(roomId)` with default empty data.
Under the guard neither join lands, `users` stays empty, `ConfirmLeave` on an
empty room still stops it, and `isAlive mustBe false` **passes for the wrong
reason**. It is rewritten in task 2 to seed its members instead of joining
them, the case being about stop-when-empty and not about `Join` at all. Do not
"fix" it by registering sessions: that keeps a `Join` the case does not need.

---

## Task 1: The construction API, and the fixtures that go through it

**Files:**
- Modify: `src/main/scala/com/lunatech/pointingpoker/actors/Room.scala:60`,
  `:110-111`
- Create: `src/test/scala/com/lunatech/pointingpoker/actors/RoomDataFixtures.scala`
- Test: `src/test/scala/com/lunatech/pointingpoker/actors/RoomSpec.scala`
  (34 fixture sites, `object RoomSpec` at `:671-693`),
  `src/test/scala/com/lunatech/pointingpoker/actors/RoomSnapshotSpec.scala`
  (14 fixture sites)

**Interfaces:**
- Consumes: `Room.User`, `Room.Session(userId, name)`, `Room.SessionToken`,
  `Room.RoomData`, `Room.RoomData.empty`, all unchanged from step 5.
- Produces:
  - `Room.RoomData.of(users: List[Room.User], sessions: Map[Room.SessionToken, Room.Session], currentIssue: String = "", revealed: Boolean = false): RoomData`,
    public, throwing `IllegalArgumentException` on a member with no matching
    session.
  - `Room.RoomData`'s constructor, `apply` and `copy` become private to the
    class and its companion.
  - `RoomDataFixtures.withUsers(users: Room.User*): RoomData`
  - `RoomDataFixtures.withIssue(issue: String): RoomData`, an extension on
    `RoomData`
  - `RoomDataFixtures.withRevealed(revealed: Boolean = true): RoomData`, an
    extension on `RoomData`
  - `RoomDataFixtures.withMemberlessSession(users: Room.User*): RoomData`, an
    extension on `RoomData`
  - `RoomSpec.sessionsFor` is **removed**. Its logic moves into
    `RoomDataFixtures` as a private helper.

- [ ] **Step 1: Write the failing tests for `of`**

New cases in `RoomSpec`, at the end of the `"Room Actor" should` block, just
before its closing brace at `:668`. They test `of` directly rather than through
the actor, so they need no probes.

```scala
    "build a RoomData when every member has a matching session" in {
      val (user, _)  = createUser(UUID.randomUUID(), "user1", false, "")
      val (user2, _) = createUser(UUID.randomUUID(), "user2", true, "5")
      val sessions   = Map(
        user.token  -> Room.Session(user.id, user.name),
        user2.token -> Room.Session(user2.id, user2.name)
      )

      val data = RoomData.of(List(user, user2), sessions)

      data.users mustBe List(user, user2)
      data.sessions mustBe sessions
      data.currentIssue mustBe ""
      data.revealed mustBe false
    }

    "refuse a RoomData whose member has no session at all" in {
      val (user, _) = createUser(UUID.randomUUID(), "user1", false, "")

      val thrown = intercept[IllegalArgumentException] {
        RoomData.of(List(user), Map.empty)
      }

      thrown.getMessage must include("has no session")
    }

    "refuse a RoomData whose member's session names a different identity" in {
      val (user, _)  = createUser(UUID.randomUUID(), "user1", false, "")
      val (other, _) = createUser(UUID.randomUUID(), "user2", false, "")

      val thrown = intercept[IllegalArgumentException] {
        RoomData.of(List(user), Map(user.token -> Room.Session(other.id, other.name)))
      }

      thrown.getMessage must include("a different identity")
    }

    "refuse a RoomData whose member's session disagrees on the name alone" in {
      val (user, _) = createUser(UUID.randomUUID(), "user1", false, "")

      val thrown = intercept[IllegalArgumentException] {
        RoomData.of(List(user), Map(user.token -> Room.Session(user.id, "someone else")))
      }

      thrown.getMessage must include("a different identity")
    }

    "allow a session that has no member, which is what retention produces" in {
      val (user, _)     = createUser(UUID.randomUUID(), "user1", false, "")
      val (departed, _) = createUser(UUID.randomUUID(), "user2", false, "")
      val sessions      = Map(
        user.token     -> Room.Session(user.id, user.name),
        departed.token -> Room.Session(departed.id, departed.name)
      )

      val data = RoomData.of(List(user), sessions)

      data.users mustBe List(user)
      data.sessions.keySet mustBe Set(user.token, departed.token)
    }
```

The fourth case is the name clause on its own, which the third would pass
without. The fifth is the direction that must stay legal: `sessions` is a
superset of the members' tokens, never the reverse.

- [ ] **Step 2: Run them to verify they fail**

Run: `sbt "testOnly com.lunatech.pointingpoker.actors.RoomSpec"`
Expected: FAIL to compile, `value of is not a member of object Room.RoomData`.

- [ ] **Step 3: Add `of` to the companion**

Replace `Room.scala:110-111`:

```scala
  object RoomData:
    val empty: RoomData = RoomData(List.empty[User], "")
```

with:

```scala
  object RoomData:
    val empty: RoomData = RoomData(List.empty[User], "")

    def of(
        users: List[User],
        sessions: Map[SessionToken, Session],
        currentIssue: String = "",
        revealed: Boolean = false
    ): RoomData =
      // Invariant 5: ConnectToRoom creates every member off a resolved session, so a
      // member whose session is missing or disagrees is a fixture error, never a state.
      users.foreach { u =>
        require(sessions.contains(u.token), s"member ${u.name} (${u.id}) has no session")
        require(
          sessions(u.token) == Session(u.id, u.name),
          s"the session for member ${u.name} (${u.id}) holds a different identity"
        )
      }
      RoomData(users, currentIssue, revealed, sessions)
```

Note the parameter order: `sessions` is second here though it is fourth on the
class, because every caller passes it and almost none pass the other two.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `sbt "testOnly com.lunatech.pointingpoker.actors.RoomSpec"`
Expected: PASS, all five new cases plus the existing suite.

- [ ] **Step 5: Commit**

```bash
sbt scalafmtAll
git add src/main/scala/com/lunatech/pointingpoker/actors/Room.scala \
        src/test/scala/com/lunatech/pointingpoker/actors/RoomSpec.scala
git commit -m "feat(actors): add a validating RoomData.of"
```

- [ ] **Step 6: Create the fixtures object**

Create `src/test/scala/com/lunatech/pointingpoker/actors/RoomDataFixtures.scala`:

```scala
package com.lunatech.pointingpoker.actors

import com.lunatech.pointingpoker.actors.Room.RoomData

object RoomDataFixtures:

  def withUsers(users: Room.User*): RoomData =
    RoomData.of(users.toList, sessionsFor(users*))

  extension (data: RoomData)
    def withIssue(issue: String): RoomData =
      RoomData.of(data.users, data.sessions, issue, data.revealed)

    def withRevealed(revealed: Boolean = true): RoomData =
      RoomData.of(data.users, data.sessions, data.currentIssue, revealed)

    // A session whose member has gone or has not yet arrived; both reach the same state.
    def withMemberlessSession(users: Room.User*): RoomData =
      RoomData.of(
        data.users,
        data.sessions ++ sessionsFor(users*),
        data.currentIssue,
        data.revealed
      )

  private def sessionsFor(users: Room.User*): Map[Room.SessionToken, Room.Session] =
    users.map(u => u.token -> Room.Session(u.id, u.name)).toMap
```

Every extension rebuilds through `of` rather than through `copy`, which the
next-but-one step makes private, and which a test-scope extension could not
reach in any case.

- [ ] **Step 7: Migrate `RoomSpec`'s 34 fixture sites**

Add the import under `import RoomSpec.*` at `:16`:

```scala
  import RoomDataFixtures.*
```

Then apply this rule at every `RoomData.empty.copy(...)`:

| Today | Becomes |
|---|---|
| `.copy(users = List(a, b))` | `withUsers(a, b)` |
| `.copy(users = List(a, b), revealed = true)` | `withUsers(a, b).withRevealed()` |
| `.copy(users = List(a), currentIssue = i)` | `withUsers(a).withIssue(i)` |
| `.copy(users = List(a, b), currentIssue = i, revealed = true)` | `withUsers(a, b).withIssue(i).withRevealed()` |
| `.copy(users = List(a), sessions = sessionsFor(a))` | `withUsers(a)` |
| bare `RoomData.empty` | unchanged |

The 34 sites are at `:31`, `:40`, `:50`, `:65`, `:80`, `:104`, `:120`, `:139`,
`:150`, `:159`, `:169`, `:186`, `:203`, `:220`, `:248`, `:262`, `:272`, `:295`,
`:323`, `:334`, `:344`, `:376`, `:415`, `:460`, `:489`, `:525`, `:540`, `:555`,
`:569`, `:592`, `:611`, `:628`, `:643`, `:656`. The four bare `RoomData.empty`
uses at `:384`, `:400`, `:425` and `:436` stay as they are: `empty` is still
public and holds no members, so it is valid.

`User.copy` is untouched by any of this, so the nested copies at `:65-69`,
`:139` and `:334` migrate mechanically:

```scala
      dataProbe.expectMessage(
        Room.DataStatus(data =
          withUsers(
            user.copy(voted = false, estimation = ""),
            user2.copy(voted = false, estimation = "")
          )
        )
      )
```

**One site is not mechanical.** `:262` is the expectation after a departure, and
retention means the departed member's session survives. Replace it with:

```scala
      dataProbe.expectMessage(
        Room.DataStatus(data = withUsers(user2).withMemberlessSession(user))
      )
```

Do not write it as `withUsers(user, user2).withMemberlessSession(user)`: that
would produce the same value, but it describes the transition the room's own
`leave` just performed, and building the expectation out of the operation under
test is how an assertion becomes a tautology.

- [ ] **Step 8: Remove `sessionsFor` from `object RoomSpec`**

Delete `:682-683`. Its three callers were at `:415`, `:460` and `:489` and all
three became `withUsers` in the previous step.

- [ ] **Step 9: Run the suite**

Run: `sbt "testOnly com.lunatech.pointingpoker.actors.RoomSpec"`
Expected: PASS. A failure here is a mis-migrated site, not a real defect: the
fixtures now carry sessions they did not before, and no assertion in this spec
reads `sessions` except `:392`, `:446` and the `:262` case just handled.

- [ ] **Step 10: Commit**

```bash
sbt scalafmtAll
git add src/test/scala/com/lunatech/pointingpoker/actors/RoomDataFixtures.scala \
        src/test/scala/com/lunatech/pointingpoker/actors/RoomSpec.scala
git commit -m "test(actors): build RoomSpec's fixtures through the validating factory"
```

- [ ] **Step 11: Migrate `RoomSnapshotSpec`'s 14 fixture sites**

Add to its imports, after `:12`:

```scala
import com.lunatech.pointingpoker.actors.RoomDataFixtures.*
```

Apply the same rule at `:28`, `:38`, `:46`, `:54`, `:62`, `:71`, `:78`, `:93`,
`:107`, `:122`, `:130`, `:144`, `:156` and `:166`. All fourteen are mechanical;
none seeds `sessions` today and none asserts on it. Two examples:

```scala
      val data = withUsers(alice, bob).withRevealed()          // :46, :122, :166
      val data = withUsers(alice).withIssue("PP-1")            // :54
```

and `:78`, the only three-field site:

```scala
      val data = withUsers(alice).withIssue("PP-1").withRevealed()
```

- [ ] **Step 12: Run the suite**

Run: `sbt "testOnly com.lunatech.pointingpoker.actors.RoomSnapshotSpec"`
Expected: PASS, all 14 cases.

- [ ] **Step 13: Commit**

```bash
sbt scalafmtAll
git add src/test/scala/com/lunatech/pointingpoker/actors/RoomSnapshotSpec.scala
git commit -m "test(actors): build RoomSnapshotSpec's fixtures through the validating factory"
```

- [ ] **Step 14: Write the failing compile-time test**

This is the case that proves the lock, and it must be written before the lock
exists so its red is real. Add it to `RoomSpec` beside the `of` cases:

```scala
    "refuse construction that bypasses of" in {
      // The whole point of the private constructor: copy and apply are shut too, so a
      // fixture cannot reach an invalid RoomData by going around the factory.
      assertDoesNotCompile("""Room.RoomData(Nil, "", false, Map.empty)""")
      assertDoesNotCompile("""RoomData.empty.copy(currentIssue = "x")""")
      // Guards the two above against passing vacuously on a typo rather than on access.
      assertCompiles("""RoomData.of(Nil, Map.empty)""")
    }
```

The third assertion is not decoration. `assertDoesNotCompile` passes whenever
the snippet fails for **any** reason, a misspelled name included, so without a
positive control the case can go green while proving nothing.

- [ ] **Step 15: Run it to verify it fails**

Run: `sbt "testOnly com.lunatech.pointingpoker.actors.RoomSpec -- -z "bypasses of""`
Expected: FAIL on the first `assertDoesNotCompile`, reporting that the snippet
did compile. The `assertCompiles` control should already be green, `of` having
landed at step 3; if it is not, fix that before reading anything into the red.

- [ ] **Step 16: Close the constructor**

Change `Room.scala:60` from:

```scala
  final case class RoomData(
```

to:

```scala
  final case class RoomData private (
```

Scala 3 propagates the constructor's access to the generated `apply` and
`copy`. `RoomData.empty` and `of` are in the companion and keep their access;
the ten `this.copy(...)` and `u.copy(...)` calls at `:71-107` are inside the
class and keep theirs.

- [ ] **Step 17: Run the whole suite**

Run: `sbt scalafmtCheckAll test`
Expected: PASS, and in particular a clean compile. If any test file fails to
compile here, it is a fixture site step 7 or step 11 missed, and the compiler
names it. That is the intended safety net, so fix the site rather than
loosening the constructor.

- [ ] **Step 18: Commit**

```bash
sbt scalafmtAll
git add src/main/scala/com/lunatech/pointingpoker/actors/Room.scala \
        src/test/scala/com/lunatech/pointingpoker/actors/RoomSpec.scala
git commit -m "feat(actors): make RoomData's constructor private"
```

---

## Task 2: The `Join` guard

**Files:**
- Modify: `src/main/scala/com/lunatech/pointingpoker/actors/Room.scala:133-134`
- Test: `src/test/scala/com/lunatech/pointingpoker/actors/RoomSpec.scala:299-318`,
  `:338-379`, `:564-585`;
  `src/test/scala/com/lunatech/pointingpoker/actors/RoomManagerSpec.scala:279-303`

**Interfaces:**
- Consumes: everything task 1 produces, in particular
  `RoomDataFixtures.withUsers` and
  `RoomDataFixtures.withMemberlessSession`.
- Produces: no new names. The `Join` case ignores a user whose token is in no
  session, and warns.

- [ ] **Step 1: Rewrite the stop-when-empty case so the guard cannot fake it**

`RoomSpec.scala:299-318` populates its room with two `Join`s. Under the guard
those joins are refused, the room is empty from the start, `ConfirmLeave` still
stops it, and the assertion passes having proved nothing. The case is about
stop-when-empty, so seed the members instead. Replace the whole case with:

```scala
    "stop itself if empty" in {
      val probe = TestProbe()(testKit.system.classicSystem)
      val user  =
        Room.User(UUID.randomUUID(), "user1", false, "", probe.ref, Room.SessionToken.mint())
      val user2 =
        Room.User(UUID.randomUUID(), "user2", false, "", probe.ref, Room.SessionToken.mint())
      val roomResponseProbe = testKit.createTestProbe[Room.Response]()

      val roomId = UUID.randomUUID()
      // Seeded rather than joined: Join is not what this case is about, and a refused
      // Join would leave the room empty and pass the assertion for the wrong reason.
      val behaviorTestKit =
        BehaviorTestKit(Room(roomId, withUsers(user, user2)), roomId.toString)

      // BehaviorTestKit doesn't drive real timers, so send the post-grace-period effect
      // directly rather than Leave (which only schedules it).
      behaviorTestKit.run(Room.ConfirmLeave(user.id, user.ref, roomResponseProbe.ref))
      behaviorTestKit.run(Room.ConfirmLeave(user2.id, user2.ref, roomResponseProbe.ref))
      behaviorTestKit.isAlive mustBe false
    }
```

- [ ] **Step 2: Run it, and confirm it is green before the guard exists**

Run: `sbt "testOnly com.lunatech.pointingpoker.actors.RoomSpec -- -z "stop itself if empty""`
Expected: PASS. This step is a refactor of the case, not a new assertion, so
green here and green after the guard is the correct outcome.

- [ ] **Step 3: Write the failing test for the guard**

Add to `RoomSpec`, after the `"replace an existing user's entry on rejoin"`
case at `:336`:

```scala
    "ignore a Join whose token is in no session" in {
      val (user, _)     = createUser(UUID.randomUUID(), "user1", false, "")
      val (stranger, _) = createUser(UUID.randomUUID(), "stranger", false, "")
      val dataProbe     = testKit.createTestProbe[Room.DataStatus]()
      val (_, roomRef)  = createRoom(UUID.randomUUID(), withUsers(user))

      // Nothing mints stranger's token, so ConnectToRoom could never have produced this
      // Join; the room drops it rather than manufacturing an unresolvable member.
      LoggingTestKit.warn("resolves to no session").expect {
        roomRef ! Room.Join(stranger)
        roomRef ! Room.GetData(dataProbe.ref)
        dataProbe.expectMessage(Room.DataStatus(data = withUsers(user)))
      }(using testKit.system)
    }
```

Add the import to `:7`:

```scala
import org.apache.pekko.actor.testkit.typed.scaladsl.{
  ActorTestKit,
  BehaviorTestKit,
  LoggingTestKit
}
```

`LoggingTestKit` installs its own appender on the SLF4J backend at runtime, and
`logback-classic` is already a compile dependency with no `logback.xml` in the
tree, so no configuration is expected. If the assertion still fails after step
5 with the member correctly unchanged, the appender is the cause: add
`src/test/resources/logback-test.xml` with pekko's `CapturingAppender` on the
root logger and re-run. Do not weaken the assertion to the no-op alone; the
trace is the reason this warns rather than staying silent.

- [ ] **Step 4: Run it to verify it fails**

Run: `sbt "testOnly com.lunatech.pointingpoker.actors.RoomSpec -- -z "in no session""`
Expected: FAIL. Two failures are possible and both are correct reds: the
`DataStatus` comparison, because `stranger` was added as a member, and the
missing warn.

- [ ] **Step 5: Add the guard**

Replace `Room.scala:133-134`:

```scala
        case Join(user) =>
          receiveBehaviour(roomId, publish(data.joinUser(user), context), gracePeriod, timers)
```

with:

```scala
        case Join(user) =>
          // Invariant 5: ConnectToRoom runs only on a resolved session, so this cannot fire
          // in production; warn rather than raise, which would stop the room and drop everyone.
          if !data.sessions.contains(user.token) then
            context.log.warn(
              "Ignoring Join for user {} in room {}: its token resolves to no session.",
              user.id,
              roomId
            )
            Behaviors.same
          else
            receiveBehaviour(roomId, publish(data.joinUser(user), context), gracePeriod, timers)
```

The line carries the user and room ids and not the token, which section 4 of
the design treats as a rejoin credential for the room's life.

- [ ] **Step 6: Run the guard's test**

Run: `sbt "testOnly com.lunatech.pointingpoker.actors.RoomSpec -- -z "in no session""`
Expected: PASS.

- [ ] **Step 7: Run the whole suite and read the failures**

Run: `sbt test`
Expected: FAIL, in exactly three cases, all of them a `Join` whose joiner holds
no session:

- `RoomSpec` `"publish the whole room to a joiner and to everyone already in it"` (`:338`)
- `RoomSpec` `"keep the round revealed when a straggler joins"` (`:564`)
- `RoomManagerSpec` `"keep a member's vote when ConnectToRoom re-registers them after a reconnect"` (`:279`)

Any other failure is a real regression. Stop and investigate rather than
patching the fixture.

- [ ] **Step 8: Give the three joiners a session**

In `RoomSpec.scala:338-379`, `newUser` is defined at `:347-355`, below the
fixture at `:343-344`. Move its definition above the fixture and seed it:

```scala
      val newUserProbe = TestProbe()(testKit.system.classicSystem)
      val newUser      = Room.User(
        UUID.randomUUID(),
        "new user",
        false,
        "",
        newUserProbe.ref,
        Room.SessionToken.mint()
      )
      val internalData =
        withUsers(user, user2).withIssue(issue).withMemberlessSession(newUser)
      val (_, roomRef) = createRoom(UUID.randomUUID(), internalData)
```

The expectation at `:374-378` needs no memberless clause, `newUser` being a
member by then:

```scala
      dataProbe.expectMessage(
        Room.DataStatus(data = withUsers(newUser, user, user2).withIssue(issue))
      )
```

In `RoomSpec.scala:564-585`, the same move. `newUser` is defined at `:571-579`,
below the fixture at `:567-570`. Hoist it and seed:

```scala
      val newUserProbe = TestProbe()(testKit.system.classicSystem)
      val newUser      = Room.User(
        UUID.randomUUID(),
        "new user",
        false,
        "",
        newUserProbe.ref,
        Room.SessionToken.mint()
      )
      val (_, roomRef) = createRoom(
        UUID.randomUUID(),
        withUsers(user).withRevealed().withMemberlessSession(newUser)
      )
```

In `RoomManagerSpec.scala:279-303`, the room is spawned bare at `:285` as
`testKit.spawn(Room(roomId))` and the manager then forwards a `Join` built from
the local `userId`, `"Alice"` and `token`. Build the user value once and seed
its session:

```scala
      val alice = Room.User(userId, "Alice", false, "", firstProbe.ref, token)
      // Alice's session exists before her member does, which is the state ConnectToRoom
      // always arrives in; without it the room's Join guard drops the connection.
      val roomRef = testKit.spawn(Room(roomId, withUsers().withMemberlessSession(alice)))
```

`withUsers()` with no arguments is the empty room, `of(Nil, Map.empty)`, and
chaining from it is how this site reaches the extension. Do not reach for the
prefix form `withMemberlessSession(data)(alice)`; the chain is the form every
other site uses. `RoomManagerSpec` is already in package
`com.lunatech.pointingpoker.actors`, so it needs one import:

```scala
import com.lunatech.pointingpoker.actors.RoomDataFixtures.*
```

- [ ] **Step 9: Run the whole suite**

Run: `sbt scalafmtCheckAll test`
Expected: PASS, all cases.

- [ ] **Step 10: Run the browser suite**

Run: `npm test && npm run e2e`
Expected: PASS, 14 node tests and 54 Playwright cases in both engines. Nothing
here should move: the guard is unreachable through the real transport, which is
the point. A failure means the guard is rejecting a legitimate join.

- [ ] **Step 11: Commit**

```bash
sbt scalafmtAll
git add src/main/scala/com/lunatech/pointingpoker/actors/Room.scala \
        src/test/scala/com/lunatech/pointingpoker/actors/RoomSpec.scala \
        src/test/scala/com/lunatech/pointingpoker/actors/RoomManagerSpec.scala
git commit -m "feat(actors): ignore a Join whose token is in no session"
```

---

## Task 3: The record

**Files:**
- Modify: `docs/known-issues.md:100-133`
- Modify: `docs/superpowers/specs/2026-08-31-protocol-target-architecture-design.md:2013`

**Interfaces:**
- Consumes: the landed state of tasks 1 and 2.
- Produces: nothing code depends on.

- [ ] **Step 1: Delete the construction-gap known issue**

Remove `docs/known-issues.md:100-133` in full, the entry headed
"### `RoomData` can be constructed with a member who has no session". Its own
last line says "Remove this entry when step 5a lands". Delete the trailing
blank line with it so the entry below keeps its spacing.

Its Resolution paragraph names a `departed` extension and a containment check
"with matching ids". Both predate this plan, which renamed the extension to
`withMemberlessSession` and added the name clause. Do not correct the entry,
delete it: the design section carries the settled version.

- [ ] **Step 2: Add the landed note to the design**

After the step 5a opening paragraph, which ends "About 20 and 70 of tests." at
`:2020`, insert a paragraph in the same place and shape as step 5's:

```
Landed. The constructor is private, `RoomData.of` is the only way in from
outside the class, and a compile-time case in `RoomSpec` pins both `apply` and
`copy` shut. All 48 fixture sites build through `RoomDataFixtures`, and the
four needing a session without a member say so. The `Join` guard warns and
drops rather than raising, and `docs/known-issues.md` lost the construction-gap
entry.
```

Check the wording against what actually landed before committing it. If task 2
was rejected, the last sentence goes and the guard stays open as a known issue
instead.

- [ ] **Step 3: Sweep the citations the guard shifted**

The guard inserts roughly eight lines at `Room.scala:133`, so every citation
into `Room.scala` at a line above 133 is unaffected and every one below has
moved. Find them:

```bash
grep -rn 'Room\.scala:[0-9]' docs/ README.md
```

Three rules, in this order:

1. A pointer to a line **below** the insert is stale by the insert's size.
   Re-resolve it against the file rather than adding a constant: the line may
   have moved for other reasons too.
2. A present-tense claim about live code gets a correct pointer, even where it
   sits inside a paragraph describing an earlier step.
3. A pointer that is explicitly historical, citing the file as it stood when an
   argument was made, stays as it is. The design's own
   "The citation is to the pre-step-1 file the design was written against" is
   the marker for this.

No total is given here on purpose. `docs/known-issues.md`'s stale-citation
entry records why: three review rounds produced a different count each time,
and the count was never what a sweep needed.

- [ ] **Step 4: Record the sweep**

Add a sentence to the stale-citation entry in `docs/known-issues.md` naming
this step's sweep and what it covered, in the same form the step 5 sweep used.

- [ ] **Step 5: Check the documents**

```bash
grep -rnP '\x{2014}' docs/known-issues.md docs/superpowers/specs/ README.md \
  docs/superpowers/plans/2026-08-31-*.md
```

Expected: no matches. No em dash in any document. The pattern is written as an
escape rather than as the character so that running the check does not put one
into this plan. The two pre-2026-08-31 plans are excluded deliberately: they
belong to earlier designs that predate the rule.

- [ ] **Step 6: Commit**

```bash
git add docs/
git commit -m "docs: record step 5a as landed, and close the construction gap"
```

---

## Deviations from the plan, and why

Listed so a reviewer can reject one without re-deriving it.

1. **Task 1 found a fixture site the plan wrongly called mechanical, and
   fixed it early.** `RoomSpec`'s "publish the whole room to a joiner" case
   compares a whole `RoomData` at its expectation. Migrating it mechanically
   to `withUsers(newUser, user, user2)` derives a session for the joiner
   that the actual room lacks, because `Join` creates no session, so it
   fails at task 1 rather than task 2. Task 1 applied the fix task 2 step 8
   prescribed. The planning miss: the site's fixture was checked against the
   guard, its expectation was not.

2. **The plan predicted three failing cases when the guard landed; one
   failed.** Task 1's early fix removed one. The other, "keep the round
   revealed when a straggler joins", passed vacuously instead: it seeds
   `revealed = true` and asserts `revealed` is still true, so a silently
   dropped `Join` satisfies it. Only `RoomManagerSpec`'s reconnect case
   actually failed.

3. **The straggler case needed more than the prescribed fix.** Seeding its
   session fixed why the join was dropped without making the assertion
   notice whether it landed. It now compares the whole `RoomData`, and the
   fix was proven by removing the seeding and watching it report "expected 2
   members, found 1". Three cases in this suite were found green against a
   dropped `Join` during this step; the plan's hazard analysis caught only
   the one that built its fixture via `Join`, and missed both whose
   assertions were too weak to see a missing member.

4. **The citation sweep was narrowed from the plan's `docs/` and
   `README.md` to three files.** `docs/known-issues.md`, the 2026-08-31
   design, and `README.md`, which turned out to hold no `Room.scala`
   pointers at all. The plan's grep would have swept 42 pointers in
   `2026-08-26-sse-delta-resync-design.md` and
   `2026-08-28-sse-snapshot-protocol-design.md`, both cancelled designs and
   frozen. Plan files for completed steps were excluded on the same
   reasoning.

5. **Three pre-existing stale citations were found and deliberately left.**
   `Room.scala:130` for `joinUser`'s call site, which is `:163`, and
   `:66-74` and `:67-74` for `joinUser` itself, which ends at `:73`. Outside
   a sweep scoped to what this step's insertions moved. They are named in
   `docs/known-issues.md`'s standing stale-citation entry so a future
   sweeper inherits a task rather than re-deriving it.

6. **The `Join` guard was widened after the final review, and the spec with
   it.** It was specified as containment-only while `of` also requires the
   session to hold the member's id and name, so a `Join` against a session
   naming a different identity produced a live `RoomData` that `of` would
   reject. Unreachable today, since `ConnectToRoom` takes both from the
   resolution, but step 4 makes the coupling load-bearing. The asymmetry was
   an omission at design time rather than a decision.

7. **A refused `Join` returns without publishing**, so the connecting
   client's SSE stream stays open and receives no snapshot. Correct for a
   case that cannot occur, and recorded here rather than in the guard's
   comment, which is at this project's two-line ceiling. Worth revisiting at
   step 4 if that step changes reachability.
