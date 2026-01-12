import NativePackagerHelper._

ThisBuild / scalaVersion     := "3.7.4"
ThisBuild / version          := "0.1.0-SNAPSHOT"
ThisBuild / organization     := "com.lunatech"
ThisBuild / organizationName := "lunatech"

lazy val V = new {
  val circe     = "0.14.15"
  val logback   = "1.5.24"
  val pekko     = "1.3.0"
  val pekkoHttp = "1.3.0"
  val scalatest = "3.2.19"
}

lazy val root = project
  .in(file("."))
  .settings(
    name                                      := "pointingpoker",
    libraryDependencies += "org.apache.pekko" %% "pekko-actor-typed"         % V.pekko,
    libraryDependencies += "org.apache.pekko" %% "pekko-stream"              % V.pekko,
    libraryDependencies += "ch.qos.logback"    % "logback-classic"           % V.logback,
    libraryDependencies += "org.apache.pekko" %% "pekko-http"                % V.pekkoHttp,
    libraryDependencies += "io.circe"         %% "circe-core"                % V.circe,
    libraryDependencies += "io.circe"         %% "circe-parser"              % V.circe,
    libraryDependencies += "io.circe"         %% "circe-generic"             % V.circe,
    libraryDependencies += "org.scalatest"    %% "scalatest"                 % V.scalatest % Test,
    libraryDependencies += "org.apache.pekko" %% "pekko-actor-testkit-typed" % V.pekko     % Test,
    libraryDependencies += "org.apache.pekko" %% "pekko-stream-testkit"      % V.pekko     % Test,
    libraryDependencies += "org.apache.pekko" %% "pekko-http-testkit"        % V.pekkoHttp % Test
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
