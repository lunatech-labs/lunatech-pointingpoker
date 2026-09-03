// Stands in for the customer's scanning proxy: forwards everything, and in buffering mode
// releases nothing downstream until the upstream response ends. See the 08-30 testkit design.
import http from 'node:http'
import { once } from 'node:events'
import { pathToFileURL } from 'node:url'

// How long the simulated appliance waits before giving up on a response it is still
// buffering. A probe measurement lands here as a change to this number, not as a rewrite.
export const DEADLINE_MS = 2000

// Hop-by-hop headers stripped from the upstream response before relaying it. transfer-encoding
// is also the one that buffering mode replaces with a content-length.
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
  if (target.protocol !== 'http:' || target.pathname !== '/') {
    throw new Error(`upstream must be a plain http origin with no path, got ${upstream}`)
  }
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

  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const { port } = server.address()

  return {
    port,
    // 127.0.0.1 rather than localhost, since the server binds that family only.
    baseUrl: `http://127.0.0.1:${port}`,
    deadlineMs,
    setBuffering(on) {
      state.buffering = Boolean(on)
    },
    // Stands in for an appliance that has killed one client's connections: destroys the live
    // ones carrying this cookie value and refuses new ones until restore().
    cut(match) {
      // An empty match is includes() in every cookie, cutting the whole stub instead of one session.
      if (!match) throw new Error(`cut() expected a non-empty cookie match, got ${JSON.stringify(match)}`)
      state.cuts.add(match)
      for (const entry of state.live) if (entry.cookie.includes(match)) entry.res.destroy()
    },
    restore(match) {
      if (match === undefined) state.cuts.clear()
      else state.cuts.delete(match)
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

function isCut(state, cookie) {
  for (const match of state.cuts) if (cookie.includes(match)) return true
  return false
}

function forwardStreaming(req, res, target) {
  const up = openUpstream(req, target)
  up.on('response', upRes => {
    res.writeHead(upRes.statusCode, relayHeaders(upRes.headers))
    // pipe does not forward source errors, and fail502 cannot help once headers are out.
    upRes.on('error', () => res.destroy())
    upRes.pipe(res)
  })
  up.on('error', () => fail502(res))
  res.on('close', () => up.destroy())
  req.pipe(up)
}

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
    upRes.on('error', () => {
      clearTimeout(deadline)
      res.destroy()
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
