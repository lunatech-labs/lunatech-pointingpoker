import { beforeEach, describe, expect, it, vi } from 'vitest'
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
  users: [{ id: 'a', name: 'Alice', voted: false, hasEstimation: false, estimation: '' }]
})

describe('createConnection', () => {
  let streams: FakeStream[]
  let beacons: string[]
  let events: EventTarget
  const connect = () =>
    createConnection({
      connectionId: 'c-1',
      openStream: url => {
        const s = new FakeStream(url)
        streams.push(s)
        return s
      },
      sendBeacon: url => void beacons.push(url),
      events
    })
  // Node has no PageTransitionEvent, so persisted rides a plain Event.
  const pageHide = (persisted: boolean) =>
    events.dispatchEvent(Object.assign(new Event('pagehide'), { persisted }))

  beforeEach(() => {
    streams = []
    beacons = []
    events = new EventTarget()
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  it('opens the room stream under the page connection id', () => {
    connect().open('brave-golden-otter')
    expect(streams.map(s => s.url)).toEqual(['/rooms/brave-golden-otter/events?connectionId=c-1'])
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

  it('closes the stream, then sends the leave beacon and forgets the room, on leave', () => {
    const c = connect()
    c.open('r')
    streams[0].message(frame)
    c.leave()
    expect(streams[0].closed).toBe(true)
    expect(beacons).toEqual(['/rooms/r/leave?connectionId=c-1'])
    expect(c.getSnapshot()).toEqual({ lost: false, fatal: false, snapshot: null })
  })

  it('sends the beacon on pagehide only for a discarded page that reached the room', () => {
    const c = connect()
    c.open('r')
    pageHide(false)
    expect(beacons).toEqual([])
    streams[0].message(frame)
    pageHide(true)
    expect(beacons).toEqual([])
    pageHide(false)
    expect(beacons).toEqual(['/rooms/r/leave?connectionId=c-1'])
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
