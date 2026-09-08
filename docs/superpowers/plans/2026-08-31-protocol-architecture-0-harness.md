# Step 0, Part 1: Stub Proxy and App Harness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the customer's "SSE delivers zero bytes behind a scanning proxy" report into a test that runs on every push, and give the repository its first way to start the real app from Node.

**Architecture:** Two independent Node modules with no dependencies. `testkit/stub.js` is a reverse proxy the browser or a test points at instead of the app; in pass-through it streams, in buffering mode it collects the whole upstream response and releases nothing until upstream ends, destroying the downstream socket at its own deadline. `testkit/app.js` spawns the staged launcher with a test profile and polls until it answers. `node --test` runs both, gated in CI.

**Tech Stack:** Node 24 (built-in `node:test`, `node:http`, global `fetch`), no runtime dependencies. sbt native-packager for `Universal/stage`.

**Spec:** `docs/superpowers/specs/2026-08-30-e2e-testkit-design.md`, delivering the first half of step 0 of `docs/superpowers/specs/2026-08-31-protocol-target-architecture-design.md`.

**Not in this plan:** the Playwright fixtures and the nine browser cases. Those are the second half of step 0 and land in a separate PR stacked on this branch, together with `@playwright/test`, the lockfile, `playwright.config.js`, `e2e/`, and the browser CI steps. 08-30 §Delivery says one PR; splitting is a deliberate deviation, recorded below.

## Global Constraints

- **No runtime or dev dependencies in this PR.** `test/` must stay runnable with a bare `node --test "test/**/*.test.js"`. `package.json` exists only for `"type": "module"` and the `test` script.
- **Node 24**, matching the CI `actions/setup-node@v5` pin.
- **ES modules throughout** (`import`, not `require`), because `package.json` declares `"type": "module"`.
- **Three shallow directories, nothing imports backwards:** `testkit/` is machinery, `test/` is what `node --test` runs. `test/` imports from `testkit/`; `testkit/` imports nothing local.
- **The test profile is environment variables only.** No new configuration surface in the Scala app. The two values are `SSE_GRACE_PERIOD=600ms` and `SSE_RETRY=200ms`, which satisfy `SseConfig.load`'s `require` that the grace period be at least twice the retry (`src/main/scala/com/lunatech/pointingpoker/config/SseConfig.scala:31-35`). The app's own `require`s validate the profile; do not restate the rules in the testkit.
- **Three non-timing variables the harness must set:** `SECURE_COOKIES=false`, `INDEX_PATH` as an absolute path, `HOST=localhost`.
- **The heartbeat is not configurable.** `val heartbeatInterval = 15.seconds` is hardcoded (`src/main/scala/com/lunatech/pointingpoker/sse/SSE.scala:34`). No test may depend on turning it down.
- **Comments are one or two lines.** No multi-line comment blocks; extra context goes in the commit message.
- **Conventional Commits** for every commit message.

## Deviations from the spec, and why

Each of these is a decision the spec left open or got slightly wrong. They are listed here so a reviewer can reject one without re-deriving it.

1. **The deadline timer arms only in buffering mode.** 08-30 §1 reads as though it arms per request. Arming it in pass-through would destroy every SSE stream the harness opens after `deadlineMs`, which would break the browser suite in the next PR. "Destroys the downstream socket *having written nothing*" only describes the buffering case anyway.
2. **`/__stub/buffering` takes `?mode=on|off`.** 08-30 says only "taking `on` or `off`" without naming the form. A query parameter is typeable into a browser address bar, which is what the CLI exists for.
3. **`createStub` also returns `baseUrl` and `deadlineMs`.** The spec's return shape is `{ port, setBuffering, close }`. Both additions remove string-building from every call site, and `deadlineMs` is what the reproduction asserts against.
4. **`sbt Universal/stage` is required before `npm test`, not only before `npm run e2e`.** 08-30 §Delivery's follow-up note says otherwise, but `test/reproduction.test.js` runs the real app. The README says the accurate thing.
5. **Two PRs rather than one.** The stub and harness have no browser dependency and their review question ("is the appliance modelled faithfully") is different from the browser suite's ("are these the right nine pins"). This half also ships the customer's failure as a gated test immediately.
6. **`.gitignore` gains only `node_modules/`, not `test-results/` too.** 08-30 §4 asks for both. `test-results/` is Playwright's output directory and arrives with the browser suite in the next PR.

