# Write Path Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the write path real: every command endpoint answers what the room
decided rather than an unconditional `204`, `/join` resumes the identity its
cookie already names, and a page that is going away says so through an explicit
leave endpoint that names the connection it is leaving.

**Architecture:** tapir describes all nine endpoints in one place, the five
commands plus `/join`, `/events`, `/leave` and `/create-room`, and a
`PekkoHttpServerInterpreter` turns them into the `Route` that `API.scala` serves
beside the two static page routes. Each command becomes an ask: `RoomManager`
relays a `replyTo` through to the room, answers `NoSession` itself for a room it
does not hold, and the room answers a `CommandResult` the endpoint maps to a
status. A member's connections become a `Map[ConnectionId, ActorRef]` keyed by an
id the page mints once per instance and carries on both `/events` and `/leave`,
so a request can name one connection out of a member's set without holding its
ref.

**Tech Stack:** Scala 3.8.4, Pekko typed actors and pekko-http, tapir 1.13.31
(`tapir-core`, `tapir-json-circe`, `tapir-pekko-http-server`), circe, ScalaTest
(`AnyWordSpec` + `must.Matchers`) with `ActorTestKit`, `BehaviorTestKit` and
`ScalatestRouteTest`, Playwright for the browser suite.

**Spec:** `docs/superpowers/specs/2026-08-31-protocol-target-architecture-design.md`,
the section beginning "**Step 6. The write path becomes real.**" Section 4
("Identity and the write path") owns the leave rules, the connection id and
idempotent `/join`; section 3 owns the keyed `connections` map and its three
replacement rules; section 5 owns the client's two changes, `inRoom` and the
optimistic assignment, the connection id and the beacon being section 4's; and
section 6's step 6 paragraph owns the browser cases.

**Branch:** `20260831.protocol_architecture_6_write_path`, based on `main` after
step 4 merged. Step 6 waits on step 4 and on nothing else. Step 4a could have
landed either side of it and in fact landed first: the branch's merge-base is
`458b05c`, step 4a's own merge, so this plan is written against a tree that
already has it.

## Global Constraints

- **The status table is the contract**, copied verbatim from the spec:

  | Endpoint | Answers |
  | --- | --- |
  | `/vote` | `204` applied, `401` no session, `403` not a member, `409` round revealed, `400` blank estimation |
  | `/show`, `/clear`, `/revote`, `/edit-issue` | `204` applied, `401` no session, `403` not a member |
  | `/leave` | `204` on every branch, `401` no session, `403` not a member, `400` with no connection id |
  | `/join` | `204` with the session cookie, no body. Creates the room when the id is absent, so never `401` for an unknown one |
  | `/events` | the stream, `401` when the token does not resolve, `400` with no connection id |
  | `/create-room` | the room id, or `500` |

  Three rules run across it. `NoSession` answers `401`, covering a missing,
  unparseable or unresolved token as well as a room id the manager does not
  hold. `NotAMember` answers `403`. An ask that fails or times out answers
  `500`, the timeout being `apiConfig.timeout` and its value `5s`. That is now
  user-facing: a stalled room holds a click open for five seconds before
  answering, where the fire-and-forget path answered `204` at once.
- **The `401`s carry no `WWW-Authenticate`.** Deliberate, and the spec records
  why. Do not add one because RFC 7235 makes it a MUST.
- **The cookie is unchanged from 08-20:** `HttpOnly`, `SameSite=Strict`,
  `Secure` behind `apiConfig.secureCookies`, no `Max-Age`, `Path=/rooms/:roomId`.
  `/leave` clears no cookie. `APISpec`'s seven `Set-Cookie` assertions are the
  only coverage of these attributes and all seven survive this step.
- **The routes do not move.** No `:tabId` segment, no path change, the slug
  arrives at step 7. The connection id is a query parameter on `/events` and
  `/leave` and nothing else.
- **tapir lands as endpoint descriptions only.** No OpenAPI document, no
  `openapi-typescript`, no `tapir-openapi-docs` dependency. Those wait for step
  8, where the generated types get a consumer.
- **The publish stays unconditional.** Returning an outcome from `vote` makes it
  newly possible to skip the broadcast on a refusal, and it must not.
  `RoomSpec` pins the absence of that special case twice over.
- **A `members` entry is created by `ConnectToRoom` and by nothing else**
  (invariant 5). Idempotent `/join` writes `sessions`, and renames a `Member`
  if and only if one already exists.
- **Resolving a token and being allowed to act stay two checks** (invariant 6).
  `ValidateToken` and `/join` are deliberately exempt from the second.
- **Comments are one or two lines.** Never a multi-line block, including for
  non-obvious rationale. Longer context belongs in the commit message.
- **Conventional Commits**, and documentation commits are `docs:`, never `doc:`.
- **No em dash in any document.**
- `scalafmt` runs at 100 columns. Run `sbt scalafmtAll` before any commit that
  touches Scala.
- Cite symbols rather than line numbers in anything this step writes into
  `docs/`, per the citation convention in `docs/known-issues.md`.

---

## File Structure

**Server, modified:**

- `build.sbt` Three tapir dependencies and a `V.tapir` entry.
- `src/main/scala/com/lunatech/pointingpoker/API.scala` Rewritten. The endpoint
  descriptions, their server logic, the cookie helper and the interpreted route,
  which composes the probe and page routes alongside it. Nothing raw is left in
  the file, so its directive wildcard narrows to `concat`.
- `src/main/scala/com/lunatech/pointingpoker/Requests.scala` `JoinResponse`
  goes; `VoteRequest` gains the tapir `Schema` carrying the blank validator.
- `src/main/scala/com/lunatech/pointingpoker/actors/Room.scala` `ConnectionId`,
  the keyed `connections` map, the `CommandResult` ADT, `vote` returning its
  outcome, `Join` carrying a connection id and completing a refused stream,
  `RequestSession` resolving an existing token, and the `Depart` handler.
- `src/main/scala/com/lunatech/pointingpoker/actors/RoomManager.scala` Every
  command carries a `replyTo`, `ConnectToRoom` carries a connection id, and the
  unknown-room and missing-token branches answer `NoSession` rather than
  dropping silently.
- `src/main/scala/com/lunatech/pointingpoker/sse/SSE.scala` `source` takes a
  connection id and threads it into `ConnectToRoom`.

**Server, created:**

- `src/main/scala/com/lunatech/pointingpoker/PageRoutes.scala` The two
  `getFromFile` routes, lifted out of `API.scala` unchanged and given the
  `ProbeRoutes` shape. It exists so the two routing vocabularies stop sharing a
  file: tapir and pekko both export `path`, `cookie` and `setCookie`, and a
  wildcard on each side makes all three ambiguous.

**Server, deleted:**

- `src/main/scala/com/lunatech/pointingpoker/CirceSupport.scala` Its only
  callers were the three `entity(as[...])` directives and the `JoinResponse`
  completion, all of which move into tapir's `jsonBody`. Task 1 removes it and
  gives `APISpec` a two-line entity helper in its place.

**Client, modified:**

- `src/main/resources/pages/index.html` The connection id minted per page
  instance, `/events` and `/leave` carrying it, the `pagehide` beacon, `doLeave`
  closing its stream before posting, `inRoom` moving out of `applySnapshot` into
  the join path, and the optimistic `ownVoteConfirmed` assignment deleted.

**Tests, modified:**

- `src/test/scala/.../APISpec.scala` The largest test change. Every command case
  needs the stub to reply or it fails on the ask's timeout; the status cases
  arrive; the `/join` body half goes and the cookie half stays; `/events` and
  `/leave` gain their connection-id cases; the page routes gain a
  `Cache-Control` case.
- `src/test/scala/.../actors/RoomDataFixtures.scala` `Attendee` gains a
  connection id, `withUsers` builds the keyed inner map, `withSecondConnection`
  takes an id.
- `src/test/scala/.../actors/RoomSpec.scala` The connection id threads through
  every `Join` and every assertion written against a `Set` of refs; the two
  refused-`Join` cases now expect `StreamCompleted`; new cases for the
  replacement rules, the vote outcome, `Depart`'s two branches and the timer
  cancellation.
- `src/test/scala/.../actors/RoomManagerSpec.scala` `ConnectToRoom` carries the
  id; every command carries a `replyTo`; new cases for the manager answering
  `NoSession` on an unknown room and on a missing token.
- `src/test/scala/.../sse/SSESpec.scala` `wire()` passes a connection id and one
  case asserts it reaches `ConnectToRoom`.
- `e2e/fixtures.js` A `newTab` on the participant, an `ownEstimation` locator,
  and the two-pages-in-one-context comment updated now that it is this step's
  case rather than a note about a future one.
- `e2e/room.spec.js` The directly posted blank now draws a `400`; the
  join-and-leave case becomes the immediate-departure case; the straggler-reload
  case loses the duplicate it was written to observe; the straggler-close case
  takes over the reason for its own budget; two new cases for the shared cookie.

**Docs, modified:**

- `docs/superpowers/specs/2026-08-31-protocol-target-architecture-design.md`
  Landed-state notes on step 6 and one in section 4, the test inventory
  reconciled, the citation sweep.
- `docs/known-issues.md` Four entries close, two are narrowed.
- `docs/roadmap.md` Phase 1's ask-pattern item is checked off, and the
  usage-metrics item stops pointing at a closed entry for its definition.
- `docs/superpowers/plans/README.md` Step 6's entry.

### Why the tasks are ordered as they are

**tapir lands first, describing the endpoints exactly as they behave today.**
The alternative is writing each behaviour change twice, once as a pekko
directive and once as an endpoint description, and it is worse than it sounds
for `/events`: the connection id's `400` is what tapir's decode-failure handler
gives for free and what a raw directive has to hand-roll, since pekko's default
rejection handler answers `404` for a missing query parameter rather than `400`.
Landing tapir first also makes the refactor falsifiable. `APISpec` passes across
task 1 with no change to what any case asserts, beyond step 1's new header case
and step 9's mechanical substitution of its body marshalling, which is the check
that the descriptions are faithful before any of them start moving. The file
itself is edited; the assertions are what stay put.

**The connection id comes second because three later tasks need it.** `/leave`
names one, `publish` walks the keyed map, and the refused-`Join` completion is
the one piece of the connection layer that has a test waiting for it: step 5a's
review added `expectNoMessage` to both guard cases specifically so this step
would redden them. That is a planned red, not a regression.

**The ask pattern comes before `/join` and `/leave`** because both of those are
themselves asks, and because `RoomManager`'s relay and the `CommandResult` ADT
are the shape they answer in. Doing `/join` first would mean inventing a reply
channel for one endpoint and then widening it.

**`/join` comes before `/leave`** for one concrete reason: the reload case. A
reload fires the beacon and then rejoins, and if `/join` were still minting a
fresh identity the departure would look correct while costing the user their
vote. Landing idempotence first means the leave endpoint's own browser case is
the only thing it has to prove.

**The record is last and single.** The citation sweep is only true of the tree it
runs against, so it runs after the final code commit, and the known-issue
entries are only false once the code that falsifies them has landed.

### Traps this plan is scheduled around

**`APISpec`'s stub never replies.** Its `roomManager` is a
`Behaviors.receiveMessagePartial` that forwards everything it does not
special-case to `commandProbe` and answers nothing. Under the ask pattern the
five dispatch cases and the no-cookie case stop failing on an assertion and
start failing on `apiConfig.timeout` expiring, which reads as a hang rather than
as a red. Task 3's first step is to make the stub answer, and it must answer
per-case: a fixed `Applied` would make the `401`, `403` and `409` cases
unwritable.

**`connections` is removed by value on termination and by key on `Depart`.**
Both are in the spec and mixing them up is silent. `ConnectionCompleted` and
`ConnectionFailure` carry the ref and must filter on it, because a retry reuses
its id and removing by id would evict the live replacement. `Depart` carries the
id and only the id, because a beacon holds no ref.

**A member's `connections` entry is dropped when its map empties.** Step 4
established that, and `Depart` has to read the set through the `Option` it
creates: a beacon arriving after its own stream has already terminated finds no
entry at all, which is exactly the ordering the rule exists for, so
`connections(id)` throws on the case the endpoint is built to absorb.

**The beacon fires on a reload.** Every browser case that reloads is now a case
where a member departs and returns. `e2e/room.spec.js`'s "a straggler reloading
leaves the votes hidden" was written at step 2 against exactly this future, and
step 2 left the instruction inside the case: idempotent `/join` makes its
`toHaveCount(2)` unreachable, so task 4 amends it rather than defending it. A red
there before the amendment is this step working, not the reveal latch or `/join`
failing.

