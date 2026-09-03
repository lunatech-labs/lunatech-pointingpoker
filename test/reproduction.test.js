import test from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import { startApp } from '../testkit/app.js'
import { createStub } from '../testkit/stub.js'

// Above app.js's 30s readiness cap, or the runner cancels the test before startApp can
// report the captured app output that tells you why the app never came up.
test('an SSE stream through a buffering proxy delivers nothing and dies at the deadline', { timeout: 45_000 }, async t => {
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

  // Without this the test cannot tell "the proxy buffered it" from "the app sent nothing".
  // The control stream stays open for the rest of the test so the member never leaves.
  stub.setBuffering(false)
  const control = http.get(`${stub.baseUrl}/rooms/${roomId}/events`, { headers: { cookie } })
  t.after(() => control.destroy())
  let controlEnded = false
  const streamed = await new Promise(resolve => {
    const started = Date.now()
    control.on('response', response => {
      const at = bytes => ({ status: response.statusCode, bytes, ms: Date.now() - started })
      response.once('data', chunk => resolve(at(chunk.length)))
      response.on('end', () => {
        controlEnded = true
      })
      response.on('error', () => resolve(at(0)))
    })
    control.on('error', () => resolve({ status: null, bytes: 0, ms: Date.now() - started }))
  })
  // A 401 or 500 here is finite, so the stub would release it and the buffered case below
  // would fail pointing at the stub rather than at the session.
  assert.equal(streamed.status, 200)
  assert.ok(streamed.bytes > 0, 'the app must stream something once the proxy is out of the way')
  assert.ok(
    streamed.ms < stub.deadlineMs,
    `first byte at ${streamed.ms}ms, which is not inside the ${stub.deadlineMs}ms deadline`
  )
  stub.setBuffering(true)

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

  // Checked before the assertions below, because a stream that ended is the cause of the
  // 401 they would otherwise blame on the stub.
  assert.equal(controlEnded, false, 'the app SSE stream must not end on its own')
  assert.equal(result.response, null, 'not even the response headers may reach the client')
  assert.equal(result.bytes, 0)
  assert.ok(result.error, 'the appliance destroys the socket at its own timeout')
  assert.ok(
    result.ms >= stub.deadlineMs * 0.8,
    `expected the destroy near ${stub.deadlineMs}ms, got ${result.ms}ms`
  )
})