---

### Task 1: The stub as a transparent reverse proxy

Pass-through forwarding plus the local toggle endpoint. A reviewer can accept this and still reject the buffering model in Task 2.

**Files:**
- Create: `package.json`
- Create: `testkit/stub.js`
- Create: `test/stub.test.js`
- Modify: `.gitignore`

**Interfaces:**
- Produces: `createStub({ upstream, deadlineMs = DEADLINE_MS, buffering = false })` → `Promise<{ port, baseUrl, deadlineMs, setBuffering(on), close() }>`, and `DEADLINE_MS`, both from `testkit/stub.js`. `upstream` is an absolute URL string. `baseUrl` is `http://localhost:${port}`.

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "pointingpoker",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "node --test \"test/**/*.test.js\""
  }
}
```

- [ ] **Step 2: Add `node_modules/` to `.gitignore`**

Append to `.gitignore` (the file currently ends without a trailing newline after `.claude/settings.local.json`, so make sure the new entry lands on its own line):

```
node_modules/
```

- [ ] **Step 3: Write the failing tests**

Create `test/stub.test.js`:

```js
import test from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import { once } from 'node:events'
import { createStub } from '../testkit/stub.js'

// A trivial upstream, so a stub failure can never be blamed on the app.
async function upstream(handler) {
  const server = http.createServer(handler)
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  return {
    url: `http://localhost:${server.address().port}`,
    async close() {
      server.closeAllConnections()
      server.close()
      await once(server, 'close')
    }
  }
}

// Raw http rather than fetch: these assertions are about bytes and sockets, and fetch
// hides both behind a promise that only settles once the whole body has arrived.
function get(url, options = {}) {
  const started = Date.now()
  const result = { chunks: [], response: null, error: null, firstByteAt: null, endedAt: null }
  const req = http.get(url, options)
  const done = new Promise(resolve => {
    req.on('response', res => {
      result.response = res
      res.on('data', chunk => {
        result.firstByteAt ??= Date.now() - started
        result.chunks.push(chunk)
      })
      res.on('end', () => {
        result.endedAt = Date.now() - started
        resolve(result)
      })
    })
    req.on('error', error => {
      result.error = error
      result.endedAt = Date.now() - started
      resolve(result)
    })
  })
  return { req, done }
}

test('pass-through delivers bytes as they are written, not at the end', async () => {
  const up = await upstream((req, res) => {
    res.writeHead(200, { 'content-type': 'text/event-stream' })
    res.write('data: first\n\n')
    setTimeout(() => res.end('data: last\n\n'), 300)
  })
  const stub = await createStub({ upstream: up.url })

  const result = await get(`${stub.baseUrl}/`).done

  assert.equal(Buffer.concat(result.chunks).toString(), 'data: first\n\ndata: last\n\n')
  assert.ok(result.firstByteAt < 200, `first byte arrived at ${result.firstByteAt}ms`)
  assert.ok(
    result.endedAt - result.firstByteAt > 150,
    'a buffering stub would also eventually deliver these, so the gap is the assertion'
  )

  await stub.close()
  await up.close()
})