**`RoomData.of` gains no containment for connections.** A connection outliving
its member is no longer produced by anything, and `of` still tolerates it: the
fixture `withDeparted` builds that state and `RoomSnapshot.of` is asserted
against it. Do not add a `require` here. The spec argues the tolerance is kept
on purpose and that a guard would leave the state unconstructible and so
untestable.

**`crypto.randomUUID()` needs a secure context.** It is already required of
every page, the session cookie being `Secure`, and the browser suite runs over
the stub on `localhost`, which counts as secure. No fallback is wanted; a page
that cannot mint an id draws the `400` loudly.

---

## Task 1: tapir describes the endpoints as they behave today

**Files:**
- Modify: `build.sbt`
- Modify: `src/main/scala/com/lunatech/pointingpoker/API.scala` (the whole
  `route` value)
- Create: `src/main/scala/com/lunatech/pointingpoker/PageRoutes.scala`
- Modify: `src/main/scala/com/lunatech/pointingpoker/Requests.scala`
- Delete: `src/main/scala/com/lunatech/pointingpoker/CirceSupport.scala`
- Test: `src/test/scala/com/lunatech/pointingpoker/APISpec.scala`

**Interfaces:**
- Consumes: `RoomManager.CreateRoom`, `RoomManager.RequestSession`,
  `RoomManager.ValidateToken`, `RoomManager.Vote`, `Show`, `Clear`, `Revote`,
  `EditIssue`, all unchanged from step 4; `SSE.source(roomManager, roomId,
  userId, name, token, retryMillis)`; `Room.SessionToken.parse/raw`.
- Produces:
  - `API.route: Route`, unchanged in type and in every status it answers,
    except that the two page routes now carry `Cache-Control: no-cache`.
  - `API` gains a private `commandErrors`/`voteErrors` pair only in task 3; this
    task's endpoints carry the outputs they carry today.
  - `CirceSupport` no longer exists.

- [ ] **Step 1: Write the failing test for the page cache header**

In `APISpec`, beside "return index.html":

```scala
    // A page cached without this can outlive the server that served it, so a deploy pairs a
    // stale page with a new protocol. One conditional request per load is the whole cost.
    "revalidate the index page on every load" in {
      Get() ~> apiRoute ~> check {
        header("Cache-Control").map(_.value) mustBe Some("no-cache")
      }
      Get(s"/$roomId") ~> apiRoute ~> check {
        header("Cache-Control").map(_.value) mustBe Some("no-cache")
      }
    }
```

- [ ] **Step 2: Run it to see it fail**

Run: `sbt "testOnly com.lunatech.pointingpoker.APISpec -- -z revalidate"`
Expected: FAIL, `None was not equal to Some("no-cache")`.

- [ ] **Step 3: Add the header to both page routes**

In `API.scala`, wrap each `getFromFile(apiConfig.indexPath)`:

```scala
      pathEndOrSingleSlash {
        get {
          log.debug("Index call [{}]", apiConfig.indexPath)
          // Always revalidate: no-store would re-send the whole page where a 304 costs nothing.
          respondWithHeader(`Cache-Control`(`no-cache`)) {
            getFromFile(apiConfig.indexPath)
          }
        }
      },
      path(JavaUUID) { roomId =>
        get {
          log.debug("Index call with room id: {}", roomId)
          respondWithHeader(`Cache-Control`(`no-cache`)) {
            getFromFile(apiConfig.indexPath)
          }
        }
      },
```

- [ ] **Step 4: Run it to see it pass**

Run: `sbt "testOnly com.lunatech.pointingpoker.APISpec"`
Expected: PASS, all cases.

- [ ] **Step 5: Commit the cache fix on its own**

```bash
sbt scalafmtAll
git add src/main/scala/com/lunatech/pointingpoker/API.scala src/test/scala/com/lunatech/pointingpoker/APISpec.scala
git commit -m "fix(api): revalidate the served page on every load"
```

- [ ] **Step 6: Add the tapir dependencies**

In `build.sbt`, add `val tapir = "1.13.31"` to the `V` block and three entries
to `libraryDependencies`:

```scala
    libraryDependencies += "com.softwaremill.sttp.tapir" %% "tapir-core"              % V.tapir,
    libraryDependencies += "com.softwaremill.sttp.tapir" %% "tapir-json-circe"        % V.tapir,
    libraryDependencies += "com.softwaremill.sttp.tapir" %% "tapir-pekko-http-server" % V.tapir,
```

Run: `sbt update`, then `sbt evicted`, which is the command that reports
evictions; `update` alone may print nothing.
Expected: resolution succeeds. `tapir-pekko-http-server`'s POM declares
pekko-http 1.3.0, pekko-stream 1.6.0 and pekko-slf4j 1.6.0; this build pins
1.4.0 and 1.7.0, so all three evict upward. Measured: the pekko family resolves
to `pekko-http` 1.4.0 and `pekko-actor`, `pekko-stream` and `pekko-slf4j` at
1.7.0, the last of those pulled up with the family even though `build.sbt` never
names it. What to check is that no pekko module resolves *below* a pin, not that
the report is empty: tapir brings one new transitive of its own,
`sttp-shared`'s pekko integration, and it is expected. `pekko-http-backend` is
declared `test` in tapir's POM, so despite appearing there it does not resolve
into this build.

- [ ] **Step 7: Give `VoteRequest` a tapir schema**

In `Requests.scala`, add the schemas the JSON bodies need. The validator itself
arrives in task 3; this step only establishes the derivation so task 3 is a
one-line change.

```scala
import sttp.tapir.Schema

case class VoteRequest(estimation: String)
object VoteRequest:
  given Decoder[VoteRequest] = deriveDecoder[VoteRequest]
  given Encoder[VoteRequest] = deriveEncoder[VoteRequest]
  given Schema[VoteRequest]  = Schema.derived[VoteRequest]
```

Add `given Schema[JoinRequest] = Schema.derived[JoinRequest]` and
`given Schema[EditIssueRequest] = Schema.derived[EditIssueRequest]` the same
way. `JoinResponse` keeps its codecs and gains a schema, since this task still
serves the body; task 4 deletes the type outright.

- [ ] **Step 8: Rewrite `API.scala` as endpoint descriptions**

The whole of the new file's endpoint section. The imports at the top of the
file change rather than only growing: `Directives.*` goes, since the static half
moves to its own file below and `concat` is then the only directive left. That
is not tidying. Tapir and pekko both define `path`, `cookie` and `setCookie`, so
two wildcards make all three ambiguous rather than shadowing one another, and
the paste fails with three `Reference to ... is ambiguous` errors. Importing
`concat` by name is what keeps them unambiguous. Also gone with the static half:
`ContentTypeResolver.Default`, `Cache-Control` and `no-cache`.

```scala
import org.apache.pekko.http.scaladsl.server.Directives.concat
import sttp.capabilities.pekko.PekkoStreams
import sttp.model.StatusCode
import sttp.model.headers.{Cookie as SttpCookie, CookieValueWithMeta}
import sttp.model.sse.ServerSentEvent as SttpSse
import sttp.tapir.*
import sttp.tapir.json.circe.*
import sttp.tapir.server.pekkohttp.{PekkoHttpServerInterpreter, PekkoServerSentEvents}
import java.nio.charset.StandardCharsets
```

and the body becomes:

```scala
  private val SessionCookieName = "session"

  private def sessionCookie(roomId: UUID, token: Room.SessionToken): CookieValueWithMeta =
    CookieValueWithMeta.unsafeApply(
      value = token.raw,
      path = Some(s"/rooms/$roomId"),
      secure = apiConfig.secureCookies,
      httpOnly = true,
      sameSite = Some(SttpCookie.SameSite.Strict)
    )

  // EventSource sets no headers, so the stream rides a text body tapir serialises for us.
  private val sseBody =
    streamTextBody(PekkoStreams)(CodecFormat.TextEventStream(), Some(StandardCharsets.UTF_8))
      .map(PekkoServerSentEvents.parseBytesToSSE)(PekkoServerSentEvents.serialiseSSEToBytes)

  private val roomPath = "rooms" / path[UUID]("roomId")

  private val sessionIn = cookie[Option[String]](SessionCookieName)

  private val createRoom = endpoint.post
    .in("create-room")
    .out(stringBody)

  private val join = endpoint.post
    .in(roomPath / "join")
    .in(jsonBody[JoinRequest])
    .out(jsonBody[JoinResponse])
    .out(setCookie(SessionCookieName))

  private val events = endpoint.get
    .in(roomPath / "events")
    .in(sessionIn)
    .out(sseBody)
    .out(header("Cache-Control", "no-cache"))
    .out(header("X-Accel-Buffering", "no"))
    .errorOut(statusCode(StatusCode.Unauthorized))

  private def command(segment: String) = endpoint.post
    .in(roomPath / segment)
    .in(sessionIn)
    .out(statusCode(StatusCode.NoContent))

  private val vote      = command("vote").in(jsonBody[VoteRequest])
  private val show      = command("show")
  private val clear     = command("clear")
  private val revote    = command("revote")
  private val editIssue = command("edit-issue").in(jsonBody[EditIssueRequest])
```

Server logic, in the same file. Each `serverLogic` returns a
`Future[Either[E, O]]`; a failed ask is left to fail, which tapir's default
exception handler answers `500` for, replacing the two hand-written failure
branches.

The `[Future]` on every `serverLogic` and `serverLogicSuccess` is load-bearing
rather than decoration. Without it the compiler infers the list's element type as
`ServerEndpoint[PekkoStreams, ? >: Future[X0] <: Future]`, `toRoute` matches neither
overload, and the twenty-line error names `PekkoStreams & WebSockets` with its
caret on `toRoute` rather than on the logic block that caused it. Measured on
Scala 3.8.4 against this build's pins. Every endpoint tasks 3, 4 and 5 add wants
the same annotation for the same reason.

```scala
  private def resolveToken(raw: Option[String]): Option[Room.SessionToken] =
    raw.flatMap(Room.SessionToken.parse)

  private val endpoints = List(
    createRoom.serverLogicSuccess[Future](_ =>
      (roomManager ? RoomManager.CreateRoom.apply).mapTo[RoomManager.RoomId].map(_.value)
    ),
    join.serverLogicSuccess[Future] { (roomId, request) =>
      roomManager
        .ask[Room.SessionMinted](RoomManager.RequestSession(roomId, request.name, _))
        .map(minted => (JoinResponse(minted.userId), sessionCookie(roomId, minted.token)))
    },
    events.serverLogic[Future] { (roomId, rawCookie) =>
      resolveToken(rawCookie) match
        case None        => Future.successful(Left(()))
        case Some(token) =>
          roomManager
            .ask[Room.TokenResolution](RoomManager.ValidateToken(roomId, token, _))
            .map {
              case Room.Resolved(userId, name) =>
                Right(SSE.source(roomManager.toClassic, roomId, userId, name, token,
                  lifecycleConfig.retryMillis))
              case Room.Unresolved => Left(())
            }
    },
    vote.serverLogicSuccess[Future] { (roomId, rawCookie, request) =>
      roomManager ! RoomManager.Vote(roomId, resolveToken(rawCookie), request.estimation)
      Future.successful(())
    },
    show.serverLogicSuccess[Future] { (roomId, rawCookie) =>
      roomManager ! RoomManager.Show(roomId, resolveToken(rawCookie))
      Future.successful(())
    },
    clear.serverLogicSuccess[Future] { (roomId, rawCookie) =>
      roomManager ! RoomManager.Clear(roomId, resolveToken(rawCookie))
      Future.successful(())
    },
    revote.serverLogicSuccess[Future] { (roomId, rawCookie) =>
      roomManager ! RoomManager.Revote(roomId, resolveToken(rawCookie))
      Future.successful(())
    },
    editIssue.serverLogicSuccess[Future] { (roomId, rawCookie, request) =>
      roomManager ! RoomManager.EditIssue(roomId, resolveToken(rawCookie), request.issue)
      Future.successful(())
    }
  )

  val route: Route =
    concat(
      ProbeRoutes(probeConfig).route,
      PageRoutes(apiConfig).route,
      PekkoHttpServerInterpreter().toRoute(endpoints)
    )
```

`pageRoutes` does not stay in the file. It becomes
`src/main/scala/com/lunatech/pointingpoker/PageRoutes.scala`, the shape
`ProbeRoutes` already has and the reason `API.scala` can drop its directive
wildcard. The body is today's block unchanged, with the config it reads passed
in rather than inherited:

