package com.lunatech.pointingpoker

import akka.actor.typed.{ActorRef, ActorSystem, Props, SpawnProtocol}
import akka.actor.typed.scaladsl.Behaviors
import com.lunatech.pointingpoker.config.ApiConfig
import akka.actor.typed.scaladsl.AskPattern._
import akka.util.Timeout
import com.lunatech.pointingpoker.actors.RoomManager
import org.slf4j.LoggerFactory

import scala.concurrent.{ExecutionContextExecutor, Future}
import scala.concurrent.duration._
import scala.util.{Failure, Success}

object Main extends App {

  val log = LoggerFactory.getLogger("com.lunatech.pointingpoker.Main")
  implicit val system: ActorSystem[SpawnProtocol.Command] =
    ActorSystem(Behaviors.setup[SpawnProtocol.Command](_ => SpawnProtocol()), "pointing-poker")

  val apiConfig: ApiConfig = ApiConfig.load(system.settings.config)

  implicit val timeout: Timeout = 3.seconds

  val roomManagerFuture: Future[ActorRef[RoomManager.Command]] = system.ask { ref =>
    SpawnProtocol.Spawn(RoomManager(), "room-manager", Props.empty, ref)
  }
  implicit val ec: ExecutionContextExecutor = system.executionContext

  roomManagerFuture.onComplete {
    case Success(roomManager) =>
      val api = API(roomManager, apiConfig)
      api.run()
    case Failure(exception) =>
      log.error("Error creating room manager {}", exception)
  }

}
