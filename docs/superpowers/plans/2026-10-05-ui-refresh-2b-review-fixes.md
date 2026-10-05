# UI Refresh Step 2b Review Round: Fixes

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Land what the review round over step 2b decided: one table naming a role on the
wire, one reading of a member's seat, a latch on a change of seat rather than a second
same-role check, a matrix that refuses a stray reply, and the docs the round found stale.

**Architecture:** No new mechanism. `RoomSnapshot.Seat` gains `role`, and `Seat.tag` becomes
the only table of a role's wire name, which `RoleWire` reads. `RoomData.seatOf` becomes the
only reading of a member's seat. The wire bytes do not change.

**Tech Stack:** as the step 2b plan, `2026-10-05-ui-refresh-2b-roles-wire.md`.

**Spec:** `docs/superpowers/specs/2026-10-04-ui-refresh-2-roles-design.md`, step 2b.

**Branch:** `20260930.ui_refresh_2b_roles_wire` (PR #433, stacked on #432), on top of
`3064366`. These fixes land before the stack merges, so no rebase is involved.

## The round, and what it decided

One wave of three fresh reviewers ran over `9ddae4c..68273b8`, one lens each: failure modes,
simplicity, consistency with the code. None found a Critical or an Important defect in the
code. Each finding was checked against the code before it was decided:

| # | Finding | Decision |
|---|---|---|
| A | `README.md` documents the pre-2b wire: no `seat`, a name-only `/join`, no `/role` | Fixed in `3064366`, before this plan |
| B | `RoleWire.tag` and the `Seat` encoder each spell `Voter` and `Facilitator`, and 2c sends a seat's tag back as `role` | One server table: Task 1. The client half is handed to 2c: Task 3 |
| C | `switchRole` decides "same role" itself, and `Seat.switchedTo` decides it again | Latch on a change of seat: Task 2 |
| D | A member with no seat reads four ways: unconfirmed voter, not a voter, no change, `Voter(NoEstimation)` | One total reading, `seatOf`: Task 2 |
| E | The seat matrix never checks that no second reply, or a reply to a reconnect, arrives | `expectNoMessage(20.millis)` per cell: Task 2 |
| - | Wording: the known-issues entry, `complete`'s `voters`, the PR body | Tasks 2 and 3, and Task 4 for the PR body |
| - | A facilitator made through the API becomes a voter on reload of today's page | No action: the 2b plan's Review Focus 5 accepts it, and the stack merges in one window |
| - | A bad `/role` body with no cookie answers `400`, not `401` | No action: tapir decodes the body first, as on `/vote` |
| - | The spec's 2b pass condition says "validated by the schema"; the code decodes | No action: known-issues says "the body decoder", and the 2b half of the spec is delivered |

**Why B is one table, not a test that two agree.** A test would hold only until someone
rewrote it, and two tables would still exist. With the encoder writing `tag(seat.role)`, a
seat's tag and a request's `role` cannot differ. The table moves into `actors`, beside the
snapshot, because `Requests.scala` already imports `actors` and `actors` imports no tapir.
This reopens the 2b plan's P4 for this one pair; `Estimation` keeps its own table.

**Why D reverses "fail closed".** 2a's P2 and the 2b plan's Consequences read a seatless
member four ways, and the snapshot then showed a voter whose vote was refused. `seatOf` reads
a missing seat as a new voter's, the role every identity had before 2b. So `vote` now
accepts such a member's vote, and `vote` and a seat-changing `switched` write the seat, which
repairs the state; a same-role `/role` leaves it missing, which reads the same. `RoomData.of`
still `require`s a seat per session, so no test can build the state, and none can pin this
reading.

## Global Constraints

As the 2b plan's, and:

- The wire must not change: `sbt genOpenApi` leaves `frontend/src/protocol/generated/`
  untouched, and the contract files keep their bytes.
- Push only once Task 4 passes. Do not merge: every merge to `main` ends every live room.

## How the code in this plan was verified

Every patch below was applied and run on 2026-10-05 in a scratch worktree at `3064366`.

- `sbt genOpenApi test styleCheck` passed 337 tests after each task, and left
  `frontend/src/protocol/generated/` unchanged.
- Each mutation named in a task was applied alone and failed exactly what the task names.
- **Noise to ignore**, as in the 2b plan: the `sun.misc.Unsafe` and `LazyVals` warnings sbt
  prints as `[error] WARNING`, and the stack trace `RoomManagerSpec` logs while passing.

---

### Before Task 1: commit this plan

- [ ] `git add docs/superpowers/plans/2026-10-05-ui-refresh-2b-review-fixes.md`
- [ ] `git commit -m "docs: plan the ui refresh step 2b review fixes"`

### Task 1: Name a role on the wire through one table

**Judged by:** the existing tests passing unchanged, with the wire byte-identical.

- [ ] **Step 1.** In `RoomSnapshot.scala`, give the wire `Seat` its role and make `Seat.tag`
  the table:

```scala
  enum Seat:
    case Voter(estimation: Estimation)
    case Facilitator

    def role: Room.Role = this match
      case Voter(_)    => Room.Role.Voter
      case Facilitator => Room.Role.Facilitator

  object Seat:
    // The one table of a role's wire name, so a seat's tag is what a request's role sends back.
    // Explicit rather than toString: renaming a case must not silently rename the wire.
    def tag(role: Room.Role): String = role match
      case Room.Role.Voter       => "Voter"
      case Room.Role.Facilitator => "Facilitator"

    given Encoder[Seat] = Encoder.instance(seat =>
      val fields = seat match
        case Voter(estimation) => List("estimation" -> Encoder[Estimation].apply(estimation))
        case Facilitator       => Nil
      tagged(tag(seat.role), fields*)
    )
  end Seat
```

- [ ] **Step 2.** In `Requests.scala`, import `RoomSnapshot` beside `Room`, and replace
  `RoleWire`'s comment and table:

```scala
// The role's codecs, for both requests that carry one, named by the snapshot seat's tag.
object RoleWire:
  private def tag(role: Room.Role): String = RoomSnapshot.Seat.tag(role)
```

- [ ] **Step 3.** `sbt scalafmtAll genOpenApi test styleCheck`: 337 pass, and
  `git status --porcelain` lists only the two files.
- [ ] **Step 4. The table bites.** Change `"Facilitator"` to `"Host"` in `Seat.tag`. Exactly
  two fail: "write a representative snapshot for seat-facilitator" and "put a facilitator on
  the wire as a seat with no estimation, before and after the reveal". Revert.
- [ ] **Step 5.** `git commit -am "refactor: name a role on the wire through one table (ui refresh step 2b)"`

### Task 2: Read a member's seat one way, and latch on a change of it

**Judged by:** the existing tests passing unchanged, one new no-stray-reply assertion, and two
mutations.

- [ ] **Step 1.** In `Room.scala`, add the reading after `holdsConnection`:

```scala
    // The one reading of a seat: of requires one per session; a missing one is a new voter's.
    private[actors] def seatOf(userId: UUID): Seat =
      this.state.seats.getOrElse(userId, Seat.Voter(None))
```

- [ ] **Step 2.** Route every reader through it:
  - `vote` matches `seatOf(userId)`: `case Seat.Voter(_)` as before, then
    `case Seat.Facilitator => (this, NotAVoter)`.
  - `switchRole` becomes:

    ```scala
          val next = switched(userId, role)
          if next.seatOf(userId) == seatOf(userId) then this else next.latched
    ```

  - `switched` writes `this.state.seats + (userId -> seatOf(userId).switchedTo(role))`.
  - `complete` drops its `None` case and its second comment sentence, matches `seatOf(id)`,
    and renames `voters` to `confirmations`.
  - In `RoomSnapshot.of`, drop the seatless-member comment and match `data.seatOf(id)` on
    `Room.Seat.Voter(e)` and `Room.Seat.Facilitator`.
- [ ] **Step 3.** In `RoomSpec`'s `"A seat" should` loop, after the `revealed` assertion:

```scala
        // One reply at most: a second would be a stray.
        replyProbe.expectNoMessage(20.millis)
```

- [ ] **Step 4.** `sbt scalafmtAll genOpenApi test styleCheck`: 337 pass, generated files
  unchanged.
- [ ] **Step 5. The latch rule bites.** Make `switchRole` return `next.latched`
  unconditionally. Exactly two fail: "open round: A switches to facilitator through /role,
  from Facilitator" and "open round: A switches to voter through /role, from
  Voter(confirmed)". Revert.
- [ ] **Step 6. The stray-reply check bites.** Make the `SwitchRole` handler send
  `replyTo ! Applied` before its `act`. `testOnly *RoomSpec` fails 24 of 182. With the Step 3
  line also removed, all 182 pass, so the new line is what catches it. Revert both.
- [ ] **Step 7.** `git commit -am "refactor: read a member's seat one way, and latch on a change of it (ui refresh step 2b)"`

### Task 3: Bring the docs in line

- [ ] **Step 1.** In `docs/known-issues.md`, "No request payload is validated on any endpoint
  that takes one":
  - "Where" lists `RoleRequest` beside the other three requests, and the `role` endpoint
    beside `join`, `vote` and `editIssue`.
  - "Issue" opens "Every free-text field is a bare `String` with no constraint on it; `role`
    alone is a closed set."
  - The 2b paragraph, rewrapped whole: "UI refresh step 2b added `role` to `/join` and a
    `/role` endpoint taking only `role`. The body decoder rejects a missing `role` and any
    value but `Voter` or `Facilitator`, so the request answers `400` before the ask reaches
    the manager."
- [ ] **Step 2.** In the roles spec, after "Step 2b left one server case for 2c to decide",
  add: "Step 2b made one server table name a role on the wire (`RoomSnapshot.Seat.tag`), so a
  seat's `type` is what `role` sends back. The client still spells the tags twice, in
  `snapshot.ts`'s `z.literal`s and the generated `Role`; 2c's plan should type the remembered
  role as `components['schemas']['Role']` and make `Seat['type']` assignable to it, so
  `gen:api` and the typecheck catch drift."
- [ ] **Step 3.** `git commit -am "docs: bring known-issues and the 2c handoff in line with the 2b review (ui refresh step 2b)"`

### Task 4: Prove the step whole, and publish

- [ ] **Step 1.** `sbt qa styleCheck`: 337 pass.
- [ ] **Step 2.** At the root: `npm run gen:api` leaves no diff, then `npm run typecheck`,
  `npm run lint`, `npm run test:unit` (93) and `npm test` (17) pass.
- [ ] **Step 3.** `npm run e2e` passes 112 of 112.
- [ ] **Step 4.** Rewrite PR #433's body without its literal `\"` and `` \` `` sequences,
  through `gh pr edit 433 --body-file`, and add a line on this round.
- [ ] **Step 5.** `git push`.
