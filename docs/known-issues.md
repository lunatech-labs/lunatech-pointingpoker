# Known Issues / Technical Debt

Issues and design smells found during review that are not being fixed immediately,
either because they are out of scope for the PR that surfaced them or because they
need a deliberate follow-up rather than a quick patch. Each entry links to the
roadmap phase (see `docs/roadmap.md`) where it should be resolved, or is flagged as
unscheduled if none exists yet.

When one of these gets fixed, remove it from this file and check the corresponding
roadmap item instead of leaving it here as stale history.

## Open

### An unrecognized `roomId` silently creates an empty room, with no bookmark continuity

- **Where:** `src/main/scala/com/lunatech/pointingpoker/actors/RoomManager.scala`
  (`RequestSession`'s find-or-create).
- **Issue:** `/join` (and, transitively, `/events`) auto-creates a room for any
  `roomId` it doesn't recognize, rather than rejecting it. A bookmarked room link
  therefore never *errors* - but if the room's actor has already been reaped (its
  last member left, or the process restarted), the link silently opens a brand-new,
  empty room under the same UUID: no prior participants, no vote history, no
  in-progress issue. There is currently no way for the server to tell "this UUID was
  never used" apart from "this UUID was a real room, but everyone left" - both look
  identical: an absent map entry.
- **Resolution:** This is a deliberate, scoped choice for the session/identity work
  (see `docs/superpowers/specs/2026-08-20-session-identity-design.md`), not an
  oversight - today's model has no persistence to actually restore, so a `404`
  instead of silent auto-create wouldn't recover any lost state either. Real
  continuity requires Phase 2's durable `sessions` store in `docs/roadmap.md`, which
  is what would let the server distinguish the two cases and make an informed choice
  about whether to 404.

### No garbage collection for abandoned or never-joined rooms

- **Where:** `src/main/scala/com/lunatech/pointingpoker/actors/RoomManager.scala`
  (`RoomManagerData`).
- **Issue:** A room is only removed from memory when its last joined participant
  leaves. `POST /create-room` no longer requires a completed join to keep a room
  alive, so an abandoned tab, a network failure before `/join`, or stray traffic
  can accumulate rooms that live for the life of the process.
- **Resolution:** Added to Phase 5 in `docs/roadmap.md` (room-creation hardening
  neighbors this but does not cover it). Becomes more important once Phase 2 makes
  sessions durable across restarts, since an idle-expiry policy will be needed there
  too.

### A `/join` with no follow-up `/events` leaks a pending session for the room's lifetime

- **Where:** `src/main/scala/com/lunatech/pointingpoker/actors/Room.scala`
  (`RoomData.pendingSessions`, `registerSession`).
- **Issue:** Same shape as the room-level GC issue above, one level deeper: a
  `PendingSession` created by `RequestSession` (backing `/join`) is only cleared
  when a matching `Join` promotes it to a real member. An abandoned tab, a
  network failure between `/join` and `/events`, or a client that calls `/join`
  more than once before connecting leaves the earlier entry in
  `pendingSessions` for as long as the room actor lives, even if that room
  already has active, joined members and would otherwise stay alive
  indefinitely.
- **Resolution:** No separate fix needed beyond whatever resolves the room-level
  GC issue above; a room-level idle-expiry or durable-session policy (Phase 2/5)
  should sweep unpromoted pending sessions too, not just reap the room actor
  itself.

### SSE reverse-proxy buffering is undocumented

- **Where:** `README.md` / deployment notes (no dedicated section exists).
- **Issue:** A common way SSE silently breaks in production is a reverse proxy
  (nginx by default) buffering the response, so pushed events arrive in batches or
  not at all until the buffer fills. Nothing in the code sets `Cache-Control:
  no-cache`, and nothing in the docs mentions `X-Accel-Buffering: no` or the
  equivalent for whatever proxy fronts this in deployment.
- **Resolution:** Unscheduled, cheap to fix. Good to bundle with Phase 5 hardening
  or the next deployment-related change.

### A deliberate tab close is as slow to announce as a transient reconnect

- **Where:** `src/main/scala/com/lunatech/pointingpoker/actors/RoomManager.scala`
  (`ConnectionCompleted`/`ConnectionFailure`, both routed to `Room.Leave`);
  `src/main/scala/com/lunatech/pointingpoker/actors/Room.scala` (`Leave`'s grace period).
- **Issue:** The grace period introduced in
  `docs/superpowers/specs/2026-08-24-sse-backpressure-design.md` to swallow a
  reconnect-driven leave-then-rejoin flicker delays *every* disconnect by the same
  6 seconds, not just the transient ones. The server has no signal that distinguishes
  "this connection will retry" from "this participant closed the tab and is gone for
  good" - both arrive as the SSE stream simply ending, so both wait out the same
  grace period before the rest of the room is told. A participant closing their tab
  mid-meeting still shows as present for up to 6 seconds afterward.
- **Resolution:** Unscheduled; worth confirming with real usage whether this lag is
  actually noticeable enough to matter before investing further. If it is, the fix is
  to disambiguate at the source instead of guessing after the fact: have the client
  send an explicit "I'm leaving" signal on deliberate departure (e.g. a `pagehide` /
  `visibilitychange` handler firing `navigator.sendBeacon` to a dedicated leave
  endpoint) that maps to an immediate `Room.Leave` bypassing the grace period
  entirely, while an SSE stream simply ending with no such signal keeps going through
  the grace period as today. `sendBeacon` is the right primitive here since a normal
  `fetch`/POST is not reliably delivered from an unload-adjacent handler.

### HTTP command ordering is not guaranteed between a client and the server

- **Where:** `src/main/scala/com/lunatech/pointingpoker/API.scala`, all mutating
  `POST` endpoints (`vote`, `show`, `clear`, `revote`, `edit-issue`).
- **Issue:** Under the old WebSocket transport, a user's commands travelled over
  one ordered connection, so the server always processed them in the order the
  client sent them. Each command is now an independent HTTP POST; a retried or
  delayed request (proxy retry, client-side double-submit, network reordering) can
  arrive after a logically later command from the same user, and nothing (sequence
  number, idempotency key, per-user request ordering) guards against that. This is
  a real regression from a guarantee the WebSocket transport gave for free, though
  low-likelihood given this app's usage pattern (one person clicking through a
  short session).
- **Resolution:** Unscheduled backlog item; no evidence yet that it causes real
  problems in practice. If it does, the fix likely pairs with the Phase 1 identity
  work: a per-user monotonic sequence number attached to each command, with `Room`
  rejecting or ignoring one that arrives out of order.

## Traceability note

The original source for the phased roadmap was a planning conversation kept outside
this repository. It has been copied into `docs/roadmap.md` so it is versioned
alongside the code it describes and can be updated in the same PRs that make
progress on it.
