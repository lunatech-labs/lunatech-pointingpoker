package com.lunatech.pointingpoker.config

import java.util.concurrent.TimeUnit

import com.typesafe.config.Config

import scala.concurrent.duration.FiniteDuration

/** Tuning for the SSE backpressure design in
  * docs/superpowers/specs/2026-08-24-sse-backpressure-design.md; both values are heuristics, not
  * measured figures, hence configurable.
  */
final case class SseConfig(gracePeriod: FiniteDuration, retryMillis: Int)

object SseConfig:
  def load(config: Config): SseConfig =
    SseConfig(
      gracePeriod = FiniteDuration(
        config.getDuration("pointing-poker.sse.grace-period").toMillis,
        TimeUnit.MILLISECONDS
      ),
      retryMillis = config.getDuration("pointing-poker.sse.retry").toMillis.toInt
    )
end SseConfig
