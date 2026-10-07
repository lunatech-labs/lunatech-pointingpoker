# UI Refresh Step 2a: Seats Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move each identity's estimate out of the round into a seat that outlives the round, with no behaviour change, behind a safety net of unit cases that pin today's round transitions.

**Architecture:** `Room.RoomState` gains `seats: Map[UUID, Seat]`, and `Round` keeps only `revealed`. `Seat` is a one-case enum, `Voter(estimate: Option[Estimate])`, created in `registerSession` and kept in step with the sessions by `RoomData.of`. The transitions, the completion check and `RoomSnapshot.of` read and write seats, while the wire, the e2e suite and the contract files stay byte for byte the same. Task 1 pins the transitions on today's code first, so Task 2 is a refactor with a net under it.

**Tech Stack:** Scala 3, Pekko Typed 1.7 (`ActorTestKit`, `BehaviorTestKit`), ScalaTest `AnyWordSpec` with `must.Matchers`, scalafmt, sbt-scoverage. The frontend and Playwright (Chromium and Firefox) only run to prove nothing changed.

**Spec:** `docs/superpowers/specs/2026-10-04-ui-refresh-2-roles-design.md`: Terms ("Seat", "Present", "Complete"), decision 1 (the latch rule), and "Step 2a. Seats, no behaviour change" (Model, Pass condition). Steps 2b and 2c are out of scope.

## How the code in this plan was verified

Every patch below was applied and run in a scratch worktree on 2026-10-05, on this branch at `29347b7` (the code of `d4f93c7`), as two commits in task order:

- **Task 1 passes on today's code.** All six new cases pass. The actor suites go from 120 to 126 tests, and `scalafmtCheckAll` is clean.
- **Task 1's cases bite on today's code.** Each mutation in Task 1, Step 3 was applied alone. Each failed exactly the cases its row names and nothing else, so no existing case pinned any of the five transitions.
- **Task 2 passes.** The actor suites give 127 tests: 126, plus the two invariant cases, less the replaced estimate case. `sbt qa styleCheck` passed 227 tests at 93.90% statement coverage.
- **Task 2's cases bite on the new code.** Each of the nine mutations in Task 2, Step 7 was applied alone and failed exactly the cases its row names and nothing else. The seat-creation mutation (row 7) passed every other case, which is why the mint case asserts the seat. The `clear` mutation (row 9) passed all of `RoomSpec` with a fixture that reads a missing seat as "no estimate", which is why `estimateFor` throws.
- **Nothing visible changed.** The eight files in `target/contract/` from `SnapshotContractSpec` were byte-identical to those written at `29347b7` (`diff -r`). `sbt genOpenApi` and `npm run gen:api` left `frontend/src/protocol/generated/` unchanged. `npm run typecheck` and `npm run lint` were clean. `npm run test:unit` passed 90 tests, `node --test` 17, and `npm run e2e` 112 of 112 in Chromium and Firefox, in 3.2 min.
- **Noise to ignore.** sbt prints `[error] WARNING: sun.misc.Unsafe::objectFieldOffset will be removed in a future release` from the forked JVM's stderr. It is not a failure.

## Decisions this plan takes that the spec does not settle

Each is implemented as written unless review changes it.

- **P1. `Seat` is a Scala 3 `enum` in `object Room`, after `Estimate`,** with the two round transitions on the type, `cleared` and `unconfirmed`, as `Estimate.unconfirmed` already is. Step 2b adds `case Facilitator` and one line to each match.
- **P2. `everyMemberHasVoted` becomes `complete(seats)`,** after the Terms' word. It fails closed: a present member with no seat counts as not voted, so a missed seat holds the round open instead of revealing it, since in production only convention keeps the invariant (`RoomData.of` builds only `RoomData.empty`, and transitions use `copy`). Its match on `Seat` is exhaustive, so `-Werror` makes 2b decide what `Facilitator` means here, beside 2b's own "at least one present voter" clause. Its "insurance rather than a live case" comment stays, since 2b is what makes that clause live.
- **P3. `withRound(round)` becomes `withState(round, seats)`.** `vote` and `reVote` copy the round rather than build a new one, so a later per-round field survives them. `clear` takes `Round.fresh`, which is the spec's "`clear` replaces whole".
- **P4. The new invariant is two `require`s after the existing rules,** worded "the session for <name> (<id>) has no seat" and "the seat for <id> resolves to no session". They replace the rule "the estimate for <id> resolves to no session".
- **P5. The fixtures keep every public name.** `estimatesFor` becomes the private `seatsFor` (a seat per attendee, `Voter(None)` for a blank estimation). `withMemberlessSession` adds a `Voter(None)` seat, the state `registerSession` produces. `withEstimate` overwrites it with the attendee's own seat. `estimateFor` throws on a missing seat, so its existing callers also assert that the seat exists, and Task 1's "clear" case can tell a cleared seat from a deleted one (Task 2, Step 7, row 9). The one new public fixture is `stateFor(users*)`, for the cases that call `RoomData.of` by hand. `SnapshotContractSpec`, `RoomSnapshotSpec` and `RoomManagerSpec` need no edit.
- **P6. Each hand-built `RoomData.of` case gains `state = stateFor(...)`,** so a refusal case trips only the rule it names and not the new seat rule.
- **P7. A case and an assertion beyond the spec's list.** "leave the round hidden when a rejoin leaves everyone present voted" pins decision 1's "a join never sets it": a latching `connect` passed every existing case. The seat assertion added to "mint a session and store it on RequestSession" pins "a seat is created in `registerSession`": transitions use `copy`, not `of`, so a seatless `registerSession` passed every other case.
- **P8. The order is a `test` commit then a `refactor` commit,** each subject ending "(ui refresh step 2a)", as step 1's ended "(ui refresh step 1)". This plan lands first as a `docs` commit. The last commit sets the spec's status line.

