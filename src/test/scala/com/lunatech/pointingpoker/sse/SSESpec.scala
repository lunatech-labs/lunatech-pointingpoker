package com.lunatech.pointingpoker.sse

import java.util.UUID

import org.apache.pekko.actor.ActorSystem
import org.apache.pekko.stream.scaladsl.Keep
import org.apache.pekko.stream.testkit.scaladsl.TestSink
import org.apache.pekko.testkit.TestProbe
import org.scalatest.BeforeAndAfterAll
import org.scalatest.matchers.must
import org.scalatest.wordspec.AnyWordSpec

import com.lunatech.pointingpoker.actors.RoomEvent.MessageType
import com.lunatech.pointingpoker.actors.{Room, RoomEvent}

class SSESpec extends AnyWordSpec with must.Matchers with BeforeAndAfterAll:

  given system: ActorSystem                   = ActorSystem("SSESpec")
  given ec: scala.concurrent.ExecutionContext = system.dispatcher

  override def afterAll(): Unit =
    system.terminate()

  private def wire() =
    val roomManagerProbe = TestProbe()
    val roomId            = UUID.randomUUID()
    val userId            = UUID.randomUUID()
    val token             = Room.SessionToken.mint()
    val (user, probe)     =
      SSE
        .source(roomManagerProbe.ref, roomId, userId, "Alice", token)
        .toMat(TestSink())(Keep.both)
        .run()
    (roomId, userId, user, probe)

  "SSE.source" should {

    "flatten a batched list of events into individual SSE frames, in order" in {
      val (roomId, userId, user, probe) = wire()
      probe.request(2)

      user ! List(
        RoomEvent(MessageType.Join, roomId, userId, "Alice"),
        RoomEvent(MessageType.Vote, roomId, userId, "5")
      )

      probe.expectNext().data must include("\"messageType\":\"join\"")
      probe.expectNext().data must include("\"messageType\":\"vote\"")
    }

    "fail the stream when the buffer overflows, instead of silently dropping events" in {
      val (roomId, userId, user, probe) = wire()
      probe.ensureSubscription()

      // No demand requested yet: production's buffer size is 0, so a clear excess of
      // undelivered batches must fail the stream (and let the client reconnect), not
      // vanish silently.
      (1 to 5).foreach(i =>
        user ! List(RoomEvent(MessageType.Vote, roomId, userId, i.toString))
      )
      probe.request(5)
      probe.expectError()
    }

    "set an explicit retry hint so clients reconnect on a value this app controls" in {
      val (roomId, userId, user, probe) = wire()
      probe.request(1)

      user ! List(RoomEvent(MessageType.Join, roomId, userId, "Alice"))

      probe.expectNext().retry mustBe Some(2000)
    }
  }
end SSESpec
