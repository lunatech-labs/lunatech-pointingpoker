# SSE + HTTP POST Transport Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the WebSocket transport with SSE (server push) + authenticated-shape HTTP POST (commands), with zero behavior change beyond the carrier.

**Architecture:** Strangler-fig migration in place. Tasks 1-2 are pure renames (no behavior change). Tasks 3-5 add the new HTTP/SSE surface *alongside* the existing WebSocket route, so the app stays fully working and every existing test stays green after each task. Task 6 deletes the old WebSocket route/actor-message path in one atomic step once the new surface fully replaces it. Task 7 rewires the frontend. Task 8 is final QA.

**Tech Stack:** Scala 3.8.4, Pekko Actor (typed) + Pekko Streams 1.6.0, Pekko HTTP 1.3.0, circe 0.14.15 (core/parser/generic), ScalaTest 3.2.20. Frontend: single static `index.html`, Vue 2 (CDN, no build step), axios (CDN).

**Spec:** `docs/superpowers/specs/2026-08-18-sse-transport-design.md`

## Global Constraints

- Preserve the current (insecure) trust model: `userId` is client-supplied and not cross-checked against connection identity anywhere in this plan. Closing that gap is a separate, later PR.
- Preserve the current behavior of silently auto-creating a room for any unknown `roomId` (on join/connect) and silently no-op'ing commands to an unknown `roomId` (200/204, no error). Do not add 404s or validation.
- No protocol/behavior redesign beyond swapping the carrier — the push payload shape (`RoomEvent`, one event type per broadcast/catch-up message) stays exactly as today.
- Every task must leave `sbt test` fully green — this is a live app, not a throwaway branch, so no task may land in a broken intermediate state.
- Commit after every task (Conventional Commits format, e.g. `refactor:`, `feat:`, `test:`, `docs:`, `chore:`).

---

## Task 1: Rename `WSMessage` → `RoomEvent`, move to `actors` package

Pure rename/move, no behavior change. `RoomEvent` is a domain type (events pushed to room participants), not WebSocket-specific, so it moves out of the `websocket` package into `actors`, alongside `Room.scala`/`RoomManager.scala` which already depend on it.

**Files:**
- Create (via `git mv`): `src/main/scala/com/lunatech/pointingpoker/actors/RoomEvent.scala` (from `src/main/scala/com/lunatech/pointingpoker/websocket/WSMessage.scala`)
- Modify: `src/main/scala/com/lunatech/pointingpoker/actors/Room.scala`
- Modify: `src/main/scala/com/lunatech/pointingpoker/actors/RoomManager.scala`
- Modify: `src/main/scala/com/lunatech/pointingpoker/websocket/WS.scala`
- Modify: `src/test/scala/com/lunatech/pointingpoker/actors/RoomManagerSpec.scala`
- Modify: `src/test/scala/com/lunatech/pointingpoker/actors/RoomSpec.scala`

