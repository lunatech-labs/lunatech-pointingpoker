# End-to-End Testkit: Stub Buffering Proxy and Browser Harness

Date: 2026-08-30
Status: Proposed, amended rather than superseded by
`docs/superpowers/specs/2026-08-31-protocol-target-architecture-design.md`
Delivers: step 0 of that design. The stub and harness survive unchanged, the
bounded-mode cases go with bounded mode, and characterization cases arrive.
Cases covering behaviour that is currently buggy are marked `test.fail()` with
the step that fixes each, so the suite is green from the start and Playwright
reports a stale annotation when a fix lands.

## Purpose

Two things, with different lifetimes, which is why they are designed as
separate pieces rather than one.

The immediate job is a reproduction. A customer cannot use this app because an
antivirus-scanning proxy in their network path buffers the whole HTTP response
before releasing anything and kills the connection at its own timeout, so an
SSE stream that never completes delivers zero bytes. That failure currently
exists only as a report. The protocol spec's entire section 6 is built on a
description of it that "is stated as fact and is not tested anywhere". A stub
proxy makes it fail locally on demand, which is the thing you normally want
before writing a fix rather than after.

The lasting job is a harness. "Start this app with a known configuration,
drive it in a real browser, assert on the room" is infrastructure this
repository has none of, and it is what the Phase 3 framework migration needs
as its regression net. That has nothing to do with buffering proxies.

**The two are deliberately not the same component.** The stub simulates one
hostile network condition, and the whitelist has since removed the pressure
that made it urgent: bounded mode is cancelled, so what the stub is left with
is the reproduction case and whatever a future customer's report needs. It is
a fixture. The harness outlives it. So the stub is a pluggable layer a test
opts into, never something the harness assumes: the fixture default is no stub
at all, and a case that wants buffering turns it on with one line. This
corrects the 08-28 spec, which calls the harness "the reusable part" in a
sentence that bundles both.

## Scope

In: the stub, the harness, the Playwright fixtures, `package.json`, the
`node --test` plumbing, CI steps gating everything here, the stub unit tests,
the reproduction, the harness's own startup case, and the browser suite step 0
of the target architecture
specifies: a smoke case, five behavioural cases, and four `test.fail()`
characterization cases.

Out: cases for behaviour that does not exist yet, which arrive with the step
that creates it.

## Approaches considered

**Stub as a reverse proxy in front of the app (chosen).** The browser points
at `127.0.0.1:STUB`, which forwards to `127.0.0.1:APP`. Everything, page, SSE
and POSTs, travels through it. No CONNECT, no browser proxy configuration.

**Stub as a forward proxy via Playwright's `proxy` option.** Closer to how a
corporate appliance actually sits, since the browser would request the app's
real origin and the proxy would relay. Rejected because the realism buys
nothing here: cookies are `SameSite=Strict` and path-scoped so they work
either way, `SECURE_COOKIES` is off in the test profile so
`X-Forwarded-Proto` is irrelevant, and detection is identical. The one thing
it would buy, one browser behind the proxy and one not, the reverse proxy gets
just as easily by handing two browser contexts different base URLs.

**Simulating buffering inside a Pekko route.** Cheapest and worthless: it
cannot reproduce "no headers reach the browser", because it is the same server
the test is asserting against.

**Playwright's own runner for everything, or `node --test` driving
`playwright-core`.** Rejected in favour of two runners. `@playwright/test`
gives per-test browser contexts, auto-waiting assertions, retries and traces,
which is most of what makes browser tests survivable, and hand-rolling those
on `node --test` spends the debugging budget it was meant to save. Running the
fast unit layer under Playwright's runner instead would pin the tests that
gate every push to a heavy browser toolchain and cost the zero-dependency
property those tests currently have. Two runners, two commands, one
dependency, and it sits on only half the tree.

**Run the browser cases in Chromium and Firefox, not just Playwright's
default.** The probe was run in Firefox 140 and Chromium 150 against
production and the engines disagreed on the row that matters most here: given a
response whose headers arrive and whose body never does, Chromium surfaces it
immediately while Firefox surfaces nothing until the first body byte. That is
`fetch` rather than `EventSource`, so it does not touch the app, but it is
direct evidence that engines diverge precisely on the streaming edge cases this
design lives in. Assumption 7, that a completed chunked `text/event-stream` is
still treated as a stream and still auto-reconnects, is confirmed in both
engines only against a server that streams progressively; through the stub the
whole response lands at once, which is a different input and the one the stub
actually produces. Two projects in the Playwright config, and the reproduction
plus the reconnect case run in both.

