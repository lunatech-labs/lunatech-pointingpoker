package com.lunatech.pointingpoker.actors

import java.util.UUID

import scala.concurrent.duration.FiniteDuration

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
  case class ConnectToRoom(
      roomId: UUID,
      userId: UUID,
      name: String,
      token: Room.SessionToken,
      connectionId: Room.ConnectionId,
      ref: UntypedRef
  ) extends Command
  case class Vote(roomId: UUID, token: Option[Room.SessionToken], estimation: String)
      extends Command
  case class Show(roomId: UUID, token: Option[Room.SessionToken])   extends Command
  case class Clear(roomId: UUID, token: Option[Room.SessionToken])  extends Command
  case class Revote(roomId: UUID, token: Option[Room.SessionToken]) extends Command
  case class EditIssue(roomId: UUID, token: Option[Room.SessionToken], issue: String)
      extends Command
  case class RequestSession(roomId: UUID, name: String, replyTo: ActorRef[Room.SessionMinted])
      extends Command
  case class ValidateToken(
      roomId: UUID,
      token: Room.SessionToken,
      replyTo: ActorRef[Room.TokenResolution]
  ) extends Command

  sealed trait Response
  case class RoomId(value: String) extends Response

  final case class RoomManagerData(rooms: Map[UUID, ActorRef[Room.Command]]):
    def addRoom(roomId: UUID, roomActor: ActorRef[Room.Command]): RoomManagerData =
      this.copy(rooms = this.rooms + (roomId -> roomActor))
  object RoomManagerData:
    val empty: RoomManagerData = RoomManagerData(rooms = Map.empty[UUID, ActorRef[Room.Command]])

  def apply(
      gracePeriod: FiniteDuration,
      stopAfterIdle: FiniteDuration
  ): Behavior[Command] =
    Behaviors.setup[Command](_ =>
      receiveBehaviour(RoomManagerData.empty, gracePeriod, stopAfterIdle)
    )

  private[actors] def receiveBehaviour(
      data: RoomManagerData,
      gracePeriod: FiniteDuration,
      stopAfterIdle: FiniteDuration
  ): Behavior[Command] =
    Behaviors
      .receive[Command] { (context, message) =>
        message match
          case CreateRoom(replyTo) =>
            val roomId    = UUID.randomUUID()
            val roomActor = createRoom(roomId, context, gracePeriod, stopAfterIdle)
            val newData   = data.addRoom(roomId, roomActor)

            context.watch(roomActor)
            replyTo ! RoomId(roomId.toString)
            receiveBehaviour(newData, gracePeriod, stopAfterIdle)
          case ConnectToRoom(roomId, userId, name, token, connectionId, ref) =>
            data.rooms
              .get(roomId)
              .foreach(room => room ! Room.Join(userId, name, token, connectionId, ref))
            Behaviors.same
          case RequestSession(roomId, name, replyTo) =>
            data.rooms
              .get(roomId)
              .fold {
                val roomActor = createRoom(roomId, context, gracePeriod, stopAfterIdle)
                context.watch(roomActor)
                val newData = data.addRoom(roomId, roomActor)
                roomActor ! Room.RequestSession(name, replyTo)
                receiveBehaviour(newData, gracePeriod, stopAfterIdle)
              } { room =>
                room ! Room.RequestSession(name, replyTo)
                Behaviors.same
              }
          case ValidateToken(roomId, token, replyTo) =>
            data.rooms.get(roomId) match
              case Some(room) => room ! Room.ValidateToken(token, replyTo)
              case None       => replyTo ! Room.Unresolved
            Behaviors.same
          case Vote(roomId, token, estimation) =>
            for
              room <- data.rooms.get(roomId)
              t    <- token
            do room ! Room.Vote(t, estimation)
            Behaviors.same
          case Show(roomId, token) =>
            for
              room <- data.rooms.get(roomId)
              t    <- token
            do room ! Room.ShowVotes(t)
            Behaviors.same
          case Clear(roomId, token) =>
            for
              room <- data.rooms.get(roomId)
              t    <- token
            do room ! Room.ClearVotes(t)
            Behaviors.same
          case Revote(roomId, token) =>
            for
              room <- data.rooms.get(roomId)
              t    <- token
            do room ! Room.ReVote(t)
            Behaviors.same
          case EditIssue(roomId, token, issue) =>
            for
              room <- data.rooms.get(roomId)
              t    <- token
            do room ! Room.EditIssue(t, issue)
            Behaviors.same
          case ConnectionCompleted(roomId, userId, ref) =>
            data.rooms.get(roomId).foreach(room => room ! Room.Leave(userId, ref))
            Behaviors.same
          case ConnectionFailure(roomId, userId, ref, t) =>
            context.log.error("ConnectionFailure for room {} user {}", roomId, userId, t)
            data.rooms.get(roomId).foreach(room => room ! Room.Leave(userId, ref))
            Behaviors.same
      }
      .receiveSignal { case (_, Terminated(ref)) =>
        val leftoverRooms = data.rooms.filterNot { case (_, roomRef) => roomRef == ref }
        receiveBehaviour(RoomManagerData(leftoverRooms), gracePeriod, stopAfterIdle)
      }

  private[actors] def createRoom(
      roomId: UUID,
      context: ActorContext[Command],
      gracePeriod: FiniteDuration,
      stopAfterIdle: FiniteDuration
  ): ActorRef[Room.Command] =
    context.spawn(
      actors.Room(roomId, gracePeriod = gracePeriod, stopAfterIdle = stopAfterIdle),
      name = roomId.toString
    )
end RoomManager
