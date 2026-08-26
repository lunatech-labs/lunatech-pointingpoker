# SSE Delta Resync and Buffering-Proxy Fallback

Date: 2026-08-26
Status: Proposed

## Purpose

Fixes SSE connectivity for a customer whose network path includes an
antivirus-scanning proxy that buffers the entire HTTP response before
releasing anything, times out after 45 seconds, and delivers nothing (not
even headers) to the browser for a stream that never completes. A whitelist
request is in progress with that customer's administrators but may take
time or be rejected, so this is a code-side mitigation to run in parallel.

This also pulls forward "Option 2" from
`docs/superpowers/specs/2026-08-24-sse-backpressure-design.md` (sequence
numbers + `Last-Event-ID` resumption), which that spec deliberately deferred
to Phase 4 ("the prerequisite for trustworthy server-authoritative
auto-reveal... revisit specifically when that work starts"). It is being
pulled forward now because the buffering-proxy fallback needs gapless,
precise resumption to work at all, not just as a nice-to-have; see
"Why bounded reconnects need this" below.

## Problem

### The proxy issue

The proxy in front of this customer's network buffers the complete response
body before forwarding anything (this is how antivirus content scanning
generally works: it can't clear partial content, it needs the whole file).
Since today's SSE stream never completes, the proxy never releases
anything, and kills the connection at its own 45-second timeout with zero
bytes delivered, no headers, no data, no heartbeats. The existing 15-second
`ServerSentEvent.heartbeat` (`sse/SSE.scala:29-34`) is irrelevant here, it
never reaches the browser either.

### Why bounded reconnects need this

Ending the stream after a bounded duration (well under 45s) forces the
proxy to see a complete, finite response it can scan and release, which
solves connectivity. But because the proxy withholds everything until the
response completes, *nothing* is delivered live during an open window,
an event sitting in an otherwise-open connection only reaches the client
once that connection closes. The only way to keep per-event latency low is
to close the connection again shortly after an event happens, rather than
waiting out a fixed window regardless of activity (see section 6). That
means a connection may need to cycle far more often than once per 20-30s
during an active stretch, close to once per event in the worst case, so
each cycle's resync cost has to be cheap and precise. A full room-state
replay on every such cycle is not viable at that frequency. That's what
makes delta resync (this spec) a prerequisite for the bounded fallback, not
an independent enhancement bolted on next to it.

### Why full-resync-on-every-reconnect isn't safe either

Investigating this surfaced two latent correctness gaps in the *existing*
reconnect path (already live in production since the 08-24 backpressure
fix, independent of anything proposed here):

1. `index.html`'s `init`/`join` handlers (`index.html:403-419`) push
   unconditionally (`join` only guards against pushing the client's own id
   twice). A reconnecting client whose `EventSource` recovers *transparently*
   (the browser's native auto-reconnect on the same JS object, no `doJoin()`
   rerun, so `ref.users` is never reset) receives another full
   `setupNewUser` replay and duplicates every already-known participant.
2. The same replay never removes a participant who left *during* the gap,
   since `setupNewUser` (`Room.scala:262-274`) only lists currently-present
   users, it never says who's gone. A client that missed a departure has no
   signal to prune it.

Both are latent today, rare because they need an actual reconnect
(currently only buffer overflow) to trigger. Turning reconnects into a
routine ~20-30s cycle for affected clients would make both routine instead
of rare.

## Approaches considered

**1. In-memory log embedded in `Room`'s existing state (chosen).** Extend
`RoomData` with a monotonic sequence counter and a time-windowed event log,
alongside the state it already owns (`users`, `currentIssue`,
`pendingSessions`). No new actor, no new dependency, consistent with the
existing pattern of `Room` owning all of its own state directly, and
consistent with today's in-memory-only room lifecycle (durability is
explicitly Phase 2, unscheduled, independent work).

**2. Durable/persisted event log (Pekko Persistence or a database table).**
Rejected for this spec. Would survive process restarts and could feed
Phase 2's durable-sessions work, but introduces an infrastructure
dependency that doesn't exist anywhere in this app today, and bundles this
proxy workaround with a larger, explicitly independent roadmap phase. If
Phase 2 durability lands later, the wire protocol here (sequence ids,
`Last-Event-ID`) doesn't need to change, only where the log physically
lives, so choosing option 1 now doesn't foreclose option 2 later.

**3. A separate per-room "EventLog" actor, decoupled from `Room`.**
Rejected. Adds an actor to spawn/watch/terminate per room and an extra
actor-hop on every broadcast and every replay query, to split out a small
amount of state from an actor that already centralizes everything else
about the room. No benefit at this app's scale (low event volume, short
sessions) to offset the added complexity.

