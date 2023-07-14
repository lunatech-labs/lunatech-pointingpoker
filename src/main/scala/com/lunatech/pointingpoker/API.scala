package com.lunatech.pointingpoker

import java.net.URLDecoder
import java.nio.charset.StandardCharsets

import org.apache.pekko.actor.typed.{ActorRef, ActorSystem, SpawnProtocol}
import org.apache.pekko.http.scaladsl.Http
import org.apache.pekko.http.scaladsl.model.*
import org.apache.pekko.http.scaladsl.server.Directives.*
import org.apache.pekko.http.scaladsl.server.directives.ContentTypeResolver.Default
import org.apache.pekko.http.scaladsl.server.Route
import org.apache.pekko.actor.typed.scaladsl.AskPattern.*
import org.apache.pekko.actor.typed.scaladsl.adapter.*
import org.apache.pekko.util.Timeout
import com.lunatech.pointingpoker.actors.RoomManager
import com.lunatech.pointingpoker.websocket.WS
import com.lunatech.pointingpoker.config.ApiConfig
import org.slf4j.{Logger, LoggerFactory}

import scala.concurrent.Future
import scala.util.{Failure, Success}

class API(roomManager: ActorRef[RoomManager.Command], apiConfig: ApiConfig)(using
    actorSystem: ActorSystem[SpawnProtocol.Command]
):

  private given timeout: Timeout = Timeout(apiConfig.timeout)
  private val log: Logger        = LoggerFactory.getLogger(this.getClass)

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
          onComplete((roomManager ? RoomManager.CreateRoom.apply).mapTo[RoomManager.RoomId]) {
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

  def run(): Future[Http.ServerBinding] =
    log.info("Starting API on host port {}:{}", apiConfig.host, apiConfig.port)
    Http().newServerAt(apiConfig.host, apiConfig.port).bind(route)
end API

object API:
  def apply(roomManager: ActorRef[RoomManager.Command], apiConfig: ApiConfig)(using
      actorSystem: ActorSystem[SpawnProtocol.Command]
  ): API =
    new API(roomManager, apiConfig)
