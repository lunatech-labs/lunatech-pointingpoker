# Known Issues / Technical Debt

Issues and design smells found during review that are not being fixed immediately,
either because they are out of scope for the PR that surfaced them or because they
need a deliberate follow-up rather than a quick patch. Each entry links to the
roadmap phase (see `docs/roadmap.md`) where it should be resolved, or is flagged as
unscheduled if none exists yet.

When one of these gets fixed, remove it from this file and check the corresponding
roadmap item instead of leaving it here as stale history.

## Open

### `userId` is never authenticated or checked for room membership

- **Where:** `src/main/scala/com/lunatech/pointingpoker/actors/Room.scala` (the
  `Vote`, `ClearVotes`, `ReVote`, `ShowVotes`, and `EditIssue` branches of
  `receiveBehaviour`), reached from every `POST` command endpoint in `API.scala`
  plus `GET /rooms/{roomId}/events`.
- **Issue:** The trust model was already insecure before this PR (`userId` is
  client-supplied and never cross-checked against connection identity). The SSE
  transport migration preserved that gap by design, but changed its exposure: under
  the old WebSocket transport, `userId` was minted server-side once per connection
  and never had to be sent again. Now it appears in the query string of every single
  action (vote, show, clear, revote, edit-issue) and the SSE connect, which means it
  now lands repeatedly in server access logs, browser history, and any intermediate
  proxy log.

  The gap is broader than "spoofable identity" suggests. Of the five mutating
  commands, only `Leave` checks that the acting `userId`/`ref` pair is a current
  member of the room (`data.users.exists(u => u.id == userId && u.ref == ref)`);
  `Vote`, `ClearVotes`, `ReVote`, `ShowVotes`, and `EditIssue` apply and broadcast
  unconditionally. Combined with `RoomManager.ConnectToRoom` auto-creating a room on
  first reference, anyone who knows or guesses a `roomId` can call any mutating
  endpoint, including `edit-issue`, with an arbitrary, never-joined `userId` and no
  prior call to `/join` or `/events` at all. There is currently no join or
  connection precondition on any write.
- **Resolution:** Phase 1, "Session/identity mechanism" in `docs/roadmap.md`. That
  work should validate both that `userId` belongs to the caller and that `userId`
  is a current member of `roomId` before a command is applied, and should thread a
  real result back to the API layer (see the `/join` entry above and the
  always-`204` behavior documented in the README's API table) so callers can be
  told a command didn't apply instead of always being told it succeeded. Until it
  lands, treat log retention and access to logs for this service as more sensitive
  than the original design assumed.

### `POST /rooms/{roomId}/join` accepts a `name` it never uses

- **Where:** `src/main/scala/com/lunatech/pointingpoker/API.scala:61-70`,
  `src/main/scala/com/lunatech/pointingpoker/Requests.scala` (`JoinRequest`).
- **Issue:** The join endpoint decodes and validates a `JoinRequest{name}` body but
  discards it (`entity(as[JoinRequest]) { _ => ... }`). It also does not check that
  the room exists. The name that actually sticks comes from a separate `name` query
  parameter on the later `GET /events` call. A client can send different names to
  `/join` and `/events` with no error, and nothing about the API contract suggests
  that the first `name` is meaningless.
- **Resolution:** Fold into Phase 1's identity mechanism work: either drop `name`
  from `JoinRequest` until `/join` actually stores pending-join state keyed by the
  minted `userId`, or make `/events` require the join to have happened first and use
  the name captured there.

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
