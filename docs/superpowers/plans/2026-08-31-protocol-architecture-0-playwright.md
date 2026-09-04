# Step 0, Part 2: Playwright Fixtures and the Browser Cases Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Pin today's room behaviour in a browser, in both engines, gated in CI, so the largest behavioural change in the project (step 1) has a regression net that was written before it.

**Architecture:** `@playwright/test` drives the real staged app through the stub proxy Part 1 built. Worker-scoped `app` and `stub` fixtures boot one JVM and one proxy per worker; a test-scoped `room` fixture creates a fresh room per case, and a `join(name)` factory opens one browser context per participant so each has its own cookie jar and `localStorage`. Cases that pin behaviour the app gets wrong today are marked `test.fail()` and annotated with the step that fixes them, so the suite is green from the day it lands and CI reports the annotation as stale the moment a fix arrives.

**Tech Stack:** Node 24, `@playwright/test` 1.62.1 (the only dependency this repository has), Chromium and Firefox. The app is the staged native-packager launcher, started by `testkit/app.js`.

**Spec:** `docs/superpowers/specs/2026-08-30-e2e-testkit-design.md`, delivering the second half of step 0 of `docs/superpowers/specs/2026-08-31-protocol-target-architecture-design.md`. Both specs are `Proposed` and still open to correction; where this plan departs from them it says so under "Deviations", and where the branch taught them something the spec itself is corrected.

**Builds on:** `docs/superpowers/plans/2026-08-31-protocol-architecture-0-harness.md`, merged as Part 1. `testkit/stub.js`, `testkit/app.js`, `test/stub.test.js`, `test/reproduction.test.js`, `package.json` and the two node CI steps already exist. This branch stacks on `20260831.protocol_architecture_0_harness`.

## Global Constraints

- **One dependency only:** `@playwright/test` as a devDependency, with `package-lock.json` committed so CI can run `npm ci`. Nothing else is added, and `test/` must stay runnable with a bare `node --test "test/**/*.test.js"` and no `node_modules` present.
- **Node 24**, matching the CI `actions/setup-node@v5` pin. **ES modules throughout** (`package.json` declares `"type": "module"`, and that includes `playwright.config.js`).
- **Nothing under `src/` changes, with two declared exceptions.** This is a characterization suite: it pins the app as it is, and a case that cannot be written without touching the app is a finding to report rather than a licence to edit the app. Deviations 10 and 11 are the two places that rule was knowingly broken, each with its reasoning; nothing else under `src/` may change.
- **Three shallow directories, nothing imports backwards:** `testkit/` is machinery, `test/` is what `node --test` runs, `e2e/` is what Playwright runs. `e2e/` imports from `testkit/`; `testkit/` imports nothing local. `playwright.config.js` sets `testDir: 'e2e'` so the two runners cannot pick up each other's files.
- **Both engines run every case.** Chromium and Firefox are already known to disagree on exactly the streaming edge this suite lives in, which is why the spec installs both rather than Chromium alone.
- **Prefer accessible selectors** (`getByRole`, `getByPlaceholder`), because step 8 rewrites the frontend and will revisit them. Where the page offers nothing accessible, use the narrowest structural selector and keep it in `e2e/fixtures.js` so step 8 has one file to revisit.
- **The test profile is environment variables only.** No new configuration surface in the Scala app. `SseConfig.load`'s `require` that the grace period be at least twice the retry (`src/main/scala/com/lunatech/pointingpoker/config/SseConfig.scala:31-35`) is what validates the profile; do not restate the rule in the testkit.
- **The heartbeat is not configurable.** `val heartbeatInterval = 15.seconds` is hardcoded (`src/main/scala/com/lunatech/pointingpoker/sse/SSE.scala:34`). No case may depend on turning it down.
- **Every `test.fail()` case carries the step that fixes it** as the annotation argument, and asserts the *intended* behaviour, never today's.
- **Comments are one or two lines.** No multi-line comment blocks; extra context goes in the commit message.
- **Conventional Commits** for every commit message.

## What the specs ask for, and what this plan ships

The two specs count the cases differently. 08-30 §Testing lists "five behavioural cases" plus "four more marked `test.fail()`" and then calls them "eight browser cases" a section earlier; 08-31 splits reconnect survival into two list assertions and names five `test.fail()` cases. Rather than pick a number, here is every case with the sentence that asks for it.

| Case | File | Verdict | Asked for by |
| --- | --- | --- | --- |
| Create a room and reach the room view | `smoke.spec.js` | green | 08-30: "Load the page through the stub, join a room, reach the room view" |
| Two browsers exchange votes | `room.spec.js` | green | 08-31: "two browsers exchanging votes" |
| A straggler keeps the votes hidden until Show | `room.spec.js` | green | 08-31: "reveal with a straggler" |
| The participant list follows a join and a leave | `room.spec.js` | green | 08-31: "participant list on join and leave" |
| The issue box is readonly until the pencil | `room.spec.js` | green | 08-31: "the issue-input guard" |
| A cut stream reconnects and the room survives | `room.spec.js` | green | deviation 4 below, the control for the two cases under it |
| No duplicate participants after a reconnect | `room.spec.js` | `test.fail()`, step 1 | 08-31: "the duplicate participants" |
| A departed participant is pruned on reconnect | `room.spec.js` | `test.fail()`, step 1 | 08-31: "a participant who departed during the gap going unpruned" |
| A Show survives someone joining | `room.spec.js` | `test.fail()`, step 1 | 08-31: "a Show surviving someone joining" |
| An auto-revealed round stays revealed | `room.spec.js` | `test.fail()`, step 1 | 08-31: "an auto-revealed room staying revealed when a straggler arrives" |
| The tally counts only the votes cast | `room.spec.js` | `test.fail()`, step 3 | 08-31: "the non-voter tally" |

