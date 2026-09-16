package com.lunatech.pointingpoker.actors

import java.util.UUID

import io.circe.syntax.*
import org.apache.pekko.actor.ActorSystem
import org.apache.pekko.testkit.TestProbe
import org.scalatest.BeforeAndAfterAll
import org.scalatest.matchers.must
import org.scalatest.wordspec.AnyWordSpec

import com.lunatech.pointingpoker.actors.RoomDataFixtures.*

class RoomSnapshotSpec extends AnyWordSpec with must.Matchers with BeforeAndAfterAll:

  given system: ActorSystem = ActorSystem("RoomSnapshotSpec")

  override def afterAll(): Unit =
    system.terminate()

  private def user(id: UUID, name: String, voted: Boolean, estimation: String): Room.User =
    Room.User(id, name, voted, estimation, TestProbe().ref, Room.SessionToken.mint())

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
        List("id", "name", "voted", "hasEstimation", "estimation")
      )
    }

    "withhold another participant's estimation until the room reveals" in {
      val alice = user(UUID.randomUUID(), "Alice", true, "5")
      val bob   = user(UUID.randomUUID(), "Bob", true, "13")
      val data  = withUsers(alice, bob)

      val forAlice = RoomSnapshot.of(data, alice.id)
      forAlice.users.find(_.id == alice.id).map(_.estimation) mustBe Some("5")
      forAlice.users.find(_.id == bob.id).map(_.estimation) mustBe Some("")

      val forBob = RoomSnapshot.of(data, bob.id)
      forBob.users.find(_.id == bob.id).map(_.estimation) mustBe Some("13")
      forBob.users.find(_.id == alice.id).map(_.estimation) mustBe Some("")
    }

    "keep a withheld estimation out of the serialized frame entirely" in {
      val alice = user(UUID.randomUUID(), "Alice", true, "5")
      val bob   = user(UUID.randomUUID(), "Bob", true, "13")
      val data  = withUsers(alice, bob)

      val json = RoomSnapshot.of(data, alice.id).asJson
      // The property is about the wire, not the projection: devtools is the threat.
      (json.noSpaces must not).include("\"13\"")
      val rows = json.hcursor.downField("users").values.toList.flatten
      // The key stays, empty: the wire keeps estimation a String that is always present.
      rows.flatMap(_.asObject.map(_.keys.toList)) mustBe List.fill(2)(
        List("id", "name", "voted", "hasEstimation", "estimation")
      )
    }

    "hand every estimation over once the room has revealed" in {
      val alice = user(UUID.randomUUID(), "Alice", true, "5")
      val bob   = user(UUID.randomUUID(), "Bob", true, "13")
      val data  = withUsers(alice, bob).withRevealed()

      RoomSnapshot.of(data, alice.id).users.map(_.estimation).toSet mustBe Set("5", "13")
    }

    "say that another participant has an estimation without saying what it is" in {
      val alice = user(UUID.randomUUID(), "Alice", false, "")
      val bob   = user(UUID.randomUUID(), "Bob", true, "13")
      val data  = withUsers(alice, bob)

      val bobsRow = RoomSnapshot.of(data, alice.id).users.find(_.id == bob.id)
      // Computed from the unredacted value, so the hidden-value icon renders as it does today.
      bobsRow.map(_.hasEstimation) mustBe Some(true)
      bobsRow.map(_.estimation) mustBe Some("")
      RoomSnapshot.of(data, alice.id).users.find(_.id == alice.id).map(_.hasEstimation) mustBe
        Some(false)
    }

    "distinguish a re-vote from a clear on another participant's row" in {
      val alice    = user(UUID.randomUUID(), "Alice", false, "")
      val revoting = user(UUID.randomUUID(), "Revoting", false, "13")
      val cleared  = user(UUID.randomUUID(), "Cleared", false, "")
      val data     = withUsers(alice, revoting, cleared)

      val snapshot = RoomSnapshot.of(data, alice.id)
      // voted false with hasEstimation true is the re-vote state, and it has to survive
      // redaction or every row looks cleared.
      snapshot.users.find(_.id == revoting.id).map(_.hasEstimation) mustBe Some(true)
      snapshot.users.find(_.id == cleared.id).map(_.hasEstimation) mustBe Some(false)
    }

    "withhold every estimation from a snapshot built for someone who is not a member" in {
      val alice = user(UUID.randomUUID(), "Alice", true, "5")
      val bob   = user(UUID.randomUUID(), "Bob", true, "13")
      val data  = withUsers(alice, bob)

      // Unreachable today: publish iterates users. Step 4's connections let a departing tab
      // still be handed one snapshot.
      RoomSnapshot.of(data, UUID.randomUUID()).users.map(_.estimation) mustBe List("", "")
    }

    "disclose every estimation to a non-member once the room has revealed" in {
      val alice = user(UUID.randomUUID(), "Alice", true, "5")
      val bob   = user(UUID.randomUUID(), "Bob", true, "13")
      val data  = withUsers(alice, bob).withRevealed()

      // Intentional: post-reveal values are public in the room, and this recipient held a
      // valid room token.
      RoomSnapshot.of(data, UUID.randomUUID()).users.map(_.estimation).toSet mustBe Set("5", "13")
    }
  }
end RoomSnapshotSpec
