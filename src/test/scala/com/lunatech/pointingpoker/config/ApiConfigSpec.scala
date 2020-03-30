package com.lunatech.pointingpoker.config

import com.typesafe.config.ConfigFactory
import org.scalatest.{MustMatchers, WordSpec}

import scala.concurrent.duration._

class ApiConfigSpec extends WordSpec with MustMatchers {

  "ApiConfig" should {
    "load config correctly" in {
      val config = ConfigFactory.load()
      val apiConfig = ApiConfig.load(config)

      apiConfig.host mustBe "localhost"
      apiConfig.port mustBe 8080
      apiConfig.timeout mustBe 5.seconds
      apiConfig.indexPath mustBe "src/main/resources/pages/index.html"
    }
  }
}
