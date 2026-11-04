// Voters that join a room and vote over the protocol, each holding its event stream open, so a
// case fills a room without a page per participant.

export const FIRST_FRAME_TIMEOUT_MS = 5000

// Anything but success fails the call, naming the request, so a room is never short a voter.
const check = (response, request, name) => {
  if (response.ok) return response
  response.body?.cancel().catch(() => {})
  throw new Error(`${request} for ${name} answered ${response.status}`)
}

const streamError = (name, what, cause) =>
  new Error(`the events stream of ${name} ${what}`, cause && { cause })

const join = async (baseUrl, room, name) => {
  const response = await fetch(`${baseUrl}/rooms/${room}/join`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name, role: 'Voter' })
  })
  check(response, `POST /rooms/${room}/join`, name)
  return response.headers
    .getSetCookie()
    .map(value => value.split(';')[0])
    .join('; ')
}

// The server sends the room's snapshot first, once the session is a member.
const firstFrame = async (baseUrl, room, name, cookie, signal) => {
  const url = `${baseUrl}/rooms/${room}/events?connectionId=${crypto.randomUUID()}`
  const response = await fetch(url, { headers: { cookie, accept: 'text/event-stream' }, signal })
    .catch(error => { throw streamError(name, 'failed', error) })
  check(response, `GET /rooms/${room}/events`, name)
  const reader = response.body.getReader()
  const { done } = await reader.read().catch(error => { throw streamError(name, 'failed', error) })
  if (done) throw streamError(name, 'ended before its first frame')
  return reader
}

// Read to the end, so the server's writes and heartbeats never fill an unread buffer.
const drain = async reader => {
  try {
    while (!(await reader.read()).done);
  } catch {
    // The abort of close() or of a failed call.
  }
}

const open = async (baseUrl, room, name, cookie, signal) => {
  let timer
  const silence = new Promise((_, reject) => {
    timer = setTimeout(
      () => reject(streamError(name, `sent nothing for ${FIRST_FRAME_TIMEOUT_MS}ms`)),
      FIRST_FRAME_TIMEOUT_MS
    )
  })
  try {
    drain(await Promise.race([firstFrame(baseUrl, room, name, cookie, signal), silence]))
  } finally {
    clearTimeout(timer)
  }
}

export async function joinVoters(baseUrl, room, names) {
  // Every join first, so a refused one leaves no stream open.
  const cookies = await Promise.all(names.map(name => join(baseUrl, room, name)))
  const controllers = names.map(() => new AbortController())
  const close = () => controllers.forEach(controller => controller.abort())
  try {
    await Promise.all(
      names.map((name, i) => open(baseUrl, room, name, cookies[i], controllers[i].signal))
    )
  } catch (error) {
    close()
    throw error
  }
  const voters = names.map((name, i) => ({
    name,
    vote: async value => {
      const response = await fetch(`${baseUrl}/rooms/${room}/vote`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', cookie: cookies[i] },
        body: JSON.stringify({ estimation: value })
      })
      check(response, `POST /rooms/${room}/vote`, name)
      await response.arrayBuffer()
    }
  }))
  return { voters, close }
}
