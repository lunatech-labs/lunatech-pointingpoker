# UI Refresh Step 2b: Roles on the Server and the Wire Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give each identity a role on the server and the wire: a facilitator's seat holds no estimate and is left out of completion, `/join` states a role, `POST /role` switches it, and a facilitator's vote is refused, while the page looks exactly as it does today.

**Architecture:** `Room.Seat` gains `Facilitator`, and one switch rule, "the same role changes nothing, another role starts that role's fresh seat", serves both a join and `/role`. Completion follows the spec's Terms, and one private latch step, run only by an applied vote and by a `/role` that changes a seat, is the only place a round reveals itself. The snapshot carries each participant's seat as a tagged union, and the requests carry `role`. The page parses the new shape and always joins as a voter.

**Tech Stack:** Scala 3, Pekko Typed 1.7 (`ActorTestKit`, `BehaviorTestKit`), tapir 1.13 with circe, ScalaTest `AnyWordSpec` with `must.Matchers`, scalafmt, sbt-scoverage. TypeScript with zod 4 and openapi-fetch, vitest, Playwright (Chromium and Firefox).

**Spec:** `docs/superpowers/specs/2026-10-04-ui-refresh-2-roles-design.md`: Terms, decisions 1 to 5, and "Step 2b. Roles on the server and the wire" (Server, Wire, States by events, Accepted races, Pass condition). Step 2c is out of scope.

## How the code in this plan was verified

Every patch below was applied and run in a scratch worktree on 2026-10-05, on this branch at `9ddae4c`, as three commits in task order, and run again after the plan's review changed Tasks 1 and 3:

- **Task 1's matrix bites before the transitions exist.** With the role surface added and no behaviour behind it (Task 1, Step 2), the actor suites ran 229 tests and failed exactly the 21 that Task 1, Step 5 lists.
- **Task 1 passes.** The actor suites passed 229 tests, and `sbt test` passed 329, up from 227: the 100 matrix cells and the two companion cases. The eight files in `target/contract/` were byte-identical to those written at `9ddae4c`, and `sbt genOpenApi` left `openapi.json` unchanged.
- **Task 1's "never reveals" cells bite on the new code.** Each of the eleven mutations in Task 1, Step 8 was applied alone and failed exactly the cases its row names, and nothing else.
- **Task 2 passes.** `sbt test` passed 331 and wrote nine contract files. `npm run test:unit` passed 93, `npm run typecheck` and `npm run lint` were clean, and `npm run e2e` passed 112 of 112. Each of the three mutations in Task 2, Step 9 failed exactly its row.
- **Task 3 passes.** `sbt test` passed 337. `npm run gen:api` changed only what Task 3, Step 5 describes. `npm test` passed 17, and 16 with `role` removed from the reproduction join. `npm run e2e` passed 112 of 112, in 3.3 min. Each of the five mutations in Task 3, Step 9 failed its row (see the note there).
- **Whole step.** `sbt qa styleCheck` passed 337 tests at 93.93% statement coverage, 90.38% branch.
- **The rerun after review** repeated Task 1's stub phase, suites and eleven mutations, and Task 3's checks and e2e. Task 2's code and tests did not change, so its e2e and mutations were not rerun.
- **Noise to ignore.** sbt prints `[error] WARNING: sun.misc.Unsafe::objectFieldOffset will be removed in a future release` and a `LazyVals` warning from the forked JVM's stderr. Neither is a failure.

## Decisions this plan takes that the spec does not settle

Each is implemented as written unless review changes it.

- **P1. Three code commits, each judged differently.** Task 1 (the room) is judged by the matrix while the wire stays byte-identical. Task 2 (the snapshot) is judged by the two contract specs. Task 3 (the requests) is judged by `APISpec`. In between, Task 1's `RoomSnapshot` reads a facilitator's seat as a voter with no estimation, and `API` joins every identity as a voter. Nothing on the wire can make a facilitator until Task 3, and Task 2 replaces that projection.
- **P2. `act` hands the acting user to its update.** Its parameter becomes `(RoomData, UUID) => RoomData`. The four existing call sites change from `_.clear()` to `(room, _) => room.clear()`, and `SwitchRole` is `act(token, replyTo)(_.switchRole(_, role))`. A `SwitchRole` case copying `act`'s ten lines was the alternative.
- **P3. The matrix is a table in `object RoomSpec`, run by one generated case per cell.** A is one identity and B a present voter. B has confirmed in every row except the open round's "B casts the last vote" and "B switches to facilitator", so a cell that completes the round reveals it, and a "never reveals" cell starts, from a confirmed A, in the complete but hidden state a departure leaves. A presses Show, Clear and Re-vote, which also pins "a facilitator keeps every control". Each cell asserts A's seat, the round's flag, the reply, and that B got a snapshot. Three of the spec's cells and rows are pinned outside the table:
  - B's switch completing the round beside a facilitator, by its own three-identity case;
  - grace expiry, which runs the same `removeMember` as the beacon row does for every seat, while "remove a user on leave and publish the smaller room" keeps a confirmed voter's seat at grace expiry and "leave the round hidden when a departure at grace expiry leaves everyone present voted" pins the timer's latch rule;
  - the server restart, by "create the seat from the join's role".
- **P4. `RoleWire`, in `Requests.scala`, holds the role's codecs.** `Room.scala` and the rest of `actors` import no tapir, so the role's `Schema` cannot sit on `Room.Role`. `RoleWire` holds an explicit tag table, a decoder that refuses any other string, and `Schema.derivedEnumeration`, which puts `Role` in the OpenAPI document as a string enum. The 400 needs no wiring: tapir answers any body decode failure with 400, as "reject malformed JSON on join endpoint with 400" pins. The snapshot's seat tags are separate literals, as the spec asks, each wire type keeping its own table as `Estimation` does.

## Consequences the spec or the code already settle

- **`Role` and the switch rule.** `Role` is an `enum` in `object Room`, beside `Seat`. `Seat.switchedTo(role)` is the spec's three switch cases as one rule: the same role returns the seat unchanged, another returns `Seat.of(role)`.
- **`complete` takes no argument and fails closed.** A present voter replaces `members.nonEmpty`, whose "insurance rather than a live case" comment goes, and a member with no seat counts as an unconfirmed voter, as 2a's P2 decided.
- **The latch step is the private `latched`.** Only `vote`'s applied branch and a seat-changing `switchRole` run it. `rename` switches through the same `switched` without it, and `switchRole` reads a missing seat as "no change" (`forall`).
- **`vote` matches the seat exhaustively.** `Some(Seat.Facilitator) | None` answers `NotAVoter` after the two existing refusals, so a third seat fails the build there too.
- **A member with no seat cannot occur by construction:** `registerSession` seats every session it creates, and no transition removes a seat (`RoomData.of` checks only the states built through it). If one did occur, it would fail closed: shown as a voter, holding the round open, refused a vote, and unchanged by `/role`.
- **The fixtures name a seat whole.** `withSeat(user, seat)` is new. `estimateFor` and a new `Participant` extension `estimation` throw on a facilitator, so `RoomSnapshotSpec`'s readers and the `voted`, `hasEstimation` and `shown` extensions are unchanged.
- **`RoomSnapshot.Seat` mirrors `Room.Seat`.** `tagged` moves up from `object Estimation` to `object RoomSnapshot` so both encoders share it. A member with no seat projects as `Voter(NoEstimation)`, the reading `complete` gives it.
- **`role` is `command("role").in(jsonBody[RoleRequest])`,** so its 401 and 403 are Show's and Clear's by construction. `NotAVoter` maps to 409 in `Endpoints.status` from Task 1, since that match is exhaustive. The second 409 variant leaves `openapi.json` unchanged.
- **`APISpec`'s stub records the join's role in an `AtomicReference`,** beside `commandReply` and `voteReply`, so the join cases leave nothing in `commandProbe` for a later `expectNoMessage` to trip on.
- **`api.ts` sends `role: 'Voter'` and gains nothing else.** `Connection.join` and the role line are 2c's, so no `switchRole` client function is written before its caller.
- **Commits.** This plan lands as `docs: plan ui refresh step 2b`. Then three `feat` commits, each subject ending "(ui refresh step 2b)", and `docs: mark ui refresh step 2b landed`, which sets the spec's status line.

## Global Constraints

- No em dash anywhere: code, comments, docs and commit messages.
- Code comments are one or two lines, never more.
- Conventional Commits, and no generated-with or co-authored-by attribution line.
- Scala formatting is scalafmt's: run `sbt scalafmtAll` before each commit, and `sbt styleCheck` must pass. TypeScript lines stay within 100 columns by hand; nothing formats them.
- The build has `-Werror`: any new compiler warning fails the build.
- Cite symbols, not line numbers, in comments and commit messages.
- The wire tags are the exact strings `Voter` and `Facilitator`, in the seat and in `role`.
- Must not change: anything under `e2e/`; `frontend/src/components/`; `frontend/src/room/connection.ts`; the protocol architecture spec (`2026-08-31-protocol-target-architecture-design.md`), which the roles spec extends without editing.
- Do not push or merge: 2a, 2b and 2c are stacked and merge in one window (spec, "Branches and commits"), and every merge to `main` restarts the server and ends every live room.

## Review Focus

The inputs most likely to bite a person, most likely first.

1. **A voter reloading mid-round.** Expected: the page's join sends `Voter`, the seat's own role, so the vote survives and the round stays as it was. Pinned by the matrix's "open round: A joins as a voter, from Voter(confirmed)" and 2a's "keep the vote through a rejoin that resolves the existing session".
2. **A tab loaded before the deploy, joining with no `role`.** Expected: `400`, and the page's "Could not join the room", fixed by a reload (spec, Accepted costs). Pinned by `APISpec`'s "answer 400 for a join with no role or another value, without asking the manager".
3. **The last waiting voter switching to facilitator, and a room left with only facilitators.** Expected: the first reveals the round; the second never does. Pinned by the matrix's "open round: B switches to facilitator through /role", from `Voter(confirmed)` and from `Facilitator`.
4. **A facilitator made through the API, as today's page sees them.** Expected: a row with no vote, which never holds up the reveal and never enters the tally. Pinned by `view.test.ts`'s "gives a facilitator's row no estimation, so the tally leaves them out" and the matrix's "open round: B casts the last vote, from Facilitator".
5. **A facilitator reloading today's page.** Expected: the page joins as `Voter`, so the seat becomes `Voter(None)` and the round does not reveal (decision 5: the server always applies the join's role). This is what 2b ships until 2c sends the remembered role. Pinned by the matrix's "open round: A joins as a voter, from Facilitator".

