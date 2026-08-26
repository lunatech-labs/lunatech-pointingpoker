package com.lunatech.pointingpoker

import org.apache.pekko.actor.typed.{ActorRef, ActorSystem, Props, SpawnProtocol}
import org.apache.pekko.actor.typed.scaladsl.Behaviors
import com.lunatech.pointingpoker.config.ApiConfig
import org.apache.pekko.actor.typed.scaladsl.AskPattern.*
import org.apache.pekko.util.Timeout
import com.lunatech.pointingpoker.actors.RoomManager
import org.slf4j.LoggerFactory

import scala.concurrent.{ExecutionContextExecutor, Future}
import scala.concurrent.duration.*
import scala.util.{Failure, Success}

object Main extends App:

  val log = LoggerFactory.getLogger("com.lunatech.pointingpoker.Main")
  given system: ActorSystem[SpawnProtocol.Command] =
    ActorSystem(Behaviors.setup[SpawnProtocol.Command](_ => SpawnProtocol()), "pointing-poker")

  val apiConfig: ApiConfig = ApiConfig.load(system.settings.config)

  log.info(
    "Session cookies: Secure={} (requires HTTPS end-to-end, including through any reverse proxy). " +
      "Set SECURE_COOKIES=false for local plain-HTTP development.",
    apiConfig.secureCookies
  )

  given timeout: Timeout = 3.seconds

  val roomManagerFuture: Future[ActorRef[RoomManager.Command]] = system.ask { ref =>
    SpawnProtocol.Spawn(RoomManager(), "room-manager", Props.empty, ref)
  }
  given ec: ExecutionContextExecutor = system.executionContext

  roomManagerFuture.onComplete {
    case Success(roomManager) =>
      val api = API(roomManager, apiConfig)
      api.run()
    case Failure(exception) =>
      log.error("Error creating room manager {}", exception)
  }
end Main
