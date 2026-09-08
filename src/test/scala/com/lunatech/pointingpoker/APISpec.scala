package com.lunatech.pointingpoker

import java.util.UUID

import org.apache.pekko.actor.testkit.typed.scaladsl.ActorTestKit
import org.apache.pekko.actor.typed.scaladsl.Behaviors
import org.apache.pekko.actor.typed.{ActorRef, ActorSystem, SpawnProtocol}
import org.apache.pekko.http.scaladsl.testkit.ScalatestRouteTest
import com.lunatech.pointingpoker.config.{ApiConfig, ProbeConfig, SseConfig}
import com.typesafe.config.ConfigFactory
import org.apache.pekko.http.scaladsl.server.*
import org.apache.pekko.http.scaladsl.server.Directives.handleRejections
import com.lunatech.pointingpoker.actors.Room
import com.lunatech.pointingpoker.actors.RoomManager
import org.apache.pekko.http.scaladsl.model.headers.`Set-Cookie`
import org.apache.pekko.http.scaladsl.model.headers.Cookie
import org.apache.pekko.http.scaladsl.model.headers.SameSite
import org.scalatest.BeforeAndAfterAll
import org.scalatest.matchers.must
import org.scalatest.wordspec.AnyWordSpec
import com.lunatech.pointingpoker.JoinRequest
import com.lunatech.pointingpoker.JoinResponse
import com.lunatech.pointingpoker.{CirceSupport, EditIssueRequest, VoteRequest}
import io.circe.parser.decode
import io.circe.syntax.*
import org.apache.pekko.http.scaladsl.model.{ContentTypes, HttpEntity, StatusCodes}
import org.apache.pekko.http.scaladsl.server.{ExceptionHandler, RejectionHandler}

import scala.io.Source

