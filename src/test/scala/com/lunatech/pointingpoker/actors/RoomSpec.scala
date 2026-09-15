package com.lunatech.pointingpoker.actors

import java.util.UUID

import scala.concurrent.duration.*

import org.apache.pekko.actor.testkit.typed.scaladsl.{ActorTestKit, BehaviorTestKit, LoggingTestKit}
import org.apache.pekko.actor.typed.ActorRef
import org.apache.pekko.testkit.TestProbe
import com.lunatech.pointingpoker.actors.Room.RoomData
import com.lunatech.pointingpoker.actors.RoomDataFixtures.Attendee
import org.scalatest.BeforeAndAfterAll
import org.scalatest.matchers.must
import org.scalatest.wordspec.AnyWordSpec

class RoomSpec extends AnyWordSpec with must.Matchers with BeforeAndAfterAll:
  import RoomSpec.*
  import RoomDataFixtures.*

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
        withUsers(user, user2)
      )

      roomRef ! Room.EditIssue(user.token, issue)
      roomRef ! Room.GetData(dataProbe.ref)

      expectSnapshot(userProbe).currentIssue mustBe issue
      expectSnapshot(user2Probe).currentIssue mustBe issue
      dataProbe.expectMessage(
        Room.DataStatus(data = withUsers(user, user2).withIssue(issue))
      )
    }

    "clear votes and publish the cleared room" in {
      val (user, userProbe)   = createUser(UUID.randomUUID(), "user1", true, "3")
      val (user2, user2Probe) = createUser(UUID.randomUUID(), "user2", true, "5")
      val dataProbe           = testKit.createTestProbe[Room.DataStatus]()
      val (_, roomRef)        = createRoom(
        UUID.randomUUID(),
        withUsers(user, user2).withRevealed()
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
          withUsers(
            user.copy(voted = false, estimation = ""),
            user2.copy(voted = false, estimation = "")
          )
        )
      )
    }

    "revote and publish a room that keeps the estimations but clears the votes" in {
      val (user, userProbe)   = createUser(UUID.randomUUID(), "user1", true, "3")
      val (user2, user2Probe) = createUser(UUID.randomUUID(), "user2", true, "5")
      val (_, roomRef)        = createRoom(
        UUID.randomUUID(),
        withUsers(user, user2).withRevealed()
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
        withUsers(user, user2)
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
        withUsers(user, user2)
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
        Room.DataStatus(data = withUsers(user.copy(voted = true, estimation = estimation), user2))
      )
    }

    "ignore a vote from an unresolvable token" in {
      val (user, userProbe)   = createUser(UUID.randomUUID(), "user1", false, "")
      val (user2, user2Probe) = createUser(UUID.randomUUID(), "user2", false, "")
      val dataProbe           = testKit.createTestProbe[Room.DataStatus]()
      val (roomId, roomRef)   = createRoom(
        UUID.randomUUID(),
        withUsers(user, user2)
      )

      roomRef ! Room.Vote(Room.SessionToken.mint(), "5")
      roomRef ! Room.GetData(dataProbe.ref)

      userProbe.expectNoMessage()
      user2Probe.expectNoMessage()
      dataProbe.expectMessage(
        Room.DataStatus(data = withUsers(user, user2))
      )
    }

    "delay a leave publish by the grace period instead of acting immediately" in {
      val (user, _)           = createUser(UUID.randomUUID(), "user1", false, "")
      val (user2, user2Probe) = createUser(UUID.randomUUID(), "user2", false, "")
      val roomResponseProbe   = testKit.createTestProbe[Room.Response]()
      val (_, roomRef)        = createRoom(
        UUID.randomUUID(),
        withUsers(user, user2),
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
        withUsers(user, user2),
        gracePeriod = 200.millis
      )

      roomRef ! Room.Leave(user.id, user.ref, roomResponseProbe.ref)

      // Reconnect well within the grace period, under a new ref but the same user id/token.
      val reconnectedUserProbe = TestProbe()(testKit.system.classicSystem)
      val reconnectedUser      = user.copy(ref = reconnectedUserProbe.ref)
      roomRef ! reconnectedUser.joinMessage

      // The reconnect's own publish is the only thing user2 sees: no leave, no flicker.
      expectSnapshot(user2Probe).users.map(_.id).toSet mustBe Set(user.id, user2.id)
      user2Probe.expectNoMessage(300.millis)

      roomRef ! Room.GetData(dataProbe.ref)
      dataProbe.expectMessage(
        Room.DataStatus(data = withUsers(reconnectedUser, user2))
      )
      roomResponseProbe.expectNoMessage()
    }

    "restart the grace period when a second Leave arrives on a connection already dropped" in {
      // Pins that startSingleTimer replaces rather than duplicates, which is what absorbs a
      // duplicate Leave; the Join branch's timers.cancel is what made the staleness check go.
      val (user, _)           = createUser(UUID.randomUUID(), "user1", false, "")
      val (user2, user2Probe) = createUser(UUID.randomUUID(), "user2", false, "")
      val firstReplyProbe     = testKit.createTestProbe[Room.Response]()
      val secondReplyProbe    = testKit.createTestProbe[Room.Response]()
      val (roomId, roomRef)   = createRoom(
        UUID.randomUUID(),
        withUsers(user, user2),
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
      val (user, userProbe)   = createUser(UUID.randomUUID(), "user1", true, "8")
      val (user2, user2Probe) = createUser(UUID.randomUUID(), "user2", false, "")
      val dataProbe           = testKit.createTestProbe[Room.DataStatus]()
      val roomResponseProbe   = testKit.createTestProbe[Room.Response]()
      val (roomId, roomRef)   = createRoom(
        UUID.randomUUID(),
        withUsers(user, user2),
        gracePeriod = 50.millis
      )

      roomRef ! Room.Leave(user.id, user.ref, roomResponseProbe.ref)

      // Waits past the short grace period.
      expectSnapshot(user2Probe).users.map(_.id) mustBe List(user2.id)
      roomResponseProbe.expectMessage(Room.Running(roomId))

      roomRef ! Room.GetData(dataProbe.ref)

      // The departed user's ref is not published to, so nothing reaches their probe.
      userProbe.expectNoMessage()
      val data = dataProbe.expectMessageType[Room.DataStatus].data
      // Problem A's guarantee: the departure takes the member and leaves the estimate.
      data.estimateFor(user) mustBe Some(("8", true))
      data mustBe withUsers(user2).withMemberlessSession(user).withEstimate(user)
    }

    "stop itself if empty" in {
      val probe = TestProbe()(testKit.system.classicSystem)
      val user  =
        Attendee(UUID.randomUUID(), "user1", false, "", probe.ref, Room.SessionToken.mint())
      val user2 =
        Attendee(UUID.randomUUID(), "user2", false, "", probe.ref, Room.SessionToken.mint())
      val roomResponseProbe = testKit.createTestProbe[Room.Response]()

      val roomId = UUID.randomUUID()
      // Seeded rather than joined: Join is not what this case is about, and a refused
      // Join would leave the room empty and pass the assertion for the wrong reason.
      val behaviorTestKit =
        BehaviorTestKit(Room(roomId, withUsers(user, user2)), roomId.toString)

      // BehaviorTestKit doesn't drive real timers, so send the post-grace-period effect
      // directly rather than Leave (which only schedules it).
      behaviorTestKit.run(Room.ConfirmLeave(user.id, roomResponseProbe.ref))
      behaviorTestKit.run(Room.ConfirmLeave(user2.id, roomResponseProbe.ref))
      behaviorTestKit.isAlive mustBe false
    }

    "ignore a Join whose token is in no session" in {
      val (user, _)                 = createUser(UUID.randomUUID(), "user1", false, "")
      val (stranger, strangerProbe) = createUser(UUID.randomUUID(), "stranger", false, "")
      val dataProbe                 = testKit.createTestProbe[Room.DataStatus]()
      val (_, roomRef)              = createRoom(UUID.randomUUID(), withUsers(user))

      // Nothing mints stranger's token, so ConnectToRoom could never have produced this
      // Join; the room drops it rather than manufacturing an unresolvable member.
      LoggingTestKit
        .warn("resolves to no session")
        .expect {
          roomRef ! stranger.joinMessage
          roomRef ! Room.GetData(dataProbe.ref)
          val data = dataProbe.expectMessageType[Room.DataStatus].data
          data mustBe withUsers(user)
          data.connections.keySet must not contain stranger.id
        }(using testKit.system)

      // Step 6 is expected to redden this: the send that recovers a refused joiner pairs
      // with its rejoin, and the design's step 4 section carries why neither works alone.
      strangerProbe.expectNoMessage()
    }

    "ignore a Join whose token names a different identity" in {
      val (user, _)                 = createUser(UUID.randomUUID(), "user1", false, "")
      val (impostor, impostorProbe) = createUser(UUID.randomUUID(), "impostor", false, "")
      val dataProbe                 = testKit.createTestProbe[Room.DataStatus]()
      val roomData                  = withUsers(user).withMemberlessSession(impostor)
      val (_, roomRef)              = createRoom(UUID.randomUUID(), roomData)

      // impostor's token resolves to a session, but the joiner claims a different id
      // than that session holds, which of would reject; the room drops it too.
      val claimant = impostor.copy(id = UUID.randomUUID())

      LoggingTestKit
        .warn("names a different identity")
        .expect {
          roomRef ! claimant.joinMessage
          roomRef ! Room.GetData(dataProbe.ref)
          val data = dataProbe.expectMessageType[Room.DataStatus].data
          data mustBe roomData
          data.connections.keySet must not contain claimant.id
        }(using testKit.system)

      // copy carries impostor's ref, so this is the claimant's own connection. Step 6
      // reddens it for the same reason as the case above.
      impostorProbe.expectNoMessage()
    }

    "publish the whole room to a joiner and to everyone already in it" in {
      val issue               = "current issue"
      val (user, userProbe)   = createUser(UUID.randomUUID(), "user1", true, "5")
      val (user2, user2Probe) = createUser(UUID.randomUUID(), "user2", false, "")
      val dataProbe           = testKit.createTestProbe[Room.DataStatus]()
      val newUserProbe        = TestProbe()(testKit.system.classicSystem)
      val newUser             = Attendee(
        UUID.randomUUID(),
        "new user",
        false,
        "",
        newUserProbe.ref,
        Room.SessionToken.mint()
      )
      // newUser's session predates its join, same as a real RequestSession-then-Join.
      val internalData =
        withUsers(user, user2).withIssue(issue).withMemberlessSession(newUser)
      val (_, roomRef) = createRoom(UUID.randomUUID(), internalData)

      roomRef ! newUser.joinMessage
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
        Room.DataStatus(data = withUsers(newUser, user, user2).withIssue(issue))
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
      // Invariant 5: only ConnectToRoom creates a member, or everyMemberHasVoted is
      // unsatisfiable for a member who never connects and never votes.
      data.data.members mustBe empty
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
        withUsers(user)
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

      roomRef ! Attendee(minted.userId, "Alice", false, "", userProbe.ref, minted.token).joinMessage
      roomRef ! Room.GetData(dataProbe.ref)

      val data = dataProbe.expectMessageType[Room.DataStatus]
      // Retained, so the member entry is no longer the token's only record.
      data.data.sessions.get(minted.token) mustBe Some(
        Room.Session(minted.userId, "Alice")
      )
      data.data.members.keySet must contain(minted.userId)
    }

    "resolve a token whose member was removed at grace expiry" in {
      val sessionProbe      = testKit.createTestProbe[Room.SessionMinted]()
      val resultProbe       = testKit.createTestProbe[Room.TokenResolution]()
      val responseProbe     = testKit.createTestProbe[Room.Response]()
      val userProbe         = TestProbe()(testKit.system.classicSystem)
      val (user2, _)        = createUser(UUID.randomUUID(), "user2", false, "")
      val (roomId, roomRef) = createRoom(
        UUID.randomUUID(),
        withUsers(user2),
        gracePeriod = 50.millis
      )

      // Through RequestSession and Join, since promotion is what used to consume the entry:
      // seeding the map directly leaves the case green with the old code.
      roomRef ! Room.RequestSession("Alice", sessionProbe.ref)
      val minted = sessionProbe.expectMessageType[Room.SessionMinted]
      roomRef ! Attendee(minted.userId, "Alice", false, "", userProbe.ref, minted.token).joinMessage

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
        withUsers(user2, user3),
        gracePeriod = 50.millis
      )

      // Same setup as the resolve case above: Alice's token is retained in `sessions`
      // after her member entry is removed at grace expiry.
      roomRef ! Room.RequestSession("Alice", sessionProbe.ref)
      val minted = sessionProbe.expectMessageType[Room.SessionMinted]
      roomRef ! Attendee(minted.userId, "Alice", false, "", userProbe.ref, minted.token).joinMessage

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
        withUsers(user, user2)
      )

      roomRef ! Room.Vote(user2.token, "5")
      roomRef ! Room.GetData(dataProbe.ref)

      dataProbe.expectMessageType[Room.DataStatus].data.state.round.revealed mustBe true
    }

    "leave the round hidden while anyone is still outstanding" in {
      val (user, _)    = createUser(UUID.randomUUID(), "user1", false, "")
      val (user2, _)   = createUser(UUID.randomUUID(), "user2", false, "")
      val dataProbe    = testKit.createTestProbe[Room.DataStatus]()
      val (_, roomRef) = createRoom(
        UUID.randomUUID(),
        withUsers(user, user2)
      )

      roomRef ! Room.Vote(user.token, "5")
      roomRef ! Room.GetData(dataProbe.ref)

      dataProbe.expectMessageType[Room.DataStatus].data.state.round.revealed mustBe false
    }

    "store the reveal on ShowVotes rather than only broadcasting it" in {
      val (user, _)    = createUser(UUID.randomUUID(), "user1", true, "3")
      val (user2, _)   = createUser(UUID.randomUUID(), "user2", false, "")
      val dataProbe    = testKit.createTestProbe[Room.DataStatus]()
      val (_, roomRef) = createRoom(
        UUID.randomUUID(),
        withUsers(user, user2)
      )

      roomRef ! Room.ShowVotes(user.token)
      roomRef ! Room.GetData(dataProbe.ref)

      dataProbe.expectMessageType[Room.DataStatus].data.state.round.revealed mustBe true
    }

    "keep the round revealed when a straggler joins" in {
      val (user, _)    = createUser(UUID.randomUUID(), "user1", true, "3")
      val dataProbe    = testKit.createTestProbe[Room.DataStatus]()
      val newUserProbe = TestProbe()(testKit.system.classicSystem)
      val newUser      = Attendee(
        UUID.randomUUID(),
        "new user",
        false,
        "",
        newUserProbe.ref,
        Room.SessionToken.mint()
      )
      val (_, roomRef) = createRoom(
        UUID.randomUUID(),
        withUsers(user).withRevealed().withMemberlessSession(newUser)
      )

      roomRef ! newUser.joinMessage
      roomRef ! Room.GetData(dataProbe.ref)

      // Membership, not just revealed, so a dropped Join can't pass this vacuously.
      dataProbe.expectMessage(
        Room.DataStatus(data = withUsers(newUser, user).withRevealed())
      )
    }

    "hide the round again on a clear and on a revote" in {
      val (user, _)    = createUser(UUID.randomUUID(), "user1", true, "3")
      val dataProbe    = testKit.createTestProbe[Room.DataStatus]()
      val (_, roomRef) = createRoom(
        UUID.randomUUID(),
        withUsers(user).withRevealed()
      )

      roomRef ! Room.ClearVotes(user.token)
      roomRef ! Room.GetData(dataProbe.ref)
      dataProbe.expectMessageType[Room.DataStatus].data.state.round.revealed mustBe false

      roomRef ! Room.Vote(user.token, "5") // re-reveals: the only member has voted
      roomRef ! Room.ReVote(user.token)
      roomRef ! Room.GetData(dataProbe.ref)
      dataProbe.expectMessageType[Room.DataStatus].data.state.round.revealed mustBe false
    }

    "refuse a vote that would overwrite a confirmed estimate in a revealed round" in {
      val (user, _)    = createUser(UUID.randomUUID(), "user1", true, "3")
      val (user2, _)   = createUser(UUID.randomUUID(), "user2", true, "5")
      val dataProbe    = testKit.createTestProbe[Room.DataStatus]()
      val (_, roomRef) = createRoom(
        UUID.randomUUID(),
        withUsers(user, user2).withRevealed()
      )

      roomRef ! Room.Vote(user.token, "8")
      roomRef ! Room.GetData(dataProbe.ref)

      val data = dataProbe.expectMessageType[Room.DataStatus].data
      data.estimateFor(user) mustBe Some(("3", true))
      data.estimateFor(user2) mustBe Some(("5", true))
      data.state.round.revealed mustBe true
    }

    "refuse a first vote in a revealed round, since the reveal closes it for everyone" in {
      val (user, _)    = createUser(UUID.randomUUID(), "user1", true, "3")
      val (user2, _)   = createUser(UUID.randomUUID(), "user2", false, "")
      val dataProbe    = testKit.createTestProbe[Room.DataStatus]()
      val (_, roomRef) = createRoom(
        UUID.randomUUID(),
        withUsers(user, user2).withRevealed()
      )

      roomRef ! Room.Vote(user2.token, "5")
      roomRef ! Room.GetData(dataProbe.ref)

      val data = dataProbe.expectMessageType[Room.DataStatus].data
      data.estimateFor(user) mustBe Some(("3", true))
      data.estimateFor(user2) mustBe None
      data.state.round.revealed mustBe true
    }

    "publish on a refused vote, the same as on one that lands" in {
      val (user, userProbe) = createUser(UUID.randomUUID(), "user1", true, "3")
      val (_, roomRef)      = createRoom(
        UUID.randomUUID(),
        withUsers(user).withRevealed()
      )

      roomRef ! Room.Vote(user.token, "8")

      val snapshot = expectSnapshot(userProbe)
      snapshot.votesRevealed mustBe true
      snapshot.users.map(_.estimation) mustBe List("3")
    }

    "keep a reconnecting user's vote instead of resetting it" in {
      val (user, _)    = createUser(UUID.randomUUID(), "user1", true, "5")
      val dataProbe    = testKit.createTestProbe[Room.DataStatus]()
      val (_, roomRef) = createRoom(UUID.randomUUID(), withUsers(user))

      // A reconnect Joins the same identity under a new ref; the estimate is keyed by
      // id in the round, so the rejoin never touches it.
      val newRefProbe = TestProbe()(testKit.system.classicSystem)
      roomRef ! Room.Join(user.id, user.name, user.token, newRefProbe.ref)
      roomRef ! Room.GetData(dataProbe.ref)

      val data = dataProbe.expectMessageType[Room.DataStatus].data
      data.estimateFor(user) mustBe Some(("5", true))
      data.connections(user.id) mustBe Set(user.ref, newRefProbe.ref)
    }

    "build a RoomData when every member has a matching session" in {
      val (user, _)  = createUser(UUID.randomUUID(), "user1", false, "")
      val (user2, _) = createUser(UUID.randomUUID(), "user2", true, "5")
      val members    = Map(user.id -> Room.Member(user.name), user2.id -> Room.Member(user2.name))
      val sessions   = Map(
        user.token  -> Room.Session(user.id, user.name),
        user2.token -> Room.Session(user2.id, user2.name)
      )

      val data = RoomData.of(members = members, sessions = sessions)

      data.members mustBe members
      data.sessions mustBe sessions
      data.state mustBe Room.RoomState.empty
    }

    "refuse a RoomData whose member has no session at all" in {
      val (user, _) = createUser(UUID.randomUUID(), "user1", false, "")

      val thrown = intercept[IllegalArgumentException] {
        RoomData.of(members = Map(user.id -> Room.Member(user.name)))
      }

      thrown.getMessage must include("has no session")
    }

    "refuse a RoomData whose member's session names a different identity" in {
      val (user, _)  = createUser(UUID.randomUUID(), "user1", false, "")
      val (other, _) = createUser(UUID.randomUUID(), "user2", false, "")

      val thrown = intercept[IllegalArgumentException] {
        RoomData.of(
          members = Map(user.id -> Room.Member(user.name)),
          sessions = Map(other.token -> Room.Session(user.id, other.name))
        )
      }

      thrown.getMessage must include("a different name")
    }

    "refuse a RoomData whose member's session disagrees on the name alone" in {
      val (user, _) = createUser(UUID.randomUUID(), "user1", false, "")

      val thrown = intercept[IllegalArgumentException] {
        RoomData.of(
          members = Map(user.id -> Room.Member(user.name)),
          sessions = Map(user.token -> Room.Session(user.id, "someone else"))
        )
      }

      thrown.getMessage must include("a different name")
    }

    "allow a session that has no member, which is what retention produces" in {
      val (user, _)     = createUser(UUID.randomUUID(), "user1", false, "")
      val (departed, _) = createUser(UUID.randomUUID(), "user2", false, "")
      val sessions      = Map(
        user.token     -> Room.Session(user.id, user.name),
        departed.token -> Room.Session(departed.id, departed.name)
      )

      val data = RoomData.of(members = Map(user.id -> Room.Member(user.name)), sessions = sessions)

      data.members.keySet mustBe Set(user.id)
      data.sessions.keySet mustBe Set(user.token, departed.token)
    }

    "refuse construction that bypasses of" in {
      val (user, _) = createUser(UUID.randomUUID(), "user1", false, "")

      // The whole point of the private constructor: copy and apply are shut, and so are the
      // methods that write members, sessions and connections.
      assertDoesNotCompile(
        """Room.RoomData(Room.RoomState.empty, Map.empty, Map.empty, Map.empty)"""
      )
      assertDoesNotCompile("""RoomData.empty.copy(state = Room.RoomState.empty)""")
      assertDoesNotCompile("""RoomData.empty.connect(user.id, user.name, user.ref)""")
      assertDoesNotCompile("""RoomData.empty.removeMember(user.id)""")
      assertDoesNotCompile("""RoomData.empty.disconnect(user.id, user.ref)""")
      assertDoesNotCompile("""RoomData.empty.registerSession(user.token, user.id, "Mallory")""")
      // Reverting a modifier to check one needs `sbt clean`; incrementally the verdict is stale.
      assertCompiles("""RoomData.of()""")
      // Resolves every name the refusals use, so none can pass on a typo. Not their arity:
      // the real calls are the thing that must not compile from here.
      assertCompiles("""(user.id, user.name, user.ref, user.token)""")
    }

    "refuse a blank estimation rather than storing one" in {
      val (user, _)    = createUser(UUID.randomUUID(), "user1", false, "")
      val (user2, _)   = createUser(UUID.randomUUID(), "user2", false, "")
      val dataProbe    = testKit.createTestProbe[Room.DataStatus]()
      val (_, roomRef) = createRoom(UUID.randomUUID(), withUsers(user, user2))

      roomRef ! Room.Vote(user.token, "")
      roomRef ! Room.Vote(user2.token, "   ")
      roomRef ! Room.GetData(dataProbe.ref)

      // Absence is structural now, so a blank value would enter the tally as its own bucket.
      val data = dataProbe.expectMessageType[Room.DataStatus].data
      data.state.round.estimates mustBe empty
      data.state.round.revealed mustBe false
    }

    "publish on a refused blank vote, the same as on one that lands" in {
      val (user, userProbe) = createUser(UUID.randomUUID(), "user1", false, "")
      val (_, roomRef)      = createRoom(UUID.randomUUID(), withUsers(user))

      roomRef ! Room.Vote(user.token, "")

      // The absence of a special case: vote returns unchanged data through the same publish.
      expectSnapshot(userProbe).users.map(_.hasEstimation) mustBe List(false)
    }

    "refuse an Estimate with a blank value" in {
      val thrown = intercept[IllegalArgumentException](Room.Estimate.of(" "))

      thrown.getMessage must include("needs a value")
    }

    "clear the confirmation but keep the value on a re-vote" in {
      val (user, _)    = createUser(UUID.randomUUID(), "user1", true, "3")
      val dataProbe    = testKit.createTestProbe[Room.DataStatus]()
      val (_, roomRef) = createRoom(UUID.randomUUID(), withUsers(user).withRevealed())

      roomRef ! Room.ReVote(user.token)
      roomRef ! Room.GetData(dataProbe.ref)

      // The state Estimate exists to express: an estimation with no confirmation.
      dataProbe.expectMessageType[Room.DataStatus].data.estimateFor(user) mustBe Some(("3", false))
    }

    "refuse a RoomData whose estimate resolves to no session" in {
      val (user, _) = createUser(UUID.randomUUID(), "user1", false, "")
      val stranger  = UUID.randomUUID()
      val state     = Room.RoomState("", Room.Round(Map(stranger -> Room.Estimate.of("5")), false))

      val thrown = intercept[IllegalArgumentException] {
        RoomData.of(
          state = state,
          members = Map(user.id -> Room.Member(user.name)),
          sessions = Map(user.token -> Room.Session(user.id, user.name))
        )
      }

      thrown.getMessage must include("resolves to no session")
    }

    "allow an estimate whose member has gone, which is what a departure produces" in {
      val (user, _)     = createUser(UUID.randomUUID(), "user1", false, "")
      val (departed, _) = createUser(UUID.randomUUID(), "user2", true, "8")

      // Problem A's guarantee: the estimate is keyed by id and outlives membership.
      val data = withUsers(user).withMemberlessSession(departed).withEstimate(departed)

      data.estimateFor(departed) mustBe Some(("8", true))
      data.members.keySet mustBe Set(user.id)
    }

    "send one snapshot to each of a member's connections" in {
      val (user, userProbe)   = createUser(UUID.randomUUID(), "user1", false, "")
      val (user2, user2Probe) = createUser(UUID.randomUUID(), "user2", false, "")
      val secondTab           = TestProbe()(testKit.system.classicSystem)
      val (_, roomRef)        = createRoom(
        UUID.randomUUID(),
        withUsers(user, user2).withSecondConnection(user, secondTab.ref)
      )

      roomRef ! Room.EditIssue(user.token, "an issue")

      // One participant, two connections, one identity: both tabs are redacted for user.
      for probe <- List(userProbe, secondTab) do
        val snapshot = expectSnapshot(probe)
        snapshot.you mustBe user.id
        snapshot.currentIssue mustBe "an issue"
      expectSnapshot(user2Probe).you mustBe user2.id
    }

    "hold both connections when a replacement arrives before the first drops" in {
      val (user, _)    = createUser(UUID.randomUUID(), "user1", false, "")
      val dataProbe    = testKit.createTestProbe[Room.DataStatus]()
      val (_, roomRef) = createRoom(UUID.randomUUID(), withUsers(user))

      val replacement = TestProbe()(testKit.system.classicSystem)
      roomRef ! Room.Join(user.id, user.name, user.token, replacement.ref)
      roomRef ! Room.GetData(dataProbe.ref)

      // A map keyed by id cannot duplicate the member; the second tab is a second ref.
      val data = dataProbe.expectMessageType[Room.DataStatus].data
      data.members.keySet mustBe Set(user.id)
      data.connections(user.id) mustBe Set(user.ref, replacement.ref)
    }

    "schedule no removal when the connection that drops is not the member's last" in {
      val (user, _)         = createUser(UUID.randomUUID(), "user1", false, "")
      val (user2, _)        = createUser(UUID.randomUUID(), "user2", false, "")
      val replacement       = TestProbe()(testKit.system.classicSystem)
      val roomResponseProbe = testKit.createTestProbe[Room.Response]()
      val dataProbe         = testKit.createTestProbe[Room.DataStatus]()
      val (_, roomRef)      = createRoom(
        UUID.randomUUID(),
        withUsers(user, user2),
        gracePeriod = 50.millis
      )

      // The race itself, driven rather than seeded: the replacement stream is established
      // before the old one's termination arrives, so the set briefly holds two refs.
      roomRef ! Room.Join(user.id, user.name, user.token, replacement.ref)
      roomRef ! Room.Leave(user.id, user.ref, roomResponseProbe.ref)

      // Problem C made unrepresentable: the question is answered at Leave time, so the
      // racing reconnect leaves no timer to go stale rather than a check to absorb it.
      roomResponseProbe.expectNoMessage(200.millis)
      roomRef ! Room.GetData(dataProbe.ref)
      val data = dataProbe.expectMessageType[Room.DataStatus].data
      data.members.keySet mustBe Set(user.id, user2.id)
      data.connections(user.id) mustBe Set(replacement.ref)
    }

    "schedule no removal when the connection that drops belongs to no member" in {
      val (user, _)         = createUser(UUID.randomUUID(), "user1", false, "")
      val (departed, _)     = createUser(UUID.randomUUID(), "user2", false, "")
      val roomResponseProbe = testKit.createTestProbe[Room.Response]()
      val (_, roomRef)      = createRoom(
        UUID.randomUUID(),
        withUsers(user, departed).withDeparted(departed),
        gracePeriod = 50.millis
      )

      roomRef ! Room.Leave(departed.id, departed.ref, roomResponseProbe.ref)

      // Section 4's leave endpoint: membership ended first, so the tab's own drop removes nobody.
      roomResponseProbe.expectNoMessage(200.millis)
    }

    "keep a member with no connection in everyone's list" in {
      val (user, userProbe)   = createUser(UUID.randomUUID(), "user1", false, "")
      val (user2, user2Probe) = createUser(UUID.randomUUID(), "user2", false, "")
      val (_, roomRef)        = createRoom(
        UUID.randomUUID(),
        withUsers(user, user2).withNoConnection(user)
      )

      roomRef ! Room.EditIssue(user2.token, "an issue")

      // The grace period doing its job: the row survives, the sends do not.
      expectSnapshot(user2Probe).users.map(_.id).toSet mustBe Set(user.id, user2.id)
      userProbe.expectNoMessage()
    }

    "publish nothing when a connection drops" in {
      val (user, _)           = createUser(UUID.randomUUID(), "user1", false, "")
      val (user2, user2Probe) = createUser(UUID.randomUUID(), "user2", false, "")
      val secondTab           = TestProbe()(testKit.system.classicSystem)
      val roomResponseProbe   = testKit.createTestProbe[Room.Response]()
      val (_, roomRef)        = createRoom(
        UUID.randomUUID(),
        withUsers(user, user2).withSecondConnection(user, secondTab.ref),
        gracePeriod = 200.millis
      )

      roomRef ! Room.Leave(user.id, user.ref, roomResponseProbe.ref)

      // A transient drop changes no snapshot, so it produces no wire traffic at all.
      user2Probe.expectNoMessage(300.millis)
    }

    "refuse a RoomData whose connection resolves to no session" in {
      val (user, _) = createUser(UUID.randomUUID(), "user1", false, "")
      val stranger  = UUID.randomUUID()

      val thrown = intercept[IllegalArgumentException] {
        RoomData.of(
          sessions = Map(user.token -> Room.Session(user.id, user.name)),
          connections = Map(stranger -> Set(user.ref))
        )
      }

      thrown.getMessage must include("resolves to no session")
    }

    "allow a connection whose member has gone, which is what a departure produces" in {
      val (user, _)     = createUser(UUID.randomUUID(), "user1", false, "")
      val (departed, _) = createUser(UUID.randomUUID(), "user2", false, "")

      // Required rather than tolerated: section 4's leave endpoint removes the member
      // while that tab's stream is still open, and step 6 is what recovers it.
      val data = withUsers(user, departed).withDeparted(departed)

      data.members.keySet mustBe Set(user.id)
      data.connections.keySet mustBe Set(user.id, departed.id)
    }
  }
end RoomSpec

object RoomSpec:
  def expectSnapshot(probe: TestProbe): RoomSnapshot =
    probe.expectMsgType[RoomSnapshot]

  def createUser(uuid: UUID, name: String, voted: Boolean, estimation: String)(using
      testKit: ActorTestKit
  ): (Attendee, TestProbe) =
    val probe = TestProbe()(testKit.system.classicSystem)
    (Attendee(uuid, name, voted, estimation, probe.ref, Room.SessionToken.mint()), probe)

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