## Design

### 1. The stub

One Node file, no dependencies, usable as a module and as a CLI:

```js
export function createStub({ upstream, deadlineMs, buffering = false })
// -> { port, setBuffering(on), close() }
```

The CLI wrapper exists so a person can put the stub in front of an app they
are already running and click around in their own browser. For a bug whose
whole character is "nothing appears", being able to reproduce it by hand is
worth the four lines it costs.

Per request it forwards method, path, headers and body upstream, then collects
the upstream response's status, headers and body chunks in memory and releases
nothing. On upstream `end` it writes status, headers and body, then ends. A
timer armed at request start destroys the downstream socket having written
nothing if the response has not ended by `deadlineMs`, which is the customer's
report exactly.

Three details decide whether this is faithful rather than merely similar:

**It releases with `Content-Length`, not chunked.** A scanner that has
buffered a whole response knows its length and sends it; Node would otherwise
default to chunked, so `Transfer-Encoding` has to be stripped from the
captured upstream headers. This is not cosmetic. It is what actually exercises
the protocol spec's assumption 7, that a completed, content-length-delimited
`text/event-stream` is still something `EventSource` treats as a stream and
reconnects from.

**It buffers every method uniformly, POSTs included.** Simpler, more faithful
to an appliance that scans content rather than routes, and worth exercising
rather than assuming, because `JoinResponse` is the delivery channel for the
detection windows.

**`/__stub/buffering` is handled locally and never forwarded**, taking `on` or
`off`. Toggling affects subsequent requests only; requests in flight keep the
mode they started with. This exists because a browser cannot change origin
without a reload, so it is the only way to test re-detection, where a path
that was healthy starts buffering mid-session.

Failure paths it has to get right, each of which is a test below: an upstream
error answers 502 rather than hanging; a downstream abort mid-buffer destroys
the upstream request, which is what makes the app observe the disconnect and
schedule `Leave`; and pass-through mode genuinely streams rather than
buffering, or the smoke case proves nothing.

### 2. The harness

`testkit/app.js` exports `startApp({ port, env })` returning
`{ baseUrl, stop }`. It spawns the staged launcher
(`target/universal/stage/bin/pointingpoker`), polls `GET /` until 200 with a
30 second cap, and on teardown sends SIGTERM followed by SIGKILL after a two
second grace. It captures stdout and stderr and dumps them when startup or a
test fails. If the staged launcher is missing it fails immediately saying to
run `sbt Universal/stage`, rather than spending the readiness cap on a file
that is not there.

Running the staged binary rather than `sbt run` is deliberate: it starts in
about two seconds instead of paying sbt's startup per run, it is a single
process so teardown is a clean signal rather than reaping a forked child, and
it is the same artifact Docker ships. The cost is one `sbt Universal/stage`
before the suite, which the documented command and the CI step both perform.

**The app's own invariants validate the test profile.** `SseConfig.load`
throws on a violated `require`, so a profile that breaks a relationship
between two timings fails at startup with that `require`'s message rather than
producing a mysteriously flaky case later. This is why the harness surfaces
captured stderr on a readiness timeout: without it, a config error looks
identical to a slow machine. The test profile does not get its own
copy of the rules.

### 3. The test profile

Every value arrives by environment variable. No new configuration surface.

| Variable | Test | Production |
| --- | --- | --- |
| `SSE_GRACE_PERIOD` | 4s | 6s |
| `SSE_RETRY` | 200ms | 2000ms |

**Two variables, not the ten an earlier draft of this section tabled.** The
other eight were bounded mode's five, a heartbeat interval, a detection timeout
and an assumed proxy timeout, with a session TTL assumed in the prose beside
them. All nine belonged to 08-28's proposed configuration surface, none of them
was ever built, and the target architecture cancels every one. The heartbeat is
worth singling out, since it stays real while its variable does not: it is a
hardcoded `val heartbeatInterval = 15.seconds` (`SSE.scala:34`), so no case may
depend on turning it down. The profile grows again at step 4, which makes the
actor idle timeout configurable and will want it turned right down to test
stop-after-idle.

One invariant is left, and it is the one the app actually enforces: `4000 >=
2x200`, against `SseConfig.load`'s `require` that the grace period be at least
twice the retry. That `require` throwing is what validates the profile, which
is section 2's point rather than a second mechanism.

