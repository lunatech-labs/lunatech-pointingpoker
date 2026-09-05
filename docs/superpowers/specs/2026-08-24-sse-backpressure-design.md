# SSE Backpressure and Reconnect Hygiene

Date: 2026-08-24
Status: Implemented, decisions since superseded; see the "Disposition of
existing specs" table in `2026-08-31-protocol-target-architecture-design.md`.
This is a retrospective record, not a pre-implementation plan: the change was
scoped and approved incrementally in conversation rather
than through the spec-first process used for larger work, since it modified
existing code in two files rather than introducing a new subsystem. It's
written down after the fact because the investigation produced several
non-obvious, empirically-confirmed facts about how Pekko's `Source.actorRef`
actually behaves, facts that are easy to silently undo (for example
"simplifying" the buffer size back to 0) without understanding why they
matter.

## Purpose

This resolves the "SSE broadcasts can be silently dropped under backpressure"
entry that lived in `docs/known-issues.md`, and checks the corresponding item
in Phase 4 of `docs/roadmap.md`.

## The problem

`sse/SSE.scala` broadcasts every `Vote`/`Show`/`Clear`/`Join`/`Leave`/
`EditIssue` event to each connected participant's outbound SSE stream through
a `Source.actorRef` with a zero-size buffer and `OverflowStrategy.dropTail`.
If the downstream write isn't immediately ready (a momentary network stall, a
slow client, a full socket buffer), the event is silently discarded. The
stream itself never fails, so nothing tells the client it missed anything;
the SSE connection looks healthy while quietly drifting out of sync with
server state. The only existing recovery path is `Room.scala`'s
`setupNewUser`, which replays full state on every *new* connection, but a
silent drop never triggers a reconnect on its own, so nothing invokes that
path.

### Severity calibration: the UI has no optimistic updates

`index.html`'s `onmessage` handler is the only place `votesRevealed`,
`users`, and vote state ever get written; every button click just POSTs and
waits for the SSE echo, including for the user who took the action. That
means a dropped broadcast is self-revealing even to the person who clicked
`Show`/`Vote`, not just to bystanders. This was a useful, if imperfect,
signal that the steady-state single-event drop (ordinary backpressure on an
already-open connection) is probably rare in practice at this app's actual
scale, since nobody had reported "I click and nothing happens." It does not
by itself rule out the bug, and it doesn't cover the join-replay burst below,
which manifests differently (an incomplete initial roster on join, easy to
mistake for normal load lag rather than a bug).

## Options considered for the core delivery problem

**Option 1 (chosen): fail fast, rely on the existing full-state resync.**
Change the overflow behavior so a dropped event ends that client's stream
instead of vanishing silently. The browser's `EventSource` auto-reconnects on
a failed stream, which re-triggers `Room.Join` and the existing
`setupNewUser` replay. Small, localized, no new protocol. Trade-off: the
`RoomManager.ConnectionFailure` path already treats a failed stream exactly
like `Room.Leave`, so an overflow on one client's connection would, without
further work, cause a visible "so-and-so left, then rejoined" flicker for
every other participant, not just the affected client. The grace-period fix
below exists specifically to close that gap.

A true backpressure mechanism, `Source.queue` with `OverflowStrategy.backpressure`
instead of `Source.actorRef`, was not seriously considered as an alternative to
fail-fast, for a structural reason rather than an oversight: `Room.broadcast`
sends to every participant from inside the `Room` actor's own synchronous message
processing (`user.ref ! List(message)`, fire-and-forget). Backpressure would mean
`Room` either blocking on a slow participant's queue-offer future before moving on
to its next message, or restructuring broadcast into an async operation, both
worse for this app than letting one slow client fail and resync while the rest of
the room proceeds unaffected. Fail-fast is not a compromise version of real
backpressure here; it is the better fit for a fan-out from a single-threaded actor.

