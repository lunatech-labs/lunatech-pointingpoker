package com.lunatech.pointingpoker.actors

import java.util.UUID

import akka.actor.typed.scaladsl.{ActorContext, Behaviors}
import akka.actor.typed.{ActorRef, Behavior, Terminated}
import akka.actor.{ActorRef => UntypedRef}
import com.lunatech.pointingpoker.actors
import com.lunatech.pointingpoker.websocket.WSMessage
import com.lunatech.pointingpoker.websocket.WSMessage.MessageType

object RoomManager {

  sealed trait Command
  final case class CreateRoom(replyTo: ActorRef[Response])             extends Command
  final case class IncomeWSMessage(message: WSMessage)                 extends Command
  final case object UnsupportedWSMessage                               extends Command
  final case class WSCompleted(roomId: UUID, userId: UUID)             extends Command
  final case class WSFailure(t: Throwable)                             extends Command
  final case class CompleteWS()                                        extends Command
  final case class ConnectToRoom(message: WSMessage, user: UntypedRef) extends Command
  final case class RoomResponseWrapper(response: Room.Response)        extends Command

  sealed trait Response
  final case class RoomId(value: String) extends Response

  val InitialVoteState  = false
  val InitialEstimation = ""

  final case class RoomManagerData(rooms: Map[UUID, ActorRef[Room.Command]]) {
    def addRoom(roomId: UUID, roomActor: ActorRef[Room.Command]): RoomManagerData = {
      this.copy(rooms = this.rooms + (roomId -> roomActor))
    }
    def removeRoom(roomId: UUID): RoomManagerData = {
      this.copy(rooms = this.rooms - roomId)
    }
  }
  object RoomManagerData {
    val empty: RoomManagerData = RoomManagerData(rooms = Map.empty[UUID, ActorRef[Room.Command]])
  }

  def apply(): Behavior[Command] =
    Behaviors.setup[Command] { context =>
      val roomResponseActor: ActorRef[Room.Response] =
        context.messageAdapter(response => RoomResponseWrapper(response))
      receiveBehaviour(RoomManagerData.empty, roomResponseActor)
    }

  private[actors] def receiveBehaviour(
      data: RoomManagerData,
      roomResponseWrapper: ActorRef[Room.Response]
  ): Behavior[Command] =
    Behaviors
      .receive[Command] { (context, message) =>
        message match {
          case CreateRoom(replyTo) =>
            val roomId    = UUID.randomUUID()
            val roomActor = createRoom(roomId, context)
            val newData   = data.addRoom(roomId, roomActor)

            context.watch(roomActor)
            replyTo ! RoomId(roomId.toString)
            receiveBehaviour(newData, roomResponseWrapper)
          case ConnectToRoom(message, user) =>
            data.rooms
              .get(message.roomId)
              .fold {
                val roomActor = createRoom(message.roomId, context)
                context.watch(roomActor)
                val newData = data.addRoom(message.roomId, roomActor)
                roomActor ! Room.Join(
                  Room
                    .User(message.userId, message.extra, InitialVoteState, InitialEstimation, user)
                )
                receiveBehaviour(newData, roomResponseWrapper)
              } { room =>
                room ! Room.Join(
                  Room
                    .User(message.userId, message.extra, InitialVoteState, InitialEstimation, user)
                )
                Behaviors.same
              }
          case RoomResponseWrapper(response) =>
            response match {
              case Room.Running(_) => Behaviors.same
              case Room.Stopped(roomId) =>
                val newData = data.removeRoom(roomId)
                receiveBehaviour(newData, roomResponseWrapper)
            }
          case IncomeWSMessage(message) =>
            data.rooms.get(message.roomId).foreach(handleIncomeMessage(_, message, context))
            Behaviors.same
          case UnsupportedWSMessage =>
            context.log.error("UnsupportedWSMessage received")
            Behaviors.same
          case WSCompleted(roomId, userId) =>
            data.rooms.get(roomId).foreach(room => room ! Room.Leave(userId, roomResponseWrapper))
            Behaviors.same
          case WSFailure(t) =>
            context.log.error("WSFailure: {}", t)
            Behaviors.same
          case CompleteWS() =>
            context.log.error("CompleteWS: should never be received")
            Behaviors.same
        }
      }
      .receiveSignal {
        case (_, Terminated(ref)) =>
          val leftoverRooms = data.rooms.filterNot { case (_, roomRef) => roomRef == ref }
          receiveBehaviour(RoomManagerData(leftoverRooms), roomResponseWrapper)
      }

  private[actors] def createRoom(
      roomId: UUID,
      context: ActorContext[Command]
  ): ActorRef[Room.Command] = {
    context.spawn(actors.Room(roomId), name = roomId.toString)
  }

  private[actors] def handleIncomeMessage(
      room: ActorRef[Room.Command],
      message: WSMessage,
      context: ActorContext[Command]
  ): Unit =
    message.messageType match {
      case MessageType.Init => // Should never arrive here
        context.log.error("Received Init MessageType []", message)
      case MessageType.Join => // Should be handle by ConnectToRoom
        context.log.error("Received Join MessageType []", message)
      case MessageType.Leave => // Should never arrive here
        context.log.error("Received Leave MessageType []", message)
      case MessageType.EditIssue => room ! Room.EditIssue(message.userId, message.extra)
      case MessageType.Vote      => room ! Room.Vote(message.userId, message.extra)
      case MessageType.Show      => room ! Room.ShowVotes(message.userId)
      case MessageType.Clear     => room ! Room.ClearVotes(message.userId)
    }
}