## Global Constraints

- No em dash anywhere: code, comments, docs and commit messages.
- Code comments are one or two lines, never more.
- Conventional Commits, and no generated-with or co-authored-by attribution line.
- Scala formatting is scalafmt's: run `sbt scalafmtAll` before each commit, and `sbt styleCheck` must pass.
- The build has `-Werror`: any new compiler warning fails the build.
- Cite symbols, not line numbers, in comments and commit messages.
- Must not change: anything under `e2e/`, `frontend/`, `test/` or `testkit/`; `SnapshotContractSpec.scala`; `RoomSnapshotSpec.scala`; `RoomManagerSpec.scala`; `API.scala`, `Endpoints.scala` and `Requests.scala`. The two code commits touch exactly four files: `Room.scala`, `RoomSnapshot.scala`, `RoomDataFixtures.scala` and `RoomSpec.scala`. Task 3 edits only the spec's status line.
- Do not push or merge: 2a, 2b and 2c are stacked and merge in one window (spec, "Branches and commits"), and every merge to `main` restarts the server and ends every live room.

## Review Focus

The inputs most likely to bite a person, most likely first. The spec's list names three; this plan adds the second and fifth (P7).

1. **A reload mid-round.** Expected: the reloader's vote survives, since a reload's join resolves the cookie and runs `rename`. Pinned by Task 1's "keep the vote through a rejoin that resolves the existing session".
2. **A rejoin that makes everyone present voted.** Expected: the round stays hidden until someone votes or presses Show (decision 1). Pinned by Task 1's "leave the round hidden when a rejoin leaves everyone present voted".
3. **The last unvoted participant closing the tab or sleeping the laptop.** Expected: the round stays hidden, by the beacon and at grace expiry alike. Pinned by Task 1's two "departure" cases.
4. **A voter who left before Clear or Re-vote, then comes back.** Expected: after Clear they return with no estimate. After Re-vote their old value returns unconfirmed and must be confirmed again. Pinned by Task 1's "clear the estimate..." and "unconfirm on a re-vote..." cases.
5. **A tab that mints a session and closes before its stream opens.** Expected: it holds a seat but is not present, so it never holds up completion. Pinned by the seat assertion Task 2 adds to "mint a session and store it on RequestSession", with the existing "not create a member on a join, whatever the name".

---

### Before Task 1: check the plan is committed

Already done: `29347b7` committed this plan, and its review edits are committed after it. Check that `git status --short` prints nothing before starting.

### Task 1: Pin the round transitions the refactor must keep

**Files:**
- Modify: `src/test/scala/com/lunatech/pointingpoker/actors/RoomSpec.scala`

**Interfaces:**
- Consumes: the fixtures `withUsers`, `withMemberlessSession`, `withEstimate`, `withRevealed` and `estimateFor(user): Option[(String, Boolean)]` from `RoomDataFixtures`; `createUser`, `createRoom` and `expectSnapshot` from `object RoomSpec`; the commands `Room.RequestSession`, `Room.Depart`, `Room.Leave`, `Room.Join` (through `Attendee.joinMessage`), `Room.ClearVotes`, `Room.ReVote` and `Room.GetData`.
- Produces: six cases that Task 2 must keep green. No new helper.

These cases pin today's behaviour, so they pass at once. Their failing step is Step 3: each one must fail against a deliberately broken transition.

- [ ] **Step 1: Capture today's contract files**

Task 3 compares against these, so take them before any code changes.

```bash
sbt -batch "testOnly com.lunatech.pointingpoker.actors.SnapshotContractSpec"
rm -rf "${TMPDIR:-/tmp}/contract-before" && cp -r target/contract "${TMPDIR:-/tmp}/contract-before"
ls "${TMPDIR:-/tmp}/contract-before" | wc -l
```

Expected: `8`.

- [ ] **Step 2: Add the six cases**

In `RoomSpec.scala`, insert this block right after the case "keep a reconnecting user's vote instead of resetting it" (whose last line is `data.connections(user.id) mustBe Map(user.connectionId -> newRefProbe.ref)`) and before "build a RoomData when every member has a matching session". Leave one blank line on each side.

