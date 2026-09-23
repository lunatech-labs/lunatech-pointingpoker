# Step 6a: Warnings Become Errors Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn on `-Werror` across `Compile` and `Test`, replacing step 6's narrower `-Wconf:name=PatternMatchExhaustivity:e`, and clear the two warning sources that trip it on step 6's tree.

**Architecture:** Two independently-testable changes, in dependency order. First, `Main` stops extending the deprecated `scala.App` so the entry point itself is warning-free, verified by actually launching the staged binary (the Docker image reuses that same staged script as its `ENTRYPOINT`, so staging it is sufficient). Second, the 28 test call sites passing an implicit positionally get mechanically rewritten with `-rewrite -source 3.7-migration`, and only then does `build.sbt` flip from the targeted `-Wconf` to blanket `-Werror`, so the flip itself has nothing left to catch.

**Tech Stack:** Scala 3.9.0, sbt 1.13.0, sbt-native-packager (`JavaAppPackaging`, `UniversalPlugin`, `DockerPlugin`), ScalaTest 3.2.20, Pekko 1.7.0 / Pekko HTTP 1.4.0.

**Spec:** `docs/superpowers/specs/2026-08-31-protocol-target-architecture-design.md`, "Step 6a. Warnings become errors." (around line 2910).

## Global Constraints

- No `Compile / mainClass` is set in `build.sbt` today; sbt-native-packager auto-selects the entry point via `discoveredMainClasses`, so that set must still contain exactly one class after the change, or staging fails asking for a manual pick.
- CI (`.github/workflows/ci.yml`) runs `sbt qa` (`clean; coverage; test; coverageReport`) in the `test` job and `sbt styleCheck` (`scalafmtCheckAll; scalafmtSbtCheck`) in the `style-check` job. Both must stay green — this step is warnings-and-build-only, it must not touch the 162 existing test assertions.
- The Docker image (`dockerEnvVars`, `dockerBaseImage := "openjdk:17"`) has no custom `Dockerfile` or `dockerCommands`; its generated `ENTRYPOINT` just runs the staged `bin/pointingpoker` script, so proving the staged script launches proves the Docker image will too.
- Per the spec, this is a branch of its own, not folded into a protocol diff — no other source file changes belong on this branch.

## Review Focus

- **Native-packager reports more than one discovered main class.** `@main` generates a synthetic top-level class; if it collides with anything else discoverable, `stage`/`Universal:packageBin` fails asking for `-main`. Task 1 asserts `discoveredMainClasses` is a singleton before trusting the staged script.
- **The staged binary compiles but does not actually serve.** A broken classpath or a missed `Main`-only side effect would still let `stage` succeed. Task 1 starts the real staged script and asserts an HTTP response, not just a nonzero PID.
- **The mechanical `-rewrite` output fails `scalafmtCheckAll` in CI even though it compiles.** The rewriter and scalafmt are different tools; task 2 runs `styleCheck` after the rewrite, not just `Test/compile`.
- **`-Werror` surfaces a warning outside the two named sources**, e.g. in `Compile` scope rather than only `Test`, since step 6's `-Wconf` was scoped to the whole build already but nobody has compiled `Compile` and `Test` together under `-Werror` before. Task 2 runs `clean` before compiling both scopes so nothing is masked by incremental-compile caching.
- **The rewrite changes runtime behavior of a test even though it compiles and "looks" mechanical.** Task 2 runs the full existing suite and requires the same 162/162 pass count as before the change, not just a compile success.

---

## Prerequisites

Branch off `main` directly (step 6 is already merged, so there is no parent branch to base on or rebase onto):

```bash
git checkout main
git pull
git checkout -b 20260831.protocol_architecture_6a_warnings_as_errors
```

## Task 1: Retire `Main extends App`

**Files:**
- Modify: `src/main/scala/com/lunatech/pointingpoker/Main.scala:15` (the `object Main extends App:` declaration) and `:64` (the matching `end Main`)

**Interfaces:**
- Consumes: nothing new.
- Produces: the entry point sbt-native-packager discovers changes name from `com.lunatech.pointingpoker.Main` to `com.lunatech.pointingpoker.run`. No other task depends on the old or new name; `build.sbt` has no `mainClass` override to update.

