import test from 'node:test'
import assert from 'node:assert/strict'
import net from 'node:net'
import { once } from 'node:events'
import { startApp, freePort } from '../testkit/app.js'

// Above app.js's 30s readiness cap, so a regression fails this assertion rather than being
// cancelled by the runner before it can report why.
test('a bind failure surfaces as an exit, not as a readiness timeout', { timeout: 45_000 }, async t => {
  const port = await freePort()
  // 127.0.0.1 is the HOST the harness spawns the app with, so this genuinely takes the port.
  const squatter = net.createServer()
  squatter.listen(port, '127.0.0.1')
  await once(squatter, 'listening')
  t.after(() => squatter.close())

  const started = Date.now()
  await assert.rejects(
    () => startApp({ port }),
    error => {
      // The exit is what makes the readiness loop give up early; the log line is what says why.
      assert.match(error.message, /exited before it became ready/)
      assert.match(error.message, /Could not bind the HTTP server/)
      return true
    }
  )
  const elapsed = Date.now() - started
  // The whole point: a failure the app can report does not cost the readiness cap.
  assert.ok(elapsed < 15_000, `expected an early exit, took ${elapsed}ms`)
})
