import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import type { JoinOutcome } from '../protocol/api'
import {
  createConnection,
  decide,
  FETCH_TIMEOUT_MS,
  STALE_MS,
  TICK_MS,
  type Stream
} from './connection'

class FakeStream implements Stream {
  readyState = 0
  onopen: ((event: Event) => void) | null = null
  onmessage: ((event: MessageEvent<string>) => void) | null = null
  onerror: ((event: Event) => void) | null = null
  closed = false
  constructor(readonly url: string) {}
  close() {
    this.closed = true
    this.readyState = 2
  }
  open = () => this.onopen!(new Event('open'))
  error = () => this.onerror!(new Event('error'))
  message = (data: string) => this.onmessage!(new MessageEvent('message', { data }))
}

const frame = JSON.stringify({
  you: 'a',
  currentIssue: 'PP-1',
  votesRevealed: false,
  users: [{ id: 'a', name: 'Alice', seat: { type: 'Voter', estimation: { type: 'NoEstimation' } } }]
})

describe('decide', () => {
  const CONNECTING = 0
  const OPEN = 1
  const CLOSED = 2
  it.each([
    [CONNECTING, STALE_MS - 1, false, 'nothing'],
    [CONNECTING, STALE_MS, false, 'reopen'],
    [OPEN, STALE_MS - 1, false, 'nothing'],
    [OPEN, STALE_MS, false, 'reopen'],
    [CLOSED, 0, false, 'fetch'],
    [CLOSED, STALE_MS, false, 'fetch'],
    [CLOSED, 0, true, 'nothing'],
    [CLOSED, STALE_MS, true, 'nothing']
  ])(
    'readyState %i, silent for %i ms, fetching %s: %s',
    (readyState, silence, fetching, expected) => {
      expect(decide(readyState, 1_000, 1_000 + silence, fetching)).toBe(expected)
    }
  )
})

