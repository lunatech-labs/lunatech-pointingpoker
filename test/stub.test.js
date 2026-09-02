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