```scala
    "keep the vote through a rejoin that resolves the existing session" in {
      val (user, _)    = createUser(UUID.randomUUID(), "user1", true, "5")
      val replyProbe   = testKit.createTestProbe[Room.SessionMinted]()
      val dataProbe    = testKit.createTestProbe[Room.DataStatus]()
      val (_, roomRef) = createRoom(aSlug(), withUsers(user))

      // A reload's join: the cookie resolves the session, so rename runs under the same name.
      roomRef ! Room.RequestSession(user.name, Some(user.token), replyProbe.ref)
      replyProbe.expectMessage(Room.SessionMinted(user.id, user.token))
      roomRef ! Room.GetData(dataProbe.ref)

      dataProbe.expectMessageType[Room.DataStatus].data.estimateFor(user) mustBe Some(("5", true))
    }

    "leave the round hidden when a departure by the beacon leaves everyone present voted" in {
      val (user, userProbe) = createUser(UUID.randomUUID(), "user1", true, "3")
      val (user2, _)        = createUser(UUID.randomUUID(), "user2", false, "")
      val dataProbe         = testKit.createTestProbe[Room.DataStatus]()
      val (_, roomRef)      = createRoom(aSlug(), withUsers(user, user2))

      roomRef ! Room.Depart(user2.token, user2.connectionId, TestInbox[Room.CommandResult]().ref)
      roomRef ! Room.GetData(dataProbe.ref)

      // A departure changes presence, which is no deliberate act, so it never reveals.
      val snapshot = expectSnapshot(userProbe)
      snapshot.users.map(_.id) mustBe List(user.id)
      snapshot.votesRevealed mustBe false
      dataProbe.expectMessageType[Room.DataStatus].data.state.round.revealed mustBe false
    }

    "leave the round hidden when a departure at grace expiry leaves everyone present voted" in {
      val (user, userProbe) = createUser(UUID.randomUUID(), "user1", true, "3")
      val (user2, _)        = createUser(UUID.randomUUID(), "user2", false, "")
      val dataProbe         = testKit.createTestProbe[Room.DataStatus]()
      val (_, roomRef)      = createRoom(aSlug(), withUsers(user, user2), gracePeriod = 50.millis)

      roomRef ! Room.Leave(user2.id, user2.ref)

      // ConfirmLeave's publish, one grace period later.
      val snapshot = expectSnapshot(userProbe)
      snapshot.users.map(_.id) mustBe List(user.id)
      snapshot.votesRevealed mustBe false
      roomRef ! Room.GetData(dataProbe.ref)
      dataProbe.expectMessageType[Room.DataStatus].data.state.round.revealed mustBe false
    }

    "leave the round hidden when a rejoin leaves everyone present voted" in {
      val (user, userProbe) = createUser(UUID.randomUUID(), "user1", true, "3")
      val (departed, _)     = createUser(UUID.randomUUID(), "user2", true, "8")
      val dataProbe         = testKit.createTestProbe[Room.DataStatus]()
      // The state a departure leaves: everyone present has voted, and the round is hidden.
      val (_, roomRef) = createRoom(
        aSlug(),
        withUsers(user).withMemberlessSession(departed).withEstimate(departed)
      )

      roomRef ! departed.joinMessage
      roomRef ! Room.GetData(dataProbe.ref)

      // A join changes presence too, so it never reveals either.
      val snapshot = expectSnapshot(userProbe)
      snapshot.users.map(_.id).toSet mustBe Set(user.id, departed.id)
      snapshot.votesRevealed mustBe false
      dataProbe.expectMessageType[Room.DataStatus].data.state.round.revealed mustBe false
    }

    "clear the estimate of an identity who is not present" in {
      val (user, _)     = createUser(UUID.randomUUID(), "user1", true, "3")
      val (departed, _) = createUser(UUID.randomUUID(), "user2", true, "8")
      val dataProbe     = testKit.createTestProbe[Room.DataStatus]()
      val (_, roomRef)  = createRoom(
        aSlug(),
        withUsers(user).withMemberlessSession(departed).withEstimate(departed).withRevealed()
      )

      roomRef ! Room.ClearVotes(user.token, TestInbox[Room.CommandResult]().ref)
      roomRef ! Room.GetData(dataProbe.ref)

      // Otherwise a rejoin would bring the last round's estimate into the new one.
      dataProbe.expectMessageType[Room.DataStatus].data.estimateFor(departed) mustBe None
    }

    "unconfirm on a re-vote the estimate of an identity who is not present" in {
      val (user, _)     = createUser(UUID.randomUUID(), "user1", true, "3")
      val (departed, _) = createUser(UUID.randomUUID(), "user2", true, "8")
      val dataProbe     = testKit.createTestProbe[Room.DataStatus]()
      val (_, roomRef)  = createRoom(
        aSlug(),
        withUsers(user).withMemberlessSession(departed).withEstimate(departed).withRevealed()
      )

      roomRef ! Room.ReVote(user.token, TestInbox[Room.CommandResult]().ref)
      roomRef ! Room.GetData(dataProbe.ref)

      // Otherwise a rejoin would count the previous round's confirmation as a vote in this one.
      dataProbe.expectMessageType[Room.DataStatus].data.estimateFor(departed) mustBe Some(
        ("8", false)
      )
    }
```

Run: `sbt -batch scalafmtCheckAll "testOnly com.lunatech.pointingpoker.actors.*"`

