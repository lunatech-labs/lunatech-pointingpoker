package com.lunatech.pointingpoker.config

import com.typesafe.config.ConfigFactory
import org.scalatest.matchers.must
import org.scalatest.wordspec.AnyWordSpec

import scala.concurrent.duration.*

class ApiConfigSpec extends AnyWordSpec with must.Matchers:

  "ApiConfig" should {
    "load config correctly" in {
      val config    = ConfigFactory.load()
      val apiConfig = ApiConfig.load(config)

      apiConfig.host mustBe "localhost"
      apiConfig.port mustBe 8080
      apiConfig.timeout mustBe 5.seconds
      apiConfig.indexPath mustBe "src/main/resources/pages/index.html"
    }
  }
end ApiConfigSpec
