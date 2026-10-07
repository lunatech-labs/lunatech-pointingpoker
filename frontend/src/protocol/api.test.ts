import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  ApiError,
  command,
  createRoom,
  editIssue,
  isSessionRefusal,
  join,
  REQUEST_TIMEOUT_MS,
  switchRole,
  vote
} from './api'

// Installed before the import, since createClient captures fetch and Request once.
const fetchMock = vi.hoisted(() => {
  // Node's Request refuses the page's relative paths, so resolve them against a stand-in origin.
  const Native = globalThis.Request
  globalThis.Request = class extends Native {
    constructor(input: RequestInfo | URL, init?: RequestInit) {
      super(typeof input === 'string' ? new URL(input, 'http://page.test') : input, init)
    }
  }
  const mock = vi.fn<(request: Request, init?: RequestInit) => Promise<Response>>()
  vi.stubGlobal('fetch', mock)
  return mock
})

// Rejects once the request aborts, as fetch does for a request or a body in flight.
const onAbort = (signal: AbortSignal, reject: (reason: unknown) => void) =>
  signal.addEventListener('abort', () => reject(signal.reason))

// Never answers, as a hung proxy does.
const hung = (request: Request, init?: RequestInit) =>
  new Promise<Response>((_, reject) => onAbort(init?.signal ?? request.signal, reject))

// Answers a 401's headers, then never finishes its body.
const stalled = async (request: Request, init?: RequestInit) => {
  const signal = init?.signal ?? request.signal
  const body = new ReadableStream({ start: stream => onAbort(signal, e => stream.error(e)) })
  return new Response(body, { status: 401 })
}

// How a request stands 1 ms before the bound and at it.
async function outcome(call: () => Promise<unknown>) {
  const settled = call().then(
    () => 'resolved',
    (reason: unknown) => (reason instanceof DOMException ? reason.name : 'other')
  )
  const now = () => Promise.race([settled, Promise.resolve('pending')])
  await vi.advanceTimersByTimeAsync(REQUEST_TIMEOUT_MS - 1)
  const early = await now()
  await vi.advanceTimersByTimeAsync(1)
  return [early, await now()]
}

afterEach(() => {
  vi.useRealTimers()
  fetchMock.mockReset()
})

describe('isSessionRefusal', () => {
  it('holds for a 401 only', () => {
    expect(isSessionRefusal(new ApiError('vote', 401))).toBe(true)
    expect(isSessionRefusal(new ApiError('vote', 403))).toBe(false)
    expect(isSessionRefusal(new ApiError('vote', 409))).toBe(false)
    expect(isSessionRefusal(new Error('vote answered 401'))).toBe(false)
    expect(isSessionRefusal(new TypeError('Failed to fetch'))).toBe(false)
  })
})

// Every exported request, so one that drops its signal fails here.
const requests = {
  createRoom: () => createRoom(),
  join: () => join('brave-golden-otter', 'Alice', 'Facilitator'),
  command: () => command('brave-golden-otter', 'show'),
  vote: () => vote('brave-golden-otter', '3'),
  switchRole: () => switchRole('brave-golden-otter', 'Facilitator'),
  editIssue: () => editIssue('brave-golden-otter', 'PP-1')
}

describe('a role', () => {
  it.each([
    ['join', requests.join, { name: 'Alice', role: 'Facilitator' }],
    ['switchRole', requests.switchRole, { role: 'Facilitator' }]
  ])('is sent in the body of %s', async (_, call, body) => {
    fetchMock.mockImplementation(async () => new Response(null, { status: 204 }))
    await call()
    expect(await fetchMock.mock.calls[0][0].json()).toEqual(body)
  })
})

describe('a request', () => {
  it.each(Object.entries(requests))('fails once unanswered for 10 s: %s', async (_, call) => {
    vi.useFakeTimers()
    fetchMock.mockImplementation(hung)
    expect(await outcome(call)).toEqual(['pending', 'AbortError'])
  })

  it('fails once its body stalls for 10 s', async () => {
    vi.useFakeTimers()
    fetchMock.mockImplementation(stalled)
    expect(await outcome(requests.editIssue)).toEqual(['pending', 'AbortError'])
  })

  it('leaves no timer behind once answered', async () => {
    vi.useFakeTimers()
    fetchMock.mockImplementation(async () => new Response(null, { status: 204 }))
    await editIssue('brave-golden-otter', 'PP-1')
    expect(vi.getTimerCount()).toBe(0)
  })
})
