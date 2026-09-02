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
