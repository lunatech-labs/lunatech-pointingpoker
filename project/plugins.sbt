addSbtPlugin("com.github.sbt" % "sbt-native-packager" % "1.11.0")
addSbtPlugin("org.scoverage"  % "sbt-scoverage"       % "2.2.2")
addSbtPlugin("org.scalameta"  % "sbt-scalafmt"        % "2.5.3")

ThisBuild / libraryDependencySchemes ++= Seq(
  "org.scala-lang.modules" %% "scala-xml" % VersionScheme.Always
)
