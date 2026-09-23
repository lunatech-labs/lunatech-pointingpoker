# Step 6 Second Review Round: Fixes

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Land what the second review round over the step 6 branch decided: a
page that mints its connection id outside a secure context, a reply type per
endpoint that names only the results that endpoint can answer, and the design
corrections the round's dismissed findings still owed.

**Architecture:** No new mechanism. The client gains a fallback for
`crypto.randomUUID()`. `Room`'s result hierarchy becomes two enums behind two
per-endpoint aliases, `API` derives each `oneOf` from those enums through one
exhaustive `status` match, and `build.sbt` makes an incomplete match fatal. The
four copy-pasted apply blocks in `Room` and the six relays in `RoomManager`
collapse into one helper each, since the type change rewrites exactly those lines.

**Tech Stack:** as the step 6 plan, `2026-08-31-protocol-architecture-6-write-path.md`.

**Spec:** `docs/superpowers/specs/2026-08-31-protocol-target-architecture-design.md`,
the step 6 section and section 3's connection-id rules.

**Branch:** `20260831.protocol_architecture_6_write_path`, on top of `f78e4db`.
These fixes land before the branch merges, so no rebase is involved.

## The round, and what it decided

A correctness review (`/code-review high` over `main...HEAD`) and a security
review ran over the whole branch. The security review found nothing at MEDIUM or
above: `/leave` resolves the member from the cookie before it looks up a
connection id, so an id can only ever reach the caller's own map, and a join's
cookie resumes only a session the room's own actor holds. The correctness review
raised ten candidates, each checked against the code before it was decided:

| # | Finding | Decision |
|---|---|---|
| A | `crypto.randomUUID()` is undefined outside a secure context, so a plain-HTTP LAN page throws before Vue mounts | Fix for development use, and scope the one message inviting a plain-HTTP deployment: task 1 |
| B | A refused `Join`'s completion re-arms a pending `ConfirmLeave` | No code; the spec's reachability paragraph is stale and gains the path: task 3 |
| C | `APISpec`'s `commandReply` comment is three lines | Fix: task 2 |
| D | A Leave then an in-page rejoin reuses the page's connection id | No code; one sentence in the spec: task 3 |
| E | `RoomManager` drops a `ConnectToRoom` for an absent room silently | No action: pre-existing on `main`, unreachable except by a crash, and a one-line fix covers half the window |
| F | Every command replies through a type admitting results its endpoint has no variant for | Fix, with exhaustiveness made fatal: task 2 |
| G | Six copy-pasted relays and four copy-pasted apply blocks | Fold into F: task 2 |
| - | A cached pre-deploy page draws `/events`' `400` | Dismissed: recorded in the step 6 section already |
| - | A reload's beacon removes the member at once | Dismissed: accepted in section 3 as a departure plus a later vote |
| - | A same-id reconnect replaces a ref without ending its stream | Dismissed: deliberate, `199a3d1` already narrowed the comment that overstated it |

**Why B takes no code.** A refusal needs `RequestSession` to rename the session
between a reconnect's `ValidateToken` and its `Join`, which takes two tabs, one
of which has cleared its stored name through Leave and rejoins under a different
one within milliseconds of the other's reconnect. The re-armed timer is then
cancelled by the joining tab's own `Join` in every ordering but the one where it
never connects. A guard on `Leave` was considered and declined: it would make
"a member with no connections has a pending `ConfirmLeave`" load-bearing, where
today a stray `Leave` re-arms a timer that should be pending anyway.

**Why F is the full version.** Narrowing the reply types alone closes one of the
two lists that must agree, what a handler may send; the other, what an endpoint's
`oneOf` maps, stays a hand-kept runtime list, and a refusal added later would
still answer `500`. Deriving the variants from the enums and making the
exhaustivity warning fatal closes both. `-Werror` was measured and declined for
this branch: it trips on `Main extends App` and 28 positional implicits in the
test suite, all pre-existing. Clearing those becomes step 6a, recorded by task 3.

## Task 1: The page mints its id without a secure context

**Files:**
- Modify: `e2e/fixtures.js` (the `join` fixture)
- Modify: `e2e/room.spec.js`
- Modify: `src/main/resources/pages/index.html` (`connectionId`)
- Modify: `src/main/scala/com/lunatech/pointingpoker/API.scala` (the `events`
  no-cookie warning)