```scala
package com.lunatech.pointingpoker

import org.apache.pekko.http.scaladsl.model.headers.`Cache-Control`
import org.apache.pekko.http.scaladsl.model.headers.CacheDirectives.`no-cache`
import org.apache.pekko.http.scaladsl.server.Directives.*
import org.apache.pekko.http.scaladsl.server.Route
import org.apache.pekko.http.scaladsl.server.directives.ContentTypeResolver.Default
import com.lunatech.pointingpoker.config.ApiConfig
import org.slf4j.{Logger, LoggerFactory}

// The static half stays raw directives: tapir describes what the client calls, not what the
// server hands back off disk.
class PageRoutes(apiConfig: ApiConfig):

  private val log: Logger = LoggerFactory.getLogger(this.getClass)

  val route: Route =
    concat(
      pathEndOrSingleSlash {
        get {
          log.debug("Index call [{}]", apiConfig.indexPath)
          // Always revalidate: no-store would re-send the whole page where a 304 costs nothing.
          respondWithHeader(`Cache-Control`(`no-cache`)) {
            getFromFile(apiConfig.indexPath)
          }
        }
      },
      path(JavaUUID) { roomId =>
        get {
          log.debug("Index call with room id: {}", roomId)
          respondWithHeader(`Cache-Control`(`no-cache`)) {
            getFromFile(apiConfig.indexPath)
          }
        }
      }
    )
end PageRoutes

object PageRoutes:
  def apply(apiConfig: ApiConfig): PageRoutes = new PageRoutes(apiConfig)
```

Three details that are not optional. `SSE.source` returns
`Source[ServerSentEvent, ActorRef]` in pekko's own SSE type; the stream body
wants `Source[sttp.model.sse.ServerSentEvent, Any]`, so `SSE.scala`'s final
`.map` produces the sttp type instead, and the heartbeat becomes
`SttpSse(data = Some(""))`, which renders `data: ` exactly as pekko's
`ServerSentEvent.heartbeat` renders `data:`. The client's
`if (!event.data) return` reads both as empty, so nothing on the page changes.
`EventStreamMarshalling` is no longer extended. The `X-Forwarded-Proto`
diagnostic in the no-cookie branch moves into the `events` logic ahead of the
`Left(())`, unchanged in what it logs.

- [ ] **Step 9: Delete `CirceSupport` and give `APISpec` an entity helper**

Delete `src/main/scala/com/lunatech/pointingpoker/CirceSupport.scala`. In
`APISpec`, replace every `import com.lunatech.pointingpoker.CirceSupport.given`
and its marshalled `Post(path, Request(...))` with:

```scala
  private def json[A: io.circe.Encoder](a: A): HttpEntity.Strict =
    HttpEntity(ContentTypes.`application/json`, a.asJson.noSpaces)
```

so `Post(s"/rooms/$roomId/join", JoinRequest("Alice"))` becomes
`Post(s"/rooms/$roomId/join", json(JoinRequest("Alice")))`. The `responseAs`
side keeps circe's own `decode`, since the generic unmarshaller is gone:

```scala
        val response = decode[JoinResponse](responseAs[String]).getOrElse(fail("bad JoinResponse"))
```

The "create a room" case keeps its comment about `text/plain`, rewritten: the
hazard it guarded against was the generic circe marshaller hijacking a `String`
completion, and what keeps `create-room` plain now is `stringBody` on the
endpoint rather than the absence of an import.

- [ ] **Step 10: Run the whole JVM suite**

Run: `sbt test`
Expected: PASS. `APISpec` is the one that matters, and every case in it should
pass with no change to what it asserts beyond step 9's mechanical substitution
and step 1's new case. If a status moved, the description is wrong: fix the
description rather than the case.

Nothing is expected to fail here, but of the two behaviours worth checking by
hand, one changes. A request to a path no endpoint matches still falls through
to pekko's rejection handling, so "not expose the proxy probe" still answers
`404`. A `GET` to a `POST` endpoint no longer answers `405` with an
`Allow: POST` header: tapir rejects it outright, and pekko's default handling
turns that into a plain `404`. Measured on this build's pins. Nothing observes
the difference, since no case in `src/test` or `e2e` names a `405` and no client
path issues a wrong-method request, so it is recorded here rather than asserted
or restored. Configuring tapir's reject handler back to `405` was tried and is
not a one-line change.

- [ ] **Step 11: Run the browser suite**

Run: `npm run e2e`
Expected: PASS, both engines, every case unchanged. This is the real check on
the SSE body: `SSESpec` proves the stream's contents and only a browser proves
that `EventSource` still parses the frames.

- [ ] **Step 12: Commit**

```bash
sbt scalafmtAll
git add build.sbt src/main src/test
git commit -m "refactor(api): describe the endpoints with tapir"
```

---

## Task 2: A member's connections become a keyed map

**Files:**
- Modify: `src/main/scala/com/lunatech/pointingpoker/actors/Room.scala`
- Modify: `src/main/scala/com/lunatech/pointingpoker/actors/RoomManager.scala`
- Modify: `src/main/scala/com/lunatech/pointingpoker/sse/SSE.scala`
- Modify: `src/main/scala/com/lunatech/pointingpoker/API.scala` (the `events`
  endpoint gains one input)
- Modify: `src/main/resources/pages/index.html`
- Test: `src/test/scala/.../actors/RoomDataFixtures.scala`,
  `RoomSpec.scala`, `RoomManagerSpec.scala`, `sse/SSESpec.scala`,
  `APISpec.scala`

**Interfaces:**
- Consumes: everything task 1 produced.
- Produces:
  - `Room.ConnectionId`, an opaque type over `UUID` with
    `ConnectionId.parse(raw: String): Option[ConnectionId]` and an extension
    `raw: String`. No `mint`: the page mints, and the fixtures build one from a
    random UUID.
  - `Room.Join(userId: UUID, name: String, token: SessionToken, connectionId:
    ConnectionId, ref: UntypedRef)`
  - `RoomManager.ConnectToRoom(roomId: UUID, userId: UUID, name: String, token:
    Room.SessionToken, connectionId: Room.ConnectionId, ref: UntypedRef)`
  - `RoomData.connections: Map[UUID, Map[ConnectionId, UntypedRef]]`
  - `RoomData.connect(userId, name, connectionId, ref)`, replacing by id
  - `RoomData.disconnect(userId, ref)`, removing by ref value, unchanged in
    signature
  - `SSE.source(roomManager, roomId, userId, name, token, connectionId,
    retryMillis)`
  - `RoomDataFixtures.newConnectionId(): Room.ConnectionId`
  - `RoomDataFixtures.Attendee` gains `connectionId: Room.ConnectionId =
    newConnectionId()` as its last field
  - `RoomDataFixtures.withSecondConnection(user, connectionId, ref)`

- [ ] **Step 1: Write the failing test for replacement by id**

In `RoomSpec`, beside the existing "hold both connections when a replacement
arrives before the first drops":

```scala
    "replace a connection's ref when the same id reconnects, and feed only the new one" in {
      val (user, userProbe) = createUser(UUID.randomUUID(), "user1", false, "")
      val replacementProbe  = TestProbe()(testKit.system.classicSystem)
      val dataProbe         = testKit.createTestProbe[Room.DataStatus]()
      val (_, roomRef)      = createRoom(UUID.randomUUID(), withUsers(user))

      // Same id, new ref: an EventSource retry reuses the id its page was given.
      roomRef ! Room.Join(user.id, user.name, user.token, user.connectionId, replacementProbe.ref)
      roomRef ! Room.GetData(dataProbe.ref)
      val data = dataProbe.expectMessageType[Room.DataStatus].data

      data.connections(user.id) mustBe Map(user.connectionId -> replacementProbe.ref)
      expectSnapshot(replacementProbe)
      userProbe.expectNoMessage(300.millis)
    }

    "remove a superseded ref by value, not by id, when its stream finally terminates" in {
      val (user, userProbe) = createUser(UUID.randomUUID(), "user1", false, "")
      val replacementProbe  = TestProbe()(testKit.system.classicSystem)
      val dataProbe         = testKit.createTestProbe[Room.DataStatus]()
      val (_, roomRef)      = createRoom(UUID.randomUUID(), withUsers(user))

      roomRef ! Room.Join(user.id, user.name, user.token, user.connectionId, replacementProbe.ref)
      // The old stream's termination arrives after the new one is established.
      roomRef ! Room.Leave(user.id, userProbe.ref)
      roomRef ! Room.GetData(dataProbe.ref)

      dataProbe.expectMessageType[Room.DataStatus].data.connections(user.id) mustBe
        Map(user.connectionId -> replacementProbe.ref)
    }
```

- [ ] **Step 2: Run them to see them fail**

Run: `sbt "testOnly com.lunatech.pointingpoker.actors.RoomSpec"`
Expected: FAIL to compile, `Room.Join` taking five arguments where four are
declared, and `Attendee` having no `connectionId`. A compile failure is the
right red here: the type is the change.

- [ ] **Step 3: Add `ConnectionId` and key the map**

In `Room.scala`, beside `SessionToken`:

```scala
  opaque type ConnectionId = UUID

  object ConnectionId:
    def parse(raw: String): Option[ConnectionId] =
      scala.util.Try(UUID.fromString(raw)).toOption
    extension (id: ConnectionId) def raw: String = id.toString
```

Then the state and its three methods:

```scala
  final case class Join(
      userId: UUID,
      name: String,
      token: SessionToken,
      connectionId: ConnectionId,
      ref: UntypedRef
  ) extends Command

  final case class RoomData private (
      state: RoomState,
      members: Map[UUID, Member],
      sessions: Map[SessionToken, Session],
      connections: Map[UUID, Map[ConnectionId, UntypedRef]]
  ):
    private[Room] def connect(
        userId: UUID,
        name: String,
        connectionId: ConnectionId,
        ref: UntypedRef
    ): RoomData =
      // Replacing by id is what stops a page that reconnects being fed through two streams.
      this.copy(
        members = this.members + (userId -> Member(name)),
        connections = this.connections.updatedWith(userId)(refs =>
          Some(refs.getOrElse(Map.empty) + (connectionId -> ref))
        )
      )

    private[Room] def disconnect(userId: UUID, ref: UntypedRef): RoomData =
      // By value, never by id: removing by id would evict a live replacement.
      this.copy(connections =
        this.connections.updatedWith(userId)(_.map(_.filterNot(_._2 == ref)).filter(_.nonEmpty))
      )
```

`publish` walks the values, and `PostStop` flattens one level deeper:

```scala
    data.connections.foreach { (id, refs) =>
      val snapshot = RoomSnapshot.of(data, id)
      refs.values.foreach(_ ! snapshot)
    }
```

```scala
        data.connections.values.flatMap(_.values).foreach(_ ! StreamCompleted)
```

`RoomData.of`'s `connections` parameter takes the new type and its `require` is
unchanged: every key still has to resolve to a session, and no containment
against `members` is added.

- [ ] **Step 4: Thread the id through the messages and the stream**

`RoomManager.ConnectToRoom` gains `connectionId: Room.ConnectionId` before
`ref`, and its handler passes it into `Room.Join`. `SSE.source` gains
`connectionId: Room.ConnectionId` before `retryMillis` and passes it into
`ConnectToRoom`. Neither `ConnectionCompleted` nor `ConnectionFailure` gains
anything: both hold the ref, which is what removal wants.

In `API.scala`, the `events` endpoint gains the parameter and the codec that
answers `400` for a malformed one:

```scala
  private given Codec[String, Room.ConnectionId, CodecFormat.TextPlain] =
    Codec.string.mapDecode(raw =>
      Room.ConnectionId
        .parse(raw)
        .map(DecodeResult.Value(_))
        .getOrElse(DecodeResult.Mismatch("a UUID", raw))
    )(_.raw)

  private val events = endpoint.get
    .in(roomPath / "events")
    .in(query[Room.ConnectionId]("connectionId"))
    .in(sessionIn)
    .out(sseBody)
    .out(header("Cache-Control", "no-cache"))
    .out(header("X-Accel-Buffering", "no"))
    .errorOut(statusCode(StatusCode.Unauthorized))
```

The parameter is required, deliberately. A page cached from before this deploy
opens `/events` without it, takes the `400`, and reports an ended session until
the user reloads, which is louder than a connection the leave endpoint cannot
name and recovers in one action.

- [ ] **Step 5: Update the fixtures**

In `RoomDataFixtures`:

```scala
  // The page mints one per instance; nothing in production mints one here.
  def newConnectionId(): Room.ConnectionId =
    Room.ConnectionId.parse(UUID.randomUUID().toString).get

  final case class Attendee(
      id: UUID,
      name: String,
      voted: Boolean,
      estimation: String,
      ref: UntypedRef,
      token: Room.SessionToken,
      connectionId: Room.ConnectionId = newConnectionId()
  ):
    def joinMessage: Room.Join = Room.Join(id, name, token, connectionId, ref)

  def withUsers(users: Attendee*): RoomData =
    RoomData.of(
      state = Room.RoomState("", Room.Round(estimatesFor(users*), revealed = false)),
      members = users.map(u => u.id -> Room.Member(u.name)).toMap,
      sessions = sessionsFor(users*),
      connections = users.map(u => u.id -> Map(u.connectionId -> u.ref)).toMap
    )

    def withSecondConnection(
        user: Attendee,
        connectionId: Room.ConnectionId,
        ref: UntypedRef
    ): RoomData =
      RoomData.of(
        data.state,
        data.members,
        data.sessions,
        data.connections.updatedWith(user.id)(refs =>
          Some(refs.getOrElse(Map.empty) + (connectionId -> ref))
        )
      )
```

The default on `Attendee.connectionId` is what keeps the ten positional
`Attendee(...)` sites compiling untouched: eight in `RoomSpec`, one in
`RoomSnapshotSpec` and one in `RoomManagerSpec`. `withSecondConnection` takes its
id explicitly rather than defaulting it, because task 5's departure cases have to
name the connection they drop, and an id the caller cannot recover is one no case
can assert about.

Nothing else follows from the fixtures, so the rest of the tree has to be walked.
Three `data.connections(user.id) mustBe Set(...)` assertions in `RoomSpec` become
`Map(id -> ref)`, in "keep a reconnecting user's vote instead of resetting it",
"hold both connections when a replacement arrives before the first drops" and
"schedule no removal when the connection that drops is not the member's last".
Then, none of which the rule above reaches:

- Three four-argument `Room.Join(...)` calls in `RoomSpec`, in the reconnect-vote
  case and the two replacement cases.
- Two `expectMessage(Room.Join(...))` assertions in `RoomManagerSpec`. These are
  the only ones with content rather than arity: the case has to send a known id
  in through `ConnectToRoom` and assert that same id comes back out.
- `connections = Map(stranger -> Set(user.ref))` in "refuse a RoomData whose
  connection resolves to no session", which is a construction rather than an
  assertion.
- `withSecondConnection`'s two callers, which pass a ref and no id today.

- [ ] **Step 6: Mint the id on the client and carry it on `/events`**

In `index.html`, above the Vue instance:

```js
    // One per page instance, never persisted: a reload must mint a new one, or its own late
    // beacon would name the id the replacement page is now using.
    var connectionId = crypto.randomUUID();
```

and in `doJoin`:

```js
            ref.eventSource = new EventSource(
              '/rooms/' + ref.roomId + '/events?connectionId=' + connectionId
            );
```

- [ ] **Step 7: Run the JVM suite and the browser suite**

Run: `sbt test`
Expected: PASS, including the two new `RoomSpec` cases. `APISpec`'s `/events`
cases need `?connectionId=...` appended, five sites; add one case for the
missing parameter:

```scala
    "reject an events connection with no connection id" in
      Get(s"/rooms/$roomId/events") ~> addHeader(
        Cookie("session", validToken.raw)
      ) ~> apiRoute ~> check {
        status mustBe StatusCodes.BadRequest
      }
```

Run: `npm run e2e`
Expected: PASS. If every case fails at the join, the client is not sending the
parameter and every stream is drawing a `400`.

- [ ] **Step 8: Commit**

```bash
sbt scalafmtAll
git add src e2e
git commit -m "feat(protocol): key a member's connections by a client-minted id"
```

- [ ] **Step 9: Write the failing test for a refused Join's stream**

`RoomSpec`'s two guard cases currently assert `expectNoMessage` on the refused
joiner's probe. Change both to expect the completion instead, which is the
planned red step 5a's review left here:

```scala
          roomRef ! stranger.joinMessage
          // A refused joiner gets no snapshot and no silence: its stream is ended rather than
          // left open receiving nothing.
          strangerProbe.expectMsg(Room.StreamCompleted)
```

- [ ] **Step 10: Run them to see them fail**

Run: `sbt "testOnly com.lunatech.pointingpoker.actors.RoomSpec -- -z Join"`
Expected: FAIL, "timeout during expectMsg while waiting for StreamCompleted".

- [ ] **Step 11: Complete the refused connection's stream**

In `Room.scala`'s `Join` handler, the else branch:

```scala
            else
              val reason =
                if data.sessions.contains(token) then
                  "its token's session names a different identity"
                else "its token resolves to no session"
              context.log.warn("Ignoring Join for user {} in room {}: {}.", userId, roomId, reason)
              // The stream is ended rather than left open: a refused page has nothing coming.
              ref ! StreamCompleted
              Behaviors.same
```

- [ ] **Step 12: Run them to see them pass, then commit**

Run: `sbt test`
Expected: PASS.

```bash
sbt scalafmtAll
git add src
git commit -m "feat(actors): end a refused connection's stream instead of leaving it silent"
```

---

## Task 3: Commands answer what the room decided

**Files:**
- Modify: `src/main/scala/com/lunatech/pointingpoker/actors/Room.scala`
- Modify: `src/main/scala/com/lunatech/pointingpoker/actors/RoomManager.scala`
- Modify: `src/main/scala/com/lunatech/pointingpoker/API.scala`
- Modify: `src/main/scala/com/lunatech/pointingpoker/Requests.scala`
- Modify: `src/main/resources/pages/index.html`
- Test: `src/test/scala/.../actors/RoomSpec.scala`, `RoomManagerSpec.scala`,
  `APISpec.scala`, `e2e/room.spec.js`

**Interfaces:**
- Consumes: everything task 2 produced.
- Produces:
  - `Room.CommandResult`, a sealed trait with `Applied`, `RoundRevealed` and
    `BlankEstimation` under a `Room.VoteOutcome` sub-trait, plus `NoSession` and
    `NotAMember` directly under it.
  - `RoomData.vote(userId, estimation): (RoomData, Room.VoteOutcome)`
  - `RoomData.acting(token): Either[Room.CommandResult, UUID]`, replacing
    `actingMember`
  - `Room.Vote(token, estimation, replyTo: ActorRef[CommandResult])`, and the
    same `replyTo` on `ClearVotes`, `ReVote`, `ShowVotes` and `EditIssue`
  - `RoomManager.Vote(roomId, token, estimation, replyTo)`, and the same on
    `Show`, `Clear`, `Revote`, `EditIssue`

- [ ] **Step 1: Make `APISpec`'s stub answer**

Nothing else in this task can be written until it does. The stub must answer
per-case or the `401`, `403` and `409` cases have no way to exist. Replace the
catch-all forward with one that records and replies:

```scala
  // The probe is still the assertion target; the reply is what stops every command case
  // failing on the ask's timeout instead of on what it asserts.
  val commandReply: java.util.concurrent.atomic.AtomicReference[Room.CommandResult] =
    new java.util.concurrent.atomic.AtomicReference(Room.Applied)

  val roomManager: ActorRef[RoomManager.Command] =
    testKit.spawn(Behaviors.receiveMessagePartial[RoomManager.Command] {
      case RoomManager.CreateRoom(replyTo) =>
        replyTo ! RoomManager.RoomId(roomId)
        Behaviors.same
      case RoomManager.RequestSession(_, _, replyTo) =>
        replyTo ! Room.SessionMinted(UUID.randomUUID(), validToken)
        Behaviors.same
      case RoomManager.ValidateToken(_, token, replyTo) =>
        if token == validToken then replyTo ! Room.Resolved(UUID.randomUUID(), "Alice")
        else replyTo ! Room.Unresolved
        Behaviors.same
      case other =>
        commandProbe.ref ! other
        other match
          case RoomManager.Vote(_, _, _, replyTo)      => replyTo ! commandReply.get()
          case RoomManager.Show(_, _, replyTo)         => replyTo ! commandReply.get()
          case RoomManager.Clear(_, _, replyTo)        => replyTo ! commandReply.get()
          case RoomManager.Revote(_, _, replyTo)       => replyTo ! commandReply.get()
          case RoomManager.EditIssue(_, _, _, replyTo) => replyTo ! commandReply.get()
          case _                                       => ()
        Behaviors.same
    })
```

A case that wants a refusal sets `commandReply` and restores it.

The five dispatch cases do not read exactly as they do today, and this is the
part to expect. Each message now carries a `replyTo` whose ref is fresh per ask,
so `commandProbe.expectMessage(RoomManager.Vote(id, Some(token), "5"))` can no
longer match by equality. They become a type expectation and a pattern:

```scala
      commandProbe.expectMessageType[RoomManager.Vote] match
        case RoomManager.Vote(id, tok, estimation, _) =>
          (id, tok, estimation) mustBe (UUID.fromString(roomId), Some(token), "5")
```

Five sites, one shape. Do not reach for an equality that ignores the reply
channel by constructing a probe ref to compare against: the ask mints its own.

- [ ] **Step 2: Write the failing status cases**

In `APISpec`, replacing "still return 204 for a vote with no session cookie".
Note what this spec can and cannot assert: it stubs `RoomManager`, so the rule
that a missing token *produces* `NoSession` belongs to `RoomManagerSpec`, and
what belongs here is that a `NoSession` reply comes out as a `401` and that the
endpoint still passes the absent token through rather than inventing one.

```scala
    "answer 401 for a vote with no session cookie" in {
      commandReply.set(Room.NoSession)
      try
        Post(s"/rooms/$roomId/vote", json(VoteRequest("5"))) ~> apiRoute ~> check {
          status mustBe StatusCodes.Unauthorized
        }
      finally commandReply.set(Room.Applied)
      // The endpoint still hands the manager the absent token; refusing it is the manager's rule.
      commandProbe.expectMessageType[RoomManager.Vote] match
        case RoomManager.Vote(_, token, _, _) => token mustBe None
    }

    "answer 403 for a vote from a resolved session that is no longer a member" in {
      commandReply.set(Room.NotAMember)
      try
        Post(s"/rooms/$roomId/vote", json(VoteRequest("5"))) ~> addHeader(
          Cookie("session", Room.SessionToken.mint().raw)
        ) ~> apiRoute ~> check {
          status mustBe StatusCodes.Forbidden
        }
      finally commandReply.set(Room.Applied)
    }

    "answer 409 for a vote into a revealed round" in {
      commandReply.set(Room.RoundRevealed)
      try
        Post(s"/rooms/$roomId/vote", json(VoteRequest("5"))) ~> addHeader(
          Cookie("session", Room.SessionToken.mint().raw)
        ) ~> apiRoute ~> check {
          status mustBe StatusCodes.Conflict
        }
      finally commandReply.set(Room.Applied)
    }

    "answer 400 for a blank estimation without asking the room" in {
      Post(s"/rooms/$roomId/vote", json(VoteRequest("   "))) ~> addHeader(
        Cookie("session", Room.SessionToken.mint().raw)
      ) ~> apiRoute ~> check {
        status mustBe StatusCodes.BadRequest
      }
      // The validator is at the edge, so nothing reaches the room to be refused there.
      commandProbe.expectNoMessage(300.millis)
    }
```

`APISpec` needs `import scala.concurrent.duration.*` for the
`expectNoMessage(300.millis)` above; it imports only `scala.io.Source` today.

- [ ] **Step 3: Write the failing `RoomSpec` cases for the outcome**

