import NativePackagerHelper._

ThisBuild / scalaVersion     := "3.9.0"
ThisBuild / version          := "0.1.0-SNAPSHOT"
ThisBuild / organization     := "com.lunatech"
ThisBuild / organizationName := "lunatech"

lazy val V = new {
  val circe        = "0.14.16"
  val commonsText  = "1.15.0"
  val logback      = "1.6.3"
  val owaspEncoder = "1.3.1"
  val pekko        = "1.7.0"
  val pekkoHttp    = "1.4.0"
  val scalatest    = "3.2.20"
  val tapir        = "1.13.31"
}

lazy val root = project
  .in(file("."))
  .settings(
    name                                                 := "pointingpoker",
    libraryDependencies += "org.apache.pekko"            %% "pekko-actor-typed" % V.pekko,
    libraryDependencies += "org.apache.pekko"            %% "pekko-stream"      % V.pekko,
    libraryDependencies += "ch.qos.logback"               % "logback-classic"   % V.logback,
    libraryDependencies += "org.apache.pekko"            %% "pekko-http"        % V.pekkoHttp,
    libraryDependencies += "io.circe"                    %% "circe-core"        % V.circe,
    libraryDependencies += "io.circe"                    %% "circe-parser"      % V.circe,
    libraryDependencies += "io.circe"                    %% "circe-generic"     % V.circe,
    libraryDependencies += "org.apache.commons"           % "commons-text"      % V.commonsText,
    libraryDependencies += "org.owasp.encoder"            % "encoder"           % V.owaspEncoder,
    libraryDependencies += "com.softwaremill.sttp.tapir" %% "tapir-core"        % V.tapir,
    libraryDependencies += "com.softwaremill.sttp.tapir" %% "tapir-json-circe"  % V.tapir,
    libraryDependencies += "com.softwaremill.sttp.tapir" %% "tapir-pekko-http-server" % V.tapir,
    libraryDependencies += "org.scalatest"    %% "scalatest"                 % V.scalatest % Test,
    libraryDependencies += "org.apache.pekko" %% "pekko-actor-testkit-typed" % V.pekko     % Test,
    libraryDependencies += "org.apache.pekko" %% "pekko-stream-testkit"      % V.pekko     % Test,
    libraryDependencies += "org.apache.pekko" %% "pekko-http-testkit"        % V.pekkoHttp % Test,
    scalacOptions += "-Werror"
  )
  .enablePlugins(JavaAppPackaging)
  .enablePlugins(UniversalPlugin)
  .enablePlugins(DockerPlugin)

addCommandAlias(
  "qa",
  "; clean; coverage ; test; coverageReport"
)

addCommandAlias(
  "styleCheck",
  "; scalafmtCheckAll ; scalafmtSbtCheck"
)

Universal / mappings ++= directory("src/main/resources/pages")
dockerEnvVars   := Map("PORT" -> "$PORT", "HOST" -> "$HOST", "INDEX_PATH" -> "$INDEX_PATH")
dockerBaseImage := "openjdk:17"

fork := true
