package com.lunatech.pointingpoker.sse

import java.util.UUID

import scala.concurrent.ExecutionContext
import scala.concurrent.duration.DurationInt
import scala.util.{Failure, Success}

import io.circe.syntax.*
import org.apache.pekko.actor.ActorRef
import org.apache.pekko.http.scaladsl.model.sse.ServerSentEvent
import org.apache.pekko.stream.scaladsl.Source
import org.apache.pekko.stream.{CompletionStrategy, OverflowStrategy}
import com.lunatech.pointingpoker.actors.{Room, RoomEvent, RoomManager}
import com.lunatech.pointingpoker.actors.RoomEvent.given

object SSE:

  // Source.actorRef tolerates bufferSize + 1 elements in flight before OverflowStrategy
  // engages (one already "current", plus this many queued behind it) - confirmed
  // empirically, since a bufferSize of 0 special-cases to an unconditional silent drop
  // that never consults the strategy at all, rather than "zero tolerance under the
  // strategy" as the name might suggest. 1 covers two ordinary actions landing close
  // together; a rarer larger coincidence (e.g. a mass departure) is left to fall through
  // to OverflowStrategy.fail below and self-heal via reconnect + full resync, which is
  // already the intended path, not a degraded one.
  val bufferSize = 1

  /** Interval between SSE heartbeats. Must stay comfortably below Pekko HTTP's default
    * `pekko.http.server.idle-timeout` (60 seconds), otherwise an idle stream is killed by the
    * server and read as the participant leaving the room. Pekko renders `ServerSentEvent.heartbeat`
    * as an event with an empty `data` payload, which the frontend ignores.
    */
  val heartbeatInterval = 15.seconds

  /** How long a client should wait before reconnecting after this stream ends. Set explicitly
    * rather than left to each browser's own unpinned default, so the room-level grace period before
    * a Leave is announced (see Room.Leave) can be sized against a known value.
    */
  val retryMillis = 2000

  def source(
      roomManager: ActorRef,
      roomId: UUID,
      userId: UUID,
      name: String,
      token: Room.SessionToken
  )(using ec: ExecutionContext): Source[ServerSentEvent, ActorRef] =
    Source
      .actorRef[List[RoomEvent]](
        completionMatcher,
        failureMatcher,
        bufferSize,
        OverflowStrategy.fail
      )
      .mapMaterializedValue { user =>
        roomManager ! RoomManager.ConnectToRoom(roomId, userId, name, token, user)
        user
      }
      .watchTermination() { (user, done) =>
        done.onComplete {
          case Success(_) => roomManager ! RoomManager.ConnectionCompleted(roomId, userId, user)
          case Failure(t) => roomManager ! RoomManager.ConnectionFailure(roomId, userId, user, t)
        }
        user
      }
      .mapConcat(identity)
      .map(event => ServerSentEvent(data = event.asJson.noSpaces, retry = Some(retryMillis)))
      .keepAlive(heartbeatInterval, () => ServerSentEvent.heartbeat)

  // No message ever completes the stream from the outside; it ends only via
  // watchTermination (client disconnect, stream failure, etc).
  private val completionMatcher: PartialFunction[Any, CompletionStrategy] = PartialFunction.empty

  private val failureMatcher: PartialFunction[Any, Throwable] = PartialFunction.empty
end SSE
