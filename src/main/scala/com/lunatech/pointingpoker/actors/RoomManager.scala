package com.lunatech.pointingpoker.actors

import java.util.UUID

import org.apache.pekko.actor.typed.scaladsl.{ActorContext, Behaviors}
import org.apache.pekko.actor.typed.{ActorRef, Behavior, Terminated}
import org.apache.pekko.actor.ActorRef as UntypedRef
import com.lunatech.pointingpoker.actors

object RoomManager:

  sealed trait Command
  case class CreateRoom(replyTo: ActorRef[Response])                          extends Command
  case class ConnectionCompleted(roomId: UUID, userId: UUID, ref: UntypedRef) extends Command
  case class ConnectionFailure(roomId: UUID, userId: UUID, ref: UntypedRef, t: Throwable)
      extends Command
  case class ConnectToRoom(message: RoomEvent, user: UntypedRef)  extends Command
  case class RoomResponseWrapper(response: Room.Response)         extends Command
  case class Vote(roomId: UUID, userId: UUID, estimation: String) extends Command
  case class Show(roomId: UUID, userId: UUID)                     extends Command
  case class Clear(roomId: UUID, userId: UUID)                    extends Command
  case class Revote(roomId: UUID, userId: UUID)                   extends Command
  case class EditIssue(roomId: UUID, userId: UUID, issue: String) extends Command

  sealed trait Response
  case class RoomId(value: String) extends Response

  val InitialVoteState  = false
  val InitialEstimation = ""

  final case class RoomManagerData(rooms: Map[UUID, ActorRef[Room.Command]]):
    def addRoom(roomId: UUID, roomActor: ActorRef[Room.Command]): RoomManagerData =
      this.copy(rooms = this.rooms + (roomId -> roomActor))
    def removeRoom(roomId: UUID): RoomManagerData =
      this.copy(rooms = this.rooms - roomId)
  object RoomManagerData:
    val empty: RoomManagerData = RoomManagerData(rooms = Map.empty[UUID, ActorRef[Room.Command]])

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
        message match
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
                    .User(message.userId, message.extra, InitialVoteState, InitialEstimation, user, Room.SessionToken.mint())
                )
                receiveBehaviour(newData, roomResponseWrapper)
              } { room =>
                room ! Room.Join(
                  Room
                    .User(message.userId, message.extra, InitialVoteState, InitialEstimation, user, Room.SessionToken.mint())
                )
                Behaviors.same
              }
          case RoomResponseWrapper(response) =>
            response match
              case Room.Running(_)      => Behaviors.same
              case Room.Stopped(roomId) =>
                val newData = data.removeRoom(roomId)
                receiveBehaviour(newData, roomResponseWrapper)
          case Vote(roomId, userId, estimation) =>
            data.rooms.get(roomId).foreach(room => room ! Room.Vote(userId, estimation))
            Behaviors.same
          case Show(roomId, userId) =>
            data.rooms.get(roomId).foreach(room => room ! Room.ShowVotes(userId))
            Behaviors.same
          case Clear(roomId, userId) =>
            data.rooms.get(roomId).foreach(room => room ! Room.ClearVotes(userId))
            Behaviors.same
          case Revote(roomId, userId) =>
            data.rooms.get(roomId).foreach(room => room ! Room.ReVote(userId))
            Behaviors.same
          case EditIssue(roomId, userId, issue) =>
            data.rooms.get(roomId).foreach(room => room ! Room.EditIssue(userId, issue))
            Behaviors.same
          case ConnectionCompleted(roomId, userId, ref) =>
            data.rooms
              .get(roomId)
              .foreach(room => room ! Room.Leave(userId, ref, roomResponseWrapper))
            Behaviors.same
          case ConnectionFailure(roomId, userId, ref, t) =>
            context.log.error("ConnectionFailure: {}", t)
            data.rooms
              .get(roomId)
              .foreach(room => room ! Room.Leave(userId, ref, roomResponseWrapper))
            Behaviors.same
      }
      .receiveSignal { case (_, Terminated(ref)) =>
        val leftoverRooms = data.rooms.filterNot { case (_, roomRef) => roomRef == ref }
        receiveBehaviour(RoomManagerData(leftoverRooms), roomResponseWrapper)
      }

  private[actors] def createRoom(
      roomId: UUID,
      context: ActorContext[Command]
  ): ActorRef[Room.Command] =
    context.spawn(actors.Room(roomId), name = roomId.toString)
end RoomManager