---

### Before Task 1: commit this plan

```bash
git add docs/superpowers/plans/2026-10-05-ui-refresh-2b-roles-wire.md
git commit -m "docs: plan ui refresh step 2b"
git status --short
```

Expected: `git status --short` prints nothing.

### Task 1: Hold a facilitator's seat in the room, outside completion

**Files:**
- Modify: `src/main/scala/com/lunatech/pointingpoker/actors/Room.scala`
- Modify: `src/main/scala/com/lunatech/pointingpoker/actors/RoomSnapshot.scala`
- Modify: `src/main/scala/com/lunatech/pointingpoker/actors/RoomManager.scala`
- Modify: `src/main/scala/com/lunatech/pointingpoker/API.scala`
- Modify: `src/main/scala/com/lunatech/pointingpoker/Endpoints.scala`
- Modify: `src/test/scala/com/lunatech/pointingpoker/actors/RoomDataFixtures.scala`
- Modify: `src/test/scala/com/lunatech/pointingpoker/actors/RoomSpec.scala`
- Modify: `src/test/scala/com/lunatech/pointingpoker/actors/RoomManagerSpec.scala`
- Modify: `src/test/scala/com/lunatech/pointingpoker/APISpec.scala`

**Interfaces:**
- Consumes: 2a's `Room.Seat`, `RoomState.seats`, the fixtures `withUsers`, `withRevealed`, `stateFor` and `estimateFor`, and `createUser`, `createRoom` and `expectSnapshot` from `object RoomSpec`.
- Produces, for Tasks 2 and 3:
  - `enum Room.Role { case Voter, Facilitator }`;
  - `enum Room.Seat { case Voter(estimate: Option[Estimate]); case Facilitator }`, with `role: Role`, `cleared`, `unconfirmed`, `switchedTo(role: Role): Seat`, and `Seat.of(role: Role): Seat`;
  - `Room.VoteRefusal.NotAVoter`, exported as `Room.NotAVoter`;
  - `Room.SwitchRole(token: SessionToken, role: Role, replyTo: ActorRef[CommandResult])`;
  - `Room.RequestSession(name: String, role: Role, existing: Option[SessionToken], replyTo: ActorRef[SessionMinted])`;
  - `RoomManager.RequestSession(roomId: Slug, name: String, role: Room.Role, existing: Option[Room.SessionToken], replyTo: ActorRef[Room.SessionMinted])`;
  - `RoomData.switchRole(userId: UUID, role: Role): RoomData`;
  - the fixture `withSeat(user: Attendee, seat: Room.Seat): RoomData`.

- [ ] **Step 1: Capture today's contract files**

Step 9 compares against these, so take them before any code changes.

```bash
sbt -batch "testOnly com.lunatech.pointingpoker.actors.SnapshotContractSpec"
rm -rf "${TMPDIR:-/tmp}/contract-2a" && cp -r target/contract "${TMPDIR:-/tmp}/contract-2a"
ls "${TMPDIR:-/tmp}/contract-2a" | wc -l
```

Expected: `8`.

- [ ] **Step 2: Add the role surface, with no behaviour behind it**

The spec asks for the matrix to fail before the transitions exist, so this step adds the types and commands only. `SwitchRole` does nothing, a join ignores its role, and a facilitator counts as a voter with no vote. Step 6 replaces each of these.

In `Room.scala`, replace:

```scala
  final case class RequestSession(
      name: String,
      existing: Option[SessionToken],
```

with:

```scala
  final case class SwitchRole(token: SessionToken, role: Role, replyTo: ActorRef[CommandResult])
      extends Command
  final case class RequestSession(
      name: String,
      role: Role,
      existing: Option[SessionToken],
```

Replace:

```scala
    case RoundRevealed, BlankEstimation
  export Refusal.{NoSession, NotAMember}
  export VoteRefusal.{BlankEstimation, RoundRevealed}
```

with:

```scala
    case RoundRevealed, BlankEstimation, NotAVoter
  export Refusal.{NoSession, NotAMember}
  export VoteRefusal.{BlankEstimation, NotAVoter, RoundRevealed}
```

Replace the whole `Seat` enum:

```scala
  // A role plus that role's state: the role outlives the round, the estimate does not.
  enum Seat:
    case Voter(estimate: Option[Estimate])

    def cleared: Seat = this match
      case Voter(_) => Voter(None)

    def unconfirmed: Seat = this match
      case Voter(estimate) => Voter(estimate.map(_.unconfirmed))
  end Seat
```

with:

```scala
  enum Role:
    case Voter, Facilitator

  // A role plus that role's state: the role outlives the round, the estimate does not.
  enum Seat:
    case Voter(estimate: Option[Estimate])
    case Facilitator

    def role: Role = this match
      case Voter(_)    => Role.Voter
      case Facilitator => Role.Facilitator

    def cleared: Seat = this match
      case Voter(_)    => Voter(None)
      case Facilitator => Facilitator

    def unconfirmed: Seat = this match
      case Voter(estimate) => Voter(estimate.map(_.unconfirmed))
      case Facilitator     => Facilitator
  end Seat
```

In `complete`, replace:

```scala
        seats.get(id).exists { case Seat.Voter(estimate) => estimate.exists(_.confirmed) }
```

with:

```scala
        seats.get(id).exists {
          case Seat.Voter(estimate) => estimate.exists(_.confirmed)
          case Seat.Facilitator     => false
        }
```

Replace `case RequestSession(name, existing, replyTo) =>` with `case RequestSession(name, _, existing, replyTo) =>`. Then replace:

```scala
          case ShowVotes(token, replyTo) =>
            act(token, replyTo)(_.show())
```

with:

```scala
          case ShowVotes(token, replyTo) =>
            act(token, replyTo)(_.show())
          case SwitchRole(token, _, replyTo) =>
            act(token, replyTo)(identity)
```

In `RoomSnapshot.scala`, in `of`, replace:

```scala
          val estimate = data.state.seats.get(id).flatMap { case Room.Seat.Voter(e) => e }
```

with:

```scala
          val estimate = data.state.seats.get(id).flatMap {
            case Room.Seat.Voter(e)    => e
            case Room.Seat.Facilitator => None
          }
```

This stays after Step 6: until Task 2, the wire shows a facilitator as a voter with no estimation (P1).

In `RoomManager.scala`, replace:

```scala
  case class RequestSession(
      roomId: Slug,
      name: String,
```

with:

```scala
  case class RequestSession(
      roomId: Slug,
      name: String,
      role: Room.Role,
```

Replace `case RequestSession(roomId, name, existing, replyTo) =>` with `case RequestSession(roomId, name, role, existing, replyTo) =>`, and both `Room.RequestSession(name, existing, replyTo)` with `Room.RequestSession(name, role, existing, replyTo)`.

In `API.scala`, replace:

```scala
          RoomManager.RequestSession(roomId, request.name, resolveToken(rawCookie), _)
```

with:

```scala
          RoomManager.RequestSession(
            roomId,
            request.name,
            Room.Role.Voter,
            resolveToken(rawCookie),
            _
          )
```

In `Endpoints.scala`, in `status`, replace:

```scala
    case Room.RoundRevealed   => StatusCode.Conflict
```

with:

```scala
    case Room.RoundRevealed   => StatusCode.Conflict
    case Room.NotAVoter       => StatusCode.Conflict
```

Run: `sbt -batch compile`

Expected: `[success]`, with no warning.

- [ ] **Step 3: Port the specs to the new `RequestSession`, and add the seat fixture**

Every existing call joins as a voter, so the port inserts `Room.Role.Voter` mechanically:

```bash
T=src/test/scala/com/lunatech/pointingpoker
sed -i -E 's/(Room\.RequestSession\()([^,]+), /\1\2, Room.Role.Voter, /' $T/actors/RoomSpec.scala $T/actors/RoomManagerSpec.scala
sed -i -E 's/(RoomManager\.RequestSession\()([^,]+), ([^,]+), /\1\2, \3, Room.Role.Voter, /' $T/actors/RoomManagerSpec.scala
sed -i 's/case RoomManager.RequestSession(_, _, existing, replyTo)/case RoomManager.RequestSession(_, _, _, existing, replyTo)/' $T/APISpec.scala
git grep -c "Role.Voter" -- $T
```

Expected: `RoomSpec.scala:11`, `RoomManagerSpec.scala:6`, and no line for `APISpec.scala`.

Two of the manager's cases must show the role actually passes through, which a constant `Voter` would not. In `RoomManagerSpec.scala`, in "pass RequestSession through to the room, auto-creating it if needed", replace:

```scala
      behaviorTestKit.run(RoomManager.RequestSession(roomId, "Alice", Room.Role.Voter, None, sessionProbe.ref))

      val childInbox = behaviorTestKit.childInbox[Room.Command](roomId.raw)
      childInbox.expectMessage(Room.RequestSession("Alice", Room.Role.Voter, None, sessionProbe.ref))
```

with:

```scala
      // Facilitator, not the Voter every other call sends, so a hard-coded role would fail here.
      behaviorTestKit.run(
        RoomManager.RequestSession(roomId, "Alice", Room.Role.Facilitator, None, sessionProbe.ref)
      )

      val childInbox = behaviorTestKit.childInbox[Room.Command](roomId.raw)
      childInbox.expectMessage(
        Room.RequestSession("Alice", Room.Role.Facilitator, None, sessionProbe.ref)
      )
```

In "pass RequestSession through to an existing room without creating a new one", replace:

```scala
      managerRef ! RoomManager.RequestSession(roomId, "Alice", Room.Role.Voter, None, sessionProbe.ref)

      roomProbe.expectMessage(Room.RequestSession("Alice", Room.Role.Voter, None, sessionProbe.ref))
```

with:

```scala
      managerRef ! RoomManager.RequestSession(
        roomId,
        "Alice",
        Room.Role.Facilitator,
        None,
        sessionProbe.ref
      )

      roomProbe.expectMessage(
        Room.RequestSession("Alice", Room.Role.Facilitator, None, sessionProbe.ref)
      )
```

In `RoomDataFixtures.scala`, replace:

```scala
    // Throws on a missing seat, so a transition that deletes one never reads as "no estimate".
    def estimateFor(user: Attendee): Option[(String, Boolean)] =
      data.state.seats(user.id) match
        case Room.Seat.Voter(estimate) => estimate.map(e => (e.value, e.confirmed))
```

with:

