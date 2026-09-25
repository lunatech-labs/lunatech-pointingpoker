package com.lunatech.pointingpoker

import com.lunatech.pointingpoker.actors.Room
import com.lunatech.pointingpoker.slug.Slug
import sttp.capabilities.pekko.PekkoStreams
import sttp.model.StatusCode
import sttp.tapir.*
import sttp.tapir.json.circe.*
import sttp.tapir.server.pekkohttp.PekkoServerSentEvents
import java.nio.charset.StandardCharsets

// Descriptions only, so the OpenAPI document can be generated without an actor system.
object Endpoints:

  val SessionCookieName = "session"

  // EventSource sets no headers, so the stream rides a text body tapir serialises for us.
  private val sseBody =
    streamTextBody(PekkoStreams)(CodecFormat.TextEventStream(), Some(StandardCharsets.UTF_8))
      .map(PekkoServerSentEvents.parseBytesToSSE)(PekkoServerSentEvents.serialiseSSEToBytes)

  // Mismatch, not Error: tapir answers an error with 400 but tries the next endpoint on a mismatch.
  private given Codec[String, Slug, CodecFormat.TextPlain] =
    Codec.string.mapDecode(raw =>
      Slug
        .parse(raw)
        .map(DecodeResult.Value(_))
        .getOrElse(DecodeResult.Mismatch("a room name", raw))
    )(_.raw)

  private val roomPath = "rooms" / path[Slug]("roomId")

  private val sessionIn = cookie[Option[String]](SessionCookieName)

  val createRoom = endpoint.post
    .in("create-room")
    .out(stringBody)
    .errorOut(statusCode(StatusCode.ServiceUnavailable))

  val join = endpoint.post
    .in(roomPath / "join")
    .in(sessionIn)
    .in(jsonBody[JoinRequest])
    .out(statusCode(StatusCode.NoContent))
    .out(setCookie(SessionCookieName))

  private given Codec[String, Room.ConnectionId, CodecFormat.TextPlain] =
    Codec.string.mapDecode(raw =>
      Room.ConnectionId
        .parse(raw)
        .map(DecodeResult.Value(_))
        .getOrElse(DecodeResult.Mismatch("a UUID", raw))
    )(_.raw)

  val events = endpoint.get
    .in(roomPath / "events")
    .in(query[Room.ConnectionId]("connectionId"))
    .in(sessionIn)
    .in(header[Option[String]]("X-Forwarded-Proto"))
    .out(sseBody)
    .out(header("Cache-Control", "no-cache"))
    // Proxies that buffer a response body turn SSE into batches or silence;
    // X-Accel-Buffering is nginx's opt-out and README records the rest.
    .out(header("X-Accel-Buffering", "no"))
    .errorOut(statusCode(StatusCode.Unauthorized))

  // Exhaustive, and the build makes a missed case fatal: every refusal has exactly one status.
  private def status(refusal: Room.Refusal | Room.VoteRefusal): StatusCode = refusal match
    case Room.NoSession       => StatusCode.Unauthorized
    case Room.NotAMember      => StatusCode.Forbidden
    case Room.RoundRevealed   => StatusCode.Conflict
    case Room.BlankEstimation => StatusCode.BadRequest

  // Built from the enums' values, so a new refusal cannot be left without a variant.
  private def errors[R <: Room.Refusal | Room.VoteRefusal](refusals: Seq[R]) =
    val variants = refusals.map(r => oneOfVariantSingletonMatcher(status(r))(r))
    oneOf[R](variants.head, variants.tail*)

  private val commandErrors = errors(Room.Refusal.values.toSeq)
  private val voteErrors    = errors(Room.Refusal.values.toSeq ++ Room.VoteRefusal.values)

  private def command(segment: String) = endpoint.post
    .in(roomPath / segment)
    .in(sessionIn)
    .out(statusCode(StatusCode.NoContent))
    .errorOut(commandErrors)

  val vote = endpoint.post
    .in(roomPath / "vote")
    .in(sessionIn)
    .in(jsonBody[VoteRequest])
    .out(statusCode(StatusCode.NoContent))
    .errorOut(voteErrors)

  val show      = command("show")
  val clear     = command("clear")
  val revote    = command("revote")
  val editIssue = command("edit-issue").in(jsonBody[EditIssueRequest])

  val leave = endpoint.post
    .in(roomPath / "leave")
    .in(query[Room.ConnectionId]("connectionId"))
    .in(sessionIn)
    .out(statusCode(StatusCode.NoContent))
    .errorOut(commandErrors)

  val all: List[AnyEndpoint] =
    List(createRoom, join, events, vote, show, clear, revote, editIssue, leave)
end Endpoints
