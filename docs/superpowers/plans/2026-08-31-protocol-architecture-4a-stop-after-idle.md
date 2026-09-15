# Stop-After-Idle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace stop-when-empty with an idle timeout on the order of two hours,
so a room survives a coffee break instead of dying six seconds after its last
member's grace period expires, and so an abandoned or never-joined room stops on
its own rather than living for the life of the process.

**Architecture:** `RoomData` gains `emptySince`, stamped when `connections`
empties and cleared when it fills, and `Some` at the actor's creation so a room
whose `/events` never followed its `/join` is idle from the start. A single-shot
timer re-armed on every message stops the actor when that stamp is older than the
timeout, so the timer itself carries "has anything happened lately" and no branch
has to remember to record it. `PostStop` tells
every attached stream the room is gone, which is what makes a self-initiated stop
answerable. The stop path it replaces goes with it, and the whole `Room.Response`
reply channel goes with that.

**Tech Stack:** Scala 3.8.4, Pekko typed actors, Typesafe Config, ScalaTest
(`AnyWordSpec` + `must.Matchers`) with `ActorTestKit` and `BehaviorTestKit`,
Playwright for e2e.

**Spec:** `docs/superpowers/specs/2026-08-31-protocol-target-architecture-design.md`,
the section beginning "**Step 4a. Stop-after-idle.**" Section 3's "Two lifetimes,
not one" owns what idle means and why message silence is not it; the same
section's closing paragraphs own the stream-completion argument.