- Modify: `docs/superpowers/specs/2026-08-31-protocol-target-architecture-design.md`
  (the paragraph beginning "**The page mints one id per page instance**")

The fallback serves development: several people on separate machines, operating
systems or browsers joining one dev server over a LAN address, which localhost
cannot reproduce. It opens nothing in production. With `secure-cookies` at its
default of `true`, a plain-HTTP visitor never gets the `Secure` session cookie
back, so `/events` answers `401` and the page ends there. Step 6 below stops the
one message that presents `SECURE_COOKIES=false` as a deployment option.

- [ ] **Step 1: Let `join` take an init script**

In `e2e/fixtures.js`, the `join` fixture's inner function:

```js
    const join = async (name, { initScript } = {}) => {
      const context = await browser.newContext({ baseURL: origin })
      // Tracked before anything else can throw, so a half-built participant is still torn down.
      closers.push(() => context.close())
      await context.route(CDN, assets)
      if (initScript) await context.addInitScript(initScript)
```

- [ ] **Step 2: Write the failing browser case**

In `e2e/room.spec.js`, directly before "the issue box is readonly until the
pencil is pressed":

```js
// Plain HTTP off localhost is not a secure context, and randomUUID is undefined there.
test('a page without crypto.randomUUID still joins and leaves', async ({ join }) => {
  const alice = await join('Alice')
  const bob = await join('Bob', { initScript: () => delete Crypto.prototype.randomUUID })
  await expect(participantRows(alice.page)).toHaveCount(2)
  // The leave names the fallback's id, so a malformed one would draw a 400 and leave Bob listed.
  await bob.page.getByRole('link', { name: 'Leave' }).click()
  await expect(participantRow(alice.page, 'Bob')).toHaveCount(0)
})
```

Deleting from `Crypto.prototype` is what a non-secure context looks like to the
page, and it is portable where a LAN address is not.

- [ ] **Step 3: Run it and watch it fail**

Run: `npm run e2e -- --project=chromium -g "without crypto.randomUUID"`
Expected: FAIL in the `join` fixture on `expect(nameInput(page)).toBeVisible`,
for Bob. The script threw at `crypto.randomUUID()` before `new Vue`, so the name
input never rendered.

- [ ] **Step 4: Add the fallback**

In `index.html`, replace `var connectionId = crypto.randomUUID();` and keep its
comment:

```js
    // randomUUID exists only in a secure context; getRandomValues also works over plain HTTP.
    function mintConnectionId() {
      if (crypto.randomUUID) return crypto.randomUUID();
      var bytes = crypto.getRandomValues(new Uint8Array(16));
      bytes[6] = (bytes[6] & 0x0f) | 0x40; // version 4
      bytes[8] = (bytes[8] & 0x3f) | 0x80; // RFC 4122 variant
      var hex = Array.from(bytes, function (b) { return b.toString(16).padStart(2, '0'); });
      return hex.join('').replace(/^(.{8})(.{4})(.{4})(.{4})/, '$1-$2-$3-$4-');
    }
    // One per page instance, never persisted: a reload must mint a new one, or its own late
    // beacon would name the id the replacement page is now using.
    var connectionId = mintConnectionId();
```

- [ ] **Step 5: Run it in both browsers**

Run: `npm run e2e -- -g "without crypto.randomUUID"`
Expected: 2 passed.

- [ ] **Step 6: Scope the no-cookie warning to development**

In `API.scala`, the `events` logic's `log.warn` for a no-cookie request that
did not arrive over HTTPS, change one clause of the message:

```
Set SECURE_COOKIES=false for non-HTTPS deployments, or confirm your reverse proxy sets X-Forwarded-Proto.
```

becomes

```
Set SECURE_COOKIES=false for local plain-HTTP development, or confirm your reverse proxy sets X-Forwarded-Proto.
```

That is the wording `Main.scala`'s startup warning already uses. Nothing in
`src/test` or `e2e` asserts the message, so no test changes. Run
`sbt scalafmtCheckAll` to confirm the line still formats.

- [ ] **Step 7: Correct the spec's secure-context claim**

In the paragraph beginning "**The page mints one id per page instance**",
replace from "minted with" to the paragraph's end:

```markdown
minted with `crypto.randomUUID()` where the page has it, so tapir refuses a
malformed one with the same `400` as a missing one. That call exists only in a
secure context, which `SECURE_COOKIES=false` gives up. The setting is for
development, a LAN address during development being the case it exists for, so
people on several machines can join one dev server. In that case the page builds
a version 4 id from `crypto.getRandomValues`, which has no such requirement.
Without the fallback the script throws before Vue mounts, leaving a page that is
dead with nothing on it to say why. Production keeps the default, where a
plain-HTTP visitor never gets its `Secure` cookie back and stops at the `401`
from `/events`.
```

- [ ] **Step 8: Commit**

```bash
git add e2e/fixtures.js e2e/room.spec.js src/main/resources/pages/index.html \
  src/main/scala/com/lunatech/pointingpoker/API.scala \
  docs/superpowers/specs/2026-08-31-protocol-target-architecture-design.md
git commit -m "fix(client): mint the connection id without a secure context"
```

## Task 2: Each endpoint's reply type names only what it answers

**Files:**
- Modify: `src/main/scala/com/lunatech/pointingpoker/actors/Room.scala`
- Modify: `src/main/scala/com/lunatech/pointingpoker/actors/RoomManager.scala`
- Modify: `src/main/scala/com/lunatech/pointingpoker/API.scala`
- Modify: `build.sbt`
- Modify: `src/test/scala/com/lunatech/pointingpoker/APISpec.scala`
- Modify: `src/test/scala/com/lunatech/pointingpoker/actors/RoomSpec.scala`
- Modify: `src/test/scala/com/lunatech/pointingpoker/actors/RoomManagerSpec.scala`
- Modify: the design spec, the paragraph beginning "Landed as a sub-trait of the
  five-case reply"

No new test case: this is a type change that alters no status any endpoint
answers, so the existing 162 cases are the behavioural check, and the compiler
is the check on the types. Step 8 proves the compiler's checks have teeth.

- [ ] **Step 1: Replace the result hierarchy in `Room`**

Replace the `sealed trait CommandResult` block (seven lines, from `sealed trait
CommandResult` to `case object NotAMember`) with:

```scala
  case object Applied
  enum Refusal:
    case NoSession, NotAMember
  enum VoteRefusal:
    case RoundRevealed, BlankEstimation
  export Refusal.{NoSession, NotAMember}
  export VoteRefusal.{BlankEstimation, RoundRevealed}
  // Per endpoint, so the compiler refuses a result the endpoint's status table does not list.
  type CommandResult = Applied.type | Refusal
  type VoteResult    = CommandResult | VoteRefusal
```

The `export`s keep `Room.NoSession` and the rest valid at every existing call and
pattern site. Then:

- `Vote`'s `replyTo` becomes `ActorRef[VoteResult]`. The other five messages keep
  `ActorRef[CommandResult]`, which is now the narrow type.
- `RoomData.acting` returns `Either[Refusal, UUID]`.
- `RoomData.vote` returns `(RoomData, Applied.type | VoteRefusal)`.

- [ ] **Step 2: Collapse the four apply blocks into `act`**

In `receiveBehaviour`, as the first statement inside `.receive[Command] { (context, message) =>`,
above the "Any message re-arms the tick" comment:

```scala
        // The commands whose only outcome past the membership check is an update and a publish.
        def act(token: SessionToken, replyTo: ActorRef[CommandResult])(
            update: RoomData => RoomData
        ): Behavior[Command] =
          data.acting(token) match
            case Right(_) =>
              replyTo ! Applied
              receiveBehaviour(
                roomId,
                publish(update(data), context),
                gracePeriod,
                stopAfterIdle,
                timers
              )
            case Left(refusal) =>
              replyTo ! refusal
              Behaviors.same
```

Then each of the four branches becomes one line:

```scala
          case ClearVotes(token, replyTo) =>
            act(token, replyTo)(_.clear())
          case ReVote(token, replyTo) =>
            act(token, replyTo)(_.reVote())
          case ShowVotes(token, replyTo) =>
            act(token, replyTo)(_.show())
```

```scala
          case EditIssue(token, issue, replyTo) =>
            act(token, replyTo)(_.editIssue(issue))
```

`Vote` and `Depart` keep their own branches: `vote` answers an outcome, and
`Depart` manages the grace timer.