Expected: `Tests: succeeded 126, failed 0` and no formatting error.

- [ ] **Step 3: Show each case fails against a broken transition**

Apply each mutation below to `src/main/scala/com/lunatech/pointingpoker/actors/Room.scala` on its own, run `sbt -batch "testOnly com.lunatech.pointingpoker.actors.*"`, check the failures are exactly the ones listed, then restore the file with `git checkout src/main/scala/com/lunatech/pointingpoker/actors/Room.scala` before the next one. The mutations need not be formatted.

| # | Mutation | Must fail, and nothing else |
| --- | --- | --- |
| 1 | In `removeMember`, replace `this.copy(members = this.members - userId)` with the block below (a departure re-checks completion) | both "departure" cases |
| 2 | In `rename`, add `state = this.state.copy(round = this.state.round.copy(estimates = this.state.round.estimates - userId))` as a third argument to `this.copy(...)` | "keep the vote through a rejoin that resolves the existing session" |
| 3 | Replace `def clear(): RoomData  = withRound(Round.fresh)` with `def clear(): RoomData  = withRound(Round(this.state.round.estimates.filter((id, _) => !isMember(id)), revealed = false))` | "clear the estimate of an identity who is not present" |
| 4 | In `reVote`, replace `this.state.round.estimates.view.mapValues(_.unconfirmed).toMap` with `this.state.round.estimates.map((id, e) => id -> (if isMember(id) then e.unconfirmed else e))` | "unconfirm on a re-vote the estimate of an identity who is not present" |
| 5 | In `connect`, append `.latched` to the closing `)` of its `this.copy(...)`, and add the method below after `connect` (a join re-checks completion) | "leave the round hidden when a rejoin leaves everyone present voted" |

Mutation 1:

```scala
      val next = this.copy(members = this.members - userId)
      next.withRound(
        next.state.round.copy(revealed =
          next.state.round.revealed || next.everyMemberHasVoted(next.state.round.estimates)
        )
      )
```

Mutation 5's method:

```scala
    private def latched: RoomData =
      withRound(state.round.copy(revealed = state.round.revealed || everyMemberHasVoted(state.round.estimates)))
```

Both keep `revealed ||`, so a mutation can never un-reveal a round and fail some other case by accident.

Expected after the last restore: `git status --short` lists only `RoomSpec.scala`.

- [ ] **Step 4: Commit**

```bash
git add src/test/scala/com/lunatech/pointingpoker/actors/RoomSpec.scala
git commit -m "test: pin the round transitions the seat refactor must keep (ui refresh step 2a)" -m "A departure or a join that leaves everyone present voted keeps the round hidden, a rejoin through rename keeps the vote, and clear and reVote reach identities who are not present. Each case fails against a transition broken to match, and no existing case caught any of the five."
```

### Task 2: Hold each identity's estimate in a seat

**Files:**
- Modify: `src/main/scala/com/lunatech/pointingpoker/actors/Room.scala`
- Modify: `src/main/scala/com/lunatech/pointingpoker/actors/RoomSnapshot.scala`
- Modify: `src/test/scala/com/lunatech/pointingpoker/actors/RoomDataFixtures.scala`
- Modify: `src/test/scala/com/lunatech/pointingpoker/actors/RoomSpec.scala`

**Interfaces:**
- Consumes: Task 1's six cases, unchanged.
- Produces, for steps 2b and 2c:
  - `enum Room.Seat { case Voter(estimate: Option[Estimate]) }`, with `def cleared: Seat` and `def unconfirmed: Seat`;
  - `final case class Room.Round(revealed: Boolean)`, with `Round.fresh == Round(revealed = false)`;
  - `final case class Room.RoomState(currentIssue: String, round: Round, seats: Map[UUID, Seat])`, with `RoomState.empty == RoomState("", Round.fresh, Map.empty)`;
  - in `RoomData`, the private `complete(seats: Map[UUID, Seat]): Boolean` and `withState(round: Round, seats: Map[UUID, Seat]): RoomData`;
  - the fixture `RoomDataFixtures.stateFor(users: Attendee*): Room.RoomState`.

- [ ] **Step 1: Write the seat assertion and the two invariant cases**

These fail at first because `Room.Seat`, `RoomState.seats` and `stateFor` do not exist yet.

In `RoomSpec.scala`, at the end of the case "mint a session and store it on RequestSession", replace:

```scala
      // Invariant 5: only ConnectToRoom creates a member, or everyMemberHasVoted is
      // unsatisfiable for a member who never connects and never votes.
      data.data.members mustBe empty
    }
```

with:

```scala
      // Invariant 5: only ConnectToRoom creates a member, or completion is
      // unsatisfiable for a member who never connects and never votes.
      data.data.members mustBe empty
      // Transitions use copy, not of, so only this case sees a session minted without a seat.
      data.data.state.seats mustBe Map(minted.userId -> Room.Seat.Voter(None))
    }
```

Replace the whole case "refuse a RoomData whose estimate resolves to no session":

