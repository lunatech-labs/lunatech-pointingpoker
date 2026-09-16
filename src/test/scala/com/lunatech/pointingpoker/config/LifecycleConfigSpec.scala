package com.lunatech.pointingpoker.config

import com.typesafe.config.ConfigFactory
import org.scalatest.matchers.must
import org.scalatest.wordspec.AnyWordSpec

import scala.concurrent.duration.*

class LifecycleConfigSpec extends AnyWordSpec with must.Matchers:

  private def withOverrides(overrides: String) =
    ConfigFactory.parseString(overrides).withFallback(ConfigFactory.load())

  "LifecycleConfig" should {
    "load config correctly" in {
      val config = LifecycleConfig.load(ConfigFactory.load())

      config.gracePeriod mustBe 6.seconds
      config.stopAfterIdle mustBe 2.hours
      config.retryMillis mustBe 2000
    }

    "reject a grace period too close to the retry interval" in {
      val config =
        withOverrides(
          "pointing-poker.room.grace-period = 2500ms, pointing-poker.sse.retry = 2000ms"
        )

      an[IllegalArgumentException] must be thrownBy LifecycleConfig.load(config)
    }

    "reject a zero or negative retry" in {
      an[IllegalArgumentException] must be thrownBy LifecycleConfig.load(
        withOverrides("pointing-poker.sse.retry = 0ms")
      )
    }

    "reject a zero or negative grace period" in {
      an[IllegalArgumentException] must be thrownBy LifecycleConfig.load(
        withOverrides("pointing-poker.room.grace-period = 0ms")
      )
    }

    "reject an idle timeout inside the grace period" in {
      // The chain is retry < grace << idle: a room stopping while its last member is still
      // inside their grace window hands their reconnect the blank state this step exists to stop.
      an[IllegalArgumentException] must be thrownBy LifecycleConfig.load(
        withOverrides("pointing-poker.room.stop-after-idle = 5s")
      )
    }
  }
end LifecycleConfigSpec
