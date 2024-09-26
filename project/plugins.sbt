addSbtPlugin("com.github.sbt" % "sbt-native-packager" % "1.10.4")
addSbtPlugin("org.scoverage"  % "sbt-scoverage"       % "2.2.1")
addSbtPlugin("org.scalameta"  % "sbt-scalafmt"        % "2.5.2")

ThisBuild / libraryDependencySchemes ++= Seq(
  "org.scala-lang.modules" %% "scala-xml" % VersionScheme.Always
)
