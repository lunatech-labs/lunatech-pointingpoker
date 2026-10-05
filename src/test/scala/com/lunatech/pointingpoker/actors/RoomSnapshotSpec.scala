package com.lunatech.pointingpoker.actors

import java.util.UUID

import io.circe.Json
import io.circe.syntax.*
import org.apache.pekko.actor.ActorSystem
import org.apache.pekko.testkit.TestProbe
import org.scalatest.BeforeAndAfterAll
import org.scalatest.matchers.must
import org.scalatest.wordspec.AnyWordSpec

import com.lunatech.pointingpoker.actors.RoomDataFixtures.*
import com.lunatech.pointingpoker.actors.RoomSnapshot.Estimation

class RoomSnapshotSpec extends AnyWordSpec with must.Matchers with BeforeAndAfterAll:

  given system: ActorSystem = ActorSystem("RoomSnapshotSpec")

  override def afterAll(): Unit =
    system.terminate()

  private def user(id: UUID, name: String, voted: Boolean, estimation: String): Attendee =
    Attendee(id, name, voted, estimation, TestProbe().ref, Room.SessionToken.mint())

  "RoomSnapshot.of" should {

    "name the recipient it was built for" in {
      val alice = user(UUID.randomUUID(), "Alice", false, "")
      val data  = withUsers(alice)

      RoomSnapshot.of(data, alice.id).you mustBe alice.id
    }

    "order participants by id so every recipient agrees and a reconnect cannot reshuffle" in {
      // UUID.compareTo compares mostSigBits as signed long, so leading hex 8+ sorts first.
      val first  = user(UUID.fromString("00000000-0000-0000-0000-000000000001"), "First", false, "")
      val second =
        user(UUID.fromString("00000001-0000-0000-0000-000000000000"), "Second", false, "")
      val data = withUsers(second, first)

      RoomSnapshot.of(data, first.id).users.map(_.name) mustBe List("First", "Second")
    }

    "carry the stored reveal flag rather than deriving one" in {
      val alice = user(UUID.randomUUID(), "Alice", false, "")
      val bob   = user(UUID.randomUUID(), "Bob", true, "5")
      val data  = withUsers(alice, bob).withRevealed()

      // Not every participant has voted, so a derived predicate would say false here.
      RoomSnapshot.of(data, alice.id).votesRevealed mustBe true
    }

    "carry the current issue" in {
      val alice = user(UUID.randomUUID(), "Alice", false, "")
      val data  = withUsers(alice).withIssue("PP-1")

      RoomSnapshot.of(data, alice.id).currentIssue mustBe "PP-1"
    }

    "build for a recipient who is not a member, rather than failing" in {
      val alice    = user(UUID.randomUUID(), "Alice", false, "")
      val departed = UUID.randomUUID()
      val data     = withUsers(alice)

      val snapshot = RoomSnapshot.of(data, departed)
      snapshot.you mustBe departed
      snapshot.users.map(_.id) must not contain departed
    }

    "put no session token on the wire" in {
      val alice = user(UUID.randomUUID(), "Alice", true, "5")
      val data  = withUsers(alice)

      (RoomSnapshot.of(data, alice.id).asJson.noSpaces must not).include(alice.token.raw)
    }

    "serialize exactly the agreed field set" in {
      val alice = user(UUID.randomUUID(), "Alice", true, "5")
      val data  = withUsers(alice).withIssue("PP-1").withRevealed()

      val json = RoomSnapshot.of(data, alice.id).asJson
      json.asObject.map(_.keys.toList) mustBe Some(
        List("you", "currentIssue", "votesRevealed", "users")
      )
      // history is step 9; a field with no consumer must not travel.
      json.hcursor.downField("users").downArray.keys.map(_.toList) mustBe Some(
        List("id", "name", "seat")
      )
      json.hcursor.downField("users").downArray.downField("seat").focus mustBe Some(
        Json.obj(
          "type"       -> Json.fromString("Voter"),
          "estimation" -> Json.obj(
            "type"  -> Json.fromString("Confirmed"),
            "value" -> Json.fromString("5")
          )
        )
      )
    }

    "put a facilitator on the wire as a seat with no estimation, before and after the reveal" in {
      val alice = user(UUID.randomUUID(), "Alice", true, "5")
      val bob   = user(UUID.randomUUID(), "Bob", false, "")
      val data  = withUsers(alice, bob).withSeat(bob, Room.Seat.Facilitator)

      for state <- List(data, data.withRevealed()) do
        val rows    = RoomSnapshot.of(state, alice.id).asJson.hcursor.downField("users").values
        val bobsRow = rows.toList.flatten.find(_.hcursor.get[UUID]("id").toOption.contains(bob.id))
        // The whole object, so no estimation key can travel with a facilitator.
        bobsRow.flatMap(_.hcursor.downField("seat").focus) mustBe Some(
          Json.obj("type" -> Json.fromString("Facilitator"))
        )
    }

    "withhold another participant's estimation until the room reveals" in {
      val alice = user(UUID.randomUUID(), "Alice", true, "5")
      val bob   = user(UUID.randomUUID(), "Bob", true, "13")
      val data  = withUsers(alice, bob)

      val forAlice = RoomSnapshot.of(data, alice.id)
      forAlice.users.find(_.id == alice.id).map(_.estimation) mustBe Some(Estimation.Confirmed("5"))
      forAlice.users.find(_.id == bob.id).map(_.estimation) mustBe Some(Estimation.ConfirmedHidden)

      val forBob = RoomSnapshot.of(data, bob.id)
      forBob.users.find(_.id == bob.id).map(_.estimation) mustBe Some(Estimation.Confirmed("13"))
      forBob.users.find(_.id == alice.id).map(_.estimation) mustBe Some(Estimation.ConfirmedHidden)
    }

    "keep a withheld estimation out of the serialized frame entirely" in {
      val alice = user(UUID.randomUUID(), "Alice", true, "5")
      val bob   = user(UUID.randomUUID(), "Bob", true, "13")
      val data  = withUsers(alice, bob)

      val json = RoomSnapshot.of(data, alice.id).asJson
      // The property is about the wire, not the projection: devtools is the threat.
      (json.noSpaces must not).include("\"13\"")
      val rows = json.hcursor.downField("users").values.toList.flatten
      // The key stays, as a tag with no value: a voter's seat keeps estimation always present.
      rows.flatMap(_.hcursor.downField("seat").keys.map(_.toList)) mustBe List.fill(2)(
        List("type", "estimation")
      )
      val bobsRow = rows.find(_.hcursor.get[UUID]("id").toOption.contains(bob.id))
      bobsRow.flatMap(_.hcursor.downField("seat").downField("estimation").focus) mustBe Some(
        Json.obj("type" -> Json.fromString("ConfirmedHidden"))
      )
    }

    "hand every estimation over once the room has revealed" in {
      val alice = user(UUID.randomUUID(), "Alice", true, "5")
      val bob   = user(UUID.randomUUID(), "Bob", true, "13")
      val data  = withUsers(alice, bob).withRevealed()

      RoomSnapshot.of(data, alice.id).users.map(_.estimation).toSet mustBe
        Set(Estimation.Confirmed("5"), Estimation.Confirmed("13"))
    }

    "say that another participant has an estimation without saying what it is" in {
      val alice = user(UUID.randomUUID(), "Alice", false, "")
      val bob   = user(UUID.randomUUID(), "Bob", true, "13")
      val data  = withUsers(alice, bob)

      val bobsRow = RoomSnapshot.of(data, alice.id).users.find(_.id == bob.id)
      // Computed from the unredacted value, so the hidden-value icon renders as it does today.
      bobsRow.map(_.estimation) mustBe Some(Estimation.ConfirmedHidden)
      RoomSnapshot.of(data, alice.id).users.find(_.id == alice.id).map(_.estimation) mustBe
        Some(Estimation.NoEstimation)
    }

    "distinguish a re-vote from a clear on another participant's row" in {
      val alice    = user(UUID.randomUUID(), "Alice", false, "")
      val revoting = user(UUID.randomUUID(), "Revoting", false, "13")
      val cleared  = user(UUID.randomUUID(), "Cleared", false, "")
      val data     = withUsers(alice, revoting, cleared)

      val snapshot = RoomSnapshot.of(data, alice.id)
      // UnconfirmedHidden is the re-vote state, and it has to survive redaction or every
      // row looks cleared.
      snapshot.users.find(_.id == revoting.id).map(_.estimation) mustBe
        Some(Estimation.UnconfirmedHidden)
      snapshot.users.find(_.id == cleared.id).map(_.estimation) mustBe
        Some(Estimation.NoEstimation)
    }

    "withhold every estimation from a snapshot built for someone who is not a member" in {
      val alice = user(UUID.randomUUID(), "Alice", true, "5")
      val bob   = user(UUID.randomUUID(), "Bob", true, "13")
      val data  = withUsers(alice, bob)

      // Unreachable today: publish iterates users. Step 4's connections let a departing tab
      // still be handed one snapshot.
      RoomSnapshot.of(data, UUID.randomUUID()).users.map(_.estimation) mustBe
        List(Estimation.ConfirmedHidden, Estimation.ConfirmedHidden)
    }

    "disclose every estimation to a non-member once the room has revealed" in {
      val alice = user(UUID.randomUUID(), "Alice", true, "5")
      val bob   = user(UUID.randomUUID(), "Bob", true, "13")
      val data  = withUsers(alice, bob).withRevealed()

      // Intentional: post-reveal values are public in the room, and this recipient held a
      // valid room token.
      RoomSnapshot.of(data, UUID.randomUUID()).users.map(_.estimation).toSet mustBe
        Set(Estimation.Confirmed("5"), Estimation.Confirmed("13"))
    }

    "count an entry in the round as an estimation, however the value reads" in {
      val alice = user(UUID.randomUUID(), "Alice", true, "5")
      val bob   = user(UUID.randomUUID(), "Bob", false, "")
      val data  = withUsers(alice, bob)

      // An estimation is the entry existing, not a non-empty string on the participant.
      val rows = RoomSnapshot.of(data, alice.id).users
      rows.find(_.id == alice.id).map(_.estimation) mustBe Some(Estimation.Confirmed("5"))
      rows.find(_.id == bob.id).map(_.estimation) mustBe Some(Estimation.NoEstimation)
    }

    "give each participant the one tag its confirmation and disclosure call for" in {
      val alice       = user(UUID.randomUUID(), "Alice", false, "3")
      val confirmed   = user(UUID.randomUUID(), "Confirmed", true, "5")
      val unconfirmed = user(UUID.randomUUID(), "Unconfirmed", false, "8")
      val none        = user(UUID.randomUUID(), "None", false, "")
      val data        = withUsers(alice, confirmed, unconfirmed, none)

      def tags(snapshot: RoomSnapshot): Map[UUID, Estimation] =
        snapshot.users.map(p => p.id -> p.estimation).toMap

      // The reader re-voting sees her own value, unconfirmed; the rest stay hidden.
      tags(RoomSnapshot.of(data, alice.id)) mustBe Map(
        alice.id       -> Estimation.Unconfirmed("3"),
        confirmed.id   -> Estimation.ConfirmedHidden,
        unconfirmed.id -> Estimation.UnconfirmedHidden,
        none.id        -> Estimation.NoEstimation
      )
      // Show after a partial re-vote discloses an unconfirmed value without confirming it.
      tags(RoomSnapshot.of(data.withRevealed(), alice.id)) mustBe Map(
        alice.id       -> Estimation.Unconfirmed("3"),
        confirmed.id   -> Estimation.Confirmed("5"),
        unconfirmed.id -> Estimation.Unconfirmed("8"),
        none.id        -> Estimation.NoEstimation
      )
    }

    "leave an estimate belonging to no participant out of the snapshot entirely" in {
      val alice    = user(UUID.randomUUID(), "Alice", true, "5")
      val departed = user(UUID.randomUUID(), "Departed", true, "13")
      val data     = withUsers(alice).withMemberlessSession(departed).withEstimate(departed)

      // Invariant 2: every estimate on the wire comes from the join, never from the map.
      val snapshot = RoomSnapshot.of(data, alice.id)
      snapshot.users.map(_.id) mustBe List(alice.id)
      (snapshot.asJson.noSpaces must not).include("\"13\"")
    }

    "leave a participant whose membership ended out of the snapshot" in {
      val alice    = user(UUID.randomUUID(), "Alice", true, "5")
      val departed = user(UUID.randomUUID(), "Departed", true, "13")
      val data     = withUsers(alice, departed).withDeparted(departed).withRevealed()

      // The join is over members, so a revealed round discloses nothing of a departed one.
      val snapshot = RoomSnapshot.of(data, alice.id)
      snapshot.users.map(_.id) mustBe List(alice.id)
      (snapshot.asJson.noSpaces must not).include("\"13\"")
    }
  }
end RoomSnapshotSpec
