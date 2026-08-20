package com.lunatech.pointingpoker.actors

import java.util.UUID

import org.apache.pekko.actor.typed.{ActorRef, Behavior}
import org.apache.pekko.actor.typed.scaladsl.{ActorContext, Behaviors}
import org.apache.pekko.actor.ActorRef as UntypedRef
import RoomEvent.MessageType

object Room:

  opaque type SessionToken = UUID

  object SessionToken:
    def mint(): SessionToken                      = UUID.randomUUID()
    def parse(raw: String): Option[SessionToken]  = scala.util.Try(UUID.fromString(raw)).toOption
    extension (token: SessionToken) def raw: String = token.toString

  sealed trait Command
  final case class Join(user: User)                                                  extends Command
  final case class Leave(userId: UUID, ref: UntypedRef, replyTo: ActorRef[Response]) extends Command
  final case class Vote(userId: UUID, estimation: String)                            extends Command
  final case class ClearVotes(userId: UUID)                                          extends Command
  final case class ReVote(userId: UUID)                                              extends Command
  final case class ShowVotes(userId: UUID)                                           extends Command
  final case class EditIssue(userId: UUID, issue: String)                            extends Command
  final case class RequestSession(name: String, replyTo: ActorRef[SessionMinted])    extends Command
  final case class ValidateToken(token: SessionToken, replyTo: ActorRef[TokenResolution]) extends Command
  final private[actors] case class GetData(replyTo: ActorRef[DataStatus])            extends Command

  final case class DataStatus(data: RoomData)
  final case class SessionMinted(userId: UUID, token: SessionToken)

  sealed trait TokenResolution
  final case class Resolved(userId: UUID, name: String) extends TokenResolution
  case object Unresolved                                 extends TokenResolution

  sealed trait Response
  final case class Running(roomId: UUID) extends Response
  final case class Stopped(roomId: UUID) extends Response

  final case class User(id: UUID, name: String, voted: Boolean, estimation: String, ref: UntypedRef, token: SessionToken)

  final case class PendingSession(userId: UUID, name: String)

  final case class RoomData(
      users: List[User],
      currentIssue: String,
      issueLastEditBy: Option[UUID],
      pendingSessions: Map[SessionToken, PendingSession] = Map.empty
  ):
    def joinUser(user: User): RoomData =
      // Replaces any existing entry for this userId so a reconnect (e.g. the browser's
      // automatic EventSource retry racing an old connection's slow-to-detect failure)
      // doesn't leave two entries for the same user.
      this.copy(users = user :: this.users.filterNot(_.id == user.id))

    def registerSession(token: SessionToken, userId: UUID, name: String): RoomData =
      this.copy(pendingSessions = this.pendingSessions + (token -> PendingSession(userId, name)))

    def vote(userId: UUID, estimation: String): RoomData =
      this.copy(users = this.users.map { u =>
        if userId == u.id then u.copy(voted = true, estimation = estimation)
        else u
      })

    def clear(): RoomData =
      this.copy(users = this.users.map(_.copy(voted = false, estimation = "")))

    def reVote(): RoomData =
      this.copy(users = this.users.map(u => u.copy(voted = false)))

    def leave(userId: UUID, ref: UntypedRef): RoomData =
      // Scoped to the specific connection's ref, not just userId, so a stale connection's
      // delayed teardown can't evict a newer connection the same user reconnected with.
      this.copy(users = this.users.filterNot(u => u.id == userId && u.ref == ref))

    def editIssue(issue: String, userId: UUID): RoomData =
      this.copy(currentIssue = issue, issueLastEditBy = Option(userId))
  end RoomData

  object RoomData:
    val empty: RoomData = RoomData(List.empty[User], "", Option.empty[UUID])

  def apply(roomId: UUID): Behavior[Command] =
    Behaviors.setup[Command] { _ =>
      receiveBehaviour(roomId, RoomData.empty)
    }

  private[actors] def receiveBehaviour(roomId: UUID, data: RoomData): Behavior[Command] =
    Behaviors.receive[Command] { (context, message) =>
      message match
        case Join(user) =>
          val newData = data.joinUser(user)
          setupNewUser(user, roomId, newData)
          broadcast(RoomEvent(MessageType.Join, roomId, user.id, user.name), newData.users, context)
          receiveBehaviour(roomId, newData)
        case RequestSession(name, replyTo) =>
          val userId  = UUID.randomUUID()
          val token   = SessionToken.mint()
          val newData = data.registerSession(token, userId, name)
          replyTo ! SessionMinted(userId, token)
          receiveBehaviour(roomId, newData)
        case Vote(userId, estimation) =>
          val newData = data.vote(userId, estimation)
          broadcast(RoomEvent(MessageType.Vote, roomId, userId, estimation), newData.users, context)
          receiveBehaviour(roomId, newData)
        case ClearVotes(userId) =>
          val newData = data.clear()
          broadcast(
            RoomEvent(MessageType.Clear, roomId, userId, RoomEvent.NoExtra),
            newData.users,
            context
          )
          receiveBehaviour(roomId, newData)
        case ReVote(userId) =>
          val newData = data.reVote()
          broadcast(
            RoomEvent(MessageType.Revote, roomId, userId, RoomEvent.NoExtra),
            newData.users,
            context
          )
          receiveBehaviour(roomId, newData)
        case ShowVotes(userId) =>
          broadcast(
            RoomEvent(MessageType.Show, roomId, userId, RoomEvent.NoExtra),
            data.users,
            context
          )
          Behaviors.same
        case Leave(userId, ref, replyTo) =>
          if data.users.exists(u => u.id == userId && u.ref == ref) then
            val newData = data.leave(userId, ref)
            broadcast(
              RoomEvent(MessageType.Leave, roomId, userId, RoomEvent.NoExtra),
              newData.users,
              context
            )
            if newData.users.isEmpty then
              replyTo ! Stopped(roomId)
              Behaviors.stopped
            else
              replyTo ! Running(roomId)
              receiveBehaviour(roomId, newData)
          else
            // Stale teardown: this userId already reconnected under a different ref
            // (joinUser replaced the entry), so there's nothing left to remove.
            Behaviors.same
        case EditIssue(userId, issue) =>
          broadcast(RoomEvent(MessageType.EditIssue, roomId, userId, issue), data.users, context)
          receiveBehaviour(
            roomId,
            data.editIssue(issue, userId)
          )
        case ValidateToken(token, replyTo) =>
          val resolution = data.pendingSessions.get(token) match
            case Some(pending) => Resolved(pending.userId, pending.name)
            case None          =>
              data.users.find(_.token == token) match
                case Some(user) => Resolved(user.id, user.name)
                case None       => Unresolved
          replyTo ! resolution
          Behaviors.same
        case GetData(replyTo) =>
          replyTo ! Room.DataStatus(data)
          Behaviors.same

    }

  private[actors] def broadcast(
      message: RoomEvent,
      users: List[User],
      context: ActorContext[Command]
  ): Unit =
    context.log.debug("Broadcasting: {} ", message)
    users.foreach { user =>
      user.ref ! message
    }
  end broadcast

  private[actors] def setupNewUser(user: User, roomId: UUID, data: RoomData): Unit =
    user.ref ! RoomEvent(MessageType.Init, roomId, user.id, user.name)
    data.issueLastEditBy.foreach(lastEditUser =>
      user.ref ! RoomEvent(MessageType.EditIssue, roomId, lastEditUser, data.currentIssue)
    )
    data.users.foreach { u =>
      user.ref ! RoomEvent(MessageType.Join, roomId, u.id, u.name)
      if u.voted then user.ref ! RoomEvent(MessageType.Vote, roomId, u.id, u.estimation)
    }
  end setupNewUser
end Room