- [ ] **Step 1: Replace the `App` subclass with a top-level `@main` method**

The whole body was already indented two spaces under `object Main extends App:`, so removing that line and replacing it with a top-level `@main def run(): Unit =` at column 0 keeps every other line unchanged — only the declaration line and the closing `end` marker move.

Edit `src/main/scala/com/lunatech/pointingpoker/Main.scala`:

```diff
-object Main extends App:
+@main def run(): Unit =
```

and, at the end of the file:

```diff
-end Main
+end run
```

- [ ] **Step 2: Compile and confirm the deprecation warning is gone**

Run: `sbt "clean; compile"`

Expected: `[success]`, with no `-- Deprecation Warning` mentioning `trait App`. (Before this change, compiling with `-deprecation` added shows exactly one: `trait App in package scala is deprecated since 3.8.0`.)

- [ ] **Step 3: Confirm exactly one main class is still discovered**

Run: `sbt "show discoveredMainClasses"`

Expected: a single line, `* com.lunatech.pointingpoker.run`. If more than one line appears, sbt-native-packager will refuse to auto-select an entry point at staging time — stop and resolve the collision before continuing.

- [ ] **Step 4: Stage the app and launch the real start script**

Run:

```bash
sbt -batch stage
PORT=18099 ./target/universal/stage/bin/pointingpoker > /tmp/pp-stage-run.log 2>&1 &
sleep 5
curl -s -o /dev/null -w "HTTP %{http_code}\n" http://localhost:18099/
kill %1
```

Expected: `HTTP 200`, and `/tmp/pp-stage-run.log` shows `com.lunatech.pointingpoker.API -- Starting API on host port localhost:18099` with no stack trace. This is also sufficient evidence for the Docker image, whose generated `ENTRYPOINT` (`sbt Docker/stage` → `target/docker/stage/Dockerfile`) runs this identical script — there is no separate main-class wiring for Docker to break.

- [ ] **Step 5: Run the existing suite to confirm nothing else regressed**

Run: `sbt test`

Expected: `Tests: succeeded 162, failed 0, canceled 0, ignored 0, pending 0`.

- [ ] **Step 6: Commit**

```bash
git add src/main/scala/com/lunatech/pointingpoker/Main.scala
git commit -m "fix(main): replace deprecated App entry point with @main def

Clears the sole main-source warning ahead of step 6a's -Werror flip."
```

## Task 2: Rewrite the 28 implicit-positional test sites and flip `-Wconf` to `-Werror`

**Files:**
- Modify: `build.sbt:36` (the `scalacOptions` entry)
- Modify: `src/test/scala/com/lunatech/pointingpoker/actors/RoomSpec.scala` (22 sites) and `src/test/scala/com/lunatech/pointingpoker/actors/RoomManagerSpec.scala` (6 sites), all of the shape `TestProbe()(testKit.system.classicSystem)` → `TestProbe()(using testKit.system.classicSystem)`, including the two fully-qualified `org.apache.pekko.testkit.TestProbe()(...)` sites in `RoomManagerSpec.scala`

**Interfaces:**
- Consumes: nothing from Task 1 except a warning-free `Main.scala`, so `-Werror` has nothing else to trip on.
- Produces: a green `sbt qa` and `sbt styleCheck` under `-Werror`, matching what CI runs on every push.

- [ ] **Step 1: Confirm the exact warning count on the current tree**

Run: `sbt "clean; Test/compile"` with `scalacOptions` temporarily including `"-deprecation"` alongside the existing `-Wconf` line (or just read the count from step 2 below — this step is a sanity check, not required to modify files).

Expected baseline, already confirmed on this tree: 1 deprecation warning (`Main extends App`, cleared by Task 1) and 28 `Implicit parameters should be provided with a using clause` warnings across `RoomSpec.scala` and `RoomManagerSpec.scala`.

- [ ] **Step 2: Run the compiler's own mechanical rewrite**

Temporarily change `build.sbt:36` to drive the rewrite (this is an intermediate state, not the final one):

```diff
-    scalacOptions += "-Wconf:name=PatternMatchExhaustivity:e"
+    scalacOptions ++= Seq("-rewrite", "-source:3.7-migration")
```

