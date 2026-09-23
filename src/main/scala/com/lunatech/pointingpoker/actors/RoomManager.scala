package com.lunatech.pointingpoker.actors

import java.util.UUID

import scala.concurrent.duration.FiniteDuration

import org.apache.pekko.actor.typed.scaladsl.{ActorContext, Behaviors}
import org.apache.pekko.actor.typed.{ActorRef, Behavior, Terminated}
import org.apache.pekko.actor.ActorRef as UntypedRef
import com.lunatech.pointingpoker.actors
import com.lunatech.pointingpoker.slug.Slug

object RoomManager:

  sealed trait Command
  case class CreateRoom(replyTo: ActorRef[Response])                          extends Command
  case class ConnectionCompleted(roomId: Slug, userId: UUID, ref: UntypedRef) extends Command
  case class ConnectionFailure(roomId: Slug, userId: UUID, ref: UntypedRef, t: Throwable)
      extends Command
  case class ConnectToRoom(
      roomId: Slug,
      userId: UUID,
      name: String,
      token: Room.SessionToken,
      connectionId: Room.ConnectionId,
      ref: UntypedRef
  ) extends Command
  case class Vote(
      roomId: Slug,
      token: Option[Room.SessionToken],
      estimation: String,
      replyTo: ActorRef[Room.VoteResult]
  ) extends Command
  case class Depart(
      roomId: Slug,
      token: Option[Room.SessionToken],
      connectionId: Room.ConnectionId,
      replyTo: ActorRef[Room.CommandResult]
  ) extends Command
  case class Show(
      roomId: Slug,
      token: Option[Room.SessionToken],
      replyTo: ActorRef[Room.CommandResult]
  ) extends Command
  case class Clear(
      roomId: Slug,
      token: Option[Room.SessionToken],
      replyTo: ActorRef[Room.CommandResult]
  ) extends Command
  case class Revote(
      roomId: Slug,
      token: Option[Room.SessionToken],
      replyTo: ActorRef[Room.CommandResult]
  ) extends Command
  case class EditIssue(
      roomId: Slug,
      token: Option[Room.SessionToken],
      issue: String,
      replyTo: ActorRef[Room.CommandResult]
  ) extends Command
  case class RequestSession(
      roomId: Slug,
      name: String,
      existing: Option[Room.SessionToken],
      replyTo: ActorRef[Room.SessionMinted]
  ) extends Command
  case class ValidateToken(
      roomId: Slug,
      token: Room.SessionToken,
      replyTo: ActorRef[Room.TokenResolution]
  ) extends Command

  sealed trait Response
  case class RoomId(value: Slug) extends Response
  case object NoFreeRoomName     extends Response

  final case class RoomManagerData(rooms: Map[Slug, ActorRef[Room.Command]]):
    def addRoom(roomId: Slug, roomActor: ActorRef[Room.Command]): RoomManagerData =
      this.copy(rooms = this.rooms + (roomId -> roomActor))
  object RoomManagerData:
    val empty: RoomManagerData = RoomManagerData(rooms = Map.empty[Slug, ActorRef[Room.Command]])

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
      stopAfterIdle: FiniteDuration,
      random: java.util.Random = Slug.secureRandom
  ): Behavior[Command] =
    Behaviors
      .receive[Command] { (context, message) =>
        // A stopped room is answered from the map's absence rather than by a timing-out ask.
        def relay(roomId: Slug, token: Option[Room.SessionToken], replyTo: ActorRef[Room.Refusal])(
            command: Room.SessionToken => Room.Command
        ): Behavior[Command] =
          (data.rooms.get(roomId), token) match
            case (Some(room), Some(t)) => room ! command(t)
            case _                     => replyTo ! Room.NoSession
          Behaviors.same

        message match
          case CreateRoom(replyTo) =>
            Slug.generate(data.rooms.contains, random) match
              case Some(roomId) =>
                val roomActor = createRoom(roomId, context, gracePeriod, stopAfterIdle)
                val newData   = data.addRoom(roomId, roomActor)

                context.watch(roomActor)
                replyTo ! RoomId(roomId)
                receiveBehaviour(newData, gracePeriod, stopAfterIdle, random)
              case None =>
                // The spec asks for this to be loud: it means scale or an abused create-room.
                context.log.error("No free room name found with {} rooms live", data.rooms.size)
                replyTo ! NoFreeRoomName
                Behaviors.same
          case ConnectToRoom(roomId, userId, name, token, connectionId, ref) =>
            data.rooms
              .get(roomId)
              .foreach(room => room ! Room.Join(userId, name, token, connectionId, ref))
            Behaviors.same
          case RequestSession(roomId, name, existing, replyTo) =>
            data.rooms
              .get(roomId)
              .fold {
                val roomActor = createRoom(roomId, context, gracePeriod, stopAfterIdle)
                context.watch(roomActor)
                val newData = data.addRoom(roomId, roomActor)
                roomActor ! Room.RequestSession(name, existing, replyTo)
                receiveBehaviour(newData, gracePeriod, stopAfterIdle, random)
              } { room =>
                room ! Room.RequestSession(name, existing, replyTo)
                Behaviors.same
              }
          case ValidateToken(roomId, token, replyTo) =>
            data.rooms.get(roomId) match
              case Some(room) => room ! Room.ValidateToken(token, replyTo)
              case None       => replyTo ! Room.Unresolved
            Behaviors.same
          case Vote(roomId, token, estimation, replyTo) =>
            relay(roomId, token, replyTo)(t => Room.Vote(t, estimation, replyTo))
          case Show(roomId, token, replyTo) =>
            relay(roomId, token, replyTo)(t => Room.ShowVotes(t, replyTo))
          case Clear(roomId, token, replyTo) =>
            relay(roomId, token, replyTo)(t => Room.ClearVotes(t, replyTo))
          case Revote(roomId, token, replyTo) =>
            relay(roomId, token, replyTo)(t => Room.ReVote(t, replyTo))
          case EditIssue(roomId, token, issue, replyTo) =>
            relay(roomId, token, replyTo)(t => Room.EditIssue(t, issue, replyTo))
          case Depart(roomId, token, connectionId, replyTo) =>
            relay(roomId, token, replyTo)(t => Room.Depart(t, connectionId, replyTo))
          case ConnectionCompleted(roomId, userId, ref) =>
            data.rooms.get(roomId).foreach(room => room ! Room.Leave(userId, ref))
            Behaviors.same
          case ConnectionFailure(roomId, userId, ref, t) =>
            context.log.error("ConnectionFailure for room {} user {}", roomId, userId, t)
            data.rooms.get(roomId).foreach(room => room ! Room.Leave(userId, ref))
            Behaviors.same
        end match
      }
      .receiveSignal { case (_, Terminated(ref)) =>
        val leftoverRooms = data.rooms.filterNot { case (_, roomRef) => roomRef == ref }
        receiveBehaviour(RoomManagerData(leftoverRooms), gracePeriod, stopAfterIdle, random)
      }

  private[actors] def createRoom(
      roomId: Slug,
      context: ActorContext[Command],
      gracePeriod: FiniteDuration,
      stopAfterIdle: FiniteDuration
  ): ActorRef[Room.Command] =
    context.spawn(
      actors.Room(roomId, gracePeriod = gracePeriod, stopAfterIdle = stopAfterIdle),
      name = roomId.raw
    )
end RoomManager