**Option 2 (deferred): sequence numbers + `Last-Event-ID` resumption.**
Attach a monotonic sequence number to each event, read the `Last-Event-ID`
header on reconnect, and replay only the missed events from a short
in-memory buffer instead of a full resync. More reliable (no room-wide
Leave/Join flicker, sends only the delta, gives real observability into how
often drops happen) but meaningfully more machinery: a sequence field on
`RoomEvent`, a per-room replay buffer with its own retention policy, and
`SSE.scala` reading `Last-Event-ID` instead of using plain
`Source.actorRef`. The roadmap already names this as the prerequisite for
trustworthy server-authoritative auto-reveal (Phase 4), so it isn't wasted
scope, it's just not needed yet. Revisit specifically when that work starts,
since that's the point reliable delivery becomes load-bearing rather than
merely nice-to-have.

There's a second reason to revisit this beyond that trigger. The batching fix
below removes the burst at *arrival* (a join replay is one buffer slot, not
one per event), but a slow client can still be mid-drain of a large replay
list - `mapConcat` unpacks it downstream one frame at a time, only pulling the
next buffered element once that unpacking finishes - and the buffer (sized 1)
tolerates only one more broadcast arriving during that drain before failing
the stream. A bigger room means both a bigger list to drain and more
concurrent activity likely to land during the drain window, so a slow client
joining a large, active room could hit a fail-reconnect-fail loop, fetching
the same large replay each time. This is bounded (it self-heals, and no data
is lost) rather than a correctness bug, so it doesn't change the fail-fast
decision above, but it means the "no longer room-size-scaling" claim below
only fully holds once delta resync replaces full-replay-on-reconnect - i.e.
this option, not a tweak to the buffer or batching here.

## The join-replay burst: a second, separate problem

While sizing the buffer for Option 1, a second, unrelated risk surfaced:
`setupNewUser` sends `Init` + optional `EditIssue` + `Join`/`Vote` per
existing user as separate individual sends, all fired synchronously the
instant a new connection is wired up. For a room with N existing members,
that's roughly `2N + 2` messages competing for a zero-size buffer at the
exact moment demand may not yet be established, an O(N) burst tied to room
size, independent of ordinary network backpressure. Three alternatives were
weighed:

1. **Aggregate into one richer "snapshot" message.** Kills the burst, but
   requires a new wire message shape (a list of users/votes rather than
   `RoomEvent`'s flat `(messageType, roomId, userId, extra)`) and a new
   client-side branch in `index.html`.
2. **Pace the replay with an artificial delay.** No protocol change, but no
   value of the delay is both long enough to matter and short enough to be
   invisible; it trades a real bug for a tuning problem and a visible
   "room populates gradually" artifact.
3. **Chosen: keep the wire format, change only how it's batched through the
   buffer.** `Room.broadcast` and `setupNewUser` send a `List[RoomEvent]`
   (a single actor message, one buffer slot) instead of individual events;
   `SSE.source` inserts `.mapConcat(identity)` after the buffered source to
   fan the list back out into the same individual SSE frames the client
   already expects. No client change, and `mapConcat` is inherently
   backpressure-safe (it only emits as fast as downstream pulls), so the
   burst never risks the buffer at all rather than merely tolerating it up
   to some size.

## Empirical findings

These were confirmed by writing and running real (if throwaway) tests
against `Source.actorRef`, not derived from documentation, and contradicted
more than one initial assumption along the way.

### `dropTail` does not keep a clean prefix

With buffer size 4 and 10 messages sent before any downstream demand, the
survivors were message 1, 2, 3, and **10**, not 1 through 4. `dropTail`
evicts the buffer's current *tail* (the most recently buffered,
not-yet-delivered element) to make room for each new arrival, so the result
is the oldest `bufferSize - 1` elements plus whichever was sent last, a gap
in the middle of the sequence, not a truncated prefix. This is part of why
Option 1 uses `OverflowStrategy.fail` rather than a larger `dropTail` buffer:
a bigger `dropTail` buffer doesn't degrade gracefully, it produces a
confusing, non-contiguous partial state on overflow instead of a clean,
unambiguous failure.

### A buffer size of 0 bypasses `OverflowStrategy` entirely

The original code's own constant was named `disabledBufferSize`, which
turned out to be literally accurate rather than just a descriptive name. At
buffer size 0, an element arriving with no established downstream demand is
unconditionally dropped (log line: `"Dropping element because there is no
downstream demand and no buffer"`), regardless of which `OverflowStrategy` is
configured. This was confirmed by temporarily setting the buffer to 1 and
observing the log line change to `"Failing because buffer is full and
overflowStrategy is: [Fail]"` for the exact same test. Practically: switching
`dropTail` to `fail` while leaving the buffer at 0 would have changed nothing
about the original bug, the strategy is never consulted at 0.

