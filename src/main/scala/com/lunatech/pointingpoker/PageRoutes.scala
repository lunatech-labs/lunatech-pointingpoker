package com.lunatech.pointingpoker

import org.apache.pekko.http.scaladsl.model.headers.`Cache-Control`
import org.apache.pekko.http.scaladsl.model.headers.CacheDirectives.`no-cache`
import org.apache.pekko.http.scaladsl.server.Directives.*
import org.apache.pekko.http.scaladsl.server.Route
import org.apache.pekko.http.scaladsl.server.directives.ContentTypeResolver.Default
import com.lunatech.pointingpoker.config.ApiConfig
import org.slf4j.{Logger, LoggerFactory}

// The static half stays raw directives: tapir describes what the client calls, not what the
// server hands back off disk.
class PageRoutes(apiConfig: ApiConfig):

  private val log: Logger = LoggerFactory.getLogger(this.getClass)

  val route: Route =
    concat(
      pathEndOrSingleSlash {
        get {
          log.debug("Index call [{}]", apiConfig.indexPath)
          // Always revalidate: no-store would re-send the whole page where a 304 costs nothing.
          respondWithHeader(`Cache-Control`(`no-cache`)) {
            getFromFile(apiConfig.indexPath)
          }
        }
      },
      path(JavaUUID) { roomId =>
        get {
          log.debug("Index call with room id: {}", roomId)
          respondWithHeader(`Cache-Control`(`no-cache`)) {
            getFromFile(apiConfig.indexPath)
          }
        }
      }
    )
end PageRoutes

object PageRoutes:
  def apply(apiConfig: ApiConfig): PageRoutes = new PageRoutes(apiConfig)
