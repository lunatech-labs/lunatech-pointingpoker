package com.lunatech.pointingpoker

import java.util.{Locale, UUID}

import org.apache.pekko.actor.testkit.typed.scaladsl.ActorTestKit
import org.apache.pekko.actor.typed.scaladsl.Behaviors
import org.apache.pekko.actor.typed.{ActorRef, ActorSystem, SpawnProtocol}
import org.apache.pekko.http.scaladsl.testkit.ScalatestRouteTest
import ch.qos.logback.classic.Logger as LogbackLogger
import ch.qos.logback.classic.spi.ILoggingEvent
import ch.qos.logback.core.read.ListAppender
import com.lunatech.pointingpoker.config.{ApiConfig, LifecycleConfig, ProbeConfig}
import com.lunatech.pointingpoker.slug.{LegacySlug, Slug}
import com.lunatech.pointingpoker.slug.SlugFixtures.aSlug
import com.typesafe.config.ConfigFactory
import org.apache.pekko.http.scaladsl.server.*
import org.apache.pekko.http.scaladsl.server.Directives.handleRejections
import com.lunatech.pointingpoker.actors.Room
import com.lunatech.pointingpoker.actors.RoomManager
import org.apache.pekko.http.scaladsl.model.headers.`Set-Cookie`
import org.apache.pekko.http.scaladsl.model.headers.Cookie
import org.apache.pekko.http.scaladsl.model.headers.Location
import org.apache.pekko.http.scaladsl.model.headers.SameSite
import org.scalatest.BeforeAndAfterAll
import org.scalatest.matchers.must
import org.scalatest.wordspec.AnyWordSpec
import com.lunatech.pointingpoker.JoinRequest
import com.lunatech.pointingpoker.{EditIssueRequest, VoteRequest}
import io.circe.syntax.*
import org.apache.pekko.http.scaladsl.model.{ContentTypes, HttpEntity, StatusCodes}
import org.apache.pekko.http.scaladsl.server.{ExceptionHandler, RejectionHandler}
import org.slf4j.LoggerFactory

import scala.concurrent.duration.*
import scala.io.Source
import scala.jdk.CollectionConverters.*