### A non-zero buffer size N tolerates N + 1 elements, not N

With buffer size 1, sending exactly 2 messages with zero demand ever
requested did not overflow (confirmed by timing out waiting for an error,
not by inference); a 3rd message overflowed immediately and cleanly. The
buffer holds one element "in flight" toward the next pull in addition to
`bufferSize` queued behind it, so the effective tolerance is `bufferSize + 1`.
There is no way to get a strategy-respecting "fail on the 2nd element"
using this mechanism; 1 is the smallest usable buffer size, and it means
"tolerate 2, fail on the 3rd."

### The connection-establishment race is not a practical risk

A remaining question was whether `setupNewUser`'s now-single batched send
could still race a brand new connection's downstream demand not yet being
established, even after removing the O(N) burst. This was checked against a
*real* bound HTTP server, a real HTTP client, and the real
`RoomManager -> Room -> setupNewUser` actor-hop chain (not a synthetic
`TestSink` with manually withheld demand), across 50 sequential and 30
concurrent join trials. All 80 delivered the first event with zero losses.
The likely reason: the multiple async actor hops between stream
materialization and the first send give Pekko HTTP's own response-entity
subscription, which happens comparatively fast and in-process, enough of a
head start that demand is already established by the time the send occurs.
This is empirical, not a compile-time guarantee, and worth re-checking with a
similar test if this path is ever restructured to remove or reorder those
hops.

### Ordinary concurrent voting bursts don't threaten the buffer in practice

A later review raised a specific worry the connection-establishment-race check above didn't
cover: several people voting within milliseconds of each other (a normal event in this app,
not an edge case) fires several separate broadcasts back to back, and the arithmetic of
`bufferSize = 1` says any 3rd undelivered element overflows a client that hasn't pulled
demand for the first 2 - so does a merely-slow client (not a fully stalled one) get caught by
ordinary room activity?

Checked with a spike: a real bound Pekko HTTP server, a real HTTP client actually consuming
the response body (not a demand-starved `TestSink`), against burst sizes from 1 to 100
simultaneous voters and a simulated per-event processing delay up to 300ms. Zero overflows
across all cases (18 combinations, 3-5 trials each). The likely reason: Pekko HTTP's own
response-streaming pipeline buffers and writes ahead of whatever `Source.actorRef`'s single
buffer slot suggests, so ordinary application-level slowness (a slow render, a busy event
loop) never actually propagates back to `Source.actorRef`'s demand signal - only a genuine
transport-level stall (a dead socket, a full OS send buffer) does, which is exactly the
scenario `BackpressureReconnectSpec`'s demand-starved `TestSink` already models. No code
change made as a result; this confirms rather than revises the buffer-size decision above.
This was a throwaway spike, not added to the permanent suite, per the same convention as the
connection-race check.

## Final design

1. **Batching.** `Room.broadcast` and `setupNewUser` send `List[RoomEvent]`;
   `SSE.source` uses `Source.actorRef[List[RoomEvent]]` with
   `.mapConcat(identity)` immediately after. Wire format and client
   unchanged.