Run: `sbt "Test/compile"`

Expected: sbt reports `28 warnings found`, `[info] done compiling`, and two lines reading:

```
[info] [patched file .../src/test/scala/com/lunatech/pointingpoker/actors/RoomSpec.scala]
[info] [patched file .../src/test/scala/com/lunatech/pointingpoker/actors/RoomManagerSpec.scala]
```

`git diff --stat src/test/` should show only those two files changed, each line turning `TestProbe()(testKit.system.classicSystem)` into `TestProbe()(using testKit.system.classicSystem)` (verified sample from this tree):

```diff
-      val secondProbe       = TestProbe()(testKit.system.classicSystem)
+      val secondProbe       = TestProbe()(using testKit.system.classicSystem)
```

and, for the two fully-qualified sites in `RoomManagerSpec.scala`:

```diff
-      val classicProbe = org.apache.pekko.testkit.TestProbe()(testKit.system.classicSystem)
+      val classicProbe = org.apache.pekko.testkit.TestProbe()(using testKit.system.classicSystem)
```

If the diff touches anything beyond adding `using` inside these `TestProbe()(...)` calls, stop and inspect before continuing — the rewrite should be textually inert everywhere else.

- [ ] **Step 3: Replace the rewrite flags with `-Werror`**

`build.sbt:36` now becomes the step's actual, permanent change:

```diff
-    scalacOptions ++= Seq("-rewrite", "-source:3.7-migration")
+    scalacOptions += "-Werror"
```

(The comment on the line above, `// An incomplete match is otherwise a warning; API's status table depends on it being fatal.`, no longer describes this line specifically — `-Werror` still makes `PatternMatchExhaustivity` fatal along with everything else, so delete that comment rather than rewrite it; `-Werror` is self-explanatory.)

```diff
-    // An incomplete match is otherwise a warning; API's status table depends on it being fatal.
     scalacOptions += "-Werror"
```

- [ ] **Step 4: Confirm a clean `-Werror` build from scratch**

Run: `sbt "clean; Test/compile"`

Expected: `[success]`, with no `[warn]` or `[error]` lines at all — this is `Compile` and `Test` together, so it also re-confirms Task 1's fix holds under the final flag combination.

- [ ] **Step 5: Run the full suite to prove the rewrite is behavior-preserving**

Run: `sbt test`

Expected: `Tests: succeeded 162, failed 0, canceled 0, ignored 0, pending 0` — the same count as Task 1 step 5, proving the mechanical rewrite changed nothing observable.

- [ ] **Step 6: Run the two CI jobs locally**

Run: `sbt qa` (mirrors the `test` job: `clean; coverage; test; coverageReport`)

Expected: `All tests passed.` and a coverage summary (`Statement coverage.: 90.98%` / `Branch coverage....: 86.87%` on this tree — a materially lower number would mean the rewrite or the entry-point change silently dropped a code path from instrumentation, worth checking before treating this as a pass).

Run: `sbt styleCheck` (mirrors the `style-check` job: `scalafmtCheckAll; scalafmtSbtCheck`)

Expected: `[success]` with no reformatting diffs reported — confirms the rewriter's output already matches this project's scalafmt config.

- [ ] **Step 7: Commit**

```bash
git add build.sbt src/test/scala/com/lunatech/pointingpoker/actors/RoomSpec.scala src/test/scala/com/lunatech/pointingpoker/actors/RoomManagerSpec.scala
git commit -m "build: promote warnings to errors (-Werror)

Rewrites the 28 implicit-positional TestProbe() call sites to explicit
using clauses first, then replaces step 6's targeted
-Wconf:name=PatternMatchExhaustivity:e with blanket -Werror, per step 6a
of the protocol target architecture design."
```

## Final check

- [ ] **Push and open the PR**

```bash
git push -u origin 20260831.protocol_architecture_6a_warnings_as_errors
```

Title the PR to match step 6a's spec heading, e.g. `build: warnings become errors (step 6a)`, since squash-merges use the PR title as the commit that lands on `main`. Do not merge — report the branch as ready and stop, per this project's stacked-merge convention.
