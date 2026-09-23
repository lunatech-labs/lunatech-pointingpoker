package com.lunatech.pointingpoker

import java.util.Locale

import org.apache.pekko.http.scaladsl.model.{ContentTypes, HttpEntity, HttpResponse, StatusCodes}
import org.apache.pekko.http.scaladsl.model.headers.`Cache-Control`
import org.apache.pekko.http.scaladsl.model.headers.CacheDirectives.`no-cache`
import org.apache.pekko.http.scaladsl.server.Directives.*
import org.apache.pekko.http.scaladsl.server.Route
import org.apache.pekko.http.scaladsl.server.directives.ContentTypeResolver.Default
import com.lunatech.pointingpoker.config.ApiConfig
import com.lunatech.pointingpoker.slug.{LegacySlug, Slug, Suggestion}
import org.slf4j.{Logger, LoggerFactory}

// The static half stays raw directives: tapir describes what the client calls, not what the
// server hands back off disk.
class PageRoutes(apiConfig: ApiConfig):

  private val log: Logger = LoggerFactory.getLogger(this.getClass)

  // Always revalidate: no-store would re-send the whole page where a 304 costs nothing.
  private def revalidated(route: Route): Route =
    respondWithHeader(`Cache-Control`(`no-cache`))(route)

  private val index: Route = revalidated(getFromFile(apiConfig.indexPath))

  val route: Route =
    concat(
      pathEndOrSingleSlash {
        get {
          log.debug("Index call [{}]", apiConfig.indexPath)
          index
        }
      },
      // Legacy links, removed once six months pass with none logged (docs/roadmap.md).
      path(JavaUUID) { uuid =>
        get {
          val slug = LegacySlug.derive(uuid)
          log.info("Redirecting a legacy room link to {}", slug.raw)
          redirect(s"/${slug.raw}?moved=1", StatusCodes.Found)
        }
      },
      // Matches every single-segment path, so it stays last here and API.route puts pages last.
      path(Segment) { raw =>
        get {
          Slug.parse(raw) match
            case Some(slug) =>
              log.debug("Index call with room id: {}", slug.raw)
              index
            case None =>
              Slug.parse(raw.toLowerCase(Locale.ROOT)) match
                case Some(slug) => redirect(s"/${slug.raw}", StatusCodes.Found)
                case None       => revalidated(complete(notARoom(raw)))
        }
      }
    )

  private def notARoom(raw: String): HttpResponse =
    val suggestion = Suggestion
      .suggest(raw)
      .fold("")(slug => s"""<p>Did you mean <a href="/${slug.raw}">${slug.raw}</a>?</p>""")
    val page =
      s"""<!DOCTYPE html>
         |<html lang="en">
         |<head><meta charset="utf-8"><title>Not a room name</title></head>
         |<body>
         |<p><code>${escape(raw)}</code> is not a room name.</p>
         |$suggestion
         |<p><a href="/">Create a room</a></p>
         |</body>
         |</html>
         |""".stripMargin
    HttpResponse(StatusCodes.NotFound, entity = HttpEntity(ContentTypes.`text/html(UTF-8)`, page))
  end notARoom

  // The name is whatever was typed into the address bar.
  private def escape(text: String): String =
    text.flatMap {
      case '&'  => "&amp;"
      case '<'  => "&lt;"
      case '>'  => "&gt;"
      case '"'  => "&quot;"
      case '\'' => "&#39;"
      case c    => c.toString
    }
end PageRoutes

object PageRoutes:
  def apply(apiConfig: ApiConfig): PageRoutes = new PageRoutes(apiConfig)
