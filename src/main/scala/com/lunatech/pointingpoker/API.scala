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
import org.apache.pekko.http.scaladsl.model.headers.HttpCookie
import org.apache.pekko.http.scaladsl.model.headers.HttpCookiePair
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

  private val SessionCookieName = "session"

  private def sessionCookie(roomId: UUID, token: Room.SessionToken): HttpCookie =
    HttpCookie(
      name = SessionCookieName,
      value = token.raw,
      path = Some(s"/rooms/$roomId"),
      httpOnly = true,
      secure = apiConfig.secureCookies,
      extension = Some("SameSite=Strict")
    )

  // A missing or malformed cookie resolves to a freshly-minted, unmatchable token rather than
  // an Option threaded through every command. Room already no-ops on any token that doesn't
  // resolve to a member, so this reuses that path instead of adding a second "no credential" case.
  private def resolveToken(maybeCookie: Option[HttpCookiePair]): Room.SessionToken =
    maybeCookie.flatMap(c => Room.SessionToken.parse(c.value)).getOrElse(Room.SessionToken.mint())

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
      path("rooms" / JavaUUID / "join") { roomId =>
        post {
          // Scoped locally so the generic circe marshaller cannot hijack routes that
          // complete with a plain String (e.g. create-room, which stays text/plain).
          import com.lunatech.pointingpoker.CirceSupport.given
          entity(as[JoinRequest]) { req =>
            onComplete(
              roomManager.ask[Room.SessionMinted](RoomManager.RequestSession(roomId, req.name, _))
            ) {
              case Success(minted) =>
                setCookie(sessionCookie(roomId, minted.token)) {
                  complete(JoinResponse(minted.userId))
                }
              case Failure(reason) =>
                log.error("Error while joining room {}: {}", roomId, reason)
                complete(StatusCodes.InternalServerError)
            }
          }
        }
      },
      path("rooms" / JavaUUID / "events") { roomId =>
        get {
          optionalCookie(SessionCookieName) { maybeCookie =>
            maybeCookie.flatMap(c => Room.SessionToken.parse(c.value)) match
              case None =>
                complete(StatusCodes.Unauthorized)
              case Some(token) =>
                onComplete(
                  roomManager.ask[Room.TokenResolution](RoomManager.ValidateToken(roomId, token, _))
                ) {
                  case Success(Room.Resolved(userId, name)) =>
                    complete(SSE.source(roomManager.toClassic, roomId, userId, name, token))
                  case Success(Room.Unresolved) =>
                    complete(StatusCodes.Unauthorized)
                  case Failure(reason) =>
                    log.error("Error while validating session for room {}: {}", roomId, reason)
                    complete(StatusCodes.InternalServerError)
                }
          }
        }
      },
      pathPrefix("rooms" / JavaUUID) { roomId =>
        concat(
          path("vote") {
            post {
              import com.lunatech.pointingpoker.CirceSupport.given
              optionalCookie(SessionCookieName) { maybeCookie =>
                entity(as[VoteRequest]) { req =>
                  roomManager ! RoomManager.Vote(roomId, resolveToken(maybeCookie), req.estimation)
                  complete(StatusCodes.NoContent)
                }
              }
            }
          },
          path("show") {
            post {
              optionalCookie(SessionCookieName) { maybeCookie =>
                roomManager ! RoomManager.Show(roomId, resolveToken(maybeCookie))
                complete(StatusCodes.NoContent)
              }
            }
          },
          path("clear") {
            post {
              optionalCookie(SessionCookieName) { maybeCookie =>
                roomManager ! RoomManager.Clear(roomId, resolveToken(maybeCookie))
                complete(StatusCodes.NoContent)
              }
            }
          },
          path("revote") {
            post {
              optionalCookie(SessionCookieName) { maybeCookie =>
                roomManager ! RoomManager.Revote(roomId, resolveToken(maybeCookie))
                complete(StatusCodes.NoContent)
              }
            }
          },
          path("edit-issue") {
            post {
              import com.lunatech.pointingpoker.CirceSupport.given
              optionalCookie(SessionCookieName) { maybeCookie =>
                entity(as[EditIssueRequest]) { req =>
                  roomManager ! RoomManager.EditIssue(roomId, resolveToken(maybeCookie), req.issue)
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