Deliberately not here, each with the step that owns it: the vote-survival assertion on reconnect and the two further issue-input cases (step 1, beside Problem A's fix, for the reason 08-31 §6 gives), the straggler-departure confidentiality case (step 2), the two shared-cookie tab cases (step 6), an assertion on the anti-buffering headers, which 08-31 puts in `APISpec` at step 1 and explicitly refuses to accept from this stub, and turning buffering on: `test/reproduction.test.js` already covers that path without a browser, and no step owns a browser-level version of it.

## Deviations from the spec, and why

Each of these is a decision the specs left open or got slightly wrong. They are listed so a reviewer can reject one without re-deriving it.

1. **`SSE_GRACE_PERIOD` widens from 600ms to 4s** in `testkit/app.js`'s `testProfile`, which 08-30 §3's table now records. The departure cases have two margins that are detection plus the grace period: the window to cut a participant after a departure is noticed and before it is announced, and the window for that cut participant to reconnect before his own removal fires. At 600ms each is about 1.7s, at 4s about 5.1s. **The value was raised twice for the wrong reason before the real one was found**, and the history is worth keeping because the wrong theory is the tempting one. The control case failed intermittently at 2s and again at 8s, on a quiet machine and in both engines, and no grace period could have fixed it: the helper cut the participant without waiting for the second broadcast to reach him, so when the cut won that race the broadcast landed on an already-dead socket and started his removal on the same clock as the departure he had to miss, leaving his reconnect no margin at any value. Awaiting the POST would not have helped either, since `API.scala` answers 204 from a fire-and-forget actor send. The fix is that both nudges are now observed arriving at his live page before he is cut, measured at 9 of 10 before and 10 of 10 after, and 10 of 10 again with the grace period back down at 4s. `4s >= 2 x 200ms` still satisfies the app's `require`, which is the only invariant the profile has.
2. **The stub gains `cut(match)` and `restore(match)`**, which 08-30 §1 does not describe. Two cases need an established SSE stream to break and then reconnect, and nothing else in the toolbox does it: a reload clears the client state that makes the bug visible, the buffering toggle by design only affects later requests, and `browserContext.setOffline` is network emulation whose behaviour over loopback is not guaranteed and differs by engine, while these cases must run in both. `docs/roadmap.md`'s connection-liveness watchdog item corroborates this from a different lever: devtools-simulated offline did not surface `EventSource.onerror` at all, which is the signal every cut case asserts on. A proxy that kills one client's connection is also squarely what the stub already models. It is scoped to a cookie value so one participant can be cut while another stays connected and observing.
3. **`test/stub.test.js`'s `get` helper also returns its `result` object**, so a test can wait for a stream to open before cutting it. One added property on an existing local helper.
4. **A sixth green case exists that no spec sentence asks for**, "a cut stream reconnects and the room survives it". `test.fail()` accepts *any* failure as expected, including a timeout, so the two reconnect cases would stay green if `cut` silently stopped working and no assertion in them could tell. This is the same argument 08-30 makes for the reproduction's control stream, applied to the same mechanism.
5. **`e2e/fixtures.js` also exports the shared locators.** 08-30 §4's file list has no page-object file, and a fourth file for six one-line locator helpers is not worth it. Keeping them in one place is also what makes step 8's selector revision a single-file change.
6. **Browser contexts use a literal-address origin rather than a hostname.** The stub listens on `127.0.0.1` only, and a browser that resolves `localhost` to `::1` first would be relying on its own fallback to reach it. An earlier draft of this item had the fixture build `http://127.0.0.1:${stub.port}` itself; `stub.baseUrl` now advertises the address it actually bound, so the fixture's `origin` is that value directly. Same origin either way for cookie purposes, since `SECURE_COOKIES=false` and the cookie is `SameSite=Strict` on the page's own origin.
7. **`join(name)` returns a participant object rather than taking a page.** 08-30 §4 sketches `join(page, room, name)`, which would hand every case Playwright's default `page` and therefore one shared cookie jar: two participants in one context resolve to one session, which is a step 6 case rather than any of these. One context per participant is the only shape that works, so the helper owns the context.
8. **A browser-binary cache step in CI, added late.** This item first declined one: 08-30 §CI calls the browser install cacheable but its own YAML omits a cache step, and `--with-deps` needs its apt work on every run regardless. The second half of that held and the first did not. The apt work does run every time, so `--with-deps` splits into a `playwright install-deps` step of its own and only the download is cached, which is what §CI meant by calling the install cacheable. What prompted the revisit was a CI run where `npm ci` sat for 300s, npm's default `fetch-timeout`, against a stalled registry, while the same run pulled both browsers in 26s: the uncached download was the next thing worth removing once the stall was explained, and `npm ci` gains `--prefer-offline --no-audit` to drop the call that hung. Measured on this branch's runs: the browser install goes from 26-50s to 1s on a cache hit, `npm ci` from 10s to 1s, and the `test` job from 3m34s, or 8m1s in the run that hit the stall, to 2m41s. The cache is keyed on the lockfile hash, so a Playwright bump retires it; it does not track which browsers were asked for, and an added engine self-heals by downloading the one that is missing.
9. **`.gitignore` gains `test-results/` and `playwright-report/`.** 08-30 §4 asks for `test-results/` only; the second is what the HTML reporter writes if anyone runs it locally with `--reporter=html`.
10. **`Main.scala` gains an explicit exit on an asynchronous startup failure**, against this plan's own "nothing under `src/`" constraint. The constraint says such a case is a finding to report, and this one was reported first: `Main` discarded `API.run()`'s future, so a failed bind left a server-less JVM alive on the actor system's threads, `startApp`'s `failure()` saw no exit, and the conflict surfaced 31 seconds later as "the app did not answer", which reads as a slow machine rather than as a taken port. The harness cannot tell those two apart from outside the process, so the fix had to be in the app. `api.run().failed.foreach` fires only on a failed bind, leaving a successful startup byte-for-byte unchanged, and exiting non-zero is what the `DockerPlugin` deployment in `build.sbt` needs to see. The same change fixes `log.error("Error creating room manager {}", exception)`, where slf4j resolved the `error(String, Throwable)` overload and never substituted the `{}`. `test/startup.test.js` pins the behaviour and was verified to fail against what it replaced; 08-30 §Testing describes the case. **`CoordinatedShutdown` was considered and rejected here.** Pekko's `run-by-jvm-shutdown-hook = on` means `System.exit(1)` already runs coordinated shutdown from the hook thread, bounded by `default-phase-timeout = 5s`, while `exit-jvm` is documented as `System.exit(0)` with `exit-code = 0`. Routing the exit through `CoordinatedShutdown` therefore gives up the non-zero status a supervisor reads, and getting it back needs either a global `exit-code = 1` (which would make an ordinary SIGTERM exit 1 too) or a custom `Reason` with a `reason-overrides` block, which is the configuration surface plan:23 and 08-30 §3 both rule out.
11. **`index.html` pins `axios` to `axios@1.20.0`**, the second and last `src/` change. No case needs it. The page's other three tags were already pinned (`bootstrap@4.4.1`, `feather-icons@4.28.0`, `vue@2.6.14`) and this one floated, so a suite whose whole purpose is a stable baseline could load a different axios on any run. `docs/known-issues.md` records it. It trades automatic patch updates for reproducibility, and nothing in this repository bumps CDN pins, so step 8 inherits the refresh question along with the page.

## How a departure is actually noticed, measured

Task 3 discovered that the plan's first draft was wrong about departures, and the correction
shapes three cases. Measured against the staged app, on this machine, with the testkit:

| What happens to a member's connection | When the room announces the leave |
| --- | --- |
| the client half-closes (FIN, still reading) | never, within 70s |
| the client aborts (RST) with no traffic after it | 31.7s |
| the same, through the stub (its upstream teardown is a half-close) | 31.8s |
| through the stub, then one broadcast to the room | 16.7s |
| through the stub, then two broadcasts | 1.7s |

Measured at `SSE_GRACE_PERIOD=600ms`; the shipped test profile is 4s, so every figure above is about 3.4s larger against it.

Rows 1 and 3 are both a half-close, but row 1's peer is still reading and row 3's is not, which is the whole difference between never and 31.8s.

The rule behind the table: the app learns a stream is dead only when a write to it fails, and
after a half-close the first write merely elicits the peer's reset, so the second is the one
that fails. `SSE.scala:34`'s hardcoded 15 second heartbeat is otherwise the only write there
is, which is where 31.7s comes from (two heartbeats), and why `docs/known-issues.md`
attributing the delay to the grace period alone is understating it by 30 seconds. Detection
then costs about 1.1s, and the grace period runs after that.

Three consequences, applied in the tasks below:

1. **A case that waits for a departure sends two broadcasts first.** `Clear votes` is the
   nudge, being the only broadcast that changes nothing. Without it the case waits 31s, which
   is past Playwright's default per-case timeout.
2. **A cut participant must be cut after those nudges, never before.** A nudge that lands on
   an already-cut stream starts that participant's own removal on the same clock as the
   departure it is supposed to miss.
3. **`cut` and `restore` are sequenced on the page's own connection banner**, not on a timer.
   `index.html:472-485` sets `errorMessage` on an `EventSource` error and `:389-395` clears it
   on reopen, so `getByRole('alert')` appearing and disappearing is a retryable state
   assertion for "this participant is disconnected" and "this participant is back".

The heartbeat stays untouched. 08-30 §3 singles it out as hardcoded and forbids any case from
depending on turning it down, which is exactly what these three consequences work around.

## File structure

```
package.json               # + devDependency @playwright/test, + "e2e" script
package-lock.json          # new, committed, so CI can npm ci
playwright.config.js       # new: testDir e2e, chromium + firefox projects
testkit/stub.js            # + cut/restore
testkit/app.js             # testProfile grace period 600ms -> 4s
test/stub.test.js          # + 3 cases for cut/restore
e2e/fixtures.js            # new: app, stub, room, join fixtures + shared locators
e2e/smoke.spec.js          # new: 1 case
e2e/room.spec.js           # new: 11 cases
.github/workflows/ci.yml   # + npm cache, + browser cache, + 3 browser steps
.gitignore                 # + test-results/, playwright-report/
README.md                  # + the e2e commands
```

---

### Task 1: `cut` and `restore` on the stub

The one piece of machinery the browser cases need that Part 1 did not build. TDD in `node --test`, no browser, so a mechanism the reconnect cases depend on is proven before anything harder rests on it.

**Files:**
- Modify: `testkit/stub.js`
- Test: `test/stub.test.js`

**Interfaces:**
- Consumes: `createStub({ upstream, deadlineMs, buffering })` from `testkit/stub.js`, returning `{ port, baseUrl, deadlineMs, setBuffering, close }`.
- Produces: two more methods on that object.
  - `cut(match: string): void` destroys every live proxied response whose request `cookie` header contains `match`, and refuses new such requests without opening upstream, until restored.
  - `restore(match?: string): void` lifts one cut, or every cut when called with no argument.

- [ ] **Step 1: Give the `get` helper its result object**

In `test/stub.test.js`, the helper currently returns `{ req, done }`. Return the mutable `result` too, so a case can wait for a stream to open:

```js
  return { req, done, result }
```

- [ ] **Step 2: Write the failing tests**

Append to `test/stub.test.js`:

```js
// Waits until a stream has actually opened, so a cut is aimed at a live connection rather
// than at a request that has not reached the stub yet.
async function opened(pending, ms = 2000) {
  const deadline = Date.now() + ms
  while (Date.now() < deadline) {
    if (pending.result.firstByteAt !== null) return
    await new Promise(resolve => setTimeout(resolve, 10))
  }
  throw new Error('the stream never produced a first byte')
}

test('a cut destroys the live streams carrying that cookie, and only those', async t => {
  let sawAbort
  const aborted = new Promise(resolve => {
    sawAbort = resolve
  })
  const up = await upstream((req, res) => {
    res.writeHead(200, { 'content-type': 'text/event-stream' })
    res.write('data: hello\n\n')
    // This is what makes the app observe the disconnect and schedule Leave.
    if (req.headers.cookie === 'session=bob') res.on('close', () => sawAbort(true))
  })
  t.after(() => up.close())
  const stub = await createStub({ upstream: up.url })
  t.after(() => stub.close())

  const bob = get(`${stub.baseUrl}/rooms/r/events`, { headers: { cookie: 'session=bob' } })
  const alice = get(`${stub.baseUrl}/rooms/r/events`, { headers: { cookie: 'session=alice' } })
  t.after(() => alice.req.destroy())
  await opened(bob)
  await opened(alice)

  stub.cut('bob')

  const result = await within(bob.done, 3000)
  assert.ok(result, 'the cut request was still open 3s later')
  assert.ok(result.error, 'the socket is destroyed rather than left hanging')
  const timeout = new Promise(resolve => setTimeout(() => resolve(false), 2000))
  assert.equal(await Promise.race([aborted, timeout]), true, 'the app must see the disconnect')
  assert.equal(await within(alice.done, 300), null, 'another session must stay connected')
})

test('a request carrying a cut cookie is refused without reaching upstream', async t => {
  let reached = 0
  const up = await upstream((req, res) => {
    reached += 1
    res.writeHead(200, { 'content-type': 'text/plain' })
    res.end('ok')
  })
  t.after(() => up.close())
  const stub = await createStub({ upstream: up.url })
  t.after(() => stub.close())

  stub.cut('bob')
  const refused = await within(
    get(`${stub.baseUrl}/rooms/r/events`, { headers: { cookie: 'session=bob' } }).done,
    3000
  )

  assert.ok(refused, 'the refused request was still open 3s later')
  assert.equal(refused.response, null, 'not even headers may reach the client')
  assert.ok(refused.error)
  // A retry that reached the app would rejoin the room and reset its own grace period.
  assert.equal(reached, 0)

  const allowed = await get(`${stub.baseUrl}/x`, { headers: { cookie: 'session=alice' } }).done
  assert.equal(allowed.response.statusCode, 200)
  assert.equal(reached, 1)
})

test('restore lets a cut cookie through again', async t => {
  const up = await upstream((req, res) => {
    res.writeHead(200, { 'content-type': 'text/plain' })
    res.end('ok')
  })
  t.after(() => up.close())
  const stub = await createStub({ upstream: up.url })
  t.after(() => stub.close())

  stub.cut('bob')
  stub.restore('bob')
  const single = await get(`${stub.baseUrl}/x`, { headers: { cookie: 'session=bob' } }).done
  assert.equal(single.response.statusCode, 200)

  stub.cut('bob')
  stub.cut('alice')
  stub.restore()
  for (const who of ['bob', 'alice']) {
    const result = await get(`${stub.baseUrl}/x`, { headers: { cookie: `session=${who}` } }).done
    assert.equal(result.response.statusCode, 200, `${who} was still cut`)
  }
})
```

- [ ] **Step 3: Run them to verify they fail**

Run: `npm test`

Expected: the three new cases fail with `TypeError: stub.cut is not a function`. The eight existing cases and the reproduction still pass.

- [ ] **Step 4: Implement `cut` and `restore`**

In `testkit/stub.js`, extend the state and the request handler:

```js
  const state = { buffering, cuts: new Set(), live: new Set() }

  const server = http.createServer((req, res) => {
    if (req.url.startsWith('/__stub/buffering')) return toggle(req, res, state)
    const cookie = req.headers.cookie ?? ''
    // Refused without opening upstream: a retry that reached the app would rejoin the room.
    if (isCut(state, cookie)) return void res.destroy()
    const entry = { cookie, res }
    state.live.add(entry)
    res.on('close', () => state.live.delete(entry))
    // Read once per request: a toggle affects later requests, never one already in flight.
    if (state.buffering) forwardBuffered(req, res, target, deadlineMs)
    else forwardStreaming(req, res, target)
  })
```

Add the two methods to the returned object, after `setBuffering`:

```js
    // Stands in for an appliance that has killed one client's connections: destroys the live
    // ones carrying this cookie value and refuses new ones until restore().
    cut(match) {
      state.cuts.add(match)
      for (const entry of state.live) if (entry.cookie.includes(match)) entry.res.destroy()
    },
    restore(match) {
      if (match === undefined) state.cuts.clear()
      else state.cuts.delete(match)
    },
```

And the predicate, beside `relayHeaders`:

```js
function isCut(state, cookie) {
  for (const match of state.cuts) if (cookie.includes(match)) return true
  return false
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npm test`

Expected: 12/12 passing, output pristine. Destroying `res` is enough to tear down upstream, because both forwarders already destroy the upstream request on `res.on('close')`.

- [ ] **Step 6: Commit**

```bash
git add testkit/stub.js test/stub.test.js
git commit -m "feat(testkit): let the stub cut and restore one session's connections"
```

---

### Task 2: The toolchain, the fixtures, and the smoke case

Everything needed for one browser case to drive the real app through the stub in both engines. A reviewer can accept this and still reject every behavioural case that follows.

**Files:**
- Modify: `package.json`, `.gitignore`
- Create: `package-lock.json` (generated), `playwright.config.js`, `e2e/fixtures.js`, `e2e/smoke.spec.js`

**Interfaces:**
- Consumes: `startApp()` from `testkit/app.js` returning `{ baseUrl, port, output, stop }`; `createStub({ upstream })` from `testkit/stub.js` returning `{ port, baseUrl, deadlineMs, setBuffering, cut, restore, close }`.
- Produces, from `e2e/fixtures.js`:
  - `test`, the extended Playwright `test` object, and `expect`, re-exported.
  - Fixtures `app` (worker), `stub` (worker), `origin` (test, a string), `room` (test, a room id string), `join` (test, `(name: string) => Promise<Participant>`).
  - `Participant` is `{ name, page, close(), cut(), restore() }`, where `cut()` and `restore()` are scoped to that participant's session cookie.
  - Locators: `nameInput(page)`, `issueBox(page)`, `issueButton(page)`, `summaryTable(page)`, `participantRows(page)`, `participantRow(page, name)`, `votedMark(row)`, and the action `vote(page, value)`.

- [ ] **Step 1: Confirm the toolchain is reachable, and stop if it is not**

Run: `npm ping`

If the registry is unreachable, stop and report BLOCKED: this task cannot be done offline. The Netskope whitelist covered `registry.npmjs.org` and `cdn.playwright.dev` when this plan was written.

- [ ] **Step 2: Install Playwright and the two engines**

```bash
npm install --save-dev @playwright/test
npx playwright install chromium firefox
```

`--with-deps` is deliberately omitted here: it needs `sudo` for apt and the browsers launch on this machine without it. CI keeps `--with-deps`, where apt is available and the image is bare. Record the resolved `@playwright/test` version in your report.

- [ ] **Step 3: Add the `e2e` script**

`package.json` becomes:

```json
{
  "name": "pointingpoker",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "node --test \"test/**/*.test.js\"",
    "e2e": "playwright test"
  },
  "devDependencies": {
    "@playwright/test": "^1.62.1"
  }
}
```

- [ ] **Step 4: Ignore Playwright's output directories**

Append to `.gitignore`:

```
test-results/
playwright-report/
```

- [ ] **Step 5: Write the config**

Create `playwright.config.js`:

```js
import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  // node --test owns test/, so the two runners cannot pick up each other's files.
  testDir: 'e2e',
  reporter: 'list',
  // The page pulls Vue, axios and feather from public CDNs, so a run can fail on the network.
  retries: process.env.CI ? 1 : 0,
  // Each worker boots its own JVM and stub; two is the ceiling worth paying for on CI.
  workers: process.env.CI ? 2 : undefined,
  use: { trace: 'retain-on-failure' },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } }
  ]
})
```

- [ ] **Step 6: Write the fixtures**

Create `e2e/fixtures.js`:

```js
import { test as base, expect } from '@playwright/test'
import { startApp } from '../testkit/app.js'
import { createStub } from '../testkit/stub.js'

export const test = base.extend({
  app: [
    async ({}, use) => {
      const app = await startApp()
      await use(app)
      await app.stop()
    },
    { scope: 'worker' }
  ],

  // Worker-scoped: buffering and the cut list are global to a stub instance, so a shared
  // one would force workers: 1 permanently.
  stub: [
    async ({ app }, use) => {
      const stub = await createStub({ upstream: app.baseUrl })
      await use(stub)
      await stub.close()
    },
    { scope: 'worker' }
  ],

  // The stub listens on 127.0.0.1 only, so do not make a browser fall back from ::1.
  origin: async ({ stub }, use) => {
    await use(`http://127.0.0.1:${stub.port}`)
  },

  // A case that turns buffering on or cuts a session cannot poison the next one.
  cleanStub: [
    async ({ stub }, use) => {
      await use()
      stub.setBuffering(false)
      stub.restore()
    },
    { auto: true }
  ],

  // Per-test isolation without restarting anything.
  room: async ({ app }, use) => {
    const response = await fetch(`${app.baseUrl}/create-room`, { method: 'POST' })
    if (!response.ok) throw new Error(`POST /create-room answered ${response.status}`)
    await use((await response.text()).trim())
  },

  // One browser context per participant: two pages in one context share the room cookie and
  // resolve to a single session, which is a step 6 case rather than any of these.
  join: async ({ browser, origin, room, stub }, use) => {
    const open = []
    const join = async name => {
      const context = await browser.newContext({ baseURL: origin })
      const page = await context.newPage()
      await page.goto(`/${room}`)
      await nameInput(page).fill(name)
      await page.getByRole('button', { name: 'Join' }).click()
      // inRoom flips on the first SSE message, so the room view proves the stream arrived.
      await expect(page.getByRole('button', { name: 'Show votes' })).toBeVisible()
      const token = async () => {
        const cookie = (await context.cookies()).find(c => c.name === 'session')
        if (!cookie) throw new Error(`${name} has no session cookie`)
        return cookie.value
      }
      const participant = {
        name,
        page,
        close: () => context.close(),
        cut: async () => stub.cut(await token()),
        restore: async () => stub.restore(await token())
      }
      open.push(participant)
      return participant
    }
    await use(join)
    for (const participant of open) await participant.close().catch(() => {})
  },

  // The captured output is the whole worker's, which is still the only place a config or
  // startup failure is visible.
  appLog: [
    async ({ app }, use, testInfo) => {
      await use()
      if (testInfo.status !== testInfo.expectedStatus) {
        await testInfo.attach('app.log', { body: app.output(), contentType: 'text/plain' })
      }
    },
    { auto: true }
  ]
})

