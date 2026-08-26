package com.lunatech.pointingpoker.actors

import java.util.UUID

import scala.concurrent.duration.FiniteDuration

import org.apache.pekko.actor.typed.scaladsl.{ActorContext, Behaviors}
import org.apache.pekko.actor.typed.{ActorRef, Behavior, Terminated}
import org.apache.pekko.actor.ActorRef as UntypedRef
import org.apache.pekko.stream.BufferOverflowException
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
      ref: UntypedRef
  ) extends Command
  case class RoomResponseWrapper(response: Room.Response) extends Command
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

  val InitialVoteState  = false
  val InitialEstimation = ""

  final case class RoomManagerData(rooms: Map[UUID, ActorRef[Room.Command]]):
    def addRoom(roomId: UUID, roomActor: ActorRef[Room.Command]): RoomManagerData =
      this.copy(rooms = this.rooms + (roomId -> roomActor))
    def removeRoom(roomId: UUID): RoomManagerData =
      this.copy(rooms = this.rooms - roomId)
  object RoomManagerData:
    val empty: RoomManagerData = RoomManagerData(rooms = Map.empty[UUID, ActorRef[Room.Command]])

  def apply(gracePeriod: FiniteDuration = Room.defaultGracePeriod): Behavior[Command] =
    Behaviors.setup[Command] { context =>
      val roomResponseActor: ActorRef[Room.Response] =
        context.messageAdapter(response => RoomResponseWrapper(response))
      receiveBehaviour(RoomManagerData.empty, roomResponseActor, gracePeriod)
    }

  private[actors] def receiveBehaviour(
      data: RoomManagerData,
      roomResponseWrapper: ActorRef[Room.Response],
      gracePeriod: FiniteDuration = Room.defaultGracePeriod
  ): Behavior[Command] =
    Behaviors
      .receive[Command] { (context, message) =>
        message match
          case CreateRoom(replyTo) =>
            val roomId    = UUID.randomUUID()
            val roomActor = createRoom(roomId, context, gracePeriod)
            val newData   = data.addRoom(roomId, roomActor)

            context.watch(roomActor)
            replyTo ! RoomId(roomId.toString)
            receiveBehaviour(newData, roomResponseWrapper, gracePeriod)
          case ConnectToRoom(roomId, userId, name, token, ref) =>
            data.rooms.get(roomId).foreach { room =>
              room ! Room.Join(
                Room.User(userId, name, InitialVoteState, InitialEstimation, ref, token)
              )
            }
            Behaviors.same
          case RequestSession(roomId, name, replyTo) =>
            data.rooms
              .get(roomId)
              .fold {
                val roomActor = createRoom(roomId, context, gracePeriod)
                context.watch(roomActor)
                val newData = data.addRoom(roomId, roomActor)
                roomActor ! Room.RequestSession(name, replyTo)
                receiveBehaviour(newData, roomResponseWrapper, gracePeriod)
              } { room =>
                room ! Room.RequestSession(name, replyTo)
                Behaviors.same
              }
          case ValidateToken(roomId, token, replyTo) =>
            data.rooms.get(roomId) match
              case Some(room) => room ! Room.ValidateToken(token, replyTo)
              case None       => replyTo ! Room.Unresolved
            Behaviors.same
          case RoomResponseWrapper(response) =>
            response match
              case Room.Running(_)      => Behaviors.same
              case Room.Stopped(roomId) =>
                val newData = data.removeRoom(roomId)
                receiveBehaviour(newData, roomResponseWrapper, gracePeriod)
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
            data.rooms
              .get(roomId)
              .foreach(room => room ! Room.Leave(userId, ref, roomResponseWrapper))
            Behaviors.same
          case ConnectionFailure(roomId, userId, ref, t) =>
            // BufferOverflowException is the backpressure fix's intended, self-healing path
            // (see docs/superpowers/specs/2026-08-24-sse-backpressure-design.md), not an incident.
            t match
              case _: BufferOverflowException =>
                context.log.info(
                  "SSE stream for user {} in room {} closed by backpressure (buffer overflow); expecting a reconnect",
                  userId,
                  roomId
                )
              case _ =>
                context.log.error("ConnectionFailure: {}", t)
            data.rooms
              .get(roomId)
              .foreach(room => room ! Room.Leave(userId, ref, roomResponseWrapper))
            Behaviors.same
      }
      .receiveSignal { case (_, Terminated(ref)) =>
        val leftoverRooms = data.rooms.filterNot { case (_, roomRef) => roomRef == ref }
        receiveBehaviour(RoomManagerData(leftoverRooms), roomResponseWrapper, gracePeriod)
      }

  private[actors] def createRoom(
      roomId: UUID,
      context: ActorContext[Command],
      gracePeriod: FiniteDuration = Room.defaultGracePeriod
  ): ActorRef[Room.Command] =
    context.spawn(actors.Room(roomId, gracePeriod = gracePeriod), name = roomId.toString)
end RoomManager
