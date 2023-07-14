package com.lunatech.pointingpoker.config

import java.util.concurrent.TimeUnit

import com.typesafe.config.Config

import scala.concurrent.duration.FiniteDuration

final case class ApiConfig(host: String, port: Int, timeout: FiniteDuration, indexPath: String)

object ApiConfig:
  def load(config: Config): ApiConfig =
    ApiConfig(
      host = config.getString("pointing-poker.service.host"),
      port = config.getInt("pointing-poker.service.port"),
      timeout = FiniteDuration(
        config.getDuration("pointing-poker.service.timeout").toMillis,
        TimeUnit.MILLISECONDS
      ),
      indexPath = config.getString("pointing-poker.service.index-path")
    )
end ApiConfig
