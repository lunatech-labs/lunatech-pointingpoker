# Known Issues / Technical Debt

Issues and design smells found during review that are not being fixed immediately,
either because they are out of scope for the PR that surfaced them or because they
need a deliberate follow-up rather than a quick patch. Each entry links to the
roadmap phase (see `docs/roadmap.md`) where it should be resolved, or is flagged as
unscheduled if none exists yet.

When one of these gets fixed, remove it from this file and check the corresponding
roadmap item instead of leaving it here as stale history.

## Open

### `userId` now travels in plaintext on every request, widening an existing gap

- **Where:** `src/main/scala/com/lunatech/pointingpoker/API.scala`, all `POST`
  command endpoints plus `GET /rooms/{roomId}/events`.
- **Issue:** The trust model was already insecure before this PR (`userId` is
  client-supplied and never cross-checked against connection identity). The SSE
  transport migration preserved that gap by design, but changed its exposure: under
  the old WebSocket transport, `userId` was minted server-side once per connection
  and never had to be sent again. Now it appears in the query string of every single
  action (vote, show, clear, revote, edit-issue) and the SSE connect, which means it
  now lands repeatedly in server access logs, browser history, and any intermediate
  proxy log.
- **Resolution:** Phase 1, "Session/identity mechanism" in `docs/roadmap.md`. Until
  that lands, treat log retention and access to logs for this service as more
  sensitive than the original design assumed.

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
- **Resolution:** Unscheduled. Worth addressing before or alongside Phase 4's
  server-authoritative auto-reveal, since that feature assumes the server's view of
  "who has voted" is reliably delivered to every client.

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

## Traceability note

The original source for the phased roadmap was a planning conversation kept outside
this repository. It has been copied into `docs/roadmap.md` so it is versioned
alongside the code it describes and can be updated in the same PRs that make
progress on it.
