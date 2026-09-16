# Idle Stop Without the Wall Clock Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Take the wall clock out of the idle-stop decision, delete the idle
stamp the re-armed timer already makes redundant, and replace the sleep-based
idle cases with deterministic `BehaviorTestKit` ones that run at the real
two-hour default.

**Architecture:** The single-shot timer is re-armed on every non-tick message
and pekko discards a superseded generation, so a tick that gets processed
already means a full `stop-after-idle` has passed since the last message.
`RoomData.emptySince` was stamped only by message handlers, so it can never be
later than that last message, which makes the elapsed comparison in
`RoomData.idleFor` unable to move the stop instant. It can only disagree with
the timer when the system clock steps backwards, which is the defect
`docs/known-issues.md` currently records as accepted. The tick therefore asks
`connections.isEmpty` and nothing else. With no clock in that condition,
`BehaviorTestKit` can drive the whole mechanism by hand, so four of the five
idle cases become deterministic and one wall-clock case remains to prove pekko
really delivers the timer.

**Tech Stack:** Scala 3.8.4, Pekko typed actors 1.7.0, Typesafe Config,
ScalaTest (`AnyWordSpec` + `must.Matchers`) with `ActorTestKit` and
`BehaviorTestKit`, Playwright for e2e.

**Spec:** `docs/superpowers/specs/2026-08-31-protocol-target-architecture-design.md`,
section 3 "Two lifetimes, not one" and the section beginning
"**Step 4a. Stop-after-idle.**". This plan revises both, so the spec edits are
tasks here rather than follow-up work.

**Predecessor:** `docs/superpowers/plans/2026-08-31-protocol-architecture-4a-stop-after-idle.md`,
which this plan amends. That plan specified `emptySince` and `idleFor`; tasks 2
and 3 remove them and record the deviation there.

**Branch:** land on the existing `20260831.protocol_architecture_4a_stop_after_idle`.
These are additional commits on the same branch rather than a new one, and the
stacked-merge position is unchanged. The branch was local-only when this plan was
written; PR #405 was opened against `20260831.protocol_architecture_4_state_split`
later the same day, so these commits land in that PR.

## Global Constraints

Carried from the 4a plan, still binding:

- **There is no `sawMessage`, in `RoomData` or anywhere else.** The deferral is
  carried by re-arming the tick's single-shot timer on every message. This plan
  extends the same reasoning to `emptySince`.
- **The name is `stop-after-idle`, never `idle-timeout`.**
  `pointing-poker.probe.idle-timeout` is the pekko-http server binding timeout
  and is correctly named for that. Do not touch it.
- **The configured chain is `retry < grace << idle`**, validated by four
  `require`s in one `LifecycleConfig.load`. No config change in this plan.

New to this plan:

- **Every commit leaves a tree that can stop a room.** Task 2 changes the
  condition in place; no commit removes the stop path.
- **`connections` changes only on the message path.** This is what makes the
  re-armed timer a complete account of idle time, and after this plan it is
  load-bearing rather than incidental: every mutation of `connections` arrives
  as a `Command` and so re-arms the tick. A later step that drops a connection
  from a signal handler instead, a `Terminated` watch replacing write-failure
  detection being the obvious candidate, would not re-arm, and the stop would
  then land relative to the last message rather than the last emptiness. Task 2
  writes this into the spec as a named invariant so a future step has to
  consider it rather than discover it.
- **Cite symbols, not line numbers,** in every doc edit. Where prose already
  quotes the code, drop the pointer entirely. Do not retrofit citations the
  task does not touch anyway.
- **Conventional Commits** for every commit message.
- **Comments are one or two lines.** Longer rationale belongs in the commit
  message or in `docs/known-issues.md`.
- **No em dash in any prose this plan writes.**

---

## File Structure

- `src/main/scala/com/lunatech/pointingpoker/actors/Room.scala`
  Owns `RoomData` and the room behaviour. Task 2 changes one condition in the
  `IdleTick` branch of `receiveBehaviour`. Task 3 removes `RoomData.emptySince`,
  `RoomData.startedAt`, `RoomData.idleFor`, the `now` parameter on
  `RoomData.disconnect`, the `emptySince` parameter on `RoomData.of`, and the
  now unused `java.time.Instant` import.
