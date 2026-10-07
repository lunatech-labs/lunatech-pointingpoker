package com.lunatech.pointingpoker

import org.apache.pekko.actor.typed.{ActorRef, ActorSystem, SpawnProtocol}
import org.apache.pekko.http.scaladsl.Http
import org.apache.pekko.http.scaladsl.server.Directives.concat
import org.apache.pekko.http.scaladsl.server.Route
import org.apache.pekko.http.scaladsl.settings.ServerSettings
import org.apache.pekko.actor.typed.scaladsl.AskPattern.*
import org.apache.pekko.actor.typed.scaladsl.adapter.*
import org.apache.pekko.util.Timeout
import com.lunatech.pointingpoker.actors.Room
import com.lunatech.pointingpoker.actors.RoomManager
import com.lunatech.pointingpoker.sse.SSE
import com.lunatech.pointingpoker.slug.Slug
import com.lunatech.pointingpoker.config.{ApiConfig, LifecycleConfig, ProbeConfig}
import com.lunatech.pointingpoker.probe.ProbeRoutes
import org.slf4j.{Logger, LoggerFactory}
import sttp.model.headers.{Cookie as SttpCookie, CookieValueWithMeta}
import sttp.model.sse.ServerSentEvent as SttpSse
import sttp.tapir.server.pekkohttp.PekkoHttpServerInterpreter

import scala.concurrent.Future
import scala.util.Failure

