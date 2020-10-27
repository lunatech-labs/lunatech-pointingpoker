package com.lunatech.pointingpoker

import java.util.UUID

import akka.actor.{Actor, ActorSystem}
import akka.testkit.{TestActorRef, TestProbe}
import com.lunatech.pointingpoker.websocket.WSMessage
import com.lunatech.pointingpoker.websocket.WSMessage.MessageType
import org.scalatest.BeforeAndAfterAll
import org.scalatest.matchers.must
import org.scalatest.wordspec.AnyWordSpec

class RoomSpec extends AnyWordSpec with must.Matchers with BeforeAndAfterAll {
  import RoomSpec._

  implicit val system: ActorSystem = ActorSystem("RoomSpec")

  override def afterAll(): Unit = {
    system.terminate()
  }

  "Room Actor" should {
    "update current issue and broadcast it" in {
      val issue               = "Issue test 1"
      val (user, userProbe)   = createUser(UUID.randomUUID(), "user1", false, "")
      val (user2, user2Probe) = createUser(UUID.randomUUID(), "user2", false, "")
      val actingUserId        = UUID.randomUUID()
      val roomRef             = createRoom(UUID.randomUUID(), List(user, user2))
      val expectedMessage =
        WSMessage(MessageType.EditIssue, roomRef.underlyingActor.roomId, actingUserId, issue)

      roomRef.underlyingActor.currentIssue mustBe ""

      roomRef ! Room.EditIssue(actingUserId, issue)

      roomRef.underlyingActor.currentIssue mustBe issue
      roomRef.underlyingActor.issueLastEditBy mustBe Option(actingUserId)

      userProbe.expectMsg(expectedMessage)
      user2Probe.expectMsg(expectedMessage)
    }

    "clear votes and broadcast it" in {
      val (user, userProbe)   = createUser(UUID.randomUUID(), "user1", true, "3")
      val (user2, user2Probe) = createUser(UUID.randomUUID(), "user2", true, "5")
      val actingUserId        = UUID.randomUUID()
      val roomRef             = createRoom(UUID.randomUUID(), List(user, user2))
      val expectedMessage = WSMessage(
        MessageType.Clear,
        roomRef.underlyingActor.roomId,
        actingUserId,
        WSMessage.NoExtra
      )

      roomRef ! Room.ClearVotes(actingUserId)

      roomRef.underlyingActor.users.foreach { u =>
        u.voted mustBe false
        u.estimation mustBe ""
      }
      userProbe.expectMsg(expectedMessage)
      user2Probe.expectMsg(expectedMessage)
    }

    "broadcast show votes" in {
      val (user, userProbe)   = createUser(UUID.randomUUID(), "user1", true, "3")
      val (user2, user2Probe) = createUser(UUID.randomUUID(), "user2", true, "5")
      val actingUserId        = UUID.randomUUID()
      val roomRef             = createRoom(UUID.randomUUID(), List(user, user2))
      val expectedMessage =
        WSMessage(MessageType.Show, roomRef.underlyingActor.roomId, actingUserId, WSMessage.NoExtra)

      roomRef ! Room.ShowVotes(actingUserId)

      userProbe.expectMsg(expectedMessage)
      user2Probe.expectMsg(expectedMessage)
    }

    "vote and broadcast it" in {
      val estimation          = "5"
      val (user, userProbe)   = createUser(UUID.randomUUID(), "user1", false, "")
      val (user2, user2Probe) = createUser(UUID.randomUUID(), "user2", false, "")
      val actingUserId        = user.id
      val roomRef             = createRoom(UUID.randomUUID(), List(user, user2))
      val expectedMessage =
        WSMessage(MessageType.Vote, roomRef.underlyingActor.roomId, actingUserId, estimation)

      roomRef ! Room.Vote(actingUserId, estimation)

      roomRef.underlyingActor.users.foreach { u =>
        if (u.id == actingUserId) {
          u.voted mustBe true
          u.estimation mustBe estimation
        } else {
          u.voted mustBe false
          u.estimation mustBe ""
        }
      }

      userProbe.expectMsg(expectedMessage)
      user2Probe.expectMsg(expectedMessage)
    }

    "leave room and broadcast it" in {
      val (user, userProbe)   = createUser(UUID.randomUUID(), "user1", false, "")
      val (user2, user2Probe) = createUser(UUID.randomUUID(), "user2", false, "")
      val actingUserId        = user.id
      val roomRef             = createRoom(UUID.randomUUID(), List(user, user2))
      val expectedMessage = WSMessage(
        MessageType.Leave,
        roomRef.underlyingActor.roomId,
        actingUserId,
        WSMessage.NoExtra
      )

      roomRef ! Room.Leave(actingUserId)

      roomRef.underlyingActor.users mustBe List(user2)

      userProbe.expectNoMessage()
      user2Probe.expectMsg(expectedMessage)
    }

    "stop itself if empty" in {
      val watcher = TestProbe()
      val user    = Room.User(UUID.randomUUID(), "user1", false, "", Actor.noSender)
      val user2   = Room.User(UUID.randomUUID(), "user2", false, "", Actor.noSender)
      val roomRef = system.actorOf(Room.props(UUID.randomUUID()))

      watcher.watch(roomRef)

      roomRef ! Room.Join(user)
      roomRef ! Room.Join(user2)

      roomRef ! Room.Leave(user.id)
      roomRef ! Room.Leave(user2.id)

      watcher.expectTerminated(roomRef)
    }

    "join the room, get all info, and broadcast it" in {
      val (user, userProbe)   = createUser(UUID.randomUUID(), "user1", true, "5")
      val (user2, user2Probe) = createUser(UUID.randomUUID(), "user2", false, "")
      val roomRef             = createRoom(UUID.randomUUID(), List(user, user2))
      roomRef.underlyingActor.currentIssue = "current issue"
      roomRef.underlyingActor.issueLastEditBy = Option(user.id)

      val newUserProbe = TestProbe()
      val newUser      = Room.User(UUID.randomUUID(), "new user", false, "", newUserProbe.ref)

      val expectedMessage =
        WSMessage(MessageType.Join, roomRef.underlyingActor.roomId, newUser.id, newUser.name)

      roomRef ! Room.Join(newUser)

      roomRef.underlyingActor.users mustBe List(newUser, user, user2)

      userProbe.expectMsg(expectedMessage)
      user2Probe.expectMsg(expectedMessage)

      newUserProbe.expectMsg(
        WSMessage(MessageType.Init, roomRef.underlyingActor.roomId, newUser.id, newUser.name)
      )
      newUserProbe.expectMsg(
        WSMessage(
          MessageType.EditIssue,
          roomRef.underlyingActor.roomId,
          user.id,
          roomRef.underlyingActor.currentIssue
        )
      )
      newUserProbe.expectMsg(
        WSMessage(MessageType.Join, roomRef.underlyingActor.roomId, newUser.id, newUser.name)
      )
      newUserProbe.expectMsg(
        WSMessage(MessageType.Join, roomRef.underlyingActor.roomId, user.id, user.name)
      )
      newUserProbe.expectMsg(
        WSMessage(MessageType.Vote, roomRef.underlyingActor.roomId, user.id, user.estimation)
      )
      newUserProbe.expectMsg(
        WSMessage(MessageType.Join, roomRef.underlyingActor.roomId, user2.id, user2.name)
      )
    }
  }
}

object RoomSpec {
  def createUser(uuid: UUID, name: String, voted: Boolean, estimation: String)(implicit
      system: ActorSystem
  ): (Room.User, TestProbe) = {
    val probe = TestProbe()
    val user  = Room.User(uuid, name, voted, estimation, probe.ref)
    (user, probe)
  }

  def createRoom(roomId: UUID, users: List[Room.User])(implicit
      system: ActorSystem
  ): TestActorRef[Room] = {
    val roomRef = TestActorRef[Room](Room.props(roomId))
    roomRef.underlyingActor.users = users
    roomRef
  }
}