- `src/test/scala/com/lunatech/pointingpoker/actors/RoomSpec.scala`
  Owns every room case. All three code tasks touch it. Gains an `onlyTimer`
  helper and four `BehaviorTestKit` cases; loses three sleep-based ones.
- `docs/known-issues.md`
  Task 2 deletes the wall-clock entry outright, since the condition it
  describes stops existing. Task 4 corrects what the remaining entry claims
  about the tests.
- `docs/superpowers/specs/2026-08-31-protocol-target-architecture-design.md`
  Tasks 2 and 3 revise section 3 and the step 4a section.
- `docs/superpowers/plans/2026-08-31-protocol-architecture-4a-stop-after-idle.md`
  Task 3 records the deviation; task 4 corrects its case-count figure.

Nothing outside `Room.scala` reads `emptySince`, `startedAt` or `idleFor`.
`RoomManager.scala`, `SSE.scala` and `API.scala` are untouched by this plan.

---

## Task 1: Pin the timer mechanism with effect assertions

The existing case "defer its stop by a full delay when any message arrives"
passes with the message re-arm deleted entirely, so the branch's central
mechanism has no regression test. `BehaviorTestKit` records timer scheduling as
an `Effect` even though it does not run timers, which pins the mechanism
deterministically and at the real default rather than at a shrunken one.

No production change in this task.

**Files:**
- Modify: `src/test/scala/com/lunatech/pointingpoker/actors/RoomSpec.scala`

**Interfaces:**
- Consumes: `Room.apply`, `Room.IdleTick` (`private[actors]`, so reachable from
  this package), `Room.GetData`, `Room.defaultStopAfterIdle`, and the existing
  `createUser` / `withUsers` fixtures.
- Produces: an `onlyTimer(effects: Seq[Effect]): Effect.TimerScheduled[?]`
  helper that tasks 2 and 3 reuse.

Note: `Room.IdleTickKey` is `private` to the `Room` object, so a test cannot
name it. Assert on `msg`, `delay`, `mode` and `overriding` instead. The message
identifies the timer uniquely.

- [ ] **Step 1: Add the imports and the helper**

Add `Effect` to the testkit imports and `TestInbox` to the existing
`testkit.typed.scaladsl` import in `RoomSpec.scala`:

```scala
import org.apache.pekko.actor.testkit.typed.Effect
import org.apache.pekko.actor.testkit.typed.scaladsl.{
  ActorTestKit,
  BehaviorTestKit,
  LoggingTestKit,
  TestInbox
}
```

Add the helper to the class body, directly after `afterAll`. It must live in
the class rather than the `RoomSpec` companion, because `fail` comes from
`Assertions`, which the class already mixes in through `AnyWordSpec`:

```scala
  // BehaviorTestKit records timer scheduling without running timers, which is what
  // lets these cases run at the real two-hour default.
  def onlyTimer(effects: Seq[Effect]): Effect.TimerScheduled[?] = effects match
    case Seq(t: Effect.TimerScheduled[?]) => t
    case other                            => fail(s"expected exactly one scheduled timer, got $other")
```

`retrieveAllEffects()` returns `Seq`, not `List`. Matching on `List` is a
compile error, not a test failure.

- [ ] **Step 2: Add the two new cases**

Add both inside the `"Room Actor" should { ... }` block, beside the other idle
cases:

```scala
    "arm a single-shot idle timer at setup, for the configured delay" in {
      val roomId = UUID.randomUUID()
      val btk    = BehaviorTestKit(Room(roomId, RoomData.empty), roomId.toString)

      val timer = onlyTimer(btk.retrieveAllEffects())
      timer.msg mustBe Room.IdleTick
      timer.delay mustBe Room.defaultStopAfterIdle
      timer.mode mustBe Effect.TimerScheduled.SingleMode
      timer.overriding mustBe false
    }

    "re-arm the timer, superseding the pending tick, on any non-tick message" in {
      val roomId = UUID.randomUUID()
      val btk    = BehaviorTestKit(Room(roomId, RoomData.empty), roomId.toString)
      btk.retrieveAllEffects()

      // The re-arm is what the branch chose instead of a sawMessage field, and
      // overriding is what voids a tick already queued from the old generation.
      btk.run(Room.GetData(TestInbox[Room.DataStatus]().ref))

      val timer = onlyTimer(btk.retrieveAllEffects())
      timer.msg mustBe Room.IdleTick
      timer.delay mustBe Room.defaultStopAfterIdle
      timer.overriding mustBe true
    }
```

