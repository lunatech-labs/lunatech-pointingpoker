# Session/Identity Mechanism Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the `userId` spoofing gap by replacing the client-supplied `userId` with a server-minted, room-scoped session cookie that `Room` validates before applying any command.

**Architecture:** `/join` mints a `userId` + an opaque `SessionToken`, stores a *pending session* inside the `Room` actor, and returns the token as an `HttpOnly`/`SameSite=Strict`/room-scoped cookie. `/events` resolves that token (promoting the pending session into a full `RoomData.users` member once the SSE connection's `ref` exists) before opening the stream, rejecting with `401` otherwise. The five command endpoints resolve identity from the same cookie instead of a `?userId=` query param.

**Tech Stack:** Scala 3, Pekko Actor (typed) + Pekko HTTP + Pekko Streams, Circe, ScalaTest.

**Spec:** `docs/superpowers/specs/2026-08-20-session-identity-design.md`

## Global Constraints

- Cookie attributes: `HttpOnly`, `SameSite=Strict`, `Path=/rooms/{roomId}`, no `Max-Age`/`Expires`, `Secure` gated by `apiConfig.secureCookies` (config key `pointing-poker.service.secure-cookies`, env override `SECURE_COOKIES`, default `true`).
- The session credential is `opaque type SessionToken = UUID` (defined in `Room.scala`), minted via `UUID.randomUUID()` — a distinct type from `UUID` so it can't be swapped with `userId` at a call site.
- `userId` is not a secret and is unaffected as a public value — it's still returned in `/join`'s JSON body and still broadcast in every `RoomEvent`, exactly as today.
- The five command endpoints (`vote`/`show`/`clear`/`revote`/`edit-issue`) keep their fire-and-forget, always-`204` shape. No ask-pattern rework in this plan — that's Phase 1's separately-scoped fourth roadmap item.
- Only `RequestSession` (backing `/join`) auto-creates a room. Every other `RoomManager` operation (`ValidateToken`, `ConnectToRoom`, and the five commands) is a plain lookup that no-ops/fails on a miss against `RoomManagerData.rooms` — no new auto-create paths.
- `RoomData`'s existing pure functions (`vote`, `clear`, `reVote`, `editIssue`) stay keyed by a real `userId`, unchanged. Token-to-`userId` resolution happens only in `Room.receiveBehaviour`'s pattern match, immediately before delegating to those functions.

---

### Task 1: `SessionToken` type + `RequestSession` command in `Room`

**Files:**
- Modify: `src/main/scala/com/lunatech/pointingpoker/actors/Room.scala`
- Test: `src/test/scala/com/lunatech/pointingpoker/actors/RoomSpec.scala`

**Interfaces:**
- Produces: `Room.SessionToken` (opaque type, `SessionToken.mint()`, `SessionToken.parse(raw: String): Option[SessionToken]`, `token.raw: String` extension), `Room.PendingSession(userId: UUID, name: String)`, `Room.RequestSession(name: String, replyTo: ActorRef[Room.SessionMinted]) extends Room.Command`, `Room.SessionMinted(userId: UUID, token: SessionToken)`, `RoomData.pendingSessions: Map[SessionToken, PendingSession]` (defaults to `Map.empty`, so no existing `RoomData(...)` call site needs updating), `RoomData.registerSession(token, userId, name): RoomData`.

- [ ] **Step 1: Write the failing test**

Add to `RoomSpec.scala`, inside the `"Room Actor" should {` block:

```scala
    "mint a session and store it as pending on RequestSession" in {
      val sessionProbe      = testKit.createTestProbe[Room.SessionMinted]()
      val dataProbe         = testKit.createTestProbe[Room.DataStatus]()
      val (roomId, roomRef) = createRoom(UUID.randomUUID(), RoomData.empty)

      roomRef ! Room.RequestSession("Alice", sessionProbe.ref)

      val minted = sessionProbe.expectMessageType[Room.SessionMinted]

      roomRef ! Room.GetData(dataProbe.ref)
      val data = dataProbe.expectMessageType[Room.DataStatus]
      data.data.pendingSessions.get(minted.token) mustBe Some(
        Room.PendingSession(minted.userId, "Alice")
      )
    }
```

- [ ] **Step 2: Run test to verify it fails**

Run: `sbt "testOnly com.lunatech.pointingpoker.actors.RoomSpec"`
Expected: FAIL to compile — `Room.RequestSession`, `Room.SessionMinted`, `Room.PendingSession` don't exist yet.

- [ ] **Step 3: Write minimal implementation**

In `Room.scala`, inside `object Room`, add the opaque type near the top (after the `import` statements, before `sealed trait Command`):

```scala
  opaque type SessionToken = UUID

  object SessionToken:
    def mint(): SessionToken                      = UUID.randomUUID()
    def parse(raw: String): Option[SessionToken]  = scala.util.Try(UUID.fromString(raw)).toOption
    extension (token: SessionToken) def raw: String = token.toString
```

Add the new command and its reply, alongside the existing `Command` definitions:

```scala
  final case class RequestSession(name: String, replyTo: ActorRef[SessionMinted]) extends Command

  final case class SessionMinted(userId: UUID, token: SessionToken)
```

Add `PendingSession` alongside `User`:

```scala
  final case class PendingSession(userId: UUID, name: String)
```

Update `RoomData` to carry pending sessions, with a default so existing constructions keep compiling:

```scala
  final case class RoomData(
      users: List[User],
      currentIssue: String,
      issueLastEditBy: Option[UUID],
      pendingSessions: Map[SessionToken, PendingSession] = Map.empty
  ):
    def joinUser(user: User): RoomData =
      this.copy(users = user :: this.users.filterNot(_.id == user.id))

    def registerSession(token: SessionToken, userId: UUID, name: String): RoomData =
      this.copy(pendingSessions = this.pendingSessions + (token -> PendingSession(userId, name)))

    def vote(userId: UUID, estimation: String): RoomData =
```

(leave the rest of `RoomData`'s existing methods as-is — only `joinUser` gets touched again in Task 4).

Add the new case to `receiveBehaviour`'s pattern match, alongside `case Join(user) =>`:

```scala
        case RequestSession(name, replyTo) =>
          val userId  = UUID.randomUUID()
          val token   = SessionToken.mint()
          val newData = data.registerSession(token, userId, name)
          replyTo ! SessionMinted(userId, token)
          receiveBehaviour(roomId, newData)
```

- [ ] **Step 4: Run test to verify it passes**

Run: `sbt "testOnly com.lunatech.pointingpoker.actors.RoomSpec"`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/main/scala/com/lunatech/pointingpoker/actors/Room.scala src/test/scala/com/lunatech/pointingpoker/actors/RoomSpec.scala
git commit -m "feat: mint session tokens and pending sessions in Room via RequestSession"
```

---

### Task 2: `User` gains a `token` field

This is a mechanical, breaking-but-contained change: `User` needs a `token` before `ValidateToken` (Task 3) can resolve confirmed members by token. No new behavior — the check is that the full suite still compiles and passes.

**Files:**
- Modify: `src/main/scala/com/lunatech/pointingpoker/actors/Room.scala`
- Modify: `src/test/scala/com/lunatech/pointingpoker/actors/RoomSpec.scala`
- Modify: `src/test/scala/com/lunatech/pointingpoker/actors/RoomManagerSpec.scala`

**Interfaces:**
- Produces: `Room.User(id: UUID, name: String, voted: Boolean, estimation: String, ref: UntypedRef, token: SessionToken)` — `token` is a new, required (no default) sixth field.

- [ ] **Step 1: Update the `User` case class**

In `Room.scala`:

```scala
  final case class User(
      id: UUID,
      name: String,
      voted: Boolean,
      estimation: String,
      ref: UntypedRef,
      token: SessionToken
  )
```

- [ ] **Step 2: Update every existing `Room.User(...)` construction**

In `RoomSpec.scala`, update the `createUser` helper (in the `RoomSpec` companion object at the bottom of the file):

```scala
  def createUser(uuid: UUID, name: String, voted: Boolean, estimation: String)(using
      testKit: ActorTestKit
  ): (Room.User, TestProbe) =
    val probe = TestProbe()(testKit.system.classicSystem)
    val user  = Room.User(uuid, name, voted, estimation, probe.ref, Room.SessionToken.mint())
    (user, probe)
```

In the `"stop itself if empty"` test, update both direct constructions:

```scala
      val user  = Room.User(UUID.randomUUID(), "user1", false, "", probe.ref, Room.SessionToken.mint())
      val user2 = Room.User(UUID.randomUUID(), "user2", false, "", probe.ref, Room.SessionToken.mint())
```

In the `"replace an existing user's entry on rejoin instead of duplicating it"` test, keep the same identity's token on rejoin:

```scala
      val rejoinedUser = Room.User(user.id, "user1", false, "", newRefProbe.ref, user.token)
```

In the `"join the room, get all info, and broadcast it"` test:

```scala
      val newUser = Room.User(UUID.randomUUID(), "new user", false, "", newUserProbe.ref, Room.SessionToken.mint())
```

In `RoomManagerSpec.scala`, in the `"connect user to room"` test, update both constructions:

```scala
      val user1 = Room.User(UUID.randomUUID(), user1Name, false, "", user1Probe.ref, Room.SessionToken.mint())
      val user2 = Room.User(UUID.randomUUID(), user2Name, false, "", user2Probe.ref, Room.SessionToken.mint())
```

(This test's `ConnectToRoom` calls will be rewritten in Task 6 — leave them as-is for now; they still compile unchanged since `ConnectToRoom`'s signature isn't touched in this task.)

- [ ] **Step 3: Run the full suite to confirm no regressions**

Run: `sbt test`
Expected: PASS — every test, including the ones just touched, since this is a pure structural addition.

- [ ] **Step 4: Commit**

```bash
git add src/main/scala/com/lunatech/pointingpoker/actors/Room.scala src/test/scala/com/lunatech/pointingpoker/actors/RoomSpec.scala src/test/scala/com/lunatech/pointingpoker/actors/RoomManagerSpec.scala
git commit -m "refactor: add a session token to Room.User"
```

---

### Task 3: `ValidateToken` command

**Files:**
- Modify: `src/main/scala/com/lunatech/pointingpoker/actors/Room.scala`
- Test: `src/test/scala/com/lunatech/pointingpoker/actors/RoomSpec.scala`

**Interfaces:**
- Consumes: `Room.SessionToken`, `Room.User.token` (Tasks 1–2).
- Produces: `Room.ValidateToken(token: SessionToken, replyTo: ActorRef[TokenResolution]) extends Command`, `Room.TokenResolution` (sealed trait), `Room.Resolved(userId: UUID, name: String) extends TokenResolution`, `Room.Unresolved extends TokenResolution` (case object).

- [ ] **Step 1: Write the failing tests**

Add to `RoomSpec.scala`:

```scala
    "resolve a pending session by token" in {
      val sessionProbe = testKit.createTestProbe[Room.SessionMinted]()
      val resultProbe  = testKit.createTestProbe[Room.TokenResolution]()
      val (_, roomRef) = createRoom(UUID.randomUUID(), RoomData.empty)

      roomRef ! Room.RequestSession("Alice", sessionProbe.ref)
      val minted = sessionProbe.expectMessageType[Room.SessionMinted]

      roomRef ! Room.ValidateToken(minted.token, resultProbe.ref)

      resultProbe.expectMessage(Room.Resolved(minted.userId, "Alice"))
    }

    "resolve a confirmed member by token (reconnect)" in {
      val (user, _)    = createUser(UUID.randomUUID(), "user1", false, "")
      val resultProbe  = testKit.createTestProbe[Room.TokenResolution]()
      val (_, roomRef) = createRoom(UUID.randomUUID(), RoomData.empty.copy(users = List(user)))

      roomRef ! Room.ValidateToken(user.token, resultProbe.ref)

      resultProbe.expectMessage(Room.Resolved(user.id, user.name))
    }

    "return Unresolved for an unknown token" in {
      val resultProbe  = testKit.createTestProbe[Room.TokenResolution]()
      val (_, roomRef) = createRoom(UUID.randomUUID(), RoomData.empty)

      roomRef ! Room.ValidateToken(Room.SessionToken.mint(), resultProbe.ref)

      resultProbe.expectMessage(Room.Unresolved)
    }
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `sbt "testOnly com.lunatech.pointingpoker.actors.RoomSpec"`
Expected: FAIL to compile — `Room.ValidateToken`/`Room.TokenResolution`/`Room.Resolved`/`Room.Unresolved` don't exist yet.

- [ ] **Step 3: Write minimal implementation**

In `Room.scala`, add alongside the other command/response definitions:

```scala
  final case class ValidateToken(token: SessionToken, replyTo: ActorRef[TokenResolution]) extends Command

  sealed trait TokenResolution
  final case class Resolved(userId: UUID, name: String) extends TokenResolution
  case object Unresolved                                 extends TokenResolution
```

Add the case to `receiveBehaviour`:

```scala
        case ValidateToken(token, replyTo) =>
          val resolution = data.pendingSessions.get(token) match
            case Some(pending) => Resolved(pending.userId, pending.name)
            case None          =>
              data.users.find(_.token == token) match
                case Some(user) => Resolved(user.id, user.name)
                case None       => Unresolved
          replyTo ! resolution
          Behaviors.same
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `sbt "testOnly com.lunatech.pointingpoker.actors.RoomSpec"`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/main/scala/com/lunatech/pointingpoker/actors/Room.scala src/test/scala/com/lunatech/pointingpoker/actors/RoomSpec.scala
git commit -m "feat: resolve session tokens against pending or confirmed room members"
```

---

### Task 4: `Join` clears the consumed pending session

**Files:**
- Modify: `src/main/scala/com/lunatech/pointingpoker/actors/Room.scala`
- Test: `src/test/scala/com/lunatech/pointingpoker/actors/RoomSpec.scala`

**Interfaces:**
- Consumes: `RoomData.pendingSessions`, `User.token` (Tasks 1–2).
- Produces: `RoomData.joinUser` now also removes the promoted token from `pendingSessions`.

- [ ] **Step 1: Write the failing test**

```scala
    "clear the pending session once Join promotes it to a member" in {
      val sessionProbe      = testKit.createTestProbe[Room.SessionMinted]()
      val dataProbe         = testKit.createTestProbe[Room.DataStatus]()
      val userProbe         = TestProbe()(testKit.system.classicSystem)
      val (roomId, roomRef) = createRoom(UUID.randomUUID(), RoomData.empty)

      roomRef ! Room.RequestSession("Alice", sessionProbe.ref)
      val minted = sessionProbe.expectMessageType[Room.SessionMinted]

      roomRef ! Room.Join(Room.User(minted.userId, "Alice", false, "", userProbe.ref, minted.token))
      roomRef ! Room.GetData(dataProbe.ref)

      val data = dataProbe.expectMessageType[Room.DataStatus]
      data.data.pendingSessions.get(minted.token) mustBe None
      data.data.users.map(_.id) must contain(minted.userId)
    }
```

- [ ] **Step 2: Run test to verify it fails**

Run: `sbt "testOnly com.lunatech.pointingpoker.actors.RoomSpec"`
Expected: FAIL — `pendingSessions` still contains the entry after `Join`, since `joinUser` doesn't clear it yet.

- [ ] **Step 3: Write minimal implementation**

In `Room.scala`, update `joinUser`:

```scala
    def joinUser(user: User): RoomData =
      // Replaces any existing entry for this userId so a reconnect (e.g. the browser's
      // automatic EventSource retry racing an old connection's slow-to-detect failure)
      // doesn't leave two entries for the same user.
      this.copy(
        users = user :: this.users.filterNot(_.id == user.id),
        pendingSessions = this.pendingSessions - user.token
      )
```

- [ ] **Step 4: Run test to verify it passes**

Run: `sbt "testOnly com.lunatech.pointingpoker.actors.RoomSpec"`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/main/scala/com/lunatech/pointingpoker/actors/Room.scala src/test/scala/com/lunatech/pointingpoker/actors/RoomSpec.scala
git commit -m "feat: clear a pending session once it's promoted to a room member"
```

---

### Task 5: Commands resolve identity by token, in `Room` and `RoomManager`

**Files:**
- Modify: `src/main/scala/com/lunatech/pointingpoker/actors/Room.scala`
- Modify: `src/main/scala/com/lunatech/pointingpoker/actors/RoomManager.scala`
- Modify: `src/test/scala/com/lunatech/pointingpoker/actors/RoomSpec.scala`
- Modify: `src/test/scala/com/lunatech/pointingpoker/actors/RoomManagerSpec.scala`

**Interfaces:**
- Consumes: `Room.SessionToken`, `User.token` (Tasks 1–2).
- Produces: `Room.Vote(token: SessionToken, estimation: String)`, `Room.ClearVotes(token: SessionToken)`, `Room.ReVote(token: SessionToken)`, `Room.ShowVotes(token: SessionToken)`, `Room.EditIssue(token: SessionToken, issue: String)` (all replacing their old `userId: UUID` parameter); `RoomManager.Vote(roomId: UUID, token: Room.SessionToken, estimation: String)`, `RoomManager.Show(roomId, token)`, `RoomManager.Clear(roomId, token)`, `RoomManager.Revote(roomId, token)`, `RoomManager.EditIssue(roomId, token, issue)` (same replacement).

- [ ] **Step 1: Write the failing tests in `RoomSpec.scala`**

Replace the five existing command tests (`"update current issue and broadcast it"`, `"clear votes and broadcast it"`, `"broadcast show votes"`, `"vote and broadcast it"`) with token-based versions, and add a `"revote"` test (no test existed for `ReVote` before) plus a no-op test:

```scala
    "update current issue and broadcast it" in {
      val issue               = "Issue test 1"
      val (user, userProbe)   = createUser(UUID.randomUUID(), "user1", false, "")
      val (user2, user2Probe) = createUser(UUID.randomUUID(), "user2", false, "")
      val dataProbe           = testKit.createTestProbe[Room.DataStatus]()
      val (roomId, roomRef)   = createRoom(
        UUID.randomUUID(),
        RoomData.empty.copy(users = List(user, user2))
      )

      val expectedMessage = RoomEvent(MessageType.EditIssue, roomId, user.id, issue)
      val expectedData    = Room.DataStatus(data =
        RoomData(users = List(user, user2), currentIssue = issue, issueLastEditBy = Option(user.id))
      )

      roomRef ! Room.EditIssue(user.token, issue)
      roomRef ! Room.GetData(dataProbe.ref)

      userProbe.expectMsg(expectedMessage)
      user2Probe.expectMsg(expectedMessage)
      dataProbe.expectMessage(expectedData)
    }

    "clear votes and broadcast it" in {
      val (user, userProbe)   = createUser(UUID.randomUUID(), "user1", true, "3")
      val (user2, user2Probe) = createUser(UUID.randomUUID(), "user2", true, "5")
      val dataProbe           = testKit.createTestProbe[Room.DataStatus]()
      val (roomId, roomRef)   = createRoom(
        UUID.randomUUID(),
        RoomData.empty.copy(users = List(user, user2))
      )

      val expectedMessage = RoomEvent(MessageType.Clear, roomId, user.id, RoomEvent.NoExtra)
      val expectedData    = Room.DataStatus(data =
        RoomData.empty.copy(users =
          List(user.copy(voted = false, estimation = ""), user2.copy(voted = false, estimation = ""))
        )
      )

      roomRef ! Room.ClearVotes(user.token)
      roomRef ! Room.GetData(dataProbe.ref)

      userProbe.expectMsg(expectedMessage)
      user2Probe.expectMsg(expectedMessage)
      dataProbe.expectMessage(expectedData)
    }

    "revote and broadcast it" in {
      val (user, userProbe)   = createUser(UUID.randomUUID(), "user1", true, "3")
      val (user2, user2Probe) = createUser(UUID.randomUUID(), "user2", true, "5")
      val dataProbe           = testKit.createTestProbe[Room.DataStatus]()
      val (roomId, roomRef)   = createRoom(
        UUID.randomUUID(),
        RoomData.empty.copy(users = List(user, user2))
      )

      val expectedMessage = RoomEvent(MessageType.Revote, roomId, user.id, RoomEvent.NoExtra)
      val expectedData    = Room.DataStatus(data =
        RoomData.empty.copy(users = List(user.copy(voted = false), user2.copy(voted = false)))
      )

      roomRef ! Room.ReVote(user.token)
      roomRef ! Room.GetData(dataProbe.ref)

      userProbe.expectMsg(expectedMessage)
      user2Probe.expectMsg(expectedMessage)
      dataProbe.expectMessage(expectedData)
    }

    "broadcast show votes" in {
      val (user, userProbe)   = createUser(UUID.randomUUID(), "user1", true, "3")
      val (user2, user2Probe) = createUser(UUID.randomUUID(), "user2", true, "5")
      val (roomId, roomRef)   = createRoom(
        UUID.randomUUID(),
        RoomData.empty.copy(users = List(user, user2))
      )
      val expectedMessage = RoomEvent(MessageType.Show, roomId, user.id, RoomEvent.NoExtra)

      roomRef ! Room.ShowVotes(user.token)

      userProbe.expectMsg(expectedMessage)
      user2Probe.expectMsg(expectedMessage)
    }

    "vote and broadcast it" in {
      val estimation           = "5"
      val (user, userProbe)   = createUser(UUID.randomUUID(), "user1", false, "")
      val (user2, user2Probe) = createUser(UUID.randomUUID(), "user2", false, "")
      val dataProbe           = testKit.createTestProbe[Room.DataStatus]()
      val (roomId, roomRef)   = createRoom(
        UUID.randomUUID(),
        RoomData.empty.copy(users = List(user, user2))
      )
      val expectedMessage = RoomEvent(MessageType.Vote, roomId, user.id, estimation)
      val expectedData    = Room.DataStatus(data =
        RoomData.empty.copy(users = List(user.copy(voted = true, estimation = estimation), user2))
      )

      roomRef ! Room.Vote(user.token, estimation)
      roomRef ! Room.GetData(dataProbe.ref)

      userProbe.expectMsg(expectedMessage)
      user2Probe.expectMsg(expectedMessage)
      dataProbe.expectMessage(expectedData)
    }

    "ignore a vote from an unresolvable token" in {
      val (user, userProbe)   = createUser(UUID.randomUUID(), "user1", false, "")
      val (user2, user2Probe) = createUser(UUID.randomUUID(), "user2", false, "")
      val dataProbe           = testKit.createTestProbe[Room.DataStatus]()
      val (roomId, roomRef)   = createRoom(
        UUID.randomUUID(),
        RoomData.empty.copy(users = List(user, user2))
      )

      roomRef ! Room.Vote(Room.SessionToken.mint(), "5")
      roomRef ! Room.GetData(dataProbe.ref)

      userProbe.expectNoMessage()
      user2Probe.expectNoMessage()
      dataProbe.expectMessage(Room.DataStatus(data = RoomData.empty.copy(users = List(user, user2))))
    }
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `sbt "testOnly com.lunatech.pointingpoker.actors.RoomSpec"`
Expected: FAIL to compile — `Room.Vote`/`Room.ClearVotes`/etc. still take a `UUID`, not a `SessionToken`.

- [ ] **Step 3: Update `Room.scala`**

Change the command definitions:

```scala
  final case class Vote(token: SessionToken, estimation: String) extends Command
  final case class ClearVotes(token: SessionToken)                extends Command
  final case class ReVote(token: SessionToken)                    extends Command
  final case class ShowVotes(token: SessionToken)                 extends Command
  final case class EditIssue(token: SessionToken, issue: String)  extends Command
```

Update `receiveBehaviour`'s matching cases to resolve the token before delegating to the unchanged `RoomData` pure functions:

```scala
        case Vote(token, estimation) =>
          data.users.find(_.token == token) match
            case Some(user) =>
              val newData = data.vote(user.id, estimation)
              broadcast(RoomEvent(MessageType.Vote, roomId, user.id, estimation), newData.users, context)
              receiveBehaviour(roomId, newData)
            case None => Behaviors.same
        case ClearVotes(token) =>
          data.users.find(_.token == token) match
            case Some(user) =>
              val newData = data.clear()
              broadcast(
                RoomEvent(MessageType.Clear, roomId, user.id, RoomEvent.NoExtra),
                newData.users,
                context
              )
              receiveBehaviour(roomId, newData)
            case None => Behaviors.same
        case ReVote(token) =>
          data.users.find(_.token == token) match
            case Some(user) =>
              val newData = data.reVote()
              broadcast(
                RoomEvent(MessageType.Revote, roomId, user.id, RoomEvent.NoExtra),
                newData.users,
                context
              )
              receiveBehaviour(roomId, newData)
            case None => Behaviors.same
        case ShowVotes(token) =>
          data.users.find(_.token == token).foreach { user =>
            broadcast(
              RoomEvent(MessageType.Show, roomId, user.id, RoomEvent.NoExtra),
              data.users,
              context
            )
          }
          Behaviors.same
```

The existing `case Leave(userId, ref, replyTo) => ...` case sits between `ShowVotes` and `EditIssue` in the file — leave its body untouched, it's server-driven, not client-supplied, so it's out of scope here. Only `EditIssue`, below it, changes:

```scala
        case EditIssue(token, issue) =>
          data.users.find(_.token == token) match
            case Some(user) =>
              broadcast(RoomEvent(MessageType.EditIssue, roomId, user.id, issue), data.users, context)
              receiveBehaviour(roomId, data.editIssue(issue, user.id))
            case None => Behaviors.same
```

- [ ] **Step 4: Run `RoomSpec` to verify it passes**

Run: `sbt "testOnly com.lunatech.pointingpoker.actors.RoomSpec"`
Expected: PASS

- [ ] **Step 5: Write the failing tests in `RoomManagerSpec.scala`**

Replace `"handle typed per-command messages"` and `"no-op typed per-command messages for an unknown room"`:

```scala
    "handle typed per-command messages" in {
      val roomId            = UUID.randomUUID()
      val roomProbe         = testKit.createTestProbe[Room.Command]()
      val roomResponseProbe = testKit.createTestProbe[Room.Response]()
      val managerRef        = testKit.spawn(
        RoomManager
          .receiveBehaviour(RoomManagerData(Map(roomId -> roomProbe.ref)), roomResponseProbe.ref)
      )
      val token = Room.SessionToken.mint()

      managerRef ! RoomManager.Vote(roomId, token, "5")
      managerRef ! RoomManager.Show(roomId, token)
      managerRef ! RoomManager.Clear(roomId, token)
      managerRef ! RoomManager.Revote(roomId, token)
      managerRef ! RoomManager.EditIssue(roomId, token, "issue name")

      roomProbe.expectMessage(Room.Vote(token, "5"))
      roomProbe.expectMessage(Room.ShowVotes(token))
      roomProbe.expectMessage(Room.ClearVotes(token))
      roomProbe.expectMessage(Room.ReVote(token))
      roomProbe.expectMessage(Room.EditIssue(token, "issue name"))
    }

    "no-op typed per-command messages for an unknown room" in {
      val knownRoomId       = UUID.randomUUID()
      val unknownRoomId     = UUID.randomUUID()
      val roomProbe         = testKit.createTestProbe[Room.Command]()
      val roomResponseProbe = testKit.createTestProbe[Room.Response]()
      val managerRef        = testKit.spawn(
        RoomManager.receiveBehaviour(
          RoomManagerData(Map(knownRoomId -> roomProbe.ref)),
          roomResponseProbe.ref
        )
      )

      managerRef ! RoomManager.Vote(unknownRoomId, Room.SessionToken.mint(), "5")

      roomProbe.expectNoMessage()
    }
```

- [ ] **Step 6: Run tests to verify they fail**

Run: `sbt "testOnly com.lunatech.pointingpoker.actors.RoomManagerSpec"`
Expected: FAIL to compile — `RoomManager.Vote`/etc. still take a `UUID`.

- [ ] **Step 7: Update `RoomManager.scala`**

```scala
  case class Vote(roomId: UUID, token: Room.SessionToken, estimation: String) extends Command
  case class Show(roomId: UUID, token: Room.SessionToken)                     extends Command
  case class Clear(roomId: UUID, token: Room.SessionToken)                    extends Command
  case class Revote(roomId: UUID, token: Room.SessionToken)                   extends Command
  case class EditIssue(roomId: UUID, token: Room.SessionToken, issue: String) extends Command
```

Update the matching handlers (parameter renamed from `userId` to `token`, bodies otherwise unchanged):

```scala
          case Vote(roomId, token, estimation) =>
            data.rooms.get(roomId).foreach(room => room ! Room.Vote(token, estimation))
            Behaviors.same
          case Show(roomId, token) =>
            data.rooms.get(roomId).foreach(room => room ! Room.ShowVotes(token))
            Behaviors.same
          case Clear(roomId, token) =>
            data.rooms.get(roomId).foreach(room => room ! Room.ClearVotes(token))
            Behaviors.same
          case Revote(roomId, token) =>
            data.rooms.get(roomId).foreach(room => room ! Room.ReVote(token))
            Behaviors.same
          case EditIssue(roomId, token, issue) =>
            data.rooms.get(roomId).foreach(room => room ! Room.EditIssue(token, issue))
            Behaviors.same
```

- [ ] **Step 8: Run tests to verify they pass**

Run: `sbt "testOnly com.lunatech.pointingpoker.actors.RoomManagerSpec"`
Expected: PASS

- [ ] **Step 9: Commit**

```bash
git add src/main/scala/com/lunatech/pointingpoker/actors/Room.scala src/main/scala/com/lunatech/pointingpoker/actors/RoomManager.scala src/test/scala/com/lunatech/pointingpoker/actors/RoomSpec.scala src/test/scala/com/lunatech/pointingpoker/actors/RoomManagerSpec.scala
git commit -m "feat: resolve vote/show/clear/revote/edit-issue identity from a session token"
```

---

### Task 6: `RoomManager` session pass-through, `ConnectToRoom` reshape, `SSE.scala` update

**Files:**
- Modify: `src/main/scala/com/lunatech/pointingpoker/actors/RoomManager.scala`
- Modify: `src/main/scala/com/lunatech/pointingpoker/sse/SSE.scala`
- Modify: `src/test/scala/com/lunatech/pointingpoker/actors/RoomManagerSpec.scala`

**Interfaces:**
- Consumes: `Room.RequestSession`/`Room.SessionMinted`, `Room.ValidateToken`/`Room.TokenResolution` (Tasks 1, 3).
- Produces: `RoomManager.RequestSession(roomId: UUID, name: String, replyTo: ActorRef[Room.SessionMinted])`, `RoomManager.ValidateToken(roomId: UUID, token: Room.SessionToken, replyTo: ActorRef[Room.TokenResolution])`, `RoomManager.ConnectToRoom(roomId: UUID, userId: UUID, name: String, token: Room.SessionToken, ref: UntypedRef)` (replaces the old `ConnectToRoom(message: RoomEvent, user: UntypedRef)`), `SSE.source(roomManager, roomId, userId, name, token)` (gains a `token: Room.SessionToken` parameter).

- [ ] **Step 1: Write the failing tests in `RoomManagerSpec.scala`**

Replace `"connect user to room"` and add two new tests; update the two SSE-integration tests to pass a token:

```scala
    "connect user to room" in {
      val roomId            = UUID.randomUUID()
      val roomProbe         = testKit.createTestProbe[Room.Command]()
      val roomResponseProbe = testKit.createTestProbe[Room.Response]()
      val managerRef        = testKit.spawn(
        RoomManager
          .receiveBehaviour(RoomManagerData(Map(roomId -> roomProbe.ref)), roomResponseProbe.ref)
      )
      val user1Probe = TestProbe()(testKit.system.classicSystem)
      val user2Probe = TestProbe()(testKit.system.classicSystem)
      val token1     = Room.SessionToken.mint()
      val token2     = Room.SessionToken.mint()
      val userId1    = UUID.randomUUID()
      val userId2    = UUID.randomUUID()

      managerRef ! RoomManager.ConnectToRoom(roomId, userId1, user1Name, token1, user1Probe.ref)
      managerRef ! RoomManager.ConnectToRoom(roomId, userId2, user2Name, token2, user2Probe.ref)

      roomProbe.expectMessage(Room.Join(Room.User(userId1, user1Name, false, "", user1Probe.ref, token1)))
      roomProbe.expectMessage(Room.Join(Room.User(userId2, user2Name, false, "", user2Probe.ref, token2)))
    }

    "no-op ConnectToRoom for an unknown room" in {
      val knownRoomId       = UUID.randomUUID()
      val unknownRoomId     = UUID.randomUUID()
      val roomProbe         = testKit.createTestProbe[Room.Command]()
      val roomResponseProbe = testKit.createTestProbe[Room.Response]()
      val managerRef        = testKit.spawn(
        RoomManager.receiveBehaviour(
          RoomManagerData(Map(knownRoomId -> roomProbe.ref)),
          roomResponseProbe.ref
        )
      )
      val probe = TestProbe()(testKit.system.classicSystem)

      managerRef ! RoomManager
        .ConnectToRoom(unknownRoomId, UUID.randomUUID(), "Alice", Room.SessionToken.mint(), probe.ref)

      roomProbe.expectNoMessage()
    }

    "pass RequestSession through to the room, auto-creating it if needed" in {
      val behaviorTestKit = BehaviorTestKit(RoomManager())
      val roomId          = UUID.randomUUID()
      val sessionProbe    = testKit.createTestProbe[Room.SessionMinted]()

      behaviorTestKit.run(RoomManager.RequestSession(roomId, "Alice", sessionProbe.ref))

      val childInbox = behaviorTestKit.childInbox[Room.Command](roomId.toString)
      childInbox.expectMessage(Room.RequestSession("Alice", sessionProbe.ref))
    }

    "resolve ValidateToken against an unknown room as Unresolved instead of creating it" in {
      val behaviorTestKit = BehaviorTestKit(RoomManager())
      val roomId          = UUID.randomUUID()
      val resultProbe     = testKit.createTestProbe[Room.TokenResolution]()

      behaviorTestKit.run(RoomManager.ValidateToken(roomId, Room.SessionToken.mint(), resultProbe.ref))

      resultProbe.expectMessage(Room.Unresolved)
      behaviorTestKit.retrieveAllEffects() mustBe empty
    }
```

Update the two SSE-integration tests to pass a token and match the reshaped `ConnectToRoom`:

```scala
    "connect a user via SSE.source and register it with ConnectToRoom" in {
      import com.lunatech.pointingpoker.sse.SSE
      given ExecutionContext                     = testKit.system.executionContext
      given org.apache.pekko.stream.Materializer =
        org.apache.pekko.stream.Materializer.matFromSystem(testKit.system.classicSystem)

      val roomId       = UUID.randomUUID()
      val userId       = UUID.randomUUID()
      val token        = Room.SessionToken.mint()
      val classicProbe = org.apache.pekko.testkit.TestProbe()(testKit.system.classicSystem)

      SSE
        .source(classicProbe.ref, roomId, userId, "user 1", token)
        .to(org.apache.pekko.stream.scaladsl.Sink.ignore)
        .run()

      classicProbe.expectMsgPF() { case RoomManager.ConnectToRoom(rId, uId, name, tok, _) =>
        rId mustBe roomId
        uId mustBe userId
        name mustBe "user 1"
        tok mustBe token
      }
    }

    "report stream termination to the room manager as ConnectionCompleted" in {
      import com.lunatech.pointingpoker.sse.SSE
      given ExecutionContext                     = testKit.system.executionContext
      given org.apache.pekko.stream.Materializer =
        org.apache.pekko.stream.Materializer.matFromSystem(testKit.system.classicSystem)

      val roomId       = UUID.randomUUID()
      val userId       = UUID.randomUUID()
      val token        = Room.SessionToken.mint()
      val classicProbe = org.apache.pekko.testkit.TestProbe()(testKit.system.classicSystem)

      SSE
        .source(classicProbe.ref, roomId, userId, "user 1", token)
        .to(org.apache.pekko.stream.scaladsl.Sink.cancelled)
        .run()

      classicProbe.expectMsgPF() { case RoomManager.ConnectToRoom(_, uId, _, _, _) =>
        uId mustBe userId
      }
      classicProbe.expectMsgPF() { case RoomManager.ConnectionCompleted(rId, uId, _) =>
        rId mustBe roomId
        uId mustBe userId
      }
    }
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `sbt "testOnly com.lunatech.pointingpoker.actors.RoomManagerSpec"`
Expected: FAIL to compile.

- [ ] **Step 3: Update `RoomManager.scala`**

Change `ConnectToRoom`'s definition:

```scala
  case class ConnectToRoom(roomId: UUID, userId: UUID, name: String, token: Room.SessionToken, ref: UntypedRef)
      extends Command
```

Add the two new pass-through commands:

```scala
  case class RequestSession(roomId: UUID, name: String, replyTo: ActorRef[Room.SessionMinted]) extends Command
  case class ValidateToken(roomId: UUID, token: Room.SessionToken, replyTo: ActorRef[Room.TokenResolution])
      extends Command
```

Replace the `ConnectToRoom` handler (no longer auto-creates) and add the two new handlers, in `receiveBehaviour`:

```scala
          case ConnectToRoom(roomId, userId, name, token, ref) =>
            data.rooms.get(roomId).foreach { room =>
              room ! Room.Join(Room.User(userId, name, InitialVoteState, InitialEstimation, ref, token))
            }
            Behaviors.same
          case RequestSession(roomId, name, replyTo) =>
            data.rooms
              .get(roomId)
              .fold {
                val roomActor = createRoom(roomId, context)
                context.watch(roomActor)
                val newData = data.addRoom(roomId, roomActor)
                roomActor ! Room.RequestSession(name, replyTo)
                receiveBehaviour(newData, roomResponseWrapper)
              } { room =>
                room ! Room.RequestSession(name, replyTo)
                Behaviors.same
              }
          case ValidateToken(roomId, token, replyTo) =>
            data.rooms.get(roomId) match
              case Some(room) => room ! Room.ValidateToken(token, replyTo)
              case None       => replyTo ! Room.Unresolved
            Behaviors.same
```

(remove the old `ConnectToRoom` case that lived where `RequestSession`'s find-or-create logic now sits — the find-or-create logic itself just moves from `ConnectToRoom` to `RequestSession`.)

- [ ] **Step 4: Update `SSE.scala`**

```scala
package com.lunatech.pointingpoker.sse

import java.util.UUID

import scala.concurrent.ExecutionContext
import scala.concurrent.duration.DurationInt
import scala.util.{Failure, Success}

import io.circe.syntax.*
import org.apache.pekko.actor.ActorRef
import org.apache.pekko.http.scaladsl.model.sse.ServerSentEvent
import org.apache.pekko.stream.scaladsl.Source
import org.apache.pekko.stream.{CompletionStrategy, OverflowStrategy}
import com.lunatech.pointingpoker.actors.{Room, RoomEvent, RoomManager}
import com.lunatech.pointingpoker.actors.RoomEvent.MessageType
import com.lunatech.pointingpoker.actors.RoomEvent.given

object SSE:

  val disabledBufferSize = 0

  val heartbeatInterval = 15.seconds

  def source(
      roomManager: ActorRef,
      roomId: UUID,
      userId: UUID,
      name: String,
      token: Room.SessionToken
  )(using ec: ExecutionContext): Source[ServerSentEvent, ActorRef] =
    Source
      .actorRef[RoomEvent](
        completionMatcher,
        failureMatcher,
        disabledBufferSize,
        OverflowStrategy.dropTail
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
      .map(event => ServerSentEvent(event.asJson.noSpaces))
      .keepAlive(heartbeatInterval, () => ServerSentEvent.heartbeat)

  private val completionMatcher: PartialFunction[Any, CompletionStrategy] = PartialFunction.empty

  private val failureMatcher: PartialFunction[Any, Throwable] = PartialFunction.empty
end SSE
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `sbt "testOnly com.lunatech.pointingpoker.actors.RoomManagerSpec"`
Expected: PASS

- [ ] **Step 6: Run the full suite**

Run: `sbt test`
Expected: PASS (this is the last actor-layer task — everything up through `RoomManager`/`SSE` should be green before moving to `API.scala`).

- [ ] **Step 7: Commit**

```bash
git add src/main/scala/com/lunatech/pointingpoker/actors/RoomManager.scala src/main/scala/com/lunatech/pointingpoker/sse/SSE.scala src/test/scala/com/lunatech/pointingpoker/actors/RoomManagerSpec.scala
git commit -m "feat: pass session tokens through RoomManager and SSE.source"
```

---

### Task 7: `ApiConfig.secureCookies`

**Files:**
- Modify: `src/main/scala/com/lunatech/pointingpoker/config/ApiConfig.scala`
- Modify: `src/main/resources/application.conf`
- Modify: `src/test/scala/com/lunatech/pointingpoker/config/ApiConfigSpec.scala`

**Interfaces:**
- Produces: `ApiConfig.secureCookies: Boolean`.

- [ ] **Step 1: Write the failing test**

In `ApiConfigSpec.scala`:

```scala
  "ApiConfig" should {
    "load config correctly" in {
      val config    = ConfigFactory.load()
      val apiConfig = ApiConfig.load(config)

      apiConfig.host mustBe "localhost"
      apiConfig.port mustBe 8080
      apiConfig.timeout mustBe 5.seconds
      apiConfig.indexPath mustBe "src/main/resources/pages/index.html"
      apiConfig.secureCookies mustBe true
    }
  }
```

- [ ] **Step 2: Run test to verify it fails**

Run: `sbt "testOnly com.lunatech.pointingpoker.config.ApiConfigSpec"`
Expected: FAIL to compile — `secureCookies` doesn't exist on `ApiConfig` yet.

- [ ] **Step 3: Write minimal implementation**

In `ApiConfig.scala`:

```scala
package com.lunatech.pointingpoker.config

import java.util.concurrent.TimeUnit

import com.typesafe.config.Config

import scala.concurrent.duration.FiniteDuration

final case class ApiConfig(
    host: String,
    port: Int,
    timeout: FiniteDuration,
    indexPath: String,
    secureCookies: Boolean
)

object ApiConfig:
  def load(config: Config): ApiConfig =
    ApiConfig(
      host = config.getString("pointing-poker.service.host"),
      port = config.getInt("pointing-poker.service.port"),
      timeout = FiniteDuration(
        config.getDuration("pointing-poker.service.timeout").toMillis,
        TimeUnit.MILLISECONDS
      ),
      indexPath = config.getString("pointing-poker.service.index-path"),
      secureCookies = config.getBoolean("pointing-poker.service.secure-cookies")
    )
end ApiConfig
```

In `application.conf`, add after `index-path`:

```
    index-path = "src/main/resources/pages/index.html"
    index-path = ${?INDEX_PATH}
    secure-cookies = true
    secure-cookies = ${?SECURE_COOKIES}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `sbt "testOnly com.lunatech.pointingpoker.config.ApiConfigSpec"`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/main/scala/com/lunatech/pointingpoker/config/ApiConfig.scala src/main/resources/application.conf src/test/scala/com/lunatech/pointingpoker/config/ApiConfigSpec.scala
git commit -m "feat: add secureCookies config, defaulting to true"
```

---

### Task 8: Startup log line for `secureCookies`

**Files:**
- Modify: `src/main/scala/com/lunatech/pointingpoker/Main.scala`

**Interfaces:**
- Consumes: `ApiConfig.secureCookies` (Task 7).

- [ ] **Step 1: Add the log line**

In `Main.scala`, right after `val apiConfig: ApiConfig = ApiConfig.load(system.settings.config)`:

```scala
  val apiConfig: ApiConfig = ApiConfig.load(system.settings.config)

  log.info(
    "Session cookies: Secure={} (requires HTTPS end-to-end, including through any reverse proxy). " +
      "Set SECURE_COOKIES=false for local plain-HTTP development.",
    apiConfig.secureCookies
  )
```

- [ ] **Step 2: Manually verify**

Run: `sbt run`
Expected: the log line appears in the console with `Secure=true`, before the server starts accepting connections. Stop the app (Ctrl+C). Re-run with `SECURE_COOKIES=false sbt run` and confirm the log line now reads `Secure=false`.

- [ ] **Step 3: Commit**

```bash
git add src/main/scala/com/lunatech/pointingpoker/Main.scala
git commit -m "feat: log the resolved secureCookies setting at startup"
```

---

### Task 9: `POST /join` mints a session and sets the cookie

**Files:**
- Modify: `src/main/scala/com/lunatech/pointingpoker/API.scala`
- Modify: `src/test/scala/com/lunatech/pointingpoker/APISpec.scala`

**Interfaces:**
- Consumes: `RoomManager.RequestSession`, `Room.SessionMinted`, `apiConfig.secureCookies` (Tasks 6–7).
- Produces: `/join` sets a `Set-Cookie` response header alongside the existing `{"userId": "..."}` body.

- [ ] **Step 1: Write the failing test**

Update `APISpec.scala`'s test double to handle `RequestSession` (needed for `/join` to get a reply at all), and update the `/join` test to assert the cookie. Add these imports at the top:

```scala
import com.lunatech.pointingpoker.actors.Room
import org.apache.pekko.http.scaladsl.model.headers.`Set-Cookie`
```

Update the fake `roomManager`:

```scala
  val roomManager: ActorRef[RoomManager.Command] =
    testKit.spawn(Behaviors.receiveMessagePartial[RoomManager.Command] {
      case RoomManager.CreateRoom(replyTo) =>
        replyTo ! RoomManager.RoomId(roomId)
        Behaviors.same
      case RoomManager.RequestSession(_, _, replyTo) =>
        replyTo ! Room.SessionMinted(UUID.randomUUID(), Room.SessionToken.mint())
        Behaviors.same
      case other =>
        commandProbe.ref ! other
        Behaviors.same
    })
```

Replace the `"join a room and return a minted userId"` test:

```scala
    "join a room, return a minted userId, and set a session cookie" in {
      import com.lunatech.pointingpoker.CirceSupport.given
      Post(s"/rooms/$roomId/join", JoinRequest("Alice")) ~> apiRoute ~> check {
        status.isSuccess() mustBe true
        val response = responseAs[JoinResponse]
        response.userId.toString.length > 0 mustBe true

        val cookieHeader = header[`Set-Cookie`].getOrElse(fail("expected a Set-Cookie header"))
        cookieHeader.cookie.name mustBe "session"
        cookieHeader.cookie.httpOnly mustBe true
        cookieHeader.cookie.path mustBe Some(s"/rooms/$roomId")
        cookieHeader.cookie.extension mustBe Some("SameSite=Strict")
      }
    }
```

- [ ] **Step 2: Run test to verify it fails**

Run: `sbt "testOnly com.lunatech.pointingpoker.APISpec"`
Expected: FAIL — `/join` doesn't set a cookie yet (and the route doesn't call `RequestSession` yet, so the test double addition alone doesn't matter until Step 3).

- [ ] **Step 3: Write minimal implementation**

In `API.scala`, add imports:

```scala
import org.apache.pekko.http.scaladsl.model.headers.HttpCookie
import com.lunatech.pointingpoker.actors.Room
```

Add a cookie name constant and a helper, near the top of the class body (after the `given` declarations):

```scala
  private val SessionCookieName = "session"

  private def sessionCookie(roomId: UUID, token: Room.SessionToken): HttpCookie =
    HttpCookie(
      name = SessionCookieName,
      value = token.raw,
      path = Some(s"/rooms/$roomId"),
      httpOnly = true,
      secure = apiConfig.secureCookies,
      extension = Some("SameSite=Strict")
    )
```

Replace the `/join` route:

```scala
      path("rooms" / JavaUUID / "join") { roomId =>
        post {
          import com.lunatech.pointingpoker.CirceSupport.given
          entity(as[JoinRequest]) { req =>
            onComplete(
              (roomManager ? RoomManager.RequestSession(roomId, req.name, _)).mapTo[Room.SessionMinted]
            ) {
              case Success(minted) =>
                setCookie(sessionCookie(roomId, minted.token)) {
                  complete(JoinResponse(minted.userId))
                }
              case Failure(reason) =>
                log.error("Error while joining room {}: {}", roomId, reason)
                complete(StatusCodes.InternalServerError)
            }
          }
        }
      },
```

- [ ] **Step 4: Run test to verify it passes**

Run: `sbt "testOnly com.lunatech.pointingpoker.APISpec"`
Expected: PASS — this task only touches `/join`'s route and test, plus one additive case
in the shared fake `roomManager`, so every other existing `APISpec` test (the `/events`
and command-route tests, still on their old query-param shape) keeps compiling and
passing unchanged until Tasks 10–11 touch them.

- [ ] **Step 5: Commit**

```bash
git add src/main/scala/com/lunatech/pointingpoker/API.scala src/test/scala/com/lunatech/pointingpoker/APISpec.scala
git commit -m "feat: mint a real session and set a room-scoped cookie on /join"
```

---

### Task 10: `GET /events` validates the cookie before opening the stream

**Files:**
- Modify: `src/main/scala/com/lunatech/pointingpoker/API.scala`
- Modify: `src/test/scala/com/lunatech/pointingpoker/APISpec.scala`

**Interfaces:**
- Consumes: `RoomManager.ValidateToken`, `Room.TokenResolution`/`Resolved`/`Unresolved`, `SessionCookieName`, `sessionCookie` (Tasks 6, 9).
- Produces: `/events` takes no query parameters; returns `401` when the cookie is missing, malformed, or unresolved.

- [ ] **Step 1: Write the failing tests**

In `APISpec.scala`, add a `validToken` fixture and extend the fake `roomManager` to handle `ValidateToken`:

```scala
  val validToken: Room.SessionToken = Room.SessionToken.mint()

  val roomManager: ActorRef[RoomManager.Command] =
    testKit.spawn(Behaviors.receiveMessagePartial[RoomManager.Command] {
      case RoomManager.CreateRoom(replyTo) =>
        replyTo ! RoomManager.RoomId(roomId)
        Behaviors.same
      case RoomManager.RequestSession(_, _, replyTo) =>
        replyTo ! Room.SessionMinted(UUID.randomUUID(), Room.SessionToken.mint())
        Behaviors.same
      case RoomManager.ValidateToken(_, token, replyTo) =>
        if token == validToken then replyTo ! Room.Resolved(UUID.randomUUID(), "Alice")
        else replyTo ! Room.Unresolved
        Behaviors.same
      case other =>
        commandProbe.ref ! other
        Behaviors.same
    })
```

Replace `"open an SSE events stream"` and `"reject a non-UUID userId query param on the events stream with 400"` with:

```scala
    "reject an events connection with no session cookie" in
      Get(s"/rooms/$roomId/events") ~> apiRoute ~> check {
        status mustBe StatusCodes.Unauthorized
      }

    "reject an events connection with a malformed session cookie" in
      Get(s"/rooms/$roomId/events") ~> addHeader(Cookie("session", "not-a-uuid")) ~> apiRoute ~> check {
        status mustBe StatusCodes.Unauthorized
      }

    "reject an events connection with an unresolvable session cookie" in
      Get(s"/rooms/$roomId/events") ~> addHeader(
        Cookie("session", Room.SessionToken.mint().raw)
      ) ~> apiRoute ~> check {
        status mustBe StatusCodes.Unauthorized
      }

    "open an SSE events stream for a resolved session" in
      Get(s"/rooms/$roomId/events") ~> addHeader(Cookie("session", validToken.raw)) ~> apiRoute ~> check {
        status.isSuccess() mustBe true
        mediaType.toString mustBe "text/event-stream"
      }
```

Add the `Cookie` import:

```scala
import org.apache.pekko.http.scaladsl.model.headers.Cookie
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `sbt "testOnly com.lunatech.pointingpoker.APISpec"`
Expected: FAIL — `/events` still reads `userId`/`name` query parameters instead of the cookie.

- [ ] **Step 3: Write minimal implementation**

In `API.scala`, add the import:

```scala
import org.apache.pekko.http.scaladsl.model.headers.HttpCookiePair
```

Replace the `/events` route:

```scala
      path("rooms" / JavaUUID / "events") { roomId =>
        get {
          optionalCookie(SessionCookieName) { maybeCookie =>
            maybeCookie.flatMap(c => Room.SessionToken.parse(c.value)) match
              case None =>
                complete(StatusCodes.Unauthorized)
              case Some(token) =>
                onComplete(
                  (roomManager ? RoomManager.ValidateToken(roomId, token, _)).mapTo[Room.TokenResolution]
                ) {
                  case Success(Room.Resolved(userId, name)) =>
                    complete(SSE.source(roomManager.toClassic, roomId, userId, name, token))
                  case Success(Room.Unresolved) =>
                    complete(StatusCodes.Unauthorized)
                  case Failure(reason) =>
                    log.error("Error while validating session for room {}: {}", roomId, reason)
                    complete(StatusCodes.InternalServerError)
                }
          }
        }
      },
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `sbt "testOnly com.lunatech.pointingpoker.APISpec"`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/main/scala/com/lunatech/pointingpoker/API.scala src/test/scala/com/lunatech/pointingpoker/APISpec.scala
git commit -m "feat: validate the session cookie before opening the SSE stream"
```

---

### Task 11: Command routes read the token from the cookie

**Files:**
- Modify: `src/main/scala/com/lunatech/pointingpoker/API.scala`
- Modify: `src/test/scala/com/lunatech/pointingpoker/APISpec.scala`

**Interfaces:**
- Consumes: `RoomManager.Vote`/`Show`/`Clear`/`Revote`/`EditIssue` taking a `token` (Task 5), `SessionCookieName` (Task 9).
- Produces: the five command routes no longer accept a `userId` query parameter.

- [ ] **Step 1: Write the failing tests**

In `APISpec.scala`, replace the five command tests and the two now-obsolete query-param tests. Remove `"reject a non-UUID userId query param with 400"` entirely (no query param exists to malform anymore). Replace the rest:

```scala
    "dispatch a vote command" in {
      import com.lunatech.pointingpoker.CirceSupport.given
      val token = Room.SessionToken.mint()
      Post(s"/rooms/$roomId/vote", VoteRequest("5")) ~> addHeader(
        Cookie("session", token.raw)
      ) ~> apiRoute ~> check {
        status.isSuccess() mustBe true
      }
      commandProbe.expectMessage(RoomManager.Vote(UUID.fromString(roomId), token, "5"))
    }

    "dispatch a show command" in {
      val token = Room.SessionToken.mint()
      Post(s"/rooms/$roomId/show") ~> addHeader(Cookie("session", token.raw)) ~> apiRoute ~> check {
        status.isSuccess() mustBe true
      }
      commandProbe.expectMessage(RoomManager.Show(UUID.fromString(roomId), token))
    }

    "dispatch a clear command" in {
      val token = Room.SessionToken.mint()
      Post(s"/rooms/$roomId/clear") ~> addHeader(Cookie("session", token.raw)) ~> apiRoute ~> check {
        status.isSuccess() mustBe true
      }
      commandProbe.expectMessage(RoomManager.Clear(UUID.fromString(roomId), token))
    }

    "dispatch a revote command" in {
      val token = Room.SessionToken.mint()
      Post(s"/rooms/$roomId/revote") ~> addHeader(Cookie("session", token.raw)) ~> apiRoute ~> check {
        status.isSuccess() mustBe true
      }
      commandProbe.expectMessage(RoomManager.Revote(UUID.fromString(roomId), token))
    }

    "dispatch an edit-issue command" in {
      import com.lunatech.pointingpoker.CirceSupport.given
      val token = Room.SessionToken.mint()
      Post(
        s"/rooms/$roomId/edit-issue",
        EditIssueRequest("new issue")
      ) ~> addHeader(Cookie("session", token.raw)) ~> apiRoute ~> check {
        status.isSuccess() mustBe true
      }
      commandProbe.expectMessage(
        RoomManager.EditIssue(UUID.fromString(roomId), token, "new issue")
      )
    }

    "reject a malformed vote body with 400" in {
      val malformedBody = HttpEntity(ContentTypes.`application/json`, """{"not-estimation": 5}""")
      Post(s"/rooms/$roomId/vote", malformedBody) ~> apiRoute ~> check {
        status mustBe StatusCodes.BadRequest
      }
    }

    "still return 204 for a vote with no session cookie (silently no-ops downstream)" in {
      import com.lunatech.pointingpoker.CirceSupport.given
      Post(s"/rooms/$roomId/vote", VoteRequest("5")) ~> apiRoute ~> check {
        status mustBe StatusCodes.NoContent
      }
      // The API layer never rejects a missing/invalid credential for command endpoints — Room is
      // the one that resolves the token and silently no-ops on a miss (see RoomSpec/RoomManagerSpec).
      commandProbe.expectMessageType[RoomManager.Vote]
    }
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `sbt "testOnly com.lunatech.pointingpoker.APISpec"`
Expected: FAIL — the five routes still require a `?userId=` query parameter.

- [ ] **Step 3: Write minimal implementation**

In `API.scala`, add a helper next to `sessionCookie`:

```scala
  // A missing or malformed cookie resolves to a freshly-minted, unmatchable token rather than
  // an Option threaded through every command — Room already no-ops on any token that doesn't
  // resolve to a member, so this reuses that path instead of adding a second "no credential" case.
  private def resolveToken(maybeCookie: Option[HttpCookiePair]): Room.SessionToken =
    maybeCookie.flatMap(c => Room.SessionToken.parse(c.value)).getOrElse(Room.SessionToken.mint())
```

Replace the `pathPrefix("rooms" / JavaUUID)` block:

```scala
      pathPrefix("rooms" / JavaUUID) { roomId =>
        concat(
          path("vote") {
            post {
              import com.lunatech.pointingpoker.CirceSupport.given
              optionalCookie(SessionCookieName) { maybeCookie =>
                entity(as[VoteRequest]) { req =>
                  roomManager ! RoomManager.Vote(roomId, resolveToken(maybeCookie), req.estimation)
                  complete(StatusCodes.NoContent)
                }
              }
            }
          },
          path("show") {
            post {
              optionalCookie(SessionCookieName) { maybeCookie =>
                roomManager ! RoomManager.Show(roomId, resolveToken(maybeCookie))
                complete(StatusCodes.NoContent)
              }
            }
          },
          path("clear") {
            post {
              optionalCookie(SessionCookieName) { maybeCookie =>
                roomManager ! RoomManager.Clear(roomId, resolveToken(maybeCookie))
                complete(StatusCodes.NoContent)
              }
            }
          },
          path("revote") {
            post {
              optionalCookie(SessionCookieName) { maybeCookie =>
                roomManager ! RoomManager.Revote(roomId, resolveToken(maybeCookie))
                complete(StatusCodes.NoContent)
              }
            }
          },
          path("edit-issue") {
            post {
              import com.lunatech.pointingpoker.CirceSupport.given
              optionalCookie(SessionCookieName) { maybeCookie =>
                entity(as[EditIssueRequest]) { req =>
                  roomManager ! RoomManager.EditIssue(roomId, resolveToken(maybeCookie), req.issue)
                  complete(StatusCodes.NoContent)
                }
              }
            }
          }
        )
      }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `sbt "testOnly com.lunatech.pointingpoker.APISpec"`
Expected: PASS

- [ ] **Step 5: Run the full suite**

Run: `sbt test`
Expected: PASS — every test across `RoomSpec`, `RoomManagerSpec`, `ApiConfigSpec`, `APISpec`.

- [ ] **Step 6: Commit**

```bash
git add src/main/scala/com/lunatech/pointingpoker/API.scala src/test/scala/com/lunatech/pointingpoker/APISpec.scala
git commit -m "feat: read command identity from the session cookie instead of a userId query param"
```

---

### Task 12: `index.html` — drop `userId`/`name` from request URLs

**Files:**
- Modify: `src/main/resources/pages/index.html`

No automated frontend test harness exists in this repo — verification is manual, via two browser tabs.

- [ ] **Step 1: Update `doJoin`**

Around line 380, replace:

```javascript
        doJoin: function () {
          var ref = this;
          localStorage.setItem("roomId", this.roomId);
          localStorage.setItem("name", this.user.name);
          axios.post('/rooms/' + this.roomId + '/join', { name: this.user.name })
          .then(function (response) {
            var userId = response.data.userId;
            ref.user.id = userId;
            var params = new URLSearchParams({ userId: userId, name: ref.user.name });
            ref.eventSource = new EventSource('/rooms/' + ref.roomId + '/events?' + params.toString());
```

with:

```javascript
        doJoin: function () {
          var ref = this;
          localStorage.setItem("roomId", this.roomId);
          localStorage.setItem("name", this.user.name);
          axios.post('/rooms/' + this.roomId + '/join', { name: this.user.name })
          .then(function (response) {
            var userId = response.data.userId;
            ref.user.id = userId;
            ref.eventSource = new EventSource('/rooms/' + ref.roomId + '/events');
```

(the rest of `doJoin`'s `.then` body — `onopen`/`onmessage`/`onerror` — is unchanged)

- [ ] **Step 2: Update the five command methods**

```javascript
        doShowVotes: function () {
          axios.post('/rooms/' + this.roomId + '/show', {})
          .catch(function (error) {
            console.log(error);
          });
        },
        doClearVotes: function () {
          axios.post('/rooms/' + this.roomId + '/clear', {})
          .catch(function (error) {
            console.log(error);
          });
        },
        doReVote: function () {
          axios.post('/rooms/' + this.roomId + '/revote', {})
          .catch(function (error) {
            console.log(error);
          });
        },
```

```javascript
        doEdit: function () {
          this.editing = false;
          axios.post('/rooms/' + this.roomId + '/edit-issue', { issue: this.currentIssue })
          .catch(function (error) {
            console.log(error);
          });
        },
```

```javascript
        vote: function (voteValue) {
          this.ownVoteConfirmed = true;
          axios.post('/rooms/' + this.roomId + '/vote', { estimation: voteValue })
          .catch(function (error) {
            console.log(error);
          });
        },
```

- [ ] **Step 3: Manually verify in a browser**

Run: `sbt run`
- Open two tabs to `http://localhost:8080`, create a room in the first, join it from the second using the shared link. Confirm both see each other join, vote, show, clear, revote, and edit the issue.
- Open a third tab, create a *different* room. Confirm all three tabs stay correctly attributed to their own room (this is the concrete regression check for the `Path`-scoped cookie — two different rooms' cookies must not collide).
- Close a tab and confirm the other(s) see the `leave` event.

- [ ] **Step 4: Commit**

```bash
git add src/main/resources/pages/index.html
git commit -m "feat: drop userId/name from request URLs now that the session cookie carries identity"
```

---

### Task 13: Documentation — README, known-issues, roadmap

**Files:**
- Modify: `README.md`
- Modify: `docs/known-issues.md`
- Modify: `docs/roadmap.md`

- [ ] **Step 1: Update the README's API table**

Replace the existing table (the `userId`/`name` query-parameter requirements are no longer accurate):

```markdown
| Path                            | Method | Request body          | Description                                                          |
|---------------------------------|--------|-----------------------|----------------------------------------------------------------------|
|`/`                              | GET    | none                  | Load index with frontend                                             |
|`/create-room`                   | POST   | none                  | Creates a room and returns the roomId as plain text                  |
|`/rooms/{roomId}/join`           | POST   | `{"name": "..."}`     | Mints a userId and a session, returns `{"userId": "..."}`, and sets a room-scoped session cookie |
|`/rooms/{roomId}/events`         | GET    | none                  | Opens the SSE stream (`text/event-stream`) and joins the user to the room. Requires a valid session cookie from a prior `/join`; `401` otherwise |
|`/rooms/{roomId}/vote`           | POST   | `{"estimation": "..."}` | Casts the user's vote. Requires the session cookie                 |
|`/rooms/{roomId}/show`           | POST   | none                  | Reveals all votes in the room. Requires the session cookie           |
|`/rooms/{roomId}/clear`          | POST   | none                  | Clears all votes in the room. Requires the session cookie            |
|`/rooms/{roomId}/revote`         | POST   | none                  | Starts a new voting round. Requires the session cookie               |
|`/rooms/{roomId}/edit-issue`     | POST   | `{"issue": "..."}`    | Updates the room's current issue. Requires the session cookie        |

Command endpoints return `204 No Content`. An unknown `roomId`, or a missing/invalid
session cookie, is a silent no-op.
```

- [ ] **Step 2: Add a "Cookies" section**

Insert after the "API" section:

```markdown
### Cookies

`/join` sets one cookie, scoped to `Path=/rooms/{roomId}`: a session token used to
authorize later requests to that room. It's `HttpOnly` (never read by JavaScript),
`SameSite=Strict`, and has no `Max-Age`/`Expires` — it's cleared when the browser
closes. As a strictly-necessary functional cookie (it exists only to operate the
session the user actively joined, not for tracking or analytics), it doesn't require
a cookie-consent banner under the ePrivacy Directive.
```

- [ ] **Step 3: Add a "Running locally" section**

Insert before "Deployment":

```markdown
### Running locally

`SECURE_COOKIES` defaults to `true`, which marks the session cookie `Secure` — the
browser will not send it back over a plain-HTTP connection. Local development that
isn't served over HTTPS needs:

```
SECURE_COOKIES=false sbt run
```

Without this, `/join` will appear to succeed but every subsequent request will get a
`401`, since the cookie set by `/join` never comes back on `/events`.
```

- [ ] **Step 4: Update `docs/known-issues.md`**

Remove the entire `### \`userId\` is never authenticated or checked for room membership` entry and the entire `### \`POST /rooms/{roomId}/join\` accepts a \`name\` it never uses` entry (both now resolved).

Add a new entry, in their place, under `## Open`:

```markdown
### An unrecognized `roomId` silently creates an empty room, with no bookmark continuity

- **Where:** `src/main/scala/com/lunatech/pointingpoker/actors/RoomManager.scala`
  (`RequestSession`'s find-or-create).
- **Issue:** `/join` (and, transitively, `/events`) auto-creates a room for any
  `roomId` it doesn't recognize, rather than rejecting it. A bookmarked room link
  therefore never *errors* — but if the room's actor has already been reaped (its
  last member left, or the process restarted), the link silently opens a brand-new,
  empty room under the same UUID: no prior participants, no vote history, no
  in-progress issue. There is currently no way for the server to tell "this UUID was
  never used" apart from "this UUID was a real room, but everyone left" — both look
  identical: an absent map entry.
- **Resolution:** This is a deliberate, scoped choice for the session/identity work
  (see `docs/superpowers/specs/2026-08-20-session-identity-design.md`), not an
  oversight — today's model has no persistence to actually restore, so a `404`
  instead of silent auto-create wouldn't recover any lost state either. Real
  continuity requires Phase 2's durable `sessions` store in `docs/roadmap.md`, which
  is what would let the server distinguish the two cases and make an informed choice
  about whether to 404.
```

- [ ] **Step 5: Update `docs/roadmap.md`**

Change:

```markdown
- [ ] Session/identity mechanism: validate `userId` per request, closing the
      spoofing gap the transport swap deliberately left open. See `docs/known-issues.md`
      for why this is now more urgent than originally scoped (userId exposure).
```

to:

```markdown
- [x] Session/identity mechanism: validate `userId` per request, closing the
      spoofing gap the transport swap deliberately left open. See `docs/known-issues.md`
      for why this is now more urgent than originally scoped (userId exposure).
```

- [ ] **Step 6: Commit**

```bash
git add README.md docs/known-issues.md docs/roadmap.md
git commit -m "docs: document the session cookie, local-dev setup, and resolved known issues"
```
