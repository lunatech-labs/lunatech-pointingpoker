package com.lunatech.pointingpoker.probe

import org.apache.pekko.http.scaladsl.model.StatusCodes
import org.apache.pekko.http.scaladsl.model.headers.RawHeader
import org.apache.pekko.http.scaladsl.server.Route
import org.apache.pekko.http.scaladsl.testkit.{RouteTestTimeout, ScalatestRouteTest}
import com.lunatech.pointingpoker.config.ProbeConfig
import org.scalatest.matchers.must
import org.scalatest.wordspec.AnyWordSpec

import scala.concurrent.duration.*

class ProbeRoutesSpec extends AnyWordSpec with must.Matchers with ScalatestRouteTest:

  implicit val routeTimeout: RouteTestTimeout = RouteTestTimeout(10.seconds)

  private val enabled: Route =
    ProbeRoutes(ProbeConfig(enabled = true, "src/main/resources/pages/probe.html")).route
  private val disabled: Route =
    ProbeRoutes(ProbeConfig(enabled = false, "src/main/resources/pages/probe.html")).route

  "ProbeRoutes" should {
    "not serve the page when the probe is disabled" in {
      Get("/probe") ~> disabled ~> check {
        handled mustBe false
      }
    }

    "not serve a stream when the probe is disabled" in {
      Get("/probe/stream?kind=sse&frames=1&interval=0&close=0") ~> disabled ~> check {
        handled mustBe false
      }
    }

    "serve an event stream when the probe is enabled" in {
      Get("/probe/stream?kind=sse&frames=1&interval=0&close=0") ~> enabled ~> check {
        status mustBe StatusCodes.OK
        contentType.mediaType.toString mustBe "text/event-stream"
      }
    }

    // Probe D's whole purpose: assumption 8 holds only if the header survives the appliance,
    // so the server has to report back what it actually received.
    "report the Last-Event-ID it received back to the client" in {
      Get("/probe/stream?kind=sse&frames=1&interval=0&close=0")
        .withHeaders(RawHeader("Last-Event-ID", "probe-c-1")) ~> enabled ~> check {
        responseAs[String] must include("lastEventId=probe-c-1")
      }
    }

    "report an absent Last-Event-ID as empty rather than omitting it" in {
      Get("/probe/stream?kind=sse&frames=1&interval=0&close=0") ~> enabled ~> check {
        responseAs[String] must include("lastEventId=;")
      }
    }

    "carry an id on its frames when asked, so a reconnect has something to echo" in {
      Get("/probe/stream?kind=sse&frames=1&interval=0&close=0&id=true") ~> enabled ~> check {
        responseAs[String] must include("id:")
      }
    }

    "pad a frame to the requested size, so scan latency can be measured against body size" in {
      Get("/probe/stream?kind=sse&frames=1&interval=0&close=0&size=2048") ~> enabled ~> check {
        responseAs[String].length must be > 2048
      }
    }

    "serve a finite JSON body rather than a stream when asked" in {
      Get("/probe/stream?kind=json&frames=1&interval=0&close=0") ~> enabled ~> check {
        status mustBe StatusCodes.OK
        contentType.mediaType.toString mustBe "application/json"
      }
    }

    "answer a small POST, which is detection's own delivery channel" in {
      Post("/probe/echo") ~> enabled ~> check {
        status mustBe StatusCodes.OK
        responseAs[String] must not be empty
      }
    }
  }
end ProbeRoutesSpec
