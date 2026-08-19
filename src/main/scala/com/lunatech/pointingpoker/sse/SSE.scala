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
import com.lunatech.pointingpoker.actors.{RoomEvent, RoomManager}
import com.lunatech.pointingpoker.actors.RoomEvent.MessageType
import com.lunatech.pointingpoker.actors.RoomEvent.given

object SSE:

  val disabledBufferSize = 0

  /** Interval between SSE heartbeats. Must stay comfortably below Pekko HTTP's default
    * `pekko.http.server.idle-timeout` (60 seconds), otherwise an idle stream is killed by the
    * server and read as the participant leaving the room. Pekko renders `ServerSentEvent.heartbeat`
    * as an event with an empty `data` payload, which the frontend ignores.
    */
  val heartbeatInterval = 15.seconds

  def source(roomManager: ActorRef, roomId: UUID, userId: UUID, name: String)(using
      ec: ExecutionContext
  ): Source[ServerSentEvent, ActorRef] =
    Source
      .actorRef[RoomEvent](
        completionMatcher,
        failureMatcher,
        disabledBufferSize,
        OverflowStrategy.dropTail
      )
      .mapMaterializedValue { user =>
        roomManager ! RoomManager.ConnectToRoom(
          RoomEvent(MessageType.Join, roomId, userId, name),
          user
        )
        user
      }
      .watchTermination() { (user, done) =>
        done.onComplete {
          case Success(_) => roomManager ! RoomManager.ConnectionCompleted(roomId, userId, user)
          case Failure(t) => roomManager ! RoomManager.ConnectionFailure(roomId, userId, user, t)
        }
        user
      }
      .map(event => ServerSentEvent(event.asJson.noSpaces))
      .keepAlive(heartbeatInterval, () => ServerSentEvent.heartbeat)

  // No message ever completes the stream from the outside; it ends only via
  // watchTermination (client disconnect, stream failure, etc).
  private val completionMatcher: PartialFunction[Any, CompletionStrategy] = PartialFunction.empty

  private val failureMatcher: PartialFunction[Any, Throwable] = PartialFunction.empty
end SSE