// Step 8 revisits selectors, so these are as accessible as the page allows. The name inputs
// and the issue buttons have no label association and no accessible name at all.
export const nameInput = page =>
  page.locator('.form-group.row').filter({ hasText: 'User name' }).locator('input')
export const issueBox = page => page.getByPlaceholder('Current issue')
export const issueButton = page => page.locator('.input-group-append button')
export const summaryTable = page =>
  page.locator('table').filter({ has: page.getByRole('columnheader', { name: 'Number of votes' }) })
export const participantRows = page =>
  page
    .locator('table')
    .filter({ has: page.getByRole('columnheader', { name: 'Voted' }) })
    .locator('tbody tr')
export const participantRow = (page, name) => participantRows(page).filter({ hasText: name })
// An empty <i> has no size, so count it rather than asking whether it is visible.
export const votedMark = row => row.locator('td').first().locator('svg, i')
export const vote = (page, value) =>
  page.getByRole('button', { name: value, exact: true }).click()

export { expect }
```

- [ ] **Step 7: Write the smoke case**

Create `e2e/smoke.spec.js`:

```js
import { test, expect, nameInput, participantRow } from './fixtures.js'

test('create a room through the stub and reach the room view', async ({ page, origin }) => {
  await page.goto(`${origin}/`)
  await nameInput(page).fill('Alice')
  await page.getByRole('button', { name: 'Create' }).click()

  // inRoom flips on the first SSE message, so this proves the whole path: a POST through the
  // stub, then a stream through it.
  await expect(page.getByRole('button', { name: 'Show votes' })).toBeVisible()
  await expect(participantRow(page, 'Alice')).toHaveCount(1)
})
```

The default `page` fixture is used deliberately here rather than `join`: its context has no `baseURL`, which is why the `goto` is absolute, and the Create tab is the path a first visitor takes.

- [ ] **Step 8: Stage the app and run the suite**

```bash
sbt "; coverageOff; Universal/stage"
npm run e2e
```

Expected: 2 passed (one case in each project). If the room view never appears, read the attached `app.log` before anything else: a config error and a slow machine look identical without it.

- [ ] **Step 9: Commit**

```bash
git add package.json package-lock.json playwright.config.js .gitignore e2e/
git commit -m "test(e2e): drive the app through the stub in chromium and firefox"
```

---

### Task 3: The behavioural cases that pass today

Five cases, all green, pinning behaviour the app already gets right. They are the regression net step 1 is meant to be caught by, so they must be honest about today's behaviour, including the client-side auto-reveal.

**Files:**
- Create: `e2e/room.spec.js`
- Modify: `e2e/fixtures.js`

**Interfaces:**
- Consumes everything `e2e/fixtures.js` exports (Task 2).
- Produces one more export on `e2e/fixtures.js`, `connectionAlert(page)`, which Task 4 also uses. Nothing else. A second export, `connectionLost(page)`, landed later; see "What landed after the plan was written".

Facts these cases rest on, all in `src/main/resources/pages/index.html`:
- `allVoted()` (`:553-554`) sets `votesRevealed` whenever every entry in `users` is voted, so a round reveals itself with no one pressing Show. That is intended and survives step 1 as a stored latch, so it is pinned here rather than marked failing.
- Pre-reveal, another participant's estimation is not rendered at all: `{{ u.estimation }}` sits under `v-if="votesRevealed"` (`:308`), and `showUserEstimation` (`:556-558`) renders a shield icon instead.
- `Leave` and `Copy link` are `<a>` elements (`:177-181`), so they are links, not buttons.
- The issue box is `readonly` until the pencil sets `editing` (`:200-207`).

- [ ] **Step 1: Add the connection banner locator, then write the two voting cases**

In `e2e/fixtures.js`, beside the other locators:

```js
// The page's own "connection lost" banner, which is how a cut and a reconnect are sequenced.
export const connectionAlert = page => page.getByRole('alert')
```

Create `e2e/room.spec.js`:

```js
import {
  test,
  expect,
  connectionAlert,
  participantRow,
  participantRows,
  summaryTable,
  issueBox,
  issueButton,
  votedMark,
  vote
} from './fixtures.js'