test('the buffering toggle is handled locally and never forwarded', async () => {
  const up = await upstream((req, res) => {
    res.writeHead(200, { 'content-type': 'text/plain' })
    res.end(req.url)
  })
  const stub = await createStub({ upstream: up.url })

  const toggled = await fetch(`${stub.baseUrl}/__stub/buffering?mode=on`)
  assert.equal(toggled.status, 200)
  // The upstream echoes the path back, so an echo here would mean it was forwarded.
  assert.match(await toggled.text(), /^buffering on$/m)

  const bad = await fetch(`${stub.baseUrl}/__stub/buffering`)
  assert.equal(bad.status, 400)

  await stub.close()
  await up.close()
})
```

- [ ] **Step 4: Run the tests to verify they fail**

Run: `node --test "test/**/*.test.js"`
Expected: FAIL with `Cannot find module .../testkit/stub.js`.

- [ ] **Step 5: Write the stub**

Create `testkit/stub.js`:

```js
// Stands in for the customer's scanning proxy: forwards everything, and in buffering mode
// releases nothing downstream until the upstream response ends. See the 08-30 testkit design.
import http from 'node:http'
import { once } from 'node:events'
import { pathToFileURL } from 'node:url'

// How long the simulated appliance waits before giving up on a response it is still
// buffering. A probe measurement lands here as a change to this number, not as a rewrite.
export const DEADLINE_MS = 2000

// Hop-by-hop headers a proxy must not pass on. transfer-encoding is also the one that
// buffering mode replaces with a content-length.
const HOP_BY_HOP = [
  'connection',
  'keep-alive',
  'transfer-encoding',
  'upgrade',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailer'
]

export async function createStub({ upstream, deadlineMs = DEADLINE_MS, buffering = false }) {
  const target = new URL(upstream)
  const state = { buffering }

  const server = http.createServer((req, res) => {
    if (req.url.startsWith('/__stub/buffering')) return toggle(req, res, state)
    // Read once per request: a toggle affects later requests, never one already in flight.
    if (state.buffering) forwardBuffered(req, res, target, deadlineMs)
    else forwardStreaming(req, res, target)
  })

  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const { port } = server.address()

  return {
    port,
    baseUrl: `http://localhost:${port}`,
    deadlineMs,
    setBuffering(on) {
      state.buffering = Boolean(on)
    },
    async close() {
      server.closeAllConnections()
      server.close()
      await once(server, 'close')
    }
  }
}

// Handled locally and never forwarded, so a browser parked on the stub's origin can change
// the mode without changing origin.
function toggle(req, res, state) {
  const mode = new URL(req.url, 'http://stub').searchParams.get('mode')
  if (mode !== 'on' && mode !== 'off') {
    res.writeHead(400, { 'content-type': 'text/plain' })
    res.end('expected /__stub/buffering?mode=on or ?mode=off\n')
    return
  }
  state.buffering = mode === 'on'
  res.writeHead(200, { 'content-type': 'text/plain' })
  res.end(`buffering ${mode}\n`)
}

function openUpstream(req, target) {
  return http.request({
    host: target.hostname,
    port: target.port,
    path: req.url,
    method: req.method,
    headers: req.headers
  })
}

function relayHeaders(upstreamHeaders) {
  const headers = { ...upstreamHeaders }
  for (const name of HOP_BY_HOP) delete headers[name]
  return headers
}

function forwardStreaming(req, res, target) {
  const up = openUpstream(req, target)
  up.on('response', upRes => {
    res.writeHead(upRes.statusCode, relayHeaders(upRes.headers))
    upRes.pipe(res)
  })
  up.on('error', () => fail502(res))
  res.on('close', () => up.destroy())
  req.pipe(up)
}

// Placeholder until Task 2. Buffering mode is the whole point of the stub; it is split out
// so the transparent-proxy half can be reviewed on its own.
function forwardBuffered(req, res, target, deadlineMs) {
  forwardStreaming(req, res, target)
}

function fail502(res) {
  if (res.headersSent || res.destroyed) return
  res.writeHead(502, { 'content-type': 'text/plain' })
  res.end('stub: upstream error\n')
}

// CLI, so a bug whose whole character is "nothing appears" can be reproduced by hand in
// front of an app you are already running.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const upstream = process.env.UPSTREAM ?? 'http://localhost:8080'
  const stub = await createStub({ upstream, buffering: process.argv.includes('--buffering') })
  console.log(`stub ${stub.baseUrl} -> ${upstream}`)
  console.log(`toggle with ${stub.baseUrl}/__stub/buffering?mode=on|off`)
}
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `node --test "test/**/*.test.js"`
Expected: PASS, 2 tests.