describe('createConnection', () => {
  let streams: FakeStream[]
  // Whether another stream was still open as each one opened.
  let overlapped: boolean[]
  let beacons: string[]
  let events: EventTarget
  let location: {
    assign: Mock<(url: string | URL) => void>
    reload: Mock<() => void>
    replace: Mock<(url: string | URL) => void>
  }
  let fetchPage: Mock<(url: string, init: RequestInit) => Promise<Response>>
  let join: Mock<(roomId: string, name: string) => Promise<JoinOutcome>>
  const connect = () =>
    createConnection({
      connectionId: 'c-1',
      join,
      openStream: url => {
        const s = new FakeStream(url)
        overlapped.push(streams.some(other => !other.closed))
        streams.push(s)
        return s
      },
      sendBeacon: url => void beacons.push(url),
      fetchPage,
      events,
      location
    })
  const answer = (status: number) => Promise.resolve(new Response(null, { status }))
  // Node has no PageTransitionEvent, so persisted rides a plain Event.
  const pageHide = (persisted: boolean) =>
    events.dispatchEvent(Object.assign(new Event('pagehide'), { persisted }))
  const pageShow = (persisted: boolean) =>
    events.dispatchEvent(Object.assign(new Event('pageshow'), { persisted }))

  beforeEach(() => {
    streams = []
    overlapped = []
    beacons = []
    events = new EventTarget()
    location = { assign: vi.fn(), reload: vi.fn(), replace: vi.fn() }
    fetchPage = vi.fn(() => Promise.resolve(new Response(null, { status: 502 })))
    join = vi.fn(() => Promise.resolve<JoinOutcome>('joined'))
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('opens the room stream under the page connection id', () => {
    connect().open('brave-golden-otter')
    expect(streams.map(s => s.url)).toEqual(['/rooms/brave-golden-otter/events?connectionId=c-1'])
  })

  it('lets only the first join through, and opens the stream once it succeeds', async () => {
    let answer: (outcome: JoinOutcome) => void = () => {}
    join.mockReturnValueOnce(new Promise(resolve => (answer = resolve)))
    const c = connect()
    const first = c.join('r', 'Alice')
    // A double-clicked Join, or StrictMode's second effect, while the first is in flight.
    expect(await c.join('r', 'Alice')).toBe('ignored')
    answer('joined')
    expect(await first).toBe('joined')
    expect(await c.join('r', 'Alice')).toBe('ignored')
    expect(join).toHaveBeenCalledTimes(1)
    expect(streams).toHaveLength(1)
  })

  it('lets a join through again after a failed one', async () => {
    join.mockResolvedValueOnce('not-a-room').mockRejectedValueOnce(new Error('join answered 500'))
    const c = connect()
    expect(await c.join('r', 'Alice')).toBe('failed')
    expect(await c.join('r', 'Alice')).toBe('failed')
    expect(streams).toHaveLength(0)
    expect(await c.join('r', 'Alice')).toBe('joined')
    expect(streams).toHaveLength(1)
  })

  it('lets only the first open through', () => {
    const c = connect()
    c.open('r')
    c.open('r')
    expect(streams).toHaveLength(1)
  })

  it('stores a parsed snapshot, and ignores a heartbeat', () => {
    const c = connect()
    c.open('r')
    streams[0].message(frame)
    const stored = c.getSnapshot()
    expect(stored.snapshot?.currentIssue).toBe('PP-1')
    streams[0].message('')
    expect(c.getSnapshot()).toBe(stored)
  })

  // Client and server ship together, so this is a development safety net, not a protocol rule.
  it('keeps a snapshot carrying a field it does not know, without the field', () => {
    const c = connect()
    c.open('r')
    streams[0].message(JSON.stringify({ ...JSON.parse(frame), history: [] }))
    expect(c.getSnapshot().snapshot).toEqual(JSON.parse(frame))
  })

  it('returns the same store object until something changes', () => {
    const c = connect()
    expect(c.getSnapshot()).toBe(c.getSnapshot())
  })

  it('shows the banner on any error, and clears it on open or a valid snapshot', () => {
    const c = connect()
    c.open('r')
    streams[0].error()
    expect(c.getSnapshot()).toMatchObject({ lost: true, fatal: false })
    streams[0].open()
    expect(c.getSnapshot().lost).toBe(false)
    streams[0].error()
    streams[0].message(frame)
    expect(c.getSnapshot().lost).toBe(false)
    streams[0].readyState = 2
    streams[0].error()
    expect(c.getSnapshot()).toMatchObject({ lost: true, fatal: false })
  })

  it('closes and detaches the stream, sends the beacon and goes to the lobby, on leave', () => {
    const c = connect()
    c.open('r')
    streams[0].message(frame)
    c.leave()
    expect(streams[0].closed).toBe(true)
    expect(streams[0].onmessage).toBeNull()
    expect(beacons).toEqual(['/rooms/r/leave?connectionId=c-1'])
    expect(location.assign).toHaveBeenCalledWith('/')
    // Left on screen until the lobby loads, so a double-clicked Leave arrives here.
    c.leave()
    pageHide(false)
    expect(beacons).toHaveLength(1)
    expect(location.assign).toHaveBeenCalledTimes(1)
  })

  it('sends the beacon on pagehide while a stream is open, cached or not', () => {
    const c = connect()
    pageHide(false)
    expect(beacons).toEqual([])
    c.open('r')
    pageHide(true)
    streams[0].message(frame)
    pageHide(false)
    expect(beacons).toEqual(['/rooms/r/leave?connectionId=c-1', '/rooms/r/leave?connectionId=c-1'])
    streams[0].readyState = 2
    pageHide(false)
    expect(beacons).toHaveLength(2)
  })

  it('reloads a page restored from the back/forward cache, and only that', () => {
    const c = connect()
    c.open('r')
    streams[0].open()
    pageShow(false)
    expect(location.reload).not.toHaveBeenCalled()
    pageShow(true)
    expect(location.reload).toHaveBeenCalledTimes(1)
    // Stopped first, so the restored page's own tick cannot reopen before it navigates away.
    expect(streams[0].closed).toBe(true)
    vi.advanceTimersByTime(STALE_MS)
    expect(streams).toHaveLength(1)
  })

  it('notifies subscribers on a change and stops after unsubscribing', () => {
    const c = connect()
    const listener = vi.fn()
    const unsubscribe = c.subscribe(listener)
    c.open('r')
    streams[0].message(frame)
    expect(listener).toHaveBeenCalledTimes(1)
    unsubscribe()
    streams[0].error()
    expect(listener).toHaveBeenCalledTimes(1)
  })

  it('reopens a stream silent for 35 s, closing and detaching the old one first', () => {
    const c = connect()
    c.open('r')
    streams[0].open()
    streams[0].message(frame)
    vi.advanceTimersByTime(STALE_MS - 1)
    expect(streams).toHaveLength(1)
    vi.advanceTimersByTime(5_000)
    expect(streams).toHaveLength(2)
    expect(overlapped).toEqual([false, false])
    expect(streams[0].onmessage).toBeNull()
    expect(streams[1].url).toBe(streams[0].url)
    expect(c.getSnapshot().lost).toBe(true)
    streams[1].open()
    expect(c.getSnapshot().lost).toBe(false)
  })

  it('keeps a stream fresh past 35 s on heartbeats alone', () => {
    const c = connect()
    c.open('r')
    streams[0].open()
    for (let i = 0; i < 6; i++) {
      vi.advanceTimersByTime(15_000)
      streams[0].message('')
    }
    expect(streams).toHaveLength(1)
  })

  it('gives a reopened stream a full 35 s before judging it again', () => {
    connect().open('r')
    vi.advanceTimersByTime(STALE_MS)
    expect(streams).toHaveLength(2)
    vi.advanceTimersByTime(STALE_MS - 5_000)
    expect(streams).toHaveLength(2)
    vi.advanceTimersByTime(5_000)
    expect(streams).toHaveLength(3)
  })

  it('never reopens a closed stream, nor any stream once left', () => {
    const c = connect()
    c.open('r')
    streams[0].readyState = 2
    vi.advanceTimersByTime(2 * STALE_MS)
    expect(streams).toHaveLength(1)
    const d = connect()
    d.open('s')
    d.leave()
    vi.advanceTimersByTime(2 * STALE_MS)
    expect(streams).toHaveLength(2)
  })

  describe('a closed stream', () => {
    const streamRefused = (c: ReturnType<typeof connect>, reached: boolean) => {
      c.open('r')
      streams[0].open()
      if (reached) streams[0].message(frame)
      streams[0].readyState = 2
      streams[0].error()
    }

    it('reloads to the restart notice on a 200, having reached the room', async () => {
      fetchPage.mockReturnValueOnce(answer(200))
      const c = connect()
      streamRefused(c, true)
      await vi.advanceTimersByTimeAsync(TICK_MS)
      expect(fetchPage).toHaveBeenCalledWith('/r', expect.objectContaining({ redirect: 'manual' }))
      expect(location.replace).toHaveBeenCalledWith('/r?restarted=1')
      await vi.advanceTimersByTimeAsync(4 * TICK_MS)
      expect(fetchPage).toHaveBeenCalledTimes(1)
      expect(streams).toHaveLength(1)
    })

    it('shows the ended-session message instead, never having reached the room', async () => {
      fetchPage.mockReturnValueOnce(answer(200))
      const c = connect()
      streamRefused(c, false)
      await vi.advanceTimersByTimeAsync(TICK_MS)
      expect(location.replace).not.toHaveBeenCalled()
      expect(c.getSnapshot()).toMatchObject({ lost: false, fatal: true })
      await vi.advanceTimersByTimeAsync(4 * TICK_MS)
      expect(fetchPage).toHaveBeenCalledTimes(1)
    })

    it('fetches again on each tick, without reloading, while the app is down', async () => {
      fetchPage
        .mockReturnValueOnce(answer(502))
        .mockImplementationOnce(() => Promise.reject(new TypeError('Failed to fetch')))
        .mockReturnValueOnce(Promise.resolve(Response.error()))
      const c = connect()
      streamRefused(c, true)
      await vi.advanceTimersByTimeAsync(3 * TICK_MS)
      expect(fetchPage).toHaveBeenCalledTimes(3)
      expect(location.replace).not.toHaveBeenCalled()
      expect(c.getSnapshot()).toMatchObject({ lost: true, fatal: false })
    })

    it('runs one fetch at a time, and abandons a hung one after 10 s', async () => {
      const signals: AbortSignal[] = []
      fetchPage.mockImplementation((_url, init) => {
        signals.push(init.signal!)
        return new Promise((_resolve, reject) =>
          init.signal!.addEventListener('abort', () => reject(new DOMException('', 'AbortError')))
        )
      })
      streamRefused(connect(), true)
      await vi.advanceTimersByTimeAsync(TICK_MS + FETCH_TIMEOUT_MS - 1)
      expect(signals).toHaveLength(1)
      await vi.advanceTimersByTimeAsync(TICK_MS)
      expect(signals[0].aborted).toBe(true)
      expect(signals).toHaveLength(2)
    })

    it('takes the refusal path, banner on, for a frame failing to parse or validate', async () => {
      for (const bad of ['{"you":1}', 'not json']) {
        fetchPage.mockReturnValueOnce(answer(200))
        location.replace.mockClear()
        const c = connect()
        c.open('r')
        streams.at(-1)!.message(frame)
        streams.at(-1)!.message(bad)
        expect(streams.at(-1)!.closed).toBe(true)
        expect(c.getSnapshot().lost).toBe(true)
        await vi.advanceTimersByTimeAsync(TICK_MS)
        expect(location.replace).toHaveBeenCalledWith('/r?restarted=1')
      }
    })

    it('does not start a second fetch when the watchdog already has one in flight', async () => {
      fetchPage.mockImplementation(() => new Promise(() => {}))
      const c = connect()
      streamRefused(c, true)
      await vi.advanceTimersByTimeAsync(TICK_MS)
      expect(fetchPage).toHaveBeenCalledTimes(1)
      c.refused()
      await vi.advanceTimersByTimeAsync(0)
      expect(fetchPage).toHaveBeenCalledTimes(1)
    })

    it('aborts a fetch in flight on leave, and ignores its answer', async () => {
      let answered: (response: Response) => void = () => {}
      const signals: AbortSignal[] = []
      fetchPage.mockImplementationOnce((_url, init) => {
        signals.push(init.signal!)
        return new Promise(resolve => (answered = resolve))
      })
      const c = connect()
      streamRefused(c, true)
      await vi.advanceTimersByTimeAsync(TICK_MS)
      c.leave()
      expect(signals[0].aborted).toBe(true)
      answered(new Response(null, { status: 200 }))
      await vi.advanceTimersByTimeAsync(TICK_MS)
      expect(location.replace).not.toHaveBeenCalled()
      expect(location.assign).toHaveBeenCalledWith('/')
    })
  })

  describe('a command refusal', () => {
    it('takes the refusal path without waiting for the stream to go quiet', async () => {
      fetchPage.mockReturnValueOnce(answer(200))
      const c = connect()
      c.open('r')
      streams[0].open()
      streams[0].message(frame)
      c.refused()
      expect(c.getSnapshot()).toMatchObject({ lost: true, fatal: false })
      await vi.advanceTimersByTimeAsync(0)
      expect(fetchPage).toHaveBeenCalledWith('/r', expect.objectContaining({ redirect: 'manual' }))
      expect(location.replace).toHaveBeenCalledWith('/r?restarted=1')
      // The stream itself never closed or errored; refused() alone drove the recovery.
      expect(streams).toHaveLength(1)
    })

    it('runs at most one fetch under two back-to-back refusals', async () => {
      fetchPage.mockReturnValueOnce(answer(200))
      const c = connect()
      c.open('r')
      streams[0].open()
      streams[0].message(frame)
      c.refused()
      c.refused()
      await vi.advanceTimersByTimeAsync(0)
      expect(fetchPage).toHaveBeenCalledTimes(1)
    })

    it('does nothing once stopped or before a room is open', async () => {
      const c = connect()
      c.refused()
      expect(fetchPage).not.toHaveBeenCalled()
      c.open('r')
      streams[0].open()
      c.leave()
      c.refused()
      await vi.advanceTimersByTimeAsync(0)
      expect(fetchPage).not.toHaveBeenCalled()
    })
  })
})
