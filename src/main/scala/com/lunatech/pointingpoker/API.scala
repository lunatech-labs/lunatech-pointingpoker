package com.lunatech.pointingpoker

import java.net.URLDecoder
import java.nio.charset.StandardCharsets

import akka.actor.typed.{ActorRef, ActorSystem, SpawnProtocol}
import akka.http.scaladsl.Http
import akka.http.scaladsl.model._
import akka.http.scaladsl.server.Directives._
import akka.http.scaladsl.server.directives.ContentTypeResolver.Default
import akka.http.scaladsl.server.Route
import akka.actor.typed.scaladsl.AskPattern._
import akka.actor.typed.scaladsl.adapter._
import akka.util.Timeout
import com.lunatech.pointingpoker.actors.RoomManager
import com.lunatech.pointingpoker.websocket.WS
import com.lunatech.pointingpoker.config.ApiConfig
import org.slf4j.{Logger, LoggerFactory}

import scala.concurrent.Future
import scala.util.{Failure, Success}

class API(roomManager: ActorRef[RoomManager.Command], apiConfig: ApiConfig)(implicit
    actorSystem: ActorSystem[SpawnProtocol.Command]
) {

  private implicit val timeout: Timeout = Timeout(apiConfig.timeout)
  private val log: Logger               = LoggerFactory.getLogger(this.getClass)

  val route: Route =
    concat(
      pathEndOrSingleSlash {
        get {
          log.debug("Index call [{}]", apiConfig.indexPath)
          getFromFile(apiConfig.indexPath)
        }
      },
      path(JavaUUID) { roomId =>
        get {
          log.debug("Index call with room id: {}", roomId)
          getFromFile(apiConfig.indexPath)
        }
      },
      path("create-room") {
        post {
          log.debug("Create room call")
          onComplete((roomManager ? RoomManager.CreateRoom).mapTo[RoomManager.RoomId]) {
            case Success(result) => complete(result.value)
            case Failure(reason) =>
              log.error("Error while creating room: {}", reason)
              complete(StatusCodes.InternalServerError)
          }
        }
      },
      path("websocket" / JavaUUID / Remaining) { (roomId, encodedName) =>
        log.debug("Websocket call: {} {}", roomId, encodedName)
        handleWebSocketMessages(
          WS.handler(
            roomId,
            URLDecoder.decode(encodedName, StandardCharsets.UTF_8.name()),
            roomManager.toClassic
          )
        )
      }
    )

  def run(): Future[Http.ServerBinding] = {
    log.info("Starting API on host port {}:{}", apiConfig.host, apiConfig.port)
    Http().newServerAt(apiConfig.host, apiConfig.port).bind(route)
  }
}

object API {
  def apply(roomManager: ActorRef[RoomManager.Command], apiConfig: ApiConfig)(implicit
      actorSystem: ActorSystem[SpawnProtocol.Command]
  ): API =
    new API(roomManager, apiConfig)
}
