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
  openStream: (url: string) => Stream
  sendBeacon: (url: string) => void
  // The page's window in the browser; the page listeners live here, not in main.tsx.
  events: EventTarget
  location: Pick<Location, 'assign' | 'reload'>
}

export type Connection = {
  subscribe(listener: () => void): () => void
  getSnapshot(): RoomStore
  open(roomId: string): void
  leave(): void
}

const CLOSED = 2
const initial: RoomStore = { lost: false, fatal: false, snapshot: null }

export function createConnection(deps: ConnectionDeps): Connection {
  let store = initial
  let roomId: string | null = null
  let stream: Stream | null = null
  let stopped = false
  const listeners = new Set<() => void>()

  // The same object between updates, since useSyncExternalStore re-renders on every new one.
  const update = (next: Partial<RoomStore>) => {
    store = { ...store, ...next }
    listeners.forEach(listener => listener())
  }

  // sendBeacon rather than a POST: an unload-adjacent fetch is not reliably delivered.
  const postLeave = (id: string) =>
    deps.sendBeacon(`/rooms/${id}/leave?connectionId=${deps.connectionId}`)

  // What Leave, a reload and fatal do first, so nothing is left to run against a page load.
  const stop = () => {
    stopped = true
    if (stream === null) return
    stream.onopen = stream.onmessage = stream.onerror = null
    stream.close()
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

    // Step 8a closes the previous stream first; this port does not yet.
    open(id) {
      roomId = id
      const opened = deps.openStream(`/rooms/${id}/events?connectionId=${deps.connectionId}`)
      stream = opened
      // A successful (re)connection means any earlier banner from onerror is stale.
      opened.onopen = () => update({ lost: false, fatal: false })
      opened.onmessage = event => {
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
    },

    // Closed before the beacon, so pagehide cannot send it twice; a stopped page is already going.
    leave() {
      if (stopped || roomId === null) return
      stop()
      postLeave(roomId)
      deps.location.assign('/')
    }
  }
}