- [ ] **Step 3: Replace the sleep-based "stay alive while a connection is attached" case**

Delete this case in full, including its dead `watcher` value. Its
`watcher.expectNoMessage(700.millis)` observes nothing: a `TestProbe` only sees
terminations through `expectTerminated`, which registers its own watch.

```scala
    "stay alive while a connection is attached, however quiet the room is" in {
      val (user, _)    = createUser(UUID.randomUUID(), "user1", false, "")
      val watcher      = testKit.createTestProbe()
      val (_, roomRef) = createRoom(
        UUID.randomUUID(),
        withUsers(user),
        stopAfterIdle = 200.millis
      )

      // Message silence is a veto on stopping, not a reason to stop: five people arguing for
      // two hours before anyone clicks a card must not be disconnected mid-meeting.
      watcher.expectNoMessage(700.millis)

      val dataProbe = testKit.createTestProbe[Room.DataStatus]()
      roomRef ! Room.GetData(dataProbe.ref)
      dataProbe.expectMessageType[Room.DataStatus].data.members.keySet mustBe Set(user.id)
    }
```

Put this in its place:

```scala
    "survive a tick while a connection is attached, and re-arm" in {
      val (user, _) = createUser(UUID.randomUUID(), "user1", false, "")
      val roomId    = UUID.randomUUID()
      val btk       = BehaviorTestKit(Room(roomId, withUsers(user)), roomId.toString)
      btk.retrieveAllEffects()

      // Message silence is a veto on stopping, not a reason to stop: five people arguing
      // for two hours before anyone clicks a card must not be disconnected mid-meeting.
      btk.run(Room.IdleTick)

      btk.isAlive mustBe true
      onlyTimer(btk.retrieveAllEffects()).overriding mustBe true
    }
```

- [ ] **Step 4: Delete the vacuous deferral case**

Delete "defer its stop by a full delay when any message arrives" in full. The
new re-arm case supersedes it and, unlike it, can fail. What the deleted case
claimed beyond the re-arm, that the stop actually lands later, is the
scheduler's job and stays covered by the surviving wall-clock case in task 2.

- [ ] **Step 5: Run the suite**

Run: `sbt scalafmtAll scalafmtCheckAll test`
Expected: PASS. Net case count is up one: two added, one replaced in place, one
deleted. Record the number the run reports rather than assuming it.

- [ ] **Step 6: Prove the new case has teeth**

This step is the point of the task, so do not skip it. In
`Room.scala:receiveBehaviour`, temporarily replace

```scala
        if message != IdleTick then armIdleTick(timers, stopAfterIdle)
```

with

```scala
        if false then armIdleTick(timers, stopAfterIdle)
```

Run: `sbt 'testOnly com.lunatech.pointingpoker.actors.RoomSpec -- -z "re-arm the timer"'`
Expected: FAIL with `expected exactly one scheduled timer, got List()`.

Then revert the mutation and re-run the same command.
Expected: PASS.

Do not commit the mutation. `git diff src/main` must be empty before step 7.

- [ ] **Step 7: Commit**

```bash
git add src/test/scala/com/lunatech/pointingpoker/actors/RoomSpec.scala
git commit -m "test(actors): pin the idle timer's arming and re-arming as effects

The deferral case passed with the message re-arm deleted outright, so the
mechanism the branch chose instead of sawMessage had no regression test.
BehaviorTestKit records the scheduling without running the timer, which also
lets these cases assert the real two-hour default instead of a shrunken one."
```

---

## Task 2: Decide the idle stop by emptiness, not by elapsed wall-clock time

`RoomData.idleFor` compares `Instant`s, which is what
`docs/known-issues.md` records as an accepted wall-clock defect. The comparison
is redundant: `emptySince` is written only by message handlers, so it is never
later than the last message, and the re-armed timer already guarantees a full
delay since that message. The only case where the comparison changes the answer
is a backward clock step, which is the defect itself.