```scala
    "refuse a RoomData whose estimate resolves to no session" in {
      val (user, _) = createUser(UUID.randomUUID(), "user1", false, "")
      val stranger  = UUID.randomUUID()
      val state     = Room.RoomState("", Room.Round(Map(stranger -> Room.Estimate.of("5")), false))

      val thrown = intercept[IllegalArgumentException] {
        RoomData.of(
          state = state,
          members = Map(user.id -> Room.Member(user.name)),
          sessions = Map(user.token -> Room.Session(user.id, user.name))
        )
      }

      thrown.getMessage must include("resolves to no session")
    }
```

with these two cases:

```scala
    "refuse a RoomData whose seat resolves to no session" in {
      val (user, _)     = createUser(UUID.randomUUID(), "user1", false, "")
      val (stranger, _) = createUser(UUID.randomUUID(), "user2", true, "5")

      val thrown = intercept[IllegalArgumentException] {
        RoomData.of(
          state = stateFor(user, stranger),
          members = Map(user.id -> Room.Member(user.name)),
          sessions = Map(user.token -> Room.Session(user.id, user.name))
        )
      }

      thrown.getMessage must include(s"the seat for ${stranger.id} resolves to no session")
    }

    "refuse a RoomData whose session has no seat" in {
      val (user, _)     = createUser(UUID.randomUUID(), "user1", false, "")
      val (unseated, _) = createUser(UUID.randomUUID(), "user2", false, "")

      // Retention keeps a departed identity's session, so its seat must outlive membership too.
      val thrown = intercept[IllegalArgumentException] {
        RoomData.of(
          state = stateFor(user),
          members = Map(user.id -> Room.Member(user.name)),
          sessions = Map(
            user.token     -> Room.Session(user.id, user.name),
            unseated.token -> Room.Session(unseated.id, unseated.name)
          )
        )
      }

      thrown.getMessage must include(s"the session for user2 (${unseated.id}) has no seat")
    }
```

- [ ] **Step 2: Run them to see the compile fail**

Run: `sbt -batch "Test/compile"`

Expected: FAIL to compile, with `value seats is not a member of com.lunatech.pointingpoker.actors.Room.RoomState` in the mint case and `Not found: stateFor` in each of the two refusal cases. `Seat` is not reported, since it sits inside the expression that already failed.

- [ ] **Step 3: Add the seat to the model**

In `Room.scala`, replace:

```scala
  final case class Round(estimates: Map[UUID, Estimate], revealed: Boolean)

  object Round:
    val fresh: Round = Round(Map.empty[UUID, Estimate], revealed = false)

  final case class RoomState(currentIssue: String, round: Round)

  object RoomState:
    val empty: RoomState = RoomState("", Round.fresh)
```

with:

```scala
  // A role plus that role's state: the role outlives the round, the estimate does not.
  enum Seat:
    case Voter(estimate: Option[Estimate])

    def cleared: Seat = this match
      case Voter(_) => Voter(None)

    def unconfirmed: Seat = this match
      case Voter(estimate) => Voter(estimate.map(_.unconfirmed))
  end Seat

  // Only what clear replaces whole, so fresh stays a constant.
  final case class Round(revealed: Boolean)

  object Round:
    val fresh: Round = Round(revealed = false)

  final case class RoomState(currentIssue: String, round: Round, seats: Map[UUID, Seat])

  object RoomState:
    val empty: RoomState = RoomState("", Round.fresh, Map.empty)
```

In `removeMember`, replace the comment:

```scala
      // Estimates are keyed by id and survive a departure; only clear or the round ends one.
```

with:

```scala
      // Seats are keyed by id and survive a departure; only clear ends an estimate.
```

Replace `registerSession`:

```scala
    private[Room] def registerSession(token: SessionToken, userId: UUID, name: String): RoomData =
      this.copy(sessions = this.sessions + (token -> Session(userId, name)))
```

with:

```scala
    private[Room] def registerSession(token: SessionToken, userId: UUID, name: String): RoomData =
      // The only place a session is created, so the only place a seat is.
      this.copy(
        sessions = this.sessions + (token -> Session(userId, name)),
        state = this.state.copy(seats = this.state.seats + (userId -> Seat.Voter(None)))
      )
```

In `vote`, replace the `else` branch and the three transitions after it:

```scala
      else
        val estimates = this.state.round.estimates + (userId -> Estimate.of(estimation))
        (withRound(Round(estimates, everyMemberHasVoted(estimates))), Applied)

    def show(): RoomData   = withRound(this.state.round.copy(revealed = true))
    def clear(): RoomData  = withRound(Round.fresh)
    def reVote(): RoomData =
      withRound(
        Round(this.state.round.estimates.view.mapValues(_.unconfirmed).toMap, revealed = false)
      )
```

with:

```scala
      else
        val seats = this.state.seats + (userId -> Seat.Voter(Some(Estimate.of(estimation))))
        (withState(this.state.round.copy(revealed = complete(seats)), seats), Applied)

    def show(): RoomData  = withState(this.state.round.copy(revealed = true), this.state.seats)
    def clear(): RoomData = withState(Round.fresh, this.state.seats.view.mapValues(_.cleared).toMap)
    def reVote(): RoomData =
      withState(
        this.state.round.copy(revealed = false),
        this.state.seats.view.mapValues(_.unconfirmed).toMap
      )
```

