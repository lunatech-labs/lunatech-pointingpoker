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
  }
end SseConfigSpec
