# End-to-End Testkit: Stub Buffering Proxy and Browser Harness

Date: 2026-08-30
Status: Proposed
Delivers: PR 0b of
`docs/superpowers/specs/2026-08-28-sse-snapshot-protocol-design.md`

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
hostile network condition, and that condition is only interesting to bounded
mode; if the whitelist request lands and bounded mode is later removed, the
stub has no second use. It is a fixture. The harness outlives it. So the stub
is a pluggable layer a test opts into, never something the harness assumes:
the fixture default is no stub at all, and a bounded-mode case turns it on
with one line. This corrects the protocol spec, which calls the harness "the
reusable part" in a sentence that bundles both.

## Scope

In: the stub, the harness, the Playwright fixtures, `package.json`, the
`node --test` plumbing, a CI step, and three cases (stub unit tests, the
reproduction, one browser smoke case).

Out: the rest of the browser suite, which asserts behaviour that does not
exist until PRs 1 and 4 and stays in PR 5. Out: CI gating for the browser
suite, deferred by the protocol spec and keeping its own `known-issues` entry.

## Approaches considered

**Stub as a reverse proxy in front of the app (chosen).** The browser points
at `localhost:STUB`, which forwards to `localhost:APP`. Everything, page, SSE
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
producing a mysteriously flaky bounded-mode case later. This is why the
harness surfaces captured stderr on a readiness timeout: without it, a config
error looks identical to a slow machine. The test profile does not get its own
copy of the rules.

### 3. The test profile

Every value arrives by environment variable. No new configuration surface.

| Variable | Test | Production |
| --- | --- | --- |
| `SSE_GRACE_PERIOD` | 600ms | 6s |
| `SSE_RETRY` | 200ms | 2000ms |
| `SSE_BOUNDED_GRACE_PERIOD` | 1500ms | 15s |
| `SSE_BOUNDED_RETRY` | 100ms | 500ms |
| `SSE_BOUNDED_RETRY_JITTER` | 20ms | 100ms |
| `SSE_BOUNDED_DURATION` | 2s | 20s |
| `SSE_BOUNDED_DURATION_JITTER` | 1s | 10s |
| `SSE_HEARTBEAT_INTERVAL` | 2s | 15s |
| `SSE_DETECTION_TIMEOUT` | 1s | 5s |
| `SSE_ASSUMED_PROXY_TIMEOUT` | 6s | 45s |

Roughly seven times down rather than the ten the protocol spec assumed, and
the difference is entirely about `SSE_DETECTION_TIMEOUT`. Detection infers "the
path is buffering" from "nothing arrived within a window", so at 500ms a cold
JVM's first snapshot, a GC pause or a loaded CI runner produces a false
positive, and bounded-mode cases would then flake for a reason unrelated to
what they test. That false positive is a known limitation of the design in
production; deliberately provoking it in the test profile would be a poor
trade for the 30% the suite would save. 1s leaves real slack.

Every invariant passes with margin: `600 >= 2x200`, `1500 >= 600`,
`1500 >= 4x100`, `2000+1000 <= 6000x0.75`, `2000+1000 <= 6000x0.75`,
`20 < 100`. `SSE_SESSION_TTL` stays at its production 2h on purpose: at this
timescale that means never, and no browser case should be tripping session
expiry.

**The stub's deadline is `SSE_ASSUMED_PROXY_TIMEOUT`, read from the same
profile**, not a separate number that happens to agree. That variable's entire
job is to declare what a deployment believes about the proxy in front of it,
so having the simulated proxy honour exactly it makes the two impossible to
drift apart.

Three non-timing variables the harness must set, each for a reason that would
otherwise cost an afternoon:

- `SECURE_COOKIES=false`, or the browser never returns the session cookie over
  plain HTTP and every case fails with a 401 that looks like a session bug.
- `INDEX_PATH` as an absolute path, because `application.conf`'s default is
  repo-relative and the staged binary does not run from the repo root.
- `HOST=localhost`.

### 4. Fixtures

```
package.json              # devDep: @playwright/test. scripts: test, e2e
playwright.config.js
testkit/stub.js
testkit/app.js
test/stub.test.js         # node --test
test/reproduction.test.js # node --test
e2e/fixtures.js
e2e/smoke.spec.js
```

Three shallow directories named for what they hold: `testkit/` is machinery,
`test/` is what `node --test` runs, `e2e/` is what Playwright runs. Nothing
imports backwards. `playwright.config.js` sets `testDir: 'e2e'` so the two
runners cannot pick up each other's files, and `.gitignore` gains
`node_modules/` and `test-results/`.

`app` and `stub` are worker-scoped fixtures, one pair per worker, on ports
allocated by binding to 0. This costs a JVM per worker and buys the ability to
run in parallel at all: the buffering toggle is global to a stub instance, so
one shared stub would force `workers: 1` permanently. PR 0b has one browser
case and will not notice, which is exactly why the scope is worth getting
right now rather than discovering later.

`stub` starts in pass-through, and a test-scoped automatic fixture resets
buffering to off after every test, so a case that turns it on cannot poison
the next one. `room` is test-scoped and creates a fresh room through
`POST /create-room` against the app directly, which gives per-test isolation
without restarting anything. A `join(page, room, name)` helper fills the name
and submits, because `created()` only auto-joins when `localStorage` already
holds both `roomId` and `name`.

A bounded-mode case is then one line of opt-in,
`await stub.setBuffering(true)`, and a Phase 3 regression case simply never
asks for the `stub` fixture.

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

**`e2e/smoke.spec.js`**, Playwright, pass-through. Load the page through the
stub, join a room, reach the room view. Proves the harness drives the real
app, and gives PR 5 something known-good to build on.

**What none of this proves.** The stub is built to the protocol spec's
description of the customer's proxy, so a green suite shows the design answers
the modelled failure, not that the model matches the customer. That gap is
PR 0's probe, and the two are complementary in a specific way: the probe's
measurements are this stub's parameters, so a result lands here as a change to
`SSE_ASSUMED_PROXY_TIMEOUT` and the deadline derived from it rather than as a
rewrite.

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
  run: node --test test/
```

`coverageOff` is not optional: `sbt qa` leaves scoverage-instrumented classes
behind, and staging without it packages them.

There is no `npm ci` on the gating path. `node --test` is built in and `test/`
has no dependencies, so Playwright is installed only by whoever runs
`npm run e2e`. The CI addition therefore costs one node setup and a few
seconds, and from the day it lands the customer's failure is a test that runs
on every push, which is the whole reason this work moved to the front.

The browser suite stays ungated, as the protocol spec defers, and that gap
keeps its own `docs/known-issues.md` entry.

## Delivery

One PR, roughly 220 lines of source (stub 90, harness 50, fixtures 50, config
and manifest 30) and 110 of tests, landing as PR 0b of the protocol spec:
ahead of PR 1, gating nothing, depending on nothing this project is about to
change. The stub forwards and buffers HTTP, and today's
unbounded SSE stream is already the input that makes it fail.

`package.json`, the `node --test` plumbing and the CI node step move here from
PR 3, which needs them later for the `connection.js` module tests and will
find them already present.

Two follow-ups this creates, both recorded rather than scheduled: the
`README.md` needs the two commands (`npm test`, and `sbt Universal/stage`
before `npm run e2e`), and `.gitignore` needs `node_modules` and
`test-results/`.