**Files:**
- Modify: `src/main/scala/com/lunatech/pointingpoker/actors/Room.scala`
  (`receiveBehaviour`, the `IdleTick` branch)
- Modify: `src/test/scala/com/lunatech/pointingpoker/actors/RoomSpec.scala`
- Modify: `docs/known-issues.md`
- Modify: `docs/superpowers/specs/2026-08-31-protocol-target-architecture-design.md`

**Interfaces:**
- Consumes: `onlyTimer` from task 1, `RoomData.connections`, `Room.Leave`.
- Produces: an `IdleTick` branch that reads `data.connections.isEmpty`. Task 3
  relies on that being the only remaining reader of the idle-stamp machinery.

- [ ] **Step 1: Write the two failing cases**

Add beside the other idle cases in `RoomSpec.scala`:

```scala
    "stop on a tick when it holds no connection" in {
      val roomId = UUID.randomUUID()
      val btk    = BehaviorTestKit(Room(roomId, RoomData.empty), roomId.toString)

      // Never connected at all, which is the never-joined room this bounds: /join
      // without the /events that should have followed it.
      btk.run(Room.IdleTick)

      btk.isAlive mustBe false
    }

    "stop on a tick once its last member has left" in {
      val (user, _) = createUser(UUID.randomUUID(), "user1", false, "")
      val roomId    = UUID.randomUUID()
      val btk       = BehaviorTestKit(Room(roomId, withUsers(user)), roomId.toString)

      // Leave drops the connection; the member row outlives it until ConfirmLeave.
      btk.run(Room.Leave(user.id, user.ref))
      btk.run(Room.IdleTick)

      btk.isAlive mustBe false
    }
```

- [ ] **Step 2: Run them to verify they fail**

Run: `sbt 'testOnly com.lunatech.pointingpoker.actors.RoomSpec -- -z "on a tick"'`
Expected: both FAIL on `true was not equal to false`. A hand-delivered tick
cannot stop the room today, because a freshly built room is not two hours old
by `Instant.now()`, so `idleFor` is false and the tick re-arms instead.

- [ ] **Step 3: Change the condition**

In the `IdleTick` branch of `receiveBehaviour`, replace

```scala
            if data.idleFor(stopAfterIdle, Instant.now()) then
```

with

```scala
            if data.connections.isEmpty then
```

Leave the surrounding branch, the log line, the else-branch re-arm and the
top-of-match re-arm exactly as they are. Update the comment above the else
branch only if it now reads wrongly.

The existing comment above the top-of-match re-arm explains what the re-arm is
for. Extend it to name the invariant, in one added line, so the rule is visible
where it is relied on and not only in the spec:

