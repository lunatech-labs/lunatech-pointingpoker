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

### SSE broadcasts can be silently dropped under backpressure

- **Where:** `src/main/scala/com/lunatech/pointingpoker/sse/SSE.scala`
  (`disabledBufferSize = 0`, `OverflowStrategy.dropTail`, carried over unchanged
  from the old WebSocket source).
- **Issue:** With a zero-size buffer, a broadcast event that arrives while the
  downstream write is not immediately ready is dropped, with no sequence number,
  no `Last-Event-ID` resumption, and no periodic full-state resync. A dropped
  `vote`/`show`/`clear` event can leave a client's UI stale until something else
  triggers a reconnect and a fresh catch-up replay.
- **Resolution:** Reliable delivery is a prerequisite for server-authoritative
  auto-reveal, not parallel work, so don't wait for Phase 4 to start on it. Treat
  it as its own near-term item, ideally scheduled alongside Phase 1: that phase
  already introduces per-request identity validation, and a resync/ack mechanism
  pairs naturally with that same request path.

### No garbage collection for abandoned or never-joined rooms

- **Where:** `src/main/scala/com/lunatech/pointingpoker/actors/RoomManager.scala`
  (`RoomManagerData`).
- **Issue:** A room is only removed from memory when its last joined participant
  leaves. `POST /create-room` no longer requires a completed join to keep a room
  alive (see the `/join` issue above), so an abandoned tab, a network failure before
  `/join`, or stray traffic can accumulate rooms that live for the life of the
  process.
- **Resolution:** Added to Phase 5 in `docs/roadmap.md` (room-creation hardening
  neighbors this but does not cover it). Becomes more important once Phase 2 makes
  sessions durable across restarts, since an idle-expiry policy will be needed there
  too.

### SSE reverse-proxy buffering is undocumented

- **Where:** `README.md` / deployment notes (no dedicated section exists).
- **Issue:** A common way SSE silently breaks in production is a reverse proxy
  (nginx by default) buffering the response, so pushed events arrive in batches or
  not at all until the buffer fills. Nothing in the code sets `Cache-Control:
  no-cache`, and nothing in the docs mentions `X-Accel-Buffering: no` or the
  equivalent for whatever proxy fronts this in deployment.
- **Resolution:** Unscheduled, cheap to fix. Good to bundle with Phase 5 hardening
  or the next deployment-related change.

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
