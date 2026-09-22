package com.lunatech.pointingpoker

import java.util.UUID

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
import com.lunatech.pointingpoker.config.{ApiConfig, LifecycleConfig, ProbeConfig}
import com.lunatech.pointingpoker.probe.ProbeRoutes
import org.slf4j.{Logger, LoggerFactory}
import sttp.capabilities.pekko.PekkoStreams
import sttp.model.StatusCode
import sttp.model.headers.{Cookie as SttpCookie, CookieValueWithMeta}
import sttp.model.sse.ServerSentEvent as SttpSse
import sttp.tapir.*
import sttp.tapir.json.circe.*
import sttp.tapir.server.pekkohttp.{PekkoHttpServerInterpreter, PekkoServerSentEvents}
import java.nio.charset.StandardCharsets

import scala.concurrent.Future

class API(
    roomManager: ActorRef[RoomManager.Command],
    apiConfig: ApiConfig,
    lifecycleConfig: LifecycleConfig,
    probeConfig: ProbeConfig
)(using actorSystem: ActorSystem[SpawnProtocol.Command]):

  private given timeout: Timeout                      = Timeout(apiConfig.timeout)
  private given ec: scala.concurrent.ExecutionContext = actorSystem.executionContext
  private val log: Logger                             = LoggerFactory.getLogger(this.getClass)

  private val SessionCookieName = "session"

  private def sessionCookie(roomId: UUID, token: Room.SessionToken): CookieValueWithMeta =
    CookieValueWithMeta.unsafeApply(
      value = token.raw,
      path = Some(s"/rooms/$roomId"),
      secure = apiConfig.secureCookies,
      httpOnly = true,
      sameSite = Some(SttpCookie.SameSite.Strict)
    )

  // EventSource sets no headers, so the stream rides a text body tapir serialises for us.
  private val sseBody =
    streamTextBody(PekkoStreams)(CodecFormat.TextEventStream(), Some(StandardCharsets.UTF_8))
      .map(PekkoServerSentEvents.parseBytesToSSE)(PekkoServerSentEvents.serialiseSSEToBytes)

  private val roomPath = "rooms" / path[UUID]("roomId")

  private val sessionIn = cookie[Option[String]](SessionCookieName)

  private val createRoom = endpoint.post
    .in("create-room")
    .out(stringBody)

  private val join = endpoint.post
    .in(roomPath / "join")
    .in(jsonBody[JoinRequest])
    .out(jsonBody[JoinResponse])
    .out(setCookie(SessionCookieName))

  private given Codec[String, Room.ConnectionId, CodecFormat.TextPlain] =
    Codec.string.mapDecode(raw =>
      Room.ConnectionId
        .parse(raw)
        .map(DecodeResult.Value(_))
        .getOrElse(DecodeResult.Mismatch("a UUID", raw))
    )(_.raw)

  private val events = endpoint.get
    .in(roomPath / "events")
    .in(query[Room.ConnectionId]("connectionId"))
    .in(sessionIn)
    .in(header[Option[String]]("X-Forwarded-Proto"))
    .out(sseBody)
    .out(header("Cache-Control", "no-cache"))
    .out(header("X-Accel-Buffering", "no"))
    .errorOut(statusCode(StatusCode.Unauthorized))

  private def command(segment: String) = endpoint.post
    .in(roomPath / segment)
    .in(sessionIn)
    .out(statusCode(StatusCode.NoContent))

  private val vote      = command("vote").in(jsonBody[VoteRequest])
  private val show      = command("show")
  private val clear     = command("clear")
  private val revote    = command("revote")
  private val editIssue = command("edit-issue").in(jsonBody[EditIssueRequest])

  private def resolveToken(raw: Option[String]): Option[Room.SessionToken] =
    raw.flatMap(Room.SessionToken.parse)

  private val endpoints = List(
    createRoom.serverLogicSuccess[Future](_ =>
      (roomManager ? RoomManager.CreateRoom.apply).mapTo[RoomManager.RoomId].map(_.value)
    ),
    join.serverLogicSuccess[Future] { (roomId, request) =>
      roomManager
        .ask[Room.SessionMinted](RoomManager.RequestSession(roomId, request.name, _))
        .map(minted => (JoinResponse(minted.userId), sessionCookie(roomId, minted.token)))
    },
    events.serverLogic[Future] { (roomId, connectionId, rawCookie, forwardedProto) =>
      resolveToken(rawCookie) match
        case None =>
          // Pekko's listener is always plain HTTP; a reverse proxy terminates TLS, so this
          // header is the only signal the client's connection was actually secure.
          val arrivedOverHttps = forwardedProto.exists(_.equalsIgnoreCase("https"))
          if apiConfig.secureCookies && !arrivedOverHttps then
            log.warn(
              "Rejecting session for room {}: SECURE_COOKIES is enabled but the request did not arrive over HTTPS (no X-Forwarded-Proto: https), so the browser will not return the Secure session cookie. Set SECURE_COOKIES=false for non-HTTPS deployments, or confirm your reverse proxy sets X-Forwarded-Proto.",
              roomId
            )
          else log.debug("No session cookie provided for room {}", roomId)
          Future.successful(Left(()))
        case Some(token) =>
          roomManager
            .ask[Room.TokenResolution](RoomManager.ValidateToken(roomId, token, _))
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
              case Room.Unresolved => Left(())
            }
    },
    vote.serverLogicSuccess[Future] { (roomId, rawCookie, request) =>
      roomManager ! RoomManager.Vote(roomId, resolveToken(rawCookie), request.estimation)
      Future.successful(())
    },
    show.serverLogicSuccess[Future] { (roomId, rawCookie) =>
      roomManager ! RoomManager.Show(roomId, resolveToken(rawCookie))
      Future.successful(())
    },
    clear.serverLogicSuccess[Future] { (roomId, rawCookie) =>
      roomManager ! RoomManager.Clear(roomId, resolveToken(rawCookie))
      Future.successful(())
    },
    revote.serverLogicSuccess[Future] { (roomId, rawCookie) =>
      roomManager ! RoomManager.Revote(roomId, resolveToken(rawCookie))
      Future.successful(())
    },
    editIssue.serverLogicSuccess[Future] { (roomId, rawCookie, request) =>
      roomManager ! RoomManager.EditIssue(roomId, resolveToken(rawCookie), request.issue)
      Future.successful(())
    }
  )

  val route: Route =
    concat(
      ProbeRoutes(probeConfig).route,
      PageRoutes(apiConfig).route,
      PekkoHttpServerInterpreter().toRoute(endpoints)
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
