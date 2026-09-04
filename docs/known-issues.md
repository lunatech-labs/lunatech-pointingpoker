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

### A deliberate tab close is as slow to announce as a transient reconnect

- **Where:** `src/main/scala/com/lunatech/pointingpoker/actors/RoomManager.scala`
  (`ConnectionCompleted`/`ConnectionFailure`, both routed to `Room.Leave`);
  `src/main/scala/com/lunatech/pointingpoker/actors/Room.scala` (`Leave`'s grace period).
- **Issue:** The grace period introduced in
  `docs/superpowers/specs/2026-08-24-sse-backpressure-design.md` to swallow a
  reconnect-driven leave-then-rejoin flicker treats every disconnect alike, not
  just the transient ones, and it is not even where most of the delay comes from.
  The server has no signal that distinguishes "this connection will retry" from
  "this participant closed the tab and is gone for good" - both arrive as the SSE
  stream simply ending. But the room does not notice either one until a write to
  that dead stream fails, and absent other traffic the only writes are the
  15-second heartbeats, with the first one after a close only drawing the peer's
  reset. The step 0 browser suite measured about 31 seconds from a tab close to
  detection with no other room activity, or about 1.7 seconds if two broadcasts
  happen to follow the close, and only then does the 6-second grace period run.
  A participant closing their tab mid-meeting can show as present for far longer
  than 6 seconds afterward, not up to 6.

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
- **Issue:** When a connection drops for longer than the grace period,
  `ConfirmLeave` removes the member. Because `joinUser` consumed the pending
  session on promotion, the member entry was the token's only remaining record,
  so `ValidateToken` now resolves nothing and `/events` answers `401`.
  `EventSource` stops retrying on a non-2xx, the readyState goes to `CLOSED`,
  and the user is told "Your session has ended. Please reload the page to
  rejoin." The grace timer only starts once the room detects the disconnect,
  and detection itself rides on the room's own traffic, not a fixed clock: in a
  quiet room a blip can run well past six seconds and still recover invisibly,
  while in a busy room detection is fast and the 6-second grace period is what
  actually governs from there. So "a wifi handoff of more than six seconds" is
  not the threshold; what has to outlast the window is detection plus the grace
  period together, and how long that takes depends on the room. The `onerror`
  comment attributes the 401 to the room having been reaped, which is a
  different and rarer cause.
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

### Pre-reveal estimations are broadcast to every participant

- **Where:** `src/main/scala/com/lunatech/pointingpoker/actors/RoomSnapshot.scala`
  (`RoomSnapshot.of`, which copies every participant's `estimation` into the
  projection built for every recipient).
- **Issue:** An estimation is sent to every participant the moment it is cast,
  and the client merely declines to render it until votes are revealed. Anyone
  with devtools open can read their colleagues' votes before the reveal, which
  is the anchoring effect hidden voting exists to prevent.
- **Resolution:** Scheduled as step 2 of
  `docs/superpowers/specs/2026-08-31-protocol-target-architecture-design.md`,
  which builds each snapshot per recipient and redacts other participants'
  estimations until the room reveals. Remove this entry when that lands.

### The page and the browser suite depend on three public CDNs at runtime

- **Where:** `src/main/resources/pages/index.html` (the four asset tags at
  `:5`, `:84`, `:330` and `:331`); `e2e/fixtures.js` (the `assets` fixture).
- **Issue:** Bootstrap, feather-icons, axios and Vue are all loaded from
  `stackpath.bootstrapcdn.com`, `unpkg.com` and `cdn.jsdelivr.net` on every page
  load, so an outage at any of the three takes the app down and nothing is
  vendored to fall back to. The browser suite inherits it: the `assets` fixture
  caches each asset once per worker, which cut the fetch count but not the
  dependency, and its fallback on a failed fetch is `route.continue()` to the
  same unreachable host. The failure mode is therefore all cases failing at once
  on a page whose Vue never mounts, rather than one case degrading. Only
  Bootstrap carries an `integrity` attribute; the other three are unverified.
  The axios tag was also unpinned until it was fixed alongside this entry,
  resolving to whatever was latest at page load, which made the suite
  irreproducible across time independently of any outage. The pin closed that
  and took on a smaller version of the cost this entry declines vendoring for
  below: 1.20.0 is now served indefinitely, through any future advisory, and
  nothing in this repository bumps a CDN pin.
- **Resolution:** Stays open, unscheduled. Step 8 of
  `docs/superpowers/specs/2026-08-31-protocol-target-architecture-design.md`,
  the frontend rewrite, would close it structurally, since its build tooling
  bundles these assets, but nothing schedules it as a fix and the page is
  expected to keep loading from a CDN until then. Vendoring the four files for
  the test suite alone was considered and declined: third-party bytes in the
  repo plus a refresh ritual, bought against an outage nobody has hit, and it
  would make the suite load something production does not, against the point of
  driving the real page. The trigger is an observed CDN failure in CI. Remove
  this entry if step 8 bundles them.
- **Follow-ups this entry carries.** Two, both unscheduled. **Subresource
  integrity:** now that axios is pinned its bytes are stable, so `integrity`
  could cover axios, feather-icons and Vue as it already covers Bootstrap. That
  wants its own pass where each hash is verified in both engines, not an
  appendix to a test-suite change. **npm plus Dependabot:** installing the four
  assets as npm dependencies and serving them from the app would replace the
  refresh ritual with something that already works here, since
  `.github/dependabot.yml` runs weekly but currently covers
  `package-ecosystem: "github-actions"` only. It overlaps step 8, which bundles
  these assets anyway, so it is worth deciding with step 8 rather than ahead of
  it. Adding the `npm` ecosystem to `dependabot.yml` is worth doing either way:
  nothing updates `@playwright/test` today.

### A stalled-client SSE test settles on a wall clock, not a synchronization primitive

- **Where:** `src/test/scala/com/lunatech/pointingpoker/sse/SSESpec.scala`
  ("keep a stalled client's stream open and hand it the newest snapshot, not a
  stale queued one").
- **Issue:** The case sends five snapshots with no demand yet granted, then calls
  `probe.expectNoMessage(300.millis)` before requesting demand, so that all five
  sends have landed and been resolved by `dropHead` before the assertion runs.
  That wait is a deliberate wall-clock settle, not a synchronization primitive
  like the barriers used elsewhere in this suite.
- **Resolution:** Accepted as-is. The wait can only fail safe: if fewer than five
  sends have landed by the time demand arrives, the surviving element is a
  lower-numbered issue than expected, and the assertion goes red rather than
  passing on a race. No arrangement of timings produces a green result out of a
  broken `dropHead`, so the 300ms settle costs a small amount of suite time
  against a real synchronization primitive and buys nothing in return.

### The browser suite's apt step is unbounded and now dominates the CI job

- **Where:** `.github/workflows/ci.yml`, the `install the browser system
  dependencies` step (`npx playwright install-deps chromium firefox`), and the
  absence of `timeout-minutes` on either job.
- **Issue:** Measured twice on 2026-09-04, seven minutes apart, on the same
  branch. Run 33896625441: the apt step took 19s and the whole `test` job 2m43s.
  Run 33897256520, a docs-only commit: the same step took 18m25s and the job
  21m03s. Nothing in either commit touches the workflow or the suite, so the
  difference is the Debian mirror. Both caches behaved perfectly across the two
  runs, `npm ci` and the browser download at 1s each, which is what makes this
  visible: with the cacheable work reduced to nothing, the uncached apt step is
  the job's whole cost and its only exposure to anything outside the runner. The
  Playwright plan's deviation 8 already reasoned that the apt work runs on every
  run regardless and is therefore not worth caching, which is correct and is why
  the step exists separately; what that reasoning did not anticipate is the step
  becoming the sole variable. Neither job sets `timeout-minutes`, so a mirror
  that hangs rather than crawls runs to GitHub's six-hour default instead of
  failing fast, and both runs above went green, so nothing today reports this.
- **Resolution:** Stays open, unscheduled, and deliberately not fixed inside the
  browser-suite PR that surfaced it. The cheap half is `timeout-minutes` on both
  jobs, which converts a hung mirror into a fast red and a re-run; a value wants
  picking against observed times rather than guessed, and 19s against 18m25s is
  two data points, not a distribution. The larger question is whether
  `install-deps` is needed at all on `ubuntu-latest`, whose image may already
  carry what Chromium and Firefox link against, in which case the step could be
  dropped or narrowed rather than bounded. That wants measuring on a runner, not
  reasoning about, and it belongs with whoever next touches CI. Remove this entry
  when the step is bounded or retired.

## Traceability note

The original source for the phased roadmap was a planning conversation kept outside
this repository. It has been copied into `docs/roadmap.md` so it is versioned
alongside the code it describes and can be updated in the same PRs that make
progress on it.