```scala
    // Voted and estimation cannot say "facilitator", so the seat is set whole.
    def withSeat(user: Attendee, seat: Room.Seat): RoomData =
      RoomData.of(
        withSeats(data, _ + (user.id -> seat)),
        data.members,
        data.sessions,
        data.connections
      )

    // Throws on a missing seat or a facilitator's, so neither ever reads as "no estimate".
    def estimateFor(user: Attendee): Option[(String, Boolean)] =
      data.state.seats(user.id) match
        case Room.Seat.Voter(estimate) => estimate.map(e => (e.value, e.confirmed))
        case Room.Seat.Facilitator     =>
          throw IllegalStateException(s"${user.name} is a facilitator, who holds no estimate")
```

- [ ] **Step 4: Write the matrix and its two companion cases**

In `RoomSpec.scala`, right after the case "mint a session and store it on RequestSession", add:

```scala
    "create the seat from the join's role" in {
      val sessionProbe = testKit.createTestProbe[Room.SessionMinted]()
      val dataProbe    = testKit.createTestProbe[Room.DataStatus]()
      val (_, roomRef) = createRoom(aSlug(), RoomData.empty)

      // After a restart the page's token is unknown, so the join's role is the seat's only source.
      val stale = Some(Room.SessionToken.mint())
      roomRef ! Room.RequestSession("Alice", Room.Role.Facilitator, stale, sessionProbe.ref)
      val minted = sessionProbe.expectMessageType[Room.SessionMinted]
      roomRef ! Room.GetData(dataProbe.ref)

      dataProbe.expectMessageType[Room.DataStatus].data.state.seats mustBe
        Map(minted.userId -> Room.Seat.Facilitator)
    }
```

At the end of the class, replace:

```scala
      dataProbe.expectMessageType[Room.DataStatus].data.connections.isEmpty mustBe true
    }
  }
end RoomSpec
```

with:

```scala
      dataProbe.expectMessageType[Room.DataStatus].data.connections.isEmpty mustBe true
    }
  }

  // The spec's states by events for one identity, A, beside a present voter, B.
  "A seat" should {
    for cell <- seatCells do
      s"${cell.phase.label}: ${cell.row}, from ${describe(cell.aSeat)}" in {
        val (a, _)       = createUser(UUID.randomUUID(), "A", false, "")
        val (b, bProbe)  = createUser(UUID.randomUUID(), "B", false, "")
        val replyProbe   = testKit.createTestProbe[Any]()
        val dataProbe    = testKit.createTestProbe[Room.DataStatus]()
        val seated       = withUsers(a, b).withSeat(a, cell.aSeat).withSeat(b, cell.bSeat)
        val (_, roomRef) = createRoom(
          aSlug(),
          if cell.phase == Phase.Revealed then seated.withRevealed() else seated
        )

        cell.event.send(roomRef, a, b, replyProbe.ref)
        roomRef ! Room.GetData(dataProbe.ref)

        cell.reply(a).foreach(replyProbe.expectMessage(_))
        // Every event publishes, refused or not.
        expectSnapshot(bProbe).votesRevealed mustBe cell.outcome.revealed
        val data = dataProbe.expectMessageType[Room.DataStatus].data
        data.state.seats(a.id) mustBe cell.outcome.seat
        data.state.round.revealed mustBe cell.outcome.revealed
      }
    end for

    // The matrix's B-switch row has no third identity, so its Facilitator cell cannot reveal.
    "reveal the round when another voter's switch completes it beside a facilitator" in {
      val (a, _)       = createUser(UUID.randomUUID(), "A", false, "")
      val (b, bProbe)  = createUser(UUID.randomUUID(), "B", false, "")
      val (c, _)       = createUser(UUID.randomUUID(), "C", true, "8")
      val replyProbe   = testKit.createTestProbe[Room.CommandResult]()
      val dataProbe    = testKit.createTestProbe[Room.DataStatus]()
      val (_, roomRef) = createRoom(aSlug(), withUsers(a, b, c).withSeat(a, facilitator))

      roomRef ! Room.SwitchRole(b.token, Room.Role.Facilitator, replyProbe.ref)
      roomRef ! Room.GetData(dataProbe.ref)

      replyProbe.expectMessage(Room.Applied)
      expectSnapshot(bProbe).votesRevealed mustBe true
      dataProbe.expectMessageType[Room.DataStatus].data.state.round.revealed mustBe true
    }
  }
end RoomSpec
```

In `object RoomSpec`, after `end createRoom`, add the table. A `TestProbe[Any]`'s ref stands in for every reply type, since `ActorRef` is contravariant.

```scala

  // One event of the matrix: A's, or B's where the row is about another identity's act.
  enum SeatEvent:
    case AVotes(estimation: String)
    case ASwitches(role: Room.Role)
    case AJoins(role: Room.Role)
    case AShows, AClears, AReVotes, ADeparts, AReconnects, BVotes
    case BSwitches(role: Room.Role)

    def send(room: ActorRef[Room.Command], a: Attendee, b: Attendee, replyTo: ActorRef[Any]): Unit =
      this match
        case AVotes(estimation) => room ! Room.Vote(a.token, estimation, replyTo)
        case ASwitches(role)    => room ! Room.SwitchRole(a.token, role, replyTo)
        case AJoins(role)       => room ! Room.RequestSession(a.name, role, Some(a.token), replyTo)
        case AShows             => room ! Room.ShowVotes(a.token, replyTo)
        case AClears            => room ! Room.ClearVotes(a.token, replyTo)
        case AReVotes           => room ! Room.ReVote(a.token, replyTo)
        case ADeparts           => room ! Room.Depart(a.token, a.connectionId, replyTo)
        case AReconnects        => room ! a.joinMessage
        case BVotes             => room ! Room.Vote(b.token, "8", replyTo)
        case BSwitches(role)    => room ! Room.SwitchRole(b.token, role, replyTo)
  end SeatEvent

  final case class Outcome(seat: Room.Seat, revealed: Boolean, refusal: Option[Room.VoteRefusal])

  def revealed(seat: Room.Seat, refusal: Option[Room.VoteRefusal] = None): Outcome =
    Outcome(seat, revealed = true, refusal)
  def hidden(seat: Room.Seat, refusal: Option[Room.VoteRefusal] = None): Outcome =
    Outcome(seat, revealed = false, refusal)

  enum Phase(val label: String):
    case Open     extends Phase("open round")
    case Revealed extends Phase("revealed round")

  final case class SeatCell(
      phase: Phase,
      row: String,
      event: SeatEvent,
      bSeat: Room.Seat,
      aSeat: Room.Seat,
      outcome: Outcome
  ):
    def reply(a: Attendee): Option[Any] = outcome.refusal.orElse(event match
      case SeatEvent.AJoins(_)   => Some(Room.SessionMinted(a.id, a.token))
      case SeatEvent.AReconnects => None
      case _                     => Some(Room.Applied))
  end SeatCell

  val noVote: Room.Seat      = Room.Seat.Voter(None)
  val confirmed: Room.Seat   = Room.Seat.Voter(Some(Room.Estimate.of("5")))
  val unconfirmed: Room.Seat = Room.Seat.Voter(Some(Room.Estimate.of("5", confirmed = false)))
  val facilitator: Room.Seat = Room.Seat.Facilitator
  val votedThree: Room.Seat  = Room.Seat.Voter(Some(Room.Estimate.of("3")))
  val bConfirmed: Room.Seat  = Room.Seat.Voter(Some(Room.Estimate.of("8")))

  def describe(seat: Room.Seat): String = seat match
    case Room.Seat.Voter(None)    => "Voter(None)"
    case Room.Seat.Voter(Some(e)) =>
      if e.confirmed then "Voter(confirmed)" else "Voter(unconfirmed)"
    case Room.Seat.Facilitator => "Facilitator"

  // One row of the matrix, its columns in the spec's order.
  private def row(phase: Phase, name: String, event: SeatEvent, bSeat: Room.Seat = bConfirmed)(
      outcomes: Outcome*
  ): List[SeatCell] =
    List(noVote, confirmed, unconfirmed, facilitator)
      .zip(outcomes)
      .map((aSeat, outcome) => SeatCell(phase, name, event, bSeat, aSeat, outcome))

  import Phase.{Open, Revealed}
  import Room.Role.{Facilitator, Voter}
  import Room.VoteRefusal.{BlankEstimation, NotAVoter, RoundRevealed}
  import SeatEvent.*

  // B has confirmed, so a cell that completes the round reveals it, and a cell that must not
  // reveal starts, from a confirmed A, in the complete but hidden state a departure leaves.
  val seatCells: List[SeatCell] = List(
    row(Open, "A votes, non-blank", AVotes("3"))(
      revealed(votedThree),
      revealed(votedThree),
      revealed(votedThree),
      hidden(facilitator, Some(NotAVoter))
    ),
    row(Open, "A votes, blank", AVotes(" "))(
      hidden(noVote, Some(BlankEstimation)),
      hidden(confirmed, Some(BlankEstimation)),
      hidden(unconfirmed, Some(BlankEstimation)),
      hidden(facilitator, Some(BlankEstimation))
    ),
    row(Open, "A switches to facilitator through /role", ASwitches(Facilitator))(
      revealed(facilitator),
      revealed(facilitator),
      revealed(facilitator),
      hidden(facilitator)
    ),
    row(Open, "A switches to voter through /role", ASwitches(Voter))(
      hidden(noVote),
      hidden(confirmed),
      hidden(unconfirmed),
      hidden(noVote)
    ),
    row(Open, "A joins as a voter", AJoins(Voter))(
      hidden(noVote),
      hidden(confirmed),
      hidden(unconfirmed),
      hidden(noVote)
    ),
    row(Open, "A joins as a facilitator", AJoins(Facilitator))(
      hidden(facilitator),
      hidden(facilitator),
      hidden(facilitator),
      hidden(facilitator)
    ),
    row(Open, "A presses Show", AShows)(
      revealed(noVote),
      revealed(confirmed),
      revealed(unconfirmed),
      revealed(facilitator)
    ),
    row(Open, "A presses Clear", AClears)(
      hidden(noVote),
      hidden(noVote),
      hidden(noVote),
      hidden(facilitator)
    ),
    row(Open, "A presses Re-vote", AReVotes)(
      hidden(noVote),
      hidden(unconfirmed),
      hidden(unconfirmed),
      hidden(facilitator)
    ),
    row(Open, "A departs by the beacon", ADeparts)(
      hidden(noVote),
      hidden(confirmed),
      hidden(unconfirmed),
      hidden(facilitator)
    ),
    row(Open, "A's stream reconnects in place", AReconnects)(
      hidden(noVote),
      hidden(confirmed),
      hidden(unconfirmed),
      hidden(facilitator)
    ),
    row(Open, "B casts the last vote", BVotes, bSeat = noVote)(
      hidden(noVote),
      revealed(confirmed),
      hidden(unconfirmed),
      revealed(facilitator)
    ),
    // From a facilitator, B was the last voter, so nobody is left to complete the round.
    row(Open, "B switches to facilitator through /role", BSwitches(Facilitator), bSeat = noVote)(
      hidden(noVote),
      revealed(confirmed),
      hidden(unconfirmed),
      hidden(facilitator)
    ),
    row(Revealed, "A votes", AVotes("3"))(
      revealed(noVote, Some(RoundRevealed)),
      revealed(confirmed, Some(RoundRevealed)),
      revealed(unconfirmed, Some(RoundRevealed)),
      revealed(facilitator, Some(RoundRevealed))
    ),
    row(Revealed, "A switches to facilitator through /role", ASwitches(Facilitator))(
      revealed(facilitator),
      revealed(facilitator),
      revealed(facilitator),
      revealed(facilitator)
    ),
    row(Revealed, "A switches to voter through /role", ASwitches(Voter))(
      revealed(noVote),
      revealed(confirmed),
      revealed(unconfirmed),
      revealed(noVote)
    ),
    row(Revealed, "A joins as a facilitator", AJoins(Facilitator))(
      revealed(facilitator),
      revealed(facilitator),
      revealed(facilitator),
      revealed(facilitator)
    ),
    row(Revealed, "A joins as a voter", AJoins(Voter))(
      revealed(noVote),
      revealed(confirmed),
      revealed(unconfirmed),
      revealed(noVote)
    ),
    row(Revealed, "A presses Show", AShows)(
      revealed(noVote),
      revealed(confirmed),
      revealed(unconfirmed),
      revealed(facilitator)
    ),
    row(Revealed, "A presses Clear", AClears)(
      hidden(noVote),
      hidden(noVote),
      hidden(noVote),
      hidden(facilitator)
    ),
    row(Revealed, "A presses Re-vote", AReVotes)(
      hidden(noVote),
      hidden(unconfirmed),
      hidden(unconfirmed),
      hidden(facilitator)
    ),
    row(Revealed, "A departs by the beacon", ADeparts)(
      revealed(noVote),
      revealed(confirmed),
      revealed(unconfirmed),
      revealed(facilitator)
    ),
    row(Revealed, "A's stream reconnects in place", AReconnects)(
      revealed(noVote),
      revealed(confirmed),
      revealed(unconfirmed),
      revealed(facilitator)
    ),
    row(Revealed, "B votes", BVotes)(
      revealed(noVote, Some(RoundRevealed)),
      revealed(confirmed, Some(RoundRevealed)),
      revealed(unconfirmed, Some(RoundRevealed)),
      revealed(facilitator, Some(RoundRevealed))
    ),
    row(Revealed, "B switches to facilitator through /role", BSwitches(Facilitator))(
      revealed(noVote),
      revealed(confirmed),
      revealed(unconfirmed),
      revealed(facilitator)
    )
  ).flatten
```

