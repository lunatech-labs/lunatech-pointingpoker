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
import org.apache.pekko.http.scaladsl.model.headers.HttpCookie
import org.apache.pekko.http.scaladsl.model.headers.HttpCookiePair
import org.apache.pekko.http.scaladsl.model.headers.SameSite
import org.apache.pekko.util.Timeout
import com.lunatech.pointingpoker.actors.Room
import com.lunatech.pointingpoker.actors.RoomManager
import com.lunatech.pointingpoker.sse.SSE
import com.lunatech.pointingpoker.config.{ApiConfig, ProbeConfig, SseConfig}
import com.lunatech.pointingpoker.probe.ProbeRoutes
import org.slf4j.{Logger, LoggerFactory}

import scala.concurrent.Future
import scala.util.{Failure, Success}

class API(
    roomManager: ActorRef[RoomManager.Command],
    apiConfig: ApiConfig,
    sseConfig: SseConfig,
    probeConfig: ProbeConfig
)(using actorSystem: ActorSystem[SpawnProtocol.Command])
    extends EventStreamMarshalling:

  private given timeout: Timeout                      = Timeout(apiConfig.timeout)
  private given ec: scala.concurrent.ExecutionContext = actorSystem.executionContext
  private val log: Logger                             = LoggerFactory.getLogger(this.getClass)

  private val SessionCookieName = "session"

  private def sessionCookie(roomId: UUID, token: Room.SessionToken): HttpCookie =
    HttpCookie(
      name = SessionCookieName,
      value = token.raw,
      path = Some(s"/rooms/$roomId"),
      httpOnly = true,
      secure = apiConfig.secureCookies
    ).withSameSite(SameSite.Strict)

  // None (missing cookie, or a value that doesn't parse as a SessionToken) means RoomManager
  // never asks Room at all; Some(token) that doesn't resolve to a member is Room's own no-op case.
  private def resolveToken(maybeCookie: Option[HttpCookiePair]): Option[Room.SessionToken] =
    maybeCookie.flatMap(c => Room.SessionToken.parse(c.value))

  val route: Route =
    concat(
      ProbeRoutes(probeConfig).route,
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
                optionalHeaderValueByName("X-Forwarded-Proto") { forwardedProto =>
                  // Pekko's own listener is always plain HTTP here (see Main's startup log) - TLS,
                  // if any, is terminated by a reverse proxy in front, so X-Forwarded-Proto is the
                  // only signal for whether the client's connection was actually secure.
                  val arrivedOverHttps = forwardedProto.exists(_.equalsIgnoreCase("https"))
                  if apiConfig.secureCookies && !arrivedOverHttps then
                    log.warn(
                      "Rejecting session for room {}: SECURE_COOKIES is enabled but the request did not arrive over HTTPS (no X-Forwarded-Proto: https), so the browser will not return the Secure session cookie. Set SECURE_COOKIES=false for non-HTTPS deployments, or confirm your reverse proxy sets X-Forwarded-Proto.",
                      roomId
                    )
                  else log.debug("No session cookie provided for room {}", roomId)
                  complete(StatusCodes.Unauthorized)
                }
              case Some(token) =>
                onComplete(
                  roomManager.ask[Room.TokenResolution](RoomManager.ValidateToken(roomId, token, _))
                ) {
                  case Success(Room.Resolved(userId, name)) =>
                    complete(
                      SSE.source(
                        roomManager.toClassic,
                        roomId,
                        userId,
                        name,
                        token,
                        sseConfig.retryMillis
                      )
                    )
                  case Success(Room.Unresolved) =>
                    log.debug("Session token did not resolve for room {}", roomId)
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
  def apply(
      roomManager: ActorRef[RoomManager.Command],
      apiConfig: ApiConfig,
      sseConfig: SseConfig,
      probeConfig: ProbeConfig
  )(using actorSystem: ActorSystem[SpawnProtocol.Command]): API =
    new API(roomManager, apiConfig, sseConfig, probeConfig)