**Interfaces:**
- Produces: `com.lunatech.pointingpoker.actors.RoomEvent` (case class `RoomEvent(messageType: MessageType, roomId: UUID, userId: UUID, extra: String)`), `RoomEvent.MessageType` enum, `RoomEvent.NoExtra`, `given roomEventEncoder: Encoder[RoomEvent]`, `given roomEventDecoder: Decoder[RoomEvent]` (still present in this task — it's still used by the old WS inbound path until Task 6). All later tasks reference `RoomEvent`, never `WSMessage`.

- [ ] **Step 1: Confirm baseline is green**

Run: `sbt test`
Expected: all existing suites pass (this is the safety net for a pure rename — no new test is written for this task, since there's no new behavior).

- [ ] **Step 2: Move and rename the file**

```bash
git mv src/main/scala/com/lunatech/pointingpoker/websocket/WSMessage.scala \
       src/main/scala/com/lunatech/pointingpoker/actors/RoomEvent.scala
```

- [ ] **Step 3: Rename the type inside the moved file**

```bash
sed -i \
  -e 's/^package com\.lunatech\.pointingpoker\.websocket$/package com.lunatech.pointingpoker.actors/' \
  -e 's/com\.lunatech\.pointingpoker\.websocket\.WSMessage/com.lunatech.pointingpoker.actors.RoomEvent/' \
  -e 's/\bWSMessage\b/RoomEvent/g' \
  -e 's/wsMessageDecoder/roomEventDecoder/' \
  -e 's/wsMessageEncoder/roomEventEncoder/' \
  src/main/scala/com/lunatech/pointingpoker/actors/RoomEvent.scala
```

Resulting file must read exactly:

```scala
package com.lunatech.pointingpoker.actors

import java.util.UUID

import com.lunatech.pointingpoker.actors.RoomEvent.MessageType
import io.circe.*
import io.circe.generic.semiauto.*
import scala.util.Try

case class RoomEvent(
    messageType: MessageType,
    roomId: UUID,
    userId: UUID,
    extra: String
)

object RoomEvent:

  val NoExtra = ""

  enum MessageType(val stringRep: String):
    case Init      extends MessageType("init")
    case Join      extends MessageType("join")
    case Leave     extends MessageType("leave")
    case Vote      extends MessageType("vote")
    case Show      extends MessageType("show")
    case Clear     extends MessageType("clear")
    case EditIssue extends MessageType("edit_issue")
    case Revote    extends MessageType("revote")

  object MessageType:
    import MessageType.*
    def apply(messageType: String): MessageType =
      messageType match
        case Init.stringRep      => Init
        case Join.stringRep      => Join
        case Leave.stringRep     => Leave
        case Vote.stringRep      => Vote
        case Show.stringRep      => Show
        case Clear.stringRep     => Clear
        case EditIssue.stringRep => EditIssue
        case Revote.stringRep    => Revote
        case _ => throw new IllegalArgumentException(s"$messageType is not a valid MessageType")

    def unapply(messageType: MessageType): Option[String] =
      messageType match
        case Init      => Option(Init.stringRep)
        case Join      => Option(Join.stringRep)
        case Leave     => Option(Leave.stringRep)
        case Vote      => Option(Vote.stringRep)
        case Show      => Option(Show.stringRep)
        case Clear     => Option(Clear.stringRep)
        case EditIssue => Option(EditIssue.stringRep)
        case Revote    => Option(Revote.stringRep)
  end MessageType

  given messageTypeDecoder: Decoder[MessageType] =
    Decoder.decodeString.emapTry(str => Try(MessageType(str)))

  given messageTypeEncoder: Encoder[MessageType] =
    Encoder.encodeString.contramap(m => m.stringRep)

  given roomEventDecoder: Decoder[RoomEvent] = deriveDecoder[RoomEvent]

  given roomEventEncoder: Encoder[RoomEvent] = deriveEncoder[RoomEvent]

end RoomEvent
```

- [ ] **Step 4: Update dependents in the same package (drop the now-redundant import, rename usages)**

```bash
sed -i '/^import com\.lunatech\.pointingpoker\.websocket\.WSMessage/d; s/\bWSMessage\b/RoomEvent/g' \
  src/main/scala/com/lunatech/pointingpoker/actors/Room.scala \
  src/main/scala/com/lunatech/pointingpoker/actors/RoomManager.scala \
  src/test/scala/com/lunatech/pointingpoker/actors/RoomManagerSpec.scala \
  src/test/scala/com/lunatech/pointingpoker/actors/RoomSpec.scala
```

- [ ] **Step 5: Update `WS.scala` (still in the `websocket` package — needs a real cross-package import, not deletion)**

```bash
sed -i \
  -e 's/com\.lunatech\.pointingpoker\.websocket\.WSMessage/com.lunatech.pointingpoker.actors.RoomEvent/g' \
  -e 's/\bWSMessage\b/RoomEvent/g' \
  src/main/scala/com/lunatech/pointingpoker/websocket/WS.scala
```

- [ ] **Step 6: Compile and run the full suite**

Run: `sbt compile Test/compile test`
Expected: compiles cleanly, all existing tests pass with identical assertions (just referencing `RoomEvent` instead of `WSMessage` — `IncomeWSMessage`/`UnsupportedWSMessage`/`WSCompleted`/`WSFailure` names are untouched by this task, since those don't contain `WSMessage` as a whole word).

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "$(cat <<'EOF'
refactor: rename WSMessage to RoomEvent, move to actors package

RoomEvent represents domain events pushed to room participants, not a
WebSocket-specific format, so it belongs next to Room/RoomManager
rather than in the websocket package.
EOF
)"
```

---

## Task 2: Rename `RoomManager`'s WS-named commands to transport-neutral names

Pure rename, no behavior change: `WSCompleted` → `ConnectionCompleted`, `WSFailure` → `ConnectionFailure`, `CompleteWS` → `CompleteStream`.

**Files:**
- Modify: `src/main/scala/com/lunatech/pointingpoker/actors/RoomManager.scala`
- Modify: `src/main/scala/com/lunatech/pointingpoker/websocket/WS.scala`
- Modify: `src/test/scala/com/lunatech/pointingpoker/actors/RoomManagerSpec.scala`

**Interfaces:**
- Produces: `RoomManager.ConnectionCompleted(roomId: UUID, userId: UUID)`, `RoomManager.ConnectionFailure(t: Throwable)`, `RoomManager.CompleteStream` — Task 5 (the new SSE source) sends these instead of `WSCompleted`/`WSFailure`/`CompleteWS`.

- [ ] **Step 1: Confirm baseline is green**

Run: `sbt test`

- [ ] **Step 2: Rename across the three files**

```bash
sed -i \
  -e 's/\bWSCompleted\b/ConnectionCompleted/g' \
  -e 's/\bWSFailure\b/ConnectionFailure/g' \
  -e 's/\bCompleteWS\b/CompleteStream/g' \
  src/main/scala/com/lunatech/pointingpoker/actors/RoomManager.scala \
  src/main/scala/com/lunatech/pointingpoker/websocket/WS.scala \
  src/test/scala/com/lunatech/pointingpoker/actors/RoomManagerSpec.scala
```

- [ ] **Step 3: Update the log strings that mention the old names**

`RoomManager.scala` has `context.log.error("WSFailure: {}", t)` and `context.log.error("CompleteWS: should never be received")` — the sed above only renames the Scala identifiers, not these string literals. Manually update `RoomManager.scala`:

```scala
          case ConnectionFailure(t) =>
            context.log.error("ConnectionFailure: {}", t)
            Behaviors.same
          case CompleteStream() =>
            context.log.error("CompleteStream: should never be received")
            Behaviors.same
```

(These replace the two blocks that previously read `WSFailure(t) => ... "WSFailure: {}" ...` and `CompleteWS() => ... "CompleteWS: should never be received" ...`.)

Also update the RoomManagerSpec test name string: change `"handle web socket connection completed"` to `"handle connection completed"`.

- [ ] **Step 4: Compile and run the full suite**

Run: `sbt compile Test/compile test`
Expected: all tests pass, referencing the new names.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "$(cat <<'EOF'
refactor: rename RoomManager's WS-named commands

WSCompleted/WSFailure/CompleteWS become ConnectionCompleted/
ConnectionFailure/CompleteStream, since the upcoming SSE source will
trigger these from stream termination rather than a WebSocket closing.
EOF
)"
```

---

## Task 3: Add JSON (un)marshalling support + `POST /rooms/{roomId}/join`

First new HTTP surface. No existing WS behavior is touched — this is purely additive. The project has circe on the classpath but nothing wires it into Pekko HTTP's `entity(as[T])`/`complete(t)` yet (the current WS code parses JSON manually with `circe-parser`), so this task adds a small generic circe marshaller/unmarshaller pair rather than pulling in a new external library.

**Files:**
- Create: `src/main/scala/com/lunatech/pointingpoker/CirceSupport.scala`
- Create: `src/main/scala/com/lunatech/pointingpoker/Requests.scala`
- Modify: `src/main/scala/com/lunatech/pointingpoker/API.scala`
- Modify: `src/test/scala/com/lunatech/pointingpoker/APISpec.scala`

**Interfaces:**
- Produces: `given circeUnmarshaller[T: Decoder]: FromEntityUnmarshaller[T]`, `given circeMarshaller[T: Encoder]: ToEntityMarshaller[T]` in `CirceSupport` — every later task's JSON endpoints (`entity(as[...])`, `complete(someCaseClass)`) import `com.lunatech.pointingpoker.CirceSupport.given`. `JoinRequest(name: String)`, `JoinResponse(userId: UUID)` in `Requests.scala`.

- [ ] **Step 1: Write `CirceSupport.scala`**

```scala
package com.lunatech.pointingpoker

import io.circe.{Decoder, Encoder}
import io.circe.parser.decode
import io.circe.syntax.*
import org.apache.pekko.http.scaladsl.marshalling.{Marshaller, ToEntityMarshaller}
import org.apache.pekko.http.scaladsl.model.{ContentTypeRange, MediaTypes}
import org.apache.pekko.http.scaladsl.unmarshalling.{FromEntityUnmarshaller, Unmarshaller}

object CirceSupport:

  given circeUnmarshaller[T](using decoder: Decoder[T]): FromEntityUnmarshaller[T] =
    Unmarshaller.stringUnmarshaller
      .forContentTypes(ContentTypeRange(MediaTypes.`application/json`))
      .map(body => decode[T](body).fold(throw _, identity))

  given circeMarshaller[T](using encoder: Encoder[T]): ToEntityMarshaller[T] =
    Marshaller.stringMarshaller(MediaTypes.`application/json`).compose(_.asJson.noSpaces)

end CirceSupport
```

- [ ] **Step 2: Write `Requests.scala` with the join request/response**

```scala
package com.lunatech.pointingpoker

import java.util.UUID

import io.circe.{Decoder, Encoder}
import io.circe.generic.semiauto.{deriveDecoder, deriveEncoder}

case class JoinRequest(name: String)
object JoinRequest:
  given Decoder[JoinRequest] = deriveDecoder[JoinRequest]

case class JoinResponse(userId: UUID)
object JoinResponse:
  given Encoder[JoinResponse] = deriveEncoder[JoinResponse]
```

- [ ] **Step 3: Write the failing test in `APISpec.scala`**

Add this import at the top (alongside the existing imports):

```scala
import com.lunatech.pointingpoker.CirceSupport.given
import com.lunatech.pointingpoker.JoinResponse
import io.circe.parser.decode
```

Add this test inside the `"API" should { ... }` block, after the existing `"create a room"` test:

```scala
    "join a room and return a minted userId" in {
      Post(s"/rooms/$roomId/join", JoinRequest("Alice")) ~> apiRoute ~> check {
        status.isSuccess() mustBe true
        val parsed = decode[JoinResponse](responseAs[String])
        parsed.isRight mustBe true
      }
    }
```

(This needs `import com.lunatech.pointingpoker.JoinRequest` and `io.circe.syntax.*` for `Post(..., JoinRequest(...))` to be marshalled — add those two imports as well.)

- [ ] **Step 4: Run it to see it fail**

Run: `sbt "testOnly com.lunatech.pointingpoker.APISpec"`
Expected: FAIL — compile error or 404, since the route doesn't exist yet.

- [ ] **Step 5: Add the route to `API.scala`**

Add these imports to `API.scala`:

```scala
import com.lunatech.pointingpoker.CirceSupport.given
```

Add this route as a new branch inside the existing `concat(...)` in `API.scala`, alongside `create-room` and the `websocket` path (leave the `websocket` route untouched — it stays until Task 6):

```scala
      path("rooms" / JavaUUID / "join") { _ =>
        post {
          entity(as[JoinRequest]) { _ =>
            complete(JoinResponse(UUID.randomUUID()))
          }
        }
      },
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `sbt "testOnly com.lunatech.pointingpoker.APISpec"`
Expected: PASS.

- [ ] **Step 7: Run the full suite**

Run: `sbt test`
Expected: all suites pass (existing WS-related tests untouched, since nothing about the WS route changed).

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "$(cat <<'EOF'
feat: add POST /rooms/{roomId}/join endpoint

Mints a userId and returns it, mirroring today's WS.handler inline
mint. No actor interaction yet -- a User record needs a ref, which
only exists once the SSE stream opens (added in a later commit).
EOF
)"
```

---

## Task 4: Add typed per-command `RoomManager` messages + POST command endpoints

Adds `Vote`/`Show`/`Clear`/`Revote`/`EditIssue` as first-class `RoomManager.Command`s (replacing, for the *new* HTTP path only, the generic `IncomeWSMessage(RoomEvent)` dispatch — the old WS route keeps using `IncomeWSMessage` until Task 6). Each does exactly what `handleIncomeMessage` already does for that message type today.

**Files:**
- Modify: `src/main/scala/com/lunatech/pointingpoker/actors/RoomManager.scala`
- Modify: `src/main/scala/com/lunatech/pointingpoker/Requests.scala`
- Modify: `src/main/scala/com/lunatech/pointingpoker/API.scala`
- Modify: `src/test/scala/com/lunatech/pointingpoker/actors/RoomManagerSpec.scala`
- Modify: `src/test/scala/com/lunatech/pointingpoker/APISpec.scala`

**Interfaces:**
- Consumes: `Room.Vote(userId, estimation)`, `Room.ShowVotes(userId)`, `Room.ClearVotes(userId)`, `Room.ReVote(userId)`, `Room.EditIssue(userId, issue)` (all pre-existing on `Room.Command`).
- Produces: `RoomManager.Vote(roomId, userId, estimation)`, `RoomManager.Show(roomId, userId)`, `RoomManager.Clear(roomId, userId)`, `RoomManager.Revote(roomId, userId)`, `RoomManager.EditIssue(roomId, userId, issue)` — used by API routes added in this task.

- [ ] **Step 1: Write the failing test in `RoomManagerSpec.scala`**

Add this test inside the `"RoomManager Actor" should { ... }` block:

```scala
    "handle typed per-command messages" in {
      val roomId            = UUID.randomUUID()
      val roomProbe         = testKit.createTestProbe[Room.Command]()
      val roomResponseProbe = testKit.createTestProbe[Room.Response]()
      val managerRef        = testKit.spawn(
        RoomManager
          .receiveBehaviour(RoomManagerData(Map(roomId -> roomProbe.ref)), roomResponseProbe.ref)
      )
      val userId = UUID.randomUUID()

      managerRef ! RoomManager.Vote(roomId, userId, "5")
      managerRef ! RoomManager.Show(roomId, userId)
      managerRef ! RoomManager.Clear(roomId, userId)
      managerRef ! RoomManager.Revote(roomId, userId)
      managerRef ! RoomManager.EditIssue(roomId, userId, "issue name")

      roomProbe.expectMessage(Room.Vote(userId, "5"))
      roomProbe.expectMessage(Room.ShowVotes(userId))
      roomProbe.expectMessage(Room.ClearVotes(userId))
      roomProbe.expectMessage(Room.ReVote(userId))
      roomProbe.expectMessage(Room.EditIssue(userId, "issue name"))
    }

    "no-op typed per-command messages for an unknown room" in {
      val roomProbe         = testKit.createTestProbe[Room.Command]()
      val roomResponseProbe = testKit.createTestProbe[Room.Response]()
      val managerRef        = testKit.spawn(
        RoomManager.receiveBehaviour(RoomManagerData.empty, roomResponseProbe.ref)
      )

      managerRef ! RoomManager.Vote(UUID.randomUUID(), UUID.randomUUID(), "5")

      roomProbe.expectNoMessage()
    }
```

- [ ] **Step 2: Run it to see it fail**

Run: `sbt "testOnly com.lunatech.pointingpoker.actors.RoomManagerSpec"`
Expected: FAIL with a compile error (`RoomManager.Vote`/`Show`/`Clear`/`Revote`/`EditIssue` don't exist yet — note `RoomManager.Revote` here, not `ReVote`, matching the existing `MessageType.Revote` casing convention).

- [ ] **Step 3: Add the new `Command` cases to `RoomManager.scala`**

Add these alongside the existing `Command` cases (after `case class RoomResponseWrapper`):

```scala
  case class Vote(roomId: UUID, userId: UUID, estimation: String) extends Command
  case class Show(roomId: UUID, userId: UUID)                     extends Command
  case class Clear(roomId: UUID, userId: UUID)                    extends Command
  case class Revote(roomId: UUID, userId: UUID)                   extends Command
  case class EditIssue(roomId: UUID, userId: UUID, issue: String) extends Command
```

Add these match arms inside `receiveBehaviour`'s `Behaviors.receive[Command]`, right after the existing `RoomResponseWrapper` case and before `IncomeWSMessage`:

```scala
          case Vote(roomId, userId, estimation) =>
            data.rooms.get(roomId).foreach(room => room ! Room.Vote(userId, estimation))
            Behaviors.same
          case Show(roomId, userId) =>
            data.rooms.get(roomId).foreach(room => room ! Room.ShowVotes(userId))
            Behaviors.same
          case Clear(roomId, userId) =>
            data.rooms.get(roomId).foreach(room => room ! Room.ClearVotes(userId))
            Behaviors.same
          case Revote(roomId, userId) =>
            data.rooms.get(roomId).foreach(room => room ! Room.ReVote(userId))
            Behaviors.same
          case EditIssue(roomId, userId, issue) =>
            data.rooms.get(roomId).foreach(room => room ! Room.EditIssue(userId, issue))
            Behaviors.same
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `sbt "testOnly com.lunatech.pointingpoker.actors.RoomManagerSpec"`
Expected: PASS.

- [ ] **Step 5: Add request bodies to `Requests.scala`**

Append to `Requests.scala`:

```scala
case class VoteRequest(estimation: String)
object VoteRequest:
  given Decoder[VoteRequest] = deriveDecoder[VoteRequest]

case class EditIssueRequest(issue: String)
object EditIssueRequest:
  given Decoder[EditIssueRequest] = deriveDecoder[EditIssueRequest]
```

- [ ] **Step 6: Write the failing API-level tests in `APISpec.scala`**

The stub `roomManager` actor in `APISpec.scala` currently only handles `RoomManager.CreateRoom`. Replace its `Behaviors.receiveMessagePartial[RoomManager.Command] { case RoomManager.CreateRoom(replyTo) => ... }` block with a version that also captures command messages, so the tests can assert on them. Replace the whole `roomManager` val with:

```scala
  val commandProbe: org.apache.pekko.actor.testkit.typed.scaladsl.TestProbe[RoomManager.Command] =
    testKit.createTestProbe[RoomManager.Command]()

  val roomManager: ActorRef[RoomManager.Command] =
    testKit.spawn(Behaviors.receiveMessagePartial[RoomManager.Command] {
      case RoomManager.CreateRoom(replyTo) =>
        replyTo ! RoomManager.RoomId(roomId)
        Behaviors.same
      case other =>
        commandProbe.ref ! other
        Behaviors.same
    })
```

Add these tests to the `"API" should { ... }` block:

```scala
    "dispatch a vote command" in {
      val userId = UUID.randomUUID()
      Post(s"/rooms/$roomId/vote?userId=$userId", VoteRequest("5")) ~> apiRoute ~> check {
        status.isSuccess() mustBe true
      }
      commandProbe.expectMessage(RoomManager.Vote(UUID.fromString(roomId), userId, "5"))
    }

    "dispatch a show command" in {
      val userId = UUID.randomUUID()
      Post(s"/rooms/$roomId/show?userId=$userId") ~> apiRoute ~> check {
        status.isSuccess() mustBe true
      }
      commandProbe.expectMessage(RoomManager.Show(UUID.fromString(roomId), userId))
    }

    "dispatch a clear command" in {
      val userId = UUID.randomUUID()
      Post(s"/rooms/$roomId/clear?userId=$userId") ~> apiRoute ~> check {
        status.isSuccess() mustBe true
      }
      commandProbe.expectMessage(RoomManager.Clear(UUID.fromString(roomId), userId))
    }

    "dispatch a revote command" in {
      val userId = UUID.randomUUID()
      Post(s"/rooms/$roomId/revote?userId=$userId") ~> apiRoute ~> check {
        status.isSuccess() mustBe true
      }
      commandProbe.expectMessage(RoomManager.Revote(UUID.fromString(roomId), userId))
    }

    "dispatch an edit-issue command" in {
      val userId = UUID.randomUUID()
      Post(s"/rooms/$roomId/edit-issue?userId=$userId", EditIssueRequest("new issue")) ~> apiRoute ~> check {
        status.isSuccess() mustBe true
      }
      commandProbe.expectMessage(RoomManager.EditIssue(UUID.fromString(roomId), userId, "new issue"))
    }

    "reject a malformed vote body with 400" in {
      val userId = UUID.randomUUID()
      val malformedBody =
        HttpEntity(ContentTypes.`application/json`, """{"not-estimation": 5}""")
      Post(s"/rooms/$roomId/vote?userId=$userId", malformedBody) ~> apiRoute ~> check {
        status mustBe StatusCodes.BadRequest
      }
    }
```

Add the needed imports to `APISpec.scala`:

```scala
import com.lunatech.pointingpoker.{CirceSupport, VoteRequest, EditIssueRequest}
import com.lunatech.pointingpoker.CirceSupport.given
import org.apache.pekko.http.scaladsl.model.{ContentTypes, HttpEntity, StatusCodes}
```

- [ ] **Step 7: Run it to see it fail**

Run: `sbt "testOnly com.lunatech.pointingpoker.APISpec"`
Expected: FAIL — routes don't exist yet (404s).

- [ ] **Step 8: Add the command routes to `API.scala`**

Add these routes to the `concat(...)` in `API.scala`, alongside the `rooms/.../join` route added in Task 3:

```scala
      pathPrefix("rooms" / JavaUUID) { roomId =>
        concat(
          path("vote") {
            post {
              parameter("userId") { userIdStr =>
                entity(as[VoteRequest]) { req =>
                  roomManager ! RoomManager.Vote(roomId, UUID.fromString(userIdStr), req.estimation)
                  complete(StatusCodes.NoContent)
                }
              }
            }
          },
          path("show") {
            post {
              parameter("userId") { userIdStr =>
                roomManager ! RoomManager.Show(roomId, UUID.fromString(userIdStr))
                complete(StatusCodes.NoContent)
              }
            }
          },
          path("clear") {
            post {
              parameter("userId") { userIdStr =>
                roomManager ! RoomManager.Clear(roomId, UUID.fromString(userIdStr))
                complete(StatusCodes.NoContent)
              }
            }
          },
          path("revote") {
            post {
              parameter("userId") { userIdStr =>
                roomManager ! RoomManager.Revote(roomId, UUID.fromString(userIdStr))
                complete(StatusCodes.NoContent)
              }
            }
          },
          path("edit-issue") {
            post {
              parameter("userId") { userIdStr =>
                entity(as[EditIssueRequest]) { req =>
                  roomManager ! RoomManager.EditIssue(roomId, UUID.fromString(userIdStr), req.issue)
                  complete(StatusCodes.NoContent)
                }
              }
            }
          }
        )
      },
```

Note: `path("rooms" / JavaUUID / "join") { _ => ... }` from Task 3 must stay a sibling route in the same `concat(...)`, not nested under this new `pathPrefix("rooms" / JavaUUID)` block — Pekko HTTP tries routes in order, so keep `join` listed before this `pathPrefix` block (or after; both work since the path segments after `rooms/{roomId}` don't overlap, but keeping `join` first matches the order these were introduced).

- [ ] **Step 9: Run the test to verify it passes**

Run: `sbt "testOnly com.lunatech.pointingpoker.APISpec"`
Expected: PASS.

- [ ] **Step 10: Run the full suite**

Run: `sbt test`
Expected: all suites pass.

- [ ] **Step 11: Commit**

```bash
git add -A
git commit -m "$(cat <<'EOF'
feat: add typed RoomManager commands and POST command endpoints

Vote/Show/Clear/Revote/EditIssue land as first-class RoomManager
commands and get their own POST /rooms/{roomId}/... endpoints,
alongside (not yet replacing) the existing IncomeWSMessage dispatch
used by the WS route.
EOF
)"
```

---

## Task 5: Add `SSE.scala` + `GET /rooms/{roomId}/events`

Adds the push side. Still additive — the old `websocket` route and `WS.scala` are untouched and still fully functional after this task.

**Files:**
- Create: `src/main/scala/com/lunatech/pointingpoker/sse/SSE.scala`
- Modify: `src/main/scala/com/lunatech/pointingpoker/API.scala`
- Modify: `src/test/scala/com/lunatech/pointingpoker/actors/RoomManagerSpec.scala`

**Interfaces:**
- Consumes: `RoomManager.ConnectToRoom(message: RoomEvent, user: ActorRef)` (unchanged, pre-existing), `RoomManager.ConnectionCompleted`/`ConnectionFailure`/`CompleteStream` (from Task 2).
- Produces: `SSE.source(roomManager: ActorRef, roomId: UUID, userId: UUID, name: String)(using ExecutionContext): Source[ServerSentEvent, ActorRef]` — used directly by the `API.scala` route in this task; no later task depends on it beyond that.

- [ ] **Step 1: Write the failing test in `RoomManagerSpec.scala`**

This mirrors the existing `"connect user to room"` test but drives the connection through `SSE.source` directly (materializing the stream, not going through a full HTTP round trip — there's no precedent for testing the WS route at the HTTP layer either, since `WS.scala` has never had a dedicated test). Add this import at the top of the file:

```scala
import scala.concurrent.ExecutionContext
```

Add this test inside the `"RoomManager Actor" should { ... }` block:

```scala
    "connect a user via SSE.source and register it with ConnectToRoom" in {
      import com.lunatech.pointingpoker.sse.SSE
      given ExecutionContext = testKit.system.executionContext

      val roomId       = UUID.randomUUID()
      val userId       = UUID.randomUUID()
      val classicProbe = org.apache.pekko.testkit.TestProbe()(testKit.system.classicSystem)

      // ConnectToRoom is sent to a classic ActorRef in production (roomManager.toClassic),
      // so drive SSE.source with a classic probe standing in for it.
      SSE
        .source(classicProbe.ref, roomId, userId, "user 1")
        .to(org.apache.pekko.stream.scaladsl.Sink.ignore)
        .run()(using testKit.system.classicSystem)

      classicProbe.expectMsgPF() {
        case RoomManager.ConnectToRoom(message, _) =>
          message.messageType mustBe com.lunatech.pointingpoker.actors.RoomEvent.MessageType.Join
          message.roomId mustBe roomId
          message.userId mustBe userId
          message.extra mustBe "user 1"
      }
    }
```

- [ ] **Step 2: Run it to see it fail**

Run: `sbt "testOnly com.lunatech.pointingpoker.actors.RoomManagerSpec"`
Expected: FAIL with a compile error — `com.lunatech.pointingpoker.sse.SSE` doesn't exist yet.

- [ ] **Step 3: Write `SSE.scala`**

```scala
package com.lunatech.pointingpoker.sse

import java.util.UUID

import scala.concurrent.ExecutionContext
import scala.util.{Failure, Success}

import io.circe.syntax.*
import org.apache.pekko.actor.ActorRef
import org.apache.pekko.http.scaladsl.model.sse.ServerSentEvent
import org.apache.pekko.stream.scaladsl.Source
import org.apache.pekko.stream.{CompletionStrategy, OverflowStrategy}
import com.lunatech.pointingpoker.actors.{RoomEvent, RoomManager}
import com.lunatech.pointingpoker.actors.RoomEvent.MessageType
import com.lunatech.pointingpoker.actors.RoomEvent.given

object SSE:

  val disabledBufferSize = 0

  def source(roomManager: ActorRef, roomId: UUID, userId: UUID, name: String)(using
      ec: ExecutionContext
  ): Source[ServerSentEvent, ActorRef] =
    Source
      .actorRef[RoomEvent](
        completionMatcher,
        failureMatcher,
        disabledBufferSize,
        OverflowStrategy.dropTail
      )
      .mapMaterializedValue { user =>
        roomManager ! RoomManager.ConnectToRoom(
          RoomEvent(MessageType.Join, roomId, userId, name),
          user
        )
        user
      }
      .watchTermination() { (user, done) =>
        done.onComplete {
          case Success(_) => roomManager ! RoomManager.ConnectionCompleted(roomId, userId)
          case Failure(t) => roomManager ! RoomManager.ConnectionFailure(t)
        }
        user
      }
      .map(event => ServerSentEvent(event.asJson.noSpaces))

  private val completionMatcher: PartialFunction[Any, CompletionStrategy] = {
    case RoomManager.CompleteStream => CompletionStrategy.immediately
  }

  private val failureMatcher: PartialFunction[Any, Throwable] = PartialFunction.empty
end SSE
```

**Note for the implementer:** this assumes `org.apache.pekko.http.scaladsl.model.sse.ServerSentEvent` and its marshalling support (`org.apache.pekko.http.scaladsl.marshalling.sse.EventStreamMarshalling`, added to `API.scala` in Step 5) ship in the core `pekko-http` artifact already on the classpath (`V.pekkoHttp = "1.3.0"` in `build.sbt`) — this mirrors Akka HTTP, where SSE support has been part of `akka-http` core (not a separate module) since 10.1. If compiling this file or Step 6 fails with "object sse is not a member of package model" or similar, check whether a separate `pekko-http-sse` artifact needs adding to `build.sbt`'s `libraryDependencies` before proceeding.

- [ ] **Step 4: Run the test to verify it passes**

Run: `sbt "testOnly com.lunatech.pointingpoker.actors.RoomManagerSpec"`
Expected: PASS.

- [ ] **Step 5: Wire the route in `API.scala`**

Add these imports:

```scala
import org.apache.pekko.http.scaladsl.marshalling.sse.EventStreamMarshalling
import com.lunatech.pointingpoker.sse.SSE
```

Mix `EventStreamMarshalling` into the `API` class:

```scala
class API(roomManager: ActorRef[RoomManager.Command], apiConfig: ApiConfig)(using
    actorSystem: ActorSystem[SpawnProtocol.Command]
) extends EventStreamMarshalling:
```

Add a `given ExecutionContext` near the existing `given timeout: Timeout` line:

```scala
  private given ec: scala.concurrent.ExecutionContext = actorSystem.executionContext
```

Add the route to the `concat(...)`, alongside `join`/the command routes:

```scala
      path("rooms" / JavaUUID / "events") { roomId =>
        get {
          parameters("userId", "name") { (userIdStr, name) =>
            complete(SSE.source(roomId, UUID.fromString(userIdStr), name, roomManager.toClassic))
          }
        }
      },
```

- [ ] **Step 6: Compile**

Run: `sbt compile`
Expected: compiles cleanly. If it doesn't (see the note in Step 3), resolve the missing SSE support before continuing — don't proceed to Step 7 with a broken build.

- [ ] **Step 7: Run the full suite**

Run: `sbt test`
Expected: all suites pass, including the still-untouched WS-route tests.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "$(cat <<'EOF'
feat: add SSE push transport and GET /rooms/{roomId}/events

Reuses the existing Source.actorRef + ConnectToRoom registration
pattern from WS.handler, marshalled as text/event-stream instead of
WS text frames. Leave detection moves from the (now nonexistent)
inbound sink to watchTermination() on this outbound source.
EOF
)"
```

---

## Task 6: Remove the old WebSocket transport

Atomic removal now that `join`, the five command endpoints, and `events` fully replace the WebSocket route's responsibilities. This is the one task in the plan that deletes rather than adds.

**Files:**
- Modify: `src/main/scala/com/lunatech/pointingpoker/API.scala`
- Delete: `src/main/scala/com/lunatech/pointingpoker/websocket/WS.scala`
- Modify: `src/main/scala/com/lunatech/pointingpoker/actors/RoomManager.scala`
- Modify: `src/main/scala/com/lunatech/pointingpoker/actors/RoomEvent.scala`
- Modify: `src/main/resources/application.conf`
- Modify: `src/test/scala/com/lunatech/pointingpoker/actors/RoomManagerSpec.scala`

**Interfaces:** none new — this task only removes now-dead code paths. Nothing after this task references `IncomeWSMessage`, `UnsupportedWSMessage`, `handleIncomeMessage`, or `RoomEvent`'s inbound decoder.

- [ ] **Step 1: Remove the `websocket` route from `API.scala`**

Delete this block from the `concat(...)` (and the now-unused `URLDecoder`/`StandardCharsets`/`WS` imports at the top of the file):

```scala
      path("websocket" / JavaUUID / Remaining) { (roomId, encodedName) =>
        log.debug("Websocket call: {} {}", roomId, encodedName)
        handleWebSocketMessages(
          WS.handler(
            roomId,
            URLDecoder.decode(encodedName, StandardCharsets.UTF_8.name()),
            roomManager.toClassic
          )
        )
      }
```

- [ ] **Step 2: Delete `WS.scala`**

```bash
git rm src/main/scala/com/lunatech/pointingpoker/websocket/WS.scala
```

- [ ] **Step 3: Remove `IncomeWSMessage`/`UnsupportedWSMessage`/`handleIncomeMessage` from `RoomManager.scala`**

Remove these two `Command` case definitions:

```scala
  case class IncomeWSMessage(message: RoomEvent)                 extends Command
  case object UnsupportedWSMessage                               extends Command
```

Remove these two match arms from `receiveBehaviour`:

```scala
          case IncomeWSMessage(message) =>
            data.rooms.get(message.roomId).foreach(handleIncomeMessage(_, message, context))
            Behaviors.same
          case UnsupportedWSMessage =>
            context.log.error("UnsupportedWSMessage received")
            Behaviors.same
```

Remove the `handleIncomeMessage` private method entirely (the whole `private[actors] def handleIncomeMessage(...)` block at the bottom of the file, including its closing `end handleIncomeMessage`).

The `RoomEvent`/`MessageType` imports at the top of `RoomManager.scala` are still needed (for `ConnectToRoom(message: RoomEvent, ...)`), so leave those.

- [ ] **Step 4: Remove `RoomEvent`'s inbound decoder**

In `RoomEvent.scala`, remove:

```scala
  given roomEventDecoder: Decoder[RoomEvent] = deriveDecoder[RoomEvent]
```

Keep `roomEventEncoder` (still used by `SSE.source`'s `.asJson` call).

- [ ] **Step 5: Remove the dead Pekko WebSocket config**

In `src/main/resources/application.conf`, delete the line:

```
pekko.http.server.websocket.periodic-keep-alive-max-idle = 1 second
```

(This configures Pekko's own WebSocket module, which is unused once the route is gone — it doesn't apply to the SSE route, so it's dead rather than something to migrate.)

- [ ] **Step 6: Remove the now-superseded tests from `RoomManagerSpec.scala`**

Delete the `"handle an IncomeWSMessage that generates an outcome"` and `"handle IncomeWSMessage that don't generate outcome"` test blocks — Task 4's `"handle typed per-command messages"` and `"no-op typed per-command messages for an unknown room"` tests already cover this behavior for the new dispatch path.

- [ ] **Step 7: Compile and run the full suite**

Run: `sbt compile Test/compile test`
Expected: compiles cleanly (no dangling references to `WS`, `IncomeWSMessage`, `UnsupportedWSMessage`, `handleIncomeMessage`, or `roomEventDecoder`), all remaining tests pass.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "$(cat <<'EOF'
refactor: remove the WebSocket transport

The join/events/command HTTP surface added in prior commits fully
replaces it. Drops the websocket route, WS.scala, the generic
IncomeWSMessage dispatch, RoomEvent's now-unused inbound decoder, and
the dead pekko websocket keep-alive config.
EOF
)"
```

---

## Task 7: Rewrite the frontend client to use POST + EventSource

**Files:**
- Modify: `src/main/resources/pages/index.html`

**Interfaces:** none — this is the last consumer of the HTTP/SSE surface built in Tasks 3-5, nothing depends on frontend internals.

There is no JavaScript test harness in this repo (`index.html` is a single static file with no build step or test framework) — introducing one is out of scope for this PR (Phase 3 of the roadmap is a full frontend rewrite with real tooling and tests). This task's verification is a scripted manual pass instead of automated tests; steps are still concrete and must all be run.

- [ ] **Step 1: Rename the `wsConnection` data field**

In the `data: { ... }` block, change:

```javascript
        wsConnection: undefined,
```

to:

```javascript
        eventSource: undefined,
```

- [ ] **Step 2: Replace `doJoin`**

Replace the entire existing `doJoin: function () { ... }` method (from `doJoin: function () {` through its closing `},`, including the `wsConnection.onmessage`/`onerror`/`onclose` handlers) with:

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
            ref.eventSource.onmessage = function(event) {
              ref.inRoom = true;
              var message = JSON.parse(event.data);
              if (message.messageType === 'init') {
                ref.users.push({
                  id: message.userId,
                  name: message.extra,
                  voted: false,
                  estimation: ""
                });
              }
              if (message.messageType === 'join') {
                if (message.userId !== ref.user.id) {
                  ref.users.push({
                    id: message.userId,
                    name: message.extra,
                    voted: false,
                    estimation: ""
                  });
                }
                ref.updateSummary();
                ref.allVoted();
              }
              if (message.messageType === 'vote') {
                ref.users = ref.users.map(u => {
                  if (u.id === message.userId) {
                    u.estimation = message.extra;
                    u.voted = true;
                  }
                  return u;
                });
                if (ref.user.id === message.userId) {
                  ref.user.estimation = message.extra;
                }
                ref.updateSummary();
                ref.allVoted();
              }
              if (message.messageType === 'show') {
                ref.votesRevealed = true;
                ref.updateSummary();
              }
              if (message.messageType === 'clear') {
                ref.votesRevealed = false;
                ref.ownVoteConfirmed = true;
                ref.votesSummary = [];
                ref.user.estimation = "";
                ref.users = ref.users.map(u => {
                  u.estimation = "";
                  u.voted = false;
                  return u;
                });
              }
              if (message.messageType === 'revote') {
                ref.votesRevealed = false;
                ref.ownVoteConfirmed = false;
                ref.updateSummary();
                ref.users = ref.users.map(u => {
                  u.voted = false;
                  return u;
                });
              }
              if (message.messageType === 'leave') {
                ref.users = ref.users.filter(u => {
                  return u.id !== message.userId;
                });
                ref.updateSummary();
                ref.allVoted();
              }
              if (message.messageType === 'edit_issue') {
                ref.currentIssue = message.extra;
              }
            };
            ref.eventSource.onerror = function(event) {
              ref.showError = true;
              ref.errorMessage = "Connection to the room was lost";
              console.error("EventSource error observed:", event);
            };
          })
          .catch(function (error) {
            console.log(error);
          });
        },
```

Note: `EventSource` has no `close`/`onclose` event (unlike `WebSocket`) — leave-detection on disconnect is now entirely server-side (`SSE.source`'s `watchTermination()`), so there is no client-side equivalent to port. `onerror` also fires on the browser's automatic SSE reconnect attempts, not only on permanent loss, so `errorMessage` may show transiently on a network blip — that's an accepted limitation for this PR (proper reconnect handling is the next roadmap item, not in scope here).

- [ ] **Step 3: Replace the command-sending methods**

Replace `doShowVotes`, `doClearVotes`, `doReVote`, `doLeave`, `doEdit`, and `vote`:

```javascript
        doShowVotes: function () {
          axios.post('/rooms/' + this.roomId + '/show?userId=' + this.user.id, {})
          .catch(function (error) {
            console.log(error);
          });
        },
        doClearVotes: function () {
          axios.post('/rooms/' + this.roomId + '/clear?userId=' + this.user.id, {})
          .catch(function (error) {
            console.log(error);
          });
        },
        doReVote: function () {
          axios.post('/rooms/' + this.roomId + '/revote?userId=' + this.user.id, {})
          .catch(function (error) {
            console.log(error);
          });
        },
        doLeave: function () {
          localStorage.clear();
          this.inRoom = false;
          this.votesSummary = [],
          this.user.estimation = "";
          this.users = [],
          this.eventSource.close();
        },
        doEdit: function () {
          this.editing = false;
          axios.post('/rooms/' + this.roomId + '/edit-issue?userId=' + this.user.id, { issue: this.currentIssue })
          .catch(function (error) {
            console.log(error);
          });
        },
        doCopy: function () {
          const el = document.createElement('textarea');
          el.value = window.location.origin + '/' + this.roomId;
          document.body.appendChild(el);
          el.select();
          document.execCommand('copy');
          document.body.removeChild(el);
          this.showClipboardHint = true;
          var ref = this;
          window.setTimeout(function () {
            ref.showClipboardHint = false;
          }, 2000);
        },
        vote: function (voteValue) {
          this.ownVoteConfirmed = true;
          axios.post('/rooms/' + this.roomId + '/vote?userId=' + this.user.id, { estimation: voteValue })
          .catch(function (error) {
            console.log(error);
          });
        },
```

(`doCopy` is unchanged — included above only to show the correct surrounding context/ordering; do not modify its body.)

- [ ] **Step 4: Manual end-to-end verification**

Run: `sbt run`

Check `src/main/resources/application.conf` for `pointing-poker.service.port` to find the URL (e.g. `http://localhost:<port>/`).

Perform this walkthrough:
1. Open the app in Browser Tab 1. Create a room as "Alice". Confirm you land in the room and see "Alice" listed.
2. Click "Copy link", open that link in Browser Tab 2, join as "Bob". Confirm Tab 1 now shows both "Alice" and "Bob", and Tab 2 shows the same.
3. In Tab 1, cast a vote. Confirm Tab 2 shows Alice as voted (masked estimation) but not revealed yet.
4. In Tab 2, cast a vote. Confirm both tabs' "Show votes" reflect both voted.
5. Click "Show votes" in Tab 1. Confirm both tabs reveal estimations and the summary table.
6. Click "Re-vote" in Tab 1. Confirm both tabs reset to unrevealed, un-voted state.
7. Edit the current issue text in Tab 1 and confirm it. Confirm Tab 2's issue field updates.
8. Close Tab 2 entirely (not "Leave" — an actual tab close, to exercise `watchTermination`'s failure/completion path). Confirm Tab 1's participant list drops "Bob" within a few seconds.
9. In Tab 1, click "Leave". Confirm it returns to the create/join screen and the room's SSE connection closes (check the browser's Network tab — the `/events` request should show as cancelled/closed, not pending).

Also verify with `curl` that unknown-room parity holds:
```bash
curl -i -X POST "http://localhost:<port>/rooms/$(uuidgen)/vote?userId=$(uuidgen)" \
  -H 'Content-Type: application/json' -d '{"estimation":"5"}'
```
Expected: `204 No Content` (silent no-op, matching today's behavior for an unknown room — see Global Constraints).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "$(cat <<'EOF'
feat: rewrite frontend client to use POST + EventSource

Replaces the WebSocket client with fetch/axios POST for commands and
EventSource for push, matching the backend transport migration.
Manually verified end-to-end (no JS test harness exists in this repo).
EOF
)"
```

---

## Task 8: Final QA pass

**Files:** none (verification only).

- [ ] **Step 1: Run the full QA command alias**

Run: `sbt qa`
Expected: clean, coverage, test, and coverageReport all succeed with no failures.

- [ ] **Step 2: Run the style check**

Run: `sbt styleCheck`
Expected: passes. If it fails, run `sbt scalafmtAll scalafmtSbt` to auto-fix formatting, then re-run `sbt styleCheck` and `sbt test` to confirm nothing broke.

- [ ] **Step 3: Commit if Step 2 produced formatting changes**

```bash
git add -A
git commit -m "style: apply scalafmt formatting"
```

(Skip this step if `styleCheck` passed cleanly in Step 2 with no changes needed.)
