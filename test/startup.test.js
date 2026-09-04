import test from 'node:test'
import assert from 'node:assert/strict'
import net from 'node:net'
import { once } from 'node:events'
import { startApp, freePort, READY_TIMEOUT_MS } from '../testkit/app.js'

// Above the readiness cap, so a regression fails this assertion rather than being cancelled
// by the runner before it can report why.
test('a bind failure surfaces as an exit, not as a readiness timeout', {
  timeout: READY_TIMEOUT_MS + 15_000
}, async t => {
  const port = await freePort()
  // 127.0.0.1 is the HOST the harness spawns the app with, so this genuinely takes the port.
  const squatter = net.createServer()
  squatter.listen(port, '127.0.0.1')
  await once(squatter, 'listening')
  t.after(() => squatter.close())

  const started = Date.now()
  // Held so a bind that unexpectedly succeeds cannot leave the JVM holding the port.
  let app = null
  const attempt = startApp({ port }).then(handle => (app = handle))
  t.after(() => app?.stop())
  await assert.rejects(attempt, error => {
    // The exit is what makes the readiness loop give up early; the log line is what says why.
    assert.match(error.message, /exited before it became ready/)
    assert.match(error.message, /Could not bind the HTTP server/)
    return true
  })
  const elapsed = Date.now() - started
  // The whole point: a failure the app can report does not cost the readiness cap.
  const budget = READY_TIMEOUT_MS / 2
  assert.ok(elapsed < budget, `expected an early exit within ${budget}ms, took ${elapsed}ms`)
})
