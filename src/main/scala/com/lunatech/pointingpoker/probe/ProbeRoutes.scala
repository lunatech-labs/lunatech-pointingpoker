package com.lunatech.pointingpoker.probe

import org.apache.pekko.NotUsed
import org.apache.pekko.http.scaladsl.marshalling.sse.EventStreamMarshalling
import org.apache.pekko.http.scaladsl.model.*
import org.apache.pekko.http.scaladsl.model.sse.ServerSentEvent
import org.apache.pekko.http.scaladsl.server.Directives.*
import org.apache.pekko.http.scaladsl.server.Route
import org.apache.pekko.http.scaladsl.server.directives.ContentTypeResolver.Default
import org.apache.pekko.stream.scaladsl.Source
import org.apache.pekko.util.ByteString
import com.lunatech.pointingpoker.config.ProbeConfig
import org.slf4j.{Logger, LoggerFactory}

import scala.concurrent.duration.*

/** Server side of the proxy probe in
  * docs/superpowers/specs/2026-08-28-sse-snapshot-protocol-design.md, "Validating the proxy model".
  * One parameterised stream covers probes A to I; the page drives them serially.
  */
class ProbeRoutes(probeConfig: ProbeConfig) extends EventStreamMarshalling:

  private val log: Logger = LoggerFactory.getLogger(this.getClass)

  private def payload(seq: Int, lastEventId: String, size: Int): String =
    s"seq=$seq;lastEventId=$lastEventId;pad=" + "x".repeat(size)

  private def emitted(
      count: Int,
      interval: FiniteDuration,
      size: Int,
      withId: Boolean,
      lastEventId: String
  ): Source[ServerSentEvent, NotUsed] =
    val frames = Source(0 until count).map { seq =>
      val event = ServerSentEvent(payload(seq, lastEventId, size))
      if withId then event.copy(id = Some(s"probe-$seq")) else event
    }
    if interval > Duration.Zero then frames.throttle(1, interval) else frames

  // `Source.maybe` never completes, which is how B, G and H hold a response open; `takeWithin`
  // is what ends A, C, F and I at their close time.
  private def held[T](source: Source[T, NotUsed], closeAfter: Option[FiniteDuration]) =
    closeAfter match
      case Some(d) if d > Duration.Zero => source.concat(Source.maybe[T]).takeWithin(d)
      case Some(_)                      => source
      case None                         => source.concat(Source.maybe[T])

  val route: Route =
    if !probeConfig.enabled then reject
    else
      concat(
        path("probe") {
          get {
            log.info("Probe page served; the probe env var is on for this deployment")
            getFromFile(probeConfig.pagePath)
          }
        },
        path("probe" / "echo") {
          post {
            entity(as[String]) { _ =>
              complete(HttpEntity(ContentTypes.`text/plain(UTF-8)`, "ok"))
            }
          }
        },
        path("probe" / "stream") {
          get {
            parameters(
              "kind".?,
              "frames".as[Int].?,
              "interval".as[Long].?,
              "size".as[Int].?,
              "close".as[Long].?,
              "id".as[Boolean].?
            ) { (kind, frames, interval, size, close, withId) =>
              optionalHeaderValueByName("Last-Event-ID") { lastEventId =>
                val count      = frames.getOrElse(1).max(0)
                val gap        = interval.getOrElse(0L).millis
                val padding    = size.getOrElse(0).max(0)
                val closeAfter = close.map(_.millis)
                val cursor     = lastEventId.getOrElse("")

                log.info(
                  "Probe stream: kind={} frames={} interval={}ms size={} close={} lastEventId=[{}]",
                  kind.getOrElse("sse"),
                  count,
                  gap.toMillis,
                  padding,
                  closeAfter.map(_.toMillis.toString).getOrElse("never"),
                  cursor
                )

                val events = emitted(count, gap, padding, withId.getOrElse(false), cursor)

                kind match
                  case Some("json") =>
                    val bytes = events.map(e => ByteString(s"""{"data":"${e.data}"}"""))
                    complete(
                      HttpResponse(entity =
                        HttpEntity.Chunked
                          .fromData(ContentTypes.`application/json`, held(bytes, closeAfter))
                      )
                    )
                  case _ => complete(held(events, closeAfter))
              }
            }
          }
        }
      )
end ProbeRoutes

object ProbeRoutes:
  def apply(probeConfig: ProbeConfig): ProbeRoutes = new ProbeRoutes(probeConfig)