class APISpec extends AnyWordSpec with must.Matchers with ScalatestRouteTest with BeforeAndAfterAll:

  val apiConfig: ApiConfig             = ApiConfig.load(ConfigFactory.load())
  val lifecycleConfig: LifecycleConfig = LifecycleConfig.load(ConfigFactory.load())
  val probeConfig: ProbeConfig         = ProbeConfig.load(ConfigFactory.load())
  val roomId: Slug                     = aSlug()

  val testKit: ActorTestKit = ActorTestKit()

  val commandProbe: org.apache.pekko.actor.testkit.typed.scaladsl.TestProbe[RoomManager.Command] =
    testKit.createTestProbe[RoomManager.Command]()

  val validToken: Room.SessionToken = Room.SessionToken.mint()
  val connectionId: String          = UUID.randomUUID().toString

  // Replies so a command case fails on its assertion, not the ask's timeout.
  // Shared across cases: sound only under ScalaTest's default sequential run.
  val commandReply: java.util.concurrent.atomic.AtomicReference[Room.CommandResult] =
    new java.util.concurrent.atomic.AtomicReference(Room.Applied)
  val voteReply: java.util.concurrent.atomic.AtomicReference[Room.VoteResult] =
    new java.util.concurrent.atomic.AtomicReference(Room.Applied)
  val createReply: java.util.concurrent.atomic.AtomicReference[RoomManager.Response] =
    new java.util.concurrent.atomic.AtomicReference(RoomManager.RoomId(roomId))

  val roomManager: ActorRef[RoomManager.Command] =
    testKit.spawn(Behaviors.receiveMessagePartial[RoomManager.Command] {
      case RoomManager.CreateRoom(replyTo) =>
        replyTo ! createReply.get()
        Behaviors.same
      case RoomManager.RequestSession(_, _, existing, replyTo) =>
        replyTo ! Room.SessionMinted(UUID.randomUUID(), existing.getOrElse(validToken))
        Behaviors.same
      case RoomManager.ValidateToken(_, token, replyTo) =>
        if token == validToken then replyTo ! Room.Resolved(UUID.randomUUID(), "Alice")
        else replyTo ! Room.Unresolved
        Behaviors.same
      case other =>
        commandProbe.ref ! other
        other match
          case RoomManager.Vote(_, _, _, replyTo)      => replyTo ! voteReply.get()
          case RoomManager.Show(_, _, replyTo)         => replyTo ! commandReply.get()
          case RoomManager.Clear(_, _, replyTo)        => replyTo ! commandReply.get()
          case RoomManager.Revote(_, _, replyTo)       => replyTo ! commandReply.get()
          case RoomManager.EditIssue(_, _, _, replyTo) => replyTo ! commandReply.get()
          case RoomManager.Depart(_, _, _, replyTo)    => replyTo ! commandReply.get()
          case _                                       => ()
        Behaviors.same
    })
  given typedSystem: ActorSystem[SpawnProtocol.Command] =
    ActorSystem(Behaviors.setup[SpawnProtocol.Command](_ => SpawnProtocol()), "pointing-poker")

  val apiRoute: Route = handleRejections(RejectionHandler.default) {
    API(roomManager, apiConfig, lifecycleConfig, probeConfig).route
  }

  private def json[A: io.circe.Encoder](a: A): HttpEntity.Strict =
    HttpEntity(ContentTypes.`application/json`, a.asJson.noSpaces)

  // PageRoutes logs through slf4j rather than an actor, so its lines are captured off logback.
  private def pageLog[A](body: => A): List[(String, String)] =
    val appender = ListAppender[ILoggingEvent]()
    val logger   = LoggerFactory.getLogger(classOf[PageRoutes]).asInstanceOf[LogbackLogger]
    appender.start()
    logger.addAppender(appender)
    try
      body
      appender.list.asScala.toList.map(e => (e.getLevel.toString, e.getFormattedMessage))
    finally logger.detachAppender(appender)

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
    // A page cached without this can outlive the server that served it, so a deploy pairs a
    // stale page with a new protocol. One conditional request per load is the whole cost.
    "revalidate the index page on every load" in {
      Get() ~> apiRoute ~> check {
        header("Cache-Control").map(_.value) mustBe Some("no-cache")
      }
      Get(s"/${aSlug().raw}") ~> apiRoute ~> check {
        header("Cache-Control").map(_.value) mustBe Some("no-cache")
      }
    }
    "serve the index under a room name" in {
      val index = Source.fromFile("src/main/resources/pages/index.html").mkString
      Get(s"/${aSlug().raw}") ~> apiRoute ~> check {
        status mustBe StatusCodes.OK
        responseAs[String] mustBe index
      }
    }
    // The case is deliberate rather than the typo, so it is corrected rather than refused.
    "redirect a room name in mixed case to its lowercase form, and log it" in {
      pageLog {
        Get("/Brave-Golden-Otter") ~> apiRoute ~> check {
          status mustBe StatusCodes.Found
          header[Location].map(_.uri.toString) mustBe Some("/brave-golden-otter")
        }
      } mustBe List(
        ("DEBUG", "Redirecting a mis-cased room link Brave-Golden-Otter to brave-golden-otter")
      )
    }
    "refuse a name outside the vocabulary with a page suggesting the correction" in
      Get("/brave-golden-oter") ~> apiRoute ~> check {
        status mustBe StatusCodes.NotFound
        contentType mustBe ContentTypes.`text/html(UTF-8)`
        val page = responseAs[String]
        page must include("<code>brave-golden-oter</code> is not a room name.")
        page must include("""Did you mean <a href="/brave-golden-otter">brave-golden-otter</a>?""")
        page must include("""<a href="/">Create a room</a>""")
      }
    "refuse a name near no room name without a suggestion" in
      Get("/nothing-like-this") ~> apiRoute ~> check {
        status mustBe StatusCodes.NotFound
        responseAs[String] must include("is not a room name")
        (responseAs[String] must not).include("Did you mean")
      }
    "escape the refused name before echoing it" in
      Get("/%3Cimg%20src=x%20onerror=alert(1)%3E") ~> apiRoute ~> check {
        status mustBe StatusCodes.NotFound
        val page = responseAs[String]
        page must include("&lt;img src=x onerror=alert(1)&gt;")
        (page must not).include("<img")
      }
    "redirect a legacy UUID link to its derived room, flagged as moved, and log it once" in {
      val uuid = UUID.fromString("123e4567-e89b-12d3-a456-426614174000")
      val slug = LegacySlug.derive(uuid)
      pageLog {
        Get(s"/$uuid") ~> apiRoute ~> check {
          status mustBe StatusCodes.Found
          header[Location].map(_.uri.toString) mustBe Some(s"/${slug.raw}?moved=1")
        }
      } mustBe List(("INFO", s"Redirecting legacy room link $uuid to ${slug.raw}"))
    }
    // Mail clients and wikis have been seen to upper-case a pasted link.
    "derive the same room for a legacy link in upper case" in {
      val uuid = UUID.fromString("123e4567-e89b-12d3-a456-426614174000")
      Get(s"/${uuid.toString.toUpperCase(Locale.ROOT)}") ~> apiRoute ~> check {
        header[Location].map(_.uri.toString) mustBe Some(s"/${LegacySlug.derive(uuid).raw}?moved=1")
      }
    }
    "create a room" in
      // The hazard was the generic circe marshaller hijacking a String completion; what keeps
      // create-room plain now is stringBody on the endpoint, not the absence of an import.
      Post("/create-room") ~> apiRoute ~> check {
        contentType mustBe ContentTypes.`text/plain(UTF-8)`
        responseAs[String] mustBe roomId.raw
      }
    "answer 503 when the manager finds no free room name" in {
      createReply.set(RoomManager.NoFreeRoomName)
      try Post("/create-room") ~> apiRoute ~> check(status mustBe StatusCodes.ServiceUnavailable)
      finally createReply.set(RoomManager.RoomId(roomId))
    }
    "join a room and set a session cookie" in
      Post(s"/rooms/$roomId/join", json(JoinRequest("Alice"))) ~> apiRoute ~> check {
        status mustBe StatusCodes.NoContent

        val cookieHeader = header[`Set-Cookie`].getOrElse(fail("expected a Set-Cookie header"))
        cookieHeader.cookie.name mustBe "session"
        cookieHeader.cookie.httpOnly mustBe true
        cookieHeader.cookie.secure mustBe true
        cookieHeader.cookie.path mustBe Some(s"/rooms/$roomId")
        cookieHeader.cookie.sameSite mustBe Some(SameSite.Strict)
        cookieHeader.cookie.maxAge mustBe None
      }
    "resume the session its cookie already names rather than minting over it" in
      Post(s"/rooms/$roomId/join", json(JoinRequest("Alice"))) ~> addHeader(
        Cookie("session", validToken.raw)
      ) ~> apiRoute ~> check {
        status mustBe StatusCodes.NoContent
        val cookieHeader = header[`Set-Cookie`].getOrElse(fail("expected a Set-Cookie header"))
        cookieHeader.cookie.value mustBe validToken.raw
      }
    "set the same session token on /join that /events later accepts" in {
      val cookieValue =
        Post(s"/rooms/$roomId/join", json(JoinRequest("Alice"))) ~> apiRoute ~> check {
          status.isSuccess() mustBe true
          val cookieHeader = header[`Set-Cookie`].getOrElse(fail("expected a Set-Cookie header"))
          cookieHeader.cookie.value
        }
      cookieValue mustBe validToken.raw

      Get(s"/rooms/$roomId/events?connectionId=$connectionId") ~> addHeader(
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
        // tapir's own decode-failure handling produces this 400, not a pekko rejection.
        response.status mustBe StatusCodes.BadRequest
      }

    "dispatch a vote command" in {
      val token = Room.SessionToken.mint()
      Post(s"/rooms/$roomId/vote", json(VoteRequest("5"))) ~> addHeader(
        Cookie("session", token.raw)
      ) ~> apiRoute ~> check {
        status.isSuccess() mustBe true
      }
      commandProbe.expectMessageType[RoomManager.Vote] match
        case RoomManager.Vote(id, tok, estimation, _) =>
          (id, tok, estimation) mustBe (roomId, Some(token), "5")
    }

    "dispatch a show command" in {
      val token = Room.SessionToken.mint()
      Post(s"/rooms/$roomId/show") ~> addHeader(Cookie("session", token.raw)) ~> apiRoute ~> check {
        status.isSuccess() mustBe true
      }
      commandProbe.expectMessageType[RoomManager.Show] match
        case RoomManager.Show(id, tok, _) => (id, tok) mustBe (roomId, Some(token))
    }

    "dispatch a clear command" in {
      val token = Room.SessionToken.mint()
      Post(s"/rooms/$roomId/clear") ~> addHeader(Cookie("session", token.raw)) ~> apiRoute ~> check {
        status.isSuccess() mustBe true
      }
      commandProbe.expectMessageType[RoomManager.Clear] match
        case RoomManager.Clear(id, tok, _) =>
          (id, tok) mustBe (roomId, Some(token))
    }

    "dispatch a revote command" in {
      val token = Room.SessionToken.mint()
      Post(s"/rooms/$roomId/revote") ~> addHeader(
        Cookie("session", token.raw)
      ) ~> apiRoute ~> check {
        status.isSuccess() mustBe true
      }
      commandProbe.expectMessageType[RoomManager.Revote] match
        case RoomManager.Revote(id, tok, _) =>
          (id, tok) mustBe (roomId, Some(token))
    }

    "dispatch an edit-issue command" in {
      val token = Room.SessionToken.mint()
      Post(
        s"/rooms/$roomId/edit-issue",
        json(EditIssueRequest("new issue"))
      ) ~> addHeader(Cookie("session", token.raw)) ~> apiRoute ~> check {
        status.isSuccess() mustBe true
      }
      commandProbe.expectMessageType[RoomManager.EditIssue] match
        case RoomManager.EditIssue(id, tok, issue, _) =>
          (id, tok, issue) mustBe (roomId, Some(token), "new issue")
    }

    "reject an events connection with no session cookie" in
      Get(s"/rooms/$roomId/events?connectionId=$connectionId") ~> apiRoute ~> check {
        status mustBe StatusCodes.Unauthorized
      }

    "reject an events connection with a malformed session cookie" in
      Get(s"/rooms/$roomId/events?connectionId=$connectionId") ~> addHeader(
        Cookie("session", "not-a-uuid")
      ) ~> apiRoute ~> check {
        status mustBe StatusCodes.Unauthorized
      }

    "reject an events connection with an unresolvable session cookie" in
      Get(s"/rooms/$roomId/events?connectionId=$connectionId") ~> addHeader(
        Cookie("session", Room.SessionToken.mint().raw)
      ) ~> apiRoute ~> check {
        status mustBe StatusCodes.Unauthorized
      }

    "reject an events connection with no connection id" in
      Get(s"/rooms/$roomId/events") ~> addHeader(
        Cookie("session", validToken.raw)
      ) ~> apiRoute ~> check {
        status mustBe StatusCodes.BadRequest
      }

    "open an SSE events stream for a resolved session" in
      Get(s"/rooms/$roomId/events?connectionId=$connectionId") ~> addHeader(
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

    "answer 401 for a vote with no session cookie" in {
      voteReply.set(Room.NoSession)
      try
        Post(s"/rooms/$roomId/vote", json(VoteRequest("5"))) ~> apiRoute ~> check {
          status mustBe StatusCodes.Unauthorized
        }
      finally voteReply.set(Room.Applied)
      // The endpoint still hands the manager the absent token; refusing it is the manager's rule.
      commandProbe.expectMessageType[RoomManager.Vote] match
        case RoomManager.Vote(_, token, _, _) => token mustBe None
    }

    "answer 403 for a vote from a resolved session that is no longer a member" in {
      voteReply.set(Room.NotAMember)
      try
        Post(s"/rooms/$roomId/vote", json(VoteRequest("5"))) ~> addHeader(
          Cookie("session", Room.SessionToken.mint().raw)
        ) ~> apiRoute ~> check {
          status mustBe StatusCodes.Forbidden
        }
      finally voteReply.set(Room.Applied)
      // Drains the dispatched Vote so it cannot leak into a later expectNoMessage.
      commandProbe.expectMessageType[RoomManager.Vote]
    }

    "answer 409 for a vote into a revealed round" in {
      voteReply.set(Room.RoundRevealed)
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

    "answer 400 for a blank estimation without asking the room" in {
      Post(s"/rooms/$roomId/vote", json(VoteRequest("   "))) ~> addHeader(
        Cookie("session", Room.SessionToken.mint().raw)
      ) ~> apiRoute ~> check {
        status mustBe StatusCodes.BadRequest
      }
      // The validator is at the edge, so nothing reaches the room to be refused there.
      commandProbe.expectNoMessage(300.millis)
    }

    "answer 204 for a leave naming a connection" in {
      val token = Room.SessionToken.mint()
      val id    = UUID.randomUUID()
      Post(s"/rooms/$roomId/leave?connectionId=$id") ~> addHeader(
        Cookie("session", token.raw)
      ) ~> apiRoute ~> check {
        status mustBe StatusCodes.NoContent
      }
      commandProbe.expectMessageType[RoomManager.Depart]
    }

    "reject a leave with no connection id" in
      Post(s"/rooms/$roomId/leave") ~> addHeader(
        Cookie("session", Room.SessionToken.mint().raw)
      ) ~> apiRoute ~> check {
        status mustBe StatusCodes.BadRequest
      }

    "answer 401 for a leave with no session cookie" in {
      commandReply.set(Room.NoSession)
      try
        Post(s"/rooms/$roomId/leave?connectionId=${UUID.randomUUID()}") ~> apiRoute ~> check {
          status mustBe StatusCodes.Unauthorized
        }
      finally commandReply.set(Room.Applied)
      commandProbe.expectMessageType[RoomManager.Depart]
    }

    "answer 404 for a command on a name outside the vocabulary, without asking the manager" in {
      Post("/rooms/brave-golden-oter/show") ~> addHeader(
        Cookie("session", validToken.raw)
      ) ~> apiRoute ~> check {
        status mustBe StatusCodes.NotFound
      }
      commandProbe.expectNoMessage(200.millis)
    }
    // The page route lowercases a mixed-case name; the API has no reason to see one.
    "answer 404 for a join on a name in mixed case" in
      Post("/rooms/Brave-Golden-Otter/join", json(JoinRequest("Alice"))) ~> apiRoute ~> check {
        status mustBe StatusCodes.NotFound
      }
    // Only the page route knows UUIDs.
    "answer 404 for an events stream on a legacy UUID" in
      Get(s"/rooms/${UUID.randomUUID()}/events?connectionId=$connectionId") ~> addHeader(
        Cookie("session", validToken.raw)
      ) ~> apiRoute ~> check {
        status mustBe StatusCodes.NotFound
      }
  }
end APISpec
