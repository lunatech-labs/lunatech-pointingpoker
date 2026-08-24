package com.lunatech.pointingpoker.actors

import java.util.UUID

import scala.concurrent.ExecutionContext
import scala.concurrent.duration.*

import org.apache.pekko.actor.testkit.typed.scaladsl.ActorTestKit
import org.apache.pekko.actor.typed.scaladsl.adapter.*
import org.apache.pekko.stream.Materializer
import org.apache.pekko.stream.scaladsl.Keep
import org.apache.pekko.stream.testkit.scaladsl.TestSink
import org.scalatest.BeforeAndAfterAll
import org.scalatest.matchers.must
import org.scalatest.wordspec.AnyWordSpec

import com.lunatech.pointingpoker.actors.RoomManager.RoomManagerData
import com.lunatech.pointingpoker.sse.SSE

/** End-to-end regression coverage for the SSE backpressure fix (see
  * docs/superpowers/specs/2026-08-24-sse-backpressure-design.md): a real RoomManager
  * routing to a real Room, with real SSE.source streams standing in for two browser
  * tabs, rather than the isolated pieces RoomSpec and SSESpec each verify on their
  * own. Guards against the specific thing the design doc warns is easy to silently
  * undo (e.g. "simplifying" the buffer size back to 0, or dropping the grace period):
  * a change like that could leave RoomSpec and SSESpec both green while still
  * breaking the actual failure-to-reconnect path, since neither exercises it
  * end-to-end.
  */
class BackpressureReconnectSpec extends AnyWordSpec with must.Matchers with BeforeAndAfterAll:

  val testKit: ActorTestKit = ActorTestKit()

  override def afterAll(): Unit =
    testKit.shutdownTestKit()

  "The SSE backpressure fix" should {

    "let a stalled client's stream fail and silently reconnect, invisible to the rest of the room" in {
      given system: org.apache.pekko.actor.ActorSystem = testKit.system.classicSystem
      given ExecutionContext                            = testKit.system.executionContext
      given Materializer                                = Materializer.matFromSystem(system)

      val roomId      = UUID.randomUUID()
      val gracePeriod = 600.millis

      val roomRef           = testKit.spawn(Room(roomId, Room.RoomData.empty, gracePeriod))
      val roomResponseProbe = testKit.createTestProbe[Room.Response]()
      val managerRef        = testKit.spawn(
        RoomManager.receiveBehaviour(RoomManagerData(Map(roomId -> roomRef)), roomResponseProbe.ref)
      )

      val userAId = UUID.randomUUID()
      val userBId = UUID.randomUUID()
      val tokenA  = Room.SessionToken.mint()
      val tokenB  = Room.SessionToken.mint()

      // Bob is the observer: a well-behaved client that always pulls demand, so
      // whatever he actually receives is exactly what a real browser tab would see.
      val bobProbe = SSE
        .source(managerRef.toClassic, roomId, userBId, "Bob", tokenB)
        .toMat(TestSink())(Keep.right)
        .run()

      bobProbe.request(3)
      bobProbe.expectNext().data must include("\"messageType\":\"init\"")
      bobProbe.expectNext().data must include("\"messageType\":\"join\"") // Bob's own replay
      bobProbe.expectNext().data must include("\"messageType\":\"join\"") // Bob's own broadcast

      // Alice connects but never pulls demand, standing in for a stalled network
      // write. Her own join reply (one batched message) plus the room-wide Join
      // broadcast (a second message) exactly fill the buffer's tolerance of two
      // undelivered elements (see SSE.bufferSize) without overflowing yet.
      val aliceProbe = SSE
        .source(managerRef.toClassic, roomId, userAId, "Alice", tokenA)
        .toMat(TestSink())(Keep.right)
        .run()
      aliceProbe.ensureSubscription()

      bobProbe.request(1)
      val aliceJoinFrame = bobProbe.expectNext()
      aliceJoinFrame.data must include("\"messageType\":\"join\"")
      aliceJoinFrame.data must include(userAId.toString)

      // One more broadcast is the third undelivered element in Alice's buffer, so it
      // fails her stream instead of vanishing silently. Deliberately never requesting
      // demand on aliceProbe matters here, not just for setup: requesting even one
      // element would drain a buffered one and could free up the room this broadcast
      // needs to overflow, masking the failure instead of reproducing it. onError is
      // not subject to backpressure the way onNext is, so expectError() still sees it
      // without any demand ever being granted.
      roomRef ! Room.ShowVotes(tokenB)

      aliceProbe.expectError()

      bobProbe.request(1)
      bobProbe.expectNext().data must include("\"messageType\":\"show\"")

      // Alice's failed stream reports ConnectionFailure asynchronously, which starts
      // her grace period. Bob must not see a Leave for her while it's running.
      bobProbe.request(1)
      bobProbe.expectNoMessage(gracePeriod / 3)

      // Alice reconnects well within the grace period, the way a real EventSource
      // retry would.
      val aliceReconnectProbe = SSE
        .source(managerRef.toClassic, roomId, userAId, "Alice", tokenA)
        .toMat(TestSink())(Keep.right)
        .run()
      aliceReconnectProbe.request(1)
      aliceReconnectProbe.expectNext() // her own reconnect reply; content isn't under test here

      // Satisfies the demand requested above: the reconnect's room-wide Join, not a
      // Leave.
      val aliceReconnectFrame = bobProbe.expectNext()
      aliceReconnectFrame.data must include("\"messageType\":\"join\"")
      aliceReconnectFrame.data must include(userAId.toString)

      // Even once the original grace period has fully elapsed, no Leave for Alice
      // ever arrives: the stale teardown found her already reconnected under a new
      // ref and swallowed itself.
      bobProbe.request(1)
      bobProbe.expectNoMessage(gracePeriod * 2)
    }
  }
end BackpressureReconnectSpec