How the table reads the spec's matrix:

- The columns are the spec's, in its order. In the open round, "A joins as a voter" and "A joins as a facilitator" are its "A joins with the seat's role" and "with the other role", and its "no-op" cells are those where the role matches. In the revealed round, each of its "by `/role` or a join" rows is two rows here, one per event.
- Its "Another identity's vote or `/role` switch completes the round" is B's two rows, B starting with no vote. Their `Voter(None)` cells, which the spec calls "cannot happen while A is present", test that the round stays hidden. The B-switch row's `Facilitator` cell leaves no voter, so it pins the Server rule "when the last voter switches to facilitator, nothing reveals". The case after the matrix's loop runs the switch's `revealed` cell beside a facilitator.
- "A votes, blank" and the revealed round's "A votes" pin the refusal table's precedence together. "A votes, blank" is also the refused vote on a complete round that the spec's pass condition names.

- [ ] **Step 5: Run the matrix to see it fail**

Run: `sbt -batch scalafmtAll "testOnly com.lunatech.pointingpoker.actors.*"`

Expected: `Tests: succeeded 208, failed 21`, and the failures are exactly these:

```
create the seat from the join's role
open round: A votes, non-blank, from Facilitator
open round: A switches to facilitator through /role, from Voter(None)
open round: A switches to facilitator through /role, from Voter(confirmed)
open round: A switches to facilitator through /role, from Voter(unconfirmed)
open round: A switches to voter through /role, from Facilitator
open round: A joins as a voter, from Facilitator
open round: A joins as a facilitator, from Voter(None)
open round: A joins as a facilitator, from Voter(confirmed)
open round: A joins as a facilitator, from Voter(unconfirmed)
open round: B casts the last vote, from Facilitator
open round: B switches to facilitator through /role, from Voter(confirmed)
revealed round: A switches to facilitator through /role, from Voter(None)
revealed round: A switches to facilitator through /role, from Voter(confirmed)
revealed round: A switches to facilitator through /role, from Voter(unconfirmed)
revealed round: A switches to voter through /role, from Facilitator
revealed round: A joins as a facilitator, from Voter(None)
revealed round: A joins as a facilitator, from Voter(confirmed)
revealed round: A joins as a facilitator, from Voter(unconfirmed)
revealed round: A joins as a voter, from Facilitator
reveal the round when another voter's switch completes it beside a facilitator
```

The other 81 cells pass, because Step 2 already changes nothing a stub should not. Most of them are "never reveals" cells, which pass trivially here. Step 8 shows that they bite.

- [ ] **Step 6: Write the transitions**

In `Room.scala`, replace the end of the `Seat` enum:

```scala
    def unconfirmed: Seat = this match
      case Voter(estimate) => Voter(estimate.map(_.unconfirmed))
      case Facilitator     => Facilitator
  end Seat
```

with:

```scala
    def unconfirmed: Seat = this match
      case Voter(estimate) => Voter(estimate.map(_.unconfirmed))
      case Facilitator     => Facilitator

    // The switch transition: a change of role starts the new role afresh, so drops any estimate.
    def switchedTo(role: Role): Seat = if role == this.role then this else Seat.of(role)
  end Seat

  object Seat:
    def of(role: Role): Seat = role match
      case Role.Voter       => Voter(None)
      case Role.Facilitator => Facilitator
```

Replace `registerSession` and `rename`:

```scala
    private[Room] def registerSession(token: SessionToken, userId: UUID, name: String): RoomData =
      // The only place a session is created, so the only place a seat is.
      this.copy(
        sessions = this.sessions + (token -> Session(userId, name)),
        state = this.state.copy(seats = this.state.seats + (userId -> Seat.Voter(None)))
      )

    private[Room] def rename(token: SessionToken, userId: UUID, name: String): RoomData =
      // Both sides or neither: of requires a member's name to equal its session's.
      this.copy(
        sessions = this.sessions + (token -> Session(userId, name)),
        members = this.members.updatedWith(userId)(_.map(_ => Member(name)))
      )
```

with:

```scala
    private[Room] def registerSession(
        token: SessionToken,
        userId: UUID,
        name: String,
        role: Role
    ): RoomData =
      // The only place a session is created, so the only place a seat is.
      this.copy(
        sessions = this.sessions + (token -> Session(userId, name)),
        state = this.state.copy(seats = this.state.seats + (userId -> Seat.of(role)))
      )

    private[Room] def rename(
        token: SessionToken,
        userId: UUID,
        name: String,
        role: Role
    ): RoomData =
      // Both sides or neither: of requires a member's name to equal its session's.
      this
        .copy(
          sessions = this.sessions + (token -> Session(userId, name)),
          members = this.members.updatedWith(userId)(_.map(_ => Member(name)))
        )
        .switched(userId, role)
```

Replace the `else` branch of `vote`:

```scala
      else
        val seats = this.state.seats + (userId -> Seat.Voter(Some(Estimate.of(estimation))))
        (withState(this.state.round.copy(revealed = complete(seats)), seats), Applied)
```

with:

```scala
      else
        this.state.seats.get(userId) match
          case Some(Seat.Voter(_)) =>
            val seats = this.state.seats + (userId -> Seat.Voter(Some(Estimate.of(estimation))))
            (withState(this.state.round, seats).latched, Applied)
          case Some(Seat.Facilitator) | None => (this, NotAVoter)

    // Only a change of seat latches, so a same-role switch never reveals a round left complete.
    def switchRole(userId: UUID, role: Role): RoomData =
      if this.state.seats.get(userId).forall(_.role == role) then this
      else switched(userId, role).latched
```

Replace `complete`, including Step 2's version of its match:

```scala
    private def complete(seats: Map[UUID, Seat]): Boolean =
      // nonEmpty is insurance rather than a live case: only a Vote ever runs this.
      // A member with no seat breaks an invariant, so it holds the round open.
      this.members.nonEmpty && this.members.keys.forall(id =>
        seats.get(id).exists {
          case Seat.Voter(estimate) => estimate.exists(_.confirmed)
          case Seat.Facilitator     => false
        }
      )
```

with:

```scala
    private def switched(userId: UUID, role: Role): RoomData =
      withState(this.state.round, this.state.seats.updatedWith(userId)(_.map(_.switchedTo(role))))

    // The latch step: only a deliberate act by someone present runs it (decision 1).
    private def latched: RoomData =
      if this.state.round.revealed || !complete then this
      else withState(this.state.round.copy(revealed = true), this.state.seats)

    // The Terms' "Complete". A member with no seat breaks an invariant, so it holds the round open.
    private def complete: Boolean =
      val voters = this.members.keys.toList.flatMap(id =>
        this.state.seats.get(id) match
          case Some(Seat.Voter(estimate)) => Some(estimate.exists(_.confirmed))
          case Some(Seat.Facilitator)     => None
          case None                       => Some(false)
      )
      voters.nonEmpty && voters.forall(identity)
```

In `receiveBehaviour`, replace the head of `act`:

```scala
        def act(token: SessionToken, replyTo: ActorRef[CommandResult])(
            update: RoomData => RoomData
        ): Behavior[Command] =
          data.acting(token) match
            case Right(_) =>
              replyTo ! Applied
              receiveBehaviour(
                roomId,
                publish(update(data), context),
```

with:

```scala
        def act(token: SessionToken, replyTo: ActorRef[CommandResult])(
            update: (RoomData, UUID) => RoomData
        ): Behavior[Command] =
          data.acting(token) match
            case Right(userId) =>
              replyTo ! Applied
              receiveBehaviour(
                roomId,
                publish(update(data, userId), context),
```