## Final design

### 1. Wire format: sequence ids

`RoomEvent` gains a monotonic `id: Long` (per room). SSE frames already
carry `data:`/`retry:`; add the native SSE `id:` field, since that's what
makes the browser's `EventSource` automatically send `Last-Event-ID` on any
reconnect, no custom header or query param needed for this part. Message
shape (`messageType`/`extra`) and every existing handler in `index.html` is
unchanged.

### 2. Room-side event log and retention

`RoomData` gains `sequence: Long` (starts at 0) and
`eventLog: Vector[(Long, Instant, RoomEvent)]`. Every call to `broadcast`
appends to the log (after assigning the next sequence id) before sending.
On each append, prune entries older than the retention window.

**`sequence = 0` means "nothing logged yet", not "the first event is id
0".** Worth spelling out since it's easy to misread otherwise: `Room.Join`
(`Room.scala:124-133`) calls `setupNewUser` (the resync batch, using
`sequence` as-is) *before* `broadcast` (the only thing that increments
`sequence`), for every join, including a room's very first. So the first
person into an empty room gets `Reset(id=0)` + their own resync batch at
the pre-broadcast baseline, then separately receives their own ordinary
`Join` broadcast at `id=1`, the room's actual first log entry. This isn't
special-cased for the bootstrap case, it falls out of the existing call
order holding for every join, first or hundredth.

**Retention: a 5-minute time window only, no count-based cap, no
ack-based compaction.** Considered and rejected: pruning an event once
every currently-connected client has already passed it (tracking a live
per-connection delivery cursor). Correct in principle, but this app's event
volume (a handful of participants, occasional votes/joins/leaves/edits,
30-60 minute sessions) means even a generous 5-minute window holds at most
a few dozen to low hundreds of small events, genuinely negligible memory
regardless of eviction strategy. The added state (a live cursor per
connected user, updated on every send) and edge cases aren't justified by
the memory it would save. If a client's gap exceeds 5 minutes, it falls
back to a full resync, the existing self-heal path, not a new failure mode.

### 3. Connection-time resolution

On connect, the route reads the `Last-Event-ID` header (sent automatically
by `EventSource` on any reconnect once the server emits `id:` fields).
Three cases, resolved against the room's `eventLog`:

- **No `Last-Event-ID` (first-ever connection):** today's full resync
  (`setupNewUser`), unchanged, preceded by a `Reset` message (see 4) and
  tagged with the room's current `sequence` as the client's new baseline.
- **`Last-Event-ID` present and still within the log:** reply with exactly
  the events after that id, a precise delta. No `Reset`, no full roster
  replay, this is the common case for a bounded client's routine
  reconnects.
- **`Last-Event-ID` present but older than the log's retention:** full
  resync, same as the first-connection case (with `Reset`), this is the
  existing self-heal fallback, not new.

### 4. Client fix, self: `Reset` before any full resync

A new message type, `Reset` (not `Clear`, that name is taken by vote
clearing and means something different), sent as the first element of the
batch immediately before any full-resync burst (both cases in section 3
that aren't a delta). Client handler: on `Reset`, clear local
room-participant state (`ref.users = []`) before applying what follows.
Harmless on a first connection (clearing an empty list). This fixes both
latent gaps in "Why full-resync-on-every-reconnect isn't safe either"
above, by construction: starting from empty makes duplication impossible,
and a departed participant simply isn't re-added, no separate removal
signal needed. This is a full replacement for defensive/idempotent handler
guards, not an addition to them, the reconnecting client's own state is
always rebuilt from an authoritative snapshot, never patched.

**What id `Reset` carries.** `Reset` is not itself a room event: it's
generated fresh per-connection at resolution time, not appended to
`eventLog`, and doesn't consume a new sequence number. Its SSE `id:` field
is a *read* of the room's current `sequence` (e.g. 12 if 12 real events
have been logged so far), establishing the client's new baseline, not an
increment of it. Every frame in the resync burst that follows (`Reset`,
`Init`, replayed `Join`/`Vote`, `EditIssue`) carries that same `id: 12`,
repeated rather than incrementing, since they're a reconstructed view of
current state, not new log entries. Repeating it on every frame, rather
than relying on the SSE spec's "the last-event-id buffer carries forward
across frames that omit `id:`" behavior, keeps the invariant locally
obvious on each frame instead of depending on that subtler spec detail.
The client's next reconnect then correctly requests everything after 12,
a genuine delta from exactly that point.