2. **`OverflowStrategy.fail`, buffer size 1.** Sized for "two ordinary
   actions landing close together," not for room size (no longer needed
   after the batching fix) and not padded for the rare larger coincidence
   (e.g. several people leaving within the same instant at a meeting's end),
   which safely falls through to the fail-and-reconnect path and gets a
   correct full resync, the intended self-healing behavior, not a degraded
   one.
3. **`retry = 2000` (milliseconds), set explicitly on every outgoing SSE
   event.** Removes dependence on each browser's own unpinned default
   reconnect delay.
4. **A 6-second grace period before `Room` acts on a `Leave`.** `Leave` now
   schedules an internal `ConfirmLeave` after the grace period instead of
   acting immediately; `ConfirmLeave` re-checks the pre-existing ref-match
   guard (originally written to ignore a stale teardown superseded by a
   reconnect) at fire time. A reconnect within the window, whether from the
   `retry` above, an ordinary page refresh, or a brief network blip, replaces
   the ref via `Join` before the timer fires, so the rest of the room never
   sees a leave-then-rejoin flicker. The value was sized as roughly 3x the
   `retry` value (room for the wait itself, the reconnect/handshake
   overhead, and jitter) now that `retry` is a known, controlled quantity
   rather than an unpinned default that would have required padding for the
   unknown.

   Unlike the buffer-size facts above, the 6-second figure itself is a
   heuristic, not something measured against real network conditions: there
   is no test or field data confirming that a genuine reconnect completes
   within 6 seconds on a slow or lossy connection (a bad mobile network, a
   backgrounded tab a browser deprioritizes) rather than this app's usual
   office network. If that assumption turns out to be wrong in practice, a
   slow-but-genuine reconnect would look identical to a real departure and
   still produce the flicker this fix was meant to prevent, just less often.
   Revisit the constant, not the mechanism, if that's ever observed.

## What was deferred

- Sequence numbers / `Last-Event-ID` resumption (Option 2 above), revisit
  when Phase 4's server-authoritative auto-reveal work begins - now for two
  reasons, not one: it's still the prerequisite for trustworthy auto-reveal,
  and it's also what fully closes the room-size-scaling risk below, since a
  delta resync never needs to hand a slow client a large replay list to drain
  in the first place.
- Any buffer sizing tied to room size or padded "just in case." The batching
  fix removed the room-size-scaling burst at connection time; further
  headroom would only slow down detection of genuine backpressure without a
  corresponding benefit the fail+reconnect+resync fallback doesn't already
  cover. It does not remove every room-size-correlated risk: a slow client
  can still be mid-drain of a large replay list when the buffer's small
  tolerance is exhausted by ordinary room activity, causing a bounded
  fail-reconnect-fail loop rather than data loss (see Option 2 above). Left
  as-is rather than padded, since that loop self-heals and no evidence yet
  suggests it happens in practice at this app's scale.
- Disambiguating a deliberate tab close from a transient reconnect. The grace
  period in the final design (below) treats both identically, since nothing in
  the SSE stream ending tells the server which one happened; a deliberate close
  now waits out the same 6 seconds as a genuine reconnect before the rest of
  the room is told. Logged as its own entry in `docs/known-issues.md` rather
  than fixed here, since closing the gap means adding a client-initiated
  signal (e.g. `navigator.sendBeacon` on `pagehide`) rather than tuning
  anything in this change.

## Testing

- `RoomSpec`: existing broadcast-related cases updated to expect
  `List[RoomEvent]` instead of a bare `RoomEvent`; a new case proving
  `setupNewUser`'s replay arrives as a single batched message; a new case
  proving `Leave` is delayed rather than acted on immediately; a new case
  proving a reconnect within the grace period produces no `Leave` broadcast
  at all; a new case (added after review) proving a second `Leave` for the
  same connection resets the grace period rather than firing twice, which
  documents the (userId, ref) timer key's single-call assumption instead of
  leaving it implicit. The `BehaviorTestKit`-based "stops when empty" case
  sends `ConfirmLeave` directly, since `BehaviorTestKit` doesn't drive real
  timers.
- `SSESpec` (new): the batched-list-to-individual-frames flattening, the
  buffer overflow failing the stream rather than dropping silently, and the
  `retry` field being set on outgoing events.
- `BackpressureReconnectSpec` (new, added after review): an end-to-end case
  wiring a real `RoomManager`, a real `Room`, and two real `SSE.source`
  streams standing in for two browser tabs. Proves the actual failure-to-
  reconnect path RoomSpec and SSESpec each only cover in isolation: a
  stalled client's stream overflows and fails, and the rest of the room
  never sees a `Leave` for it because the reconnect lands inside the grace
  period. This is the test that would catch a future regression like
  reverting the buffer size to 0 or dropping the grace period, since either
  change could leave RoomSpec and SSESpec both green while still breaking
  the combination.
- Manual/throwaway verification during design, not part of the permanent
  suite: the `dropTail`/buffer-size mechanics above, and the real-socket
  connection-race check across 80 trials.