test('two browsers exchange votes', async ({ join }) => {
  const alice = await join('Alice')
  const bob = await join('Bob')
  await expect(participantRow(alice.page, 'Bob')).toHaveCount(1)

  await vote(alice.page, '5')
  const aliceOnBob = participantRow(bob.page, 'Alice')
  await expect(votedMark(aliceOnBob)).toHaveCount(1)
  // The vote is marked but the value is withheld until the round is revealed.
  await expect(aliceOnBob).not.toContainText('5')

  await vote(bob.page, '3')
  // Everyone having voted reveals the round with nobody pressing Show.
  for (const participant of [alice, bob]) {
    await expect(summaryTable(participant.page)).toBeVisible()
    await expect(participantRow(participant.page, 'Alice')).toContainText('5')
    await expect(participantRow(participant.page, 'Bob')).toContainText('3')
  }
})

test('a straggler keeps the votes hidden until Show is pressed', async ({ join }) => {
  const alice = await join('Alice')
  const bob = await join('Bob')

  await vote(alice.page, '5')
  await expect(votedMark(participantRow(bob.page, 'Alice'))).toHaveCount(1)
  await expect(summaryTable(bob.page)).toBeHidden()

  await alice.page.getByRole('button', { name: 'Show votes' }).click()
  await expect(summaryTable(bob.page)).toBeVisible()
  await expect(participantRow(bob.page, 'Alice')).toContainText('5')
})
```

- [ ] **Step 2: Run them**

Run: `npm run e2e`

Expected: 6 passed (three cases in each project).

- [ ] **Step 3: Write the participant list and issue box cases**

Append to `e2e/room.spec.js`:

```js
test('the participant list follows a join and a leave', async ({ join }) => {
  const alice = await join('Alice')
  await expect(participantRows(alice.page)).toHaveCount(1)

  const bob = await join('Bob')
  await expect(participantRows(alice.page)).toHaveCount(2)
  await expect(participantRows(bob.page)).toHaveCount(2)

  await bob.page.getByRole('link', { name: 'Leave' }).click()
  // The app notices a dead stream only when a write to it fails, and the first write after a
  // close only draws the reset, so two broadcasts stand in for the heartbeat 15s away.
  const clear = alice.page.getByRole('button', { name: 'Clear votes' })
  await clear.click()
  await clear.click()

  await expect(participantRow(alice.page, 'Bob')).toHaveCount(0, { timeout: 20_000 })
  await expect(participantRows(alice.page)).toHaveCount(1)
})