### 5. Client fix, others: suppress the `Join` broadcast on resume

Distinct problem from section 4: bystanders (other already-connected
clients) receive `Join`/etc. via their own live/delta stream, which never
gets a `Reset` (deltas are pure incremental application). Since every
reconnect, resume or genuinely new, currently triggers `Room.Join` and an
unconditional broadcast (`Room.scala:124-133`), a resuming client's routine
~20-30s reconnect cycle would otherwise broadcast a redundant `Join` to
everyone else every cycle, duplicating that participant in every
bystander's list (their `join` handler only guards against pushing the
client's own id, `index.html:412`).

Fix: in `Room.Join`, if `data.users` already contains this `userId` (a
resume, not a genuine arrival), skip the broadcast and skip logging it,
since nothing actually changed from the room's perspective. Only a
genuinely new `userId` broadcasts and gets logged. This is safe now in a
way it wasn't when first considered earlier in this design process: the
resuming client's own correct state no longer depends on receiving its own
`Join` broadcast, that's entirely owned by the delta/full-resync resolution
in section 3, so suppressing the broadcast can't cause the resuming client
to miss anything about itself or others.

### 6. Bounded/long-poll fallback for proxy-detected clients

Client-side (`index.html`'s `doJoin`):

- Open `EventSource` unbounded, as today, by default.
- Start a 5-second timer on open (a plain JS constant, not configurable).
  This detection only ever runs on this first connection of a fresh page
  load, which always has no `Last-Event-ID` yet, so per section 3 it always
  gets an immediate `Reset` + full-resync burst, meaning the timer only has
  to detect "did the connection open at all," not "did some arbitrary
  future event occur." A later bounded reconnect within the same page
  instance skips detection entirely (see below) and may legitimately wait
  out an empty delta, so this timer is never armed for those. Any message,
  including a heartbeat, clears it.
- If the timer fires with nothing received: close that connection, mark an
  in-memory `sseBounded = true` for this page instance (not persisted to
  `sessionStorage`/`localStorage`, a fresh page load always re-detects),
  and manually open a new `EventSource` with `?bounded=1`. This is the
  *only* manually-driven reconnect in this design, needed because the URL
  itself changes.
- Every reconnect after that, every scheduled bounded close and any
  ordinary drop, is handled by the browser's own native `EventSource`
  auto-reconnect on that same object, not further custom JS: same URL, so
  `retry`/`Last-Event-ID` are applied automatically per the SSE spec. This
  matters beyond simplicity: it guarantees at most one connection open per
  client at any time, so there's never a window where an old,
  still-closing connection and a newly opened one could overlap and
  deliver events out of order. The one manual switch above is exempt from
  that concern for a different reason: by construction nothing was ever
  received on the unbounded connection it replaces (that's the detection
  signal itself), so there's no prior `Last-Event-ID` to lose or race
  against.

Server-side (`SSE.scala`/`API.scala`):

- The route accepts an optional `bounded` query param.
- When present, the connection resolves `Last-Event-ID` immediately per
  section 3, then behaves adaptively rather than on a pure fixed timer,
  since the proxy withholds everything until close regardless of when
  during the window an event happened, so closing sooner whenever there's
  something to deliver directly lowers worst-case latency instead of always
  paying the full window:
  - If the resolution is non-empty (a delta with content, or a
    first-connection/stale-cursor full resync with `Reset`): send it, hold
    the connection open for a short flush window (about 1 second, a plain
    constant, not configurable) to catch near-simultaneous follow-up events
    (e.g. two or three people voting within the same second) into the same
    batch, then close.
  - If the resolution is empty (nothing missed, the common case for a
    client reconnecting promptly with nothing new): stay open, waiting for
    either a new event, which triggers the same send-then-flush-then-close
    above, or the wall-clock cap (base 20s + 0-10s jitter, so clients don't
    cycle in lockstep) elapsing with nothing new, in which case it closes
    anyway with no data, purely to stay safely under the proxy's 45s limit,
    and the client reconnects with the same `Last-Event-ID` since nothing
    changed.
  - Note the wall-clock cap is still required even though most cycles end
    early on an event, since a genuinely idle room must still self-close
    before 45s, otherwise it's exactly today's failure, the proxy killing
    an open-ended stream with nothing delivered.
- **The existing 15-second `.keepAlive` heartbeat (`SSE.scala:29-34,69`) is
  not applied to bounded connections.** Its only purpose is keeping a
  connection alive under Pekko's 60-second idle-timeout, and a bounded
  connection's own wall-clock cap (20-30s) already stays well under that,
  so the failure it exists to prevent can't happen here regardless. Applying
  it unchanged would actively break the intended timing: a heartbeat is not
  a `RoomEvent` and carries no `id:`, but if the adaptive close logic above
  treated its arrival as "something to flush" (the natural default if this
  isn't handled deliberately), every idle bounded connection would close
  at a fixed ~15s + the 1s flush window, not the intended jittered
  20-30s, silently defeating the jitter's purpose of keeping clients from
  cycling in lockstep. Unbounded connections keep `.keepAlive` exactly as
  today, unchanged, they still need it.
- When absent, behavior is unchanged, unbounded, exactly as today.
- Configurable via env var following the existing `SseConfig` pattern
  (e.g. `SSE_BOUNDED_DURATION`, default 20s base for the wall-clock cap).
- No `Room`/`RoomManager` structural changes needed beyond sections 1-5,
  the bounded path is just a client-driven reconnect cadence riding on the
  same delta-resync mechanism every client uses.

### 7. Bundled fix: buffering-proxy headers

Add `Cache-Control: no-cache` and `X-Accel-Buffering: no` to the SSE
response, closing the existing `docs/known-issues.md` entry "SSE
reverse-proxy buffering is undocumented." This will not fix the specific
antivirus-scanning proxy this spec targets (it buffers by design,
irrespective of such hints), but it's a cheap, already-flagged, unrelated
gap worth closing alongside a deployment-relevant change to this same code
path.

## What was deferred or rejected

- **Ack-based log compaction** (section 2): rejected, negligible benefit at
  this app's scale versus the added per-connection cursor-tracking state.
- **Durable/persisted event log**: deferred to whenever Phase 2 durable
  sessions work begins; not needed for this problem, and the wire protocol
  here doesn't require revisiting when that happens.
- **A separate EventLog actor**: rejected, no benefit over embedding in
  `RoomData` at this scale.
- **Client-side idempotency guards on `init`/`join`**: superseded by the
  `Reset` design (section 4), which is strictly more correct (it also
  handles departed-participant removal, which pure idempotency would not)
  and simpler to reason about.
- **Replaying "are votes currently revealed" state on resync**: not
  addressed here. `setupNewUser` today has no equivalent of a `Show` replay,
  a resyncing client has no way to know if votes are currently revealed.
  Pre-existing, unrelated to this design, not worsened by it. Logged in
  `docs/known-issues.md`.

## Testing

Extends the existing `RoomSpec`/`SSESpec`/`BackpressureReconnectSpec`
pattern (see `docs/superpowers/specs/2026-08-24-sse-backpressure-design.md`
for the established style):

- Event log append and 5-minute pruning.
- Delta replay for a valid `Last-Event-ID`.
- Full-resync fallback (with `Reset`) for a stale or absent `Last-Event-ID`.
- `Reset` followed by full replay produces no duplicates and correctly
  drops a participant who left during the gap.
- `Join` broadcast suppression on resume: a resuming client's reconnect
  produces no `Join` event for bystanders; a genuinely new participant
  still does.
- The bounded path's adaptive completion: closes after the flush window
  when an event is available (including batching near-simultaneous
  events into one delta), and closes at the wall-clock cap when nothing
  happened.
- A bounded, idle connection does not receive `.keepAlive` heartbeats and
  closes at the jittered wall-clock cap (20-30s), not at ~15s+1s; an
  unbounded connection still receives heartbeats unchanged.
- An end-to-end case (mirroring `BackpressureReconnectSpec`) proving a vote
  landing exactly in a bounded client's reconnect gap is delivered via the
  next delta, not lost, closing the "vote4" question raised during this
  design's review.
