package com.lunatech.pointingpoker.actors

import java.util.UUID

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
      val actingUserId        = UUID.randomUUID()
      val (roomId, roomRef)   = createRoom(
        UUID.randomUUID(),
        RoomData.empty.copy(users = List(user, user2))
      )

      val expectedMessage = RoomEvent(MessageType.EditIssue, roomId, actingUserId, issue)
      val expectedData    = Room.DataStatus(data =
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
      val (roomId, roomRef)   = createRoom(
        UUID.randomUUID(),
        RoomData.empty.copy(users = List(user, user2))
      )

      val expectedMessage = RoomEvent(
        MessageType.Clear,
        roomId,
        actingUserId,
        RoomEvent.NoExtra
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
      val (roomId, roomRef)   = createRoom(
        UUID.randomUUID(),
        RoomData.empty.copy(users = List(user, user2))
      )
      val expectedMessage =
        RoomEvent(MessageType.Show, roomId, actingUserId, RoomEvent.NoExtra)

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
      val (roomId, roomRef)   = createRoom(
        UUID.randomUUID(),
        RoomData.empty.copy(users = List(user, user2))
      )
      val expectedMessage = RoomEvent(MessageType.Vote, roomId, actingUserId, estimation)
      val expectedData    = Room.DataStatus(data =
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
      val (roomId, roomRef)   = createRoom(
        UUID.randomUUID(),
        RoomData.empty.copy(users = List(user, user2))
      )
      val expectedMessage = RoomEvent(
        MessageType.Leave,
        roomId,
        actingUserId,
        RoomEvent.NoExtra
      )
      val expectedData = Room.DataStatus(data = RoomData.empty.copy(users = List(user2)))

      roomRef ! Room.Leave(actingUserId, user.ref, roomResponseProbe.ref)

      roomRef ! Room.GetData(dataProbe.ref)

      userProbe.expectNoMessage()
      user2Probe.expectMsg(expectedMessage)
      roomResponseProbe.expectMessage(Room.Running(roomId))

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
      user2Probe.expectMsgType[RoomEvent] // the Join broadcast from the reconnect
      user2Probe.expectNoMessage()
      roomResponseProbe.expectNoMessage()
    }

    "stop itself if empty" in {
      val probe             = TestProbe()(testKit.system.classicSystem)
      val user              = Room.User(UUID.randomUUID(), "user1", false, "", probe.ref, Room.SessionToken.mint())
      val user2             = Room.User(UUID.randomUUID(), "user2", false, "", probe.ref, Room.SessionToken.mint())
      val roomResponseProbe = testKit.createTestProbe[Room.Response]()

      val roomId          = UUID.randomUUID()
      val behaviorTestKit = BehaviorTestKit(Room(roomId), roomId.toString)

      behaviorTestKit.run(Room.Join(user))
      behaviorTestKit.run(Room.Join(user2))
      behaviorTestKit.run(Room.Leave(user.id, user.ref, roomResponseProbe.ref))
      behaviorTestKit.run(Room.Leave(user2.id, user2.ref, roomResponseProbe.ref))
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
      val newUser      = Room.User(UUID.randomUUID(), "new user", false, "", newUserProbe.ref, Room.SessionToken.mint())

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

      userProbe.expectMsg(expectedMessage)
      user2Probe.expectMsg(expectedMessage)

      newUserProbe.expectMsg(
        RoomEvent(MessageType.Init, roomId, newUser.id, newUser.name)
      )
      newUserProbe.expectMsg(
        RoomEvent(
          MessageType.EditIssue,
          roomId,
          user.id,
          internalData.currentIssue
        )
      )
      newUserProbe.expectMsg(
        RoomEvent(MessageType.Join, roomId, newUser.id, newUser.name)
      )
      newUserProbe.expectMsg(
        RoomEvent(MessageType.Join, roomId, user.id, user.name)
      )
      newUserProbe.expectMsg(
        RoomEvent(MessageType.Vote, roomId, user.id, user.estimation)
      )
      newUserProbe.expectMsg(
        RoomEvent(MessageType.Join, roomId, user2.id, user2.name)
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

  def createRoom(roomId: UUID, data: RoomData)(using
      testKit: ActorTestKit
  ): (UUID, ActorRef[Room.Command]) =
    val roomRef = testKit.spawn[Room.Command](Room.receiveBehaviour(roomId, data))
    (roomId, roomRef)
end RoomSpec
