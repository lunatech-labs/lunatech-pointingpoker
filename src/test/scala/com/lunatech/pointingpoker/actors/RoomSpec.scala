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

      for (probe, member) <- List((userProbe, user), (user2Probe, user2)) do
        val snapshot = expectSnapshot(probe)
        snapshot.you mustBe member.id
        snapshot.votesRevealed mustBe false
        snapshot.users.map(u => (u.voted, u.estimation)) mustBe List((false, ""), (false, ""))
        snapshot.users.map(_.hasEstimation) mustBe List(false, false)

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

      // The other half of publish's pairing guard; the vote case above carries the note.
      for (probe, member) <- List((userProbe, user), (user2Probe, user2)) do
        val snapshot = expectSnapshot(probe)
        snapshot.you mustBe member.id
        snapshot.votesRevealed mustBe false
        snapshot.users.map(_.voted) mustBe List(false, false)
        // The estimations survive a re-vote, and hasEstimation is now what carries that,
        // since the values themselves reach nobody but their owner.
        snapshot.users.map(_.hasEstimation) mustBe List(true, true)
        snapshot.users.find(_.id == member.id).map(_.estimation) mustBe Some(member.estimation)
        snapshot.users.filterNot(_.id == member.id).map(_.estimation) mustBe List("")
      end for
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

      // Two probes, not one: this is the guard on publish pairing each snapshot with its own
      // recipient, so step 4's connections map ports it rather than replacing it.
      for (probe, member) <- List((userProbe, user), (user2Probe, user2)) do
        val snapshot = expectSnapshot(probe)
        snapshot.you mustBe member.id
        val voter = snapshot.users.find(_.id == user.id)
        voter.map(_.voted) mustBe Some(true)
        voter.map(_.hasEstimation) mustBe Some(true)
        // Unrevealed, so the value itself is in the voter's own snapshot and no other.
        voter.map(_.estimation) mustBe Some(if member.id == user.id then estimation else "")

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
      val (_, roomRef)        = createRoom(
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
      val (_, roomRef)        = createRoom(
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
      // Mid-round: the joiner is handed the roster without anyone's outstanding estimation.
      joinerView.users.filterNot(_.id == newUser.id).map(_.estimation) mustBe List("", "")
      // One message, not a replay: the catch-up and the announcement are the same send.
      newUserProbe.expectNoMessage()

      for (probe, member) <- List((userProbe, user), (user2Probe, user2)) do
        val snapshot = expectSnapshot(probe)
        snapshot.you mustBe member.id
        snapshot.users.map(_.id).toSet mustBe Set(newUser.id, user.id, user2.id)

      dataProbe.expectMessage(
        Room.DataStatus(data =
          RoomData.empty.copy(users = List(newUser, user, user2), currentIssue = issue)
        )
      )
    }

    "mint a session and store it on RequestSession" in {
      val sessionProbe      = testKit.createTestProbe[Room.SessionMinted]()
      val dataProbe         = testKit.createTestProbe[Room.DataStatus]()
      val (roomId, roomRef) = createRoom(UUID.randomUUID(), RoomData.empty)

      roomRef ! Room.RequestSession("Alice", sessionProbe.ref)

      val minted = sessionProbe.expectMessageType[Room.SessionMinted]

      roomRef ! Room.GetData(dataProbe.ref)
      val data = dataProbe.expectMessageType[Room.DataStatus]
      data.data.sessions.get(minted.token) mustBe Some(
        Room.Session(minted.userId, "Alice")
      )
    }

    "resolve a session minted for a tab that has not connected" in {
      val sessionProbe = testKit.createTestProbe[Room.SessionMinted]()
      val resultProbe  = testKit.createTestProbe[Room.TokenResolution]()
      val (_, roomRef) = createRoom(UUID.randomUUID(), RoomData.empty)

      roomRef ! Room.RequestSession("Alice", sessionProbe.ref)
      val minted = sessionProbe.expectMessageType[Room.SessionMinted]

      roomRef ! Room.ValidateToken(minted.token, resultProbe.ref)

      resultProbe.expectMessage(Room.Resolved(minted.userId, "Alice"))
    }

    "resolve a token when the room already has members" in {
      val (user, _)    = createUser(UUID.randomUUID(), "user1", false, "")
      val resultProbe  = testKit.createTestProbe[Room.TokenResolution]()
      val (_, roomRef) = createRoom(
        UUID.randomUUID(),
        RoomData.empty.copy(users = List(user), sessions = sessionsFor(user))
      )

      roomRef ! Room.ValidateToken(user.token, resultProbe.ref)

      resultProbe.expectMessage(Room.Resolved(user.id, user.name))
    }

    "return Unresolved for an unknown token" in {
      val resultProbe  = testKit.createTestProbe[Room.TokenResolution]()
      val (_, roomRef) = createRoom(UUID.randomUUID(), RoomData.empty)

      roomRef ! Room.ValidateToken(Room.SessionToken.mint(), resultProbe.ref)

      resultProbe.expectMessage(Room.Unresolved)
    }

    "keep the session once Join promotes it to a member" in {
      val sessionProbe = testKit.createTestProbe[Room.SessionMinted]()
      val dataProbe    = testKit.createTestProbe[Room.DataStatus]()
      val userProbe    = TestProbe()(testKit.system.classicSystem)
      val (_, roomRef) = createRoom(UUID.randomUUID(), RoomData.empty)

      roomRef ! Room.RequestSession("Alice", sessionProbe.ref)
      val minted = sessionProbe.expectMessageType[Room.SessionMinted]

      roomRef ! Room.Join(Room.User(minted.userId, "Alice", false, "", userProbe.ref, minted.token))
      roomRef ! Room.GetData(dataProbe.ref)

      val data = dataProbe.expectMessageType[Room.DataStatus]
      // Retained, so the member entry is no longer the token's only record.
      data.data.sessions.get(minted.token) mustBe Some(
        Room.Session(minted.userId, "Alice")
      )
      data.data.users.map(_.id) must contain(minted.userId)
    }

    "resolve a token whose member was removed at grace expiry" in {
      val sessionProbe      = testKit.createTestProbe[Room.SessionMinted]()
      val resultProbe       = testKit.createTestProbe[Room.TokenResolution]()
      val responseProbe     = testKit.createTestProbe[Room.Response]()
      val userProbe         = TestProbe()(testKit.system.classicSystem)
      val (user2, _)        = createUser(UUID.randomUUID(), "user2", false, "")
      val (roomId, roomRef) = createRoom(
        UUID.randomUUID(),
        RoomData.empty.copy(users = List(user2), sessions = sessionsFor(user2)),
        gracePeriod = 50.millis
      )

      // Through RequestSession and Join, since promotion is what used to consume the entry:
      // seeding the map directly leaves the case green with the old code.
      roomRef ! Room.RequestSession("Alice", sessionProbe.ref)
      val minted = sessionProbe.expectMessageType[Room.SessionMinted]
      roomRef ! Room.Join(Room.User(minted.userId, "Alice", false, "", userProbe.ref, minted.token))

      roomRef ! Room.Leave(minted.userId, userProbe.ref, responseProbe.ref)
      // Running is the confirmation that ConfirmLeave fired and removed the member while the
      // room stayed up, which is the state a reconnect past the window arrives in.
      responseProbe.expectMessage(Room.Running(roomId))

      roomRef ! Room.ValidateToken(minted.token, resultProbe.ref)

      resultProbe.expectMessage(Room.Resolved(minted.userId, "Alice"))
    }

    "refuse every command from a token whose member was removed at grace expiry" in {
      val sessionProbe      = testKit.createTestProbe[Room.SessionMinted]()
      val responseProbe     = testKit.createTestProbe[Room.Response]()
      val dataProbe         = testKit.createTestProbe[Room.DataStatus]()
      val userProbe         = TestProbe()(testKit.system.classicSystem)
      val (user2, _)        = createUser(UUID.randomUUID(), "user2", true, "3")
      val (user3, _)        = createUser(UUID.randomUUID(), "user3", true, "5")
      val (roomId, roomRef) = createRoom(
        UUID.randomUUID(),
        RoomData.empty.copy(users = List(user2, user3), sessions = sessionsFor(user2, user3)),
        gracePeriod = 50.millis
      )

      // Same setup as the resolve case above: Alice's token is retained in `sessions`
      // after her member entry is removed at grace expiry.
      roomRef ! Room.RequestSession("Alice", sessionProbe.ref)
      val minted = sessionProbe.expectMessageType[Room.SessionMinted]
      roomRef ! Room.Join(Room.User(minted.userId, "Alice", false, "", userProbe.ref, minted.token))

      roomRef ! Room.Leave(minted.userId, userProbe.ref, responseProbe.ref)
      responseProbe.expectMessage(Room.Running(roomId))

      // Both members voted with the round unrevealed, the state a room is in after an unvoted
      // member's grace expiry, so any of the five honoured wrongly would visibly change it.
      roomRef ! Room.GetData(dataProbe.ref)
      val before = dataProbe.expectMessageType[Room.DataStatus].data

      def assertUnaffected(command: Room.Command): Unit =
        roomRef ! command
        roomRef ! Room.GetData(dataProbe.ref)
        dataProbe.expectMessage(Room.DataStatus(data = before))

      assertUnaffected(Room.Vote(minted.token, "8"))
      assertUnaffected(Room.ClearVotes(minted.token))
      assertUnaffected(Room.ReVote(minted.token))
      assertUnaffected(Room.ShowVotes(minted.token))
      assertUnaffected(Room.EditIssue(minted.token, "a different issue"))
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

    "refuse a vote that would overwrite a confirmed estimate in a revealed round" in {
      val (user, _)    = createUser(UUID.randomUUID(), "user1", true, "3")
      val (user2, _)   = createUser(UUID.randomUUID(), "user2", true, "5")
      val dataProbe    = testKit.createTestProbe[Room.DataStatus]()
      val (_, roomRef) = createRoom(
        UUID.randomUUID(),
        RoomData.empty.copy(users = List(user, user2), revealed = true)
      )

      roomRef ! Room.Vote(user.token, "8")
      roomRef ! Room.GetData(dataProbe.ref)

      val data = dataProbe.expectMessageType[Room.DataStatus].data
      data.users.map(u => (u.voted, u.estimation)) mustBe List((true, "3"), (true, "5"))
      data.revealed mustBe true
    }

    "refuse a first vote in a revealed round, since the reveal closes it for everyone" in {
      val (user, _)    = createUser(UUID.randomUUID(), "user1", true, "3")
      val (user2, _)   = createUser(UUID.randomUUID(), "user2", false, "")
      val dataProbe    = testKit.createTestProbe[Room.DataStatus]()
      val (_, roomRef) = createRoom(
        UUID.randomUUID(),
        RoomData.empty.copy(users = List(user, user2), revealed = true)
      )

      roomRef ! Room.Vote(user2.token, "5")
      roomRef ! Room.GetData(dataProbe.ref)

      val data = dataProbe.expectMessageType[Room.DataStatus].data
      data.users.map(u => (u.voted, u.estimation)) mustBe List((true, "3"), (false, ""))
      data.revealed mustBe true
    }

    "publish on a refused vote, the same as on one that lands" in {
      val (user, userProbe) = createUser(UUID.randomUUID(), "user1", true, "3")
      val (_, roomRef)      = createRoom(
        UUID.randomUUID(),
        RoomData.empty.copy(users = List(user), revealed = true)
      )

      roomRef ! Room.Vote(user.token, "8")

      val snapshot = expectSnapshot(userProbe)
      snapshot.votesRevealed mustBe true
      snapshot.users.map(_.estimation) mustBe List("3")
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

    "build a RoomData when every member has a matching session" in {
      val (user, _)  = createUser(UUID.randomUUID(), "user1", false, "")
      val (user2, _) = createUser(UUID.randomUUID(), "user2", true, "5")
      val sessions   = Map(
        user.token  -> Room.Session(user.id, user.name),
        user2.token -> Room.Session(user2.id, user2.name)
      )

      val data = RoomData.of(List(user, user2), sessions)

      data.users mustBe List(user, user2)
      data.sessions mustBe sessions
      data.currentIssue mustBe ""
      data.revealed mustBe false
    }

    "refuse a RoomData whose member has no session at all" in {
      val (user, _) = createUser(UUID.randomUUID(), "user1", false, "")

      val thrown = intercept[IllegalArgumentException] {
        RoomData.of(List(user), Map.empty)
      }

      thrown.getMessage must include("has no session")
    }

    "refuse a RoomData whose member's session names a different identity" in {
      val (user, _)  = createUser(UUID.randomUUID(), "user1", false, "")
      val (other, _) = createUser(UUID.randomUUID(), "user2", false, "")

      val thrown = intercept[IllegalArgumentException] {
        RoomData.of(List(user), Map(user.token -> Room.Session(other.id, other.name)))
      }

      thrown.getMessage must include("a different identity")
    }

    "refuse a RoomData whose member's session disagrees on the name alone" in {
      val (user, _) = createUser(UUID.randomUUID(), "user1", false, "")

      val thrown = intercept[IllegalArgumentException] {
        RoomData.of(List(user), Map(user.token -> Room.Session(user.id, "someone else")))
      }

      thrown.getMessage must include("a different identity")
    }

    "allow a session that has no member, which is what retention produces" in {
      val (user, _)     = createUser(UUID.randomUUID(), "user1", false, "")
      val (departed, _) = createUser(UUID.randomUUID(), "user2", false, "")
      val sessions      = Map(
        user.token     -> Room.Session(user.id, user.name),
        departed.token -> Room.Session(departed.id, departed.name)
      )

      val data = RoomData.of(List(user), sessions)

      data.users mustBe List(user)
      data.sessions.keySet mustBe Set(user.token, departed.token)
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

  def sessionsFor(users: Room.User*): Map[Room.SessionToken, Room.Session] =
    users.map(u => u.token -> Room.Session(u.id, u.name)).toMap

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
