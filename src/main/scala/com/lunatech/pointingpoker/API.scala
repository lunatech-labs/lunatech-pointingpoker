package com.lunatech.pointingpoker

import java.util.UUID

import org.apache.pekko.actor.typed.{ActorRef, ActorSystem, SpawnProtocol}
import org.apache.pekko.http.scaladsl.Http
import org.apache.pekko.http.scaladsl.marshalling.sse.EventStreamMarshalling
import org.apache.pekko.http.scaladsl.model.*
import org.apache.pekko.http.scaladsl.server.Directives.*
import org.apache.pekko.http.scaladsl.server.directives.ContentTypeResolver.Default
import org.apache.pekko.http.scaladsl.server.Route
import org.apache.pekko.actor.typed.scaladsl.AskPattern.*
import org.apache.pekko.actor.typed.scaladsl.adapter.*
import org.apache.pekko.http.scaladsl.unmarshalling.Unmarshaller
import org.apache.pekko.util.Timeout
import com.lunatech.pointingpoker.actors.Room
import com.lunatech.pointingpoker.actors.RoomManager
import com.lunatech.pointingpoker.sse.SSE
import com.lunatech.pointingpoker.config.ApiConfig
import org.slf4j.{Logger, LoggerFactory}

import scala.concurrent.Future
import scala.util.{Failure, Success}

class API(roomManager: ActorRef[RoomManager.Command], apiConfig: ApiConfig)(using
    actorSystem: ActorSystem[SpawnProtocol.Command]
) extends EventStreamMarshalling:

  private given timeout: Timeout                      = Timeout(apiConfig.timeout)
  private given ec: scala.concurrent.ExecutionContext = actorSystem.executionContext
  private val log: Logger                             = LoggerFactory.getLogger(this.getClass)

  // Rejects malformed UUIDs as a 400 MalformedQueryParamRejection instead of letting
  // UUID.fromString's IllegalArgumentException escape uncaught as a 500.
  private given Unmarshaller[String, UUID] = Unmarshaller.strict(UUID.fromString)

  // Temporary bridge until Task 11 replaces the query-param userId with a real
  // cookie-based token. UUID.toString always round-trips through
  // SessionToken.parse successfully, so getOrElse's fallback is unreachable
  // in practice — it's there only so this stays total.
  private def tokenFromLegacyUserId(userId: UUID): Room.SessionToken =
    Room.SessionToken.parse(userId.toString).getOrElse(Room.SessionToken.mint())

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
      path("rooms" / JavaUUID / "join") { _ =>
        post {
          // Scoped locally so the generic circe marshaller cannot hijack routes that
          // complete with a plain String (e.g. create-room, which stays text/plain).
          import com.lunatech.pointingpoker.CirceSupport.given
          entity(as[JoinRequest]) { _ =>
            complete(JoinResponse(UUID.randomUUID()))
          }
        }
      },
      path("rooms" / JavaUUID / "events") { roomId =>
        get {
          parameters("userId".as[UUID], "name") { (userId, name) =>
            complete(SSE.source(roomManager.toClassic, roomId, userId, name, tokenFromLegacyUserId(userId)))
          }
        }
      },
      pathPrefix("rooms" / JavaUUID) { roomId =>
        concat(
          path("vote") {
            post {
              import com.lunatech.pointingpoker.CirceSupport.given
              parameter("userId".as[UUID]) { userId =>
                entity(as[VoteRequest]) { req =>
                  roomManager ! RoomManager.Vote(roomId, tokenFromLegacyUserId(userId), req.estimation)
                  complete(StatusCodes.NoContent)
                }
              }
            }
          },
          path("show") {
            post {
              parameter("userId".as[UUID]) { userId =>
                roomManager ! RoomManager.Show(roomId, tokenFromLegacyUserId(userId))
                complete(StatusCodes.NoContent)
              }
            }
          },
          path("clear") {
            post {
              parameter("userId".as[UUID]) { userId =>
                roomManager ! RoomManager.Clear(roomId, tokenFromLegacyUserId(userId))
                complete(StatusCodes.NoContent)
              }
            }
          },
          path("revote") {
            post {
              parameter("userId".as[UUID]) { userId =>
                roomManager ! RoomManager.Revote(roomId, tokenFromLegacyUserId(userId))
                complete(StatusCodes.NoContent)
              }
            }
          },
          path("edit-issue") {
            post {
              import com.lunatech.pointingpoker.CirceSupport.given
              parameter("userId".as[UUID]) { userId =>
                entity(as[EditIssueRequest]) { req =>
                  roomManager ! RoomManager.EditIssue(roomId, tokenFromLegacyUserId(userId), req.issue)
                  complete(StatusCodes.NoContent)
                }
              }
            }
          }
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