**Branch:** `20260831.protocol_architecture_4a_stop_after_idle`, based on
`20260831.protocol_architecture_4_state_split`. The spec writes 4a after step 4
merges by default; this branch takes the stacked exception because the merge
window is blocked while rooms are occupied. Step 4 is PR #404, which sits on
step 5a (#403) on step 5 (#402), so this branch is the fourth level and needs a
`rebase --onto` after each of the three merges below it.

## Global Constraints

- **There is no `sawMessage`, in `RoomData` or anywhere else.** The deferral it
  used to express is carried by re-arming the tick's single-shot timer on every
  message, which is one line before the existing match rather than a value every
  branch has to thread. The spec was amended to match during this plan's review,
  so `:535-536` and the "Two lifetimes, not one" paragraphs already describe the
  timer. `emptySince` does go in `RoomData`, since `connect` and `disconnect`
  derive it.
- **The idle timeout is the only behaviour change a working room can observe.**
  Stream completion on stop changes only what a stopped or crashed room does, and
  the reply-channel deletion changes nothing observable at all.
- **Task 3 leaves rooms unable to stop, and task 4 is what bounds them again.**
  That intermediate commit is the one that is not shippable on its own. The
  ordering is no longer forced, since task 4 no longer restructures the branches
  task 3 deletes from, so running 4 before 3 would remove the unshippable commit.
  Finding M3 of the plan review owns that choice.
- **The configured chain is `retry < grace << idle`**, and all three `require`s
  live in one `load`. Exact keys: `pointing-poker.room.grace-period`,
  `pointing-poker.room.stop-after-idle`, `pointing-poker.sse.retry`. Exact
  environment variables: `ROOM_GRACE_PERIOD`, `ROOM_STOP_AFTER_IDLE`, `SSE_RETRY`.
- **The name is `stop-after-idle`, never `idle-timeout`.**
  `pointing-poker.probe.idle-timeout` already means the pekko-http server binding
  timeout and is correctly named for that.
- **No `RoomData.of` validation of `emptySince` against `connections`.** The
  invariant is maintained by `connect`, `disconnect` and `Room.apply`'s stamp at
  setup, not by a `require`. A `require` would force a value on every fixture site
  that builds an empty-connection room, which buys nothing this step needs.
- **No persistence, no wire-format change, no client change.** Nothing in this
  step reaches `index.html`.
- **Comments are one or two lines.** Never a multi-line block, including for
  non-obvious rationale. Longer context belongs in the commit message.
- **Conventional Commits**, and documentation commits are `docs:`, never `doc:`.
- **No em dash in any document.**
- `scalafmt` runs at 100 columns. Run `sbt scalafmtAll` before any commit that
  touches Scala.

---

## File Structure

**Server, created:**

- `src/main/scala/com/lunatech/pointingpoker/config/LifecycleConfig.scala` - the
  three-value ordered chain and its `require`s, replacing `SseConfig`.

**Server, modified:**

- `src/main/scala/com/lunatech/pointingpoker/actors/Room.scala` - `emptySince`,
  `IdleTick`, `StreamCompleted`, the `PostStop` signal, and the deletion of
  `Response`, `Running`, `Stopped` and both `replyTo` fields.
- `src/main/scala/com/lunatech/pointingpoker/actors/RoomManager.scala` - the
  deletion of `RoomResponseWrapper`, its adapter, its parameter and `removeRoom`,
  and the threading of `stopAfterIdle`.
- `src/main/scala/com/lunatech/pointingpoker/sse/SSE.scala` - `completionMatcher`
  recognizes `Room.StreamCompleted`.
- `src/main/scala/com/lunatech/pointingpoker/Main.scala`,
  `src/main/scala/com/lunatech/pointingpoker/API.scala` - `SseConfig` becomes
  `LifecycleConfig` and the room manager gets the new value.
- `src/main/resources/application.conf` - the `room` block.

**Server, deleted:**

- `src/main/scala/com/lunatech/pointingpoker/config/SseConfig.scala`

**Tests, created:**

- `src/test/scala/com/lunatech/pointingpoker/config/LifecycleConfigSpec.scala`

**Tests, modified:**

- `src/test/scala/com/lunatech/pointingpoker/actors/RoomSpec.scala` - the
  stream-completion and idle cases, and the removal of every `Room.Response`
  probe.
- `src/test/scala/com/lunatech/pointingpoker/actors/RoomManagerSpec.scala` - the
  removal of every `roomResponseProbe`.
- `src/test/scala/com/lunatech/pointingpoker/sse/SSESpec.scala` - the two
  completion cases.
- `src/test/scala/com/lunatech/pointingpoker/APISpec.scala` - the config rename.
- `e2e/room.spec.js` - a room outliving its last member.
- `testkit/app.js` - the renamed profile plus `ROOM_STOP_AFTER_IDLE`.

**Tests, deleted:**

- `src/test/scala/com/lunatech/pointingpoker/config/SseConfigSpec.scala`

**Docs, modified:**

- `docs/superpowers/specs/2026-08-31-protocol-target-architecture-design.md`
- `docs/superpowers/specs/2026-08-30-e2e-testkit-design.md`
- `docs/known-issues.md`
- `docs/roadmap.md`

---

### Task 1: `LifecycleConfig`

The rename and the new value, with no consumer of `stopAfterIdle` yet beyond the
room manager's signature. Landing it first means tasks 3 and 4 have a configured
value to thread rather than a literal to replace later.

**Files:**

- Create: `src/main/scala/com/lunatech/pointingpoker/config/LifecycleConfig.scala`
- Delete: `src/main/scala/com/lunatech/pointingpoker/config/SseConfig.scala`
- Create: `src/test/scala/com/lunatech/pointingpoker/config/LifecycleConfigSpec.scala`
- Delete: `src/test/scala/com/lunatech/pointingpoker/config/SseConfigSpec.scala`
- Modify: `src/main/resources/application.conf:19-30`
- Modify: `src/main/scala/com/lunatech/pointingpoker/Main.scala:5,22,39,47`
- Modify: `src/main/scala/com/lunatech/pointingpoker/API.scala:25,35,142,228,231`
- Modify: `src/test/scala/com/lunatech/pointingpoker/APISpec.scala:9,34,65`
- Modify: `testkit/app.js:18-23`
- Modify: `docs/superpowers/specs/2026-08-30-e2e-testkit-design.md:168,182-183,197`
- Modify: `docs/roadmap.md:224`

**Interfaces:**

- Produces: `LifecycleConfig(gracePeriod: FiniteDuration, stopAfterIdle: FiniteDuration, retryMillis: Int)`
  and `LifecycleConfig.load(config: Config): LifecycleConfig`. Tasks 3 and 4 read
  `stopAfterIdle` off it; `API` reads `retryMillis`; `Main` reads all three.

- [ ] **Step 1: Write the failing config spec**

Create `src/test/scala/com/lunatech/pointingpoker/config/LifecycleConfigSpec.scala`:

```scala
package com.lunatech.pointingpoker.config

import com.typesafe.config.ConfigFactory
import org.scalatest.matchers.must
import org.scalatest.wordspec.AnyWordSpec

import scala.concurrent.duration.*

class LifecycleConfigSpec extends AnyWordSpec with must.Matchers:

  private def withOverrides(overrides: String) =
    ConfigFactory.parseString(overrides).withFallback(ConfigFactory.load())

  "LifecycleConfig" should {
    "load config correctly" in {
      val config = LifecycleConfig.load(ConfigFactory.load())

      config.gracePeriod mustBe 6.seconds
      config.stopAfterIdle mustBe 2.hours
      config.retryMillis mustBe 2000
    }

    "reject a grace period too close to the retry interval" in {
      val config =
        withOverrides("pointing-poker.room.grace-period = 2500ms, pointing-poker.sse.retry = 2000ms")

      an[IllegalArgumentException] must be thrownBy LifecycleConfig.load(config)
    }

    "reject a zero or negative retry" in {
      an[IllegalArgumentException] must be thrownBy LifecycleConfig.load(
        withOverrides("pointing-poker.sse.retry = 0ms")
      )
    }

    "reject a zero or negative grace period" in {
      an[IllegalArgumentException] must be thrownBy LifecycleConfig.load(
        withOverrides("pointing-poker.room.grace-period = 0ms")
      )
    }

    "reject an idle timeout inside the grace period" in {
      // The chain is retry < grace << idle: a room stopping while its last member is still
      // inside their grace window hands their reconnect the blank state this step exists to stop.
      an[IllegalArgumentException] must be thrownBy LifecycleConfig.load(
        withOverrides("pointing-poker.room.stop-after-idle = 5s")
      )
    }
  }
end LifecycleConfigSpec
```

- [ ] **Step 2: Run it to verify it fails**

Run: `sbt "testOnly com.lunatech.pointingpoker.config.LifecycleConfigSpec"`
Expected: FAIL to compile, `Not found: LifecycleConfig`.

- [ ] **Step 3: Write `LifecycleConfig`**

Create `src/main/scala/com/lunatech/pointingpoker/config/LifecycleConfig.scala`:

```scala
package com.lunatech.pointingpoker.config

import java.util.concurrent.TimeUnit

import com.typesafe.config.Config

import scala.concurrent.duration.FiniteDuration

/** Tuning for the room and connection lifetimes in
  * docs/superpowers/specs/2026-08-31-protocol-target-architecture-design.md. All three are
  * heuristics, not measured figures, hence configurable.
  */
final case class LifecycleConfig(
    gracePeriod: FiniteDuration,
    stopAfterIdle: FiniteDuration,
    retryMillis: Int
)

object LifecycleConfig:
  def load(config: Config): LifecycleConfig =
    val gracePeriod   = duration(config, "pointing-poker.room.grace-period")
    val stopAfterIdle = duration(config, "pointing-poker.room.stop-after-idle")
    val retryMillis   = config.getDuration("pointing-poker.sse.retry").toMillis.toInt

    require(retryMillis > 0, s"pointing-poker.sse.retry must be positive, was $retryMillis ms")
    require(
      gracePeriod.toMillis > 0,
      s"pointing-poker.room.grace-period must be positive, was $gracePeriod"
    )
    // A grace period too close to retry silently reintroduces the leave-then-rejoin flicker
    // docs/superpowers/specs/2026-08-24-sse-backpressure-design.md fixed.
    require(
      gracePeriod.toMillis >= 2 * retryMillis,
      s"pointing-poker.room.grace-period ($gracePeriod) must be at least twice " +
        s"pointing-poker.sse.retry ($retryMillis ms)"
    )
    // Configured below the grace period, a room stops while its last member is still inside
    // their window, so their reconnect finds no room and gets blank state.
    require(
      stopAfterIdle > gracePeriod,
      s"pointing-poker.room.stop-after-idle ($stopAfterIdle) must exceed " +
        s"pointing-poker.room.grace-period ($gracePeriod)"
    )

    LifecycleConfig(gracePeriod, stopAfterIdle, retryMillis)
  end load

  private def duration(config: Config, path: String): FiniteDuration =
    FiniteDuration(config.getDuration(path).toMillis, TimeUnit.MILLISECONDS)
end LifecycleConfig
```

- [ ] **Step 4: Rewrite the `pointing-poker` config block**

In `src/main/resources/application.conf`, replace the whole `sse { ... }` block
(lines 19-30) with:

```hocon
  room {
    # How long a Room waits after a disconnect before announcing a Leave, so a reconnect
    # within the window is invisible. Heuristic; see the 2026-08-24 backpressure design.
    grace-period = 6s
    grace-period = ${?ROOM_GRACE_PERIOD}

    # How long a Room with no connection at all survives before stopping itself. The tick
    # runs at this interval, so the actual stop lands between one and two of them.
    stop-after-idle = 2h
    stop-after-idle = ${?ROOM_STOP_AFTER_IDLE}
  }

  sse {
    # How long a browser's EventSource waits before reconnecting after an SSE stream ends.
    # Heuristic, not measured; current value: 2000 milliseconds. See the design doc above.
    retry = 2000ms
    retry = ${?SSE_RETRY}
  }
```

- [ ] **Step 5: Delete `SseConfig` and rewire its four call sites**

Delete `src/main/scala/com/lunatech/pointingpoker/config/SseConfig.scala` and
`src/test/scala/com/lunatech/pointingpoker/config/SseConfigSpec.scala`.

In `Main.scala`, the import on line 5 becomes
`import com.lunatech.pointingpoker.config.{ApiConfig, LifecycleConfig, ProbeConfig}`,
line 22 becomes:

```scala
  val lifecycleConfig: LifecycleConfig = LifecycleConfig.load(system.settings.config)
```

and lines 39 and 47 become:

```scala
    SpawnProtocol.Spawn(RoomManager(lifecycleConfig.gracePeriod), "room-manager", Props.empty, ref)
```

```scala
      val api = API(roomManager, apiConfig, lifecycleConfig, probeConfig)
```

`RoomManager` gains `stopAfterIdle` in task 4, which is when this `Spawn` picks
up the second argument.

In `API.scala`, the import on line 25 and the parameter names on lines 35, 142,
228 and 231 rename from `sseConfig: SseConfig` to
`lifecycleConfig: LifecycleConfig`; line 142's read becomes
`lifecycleConfig.retryMillis`. In `APISpec.scala` the same rename applies to
lines 9, 34 and 65.

- [ ] **Step 6: Rename the e2e profile**

In `testkit/app.js`, replace lines 18-23 with:

```javascript
// LifecycleConfig.load's `require`s validate this at startup, so the profile does not get its
// own copy of the rules. The heartbeat is hardcoded at 15s and cannot be turned down.
export const testProfile = {
  ROOM_GRACE_PERIOD: '4s',
  // Well past any case's runtime: the point is that a room survives a departure, not that
  // it eventually stops, which the JVM suite owns.
  ROOM_STOP_AFTER_IDLE: '5m',
  SSE_RETRY: '200ms'
}
```

- [ ] **Step 7: Run the suites to verify they pass**

Run: `sbt scalafmtAll test`
Expected: PASS, including the five `LifecycleConfigSpec` cases.

Run: `npm run e2e`
Expected: PASS. The profile rename is what this proves; a missed variable would
leave the app on the 6s default and the departure cases would time out.

- [ ] **Step 8: Move the two documents that name the old class and variables**

In `docs/superpowers/specs/2026-08-30-e2e-testkit-design.md`, line 168's
`SseConfig.load` and line 197's `SseConfig.load` become `LifecycleConfig.load`,
and the §3 table at lines 182-183 becomes:

```markdown
| `ROOM_GRACE_PERIOD` | 4s | 6s |
| `ROOM_STOP_AFTER_IDLE` | 5m | 2h |
| `SSE_RETRY` | 200ms | 2000ms |
```

In `docs/roadmap.md`, line 224's `config/SseConfig.scala` becomes
`config/LifecycleConfig.scala`.

Leave the delivered step 0 plans and the cancelled 08-26 and 08-28 specs alone:
they carry the old names as history.

- [ ] **Step 9: Commit**

```bash
git add src/main src/test testkit/app.js docs/superpowers/specs/2026-08-30-e2e-testkit-design.md docs/roadmap.md
git commit -m "refactor(config): make SseConfig a LifecycleConfig with a stop-after-idle"
```

---

### Task 2: Stream completion on stop

An actor that may stop on its own owes an answer to whoever is still attached.
This lands before the idle stop exists, so no version of the tree can stop a room
silently. It is also live today for a crashed room, which is why it is testable
on its own.

**Files:**

- Modify: `src/main/scala/com/lunatech/pointingpoker/actors/Room.scala:43-45,178,262`
- Modify: `src/main/scala/com/lunatech/pointingpoker/sse/SSE.scala:64-66`
- Modify: `src/test/scala/com/lunatech/pointingpoker/actors/RoomSpec.scala`
- Modify: `src/test/scala/com/lunatech/pointingpoker/sse/SSESpec.scala`

**Interfaces:**

- Produces: `Room.StreamCompleted`, a bare `case object` in `object Room` and
  deliberately **not** a `Room.Command`. It travels outward to connection refs,
  which are untyped, so `publish`'s existing send needs no new typing. Task 4's
  `PostStop` handler is the second sender.

- [ ] **Step 1: Write the failing room test**

Add to `RoomSpec.scala`, at the end of the `"Room Actor" should` block:

```scala
    "tell every attached connection when it stops" in {
      val (user, userProbe)   = createUser(UUID.randomUUID(), "user1", false, "")
      val (user2, user2Probe) = createUser(UUID.randomUUID(), "user2", false, "")
      val (_, roomRef)        = createRoom(UUID.randomUUID(), withUsers(user, user2))

      testKit.stop(roomRef)

      // Without this a stopped room leaves every tab heartbeating from the keepAlive stage
      // with no snapshot ever arriving again, which is silence rather than an error.
      userProbe.expectMsg(Room.StreamCompleted)
      user2Probe.expectMsg(Room.StreamCompleted)
    }
```

- [ ] **Step 2: Run it to verify it fails**

Run: `sbt "testOnly com.lunatech.pointingpoker.actors.RoomSpec -- -z \"tell every attached\""`
Expected: FAIL to compile, `value StreamCompleted is not a member of object Room`.

- [ ] **Step 3: Add the message and the signal handler**

In `Room.scala`, add the import
`import org.apache.pekko.actor.typed.PostStop` beside the existing typed imports,
and declare the message under the `Response` ADT (line 45):

```scala
  // Not a Command: it travels outward to untyped connection refs, so publish's send fits it.
  case object StreamCompleted
```

Then attach a signal handler to the behaviour returned by `receiveBehaviour`. The
existing body is `Behaviors.receive[Command] { (context, message) => ... }`; wrap
its closing brace so it reads:

```scala
    Behaviors
      .receive[Command] { (context, message) =>
        // ... the existing match, unchanged
      }
      .receiveSignal { case (_, PostStop) =>
        // A room that stops owes its attached streams an answer; the alternative is silence.
        data.connections.values.flatten.foreach(_ ! StreamCompleted)
        Behaviors.same
      }
```

- [ ] **Step 4: Run it to verify it passes**

Run: `sbt "testOnly com.lunatech.pointingpoker.actors.RoomSpec -- -z \"tell every attached\""`
Expected: PASS.

- [ ] **Step 5: Write the failing stream tests**

Add to `SSESpec.scala`, inside the `"SSE.source" should` block:

```scala
    "complete the stream when the room says it stopped" in {
      val (_, _, user, probe) = wire()
      probe.request(1)

      user ! Room.StreamCompleted

      probe.expectComplete()
    }

    "drop a queued snapshot rather than render a room that no longer exists" in {
      val (_, userId, user, probe) = wire()
      probe.ensureSubscription()

      user ! snapshot(userId, "issue")
      user ! Room.StreamCompleted

      // immediately rather than draining: the buffered snapshot is of a room that is gone,
      // so delivering it would paint a live room for the instant before the stream closes.
      probe.request(1)
      probe.expectComplete()
    }
```

- [ ] **Step 6: Run them to verify they fail**

Run: `sbt "testOnly com.lunatech.pointingpoker.sse.SSESpec"`
Expected: FAIL. Both time out waiting for completion, since `completionMatcher`
is `PartialFunction.empty` and the message is dropped.

- [ ] **Step 7: Teach `completionMatcher` the message**

In `SSE.scala`, replace lines 64-66 with:

```scala
  // Room.StreamCompleted is the one thing that ends a stream from outside; everything else
  // ends it via watchTermination (client disconnect, stream failure, etc).
  private val completionMatcher: PartialFunction[Any, CompletionStrategy] = {
    case Room.StreamCompleted => CompletionStrategy.immediately
  }
```

- [ ] **Step 8: Run the whole suite to verify it passes**

Run: `sbt scalafmtAll test`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add src/main src/test
git commit -m "feat(actors): complete every attached stream when a room stops"
```

---

### Task 3: Delete stop-when-empty and the whole reply channel

`ConfirmLeave` stops stopping the actor, so it always answers `Running`, which is
the no-consumer case this design applies to `version` and `scale`. `Response` and
`Running` go with `Stopped`, and `replyTo` goes with them.

**This task leaves rooms unable to stop at all.** Task 4 is what bounds them
again. Do not reorder.

**Files:**

- Modify: `src/main/scala/com/lunatech/pointingpoker/actors/Room.scala:23-24,43-45,226-244`
- Modify: `src/main/scala/com/lunatech/pointingpoker/actors/RoomManager.scala:26,45-51,53-58,60-64,97-102,133-143,145-148`
- Modify: `src/test/scala/com/lunatech/pointingpoker/actors/RoomSpec.scala`
- Modify: `src/test/scala/com/lunatech/pointingpoker/actors/RoomManagerSpec.scala`
- Modify: `e2e/room.spec.js`

**Interfaces:**

- Produces: `Room.Leave(userId: UUID, ref: UntypedRef)` and
  `Room.ConfirmLeave(userId: UUID)`, both without `replyTo`.
  `RoomManager.receiveBehaviour(data: RoomManagerData, gracePeriod: FiniteDuration)`,
  two parameters instead of three. Task 4 adds a third for `stopAfterIdle`.
- Consumes: nothing from tasks 1 and 2.

- [ ] **Step 1: Write the failing e2e case**

Add to `e2e/room.spec.js`, extending the existing `./fixtures.js` import with
`vote` and `summaryTable` if they are not already named there:

```javascript
test('a room outlives its last member', async ({ join }) => {
  const alice = await join('Alice')
  await vote(alice.page, '5')
  await alice.page.getByRole('button', { name: 'Show votes' }).click()
  await expect(summaryTable(alice.page)).toBeVisible()

  await alice.close()
  // Past the profile's 4s grace period, which is where the room used to stop itself.
  await new Promise(resolve => setTimeout(resolve, 6000))

  const bob = await join('Bob')
  // A restarted room would hand Bob a fresh unrevealed round, so the summary is the proof.
  await expect(summaryTable(bob.page)).toBeVisible()
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm run e2e -- room.spec.js -g "outlives its last member"`
Expected: FAIL. Alice's departure empties `members`, `ConfirmLeave` stops the
room, and Bob's join creates a new one whose round is unrevealed, so the summary
table is hidden.

- [ ] **Step 3: Take the reply channel out of `Room`**

In `Room.scala`, lines 23-24 become:

```scala
  final case class Leave(userId: UUID, ref: UntypedRef)                 extends Command
  final private[actors] case class ConfirmLeave(userId: UUID)           extends Command
```

Delete the `Response`, `Running` and `Stopped` declarations at lines 43-45,
keeping `StreamCompleted` from task 2. The `Leave` branch's timer send loses its
`replyTo`:

```scala
            timers.startSingleTimer(key = userId, msg = ConfirmLeave(userId), delay = gracePeriod)
```

and the `ConfirmLeave` branch collapses to its surviving half:

```scala
        case ConfirmLeave(userId) =>
          receiveBehaviour(roomId, publish(data.removeMember(userId), context), gracePeriod, timers)
```

- [ ] **Step 4: Take it out of `RoomManager`**

In `RoomManager.scala`: delete the `RoomResponseWrapper` command (line 26), the
`removeRoom` method (lines 48-49), the `roomResponseActor` adapter in `apply`
(lines 55-56), the `roomResponseWrapper` parameter of `receiveBehaviour` (line
62) and the `RoomResponseWrapper` branch (lines 97-102). Every recursive
`receiveBehaviour(...)` call and the `receiveSignal` handler drop the wrapper
argument, and the two `Room.Leave` sends in `ConnectionCompleted` and
`ConnectionFailure` become:

```scala
            data.rooms.get(roomId).foreach(room => room ! Room.Leave(userId, ref))
```

`apply` becomes:

```scala
  def apply(gracePeriod: FiniteDuration = Room.defaultGracePeriod): Behavior[Command] =
    Behaviors.setup[Command](_ => receiveBehaviour(RoomManagerData.empty, gracePeriod))
```

`receiveSignal` on `Terminated` stays exactly as it is: it is now the single
deregistration path, which it has to be anyway, since it is the only one that can
observe a self-initiated stop.

- [ ] **Step 5: Strip the probes from `RoomManagerSpec`**

Delete the `roomResponseProbe` or `responseProbe` `val` at lines 38, 93, 109,
193, 209, 225, 249, 265 and 286, drop the second argument from every
`RoomManager.receiveBehaviour(...)` call, and change the two expectations at
lines 203 and 219 to:

```scala
      roomProbe.expectMessage(Room.Leave(userId, ref))
```

- [ ] **Step 6: Strip the probes from `RoomSpec` and rewrite the three cases that read them**

Delete the `roomResponseProbe` or `responseProbe` `val` at lines 164, 180, 240,
269, 451, 478, 866, 891 and 928, and drop the argument from every `Room.Leave`
send.

The "restart the grace period" case at lines 206-234 loses `firstReplyProbe`,
`secondReplyProbe` and its last two assertions. Its two `Leave` sends become
plain, and the assertion that the timer was replaced rather than run twice
becomes the snapshot count it already has plus a data read:

```scala
      // Fires exactly once: a duplicated timer would publish a second time and the second
      // removal would find nobody, so one publish and one surviving member is the proof.
      expectSnapshot(user2Probe).users.map(_.id) mustBe List(user2.id)
      user2Probe.expectNoMessage(200.millis)
      roomRef ! Room.GetData(dataProbe.ref)
      dataProbe.expectMessageType[Room.DataStatus].data.members.keySet mustBe Set(user2.id)
```

Add `val dataProbe = testKit.createTestProbe[Room.DataStatus]()` to that case.

The "remove a user on leave" case at line 251 drops
`roomResponseProbe.expectMessage(Room.Running(roomId))`; the `expectSnapshot` on
line 250 already waits past the grace period. The same deletion applies to lines
469 and 496, whose comment at 467-468 becomes:

```scala
      // The published snapshot is the confirmation that ConfirmLeave fired and removed the
      // member while the room stayed up, which is the state a reconnect past the window meets.
      expectSnapshot(userProbe)
```

Note that `userProbe` in those two cases is Alice's own classic `TestProbe`, and
she is the member being removed, so read the barrier off `user2`'s probe instead:
both cases seed `user2` through `withUsers`, so replace the line above with
`expectSnapshot(user2Probe)` and capture `user2Probe` from `createUser` where the
case currently discards it with `val (user2, _)`.

The two "schedule no removal" cases at lines 862-907 lose
`roomResponseProbe.expectNoMessage(200.millis)`. Each keeps its `GetData`
assertion, and gains the wait the deleted line was providing:

```scala
      Thread.sleep(200) // past the 50ms grace period, so a scheduled removal would have fired
```

- [ ] **Step 7: Rewrite the "stop itself if empty" case**

The case at lines 263-282 asserts the behaviour this task deletes. Replace it
with its inverse, which is the guarantee task 3 introduces:

```scala
    "stay alive when its last member is removed" in {
      val probe = TestProbe()(testKit.system.classicSystem)
      val user  =
        Attendee(UUID.randomUUID(), "user1", false, "", probe.ref, Room.SessionToken.mint())
      val user2 =
        Attendee(UUID.randomUUID(), "user2", false, "", probe.ref, Room.SessionToken.mint())

      val roomId = UUID.randomUUID()
      // Seeded rather than joined: Join is not what this case is about, and a refused
      // Join would leave the room empty and pass the assertion for the wrong reason.
      val behaviorTestKit =
        BehaviorTestKit(Room(roomId, withUsers(user, user2)), roomId.toString)

      // BehaviorTestKit doesn't drive real timers, so send the post-grace-period effect
      // directly rather than Leave (which only schedules it).
      behaviorTestKit.run(Room.ConfirmLeave(user.id))
      behaviorTestKit.run(Room.ConfirmLeave(user2.id))

      // An empty room is idle, not dead: task 4's tick is what ends it, hours later.
      behaviorTestKit.isAlive mustBe true
    }
```

- [ ] **Step 8: Run both suites to verify they pass**

Run: `sbt scalafmtAll test`
Expected: PASS, with no reference to `Room.Response` anywhere in the tree. Check
with `grep -rn "Room.Response\|RoomResponseWrapper\|Room.Running\|Room.Stopped" src`,
which must print nothing.

Run: `npm run e2e -- room.spec.js -g "outlives its last member"`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add src/main src/test e2e/room.spec.js
git commit -m "refactor(actors): delete stop-when-empty and the room reply channel"
```

---

### Task 4: The idle timeout

**Files:**

- Modify: `src/main/scala/com/lunatech/pointingpoker/actors/Room.scala`
- Modify: `src/main/scala/com/lunatech/pointingpoker/actors/RoomManager.scala:53-58,60-64,150-155`
- Modify: `src/main/scala/com/lunatech/pointingpoker/Main.scala:39`
- Modify: `src/test/scala/com/lunatech/pointingpoker/actors/RoomSpec.scala`
- Modify: `docs/superpowers/specs/2026-08-31-protocol-target-architecture-design.md:535-543`

**Interfaces:**

- Consumes: `LifecycleConfig.stopAfterIdle` from task 1, `Room.StreamCompleted`
  and the `PostStop` handler from task 2, and the reply-free `receiveBehaviour`
  from task 3.
- Produces: `RoomData.emptySince: Option[Instant]`,
  `RoomData.idleFor(timeout: FiniteDuration, now: Instant): Boolean`,
  `Room.defaultStopAfterIdle: FiniteDuration`, and
  `Room.apply(roomId, initialData, gracePeriod, stopAfterIdle)`.

- [ ] **Step 1: Write the failing idle tests**

Add to `RoomSpec.scala`, at the end of the `"Room Actor" should` block:

```scala
    "stop itself once it has held no connection for the idle timeout" in {
      val watcher      = testKit.createTestProbe()
      val (_, roomRef) = createRoom(
        UUID.randomUUID(),
        RoomData.empty,
        stopAfterIdle = 200.millis
      )

      // Never connected at all, which is the never-joined room the stamp at creation covers:
      // written as a transition-only field this room would run for the life of the process.
      watcher.expectTerminated(roomRef, 3.seconds)
    }

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

    "defer its stop by a full delay when any message arrives" in {
      val dataProbe    = testKit.createTestProbe[Room.DataStatus]()
      val watcher      = testKit.createTestProbe()
      val (_, roomRef) = createRoom(
        UUID.randomUUID(),
        RoomData.empty,
        stopAfterIdle = 300.millis
      )

      // A stray message re-arms the timer, which is what stops a tick landing between
      // ConnectToRoom's send and its delivery. It also defers an abandoned room by a delay.
      Thread.sleep(250)
      roomRef ! Room.GetData(dataProbe.ref)
      dataProbe.expectMessageType[Room.DataStatus]
      watcher.expectNoMessage(200.millis)

      watcher.expectTerminated(roomRef, 3.seconds)
    }

    "clear the idle stamp on a connection and restamp it when the last one goes" in {
      val (user, _)    = createUser(UUID.randomUUID(), "user1", false, "")
      val dataProbe    = testKit.createTestProbe[Room.DataStatus]()
      val (_, roomRef) = createRoom(
        UUID.randomUUID(),
        withUsers().withMemberlessSession(user),
        gracePeriod = 50.millis
      )

      roomRef ! Room.GetData(dataProbe.ref)
      dataProbe.expectMessageType[Room.DataStatus].data.emptySince mustBe defined

      roomRef ! user.joinMessage
      roomRef ! Room.GetData(dataProbe.ref)
      dataProbe.expectMessageType[Room.DataStatus].data.emptySince mustBe None

      roomRef ! Room.Leave(user.id, user.ref)
      roomRef ! Room.GetData(dataProbe.ref)
      // Stamped at the disconnect, not at the member's removal: the two are a grace period apart
      // and it is the connection layer this is derived from.
      dataProbe.expectMessageType[Room.DataStatus].data.emptySince mustBe defined
    }
```

Add `import java.time.Instant` to the spec's imports if the assertions above grow
one, and extend `RoomSpec.createRoom` to carry the new parameter:

```scala
  def createRoom(
      roomId: UUID,
      data: RoomData,
      gracePeriod: FiniteDuration = Room.defaultGracePeriod,
      stopAfterIdle: FiniteDuration = Room.defaultStopAfterIdle
  )(using
      testKit: ActorTestKit
  ): (UUID, ActorRef[Room.Command]) =
    val roomRef = testKit.spawn[Room.Command](Room(roomId, data, gracePeriod, stopAfterIdle))
    (roomId, roomRef)
```

- [ ] **Step 2: Run them to verify they fail**

Run: `sbt "testOnly com.lunatech.pointingpoker.actors.RoomSpec -- -z idle"`
Expected: FAIL to compile, `value defaultStopAfterIdle is not a member of object Room`.

- [ ] **Step 3: Give `RoomData` the stamp**

In `Room.scala`, add `import java.time.Instant`. The class gains a field and the
two connection transitions maintain it:

```scala
  final case class RoomData private (
      state: RoomState,
      members: Map[UUID, Member],
      sessions: Map[SessionToken, Session],
      connections: Map[UUID, Set[UntypedRef]],
      emptySince: Option[Instant]
  ):
    private[Room] def connect(userId: UUID, name: String, ref: UntypedRef): RoomData =
      this.copy(
        members = this.members + (userId -> Member(name)),
        connections =
          this.connections.updatedWith(userId)(refs => Some(refs.getOrElse(Set.empty) + ref)),
        emptySince = None
      )

    private[Room] def disconnect(userId: UUID, ref: UntypedRef, now: Instant): RoomData =
      // The entry goes when its set empties, so "holds no connection" means what it says.
      val next = this.connections.updatedWith(userId)(_.map(_ - ref).filter(_.nonEmpty))
      this.copy(connections = next, emptySince = Option.when(next.isEmpty)(now))

    private[Room] def startedAt(now: Instant): RoomData =
      // Some at creation, not None: a room whose /events never followed its /join has been
      // empty without ever becoming empty, and that is the never-joined room this bounds.
      this.copy(emptySince = Option.when(this.connections.isEmpty)(now))

    def idleFor(timeout: FiniteDuration, now: Instant): Boolean =
      this.emptySince.exists(since => !since.isAfter(now.minusMillis(timeout.toMillis)))
```

`RoomData.of` gains the parameter with a default, so no fixture site changes:

```scala
    def of(
        state: RoomState = RoomState.empty,
        members: Map[UUID, Member] = Map.empty,
        sessions: Map[SessionToken, Session] = Map.empty,
        connections: Map[UUID, Set[UntypedRef]] = Map.empty,
        emptySince: Option[Instant] = None
    ): RoomData =
```

with `RoomData(state, members, sessions, connections, emptySince)` as its last
line, the three existing `require` blocks untouched.

- [ ] **Step 4: Add the tick, re-armed on every message**

Still in `Room.scala`, add the timeout default and the tick beside the existing
commands:

```scala
  final private[actors] case object IdleTick extends Command

  private case object IdleTickKey

  val defaultGracePeriod: FiniteDuration   = 6.seconds
  val defaultStopAfterIdle: FiniteDuration = 2.hours
```

`apply` stamps the data and arms the first tick:

```scala
  def apply(
      roomId: UUID,
      initialData: RoomData = RoomData.empty,
      gracePeriod: FiniteDuration = defaultGracePeriod,
      stopAfterIdle: FiniteDuration = defaultStopAfterIdle
  ): Behavior[Command] =
    Behaviors.setup[Command] { _ =>
      Behaviors.withTimers[Command] { timers =>
        timers.startSingleTimer(IdleTickKey, IdleTick, stopAfterIdle)
        receiveBehaviour(
          roomId,
          initialData.startedAt(Instant.now()),
          gracePeriod,
          stopAfterIdle,
          timers
        )
      }
    }
```

`receiveBehaviour` gains `stopAfterIdle` after `gracePeriod`, and gains exactly
two things inside the closure: one line before the existing `match`, and one new
branch. **No existing branch changes except `Leave`**, which is the point of this
shape: there is no per-branch bookkeeping to forget, because the timer holds it.

```scala
  private[actors] def receiveBehaviour(
      roomId: UUID,
      data: RoomData,
      gracePeriod: FiniteDuration,
      stopAfterIdle: FiniteDuration,
      timers: TimerScheduler[Command]
  ): Behavior[Command] =
    Behaviors
      .receive[Command] { (context, message) =>
        // Any message pushes the tick a full delay out, which is what keeps one from landing
        // between ValidateToken and the ConnectToRoom it precedes.
        if message != IdleTick then timers.startSingleTimer(IdleTickKey, IdleTick, stopAfterIdle)
        message match
          case IdleTick =>
            if data.idleFor(stopAfterIdle, Instant.now()) then
              context.log.info("Stopping room {}: no connection for {}", roomId, stopAfterIdle)
              Behaviors.stopped
            else
              // Occupied, so no message re-armed this one: ask again a delay from now.
              timers.startSingleTimer(IdleTickKey, IdleTick, stopAfterIdle)
              Behaviors.same
          case Join(userId, name, token, ref) =>
            // ... every existing branch byte for byte, Behaviors.same included, with
            // stopAfterIdle added to each of the 11 recursive receiveBehaviour calls
      }
      .receiveSignal { case (_, PostStop) =>
        // A room that stops owes its attached streams an answer; the alternative is silence.
        data.connections.values.flatten.foreach(_ ! StreamCompleted)
        Behaviors.same
      }
```

The one branch that does change is `Leave`, whose `disconnect` now stamps:

```scala
        case Leave(userId, ref) =>
          // Answerable at the moment of the event now that connections are their own map: a
          // member still holding one, or already removed, schedules nothing.
          val next = data.disconnect(userId, ref, Instant.now())
          if !next.holdsConnection(userId) && next.isMember(userId) then
            timers.startSingleTimer(key = userId, msg = ConfirmLeave(userId), delay = gracePeriod)
          receiveBehaviour(roomId, next, gracePeriod, stopAfterIdle, timers)
```

Adding `stopAfterIdle` to the 11 recursive calls at `Room.scala:188,200,204,214,219,224,236,244,248`
and the one in `apply` is the whole of the remaining diff. `IdleTickKey` is a
case object rather than a `UUID`, so it cannot collide with the grace timers,
which key on `userId`.

- [ ] **Step 5: Thread the value through `RoomManager` and `Main`**

In `RoomManager.scala`, `apply`, `receiveBehaviour` and `createRoom` each gain
`stopAfterIdle: FiniteDuration = Room.defaultStopAfterIdle` after `gracePeriod`,
every recursive call passes it, and the spawn becomes:

```scala
    context.spawn(actors.Room(roomId, gracePeriod = gracePeriod, stopAfterIdle = stopAfterIdle),
      name = roomId.toString)
```

In `Main.scala`, line 39 becomes:

```scala
    SpawnProtocol.Spawn(
      RoomManager(lifecycleConfig.gracePeriod, lifecycleConfig.stopAfterIdle),
      "room-manager",
      Props.empty,
      ref
    )
```

- [ ] **Step 6: Run the suite to verify it passes**

Run: `sbt scalafmtAll test`
Expected: PASS, all four new cases included.

- [ ] **Step 7: Check the spec still matches what landed**

No spec edit is due here: `:535-536` and the two "Two lifetimes, not one"
paragraphs were amended during this plan's review, before any code was written,
and they already describe the re-armed single-shot timer and the two-hour figure.
Confirm the code agrees with them rather than the reverse, and if it does not,
the code is what moves.

Run: `grep -rn "sawMessage\|two to four" docs/superpowers/specs/ src/`
Expected: no output.

- [ ] **Step 8: Commit**

```bash
git add src/main src/test
git commit -m "feat(actors): stop a room once it has held no connection for the idle timeout"
```

---

### Task 5: Record what landed

**Files:**

- Modify: `docs/superpowers/specs/2026-08-31-protocol-target-architecture-design.md:2184-2288`
- Modify: `docs/known-issues.md:37-51,60-72`
- Modify: `docs/roadmap.md:181-185`

- [ ] **Step 1: Add the landed record to the spec's step 4a section**

Following the pattern step 5 uses at `:2297`, add a paragraph after the step 4a
block stating what landed, what it deviated on, and what it closed. Write it from
the branch's own history rather than from this plan, and list every deviation in
this document's "Deviations from the plan, and why" section below as you go.

- [ ] **Step 2: Close the two known issues this step bounds**

In `docs/known-issues.md`, delete three entries, not two. Each ends with the
sentence "Remove this entry when step 4a lands", so the judgment was made when
they were written:

- `:37-52` "No garbage collection for abandoned or never-joined rooms"
- `:54-73` "Every session a room mints lives as long as the room does"
- `:75-98` "A disconnection that outlasts the grace period still forces a reload
  for the room's last member"

Leave the rate-limiting entry at `:204` open and check its text still reads
correctly once the three above are gone: a client looping requests at an empty
room defers its stop indefinitely, and bounding that loop is still unowned. Check
`:15-36` too, the silent-auto-create entry, whose text turns on when a room stops.

- [ ] **Step 3: Tick the roadmap's GC item**

In `docs/roadmap.md`, mark the "Garbage collection for abandoned or never-joined
rooms" item (lines 181-185) done, naming stop-after-idle rather than restating it.
Its "two to four hours" is stale: the figure is two hours since the tick became a
re-armed single-shot timer. The three `docs/known-issues.md` entries carry the
same stale figure and are deleted wholesale in step 2, so they need no edit.

- [ ] **Step 4: Verify no document still describes the old lifetime**

Run: `grep -rn "stop-when-empty\|stops when its last\|dies with its last" docs/ --include="*.md"`
Expected: hits only in the delivered 08-18, 08-20 and 08-24 specs and the
cancelled 08-26 and 08-28 ones, which keep the old behaviour as history, and in
08-31's own past-tense prose. Any present-tense claim in a live document is a
miss.

- [ ] **Step 5: Commit**

```bash
git add docs/
git commit -m "docs: record stop-after-idle as landed and close the two issues it bounds"
```

---

## Verification

Before opening the PR:

- `sbt scalafmtAll scalafmtCheckAll test` green, JVM case count up by roughly 9
  over step 4's 124.
- `npm run e2e` green across chromium and firefox, up by one case.
- `grep -rn "SseConfig\|Room.Response\|RoomResponseWrapper" src testkit e2e` prints
  nothing.
- The app starts on defaults and refuses to start with
  `ROOM_STOP_AFTER_IDLE=5s`, which is the ordered chain doing its job.

## Deviations from the plan, and why

None yet. Record each one here as it is taken, with the reason, so the PR
description and the spec's landed record can be written from this list.