**The stub's deadline is a constant in the testkit.** An earlier draft read it
from `SSE_ASSUMED_PROXY_TIMEOUT` so that the simulated proxy and a deployment's
stated belief about the real one could not drift apart. That variable is one of
the eight above, so there is nothing left to drift from and the stub declares
its own deadline.

Three non-timing variables the harness must set, each for a reason that would
otherwise cost an afternoon:

- `SECURE_COOKIES=false`, or the browser never returns the session cookie over
  plain HTTP and every case fails with a 401 that looks like a session bug.
- `INDEX_PATH` as an absolute path, because `application.conf`'s default is
  repo-relative and the staged binary does not run from the repo root.
- `HOST=127.0.0.1`, the literal address and not `localhost`, so the JVM's bind
  and node's readiness probe cannot resolve to different families. Node prefers
  `::1` for `localhost` and the JVM takes `127.0.0.1`, which works on undici's
  fallback and hides a family mismatch behind a failed connect per request.

### 4. Fixtures

```
package.json              # devDep: @playwright/test. scripts: test, e2e
playwright.config.js
testkit/stub.js
testkit/app.js
test/stub.test.js         # node --test
test/reproduction.test.js # node --test
test/startup.test.js      # node --test
e2e/fixtures.js
e2e/smoke.spec.js
e2e/room.spec.js
```

Three shallow directories named for what they hold: `testkit/` is machinery,
`test/` is what `node --test` runs, `e2e/` is what Playwright runs. Nothing
imports backwards. `playwright.config.js` sets `testDir: 'e2e'` so the two
runners cannot pick up each other's files, and `.gitignore` gains
`node_modules/`, `test-results/` and `playwright-report/`.

`app` and `stub` are worker-scoped fixtures, one pair per worker, on ports
allocated by binding to 0. This costs a JVM per worker and buys the ability to
run in parallel at all: the buffering toggle is global to a stub instance, so
one shared stub would force `workers: 1` permanently. Step 0's eight browser
cases barely need the parallelism, which is exactly why the scope is worth
getting right now rather than discovering later.

`stub` starts in pass-through, and a test-scoped automatic fixture resets
buffering to off after every test, so a case that turns it on cannot poison
the next one. `room` is test-scoped and creates a fresh room through
`POST /create-room` against the app directly, which gives per-test isolation
without restarting anything. A `join(page, room, name)` helper fills the name
and submits, because `created()` only auto-joins when `localStorage` already
holds both `roomId` and `name`.

A case that wants buffering is then one line of opt-in,
`await stub.setBuffering(true)`, and a behavioural case simply never asks for
the `stub` fixture.

## Testing

**`test/stub.test.js`**, against a trivial local upstream. No app, no browser,
runs in about a second. A silently broken stub invalidates every case built on
it, and the protocol spec already warns that a stub built to a wrong model
tests the wrong thing thoroughly.

- An endless response yields zero bytes downstream for the full deadline, then
  a destroyed socket.
- A finite response is released whole, with `Content-Length` and no
  `Transfer-Encoding`.
- Pass-through mode delivers bytes as they are written rather than at the end.
  Asserted on timing, since a buffering stub would also eventually deliver
  them.
- An upstream error answers 502 rather than hanging.
- A downstream abort mid-buffer destroys the upstream request.
- Pass-through does not leave the client hanging when upstream dies mid-body.
  `pipe` does not forward source errors, so this needs its own handler on the
  upstream response rather than falling out of the two cases above.
- The buffering toggle is handled locally and never forwarded upstream.
- The toggle applies to later requests rather than to one already in flight.

**`test/reproduction.test.js`**, the stub in front of the real app. Still no
browser. `POST /join` through the stub for the session cookie, then
`GET /events` with it, asserting zero bytes for the full deadline and then a
destroyed socket. This is the customer's report as an executable case.

The session step is load-bearing rather than incidental. Without a cookie
`/events` answers 401, which is a small finite response the stub releases
promptly, so a reproduction that skipped the join would pass while proving
nothing at all. Obtaining the cookie through the stub also exercises the claim
that buffered POSTs still work, which matters because `JoinResponse` is the
delivery channel for the detection windows.

A control stream is load-bearing for the same reason. Before the buffered
request the case opens a second `/events` in pass-through, asserts 200 and a
first byte well inside the deadline, and holds it open to the end. Without it
the assertions cannot tell "the proxy buffered it" from "the app sent nothing",
which is most of what makes them evidence rather than a restatement of what the
stub was built to do. Holding it open also keeps the member from leaving, since
a departed member's token stops resolving and the buffered request would get
that same finite 401.

