package com.lunatech.pointingpoker

import java.util.UUID

import akka.actor.{Actor, ActorLogging, ActorRef, Props, Terminated}
import com.lunatech.pointingpoker.websocket.WSMessage
import com.lunatech.pointingpoker.websocket.WSMessage.MessageType

class RoomManager extends Actor with ActorLogging {

  import RoomManager._

  val InitialVoteState = false
  val InitialEstimation = ""

  var rooms: Map[UUID, ActorRef] = Map.empty

  override def receive: Receive = {
    case CreateRoom =>
      val roomId = UUID.randomUUID()
      val roomActor = context.watch(createRoom(roomId))
      rooms = rooms + (roomId -> roomActor)
      sender() ! RoomId(roomId.toString)
    case ConnectToRoom(message, user) =>
      rooms.get(message.roomId).fold {
        val roomActor = context.watch(createRoom(message.roomId))
        rooms = rooms + (message.roomId -> roomActor)
        roomActor ! Room.Join(Room.User(message.userId, message.extra, InitialVoteState, InitialEstimation, user))
      }{ room =>
        room ! Room.Join(Room.User(message.userId, message.extra, InitialVoteState, InitialEstimation, user))
      }
    case IncomeWSMessage(message) =>
      rooms.get(message.roomId).foreach(handleIncomeMessage(_, message))
    case UnsupportedWSMessage =>
      log.error("UnsupportedWSMessage received")
    case WSCompleted(roomId, userId) =>
      rooms.get(roomId).foreach(room => room ! Room.Leave(userId))
    case WSFailure(t) =>
      log.error("WSFailure: {}", t)
    case Terminated(ref) =>
      rooms = rooms.filter {
        case (_, roomRef) => roomRef != ref
      }
  }

  private def createRoom(roomId: UUID): ActorRef = {
    context.actorOf(Room.props(roomId), roomId.toString)
  }

  private def handleIncomeMessage(room: ActorRef, message: WSMessage): Unit = message.messageType match {
    case MessageType.Init => // Should never arrive here
    case MessageType.Join => // Should be handle by ConnectToRoom
    case MessageType.Leave => // Should never arrive here
    case MessageType.EditIssue => room ! Room.EditIssue(message.userId, message.extra)
    case MessageType.Vote => room ! Room.Vote(message.userId, message.extra)
    case MessageType.Show => room ! Room.ShowVotes(message.userId)
    case MessageType.Clear => room ! Room.ClearVotes(message.userId)
  }
}

object RoomManager {

  def props(): Props = Props[RoomManager]

  sealed trait Command

  final case object CreateRoom extends Command

  final case class IncomeWSMessage(message: WSMessage) extends Command

  final case object UnsupportedWSMessage extends Command

  final case class WSCompleted(roomId: UUID, userId: UUID) extends Command

  final case class WSFailure(t: Throwable) extends Command

  //Message to kill the websocket from server side, not used
  final case class CompleteWS() extends Command

  final case class ConnectToRoom(message: WSMessage, user: ActorRef) extends Command // DONE

  sealed trait Response

  final case class RoomId(value: String) extends Response
}
