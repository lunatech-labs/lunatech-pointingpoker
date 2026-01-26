addSbtPlugin("com.github.sbt" % "sbt-native-packager" % "1.11.4")
addSbtPlugin("org.scoverage"  % "sbt-scoverage"       % "2.4.4")
addSbtPlugin("org.scalameta"  % "sbt-scalafmt"        % "2.5.6")

ThisBuild / libraryDependencySchemes ++= Seq(
  "org.scala-lang.modules" %% "scala-xml" % VersionScheme.Always
)