test('the issue box is readonly until the pencil is pressed', async ({ join }) => {
  const alice = await join('Alice')

  await expect(issueBox(alice.page)).toHaveJSProperty('readOnly', true)
  await issueButton(alice.page).click()
  await expect(issueBox(alice.page)).toHaveJSProperty('readOnly', false)
})
```

The 20 second timeout is deliberately far above detection plus the grace period, which is about 5.1s, because the assertion is about the departure being announced at all, not about when. The two clicks are load-bearing rather than incidental: without them this case waits 31s and fails on Playwright's default per-case timeout. "How a departure is actually noticed" above has the measurements.

- [ ] **Step 4: Run them**

Run: `npm run e2e`

Expected: 10 passed.

- [ ] **Step 5: Write the reconnect control case**

Append to `e2e/room.spec.js`:

```js
test('a cut stream reconnects and the room survives it', async ({ join }) => {
  const alice = await join('Alice')
  const bob = await join('Bob')

  await bob.cut()
  await expect(connectionAlert(bob.page)).toBeVisible()
  await bob.restore()
  // The banner clears on reopen, so its absence is the reconnect, retryable rather than timed.
  await expect(connectionAlert(bob.page)).toBeHidden({ timeout: 10_000 })

  // A vote landing on Bob's page is the proof his stream came back usable. The two reconnect
  // cases below cannot assert this themselves: test.fail() accepts a timeout as expected.
  await vote(alice.page, '5')
  await expect(votedMark(participantRow(bob.page, 'Alice').first())).toHaveCount(1, {
    timeout: 10_000
  })
})
```

`.first()` on the row is load-bearing: today's reconnect leaves Bob's page with two entries for Alice, and a locator matching two rows would fail Playwright's strict mode rather than the assertion.

- [ ] **Step 6: Run them**

Run: `npm run e2e`

Expected: 12 passed. If the reconnect never lands, the `cut` is the suspect and Task 1's node cases are the place to reproduce it without a browser.

- [ ] **Step 7: Commit**

```bash
git add e2e/room.spec.js
git commit -m "test(e2e): pin the room behaviour that works today"
```

---

### Task 4: The cases that arrive marked failing

Five cases asserting the *intended* behaviour of things the app gets wrong today, each annotated with the step that fixes it. Playwright fails the run when a `test.fail()` case passes, so the suite is green now, a regression during steps 1 to 3 still shows, and a landed fix reports its own stale annotation.

**Files:**
- Modify: `e2e/room.spec.js`, `testkit/app.js`

**Interfaces:**
- Consumes `e2e/fixtures.js` and the cases in Task 3.
- Produces: nothing.

Why each fails today, all in `src/main/resources/pages/index.html`:
- The reconnect replay pushes a second entry for everyone. `setupNewUser` (`Room.scala:262-274`) resends `init` and a `join` per member, and the client pushes on both (`:403-419`) without clearing `users`; the rest of the room pushes again on the broadcast `join`.
- A departure missed while disconnected is never undone, because nothing in the replay removes anyone.
- `allVoted()` runs on every `join`, `vote` and `leave` (`:421`, `:435`, `:466`), so an arriving straggler un-reveals a revealed round, whether Show was pressed or the reveal was automatic.
- `updateSummary` (`:546-552`) counts every entry in `users`, keyed by estimation, so a participant who has not voted becomes a row of its own under the empty key.

- [ ] **Step 1: Widen the grace period**

In `testkit/app.js`, change `testProfile`:

```js
export const testProfile = {
  SSE_GRACE_PERIOD: '4s',
  SSE_RETRY: '200ms'
}
```

The comment above it stays as it is. The arithmetic that forces this value is in step 5 below; `4s >= 2 x 200ms` keeps `SseConfig.load`'s `require` satisfied, and `npm test` starting the app at all is the proof.

- [ ] **Step 2: Run the node suite to confirm the profile is still valid**

Run: `npm test`

Expected: 12/12 passing. A rejected profile fails at app startup with the `require`'s message, surfaced through the harness's captured output.

- [ ] **Step 3: Write the two reveal cases**

Append to `e2e/room.spec.js`:

```js
test('a Show survives someone joining', async ({ join }) => {
  test.fail(true, 'step 1: revealed becomes a stored latch instead of a client-side allVoted()')
  const alice = await join('Alice')
  await join('Bob')

  await vote(alice.page, '5')
  await alice.page.getByRole('button', { name: 'Show votes' }).click()
  await expect(summaryTable(alice.page)).toBeVisible()

  await join('Carol')
  // Carol's row proves the join was processed, and the un-reveal happens in the same handler.
  await expect(participantRow(alice.page, 'Carol')).toHaveCount(1)
  await expect(summaryTable(alice.page)).toBeVisible({ timeout: 2000 })
})