- [ ] **Step 7: Commit**

```bash
git add package.json .gitignore testkit/stub.js test/stub.test.js
git commit -m "test(testkit): add a reverse-proxy stub the browser can point at"
```

---

### Task 2: Buffering mode, the deadline, and the failure paths

The part that actually reproduces the customer's appliance. The placeholder from Task 1 goes away here.

**Files:**
- Modify: `testkit/stub.js`
- Modify: `test/stub.test.js`

**Interfaces:**
- Consumes: `createStub`, `DEADLINE_MS` from Task 1.
- Produces: no new exports. `createStub({ buffering: true })` and `setBuffering(true)` now buffer.

- [ ] **Step 1: Write the failing tests**

Append to `test/stub.test.js`:

```js
// A stub that never gives up would otherwise hang the run instead of failing it.
function within(promise, ms) {
  return Promise.race([promise, new Promise(resolve => setTimeout(() => resolve(null), ms))])
}

test('a response that never ends yields nothing downstream, then a destroyed socket', async () => {
  const up = await upstream((req, res) => {
    res.writeHead(200, { 'content-type': 'text/event-stream' })
    res.write('data: hello\n\n')
  })
  const stub = await createStub({ upstream: up.url, deadlineMs: 300, buffering: true })

  const result = await within(get(`${stub.baseUrl}/`).done, 3000)

  assert.ok(result, 'the request was still open 3s after a 300ms deadline')
  assert.equal(result.response, null, 'not even the response headers may reach the client')
  assert.equal(Buffer.concat(result.chunks).length, 0)
  assert.ok(result.error, 'the socket is destroyed rather than left hanging')
  assert.ok(result.endedAt >= 250, `expected the destroy at the deadline, got ${result.endedAt}ms`)

  await stub.close()
  await up.close()
})

test('a finite response is released whole, content-length delimited', async () => {
  const up = await upstream((req, res) => {
    // Two writes and no content-length, so the upstream response is chunked and the
    // stub has to replace that encoding rather than pass it on.
    res.writeHead(200, { 'content-type': 'text/plain' })
    res.write('one')
    res.end('two')
  })
  const stub = await createStub({ upstream: up.url, buffering: true })

  const result = await get(`${stub.baseUrl}/`).done

  assert.equal(result.response.statusCode, 200)
  assert.equal(Buffer.concat(result.chunks).toString(), 'onetwo')
  assert.equal(result.response.headers['content-length'], '6')
  assert.equal(result.response.headers['transfer-encoding'], undefined)

  await stub.close()
  await up.close()
})

test('the toggle changes the mode for subsequent requests', async () => {
  const up = await upstream((req, res) => {
    res.writeHead(200, { 'content-type': 'text/plain' })
    res.end('ok')
  })
  const stub = await createStub({ upstream: up.url })

  const streamed = await get(`${stub.baseUrl}/x`).done
  assert.equal(streamed.response.headers['transfer-encoding'], 'chunked')

  await fetch(`${stub.baseUrl}/__stub/buffering?mode=on`)
  const buffered = await get(`${stub.baseUrl}/x`).done
  assert.equal(buffered.response.headers['transfer-encoding'], undefined)
  assert.equal(buffered.response.headers['content-length'], '2')

  await stub.close()
  await up.close()
})

test('an upstream error answers 502 rather than hanging', async () => {
  const up = await upstream((req, res) => res.end())
  const dead = up.url
  await up.close()
  const stub = await createStub({ upstream: dead, buffering: true })

  const result = await get(`${stub.baseUrl}/`).done

  assert.equal(result.response.statusCode, 502)

  await stub.close()
})

test('a downstream abort mid-buffer destroys the upstream request', async () => {
  let sawAbort
  const aborted = new Promise(resolve => {
    sawAbort = resolve
  })
  const up = await upstream((req, res) => {
    res.writeHead(200, { 'content-type': 'text/event-stream' })
    res.write('data: partial\n\n')
    // This is what makes the app observe the disconnect and schedule Leave.
    res.on('close', () => sawAbort(true))
  })
  const stub = await createStub({ upstream: up.url, deadlineMs: 5000, buffering: true })

  const { req } = get(`${stub.baseUrl}/`)
  setTimeout(() => req.destroy(), 100)

  const timeout = new Promise(resolve => setTimeout(() => resolve(false), 2000))
  assert.equal(await Promise.race([aborted, timeout]), true)

  await stub.close()
  await up.close()
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test "test/**/*.test.js"`
Expected: 7 tests, 3 failing. Precisely:

