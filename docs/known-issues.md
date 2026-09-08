# Known Issues / Technical Debt

Issues and design smells found during review that are not being fixed immediately,
either because they are out of scope for the PR that surfaced them or because they
need a deliberate follow-up rather than a quick patch. Each entry links to the
step of `docs/superpowers/specs/2026-08-31-protocol-target-architecture-design.md`
that closes it, or to a roadmap phase (see `docs/roadmap.md`), or says plainly
that it stays open and why.

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
- **Resolution:** Stays open, and reclassified rather than scheduled.
  `docs/superpowers/specs/2026-08-31-protocol-target-architecture-design.md`
  establishes that teams pin one room URL for years and want a *blank* room at the
  start of each meeting, so silent auto-create is the behaviour that usage
  actually wants: the link always works and last week's issue is gone. Nobody has
  ever reported it. A truthful 404 would need a durable record of rooms that
  existed, which that design declines to keep, and its residual value is telling
  someone they mistyped a slug rather than leaving them alone in a phantom
  room.

### No garbage collection for abandoned or never-joined rooms

- **Where:** `src/main/scala/com/lunatech/pointingpoker/actors/RoomManager.scala`
  (`RoomManagerData`).
- **Issue:** A room is only removed from memory when its last joined participant
  leaves. `POST /create-room` no longer requires a completed join to keep a room
  alive, so an abandoned tab, a network failure before `/join`, or stray traffic
  can accumulate rooms that live for the life of the process.
- **Resolution:** Scheduled as step 4 of
  `docs/superpowers/specs/2026-08-31-protocol-target-architecture-design.md`,
  which replaces stop-when-empty with stop-after-idle: a room stops two to four
  hours after its last connection goes, whether or not anyone ever joined. That
  closes the accidental form. It does not close the abusive one, since any message
  arriving in an interval defers the stop by another, so a client looping requests
  at an empty room keeps it alive; bounding that belongs to the rate-limiting
  entry below. Remove this entry when step 4 lands.

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
- **Resolution:** Scheduled as step 4 of
  `docs/superpowers/specs/2026-08-31-protocol-target-architecture-design.md`,
  which replaces stop-when-empty with stop-after-idle, so a room's sessions go
  with it two to four hours after its last connection instead of living for the
  process. Step 5 retains sessions past promotion rather than consuming them,
  which removes the pending/promoted distinction this entry is phrased around,
  and it deliberately adds no TTL: the leak is a hundred bytes per abandoned tab
  in a room whose lifetime is now bounded. Remove this entry when step 4 lands.

### SSE reverse-proxy buffering is undocumented

- **Where:** `README.md` / deployment notes (no dedicated section exists).
- **Issue:** A common way SSE silently breaks in production is a reverse proxy
  (nginx by default) buffering the response, so pushed events arrive in batches or
  not at all until the buffer fills. Nothing in the code sets `Cache-Control:
  no-cache`, and nothing in the docs mentions `X-Accel-Buffering: no` or the
  equivalent for whatever proxy fronts this in deployment.
- **Resolution:** Scheduled as step 1 of
  `docs/superpowers/specs/2026-08-31-protocol-target-architecture-design.md`,
  which sets `Cache-Control: no-cache` and `X-Accel-Buffering: no` on the SSE
  response and adds a deployment note to `README.md`. Remove this entry when that
  lands.

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

  The form users actually report is a reload rather than a tab close.
  `POST /rooms/:roomId/join` mints a fresh `userId` and token on every call, so
  a reload is a new participant to the room and the previous one lingers for
  the grace period: the user watches their own name sit in the participant list
  twice.