class API(
    roomManager: ActorRef[RoomManager.Command],
    apiConfig: ApiConfig,
    lifecycleConfig: LifecycleConfig,
    probeConfig: ProbeConfig
)(using actorSystem: ActorSystem[SpawnProtocol.Command]):

  private given timeout: Timeout                      = Timeout(apiConfig.timeout)
  private given ec: scala.concurrent.ExecutionContext = actorSystem.executionContext
  private val log: Logger                             = LoggerFactory.getLogger(this.getClass)

  private def sessionCookie(roomId: Slug, token: Room.SessionToken): CookieValueWithMeta =
    CookieValueWithMeta.unsafeApply(
      value = token.raw,
      path = Some(s"/rooms/$roomId"),
      secure = apiConfig.secureCookies,
      httpOnly = true,
      sameSite = Some(SttpCookie.SameSite.Strict)
    )

  // Applied is the only outcome that is not a refusal, so it is the only Right.
  private def answer(result: Room.CommandResult): Either[Room.Refusal, Unit] = result match
    case Room.Applied          => Right(())
    case refusal: Room.Refusal => Left(refusal)

  private def answerVote(result: Room.VoteResult): Either[Room.Refusal | Room.VoteRefusal, Unit] =
    result match
      case Room.Applied                               => Right(())
      case refusal: (Room.Refusal | Room.VoteRefusal) => Left(refusal)

  private def resolveToken(raw: Option[String]): Option[Room.SessionToken] =
    raw.flatMap(Room.SessionToken.parse)

  private val endpoints = List(
    Endpoints.createRoom.serverLogic[Future] { _ =>
      log.debug("Create room call")
      (roomManager ? RoomManager.CreateRoom.apply)
        .andThen { case Failure(reason) => log.error("Error while creating room: {}", reason) }
        .map {
          case RoomManager.RoomId(slug)   => Right(slug.raw)
          case RoomManager.NoFreeRoomName => Left(())
        }
    },
    Endpoints.join.serverLogicSuccess[Future] { (roomId, rawCookie, request) =>
      roomManager
        .ask[Room.SessionMinted](
          RoomManager.RequestSession(
            roomId,
            request.name,
            request.role,
            resolveToken(rawCookie),
            _
          )
        )
        .andThen { case Failure(reason) =>
          log.error("Error while joining room {}: {}", roomId, reason)
        }
        .map(minted => sessionCookie(roomId, minted.token))
    },
    Endpoints.events.serverLogic[Future] { (roomId, connectionId, rawCookie, forwardedProto) =>
      resolveToken(rawCookie) match
        case None =>
          // Pekko's listener is always plain HTTP; a reverse proxy terminates TLS, so this
          // header is the only signal the client's connection was actually secure.
          val arrivedOverHttps = forwardedProto.exists(_.equalsIgnoreCase("https"))
          if apiConfig.secureCookies && !arrivedOverHttps then
            log.warn(
              "Rejecting session for room {}: SECURE_COOKIES is enabled but the request did not arrive over HTTPS (no X-Forwarded-Proto: https), so the browser will not return the Secure session cookie. Set SECURE_COOKIES=false for local plain-HTTP development, or confirm your reverse proxy sets X-Forwarded-Proto.",
              roomId
            )
          else log.debug("No session cookie provided for room {}", roomId)
          Future.successful(Left(()))
        case Some(token) =>
          roomManager
            .ask[Room.TokenResolution](RoomManager.ValidateToken(roomId, token, _))
            .andThen { case Failure(reason) =>
              log.error("Error while validating session for room {}: {}", roomId, reason)
            }
            .map {
              case Room.Resolved(userId, name) =>
                Right(
                  SSE.source(
                    roomManager.toClassic,
                    roomId,
                    userId,
                    name,
                    token,
                    connectionId,
                    lifecycleConfig.retryMillis
                  )
                )
              case Room.Unresolved =>
                log.debug("Session token did not resolve for room {}", roomId)
                Left(())
            }
    },
    Endpoints.vote.serverLogic[Future] { (roomId, rawCookie, request) =>
      roomManager
        .ask[Room.VoteResult](
          RoomManager.Vote(roomId, resolveToken(rawCookie), request.estimation, _)
        )
        .map(answerVote)
    },
    Endpoints.show.serverLogic[Future] { (roomId, rawCookie) =>
      roomManager
        .ask[Room.CommandResult](RoomManager.Show(roomId, resolveToken(rawCookie), _))
        .map(answer)
    },
    Endpoints.clear.serverLogic[Future] { (roomId, rawCookie) =>
      roomManager
        .ask[Room.CommandResult](RoomManager.Clear(roomId, resolveToken(rawCookie), _))
        .map(answer)
    },
    Endpoints.revote.serverLogic[Future] { (roomId, rawCookie) =>
      roomManager
        .ask[Room.CommandResult](RoomManager.Revote(roomId, resolveToken(rawCookie), _))
        .map(answer)
    },
    Endpoints.editIssue.serverLogic[Future] { (roomId, rawCookie, request) =>
      roomManager
        .ask[Room.CommandResult](
          RoomManager.EditIssue(roomId, resolveToken(rawCookie), request.issue, _)
        )
        .map(answer)
    },
    Endpoints.role.serverLogic[Future] { (roomId, rawCookie, request) =>
      roomManager
        .ask[Room.CommandResult](
          RoomManager.SwitchRole(roomId, resolveToken(rawCookie), request.role, _)
        )
        .map(answer)
    },
    Endpoints.leave.serverLogic[Future] { (roomId, connectionId, rawCookie) =>
      roomManager
        .ask[Room.CommandResult](
          RoomManager.Depart(roomId, resolveToken(rawCookie), connectionId, _)
        )
        .map(answer)
    }
  )

  // Pages last: their slug matcher answers every single-segment GET, so nothing after it is reached.
  val route: Route =
    concat(
      ProbeRoutes(probeConfig).route,
      PekkoHttpServerInterpreter().toRoute(endpoints),
      PageRoutes(apiConfig).route
    )

  def run(): Future[Http.ServerBinding] =
    log.info("Starting API on host port {}:{}", apiConfig.host, apiConfig.port)
    val server = Http().newServerAt(apiConfig.host, apiConfig.port)
    // Probes B, G and H are deliberately silent and outlive Pekko's 60s idle timeout.
    if probeConfig.enabled then
      log.warn("Probe enabled: raising server idle timeout to {}", probeConfig.idleTimeout)
      val settings = ServerSettings(actorSystem)
      server
        .withSettings(
          settings.withTimeouts(settings.timeouts.withIdleTimeout(probeConfig.idleTimeout))
        )
        .bind(route)
    else server.bind(route)
  end run
end API

object API:
  def apply(
      roomManager: ActorRef[RoomManager.Command],
      apiConfig: ApiConfig,
      lifecycleConfig: LifecycleConfig,
      probeConfig: ProbeConfig
  )(using actorSystem: ActorSystem[SpawnProtocol.Command]): API =
    new API(roomManager, apiConfig, lifecycleConfig, probeConfig)
