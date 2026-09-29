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
  fetchPage: (url: string, init: RequestInit) => Promise<Response>
  // The page's window in the browser; the page listeners live here, not in main.tsx.
  events: EventTarget
  location: Pick<Location, 'assign' | 'reload' | 'replace'>
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
// Longer than a tick, so a slow link can still answer; a fetch hung on a proxy is abandoned.
export const FETCH_TIMEOUT_MS = 10_000
const initial: RoomStore = { lost: false, fatal: false, snapshot: null }

// The whole watchdog: a closed stream is never reopened but checked, and a silent one is reopened.
export function decide(
  readyState: number,
  heardAt: number,
  now: number,
  fetching: boolean
): 'fetch' | 'reopen' | 'nothing' {
  if (readyState === CLOSED) return fetching ? 'nothing' : 'fetch'
  return now - heardAt >= STALE_MS ? 'reopen' : 'nothing'
}

// Null for a frame that is not JSON or fails the schema, which the page treats alike.
function parse(data: string): RoomSnapshot | null {
  try {
    const parsed = snapshotSchema.safeParse(JSON.parse(data))
    if (parsed.success) return parsed.data
    console.error('Refused an invalid snapshot:', parsed.error)
  } catch (reason) {
    console.error('Refused a frame that is not JSON:', reason)
  }
  return null
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
  let fetching: AbortController | null = null
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
    fetching?.abort()
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
      const parsed = parse(event.data)
      if (parsed === null) {
        // A refusal: a page open across a wire change reloads onto the new build.
        closeStream()
        update({ lost: true })
        return
      }
      update({ snapshot: parsed, lost: false })
    }
    // CLOSED means an error answer the browser will not retry; the next tick checks the app.
    opened.onerror = event => {
      update({ lost: true })
      console.error('EventSource error observed:', event)
    }
  }

  // A 200 comes only from the running app, since a portal's redirect answers status 0 here.
  const check = async (id: string) => {
    const controller = new AbortController()
    fetching = controller
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
    try {
      const response = await deps.fetchPage(`/${id}`, {
        redirect: 'manual',
        signal: controller.signal
      })
      void response.body?.cancel()
      if (stopped || response.status !== 200) return
      // Reloading a page that never reached the room could loop on a refusal every load repeats.
      const reached = store.snapshot !== null
      stop()
      if (reached) deps.location.replace(`/${id}?restarted=1`)
      else update({ lost: false, fatal: true })
    } catch {
      // Down, offline or abandoned: the next tick fetches again.
    } finally {
      clearTimeout(timeout)
      fetching = null
    }
  }

  // Same connection id, so the server replaces the old stream, and a Join lands for each reopen.
  const watch = (id: string) => {
    const decision = decide(stream!.readyState, heardAt, Date.now(), fetching !== null)
    if (decision === 'fetch') void check(id)
    if (decision !== 'reopen') return
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
    if (!(event as PageTransitionEvent).persisted) return
    stop()
    deps.location.reload()
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
