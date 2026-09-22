package com.lunatech.pointingpoker.actors

import java.util.UUID

import scala.concurrent.ExecutionContext
import scala.concurrent.duration.DurationInt

import org.apache.pekko.actor.testkit.typed.scaladsl.{ActorTestKit, BehaviorTestKit}
import org.apache.pekko.testkit.*
import com.lunatech.pointingpoker.actors.RoomDataFixtures.*
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
      val managerRef = testKit.spawn(RoomManager(testGracePeriod, testStopAfterIdle))
      val sender     = testKit.createTestProbe[RoomManager.Response]()

      managerRef ! RoomManager.CreateRoom(sender.ref)

      sender.expectMessageType[RoomManager.RoomId]
    }

    "connect user to room" in {
      val roomId     = UUID.randomUUID()
      val roomProbe  = testKit.createTestProbe[Room.Command]()
      val managerRef =
        testKit.spawn(
          RoomManager.receiveBehaviour(
            RoomManagerData(Map(roomId -> roomProbe.ref)),
            testGracePeriod,
            testStopAfterIdle
          )
        )
      val user1Probe    = TestProbe()(testKit.system.classicSystem)
      val user2Probe    = TestProbe()(testKit.system.classicSystem)
      val token1        = Room.SessionToken.mint()
      val token2        = Room.SessionToken.mint()
      val userId1       = UUID.randomUUID()
      val userId2       = UUID.randomUUID()
      val connectionId1 = newConnectionId()
      val connectionId2 = newConnectionId()

      managerRef ! RoomManager.ConnectToRoom(
        roomId,
        userId1,
        user1Name,
        token1,
        connectionId1,
        user1Probe.ref
      )
      managerRef ! RoomManager.ConnectToRoom(
        roomId,
        userId2,
        user2Name,
        token2,
        connectionId2,
        user2Probe.ref
      )

      roomProbe.expectMessage(Room.Join(userId1, user1Name, token1, connectionId1, user1Probe.ref))
      roomProbe.expectMessage(Room.Join(userId2, user2Name, token2, connectionId2, user2Probe.ref))
    }

    "no-op ConnectToRoom for an unknown room" in {
      val behaviorTestKit = BehaviorTestKit(RoomManager(testGracePeriod, testStopAfterIdle))
      val unknownRoomId   = UUID.randomUUID()
      val probe           = TestProbe()(testKit.system.classicSystem)

      // No startup effects to drain: setup no longer spawns a MessageAdapter on this branch.
      behaviorTestKit.retrieveAllEffects()

      behaviorTestKit.run(
        RoomManager.ConnectToRoom(
          unknownRoomId,
          UUID.randomUUID(),
          "Alice",
          Room.SessionToken.mint(),
          newConnectionId(),
          probe.ref
        )
      )

      behaviorTestKit.retrieveAllEffects() mustBe empty
    }

    "pass RequestSession through to the room, auto-creating it if needed" in {
      val behaviorTestKit = BehaviorTestKit(RoomManager(testGracePeriod, testStopAfterIdle))
      val roomId          = UUID.randomUUID()
      val sessionProbe    = testKit.createTestProbe[Room.SessionMinted]()

      behaviorTestKit.run(RoomManager.RequestSession(roomId, "Alice", sessionProbe.ref))

      val childInbox = behaviorTestKit.childInbox[Room.Command](roomId.toString)
      childInbox.expectMessage(Room.RequestSession("Alice", sessionProbe.ref))
    }

    "pass ValidateToken through to an existing room" in {
      val roomId     = UUID.randomUUID()
      val roomProbe  = testKit.createTestProbe[Room.Command]()
      val managerRef =
        testKit.spawn(
          RoomManager.receiveBehaviour(
            RoomManagerData(Map(roomId -> roomProbe.ref)),
            testGracePeriod,
            testStopAfterIdle
          )
        )
      val resultProbe = testKit.createTestProbe[Room.TokenResolution]()
      val token       = Room.SessionToken.mint()

      managerRef ! RoomManager.ValidateToken(roomId, token, resultProbe.ref)

      roomProbe.expectMessage(Room.ValidateToken(token, resultProbe.ref))
    }

    "pass RequestSession through to an existing room without creating a new one" in {
      val roomId     = UUID.randomUUID()
      val roomProbe  = testKit.createTestProbe[Room.Command]()
      val managerRef =
        testKit.spawn(
          RoomManager.receiveBehaviour(
            RoomManagerData(Map(roomId -> roomProbe.ref)),
            testGracePeriod,
            testStopAfterIdle
          )
        )
      val sessionProbe = testKit.createTestProbe[Room.SessionMinted]()

      managerRef ! RoomManager.RequestSession(roomId, "Alice", sessionProbe.ref)

      roomProbe.expectMessage(Room.RequestSession("Alice", sessionProbe.ref))
    }

    "resolve ValidateToken against an unknown room as Unresolved instead of creating it" in {
      val behaviorTestKit = BehaviorTestKit(RoomManager(testGracePeriod, testStopAfterIdle))
      val roomId          = UUID.randomUUID()
      val resultProbe     = testKit.createTestProbe[Room.TokenResolution]()

      // No startup effects to drain: setup no longer spawns a MessageAdapter on this branch.
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
      val connectionId = newConnectionId()
      val classicProbe = org.apache.pekko.testkit.TestProbe()(testKit.system.classicSystem)

      // ConnectToRoom is sent to a classic ActorRef in production (roomManager.toClassic),
      // so drive SSE.source with a classic probe standing in for it.
      SSE
        .source(classicProbe.ref, roomId, userId, "user 1", token, connectionId)
        .to(org.apache.pekko.stream.scaladsl.Sink.ignore)
        .run()

      classicProbe.expectMsgPF() { case RoomManager.ConnectToRoom(rId, uId, name, tok, cId, _) =>
        rId mustBe roomId
        uId mustBe userId
        name mustBe "user 1"
        tok mustBe token
        cId mustBe connectionId
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
      val connectionId = newConnectionId()
      val classicProbe = org.apache.pekko.testkit.TestProbe()(testKit.system.classicSystem)

      // Sink.cancelled cancels downstream demand immediately, terminating the source.
      SSE
        .source(classicProbe.ref, roomId, userId, "user 1", token, connectionId)
        .to(org.apache.pekko.stream.scaladsl.Sink.cancelled)
        .run()

      classicProbe.expectMsgPF() { case RoomManager.ConnectToRoom(_, uId, _, _, _, _) =>
        uId mustBe userId
      }
      classicProbe.expectMsgPF() { case RoomManager.ConnectionCompleted(rId, uId, _) =>
        rId mustBe roomId
        uId mustBe userId
      }
    }

    "handle connection completed" in {
      val roomId     = UUID.randomUUID()
      val roomProbe  = testKit.createTestProbe[Room.Command]()
      val managerRef =
        testKit.spawn(
          RoomManager.receiveBehaviour(
            RoomManagerData(Map(roomId -> roomProbe.ref)),
            testGracePeriod,
            testStopAfterIdle
          )
        )
      val userId = UUID.randomUUID()
      val ref    = TestProbe()(testKit.system.classicSystem).ref

      managerRef ! RoomManager.ConnectionCompleted(roomId, userId, ref)

      roomProbe.expectMessage(Room.Leave(userId, ref))
    }

    "handle connection failure by removing the user from the room" in {
      val roomId     = UUID.randomUUID()
      val roomProbe  = testKit.createTestProbe[Room.Command]()
      val managerRef =
        testKit.spawn(
          RoomManager.receiveBehaviour(
            RoomManagerData(Map(roomId -> roomProbe.ref)),
            testGracePeriod,
            testStopAfterIdle
          )
        )
      val userId = UUID.randomUUID()
      val ref    = TestProbe()(testKit.system.classicSystem).ref

      managerRef ! RoomManager.ConnectionFailure(roomId, userId, ref, new RuntimeException("boom"))

      roomProbe.expectMessage(Room.Leave(userId, ref))
    }

    "handle typed per-command messages" in {
      val roomId     = UUID.randomUUID()
      val roomProbe  = testKit.createTestProbe[Room.Command]()
      val managerRef =
        testKit.spawn(
          RoomManager.receiveBehaviour(
            RoomManagerData(Map(roomId -> roomProbe.ref)),
            testGracePeriod,
            testStopAfterIdle
          )
        )
      val token      = Room.SessionToken.mint()
      val replyProbe = testKit.createTestProbe[Room.CommandResult]()

      managerRef ! RoomManager.Vote(roomId, Some(token), "5", replyProbe.ref)
      managerRef ! RoomManager.Show(roomId, Some(token), replyProbe.ref)
      managerRef ! RoomManager.Clear(roomId, Some(token), replyProbe.ref)
      managerRef ! RoomManager.Revote(roomId, Some(token), replyProbe.ref)
      managerRef ! RoomManager.EditIssue(roomId, Some(token), "issue name", replyProbe.ref)

      roomProbe.expectMessage(Room.Vote(token, "5", replyProbe.ref))
      roomProbe.expectMessage(Room.ShowVotes(token, replyProbe.ref))
      roomProbe.expectMessage(Room.ClearVotes(token, replyProbe.ref))
      roomProbe.expectMessage(Room.ReVote(token, replyProbe.ref))
      roomProbe.expectMessage(Room.EditIssue(token, "issue name", replyProbe.ref))
    }

    "no-op typed per-command messages for an unknown room" in {
      val knownRoomId   = UUID.randomUUID()
      val unknownRoomId = UUID.randomUUID()
      val roomProbe     = testKit.createTestProbe[Room.Command]()
      val replyProbe    = testKit.createTestProbe[Room.CommandResult]()
      val managerRef    =
        testKit.spawn(
          RoomManager.receiveBehaviour(
            RoomManagerData(Map(knownRoomId -> roomProbe.ref)),
            testGracePeriod,
            testStopAfterIdle
          )
        )

      managerRef ! RoomManager.Vote(
        unknownRoomId,
        Some(Room.SessionToken.mint()),
        "5",
        replyProbe.ref
      )

      roomProbe.expectNoMessage()
      replyProbe.expectMessage(Room.NoSession)
    }

    "no-op a command with no session token, without asking the room" in {
      val roomId     = UUID.randomUUID()
      val roomProbe  = testKit.createTestProbe[Room.Command]()
      val replyProbe = testKit.createTestProbe[Room.CommandResult]()
      val managerRef =
        testKit.spawn(
          RoomManager.receiveBehaviour(
            RoomManagerData(Map(roomId -> roomProbe.ref)),
            testGracePeriod,
            testStopAfterIdle
          )
        )

      managerRef ! RoomManager.Vote(roomId, None, "5", replyProbe.ref)

      roomProbe.expectNoMessage()
      replyProbe.expectMessage(Room.NoSession)
    }

    "answer NoSession itself for a command on a room it does not hold" in {
      val replyProbe = testKit.createTestProbe[Room.CommandResult]()
      val managerRef = testKit.spawn(RoomManager(testGracePeriod, testStopAfterIdle))

      managerRef ! RoomManager.Show(
        UUID.randomUUID(),
        Some(Room.SessionToken.mint()),
        replyProbe.ref
      )

      replyProbe.expectMessage(Room.NoSession)
    }

    "answer NoSession itself for a command with no token" in {
      val replyProbe = testKit.createTestProbe[Room.CommandResult]()
      val managerRef = testKit.spawn(RoomManager(testGracePeriod, testStopAfterIdle))

      managerRef ! RoomManager.Show(UUID.randomUUID(), None, replyProbe.ref)

      replyProbe.expectMessage(Room.NoSession)
    }

    "keep a member's vote when ConnectToRoom re-registers them after a reconnect" in {
      val roomId      = UUID.randomUUID()
      val userId      = UUID.randomUUID()
      val token       = Room.SessionToken.mint()
      val firstProbe  = TestProbe()(testKit.system.classicSystem)
      val secondProbe = TestProbe()(testKit.system.classicSystem)
      val alice       = Attendee(userId, "Alice", false, "", firstProbe.ref, token)
      // Alice's session exists before her member does, which is the state ConnectToRoom
      // always arrives in; without it the room's Join guard drops the connection.
      val roomRef = testKit.spawn(
        Room(roomId, withUsers().withMemberlessSession(alice), testGracePeriod, testStopAfterIdle)
      )
      val dataProbe  = testKit.createTestProbe[Room.DataStatus]()
      val managerRef =
        testKit.spawn(
          RoomManager.receiveBehaviour(
            RoomManagerData(Map(roomId -> roomRef)),
            testGracePeriod,
            testStopAfterIdle
          )
        )

      managerRef ! RoomManager.ConnectToRoom(
        roomId,
        userId,
        "Alice",
        token,
        alice.connectionId,
        firstProbe.ref
      )
      // Waits for the room's own catch-up send, so the Join it forwards asynchronously via
      // managerRef is guaranteed applied before Vote is sent directly to roomRef below.
      firstProbe.expectMsgType[RoomSnapshot]
      roomRef ! Room.Vote(token, "5", testKit.createTestProbe[Room.CommandResult]().ref)
      managerRef ! RoomManager.ConnectToRoom(
        roomId,
        userId,
        "Alice",
        token,
        alice.connectionId,
        secondProbe.ref
      )
      // Same barrier as above, so GetData below cannot race the reconnect's Join.
      secondProbe.expectMsgType[RoomSnapshot]
      roomRef ! Room.GetData(dataProbe.ref)

      val data = dataProbe.expectMessageType[Room.DataStatus].data
      data.estimateFor(alice) mustBe Some(("5", true))
    }

    "drop a stopped room from its map so a later request creates a fresh one" in {
      val roomId       = UUID.randomUUID()
      val idleTimeout  = 200.millis
      val sessionProbe = testKit.createTestProbe[Room.SessionMinted]()
      val managerRef   = testKit.spawn(
        RoomManager.receiveBehaviour(RoomManagerData.empty, testGracePeriod, idleTimeout)
      )

      managerRef ! RoomManager.RequestSession(roomId, "Alice", sessionProbe.ref)
      val first = sessionProbe.expectMessageType[Room.SessionMinted]

      // The room's idle tick stops it and Terminated drops it from the map; a surviving
      // original would still resolve the first token, so Unresolved is what discriminates.
      // The interval must exceed stopAfterIdle: a poll is forwarded to the room and re-arms
      // its timer, so a faster loop would keep the room busy and it would never go idle.
      sessionProbe.awaitAssert(
        {
          val tokenProbe = testKit.createTestProbe[Room.TokenResolution]()
          managerRef ! RoomManager.ValidateToken(roomId, first.token, tokenProbe.ref)
          tokenProbe.expectMessage(500.millis, Room.Unresolved)
        },
        10.seconds,
        idleTimeout * 2
      )

      managerRef ! RoomManager.RequestSession(roomId, "Alice", sessionProbe.ref)
      sessionProbe.expectMessageType[Room.SessionMinted]
    }
  }
end RoomManagerSpec
