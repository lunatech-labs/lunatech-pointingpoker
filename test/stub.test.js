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