- [ ] **Step 3: Collapse the six relays into `relay`**

In `RoomManager`, `Vote`'s `replyTo` becomes `ActorRef[Room.VoteResult]`. Then,
in `receiveBehaviour`, as the first statement inside `.receive[Command] { (context, message) =>`:

```scala
        // A stopped room is answered from the map's absence rather than by a timing-out ask.
        def relay(roomId: UUID, token: Option[Room.SessionToken], replyTo: ActorRef[Room.Refusal])(
            command: Room.SessionToken => Room.Command
        ): Behavior[Command] =
          (data.rooms.get(roomId), token) match
            case (Some(room), Some(t)) => room ! command(t)
            case _                     => replyTo ! Room.NoSession
          Behaviors.same
```

`ActorRef` is contravariant, so both `ActorRef[CommandResult]` and
`ActorRef[VoteResult]` pass where `ActorRef[Refusal]` is asked for, and the helper
needs no type parameter. The comment moves here from `Vote`'s relay, where it sat
on the one branch of six that carried it. The six branches become:

```scala
          case Vote(roomId, token, estimation, replyTo) =>
            relay(roomId, token, replyTo)(t => Room.Vote(t, estimation, replyTo))
          case Show(roomId, token, replyTo) =>
            relay(roomId, token, replyTo)(t => Room.ShowVotes(t, replyTo))
          case Clear(roomId, token, replyTo) =>
            relay(roomId, token, replyTo)(t => Room.ClearVotes(t, replyTo))
          case Revote(roomId, token, replyTo) =>
            relay(roomId, token, replyTo)(t => Room.ReVote(t, replyTo))
          case EditIssue(roomId, token, issue, replyTo) =>
            relay(roomId, token, replyTo)(t => Room.EditIssue(t, issue, replyTo))
          case Depart(roomId, token, connectionId, replyTo) =>
            relay(roomId, token, replyTo)(t => Room.Depart(t, connectionId, replyTo))
```

`scalafmtAll` adds an `end match` after the last branch; keep it.

- [ ] **Step 4: Derive the error variants in `API`**

Replace the four `oneOfVariantSingletonMatcher` vals and the two `oneOf` vals:

```scala
  // Exhaustive, and the build makes a missed case fatal: every refusal has exactly one status.
  private def status(refusal: Room.Refusal | Room.VoteRefusal): StatusCode = refusal match
    case Room.NoSession       => StatusCode.Unauthorized
    case Room.NotAMember      => StatusCode.Forbidden
    case Room.RoundRevealed   => StatusCode.Conflict
    case Room.BlankEstimation => StatusCode.BadRequest

  // Built from the enums' values, so a new refusal cannot be left without a variant.
  private def errors[R <: Room.Refusal | Room.VoteRefusal](refusals: Seq[R]) =
    val variants = refusals.map(r => oneOfVariantSingletonMatcher(status(r))(r))
    oneOf[R](variants.head, variants.tail*)

  private val commandErrors = errors(Room.Refusal.values.toSeq)
  private val voteErrors    = errors(Room.Refusal.values.toSeq ++ Room.VoteRefusal.values)
```

Replace `answer` and add its vote counterpart:

```scala
  // Applied is the only outcome that is not a refusal, so it is the only Right.
  private def answer(result: Room.CommandResult): Either[Room.Refusal, Unit] = result match
    case Room.Applied          => Right(())
    case refusal: Room.Refusal => Left(refusal)

  private def answerVote(result: Room.VoteResult): Either[Room.Refusal | Room.VoteRefusal, Unit] =
    result match
      case Room.Applied                               => Right(())
      case refusal: (Room.Refusal | Room.VoteRefusal) => Left(refusal)
```

In the `vote` server logic, `.ask[Room.CommandResult]` becomes
`.ask[Room.VoteResult]` and `.map(answer)` becomes `.map(answerVote)`. The other
five server logics are unchanged.

- [ ] **Step 5: Make an incomplete match fatal**

In `build.sbt`, after the last `libraryDependencies` line, which gains a
trailing comma:

```scala
    libraryDependencies += "org.apache.pekko" %% "pekko-http-testkit"        % V.pekkoHttp % Test,
    // An incomplete match is otherwise a warning; API's status table depends on it being fatal.
    scalacOptions += "-Wconf:name=PatternMatchExhaustivity:e"
```

