addSbtPlugin("com.github.sbt" % "sbt-native-packager" % "1.9.11")
addSbtPlugin("org.scoverage"  % "sbt-scoverage"       % "2.0.2")
addSbtPlugin("org.scalameta"  % "sbt-scalafmt"        % "2.4.6")

ThisBuild / libraryDependencySchemes ++= Seq(
  "org.scala-lang.modules" %% "scala-xml" % VersionScheme.Always
)