Replace the two private helpers at the end of `RoomData`:

```scala
    private def withRound(round: Round): RoomData =
      this.copy(state = this.state.copy(round = round))

    private def everyMemberHasVoted(estimates: Map[UUID, Estimate]): Boolean =
      // nonEmpty is insurance rather than a live case: only a Vote ever runs this.
      this.members.nonEmpty && this.members.keys.forall(id => estimates.get(id).exists(_.confirmed))
```

with:

```scala
    private def withState(round: Round, seats: Map[UUID, Seat]): RoomData =
      this.copy(state = this.state.copy(round = round, seats = seats))

    private def complete(seats: Map[UUID, Seat]): Boolean =
      // nonEmpty is insurance rather than a live case: only a Vote ever runs this.
      // A member with no seat breaks an invariant, so it holds the round open.
      this.members.nonEmpty && this.members.keys.forall(id =>
        seats.get(id).exists { case Seat.Voter(estimate) => estimate.exists(_.confirmed) }
      )
```

In `RoomData.of`, replace the comment line:

```scala
      // a connection or an estimate outliving its member is a state this design requires.
```

with:

```scala
      // a connection or a seat outliving its member is a state this design requires.
```

and replace the estimate rule:

```scala
      state.round.estimates.keys.foreach(id =>
        require(identities.contains(id), s"the estimate for $id resolves to no session")
      )
```

with:

```scala
      identities.foreach((id, session) =>
        require(state.seats.contains(id), s"the session for ${session.name} ($id) has no seat")
      )
      state.seats.keys.foreach(id =>
        require(identities.contains(id), s"the seat for $id resolves to no session")
      )
```

- [ ] **Step 4: Read the estimate from the seat in the snapshot**

In `RoomSnapshot.scala`, in `of`, replace:

```scala
      // The join: a participant appears because they are one, their estimate comes from
      // the round, and an estimate belonging to nobody present reaches nobody.
```

with:

```scala
      // The join: a participant appears because they are one, their estimate comes from
      // their seat, and an estimate belonging to nobody present reaches nobody.
```

and replace:

```scala
          val disclose = round.revealed || id == forUser
          Participant(id, member.name, Estimation.of(round.estimates.get(id), disclose))
```

with:

```scala
          val disclose = round.revealed || id == forUser
          val estimate = data.state.seats.get(id).flatMap { case Room.Seat.Voter(e) => e }
          Participant(id, member.name, Estimation.of(estimate, disclose))
```

Run: `sbt -batch compile`

Expected: `[success]`, with no warning (the build has `-Werror`).

- [ ] **Step 5: Port the fixtures**

In `RoomDataFixtures.scala`, in `withUsers`, replace:

```scala
      state = Room.RoomState("", Room.Round(estimatesFor(users*), revealed = false)),
```

with:

```scala
      state = stateFor(users*),
```

Replace `withMemberlessSession` and the head of `withEstimate`:

```scala
    def withMemberlessSession(users: Attendee*): RoomData =
      RoomData.of(data.state, data.members, data.sessions ++ sessionsFor(users*), data.connections)

    def withEstimate(user: Attendee): RoomData =
      RoomData.of(
        withRound(data, r => r.copy(estimates = r.estimates ++ estimatesFor(user))),
```

with:

```scala
    def withMemberlessSession(users: Attendee*): RoomData =
      RoomData.of(
        withSeats(data, _ ++ users.map(_.id -> Room.Seat.Voter(None))),
        data.members,
        data.sessions ++ sessionsFor(users*),
        data.connections
      )

    def withEstimate(user: Attendee): RoomData =
      RoomData.of(
        withSeats(data, _ ++ seatsFor(user)),
```

Replace `estimateFor`:

```scala
    def estimateFor(user: Attendee): Option[(String, Boolean)] =
      data.state.round.estimates.get(user.id).map(e => (e.value, e.confirmed))
```

with:

```scala
    // Throws on a missing seat, so a transition that deletes one never reads as "no estimate".
    def estimateFor(user: Attendee): Option[(String, Boolean)] =
      data.state.seats(user.id) match
        case Room.Seat.Voter(estimate) => estimate.map(e => (e.value, e.confirmed))
```

Replace the private `withRound` helper:

```scala
  private def withRound(data: RoomData, f: Room.Round => Room.Round): Room.RoomState =
    data.state.copy(round = f(data.state.round))
```

with:

```scala
  // A seat per user and a fresh round, for withUsers and the cases that build a RoomData by hand.
  def stateFor(users: Attendee*): Room.RoomState =
    Room.RoomState("", Room.Round.fresh, seatsFor(users*))

  private def withRound(data: RoomData, f: Room.Round => Room.Round): Room.RoomState =
    data.state.copy(round = f(data.state.round))

  private def withSeats(
      data: RoomData,
      f: Map[UUID, Room.Seat] => Map[UUID, Room.Seat]
  ): Room.RoomState =
    data.state.copy(seats = f(data.state.seats))
```

