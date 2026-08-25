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
    val gracePeriod = FiniteDuration(
      config.getDuration("pointing-poker.sse.grace-period").toMillis,
      TimeUnit.MILLISECONDS
    )
    val retryMillis = config.getDuration("pointing-poker.sse.retry").toMillis.toInt

    require(retryMillis > 0, s"pointing-poker.sse.retry must be positive, was $retryMillis ms")
    require(
      gracePeriod.toMillis > 0,
      s"pointing-poker.sse.grace-period must be positive, was $gracePeriod"
    )
    // The grace period exists to outlast a reconnect at the retry interval (see
    // docs/superpowers/specs/2026-08-24-sse-backpressure-design.md); a grace period too
    // close to retry silently reintroduces the leave-then-rejoin flicker the design fixes.
    require(
      gracePeriod.toMillis >= 2 * retryMillis,
      s"pointing-poker.sse.grace-period ($gracePeriod) must be at least twice " +
        s"pointing-poker.sse.retry ($retryMillis ms)"
    )

    SseConfig(gracePeriod, retryMillis)
  end load
end SseConfig
