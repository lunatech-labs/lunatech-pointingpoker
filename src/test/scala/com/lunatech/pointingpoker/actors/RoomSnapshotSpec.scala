package com.lunatech.pointingpoker.actors

import java.util.UUID

import io.circe.syntax.*
import org.apache.pekko.actor.ActorSystem
import org.apache.pekko.testkit.TestProbe
import org.scalatest.BeforeAndAfterAll
import org.scalatest.matchers.must
import org.scalatest.wordspec.AnyWordSpec

import com.lunatech.pointingpoker.actors.Room.RoomData

class RoomSnapshotSpec extends AnyWordSpec with must.Matchers with BeforeAndAfterAll:

  given system: ActorSystem = ActorSystem("RoomSnapshotSpec")

  override def afterAll(): Unit =
    system.terminate()

  private def user(id: UUID, name: String, voted: Boolean, estimation: String): Room.User =
    Room.User(id, name, voted, estimation, TestProbe().ref, Room.SessionToken.mint())

  "RoomSnapshot.of" should {

    "name the recipient it was built for" in {
      val alice = user(UUID.randomUUID(), "Alice", false, "")
      val data  = RoomData.empty.copy(users = List(alice))

      RoomSnapshot.of(data, alice.id).you mustBe alice.id
    }

    "order participants by id so every recipient agrees and a reconnect cannot reshuffle" in {
      val low  = user(UUID.fromString("00000000-0000-0000-0000-000000000001"), "Low", false, "")
      val high = user(UUID.fromString("ffffffff-0000-0000-0000-000000000000"), "High", false, "")
      val data = RoomData.empty.copy(users = List(high, low))

      RoomSnapshot.of(data, low.id).users.map(_.name) mustBe List("Low", "High")
    }

    "carry the stored reveal flag rather than deriving one" in {
      val alice = user(UUID.randomUUID(), "Alice", false, "")
      val bob   = user(UUID.randomUUID(), "Bob", true, "5")
      val data  = RoomData.empty.copy(users = List(alice, bob), revealed = true)

      // Not every participant has voted, so a derived predicate would say false here.
      RoomSnapshot.of(data, alice.id).votesRevealed mustBe true
    }

    "carry the current issue" in {
      val alice = user(UUID.randomUUID(), "Alice", false, "")
      val data  = RoomData.empty.copy(users = List(alice), currentIssue = "PP-1")

      RoomSnapshot.of(data, alice.id).currentIssue mustBe "PP-1"
    }

    "build for a recipient who is not a member, rather than failing" in {
      val alice   = user(UUID.randomUUID(), "Alice", false, "")
      val departed = UUID.randomUUID()
      val data    = RoomData.empty.copy(users = List(alice))

      val snapshot = RoomSnapshot.of(data, departed)
      snapshot.you mustBe departed
      snapshot.users.map(_.id) must not contain departed
    }

    "put no session token on the wire" in {
      val alice = user(UUID.randomUUID(), "Alice", true, "5")
      val data  = RoomData.empty.copy(users = List(alice))

      RoomSnapshot.of(data, alice.id).asJson.noSpaces must not include alice.token.raw
    }

    "serialize exactly the agreed field set" in {
      val alice = user(UUID.randomUUID(), "Alice", true, "5")
      val data  = RoomData.empty.copy(users = List(alice), currentIssue = "PP-1", revealed = true)

      val json = RoomSnapshot.of(data, alice.id).asJson
      json.asObject.map(_.keys.toList) mustBe Some(
        List("you", "currentIssue", "votesRevealed", "users")
      )
      // hasEstimation is step 2 and history is step 9; a field with no consumer must not travel.
      json.hcursor.downField("users").downArray.keys.map(_.toList) mustBe Some(
        List("id", "name", "voted", "estimation")
      )
    }
  }
end RoomSnapshotSpec
