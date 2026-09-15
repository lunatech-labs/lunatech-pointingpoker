package com.lunatech.pointingpoker.config

import java.util.concurrent.TimeUnit

import com.typesafe.config.Config

import scala.concurrent.duration.FiniteDuration

/** Tuning for the room and connection lifetimes; all three are heuristics, not measured figures.
  * See docs/superpowers/specs/2026-08-31-protocol-target-architecture-design.md.
  */
final case class LifecycleConfig(
    gracePeriod: FiniteDuration,
    stopAfterIdle: FiniteDuration,
    retryMillis: Int
)

object LifecycleConfig:
  def load(config: Config): LifecycleConfig =
    val gracePeriod   = duration(config, "pointing-poker.room.grace-period")
    val stopAfterIdle = duration(config, "pointing-poker.room.stop-after-idle")
    val retryMillis   = config.getDuration("pointing-poker.sse.retry").toMillis.toInt

    require(retryMillis > 0, s"pointing-poker.sse.retry must be positive, was $retryMillis ms")
    require(
      gracePeriod.toMillis > 0,
      s"pointing-poker.room.grace-period must be positive, was $gracePeriod"
    )
    // A grace period too close to retry silently reintroduces the leave-then-rejoin flicker
    // docs/superpowers/specs/2026-08-24-sse-backpressure-design.md fixed.
    require(
      gracePeriod.toMillis >= 2 * retryMillis,
      s"pointing-poker.room.grace-period ($gracePeriod) must be at least twice " +
        s"pointing-poker.sse.retry ($retryMillis ms)"
    )
    // Configured below the grace period, a room stops while its last member is still inside
    // their window, so their reconnect finds no room and gets blank state.
    require(
      stopAfterIdle > gracePeriod,
      s"pointing-poker.room.stop-after-idle ($stopAfterIdle) must exceed " +
        s"pointing-poker.room.grace-period ($gracePeriod)"
    )

    LifecycleConfig(gracePeriod, stopAfterIdle, retryMillis)
  end load

  private def duration(config: Config, path: String): FiniteDuration =
    FiniteDuration(config.getDuration(path).toMillis, TimeUnit.MILLISECONDS)
end LifecycleConfig