```scala
    "answer a vote into a revealed round with RoundRevealed, and still publish" in {
      val (user, userProbe) = createUser(UUID.randomUUID(), "user1", true, "5")
      val replyProbe        = testKit.createTestProbe[Room.CommandResult]()
      val (_, roomRef)      = createRoom(UUID.randomUUID(), withUsers(user).withRevealed())

      roomRef ! Room.Vote(user.token, "8", replyProbe.ref)

      replyProbe.expectMessage(Room.RoundRevealed)
      // The refusal publishes: the outcome answers the caller, it does not suppress a broadcast.
      expectSnapshot(userProbe)
    }

    "answer a blank estimation with BlankEstimation" in {
      val (user, _)    = createUser(UUID.randomUUID(), "user1", false, "")
      val replyProbe   = testKit.createTestProbe[Room.CommandResult]()
      val (_, roomRef) = createRoom(UUID.randomUUID(), withUsers(user))

      roomRef ! Room.Vote(user.token, "  ", replyProbe.ref)

      replyProbe.expectMessage(Room.BlankEstimation)
    }

    "answer NoSession for a token the room does not hold" in {
      val (user, _)    = createUser(UUID.randomUUID(), "user1", false, "")
      val replyProbe   = testKit.createTestProbe[Room.CommandResult]()
      val (_, roomRef) = createRoom(UUID.randomUUID(), withUsers(user))

      roomRef ! Room.ShowVotes(Room.SessionToken.mint(), replyProbe.ref)

      replyProbe.expectMessage(Room.NoSession)
    }

    "answer NotAMember for a session whose member has been removed" in {
      val (user, _)    = createUser(UUID.randomUUID(), "user1", false, "")
      val replyProbe   = testKit.createTestProbe[Room.CommandResult]()
      val (_, roomRef) = createRoom(UUID.randomUUID(), withUsers(user).withDeparted(user))

      roomRef ! Room.ShowVotes(user.token, replyProbe.ref)

      replyProbe.expectMessage(Room.NotAMember)
    }
```

- [ ] **Step 4: Run them to see them fail**

Run: `sbt test`
Expected: FAIL to compile, `Room.CommandResult` not found and every command
message taking one argument too few.

- [ ] **Step 5: Add the ADT and return the outcome**

In `Room.scala`:

```scala
  sealed trait CommandResult
  sealed trait VoteOutcome extends CommandResult
  case object Applied         extends VoteOutcome
  case object RoundRevealed   extends VoteOutcome
  case object BlankEstimation extends VoteOutcome
  case object NoSession       extends CommandResult
  case object NotAMember      extends CommandResult
```

`VoteOutcome` is the three `vote` can produce; the other two belong to the
resolution in front of it, and typing it this way is what keeps a handler from
returning `NotAMember` out of the guard.

```scala
    def vote(userId: UUID, estimation: String): (RoomData, VoteOutcome) =
      if this.state.round.revealed then (this, RoundRevealed)
      else if estimation.isBlank then (this, BlankEstimation)
      else
        val estimates = this.state.round.estimates + (userId -> Estimate.of(estimation))
        (withRound(Round(estimates, everyMemberHasVoted(estimates))), Applied)

    // Resolving a token and being allowed to act are two checks: sessions carry no TTL.
    def acting(token: SessionToken): Either[CommandResult, UUID] =
      this.sessions.get(token) match
        case None                                     => Left(NoSession)
        case Some(session) if !isMember(session.userId) => Left(NotAMember)
        case Some(session)                            => Right(session.userId)
```

`actingMember` goes; its five callers become `acting`. Each handler replies
before recursing:

```scala
          case Vote(token, estimation, replyTo) =>
            data.acting(token) match
              case Right(userId) =>
                val (next, outcome) = data.vote(userId, estimation)
                replyTo ! outcome
                receiveBehaviour(roomId, publish(next, context), gracePeriod, stopAfterIdle, timers)
              case Left(refusal) =>
                replyTo ! refusal
                Behaviors.same
          case ShowVotes(token, replyTo) =>
            data.acting(token) match
              case Right(_) =>
                replyTo ! Applied
                receiveBehaviour(
                  roomId,
                  publish(data.show(), context),
                  gracePeriod,
                  stopAfterIdle,
                  timers
                )
              case Left(refusal) =>
                replyTo ! refusal
                Behaviors.same
```

`ClearVotes`, `ReVote` and `EditIssue` take the `ShowVotes` shape exactly.

- [ ] **Step 6: Relay the reply through `RoomManager`**

Each command gains `replyTo: ActorRef[Room.CommandResult]`, and the two silent
drops become answers:

```scala
          case Vote(roomId, token, estimation, replyTo) =>
            (data.rooms.get(roomId), token) match
              case (Some(room), Some(t)) => room ! Room.Vote(t, estimation, replyTo)
              // A stopped room is answered from the map's absence rather than by a timing-out ask.
              case _                     => replyTo ! Room.NoSession
            Behaviors.same
```

`Show`, `Clear`, `Revote` and `EditIssue` take the same shape. Room refs stay
inside their owner: the manager relays, it does not hand a ref out.

- [ ] **Step 7: Map the outcome to a status in `API.scala`**

```scala
  private val noSession  = oneOfVariantSingletonMatcher(StatusCode.Unauthorized)(Room.NoSession)
  private val notAMember = oneOfVariantSingletonMatcher(StatusCode.Forbidden)(Room.NotAMember)
  private val revealed   = oneOfVariantSingletonMatcher(StatusCode.Conflict)(Room.RoundRevealed)
  private val blank      = oneOfVariantSingletonMatcher(StatusCode.BadRequest)(Room.BlankEstimation)

  private val commandErrors = oneOf[Room.CommandResult](noSession, notAMember)
  private val voteErrors    = oneOf[Room.CommandResult](noSession, notAMember, revealed, blank)

  private def command(segment: String) = endpoint.post
    .in(roomPath / segment)
    .in(sessionIn)
    .out(statusCode(StatusCode.NoContent))
    .errorOut(commandErrors)

  private val vote = endpoint.post
    .in(roomPath / "vote")
    .in(sessionIn)
    .in(jsonBody[VoteRequest])
    .out(statusCode(StatusCode.NoContent))
    .errorOut(voteErrors)

  // Applied is the only outcome that is not a refusal, so it is the only Right.
  private def answer(result: Room.CommandResult): Either[Room.CommandResult, Unit] =
    if result == Room.Applied then Right(()) else Left(result)
```

and the logic, one shape for all five:

```scala
    vote.serverLogic[Future] { (roomId, rawCookie, request) =>
      roomManager
        .ask[Room.CommandResult](
          RoomManager.Vote(roomId, resolveToken(rawCookie), request.estimation, _)
        )
        .map(answer)
    },
```

The rows declare only what each handler decides. `/show`, `/clear`, `/revote`
and `/edit-issue` carry `commandErrors` and cannot answer `409` or `400`;
`/vote` carries `voteErrors` and can. A failed or timed-out ask is left to fail
the `Future`, which tapir's default exception handler answers `500` for and
logs.

- [ ] **Step 8: Refuse the blank at the edge**

In `Requests.scala`:

```scala
import sttp.tapir.{Schema, Validator, ValidationResult}

case class VoteRequest(estimation: String)
object VoteRequest:
  given Decoder[VoteRequest] = deriveDecoder[VoteRequest]
  given Encoder[VoteRequest] = deriveEncoder[VoteRequest]
  // Refusing the absence of a value, not judging one: the scale item still owns validation.
  given Schema[VoteRequest] = Schema
    .derived[VoteRequest]
    .modify(_.estimation)(
      _.validate(
        Validator.custom(v =>
          if v.isBlank then ValidationResult.Invalid("an estimation needs a value")
          else ValidationResult.Valid
        )
      )
    )
```

`RoomData.vote`'s own blank guard stays, as insurance that can now report rather
than accept silently.

- [ ] **Step 9: Run the JVM suite**

Run: `sbt test`
Expected: PASS, including the four new `APISpec` cases and the four new
`RoomSpec` ones. `RoomManagerSpec`'s command cases each gain a reply probe, and
two cases arrive:

```scala
    "answer NoSession itself for a command on a room it does not hold" in {
      val replyProbe = testKit.createTestProbe[Room.CommandResult]()
      val managerRef = testKit.spawn(RoomManager(testGracePeriod, testStopAfterIdle))

      managerRef ! RoomManager.Show(
        UUID.randomUUID(),
        Some(Room.SessionToken.mint()),
        replyProbe.ref
      )

      replyProbe.expectMessage(Room.NoSession)
    }

    "answer NoSession itself for a command with no token" in {
      val replyProbe = testKit.createTestProbe[Room.CommandResult]()
      val managerRef = testKit.spawn(RoomManager(testGracePeriod, testStopAfterIdle))

      managerRef ! RoomManager.Show(UUID.randomUUID(), None, replyProbe.ref)

      replyProbe.expectMessage(Room.NoSession)
    }
```

- [ ] **Step 10: Update the browser case the validator changes**

In `e2e/room.spec.js`, "an empty estimation posted directly is refused":

```js
  // Refused at the edge now: a tapir validator answers 400 before the room sees the request,
  // and the actor's own guard stays behind it as insurance.
  const posted = await bob.page.request.post(`/rooms/${room}/vote`, { data: { estimation: '' } })
  expect(posted.status()).toBe(400)
```

with the URL left exactly as it was, `/rooms/${room}/vote`. The rest of the case
is unchanged: Bob still never counts as voted and the summary still has one row.

- [ ] **Step 11: Delete the optimistic vote confirmation**

In `index.html`:

```js
        vote: function (voteValue) {
          // The server refuses it anyway; this only spares the doomed POST.
          if (this.votesRevealed) {
            return;
          }
          axios.post('/rooms/' + this.roomId + '/vote', { estimation: voteValue })
          .catch(function (error) {
            console.log(error);
          });
        },
```

The snapshot is the only writer of `ownVoteConfirmed` now, which is what
"derived, not carried" says. What is given up is instant feedback on
re-confirming a kept estimate during a re-vote, which then behaves like every
other vote in the app. No error surface is added: a `409` means a snapshot
disabling the deck is already in flight, a `400` is unreachable from a page
whose card values are hardcoded, and a `401` reaches a page whose stream has
already drawn `EventSource`'s terminal message. A `500` is the one code the ask
newly makes reachable, and swallowing it is the choice rather than an oversight:
it needs a local actor to miss a five second deadline, and reporting it here
would be the only place in the app that surfaces a command failure. The cost is
that a click during such a stall shows nothing at all, the optimistic flag
having been what covered it.

- [ ] **Step 12: Run both suites and commit**

Run: `sbt test && npm run e2e`
Expected: PASS. No browser case proves the deletion cost nothing, and "a re-vote
leaves the caster shown as selected but unconfirmed" is not the one: the flag
only shows in the window between the click and the snapshot, and every assertion
in that case auto-waits past it, so it passes with the `ownVoteConfirmed`
assignment present or deleted. The Verification section's manual step is the
check, which is why it is there.

```bash
sbt scalafmtAll
git add src e2e
git commit -m "feat(protocol): answer a command with the outcome the room decided"
```

---

## Task 4: `/join` resumes the identity its cookie names

**Files:**
- Modify: `src/main/scala/com/lunatech/pointingpoker/actors/Room.scala`
- Modify: `src/main/scala/com/lunatech/pointingpoker/actors/RoomManager.scala`
- Modify: `src/main/scala/com/lunatech/pointingpoker/API.scala`
- Modify: `src/main/scala/com/lunatech/pointingpoker/Requests.scala`
- Test: `src/test/scala/.../actors/RoomSpec.scala`, `APISpec.scala`,
  `e2e/fixtures.js`, `e2e/room.spec.js`

**Interfaces:**
- Consumes: everything task 3 produced.
- Produces:
  - `Room.RequestSession(name: String, existing: Option[SessionToken], replyTo:
    ActorRef[SessionMinted])`
  - `RoomManager.RequestSession(roomId: UUID, name: String, existing:
    Option[Room.SessionToken], replyTo: ActorRef[Room.SessionMinted])`
  - `RoomData.rename(token, userId, name)`, private to `Room`
  - `JoinResponse` and its codecs no longer exist
  - `e2e/fixtures.js` exports `ownEstimation`, and a participant gains
    `newTab()`

- [ ] **Step 1: Write the failing `RoomSpec` cases**

