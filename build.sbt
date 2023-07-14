import NativePackagerHelper._

ThisBuild / scalaVersion     := "3.3.0"
ThisBuild / version          := "0.1.0-SNAPSHOT"
ThisBuild / organization     := "com.lunatech"
ThisBuild / organizationName := "lunatech"

lazy val V = new {
  val circe     = "0.14.5"
  val pekko     = "1.0.0"
  val pekkoHttp = "0.0.0+4468-963bd592-SNAPSHOT"
}

lazy val root = (project in file("."))
  .settings(
    name                                      := "pointingpoker",
    libraryDependencies += "org.apache.pekko" %% "pekko-actor-typed"         % V.pekko,
    libraryDependencies += "org.apache.pekko" %% "pekko-stream"              % V.pekko,
    libraryDependencies += "ch.qos.logback"    % "logback-classic"           % "1.4.8",
    libraryDependencies += "org.apache.pekko" %% "pekko-http"                % V.pekkoHttp,
    libraryDependencies += "io.circe"         %% "circe-core"                % V.circe,
    libraryDependencies += "io.circe"         %% "circe-generic"             % V.circe,
    libraryDependencies += "org.scalatest"    %% "scalatest"                 % "3.2.16"    % Test,
    libraryDependencies += "org.apache.pekko" %% "pekko-actor-testkit-typed" % V.pekko     % Test,
    libraryDependencies += "org.apache.pekko" %% "pekko-stream-testkit"      % V.pekko     % Test,
    libraryDependencies += "org.apache.pekko" %% "pekko-http-testkit"        % V.pekkoHttp % Test
  )
  .enablePlugins(JavaAppPackaging)
  .enablePlugins(UniversalPlugin)
  .enablePlugins(DockerPlugin)

resolvers += "Apache Snapshots".at(" https://repository.apache.org/content/repositories/snapshots")

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
