package com.lunatech.pointingpoker

import java.util.UUID

import akka.actor.{Actor, ActorRef, ActorSystem, Props}
import akka.http.scaladsl.testkit.ScalatestRouteTest
import com.lunatech.pointingpoker.config.ApiConfig
import com.typesafe.config.ConfigFactory
import akka.http.scaladsl.server._
import org.scalatest.BeforeAndAfterAll
import org.scalatest.matchers.must
import org.scalatest.wordspec.AnyWordSpec

import scala.io.Source

class APISpec
    extends AnyWordSpec
    with must.Matchers
    with ScalatestRouteTest
    with BeforeAndAfterAll {

  implicit val actorSystem: ActorSystem = ActorSystem()
  val apiConfig: ApiConfig              = ApiConfig.load(ConfigFactory.load())
  val roomId: String                    = UUID.randomUUID().toString
  val roomManager: ActorRef = actorSystem.actorOf(Props(new Actor {
    override def receive: Receive = {
      case RoomManager.CreateRoom => sender() ! RoomManager.RoomId(roomId)
    }
  }))

  val apiRoute: Route = API(roomManager, apiConfig).route

  override def afterAll(): Unit = {
    super.afterAll()
    actorSystem.terminate()
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