Then make these replacements in `receiveBehaviour`, one each:

| Replace | With |
| --- | --- |
| `case RequestSession(name, _, existing, replyTo) =>` | `case RequestSession(name, role, existing, replyTo) =>` |
| `publish(data.rename(token, session.userId, name), context)` | `publish(data.rename(token, session.userId, name, role), context)` |
| `data.registerSession(token, userId, name)` | `data.registerSession(token, userId, name, role)` |
| `act(token, replyTo)(_.clear())` | `act(token, replyTo)((room, _) => room.clear())` |
| `act(token, replyTo)(_.reVote())` | `act(token, replyTo)((room, _) => room.reVote())` |
| `act(token, replyTo)(_.show())` | `act(token, replyTo)((room, _) => room.show())` |
| `act(token, replyTo)(_.editIssue(issue))` | `act(token, replyTo)((room, _) => room.editIssue(issue))` |
| `case SwitchRole(token, _, replyTo) =>` and the `act(token, replyTo)(identity)` under it | `case SwitchRole(token, role, replyTo) =>` and `act(token, replyTo)(_.switchRole(_, role))` |

- [ ] **Step 7: Run the matrix to see it pass**

Run: `sbt -batch scalafmtAll "testOnly com.lunatech.pointingpoker.actors.*"`

Expected: `Tests: succeeded 229, failed 0`.

- [ ] **Step 8: Show the "never reveals" cells bite**

Save the good file once:

```bash
cp src/main/scala/com/lunatech/pointingpoker/actors/Room.scala "${TMPDIR:-/tmp}/Room.scala.good"
```

Apply each mutation on its own to `Room.scala`, run `sbt -batch "testOnly com.lunatech.pointingpoker.actors.*"`, check that the failures are exactly those listed, then restore with `cp "${TMPDIR:-/tmp}/Room.scala.good" src/main/scala/com/lunatech/pointingpoker/actors/Room.scala` before the next. The mutations need not be formatted. Cells are named by row and column, all in the open round unless marked.

| # | Mutation | Must fail, and nothing else |
| --- | --- | --- |
| 1 | In `switchRole`, replace its two-line body with `switched(userId, role).latched` (a same-role switch latches) | "A switches to facilitator through /role" from `Facilitator`; "A switches to voter through /role" from `Voter(confirmed)` |
| 2 | Replace `case Some(Seat.Facilitator) \| None => (this, NotAVoter)` with `case Some(Seat.Facilitator) \| None => (this.latched, NotAVoter)` | "A votes, non-blank" from `Facilitator` |
| 3 | Replace `else if estimation.isBlank then (this, BlankEstimation)` with `else if estimation.isBlank then (this.latched, BlankEstimation)` | "A votes, blank" from `Voter(confirmed)` and from `Facilitator` |
| 4 | In `rename`, after `.switched(userId, role)`, add a line `.latched` (a join latches) | "A joins as a voter" from `Voter(confirmed)`; "A joins as a facilitator" from all four |
| 5 | Replace `voters.nonEmpty && voters.forall(identity)` with `this.members.nonEmpty && voters.forall(identity)` (the old guard) | "B switches to facilitator through /role" from `Facilitator` |
| 6 | Before `else if estimation.isBlank`, add `else if this.state.seats.get(userId).contains(Seat.Facilitator) then (this, NotAVoter)` | "A votes, blank" from `Facilitator` |
| 7 | Replace `if this.state.round.revealed then (this, RoundRevealed)` with `if this.state.seats.get(userId).contains(Seat.Facilitator) then (this, NotAVoter)` and, on the next line, `else if this.state.round.revealed then (this, RoundRevealed)` | "A votes, blank" from `Facilitator`; revealed round "A votes" from `Facilitator` |
| 8 | In `registerSession`, replace `Seat.of(role)` with `Seat.Voter(None)` | "create the seat from the join's role" |
| 9 | In `cleared`, replace `case Facilitator => Facilitator` with `case Facilitator => Voter(None)` | "A presses Clear" from `Facilitator`, in both rounds |
| 10 | In `complete`, replace `case Some(Seat.Facilitator)     => None` with `case Some(Seat.Facilitator)     => Some(false)` (a facilitator counted as a voter) | "A switches to facilitator through /role" from the three voter columns; "B casts the last vote" from `Facilitator`; "B switches to facilitator through /role" from `Voter(confirmed)`; "reveal the round when another voter's switch completes it beside a facilitator" |
| 11 | In `rename`, delete the line `.switched(userId, role)` (a join ignores its role) | "A joins as a voter" from `Facilitator` and "A joins as a facilitator" from the three voter columns, in both rounds |

Expected after the last restore: `cmp "${TMPDIR:-/tmp}/Room.scala.good" src/main/scala/com/lunatech/pointingpoker/actors/Room.scala` prints nothing.

- [ ] **Step 9: Check the wire did not change**

```bash
sbt -batch scalafmtAll test genOpenApi
diff -r "${TMPDIR:-/tmp}/contract-2a" target/contract && echo CONTRACT-IDENTICAL
git diff --exit-code frontend/ && echo OPENAPI-UNCHANGED
```

Expected: `Tests: succeeded 329, failed 0`, then `CONTRACT-IDENTICAL` and `OPENAPI-UNCHANGED`. A diff here means the wire changed: stop and find out why.

If `contract-2a` is missing (another session, or a reboot), rebuild it from `HEAD`, still the plan's commit, then run the `diff` again:

```bash
git worktree add "${TMPDIR:-/tmp}/wt-2a" HEAD
(cd "${TMPDIR:-/tmp}/wt-2a" && sbt -batch "testOnly com.lunatech.pointingpoker.actors.SnapshotContractSpec")
rm -rf "${TMPDIR:-/tmp}/contract-2a" && cp -r "${TMPDIR:-/tmp}/wt-2a/target/contract" "${TMPDIR:-/tmp}/contract-2a"
git worktree remove --force "${TMPDIR:-/tmp}/wt-2a"
```

- [ ] **Step 10: Commit**

```bash
git add src/main/scala/com/lunatech/pointingpoker/actors/Room.scala \
  src/main/scala/com/lunatech/pointingpoker/actors/RoomSnapshot.scala \
  src/main/scala/com/lunatech/pointingpoker/actors/RoomManager.scala \
  src/main/scala/com/lunatech/pointingpoker/API.scala \
  src/main/scala/com/lunatech/pointingpoker/Endpoints.scala \
  src/test/scala/com/lunatech/pointingpoker/actors/RoomDataFixtures.scala \
  src/test/scala/com/lunatech/pointingpoker/actors/RoomSpec.scala \
  src/test/scala/com/lunatech/pointingpoker/actors/RoomManagerSpec.scala \
  src/test/scala/com/lunatech/pointingpoker/APISpec.scala
git commit -m "feat: hold a facilitator's seat in the room, outside completion (ui refresh step 2b)" -m "A seat is a voter's or a facilitator's. A facilitator holds no estimate, gets NotAVoter on a vote, and is left out of completion, which now needs at least one present voter. A join applies its role through the switch transition; SwitchRole applies it and then the latch step, as an applied vote does. The spec's states by events are table-driven RoomSpec cases. The wire is unchanged: a facilitator reads as a voter with no estimation, and every join over HTTP is a voter's until the wire carries a role."
git status --short
```

Expected: `git status --short` prints nothing.

### Task 2: Carry each participant's seat in the snapshot

**Files:**
- Modify: `src/main/scala/com/lunatech/pointingpoker/actors/RoomSnapshot.scala`
- Modify: `src/test/scala/com/lunatech/pointingpoker/actors/RoomDataFixtures.scala`
- Modify: `src/test/scala/com/lunatech/pointingpoker/actors/RoomSnapshotSpec.scala`
- Modify: `src/test/scala/com/lunatech/pointingpoker/actors/SnapshotContractSpec.scala`
- Modify: `src/test/scala/com/lunatech/pointingpoker/sse/SSESpec.scala`
- Modify: `frontend/src/protocol/snapshot.ts`
- Modify: `frontend/src/protocol/snapshot.test.ts`
- Modify: `frontend/src/room/view.ts`
- Modify: `frontend/src/room/view.test.ts`
- Modify: `frontend/src/room/connection.test.ts`

**Interfaces:**
- Consumes: Task 1's `Room.Seat` and the fixture `withSeat`.
- Produces:
  - `RoomSnapshot.Participant(id: UUID, name: String, seat: RoomSnapshot.Seat)`;
  - `enum RoomSnapshot.Seat { case Voter(estimation: Estimation); case Facilitator }`, encoded as `{"type":"Voter","estimation":{...}}` or `{"type":"Facilitator"}`;
  - in `snapshot.ts`, the exported types `Seat` and `Estimation` (now `Extract<Seat, { type: 'Voter' }>['estimation']`);
  - the test-only `Participant` extension `estimation: Estimation` in `RoomDataFixtures`.

- [ ] **Step 1: Write the server's failing tests**

In `RoomDataFixtures.scala`, replace:

```scala
import com.lunatech.pointingpoker.actors.RoomSnapshot.Estimation
```

with:

```scala
import com.lunatech.pointingpoker.actors.RoomSnapshot.{Estimation, Seat}
```

and replace:

```scala
  // The pre-union wire's three fields, rebuilt so behaviour specs need not name every tag.
  extension (participant: RoomSnapshot.Participant)
```

with:

```scala
  // The pre-union wire's three fields, rebuilt so behaviour specs need not name every tag.
  extension (participant: RoomSnapshot.Participant)
    // Throws on a facilitator's row, so a spec about votes cannot read one as "no estimation".
    def estimation: Estimation = participant.seat match
      case Seat.Voter(estimation) => estimation
      case Seat.Facilitator       =>
        throw IllegalStateException(s"${participant.name} is a facilitator, with no estimation")

```

In `SSESpec.scala`, replace `estimation = RoomSnapshot.Estimation.NoEstimation` with `seat = RoomSnapshot.Seat.Voter(RoomSnapshot.Estimation.NoEstimation)`.

In `RoomSnapshotSpec.scala`, in "serialize exactly the agreed field set", replace:

```scala
      json.hcursor.downField("users").downArray.keys.map(_.toList) mustBe Some(
        List("id", "name", "estimation")
      )
      json.hcursor.downField("users").downArray.downField("estimation").focus mustBe Some(
        Json.obj("type" -> Json.fromString("Confirmed"), "value" -> Json.fromString("5"))
      )
    }
```

with:

