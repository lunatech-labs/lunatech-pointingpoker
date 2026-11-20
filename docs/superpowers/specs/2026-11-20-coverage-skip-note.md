# Change note: the coverage skip message under -Werror

**Lane:** light. Judged by CI's coverage build (`sbt qa`), red without the change.

**Defect.** CI's test job runs `qa` (`clean; coverage; test; coverageReport`).
Under coverage, Scala 3.9.0's `InstrumentCoverage` skips any value initializer
over `MaxInstrumentableTreeNodes` (3000) tree nodes, as instrumenting it risks
the JVM's 64 KB method limit, and reports the skip as a warning, which `-Werror`
fails. Round history's `given Schema[Choice]` in `Requests.scala`, a tapir
derivation with a discriminator and a validator, expands to 3639 nodes. Local
runs of `sbt test` do not turn coverage on, so only CI showed it.

**Change.** `build.sbt` gains
`scalacOptions += "-Wconf:msg=Skipping coverage instrumentation:i"`: the skip is
reported as information, still printed, no longer a warning. The schema's
generated code records no coverage; nothing in the build enforces a minimum.

**Considered.** Upgrading to Scala 3.10.1, which reports the skip as information
itself (scala/scala3 #27028): no workaround, but a compiler upgrade of its own,
off the 3.9 line, outside round history. Shrinking the schema below 3000 nodes:
the derivation is most of its size. A hand-written schema: more code to keep in
step with the `Encoder` and `Decoder`, only for a coverage tool. A
`$COVERAGE-OFF$` marker around the schema: more local, but it stays in the code
after 3.10.1, where the `-Wconf` line goes. The comment on the new line says to
drop it on reaching 3.10.1.

**Test.** `sbt "; clean; coverage; compile"`: without the line, "No warnings can
be incurred under -Werror"; with it, success and the skip printed as `[info]`.
Then `sbt qa` passes, locally and in CI.

**Review:** one wave, 3 lenses (Sonnet). Each found the missing comma after
`-Werror` in `.settings`, fixed; simplicity's `$COVERAGE-OFF$` marker answered
under Considered; wording accepted.
