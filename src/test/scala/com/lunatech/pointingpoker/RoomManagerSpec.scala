package com.lunatech.pointingpoker

import java.util.UUID

import akka.actor.{ActorRef, ActorSystem, Props}
import akka.testkit._
import com.lunatech.pointingpoker.websocket.WSMessage
import com.lunatech.pointingpoker.websocket.WSMessage.MessageType
import com.typesafe.config.ConfigFactory
import org.scalatest.BeforeAndAfterAll
import org.scalatest.wordspec.AnyWordSpec
import org.scalatest.matchers.must

class RoomManagerSpec extends AnyWordSpec with must.Matchers with BeforeAndAfterAll {

  implicit val system: ActorSystem = ActorSystem(
    "RoomSpec",
    ConfigFactory.parseString("""akka.loggers = ["akka.testkit.TestEventListener"]""")
  )

  override def afterAll(): Unit = {
    system.terminate()
  }

  "RoomManager Actor" should {
    "create room" in {
      val managerRef = TestActorRef[RoomManager]
      val sender     = TestProbe()

      managerRef.tell(RoomManager.CreateRoom, sender.ref)

      managerRef.underlyingActor.rooms.size mustBe 1

      sender.expectMsg(RoomManager.RoomId(managerRef.underlyingActor.rooms.keys.head.toString))
    }

    "connect user to room" in {
      val roomProbe = TestProbe()
      val roomId    = UUID.randomUUID()
      val managerRef = system.actorOf(Props(new RoomManager() {
        override def createRoom(roomId: UUID): ActorRef =
          roomProbe.ref
      }))

      val user1Probe = TestProbe()
      val user2Probe = TestProbe()
      val user1      = Room.User(UUID.randomUUID(), "user 1", false, "", user1Probe.ref)
      val user2      = Room.User(UUID.randomUUID(), "user 2", false, "", user2Probe.ref)

      managerRef ! RoomManager
        .ConnectToRoom(WSMessage(MessageType.Join, roomId, user1.id, user1.name), user1Probe.ref)
      managerRef ! RoomManager
        .ConnectToRoom(WSMessage(MessageType.Join, roomId, user2.id, user2.name), user2Probe.ref)

      roomProbe.expectMsg(Room.Join(user1))
      roomProbe.expectMsg(Room.Join(user2))
    }

    "handle an IncomeWSMessage that generates an outcome" in {
      val managerRef = TestActorRef[RoomManager]
      val roomProbe  = TestProbe()
      val roomId     = UUID.randomUUID()
      val userId     = UUID.randomUUID()

      managerRef.underlyingActor.rooms = Map(roomId -> roomProbe.ref)

      managerRef ! RoomManager.IncomeWSMessage(WSMessage(MessageType.Vote, roomId, userId, "5"))
      managerRef ! RoomManager.IncomeWSMessage(
        WSMessage(MessageType.EditIssue, roomId, userId, "issue name")
      )
      managerRef ! RoomManager.IncomeWSMessage(WSMessage(MessageType.Show, roomId, userId, ""))
      managerRef ! RoomManager.IncomeWSMessage(WSMessage(MessageType.Clear, roomId, userId, ""))

      roomProbe.expectMsg(Room.Vote(userId, "5"))
      roomProbe.expectMsg(Room.EditIssue(userId, "issue name"))
      roomProbe.expectMsg(Room.ShowVotes(userId))
      roomProbe.expectMsg(Room.ClearVotes(userId))
    }

    "handle IncomeWSMessage that don't generate outcome" in {
      val managerRef = TestActorRef[RoomManager]
      val roomProbe  = TestProbe()
      val roomId     = UUID.randomUUID()
      val userId     = UUID.randomUUID()

      managerRef.underlyingActor.rooms = Map(roomId -> roomProbe.ref)

      managerRef ! RoomManager.IncomeWSMessage(
        WSMessage(MessageType.Init, roomId, userId, "user 1")
      )
      managerRef ! RoomManager.IncomeWSMessage(
        WSMessage(MessageType.Join, roomId, userId, "user 1")
      )
      managerRef ! RoomManager.IncomeWSMessage(WSMessage(MessageType.Leave, roomId, userId, ""))

      roomProbe.expectNoMessage()
    }

    "handle web socket connection completed" in {
      val managerRef = TestActorRef[RoomManager]
      val roomProbe  = TestProbe()
      val roomId     = UUID.randomUUID()
      val userId     = UUID.randomUUID()

      managerRef.underlyingActor.rooms = Map(roomId -> roomProbe.ref)

      managerRef ! RoomManager.WSCompleted(roomId, userId)

      roomProbe.expectMsg(Room.Leave(userId))
    }
  }
}
