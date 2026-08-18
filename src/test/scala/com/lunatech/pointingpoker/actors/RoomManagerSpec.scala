package com.lunatech.pointingpoker.actors

import java.util.UUID

import scala.concurrent.ExecutionContext

import org.apache.pekko.actor.testkit.typed.scaladsl.{ActorTestKit, BehaviorTestKit}
import org.apache.pekko.testkit.*
import com.lunatech.pointingpoker.actors.RoomManager.RoomManagerData
import org.scalatest.BeforeAndAfterAll
import org.scalatest.matchers.must
import org.scalatest.wordspec.AnyWordSpec
import RoomEvent.MessageType

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
          .ConnectToRoom(RoomEvent(MessageType.Join, roomId, user1.id, user1.name), user1Probe.ref)
      )
      behaviorTestKit.run(
        RoomManager
          .ConnectToRoom(RoomEvent(MessageType.Join, roomId, user2.id, user2.name), user2Probe.ref)
      )

      val childInbox = behaviorTestKit.childInbox[Room.Command](roomId.toString)
      childInbox.expectMessage(Room.Join(user1))
      childInbox.expectMessage(Room.Join(user2))
    }

    "connect a user via SSE.source and register it with ConnectToRoom" in {
      import com.lunatech.pointingpoker.sse.SSE
      given ExecutionContext                     = testKit.system.executionContext
      given org.apache.pekko.stream.Materializer =
        org.apache.pekko.stream.Materializer.matFromSystem(testKit.system.classicSystem)

      val roomId       = UUID.randomUUID()
      val userId       = UUID.randomUUID()
      val classicProbe = org.apache.pekko.testkit.TestProbe()(testKit.system.classicSystem)

      // ConnectToRoom is sent to a classic ActorRef in production (roomManager.toClassic),
      // so drive SSE.source with a classic probe standing in for it.
      SSE
        .source(classicProbe.ref, roomId, userId, "user 1")
        .to(org.apache.pekko.stream.scaladsl.Sink.ignore)
        .run()

      classicProbe.expectMsgPF() { case RoomManager.ConnectToRoom(message, _) =>
        message.messageType mustBe com.lunatech.pointingpoker.actors.RoomEvent.MessageType.Join
        message.roomId mustBe roomId
        message.userId mustBe userId
        message.extra mustBe "user 1"
      }
    }

    "handle an IncomeWSMessage that generates an outcome" in {
      val roomId            = UUID.randomUUID()
      val roomProbe         = testKit.createTestProbe[Room.Command]()
      val roomResponseProbe = testKit.createTestProbe[Room.Response]()
      val managerRef        = testKit.spawn(
        RoomManager
          .receiveBehaviour(RoomManagerData(Map(roomId -> roomProbe.ref)), roomResponseProbe.ref)
      )
      val userId = UUID.randomUUID()

      managerRef ! RoomManager.IncomeWSMessage(RoomEvent(MessageType.Vote, roomId, userId, "5"))
      managerRef ! RoomManager.IncomeWSMessage(
        RoomEvent(MessageType.EditIssue, roomId, userId, "issue name")
      )
      managerRef ! RoomManager.IncomeWSMessage(RoomEvent(MessageType.Show, roomId, userId, ""))
      managerRef ! RoomManager.IncomeWSMessage(RoomEvent(MessageType.Clear, roomId, userId, ""))

      roomProbe.expectMessage(Room.Vote(userId, "5"))
      roomProbe.expectMessage(Room.EditIssue(userId, "issue name"))
      roomProbe.expectMessage(Room.ShowVotes(userId))
      roomProbe.expectMessage(Room.ClearVotes(userId))
    }

    "handle IncomeWSMessage that don't generate outcome" in {
      val roomId            = UUID.randomUUID()
      val roomProbe         = testKit.createTestProbe[Room.Command]()
      val roomResponseProbe = testKit.createTestProbe[Room.Response]()
      val managerRef        = testKit.spawn(
        RoomManager
          .receiveBehaviour(RoomManagerData(Map(roomId -> roomProbe.ref)), roomResponseProbe.ref)
      )
      val userId = UUID.randomUUID()

      managerRef ! RoomManager.IncomeWSMessage(
        RoomEvent(MessageType.Init, roomId, userId, user1Name)
      )
      managerRef ! RoomManager.IncomeWSMessage(
        RoomEvent(MessageType.Join, roomId, userId, user1Name)
      )
      managerRef ! RoomManager.IncomeWSMessage(RoomEvent(MessageType.Leave, roomId, userId, ""))

      roomProbe.expectNoMessage()
    }

    "handle connection completed" in {
      val roomId            = UUID.randomUUID()
      val roomProbe         = testKit.createTestProbe[Room.Command]()
      val roomResponseProbe = testKit.createTestProbe[Room.Response]()
      val managerRef        = testKit.spawn(
        RoomManager
          .receiveBehaviour(RoomManagerData(Map(roomId -> roomProbe.ref)), roomResponseProbe.ref)
      )
      val userId = UUID.randomUUID()

      managerRef ! RoomManager.ConnectionCompleted(roomId, userId)

      roomProbe.expectMessage(Room.Leave(userId, roomResponseProbe.ref))
    }

    "handle typed per-command messages" in {
      val roomId            = UUID.randomUUID()
      val roomProbe         = testKit.createTestProbe[Room.Command]()
      val roomResponseProbe = testKit.createTestProbe[Room.Response]()
      val managerRef        = testKit.spawn(
        RoomManager
          .receiveBehaviour(RoomManagerData(Map(roomId -> roomProbe.ref)), roomResponseProbe.ref)
      )
      val userId = UUID.randomUUID()

      managerRef ! RoomManager.Vote(roomId, userId, "5")
      managerRef ! RoomManager.Show(roomId, userId)
      managerRef ! RoomManager.Clear(roomId, userId)
      managerRef ! RoomManager.Revote(roomId, userId)
      managerRef ! RoomManager.EditIssue(roomId, userId, "issue name")

      roomProbe.expectMessage(Room.Vote(userId, "5"))
      roomProbe.expectMessage(Room.ShowVotes(userId))
      roomProbe.expectMessage(Room.ClearVotes(userId))
      roomProbe.expectMessage(Room.ReVote(userId))
      roomProbe.expectMessage(Room.EditIssue(userId, "issue name"))
    }

    "no-op typed per-command messages for an unknown room" in {
      val knownRoomId       = UUID.randomUUID()
      val unknownRoomId     = UUID.randomUUID()
      val roomProbe         = testKit.createTestProbe[Room.Command]()
      val roomResponseProbe = testKit.createTestProbe[Room.Response]()
      val managerRef        = testKit.spawn(
        RoomManager.receiveBehaviour(
          RoomManagerData(Map(knownRoomId -> roomProbe.ref)),
          roomResponseProbe.ref
        )
      )

      managerRef ! RoomManager.Vote(unknownRoomId, UUID.randomUUID(), "5")

      roomProbe.expectNoMessage()
    }
  }
end RoomManagerSpec
