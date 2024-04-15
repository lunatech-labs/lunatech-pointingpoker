addSbtPlugin("com.github.sbt" % "sbt-native-packager" % "1.10.0")
addSbtPlugin("org.scoverage"  % "sbt-scoverage"       % "2.0.11")
addSbtPlugin("org.scalameta"  % "sbt-scalafmt"        % "2.5.2")

ThisBuild / libraryDependencySchemes ++= Seq(
  "org.scala-lang.modules" %% "scala-xml" % VersionScheme.Always
)