- "a response that never ends" FAILS on `result.response` being non-null, because the placeholder streams the headers straight through and nothing destroys the socket.
- "a finite response is released whole" FAILS on `transfer-encoding` being `chunked` and `content-length` being `undefined`.
- "the toggle changes the mode" FAILS on the same two headers for its second request.
- "an upstream error answers 502" and "a downstream abort mid-buffer" PASS already, because `forwardStreaming` implements both paths too. That is expected, not a gap: they exist to pin the same two guarantees on the buffered path once Step 3 replaces the placeholder, and Step 4 is where they start meaning something. This is only true for a pre-response connect error; the mid-stream case passed on neither path until a later fix added an error handler on the upstream response.

- [ ] **Step 3: Replace the placeholder with real buffering**

In `testkit/stub.js`, replace the placeholder `forwardBuffered` with:

```js
function forwardBuffered(req, res, target, deadlineMs) {
  const up = openUpstream(req, target)
  // The appliance gives up at its own timeout having released nothing at all, which is
  // the customer's report exactly.
  const deadline = setTimeout(() => {
    up.destroy()
    res.destroy()
  }, deadlineMs)

  up.on('response', upRes => {
    const chunks = []
    upRes.on('data', chunk => chunks.push(chunk))
    upRes.on('end', () => {
      clearTimeout(deadline)
      if (res.destroyed) return
      const body = Buffer.concat(chunks)
      // A scanner that has buffered a whole response knows its length and sends it.
      const headers = relayHeaders(upRes.headers)
      headers['content-length'] = String(body.length)
      res.writeHead(upRes.statusCode, headers)
      res.end(body)
    })
  })
  up.on('error', () => {
    clearTimeout(deadline)
    fail502(res)
  })
  // A downstream abort mid-buffer has to reach the app, or it never observes the disconnect.
  res.on('close', () => {
    clearTimeout(deadline)
    up.destroy()
  })
  req.pipe(up)
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test "test/**/*.test.js"`
Expected: PASS, 7 tests.

- [ ] **Step 5: Commit**

```bash
git add testkit/stub.js test/stub.test.js
git commit -m "test(testkit): buffer whole responses and die at the appliance's deadline"
```

---

### Task 3: The app harness and the reproduction

`startApp` plus the customer's failure as an executable case. The reproduction is written first and drives the harness into existence.

**Files:**
- Create: `testkit/app.js`
- Create: `test/reproduction.test.js`

**Interfaces:**
- Consumes: `createStub` from Task 1.
- Produces: `startApp({ port, env } = {})` → `Promise<{ baseUrl, port, output(), stop() }>`, `freePort()` → `Promise<number>`, and `testProfile` (the two SSE env vars), all from `testkit/app.js`. `output()` returns captured stdout and stderr as a string. `stop()` is idempotent.

- [ ] **Step 1: Write the failing test**

Create `test/reproduction.test.js`:

```js
import test from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import { startApp } from '../testkit/app.js'
import { createStub } from '../testkit/stub.js'

test('an SSE stream through a buffering proxy delivers nothing and dies at the deadline', async t => {
  const app = await startApp()
  t.after(() => app.stop())
  const stub = await createStub({ upstream: app.baseUrl, buffering: true })
  t.after(() => stub.close())

  // Both of these are finite, so the stub releases them; getting the cookie through the
  // stub is also what exercises the claim that buffered POSTs still work.
  const created = await fetch(`${stub.baseUrl}/create-room`, { method: 'POST' })
  assert.equal(created.status, 200)
  const roomId = (await created.text()).trim()

  const joined = await fetch(`${stub.baseUrl}/rooms/${roomId}/join`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name: 'Ada' })
  })
  assert.equal(joined.status, 200)
  // Load-bearing: without a cookie /events answers 401, a small finite response the stub
  // releases promptly, so a reproduction that skipped the join would prove nothing.
  const cookie = joined.headers
    .getSetCookie()
    .map(value => value.split(';')[0])
    .join('; ')
  assert.match(cookie, /^session=/)

  const started = Date.now()
  const result = await new Promise(resolve => {
    const req = http.get(`${stub.baseUrl}/rooms/${roomId}/events`, { headers: { cookie } })
    let bytes = 0
    let response = null
    req.on('response', res => {
      response = res
      res.on('data', chunk => {
        bytes += chunk.length
      })
      res.on('end', () => resolve({ response, bytes, error: null, ms: Date.now() - started }))
    })
    req.on('error', error => resolve({ response, bytes, error, ms: Date.now() - started }))
  })

  assert.equal(result.response, null, 'not even the response headers may reach the client')
  assert.equal(result.bytes, 0)
  assert.ok(result.error, 'the appliance destroys the socket at its own timeout')
  assert.ok(
    result.ms >= stub.deadlineMs * 0.8,
    `expected the destroy near ${stub.deadlineMs}ms, got ${result.ms}ms`
  )
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `node --test test/reproduction.test.js`
Expected: FAIL with `Cannot find module .../testkit/app.js`.

- [ ] **Step 3: Write the harness**

Create `testkit/app.js`:

```js
// Starts the staged launcher rather than `sbt run`: it boots in about two seconds, it is a
// single process so teardown is a clean signal, and it is the same artifact Docker ships.
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import fs from 'node:fs'
import net from 'node:net'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const launcher = path.join(repoRoot, 'target', 'universal', 'stage', 'bin', 'pointingpoker')
const indexPath = path.join(repoRoot, 'src', 'main', 'resources', 'pages', 'index.html')

const READY_TIMEOUT_MS = 30_000
const STAGE_COMMAND = 'sbt "; coverageOff; Universal/stage"'

// SseConfig.load's `require`s validate this at startup, so the profile does not get its own
// copy of the rules. The heartbeat is hardcoded at 15s and cannot be turned down.
export const testProfile = {
  SSE_GRACE_PERIOD: '600ms',
  SSE_RETRY: '200ms'
}

export async function freePort() {
  const server = net.createServer()
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const { port } = server.address()
  server.close()
  await once(server, 'close')
  return port
}

export async function startApp({ port, env = {} } = {}) {
  // Fail here rather than spending the readiness cap on a file that is not there.
  if (!fs.existsSync(launcher)) {
    throw new Error(`${launcher} is missing. Run: ${STAGE_COMMAND}`)
  }
  const chosen = port ?? (await freePort())
  const child = spawn(launcher, [], {
    stdio: ['ignore', 'pipe', 'pipe'],
    env: {
      ...process.env,
      HOST: 'localhost',
      PORT: String(chosen),
      // Without this the browser never returns the session cookie over plain HTTP and
      // every case fails with a 401 that looks like a session bug.
      SECURE_COOKIES: 'false',
      // application.conf's default is repo-relative and the staged binary does not run
      // from the repo root.
      INDEX_PATH: indexPath,
      ...testProfile,
      ...env
    }
  })

  const captured = []
  child.stdout.on('data', chunk => captured.push(chunk))
  child.stderr.on('data', chunk => captured.push(chunk))
  const output = () => Buffer.concat(captured).toString()

  let exited = null
  let spawnError = null
  child.on('exit', (code, signal) => {
    exited = { code, signal }
  })
  // A launcher that exists but cannot be run emits 'error' and may never emit 'exit', so
  // without this both the readiness loop and stop() would hang on a process that never was.
  child.on('error', error => {
    spawnError = error
    exited ??= { code: null, signal: null }
  })

  const failure = () => {
    if (spawnError) return `${launcher} could not be spawned: ${spawnError.message}`
    if (exited) return `the app exited before it became ready (code ${exited.code}, signal ${exited.signal})`
    return null
  }

  const stop = async () => {
    if (exited) return
    child.kill('SIGTERM')
    const hard = setTimeout(() => child.kill('SIGKILL'), 2000)
    await once(child, 'exit')
    clearTimeout(hard)
  }

  const baseUrl = `http://localhost:${chosen}`
  try {
    await waitForReady(baseUrl, failure)
  } catch (reason) {
    // A config error looks identical to a slow machine without the captured output.
    const log = output()
    await stop()
    throw new Error(`${reason.message}\n--- app output ---\n${log}`)
  }
  return { baseUrl, port: chosen, output, stop }
}

