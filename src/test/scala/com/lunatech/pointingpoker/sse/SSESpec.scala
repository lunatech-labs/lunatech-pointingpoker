package com.lunatech.pointingpoker.sse

import java.util.UUID

import scala.concurrent.duration.DurationInt

import org.apache.pekko.actor.ActorSystem
import org.apache.pekko.stream.scaladsl.Keep
import org.apache.pekko.stream.testkit.scaladsl.TestSink
import org.apache.pekko.testkit.TestProbe
import org.scalatest.BeforeAndAfterAll
import org.scalatest.matchers.must
import org.scalatest.wordspec.AnyWordSpec

import com.lunatech.pointingpoker.actors.{Room, RoomSnapshot}

class SSESpec extends AnyWordSpec with must.Matchers with BeforeAndAfterAll:

  given system: ActorSystem                   = ActorSystem("SSESpec")
  given ec: scala.concurrent.ExecutionContext = system.dispatcher

  override def afterAll(): Unit =
    system.terminate()

  private def wire() =
    val roomManagerProbe = TestProbe()
    val roomId           = UUID.randomUUID()
    val userId           = UUID.randomUUID()
    val token            = Room.SessionToken.mint()
    val (user, probe)    =
      SSE
        .source(roomManagerProbe.ref, roomId, userId, "Alice", token)
        .toMat(TestSink())(Keep.both)
        .run()
    (roomId, userId, user, probe)
  end wire

  private def snapshot(userId: UUID, issue: String) =
    RoomSnapshot(userId, issue, false, List(RoomSnapshot.Participant(userId, "Alice", false, "")))

  "SSE.source" should {

    "keep a stalled client's stream open and hand it the newest snapshot, not a stale queued one" in {
      val (_, userId, user, probe) = wire()
      probe.ensureSubscription()

      // No demand yet, so these queue past the buffer's tolerance. Under fail this errored;
      // under dropHead the superseded ones are discarded and the stream stays open.
      (1 to 5).foreach(i => user ! snapshot(userId, s"issue $i"))

      // Nothing is pushed without demand, and this settles all five before any is granted.
      probe.expectNoMessage(300.millis)

      probe.request(5)
      // bufferSize + 1 survive: the one already current, plus the newest queued behind it.
      probe.expectNextN(2).last.data must include("issue 5")
      probe.expectNoMessage()
    }

    "set an explicit retry hint so clients reconnect on a value this app controls" in {
      val (_, userId, user, probe) = wire()
      probe.request(1)

      user ! snapshot(userId, "")

      probe.expectNext().retry mustBe Some(2000)
    }
  }
end SSESpec
