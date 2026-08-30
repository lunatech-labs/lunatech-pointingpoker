package com.lunatech.pointingpoker.config

import java.util.concurrent.TimeUnit

import com.typesafe.config.Config

import scala.concurrent.duration.FiniteDuration

/** Gate for the proxy probe in docs/superpowers/specs/2026-08-28-sse-snapshot-protocol-design.md,
  * "Validating the proxy model". Off everywhere by default; turned on only for as long as a
  * measurement takes.
  */
final case class ProbeConfig(enabled: Boolean, pagePath: String, idleTimeout: FiniteDuration)

object ProbeConfig:
  // The longest probe (D) runs 90s. Anything shorter and the probe measures this server.
  private val LongestProbe = 90

  def load(config: Config): ProbeConfig =
    val enabled     = config.getBoolean("pointing-poker.probe.enabled")
    val pagePath    = config.getString("pointing-poker.probe.page-path")
    val idleTimeout = FiniteDuration(
      config.getDuration("pointing-poker.probe.idle-timeout").toMillis,
      TimeUnit.MILLISECONDS
    )

    require(pagePath.nonEmpty, "pointing-poker.probe.page-path must not be empty")
    require(
      idleTimeout.toSeconds > LongestProbe,
      s"pointing-poker.probe.idle-timeout ($idleTimeout) must exceed the longest probe " +
        s"($LongestProbe s), otherwise the probe measures this server's timeout, not the proxy's"
    )

    ProbeConfig(enabled, pagePath, idleTimeout)
  end load
end ProbeConfig
