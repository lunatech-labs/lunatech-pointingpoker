package com.lunatech.pointingpoker.config

import com.typesafe.config.ConfigFactory
import org.scalatest.matchers.must
import org.scalatest.wordspec.AnyWordSpec

import scala.concurrent.duration.*

class SseConfigSpec extends AnyWordSpec with must.Matchers:

  "SseConfig" should {
    "load config correctly" in {
      val config    = ConfigFactory.load()
      val sseConfig = SseConfig.load(config)

      sseConfig.gracePeriod mustBe 6.seconds
      sseConfig.retryMillis mustBe 2000
    }

    "reject a grace period too close to the retry interval" in {
      val config = ConfigFactory
        .parseString("pointing-poker.sse.grace-period = 2500ms, pointing-poker.sse.retry = 2000ms")
        .withFallback(ConfigFactory.load())

      an[IllegalArgumentException] must be thrownBy SseConfig.load(config)
    }

    "reject a zero or negative retry" in {
      val config = ConfigFactory
        .parseString("pointing-poker.sse.retry = 0ms")
        .withFallback(ConfigFactory.load())

      an[IllegalArgumentException] must be thrownBy SseConfig.load(config)
    }

    "reject a zero or negative grace period" in {
      val config = ConfigFactory
        .parseString("pointing-poker.sse.grace-period = 0ms")
        .withFallback(ConfigFactory.load())

      an[IllegalArgumentException] must be thrownBy SseConfig.load(config)
    }
  }
end SseConfigSpec
