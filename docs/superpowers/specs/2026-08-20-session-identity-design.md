# Session/Identity Mechanism (closes the userId spoofing gap)

Date: 2026-08-20
Status: Implemented and current. Partly superseded by
`docs/superpowers/specs/2026-08-31-protocol-target-architecture-design.md`; its
"Disposition of existing specs" table says what that design changes and what it
leaves alone.

## Purpose

This is Phase 1's third item in `docs/roadmap.md`: validate `userId` per
request, closing the spoofing gap the SSE transport swap
(`docs/superpowers/specs/2026-08-18-sse-transport-design.md`) deliberately
left open. See `docs/known-issues.md` ("`userId` is never authenticated or
checked for room membership") for the full writeup of the gap this closes.

**Scope boundary:** this PR gives `/join` and `/events` real request/response
semantics and introduces a real per-session credential. It deliberately does
**not** change the fire-and-forget, always-`204` shape of the five command
endpoints (`vote`/`show`/`clear`/`revote`/`edit-issue`) — switching those to
the ask-pattern so `Room`/`RoomManager` can reply with a real applied/rejected
result is Phase 1's fourth, separately-scoped roadmap item, and is explicitly
not bundled in here. A request carrying an invalid or missing credential to
one of the five command endpoints silently has no effect, exactly mirroring
today's behavior when a command targets an unknown `roomId`. It also does not
change the current behavior of auto-creating an empty room for an unrecognized
`roomId` — see "Known behavior, documented not fixed" below.

## Why `userId` alone can never be the fix

`Room.scala` already broadcasts every acting `userId` to every participant in
the room (that's how the UI attributes a vote or an issue edit to a specific
person). Any member of a room already legitimately learns every other
member's `userId` through the normal event stream. That means a membership
check of the form "does this `userId` belong to someone in the room" cannot
work — every existing member trivially passes that check for everyone else's
id too. Closing the gap requires a second value that is never broadcast: a
per-session secret, known only to the server and the browser that minted it.

## New architecture

### The credential: a room-scoped session cookie

`/join` mints a random session token and returns it as a cookie, not in the
response body. Cookie attributes:

- `HttpOnly` — never read by JS; the browser attaches it automatically.
- `SameSite=Strict` — this app has no legitimate cross-site flow into it.
- `Path=/rooms/{roomId}` — scopes the cookie to one room, so a browser with
  two different rooms open in two tabs holds two independent cookies instead
  of one tab's `/join` overwriting the other's session.
- `Secure`, gated behind a new `apiConfig.secureCookies` flag (see
  `ApiConfig` changes below), default `true`. Needs to be overridable to
  `false` for local/plain-HTTP development, since a `Secure` cookie is never
  sent back over a non-TLS connection.
- No `Max-Age`/`Expires` — a session cookie, cleared when the browser closes.
  This keeps it squarely in the "strictly necessary" bucket under the
  ePrivacy Directive (no consent banner needed) and matches the existing
  ephemeral lifetime of a `Room` actor's state.

**`apiConfig.secureCookies` (`pointing-poker.service.secure-cookies` /
`SECURE_COOKIES`) defaults to `true`, and that's safe to make loud rather
than convenient:** this flag is security-relevant, and the two ways to get
it wrong aren't symmetric. Defaulting `true` but forgetting to flip it for
local plain-HTTP development fails loud and immediately — nothing works, every request 401s
the moment `/events` doesn't get the cookie back, since a `Secure` cookie is
never returned over a non-TLS connection. Defaulting `false` but forgetting
to set it for a real deployment fails silently — the app works perfectly
while quietly sending the session credential over plain HTTP if TLS
termination is ever misconfigured upstream. Fail loud-and-safe by default,
not quiet-and-convenient.

That said, discoverability of the local-dev case is a real gap worth closing
deliberately rather than leaving to the README alone: this project has no
dev/prod profile split today (no `docker-compose`, no `.env`, just
`application.conf` plus env-var overrides), and inferring `Secure` from the
inbound request's scheme or from `apiConfig.host` doesn't actually work —
TLS is normally terminated by a reverse proxy in front of this app in a real
deployment (see the existing "SSE reverse-proxy buffering is undocumented"
known issue), so the Pekko HTTP server itself receives plain HTTP from the
proxy in production too. A local run and a correctly-deployed production
instance are indistinguishable from inside the app, so there's no reliable
signal to auto-detect this from. Instead:

- `Main.scala` logs the resolved setting unconditionally at startup, e.g.
  `Session cookies: Secure=true (requires HTTPS end-to-end, including
  through any reverse proxy). Set SECURE_COOKIES=false for local plain-HTTP
  development.` — the first thing visible in the console when `sbt run`
  is followed by a mysteriously-401ing join.
- `README.md` gets a "Running locally" section (doesn't exist today) stating
  the same thing for anyone reading docs before running.

The token is represented server-side as `opaque type SessionToken = UUID`
(defined in `Room.scala`, alongside `User`/`RoomData`), minted with
`UUID.randomUUID()` — the same generation mechanism `userId` already uses,
adequate entropy for this threat model. It's a distinct type from `UUID` so
a token and a `userId` can't be accidentally swapped at a call site.

`userId` itself is **not** a secret and stays exactly as public as it is
today — `/join`'s JSON response still returns `{"userId": "..."}` so the
client can compare its own id against incoming broadcast events (own-vote
highlighting etc.), same as now. The cookie is the only thing that changes
in the wire format for identity.

### Session state lives inside `Room`, in two stages

`Room` already owns per-room membership (`RoomData.users`). Extending it
avoids inventing a second store that has to be kept in sync with the
`Room` actor's lifecycle:

- **Pending session** — created by `/join`. `RoomData` gains
  `pendingSessions: Map[SessionToken, PendingSession]` where
  `PendingSession(userId: UUID, name: String)`. Not a `Room.User` yet,
  because `User.ref` is the live SSE connection's `ActorRef`, which doesn't
  exist until `/events` connects.
- **Confirmed member** — created by `/events`, exactly as `RoomData.users`
  works today, except `User` gains a `token: SessionToken` field so later
  command lookups can resolve identity by token instead of trusting a
  client-supplied `userId`.

Promoting a pending session to a confirmed member removes it from
`pendingSessions` (tidiness, not a security requirement — an orphaned pending
entry from a `/join` that never got a follow-up `/events` call is the same
shape as the existing "no GC for never-joined rooms" known issue, not a new
gap).

### `Room`'s new commands

- `RequestSession(name: String, replyTo: ActorRef[SessionMinted])` — backs
  `/join`. Mints `userId` and a token, stores the pending session, replies
  `SessionMinted(userId, token)`.
- `ValidateToken(token: SessionToken, replyTo: ActorRef[TokenResolution])` —
  backs `/events`, called **before** the SSE stream opens. Resolves against
  `pendingSessions` first (fresh join), then against `users` by token
  (reconnect — a browser's automatic `EventSource` retry replays the same
  cookie after a network blip, and by then the pending entry has already
  been consumed). Replies `Resolved(userId, name)` or `Unresolved`.
- `Join(user: User)` — unchanged shape, `User` now carries `token`. Sent once
  the SSE source's `ActorRef` materializes, exactly as today's `Join` is
  sent by `ConnectToRoom`. `joinUser`'s existing upsert-by-id logic already
  handles reconnect correctly (replaces the stale `ref`); this PR adds
  clearing the consumed `pendingSessions` entry to the same method.
- `Vote`/`ClearVotes`/`ReVote`/`ShowVotes`/`EditIssue` — signature changes
  from `(userId: UUID, ...)` to `(token: SessionToken, ...)`. **The existing
  `RoomData` pure functions (`vote`, `clear`, `reVote`, `editIssue`) are
  unchanged** — they still operate on a real `userId`. Only
  `receiveBehaviour`'s pattern match changes: resolve
  `data.users.find(_.token == token)` first; on a match, call the existing
  `RoomData` method with the resolved `u.id` and broadcast exactly as today
  (the public wire format is untouched — broadcasts still carry the real
  `userId`, never the token); on no match, `Behaviors.same` — silent no-op,
  identical in shape to today's response to an unknown `roomId`.

Only `RequestSession` auto-creates a room (find-or-create, same as today's
`ConnectToRoom`). `ValidateToken` and the five command messages do a plain
lookup against `RoomManagerData.rooms` and no-op/fail on a miss — this
matches every command handler's existing behavior today, and means a
reconnect racing against a just-reaped room (this user was the room's last
member, and their own disconnect already tore it down) fails the same way
an unrecognized token does: `Unresolved`, not a silent auto-create-then-fail.

### `POST /rooms/{roomId}/join`

- **Input:** `{ name }` body, `roomId` from the path. No cookie required —
  this is what creates one.
- **Behavior:** asks `RoomManager` → `Room.RequestSession(name, ...)`
  (find-or-create the room, same as today's implicit auto-create via
  `/events`).
- **Output:** `Set-Cookie` (as specified above) plus `{"userId": "..."}` in
  the body. No new failure mode beyond the existing malformed-JSON-body 400.

### `GET /rooms/{roomId}/events`

- **Input:** `roomId` from the path, token from the cookie. No more
  `userId`/`name` query parameters.
- **Behavior:** asks `RoomManager` → `Room.ValidateToken(token, ...)` before
  opening anything. On `Unresolved` (missing cookie, unknown token, or a
  malformed cookie value that fails to parse as a `SessionToken`): reject
  with `401`, no SSE stream ever opens — the client gets a real,
  distinguishable failure instead of `EventSource`'s opaque generic `error`
  event. On `Resolved(userId, name)`: open the SSE source exactly as today,
  sending `Room.Join(...)` with a `User` built from the resolved `userId`/
  `name`, the materialized `ref`, and the validated `token` (`voted`/
  `estimation` default the same way they do for any new joiner today) once
  the source's `ActorRef` materializes.
- **Output:** success is the unchanged SSE stream (`init`/`join`/`vote`/
  `show`/`clear`/`revote`/`leave`/`edit_issue` events, heartbeats); failure
  is a `401` with no stream.

### Command endpoints (`vote`/`show`/`clear`/`revote`/`edit-issue`)

Drop `?userId=...`; read the token from the cookie instead. Everything else
— route shape, request/response bodies, unconditional `204` — is unchanged.
An invalid or missing token means `Room` finds no matching user and
no-ops; the caller still gets `204`. This is the deliberate scope boundary
described above.

### `ApiConfig` / `application.conf`

Add `secureCookies: Boolean`, loaded from
`pointing-poker.service.secure-cookies` (default `true`), overridable via
`${?SECURE_COOKIES}` — same pattern already used for `host`/`port`/
`timeout`. Needed so local/plain-HTTP development can disable the `Secure`
cookie attribute without a code change.

### `index.html`

Purely subtractive on the identity-carrying side: delete the
`URLSearchParams({ userId, name })` construction before opening the
`EventSource`, and drop `?userId=' + this.user.id` from the five command
`axios.post` calls. No credential-handling code needs to be added — same-
origin `fetch`/XHR/`EventSource` requests attach cookies automatically
regardless of any `withCredentials` setting; that flag only matters
cross-origin, which doesn't apply here. `ref.user.id = userId` from `/join`'s
response body is kept as-is, for the client's own broadcast-matching logic.

## Known behavior, documented not fixed

- An unrecognized `roomId` still silently gets a fresh, empty room (no
  history, no prior participants) rather than a `404` — this is a deliberate
  choice (see conversation leading to this spec), not an oversight. A
  bookmarked room link only "works" in the sense that it doesn't error; it
  does not restore any prior session state, because none is persisted
  anywhere yet. Add a short note to `docs/known-issues.md` explaining this
  and cross-linking Phase 2's durable `sessions` store, which is what would
  actually let the server tell "never existed" apart from "existed, but
  everyone left."
- A `/join` with no follow-up `/events` call leaves an orphaned pending
  session in `Room` — same shape as the existing "no GC for abandoned/
  never-joined rooms" known issue (Phase 5), not a new gap introduced here.
- Add a short "Cookies" note to `README.md`: what the session cookie is for,
  that it's session-only (cleared on browser close), and that it's exempt
  from consent requirements as a strictly-necessary functional cookie.
- A session token has no lifecycle independent of the `Room` actor it belongs
  to: no expiry, no rotation, and no way to invalidate one early short of the
  whole room dying (its last member leaving). That matches the app's existing
  architecture today (in-memory, single-process, nothing persisted ahead of
  Phase 2's durable `sessions` store), not a new limitation introduced by this
  mechanism. Don't read "session" here as implying a real session store with
  its own lifecycle; it's an ambient credential whose lifetime is borrowed
  from the `Room` actor's.

## File-by-file changes

| File | Change |
|---|---|
| `Room.scala` | Add `opaque type SessionToken`, `PendingSession`, `RoomData.pendingSessions`. Add `RequestSession`/`ValidateToken` commands and their replies. `User` gains `token`. `Vote`/`ClearVotes`/`ReVote`/`ShowVotes`/`EditIssue` take `token` instead of `userId`, resolved against `users` before delegating to the unchanged `RoomData` pure functions. `joinUser` also clears the consumed `pendingSessions` entry. |
| `RoomManager.scala` | Add pass-through `RequestSession`/`ValidateToken` commands (only `RequestSession` auto-creates, matching today's sole auto-create path). `ConnectToRoom`'s signature changes from taking a `RoomEvent` to explicit `(roomId, userId, name, token, ref)` fields — the token doesn't belong in `RoomEvent`, which is the public broadcast wire format. `Vote`/`Show`/`Clear`/`Revote`/`EditIssue` commands take `token` instead of `userId`. |
| `API.scala` | `/join` becomes a real ask to `RoomManager`, sets the cookie. `/events` becomes cookie-only input, asks `ValidateToken` before opening the SSE source, `401` on `Unresolved`. The five command routes read the token from the cookie instead of a `userId` query param; unmarshalling/response shape otherwise unchanged. |
| `config/ApiConfig.scala` | Add `secureCookies: Boolean`. |
| `application.conf` | Add `pointing-poker.service.secure-cookies = true` / `${?SECURE_COOKIES}`. |
| `Main.scala` | Log the resolved `secureCookies` setting at startup, unconditionally, with a one-line explanation of what it implies and how to override it for local plain-HTTP development. |
| `index.html` | Remove `userId`/`name` from the `/events` URL and from the five command POST URLs. No new client-side cookie-handling code needed. |
| `README.md` | Add a short "Cookies" section, plus a "Running locally" section (doesn't exist today) noting `SECURE_COOKIES=false` is needed for plain-HTTP local development. |
| `docs/known-issues.md` | Remove the two "Open" entries this resolves (`userId` never authenticated..., `/join` accepts a `name` it never uses). Add a short entry documenting the "unknown `roomId` silently gets an empty room, no bookmark continuity" behavior, cross-linked to Phase 2. |
| `docs/roadmap.md` | Check off Phase 1's "Session/identity mechanism" item once this lands. |

## Error handling

- `/join`: malformed JSON body → `400` (unchanged, existing marshalling).
  No other failure mode — still auto-creates on an unknown `roomId`.
- `/events`: missing cookie, unknown token, or a cookie value that doesn't
  parse as a `SessionToken` → `401`, stream never opens. Cookie parsing is
  deliberately *not* wired through the existing `Unmarshaller[String, UUID]`
  used for path/query UUIDs (which rejects with `400`) — a bad cookie value
  is an auth failure, not a bad request, so it's folded into `Unresolved`
  and comes out as `401` like every other invalid-credential case. Malformed
  `roomId` path segment → `400` (unchanged).
- Command endpoints: invalid/missing token → silent no-op, `204` regardless
  — deliberately unchanged from today's shape, per the scope boundary above.
- A `ValidateToken`/command message targeting a `roomId` `RoomManager` has
  no entry for (room was reaped, or never existed and `/join` was never
  called) → treated identically to an unresolved token: `401` for `/events`,
  silent no-op for commands. No auto-create outside `RequestSession`.

## Testing

- `RoomSpec`: new cases for `RequestSession` (mints and stores a pending
  session), `ValidateToken` against a pending session, against a confirmed
  member (reconnect), and against an unknown token (`Unresolved`). Update
  `Vote`/`ClearVotes`/`ReVote`/`ShowVotes`/`EditIssue` cases to key off
  `token` instead of `userId`, plus a case confirming an unresolvable token
  produces no broadcast (`Behaviors.same`, `expectNoMessage` on all probes).
- `RoomManagerSpec`: pass-through cases for `RequestSession`/`ValidateToken`,
  same pattern as existing `Vote`/`Show` pass-through tests. Confirm only
  `RequestSession` auto-creates; `ValidateToken` against an unknown `roomId`
  gets `Unresolved` rather than a freshly created room.
- `APISpec`: `/join` test updated to assert the `Set-Cookie` header
  (`HttpOnly`, `SameSite=Strict`, `Path=/rooms/{roomId}`) alongside the
  existing `{userId}` body assertion. `/events` gets a new case asserting
  `401` with no cookie and success with a cookie obtained from a prior
  `/join`. The five command tests switch from `?userId=...` to a supplied
  cookie; add one negative case (bad/missing cookie → still `204`, but
  `commandProbe` receives nothing observable as applied — assert via
  `Room`-level behavior in `RoomSpec` instead, since `APISpec`'s test double
  doesn't model token resolution).
- Manual end-to-end pass beyond unit tests: two browser tabs joining the
  *same* room (existing check), plus a new check specific to this change —
  two tabs joining *different* rooms from the same browser, confirming the
  `Path`-scoped cookie means neither session overwrites the other.
