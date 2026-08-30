package com.lunatech.pointingpoker.config

import com.typesafe.config.Config

/** Gate for the proxy probe in docs/superpowers/specs/2026-08-28-sse-snapshot-protocol-design.md,
  * "Validating the proxy model". Off everywhere by default; turned on only for as long as a
  * measurement takes.
  */
final case class ProbeConfig(enabled: Boolean, pagePath: String)

object ProbeConfig:
  def load(config: Config): ProbeConfig =
    val enabled  = config.getBoolean("pointing-poker.probe.enabled")
    val pagePath = config.getString("pointing-poker.probe.page-path")

    require(pagePath.nonEmpty, "pointing-poker.probe.page-path must not be empty")

    ProbeConfig(enabled, pagePath)
  end load
end ProbeConfig