Placed last rather than beside `name`, because beside it `scalafmtSbt` breaks
`name`'s alignment with the dependency block. `-Wconf:id=E029:e` is the same
filter by number; the name says what it does.

- [ ] **Step 6: Retype the test sites**

Run: `sbt Test/compile`
Expected: errors on 23 lines. The inventory is the compiler's; on this tree:

- `RoomSpec` and `RoomManagerSpec`: every `TestInbox[Room.CommandResult]()` and
  `createTestProbe[Room.CommandResult]()` whose ref reaches a `Room.Vote` or a
  `RoomManager.Vote` becomes `[Room.VoteResult]`. That is 15 sites in `RoomSpec`
  and 4 in `RoomManagerSpec`. The errors outnumber the sites, because a probe
  declared once is reported at every line that uses it.
- `APISpec`: `commandReply` served every command, vote included, and a
  `CommandResult` can no longer hold `RoundRevealed`. Split it, which also
  lands finding C's two-line comment:

```scala
  // Replies so a command case fails on its assertion, not the ask's timeout.
  // Shared across cases: sound only under ScalaTest's default sequential run.
  val commandReply: java.util.concurrent.atomic.AtomicReference[Room.CommandResult] =
    new java.util.concurrent.atomic.AtomicReference(Room.Applied)
  val voteReply: java.util.concurrent.atomic.AtomicReference[Room.VoteResult] =
    new java.util.concurrent.atomic.AtomicReference(Room.Applied)
```

  The stub's `RoomManager.Vote` branch replies `voteReply.get()`, and the three
  vote cases ("answer 401 for a vote with no session cookie", "answer 403 for a
  vote from a resolved session that is no longer a member", "answer 409 for a
  vote into a revealed round") set and reset `voteReply` in place of
  `commandReply`.

- [ ] **Step 7: Run the suite**

Run: `sbt styleCheck test`
Expected: 162 succeeded, 0 failed, the same count as before the task.

- [ ] **Step 8: Prove the compiler's checks have teeth**

Each mutation must turn `sbt compile` red with the stated error. Revert each
before the next.

1. Delete `case Room.BlankEstimation => StatusCode.BadRequest` from `status`.
   Expected: `[E029] Pattern Match Exhaustivity Error` on `status`. Without the
   step 5 flag this is a warning and the build passes, so it also checks the flag.
2. Replace `act(token, replyTo)(_.show())` with
   `replyTo ! RoundRevealed` then `Behaviors.same`.
   Expected: `[E007] Type Mismatch Error`, found `VoteRefusal`, required
   `Applied.type | Refusal`.
3. Add a case to `Refusal`: `case NoSession, NotAMember, Locked`.
   Expected: `[E029]` on `status`, "It would fail on pattern case: Locked". The
   variant list needs no edit, being derived from `values`, so the one place a new
   refusal must be handled is the one place the compiler points at.

All three were run against this plan's code before it was written down.

- [ ] **Step 9: Rewrite the spec's record of the result types**

Replace the paragraph beginning "Landed as a sub-trait of the five-case reply"
with:

```markdown
Landed as two enums behind per-endpoint aliases. `Room` declares
`enum Refusal { NoSession, NotAMember }` and `enum VoteRefusal { RoundRevealed,
BlankEstimation }` beside a lone `Applied`, with `CommandResult = Applied.type |
Refusal` answering the four other commands and `/leave`, and `VoteResult =
CommandResult | VoteRefusal` answering `/vote`. Each message's `replyTo` carries
its endpoint's alias, so a handler answering `ShowVotes` with `RoundRevealed` is
a type error rather than the `500` tapir raises on finding no variant. `API`
builds each `oneOf` from the enums' `values` through one exhaustive `status`
match, and `build.sbt` makes an incomplete match fatal with
`-Wconf:name=PatternMatchExhaustivity:e`, so a refusal added later fails the
build until it has a status. The first cut was a sub-trait, `VoteOutcome extends
CommandResult`, which narrowed `vote`'s return but let every `replyTo` accept all
five results and left each `oneOf` a list kept by hand. The branch's second
review round replaced it.
```

- [ ] **Step 10: Commit**

```bash
git add build.sbt src/main/scala src/test/scala \
  docs/superpowers/specs/2026-08-31-protocol-target-architecture-design.md
git commit -m "refactor(protocol): give each endpoint a reply type naming only what it answers"
```

## Task 3: The record

**Files:**
- Modify: the design spec, three places below
- Modify: `docs/roadmap.md` (Phase 5)
- Modify: `docs/superpowers/plans/2026-08-31-protocol-architecture-6-write-path.md`
  (its closing section)

- [ ] **Step 1: The refusal gained a second path (finding B)**

In the paragraph beginning "The refusal needs the actor that answered
`ValidateToken`", change its first words to "Before step 6's idempotent `/join`,
the refusal needed the actor", and insert after that paragraph:

```markdown
**Idempotent `/join` added a second way in, inside one actor.** `RequestSession`
on a known token renames the session, so a `/join` carrying a new name that lands
between a reconnect's `ValidateToken` and its `Join` leaves that `Join` naming
the old one. It takes two tabs, one of which has cleared its stored name through
Leave and rejoins under a different one, racing the other tab's reconnect by
milliseconds. The ended stream heals it: the retry resolves the new name and
joins. One side effect is accepted rather than guarded. The refused stream's
completion arrives as a `Leave` for a ref never added, and for a member already
in grace that re-arms `ConfirmLeave`, delaying the removal by up to one grace
period. The joining tab's own `Join` then cancels the timer, in every ordering
except the one where that tab never connects.
```

- [ ] **Step 2: An in-page rejoin reuses the id (finding D)**

Append to the paragraph beginning "**A page instance must not persist its id.**":

```markdown
Within one instance the id does outlive a Leave: rejoining from the landing view
reuses it, so a beacon delivered after the rejoin's `Join` would drop the new
ref. That needs the beacon to lose to a person typing a name, a `/join` round
trip and the `/events` handshake, and the member it removes comes back on the
stream's own retry, so it is accepted rather than closed by minting in `doLeave`.
```

- [ ] **Step 3: Step 6a**

Insert before the paragraph beginning "**Step 7. Slug room ids.**":

```markdown
**Step 6a. Warnings become errors.** `-Werror` across main and test, which step 6
declined in favour of making only the exhaustivity warning fatal. Measured on
step 6's tree, it trips on two warnings and nothing else: `Main extends App`,
deprecated since Scala 3.8.0, and 28 test sites passing an implicit
positionally, `TestProbe()(testKit.system.classicSystem)` and its kin in
`RoomSpec` and `RoomManagerSpec`, which want `(using ...)`. The second is
mechanical under `-rewrite -source 3.7-migration`. The first changes the entry
point, so the step checks that the staged start script and the Docker image
still launch it. `-Werror` subsumes step 6's targeted `-Wconf`, which the step
removes. Waits on step 6 only, and is a branch of its own so the entry-point
change is not reviewed inside a protocol diff.
```

- [ ] **Step 4: The roadmap item**

In `docs/roadmap.md`, append to Phase 5:

```markdown
- [ ] Fatal compiler warnings across main and test. **Becomes step 6a**, which
      records the two pre-existing warnings it has to clear first.
```

- [ ] **Step 5: Point the step 6 plan at this one**

Append to the step 6 plan's "Deviations from the plan, and why" section:

```markdown
A second review round ran after the fix wave above, over the whole branch with a
correctness and a security pass. Its decisions, and the fixes it scheduled, are
in `2026-09-23-protocol-architecture-6-review-fixes.md`.
```

- [ ] **Step 6: Check the record**

Run: `grep -nP '\x{2014}' docs/superpowers/plans/2026-09-23-protocol-architecture-6-review-fixes.md docs/roadmap.md docs/superpowers/specs/2026-08-31-protocol-target-architecture-design.md`
Expected: no output. None of the three files holds one today.

- [ ] **Step 7: Commit**

```bash
git add docs/
git commit -m "docs(protocol): record what the second review round decided"
```

## Verification

- [ ] `sbt styleCheck test`: 162 succeeded, 0 failed.
- [ ] `npm run e2e`: 60 passed, the 58 before this plan plus the new case in both
      browsers.
- [ ] `npm test`: 14 passed, the node suite this plan's first draft left out.
- [ ] Task 2 step 8's three mutations, each red, each reverted.
- [ ] `git diff f78e4db --stat` names only the files this plan declares.
