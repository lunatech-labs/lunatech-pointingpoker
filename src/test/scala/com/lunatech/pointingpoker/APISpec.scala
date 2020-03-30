package com.lunatech.pointingpoker

import java.io.File
import java.util.UUID

import akka.actor.{Actor, ActorRef, ActorSystem, Props}
import akka.http.scaladsl.model.ws.BinaryMessage
import akka.http.scaladsl.testkit.{ScalatestRouteTest, WSProbe}
import com.lunatech.pointingpoker.config.ApiConfig
import com.typesafe.config.ConfigFactory
import org.scalatest.{BeforeAndAfterAll, MustMatchers, WordSpec}
import akka.http.scaladsl.server._
import akka.util.ByteString

import scala.io.Source
import scala.concurrent.duration._

class APISpec extends WordSpec with MustMatchers with ScalatestRouteTest with BeforeAndAfterAll {

  implicit val actorSystem: ActorSystem = ActorSystem()
  val apiConfig: ApiConfig = ApiConfig.load(ConfigFactory.load())
  val roomId: String = UUID.randomUUID().toString
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
    "open websocket" in {
      val wsClient = WSProbe()

      // WS creates a WebSocket request for testing
      WS(s"/websocket/$roomId/John%20Doe", wsClient.flow) ~> apiRoute ~>
        check {
          isWebSocketUpgrade mustBe true

          // TODO send valid messages
        }
    }

  }

}