test('an auto-revealed round stays revealed when a straggler arrives', async ({ join }) => {
  test.fail(true, 'step 1: revealed becomes a stored latch instead of a client-side allVoted()')
  const alice = await join('Alice')
  const bob = await join('Bob')

  await vote(alice.page, '5')
  await vote(bob.page, '3')
  await expect(summaryTable(alice.page)).toBeVisible()

  await join('Carol')
  await expect(participantRow(alice.page, 'Carol')).toHaveCount(1)
  await expect(summaryTable(alice.page)).toBeVisible({ timeout: 2000 })
})
```

Waiting for Carol's row before asserting is what makes these deterministic. Both assertions are about something *not* changing, and asserted directly after the join they would pass on a message that had not arrived yet, which for a `test.fail()` case fails the run.

- [ ] **Step 4: Write the tally case**

Append to `e2e/room.spec.js`:

```js
test('the tally counts only the votes that were cast', async ({ join }) => {
  test.fail(true, 'step 3: a voted-only tally, landing with the template guard beside it')
  const alice = await join('Alice')
  await join('Bob')

  await vote(alice.page, '5')
  await alice.page.getByRole('button', { name: 'Show votes' }).click()
  await expect(summaryTable(alice.page)).toBeVisible()

  // Today Bob's empty estimation is a row of its own.
  await expect(summaryTable(alice.page).locator('tbody tr')).toHaveCount(1, { timeout: 2000 })
})
```

Nothing here asserts on the "Most voted estimation" card. With one vote each the tally is a tie, and its order then depends on the order `users` happens to be in, which differs between two pages in the same room.

- [ ] **Step 5: Write the two reconnect list cases**

Append to `e2e/room.spec.js`:

```js
test('no duplicate participants after a reconnect', async ({ join }) => {
  test.fail(true, 'step 1: a snapshot replaces the replay that pushes a second entry')
  const alice = await join('Alice')
  const bob = await join('Bob')

  await bob.cut()
  await expect(connectionAlert(bob.page)).toBeVisible()
  await bob.restore()
  await expect(connectionAlert(bob.page)).toBeHidden({ timeout: 10_000 })

  await vote(alice.page, '5')
  await expect(votedMark(participantRow(bob.page, 'Alice').first())).toHaveCount(1, {
    timeout: 10_000
  })

  await expect(participantRows(bob.page)).toHaveCount(2, { timeout: 2000 })
  await expect(participantRows(alice.page)).toHaveCount(2, { timeout: 2000 })
})

test('a participant who departed during the gap is pruned on reconnect', async ({ join }) => {
  test.fail(true, 'step 1: a snapshot is the whole list, so a departure cannot be missed')
  const alice = await join('Alice')
  const bob = await join('Bob')
  const carol = await join('Carol')
  await expect(participantRows(bob.page)).toHaveCount(3)

  await carol.close()
  // Two broadcasts are what make the app notice Carol, and both must be seen reaching Bob
  // before he is cut, or his own removal starts on the same clock as Carol's.
  const aliceOnBob = participantRow(bob.page, 'Alice')
  await vote(alice.page, '5')
  await expect(votedMark(aliceOnBob)).toHaveCount(1)
  await alice.page.getByRole('button', { name: 'Clear votes' }).click()
  await expect(votedMark(aliceOnBob)).toHaveCount(0)

  await bob.cut()
  await expect(connectionAlert(bob.page)).toBeVisible()

  await expect(participantRow(alice.page, 'Carol')).toHaveCount(0, { timeout: 20_000 })
  await bob.restore()
  await expect(connectionAlert(bob.page)).toBeHidden({ timeout: 10_000 })

  await expect(participantRow(bob.page, 'Carol')).toHaveCount(0, { timeout: 2000 })
})
```

This is the one case whose ordering is partly timed rather than observed, so here is what has to hold, with detection at about 1.1s after the second broadcast and the grace period G at 4s:

- Carol's context closes. Nothing happens yet: the app has not written to her stream.
- The two broadcasts land, and Bob's page is watched until it has shown both. Carol's stream fails on the second, so her `ConfirmLeave` is scheduled for about 1.1s + G, roughly 5.1s later. Waiting on Bob's page rather than on the two POSTs is the load-bearing part: the endpoints answer 204 from a fire-and-forget actor send, so a returned response says nothing about whether the broadcast has happened.
- Bob is cut, and this is the only timed step: it must land before Carol's `ConfirmLeave` fires. The margin is about 5.1s, against a cut that takes a few milliseconds. Cutting Bob before either broadcast, or racing him against the second one, puts both removals on the same clock and loses the race at any grace period.
- Carol's leave is broadcast and Alice observes it. That same broadcast is a write to Bob's cut stream, and it fails outright rather than only drawing a reset, so Bob's own `ConfirmLeave` is scheduled for about 1.1s + G after it, and that, not the 15s heartbeat, is the budget his reconnect has. The difference from Carol, who needed two writes, is elapsed time and not the kind of teardown: `cut` and a closed tab both reach the app through the same `up.destroy()` in the stub's forwarder, but Carol's two broadcasts land within milliseconds of her disconnect, before the reset has propagated, while Bob's first post-cut write is seconds later against a connection already known to be dead.
- Bob is restored and his banner clears, inside that budget. His `Join` replaces his entry, so the pending `ConfirmLeave` finds a different ref and does nothing.

This case has two ways to flake and they are not equally visible. The cut landing after Carol's leave is loud: Bob then receives the departure, prunes Carol himself, and Playwright reports "expected to fail, but passed". Bob failing to reconnect inside his own budget is quiet in the `test.fail()` case, since any failure there counts as expected, which is exactly why the green control above runs the same helper. The second is the one that has actually happened, in Firefox on a loaded machine at G = 2s. The fix for either is a larger `SSE_GRACE_PERIOD`, which widens both margins together. Do not add a wait before the cut, which spends the first margin, and do not raise the banner assertion's timeout to chase the second, which is the app removing Bob rather than the assertion giving up early.

Alice is a participant here purely to be the observation point, which is also why `carol.close()` leaves the room non-empty and the room actor alive. The setup's vote is cleared by the broadcast that follows it, and one voter out of three would not have revealed anything anyway, so nothing reveals and no assertion in either case depends on the vote state the setup touches.

**The whole-branch review then extracted this case's setup, so read the code rather than the block above.** Everything from the three joins down to Bob's banner clearing now lives in a `departureWhileCut(join)` helper in `e2e/room.spec.js`, shared with a green control case that runs it and asserts nothing further. The reason is deviation 4's: a `test.fail()` case cannot police its own machinery, this case's machinery is the more fragile of the two, and sharing the helper is what stops the control drifting from the case it controls. It earned that on its first day, catching the reconnect-budget flake recorded in deviation 1, which inside the `test.fail()` case would have counted as an expected failure and said nothing.

- [ ] **Step 6: Run the whole suite**

Run: `npm run e2e`

Expected: 24 passed (twelve cases in each project), of which 10 are reported as expected failures, five per project. A case reported as "expected to fail, but passed" is a real failure: either the app already behaves as intended, in which case the annotation is stale and the fix has landed, or the case is not asserting what it claims.

- [ ] **Step 7: Run it again to check for flakes**

Run: `npm run e2e && npm run e2e`

Expected: the same result twice. Report the wall-clock time of a run; the reconnect cases are the slow ones and the plan's budget for them is about 5s each.

- [ ] **Step 8: Commit**

```bash
git add e2e/room.spec.js testkit/app.js
git commit -m "test(e2e): pin the intended behaviour of five known defects"
```

---

### Task 5: Gate the browser suite in CI and document the commands

The last step, and the one that makes the annotations a ledger rather than a note: an annotation nobody's build reads cannot report itself stale.

**Files:**
- Modify: `.github/workflows/ci.yml`, `README.md`

**Interfaces:** none.

- [ ] **Step 1: Add the two browser steps**

In `.github/workflows/ci.yml`, the existing node block becomes:

```yaml
      - uses: actions/setup-node@v5
        with:
          node-version: '24'
          cache: 'npm'

      - name: node tests
        run: node --test "test/**/*.test.js"

      - name: install the browser suite
        run: npm ci && npx playwright install --with-deps chromium firefox

      - name: browser tests
        run: npm run e2e