async function waitForReady(baseUrl, failure) {
  const deadline = Date.now() + READY_TIMEOUT_MS
  while (Date.now() < deadline) {
    const reason = failure()
    if (reason) throw new Error(reason)
    try {
      const response = await fetch(baseUrl, { signal: AbortSignal.timeout(1000) })
      if (response.ok) {
        await response.arrayBuffer()
        return
      }
    } catch {
      // Not up yet; the loop's own deadline is the only thing that gives up.
    }
    await new Promise(resolve => setTimeout(resolve, 100))
  }
  throw new Error(`the app did not answer on ${baseUrl} within ${READY_TIMEOUT_MS}ms`)
}
```

- [ ] **Step 4: Run it to verify the missing-launcher guard fires**

Run: `node --test test/reproduction.test.js`
Expected: FAIL with `target/universal/stage/bin/pointingpoker is missing. Run: sbt "; coverageOff; Universal/stage"`. This is the guard working, not a defect.

- [ ] **Step 5: Stage the app**

Run: `sbt "; coverageOff; Universal/stage"`
Expected: `target/universal/stage/bin/pointingpoker` exists and is executable. `coverageOff` is insurance rather than a requirement here, since a separate `sbt` invocation recompiles without instrumentation anyway; it matters only if you stage from the same shell that ran `qa`.

- [ ] **Step 6: Run it to verify it passes**

Run: `node --test test/reproduction.test.js`
Expected: PASS, 1 test, taking roughly 5 seconds (about 2 for the JVM, 2 for the stub deadline).

- [ ] **Step 7: Run the whole node suite**

Run: `node --test "test/**/*.test.js"`
Expected: PASS, 8 tests.

- [ ] **Step 8: Commit**

```bash
git add testkit/app.js test/reproduction.test.js
git commit -m "test(testkit): reproduce the customer's buffered-SSE failure locally"
```

---

### Task 4: Gate it in CI and document the commands

Until the build runs these, the reproduction is a note rather than a regression test.

**Files:**
- Modify: `.github/workflows/ci.yml`
- Modify: `README.md`

**Interfaces:**
- Consumes: the `npm test` script from Task 1 and the staged launcher from Task 3.
- Produces: nothing importable.

- [ ] **Step 1: Append the node steps to the existing `test` job**

In `.github/workflows/ci.yml`, after the `Codecov` step (so a node failure does not cost the coverage upload), add:

```yaml
      - name: stage the app for the node tests
        run: sbt "; coverageOff; Universal/stage"

      - uses: actions/setup-node@v5
        with:
          node-version: '24'

      - name: node tests
        run: node --test "test/**/*.test.js"
```

These go on the existing job rather than a second sbt job, since that job already has a JVM and a warm build. No `npm ci` step: `test/` has no dependencies. The browser suite's `npm ci` and `playwright install` arrive with the next PR.

- [ ] **Step 2: Document the commands in `README.md`**

Add a `### Testing` section immediately before `### Running locally`:

