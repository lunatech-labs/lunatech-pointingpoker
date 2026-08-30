package com.lunatech.pointingpoker.config

import com.typesafe.config.ConfigFactory
import org.scalatest.matchers.must
import org.scalatest.wordspec.AnyWordSpec

class ProbeConfigSpec extends AnyWordSpec with must.Matchers:

  "ProbeConfig" should {
    // The probe ships in the ordinary binary, so "off unless asked for" is the safety property.
    "default to disabled" in {
      val probeConfig = ProbeConfig.load(ConfigFactory.load())

      probeConfig.enabled mustBe false
    }

    "be enabled when the flag is set" in {
      val config = ConfigFactory
        .parseString("pointing-poker.probe.enabled = true")
        .withFallback(ConfigFactory.load())

      ProbeConfig.load(config).enabled mustBe true
    }

    "reject an empty page path" in {
      val config = ConfigFactory
        .parseString("""pointing-poker.probe.page-path = "" """)
        .withFallback(ConfigFactory.load())

      an[IllegalArgumentException] must be thrownBy ProbeConfig.load(config)
    }
  }
end ProbeConfigSpec
