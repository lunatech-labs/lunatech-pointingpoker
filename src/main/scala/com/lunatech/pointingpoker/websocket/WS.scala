package com.lunatech.pointingpoker.websocket

import java.util.UUID

import org.apache.pekko.NotUsed
import org.apache.pekko.actor.ActorRef
import org.apache.pekko.http.scaladsl.model.ws.{Message, TextMessage}
import org.apache.pekko.stream.scaladsl.{Flow, Sink, Source}
import org.apache.pekko.stream.{CompletionStrategy, OverflowStrategy}
import com.lunatech.pointingpoker.actors.RoomManager
import com.lunatech.pointingpoker.websocket.WSMessage.MessageType
import play.api.libs.json.Json

object WS {

  val disabledBufferSize = 0

  def handler(roomId: UUID, name: String, roomManager: ActorRef): Flow[Message, Message, Any] = {
    val userId = UUID.randomUUID()
    Flow.fromSinkAndSource[Message, Message](
      sink(roomManager, roomId, userId),
      source(roomManager, roomId, userId, name)
    )
  }

  private def sink(roomManager: ActorRef, roomId: UUID, userId: UUID): Sink[Message, NotUsed] =
    Sink
      .actorRef(
        roomManager,
        RoomManager.WSCompleted(roomId, userId),
        failure => RoomManager.WSFailure(failure)
      )
      .contramap {
        case TextMessage.Strict(body) => RoomManager.IncomeWSMessage(Json.parse(body).as[WSMessage])
        case _                        => RoomManager.UnsupportedWSMessage
      }

  private def source(
      roomManager: ActorRef,
      roomId: UUID,
      userId: UUID,
      name: String
  ): Source[Message, ActorRef] =
    Source
      .actorRef[WSMessage](
        completionMatcher,
        failureMatcher,
        disabledBufferSize,
        OverflowStrategy.dropTail
      )
      .mapMaterializedValue { user =>
        roomManager ! RoomManager.ConnectToRoom(
          WSMessage(MessageType.Join, roomId, userId, name),
          user
        )
        user
      }
      .map(message => TextMessage(Json.toJson(message).toString()))

  private val completionMatcher: PartialFunction[Any, CompletionStrategy] = {
    case RoomManager.CompleteWS => CompletionStrategy.immediately
  }

  private val failureMatcher: PartialFunction[Any, Throwable] = PartialFunction.empty

}