```

Both engines are installed rather than Chromium alone: the reconnect cases are the heart of this suite and the two engines are already known to disagree on exactly this streaming edge. The steps go after the node tests, on the job that already staged the app.

- [ ] **Step 2: Document the commands**

In `README.md`'s `### Testing` section, after the paragraph about `coverageOff` and before the standalone stub paragraph, add:

```markdown
The browser suite under `e2e/` drives the same packaged app through the stub in Chromium and
Firefox, one app and one stub per Playwright worker:

    npm ci
    npx playwright install --with-deps chromium firefox
    sbt "; coverageOff; Universal/stage"
    npm run e2e

Cases that pin behaviour the app gets wrong today are marked `test.fail()` and annotated with
the step that fixes each, so the suite is green until a fix lands and then reports its own
annotation as stale. A case reported as "expected to fail, but passed" means the fix arrived:
drop the annotation in the same change.
```

Use four-space indented blocks if the surrounding section uses them, or fenced blocks if it uses those. Match what is already there.

- [ ] **Step 3: Verify the workflow parses**

Run: `python3 -c "import yaml,sys; yaml.safe_load(open('.github/workflows/ci.yml'))" && echo ok`

Expected: `ok`.

- [ ] **Step 4: Commit**

```bash
git add .github/workflows/ci.yml README.md
git commit -m "ci: gate the browser suite and document how to run it"
```

---

### Task 6: Take the public CDNs off the critical path

Added after the whole-branch review. `src/main/resources/pages/index.html` pulls four assets from three public hosts on every page load, each browser context has its own cache, and a run opens roughly 55 contexts, so a run makes over two hundred external requests and any one of them stalling past a 5s assertion fails a green case. That is the suite's only dependency on something outside the machine and its most likely failure on a loaded runner. Fetching each asset once per worker cuts the exposure to eight requests, and once the network is off the critical path `retries` can go to zero, which also settles the comment that currently explains retries as absorbing CDN flakiness two lines above `failOnFlakyTests`.

**Files:**
- Modify: `e2e/fixtures.js`, `playwright.config.js`

**Interfaces:**
- Consumes: nothing new.
- Produces: a worker-scoped `assets` fixture, a route handler `(route) => Promise<void>`. It is internal to the fixtures file and no spec imports it.

The four assets, all in `index.html`: `stackpath.bootstrapcdn.com` (Bootstrap CSS, at `:5`), `unpkg.com` (feather, at `:84`), and `cdn.jsdelivr.net` (axios at `:330` and Vue at `:331`).

Two traps make this less trivial than it looks, and getting either wrong changes what the page is:

1. **The Bootstrap link carries `integrity` and `crossorigin="anonymous"`** (`index.html:5`). A fulfilled response must therefore be byte-identical, or Subresource Integrity rejects it, and must carry the upstream `Access-Control-Allow-Origin`, or the browser blocks the stylesheet as a CORS failure. So relay the upstream headers rather than setting only a content type.
2. **`fetch` decompresses the body but leaves the header saying otherwise.** Relaying `content-encoding` or `content-length` alongside a decompressed body corrupts the response, the same class of bug the stub already avoids by stripping hop-by-hop headers.

- [ ] **Step 1: Add the worker-scoped cache**

In `e2e/fixtures.js`, above the `test.extend` call:

```js
// The page pulls four assets from three public hosts on every load, and a run opens roughly
// 55 contexts. Fetch each once per worker instead of once per context.
const CDN = /^https:\/\/(cdn\.jsdelivr\.net|unpkg\.com|stackpath\.bootstrapcdn\.com)\//
// fetch decompresses the body, so relaying either of these alongside it corrupts the response.
const DROPPED = new Set(['content-encoding', 'content-length'])
```

And as a fixture, beside `app` and `stub`:

```js
  assets: [
    async ({}, use) => {
      const cache = new Map()
      const serve = async route => {
        const url = route.request().url()
        if (!cache.has(url)) {
          try {
            // Bounded, since a CDN that stalls rather than failing is the case this exists for.
            const response = await fetch(url, { signal: AbortSignal.timeout(5000) })
            if (!response.ok) return route.continue()
            const headers = {}
            for (const [name, value] of response.headers) {
              if (!DROPPED.has(name)) headers[name] = value
            }
            cache.set(url, {
              status: response.status,
              headers,
              body: Buffer.from(await response.arrayBuffer())
            })
          } catch {
            // Any failure falls back to the network, which is what the page did before this.
            return route.continue()
          }
        }
        await route.fulfill(cache.get(url))
      }
      await use(serve)
    },
    { scope: 'worker' }
  ],
```

- [ ] **Step 2: Route every context through it**

The participants' contexts are made in `join`, and the smoke case uses Playwright's default `page`, which comes from the built-in `context` fixture. Both need the route, so override `context` as well:

```js
  context: async ({ context, assets }, use) => {
    await context.route(CDN, assets)
    await use(context)
  },
```

