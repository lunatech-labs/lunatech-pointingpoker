import NativePackagerHelper._

ThisBuild / scalaVersion     := "2.13.8"
ThisBuild / version          := "0.1.0-SNAPSHOT"
ThisBuild / organization     := "com.lunatech"
ThisBuild / organizationName := "lunatech"

lazy val V = new {
  val akka     = "2.6.19"
  val akkaHttp = "10.2.10"
}

lazy val root = (project in file("."))
  .settings(
    name                                       := "pointingpoker",
    libraryDependencies += "com.typesafe.akka" %% "akka-actor-typed"         % V.akka,
    libraryDependencies += "com.typesafe.akka" %% "akka-stream"              % V.akka,
    libraryDependencies += "ch.qos.logback"     % "logback-classic"          % "1.4.0",
    libraryDependencies += "com.typesafe.akka" %% "akka-http"                % V.akkaHttp,
    libraryDependencies += "com.typesafe.play" %% "play-json"                % "2.9.3",
    libraryDependencies += "org.scalatest"     %% "scalatest"                % "3.2.13"   % Test,
    libraryDependencies += "com.typesafe.akka" %% "akka-actor-testkit-typed" % V.akka     % Test,
    libraryDependencies += "com.typesafe.akka" %% "akka-stream-testkit"      % V.akka     % Test,
    libraryDependencies += "com.typesafe.akka" %% "akka-http-testkit"        % V.akkaHttp % Test
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

addCommandAlias(
  "styleCheck",
  "; scalafmtCheckAll ; scalafmtSbtCheck"
)

Universal / mappings ++= directory("src/main/resources/pages")
dockerEnvVars := Map("PORT" -> "$PORT", "HOST" -> "$HOST", "INDEX_PATH" -> "$INDEX_PATH")