Replace `estimatesFor`:

```scala
  private def estimatesFor(users: Attendee*): Map[UUID, Room.Estimate] =
    // A blank estimation is no entry at all, but voting for one is an illegal state
    // the fixture refuses rather than quietly rewrites into a non-voter.
    users.foreach(u =>
      require(!(u.voted && u.estimation.isBlank), s"${u.name} voted with no estimation")
    )
    users
      .filterNot(_.estimation.isBlank)
      .map(u => u.id -> Room.Estimate.of(u.estimation, u.voted))
      .toMap
  end estimatesFor
```

with:

```scala
  private def seatsFor(users: Attendee*): Map[UUID, Room.Seat] =
    // A blank estimation is a seat with no estimate, but voting for one is an illegal state
    // the fixture refuses rather than quietly rewrites into a non-voter.
    users.foreach(u =>
      require(!(u.voted && u.estimation.isBlank), s"${u.name} voted with no estimation")
    )
    users
      .map(u =>
        u.id -> Room.Seat.Voter(
          Option.unless(u.estimation.isBlank)(Room.Estimate.of(u.estimation, u.voted))
        )
      )
      .toMap
  end seatsFor
```

- [ ] **Step 6: Port the RoomSpec cases that read the old shape**

In "keep a reconnecting user's vote instead of resetting it", replace:

```scala
      // A reconnect Joins the same identity and connection id under a new ref; the estimate
      // is keyed by id in the round, so the rejoin never touches it.
```

with:

```scala
      // A reconnect Joins the same identity and connection id under a new ref; the estimate
      // is in a seat keyed by id, so the rejoin never touches it.
```

In "build a RoomData when every member has a matching session", replace:

```scala
      val data = RoomData.of(members = members, sessions = sessions)

      data.members mustBe members
      data.sessions mustBe sessions
      data.state mustBe Room.RoomState.empty
```

with:

```scala
      val data = RoomData.of(state = stateFor(user, user2), members = members, sessions = sessions)

      data.members mustBe members
      data.sessions mustBe sessions
      data.state mustBe stateFor(user, user2)
```

In "refuse a RoomData whose member's session disagrees on the name alone", add `state = stateFor(user),` as the first argument of `RoomData.of(`:

```scala
        RoomData.of(
          state = stateFor(user),
          members = Map(user.id -> Room.Member(user.name)),
          sessions = Map(user.token -> Room.Session(user.id, "someone else"))
        )
```

In "allow a session that has no member, which is what retention produces", replace:

```scala
      val data = RoomData.of(members = Map(user.id -> Room.Member(user.name)), sessions = sessions)
```

with:

```scala
      val data = RoomData.of(
        state = stateFor(user, departed),
        members = Map(user.id -> Room.Member(user.name)),
        sessions = sessions
      )
```

In "refuse a blank estimation rather than storing one", replace:

```scala
      data.state.round.estimates mustBe empty
```

with:

```scala
      List(user, user2).map(data.estimateFor) mustBe List(None, None)
```

In "refuse a RoomData whose connection resolves to no session", add `state = stateFor(user),` as the first argument of `RoomData.of(`:

```scala
        RoomData.of(
          state = stateFor(user),
          sessions = Map(user.token -> Room.Session(user.id, user.name)),
          connections = Map(stranger -> Map(newConnectionId() -> user.ref))
        )
```

Then check nothing still names the old shape:

```bash
git grep -n -E "everyMemberHasVoted|\.estimates\b|estimatesFor|withRound\(Round" -- src
```

Expected: no output.

Run: `sbt -batch scalafmtAll "testOnly com.lunatech.pointingpoker.actors.*"`

Expected: `Tests: succeeded 127, failed 0`.

- [ ] **Step 7: Show each case fails against a broken transition**

`Room.scala` now holds uncommitted work, so save it once before the first mutation:

```bash
cp src/main/scala/com/lunatech/pointingpoker/actors/Room.scala "${TMPDIR:-/tmp}/Room.scala.good"
```

Then, as in Task 1, Step 3, apply each mutation on its own and run `sbt -batch "testOnly com.lunatech.pointingpoker.actors.*"`. Check the failures are exactly the ones listed, then restore with `cp "${TMPDIR:-/tmp}/Room.scala.good" src/main/scala/com/lunatech/pointingpoker/actors/Room.scala` before the next one.