```scala
        // Any message pushes the tick a full delay out, which is what keeps one from landing
        // between ValidateToken and the ConnectToRoom it precedes. Invariant: connections
        // change only on this path, so the timer is a complete account of idle time.
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `sbt scalafmtAll scalafmtCheckAll test`
Expected: PASS, whole suite. The two new cases pass and no existing case
changes, including the wall-clock ones, since the timer still fires on the same
schedule.

- [ ] **Step 5: Delete the superseded sleep-based case**

Delete "stop after the idle timeout once its last member has left" in full. The
new `BehaviorTestKit` case covers the same transition deterministically.

Keep "stop itself once it has held no connection for the idle timeout". It is
now the single case that proves pekko actually delivers the tick after the
configured delay, which is the one thing `BehaviorTestKit` cannot show. Add a
one-line comment saying so, beside the existing one.

Run: `sbt test`
Expected: PASS.

- [ ] **Step 6: Delete the wall-clock known-issue**

In `docs/known-issues.md`, delete the whole entry headed
"### The idle stop compares wall-clock time, not a monotonic clock". Do not
reword it. The condition it describes no longer exists: no clock is read to
decide a stop, so a backward NTP step cannot defer one.

Check for references to that heading elsewhere in the file and in the spec
before deleting, and fix any that point at it.

- [ ] **Step 7: Update the spec**

In the step 4a section, the sentence that says the room stops once
`RoomData.idleFor` reports it has held no connection must now say the tick
stops the room when it holds no connection, with no elapsed comparison.

In section 3 "Two lifetimes, not one", add a short paragraph recording why
there is no comparison: the re-armed timer carries the elapsed part, an
`emptySince` written only by message handlers can never be later than the last
message, so the comparison could only ever disagree with the timer when the
system clock stepped backwards. Cite `receiveBehaviour` and the timer by name,
not by line.

Then state the invariant the argument rests on, in its own short paragraph and
named as an invariant so a later step can cite it: **`connections` changes only
on the message path.** Every mutation arrives as a `Command` and therefore
re-arms the tick, which is what makes the timer a complete account of idle
time. Say what breaks if a later step violates it: a connection dropped from a
signal handler, such as a `Terminated` watch replacing write-failure detection,
would not re-arm, so the stop would land a delay after the last message rather
than after the room emptied. That is a change worth making deliberately rather
than by accident.

Do not editorialise beyond that. The invariant is a constraint on future steps,
not a prediction that one will break it.

- [ ] **Step 8: Commit**

```bash
git add src/main/scala/com/lunatech/pointingpoker/actors/Room.scala \
        src/test/scala/com/lunatech/pointingpoker/actors/RoomSpec.scala \
        docs/known-issues.md \
        docs/superpowers/specs/2026-08-31-protocol-target-architecture-design.md
git commit -m "fix(actors): decide the idle stop by emptiness, not by wall-clock time

The re-armed timer already guarantees a full delay since the last message, and
emptySince is only ever written by a message handler, so the elapsed comparison
could not move the stop instant. It could only disagree with the timer on a
backward clock step, which is the defect known-issues recorded as accepted.
Removing the comparison deletes the defect instead of managing it, and lets
BehaviorTestKit drive the stop at the real two-hour default."
```

---

## Task 3: Delete the idle stamp the timer already carries

With the tick reading `connections`, nothing reads `emptySince`. It is state
maintained by hand at three write sites for no reader, and one of those sites
already drifts from its stated meaning: `disconnect` re-stamps on a `Leave` that
changes nothing, because `Option.when(next.isEmpty)(now)` is true whenever the
map is empty, including when the ref was already absent.

Pure subtraction. No behaviour changes.

**Files:**
- Modify: `src/main/scala/com/lunatech/pointingpoker/actors/Room.scala`
- Modify: `src/test/scala/com/lunatech/pointingpoker/actors/RoomSpec.scala`
- Modify: `docs/superpowers/specs/2026-08-31-protocol-target-architecture-design.md`
- Modify: `docs/superpowers/plans/2026-08-31-protocol-architecture-4a-stop-after-idle.md`

**Interfaces:**
- Consumes: the `IdleTick` branch from task 2.
- Produces: `RoomData` without `emptySince`; `RoomData.disconnect(userId, ref)`
  with no `now`; `RoomData.of` with no `emptySince` parameter. No other file
  constructs `RoomData` outside the test fixtures.

- [ ] **Step 1: Remove the field and its methods**

In `Room.scala`:

- Drop `emptySince: Option[Instant]` from the `RoomData` case class parameters.
- Drop `emptySince = None` from `RoomData.connect`.
- Change `RoomData.disconnect` to take `(userId: UUID, ref: UntypedRef)` and
  drop the `emptySince` assignment, keeping the `connections` update and its
  comment:

```scala
    private[Room] def disconnect(userId: UUID, ref: UntypedRef): RoomData =
      // The entry goes when its set empties, so "holds no connection" means what it says.
      this.copy(connections = this.connections.updatedWith(userId)(_.map(_ - ref).filter(_.nonEmpty)))