- **Resolution:** Scheduled as step 6 of
  `docs/superpowers/specs/2026-08-31-protocol-target-architecture-design.md`,
  which closes both forms by different means. A deliberate close fires
  `navigator.sendBeacon` on `pagehide` to an explicit leave endpoint that
  bypasses the grace period, so the grace period covers only what it should,
  transient drops. The beacon fires only where the page is being discarded, so a
  back/forward cache entry (a mobile app switch, a navigation away) leaves
  membership alone rather than removing a member that no page load will come back
  to re-create. The reload is closed structurally rather than by beacon
  timing: `/join` becomes idempotent against the room cookie, so a reload resumes
  the same identity and the same vote instead of adding a second participant.
  What remains on a reload is a sub-second gap where the member is absent, since
  `pagehide` fires there too and nothing distinguishes it from a close, accepted
  deliberately in that design. Remove this entry when that lands.

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
- **Resolution:** Stays open, deliberately, and
  `docs/superpowers/specs/2026-08-31-protocol-target-architecture-design.md`
  records why after considering a fix. Under a snapshot protocol the client
  converges on whatever the server holds, so a reordering stops being silent
  divergence and becomes a visible wrong-but-true state: the wrong card stays
  highlighted, or a vote outlives a clear, in front of everyone. That plus never
  having observed one makes a sequence number machinery bought against an
  unmeasured risk. It stays cheap to add, being live state re-derived per
  session, so the trigger is someone actually seeing a reordered command.

### Resync doesn't replay whether votes are currently revealed

- **Where:** `src/main/scala/com/lunatech/pointingpoker/actors/Room.scala`
  (`setupNewUser`); `src/main/resources/pages/index.html` (`votesRevealed`).
- **Issue:** `setupNewUser`'s catch-up replay reconstructs participants,
  votes, and the current issue for a (re)connecting client, but has no
  equivalent of a `Show` replay: whether votes are currently revealed isn't
  part of the resync. A client that reconnects mid-session, after a dropped
  connection or a page reload, has no way to know votes are already shown until,
  if ever, a subsequent `Show`/`Clear` happens to arrive live.
- **Resolution:** Scheduled as step 1 of
  `docs/superpowers/specs/2026-08-31-protocol-target-architecture-design.md`,
  where every snapshot carries `votesRevealed`: a stored flag set by `Show` and by
  the vote that completes the round, rather than a predicate re-derived per publish.
  Remove this entry when that lands.
  Phase 4's "server-authoritative auto-reveal" item in `docs/roadmap.md` is
  closed by the same change, since reveal becomes real backend logic rather than
  a client-only derivation.

### No rate limiting on mutating room endpoints

- **Where:** `src/main/scala/com/lunatech/pointingpoker/API.scala`, all
  mutating `POST` endpoints (`vote`, `show`, `clear`, `revote`,
  `edit-issue`), and the leave endpoint once step 6 lands.
- **Issue:** Every mutating endpoint is unthrottled beyond session-token
  resolution, so a client can call any of them in a tight loop at no cost.
  Today this wastes CPU and bandwidth.

  Two earlier designs made this worse in ways that no longer apply, recorded so
  nobody reasons from them. The superseded 2026-08-26 delta resync design would
  have added a per-room retained `eventLog` that a loop could grow without
  bound. The superseded 2026-08-28 snapshot design held no such log but made
  every version bump close and reopen each bounded client's connection, turning
  a `POST` loop into a request amplifier of degree N, and backstopped that with
  a no-op publish guard.
  `docs/superpowers/specs/2026-08-31-protocol-target-architecture-design.md`
  cancels bounded mode and drops the guard, so neither the memory nor the
  request amplification arises: a redundant publish is N small messages over
  connections that are already open.

  What is left is the plain form. Nothing bounds the rate, and room creation
  (`POST /create-room`) is unauthenticated as well as unthrottled, which the
  target design notes it does not close.
- **Resolution:** Unscheduled. The underlying gap, no per-user/per-endpoint
  rate limiting anywhere in this API, is broader than any one symptom and
  should be addressed as its own piece of work if abuse becomes a real
  concern, not patched endpoint-by-endpoint as new symptoms show up.

### A disconnection outlasting the grace period forces a page reload

- **Where:** `src/main/scala/com/lunatech/pointingpoker/actors/Room.scala`
  (`joinUser` consuming the pending session, `ConfirmLeave`);
  `src/main/resources/pages/index.html` (`onerror`).
- **Issue:** When a connection drops for longer than the 6-second grace period,
  `ConfirmLeave` removes the member. Because `joinUser` consumed the pending
  session on promotion, the member entry was the token's only remaining record,
  so `ValidateToken` now resolves nothing and `/events` answers `401`.
  `EventSource` stops retrying on a non-2xx, the readyState goes to `CLOSED`,
  and the user is told "Your session has ended. Please reload the page to
  rejoin." The retry interval is 2 seconds, so a brief blip recovers silently
  and anything longer does not: sleeping a laptop, or a wifi handoff of more
  than six seconds, is enough, as long as somebody else is still in the room to
  keep it alive. The `onerror` comment attributes the 401 to the room having
  been reaped, which is a different and rarer cause.