**`test/startup.test.js`**, the harness against a port already taken. Asserts
that `startApp` rejects with an exit rather than with a readiness timeout, and
that it does so well inside the 30s cap. It exists because the failure it pins
was live: `Main` discarded `API.run()`'s future, so a bind failure left a
server-less JVM running, `failure()` saw no exit, and the conflict surfaced
after 31s as "the app did not answer", blaming a slow machine. Added by review
rather than by the original design, and verified to fail against the behaviour
it replaced.

**`e2e/smoke.spec.js`**, Playwright, pass-through. Load the page through the
stub, join a room, reach the room view. Proves the harness drives the real app,
and gives the behavioural cases something known-good to build on.

**`e2e/room.spec.js`**, the behavioural cases step 0 pins: two browsers
exchanging votes, reveal with a straggler, reconnect survival, the participant
list on join and leave, and the issue-input guard. Four more sit beside them
marked `test.fail()` and annotated with the step that fixes each: the duplicate
participants on reconnect, a Show surviving someone joining, and an
auto-revealed room staying revealed when a straggler arrives, all three at step
1, plus the non-voter tally at step 3. So the suite is green the day it lands
and CI reports the annotation as stale the moment a fix arrives.

The three step 1 cases pin the *intended* behaviour rather than today's, which
for the two reveal cases means asserting the opposite of what `allVoted()`
currently does on a join.

**What none of this proves.** The stub is built to the 08-28 spec's description
of the customer's proxy, so a green suite shows the design answers the modelled
failure, not that the model matches the customer. That gap is the probe's, and
the two are complementary in a specific way: the probe's measurements are this
stub's parameters, so a result lands here as a change to the deadline constant
rather than as a rewrite.

## CI

Steps appended to the existing `test` job rather than a second sbt job, since
that job already has a JVM and a warm build:

```yaml
- name: stage the app for the node tests
  run: sbt "; coverageOff; Universal/stage"
- uses: actions/setup-node@v5
  with:
    node-version: '24'
- name: node tests
  run: node --test "test/**/*.test.js"
- name: install the browser suite
  run: npm ci && npx playwright install --with-deps chromium firefox
- name: browser tests
  run: npm run e2e
```

`coverageOff` is insurance rather than a requirement in these two invocations.
Enabling coverage is a session setting, so a fresh `sbt` recompiles without
instrumentation regardless, the changed `scalacOptions` invalidating Zinc's
analysis. It earns its place only if the two are ever collapsed into one shell,
where the instrumented classes are packaged and no scoverage runtime is staged
beside them to satisfy the calls.

The glob is not interchangeable with the directory: on Node 24 `node --test
test/` exits 1 with a spurious failing case, so keep the quoted pattern, which
Node expands itself.

`node --test` is built in and `test/` has no dependencies, so the stub and
reproduction cases cost one node setup and a few seconds. From the day they
land the customer's failure is a test that runs on every push, which is the
whole reason this work moved to the front.

**The browser suite is gated too**, which reverses what this design originally
said. It deferred CI integration on the protocol spec's schedule of the day,
where the suite's worth peaked before the Phase 3 framework migration; the
target architecture makes it the regression net for its steps 1 to 3, which
come first. Gating costs `npm ci` and a browser install, both cacheable, on a
job that already has a warm build. Both engines are installed rather than
Chromium alone, because the two projects in "Approaches considered" are not
optional here: the reconnect case is one of step 0's five, and Chromium and
Firefox are already known to disagree on exactly the streaming edge this design
lives in. The `docs/known-issues.md` entry this section used to promise for the
ungated gap is not needed.

## Delivery

One PR, roughly 220 lines of source (stub 90, harness 50, fixtures 50, config
and manifest 30) and 200 of tests, landing as step 0 of the target
architecture: ahead of step 1, blocking nothing, depending on nothing this
project is about to change. The stub forwards and buffers HTTP, and today's
unbounded SSE stream is already the input that makes it fail.

`package.json`, the `node --test` plumbing and the CI node steps arrive here
rather than at step 8, which needs them later for the connection module's
tests and will find them already present.

Two follow-ups this created, both since landed: `README.md` gained the
commands, in the fuller form `sbt "; coverageOff; Universal/stage"` with the
reasoning beside them, and `.gitignore` gained `node_modules/`,
`test-results/` and `playwright-report/`.
