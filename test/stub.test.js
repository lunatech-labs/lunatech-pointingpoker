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
      res.on('error', error => {
        result.error = error
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
  return { req, done, result }
}

test('pass-through delivers bytes as they are written, not at the end', async t => {
  const up = await upstream((req, res) => {
    res.writeHead(200, { 'content-type': 'text/event-stream' })
    res.write('data: first\n\n')
    setTimeout(() => res.end('data: last\n\n'), 300)
  })
  t.after(() => up.close())
  const stub = await createStub({ upstream: up.url })
  t.after(() => stub.close())

  const result = await get(`${stub.baseUrl}/`).done

  assert.equal(Buffer.concat(result.chunks).toString(), 'data: first\n\ndata: last\n\n')
  assert.ok(result.firstByteAt < 200, `first byte arrived at ${result.firstByteAt}ms`)
  assert.ok(
    result.endedAt - result.firstByteAt > 150,
    'a buffering stub would also eventually deliver these, so the gap is the assertion'
  )
})

test('the buffering toggle is handled locally and never forwarded', async t => {
  const up = await upstream((req, res) => {
    res.writeHead(200, { 'content-type': 'text/plain' })
    res.end(req.url)
  })
  t.after(() => up.close())
  const stub = await createStub({ upstream: up.url })
  t.after(() => stub.close())

  const toggled = await fetch(`${stub.baseUrl}/__stub/buffering?mode=on`)
  assert.equal(toggled.status, 200)
  // The upstream echoes the path back, so an echo here would mean it was forwarded.
  assert.match(await toggled.text(), /^buffering on$/m)

  const bad = await fetch(`${stub.baseUrl}/__stub/buffering`)
  assert.equal(bad.status, 400)
})

// A stub that never gives up would otherwise hang the run instead of failing it.
function within(promise, ms) {
  return Promise.race([promise, new Promise(resolve => setTimeout(() => resolve(null), ms))])
}

test('a response that never ends yields nothing downstream, then a destroyed socket', async t => {
  const up = await upstream((req, res) => {
    res.writeHead(200, { 'content-type': 'text/event-stream' })
    res.write('data: hello\n\n')
  })
  t.after(() => up.close())
  const stub = await createStub({ upstream: up.url, deadlineMs: 300, buffering: true })
  t.after(() => stub.close())

  const result = await within(get(`${stub.baseUrl}/`).done, 3000)

  assert.ok(result, 'the request was still open 3s after a 300ms deadline')
  assert.equal(result.response, null, 'not even the response headers may reach the client')
  assert.equal(Buffer.concat(result.chunks).length, 0)
  assert.ok(result.error, 'the socket is destroyed rather than left hanging')
  assert.ok(result.endedAt >= 250, `expected the destroy at the deadline, got ${result.endedAt}ms`)
})

test('a finite response is released whole, content-length delimited', async t => {
  const up = await upstream((req, res) => {
    // Two writes and no content-length, so the upstream response is chunked and the
    // stub has to replace that encoding rather than pass it on.
    res.writeHead(200, { 'content-type': 'text/plain' })
    res.write('one')
    res.end('two')
  })
  t.after(() => up.close())
  const stub = await createStub({ upstream: up.url, buffering: true })
  t.after(() => stub.close())

  const result = await get(`${stub.baseUrl}/`).done

  assert.equal(result.response.statusCode, 200)
  assert.equal(Buffer.concat(result.chunks).toString(), 'onetwo')
  assert.equal(result.response.headers['content-length'], '6')
  assert.equal(result.response.headers['transfer-encoding'], undefined)
})

test('the toggle changes the mode for subsequent requests', async t => {
  const up = await upstream((req, res) => {
    res.writeHead(200, { 'content-type': 'text/plain' })
    res.end('ok')
  })
  t.after(() => up.close())
  const stub = await createStub({ upstream: up.url })
  t.after(() => stub.close())

  const streamed = await get(`${stub.baseUrl}/x`).done
  assert.equal(streamed.response.headers['transfer-encoding'], 'chunked')

  await fetch(`${stub.baseUrl}/__stub/buffering?mode=on`)
  const buffered = await get(`${stub.baseUrl}/x`).done
  assert.equal(buffered.response.headers['transfer-encoding'], undefined)
  assert.equal(buffered.response.headers['content-length'], '2')
})

test('an upstream error answers 502 rather than hanging', async t => {
  const up = await upstream((req, res) => res.end())
  const dead = up.url
  await up.close()
  const stub = await createStub({ upstream: dead, buffering: true })
  t.after(() => stub.close())

  const result = await get(`${stub.baseUrl}/`).done

  assert.equal(result.response.statusCode, 502)
})

test('a downstream abort mid-buffer destroys the upstream request', async t => {
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
  t.after(() => up.close())
  const stub = await createStub({ upstream: up.url, deadlineMs: 5000, buffering: true })
  t.after(() => stub.close())

  const { req } = get(`${stub.baseUrl}/`)
  t.after(() => req.destroy())
  setTimeout(() => req.destroy(), 100)

  const timeout = new Promise(resolve => setTimeout(() => resolve(false), 2000))
  assert.equal(await Promise.race([aborted, timeout]), true)
})

test('pass-through does not leave the client hanging when upstream dies mid-body', async t => {
  const up = await upstream((req, res) => {
    res.writeHead(200, { 'content-type': 'text/event-stream' })
    res.write('data: first\n\n')
    setTimeout(() => res.socket.destroy(), 50)
  })
  t.after(() => up.close())
  const stub = await createStub({ upstream: up.url })
  t.after(() => stub.close())

  const result = await within(get(`${stub.baseUrl}/`).done, 3000)

  assert.ok(result, 'the downstream response never ended, so a real client would hang')
  assert.equal(Buffer.concat(result.chunks).toString(), 'data: first\n\n')
})

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

test('cut refuses an empty match rather than cutting every connection', async t => {
  const up = await upstream((req, res) => {
    res.writeHead(200, { 'content-type': 'text/plain' })
    res.end('ok')
  })
  t.after(() => up.close())
  const stub = await createStub({ upstream: up.url })
  t.after(() => stub.close())

  assert.throws(() => stub.cut(''), /non-empty cookie match/)
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