- **Resolution:** Scheduled as step 5 of
  `docs/superpowers/specs/2026-08-31-protocol-target-architecture-design.md`,
  which retains sessions past promotion instead of consuming them, so the token
  stays resolvable and the retry succeeds with the same identity.
  Remove this entry when that lands.

### A second tab on the same room displaces the first tab's identity

- **Where:** `src/main/scala/com/lunatech/pointingpoker/API.scala`
  (the `/join` route's unconditional `RequestSession` and `setCookie`, with
  `sessionCookie`'s `Path=/rooms/$roomId` being why the slot is shared at all).
- **Issue:** The session cookie is scoped to the room, so every tab on that room
  shares one slot and each `POST /join` overwrites it. The sharing is not the
  problem; the overwrite is. A second tab does not join the first tab's identity,
  it mints a new one and replaces it, so the first tab's votes and edits are
  silently credited to the second participant while the first sits there
  connected. The 2026-08-20 session identity design examined two tabs on
  *different* rooms, where path scoping works correctly, and the same-room case
  fell in the gap beside it.
- **Resolution:** Scheduled as step 6 of
  `docs/superpowers/specs/2026-08-31-protocol-target-architecture-design.md`,
  which makes `POST /join` idempotent: a request whose cookie already resolves
  resolves to that `userId` instead of minting over it, so both tabs are one
  participant with one vote and either can be closed without evicting the other.
  Two tabs as two participants was considered and rejected there, not because a
  per-tab id is unobtainable (the Web Locks API would give one) but because it is
  not the requirement and because an extra non-voting member would block
  server-side auto-reveal for the whole room. Remove this entry when that lands.

### A transparently reconnecting client duplicates every known participant

- **Where:** `src/main/resources/pages/index.html` (the `init` and `join`
  handlers); `src/main/scala/com/lunatech/pointingpoker/actors/Room.scala`
  (`setupNewUser`).
- **Issue:** `EventSource`'s automatic retry reuses the same JS object, so
  `ref.users` is never cleared, while the server replays `init` plus one `join`
  per participant on every reconnect. The handlers push unconditionally, so
  every participant appears twice, three times, once per reconnect.
- **Resolution:** Scheduled as step 1 of
  `docs/superpowers/specs/2026-08-31-protocol-target-architecture-design.md`.
  Applying a complete snapshot cannot duplicate. Remove this entry when that
  lands.

### A participant who departs during a reconnect gap is never pruned

- **Where:** `src/main/scala/com/lunatech/pointingpoker/actors/Room.scala`
  (`setupNewUser`).
- **Issue:** The catch-up replay lists the participants who are present and
  never says who left, so a reconnecting client keeps anyone who departed while
  it was disconnected. Same root cause as the entry above, opposite direction.
- **Resolution:** Scheduled as step 1 of
  `docs/superpowers/specs/2026-08-31-protocol-target-architecture-design.md`.
  Under a snapshot an absent participant is absent. Remove this entry when that
  lands.

### Pre-reveal estimations are broadcast to every participant

- **Where:** `src/main/scala/com/lunatech/pointingpoker/actors/Room.scala`
  (the `Vote` broadcast, and `setupNewUser`'s replay of `u.estimation`).
- **Issue:** An estimation is sent to every participant the moment it is cast,
  and the client merely declines to render it until votes are revealed. Anyone
  with devtools open can read their colleagues' votes before the reveal, which
  is the anchoring effect hidden voting exists to prevent.
- **Resolution:** Scheduled as step 2 of
  `docs/superpowers/specs/2026-08-31-protocol-target-architecture-design.md`,
  which builds each snapshot per recipient and redacts other participants'
  estimations until the room reveals. Remove this entry when that lands.

## Traceability note

The original source for the phased roadmap was a planning conversation kept outside
this repository. It has been copied into `docs/roadmap.md` so it is versioned
alongside the code it describes and can be updated in the same PRs that make
progress on it.
