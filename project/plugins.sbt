addSbtPlugin("com.github.sbt" % "sbt-native-packager" % "1.9.11")
addSbtPlugin("org.scoverage"  % "sbt-scoverage"       % "2.0.6")
addSbtPlugin("org.scalameta"  % "sbt-scalafmt"        % "2.5.0")

ThisBuild / libraryDependencySchemes ++= Seq(
  "org.scala-lang.modules" %% "scala-xml" % VersionScheme.Always
)
