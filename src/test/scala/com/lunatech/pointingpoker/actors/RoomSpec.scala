package com.lunatech.pointingpoker.actors

import java.util.UUID

import scala.concurrent.duration.*

import org.apache.pekko.actor.testkit.typed.scaladsl.{ActorTestKit, BehaviorTestKit}
import org.apache.pekko.actor.typed.ActorRef
import org.apache.pekko.testkit.TestProbe
import com.lunatech.pointingpoker.actors.Room.RoomData
import org.scalatest.BeforeAndAfterAll
import org.scalatest.matchers.must
import org.scalatest.wordspec.AnyWordSpec
import RoomEvent.MessageType

class RoomSpec extends AnyWordSpec with must.Matchers with BeforeAndAfterAll:
  import RoomSpec.*

  given testKit: ActorTestKit = ActorTestKit()

  override def afterAll(): Unit =
    testKit.shutdownTestKit()

  "Room Actor" should {
    "update current issue and broadcast it" in {
      val issue               = "Issue test 1"
      val (user, userProbe)   = createUser(UUID.randomUUID(), "user1", false, "")
      val (user2, user2Probe) = createUser(UUID.randomUUID(), "user2", false, "")
      val dataProbe           = testKit.createTestProbe[Room.DataStatus]()
      val (roomId, roomRef)   = createRoom(
        UUID.randomUUID(),
        RoomData.empty.copy(users = List(user, user2))
      )

      val expectedMessage = RoomEvent(MessageType.EditIssue, roomId, user.id, issue)
      val expectedData    = Room.DataStatus(data =
        RoomData(users = List(user, user2), currentIssue = issue, issueLastEditBy = Option(user.id))
      )

      roomRef ! Room.EditIssue(user.token, issue)
      roomRef ! Room.GetData(dataProbe.ref)

      userProbe.expectMsg(List(expectedMessage))
      user2Probe.expectMsg(List(expectedMessage))
      dataProbe.expectMessage(expectedData)
    }

    "clear votes and broadcast it" in {
      val (user, userProbe)   = createUser(UUID.randomUUID(), "user1", true, "3")
      val (user2, user2Probe) = createUser(UUID.randomUUID(), "user2", true, "5")
      val dataProbe           = testKit.createTestProbe[Room.DataStatus]()
      val (roomId, roomRef)   = createRoom(
        UUID.randomUUID(),
        RoomData.empty.copy(users = List(user, user2))
      )

      val expectedMessage = RoomEvent(MessageType.Clear, roomId, user.id, RoomEvent.NoExtra)
      val expectedData    = Room.DataStatus(data =
        RoomData.empty.copy(users =
          List(
            user.copy(voted = false, estimation = ""),
            user2.copy(voted = false, estimation = "")
          )
        )
      )

      roomRef ! Room.ClearVotes(user.token)
      roomRef ! Room.GetData(dataProbe.ref)

      userProbe.expectMsg(List(expectedMessage))
      user2Probe.expectMsg(List(expectedMessage))
      dataProbe.expectMessage(expectedData)
    }

    "revote and broadcast it" in {
      val (user, userProbe)   = createUser(UUID.randomUUID(), "user1", true, "3")
      val (user2, user2Probe) = createUser(UUID.randomUUID(), "user2", true, "5")
      val dataProbe           = testKit.createTestProbe[Room.DataStatus]()
      val (roomId, roomRef)   = createRoom(
        UUID.randomUUID(),
        RoomData.empty.copy(users = List(user, user2))
      )

      val expectedMessage = RoomEvent(MessageType.Revote, roomId, user.id, RoomEvent.NoExtra)
      val expectedData    = Room.DataStatus(data =
        RoomData.empty.copy(users = List(user.copy(voted = false), user2.copy(voted = false)))
      )

      roomRef ! Room.ReVote(user.token)
      roomRef ! Room.GetData(dataProbe.ref)

      userProbe.expectMsg(List(expectedMessage))
      user2Probe.expectMsg(List(expectedMessage))
      dataProbe.expectMessage(expectedData)
    }

    "broadcast show votes" in {
      val (user, userProbe)   = createUser(UUID.randomUUID(), "user1", true, "3")
      val (user2, user2Probe) = createUser(UUID.randomUUID(), "user2", true, "5")
      val (roomId, roomRef)   = createRoom(
        UUID.randomUUID(),
        RoomData.empty.copy(users = List(user, user2))
      )
      val expectedMessage = RoomEvent(MessageType.Show, roomId, user.id, RoomEvent.NoExtra)

      roomRef ! Room.ShowVotes(user.token)

      userProbe.expectMsg(List(expectedMessage))
      user2Probe.expectMsg(List(expectedMessage))
    }

    "vote and broadcast it" in {
      val estimation          = "5"
      val (user, userProbe)   = createUser(UUID.randomUUID(), "user1", false, "")
      val (user2, user2Probe) = createUser(UUID.randomUUID(), "user2", false, "")
      val dataProbe           = testKit.createTestProbe[Room.DataStatus]()
      val (roomId, roomRef)   = createRoom(
        UUID.randomUUID(),
        RoomData.empty.copy(users = List(user, user2))
      )
      val expectedMessage = RoomEvent(MessageType.Vote, roomId, user.id, estimation)
      val expectedData    = Room.DataStatus(data =
        RoomData.empty.copy(users = List(user.copy(voted = true, estimation = estimation), user2))
      )

      roomRef ! Room.Vote(user.token, estimation)
      roomRef ! Room.GetData(dataProbe.ref)

      userProbe.expectMsg(List(expectedMessage))
      user2Probe.expectMsg(List(expectedMessage))
      dataProbe.expectMessage(expectedData)
    }

    "ignore a vote from an unresolvable token" in {
      val (user, userProbe)   = createUser(UUID.randomUUID(), "user1", false, "")
      val (user2, user2Probe) = createUser(UUID.randomUUID(), "user2", false, "")
      val dataProbe           = testKit.createTestProbe[Room.DataStatus]()
      val (roomId, roomRef)   = createRoom(
        UUID.randomUUID(),
        RoomData.empty.copy(users = List(user, user2))
      )

      roomRef ! Room.Vote(Room.SessionToken.mint(), "5")
      roomRef ! Room.GetData(dataProbe.ref)

      userProbe.expectNoMessage()
      user2Probe.expectNoMessage()
      dataProbe.expectMessage(
        Room.DataStatus(data = RoomData.empty.copy(users = List(user, user2)))
      )
    }

    "delay a Leave broadcast by the grace period instead of acting immediately" in {
      val (user, userProbe)   = createUser(UUID.randomUUID(), "user1", false, "")
      val (user2, user2Probe) = createUser(UUID.randomUUID(), "user2", false, "")
      val roomResponseProbe   = testKit.createTestProbe[Room.Response]()
      val (roomId, roomRef)   = createRoom(
        UUID.randomUUID(),
        RoomData.empty.copy(users = List(user, user2)),
        gracePeriod = 200.millis
      )
      val expectedMessage = RoomEvent(MessageType.Leave, roomId, user.id, RoomEvent.NoExtra)

      roomRef ! Room.Leave(user.id, user.ref, roomResponseProbe.ref)

      user2Probe.expectNoMessage(50.millis)       // still within the grace period
      user2Probe.expectMsg(List(expectedMessage)) // arrives once the grace period elapses
    }

    "swallow a Leave entirely if the same user reconnects within the grace period" in {
      val (user, userProbe)   = createUser(UUID.randomUUID(), "user1", false, "")
      val (user2, user2Probe) = createUser(UUID.randomUUID(), "user2", false, "")
      val roomResponseProbe   = testKit.createTestProbe[Room.Response]()
      val dataProbe           = testKit.createTestProbe[Room.DataStatus]()
      val (roomId, roomRef)   = createRoom(
        UUID.randomUUID(),
        RoomData.empty.copy(users = List(user, user2)),
        gracePeriod = 200.millis
      )

      roomRef ! Room.Leave(user.id, user.ref, roomResponseProbe.ref)

      // Reconnect well within the grace period, under a new ref but the same user id/token.
      val reconnectedUserProbe = TestProbe()(testKit.system.classicSystem)
      val reconnectedUser      = user.copy(ref = reconnectedUserProbe.ref)
      roomRef ! Room.Join(reconnectedUser)

      // The room-wide Join broadcast (which includes the reconnecting user themselves) is
      // the only thing user2 should ever see - no Leave, no flicker, before or after the
      // grace period elapses.
      user2Probe.expectMsg(List(RoomEvent(MessageType.Join, roomId, user.id, user.name)))
      user2Probe.expectNoMessage(300.millis) // spans past the 200ms grace period

      roomRef ! Room.GetData(dataProbe.ref)
      dataProbe.expectMessage(
        Room.DataStatus(data = RoomData.empty.copy(users = List(reconnectedUser, user2)))
      )
      roomResponseProbe.expectNoMessage()
    }

    "leave room and broadcast it" in {
      val (user, userProbe)   = createUser(UUID.randomUUID(), "user1", false, "")
      val (user2, user2Probe) = createUser(UUID.randomUUID(), "user2", false, "")
      val dataProbe           = testKit.createTestProbe[Room.DataStatus]()
      val roomResponseProbe   = testKit.createTestProbe[Room.Response]()
      val actingUserId        = user.id
      val (roomId, roomRef)   = createRoom(
        UUID.randomUUID(),
        RoomData.empty.copy(users = List(user, user2)),
        gracePeriod = 50.millis
      )
      val expectedMessage = RoomEvent(
        MessageType.Leave,
        roomId,
        actingUserId,
        RoomEvent.NoExtra
      )
      val expectedData = Room.DataStatus(data = RoomData.empty.copy(users = List(user2)))

      roomRef ! Room.Leave(actingUserId, user.ref, roomResponseProbe.ref)

      user2Probe.expectMsg(List(expectedMessage)) // waits past the (short) grace period
      roomResponseProbe.expectMessage(Room.Running(roomId))

      roomRef ! Room.GetData(dataProbe.ref)

      userProbe.expectNoMessage()
      dataProbe.expectMessage(expectedData)
    }

    "ignore a stale leave from a ref that already got replaced by a reconnect" in {
      val (user, userProbe)   = createUser(UUID.randomUUID(), "user1", false, "")
      val (user2, user2Probe) = createUser(UUID.randomUUID(), "user2", false, "")
      val dataProbe           = testKit.createTestProbe[Room.DataStatus]()
      val roomResponseProbe   = testKit.createTestProbe[Room.Response]()
      val (roomId, roomRef)   = createRoom(
        UUID.randomUUID(),
        RoomData.empty.copy(users = List(user, user2))
      )

      // Simulate the user's browser having already reconnected (a new ref replaced
      // the old entry for the same userId) before the stale connection's own
      // termination is observed.
      val reconnectedUserProbe = TestProbe()(testKit.system.classicSystem)
      val reconnectedUser      = user.copy(ref = reconnectedUserProbe.ref)
      roomRef ! Room.Join(reconnectedUser)

      roomRef ! Room.Leave(user.id, user.ref, roomResponseProbe.ref)

      roomRef ! Room.GetData(dataProbe.ref)

      val expectedData =
        Room.DataStatus(data = RoomData.empty.copy(users = List(reconnectedUser, user2)))
      dataProbe.expectMessage(expectedData)

      // The stale leave must not broadcast a Leave event or reply, since nothing was removed.
      user2Probe.expectMsgType[List[RoomEvent]] // the Join broadcast from the reconnect
      user2Probe.expectNoMessage()
      roomResponseProbe.expectNoMessage()
    }

    "stop itself if empty" in {
      val probe = TestProbe()(testKit.system.classicSystem)
      val user  =
        Room.User(UUID.randomUUID(), "user1", false, "", probe.ref, Room.SessionToken.mint())
      val user2 =
        Room.User(UUID.randomUUID(), "user2", false, "", probe.ref, Room.SessionToken.mint())
      val roomResponseProbe = testKit.createTestProbe[Room.Response]()

      val roomId          = UUID.randomUUID()
      val behaviorTestKit = BehaviorTestKit(Room(roomId), roomId.toString)

      behaviorTestKit.run(Room.Join(user))
      behaviorTestKit.run(Room.Join(user2))
      // BehaviorTestKit doesn't drive real timers, so send the post-grace-period effect
      // directly rather than Leave (which only schedules it) - this test is about the
      // "room stops when empty" invariant, not the grace-period delay itself.
      behaviorTestKit.run(Room.ConfirmLeave(user.id, user.ref, roomResponseProbe.ref))
      behaviorTestKit.run(Room.ConfirmLeave(user2.id, user2.ref, roomResponseProbe.ref))
      behaviorTestKit.isAlive mustBe false
    }

    "replace an existing user's entry on rejoin instead of duplicating it" in {
      val (user, userProbe) = createUser(UUID.randomUUID(), "user1", true, "5")
      val dataProbe         = testKit.createTestProbe[Room.DataStatus]()
      val (roomId, roomRef) = createRoom(UUID.randomUUID(), RoomData.empty.copy(users = List(user)))

      val newRefProbe  = TestProbe()(testKit.system.classicSystem)
      val rejoinedUser = Room.User(user.id, "user1", false, "", newRefProbe.ref, user.token)

      roomRef ! Room.Join(rejoinedUser)
      roomRef ! Room.GetData(dataProbe.ref)

      dataProbe.expectMessage(
        Room.DataStatus(data = RoomData.empty.copy(users = List(rejoinedUser)))
      )
    }

    "batch the entire join replay into a single message instead of one send per event" in {
      val issue        = "current issue"
      val (user, _)    = createUser(UUID.randomUUID(), "user1", true, "5")
      val internalData =
        RoomData(users = List(user), currentIssue = issue, issueLastEditBy = Option(user.id))
      val (roomId, roomRef) = createRoom(UUID.randomUUID(), internalData)

      val newUserProbe = TestProbe()(testKit.system.classicSystem)
      val newUser      =
        Room.User(
          UUID.randomUUID(),
          "new user",
          false,
          "",
          newUserProbe.ref,
          Room.SessionToken.mint()
        )

      roomRef ! Room.Join(newUser)

      val expectedReplay = List(
        RoomEvent(MessageType.Init, roomId, newUser.id, newUser.name),
        RoomEvent(MessageType.EditIssue, roomId, user.id, issue),
        RoomEvent(MessageType.Join, roomId, newUser.id, newUser.name),
        RoomEvent(MessageType.Join, roomId, user.id, user.name),
        RoomEvent(MessageType.Vote, roomId, user.id, user.estimation)
      )

      newUserProbe.expectMsg(expectedReplay)
      // The room-wide Join broadcast (which includes the new user themselves, and which
      // the client already ignores via message.userId !== ref.user.id) is a separate,
      // pre-existing send - not part of what this test is proving.
      newUserProbe.expectMsg(List(RoomEvent(MessageType.Join, roomId, newUser.id, newUser.name)))
      newUserProbe.expectNoMessage() // proves the replay itself arrived as one message, not several
    }

    "join the room, get all info, and broadcast it" in {
      val issue               = "current issue"
      val (user, userProbe)   = createUser(UUID.randomUUID(), "user1", true, "5")
      val (user2, user2Probe) = createUser(UUID.randomUUID(), "user2", false, "")
      val dataProbe           = testKit.createTestProbe[Room.DataStatus]()
      val internalData        = RoomData(
        users = List(user, user2),
        currentIssue = issue,
        issueLastEditBy = Option(user.id)
      )
      val (roomId, roomRef) = createRoom(UUID.randomUUID(), internalData)

      val newUserProbe = TestProbe()(testKit.system.classicSystem)
      val newUser      = Room.User(
        UUID.randomUUID(),
        "new user",
        false,
        "",
        newUserProbe.ref,
        Room.SessionToken.mint()
      )

      val expectedMessage = RoomEvent(MessageType.Join, roomId, newUser.id, newUser.name)
      val expectedData    =
        Room.DataStatus(data =
          RoomData(
            users = List(newUser, user, user2),
            currentIssue = issue,
            issueLastEditBy = Option(user.id)
          )
        )

      roomRef ! Room.Join(newUser)

      roomRef ! Room.GetData(dataProbe.ref)

      userProbe.expectMsg(List(expectedMessage))
      user2Probe.expectMsg(List(expectedMessage))

      // The whole catch-up replay arrives as a single batched message, not one per event.
      newUserProbe.expectMsg(
        List(
          RoomEvent(MessageType.Init, roomId, newUser.id, newUser.name),
          RoomEvent(MessageType.EditIssue, roomId, user.id, internalData.currentIssue),
          RoomEvent(MessageType.Join, roomId, newUser.id, newUser.name),
          RoomEvent(MessageType.Join, roomId, user.id, user.name),
          RoomEvent(MessageType.Vote, roomId, user.id, user.estimation),
          RoomEvent(MessageType.Join, roomId, user2.id, user2.name)
        )
      )

      dataProbe.expectMessage(expectedData)
    }

    "mint a session and store it as pending on RequestSession" in {
      val sessionProbe      = testKit.createTestProbe[Room.SessionMinted]()
      val dataProbe         = testKit.createTestProbe[Room.DataStatus]()
      val (roomId, roomRef) = createRoom(UUID.randomUUID(), RoomData.empty)

      roomRef ! Room.RequestSession("Alice", sessionProbe.ref)

      val minted = sessionProbe.expectMessageType[Room.SessionMinted]

      roomRef ! Room.GetData(dataProbe.ref)
      val data = dataProbe.expectMessageType[Room.DataStatus]
      data.data.pendingSessions.get(minted.token) mustBe Some(
        Room.PendingSession(minted.userId, "Alice")
      )
    }

    "resolve a pending session by token" in {
      val sessionProbe = testKit.createTestProbe[Room.SessionMinted]()
      val resultProbe  = testKit.createTestProbe[Room.TokenResolution]()
      val (_, roomRef) = createRoom(UUID.randomUUID(), RoomData.empty)

      roomRef ! Room.RequestSession("Alice", sessionProbe.ref)
      val minted = sessionProbe.expectMessageType[Room.SessionMinted]

      roomRef ! Room.ValidateToken(minted.token, resultProbe.ref)

      resultProbe.expectMessage(Room.Resolved(minted.userId, "Alice"))
    }

    "resolve a confirmed member by token (reconnect)" in {
      val (user, _)    = createUser(UUID.randomUUID(), "user1", false, "")
      val resultProbe  = testKit.createTestProbe[Room.TokenResolution]()
      val (_, roomRef) = createRoom(UUID.randomUUID(), RoomData.empty.copy(users = List(user)))

      roomRef ! Room.ValidateToken(user.token, resultProbe.ref)

      resultProbe.expectMessage(Room.Resolved(user.id, user.name))
    }

    "return Unresolved for an unknown token" in {
      val resultProbe  = testKit.createTestProbe[Room.TokenResolution]()
      val (_, roomRef) = createRoom(UUID.randomUUID(), RoomData.empty)

      roomRef ! Room.ValidateToken(Room.SessionToken.mint(), resultProbe.ref)

      resultProbe.expectMessage(Room.Unresolved)
    }

    "clear the pending session once Join promotes it to a member" in {
      val sessionProbe      = testKit.createTestProbe[Room.SessionMinted]()
      val dataProbe         = testKit.createTestProbe[Room.DataStatus]()
      val userProbe         = TestProbe()(testKit.system.classicSystem)
      val (roomId, roomRef) = createRoom(UUID.randomUUID(), RoomData.empty)

      roomRef ! Room.RequestSession("Alice", sessionProbe.ref)
      val minted = sessionProbe.expectMessageType[Room.SessionMinted]

      roomRef ! Room.Join(Room.User(minted.userId, "Alice", false, "", userProbe.ref, minted.token))
      roomRef ! Room.GetData(dataProbe.ref)

      val data = dataProbe.expectMessageType[Room.DataStatus]
      data.data.pendingSessions.get(minted.token) mustBe None
      data.data.users.map(_.id) must contain(minted.userId)
    }
  }
end RoomSpec

object RoomSpec:
  def createUser(uuid: UUID, name: String, voted: Boolean, estimation: String)(using
      testKit: ActorTestKit
  ): (Room.User, TestProbe) =
    val probe = TestProbe()(testKit.system.classicSystem)
    val user  = Room.User(uuid, name, voted, estimation, probe.ref, Room.SessionToken.mint())
    (user, probe)

  def createRoom(
      roomId: UUID,
      data: RoomData,
      gracePeriod: FiniteDuration = Room.defaultGracePeriod
  )(using
      testKit: ActorTestKit
  ): (UUID, ActorRef[Room.Command]) =
    val roomRef = testKit.spawn[Room.Command](Room(roomId, data, gracePeriod))
    (roomId, roomRef)
end RoomSpec
