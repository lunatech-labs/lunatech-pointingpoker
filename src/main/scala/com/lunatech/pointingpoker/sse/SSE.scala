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
import com.lunatech.pointingpoker.actors.{Room, RoomManager, RoomSnapshot}

object SSE:

  // Source.actorRef tolerates bufferSize + 1 in flight, so a stalled client gets one stale
  // snapshot then the newest; found empirically twice, so do not re-derive it. Never 0: it
  // silently drops without consulting the strategy, leaving the client quiet with no reconnect.
  val bufferSize = 1

  /** Interval between SSE heartbeats. Must stay comfortably below Pekko HTTP's default
    * `pekko.http.server.idle-timeout` (60 seconds), otherwise an idle stream is killed by the
    * server and read as the participant leaving the room. Pekko renders `ServerSentEvent.heartbeat`
    * as an event with an empty `data` payload, which the frontend ignores.
    */
  val heartbeatInterval = 15.seconds

  /** Fallback for `retryMillis` below when unspecified; production wires the real value from
    * `SseConfig` instead - see `Main.scala`.
    */
  val defaultRetryMillis = 2000

  def source(
      roomManager: ActorRef,
      roomId: UUID,
      userId: UUID,
      name: String,
      token: Room.SessionToken,
      retryMillis: Int = defaultRetryMillis
  )(using ec: ExecutionContext): Source[ServerSentEvent, ActorRef] =
    Source
      .actorRef[RoomSnapshot](
        completionMatcher,
        failureMatcher,
        bufferSize,
        OverflowStrategy.dropHead
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
      .map(snapshot => ServerSentEvent(data = snapshot.asJson.noSpaces, retry = Some(retryMillis)))
      .keepAlive(heartbeatInterval, () => ServerSentEvent.heartbeat)

  // No message ever completes the stream from the outside; it ends only via
  // watchTermination (client disconnect, stream failure, etc).
  private val completionMatcher: PartialFunction[Any, CompletionStrategy] = PartialFunction.empty

  private val failureMatcher: PartialFunction[Any, Throwable] = PartialFunction.empty
end SSE