````markdown
### Testing

The Scala suite:

```
sbt test
```

There is also a Node testkit under `testkit/`, exercised by `node --test`. It contains a
stub buffering proxy that reproduces the response-scanning appliance a customer reported,
and a harness that starts the packaged app. Both need the app staged first:

```
sbt "; coverageOff; Universal/stage"
npm test
```

`coverageOff` is insurance rather than a requirement in this form: enabling coverage is a
session setting, so a separate `sbt` invocation recompiles without instrumentation anyway.
It earns its place if you ever stage from the same sbt shell that ran `qa`, where the
instrumented classes do get packaged and no scoverage runtime is staged to satisfy them.

The stub also runs standalone, so the failure can be reproduced by hand against an app you
are already running:

```
UPSTREAM=http://localhost:8080 node testkit/stub.js --buffering
```

It prints its own address; point a browser at that instead of the app. The page itself still
loads, because it is a finite response the stub releases whole. What fails is the room: the
browser stays on the Create page and never displays the room at all, since the client switches
views only when the first SSE message arrives and the stream never ends, so the stub releases
nothing and destroys the connection at its deadline. That is the customer's reported symptom,
against a modelled appliance rather than a measured one: the stub's deadline is a placeholder
rather than a measurement of theirs. It is also why the reproduction test asserts against
`/rooms/{roomId}/events` rather than `/`. Buffering can be switched at runtime with
`/__stub/buffering?mode=on` and `?mode=off`, which affects later requests rather than ones
already in flight. Recovering needs no reload: `EventSource` retries on its own, so the page
moves from Create to the room a second or two after `?mode=off`.
````

- [ ] **Step 3: Verify the documented commands work from a clean tree**

```bash
rm -rf target/universal/stage
node --test "test/**/*.test.js"    # expect the reproduction to fail with the "is missing" guard
sbt "; coverageOff; Universal/stage"
npm test             # expect PASS, 8 tests
```

- [ ] **Step 4: Verify the stub CLI works by hand**

```bash
SECURE_COOKIES=false sbt run &
node testkit/stub.js --buffering
```

Open the address the stub prints and create a room. Expected, confirmed by hand: the page
loads, because it is a finite response the stub releases whole, but the browser stays on the
Create page and never displays the room, the client switching views only on the first SSE
message while the stream never ends, so the stub delivers nothing and destroys the connection
at its deadline. That is the customer's symptom. Then visit `/__stub/buffering?mode=off` on the
stub's origin. Expected: no reload, the page moves to the room by itself on the next
`EventSource` retry and behaves normally, stragglers leaving after the grace period. Stop both.

- [ ] **Step 5: Commit**

```bash
git add .github/workflows/ci.yml README.md
git commit -m "ci: run the node testkit on every push"
```

---

## Verification

Run all of it in order from a clean checkout of the branch:

```bash
sbt qa                                # the Scala suite is untouched and still green
sbt "; coverageOff; Universal/stage"  # the launcher the harness spawns
node --test "test/**/*.test.js"   # 9 tests: 8 stub, 1 reproduction
```

The ninth stub case, and several pieces of hardening the four tasks do not describe, came from
the whole-branch review after Task 4. Executing the four tasks alone lands eight tests; the
branch as shipped has nine.

What "done" looks like:

- `node --test "test/**/*.test.js"` reports 9 passing tests and exits 0, in well under a minute.
- Deleting `target/universal/stage` makes the reproduction fail with the "is missing" message naming the exact sbt command, not with a 30 second timeout.
- The stub CLI reproduces the failure in a real browser by hand, and `?mode=off` recovers it.
- `git status` is clean; no `node_modules/` is tracked.
- The `test` job in `.github/workflows/ci.yml` stages the app, sets up Node 24 and runs `node --test "test/**/*.test.js"`, after the Codecov step.

Nothing in the Scala source changes in this PR. If a task tempts you into `src/main`, stop: the app is the thing being characterized, and step 1 is where it starts changing.
