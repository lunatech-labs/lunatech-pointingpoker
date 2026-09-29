import type { JoinOutcome } from '../protocol/api'
import { snapshotSchema, type RoomSnapshot } from '../protocol/snapshot'

export type RoomStore = { lost: boolean; fatal: boolean; snapshot: RoomSnapshot | null }

// The slice of EventSource this module uses, so a test can hand it a fake.
export type Stream = {
  readonly readyState: number
  onopen: ((event: Event) => void) | null
  onmessage: ((event: MessageEvent<string>) => void) | null
  onerror: ((event: Event) => void) | null
  close(): void
}

export type ConnectionDeps = {
  connectionId: string
  join: (roomId: string, name: string) => Promise<JoinOutcome>
  openStream: (url: string) => Stream
  sendBeacon: (url: string) => void
  // The page's window in the browser; the page listeners live here, not in main.tsx.
  events: EventTarget
  location: Pick<Location, 'assign' | 'reload'>
}

// 'ignored': a join was already in flight or has succeeded, so the caller has nothing to show.
export type JoinResult = 'joined' | 'failed' | 'ignored'

export type Connection = {
  subscribe(listener: () => void): () => void
  getSnapshot(): RoomStore
  join(roomId: string, name: string): Promise<JoinResult>
  open(roomId: string): void
  leave(): void
}

const CLOSED = 2
// Twice SSE.heartbeatInterval (15 s) plus a margin, so one late heartbeat is not silence.
export const STALE_MS = 35_000
// The tick only samples the clock, so a throttled background tab delays a check but never skews it.
export const TICK_MS = 5_000
const initial: RoomStore = { lost: false, fatal: false, snapshot: null }

// The whole watchdog: a closed stream is never reopened, and a silent one is.
export function decide(readyState: number, heardAt: number, now: number): 'reopen' | 'nothing' {
  if (readyState === CLOSED) return 'nothing'
  return now - heardAt >= STALE_MS ? 'reopen' : 'nothing'
}

export function createConnection(deps: ConnectionDeps): Connection {
  let store = initial
  let roomId: string | null = null
  let stream: Stream | null = null
  let stopped = false
  let joining = false
  // Date.now rather than performance.now, which can pause while the system sleeps.
  let heardAt = 0
  let tick: ReturnType<typeof setInterval> | undefined
  const listeners = new Set<() => void>()

  // The same object between updates, since useSyncExternalStore re-renders on every new one.
  const update = (next: Partial<RoomStore>) => {
    store = { ...store, ...next }
    listeners.forEach(listener => listener())
  }

  // sendBeacon rather than a POST: an unload-adjacent fetch is not reliably delivered.
  const postLeave = (id: string) =>
    deps.sendBeacon(`/rooms/${id}/leave?connectionId=${deps.connectionId}`)

  // Detached as well as closed, so a late event from an old stream can change nothing.
  const closeStream = () => {
    if (stream === null) return
    stream.onopen = stream.onmessage = stream.onerror = null
    stream.close()
  }

  // What Leave, a reload and fatal do first, so nothing is left to run against a page load.
  const stop = () => {
    stopped = true
    clearInterval(tick)
    closeStream()
  }

  const connect = (id: string) => {
    const opened = deps.openStream(`/rooms/${id}/events?connectionId=${deps.connectionId}`)
    stream = opened
    heardAt = Date.now()
    // A successful (re)connection means any earlier banner from onerror is stale.
    opened.onopen = () => {
      heardAt = Date.now()
      update({ lost: false, fatal: false })
    }
    opened.onmessage = event => {
      heardAt = Date.now()
      // Keep-alive heartbeats arrive as an event with an empty data payload.
      if (!event.data) return
      const parsed = snapshotSchema.safeParse(JSON.parse(event.data))
      if (!parsed.success) {
        console.error('Dropped an invalid snapshot:', parsed.error)
        return
      }
      update({ snapshot: parsed.data })
    }
    // CLOSED means a non-2xx answer the browser will not retry; anything else it is retrying.
    opened.onerror = event => {
      if (opened.readyState === CLOSED) update({ lost: false, fatal: true })
      else update({ lost: true, fatal: false })
      console.error('EventSource error observed:', event)
    }
  }

  // Same connection id, so the server replaces the old stream, and a Join lands for each reopen.
  const watch = (id: string) => {
    if (decide(stream!.readyState, heardAt, Date.now()) !== 'reopen') return
    closeStream()
    connect(id)
    update({ lost: true })
  }

  // The first open on a page load wins, so nothing can open a second stream.
  const open = (id: string) => {
    if (roomId !== null || stopped) return
    roomId = id
    connect(id)
    tick = setInterval(() => watch(id), TICK_MS)
  }

  // Cached or not: a restored page reloads and rejoins, so the member must go either way.
  deps.events.addEventListener('pagehide', () => {
    if (stream !== null && stream.readyState !== CLOSED && roomId !== null) postLeave(roomId)
  })
  // A restore keeps the page's script state, so a fresh load is the one way back into a room.
  deps.events.addEventListener('pageshow', event => {
    if ((event as PageTransitionEvent).persisted) deps.location.reload()
  })

  return {
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    getSnapshot: () => store,

    // Two cookieless joins would each mint a session, and the second cookie replaces the first.
    async join(id, name) {
      if (joining || roomId !== null) return 'ignored'
      joining = true
      try {
        if ((await deps.join(id, name)) !== 'joined') return 'failed'
        open(id)
        return 'joined'
      } catch (reason) {
        console.error('Failed to join room:', reason)
        return 'failed'
      } finally {
        joining = false
      }
    },
    open,

    // Closed before the beacon, so pagehide cannot send it twice; a stopped page is already going.
    leave() {
      if (stopped || roomId === null) return
      stop()
      postLeave(roomId)
      deps.location.assign('/')
    }
  }
}
