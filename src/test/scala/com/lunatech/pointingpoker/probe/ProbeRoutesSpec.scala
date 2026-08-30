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
    ProbeRoutes(ProbeConfig(enabled = true, "src/main/resources/pages/probe.html", 3.minutes)).route
  private val disabled: Route =
    ProbeRoutes(
      ProbeConfig(enabled = false, "src/main/resources/pages/probe.html", 3.minutes)
    ).route

  "ProbeRoutes" should {
    "not serve the page when the probe is disabled" in
      Get("/probe") ~> disabled ~> check {
        handled mustBe false
      }

    "not serve a stream when the probe is disabled" in
      Get("/probe/stream?kind=sse&frames=1&interval=0&close=0") ~> disabled ~> check {
        handled mustBe false
      }

    "serve an event stream when the probe is enabled" in
      Get("/probe/stream?kind=sse&frames=1&interval=0&close=0") ~> enabled ~> check {
        status mustBe StatusCodes.OK
        contentType.mediaType.toString mustBe "text/event-stream"
      }

    // Probe D's whole purpose: assumption 8 holds only if the header survives the appliance,
    // so the server has to report back what it actually received.
    "report the Last-Event-ID it received back to the client" in
      Get("/probe/stream?kind=sse&frames=1&interval=0&close=0")
        .withHeaders(RawHeader("Last-Event-ID", "probe-c-1")) ~> enabled ~> check {
        responseAs[String] must include("lastEventId=probe-c-1")
      }

    "report an absent Last-Event-ID as empty rather than omitting it" in
      Get("/probe/stream?kind=sse&frames=1&interval=0&close=0") ~> enabled ~> check {
        responseAs[String] must include("lastEventId=;")
      }

    "carry an id on its frames when asked, so a reconnect has something to echo" in
      Get("/probe/stream?kind=sse&frames=1&interval=0&close=0&id=true") ~> enabled ~> check {
        responseAs[String] must include("id:")
      }

    "pad a frame to the requested size, so scan latency can be measured against body size" in
      Get("/probe/stream?kind=sse&frames=1&interval=0&close=0&size=2048") ~> enabled ~> check {
        responseAs[String].length must be > 2048
      }

    "serve a finite JSON body rather than a stream when asked" in
      Get("/probe/stream?kind=json&frames=1&interval=0&close=0") ~> enabled ~> check {
        status mustBe StatusCodes.OK
        contentType.mediaType.toString mustBe "application/json"
      }

    // Probe D cannot tell whether retry: is honoured unless the stream actually sends one.
    "emit a retry hint when asked, so probe D can tell whether it is honoured" in
      Get("/probe/stream?kind=sse&frames=1&interval=0&close=0&retry=500") ~> enabled ~> check {
        responseAs[String] must include("retry:500")
      }

    // Only the server can report the request side, which is where a stripped Last-Event-ID or an
    // injected appliance header would show up.
    "report the request headers it received" in
      Get("/probe/request-headers")
        .withHeaders(RawHeader("X-Probe-Test", "injected")) ~> enabled ~> check {
        status mustBe StatusCodes.OK
        responseAs[String].toLowerCase must include("x-probe-test: injected")
      }

    // Pekko injects this one itself; reported verbatim it reads as a header the appliance added.
    "not report Pekko's own synthetic headers as if the client had sent them" in
      Get("/probe/request-headers")
        .withHeaders(RawHeader("Timeout-Access", "<function1>")) ~> enabled ~> check {
        (responseAs[String].toLowerCase must not).include("timeout-access")
      }

    "not report request headers when the probe is disabled" in
      Get("/probe/request-headers") ~> disabled ~> check {
        handled mustBe false
      }

    "answer a small POST, which is detection's own delivery channel" in
      Post("/probe/echo") ~> enabled ~> check {
        status mustBe StatusCodes.OK
        responseAs[String] must not be empty
      }
  }
end ProbeRoutesSpec