and in `join`, immediately after `browser.newContext(...)`:

```js
      await context.route(CDN, assets)
```

adding `assets` to that fixture's dependencies.

- [ ] **Step 3: Prove the cache is real, without committing the proof**

Temporarily count the upstream fetches (a counter incremented beside the `fetch` call, logged at worker teardown), run the suite once, and record the number. Expect four per worker rather than two hundred per run: eight on CI, where `workers` is pinned to 2, and four times however many workers Playwright picks locally. Remove the instrumentation before committing.

Then confirm the stylesheet still loads rather than being blocked as a CORS failure, which is the trap that would otherwise pass every structural selector while silently unstyling the page. In a scratch script or a temporary line, compare `page.evaluate(() => document.styleSheets.length)` with the route active against the same page without it. The two must agree. Record both numbers and remove the check.

- [ ] **Step 4: Retire the retry**

In `playwright.config.js`, `retries: 0`, and rewrite the comment above it: retries existed to absorb CDN flakiness, the cache removes the CDN from the critical path, and `failOnFlakyTests` stays so that a `test.fail()` case flipping cannot be reported as flaky and exit 0.

- [ ] **Step 5: Run the suite twice**

Run: `npm run e2e && npm run e2e`

Expected: 24 passed with 10 expected failures, twice, agreeing. Report both wall-clock times against the 45.6s baseline from before this task.

- [ ] **Step 6: Commit**

```bash
git add e2e/fixtures.js playwright.config.js
git commit -m "test(e2e): serve the page's CDN assets from a per-worker cache"
```

## Verification

Run from a clean tree on `20260831.protocol_architecture_0_playwright`, after `20260831.protocol_architecture_0_harness`:

```bash
sbt "; coverageOff; Universal/stage"
npm test
npm run e2e
git status --short
```

Expected:
- `npm test`: 14/14 passing, output pristine. Twelve in `test/stub.test.js`, one in `test/reproduction.test.js`, one in `test/startup.test.js`. The per-task counts earlier in this plan say 12/12 and were correct when written: the empty-match guard case and the startup case both landed later.
- `npm run e2e`: 24 passed, 10 of them expected failures, no flakes across two consecutive runs. Twelve cases in each project, the eleven this plan tabled plus the control the whole-branch review added.
- `git status --short`: empty. No `node_modules/`, `test-results/` or `playwright-report/` tracked, and `package-lock.json` committed.
- `git diff main...HEAD --stat`: nothing under `src/` except `Main.scala` and `pages/index.html`, the two changes deviations 10 and 11 declare.

Then, before merging: push and let CI go green once. These are the workflow's first browser steps, and `playwright install-deps` plus a cached `playwright install` against a bare runner image is the part no local run can prove. Deviation 8 explains why that is two steps rather than one `--with-deps`.

## What landed after the plan was written

The task blocks above are the record of what was instructed, and they are left as written. Seven entries arrived that no task block introduces, each in response to something the work turned up: the first four during implementation, the last three from the whole-branch review that followed. They are listed here rather than under "Deviations" because that list is for departures from the specs, not from this plan.

- **`failOnFlakyTests: true` and `timeout: 60_000` in `playwright.config.js`.** Task 5's config block has neither. `failOnFlakyTests` is insurance for a future `retries` change: a `test.fail()` case that passes and then fails-as-expected on a retry would otherwise be reported flaky and exit 0, which is exactly the signal this suite exists to send. The timeout is because three reconnect cases can exceed Playwright's 30s default once their own assertion timeouts sum.
- **`connectionLost(page)` on `e2e/fixtures.js`**, alongside `connectionAlert(page)`. `connectionAlert` matches any alert on purpose, so a reconnect assertion cannot report hidden when the banner has merely switched to the terminal "session has ended" text. The visible-side assertions need the opposite, the transient banner specifically, so a terminally dead session is not read as a blip. Two locators, two jobs.
- **`stub.cut('')` throws** (`testkit/stub.js:59-62`), with its own case in `test/stub.test.js`. `cookie.includes('')` is true for every cookie, so a mistyped or empty token would cut every live stream on the worker instead of one session, and the cases that assert one participant survives a cut would have passed for the wrong reason.
- **An artifact-upload step in CI** (`.github/workflows/ci.yml:64-69`), gated on `if: failure()` with `if-no-files-found: ignore`. Traces are `retain-on-failure`, so a green run has nothing to upload and an ungated step would spend time shipping an empty artifact.
- **Six smaller changes from the same whole-branch review**, none of them behavioural for the cases: the CDN cache and `waitForReady` both release a discarded body on a non-ok response instead of leaving the socket for GC, with the cancel guarded because it rejects on an already-errored body and an unhandled rejection would be blamed on whichever case is running (`e2e/fixtures.js`, `testkit/app.js`); `READY_TIMEOUT_MS` is exported from `testkit/app.js` so `test/startup.test.js` derives its timeout and its exit budget from the cap instead of hard-coding 45s and 15s; `playwright.config.js` adds the `github` reporter on CI alongside `list`, so a failure is annotated on the PR rather than only logged; `stub.cut`'s guard is wrapped to stay inside 100 columns; and `README.md` documents the two install commands CI actually runs rather than `--with-deps`.
- **`join()` asserts the page mounted before it fills the name**, bounded at 15s. The suite sets no `actionTimeout`, so a *stalling* CDN used to surface as `fill()` waiting out the whole 60s test timeout with nothing said about why. An unreachable CDN was never the slow case: the scripts fail at once, `v-if` never evaluates, both name-input blocks render, and `fill()` fails on a strict-mode violation in milliseconds. Two limits worth stating. The assertion covers the eleven cases that join through the fixture and not `e2e/smoke.spec.js`, which fills the name off the default `page`. And 15s is a real if narrow narrowing, since a first load that mounted at 20s would previously have passed and `retries` is 0; the `Show votes` assertion right after it runs on the default 5s expect timeout and is the tighter constraint anyway.
- **The harness spawns the app with `HOST=127.0.0.1` and advertises that address**, rather than `HOST=localhost` with a `http://localhost:<port>` base URL. Commit `6ab4b47` had already made the stub advertise the address it bound; the app kept a hostname whose two resolutions disagree, node preferring `::1` and the JVM `127.0.0.1`, so every probe and every `app.baseUrl` fetch worked on undici's fallback after a failed connect. Binding the literal address makes the family explicit on both sides, which is also what removes the resolution-order assumption `test/startup.test.js` used to rest on.

## Self-review notes

- **Spec coverage.** Every case sentence in 08-30 §Testing and 08-31 step 0 maps to a row in the table above, and everything deliberately left out names the step that owns it. 08-30's fixture list is implemented in full, including the automatic buffering reset, with the deviations recorded.
- **The known fragility, largely retired.** `index.html` pulls Vue, axios and feather from public CDNs, so a CDN outage used to fail the suite with a selector timeout rather than a useful message. The per-worker asset cache added after the whole-branch review takes them off the critical path, which is why `retries` is 0 rather than 1 on CI. Vendoring the assets outright would still be a much larger `src/` change than deviation 11's version pin, and step 8 replaces the whole page anyway.
- **The one white-box selector.** `issueButton` matches `.input-group-append button`, because the icon buttons have no accessible name at all. It is in `fixtures.js` with the rest, which is the single file step 8 revisits.
- **What a green run does not prove.** The stub is built to the 08-28 spec's description of the customer's appliance, so a green suite shows the design answers the modelled failure, not that the model matches the customer. That gap belongs to the probe, and a probe measurement lands here as a change to `DEADLINE_MS` rather than as a rewrite.
