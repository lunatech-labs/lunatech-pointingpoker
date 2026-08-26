package com.lunatech.pointingpoker

import java.util.UUID

import org.apache.pekko.actor.testkit.typed.scaladsl.ActorTestKit
import org.apache.pekko.actor.typed.scaladsl.Behaviors
import org.apache.pekko.actor.typed.{ActorRef, ActorSystem, SpawnProtocol}
import org.apache.pekko.http.scaladsl.testkit.ScalatestRouteTest
import com.lunatech.pointingpoker.config.ApiConfig
import com.typesafe.config.ConfigFactory
import org.apache.pekko.http.scaladsl.server.*
import org.apache.pekko.http.scaladsl.server.Directives.handleRejections
import com.lunatech.pointingpoker.actors.RoomManager
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

  val apiConfig: ApiConfig = ApiConfig.load(ConfigFactory.load())
  val roomId: String       = UUID.randomUUID().toString

  val testKit: ActorTestKit = ActorTestKit()

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
  given typedSystem: ActorSystem[SpawnProtocol.Command] =
    ActorSystem(Behaviors.setup[SpawnProtocol.Command](_ => SpawnProtocol()), "pointing-poker")

  val apiRoute: Route = handleRejections(RejectionHandler.default) {
    API(roomManager, apiConfig).route
  }

  override def afterAll(): Unit =
    super.afterAll()
    testKit.shutdownTestKit()
    typedSystem.terminate()

  "API" should {
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
    "join a room and return a minted userId" in {
      import com.lunatech.pointingpoker.CirceSupport.given
      Post(s"/rooms/$roomId/join", JoinRequest("Alice")) ~> apiRoute ~> check {
        status.isSuccess() mustBe true
        val response = responseAs[JoinResponse]
        response.userId.toString.length > 0 mustBe true
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
      import com.lunatech.pointingpoker.CirceSupport.given
      val userId = UUID.randomUUID()
      Post(
        s"/rooms/$roomId/edit-issue?userId=$userId",
        EditIssueRequest("new issue")
      ) ~> apiRoute ~> check {
        status.isSuccess() mustBe true
      }
      commandProbe.expectMessage(
        RoomManager.EditIssue(UUID.fromString(roomId), userId, "new issue")
      )
    }

    "open an SSE events stream" in {
      val userId = UUID.randomUUID()
      Get(s"/rooms/$roomId/events?userId=$userId&name=Alice") ~> apiRoute ~> check {
        status.isSuccess() mustBe true
        mediaType.toString mustBe "text/event-stream"
      }
    }

    "reject a malformed vote body with 400" in {
      val userId        = UUID.randomUUID()
      val malformedBody =
        HttpEntity(ContentTypes.`application/json`, """{"not-estimation": 5}""")
      Post(s"/rooms/$roomId/vote?userId=$userId", malformedBody) ~> apiRoute ~> check {
        status mustBe StatusCodes.BadRequest
      }
    }

    "reject a non-UUID userId query param with 400" in
      Post(s"/rooms/$roomId/show?userId=not-a-uuid") ~> apiRoute ~> check {
        status mustBe StatusCodes.BadRequest
      }

    "reject a non-UUID userId query param on the events stream with 400" in
      Get(s"/rooms/$roomId/events?userId=not-a-uuid&name=Alice") ~> apiRoute ~> check {
        status mustBe StatusCodes.BadRequest
      }
  }
end APISpec
