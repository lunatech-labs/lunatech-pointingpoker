package com.lunatech.pointingpoker.actors

import java.util.UUID

import scala.concurrent.ExecutionContext

import org.apache.pekko.actor.testkit.typed.scaladsl.{ActorTestKit, BehaviorTestKit}
import org.apache.pekko.testkit.*
import com.lunatech.pointingpoker.actors.RoomManager.RoomManagerData
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
      val roomId            = UUID.randomUUID()
      val roomProbe         = testKit.createTestProbe[Room.Command]()
      val roomResponseProbe = testKit.createTestProbe[Room.Response]()
      val managerRef        = testKit.spawn(
        RoomManager
          .receiveBehaviour(RoomManagerData(Map(roomId -> roomProbe.ref)), roomResponseProbe.ref)
      )
      val user1Probe = TestProbe()(testKit.system.classicSystem)
      val user2Probe = TestProbe()(testKit.system.classicSystem)
      val token1     = Room.SessionToken.mint()
      val token2     = Room.SessionToken.mint()
      val userId1    = UUID.randomUUID()
      val userId2    = UUID.randomUUID()

      managerRef ! RoomManager.ConnectToRoom(roomId, userId1, user1Name, token1, user1Probe.ref)
      managerRef ! RoomManager.ConnectToRoom(roomId, userId2, user2Name, token2, user2Probe.ref)

      roomProbe.expectMessage(
        Room.Join(Room.User(userId1, user1Name, false, "", user1Probe.ref, token1))
      )
      roomProbe.expectMessage(
        Room.Join(Room.User(userId2, user2Name, false, "", user2Probe.ref, token2))
      )
    }

    "no-op ConnectToRoom for an unknown room" in {
      val behaviorTestKit = BehaviorTestKit(RoomManager())
      val unknownRoomId   = UUID.randomUUID()
      val probe           = TestProbe()(testKit.system.classicSystem)

      // Drain the MessageAdapter effect that RoomManager()'s Behaviors.setup records on
      // startup, so the assertion below reflects only effects from handling ConnectToRoom.
      behaviorTestKit.retrieveAllEffects()

      behaviorTestKit.run(
        RoomManager.ConnectToRoom(
          unknownRoomId,
          UUID.randomUUID(),
          "Alice",
          Room.SessionToken.mint(),
          probe.ref
        )
      )

      behaviorTestKit.retrieveAllEffects() mustBe empty
    }

    "pass RequestSession through to the room, auto-creating it if needed" in {
      val behaviorTestKit = BehaviorTestKit(RoomManager())
      val roomId          = UUID.randomUUID()
      val sessionProbe    = testKit.createTestProbe[Room.SessionMinted]()

      behaviorTestKit.run(RoomManager.RequestSession(roomId, "Alice", sessionProbe.ref))

      val childInbox = behaviorTestKit.childInbox[Room.Command](roomId.toString)
      childInbox.expectMessage(Room.RequestSession("Alice", sessionProbe.ref))
    }

    "pass ValidateToken through to an existing room" in {
      val roomId            = UUID.randomUUID()
      val roomProbe         = testKit.createTestProbe[Room.Command]()
      val roomResponseProbe = testKit.createTestProbe[Room.Response]()
      val managerRef        = testKit.spawn(
        RoomManager
          .receiveBehaviour(RoomManagerData(Map(roomId -> roomProbe.ref)), roomResponseProbe.ref)
      )
      val resultProbe = testKit.createTestProbe[Room.TokenResolution]()
      val token       = Room.SessionToken.mint()

      managerRef ! RoomManager.ValidateToken(roomId, token, resultProbe.ref)

      roomProbe.expectMessage(Room.ValidateToken(token, resultProbe.ref))
    }

    "pass RequestSession through to an existing room without creating a new one" in {
      val roomId            = UUID.randomUUID()
      val roomProbe         = testKit.createTestProbe[Room.Command]()
      val roomResponseProbe = testKit.createTestProbe[Room.Response]()
      val managerRef        = testKit.spawn(
        RoomManager
          .receiveBehaviour(RoomManagerData(Map(roomId -> roomProbe.ref)), roomResponseProbe.ref)
      )
      val sessionProbe = testKit.createTestProbe[Room.SessionMinted]()

      managerRef ! RoomManager.RequestSession(roomId, "Alice", sessionProbe.ref)

      roomProbe.expectMessage(Room.RequestSession("Alice", sessionProbe.ref))
    }

    "resolve ValidateToken against an unknown room as Unresolved instead of creating it" in {
      val behaviorTestKit = BehaviorTestKit(RoomManager())
      val roomId          = UUID.randomUUID()
      val resultProbe     = testKit.createTestProbe[Room.TokenResolution]()

      // Drain the MessageAdapter effect that RoomManager()'s Behaviors.setup records on
      // startup, so the assertion below reflects only effects from handling ValidateToken.
      behaviorTestKit.retrieveAllEffects()

      behaviorTestKit.run(
        RoomManager.ValidateToken(roomId, Room.SessionToken.mint(), resultProbe.ref)
      )

      resultProbe.expectMessage(Room.Unresolved)
      behaviorTestKit.retrieveAllEffects() mustBe empty
    }

    "connect a user via SSE.source and register it with ConnectToRoom" in {
      import com.lunatech.pointingpoker.sse.SSE
      given ExecutionContext                     = testKit.system.executionContext
      given org.apache.pekko.stream.Materializer =
        org.apache.pekko.stream.Materializer.matFromSystem(testKit.system.classicSystem)

      val roomId       = UUID.randomUUID()
      val userId       = UUID.randomUUID()
      val token        = Room.SessionToken.mint()
      val classicProbe = org.apache.pekko.testkit.TestProbe()(testKit.system.classicSystem)

      // ConnectToRoom is sent to a classic ActorRef in production (roomManager.toClassic),
      // so drive SSE.source with a classic probe standing in for it.
      SSE
        .source(classicProbe.ref, roomId, userId, "user 1", token)
        .to(org.apache.pekko.stream.scaladsl.Sink.ignore)
        .run()

      classicProbe.expectMsgPF() { case RoomManager.ConnectToRoom(rId, uId, name, tok, _) =>
        rId mustBe roomId
        uId mustBe userId
        name mustBe "user 1"
        tok mustBe token
      }
    }

    "report stream termination to the room manager as ConnectionCompleted" in {
      import com.lunatech.pointingpoker.sse.SSE
      given ExecutionContext                     = testKit.system.executionContext
      given org.apache.pekko.stream.Materializer =
        org.apache.pekko.stream.Materializer.matFromSystem(testKit.system.classicSystem)

      val roomId       = UUID.randomUUID()
      val userId       = UUID.randomUUID()
      val token        = Room.SessionToken.mint()
      val classicProbe = org.apache.pekko.testkit.TestProbe()(testKit.system.classicSystem)

      // Sink.cancelled cancels downstream demand immediately, terminating the source.
      SSE
        .source(classicProbe.ref, roomId, userId, "user 1", token)
        .to(org.apache.pekko.stream.scaladsl.Sink.cancelled)
        .run()

      classicProbe.expectMsgPF() { case RoomManager.ConnectToRoom(_, uId, _, _, _) =>
        uId mustBe userId
      }
      classicProbe.expectMsgPF() { case RoomManager.ConnectionCompleted(rId, uId, _) =>
        rId mustBe roomId
        uId mustBe userId
      }
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
      val ref    = TestProbe()(testKit.system.classicSystem).ref

      managerRef ! RoomManager.ConnectionCompleted(roomId, userId, ref)

      roomProbe.expectMessage(Room.Leave(userId, ref, roomResponseProbe.ref))
    }

    "handle connection failure by removing the user from the room" in {
      val roomId            = UUID.randomUUID()
      val roomProbe         = testKit.createTestProbe[Room.Command]()
      val roomResponseProbe = testKit.createTestProbe[Room.Response]()
      val managerRef        = testKit.spawn(
        RoomManager
          .receiveBehaviour(RoomManagerData(Map(roomId -> roomProbe.ref)), roomResponseProbe.ref)
      )
      val userId = UUID.randomUUID()
      val ref    = TestProbe()(testKit.system.classicSystem).ref

      managerRef ! RoomManager.ConnectionFailure(roomId, userId, ref, new RuntimeException("boom"))

      roomProbe.expectMessage(Room.Leave(userId, ref, roomResponseProbe.ref))
    }

    "handle typed per-command messages" in {
      val roomId            = UUID.randomUUID()
      val roomProbe         = testKit.createTestProbe[Room.Command]()
      val roomResponseProbe = testKit.createTestProbe[Room.Response]()
      val managerRef        = testKit.spawn(
        RoomManager
          .receiveBehaviour(RoomManagerData(Map(roomId -> roomProbe.ref)), roomResponseProbe.ref)
      )
      val token = Room.SessionToken.mint()

      managerRef ! RoomManager.Vote(roomId, Some(token), "5")
      managerRef ! RoomManager.Show(roomId, Some(token))
      managerRef ! RoomManager.Clear(roomId, Some(token))
      managerRef ! RoomManager.Revote(roomId, Some(token))
      managerRef ! RoomManager.EditIssue(roomId, Some(token), "issue name")

      roomProbe.expectMessage(Room.Vote(token, "5"))
      roomProbe.expectMessage(Room.ShowVotes(token))
      roomProbe.expectMessage(Room.ClearVotes(token))
      roomProbe.expectMessage(Room.ReVote(token))
      roomProbe.expectMessage(Room.EditIssue(token, "issue name"))
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

      managerRef ! RoomManager.Vote(unknownRoomId, Some(Room.SessionToken.mint()), "5")

      roomProbe.expectNoMessage()
    }

    "no-op a command with no session token, without asking the room" in {
      val roomId            = UUID.randomUUID()
      val roomProbe         = testKit.createTestProbe[Room.Command]()
      val roomResponseProbe = testKit.createTestProbe[Room.Response]()
      val managerRef        = testKit.spawn(
        RoomManager
          .receiveBehaviour(RoomManagerData(Map(roomId -> roomProbe.ref)), roomResponseProbe.ref)
      )

      managerRef ! RoomManager.Vote(roomId, None, "5")

      roomProbe.expectNoMessage()
    }

    "keep a member's vote when ConnectToRoom re-registers them after a reconnect" in {
      val roomId        = UUID.randomUUID()
      val userId        = UUID.randomUUID()
      val token         = Room.SessionToken.mint()
      val firstProbe    = TestProbe()(testKit.system.classicSystem)
      val secondProbe   = TestProbe()(testKit.system.classicSystem)
      val roomRef       = testKit.spawn(Room(roomId))
      val responseProbe = testKit.createTestProbe[Room.Response]()
      val dataProbe     = testKit.createTestProbe[Room.DataStatus]()
      val managerRef    = testKit.spawn(
        RoomManager.receiveBehaviour(RoomManagerData(Map(roomId -> roomRef)), responseProbe.ref)
      )

      managerRef ! RoomManager.ConnectToRoom(roomId, userId, "Alice", token, firstProbe.ref)
      // Waits for the room's own catch-up send, so the Join it forwards asynchronously via
      // managerRef is guaranteed applied before Vote is sent directly to roomRef below.
      firstProbe.expectMsgType[RoomSnapshot]
      roomRef ! Room.Vote(token, "5")
      managerRef ! RoomManager.ConnectToRoom(roomId, userId, "Alice", token, secondProbe.ref)
      roomRef ! Room.GetData(dataProbe.ref)

      val users = dataProbe.expectMessageType[Room.DataStatus].data.users
      users.map(u => (u.voted, u.estimation)) mustBe List((true, "5"))
    }
  }
end RoomManagerSpec
