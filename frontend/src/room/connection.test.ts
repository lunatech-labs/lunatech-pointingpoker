import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import type { JoinOutcome } from '../protocol/api'
import { createConnection, type Stream } from './connection'

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
  users: [{ id: 'a', name: 'Alice', estimation: { type: 'NoEstimation' } }]
})

describe('createConnection', () => {
  let streams: FakeStream[]
  let beacons: string[]
  let events: EventTarget
  let location: { assign: Mock<(url: string | URL) => void>; reload: Mock<() => void> }
  let join: Mock<(roomId: string, name: string) => Promise<JoinOutcome>>
  const connect = () =>
    createConnection({
      connectionId: 'c-1',
      join,
      openStream: url => {
        const s = new FakeStream(url)
        streams.push(s)
        return s
      },
      sendBeacon: url => void beacons.push(url),
      events,
      location
    })
  // Node has no PageTransitionEvent, so persisted rides a plain Event.
  const pageHide = (persisted: boolean) =>
    events.dispatchEvent(Object.assign(new Event('pagehide'), { persisted }))
  const pageShow = (persisted: boolean) =>
    events.dispatchEvent(Object.assign(new Event('pageshow'), { persisted }))

  beforeEach(() => {
    streams = []
    beacons = []
    events = new EventTarget()
    location = { assign: vi.fn(), reload: vi.fn() }
    join = vi.fn(() => Promise.resolve<JoinOutcome>('joined'))
    vi.spyOn(console, 'error').mockImplementation(() => {})
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

  it('stores a parsed snapshot, and ignores a heartbeat and an invalid frame', () => {
    const c = connect()
    c.open('r')
    streams[0].message(frame)
    const stored = c.getSnapshot()
    expect(stored.snapshot?.currentIssue).toBe('PP-1')
    streams[0].message('')
    streams[0].message('{"you":1}')
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

  it('marks a retrying stream lost and a closed one fatal, and clears both on open', () => {
    const c = connect()
    c.open('r')
    streams[0].error()
    expect(c.getSnapshot()).toMatchObject({ lost: true, fatal: false })
    streams[0].open()
    expect(c.getSnapshot()).toMatchObject({ lost: false, fatal: false })
    streams[0].readyState = 2
    streams[0].error()
    expect(c.getSnapshot()).toMatchObject({ lost: false, fatal: true })
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
    connect()
    pageShow(false)
    expect(location.reload).not.toHaveBeenCalled()
    pageShow(true)
    expect(location.reload).toHaveBeenCalledTimes(1)
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
})
