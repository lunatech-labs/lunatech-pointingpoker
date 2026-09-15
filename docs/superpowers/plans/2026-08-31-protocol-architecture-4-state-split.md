# State Split Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace `RoomData.users: List[User]` with the four state groups the
design specifies, so that no connection handle appears in the room's own data, a
participant can hold more than one connection, and both Problem A and Problem C
become unrepresentable rather than fixed.

**Architecture:** The split is taken at two seams rather than one, because a
single rewrite leaves no tree that compiles between its halves. Task 1 takes the
round off the participant: `RoomState`, `Round` and `Estimate` arrive,
`round.estimates` is keyed by user id, `RoomSnapshot.of` becomes the join, and
`User` is reduced to `(id, name, ref, token)`. Task 2 splits that remnant into
`members`, `sessions` and `connections`: `publish` iterates connections, the
grace timer is keyed on `userId` alone and decided at `Leave` time, and token
resolution runs through `sessions` with a separate membership check. Task 3 is
the record.

**Tech Stack:** Scala 3.8.4, Pekko typed actors, ScalaTest (`AnyWordSpec` +
`must.Matchers`) with `ActorTestKit`, `BehaviorTestKit` and `LoggingTestKit`.
Playwright for the browser suite, which this step does not extend.

**Spec:** `docs/superpowers/specs/2026-08-31-protocol-target-architecture-design.md`,
section 3 "Room state" for the target shape and every rule this plan implements,
section 2 for the wire format that must not move, and the ordered path's
"**Step 4. State split.**" for what is in scope. Invariants 1, 2, 4, 5 and 6 in
section 0 are the rules a reviewer should check this against.

**Branch:** `20260831.protocol_architecture_4_state_split`, already open as PR
404 carrying the spec amendments this plan implements. It is stacked on
`20260831.protocol_architecture_5a_roomdata_construction`, which is stacked on
`20260831.protocol_architecture_5_retained_sessions`, so both merge first and
this branch needs a `rebase --onto` after each. Never pass `--delete-branch`
when merging a parent: it closes the child PR instead of letting GitHub retarget
it.

## Global Constraints

- **Step 4a owns the lifecycle work, and none of it is in scope here.** No idle
  timeout, no `emptySince`, no `sawMessage`, no `StreamCompleted`, no config
  rename. `ConfirmLeave` still stops the actor when the last member goes, and
  `Response`, `Running`, `Stopped`, `replyTo`, `RoomResponseWrapper` and
  `roomResponseActor` all stay exactly as they are. 4a deletes that whole reply
  channel; deleting half of it here would make its diff unreadable.
- **No `slug` field on `RoomState`, and no `history`.** The design's state block
  lists both, with `history` marked step 9. `slug` is deferred here as a
  deliberate deviation: `roomId` is already a parameter of `Room.receiveBehaviour`
  and nothing reads a second copy, so the field would duplicate an id that can
  then disagree with it, and every whole-`RoomData` equality assertion would have
  to pin a slug the fixtures would otherwise randomize. Step 7 adds it when slug
  generation gives it a meaning. Task 3 records this in the design.
- **The wire format does not move.** `RoomSnapshot` and `RoomSnapshot.Participant`
  keep their fields, their names and their serialized key order.
  `RoomSnapshotSpec`'s two wire-pinning cases, "serialize exactly the agreed field
  set" and "keep a withheld estimation out of the serialized frame entirely", must
  stay green with their assertions unchanged. A tagged union over `voted`,
  `hasEstimation` and `estimation` is step 8's.
- **No client change.** `src/main/resources/pages/index.html` is untouched, and
  the browser suite is run as a regression net rather than extended.
- **Exactly two deliberate behaviour changes, and a reviewer is handed both.**
  `hasEstimation` stops meaning `estimation.nonEmpty` and becomes the entry
  existing in `round.estimates`; and `vote` refuses a blank estimation, because
  presence-based `hasEstimation` would otherwise admit a `""` bucket to the tally
  the client gates on the same field. Neither is reachable from the page, whose
  card values are hardcoded in `estimationValues`; both need a hand-written
  request. Anything else that changes what a working room does is a defect in
  this step.
- **Step 1's Problem A fix is deleted, not preserved.** `joinUser` keeping
  `voted` and `estimation` off the stored entry becomes vacuous the moment the
  estimate leaves `User`, which is task 1. That deletion is the point: vote loss
  on reconnect stops being fixed and starts being unrepresentable.
- **Step 6 owns the write path.** No tapir, no ask pattern, no idempotent
  `/join`, no leave endpoint, no client rejoin, and no send to a refused joiner.
  A refused `Join` adds nothing to `connections`, which is a rule this step
  states and not an omission to tidy up: `applySnapshot` hardcodes `inRoom` true,
  so a snapshot to a non-member tab renders a room the tab is absent from while
  every command it sends is dropped, which is worse than silence because it is
  confident.
- **`API.scala`, `SSE.scala`, `Requests.scala` and the config classes are not
  touched.** The split stops at the actor boundary.
- **Comments are one or two lines.** Never a multi-line block, including for
  non-obvious rationale. Longer context belongs in the commit message.
- **Conventional Commits**, and documentation commits are `docs:`, never `doc:`.
- **No em dash in any document.**
- `scalafmt` runs at 100 columns. Run `sbt scalafmtAll` before any commit that
  touches Scala, and `sbt styleCheck` to verify.
- Doc citations prefer a symbol name to a line number. Do not retrofit existing
  citations; convert only what this step touches anyway.

---

## File Structure

**Server, modified:**

- `src/main/scala/com/lunatech/pointingpoker/actors/Room.scala` Carries the whole
  state model, so it carries most of the change. Task 1 adds `Estimate`, `Round`
  and `RoomState` and rewrites `RoomData` onto them; task 2 adds `Member`,
  replaces `users` with `members`, `connections` and session-only resolution, and
  rewrites `Join`, `Leave`, `ConfirmLeave` and `publish`. `User` is gone by the
  end of task 2.
- `src/main/scala/com/lunatech/pointingpoker/actors/RoomSnapshot.scala` `of`
  becomes the join over membership and the round. Task 1 joins `users` against
  `round.estimates`; task 2 changes the left side to `members`. The projection
  and its encoders do not move.
- `src/main/scala/com/lunatech/pointingpoker/actors/RoomManager.scala`
  `ConnectToRoom` stops building a vote state (task 1, deleting `InitialVoteState`
  and `InitialEstimation`) and then stops building a `User` at all (task 2). No
  other handler changes.

**Tests, modified:**

- `src/test/scala/.../actors/RoomDataFixtures.scala` Gains `Attendee`, the
  test-scope record that holds one person's four groups, and the extensions the
  new states need. `withUsers` keeps its name and its call shape, which is what
  keeps 54 fixture sites from being 54 edits.
- `src/test/scala/.../actors/RoomSpec.scala` The largest file in the step.
  `createUser` returns an `Attendee`, every read of `data.users`, `u.voted`,
  `u.estimation` and `data.revealed` is rewritten, six cases are replaced because
  the state they were written against is gone, and roughly ten are added.
- `src/test/scala/.../actors/RoomSnapshotSpec.scala` Its private `user` builder
  returns an `Attendee`; the redaction cases are unchanged in substance, and two
  arrive for the join over membership.
- `src/test/scala/.../actors/RoomManagerSpec.scala` Three `Room.User`
  constructions and two `Room.Join` expectations follow the message shape.

**Docs, modified (task 3):**

- `docs/superpowers/specs/2026-08-31-protocol-target-architecture-design.md`
- `docs/known-issues.md`
- `docs/superpowers/plans/README.md`