| # | Mutation | Must fail, and nothing else |
| --- | --- | --- |
| 1 | In `removeMember`, replace `this.copy(members = this.members - userId)` with the block below | both "departure" cases |
| 2 | In `rename`, add `state = this.state.copy(seats = this.state.seats + (userId -> Seat.Voter(None)))` as a third argument to `this.copy(...)` | "keep the vote through a rejoin that resolves the existing session" |
| 3 | In `clear`, replace `this.state.seats.view.mapValues(_.cleared).toMap` with `this.state.seats.map((id, s) => id -> (if isMember(id) then s.cleared else s))` | "clear the estimate of an identity who is not present" |
| 4 | In `reVote`, replace `this.state.seats.view.mapValues(_.unconfirmed).toMap` with `this.state.seats.map((id, s) => id -> (if isMember(id) then s.unconfirmed else s))` | "unconfirm on a re-vote the estimate of an identity who is not present" |
| 5 | In `RoomData.of`, replace the `require(state.seats.contains(id), ...)` call with `()` | "refuse a RoomData whose session has no seat" |
| 6 | In `RoomData.of`, replace the `require(identities.contains(id), s"the seat for $id ...")` call with `()` | "refuse a RoomData whose seat resolves to no session" |
| 7 | In `registerSession`, delete the `state = ...` argument and the comma before it | "mint a session and store it on RequestSession" |
| 8 | In `connect`, append `.latched` to the closing `)` of its `this.copy(...)`, and add the method below after `connect` | "leave the round hidden when a rejoin leaves everyone present voted" |
| 9 | In `clear`, replace `this.state.seats.view.mapValues(_.cleared).toMap` with `this.state.seats.filter((id, _) => isMember(id)).view.mapValues(_.cleared).toMap` (a clear that deletes the seats of those not present) | "clear the estimate of an identity who is not present" |

Mutation 1:

```scala
      val next = this.copy(members = this.members - userId)
      next.withState(
        next.state.round.copy(revealed = next.state.round.revealed || next.complete(next.state.seats)),
        next.state.seats
      )
```

Mutation 8's method:

```scala
    private def latched: RoomData =
      withState(state.round.copy(revealed = state.round.revealed || complete(state.seats)), state.seats)
```

Expected after the last restore: `sbt -batch "testOnly com.lunatech.pointingpoker.actors.*"` gives `Tests: succeeded 127, failed 0` again.

- [ ] **Step 8: Commit**

```bash
git add src/main/scala/com/lunatech/pointingpoker/actors/Room.scala src/main/scala/com/lunatech/pointingpoker/actors/RoomSnapshot.scala src/test/scala/com/lunatech/pointingpoker/actors/RoomDataFixtures.scala src/test/scala/com/lunatech/pointingpoker/actors/RoomSpec.scala
git commit -m "refactor: hold each identity's estimate in a seat that outlives the round (ui refresh step 2a)" -m "RoomState holds seats beside a Round that keeps only revealed, so step 2b can add a facilitator's seat. RoomData.of now requires a seat for every session and a session for every seat, replacing the rule that every estimate resolves to a session. The wire is unchanged."
```

### Task 3: Prove nothing visible changed, and mark the step landed

**Files:**
- Modify: `docs/superpowers/specs/2026-10-04-ui-refresh-2-roles-design.md` (the `Status:` line only)

**Interfaces:**
- Consumes: Task 1, Step 1's `contract-before` copy, and both earlier commits.
- Produces: no code.

- [ ] **Step 1: Run the server checks**

```bash
sbt -batch qa styleCheck
diff -r "${TMPDIR:-/tmp}/contract-before" target/contract && echo CONTRACT-IDENTICAL
```

If `contract-before` is missing (another session, or a reboot), rebuild it from the commit before Task 1 first, then run the `diff` again:

```bash
git worktree add "${TMPDIR:-/tmp}/wt-before" HEAD~2
(cd "${TMPDIR:-/tmp}/wt-before" && sbt -batch "testOnly com.lunatech.pointingpoker.actors.SnapshotContractSpec")
rm -rf "${TMPDIR:-/tmp}/contract-before" && cp -r "${TMPDIR:-/tmp}/wt-before/target/contract" "${TMPDIR:-/tmp}/contract-before"
git worktree remove --force "${TMPDIR:-/tmp}/wt-before"
```

Expected: `Tests: succeeded 227, failed 0`, then `CONTRACT-IDENTICAL`. A diff here means the wire changed: stop and find out why, do not regenerate.

- [ ] **Step 2: Check the generated API is unchanged**

```bash
sbt -batch genOpenApi
npm run gen:api
git diff --exit-code frontend/src/protocol/generated/ && echo OPENAPI-UNCHANGED
```

Expected: `OPENAPI-UNCHANGED`.

- [ ] **Step 3: Run the frontend and e2e suites**

```bash
npm run typecheck && npm run lint
npm run test:unit
npm test
npm run e2e
```

Expected: typecheck and lint clean; `Tests  90 passed (90)`; `ℹ pass 17` and `ℹ fail 0`; `112 passed`. `npm run test:unit` reads `target/contract/` from Step 1's `sbt qa`, so run it after that.

- [ ] **Step 4: Check the step touched only its four files**

```bash
git diff --stat HEAD~2 HEAD
```

Expected: exactly `Room.scala`, `RoomSnapshot.scala`, `RoomDataFixtures.scala` and `RoomSpec.scala`.

- [ ] **Step 5: Mark step 2a landed in the spec**

In `docs/superpowers/specs/2026-10-04-ui-refresh-2-roles-design.md`, replace:

```
Status: Validated, not yet implemented
```

with:

```
Status: Validated. Step 2a landed; steps 2b and 2c not yet implemented
```

```bash
git add docs/superpowers/specs/2026-10-04-ui-refresh-2-roles-design.md
git commit -m "docs: mark ui refresh step 2a landed"
```
