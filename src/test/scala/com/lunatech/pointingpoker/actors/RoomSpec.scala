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

class RoomSpec extends AnyWordSpec with must.Matchers with BeforeAndAfterAll:
  import RoomSpec.*

  given testKit: ActorTestKit = ActorTestKit()

  override def afterAll(): Unit =
    testKit.shutdownTestKit()

  "Room Actor" should {
    "update the current issue and publish it to everyone" in {
      val issue               = "Issue test 1"
      val (user, userProbe)   = createUser(UUID.randomUUID(), "user1", false, "")
      val (user2, user2Probe) = createUser(UUID.randomUUID(), "user2", false, "")
      val dataProbe           = testKit.createTestProbe[Room.DataStatus]()
      val (_, roomRef)        = createRoom(
        UUID.randomUUID(),
        RoomData.empty.copy(users = List(user, user2))
      )

      roomRef ! Room.EditIssue(user.token, issue)
      roomRef ! Room.GetData(dataProbe.ref)

      expectSnapshot(userProbe).currentIssue mustBe issue
      expectSnapshot(user2Probe).currentIssue mustBe issue
      dataProbe.expectMessage(
        Room.DataStatus(data = RoomData.empty.copy(users = List(user, user2), currentIssue = issue))
      )
    }

    "clear votes and publish the cleared room" in {
      val (user, userProbe)   = createUser(UUID.randomUUID(), "user1", true, "3")
      val (user2, user2Probe) = createUser(UUID.randomUUID(), "user2", true, "5")
      val dataProbe           = testKit.createTestProbe[Room.DataStatus]()
      val (_, roomRef)        = createRoom(
        UUID.randomUUID(),
        RoomData.empty.copy(users = List(user, user2), revealed = true)
      )

      roomRef ! Room.ClearVotes(user.token)
      roomRef ! Room.GetData(dataProbe.ref)

      for probe <- List(userProbe, user2Probe) do
        val snapshot = expectSnapshot(probe)
        snapshot.votesRevealed mustBe false
        snapshot.users.map(u => (u.voted, u.estimation)) mustBe List((false, ""), (false, ""))

      dataProbe.expectMessage(
        Room.DataStatus(data =
          RoomData.empty.copy(users =
            List(
              user.copy(voted = false, estimation = ""),
              user2.copy(voted = false, estimation = "")
            )
          )
        )
      )
    }

    "revote and publish a room that keeps the estimations but clears the votes" in {
      val (user, userProbe)   = createUser(UUID.randomUUID(), "user1", true, "3")
      val (user2, user2Probe) = createUser(UUID.randomUUID(), "user2", true, "5")
      val (_, roomRef)        = createRoom(
        UUID.randomUUID(),
        RoomData.empty.copy(users = List(user, user2), revealed = true)
      )

      roomRef ! Room.ReVote(user.token)

      for probe <- List(userProbe, user2Probe) do
        val snapshot = expectSnapshot(probe)
        snapshot.votesRevealed mustBe false
        snapshot.users.map(_.voted) mustBe List(false, false)
        // The estimations survive, which is what makes the client's re-vote state derivable.
        snapshot.users.map(_.estimation).toSet mustBe Set("3", "5")
    }

    "publish a revealed room on ShowVotes" in {
      val (user, userProbe)   = createUser(UUID.randomUUID(), "user1", true, "3")
      val (user2, user2Probe) = createUser(UUID.randomUUID(), "user2", false, "")
      val (_, roomRef)        = createRoom(
        UUID.randomUUID(),
        RoomData.empty.copy(users = List(user, user2))
      )

      roomRef ! Room.ShowVotes(user.token)

      expectSnapshot(userProbe).votesRevealed mustBe true
      expectSnapshot(user2Probe).votesRevealed mustBe true
    }

    "vote and publish it to everyone" in {
      val estimation          = "5"
      val (user, userProbe)   = createUser(UUID.randomUUID(), "user1", false, "")
      val (user2, user2Probe) = createUser(UUID.randomUUID(), "user2", false, "")
      val dataProbe           = testKit.createTestProbe[Room.DataStatus]()
      val (_, roomRef)        = createRoom(
        UUID.randomUUID(),
        RoomData.empty.copy(users = List(user, user2))
      )

      roomRef ! Room.Vote(user.token, estimation)
      roomRef ! Room.GetData(dataProbe.ref)

      for probe <- List(userProbe, user2Probe) do
        val voter = expectSnapshot(probe).users.find(_.id == user.id)
        voter.map(_.voted) mustBe Some(true)
        voter.map(_.estimation) mustBe Some(estimation)

      dataProbe.expectMessage(
        Room.DataStatus(data =
          RoomData.empty.copy(users = List(user.copy(voted = true, estimation = estimation), user2))
        )
      )
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

    "delay a leave publish by the grace period instead of acting immediately" in {
      val (user, _)           = createUser(UUID.randomUUID(), "user1", false, "")
      val (user2, user2Probe) = createUser(UUID.randomUUID(), "user2", false, "")
      val roomResponseProbe   = testKit.createTestProbe[Room.Response]()
      val (_, roomRef)        = createRoom(
        UUID.randomUUID(),
        RoomData.empty.copy(users = List(user, user2)),
        gracePeriod = 200.millis
      )

      roomRef ! Room.Leave(user.id, user.ref, roomResponseProbe.ref)

      user2Probe.expectNoMessage(50.millis)
      expectSnapshot(user2Probe).users.map(_.id) mustBe List(user2.id)
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

      // The reconnect's own publish is the only thing user2 sees: no leave, no flicker.
      expectSnapshot(user2Probe).users.map(_.id).toSet mustBe Set(user.id, user2.id)
      user2Probe.expectNoMessage(300.millis)

      roomRef ! Room.GetData(dataProbe.ref)
      dataProbe.expectMessage(
        Room.DataStatus(data = RoomData.empty.copy(users = List(reconnectedUser, user2)))
      )
      roomResponseProbe.expectNoMessage()
    }

    "reset the grace period if Leave is called twice for the same connection before it elapses" in {
      // Room.Leave's timer is keyed on (userId, ref) on the assumption that RoomManager
      // calls it at most once per connection. This proves what actually happens if that
      // assumption is ever violated: the second call's startSingleTimer replaces the
      // pending timer outright, restarting the grace period from the second call rather
      // than firing twice or being ignored - see the comment on Room.Leave.
      val (user, _)           = createUser(UUID.randomUUID(), "user1", false, "")
      val (user2, user2Probe) = createUser(UUID.randomUUID(), "user2", false, "")
      val firstReplyProbe     = testKit.createTestProbe[Room.Response]()
      val secondReplyProbe    = testKit.createTestProbe[Room.Response]()
      val (roomId, roomRef)   = createRoom(
        UUID.randomUUID(),
        RoomData.empty.copy(users = List(user, user2)),
        gracePeriod = 200.millis
      )

      roomRef ! Room.Leave(user.id, user.ref, firstReplyProbe.ref)

      Thread.sleep(120) // still inside the first call's grace window

      roomRef ! Room.Leave(user.id, user.ref, secondReplyProbe.ref)

      // Past the first call's original 200ms deadline, but the timer was reset by the
      // second call, so nothing has fired yet.
      user2Probe.expectNoMessage(120.millis)

      // Fires exactly once, delivering the second call's replyTo - proving the timer
      // was replaced, not run twice in parallel.
      expectSnapshot(user2Probe).users.map(_.id) mustBe List(user2.id)
      secondReplyProbe.expectMessage(Room.Running(roomId))
      firstReplyProbe.expectNoMessage()
    }

    "remove a user on leave and publish the smaller room" in {
      val (user, userProbe)   = createUser(UUID.randomUUID(), "user1", false, "")
      val (user2, user2Probe) = createUser(UUID.randomUUID(), "user2", false, "")
      val dataProbe           = testKit.createTestProbe[Room.DataStatus]()
      val roomResponseProbe   = testKit.createTestProbe[Room.Response]()
      val (roomId, roomRef)   = createRoom(
        UUID.randomUUID(),
        RoomData.empty.copy(users = List(user, user2)),
        gracePeriod = 50.millis
      )

      roomRef ! Room.Leave(user.id, user.ref, roomResponseProbe.ref)

      // Waits past the short grace period.
      expectSnapshot(user2Probe).users.map(_.id) mustBe List(user2.id)
      roomResponseProbe.expectMessage(Room.Running(roomId))

      roomRef ! Room.GetData(dataProbe.ref)

      // The departed user's ref is not published to, so nothing reaches their probe.
      userProbe.expectNoMessage()
      dataProbe.expectMessage(Room.DataStatus(data = RoomData.empty.copy(users = List(user2))))
    }

    "ignore a stale leave from a ref that already got replaced by a reconnect" in {
      val (user, userProbe)   = createUser(UUID.randomUUID(), "user1", false, "")
      val (user2, user2Probe) = createUser(UUID.randomUUID(), "user2", false, "")
      val dataProbe           = testKit.createTestProbe[Room.DataStatus]()
      val roomResponseProbe   = testKit.createTestProbe[Room.Response]()
      val (roomId, roomRef)   = createRoom(
        UUID.randomUUID(),
        RoomData.empty.copy(users = List(user, user2)),
        gracePeriod = 200.millis
      )

      // Simulate the user's browser having already reconnected (a new ref replaced
      // the old entry for the same userId) before the stale connection's own
      // termination is observed.
      val reconnectedUserProbe = TestProbe()(testKit.system.classicSystem)
      val reconnectedUser      = user.copy(ref = reconnectedUserProbe.ref)
      roomRef ! Room.Join(reconnectedUser)

      roomRef ! Room.Leave(user.id, user.ref, roomResponseProbe.ref)

      user2Probe.expectMsgType[RoomSnapshot] // the publish from the reconnect

      // Wait past the grace period so ConfirmLeave actually fires and exercises the
      // stale-ref guard, instead of asserting "nothing happened yet" before the timer runs.
      user2Probe.expectNoMessage(300.millis)
      roomResponseProbe.expectNoMessage()

      roomRef ! Room.GetData(dataProbe.ref)

      val expectedData =
        Room.DataStatus(data = RoomData.empty.copy(users = List(reconnectedUser, user2)))
      dataProbe.expectMessage(expectedData)
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

      // Only one entry for user.id, proving no duplicate; voted/estimation carried over
      // from the stored entry rather than reset to rejoinedUser's, per joinUser's contract.
      dataProbe.expectMessage(
        Room.DataStatus(data = RoomData.empty.copy(users = List(user.copy(ref = newRefProbe.ref))))
      )
    }

    "publish the whole room to a joiner and to everyone already in it" in {
      val issue               = "current issue"
      val (user, userProbe)   = createUser(UUID.randomUUID(), "user1", true, "5")
      val (user2, user2Probe) = createUser(UUID.randomUUID(), "user2", false, "")
      val dataProbe           = testKit.createTestProbe[Room.DataStatus]()
      val internalData        =
        RoomData.empty.copy(users = List(user, user2), currentIssue = issue)
      val (_, roomRef) = createRoom(UUID.randomUUID(), internalData)

      val newUserProbe = TestProbe()(testKit.system.classicSystem)
      val newUser      = Room.User(
        UUID.randomUUID(),
        "new user",
        false,
        "",
        newUserProbe.ref,
        Room.SessionToken.mint()
      )

      roomRef ! Room.Join(newUser)
      roomRef ! Room.GetData(dataProbe.ref)

      val joinerView = expectSnapshot(newUserProbe)
      joinerView.you mustBe newUser.id
      joinerView.currentIssue mustBe issue
      joinerView.users.map(_.id).toSet mustBe Set(newUser.id, user.id, user2.id)
      // One message, not a replay: the catch-up and the announcement are the same send.
      newUserProbe.expectNoMessage()

      for probe <- List(userProbe, user2Probe) do
        expectSnapshot(probe).users.map(_.id).toSet mustBe Set(newUser.id, user.id, user2.id)

      dataProbe.expectMessage(
        Room.DataStatus(data =
          RoomData.empty.copy(users = List(newUser, user, user2), currentIssue = issue)
        )
      )
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

    "reveal the round when the last outstanding vote lands" in {
      val (user, _)    = createUser(UUID.randomUUID(), "user1", true, "3")
      val (user2, _)   = createUser(UUID.randomUUID(), "user2", false, "")
      val dataProbe    = testKit.createTestProbe[Room.DataStatus]()
      val (_, roomRef) = createRoom(
        UUID.randomUUID(),
        RoomData.empty.copy(users = List(user, user2))
      )

      roomRef ! Room.Vote(user2.token, "5")
      roomRef ! Room.GetData(dataProbe.ref)

      dataProbe.expectMessageType[Room.DataStatus].data.revealed mustBe true
    }

    "leave the round hidden while anyone is still outstanding" in {
      val (user, _)    = createUser(UUID.randomUUID(), "user1", false, "")
      val (user2, _)   = createUser(UUID.randomUUID(), "user2", false, "")
      val dataProbe    = testKit.createTestProbe[Room.DataStatus]()
      val (_, roomRef) = createRoom(
        UUID.randomUUID(),
        RoomData.empty.copy(users = List(user, user2))
      )

      roomRef ! Room.Vote(user.token, "5")
      roomRef ! Room.GetData(dataProbe.ref)

      dataProbe.expectMessageType[Room.DataStatus].data.revealed mustBe false
    }

    "store the reveal on ShowVotes rather than only broadcasting it" in {
      val (user, _)    = createUser(UUID.randomUUID(), "user1", true, "3")
      val (user2, _)   = createUser(UUID.randomUUID(), "user2", false, "")
      val dataProbe    = testKit.createTestProbe[Room.DataStatus]()
      val (_, roomRef) = createRoom(
        UUID.randomUUID(),
        RoomData.empty.copy(users = List(user, user2))
      )

      roomRef ! Room.ShowVotes(user.token)
      roomRef ! Room.GetData(dataProbe.ref)

      dataProbe.expectMessageType[Room.DataStatus].data.revealed mustBe true
    }

    "keep the round revealed when a straggler joins" in {
      val (user, _)    = createUser(UUID.randomUUID(), "user1", true, "3")
      val dataProbe    = testKit.createTestProbe[Room.DataStatus]()
      val (_, roomRef) = createRoom(
        UUID.randomUUID(),
        RoomData.empty.copy(users = List(user), revealed = true)
      )
      val newUserProbe = TestProbe()(testKit.system.classicSystem)
      val newUser      = Room.User(
        UUID.randomUUID(),
        "new user",
        false,
        "",
        newUserProbe.ref,
        Room.SessionToken.mint()
      )

      roomRef ! Room.Join(newUser)
      roomRef ! Room.GetData(dataProbe.ref)

      dataProbe.expectMessageType[Room.DataStatus].data.revealed mustBe true
    }

    "hide the round again on a clear and on a revote" in {
      val (user, _)    = createUser(UUID.randomUUID(), "user1", true, "3")
      val dataProbe    = testKit.createTestProbe[Room.DataStatus]()
      val (_, roomRef) = createRoom(
        UUID.randomUUID(),
        RoomData.empty.copy(users = List(user), revealed = true)
      )

      roomRef ! Room.ClearVotes(user.token)
      roomRef ! Room.GetData(dataProbe.ref)
      dataProbe.expectMessageType[Room.DataStatus].data.revealed mustBe false

      roomRef ! Room.Vote(user.token, "5") // re-reveals: the only member has voted
      roomRef ! Room.ReVote(user.token)
      roomRef ! Room.GetData(dataProbe.ref)
      dataProbe.expectMessageType[Room.DataStatus].data.revealed mustBe false
    }

    "keep a reconnecting user's vote instead of resetting it" in {
      val (user, _)    = createUser(UUID.randomUUID(), "user1", true, "5")
      val dataProbe    = testKit.createTestProbe[Room.DataStatus]()
      val (_, roomRef) = createRoom(UUID.randomUUID(), RoomData.empty.copy(users = List(user)))

      // What RoomManager.ConnectToRoom actually builds on a reconnect: a fresh User with
      // InitialVoteState and InitialEstimation, differing from the stored one only by ref.
      val newRefProbe = TestProbe()(testKit.system.classicSystem)
      roomRef ! Room.Join(Room.User(user.id, user.name, false, "", newRefProbe.ref, user.token))
      roomRef ! Room.GetData(dataProbe.ref)

      val users = dataProbe.expectMessageType[Room.DataStatus].data.users
      users.map(u => (u.voted, u.estimation)) mustBe List((true, "5"))
      users.map(_.ref) mustBe List(newRefProbe.ref)
    }
  }
end RoomSpec

object RoomSpec:
  def expectSnapshot(probe: TestProbe): RoomSnapshot =
    probe.expectMsgType[RoomSnapshot]

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