```

- Delete `RoomData.startedAt` entirely.
- Delete `RoomData.idleFor` entirely.
- Drop `emptySince: Option[Instant] = None` from `RoomData.of` and from the
  `RoomData(...)` construction inside it.
- In `apply`, pass `initialData` straight through instead of
  `initialData.startedAt(Instant.now())`.
- In the `Leave` branch of `receiveBehaviour`, call `data.disconnect(userId, ref)`.
- Remove `import java.time.Instant`, which is now unused.

A never-joined room still stops on its first tick, because its `connections`
map is empty from the start. That is what the deleted "Some at creation, not
None" subtlety existed to simulate.

- [ ] **Step 2: Run the tests to see exactly what breaks**

Run: `sbt test`
Expected: FAIL to compile, in `RoomSpec.scala` only, at the three
`data.emptySince` assertions inside "clear the idle stamp on a connection and
restamp it when the last one goes".

- [ ] **Step 3: Rework the case that asserted the stamp**

Rename it and assert the thing that now carries the meaning. Keep whatever
`Join` and `Leave` driving the existing case already does, changing only the
three assertions:

```scala
    "hold no connection until a join, and none again once the last one goes" in {
```

Replace `.data.emptySince mustBe defined` with
`.data.connections.isEmpty mustBe true`, and `.data.emptySince mustBe None`
with `.data.connections.isEmpty mustBe false`, at each of the three sites, in
the order the case already visits them.

- [ ] **Step 4: Run the whole suite**

Run: `sbt scalafmtAll scalafmtCheckAll test`
Expected: PASS, with the same case count as at the end of task 2.

- [ ] **Step 5: Update the spec and the predecessor plan**

In the spec's section 3, delete the paragraph arguing that the stamp must be
`Some` at creation rather than `None`. It described a proxy for
`connections.isEmpty` that no longer exists. Replace it with one sentence
saying a never-joined room is bounded because it holds no connection from the
start.

In `2026-08-31-protocol-architecture-4a-stop-after-idle.md`, add a deviation
note to its Global Constraints recording that `emptySince` and `idleFor` were
specified by that plan and removed by this one, with the reason in one
sentence, and a pointer to this plan by filename.

- [ ] **Step 6: Commit**

```bash
git add src/main/scala/com/lunatech/pointingpoker/actors/Room.scala \
        src/test/scala/com/lunatech/pointingpoker/actors/RoomSpec.scala \
        docs/superpowers/specs/2026-08-31-protocol-target-architecture-design.md \
        docs/superpowers/plans/2026-08-31-protocol-architecture-4a-stop-after-idle.md
git commit -m "refactor(actors): delete the idle stamp the timer already carries

With the tick reading connections, emptySince had no reader left: state kept by
hand at three write sites, one of which re-stamped on a Leave that changed
nothing. Deleting it also retires the Some-at-creation subtlety, since a
never-joined room holds no connection from the start."
```

---

## Task 4: Correct what the idle cases claim about themselves

Two entries written in the same commit contradict each other about these tests,
and both were already wrong before this plan changed anything.

**Files:**
- Modify: `docs/known-issues.md`
- Modify: `docs/superpowers/specs/2026-08-31-protocol-target-architecture-design.md`
- Modify: `docs/superpowers/plans/2026-08-31-protocol-architecture-4a-stop-after-idle.md`

- [ ] **Step 1: Fix the contradiction in the e2e entry**

In `docs/known-issues.md`, the entry whose Resolution says the behaviour is
pinned by `RoomSpec`'s "stay alive when its last member is removed" and by the
idle cases beside it currently calls them "all deterministic and clock-free".
It said five; the file also has an entry saying the tests drive real wall-clock
sleeps. After tasks 1 to 3 the honest statement is that all of the idle cases
are deterministic `BehaviorTestKit` cases except one, which uses real time to
prove the timer is delivered at all.

Rewrite the sentence to say exactly that. Do not state a total; the count now
has to survive future edits.

- [ ] **Step 2: Fix the same claim in the spec**

The spec carries the same "deterministic and clock-free" claim and says "four"
idle cases where the file had five. Rewrite it to match step 1's wording and
drop the number.

- [ ] **Step 3: Correct the predecessor plan's verification figure**

`2026-08-31-protocol-architecture-4a-stop-after-idle.md` claims the JVM case
count rises by 8 over step 4's 124, to 132. The branch reached 134 before this
plan started. Correct the figure to what `sbt test` reports at the end of task
3, and note in the same line that this plan changed it further.

- [ ] **Step 4: Consistency pass**

Normalise whitespace before matching, since prose in these files wraps at about
80 columns and a quoted sentence routinely spans a line break, which makes a
single-line `grep` report it missing.

Check across `docs/known-issues.md`, `docs/roadmap.md`, the 08-31 spec and the
4a plan for surviving references to: `idleFor`, `emptySince`, `startedAt`,
"wall-clock", "monotonic", "NTP", and "clock-free". Every hit must either
describe history explicitly or be corrected.

Run: `sbt scalafmtCheckAll test`
Expected: PASS. No code changed in this task, so this is a guard against an
accidental edit.

- [ ] **Step 5: Commit**

```bash
git add docs/known-issues.md \
        docs/superpowers/specs/2026-08-31-protocol-target-architecture-design.md \
        docs/superpowers/plans/2026-08-31-protocol-architecture-4a-stop-after-idle.md
git commit -m "docs: correct what the idle cases claim about themselves

Two entries written in the same commit disagreed about whether these tests are
clock-free, and the spec's count of them was wrong in a third way. After the
tick stopped reading a clock the honest claim is narrower and worth stating
once, without a total that needs maintaining."
```

---

## Out of Scope, Deliberately

- **A test for the self-initiated `PostStop` path.** An idle stop always finds
  `connections` empty, so `PostStop` has nobody to notify and there is nothing
  to observe. Revisit with the deferred destroy-room action, which is what makes
  it observable.
- **`RoomManagerSpec`'s `Thread.sleep(500)` against a 200ms timeout**, the sleep
  itself. It needs a real room terminating so the manager sees `Terminated`, and
  `BehaviorTestKit` cannot supply that. Deferring the case's *vacuity* alongside
  it was a mistake this plan made and the whole-branch review caught: the case
  asserted only that a session could be minted, which a surviving room satisfies
  just as well as a restarted one, so it passed for the opposite of the reason
  its name gives. It now asserts the first token stops resolving. Note what that
  changed: a slow runner used to make the case pass vacuously and now makes it
  fail red, which is the right direction and a new flake risk rather than none.
- **Collapsing the two re-arm sites into one unconditional call.** The two
  express different things: deferring on a message, and re-arming after a tick
  the room survived. Both are now covered by effect assertions, and an
  unconditional arm would schedule a timer on the stopping path for nothing.
- **A warning when the retired `SSE_GRACE_PERIOD` is still exported.** The spec
  already records that production overrides neither variable and that telling
  whoever merges is the mitigation. Adding a log line is a separate, optional
  change.

---

## Self-Review

**Spec coverage.** Section 3's "Two lifetimes, not one" is revised in tasks 2
and 3; the step 4a section in task 2; the claims about the tests in task 4. The
config chain, the naming rule and the no-`sawMessage` rule are unchanged by this
plan and are restated in Global Constraints. The "`connections` changes only on
the message path" invariant is new: task 2 writes it into the spec as a named
invariant and into `receiveBehaviour` as one added comment line, because it is
the assumption this plan makes load-bearing and the one a later step could
break without noticing.

**Placeholders.** Every code block is the code to paste. Every run step names
the command and the expected result. The two assertions I could not pin to a
literal, the final case count and the reworked case's exact `Join` and `Leave`
sequence, are written as "record what the run reports" and "keep what the
existing case does", both of which the executor can satisfy without guessing.

**Type consistency.** `onlyTimer(effects: Seq[Effect]): Effect.TimerScheduled[?]`
is defined in task 1 and used in tasks 1 and 2 with that signature.
`RoomData.disconnect(userId, ref)` loses its `now` parameter in task 3 and is
called that way in the same task. `Room.IdleTick` is `private[actors]` and
reachable from `RoomSpec`; `Room.IdleTickKey` is `private` and is never named in
a test.

**Verification already performed.** Every claim this plan rests on was measured
on `3e0fe57` in throwaway worktrees, not reasoned: the vacuous deferral case
passing with the re-arm deleted; the full suite staying green with the tick
condition replaced by `emptySince.isDefined` and again by `connections.isEmpty`;
the two new stop cases failing before the change and passing after; and the
re-arm case failing with `got List()` under the mutation. The `Seq` versus
`List` return type of `retrieveAllEffects` was found by compiling the test, not
by reading docs.
