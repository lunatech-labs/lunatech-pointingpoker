package com.lunatech.pointingpoker

import java.util.UUID

import akka.actor.{Actor, ActorLogging, ActorRef, Props}
import com.lunatech.pointingpoker.websocket.WSMessage
import com.lunatech.pointingpoker.websocket.WSMessage.MessageType

class Room(roomId: UUID) extends Actor with ActorLogging {

  import Room._

  var users: List[User] = List.empty
  var currentIssue: String = ""
  var issueLastEditBy: Option[UUID] = Option.empty

  override def receive: Receive = {
    case Join(user) =>
      users = user :: users
      setupNewUser(user)
      broadcast(WSMessage(MessageType.Join, roomId, user.id, user.name))
    case Vote(userId, estimation) =>
      users = users.map { u =>
        if (userId == u.id) u.copy(voted = true, estimation = estimation)
        else u
      }
      broadcast(WSMessage(MessageType.Vote, roomId, userId, estimation))
    case ClearVotes(userId) =>
      users = users.map(_.copy(voted = false))
      broadcast(WSMessage(MessageType.Clear, roomId, userId, WSMessage.NoExtra))
    case ShowVotes(userId) => broadcast(WSMessage(MessageType.Show, roomId, userId, WSMessage.NoExtra))
    case Leave(userId) =>
      users = users.filter(_.id != userId)
      broadcast(WSMessage(MessageType.Leave, roomId, userId, WSMessage.NoExtra))
      if (users.isEmpty) {
        context.stop(self)
      }
    case EditIssue(userId, issue) =>
      currentIssue = issue
      issueLastEditBy = Option(userId)
      broadcast(WSMessage(MessageType.EditIssue, roomId, userId, issue))
  }

  private def setupNewUser(user: User): Unit = {
    user.ref ! WSMessage(MessageType.Init, roomId, user.id, user.name)
    issueLastEditBy.foreach( lastEditUser => user.ref ! WSMessage(MessageType.EditIssue, roomId, lastEditUser, currentIssue))
    users.foreach { u =>
      user.ref ! WSMessage(MessageType.Join, roomId, u.id, u.name)
      if (u.voted) {
        user.ref ! WSMessage(MessageType.Vote, roomId, u.id, u.estimation)
      }
    }
  }

  private def broadcast(message: WSMessage): Unit = {
    log.info("Broadcasting: {} ", message)
    users.foreach { user =>
      user.ref ! message
    }
  }
}

object Room {

  final case class User(id: UUID, name: String, voted: Boolean, estimation: String, ref: ActorRef)

  def props(roomId: UUID): Props = Props(classOf[Room], roomId)

  sealed trait Command

  final case class Join(user: User) extends Command

  final case class Leave(userId: UUID) extends Command

  final case class Vote(userId: UUID, estimation: String) extends Command

  final case class ClearVotes(userId: UUID) extends Command

  final case class ShowVotes(userId: UUID) extends Command

  final case class EditIssue(userId: UUID, issue: String)

}
