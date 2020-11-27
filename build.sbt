import NativePackagerHelper._

ThisBuild / scalaVersion := "2.13.3"
ThisBuild / version := "0.1.0-SNAPSHOT"
ThisBuild / organization := "com.lunatech"
ThisBuild / organizationName := "lunatech"

lazy val root = (project in file("."))
  .settings(
    name := "pointingpoker",
    libraryDependencies += "com.typesafe.akka" %% "akka-actor-typed"         % "2.6.12",
    libraryDependencies += "com.typesafe.akka" %% "akka-stream"              % "2.6.12",
    libraryDependencies += "ch.qos.logback"     % "logback-classic"          % "1.2.3",
    libraryDependencies += "com.typesafe.akka" %% "akka-http"                % "10.2.3",
    libraryDependencies += "com.typesafe.play" %% "play-json"                % "2.9.1",
    libraryDependencies += "org.scalatest"     %% "scalatest"                % "3.2.2"  % Test,
    libraryDependencies += "com.typesafe.akka" %% "akka-actor-testkit-typed" % "2.6.12" % Test,
    libraryDependencies += "com.typesafe.akka" %% "akka-stream-testkit"      % "2.6.12" % Test,
    libraryDependencies += "com.typesafe.akka" %% "akka-http-testkit"        % "10.2.3" % Test
  )
  .enablePlugins(JavaAppPackaging)
  .enablePlugins(UniversalPlugin)
  .enablePlugins(DockerPlugin)

scalacOptions ++= Seq(
  "-Ywarn-unused:imports",
  "-Ywarn-unused:privates",
  "-Ywarn-unused:locals",
  "-Ywarn-unused:patvars",
  "-Ywarn-unused:implicits"
)

addCommandAlias(
  "qa",
  "; clean; coverage ; test; coverageReport"
)

mappings in Universal ++= directory("src/main/resources/pages")
dockerEnvVars := Map("PORT" -> "$PORT", "HOST" -> "$HOST", "INDEX_PATH" -> "$INDEX_PATH")
