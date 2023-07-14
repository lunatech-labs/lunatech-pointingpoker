package com.lunatech.pointingpoker.actors

import java.util.UUID

import org.apache.pekko.actor.testkit.typed.scaladsl.{ActorTestKit, BehaviorTestKit}
import org.apache.pekko.actor.typed.ActorRef
import org.apache.pekko.testkit.TestProbe
import com.lunatech.pointingpoker.actors.Room.RoomData
import com.lunatech.pointingpoker.websocket.WSMessage
import com.lunatech.pointingpoker.websocket.WSMessage.MessageType
import org.scalatest.BeforeAndAfterAll
import org.scalatest.matchers.must
import org.scalatest.wordspec.AnyWordSpec

class RoomSpec extends AnyWordSpec with must.Matchers with BeforeAndAfterAll {
  import RoomSpec._

  implicit val testKit: ActorTestKit = ActorTestKit()

  override def afterAll(): Unit = {
    testKit.shutdownTestKit()
  }

  "Room Actor" should {
    "update current issue and broadcast it" in {
      val issue               = "Issue test 1"
      val (user, userProbe)   = createUser(UUID.randomUUID(), "user1", false, "")
      val (user2, user2Probe) = createUser(UUID.randomUUID(), "user2", false, "")
      val dataProbe           = testKit.createTestProbe[Room.DataStatus]()
      val actingUserId        = UUID.randomUUID()
      val (roomId, roomRef) = createRoom(
        UUID.randomUUID(),
        RoomData.empty.copy(users = List(user, user2))
      )

      val expectedMessage = WSMessage(MessageType.EditIssue, roomId, actingUserId, issue)
      val expectedData = Room.DataStatus(data =
        RoomData(
          users = List(user, user2),
          currentIssue = issue,
          issueLastEditBy = Option(actingUserId)
        )
      )

      roomRef ! Room.EditIssue(actingUserId, issue)

      roomRef ! Room.GetData(dataProbe.ref)

      userProbe.expectMsg(expectedMessage)
      user2Probe.expectMsg(expectedMessage)

      dataProbe.expectMessage(expectedData)
    }

    "clear votes and broadcast it" in {
      val (user, userProbe)   = createUser(UUID.randomUUID(), "user1", true, "3")
      val (user2, user2Probe) = createUser(UUID.randomUUID(), "user2", true, "5")
      val dataProbe           = testKit.createTestProbe[Room.DataStatus]()
      val actingUserId        = UUID.randomUUID()
      val (roomId, roomRef) = createRoom(
        UUID.randomUUID(),
        RoomData.empty.copy(users = List(user, user2))
      )

      val expectedMessage = WSMessage(
        MessageType.Clear,
        roomId,
        actingUserId,
        WSMessage.NoExtra
      )
      val expectedData = Room.DataStatus(data =
        RoomData.empty.copy(users =
          List(
            user.copy(voted = false, estimation = ""),
            user2.copy(voted = false, estimation = "")
          )
        )
      )

      roomRef ! Room.ClearVotes(actingUserId)

      roomRef ! Room.GetData(dataProbe.ref)

      userProbe.expectMsg(expectedMessage)
      user2Probe.expectMsg(expectedMessage)

      dataProbe.expectMessage(expectedData)
    }

    "broadcast show votes" in {
      val (user, userProbe)   = createUser(UUID.randomUUID(), "user1", true, "3")
      val (user2, user2Probe) = createUser(UUID.randomUUID(), "user2", true, "5")
      val actingUserId        = UUID.randomUUID()
      val (roomId, roomRef) = createRoom(
        UUID.randomUUID(),
        RoomData.empty.copy(users = List(user, user2))
      )
      val expectedMessage =
        WSMessage(MessageType.Show, roomId, actingUserId, WSMessage.NoExtra)

      roomRef ! Room.ShowVotes(actingUserId)

      userProbe.expectMsg(expectedMessage)
      user2Probe.expectMsg(expectedMessage)
    }

    "vote and broadcast it" in {
      val estimation          = "5"
      val (user, userProbe)   = createUser(UUID.randomUUID(), "user1", false, "")
      val (user2, user2Probe) = createUser(UUID.randomUUID(), "user2", false, "")
      val dataProbe           = testKit.createTestProbe[Room.DataStatus]()
      val actingUserId        = user.id
      val (roomId, roomRef) = createRoom(
        UUID.randomUUID(),
        RoomData.empty.copy(users = List(user, user2))
      )
      val expectedMessage = WSMessage(MessageType.Vote, roomId, actingUserId, estimation)
      val expectedData = Room.DataStatus(data =
        RoomData.empty.copy(users = List(user.copy(voted = true, estimation = estimation), user2))
      )

      roomRef ! Room.Vote(actingUserId, estimation)

      roomRef ! Room.GetData(dataProbe.ref)

      userProbe.expectMsg(expectedMessage)
      user2Probe.expectMsg(expectedMessage)

      dataProbe.expectMessage(expectedData)
    }

    "leave room and broadcast it" in {
      val (user, userProbe)   = createUser(UUID.randomUUID(), "user1", false, "")
      val (user2, user2Probe) = createUser(UUID.randomUUID(), "user2", false, "")
      val dataProbe           = testKit.createTestProbe[Room.DataStatus]()
      val roomResponseProbe   = testKit.createTestProbe[Room.Response]()
      val actingUserId        = user.id
      val (roomId, roomRef) = createRoom(
        UUID.randomUUID(),
        RoomData.empty.copy(users = List(user, user2))
      )
      val expectedMessage = WSMessage(
        MessageType.Leave,
        roomId,
        actingUserId,
        WSMessage.NoExtra
      )
      val expectedData = Room.DataStatus(data = RoomData.empty.copy(users = List(user2)))

      roomRef ! Room.Leave(actingUserId, roomResponseProbe.ref)

      roomRef ! Room.GetData(dataProbe.ref)

      userProbe.expectNoMessage()
      user2Probe.expectMsg(expectedMessage)
      roomResponseProbe.expectMessage(Room.Running(roomId))

      dataProbe.expectMessage(expectedData)
    }

    "stop itself if empty" in {
      val probe             = TestProbe()(testKit.system.classicSystem)
      val user              = Room.User(UUID.randomUUID(), "user1", false, "", probe.ref)
      val user2             = Room.User(UUID.randomUUID(), "user2", false, "", probe.ref)
      val roomResponseProbe = testKit.createTestProbe[Room.Response]()

      val roomId          = UUID.randomUUID()
      val behaviorTestKit = BehaviorTestKit(Room(roomId), roomId.toString)

      behaviorTestKit.run(Room.Join(user))
      behaviorTestKit.run(Room.Join(user2))
      behaviorTestKit.run(Room.Leave(user.id, roomResponseProbe.ref))
      behaviorTestKit.run(Room.Leave(user2.id, roomResponseProbe.ref))
      behaviorTestKit.isAlive mustBe false
    }

    "join the room, get all info, and broadcast it" in {
      val issue               = "current issue"
      val (user, userProbe)   = createUser(UUID.randomUUID(), "user1", true, "5")
      val (user2, user2Probe) = createUser(UUID.randomUUID(), "user2", false, "")
      val dataProbe           = testKit.createTestProbe[Room.DataStatus]()
      val internalData = RoomData(
        users = List(user, user2),
        currentIssue = issue,
        issueLastEditBy = Option(user.id)
      )
      val (roomId, roomRef) = createRoom(UUID.randomUUID(), internalData)

      val newUserProbe = TestProbe()(testKit.system.classicSystem)
      val newUser      = Room.User(UUID.randomUUID(), "new user", false, "", newUserProbe.ref)

      val expectedMessage = WSMessage(MessageType.Join, roomId, newUser.id, newUser.name)
      val expectedData =
        Room.DataStatus(data =
          RoomData(
            users = List(newUser, user, user2),
            currentIssue = issue,
            issueLastEditBy = Option(user.id)
          )
        )

      roomRef ! Room.Join(newUser)

      roomRef ! Room.GetData(dataProbe.ref)

      userProbe.expectMsg(expectedMessage)
      user2Probe.expectMsg(expectedMessage)

      newUserProbe.expectMsg(
        WSMessage(MessageType.Init, roomId, newUser.id, newUser.name)
      )
      newUserProbe.expectMsg(
        WSMessage(
          MessageType.EditIssue,
          roomId,
          user.id,
          internalData.currentIssue
        )
      )
      newUserProbe.expectMsg(
        WSMessage(MessageType.Join, roomId, newUser.id, newUser.name)
      )
      newUserProbe.expectMsg(
        WSMessage(MessageType.Join, roomId, user.id, user.name)
      )
      newUserProbe.expectMsg(
        WSMessage(MessageType.Vote, roomId, user.id, user.estimation)
      )
      newUserProbe.expectMsg(
        WSMessage(MessageType.Join, roomId, user2.id, user2.name)
      )

      dataProbe.expectMessage(expectedData)
    }
  }
}

object RoomSpec {
  def createUser(uuid: UUID, name: String, voted: Boolean, estimation: String)(implicit
      testKit: ActorTestKit
  ): (Room.User, TestProbe) = {
    val probe = TestProbe()(testKit.system.classicSystem)
    val user  = Room.User(uuid, name, voted, estimation, probe.ref)
    (user, probe)
  }

  def createRoom(roomId: UUID, data: RoomData)(implicit
      testKit: ActorTestKit
  ): (UUID, ActorRef[Room.Command]) = {
    val roomRef = testKit.spawn[Room.Command](Room.receiveBehaviour(roomId, data))
    (roomId, roomRef)
  }
}
