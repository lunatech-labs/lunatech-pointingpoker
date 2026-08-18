package com.lunatech.pointingpoker.sse

import java.util.UUID

import scala.concurrent.ExecutionContext
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
          case Success(_) => roomManager ! RoomManager.ConnectionCompleted(roomId, userId)
          case Failure(t) => roomManager ! RoomManager.ConnectionFailure(t)
        }
        user
      }
      .map(event => ServerSentEvent(event.asJson.noSpaces))

  private val completionMatcher: PartialFunction[Any, CompletionStrategy] = {
    case RoomManager.CompleteStream => CompletionStrategy.immediately
  }

  private val failureMatcher: PartialFunction[Any, Throwable] = PartialFunction.empty
end SSE
