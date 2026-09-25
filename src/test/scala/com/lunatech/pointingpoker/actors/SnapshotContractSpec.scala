package com.lunatech.pointingpoker.actors

import java.nio.file.{Files, Path, Paths}
import java.util.UUID

import scala.jdk.CollectionConverters.*

import io.circe.syntax.*
import org.apache.pekko.actor.ActorSystem
import org.apache.pekko.testkit.TestProbe
import org.scalatest.BeforeAndAfterAll
import org.scalatest.matchers.must
import org.scalatest.wordspec.AnyWordSpec

import com.lunatech.pointingpoker.actors.RoomDataFixtures.*

class SnapshotContractSpec extends AnyWordSpec with must.Matchers with BeforeAndAfterAll:

  given system: ActorSystem = ActorSystem("SnapshotContractSpec")

  // sbt forks the test JVM at the repo root, so this lands beside the build's own target.
  private val contractDir: Path = Paths.get("target", "contract")

  // Emptied once before any case, so a state removed from this spec leaves no file behind.
  override def beforeAll(): Unit =
    Files.createDirectories(contractDir)
    Files.list(contractDir).iterator().asScala.foreach(Files.delete)

  override def afterAll(): Unit =
    system.terminate()

  // Fixed ids keep each file byte-stable across runs, so two runs compare with a plain diff.
  private val ids = Map("Alice" -> 1, "Bob" -> 2)

  private def user(name: String, voted: Boolean, estimation: String): Attendee =
    val id = UUID.fromString(f"00000000-0000-0000-0000-${ids(name)}%012d")
    Attendee(id, name, voted, estimation, TestProbe().ref, Room.SessionToken.mint())

  // tag, when set, must appear as some participant's estimation type, so a name cannot lie.
  final private case class ContractState(
      name: String,
      snapshot: () => RoomSnapshot,
      tag: Option[String] = None
  )

  // Alice reads; Bob, when present, holds the state under test.
  private def tagState(name: String, tag: String, data: (Attendee, Attendee) => Room.RoomData) =
    ContractState(
      name,
      () =>
        val alice = user("Alice", false, "")
        RoomSnapshot.of(data(alice, user("Bob", false, "")), alice.id)
      ,
      Some(tag)
    )

  private val states: List[ContractState] = List(
    ContractState(
      "before-reveal",
      () =>
        val alice = user("Alice", true, "5")
        RoomSnapshot.of(withUsers(alice, user("Bob", true, "13")).withIssue("PP-1"), alice.id)
    ),
    ContractState(
      "after-reveal",
      () =>
        val alice = user("Alice", true, "5")
        val data  = withUsers(alice, user("Bob", true, "13")).withIssue("PP-1").withRevealed()
        RoomSnapshot.of(data, alice.id)
    ),
    ContractState(
      "empty-issue",
      () =>
        val alice = user("Alice", false, "")
        RoomSnapshot.of(withUsers(alice).withIssue(""), alice.id)
    ),
    tagState("estimation-no-estimation", "NoEstimation", (alice, _) => withUsers(alice)),
    tagState(
      "estimation-confirmed-hidden",
      "ConfirmedHidden",
      (alice, bob) => withUsers(alice, bob.copy(voted = true, estimation = "13"))
    ),
    tagState(
      "estimation-unconfirmed-hidden",
      "UnconfirmedHidden",
      (alice, bob) => withUsers(alice, bob.copy(estimation = "13"))
    ),
    tagState(
      "estimation-confirmed",
      "Confirmed",
      (alice, _) => withUsers(alice.copy(voted = true, estimation = "5"))
    ),
    tagState(
      "estimation-unconfirmed",
      "Unconfirmed",
      (alice, _) => withUsers(alice.copy(estimation = "5"))
    )
  )

  "The snapshot contract" should {
    for state <- states do
      s"write a representative snapshot for ${state.name}" in {
        val json = state.snapshot().asJson
        val tags = json.hcursor
          .downField("users")
          .values
          .toList
          .flatten
          .flatMap(_.hcursor.downField("estimation").get[String]("type").toOption)
        state.tag.foreach(tag => tags must contain(tag))
        Files.writeString(contractDir.resolve(s"${state.name}.json"), json.spaces2)
      }
  }
end SnapshotContractSpec
