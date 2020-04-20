package com.lunatech.pointingpoker

import java.net.URLDecoder
import java.nio.charset.StandardCharsets

import akka.actor.{ActorRef, ActorSystem}
import akka.http.scaladsl.Http
import akka.http.scaladsl.model._
import akka.http.scaladsl.server.Directives._
import akka.http.scaladsl.server.directives.ContentTypeResolver.Default
import akka.http.scaladsl.server.Route
import com.lunatech.pointingpoker.websocket.WS
import akka.pattern.ask
import akka.util.Timeout
import com.lunatech.pointingpoker.config.ApiConfig
import org.slf4j.{Logger, LoggerFactory}

import scala.concurrent.Future
import scala.util.{Failure, Success}

class API(roomManager: ActorRef, apiConfig: ApiConfig)(implicit actorSystem: ActorSystem) {

  private implicit val timeout: Timeout = Timeout(apiConfig.timeout)
  private val log: Logger               = LoggerFactory.getLogger(this.getClass)
  import actorSystem.dispatcher

  val route: Route =
    concat(
      pathEndOrSingleSlash {
        get {
          log.debug("Index call")
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
            roomManager
          )
        )
      }
    )

  def run(): Future[Http.ServerBinding] = {
    log.info("Starting API")
    Http().bindAndHandle(route, apiConfig.host, apiConfig.port)
  }
}

object API {
  def apply(roomManager: ActorRef, apiConfig: ApiConfig)(implicit actorSystem: ActorSystem): API =
    new API(roomManager, apiConfig)
}