**Not modified:** `docs/roadmap.md` (nothing user-visible moves, and the roadmap
entries that name step 4 name 4a's work), `e2e/`, `index.html`, `API.scala`.

### Why the tasks are split where they are

**The seam is the participant record, taken twice.** Task 1 empties `User` of
everything the round owns, leaving `(id, name, ref, token)`, which is a type
whose only remaining job is to carry a connection. Task 2 then splits that one
job three ways. Each half compiles, runs green, and answers a different review
question: task 1 asks whether the round is modelled right, task 2 whether the
connection layer is. That is the same argument the design uses to carve 4a out
of this step, one level down.

**Task 1 cannot be split further.** `Estimate` refuses a blank value, so the
moment estimates become a map the blank vote has nowhere to go, and the refusal
has to land in the same commit as the type. Likewise `hasEstimation` cannot mean
`estimation.nonEmpty` once there is no estimation on the participant. The two
deliberate behaviour changes are therefore forced by the model rather than
chosen alongside it, and a reviewer should read them that way.

**Each task is one commit.** Between the production rewrite and the last
migrated spec the tree does not compile, so there is no smaller unit that is
green. The steps inside a task are still one action each, and the suite is run
before the commit rather than after each step.

**Task 3 waits on both**, because its citation sweep is only true of the tree it
runs against and the known-issue it edits is only false once the refusal exists.

### Traps this plan is scheduled around

**A fixture whose estimation is blank must produce no entry, not a blank entry.**
`estimatesFor` filters on `isBlank` before calling `Estimate.of`. Getting this
wrong throws at fixture construction rather than failing an assertion, so the
first suite run after the fixtures change is where it surfaces. No current
fixture site combines `voted = true` with a blank estimation, which would be an
illegal state under the new model; if one is ever added, the fixture should throw
rather than encode it.

**`RoomData`'s `copy` is private, and so is `Estimate`'s.** 5a closed the
constructor, which in Scala 3 takes `apply` and `copy` with it. Inside
`RoomData`'s own body `copy` still works, which is what the private write methods
use. Outside it, including from the fixtures, the only way in is `RoomData.of`,
so every extension rebuilds through `of`. `Estimate`'s re-vote transition is a
method on `Estimate` for the same reason: `RoomData.reVote` is a different class
and cannot reach that `copy`.

**`withUsers` gives every attendee a connection, and three states need less than
that.** A member in their grace period holds none; a departed member holds none
and no membership either, while keeping a session and possibly an estimate; a
session minted for a tab that has not connected holds neither. The fixtures name
all three, and a case that reaches for `withUsers` where it wants one of them
passes for the wrong reason.

**The two `Join` guard cases must keep asserting that the refused joiner gets
nothing.** They are the cases step 6 is expected to redden, and the assertion
that carries that promise is `strangerProbe.expectNoMessage()`. Task 2 adds the
connections half of the same rule beside it.

---

## Task 1: The round leaves the participant

**Files:**
- Modify: `src/main/scala/com/lunatech/pointingpoker/actors/Room.scala`
  (`Estimate`, `Round`, `RoomState`, `RoomData`, `RoomData.of`, `User`)
- Modify: `src/main/scala/com/lunatech/pointingpoker/actors/RoomSnapshot.scala`
  (`of`)
- Modify: `src/main/scala/com/lunatech/pointingpoker/actors/RoomManager.scala`
  (`ConnectToRoom`, `InitialVoteState`, `InitialEstimation`)
- Test: `src/test/scala/.../actors/RoomDataFixtures.scala`,
  `src/test/scala/.../actors/RoomSpec.scala`,
  `src/test/scala/.../actors/RoomSnapshotSpec.scala`,
  `src/test/scala/.../actors/RoomManagerSpec.scala`

**Interfaces:**
- Consumes: `Room.SessionToken`, `Room.Session(userId, name)`,
  `Room.RoomData.of`, `RoomDataFixtures.withUsers` and its extensions, all as
  step 5a left them.
- Produces:
  - `Room.Estimate`, a case class with a private constructor,
    `value: String` and `confirmed: Boolean`, one method
    `unconfirmed: Estimate`, and a companion factory
    `Estimate.of(value: String, confirmed: Boolean = true): Estimate` that
    throws `IllegalArgumentException` on a blank value.
  - `Room.Round(estimates: Map[UUID, Estimate], revealed: Boolean)`, with
    `Round.fresh`.
  - `Room.RoomState(currentIssue: String, round: Round)`, with `RoomState.empty`.
  - `Room.User(id: UUID, name: String, ref: UntypedRef, token: SessionToken)`,
    losing `voted` and `estimation`.
  - `Room.RoomData(users: List[User], state: RoomState, sessions: Map[SessionToken, Session])`,
    constructor still private, with
    `RoomData.of(users, sessions, state: RoomState = RoomState.empty): RoomData`.
  - `RoomDataFixtures.Attendee(id, name, voted, estimation, ref, token)` with
    `asUser: Room.User`, and `RoomDataFixtures.estimateFor(user): Option[(String, Boolean)]`
    as an extension on `RoomData`.
  - `RoomManager.InitialVoteState` and `RoomManager.InitialEstimation` are
    **removed**.

- [ ] **Step 1: Write the failing cases for the round types and the blank refusal**

Add to `RoomSpec`, at the end of the `"Room Actor" should` block beside the
existing `RoomData.of` cases. They will not compile yet, which is the red.

```scala
    "refuse a blank estimation rather than storing one" in {
      val (user, _)    = createUser(UUID.randomUUID(), "user1", false, "")
      val (user2, _)   = createUser(UUID.randomUUID(), "user2", false, "")
      val dataProbe    = testKit.createTestProbe[Room.DataStatus]()
      val (_, roomRef) = createRoom(UUID.randomUUID(), withUsers(user, user2))

      roomRef ! Room.Vote(user.token, "")
      roomRef ! Room.Vote(user2.token, "   ")
      roomRef ! Room.GetData(dataProbe.ref)

      // Absence is structural now, so a blank value would enter the tally as its own bucket.
      val data = dataProbe.expectMessageType[Room.DataStatus].data
      data.state.round.estimates mustBe empty
      data.state.round.revealed mustBe false
    }

    "publish on a refused blank vote, the same as on one that lands" in {
      val (user, userProbe) = createUser(UUID.randomUUID(), "user1", false, "")
      val (_, roomRef)      = createRoom(UUID.randomUUID(), withUsers(user))

      roomRef ! Room.Vote(user.token, "")

      // The absence of a special case: vote returns unchanged data through the same publish.
      expectSnapshot(userProbe).users.map(_.hasEstimation) mustBe List(false)
    }

    "refuse an Estimate with a blank value" in {
      val thrown = intercept[IllegalArgumentException](Room.Estimate.of(" "))

      thrown.getMessage must include("needs a value")
    }

    "clear the confirmation but keep the value on a re-vote" in {
      val (user, _)    = createUser(UUID.randomUUID(), "user1", true, "3")
      val dataProbe    = testKit.createTestProbe[Room.DataStatus]()
      val (_, roomRef) = createRoom(UUID.randomUUID(), withUsers(user).withRevealed())

      roomRef ! Room.ReVote(user.token)
      roomRef ! Room.GetData(dataProbe.ref)

      // The state Estimate exists to express: an estimation with no confirmation.
      dataProbe.expectMessageType[Room.DataStatus].data.estimateFor(user) mustBe Some(("3", false))
    }

    "refuse a RoomData whose estimate resolves to no session" in {
      val (user, _)   = createUser(UUID.randomUUID(), "user1", false, "")
      val stranger    = UUID.randomUUID()
      val state       = Room.RoomState("", Room.Round(Map(stranger -> Room.Estimate.of("5")), false))

      val thrown = intercept[IllegalArgumentException] {
        RoomData.of(List(user.asUser), Map(user.token -> Room.Session(user.id, user.name)), state)
      }

      thrown.getMessage must include("resolves to no session")
    }

    "allow an estimate whose member has gone, which is what a departure produces" in {
      val (user, _)     = createUser(UUID.randomUUID(), "user1", false, "")
      val (departed, _) = createUser(UUID.randomUUID(), "user2", true, "8")

      // Problem A's guarantee: the estimate is keyed by id and outlives membership.
      val data = withUsers(user).withMemberlessSession(departed).withEstimate(departed)

      data.estimateFor(departed) mustBe Some(("8", true))
      data.users.map(_.id) mustBe List(user.id)
    }
```

Add to `RoomSnapshotSpec`:

```scala
    "count an entry in the round as an estimation, however the value reads" in {
      val alice = user(UUID.randomUUID(), "Alice", true, "5")
      val bob   = user(UUID.randomUUID(), "Bob", false, "")
      val data  = withUsers(alice, bob)

      // hasEstimation is the entry existing, not a non-empty string on the participant.
      val rows = RoomSnapshot.of(data, alice.id).users
      rows.find(_.id == alice.id).map(_.hasEstimation) mustBe Some(true)
      rows.find(_.id == bob.id).map(_.hasEstimation) mustBe Some(false)
    }

    "leave an estimate belonging to no participant out of the snapshot entirely" in {
      val alice    = user(UUID.randomUUID(), "Alice", true, "5")
      val departed = user(UUID.randomUUID(), "Departed", true, "13")
      val data     = withUsers(alice).withMemberlessSession(departed).withEstimate(departed)

      // Invariant 2: every estimate on the wire comes from the join, never from the map.
      val snapshot = RoomSnapshot.of(data, alice.id)
      snapshot.users.map(_.id) mustBe List(alice.id)
      (snapshot.asJson.noSpaces must not).include("13")
    }
```

- [ ] **Step 2: Run them to verify they fail**

Run: `sbt "testOnly *RoomSpec *RoomSnapshotSpec"`
Expected: a compile error, naming `Estimate`, `RoomState` or `estimateFor` as
not a member. That is the red for a type that does not exist yet.

- [ ] **Step 3: Add the round types and rewrite `RoomData` onto them**

In `Room.scala`, replace `User` and `RoomData` with the following. `Session`,
`SessionToken`, the command ADT and `defaultGracePeriod` are unchanged.

```scala
  final case class User(id: UUID, name: String, ref: UntypedRef, token: SessionToken)

  final case class Estimate private (value: String, confirmed: Boolean):
    // copy is private with the constructor, so the re-vote transition lives on the type.
    def unconfirmed: Estimate = this.copy(confirmed = false)

  object Estimate:
    def of(value: String, confirmed: Boolean = true): Estimate =
      // vote refuses a blank before this, so an invalid estimate is a programming error.
      require(!value.isBlank, "an estimate needs a value")
      Estimate(value, confirmed)

  final case class Round(estimates: Map[UUID, Estimate], revealed: Boolean)

  object Round:
    val fresh: Round = Round(Map.empty[UUID, Estimate], revealed = false)

  final case class RoomState(currentIssue: String, round: Round)

  object RoomState:
    val empty: RoomState = RoomState("", Round.fresh)

  final case class RoomData private (
      users: List[User],
      state: RoomState,
      sessions: Map[SessionToken, Session] = Map.empty
  ):
    private[Room] def joinUser(user: User): RoomData =
      // Nothing to carry over: the estimate is keyed by user id in the round, not on the entry.
      this.copy(users = user :: this.users.filterNot(_.id == user.id))

    private[Room] def registerSession(token: SessionToken, userId: UUID, name: String): RoomData =
      this.copy(sessions = this.sessions + (token -> Session(userId, name)))

    def vote(userId: UUID, estimation: String): RoomData =
      // The reveal closes the round, and a blank estimation is the absence of a value, which
      // presence-based hasEstimation would otherwise admit to the client's tally.
      if this.state.round.revealed || estimation.isBlank then this
      else
        val estimates = this.state.round.estimates + (userId -> Estimate.of(estimation))
        // Still a latch: only a vote or ShowVotes sets it, so a departure reveals nothing.
        withRound(Round(estimates, everyUserHasVoted(estimates)))
    end vote

    def show(): RoomData =
      withRound(this.state.round.copy(revealed = true))

    def clear(): RoomData =
      withRound(Round.fresh)

    def reVote(): RoomData =
      // Keeps the values, which is what makes an estimate without a confirmation a re-vote.
      withRound(Round(this.state.round.estimates.view.mapValues(_.unconfirmed).toMap, false))

    def leave(userId: UUID, ref: UntypedRef): RoomData =
      // Scoped to the specific connection's ref, not just userId, so a stale connection's
      // delayed teardown can't evict a newer connection the same user reconnected with.
      this.copy(users = this.users.filterNot(u => u.id == userId && u.ref == ref))

    def editIssue(issue: String): RoomData =
      this.copy(state = this.state.copy(currentIssue = issue))

    private def withRound(round: Round): RoomData =
      this.copy(state = this.state.copy(round = round))

    private def everyUserHasVoted(estimates: Map[UUID, Estimate]): Boolean =
      // nonEmpty is insurance rather than a live case: only a Vote ever runs this.
      this.users.nonEmpty && this.users.forall(u => estimates.get(u.id).exists(_.confirmed))
  end RoomData

  object RoomData:
    val empty: RoomData = RoomData(List.empty[User], RoomState.empty)

    def of(
        users: List[User],
        sessions: Map[SessionToken, Session],
        state: RoomState = RoomState.empty
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
      // The round outlives membership, so its keys are checked against sessions, not users.
      val identities = sessions.values.map(_.userId).toSet
      state.round.estimates.keys.foreach { id =>
        require(identities.contains(id), s"the estimate for $id resolves to no session")
      }
      RoomData(users, state, sessions)
    end of
  end RoomData
```

In `receiveBehaviour`, only the `Vote` branch's neighbours change shape: the
handlers still call `data.vote`, `data.clear()`, `data.reVote()`, `data.show()`
and `data.editIssue(issue)`, and the `Join` guard, `ValidateToken`,
`RequestSession`, `Leave`, `ConfirmLeave` and `GetData` are untouched.
`ConfirmLeave`'s stale-ref check still reads `data.users.exists(u => u.id == userId && u.ref == ref)`.

- [ ] **Step 4: Rewrite `RoomSnapshot.of` as the join**

In `RoomSnapshot.scala`, replace the body of `of`. The comment above it and the
`Participant` projection stay as they are.

```scala
  def of(data: RoomData, forUser: UUID): RoomSnapshot =
    val round = data.state.round
    RoomSnapshot(
      you = forUser,
      currentIssue = data.state.currentIssue,
      votesRevealed = round.revealed,
      // The join: a participant appears because they are one, their estimate comes from
      // the round, and an estimate belonging to nobody present reaches nobody.
      users = data.users
        .sortWith((a, b) => a.id.compareTo(b.id) < 0)
        .map { u =>
          val estimate = round.estimates.get(u.id)
          val disclose = round.revealed || u.id == forUser
          Participant(
            id = u.id,
            name = u.name,
            voted = estimate.exists(_.confirmed),
            hasEstimation = estimate.isDefined,
            estimation = estimate.filter(_ => disclose).map(_.value).getOrElse("")
          )
        }
    )
```

- [ ] **Step 5: Stop `ConnectToRoom` building a vote state**

In `RoomManager.scala`, delete `InitialVoteState` and `InitialEstimation`, and
send the four-field `User`:

```scala
          case ConnectToRoom(roomId, userId, name, token, ref) =>
            data.rooms.get(roomId).foreach { room =>
              room ! Room.Join(Room.User(userId, name, ref, token))
            }
            Behaviors.same
```

- [ ] **Step 6: Rewrite the fixtures onto `Attendee`**

Replace `RoomDataFixtures.scala` entirely.

```scala
package com.lunatech.pointingpoker.actors

import java.util.UUID

import org.apache.pekko.actor.ActorRef as UntypedRef

import com.lunatech.pointingpoker.actors.Room.RoomData

object RoomDataFixtures:

  // One person's state groups as a single test record, so a fixture site reads as a
  // participant rather than as an entry in each of three maps.
  final case class Attendee(
      id: UUID,
      name: String,
      voted: Boolean,
      estimation: String,
      ref: UntypedRef,
      token: Room.SessionToken
  ):
    def asUser: Room.User = Room.User(id, name, ref, token)

  def withUsers(users: Attendee*): RoomData =
    RoomData.of(
      users.map(_.asUser).toList,
      sessionsFor(users*),
      Room.RoomState("", Room.Round(estimatesFor(users*), revealed = false))
    )

  extension (data: RoomData)
    def withIssue(issue: String): RoomData =
      RoomData.of(data.users, data.sessions, data.state.copy(currentIssue = issue))

    def withRevealed(): RoomData =
      RoomData.of(data.users, data.sessions, withRound(data, _.copy(revealed = true)))

    // A session whose member has gone or has not yet arrived; both reach the same state.
    def withMemberlessSession(users: Attendee*): RoomData =
      RoomData.of(data.users, data.sessions ++ sessionsFor(users*), data.state)

    // An estimate with no member, which a departure leaves behind and the join must drop.
    def withEstimate(user: Attendee): RoomData =
      RoomData.of(
        data.users,
        data.sessions,
        withRound(data, r => r.copy(estimates = r.estimates ++ estimatesFor(user)))
      )

    def estimateFor(user: Attendee): Option[(String, Boolean)] =
      data.state.round.estimates.get(user.id).map(e => (e.value, e.confirmed))
  end extension

  private def withRound(data: RoomData, f: Room.Round => Room.Round): Room.RoomState =
    data.state.copy(round = f(data.state.round))

  private def sessionsFor(users: Attendee*): Map[Room.SessionToken, Room.Session] =
    users.map(u => u.token -> Room.Session(u.id, u.name)).toMap

  private def estimatesFor(users: Attendee*): Map[UUID, Room.Estimate] =
    // A blank estimation is no entry at all; Estimate.of would refuse to build one.
    users
      .filterNot(_.estimation.isBlank)
      .map(u => u.id -> Room.Estimate.of(u.estimation, u.voted))
      .toMap
end RoomDataFixtures
```

- [ ] **Step 7: Migrate `RoomSpec`**

Four mechanical rules, then the cases that need judgement.

1. `createUser` in `object RoomSpec` returns `(Attendee, TestProbe)`:

```scala
  def createUser(uuid: UUID, name: String, voted: Boolean, estimation: String)(using
      testKit: ActorTestKit
  ): (Attendee, TestProbe) =
    val probe = TestProbe()(testKit.system.classicSystem)
    (Attendee(uuid, name, voted, estimation, probe.ref, Room.SessionToken.mint()), probe)
```

2. Every `Room.User(id, name, voted, estimation, ref, token)` literal becomes
   `Attendee(id, name, voted, estimation, ref, token)`, and every
   `roomRef ! Room.Join(x)` becomes `roomRef ! Room.Join(x.asUser)`.
3. `data.revealed` becomes `data.state.round.revealed`.
4. `data.users.map(u => (u.voted, u.estimation))` becomes `data.estimateFor(user)`
   per participant, asserting `Some(("3", true))`, `Some(("5", false))` or `None`.
   Keep one assertion per participant rather than one list, since the map has no
   order to assert on.

The cases needing more than that:

- **"clear votes and publish the cleared room"**: the expectation
  `withUsers(user.copy(voted = false, estimation = ""), user2.copy(...))` still
  builds the right state, since a cleared attendee yields no entry. Leave it.
- **"revote and publish a room that keeps the estimations but clears the votes"**:
  unchanged, and it is now the wire-side pair to the new `reVote` case in step 1.
- **"vote and publish it to everyone"**: the `DataStatus` expectation stays
  `withUsers(user.copy(voted = true, estimation = estimation), user2)`.
- **"refuse a vote that would overwrite a confirmed estimate in a revealed round"**
  and **"refuse a first vote in a revealed round"**: replace the
  `data.users.map(...)` assertion with `data.estimateFor(user)` and
  `data.estimateFor(user2)`, keeping `data.state.round.revealed mustBe true`.
- **"keep a reconnecting user's vote instead of resetting it"**: keep the case and
  change what it proves. The comment about `ConnectToRoom` building a fresh
  `User` with `InitialVoteState` is deleted with those constants; assert
  `data.estimateFor(user) mustBe Some(("5", true))` and
  `data.users.map(_.ref) mustBe List(newRefProbe.ref)`, with a one-line comment
  that the estimate is keyed by id and the rejoin never touches it.
- **"build a RoomData when every member has a matching session"**: `data.users`
  now holds `asUser` values, so compare against `List(user.asUser, user2.asUser)`
  and add `data.state mustBe Room.RoomState.empty`.

- [ ] **Step 8: Migrate `RoomSnapshotSpec`**

Its private builder returns an `Attendee`:

```scala
  private def user(id: UUID, name: String, voted: Boolean, estimation: String): Attendee =
    Attendee(id, name, voted, estimation, TestProbe().ref, Room.SessionToken.mint())
```

`Attendee` is already in scope through the file's existing
`import com.lunatech.pointingpoker.actors.RoomDataFixtures.*`. Nothing else in
the file changes: every case builds through `withUsers` and asserts on the
snapshot, and the two wire-pinning cases must pass with their assertions
untouched.

- [ ] **Step 9: Migrate `RoomManagerSpec`**

Two `Room.Join` expectations lose the vote fields:

```scala
      roomProbe.expectMessage(Room.Join(Room.User(userId1, user1Name, user1Probe.ref, token1)))
      roomProbe.expectMessage(Room.Join(Room.User(userId2, user2Name, user2Probe.ref, token2)))
```

In "keep a member's vote when ConnectToRoom re-registers them after a reconnect",
`alice` becomes an `Attendee` so `withMemberlessSession(alice)` keeps working,
and the final assertion becomes:

```scala
      val data = dataProbe.expectMessageType[Room.DataStatus].data
      data.estimateFor(alice) mustBe Some(("5", true))
```

- [ ] **Step 10: Run the whole suite**

Run: `sbt test`
Expected: PASS, including the seven cases from step 1. If `Estimate.of` throws
during fixture construction, a fixture is combining `voted = true` with a blank
estimation, which is the illegal state named under the traps above.

- [ ] **Step 11: Run the browser suite**

Run: `npm run e2e`
Expected: PASS, unchanged. It is the regression net for the two deliberate
behaviour changes being invisible from the page.

- [ ] **Step 12: Format and commit**

```bash
sbt scalafmtAll styleCheck
git add src/main/scala/com/lunatech/pointingpoker/actors/ \
        src/test/scala/com/lunatech/pointingpoker/actors/
git commit -m "$(cat <<'EOF'
refactor(actors): move the round off the participant

RoomState, Round and Estimate arrive, estimates are keyed by user id, and
RoomSnapshot.of becomes the join over them, so an estimate outlives its
participant and reaches nobody once they are gone.

Two behaviour changes come with the model rather than beside it: hasEstimation
is the entry existing rather than a non-empty string, and vote refuses a blank
estimation, which presence would otherwise admit to the client's tally. Step 1's
Problem A fix goes, vote loss on reconnect being unrepresentable now.
EOF
)"
```

---

## Task 2: The connection layer

**Files:**
- Modify: `src/main/scala/com/lunatech/pointingpoker/actors/Room.scala`
  (`Member`, `RoomData`, `RoomData.of`, `Join`, `Leave`, `ConfirmLeave`, the five
  command branches, `publish`)
- Modify: `src/main/scala/com/lunatech/pointingpoker/actors/RoomSnapshot.scala`
  (`of`)
- Modify: `src/main/scala/com/lunatech/pointingpoker/actors/RoomManager.scala`
  (`ConnectToRoom`)
- Test: the same four test files

**Interfaces:**
- Consumes: everything task 1 produced.
- Produces:
  - `Room.Member(name: String)`.
  - `Room.RoomData(state: RoomState, members: Map[UUID, Member], sessions: Map[SessionToken, Session], connections: Map[UUID, Set[UntypedRef]])`,
    constructor private, with
    `RoomData.of(state: RoomState = RoomState.empty, members: Map[UUID, Member] = Map.empty, sessions: Map[SessionToken, Session] = Map.empty, connections: Map[UUID, Set[UntypedRef]] = Map.empty): RoomData`.
  - `RoomData.actingMember(token: SessionToken): Option[UUID]`,
    `RoomData.isMember(userId: UUID): Boolean`,
    `RoomData.holdsConnection(userId: UUID): Boolean`.
  - `Room.Join(userId: UUID, name: String, token: SessionToken, ref: UntypedRef)`
    and `Room.ConfirmLeave(userId: UUID, replyTo: ActorRef[Response])`, both
    losing what they no longer need. `Room.Leave` is unchanged.
  - `Room.User` is **removed**.
  - `RoomDataFixtures.Attendee.joinMessage: Room.Join`, replacing `asUser`, plus
    the `withSecondConnection`, `withNoConnection` and `withDeparted` extensions.

- [ ] **Step 1: Write the failing cases for the connection layer**

Add to `RoomSpec`. As in task 1, these do not compile yet.

```scala
    "send one snapshot to each of a member's connections" in {
      val (user, userProbe)   = createUser(UUID.randomUUID(), "user1", false, "")
      val (user2, user2Probe) = createUser(UUID.randomUUID(), "user2", false, "")
      val secondTab           = TestProbe()(testKit.system.classicSystem)
      val (_, roomRef)        = createRoom(
        UUID.randomUUID(),
        withUsers(user, user2).withSecondConnection(user, secondTab.ref)
      )

      roomRef ! Room.EditIssue(user.token, "an issue")

      // One participant, two connections, one identity: both tabs are redacted for user.
      for probe <- List(userProbe, secondTab) do
        val snapshot = expectSnapshot(probe)
        snapshot.you mustBe user.id
        snapshot.currentIssue mustBe "an issue"
      expectSnapshot(user2Probe).you mustBe user2.id
    }

    "hold both connections when a replacement arrives before the first drops" in {
      val (user, _)    = createUser(UUID.randomUUID(), "user1", false, "")
      val dataProbe    = testKit.createTestProbe[Room.DataStatus]()
      val (_, roomRef) = createRoom(UUID.randomUUID(), withUsers(user))

      val replacement = TestProbe()(testKit.system.classicSystem)
      roomRef ! Room.Join(user.id, user.name, user.token, replacement.ref)
      roomRef ! Room.GetData(dataProbe.ref)

      // A map keyed by id cannot duplicate the member; the second tab is a second ref.
      val data = dataProbe.expectMessageType[Room.DataStatus].data
      data.members.keySet mustBe Set(user.id)
      data.connections(user.id) mustBe Set(user.ref, replacement.ref)
    }

    "schedule no removal when the connection that drops is not the member's last" in {
      val (user, _)         = createUser(UUID.randomUUID(), "user1", false, "")
      val (user2, _)        = createUser(UUID.randomUUID(), "user2", false, "")
      val replacement       = TestProbe()(testKit.system.classicSystem)
      val roomResponseProbe = testKit.createTestProbe[Room.Response]()
      val dataProbe         = testKit.createTestProbe[Room.DataStatus]()
      val (_, roomRef)      = createRoom(
        UUID.randomUUID(),
        withUsers(user, user2).withSecondConnection(user, replacement.ref),
        gracePeriod = 50.millis
      )

      roomRef ! Room.Leave(user.id, user.ref, roomResponseProbe.ref)

      // Problem C made unrepresentable: the question is answered at Leave time, so the
      // racing reconnect leaves no timer to go stale rather than a check to absorb it.
      roomResponseProbe.expectNoMessage(200.millis)
      roomRef ! Room.GetData(dataProbe.ref)
      val data = dataProbe.expectMessageType[Room.DataStatus].data
      data.members.keySet mustBe Set(user.id, user2.id)
      data.connections(user.id) mustBe Set(replacement.ref)
    }

    "keep a member with no connection in everyone's list" in {
      val (user, userProbe)   = createUser(UUID.randomUUID(), "user1", false, "")
      val (user2, user2Probe) = createUser(UUID.randomUUID(), "user2", false, "")
      val (_, roomRef)        = createRoom(
        UUID.randomUUID(),
        withUsers(user, user2).withNoConnection(user)
      )

      roomRef ! Room.EditIssue(user2.token, "an issue")

      // The grace period doing its job: the row survives, the sends do not.
      expectSnapshot(user2Probe).users.map(_.id).toSet mustBe Set(user.id, user2.id)
      userProbe.expectNoMessage()
    }

    "publish nothing when a connection drops" in {
      val (user, _)           = createUser(UUID.randomUUID(), "user1", false, "")
      val (user2, user2Probe) = createUser(UUID.randomUUID(), "user2", false, "")
      val secondTab           = TestProbe()(testKit.system.classicSystem)
      val roomResponseProbe   = testKit.createTestProbe[Room.Response]()
      val (_, roomRef)        = createRoom(
        UUID.randomUUID(),
        withUsers(user, user2).withSecondConnection(user, secondTab.ref),
        gracePeriod = 200.millis
      )

      roomRef ! Room.Leave(user.id, user.ref, roomResponseProbe.ref)

      // A transient drop changes no snapshot, so it produces no wire traffic at all.
      user2Probe.expectNoMessage(300.millis)
    }

    "refuse a RoomData whose connection resolves to no session" in {
      val (user, _) = createUser(UUID.randomUUID(), "user1", false, "")
      val stranger  = UUID.randomUUID()

      val thrown = intercept[IllegalArgumentException] {
        RoomData.of(
          sessions = Map(user.token -> Room.Session(user.id, user.name)),
          connections = Map(stranger -> Set(user.ref))
        )
      }

      thrown.getMessage must include("resolves to no session")
    }

    "allow a connection whose member has gone, which is what a departure produces" in {
      val (user, _)     = createUser(UUID.randomUUID(), "user1", false, "")
      val (departed, _) = createUser(UUID.randomUUID(), "user2", false, "")

      // Required rather than tolerated: section 4's leave endpoint removes the member
      // while that tab's stream is still open, and step 6 is what recovers it.
      val data = withUsers(user, departed).withDeparted(departed)

      data.members.keySet mustBe Set(user.id)
      data.connections.keySet mustBe Set(user.id, departed.id)
    }
```

Add to `RoomSnapshotSpec`, replacing nothing:

```scala
    "leave a participant whose membership ended out of the snapshot" in {
      val alice    = user(UUID.randomUUID(), "Alice", true, "5")
      val departed = user(UUID.randomUUID(), "Departed", true, "13")
      val data     = withUsers(alice, departed).withDeparted(departed).withRevealed()

      // The join is over members, so a revealed round discloses nothing of a departed one.
      val snapshot = RoomSnapshot.of(data, alice.id)
      snapshot.users.map(_.id) mustBe List(alice.id)
      (snapshot.asJson.noSpaces must not).include("13")
    }
```

- [ ] **Step 2: Run them to verify they fail**

Run: `sbt "testOnly *RoomSpec *RoomSnapshotSpec"`
Expected: a compile error naming `connections`, `members`, `withSecondConnection`
or the four-argument `Room.Join`.

- [ ] **Step 3: Split `RoomData` into the four groups**

In `Room.scala`, replace `User` with `Member` and rewrite `RoomData`. `Estimate`,
`Round`, `RoomState`, `Session` and `SessionToken` are unchanged from task 1.

```scala
  final case class Member(name: String)

  final case class RoomData private (
      state: RoomState,
      members: Map[UUID, Member],
      sessions: Map[SessionToken, Session],
      connections: Map[UUID, Set[UntypedRef]]
  ):
    private[Room] def connect(userId: UUID, name: String, ref: UntypedRef): RoomData =
      this.copy(
        members = this.members + (userId -> Member(name)),
        connections =
          this.connections.updatedWith(userId)(refs => Some(refs.getOrElse(Set.empty) + ref))
      )

    private[Room] def disconnect(userId: UUID, ref: UntypedRef): RoomData =
      // The entry goes when its set empties, so "holds no connection" means what it says.
      this.copy(connections = this.connections.updatedWith(userId)(_.map(_ - ref).filter(_.nonEmpty)))

    private[Room] def removeMember(userId: UUID): RoomData =
      // Estimates are keyed by id and survive a departure; only clear or the round ends one.
      this.copy(members = this.members - userId)

    private[Room] def registerSession(token: SessionToken, userId: UUID, name: String): RoomData =
      this.copy(sessions = this.sessions + (token -> Session(userId, name)))

    // Resolving a token and being allowed to act are two checks: sessions carry no TTL.
    def actingMember(token: SessionToken): Option[UUID] =
      this.sessions.get(token).map(_.userId).filter(this.members.contains)

    def isMember(userId: UUID): Boolean = this.members.contains(userId)

    def holdsConnection(userId: UUID): Boolean = this.connections.contains(userId)

    def vote(userId: UUID, estimation: String): RoomData = // unchanged from task 1
      if this.state.round.revealed || estimation.isBlank then this
      else
        val estimates = this.state.round.estimates + (userId -> Estimate.of(estimation))
        withRound(Round(estimates, everyMemberHasVoted(estimates)))
    end vote

    def show(): RoomData   = withRound(this.state.round.copy(revealed = true))
    def clear(): RoomData  = withRound(Round.fresh)
    def reVote(): RoomData =
      withRound(Round(this.state.round.estimates.view.mapValues(_.unconfirmed).toMap, false))

    def editIssue(issue: String): RoomData =
      this.copy(state = this.state.copy(currentIssue = issue))

    private def withRound(round: Round): RoomData =
      this.copy(state = this.state.copy(round = round))

    private def everyMemberHasVoted(estimates: Map[UUID, Estimate]): Boolean =
      // nonEmpty is insurance rather than a live case: only a Vote ever runs this.
      this.members.nonEmpty && this.members.keys.forall(id => estimates.get(id).exists(_.confirmed))
  end RoomData

  object RoomData:
    val empty: RoomData = of()

    def of(
        state: RoomState = RoomState.empty,
        members: Map[UUID, Member] = Map.empty,
        sessions: Map[SessionToken, Session] = Map.empty,
        connections: Map[UUID, Set[UntypedRef]] = Map.empty
    ): RoomData =
      // Every id resolves to a session, which is conspicuously not "every id is a member":
      // a connection or an estimate outliving its member is a state this design requires.
      val identities = sessions.values.map(s => s.userId -> s).toMap
      members.foreach { (id, member) =>
        require(identities.contains(id), s"member ${member.name} ($id) has no session")
        require(
          identities(id).name == member.name,
          s"the session for member ${member.name} ($id) holds a different name"
        )
      }
      connections.keys.foreach(id =>
        require(identities.contains(id), s"the connection for $id resolves to no session")
      )
      state.round.estimates.keys.foreach(id =>
        require(identities.contains(id), s"the estimate for $id resolves to no session")
      )
      RoomData(state, members, sessions, connections)
    end of
  end RoomData
```

The id clause of 5a's invariant is absorbed by the containment: `members` is
keyed by UUID and `Member` carries no token, so "every member's token is a key of
`sessions`" becomes "every member id is some session's `userId`". The name clause
survives unchanged.

- [ ] **Step 4: Rewrite the actor's handlers**

In `receiveBehaviour`, the message shapes and five branches change. `Leave` keeps
its three fields; `ConfirmLeave` loses `ref`; `Join` carries four.

```scala
  final case class Join(userId: UUID, name: String, token: SessionToken, ref: UntypedRef)
      extends Command
  final private[actors] case class ConfirmLeave(userId: UUID, replyTo: ActorRef[Response])
      extends Command
```

```scala
        case Join(userId, name, token, ref) =>
          // Needs a same-id restart between resolution and Join. Warn, not raise, which stops
          // the room; a refused joiner gets no snapshot and, deliberately, no connection.
          if data.sessions.get(token).contains(Session(userId, name)) then
            // The arriving connection cancels any pending removal, so ConfirmLeave needs no
            // staleness check of its own.
            timers.cancel(userId)
            val newData = publish(data.connect(userId, name, ref), context)
            receiveBehaviour(roomId, newData, gracePeriod, timers)
          else
            val reason =
              if data.sessions.contains(token) then "its token's session names a different identity"
              else "its token resolves to no session"
            context.log.warn("Ignoring Join for user {} in room {}: {}.", userId, roomId, reason)
            Behaviors.same

        case Vote(token, estimation) =>
          data.actingMember(token) match
            case Some(userId) =>
              receiveBehaviour(roomId, publish(data.vote(userId, estimation), context), gracePeriod, timers)
            case None => Behaviors.same

        case Leave(userId, ref, replyTo) =>
          // Answerable at the moment of the event now that connections are their own map: a
          // member still holding one, or already removed, schedules nothing.
          val next = data.disconnect(userId, ref)
          if !next.holdsConnection(userId) && next.isMember(userId) then
            timers.startSingleTimer(key = userId, msg = ConfirmLeave(userId, replyTo), delay = gracePeriod)
          receiveBehaviour(roomId, next, gracePeriod, timers)

        case ConfirmLeave(userId, replyTo) =>
          val newData = publish(data.removeMember(userId), context)
          if newData.members.isEmpty then
            replyTo ! Stopped(roomId)
            Behaviors.stopped
          else
            replyTo ! Running(roomId)
            receiveBehaviour(roomId, newData, gracePeriod, timers)
```

`ClearVotes`, `ReVote`, `ShowVotes` and `EditIssue` take the same
`data.actingMember(token) match` shape as `Vote`, discarding the id where they do
not need it. `RequestSession`, `ValidateToken` and `GetData` are unchanged.

Deleted with this step: the `timers.isTimerActive` duplicate-`Leave` warning and
its long comment, `ConfirmLeave`'s stale-teardown branch, and `RoomData.leave`.

`publish` iterates connections:

```scala
  private[actors] def publish(data: RoomData, context: ActorContext[Command]): RoomData =
    // The Join to publish hop races a new connection's demand, benign while dropHead leaves a
    // newer full snapshot. 08-24 measured it under fail; re-check if that guarantee changes.
    context.log.debug("Publishing to {} connected members", data.connections.size)
    // One snapshot per member, shared by that member's connections: redaction is per identity.
    data.connections.foreach { (id, refs) =>
      val snapshot = RoomSnapshot.of(data, id)
      refs.foreach(_ ! snapshot)
    }
    data
  end publish
```

- [ ] **Step 5: Point `RoomSnapshot.of` at `members`**

Only the left side of the join moves. Everything else in the method, including
the sort and the redaction, is as task 1 left it.

```scala
      users = data.members.toList
        .sortWith((a, b) => a._1.compareTo(b._1) < 0)
        .map { (id, member) =>
          val estimate = round.estimates.get(id)
          val disclose = round.revealed || id == forUser
          Participant(
            id = id,
            name = member.name,
            voted = estimate.exists(_.confirmed),
            hasEstimation = estimate.isDefined,
            estimation = estimate.filter(_ => disclose).map(_.value).getOrElse("")
          )
        }
```

- [ ] **Step 6: Send the new `Join` from `ConnectToRoom`**

```scala
          case ConnectToRoom(roomId, userId, name, token, ref) =>
            data.rooms.get(roomId).foreach(room => room ! Room.Join(userId, name, token, ref))
            Behaviors.same
```

- [ ] **Step 7: Rewrite the fixtures**

In `RoomDataFixtures`, `asUser` becomes `joinMessage`, `withUsers` builds all four
groups, and the extensions rebuild through the four-argument `of`. The private
`sessionsFor` and `estimatesFor` are unchanged from task 1 and are omitted below.

```scala
  final case class Attendee(
      id: UUID,
      name: String,
      voted: Boolean,
      estimation: String,
      ref: UntypedRef,
      token: Room.SessionToken
  ):
    def joinMessage: Room.Join = Room.Join(id, name, token, ref)

  def withUsers(users: Attendee*): RoomData =
    RoomData.of(
      state = Room.RoomState("", Room.Round(estimatesFor(users*), revealed = false)),
      members = users.map(u => u.id -> Room.Member(u.name)).toMap,
      sessions = sessionsFor(users*),
      connections = users.map(u => u.id -> Set(u.ref)).toMap
    )

  extension (data: RoomData)
    def withIssue(issue: String): RoomData =
      RoomData.of(
        data.state.copy(currentIssue = issue),
        data.members,
        data.sessions,
        data.connections
      )

    def withRevealed(): RoomData =
      RoomData.of(withRound(data, _.copy(revealed = true)), data.members, data.sessions, data.connections)

    // A session whose member has gone or has not yet arrived; both reach the same state.
    def withMemberlessSession(users: Attendee*): RoomData =
      RoomData.of(data.state, data.members, data.sessions ++ sessionsFor(users*), data.connections)

    def withEstimate(user: Attendee): RoomData =
      RoomData.of(
        withRound(data, r => r.copy(estimates = r.estimates ++ estimatesFor(user))),
        data.members,
        data.sessions,
        data.connections
      )

    // The replacement tab arriving before the frozen one drops, and the two-tab case.
    def withSecondConnection(user: Attendee, ref: UntypedRef): RoomData =
      RoomData.of(
        data.state,
        data.members,
        data.sessions,
        data.connections.updatedWith(user.id)(refs => Some(refs.getOrElse(Set.empty) + ref))
      )

    // Inside the grace period: the row survives, the sends do not.
    def withNoConnection(user: Attendee): RoomData =
      RoomData.of(data.state, data.members, data.sessions, data.connections - user.id)

    // Membership ended while the tab is still attached, which is step 6's leave endpoint.
    def withDeparted(user: Attendee): RoomData =
      RoomData.of(data.state, data.members - user.id, data.sessions, data.connections)

    def estimateFor(user: Attendee): Option[(String, Boolean)] =
      data.state.round.estimates.get(user.id).map(e => (e.value, e.confirmed))
  end extension

  private def withRound(data: RoomData, f: Room.Round => Room.Round): Room.RoomState =
    data.state.copy(round = f(data.state.round))
```

Every extension rebuilds through the four-argument `of` rather than sharing a
helper with defaulted parameters, which would need nulls or a second option type
to express "unchanged". Do not reach for `RoomData.copy`: it is private with the
constructor, which is the whole of 5a.

- [ ] **Step 8: Migrate the three specs**

Mechanical across `RoomSpec`:

1. `roomRef ! Room.Join(x.asUser)` becomes `roomRef ! x.joinMessage`, and a
   reconnect under a new ref becomes
   `roomRef ! Room.Join(user.id, user.name, user.token, newRef)`.
2. `data.users.map(_.id)` becomes `data.members.keySet`, asserted as a `Set`.
3. `Room.ConfirmLeave(id, ref, probe.ref)` becomes `Room.ConfirmLeave(id, probe.ref)`.
4. Whole-`RoomData` equality expectations are unchanged wherever every
   participant holds exactly one connection, which is most of them.

The cases needing judgement:

- **"reset the grace period if Leave is called twice for the same connection
  before it elapses"**: keep the timing assertions, delete the comment block about
  the `(userId, ref)` key and the duplicate-`Leave` warning, and retitle it "restart
  the grace period when a second Leave arrives on a connection already dropped".
  What it now pins is that `startSingleTimer` replaces rather than duplicates,
  which is what makes the staleness check deletable.
- **"ignore a stale leave from a ref that already got replaced by a reconnect"**:
  delete it. Its successor is "schedule no removal when the connection that drops
  is not the member's last" from step 1, which asserts the same scenario against
  the mechanism that replaced the check.
- **"replace an existing user's entry on rejoin instead of duplicating it"**:
  delete it. Duplication is unrepresentable in a map keyed by id, and "hold both
  connections when a replacement arrives before the first drops" is what the
  scenario now proves.
- **"remove a user on leave and publish the smaller room"**: the expectation stays
  `withUsers(user2).withMemberlessSession(user)`, which is now exactly right: the
  departed member keeps a session and loses both its membership and its connection.
- **"stop itself if empty"**: seed with `withUsers(user, user2)` as now, and run
  the two-argument `ConfirmLeave` twice.
- **The two `Join` guard cases**: add `data.connections mustBe empty` beside the
  existing `DataStatus` assertion, so the rule that a refused `Join` adds no
  connection is pinned rather than implied. Keep both `expectNoMessage()`
  assertions and their step 6 comments.
- **"refuse every command from a token whose member was removed at grace expiry"**:
  unchanged in shape, and it is now the case that pins `actingMember`'s second
  check.

`RoomSnapshotSpec` needs no change beyond the new case, since it builds through
`withUsers` throughout. `RoomManagerSpec`'s two `Join` expectations become
`Room.Join(userId1, user1Name, token1, user1Probe.ref)`.

- [ ] **Step 9: Run the whole suite**

Run: `sbt test`
Expected: PASS. A failure in `RoomManagerSpec`'s reconnect case means the Join
guard is refusing a connection whose session the fixture did not seed; a failure
comparing a whole `RoomData` means a fixture is giving an attendee a connection
the room does not have, or the reverse.

- [ ] **Step 10: Run the browser suite**

Run: `npm run e2e`
Expected: PASS, unchanged. This is the only check that the participant list, the
reveal and the reconnect still work end to end, since no browser case is added
for state that has no wire form.

- [ ] **Step 11: Format and commit**

```bash
sbt scalafmtAll styleCheck
git add src/main/scala/com/lunatech/pointingpoker/actors/ \
        src/test/scala/com/lunatech/pointingpoker/actors/
git commit -m "$(cat <<'EOF'
refactor(actors): split the room's state into members, sessions and connections

No connection handle appears in the room's own data any more. publish iterates
connections and builds one snapshot per member, so a participant may hold several
connections and they all see one identity's redaction.

Problem C goes with the shape rather than by a fix: the grace timer is keyed on
userId alone and the question it used to defer is answered at Leave time, so a
racing reconnect leaves no stale timer and ConfirmLeave needs no staleness check.
EOF
)"
```

---

## Task 3: The record

**Files:**
- Modify: `docs/superpowers/specs/2026-08-31-protocol-target-architecture-design.md`
- Modify: `docs/known-issues.md`

- [ ] **Step 1: Record step 4 as landed, and its two deviations**

In the design's "**Step 4. State split.**" section, add a landed paragraph in the
shape steps 1, 5 and 5a use. It must say:

- what landed: the four groups, the join, `publish` over connections, the timer
  rekeyed on `userId`, and the deletion of step 1's Problem A fix;
- **that `RoomState` carries no `slug`**, that this departs from the state block
  in section 3, and why: `roomId` is already a parameter of
  `Room.receiveBehaviour`, a second copy has no reader and can disagree with it,
  and step 7 adds the field when generation gives it a meaning. Annotate the
  block in section 3 in the same commit, so the block and the step agree;
- **that `Estimate` took the product with a private constructor and a factory
  refusing a blank value**, which is what section 3 left open, and that
  `unconfirmed` lives on the type because the private `copy` does not reach
  `RoomData`;
- that the two deliberate behaviour changes landed as specified, and which cases
  cover them.

Then `docs/superpowers/plans/README.md`, whose record says "Step 4 will have
one". Put it in the past tense and say what the plan turned out to carry: two
production tasks rather than one, because no tree compiles between the halves of
a single rewrite, which is a shape the later large steps can reuse.

- [ ] **Step 2: Update the known issues the step touches**

Two entries, neither of them closed outright:

- The unvalidated-request-bodies entry, whose empty-estimation paragraph is
  written in the future tense about step 4. Rewrite that paragraph in the past
  tense: `vote` refuses a blank estimation, `hasEstimation` is now the entry
  existing in `round.estimates`, and what stays open is the non-blank nonsense
  estimation behind the `scale` item. The entry itself stays open.
- "A vote refused by a revealed round is silent, and can read as accepted".
  Widen it: a blank vote is refused by the same branch and is equally silent, and
  step 6's ask reply is what reports both. Keeping this in one entry rather than
  two is deliberate, since the gap is the unconditional `204` rather than either
  refusal.

- [ ] **Step 3: Sweep the citations this step moved**

Every `Room.scala` citation in the design and in `docs/known-issues.md` that
points at `joinUser`, `leave`, `vote`, `publish`, `ConfirmLeave` or the `Join`
guard. Prefer the symbol name to the line number, per the convention in
`docs/known-issues.md`'s stale-citation entry, and leave the deliberately
historical pre-step-1 pointers alone. Run this after the code commits, never
before: a sweep is only true of the tree it ran against.

```bash
grep -rn "Room\.scala:[0-9]" docs/
grep -rn "RoomSpec\.scala:[0-9]\|RoomManager\.scala:[0-9]" docs/
```

- [ ] **Step 4: Check the documents**

```bash
git diff --name-only main...HEAD -- '*.md' | xargs grep -lP '\x{2014}'
git log main..HEAD --format=%s | grep '^doc:'
```

Expected: no output from either. The em dash pattern is written as an escape
rather than as the character so that running the check does not put one into this
plan, and only the changed files are checked; step 5a's plan carries the full
reasoning for both, including why the empty output rather than the exit code is
the pass criterion. The second command catches a `doc:` subject where the
convention is `docs:`.

- [ ] **Step 5: Commit, and set the PR title**

```bash
git add docs/
git commit -m "$(cat <<'EOF'
docs: record the state split as landed, and what it deviated on

The slug field is deferred to step 7 and Estimate's open question is settled,
both recorded against the design's own state block rather than only here.
EOF
)"
gh pr edit 404 --title "refactor(actors): split the room's state into members, sessions and connections"
```

The PR title matters more than the commit subjects: PRs here are squash-merged,
so it is the only subject that reaches `main`. The PR currently carries the
docs-only title it was opened with.

---

## Verification

Run from the repository root, in this order:

1. `sbt styleCheck` Formatting, at 100 columns.
2. `sbt test` The whole JVM suite. `RoomSpec`, `RoomSnapshotSpec` and
   `RoomManagerSpec` are where this step lives; `APISpec` and `SSESpec` must pass
   untouched, which is the check that the split stopped at the actor boundary.
3. `npm run e2e` The browser suite, both engines, unchanged. Two browsers
   exchanging votes, the reveal with a straggler, reconnect survival, the
   participant list on join and leave, and the session walk are the end-to-end
   evidence that a refactor this size changed nothing a user sees.
4. `sbt "; clean; coverage; test; coverageReport"` (the `qa` alias) once, before
   the PR is marked ready.

Then, by hand, against a locally staged app (`npm run stage` and
`./target/universal/stage/bin/pointingpoker`), the two things no case asserts:

- Open one room in two tabs of the same browser. Both should show one
  participant, and a vote in either should appear in both. This is the
  connections-as-a-set behaviour, and until step 6 makes `/join` idempotent it is
  reachable only this way.
- Vote, then pull the network for longer than the grace period and restore it.
  The participant should come back with their estimate intact, which is Problem A
  being unrepresentable rather than fixed.

## Deviations from the plan, and why

Listed so a reviewer can reject one without re-deriving it.

1. **`e2e/room.spec.js` was modified, where the file structure above says `e2e/`
   is not.** The browser case "an empty estimation posted directly is not a
   summary row" pinned the behaviour this step removes: it posted a blank
   estimation, then asserted that the poster counted as voted and still produced
   no summary row, which was true only because the client's tally filtered on
   `hasEstimation`. Once `vote` refuses a blank, the poster never counts as
   voted, and the assertion is false. It was rewritten as "an empty estimation
   posted directly is refused, not stored as an empty vote", which keeps the
   property the case exists for, that a blank never becomes a summary row, and
   now reaches it at the source rather than through the client's filter. The
   planning miss: the two deliberate behaviour changes were checked against the
   JVM suite, which the plan rewrites case by case, and not against the browser
   suite, which it declared untouched on the strength of nothing a user sees
   changing. Nothing a user sees did change; what changed is what a
   hand-written `POST` does, and one browser case was written to make exactly
   that request. Task 3 records the amendment in the design, whose testing
   section assigns this step no browser work.

2. **The plan's assertion for the two `Join` guard cases is unsatisfiable.** It
   asks for `data.connections mustBe empty` beside the existing `DataStatus`
   assertion, and both fixtures seed a member who holds a connection, so the map
   is never empty at that point. What landed asserts that the refused joiner's
   id is absent from `data.connections.keySet`, which is the rule the cases are
   for: a refused `Join` adds no connection. The planning miss is the same shape
   as the assertion it was trying to strengthen, a rule about one id written as
   a claim about the whole collection.

3. **Two of the plan's own new cases were flaky, and `fb20b8d` fixed them after
   task 2.** They assert `(snapshot.asJson.noSpaces must not).include("13")` over
   a whole serialized snapshot to prove a departed member's estimate is absent.
   UUIDs are hex, so a bare digit pair collides with any one random id about 11%
   of the time, and a snapshot carries several, which is enough to redden CI
   intermittently. The fix is the pattern the step 2 case above already used,
   matching the JSON string literal `"13"` rather than the bare digits, which
   cannot collide with an id. The planning miss: the cases were copied from the
   step 2 case's intent without its escaping, and a probabilistic failure passes
   every time anyone runs it while writing it.