```scala
      json.hcursor.downField("users").downArray.keys.map(_.toList) mustBe Some(
        List("id", "name", "seat")
      )
      json.hcursor.downField("users").downArray.downField("seat").focus mustBe Some(
        Json.obj(
          "type"       -> Json.fromString("Voter"),
          "estimation" -> Json.obj(
            "type"  -> Json.fromString("Confirmed"),
            "value" -> Json.fromString("5")
          )
        )
      )
    }

    "put a facilitator on the wire as a seat with no estimation, before and after the reveal" in {
      val alice = user(UUID.randomUUID(), "Alice", true, "5")
      val bob   = user(UUID.randomUUID(), "Bob", false, "")
      val data  = withUsers(alice, bob).withSeat(bob, Room.Seat.Facilitator)

      for state <- List(data, data.withRevealed()) do
        val rows    = RoomSnapshot.of(state, alice.id).asJson.hcursor.downField("users").values
        val bobsRow = rows.toList.flatten.find(_.hcursor.get[UUID]("id").toOption.contains(bob.id))
        // The whole object, so no estimation key can travel with a facilitator.
        bobsRow.flatMap(_.hcursor.downField("seat").focus) mustBe Some(
          Json.obj("type" -> Json.fromString("Facilitator"))
        )
    }
```

In "keep a withheld estimation out of the serialized frame entirely", replace:

```scala
      // The key stays, as a tag with no value: the wire keeps estimation always present.
      rows.flatMap(_.asObject.map(_.keys.toList)) mustBe List.fill(2)(
        List("id", "name", "estimation")
      )
      val bobsRow = rows.find(_.hcursor.get[UUID]("id").toOption.contains(bob.id))
      bobsRow.flatMap(_.hcursor.downField("estimation").focus) mustBe Some(
```

with:

```scala
      // The key stays, as a tag with no value: a voter's seat keeps estimation always present.
      rows.flatMap(_.hcursor.downField("seat").keys.map(_.toList)) mustBe List.fill(2)(
        List("type", "estimation")
      )
      val bobsRow = rows.find(_.hcursor.get[UUID]("id").toOption.contains(bob.id))
      bobsRow.flatMap(_.hcursor.downField("seat").downField("estimation").focus) mustBe Some(
```

In `SnapshotContractSpec.scala`, replace:

```scala
  // tag, when set, must appear as some participant's estimation type, so a name cannot lie.
```

with:

```scala
  // tag, when set, must be some participant's seat or estimation type, so a name cannot lie.
```

Add a ninth state after "estimation-unconfirmed", replacing:

```scala
      (alice, _) => withUsers(alice.copy(estimation = "5"))
    )
  )
```

with:

```scala
      (alice, _) => withUsers(alice.copy(estimation = "5"))
    ),
    tagState(
      "seat-facilitator",
      "Facilitator",
      (alice, bob) => withUsers(alice, bob).withSeat(bob, Room.Seat.Facilitator)
    )
  )
```

and replace the tag reader:

```scala
        val json = state.snapshot().asJson
        val tags = json.hcursor
          .downField("users")
          .values
          .toList
          .flatten
          .flatMap(_.hcursor.downField("estimation").get[String]("type").toOption)
```

with:

```scala
        val json  = state.snapshot().asJson
        val seats =
          json.hcursor.downField("users").values.toList.flatten.map(_.hcursor.downField("seat"))
        val tags = seats.flatMap(seat =>
          List(seat.get[String]("type"), seat.downField("estimation").get[String]("type"))
            .flatMap(_.toOption)
        )
```

Run: `sbt -batch Test/compile`

Expected: FAIL to compile, with `value Seat is not a member of object com.lunatech.pointingpoker.actors.RoomSnapshot` in `RoomDataFixtures.scala` and `SSESpec.scala`.

- [ ] **Step 2: Encode the seat**

In `RoomSnapshot.scala`, replace:

```scala
  final case class Participant(id: UUID, name: String, estimation: Estimation)
```

with:

```scala
  final case class Participant(id: UUID, name: String, seat: Seat)

  // A facilitator's seat has no estimation, so the wire cannot carry one for them.
  enum Seat:
    case Voter(estimation: Estimation)
    case Facilitator

  object Seat:
    // Explicit tags, as Estimation's are.
    given Encoder[Seat] = Encoder.instance {
      case Voter(estimation) =>
        tagged("Voter", "estimation" -> Encoder[Estimation].apply(estimation))
      case Facilitator => tagged("Facilitator")
    }

  private def tagged(tag: String, fields: (String, Json)*): Json =
    Json.obj(("type" -> Json.fromString(tag)) +: fields*)
```

Delete the `tagged` helper inside `object Estimation`, now that it lives one level up:

```scala

    private def tagged(tag: String, fields: (String, Json)*): Json =
      Json.obj(("type" -> Json.fromString(tag)) +: fields*)
```

In `of`, replace:

```scala
      // The join: a participant appears because they are one, their estimate comes from
      // their seat, and an estimate belonging to nobody present reaches nobody.
```

with:

```scala
      // The join: a participant appears because they are one, their seat is theirs, and an
      // estimate belonging to nobody present reaches nobody.
```

and replace Task 1's projection:

```scala
          val estimate = data.state.seats.get(id).flatMap {
            case Room.Seat.Voter(e)    => e
            case Room.Seat.Facilitator => None
          }
          Participant(id, member.name, Estimation.of(estimate, disclose))
```

with:

```scala
          // A member with no seat breaks an invariant, and reads as a voter, as complete counts it.
          val seat = data.state.seats.get(id) match
            case Some(Room.Seat.Voter(e))    => Seat.Voter(Estimation.of(e, disclose))
            case Some(Room.Seat.Facilitator) => Seat.Facilitator
            case None                        => Seat.Voter(Estimation.NoEstimation)
          Participant(id, member.name, seat)
```

- [ ] **Step 3: Run the server suites**

Run: `sbt -batch scalafmtAll test && ls target/contract | wc -l`

Expected: `Tests: succeeded 331, failed 0`, then `9`.

- [ ] **Step 4: Write the client's failing tests**

In `frontend/src/protocol/snapshot.test.ts`, replace:

```ts
const withEstimation = (estimation: object) => ({
  you: 'a',
  currentIssue: '',
  votesRevealed: false,
  users: [{ id: 'a', name: 'A', estimation }]
})
```

with:

```ts
const withSeat = (seat: object) => ({
  you: 'a',
  currentIssue: '',
  votesRevealed: false,
  users: [{ id: 'a', name: 'A', seat }]
})
const withEstimation = (estimation: object) => withSeat({ type: 'Voter', estimation })
```

and add this case after "accept each estimation tag with a value exactly where the reader may see one", inside the `describe`:

```ts

  it('accept a facilitator seat only with no estimation, and a voter seat only with one', () => {
    expect(strictSnapshotSchema.safeParse(withSeat({ type: 'Facilitator' })).success).toBe(true)
    const holding = withSeat({ type: 'Facilitator', estimation: { type: 'NoEstimation' } })
    expect(strictSnapshotSchema.safeParse(holding).success).toBe(false)
    expect(snapshotSchema.safeParse(withSeat({ type: 'Voter' })).success).toBe(false)
    expect(snapshotSchema.safeParse(withSeat({ type: 'Observer' })).success).toBe(false)
  })
```

In `frontend/src/room/view.test.ts`, replace:

```ts
import type { Estimation, RoomSnapshot } from '../protocol/snapshot'
```

with:

```ts
import type { Estimation, Participant, RoomSnapshot } from '../protocol/snapshot'
```

Replace:

```ts
const row = (id: string, estimation: Estimation) => ({ id, name: id.toUpperCase(), estimation })
```

with:

```ts
const row = (id: string, estimation: Estimation): Participant => ({
  id,
  name: id.toUpperCase(),
  seat: { type: 'Voter', estimation }
})
const facilitator = (id: string): Participant => ({
  id,
  name: id.toUpperCase(),
  seat: { type: 'Facilitator' }
})
```

After the case "reads the reader's own estimation and whether it is confirmed", add:

```ts

  it("gives a facilitator's row no estimation, so the tally leaves them out", () => {
    const s = snap([facilitator('a'), row('b', confirmed('5'))], { votesRevealed: true })
    const view = applySnapshot(s)
    expect(view.users.map(u => [u.voted, u.hasEstimation, u.estimation])).toEqual([
      [false, false, ''],
      [true, true, '5']
    ])
    expect(view.votesSummary).toEqual([['5', 1]])
    expect(view).toMatchObject({ userEstimation: '', ownVoteConfirmed: true })
  })
```

and replace:

```ts
    const named = (id: string, name: string) => ({ id, name, estimation: none })
```

with:

```ts
    const named = (id: string, name: string): Participant => ({
      id,
      name,
      seat: { type: 'Voter', estimation: none }
    })
```

In `frontend/src/room/connection.test.ts`, replace:

```ts
  users: [{ id: 'a', name: 'Alice', estimation: { type: 'NoEstimation' } }]
```

with:

```ts
  users: [{ id: 'a', name: 'Alice', seat: { type: 'Voter', estimation: { type: 'NoEstimation' } } }]
```

Run: `npm run test:unit`

Expected: FAIL, since the schema still wants `estimation` on a participant: every `view.test.ts` case, the three `snapshot.test.ts` cases, the `connection.test.ts` cases that parse a frame, and each "parses … with the strict schema" case of `snapshot.contract.test.ts`.

- [ ] **Step 5: Parse the seat**

In `frontend/src/protocol/snapshot.ts`, replace:

```ts
  const participant = object({ id: z.string(), name: z.string(), estimation })
```

with:

```ts
  // A facilitator's seat has no estimation, so it cannot carry one.
  const seat = z.discriminatedUnion('type', [
    object({ type: z.literal('Voter'), estimation }),
    object({ type: z.literal('Facilitator') })
  ])
  const participant = object({ id: z.string(), name: z.string(), seat })
```

and replace:

```ts
export type Estimation = Participant['estimation']
```

with:

```ts
export type Seat = Participant['seat']
export type Estimation = Extract<Seat, { type: 'Voter' }>['estimation']
```

In `frontend/src/room/view.ts`, replace:

```ts
import type { Estimation, RoomSnapshot } from '../protocol/snapshot'
```

with:

```ts
import type { Estimation, Participant, RoomSnapshot, Seat } from '../protocol/snapshot'
```

and replace `toRow`:

```ts
const toRow = ({ id, name, estimation }: RoomSnapshot['users'][number]): ParticipantRow => ({
  id,
  name,
  voted: confirmed(estimation),
  hasEstimation: estimation.type !== 'NoEstimation',
  estimation: shown(estimation)
})
```

with:

```ts
// A facilitator's row has no estimation, so the tally leaves them out without a rule of its own.
const estimationOf = (seat: Seat): Estimation =>
  seat.type === 'Voter' ? seat.estimation : { type: 'NoEstimation' }

const toRow = ({ id, name, seat }: Participant): ParticipantRow => {
  const estimation = estimationOf(seat)
  return {
    id,
    name,
    voted: confirmed(estimation),
    hasEstimation: estimation.type !== 'NoEstimation',
    estimation: shown(estimation)
  }
}
```

A facilitator's row renders as a voter's row with no vote until 2c marks it.

- [ ] **Step 6: Run the client checks**

Run: `npm run typecheck && npm run lint && npm run test:unit`

Expected: clean, then `Tests  93 passed (93)`. `test:unit` reads Step 3's nine contract files.

- [ ] **Step 7: Run the e2e suite unchanged**

Run: `npm run e2e`

Expected: `112 passed`.

- [ ] **Step 8: Check the step's files**

```bash
git status --short
```

Expected: exactly the ten files under **Files** above, all `M`.

- [ ] **Step 9: Show the seat's tests bite**

Save each row's file before its mutation, and restore it after the run:

```bash
F=src/main/scala/com/lunatech/pointingpoker/actors/RoomSnapshot.scala  # row 3: frontend/src/protocol/snapshot.ts
cp "$F" "${TMPDIR:-/tmp}/mutant.good"
cp "${TMPDIR:-/tmp}/mutant.good" "$F"  # after the run
```

Do not restore with `git checkout`: the file holds this task's uncommitted change, which it would discard.

| # | Mutation | Run | Must fail, and nothing else |
| --- | --- | --- | --- |
| 1 | In `RoomSnapshot.scala`, replace `case Facilitator => tagged("Facilitator")` with `case Facilitator => tagged("Facilitator", "estimation" -> Encoder[Estimation].apply(Estimation.NoEstimation))` | `sbt -batch test`, then `npm run test:unit` | "put a facilitator on the wire as a seat with no estimation, before and after the reveal"; then "parses seat-facilitator.json with the strict schema" |
| 2 | In `RoomSnapshot.scala`, replace `case Some(Room.Seat.Facilitator) => Seat.Facilitator` with `case Some(Room.Seat.Facilitator) => Seat.Voter(Estimation.NoEstimation)` | `sbt -batch test` | the same RoomSnapshotSpec case; "write a representative snapshot for seat-facilitator" |
| 3 | In `snapshot.ts`, replace `object({ type: z.literal('Facilitator') })` with `object({ type: z.literal('Facilitator'), estimation: estimation.optional() })` | `npm run test:unit` | "accept a facilitator seat only with no estimation, and a voter seat only with one" |

After the last restore, run `sbt -batch test` once more, so `target/contract/` holds the good files again.

- [ ] **Step 10: Commit**

```bash
git add src/main/scala/com/lunatech/pointingpoker/actors/RoomSnapshot.scala \
  src/test/scala/com/lunatech/pointingpoker/actors/RoomDataFixtures.scala \
  src/test/scala/com/lunatech/pointingpoker/actors/RoomSnapshotSpec.scala \
  src/test/scala/com/lunatech/pointingpoker/actors/SnapshotContractSpec.scala \
  src/test/scala/com/lunatech/pointingpoker/sse/SSESpec.scala \
  frontend/src/protocol/snapshot.ts frontend/src/protocol/snapshot.test.ts \
  frontend/src/room/view.ts frontend/src/room/view.test.ts frontend/src/room/connection.test.ts
git commit -m "feat: carry each participant's seat in the snapshot (ui refresh step 2b)" -m "A participant holds a tagged seat, Voter with its estimation or Facilitator with none, so a facilitator's estimation cannot be written in Scala or in zod. Redaction is unchanged. The contract gains a seat-facilitator state. The page reads a facilitator's row as one with no estimation, so the tally leaves it out."
git status --short
```

Expected: `git status --short` prints nothing.

### Task 3: Take a role on /join and switch it through /role

**Files:**
- Modify: `src/main/scala/com/lunatech/pointingpoker/Requests.scala`
- Modify: `src/main/scala/com/lunatech/pointingpoker/Endpoints.scala`
- Modify: `src/main/scala/com/lunatech/pointingpoker/API.scala`
- Modify: `src/main/scala/com/lunatech/pointingpoker/actors/RoomManager.scala`
- Modify: `src/test/scala/com/lunatech/pointingpoker/APISpec.scala`
- Modify: `src/test/scala/com/lunatech/pointingpoker/actors/RoomManagerSpec.scala`
- Modify: `frontend/src/protocol/generated/openapi.json`, `frontend/src/protocol/generated/openapi.d.ts` (generated)
- Modify: `frontend/src/protocol/api.ts`
- Modify: `test/reproduction.test.js`
- Modify: `docs/known-issues.md`

**Interfaces:**
- Consumes: Task 1's `Room.Role`, `Room.SwitchRole`, `Room.NotAVoter` and `RoomManager.RequestSession`.
- Produces, for step 2c:
  - `JoinRequest(name: String, role: Room.Role)` and `RoleRequest(role: Room.Role)`, with `role` on the wire as `"Voter"` or `"Facilitator"`;
  - `RoleWire`'s givens `Encoder`, `Decoder` and `Schema` for `Room.Role`;
  - `Endpoints.role`: `POST /rooms/{roomId}/role`, 204, 400, 401, 403;
  - `RoomManager.SwitchRole(roomId: Slug, token: Option[Room.SessionToken], role: Room.Role, replyTo: ActorRef[Room.CommandResult])`;
  - in the generated types, `components["schemas"]["Role"]` as `"Facilitator" | "Voter"`.

- [ ] **Step 1: Write the failing server tests**

In `APISpec.scala`, replace:

```scala
import com.lunatech.pointingpoker.{EditIssueRequest, VoteRequest}
```

with:

```scala
import com.lunatech.pointingpoker.{EditIssueRequest, RoleRequest, VoteRequest}
```

After the `createReply` field, add:

```scala
  // The role the last join carried, kept off commandProbe so joins cannot leak into its cases.
  val joinedRole: java.util.concurrent.atomic.AtomicReference[Option[Room.Role]] =
    new java.util.concurrent.atomic.AtomicReference(None)
```

In the stub, replace:

```scala
      case RoomManager.RequestSession(_, _, _, existing, replyTo) =>
        replyTo ! Room.SessionMinted(UUID.randomUUID(), existing.getOrElse(validToken))
```

with:

```scala
      case RoomManager.RequestSession(_, _, role, existing, replyTo) =>
        joinedRole.set(Some(role))
        replyTo ! Room.SessionMinted(UUID.randomUUID(), existing.getOrElse(validToken))
```

and, in its inner match, after the `RoomManager.Depart` line, add:

```scala
          case RoomManager.SwitchRole(_, _, _, replyTo) => replyTo ! commandReply.get()
```

Replace every `json(JoinRequest("Alice"))` with `json(JoinRequest("Alice", Room.Role.Voter))`. There are four.

Before the case "reject malformed JSON on join endpoint with 400", add:

```scala
    "pass the join's role to the manager" in {
      Post(
        s"/rooms/$roomId/join",
        json(JoinRequest("Alice", Room.Role.Facilitator))
      ) ~> apiRoute ~> check {
        status mustBe StatusCodes.NoContent
      }
      joinedRole.get() mustBe Some(Room.Role.Facilitator)
    }

    // Decision 5: a join states a role, as it states a name, so a missing one is not a default.
    "answer 400 for a join with no role or another value, without asking the manager" in {
      joinedRole.set(None)
      for body <- List("""{"name": "Alice"}""", """{"name": "Alice", "role": "Observer"}""") do
        Post(
          s"/rooms/$roomId/join",
          HttpEntity(ContentTypes.`application/json`, body)
        ) ~> apiRoute ~> check {
          status mustBe StatusCodes.BadRequest
        }
      joinedRole.get() mustBe None
    }

```

Before the case "answer 400 for a blank estimation without asking the room", add:

```scala
    "answer 409 for a vote from a facilitator" in {
      voteReply.set(Room.NotAVoter)
      try
        Post(s"/rooms/$roomId/vote", json(VoteRequest("5"))) ~> addHeader(
          Cookie("session", Room.SessionToken.mint().raw)
        ) ~> apiRoute ~> check {
          status mustBe StatusCodes.Conflict
        }
      finally voteReply.set(Room.Applied)
      // Drains the dispatched Vote so it cannot leak into a later expectNoMessage.
      commandProbe.expectMessageType[RoomManager.Vote]
    }

    "dispatch a role switch for each role" in {
      val token = Room.SessionToken.mint()
      for role <- Room.Role.values do
        Post(s"/rooms/$roomId/role", json(RoleRequest(role))) ~> addHeader(
          Cookie("session", token.raw)
        ) ~> apiRoute ~> check {
          status mustBe StatusCodes.NoContent
        }
        commandProbe.expectMessageType[RoomManager.SwitchRole] match
          case RoomManager.SwitchRole(id, tok, switchedTo, _) =>
            (id, tok, switchedTo) mustBe (roomId, Some(token), role)
    }

    "answer 401 and 403 for a role switch, as for Show and Clear" in {
      for (refusal, expected) <- List(
          Room.NoSession  -> StatusCodes.Unauthorized,
          Room.NotAMember -> StatusCodes.Forbidden
        )
      do
        commandReply.set(refusal)
        try
          Post(s"/rooms/$roomId/role", json(RoleRequest(Room.Role.Facilitator))) ~> addHeader(
            Cookie("session", Room.SessionToken.mint().raw)
          ) ~> apiRoute ~> check {
            status mustBe expected
          }
        finally commandReply.set(Room.Applied)
        commandProbe.expectMessageType[RoomManager.SwitchRole]
    }

    "answer 400 for a role switch to any other value, without asking the room" in {
      for body <- List("""{"role": "Observer"}""", """{"role": "voter"}""", "{}") do
        Post(
          s"/rooms/$roomId/role",
          HttpEntity(ContentTypes.`application/json`, body)
        ) ~> addHeader(Cookie("session", Room.SessionToken.mint().raw)) ~> apiRoute ~> check {
          status mustBe StatusCodes.BadRequest
        }
      commandProbe.expectNoMessage(300.millis)
    }

```

In `RoomManagerSpec.scala`, in "handle typed per-command messages", replace:

```scala
      managerRef ! RoomManager.Depart(roomId, Some(token), connectionId, replyProbe.ref)
```

with:

