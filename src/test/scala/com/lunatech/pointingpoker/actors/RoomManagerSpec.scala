package com.lunatech.pointingpoker.actors

import java.util.UUID

import org.apache.pekko.actor.testkit.typed.scaladsl.{ActorTestKit, BehaviorTestKit}
import org.apache.pekko.testkit.*
import com.lunatech.pointingpoker.actors.RoomManager.RoomManagerData
import com.lunatech.pointingpoker.websocket.WSMessage
import com.lunatech.pointingpoker.websocket.WSMessage.MessageType
import org.scalatest.BeforeAndAfterAll
import org.scalatest.matchers.must
import org.scalatest.wordspec.AnyWordSpec

class RoomManagerSpec extends AnyWordSpec with must.Matchers with BeforeAndAfterAll:

  val testKit: ActorTestKit = ActorTestKit()

  val user1Name = "user 1"
  val user2Name = "user 2"

  override def afterAll(): Unit =
    testKit.shutdownTestKit()

  "RoomManager Actor" should {
    "create room" in {
      val managerRef = testKit.spawn(RoomManager())
      val sender     = testKit.createTestProbe[RoomManager.Response]()

      managerRef ! RoomManager.CreateRoom(sender.ref)

      sender.expectMessageType[RoomManager.RoomId]
    }

    "connect user to room" in {
      val behaviorTestKit = BehaviorTestKit(RoomManager())

      val roomId     = UUID.randomUUID()
      val user1Probe = TestProbe()(testKit.system.classicSystem)
      val user2Probe = TestProbe()(testKit.system.classicSystem)
      val user1      = Room.User(UUID.randomUUID(), user1Name, false, "", user1Probe.ref)
      val user2      = Room.User(UUID.randomUUID(), user2Name, false, "", user2Probe.ref)

      behaviorTestKit.run(
        RoomManager
          .ConnectToRoom(WSMessage(MessageType.Join, roomId, user1.id, user1.name), user1Probe.ref)
      )
      behaviorTestKit.run(
        RoomManager
          .ConnectToRoom(WSMessage(MessageType.Join, roomId, user2.id, user2.name), user2Probe.ref)
      )

      val childInbox = behaviorTestKit.childInbox[Room.Command](roomId.toString)
      childInbox.expectMessage(Room.Command.Join(user1))
      childInbox.expectMessage(Room.Command.Join(user2))
    }

    "handle an IncomeWSMessage that generates an outcome" in {
      val roomId            = UUID.randomUUID()
      val roomProbe         = testKit.createTestProbe[Room.Command]()
      val roomResponseProbe = testKit.createTestProbe[Room.Response]()
      val managerRef = testKit.spawn(
        RoomManager
          .receiveBehaviour(RoomManagerData(Map(roomId -> roomProbe.ref)), roomResponseProbe.ref)
      )
      val userId = UUID.randomUUID()

      managerRef ! RoomManager.IncomeWSMessage(WSMessage(MessageType.Vote, roomId, userId, "5"))
      managerRef ! RoomManager.IncomeWSMessage(
        WSMessage(MessageType.EditIssue, roomId, userId, "issue name")
      )
      managerRef ! RoomManager.IncomeWSMessage(WSMessage(MessageType.Show, roomId, userId, ""))
      managerRef ! RoomManager.IncomeWSMessage(WSMessage(MessageType.Clear, roomId, userId, ""))

      roomProbe.expectMessage(Room.Command.Vote(userId, "5"))
      roomProbe.expectMessage(Room.Command.EditIssue(userId, "issue name"))
      roomProbe.expectMessage(Room.Command.ShowVotes(userId))
      roomProbe.expectMessage(Room.Command.ClearVotes(userId))
    }

    "handle IncomeWSMessage that don't generate outcome" in {
      val roomId            = UUID.randomUUID()
      val roomProbe         = testKit.createTestProbe[Room.Command]()
      val roomResponseProbe = testKit.createTestProbe[Room.Response]()
      val managerRef = testKit.spawn(
        RoomManager
          .receiveBehaviour(RoomManagerData(Map(roomId -> roomProbe.ref)), roomResponseProbe.ref)
      )
      val userId = UUID.randomUUID()

      managerRef ! RoomManager.IncomeWSMessage(
        WSMessage(MessageType.Init, roomId, userId, user1Name)
      )
      managerRef ! RoomManager.IncomeWSMessage(
        WSMessage(MessageType.Join, roomId, userId, user1Name)
      )
      managerRef ! RoomManager.IncomeWSMessage(WSMessage(MessageType.Leave, roomId, userId, ""))

      roomProbe.expectNoMessage()
    }

    "handle web socket connection completed" in {
      val roomId            = UUID.randomUUID()
      val roomProbe         = testKit.createTestProbe[Room.Command]()
      val roomResponseProbe = testKit.createTestProbe[Room.Response]()
      val managerRef = testKit.spawn(
        RoomManager
          .receiveBehaviour(RoomManagerData(Map(roomId -> roomProbe.ref)), roomResponseProbe.ref)
      )
      val userId = UUID.randomUUID()

      managerRef ! RoomManager.WSCompleted(roomId, userId)

      roomProbe.expectMessage(Room.Command.Leave(userId, roomResponseProbe.ref))
    }
  }
end RoomManagerSpec
