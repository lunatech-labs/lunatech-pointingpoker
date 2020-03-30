import NativePackagerHelper._

ThisBuild / scalaVersion     := "2.13.1"
ThisBuild / version          := "0.1.0-SNAPSHOT"
ThisBuild / organization     := "com.lunatech"
ThisBuild / organizationName := "lunatech"

lazy val root = (project in file("."))
  .settings(
    name := "pointingpoker",
    libraryDependencies += "com.typesafe.akka" %% "akka-actor-typed" % "2.6.4",
    libraryDependencies += "com.typesafe.akka" %% "akka-stream" % "2.6.4",
    libraryDependencies += "ch.qos.logback" % "logback-classic" % "1.2.3",
    libraryDependencies += "com.typesafe.akka" %% "akka-http"   % "10.1.11",
    libraryDependencies += "com.typesafe.play" %% "play-json" % "2.8.0",
    libraryDependencies += "org.scalatest" %% "scalatest" % "3.0.8" % Test,
    libraryDependencies += "com.typesafe.akka" %% "akka-stream-testkit" % "2.6.4" % Test,
    libraryDependencies += "com.typesafe.akka" %% "akka-http-testkit" % "10.1.11" % Test
  )
  .enablePlugins(JavaAppPackaging)
  .enablePlugins(UniversalPlugin)
  .enablePlugins(DockerPlugin)

mappings in Universal ++= directory("src/main/resources/pages")
dockerEnvVars:= Map("PORT" -> "$PORT", "HOST" -> "$HOST", "INDEX_PATH" -> "$INDEX_PATH")