class APISpec extends AnyWordSpec with must.Matchers with ScalatestRouteTest with BeforeAndAfterAll:

  val apiConfig: ApiConfig     = ApiConfig.load(ConfigFactory.load())
  val sseConfig: SseConfig     = SseConfig.load(ConfigFactory.load())
  val probeConfig: ProbeConfig = ProbeConfig.load(ConfigFactory.load())
  val roomId: String           = UUID.randomUUID().toString

  val testKit: ActorTestKit = ActorTestKit()

  val commandProbe: org.apache.pekko.actor.testkit.typed.scaladsl.TestProbe[RoomManager.Command] =
    testKit.createTestProbe[RoomManager.Command]()

  val validToken: Room.SessionToken = Room.SessionToken.mint()

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
        Behaviors.same
    })
  given typedSystem: ActorSystem[SpawnProtocol.Command] =
    ActorSystem(Behaviors.setup[SpawnProtocol.Command](_ => SpawnProtocol()), "pointing-poker")

  val apiRoute: Route = handleRejections(RejectionHandler.default) {
    API(roomManager, apiConfig, sseConfig, probeConfig).route
  }

  override def afterAll(): Unit =
    super.afterAll()
    testKit.shutdownTestKit()
    typedSystem.terminate()

  "API" should {
    // The probe ships in the ordinary binary, so the assembled route must not expose it by default.
    "not expose the proxy probe under the shipped configuration" in
      Get("/probe") ~> apiRoute ~> check {
        status mustBe StatusCodes.NotFound
      }
    "return index.html" in {
      val index = Source.fromFile("src/main/resources/pages/index.html").mkString

      Get() ~> apiRoute ~> check {
        responseAs[String] mustBe index
      }
    }
    "create a room" in
      // Deliberately no CirceSupport import here: create-room must stay a plain
      // text/plain body containing the bare roomId, not a JSON-quoted string.
      Post("/create-room") ~> apiRoute ~> check {
        contentType mustBe ContentTypes.`text/plain(UTF-8)`
        responseAs[String] mustBe roomId
      }
    "join a room, return a minted userId, and set a session cookie" in {
      import com.lunatech.pointingpoker.CirceSupport.given
      Post(s"/rooms/$roomId/join", JoinRequest("Alice")) ~> apiRoute ~> check {
        status.isSuccess() mustBe true
        val response = responseAs[JoinResponse]
        response.userId.toString.length > 0 mustBe true

        val cookieHeader = header[`Set-Cookie`].getOrElse(fail("expected a Set-Cookie header"))
        cookieHeader.cookie.name mustBe "session"
        cookieHeader.cookie.httpOnly mustBe true
        cookieHeader.cookie.secure mustBe true
        cookieHeader.cookie.path mustBe Some(s"/rooms/$roomId")
        cookieHeader.cookie.sameSite mustBe Some(SameSite.Strict)
        cookieHeader.cookie.maxAge mustBe None
      }
    }
    "set the same session token on /join that /events later accepts" in {
      import com.lunatech.pointingpoker.CirceSupport.given
      val cookieValue = Post(s"/rooms/$roomId/join", JoinRequest("Alice")) ~> apiRoute ~> check {
        status.isSuccess() mustBe true
        val cookieHeader = header[`Set-Cookie`].getOrElse(fail("expected a Set-Cookie header"))
        cookieHeader.cookie.value
      }
      cookieValue mustBe validToken.raw

      Get(s"/rooms/$roomId/events") ~> addHeader(
        Cookie("session", cookieValue)
      ) ~> apiRoute ~> check {
        status.isSuccess() mustBe true
        mediaType.toString mustBe "text/event-stream"
      }
    }
    "reject malformed JSON on join endpoint with 400" in
      Post(
        s"/rooms/$roomId/join",
        HttpEntity(ContentTypes.`application/json`, "{\"not-name\": 5}")
      ) ~> apiRoute ~> check {
        // MalformedRequestContentRejection should result in 400
        response.status mustBe StatusCodes.BadRequest
      }

    "dispatch a vote command" in {
      import com.lunatech.pointingpoker.CirceSupport.given
      val token = Room.SessionToken.mint()
      Post(s"/rooms/$roomId/vote", VoteRequest("5")) ~> addHeader(
        Cookie("session", token.raw)
      ) ~> apiRoute ~> check {
        status.isSuccess() mustBe true
      }
      commandProbe.expectMessage(RoomManager.Vote(UUID.fromString(roomId), Some(token), "5"))
    }

    "dispatch a show command" in {
      val token = Room.SessionToken.mint()
      Post(s"/rooms/$roomId/show") ~> addHeader(Cookie("session", token.raw)) ~> apiRoute ~> check {
        status.isSuccess() mustBe true
      }
      commandProbe.expectMessage(RoomManager.Show(UUID.fromString(roomId), Some(token)))
    }

    "dispatch a clear command" in {
      val token = Room.SessionToken.mint()
      Post(s"/rooms/$roomId/clear") ~> addHeader(Cookie("session", token.raw)) ~> apiRoute ~> check {
        status.isSuccess() mustBe true
      }
      commandProbe.expectMessage(RoomManager.Clear(UUID.fromString(roomId), Some(token)))
    }

    "dispatch a revote command" in {
      val token = Room.SessionToken.mint()
      Post(s"/rooms/$roomId/revote") ~> addHeader(
        Cookie("session", token.raw)
      ) ~> apiRoute ~> check {
        status.isSuccess() mustBe true
      }
      commandProbe.expectMessage(RoomManager.Revote(UUID.fromString(roomId), Some(token)))
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
        RoomManager.EditIssue(UUID.fromString(roomId), Some(token), "new issue")
      )
    }

    "reject an events connection with no session cookie" in
      Get(s"/rooms/$roomId/events") ~> apiRoute ~> check {
        status mustBe StatusCodes.Unauthorized
      }

    "reject an events connection with a malformed session cookie" in
      Get(s"/rooms/$roomId/events") ~> addHeader(
        Cookie("session", "not-a-uuid")
      ) ~> apiRoute ~> check {
        status mustBe StatusCodes.Unauthorized
      }

    "reject an events connection with an unresolvable session cookie" in
      Get(s"/rooms/$roomId/events") ~> addHeader(
        Cookie("session", Room.SessionToken.mint().raw)
      ) ~> apiRoute ~> check {
        status mustBe StatusCodes.Unauthorized
      }

    "open an SSE events stream for a resolved session" in
      Get(s"/rooms/$roomId/events") ~> addHeader(
        Cookie("session", validToken.raw)
      ) ~> apiRoute ~> check {
        status.isSuccess() mustBe true
        mediaType.toString mustBe "text/event-stream"
        // The stub cannot stand in for these: it buffers on its own flag and never reads
        // the upstream response headers.
        header("Cache-Control").map(_.value) mustBe Some("no-cache")
        header("X-Accel-Buffering").map(_.value) mustBe Some("no")
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
      // The API layer never rejects a missing/invalid credential for command endpoints.
      // A missing cookie resolves to None here; RoomManager never asks Room in that case
      // (see RoomManagerSpec). A cookie that parses but doesn't resolve to a member is
      // Room's own no-op case instead (see RoomSpec).
      commandProbe.expectMessage(RoomManager.Vote(UUID.fromString(roomId), None, "5"))
    }
  }
end APISpec