```scala
    "resolve an existing session on a second join rather than minting over it" in {
      val replyProbe   = testKit.createTestProbe[Room.SessionMinted]()
      val (_, roomRef) = createRoom(UUID.randomUUID(), Room.RoomData.empty)

      roomRef ! Room.RequestSession("Alice", None, replyProbe.ref)
      val first = replyProbe.expectMessageType[Room.SessionMinted]

      roomRef ! Room.RequestSession("Alice", Some(first.token), replyProbe.ref)
      val second = replyProbe.expectMessageType[Room.SessionMinted]

      second.userId mustBe first.userId
      second.token mustBe first.token
    }

    "mint a fresh identity when the offered token resolves to nothing" in {
      val replyProbe   = testKit.createTestProbe[Room.SessionMinted]()
      val (_, roomRef) = createRoom(UUID.randomUUID(), Room.RoomData.empty)

      roomRef ! Room.RequestSession("Alice", Some(Room.SessionToken.mint()), replyProbe.ref)

      replyProbe.expectMessageType[Room.SessionMinted]
    }

    "rename the session and the member together on a join under a new name" in {
      val (user, userProbe) = createUser(UUID.randomUUID(), "user1", false, "")
      val replyProbe        = testKit.createTestProbe[Room.SessionMinted]()
      val dataProbe         = testKit.createTestProbe[Room.DataStatus]()
      val (_, roomRef)      = createRoom(UUID.randomUUID(), withUsers(user))

      roomRef ! Room.RequestSession("renamed", Some(user.token), replyProbe.ref)
      roomRef ! Room.GetData(dataProbe.ref)
      val data = dataProbe.expectMessageType[Room.DataStatus].data

      // Both sides move or RoomData.of refuses the next construction outright.
      data.sessions(user.token) mustBe Room.Session(user.id, "renamed")
      data.members(user.id) mustBe Room.Member("renamed")
      expectSnapshot(userProbe).users.map(_.name) mustBe List("renamed")
    }

    "not create a member on a join, whatever the name" in {
      val replyProbe   = testKit.createTestProbe[Room.SessionMinted]()
      val dataProbe    = testKit.createTestProbe[Room.DataStatus]()
      val (_, roomRef) = createRoom(UUID.randomUUID(), Room.RoomData.empty)

      roomRef ! Room.RequestSession("Alice", None, replyProbe.ref)
      roomRef ! Room.GetData(dataProbe.ref)

      // Invariant 5: a member who holds no connection would block auto-reveal for the meeting.
      dataProbe.expectMessageType[Room.DataStatus].data.members mustBe empty
    }
```

- [ ] **Step 2: Run them to see them fail**

Run: `sbt "testOnly com.lunatech.pointingpoker.actors.RoomSpec"`
Expected: FAIL to compile, `RequestSession` taking two arguments.

- [ ] **Step 3: Make `RequestSession` idempotent**

```scala
  final case class RequestSession(
      name: String,
      existing: Option[SessionToken],
      replyTo: ActorRef[SessionMinted]
  ) extends Command
```

```scala
    private[Room] def rename(token: SessionToken, userId: UUID, name: String): RoomData =
      // Both sides or neither: of requires a member's name to equal its session's.
      this.copy(
        sessions = this.sessions + (token -> Session(userId, name)),
        members = this.members.updatedWith(userId)(_.map(_ => Member(name)))
      )
```

```scala
          case RequestSession(name, existing, replyTo) =>
            existing.flatMap(t => data.sessions.get(t).map(t -> _)) match
              case Some((token, session)) =>
                // Taking the name rather than ignoring it is the nearest this app has to a rename.
                val newData = publish(data.rename(token, session.userId, name), context)
                replyTo ! SessionMinted(session.userId, token)
                receiveBehaviour(roomId, newData, gracePeriod, stopAfterIdle, timers)
              case None =>
                val userId  = UUID.randomUUID()
                val token   = SessionToken.mint()
                val newData = data.registerSession(token, userId, name)
                replyTo ! SessionMinted(userId, token)
                receiveBehaviour(roomId, newData, gracePeriod, stopAfterIdle, timers)
```

The publish on the resolved branch is unconditional and that is deliberate: a
rename has to reach everyone, and a second tab joining under the same name pays
one redundant snapshot, which this design has already priced as cheap. Under a
different name it is a rename and the last join wins, which is the same rule
and worth saying out loud: the first tab's display name changes under it.

`RoomManager.RequestSession` gains `existing` and passes it through both its
branches, the find and the create.

- [ ] **Step 4: Run them to see them pass**

Run: `sbt "testOnly com.lunatech.pointingpoker.actors.RoomSpec"`
Expected: PASS.

- [ ] **Step 5: Send the cookie's token from the endpoint**

```scala
  private val join = endpoint.post
    .in(roomPath / "join")
    .in(sessionIn)
    .in(jsonBody[JoinRequest])
    .out(statusCode(StatusCode.NoContent))
    .out(setCookie(SessionCookieName))
```

```scala
    join.serverLogicSuccess[Future] { (roomId, rawCookie, request) =>
      roomManager
        .ask[Room.SessionMinted](
          RoomManager.RequestSession(roomId, request.name, resolveToken(rawCookie), _)
        )
        .map(minted => sessionCookie(roomId, minted.token))
    },
```

The cookie is set on every call, with the resolved token on a resumed session,
so a reload keeps the value it already had. `/join` is the one endpoint with no
`401`: an unknown room id is created rather than refused.

- [ ] **Step 6: Delete `JoinResponse`**

Remove the case class and its three givens from `Requests.scala`. The type and
its derived codecs lose their only caller with the body, and nothing reddens if
they are left behind, which is why this is its own step rather than something to
notice later.

- [ ] **Step 7: Update `APISpec`'s join cases**

"join a room, return a minted userId, and set a session cookie" becomes "join a
room and set a session cookie": the `responseAs[JoinResponse]` half goes, all
seven `Set-Cookie` assertions stay, and the status becomes `NoContent`. Add:

```scala
    "resume the session its cookie already names rather than minting over it" in
      Post(s"/rooms/$roomId/join", json(JoinRequest("Alice"))) ~> addHeader(
        Cookie("session", validToken.raw)
      ) ~> apiRoute ~> check {
        status mustBe StatusCodes.NoContent
        val cookieHeader = header[`Set-Cookie`].getOrElse(fail("expected a Set-Cookie header"))
        cookieHeader.cookie.value mustBe validToken.raw
      }
```

The stub's `RequestSession` case takes the fourth argument and answers with the
token it was offered when there is one, so the case above asserts the endpoint
passes the cookie through rather than asserting the room's own logic, which
`RoomSpec` owns:

```scala
      case RoomManager.RequestSession(_, _, existing, replyTo) =>
        replyTo ! Room.SessionMinted(UUID.randomUUID(), existing.getOrElse(validToken))
        Behaviors.same
```

- [ ] **Step 8: Run the JVM suite**

Run: `sbt test`
Expected: PASS.

- [ ] **Step 9: Give the browser fixture a second tab**

In `e2e/fixtures.js`, inside the `join` fixture's `participant` object:

```js
      // A second page in the same context shares the room cookie, which is what makes two tabs
      // one participant. localStorage already holds the name and room, so created() rejoins.
      const newTab = async () => {
        const tab = await context.newPage()
        await tab.goto(`/${room}`)
        await expect(tab.getByRole('button', { name: 'Show votes' })).toBeVisible()
        return tab
      }
```

added to `participant` as `newTab`, and a locator beside the others:

```js
// The recipient's own estimation, which is on the wire for them before any reveal.
export const ownEstimation = page => page.locator('.estimation-card .estimation-text')
```

The comment at the top of the `join` fixture saying two pages in one context is
"a step 6 case rather than any of these" becomes a pointer to `newTab`.

- [ ] **Step 10: Write the two browser cases**

Both go in `e2e/room.spec.js`, whose import list gains `ownEstimation`
alongside the locators it already pulls from `./fixtures.js`.

```js
test('two tabs on one room are one participant', async ({ join }) => {
  const alice = await join('Alice')
  const bob = await join('Bob')
  const second = await bob.newTab()
  await expect(participantRows(alice.page)).toHaveCount(2)

  await vote(second, '5')
  // One identity, one vote: the first tab sees its own estimation arrive from the second.
  await expect(ownEstimation(bob.page)).toHaveText('5')
  await expect(participantRows(alice.page)).toHaveCount(2)

  await second.close()
  // The surviving tab keeps the member: only its own ref went.
  await vote(alice.page, '3')
  await expect(votedMark(participantRow(bob.page, 'Alice'))).toHaveCount(1)
  await expect(participantRow(alice.page, 'Bob')).toHaveCount(1)
})

test('a reload keeps its identity and its vote', async ({ join }) => {
  const alice = await join('Alice')
  const bob = await join('Bob')

  await vote(bob.page, '8')
  await expect(votedMark(participantRow(alice.page, 'Bob'))).toHaveCount(1)

  await bob.page.reload()
  await expect(bob.page.getByRole('button', { name: 'Show votes' })).toBeVisible()

  // One Bob, not two, and the estimation came back with him rather than being recast.
  await expect(participantRow(alice.page, 'Bob')).toHaveCount(1, { timeout: 10_000 })
  await expect(participantRows(alice.page)).toHaveCount(2)
  await expect(ownEstimation(bob.page)).toHaveText('8')
})
```

- [ ] **Step 11: Amend the straggler-reload case**

`e2e/room.spec.js`'s "a straggler reloading leaves the votes hidden" observes a
duplicate Carol that this task removes, and step 2 wrote the instruction into
the case itself. The `depart` callback's `toHaveCount(2)` becomes
`toHaveCount(1)`, and a wait on Carol's own page goes in front of both counts.
Without it they run while her reloaded page is still connecting, match the
roster she has not yet rejoined, and pass before a duplicate could appear. Her
table filling to three is what proves the rejoin landed, and is where a minted
second id shows first. Replace the two comment lines above the callback as
well: they say `/join` mints a second id and that Carol is listed twice, which
is the mechanism this task deletes, so left in place they would sit directly
above an assertion that contradicts them.

```js
    // created() rejoins from localStorage, and /join resolves the cookie rather than minting,
    // so the reload returns the same Carol instead of a second one.
    async (carol, alice) => {
      await carol.page.reload()
      // Her own table is empty until the snapshot lands, so this is what proves the rejoin
      // finished. A minted second id would render four rows here.
      await expect(participantRows(carol.page)).toHaveCount(3)
      await expect(participantRow(alice.page, 'Carol')).toHaveCount(1)
      await expect(participantRows(alice.page)).toHaveCount(3)
    },
    // No prune is pending until task 5's beacon, so this is the roster holding rather
    // than a removal completing, and the 25 second budget goes with the duplicate.
    alice => expect(participantRow(alice.page, 'Carol')).toHaveCount(1)
```

The case keeps its subject either way: the shared
`stragglerDepartsWithVotesHidden` still proves the latch leaves the votes hidden
when a departure, not a vote, is what completes the roster. Task 5 is where the
reload becomes a real departure and return, and the case sharpens there for the
same reason the new reload case does.

- [ ] **Step 12: Run the browser suite**

Run: `npm run e2e`
Expected: PASS, both engines. The reload case is the one that fails loudest if
idempotence is wrong: a second Bob appears and `toHaveCount(1)` goes red.

Note what the reload case does not yet prove. Until task 5's beacon lands, a
reload leaves the old connection to be detected by a failing write, so the
member is never removed and the identity survives trivially. The case earns its
keep either way and gets sharper at task 5, which is the argument for writing it
here rather than beside the change that would otherwise break it unwatched.

- [ ] **Step 13: Commit**

```bash
sbt scalafmtAll
git add src e2e
git commit -m "feat(protocol): resume the session a join's cookie already names"
```

---

## Task 5: An explicit leave, and the departure it announces

**Files:**
- Modify: `src/main/scala/com/lunatech/pointingpoker/actors/Room.scala`
- Modify: `src/main/scala/com/lunatech/pointingpoker/actors/RoomManager.scala`
- Modify: `src/main/scala/com/lunatech/pointingpoker/API.scala`
- Modify: `src/main/resources/pages/index.html`
- Test: `src/test/scala/.../actors/RoomSpec.scala`, `RoomManagerSpec.scala`,
  `APISpec.scala`, `e2e/room.spec.js`

**Interfaces:**
- Consumes: everything task 4 produced.
- Produces:
  - `Room.Depart(token: SessionToken, connectionId: ConnectionId, replyTo:
    ActorRef[CommandResult])`
  - `RoomManager.Depart(roomId: UUID, token: Option[Room.SessionToken],
    connectionId: Room.ConnectionId, replyTo: ActorRef[Room.CommandResult])`
  - `RoomData.dropConnection(userId, connectionId)`, private to `Room`
  - `applySnapshot` no longer returns `inRoom`

- [ ] **Step 1: Write the failing `RoomSpec` cases for both branches**

