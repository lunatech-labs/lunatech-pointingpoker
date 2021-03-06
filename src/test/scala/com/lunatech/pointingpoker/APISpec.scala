package com.lunatech.pointingpoker

import java.util.UUID

import akka.actor.testkit.typed.scaladsl.ActorTestKit
import akka.actor.typed.scaladsl.Behaviors
import akka.actor.typed.{ActorRef, ActorSystem, SpawnProtocol}
import akka.http.scaladsl.testkit.ScalatestRouteTest
import com.lunatech.pointingpoker.config.ApiConfig
import com.typesafe.config.ConfigFactory
import akka.http.scaladsl.server._
import com.lunatech.pointingpoker.actors.RoomManager
import org.scalatest.BeforeAndAfterAll
import org.scalatest.matchers.must
import org.scalatest.wordspec.AnyWordSpec

import scala.io.Source

class APISpec
    extends AnyWordSpec
    with must.Matchers
    with ScalatestRouteTest
    with BeforeAndAfterAll {

  val apiConfig: ApiConfig = ApiConfig.load(ConfigFactory.load())
  val roomId: String       = UUID.randomUUID().toString

  val testKit: ActorTestKit = ActorTestKit()
  val roomManager: ActorRef[RoomManager.Command] =
    testKit.spawn(Behaviors.receiveMessagePartial[RoomManager.Command] {
      case RoomManager.CreateRoom(replyTo) =>
        replyTo ! RoomManager.RoomId(roomId)
        Behaviors.same
    })
  implicit val typedSystem: ActorSystem[SpawnProtocol.Command] =
    ActorSystem(Behaviors.setup[SpawnProtocol.Command](_ => SpawnProtocol()), "pointing-poker")

  val apiRoute: Route = API(roomManager, apiConfig).route

  override def afterAll(): Unit = {
    super.afterAll()
    testKit.shutdownTestKit()
    typedSystem.terminate()
  }

  "API" should {
    "return index.html" in {
      val index = Source.fromFile("src/main/resources/pages/index.html").mkString

      Get() ~> apiRoute ~> check {
        responseAs[String] mustBe index
      }
    }
    "create a room" in {
      Post("/create-room") ~> apiRoute ~> check {
        responseAs[String] mustBe roomId
      }
    }

  }

}
