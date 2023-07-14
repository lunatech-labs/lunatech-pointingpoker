package com.lunatech.pointingpoker.actors

import java.util.UUID

import org.apache.pekko.actor.typed.{ActorRef, Behavior}
import org.apache.pekko.actor.typed.scaladsl.{ActorContext, Behaviors}
import org.apache.pekko.actor.{ActorRef => UntypedRef}
import com.lunatech.pointingpoker.websocket.WSMessage
import com.lunatech.pointingpoker.websocket.WSMessage.MessageType

object Room {

  sealed trait Command
  final case class Join(user: User)                                       extends Command
  final case class Leave(userId: UUID, replyTo: ActorRef[Response])       extends Command
  final case class Vote(userId: UUID, estimation: String)                 extends Command
  final case class ClearVotes(userId: UUID)                               extends Command
  final case class ShowVotes(userId: UUID)                                extends Command
  final case class EditIssue(userId: UUID, issue: String)                 extends Command
  private[actors] final case class GetData(replyTo: ActorRef[DataStatus]) extends Command

  final case class DataStatus(data: RoomData)

  sealed trait Response
  final case class Running(roomId: UUID) extends Response
  final case class Stopped(roomId: UUID) extends Response

  final case class User(id: UUID, name: String, voted: Boolean, estimation: String, ref: UntypedRef)

  final case class RoomData(
      users: List[User],
      currentIssue: String,
      issueLastEditBy: Option[UUID]
  ) {
    def joinUser(user: User): RoomData = {
      this.copy(users = user :: this.users)
    }

    def vote(userId: UUID, estimation: String): RoomData = {
      this.copy(users = this.users.map { u =>
        if (userId == u.id) u.copy(voted = true, estimation = estimation)
        else u
      })
    }

    def clear(): RoomData = {
      this.copy(users = this.users.map(_.copy(voted = false, estimation = "")))
    }

    def leave(userId: UUID): RoomData = {
      this.copy(users = this.users.filterNot(_.id == userId))
    }

    def editIssue(issue: String, userId: UUID): RoomData = {
      this.copy(currentIssue = issue, issueLastEditBy = Option(userId))
    }
  }

  object RoomData {
    val empty: RoomData = RoomData(List.empty[User], "", Option.empty[UUID])
  }

  def apply(roomId: UUID): Behavior[Command] =
    Behaviors.setup[Command] { _ =>
      receiveBehaviour(roomId, RoomData.empty)
    }

  private[actors] def receiveBehaviour(roomId: UUID, data: RoomData): Behavior[Command] =
    Behaviors.receive[Command] { (context, message) =>
      message match {
        case Join(user) =>
          val newData = data.joinUser(user)
          setupNewUser(user, roomId, newData)
          broadcast(WSMessage(MessageType.Join, roomId, user.id, user.name), newData.users, context)
          receiveBehaviour(roomId, newData)
        case Vote(userId, estimation) =>
          val newData = data.vote(userId, estimation)
          broadcast(WSMessage(MessageType.Vote, roomId, userId, estimation), newData.users, context)
          receiveBehaviour(roomId, newData)
        case ClearVotes(userId) =>
          val newData = data.clear()
          broadcast(
            WSMessage(MessageType.Clear, roomId, userId, WSMessage.NoExtra),
            newData.users,
            context
          )
          receiveBehaviour(roomId, newData)
        case ShowVotes(userId) =>
          broadcast(
            WSMessage(MessageType.Show, roomId, userId, WSMessage.NoExtra),
            data.users,
            context
          )
          Behaviors.same
        case Leave(userId, replyTo) =>
          val newData = data.leave(userId)
          broadcast(
            WSMessage(MessageType.Leave, roomId, userId, WSMessage.NoExtra),
            newData.users,
            context
          )
          if (newData.users.isEmpty) {
            replyTo ! Stopped(roomId)
            Behaviors.stopped
          } else {
            replyTo ! Running(roomId)
            receiveBehaviour(roomId, newData)
          }
        case EditIssue(userId, issue) =>
          broadcast(WSMessage(MessageType.EditIssue, roomId, userId, issue), data.users, context)
          receiveBehaviour(
            roomId,
            data.editIssue(issue, userId)
          )
        case GetData(replyTo) =>
          replyTo ! Room.DataStatus(data)
          Behaviors.same
      }

    }

  private[actors] def broadcast(
      message: WSMessage,
      users: List[User],
      context: ActorContext[Command]
  ): Unit = {
    context.log.debug("Broadcasting: {} ", message)
    users.foreach { user =>
      user.ref ! message
    }
  }

  private[actors] def setupNewUser(user: User, roomId: UUID, data: RoomData): Unit = {
    user.ref ! WSMessage(MessageType.Init, roomId, user.id, user.name)
    data.issueLastEditBy.foreach(lastEditUser =>
      user.ref ! WSMessage(MessageType.EditIssue, roomId, lastEditUser, data.currentIssue)
    )
    data.users.foreach { u =>
      user.ref ! WSMessage(MessageType.Join, roomId, u.id, u.name)
      if (u.voted) {
        user.ref ! WSMessage(MessageType.Vote, roomId, u.id, u.estimation)
      }
    }
  }

}
