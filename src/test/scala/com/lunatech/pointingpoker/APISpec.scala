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
import io.circe.parser.decode
import io.circe.syntax.*
import org.apache.pekko.http.scaladsl.model.{ContentTypes, HttpEntity, StatusCodes}
import org.apache.pekko.http.scaladsl.server.{ExceptionHandler, RejectionHandler}

import scala.io.Source

class APISpec extends AnyWordSpec with must.Matchers with ScalatestRouteTest with BeforeAndAfterAll:

  val apiConfig: ApiConfig = ApiConfig.load(ConfigFactory.load())
  val roomId: String       = UUID.randomUUID().toString

  val testKit: ActorTestKit                      = ActorTestKit()
  val roomManager: ActorRef[RoomManager.Command] =
    testKit.spawn(Behaviors.receiveMessagePartial[RoomManager.Command] {
      case RoomManager.CreateRoom(replyTo) =>
        replyTo ! RoomManager.RoomId(roomId)
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
    "create a room" in {
      import com.lunatech.pointingpoker.CirceSupport.given
      Post("/create-room") ~> apiRoute ~> check {
        val responseBody = responseAs[String]
        responseBody mustBe roomId
      }
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

  }
end APISpec