```scala
      managerRef ! RoomManager.Depart(roomId, Some(token), connectionId, replyProbe.ref)
      managerRef ! RoomManager.SwitchRole(
        roomId,
        Some(token),
        Room.Role.Facilitator,
        replyProbe.ref
      )
```

and replace:

```scala
      roomProbe.expectMessage(Room.Depart(token, connectionId, replyProbe.ref))
```

with:

```scala
      roomProbe.expectMessage(Room.Depart(token, connectionId, replyProbe.ref))
      roomProbe.expectMessage(Room.SwitchRole(token, Room.Role.Facilitator, replyProbe.ref))
```

Run: `sbt -batch Test/compile`

Expected: FAIL to compile, at `RoleRequest`, `RoomManager.SwitchRole` and the two-argument `JoinRequest`.

- [ ] **Step 2: Decode the role**

In `Requests.scala`, replace:

```scala
import sttp.tapir.{Schema, ValidationResult, Validator}

case class JoinRequest(name: String)
```

with:

```scala
import sttp.tapir.{Schema, ValidationResult, Validator}

import com.lunatech.pointingpoker.actors.Room
import com.lunatech.pointingpoker.RoleWire.given

// The wire's names for a role, for both requests that carry one.
object RoleWire:
  // Explicit tags rather than toString: renaming a case must not silently rename the wire.
  private def tag(role: Room.Role): String = role match
    case Room.Role.Voter       => "Voter"
    case Room.Role.Facilitator => "Facilitator"

  given Encoder[Room.Role] = Encoder.encodeString.contramap(tag)
  // Any other value fails to decode, which tapir answers with 400.
  given Decoder[Room.Role] = Decoder.decodeString.emap(raw =>
    Room.Role.values.find(tag(_) == raw).toRight(s"not a role: $raw")
  )
  given Schema[Room.Role] = Schema.derivedEnumeration[Room.Role](encode = Some(tag))
end RoleWire

case class JoinRequest(name: String, role: Room.Role)
```

and, before `case class EditIssueRequest(issue: String)`, add:

```scala
case class RoleRequest(role: Room.Role)
object RoleRequest:
  given Decoder[RoleRequest] = deriveDecoder[RoleRequest]
  given Encoder[RoleRequest] = deriveEncoder[RoleRequest]
  given Schema[RoleRequest]  = Schema.derived[RoleRequest]

```

- [ ] **Step 3: Add the endpoint and its relay**

In `Endpoints.scala`, replace:

```scala
  val editIssue = command("edit-issue").in(jsonBody[EditIssueRequest])
```

with:

```scala
  val editIssue = command("edit-issue").in(jsonBody[EditIssueRequest])
  val role      = command("role").in(jsonBody[RoleRequest])
```

and in `all`, replace `editIssue, leave)` with `editIssue, role, leave)`.

In `API.scala`, in the join's `RoomManager.RequestSession(...)`, replace the line `Room.Role.Voter,` with `request.role,`. Before `Endpoints.leave.serverLogic`, add:

```scala
    Endpoints.role.serverLogic[Future] { (roomId, rawCookie, request) =>
      roomManager
        .ask[Room.CommandResult](
          RoomManager.SwitchRole(roomId, resolveToken(rawCookie), request.role, _)
        )
        .map(answer)
    },
```

In `RoomManager.scala`, before `case class RequestSession(`, add:

```scala
  case class SwitchRole(
      roomId: Slug,
      token: Option[Room.SessionToken],
      role: Room.Role,
      replyTo: ActorRef[Room.CommandResult]
  ) extends Command
```

and before `case Depart(roomId, token, connectionId, replyTo) =>`, add:

```scala
          case SwitchRole(roomId, token, role, replyTo) =>
            relay(roomId, token, replyTo)(t => Room.SwitchRole(t, role, replyTo))
```

- [ ] **Step 4: Run the server suites**

Run: `sbt -batch scalafmtAll test`

Expected: `Tests: succeeded 337, failed 0`.

- [ ] **Step 5: Regenerate the API document and see the page fail to typecheck**

```bash
sbt -batch genOpenApi
npm run gen:api
git diff --stat frontend/src/protocol/generated
npm run typecheck
```

Expected: both generated files change. `openapi.json` gains the path `/rooms/{roomId}/role` (204, 400, 401, 403) and the schemas `Role` (a string enum of `Facilitator` and `Voter`) and `RoleRequest`, and `JoinRequest` now requires `role`. Typecheck fails in `api.ts`: `Property 'role' is missing in type '{ name: string; }'`.

- [ ] **Step 6: Send the role from the page**

In `frontend/src/protocol/api.ts`, replace:

```ts
export async function join(roomId: string, name: string): Promise<JoinOutcome> {
  const { response } = await timed(signal =>
    client.POST('/rooms/{roomId}/join', { params: { path: { roomId } }, body: { name }, signal })
  )
```

with:

```ts
export async function join(roomId: string, name: string): Promise<JoinOutcome> {
  const { response } = await timed(signal =>
    client.POST('/rooms/{roomId}/join', {
      params: { path: { roomId } },
      // Every join is a voter's until the page offers roles (ui refresh step 2c).
      body: { name, role: 'Voter' },
      signal
    })
  )
```

In `test/reproduction.test.js`, replace:

```js
    body: JSON.stringify({ name: 'Ada' })
```

with:

```js
    body: JSON.stringify({ name: 'Ada', role: 'Voter' })
```

Run: `npm run typecheck && npm run lint && npm run test:unit && npm test`

Expected: clean; `Tests  93 passed (93)`; `ℹ pass 17` and `ℹ fail 0`. Then, to see the reproduction's join bite, remove `, role: 'Voter'` from that line, run `node --test "test/**/*.test.js"` (expected `ℹ fail 1`), and put it back.

- [ ] **Step 7: Note the validation in known-issues**

In `docs/known-issues.md`, at the end of "No request payload is validated on any endpoint that takes one", after the paragraph ending "piece of work rather than a patch per endpoint.", add:

```markdown

  UI refresh step 2b added `role` to `/join` and a `/role` endpoint taking only
  `role`. That field is validated by the schema: any value but `Voter` or
  `Facilitator`, or none, answers `400` before the ask reaches the manager.
```

- [ ] **Step 8: Run the e2e suite unchanged**

Run: `npm run e2e`

Expected: `112 passed`.

- [ ] **Step 9: Show the request tests bite**

Save and restore each row's file as in Task 2, Step 9, run `sbt -batch test`, and check the failures. The files are `src/main/scala/com/lunatech/pointingpoker/Requests.scala`, `API.scala` and `Endpoints.scala` beside it, and `actors/RoomManager.scala` under it.

| # | Mutation | Must fail |
| --- | --- | --- |
| 1 | In `Requests.scala`, replace `Room.Role.values.find(tag(_) == raw)` with `Room.Role.values.find(tag(_).equalsIgnoreCase(raw))` | "answer 400 for a role switch to any other value, without asking the room" |
| 2 | In `API.scala`'s join, replace `request.role,` with `Room.Role.Voter,` | "pass the join's role to the manager" |
| 3 | In `API.scala`'s role endpoint, replace `request.role, _)` with `Room.Role.Voter, _)` | "dispatch a role switch for each role" |
| 4 | In `RoomManager.scala`, replace `Room.SwitchRole(t, role, replyTo)` with `Room.SwitchRole(t, Room.Role.Voter, replyTo)` | "handle typed per-command messages" |
| 5 | In `Endpoints.scala`, replace `case Room.NotAVoter       => StatusCode.Conflict` with `case Room.NotAVoter       => StatusCode.Forbidden` | "answer 409 for a vote from a facilitator" |

Rows 1 and 5 also fail one or two later `APISpec` cases. A case that fails inside `check` skips its drain, and the shared `commandProbe` hands its message to the next case. The existing 401, 403 and 409 cases share that shape, so this plan does not change it. Only the case listed is the mutation's own.

- [ ] **Step 10: Commit**

```bash
git add src/main/scala/com/lunatech/pointingpoker/Requests.scala \
  src/main/scala/com/lunatech/pointingpoker/Endpoints.scala \
  src/main/scala/com/lunatech/pointingpoker/API.scala \
  src/main/scala/com/lunatech/pointingpoker/actors/RoomManager.scala \
  src/test/scala/com/lunatech/pointingpoker/APISpec.scala \
  src/test/scala/com/lunatech/pointingpoker/actors/RoomManagerSpec.scala \
  frontend/src/protocol/generated/openapi.json frontend/src/protocol/generated/openapi.d.ts \
  frontend/src/protocol/api.ts test/reproduction.test.js docs/known-issues.md
git commit -m "feat: take a role on /join and switch it through /role (ui refresh step 2b)" -m "Every join states a role, as it states a name, and the server applies it. POST /rooms/{id}/role switches it: 204, 401 and 403 as Show and Clear, 400 for any other value. A facilitator's vote answers 409, as a vote into a revealed round does. The page always joins as a voter until step 2c."
git status --short
```

Expected: `git status --short` prints nothing.

### Task 4: Prove the step whole, and mark it landed

**Files:**
- Modify: `docs/superpowers/specs/2026-10-04-ui-refresh-2-roles-design.md` (the `Status:` line only)

**Interfaces:**
- Consumes: the three code commits.
- Produces: no code.

- [ ] **Step 1: Run every check**

```bash
sbt -batch qa styleCheck
npm run typecheck && npm run lint
npm run test:unit
npm test
npm run e2e
```

Expected: `Tests: succeeded 337, failed 0` with statement coverage near 93.9%, and styleCheck clean; typecheck and lint clean; `Tests  93 passed (93)`; `ℹ pass 17`; `112 passed`.

- [ ] **Step 2: Check the step left the protected files alone**

```bash
git diff --stat HEAD~3 HEAD -- e2e frontend/src/components frontend/src/room/connection.ts docs/superpowers/specs/2026-08-31-protocol-target-architecture-design.md
git diff --exit-code frontend/src/protocol/generated && echo GENERATED-COMMITTED
```

Expected: the first prints nothing; the second prints `GENERATED-COMMITTED`.

- [ ] **Step 3: Mark step 2b landed in the spec**

In `docs/superpowers/specs/2026-10-04-ui-refresh-2-roles-design.md`, replace:

```
Status: Validated. Step 2a landed; steps 2b and 2c not yet implemented
```

with:

```
Status: Validated. Steps 2a and 2b landed; step 2c not yet implemented
```

```bash
git add docs/superpowers/specs/2026-10-04-ui-refresh-2-roles-design.md
git commit -m "docs: mark ui refresh step 2b landed"
```