```scala
    "remove the member when a departure takes its last connection" in {
      val (user, userProbe)   = createUser(UUID.randomUUID(), "user1", false, "")
      val (other, otherProbe) = createUser(UUID.randomUUID(), "user2", false, "")
      val replyProbe          = testKit.createTestProbe[Room.CommandResult]()
      val dataProbe           = testKit.createTestProbe[Room.DataStatus]()
      val (_, roomRef)        = createRoom(UUID.randomUUID(), withUsers(user, other))

      roomRef ! Room.Depart(user.token, user.connectionId, replyProbe.ref)
      roomRef ! Room.GetData(dataProbe.ref)
      val data = dataProbe.expectMessageType[Room.DataStatus].data

      replyProbe.expectMessage(Room.Applied)
      data.members.keySet mustBe Set(other.id)
      data.connections.keySet mustBe Set(other.id)
      // The announcement is the other half of the task: asserting only that a snapshot
      // arrived would pass on one that still listed the leaver.
      expectSnapshot(otherProbe).users.map(_.id) mustBe List(other.id)
      // The leaver's stream is ended rather than fed: it is out of connections before the
      // publish, so StreamCompleted is the one thing it gets and no snapshot follows it out.
      userProbe.expectMsg(Room.StreamCompleted)
      userProbe.expectNoMessage(300.millis)
    }

    "keep the member when a departure leaves another connection open" in {
      val (user, userProbe) = createUser(UUID.randomUUID(), "user1", false, "")
      val secondProbe       = TestProbe()(testKit.system.classicSystem)
      val secondId          = newConnectionId()
      val replyProbe        = testKit.createTestProbe[Room.CommandResult]()
      val dataProbe         = testKit.createTestProbe[Room.DataStatus]()
      val (_, roomRef)      = createRoom(
        UUID.randomUUID(),
        withUsers(user).withSecondConnection(user, secondId, secondProbe.ref)
      )

      roomRef ! Room.Depart(user.token, secondId, replyProbe.ref)
      roomRef ! Room.GetData(dataProbe.ref)
      val data = dataProbe.expectMessageType[Room.DataStatus].data

      replyProbe.expectMessage(Room.Applied)
      data.members.keySet mustBe Set(user.id)
      data.connections(user.id) mustBe Map(user.connectionId -> userProbe.ref)
      // The other branch of the same rule: the tab that left gets its stream ended even
      // though the member stayed, which is why the send is not a removal-only case.
      secondProbe.expectMsg(Room.StreamCompleted)
    }

    "answer a departure naming a connection that is already gone, and still remove the member" in {
      val (user, userProbe) = createUser(UUID.randomUUID(), "user1", false, "")
      val replyProbe        = testKit.createTestProbe[Room.CommandResult]()
      val dataProbe         = testKit.createTestProbe[Room.DataStatus]()
      // The beacon lost the race with its own stream's teardown: no entry at all is left.
      val (_, roomRef)      = createRoom(UUID.randomUUID(), withUsers(user).withNoConnection(user))

      roomRef ! Room.Depart(user.token, user.connectionId, replyProbe.ref)
      roomRef ! Room.GetData(dataProbe.ref)

      replyProbe.expectMessage(Room.Applied)
      dataProbe.expectMessageType[Room.DataStatus].data.members mustBe empty
    }

    "answer 403-worthy NotAMember for a departure after grace expiry" in {
      val (user, _)    = createUser(UUID.randomUUID(), "user1", false, "")
      val replyProbe   = testKit.createTestProbe[Room.CommandResult]()
      val (_, roomRef) = createRoom(UUID.randomUUID(), withUsers(user).withDeparted(user))

      roomRef ! Room.Depart(user.token, user.connectionId, replyProbe.ref)

      replyProbe.expectMessage(Room.NotAMember)
    }
```

and the timer case, on `BehaviorTestKit` beside the existing grace-period ones:

```scala
    "cancel a pending ConfirmLeave when a departure removes the member first" in {
      val (user, userProbe) = createUser(UUID.randomUUID(), "user1", false, "")
      val replyProbe        = testKit.createTestProbe[Room.CommandResult]()
      val btk               = BehaviorTestKit(
        Room(UUID.randomUUID(), withUsers(user), testGracePeriod, testStopAfterIdle)
      )

      // A timer is pending: the stream terminated first. Every non-tick message re-arms the
      // idle tick, so drain the queue as the other timer cases do.
      btk.run(Room.Leave(user.id, userProbe.ref))
      btk.retrieveAllEffects()

      // Two paths to one departure must not both publish it. The key is the assertion:
      // the grace timer is keyed by the member, the idle re-arm by IdleTickKey.
      btk.run(Room.Depart(user.token, user.connectionId, replyProbe.ref))
      btk.retrieveAllEffects() must contain(Effect.TimerCancelled(user.id))
    }
```

- [ ] **Step 2: Run them to see them fail**

Run: `sbt "testOnly com.lunatech.pointingpoker.actors.RoomSpec"`
Expected: FAIL to compile, `Room.Depart` not found.

- [ ] **Step 3: Add the handler**

```scala
  final case class Depart(
      token: SessionToken,
      connectionId: ConnectionId,
      replyTo: ActorRef[CommandResult]
  ) extends Command
```

```scala
    private[Room] def dropConnection(userId: UUID, connectionId: ConnectionId): RoomData =
      this.copy(connections =
        this.connections.updatedWith(userId)(_.map(_ - connectionId).filter(_.nonEmpty))
      )
```

```scala
          case Depart(token, connectionId, replyTo) =>
            data.acting(token) match
              case Right(userId) =>
                replyTo ! Applied
                // The server ends every stream it stops serving, the same rule a refused Join
                // follows. A ref whose stream already ended dead-letters harmlessly.
                data.connections
                  .get(userId)
                  .flatMap(_.get(connectionId))
                  .foreach(_ ! StreamCompleted)
                val next = data.dropConnection(userId, connectionId)
                if next.holdsConnection(userId) then
                  receiveBehaviour(roomId, next, gracePeriod, stopAfterIdle, timers)
                else
                  // Removing the member cancels the grace timer, so only one path publishes.
                  timers.cancel(userId)
                  receiveBehaviour(
                    roomId,
                    publish(next.removeMember(userId), context),
                    gracePeriod,
                    stopAfterIdle,
                    timers
                  )
              case Left(refusal) =>
                replyTo ! refusal
                Behaviors.same
```

Drop the named ref if it is still there, then remove the member if the set is
now empty. That order is what makes it insensitive to the races between a
request and its own stream: a beacon losing to its own teardown names a ref
already gone and still finds the empty set behind it, and one arriving after a
replacement page has connected finds a set that is not empty and leaves the
member alone.

`holdsConnection` reads `connections.contains`, and the entry is gone once its
map empties, so this reads the set through the `Option` rather than indexing it.

**Ending the stream is unconditional on purpose.** The alternative was to send
nothing, on the argument that a departing client has already closed its own
stream, and that argument is true of both paths that produce a `Depart` and
false of the one that matters: a beacon fired from a `pagehide` the `persisted`
gate misread leaves a live page whose member the room has removed, receiving
nothing and never told. Ending the stream makes `EventSource` reconnect and
re-join, so the state heals itself. Sending it on both branches, rather than
only on the one that removes the member, is what keeps this a rule instead of a
special case, and matches what a refused `Join` already does. Where the client
closed first the ref is already out of the map and nothing is sent at all. Where
it is still mapped but its stream has completed, the cost was measured against
this build's pekko rather than assumed: the message dead-letters, which is a
no-op logged at INFO and bounded by `log-dead-letters = 10` with a five minute
suspension.

- [ ] **Step 4: Relay it and describe the endpoint**

`RoomManager.Depart` takes the `Vote` shape exactly, answering `NoSession` for
an unknown room or a missing token. In `API.scala`:

```scala
  private val leave = endpoint.post
    .in(roomPath / "leave")
    .in(query[Room.ConnectionId]("connectionId"))
    .in(sessionIn)
    .out(statusCode(StatusCode.NoContent))
    .errorOut(commandErrors)
```

```scala
    leave.serverLogic[Future] { (roomId, connectionId, rawCookie) =>
      roomManager
        .ask[Room.CommandResult](
          RoomManager.Depart(roomId, resolveToken(rawCookie), connectionId, _)
        )
        .map(answer)
    },
```

No request body at all: `sendBeacon` sends a string as `text/plain`, which a
JSON unmarshaller refuses with a `415` the beacon cannot read, leaving the
departure to fall back on the grace period with nothing anywhere to show that it
failed. It answers the same on every branch it reaches, which is why there is no
variant for "the id named nothing".

- [ ] **Step 5: Run them to see them pass, and add the `APISpec` cases**

```scala
    "answer 204 for a leave naming a connection" in {
      val token = Room.SessionToken.mint()
      val id    = UUID.randomUUID()
      Post(s"/rooms/$roomId/leave?connectionId=$id") ~> addHeader(
        Cookie("session", token.raw)
      ) ~> apiRoute ~> check {
        status mustBe StatusCodes.NoContent
      }
    }

    "reject a leave with no connection id" in
      Post(s"/rooms/$roomId/leave") ~> addHeader(
        Cookie("session", Room.SessionToken.mint().raw)
      ) ~> apiRoute ~> check {
        status mustBe StatusCodes.BadRequest
      }

    "answer 401 for a leave with no session cookie" in
      Post(s"/rooms/$roomId/leave?connectionId=${UUID.randomUUID()}") ~> apiRoute ~> check {
        status mustBe StatusCodes.Unauthorized
      }
```

The stub answers `Depart` from `commandReply` the same way it answers the five
commands.

Run: `sbt test`
Expected: PASS.

- [ ] **Step 6: Commit the server half**

```bash
sbt scalafmtAll
git add src
git commit -m "feat(protocol): add an explicit leave endpoint naming its connection"
```

- [ ] **Step 7: Fire the beacon, and post from the Leave link**

In `index.html`, one helper and two callers:

```js
    // sendBeacon rather than a POST: an unload-adjacent fetch is not reliably delivered, and
    // a body would arrive as text/plain and be refused where nothing could report it.
    function postLeave(roomId) {
      navigator.sendBeacon('/rooms/' + roomId + '/leave?connectionId=' + connectionId);
    }
```

Its `false` return, when the agent will not queue the request, is ignored on
purpose: the grace period and `ConfirmLeave` both survive this task, so a beacon
that never goes degrades to exactly the detection path this step replaces.

```js
        doLeave: function () {
          // Closed before the request, not after: the server ends a departed connection's
          // stream, and an EventSource reconnects unless it was closed from this side.
          this.eventSource.close();
          postLeave(this.roomId);
          localStorage.clear();
          this.inRoom = false;
          ...
        },
```

The order is the point. Today's `doLeave` closes the stream last and gets away
with it because it issues no request at all, so there is no reply to race. Add
the `postLeave` call and keep the close last, and the safety becomes a timing
accident: the server ends a departed connection's stream, and an `EventSource`
reconnects unless it was closed from this side. Closing first makes it
independent of timing, since no reconnect can come from an object already
closed.

and, after the Vue instance is created:

```js
    window.addEventListener('pagehide', function (event) {
      // Only a page being discarded: a back/forward cache entry can be restored with no page
      // load, so removing its member would leave a live page as a non-member.
      if (event.persisted || !app.inRoom) return;
      postLeave(app.roomId);
    });
```

It clears no cookie, deliberately. `pagehide` fires on reload as well as on
close and nothing on the event tells the two apart, so a response carrying
`Max-Age=0` would delete the identity of a tab that is about to come back, and
`sendBeacon` being fire-and-forget it could land after the reloaded page had
already called `/join`.

- [ ] **Step 8: Move `inRoom` out of the snapshot**

`applySnapshot` drops its first key:

```js
      return {
        users: s.users,
        votesRevealed: s.votesRevealed,
```

and `doJoin` arms a one-shot its first snapshot spends:

```js
          .then(function () {
            // Entering a room is a navigation decision, not room state: no later frame can put
            // the page back into a room the user has left.
            var entering = true;
            ref.eventSource = new EventSource(
              '/rooms/' + ref.roomId + '/events?connectionId=' + connectionId
            );
```

inside `onmessage`, replacing `ref.inRoom = next.inRoom;`:

```js
              if (entering) {
                ref.inRoom = true;
                entering = false;
              }
```

This keeps the refused-`Join` property exactly: a refused joiner receives no
snapshot, so the one-shot is never spent and the join card stays as though the
button had done nothing.

- [ ] **Step 9: Turn the join-and-leave case into the departure case**

`e2e/room.spec.js`'s "the participant list follows a join and a leave" exists to
prove the list follows both, and it currently spends two Clear clicks and a 25
second budget standing in for the heartbeat that used to be the only thing that
noticed a departure. The beacon makes that mechanism irrelevant, and a case
whose comment describes a mechanism the code no longer uses is the pattern
`docs/known-issues.md` records under "Tests that pass with the mechanism they
name deleted". So it becomes the departure case the spec's step 6 inventory
calls the third:

```js
test('the participant list follows a join and a leave', async ({ join }) => {
  const alice = await join('Alice')
  await expect(participantRows(alice.page)).toHaveCount(1)

  const bob = await join('Bob')
  await expect(participantRows(alice.page)).toHaveCount(2)
  await expect(participantRows(bob.page)).toHaveCount(2)

  // No grace period and no traffic to force detection: the leave endpoint removes the member
  // on the request, so the default timeout is the whole budget.
  await bob.page.getByRole('link', { name: 'Leave' }).click()
  await expect(participantRow(alice.page, 'Bob')).toHaveCount(0)
  await expect(participantRows(alice.page)).toHaveCount(1)
})
```

That is one amendment rather than a third addition, and the spec's test
inventory says "adds three". Task 6 reconciles the count rather than leaving the
two documents disagreeing.

Deleting that comment orphans a pointer to it. "a straggler closing their tab
leaves the votes hidden" justifies its own 25 second budget with "for the reason
the leave case above records", and the reason is what this step removes. Give
that case the reason directly instead, in a line of its own, or the next reader
follows a pointer into a case that no longer explains anything.

- [ ] **Step 10: Run the browser suite**

Run: `npm run e2e`
Expected: PASS, both engines, and noticeably faster: the 25 second wait is gone
and the reload cases stop waiting on a heartbeat.

Three cases are the ones to read carefully if anything goes red. "a straggler
reloading leaves the votes hidden" is now genuinely hostile, since the reload
removes the straggler and the latch is the only thing keeping the round shut.
Its opening comment has to go with that: it calls the case vacuous and says it
is "kept for step 6, where a beacon removes her instead of replacing her", which
this step is. Replace it with what the case now proves, that the latch holds the
round shut across a real departure and return:

```js
  // Hostile now: the beacon removes Carol on the reload, so the latch is the only thing
  // keeping the round shut until she returns.
```

The other two need no edit, only attention. "a reload keeps its identity and its
vote" from task 4 now exercises the departure and the return rather than a
member who never left, and "a straggler closing their tab leaves the votes
hidden" should get much faster for the same reason.

- [ ] **Step 11: Commit**

```bash
sbt scalafmtAll
git add src e2e
git commit -m "feat(client): announce a departure instead of waiting out the grace period"
```

---

## Task 6: The record

**Files:**
- Modify: `docs/superpowers/specs/2026-08-31-protocol-target-architecture-design.md`
- Modify: `docs/known-issues.md`
- Modify: `docs/roadmap.md`
- Modify: `docs/superpowers/plans/README.md`

This task waits on all five above, because a citation sweep is only true of the
tree it runs against and because the known-issue entries are only false once the
code that falsifies them has landed.

- [ ] **Step 1: Annotate the design**

Landed-state notes in the same voice the earlier steps use, annotating rather
than re-tensing. Mostly in the step 6 section, but not only: the notes below
reach a sentence in section 4 and a row of the known-defect table. The four that
are not optional:

- The test inventory says step 6 adds three browser cases. Two were added and
  the third landed as an amendment to "the participant list follows a join and
  a leave", which already had the two contexts and the departure the third case
  describes. Say so beside the sentence, with the reason: leaving the old case
  alongside a new one would have kept a 25 second budget and a comment about a
  heartbeat mechanism the endpoint replaces. Record the straggler-reload case
  beside it as an amendment rather than an addition: step 2 wrote it against
  this step and flagged its own `toHaveCount(2)` for revision, which task 4 paid.
- `RoomData.vote` returns `(RoomData, VoteOutcome)` rather than a bare outcome,
  and the ADT is split so the two refusals the resolution owns cannot be
  returned from the guard. The spec argues for "an ADT of applied, round
  revealed and blank estimation"; record that the implementation made that
  three-case set a sub-trait of the five-case reply rather than a separate type
  needing a join.
- `CirceSupport` was deleted rather than left without a production caller,
  following the same rule as `JoinResponse`. The spec names it twice as the live
  mechanism and both sentences need it out: section 4's reason the beacon sends
  no body ("`CirceSupport`'s unmarshaller refuses with a `415`"), and step 6's
  uniform-failure rule ("`CirceSupport`'s unmarshaller accepting
  `application/json` alone"). Re-attribute both to the body description tapir
  generates. Leave the `415` itself alone rather than restating it as a
  contract: nothing in `src/test` asserts one, in this world or the last, and
  the status table carries none.
- The known-defect table's row for the second tab says step 6 closes it, "so a
  second tab joins the same participant instead of displacing it". That is true
  of a tab holding the cookie and not of two that load before either has joined,
  which step 2 below narrows the matching known-issue entry to. Bring the row to
  the same wording rather than leaving the two documents disagreeing.

- [ ] **Step 2: Close the known-issue entries**

Four close outright and two narrow.

- "A deliberate tab close is as slow to announce as a transient reconnect"
  closes. Both halves landed: the beacon for the close, idempotent `/join` for
  the reload. Its heartbeat-reduction stopgap paragraph goes with it.
- "A second tab on the same room displaces the first tab's identity" narrows
  rather than closing. Idempotent `/join` resolves a cookie that exists, which
  is the common path and the one the entry was written against. It cannot reach
  two tabs that both load before either has joined: neither holds a cookie, so
  both mint, and the second response's `setCookie` lands on the first's shared
  slot, which is the overwrite the entry calls the defect. Not fixable here,
  since a tab cannot see another tab and the server cannot tell two cookieless
  joins from two people. Rewrite the entry to that residual and keep it open.
- "A vote refused by a revealed round is silent, and can read as accepted"
  closes. The ask gives `/vote` a real result, the validator answers the blank
  half at the edge, and the optimistic assignment is gone.
- "A reload during a revealed round locks the participant out of it" closes.
- "A cached page can outlive the server that served it" closes, with its own
  last paragraph kept as the record of the one exposure the header cannot
  cover: a page cached before this deploy opens `/events` with no connection id
  and takes the `400`.
- "No request payload is validated on any endpoint that takes one" narrows
  rather than closing. The blank estimation is now refused at the edge; the name
  on `/join`, the text on `/edit-issue` and the non-blank nonsense estimation
  behind the `scale` item are untouched. Rewrite the resolution to say what
  landed rather than what step 6 would do.

Two entries gain a sentence rather than closing. "No rate limiting on mutating
room endpoints" names the leave endpoint as one of the unthrottled ones, which
its `Where` already anticipated. "The grace period does not start until a
heartbeat write to the dead connection fails" stays open and its resolution is
already written against this step: the beacon reaches no crash, no slept laptop
and no silent drop.

- [ ] **Step 3: Update the roadmap and the plans README**

Check off Phase 1's ask-pattern command endpoints item. The usage-metrics item
needs a second look in the same pass: it asks to size "the ghost rate in
`docs/known-issues.md`", and the entry that defines the ghost is the tab-close
one step 2 closes, so the phrase has to carry its own definition or name the
closed entry as history. Add step 6's entry to
`docs/superpowers/plans/README.md`, in the large-surface-area case: six files of
production code, five spec files and the browser suite, and the same
no-tree-compiles-between-the-halves argument step 4's entry makes, which is why
this one decomposed into five production tasks rather than one.

- [ ] **Step 4: Sweep the citations**

Run last, after the final code commit, over every file this branch changed
rather than over the citations in the diff. The known stale-makers this step
creates:

- `docs/known-issues.md` cites `API.scala:18-19`, `:66`, `:72`, `:91`, `:132`,
  `:158-165`, `:163` and `Requests.scala:8`, `:18`. Every one of those moves, and
  most of the code they name no longer exists in that form. Convert to symbol
  names rather than renumbering, per the citation convention. The list was wrong
  in both directions before this step's review: it named a `Requests.scala:23`
  that does not exist and missed `API.scala:91` and `:163`, which this step
  deletes outright, and `:18-19`, which task 1 rewrites.
- `index.html:447-460`, `:517-527`, `:365`, `:355`, `:318`, `:273` and the four asset
  tags all shift. The design cites several of the same lines.
- The design's `Room.scala` citations shift again for `ConnectionId`, the
  `CommandResult` ADT and the `Depart` handler.
- Two tables name steps rather than sentences: "Known issues disposition" and
  "Deferred, with triggers". Both have rows that this step closes, and scanning
  prose does not read like scanning a table.

- [ ] **Step 5: Re-read the deviations list**

Before the final commit, diff this branch's changed files against the file list
the tasks above declare, then diff the content of each declared file against
what its task asked of it. The second half is what does the work: of step 5a's
four undeclared documentation changes, three landed inside declared files, where
a file-list diff is blind.

- [ ] **Step 6: Commit**

```bash
git add docs
git commit -m "docs(protocol): record what step 6 landed"
```

---

## Verification

Run from the repository root, in this order:

1. `sbt styleCheck` Formatting, at 100 columns.
2. `sbt test` The whole JVM suite. `APISpec` is where this step lives, and
   `RoomSnapshotSpec` passing untouched is the check that the write path stopped
   at the wire format's edge.
3. `npm run e2e` The browser suite, both engines. The three cases that carry
   this step are the two-tab case, the reload case and the departure case, and
   the two straggler cases from step 2 are the ones that prove the beacon did
   not open a disclosure.
4. `sbt "; clean; coverage; test; coverageReport"` (the `qa` alias) once, before
   the PR is marked ready.

Then, by hand, against a locally staged app (`npm run stage` and
`./target/universal/stage/bin/pointingpoker`), the four things no case asserts:

- Open a room, then close the tab with the room still open in another browser.
  The participant should go immediately rather than after half a minute. This is
  the entry the beacon closes and the browser suite only reaches through the
  Leave link.
- Join a room, then join it again from a second tab under a different name. Both
  tabs should show the one participant under the new name, which is the rename
  moving the session and the member together.
- Switch to another app on a phone, or navigate away and back with the browser's
  own back button. The participant should still be there, which is the
  `persisted` gate doing its job; if they vanish, the beacon is firing on a page
  entering the back/forward cache.
- Vote, then revote and click a different card. The previously selected card
  should not turn confirmed for a round trip, which is the optimistic assignment
  being gone.

## Deviations from the plan, and why

Listed so a reviewer can reject one without re-deriving it.

**Task 1's `X-Forwarded-Proto` diagnostic needed two follow-up commits rather
than landing inside the declared one.** Task 1's step 8 says the diagnostic
"moves into the `events` logic ahead of the `Left(())`, unchanged in what it
logs," as part of the single `refactor(api): describe the endpoints with
tapir` commit. It did not: that commit's rewrite of the `events` endpoint
dropped the diagnostic outright, and `git commit -m "fix(api): restore the
X-Forwarded-Proto diagnostic in the events no-cookie branch"` had to restore it
afterward, adding the `X-Forwarded-Proto` header input and the warn/debug
branch back. That restoration's comment ran to three lines, over this branch's
own two-line limit, so a second commit, `git commit -m "fix(api): compress the
X-Forwarded-Proto comment to two lines"`, shortened it. Both commits land
between "refactor(api): describe the endpoints with tapir" and "feat(protocol):
key a member's connections by a client-minted id" in the branch's history.
Recorded rather than corrected retroactively, since the diagnostic's current
form and comment are what task 2 and every task after it were written against,
and the two-commit trail costs nothing now that the tree it left behind is
correct.

Re-read before the final commit, per the entry in `docs/known-issues.md` this
practice comes from: this branch's changed files were diffed against the file
list each task declared (clean, nothing undeclared), and each declared file's
content was diffed against what its task asked of it, which is where the
finding above surfaced. Two more deviations surfaced only later, at the final
whole-branch review, since neither fell inside any single task's declared
scope.

**Task 1's `build.sbt` edit left the dependency block unaligned.** Adding the
`"com.softwaremill.sttp.tapir"` lines made that groupId the block's longest,
which `scalafmt`'s `defaultWithAlign` preset requires realigning the whole
block for, and the added lines were pasted unaligned. `sbt scalafmtAll`, which
every task's commit ritual ran, does not cover `.sbt` files; that is
`scalafmtSbt`, which no task ran. It went undetected until the final review
ran `sbt styleCheck`, and was fixed there by running `sbt scalafmtSbt`.

**Task 1's tapir rewrite silently dropped five log statements.** The
pre-tapir `API.scala` logged a debug line on entry to `createRoom`, an error
line on each of `createRoom`, `/join`, and the `ValidateToken` ask's failure
branches, and a debug line on `/events`' token-resolved-to-nothing branch.
Task 1's rewrite carried none of them forward. A task-scoped review checking
Task 1's stated behavioral scope, unchanged in every status it answers, had
no reason to diff every log line, so this was caught and restored in the
final review's fix wave rather than at Task 1.
