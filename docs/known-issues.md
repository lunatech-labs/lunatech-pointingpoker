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

### Every session a room mints lives as long as the room does

- **Where:** `src/main/scala/com/lunatech/pointingpoker/actors/Room.scala`
  (`RoomData.sessions`, `registerSession`).
- **Issue:** Same shape as the room-level GC issue above, one level deeper. A
  `Session` created by `RequestSession` (backing `/join`) is never removed. Step
  5 retains it past promotion, so that a member removed at grace expiry can still
  reconnect, and it deliberately adds no TTL. A room therefore accumulates one
  entry per `/join` it ever answered: tabs that connected, tabs that failed
  between `/join` and `/events`, and people who joined and left hours ago.
- **Resolution:** Scheduled as step 4 of
  `docs/superpowers/specs/2026-08-31-protocol-target-architecture-design.md`,
  which replaces stop-when-empty with stop-after-idle, so a room's sessions go
  with it two to four hours after its last connection instead of living for the
  process. A TTL was considered there and dropped: its useful range is squeezed
  below by needing to outlast a realistic in-meeting outage and above by the idle
  stop, and what it would reclaim is a hundred bytes per abandoned session. What
  is left after step 4 is a room held open for hours with heavy tab churn, which
  is abuse-shaped and belongs to the rate-limiting entry below. Remove this entry
  when step 4 lands.

### A disconnection that outlasts the grace period still forces a reload for the room's last member

- **Where:** `src/main/scala/com/lunatech/pointingpoker/actors/Room.scala`
  (`ConfirmLeave`'s stop-when-empty branch);
  `src/main/scala/com/lunatech/pointingpoker/actors/RoomManager.scala`
  (`ValidateToken` for an absent room).
- **Issue:** Step 5 keeps a token resolvable past its member's removal, so a
  reconnect after grace expiry rejoins under the same identity. That relies on
  the room still being there to resolve against. `ConfirmLeave` stops the room
  when the removal leaves `users` empty, and `ValidateToken` answers
  `Unresolved` for a room the manager no longer holds, so `/events` returns
  `401`, `EventSource` stops retrying, and the tab reads "Your session has
  ended. Please reload the page to rejoin." This is the last connected member,
  not only a lone one: it also catches whoever is left once the others have
  gone. The `onerror` comment in `src/main/resources/pages/index.html` names
  this cause. Step 5 removed the consumed-session cause behind it, leaving
  this one and a process restart, which takes every room and session with it.
- **Resolution:** Scheduled as step 4 of
  `docs/superpowers/specs/2026-08-31-protocol-target-architecture-design.md`,
  which replaces stop-when-empty with stop-after-idle: the room outlives its
  last member by two to four hours, far longer than any outage the retry has to
  cross, so the token resolves and the retry succeeds. How long the window is
  before this fires at all is the detection-delay entry below. Remove this entry
  when step 4 lands.

### `RoomData` can be constructed with a member who has no session

- **Where:** `src/main/scala/com/lunatech/pointingpoker/actors/Room.scala`
  (`RoomData`'s constructor and `joinUser`); the fixtures in
  `src/test/scala/com/lunatech/pointingpoker/actors/RoomSpec.scala` and
  `RoomSnapshotSpec.scala`.
- **Issue:** Step 5 made `sessions` the single authority `ValidateToken`
  reads, which introduced an unstated coupling: every `User` needs a
  `sessions` entry under its token, holding its id. Production upholds it by
  construction, since the only way to become a `User` is `ConnectToRoom`,
  whose id and name come from an already-resolved session. Nothing enforces
  it. The constructor is public, and all but three of the 48 fixture sites
  seed `users` with no `sessions` at all, so the suite normalises a state
  production cannot reach. That has already cost signal: three cases go red
  under a `Vote` rerouted onto `sessions` only because their fixtures lack
  sessions, which deviation 7 of the step 5 plan records as a trap for
  whoever fixes them. On the production side `joinUser` adds whatever `User`
  it is handed and `Join` checks nothing, which is unreachable today and
  load-bearing at step 4, where `Member` drops its token and `sessions`
  becomes the only place a token lives.
- **Resolution:** Scheduled as step 5a, between steps 5 and 4. A private
  `RoomData` constructor with a validating `RoomData.of(users, sessions)`
  factory, requiring the users' tokens to be a subset of the session keys
  with matching ids; a `withUsers` sugar for the common seed; and a
  test-scope `departed` extension for the retained-session-without-member
  state that step 5 made normal. Scala 3.8.4 propagates a private
  constructor to `copy` and `apply`, and every production mutator copies
  from inside the class, so the lock costs production nothing. Valid
  fixtures everywhere take the rerouted-`Vote` signal from four red cases to
  the removed-member case alone, on deviation 7's reasoning, which is
  acceptable only because that case guards it deliberately. Remove this entry
  when step 5a lands.

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
  reset. So detection lands one to two heartbeats after the close, depending on
  where in the cycle it fell: 16 to 31 seconds with no other room activity, or
  about a second if two broadcasts happen to follow the close. The 6-second grace
  period runs after that, which in production means a closed tab is announced 22
  to 37 seconds later, or about 7 with that traffic. The step 0 browser suite
  measured the worst case at 31.7 seconds to announce, against the 600ms grace
  period its test profile carried then. A participant closing their tab
  mid-meeting can show as present for far longer than 6 seconds afterward, not up
  to 6. Quote the range rather than a midpoint: a single figure gets remembered as
  a ceiling, and 16.7 seconds from that suite's table has been, though it is the
  nudged case at the old test grace period and nearer 22 in production. A silent
  cut shares this mechanism and is measured below, under "The grace period does
  not start until a heartbeat write to the dead connection fails"; the figures
  there agree with these once detection is separated from the grace period.

  The form users actually report is a reload rather than a tab close.
  `POST /rooms/:roomId/join` mints a fresh `userId` and token on every call, so
  a reload is a new participant to the room and the previous one lingers for
  the grace period: the user watches their own name sit in the participant list
  twice.

  **The ghost is not merely visible, its vote is counted, and that is the half
  worth acting on.** Observed manually and reproduced on 2026-09-05: a
  participant who votes, loses their tab, and rejoins inside the detection
  window leaves an entry that still carries `voted = true` and its estimation.
  With one live voter on 5 plus that ghost also on 5, the summary reports 5
  with a count of 2, so "Most voted estimation" is computed partly from a
  session nobody is sitting at. A team can commit to the wrong number on it.
  The replacement entry, having not voted, also blocks server-side auto-reveal
  until it votes or the ghost is pruned. **Step 3's tally does not help here**,
  which is worth stating because it looks like it should: the ghost carries a
  confirmed estimation, so it survives the filter on either field. Only an
  identity that does not duplicate fixes it.

  One thing that does hold, and only because of step 1: pruning the ghost
  cannot disclose the round. A ghost that never voted, alongside members who
  all have, satisfies a re-derived everyone-has-voted predicate the instant it
  is removed. The reveal latch means a membership change reveals nothing, so
  the pruning is safe. `e2e/room.spec.js`'s straggler-close case now covers
  this invariant directly. Its reload sibling only covers it vacuously, for
  the reason recorded on that case: the replacement participant a reload
  creates has never voted either.
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

  **A heartbeat reduction was weighed as a stopgap and rejected on 2026-09-05.**
  At 5 seconds the announce window falls from 22 to 37 seconds down to about 12
  to 17, so it shrinks the ghost rather than closing it, at three times the
  heartbeat traffic, and step 6 is expected within one to two weeks, which is not
  long enough for enough ceremonies to run into it. The trigger for reconsidering
  is step 6 slipping well past that window, or a team committing to a number a
  ghost's vote skewed. Note the dependency the estimate carries: step 6 sits
  behind steps 2 to 5 in the recorded order, so the stopgap becomes worth
  revisiting if that order holds but the schedule does not.

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

### No request payload is validated on any endpoint that takes one

- **Where:** `src/main/scala/com/lunatech/pointingpoker/Requests.scala:8`, `:18`
  and `:23`, and the three routes that consume them in
  `src/main/scala/com/lunatech/pointingpoker/API.scala:91` (`/join`), `:163`
  (`/vote`) and `:198` (`/edit-issue`). `create-room` takes no body.
- **Issue:** Every request body is a bare `String` with no constraint on it.
  `/vote` accepts an estimation outside the card scale, or an empty one; `/join`
  accepts an empty or arbitrarily long name; `/edit-issue` accepts any issue
  text, and that one is room-wide rather than confined to the sender's own row.
  `/vote` and `/edit-issue` require a session token resolving to a member of the
  room; `/join` requires only a room id, open joining being the intended
  behaviour, so there the room URL is the capability. Nothing escapes into HTML
  either: the page renders all three through Vue interpolation or `v-model` and
  uses no `v-html`. So this is a data-quality gap rather than an authorization
  or injection one. Body size falls back to the pekko-http default,
  `application.conf` configuring no parsing limits.

  One case is already scheduled to change behaviour. `RoomSnapshot`'s
  `hasEstimation` is `estimation.nonEmpty`, so an empty estimation reads as
  voted with no estimation, and step 4 re-expresses the field as the entry
  existing in `round.estimates`, which gives that same row the withheld-value
  icon. The target design records that beside `hasEstimation`.
- **Resolution:** Unscheduled, and the estimation half cannot close before the
  `scale` item at the end of `docs/roadmap.md`'s backlog: the server has no
  notion of a valid estimation, the card values being hardcoded in the client
  (`index.html:373`). Step 6 describes the endpoints with tapir, which buys
  types and shape rather than values, so an empty string satisfies the schema
  there too unless a validator is declared, which nothing plans. As with the
  rate-limiting entry above, the underlying gap is broader than any one symptom
  and wants its own piece of work rather than a patch per endpoint.

### The grace period does not start until a heartbeat write to the dead connection fails

- **Where:** `src/main/scala/com/lunatech/pointingpoker/sse/SSE.scala`
  (`heartbeatInterval` at `:28`, `keepAlive` at `:62`);
  `src/main/scala/com/lunatech/pointingpoker/actors/RoomManager.scala`
  (`ConnectionCompleted`/`ConnectionFailure`, both routed to `Room.Leave`);
  `src/main/scala/com/lunatech/pointingpoker/actors/Room.scala` (`Leave`'s grace
  period).
- **Issue:** The grace timer only starts once the room detects the disconnect,
  and detection itself rides on the room's own traffic rather than a clock. The
  heartbeat lives entirely inside the SSE stream as the `keepAlive` stage, not
  as a message to the room actor, so nothing notices a dead connection until a
  write to it fails, and in a quiet room the only writes are that 15-second
  heartbeat. Measured in a quiet two-person room: a cut participant took about
  35.5 seconds to disappear from the other participant's list, two 15-second
  heartbeat writes failing before the 4-second grace period (this branch's e2e
  profile; production defaults to 6 seconds via `application.conf:23`) even
  starts. Two runs agreed to within 2ms, so the number is deterministic rather
  than noisy. Any room traffic detects the cut sooner, which is why
  `e2e/room.spec.js`'s case forces a vote and a Clear rather than waiting it
  out, and the older `departureWhileCut` helper does the same. A participant
  who crashes, sleeps their laptop, or drops off the network in an otherwise
  quiet room lingers in everyone's list for up to about half a minute. The
  deliberate-close entry above records the same mechanism; the 35.5 seconds here
  is time to disappear under a 4-second grace period, so its detection half sits
  at the top of the 16 to 31 seconds quoted there rather than contradicting it.
- **Resolution:** Stays open, and deliberately unscheduled. Step 6's explicit
  leave endpoint does not close this: its beacon fires only on `pagehide` for a
  page being discarded deliberately, and a crash, a sleeping laptop, or a
  silent network drop reaches no such event, so detection still waits on a
  heartbeat write failing. Shortening the heartbeat would speed detection at the
  cost of traffic on every open connection, and no step in the target design
  schedules that trade.

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

### The issue editor has no cancel, and an unfocused draft is replaced by any room activity

- **Where:** `src/main/resources/pages/index.html` (`showEdit` and `doEdit`, the
  `issueFocused` handlers on the editable input, and `applySnapshot`'s
  `prev.issueFocused ? prev.currentIssue : s.currentIssue`).
- **Issue:** Two halves of one trap, both observed manually on 2026-09-05.

  Under snapshots every publish carries the current issue, so an in-progress
  edit is guarded by whether the editable input holds focus. The guard works
  while it does. But typing is local until committed, so the moment the box
  loses focus the next publish resets it to the room's committed value. The
  trigger is therefore any room activity at all, a vote, a clear, a re-vote or
  a join, and not merely a second person editing the title. Switching windows
  counts as losing focus, since browsers blur the focused element when the
  window does, so alt-tabbing away to copy a ticket title is enough to lose the
  draft while away. Focus was chosen over the `editing` flag deliberately: a
  guard keyed on `editing` would last until the user pressed the commit button,
  so opening the editor and clicking away would stop applying issue updates for
  the rest of the session, which is worse.

  The second half is the sharper one. `editing` is set true only by `showEdit`
  and false only by `doEdit`, which posts, so there is no cancel. A user parked
  in edit mode whose draft has been replaced by the room's value can only leave
  edit mode by pressing the check, which re-posts that value. Approving the
  external change is the only exit.
- **Resolution:** Deferred, with the product owner's reasoning recorded on
  2026-09-05: one product owner drives a ceremony, so the concurrent-edit case
  is rare. Note the exposure is wider than that case, per the trigger above.
  Scheduled as step 8 of
  `docs/superpowers/specs/2026-08-31-protocol-target-architecture-design.md`,
  the frontend rewrite, whose section 5 already assigns both an explicit cancel
  and a "someone else changed the issue while you were editing" affordance to
  that step. The trigger for pulling it earlier is anyone actually losing an
  edit in a real ceremony. Remove this entry when step 8 lands.

### The page and the browser suite depend on three public CDNs at runtime

- **Where:** `src/main/resources/pages/index.html` (the four asset tags at
  `:5`, `:90`, `:344` and `:345`); `e2e/fixtures.js` (the `assets` fixture).
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
  `.github/dependabot.yml` runs the `npm` and `github-actions` ecosystems
  weekly. It overlaps step 8, which bundles these assets anyway, so it is worth
  deciding with step 8 rather than ahead of it. The `npm` ecosystem was added
  on 2026-09-08, for `@playwright/test`, which nothing had updated before;
  vendoring the CDN assets is what this follow-up still carries.

### A cached page can outlive the server that served it

- **Where:** `src/main/scala/com/lunatech/pointingpoker/API.scala:66` and `:72`
  (`getFromFile(apiConfig.indexPath)`); `src/main/resources/pages/index.html`.
- **Issue:** Measured against the staged build, the page is served with
  `Last-Modified` and `ETag` and no `Cache-Control`, so a browser may apply
  heuristic freshness and reuse the stored page without revalidating. A deploy
  can therefore pair the previous page with the new server. Sessions do die with
  the process, but the page is a separate artifact, which is the gap in the
  README's restart paragraph. The `Cache-Control: no-cache` at `API.scala:132`
  covers the SSE response only. The step 1 page against a step 2 server is
  cosmetic: `showUserEstimation` reads `u.estimation`, which is `""` for another
  participant before the reveal, so the withheld-value marker is missing from
  other rows until the page revalidates, while the recipient's own row and the
  post-reveal table are unaffected. Step 3a is already worse than that. A page
  cached before it has no `disabled` binding on the cards and no early return in
  `vote()`, so it presents a live deck over a closed round and discards every
  click in silence. Nothing detects either mismatch, and a version field on the
  wire would not have caught this one: step 3a changed which votes the server
  accepts without changing the snapshot's shape at all.
- **Resolution:** Open, and worth folding into step 6 of
  `docs/superpowers/specs/2026-08-31-protocol-target-architecture-design.md`.
  `Cache-Control: no-cache` on the two `getFromFile` routes closes it: the page
  is then always revalidated, costing one conditional request that answers 304
  with no body, where `no-store` would re-send all 19.7KB per load. The header
  and its directive are already imported at `API.scala:18-19` for the SSE
  response, so it is one line, and step 6 already touches these routes to add
  the leave endpoint and make `/join` idempotent. Doing it on its own branch
  instead would add an `API.scala` conflict to the stack's ordered rebase, and
  reaching the symptom at all needs a deploy to land between a page load and the
  next vote, so step 6 is soon enough. Step 8's frontend rewrite would
  close it structurally with fingerprinted assets if step 6 does not.

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

### The target design's citations and step claims go stale as its steps land

- **Where:**
  `docs/superpowers/specs/2026-08-31-protocol-target-architecture-design.md`,
  across its `file:line` citations.
- **Issue:** The design was written against the pre-step-1 codebase and cites it
  throughout. Step 1 rewrote much of `index.html` and `Room.scala`, so a
  citation can now land on unrelated code while still reading as current. Step 2
  swept the `index.html` citations, and corrected `clear()` with `reVote()` to
  `Room.scala:97-102` as it stood then (cited three times as `:85-89`) and
  `RoomSpec`'s hand-constructed reconnect and `Room.Running` sites
  (`RoomSpec.scala:194`, `:237`, `:256`, cited as `:185`, `:231`, `:257`).
  Citations into the rest of `Room.scala`, and into `RoomManager.scala`,
  `SSE.scala` and `API.scala`, are unverified. `RoomSpec.scala`'s four are all in
  the two sentences above. Step 3 refreshed the `index.html` citations its own
  two hunks shifted. Step 5 swept the `Room.scala` citations in both the design
  and this file. In the design it renumbered the command-path list its own diff
  shifted, annotated the `ValidateToken` sentence whose code it deleted, moved
  step 2's `:97-102` sites, the live `reVote` claim inside step 1's paragraph
  among them, onto the numbers this step's own `joinUser` hunk gave them, and
  corrected others that had gone stale from further back in the file's history,
  unrelated to this step's own diff: the `SessionToken` opaque type line, the
  `Leave`/`ConfirmLeave` timer range twice over (once for the keying, once for
  the stale-ref branch), and the `Behaviors.withTimers` pair. Those last
  resolved against the pre-"Step 1: Snapshot protocol" file the design was
  originally written from. In this file it corrected its own pointers into
  `Room.scala`, for `reVote`, `vote` and the revealed-round refusal, and into
  the design, for the additive-views passage, the re-vote tally argument, and
  the `clear`/`reVote` removal rule, all shifted by the same `joinUser` hunk and
  by the note step 5 inserted into the design.
  They sit in four entries further down, from "A tied vote is broken by
  JavaScript key order" to "A reload during a revealed round locks the
  participant out of it", and none in this one.

  Claims go stale the same way, and a correct line number makes one more
  convincing rather than less. The design recommends that two `RoomSpec`
  reconnect cases be converted to drive `ConnectToRoom` at step 1; step 1 added
  a case in `RoomManagerSpec` instead and left those two as they were, so the
  sentence now describes code that a correct citation leads straight to. That
  one is annotated. So is the argument list's item 5, which described the
  pre-reveal leak as live after step 2 closed it. Those are two shapes, not one:
  a step's paragraph saying what it would do rather than what it did, and an
  argument paragraph describing a defect a later step has since closed. Both are
  unswept beyond the two annotated here.

  Step 3 swept the design's `e2e/room.spec.js` claims and found a third kind:
  the `test.fail()` ledger, described as live in two passages that steps 1 and 3
  between them emptied. Each gained a landed-state note rather than a re-tense.
  Annotating is what the two above do, and it keeps the step sections in one
  voice whether or not they have landed; re-tensing makes one paragraph read as
  history while its siblings stay in the planning present, and a half-finished
  one leaves a paragraph contradicting itself. The same claim in
  `docs/superpowers/specs/2026-08-30-e2e-testkit-design.md` (`:8`, `:47-48`,
  `:318`) is outside this entry's scope and still reads as live. Step 3's sweep
  also missed the vote-survival pointer, stale since before step 5's branch and
  corrected by it to `e2e/room.spec.js:399`.

  A fourth kind, also unswept, is a delivered plan describing code that no longer exists:
  `docs/superpowers/plans/2026-08-31-protocol-architecture-0-playwright.md:876`
  says the `departureWhileCut` helper is "shared with a green control case",
  which step 3 removed, and it says so under a heading directing the reader to
  trust it over the block above. Its case table at `:40-41` lists both deleted
  controls as green, which is correct as a record of what step 0 was told to
  build. The plan is delivered, so this is recorded rather than edited.

  A sweep has to match three shapes, and missing one is how step 2's first sweep
  went wrong: `` `file.ext:NN` ``, a bare `` `:NN` `` continuing whichever file
  was named last, and a bare `` `NN-NN` `` with no colon at all. No totals are
  given here on purpose. Three review rounds produced a different count each
  time, and the count was never what a sweep needed.

  Two traps are worth naming, both of which caught the step 2 sweep. Checking
  what sits at the cited line is not enough: the question is whether the
  sentence's claim is true of it, and two citations passed the first check and
  failed the second. And some citations describe the pre-step-1 code on purpose,
  as part of arguing why the design is what it is, so renumbering those makes
  the prose false rather than current. Several in `index.html` were left alone
  for that reason, as was the `Room.scala` pair in the design's own step 1
  paragraph, which lists what step 1 removed. The exception is a present-tense
  claim about live code that happens to sit in a step's paragraph: step 5
  renumbered the `reVote` claim in step 1's paragraph for that reason, while
  leaving the pair beside it alone.

  Numbers the prose reasons from are a separate case, and renumbering is not
  available for them. The step-ordering argument for step 4 rests on `RoomSpec`
  being 510 of the project's 1,434 test lines; step 5 measured 693 of 1,706.
  Updating the figures would rewrite the cost estimate the argument is made of,
  and leaving them bare states something false in the present tense, so step 5
  marked them as the design-time measurement and noted that the file has grown
  since. Prefer that to either where a figure carries an argument rather than
  locating code.
- **Resolution:** Unscheduled. Steps 3 to 9 are built from this document, so
  whoever opens the next step is best placed to sweep the files that step
  touches, verifying the claim and not only the line. Remove this entry once the
  remaining citations have been verified.

### A citation correct at one layer of a stack goes stale at the next

- **Where:** `docs/known-issues.md` and
  `docs/superpowers/specs/2026-08-31-protocol-target-architecture-design.md`,
  whenever a stacked branch inserts lines into a file that another layer cites.
- **Issue:** A line-number citation is only true of the tree it was written
  against. A branch stacked on top that inserts lines above the cited line
  inherits a number that is now wrong, and since it never touched the citation,
  the break does not appear in its own diff. Reading the diff cannot find it.
  Only re-resolving the citation against the tree can. Rebasing makes it worse
  rather than better: every parent that grows moves the child's targets again,
  so one number can be corrected and go stale twice in an afternoon.

  Two live instances, both found and fixed on 2026-09-08, and both already stale
  before the rebase that surfaced them. The design's `e2e/room.spec.js`
  vote-survival citation read `:294` on both children while the case sat at
  `:313` on 3a and `:327` on 3b, and step 3's review then moved it again by
  inserting a case above it. This file's pointer to the design's additive-views
  passage read `:988-990` on 3a, where 3a's own additions had already carried the
  passage to `:1014-1016`.

  A third, on 2026-09-09, and the one the sweep-every-changed-file rule below
  covers rather than the re-sweep. 3b's own additions to `e2e/room.spec.js`, an
  import, a helper call in the case above, and the withheld-value case's own
  re-vote extension, carried the re-vote tally case down past its pointer,
  leaving this file's reference to it, written on 3a, one case short. The rebase
  moved nothing here: that file is byte-identical from 3a's feature commit
  through 3b's base, so the pointer was still correct when 3b started. Its shape
  is worse than either above: the stale number landed on the neighbouring tally
  case, "the tally counts only the votes that were cast", so it resolved to
  something plausible rather than to nothing. The check the entry above calls
  insufficient, looking at what sits on the cited line, passes here. Only asking
  whether the sentence's claim is true of that line fails it.

  The failure is structural rather than careless, which is why discipline alone
  has not held. Nothing in CI resolves a citation, `grep` cannot tell a stale
  number from a current one, and the layer that breaks a citation is never the
  layer that wrote it.
- **Resolution:** Unscheduled, and discipline rather than tooling for now. Two
  rules cover it. Sweep the citations in every file the branch changed rather
  than the citations in the diff, and sweep as the branch's last act: step 3
  swept fourth of seven, the very next commit invalidated one of the two
  citations that sweep had just fixed and had to re-fix it in passing, and a
  later one broke a third that the branch's final commit was left to clean up.
  Then re-sweep after every rebase, since a rebase moves targets without
  touching a line of prose. Tooling could come sooner and cheaper than first
  written here, but only scoped to what a script can know. Resolving a citation
  is not automatable, since nothing tells a script what the cited line ought to
  say, and verifying the claim rather than the line is the part the entry above
  insists is the real work. What is automatable is narrower: flag a citation
  when the cited file gained or lost lines above the cited line after the citing
  prose was written. That is a git-based shift detector, it would have caught
  the third instance above, and it needs nothing from step 8, so it can be a CI
  step whenever someone wants one. It yields suspicions for a human to check
  rather than verdicts. Remove this entry if that check lands.

### A tied vote is broken by JavaScript key order, not by a rule anyone chose

- **Where:** `src/main/resources/pages/index.html:365`, the `votesSummary` sort,
  read at `:282` under the "Most voted estimation" heading at `:276`.
- **Issue:** The comparator is `function (a, b) { return b[1] - a[1]; }` over
  `Object.entries(tally)`. It reads only counts, and `Array.prototype.sort` is
  stable, so a tie falls through to `Object.entries` order. That order is not
  insertion order: array-index keys come first in ascending numeric order, then
  the rest in insertion order. Against the cards at `:373` that puts `0` to `89`
  first and leaves `0.5` and `?` behind all of them. So a 2-2 split on `5` and
  `8` reports `5`, a 2-2 split on `0.5` and `89` reports `89`, and a 2-2 split on
  `0.5` and `?` is decided by `s.users` iteration order, the one case not
  determined by the values alone. A 2-2 split is an ordinary planning poker
  outcome, not an edge case. It is the same failure class as the non-voter tally
  step 3 fixed, the headline decided by something other than the votes, but a
  good deal milder: the table at `:297-300` renders every row and count beside
  the headline at `:276-282`, so the tie is visible to anyone who looks down
  rather than hidden.
- **Resolution:** Unscheduled, and deliberately not decided here, because the
  rule is a product question rather than a bug with one right answer.
  Lowest-wins, highest-wins, and refusing to name a winner while showing the tie
  are all defensible, and the third is worth weighing since the table already
  shows it. Whoever builds step 9's history views should decide it there:
  `docs/superpowers/specs/2026-08-31-protocol-target-architecture-design.md:1018-1020`
  already lists highest and lowest, majority, and most voted as additive views
  over the same `[(score, count)]` shape, so they would otherwise inherit this
  tie-break by accident. The server builds `distribution` itself, so what carries
  over is the count-only comparator and the stable sort, not `Object.entries`
  order. Remove this entry once a rule is chosen and implemented.

### A Show during a partial re-vote tallies two rounds as one distribution

- **Where:** `src/main/scala/com/lunatech/pointingpoker/actors/Room.scala:97-99`
  (`reVote` keeping every estimation) and `:83` (`vote` overwriting one), with the
  tally at `src/main/resources/pages/index.html:355` read at `:276-282` under the
  "Most voted estimation" heading.
- **Issue:** A `reVote` clears every confirmation and keeps every estimation, so a
  round that some participants have re-voted and others have not holds answers to
  two different rounds at once. A Show there counts both. Alice, Bob and Carol
  finish a round on 8, 8 and 3, somebody presses Re-vote, Carol re-votes to 5, and
  a Show before Alice and Bob pick reports 8 as the most voted estimation: two
  participants' answer to the previous round and nobody's answer to this one.
  Since step 3a a revealed round refuses every vote (`Room.scala:80`), so the
  holders of a stale value cannot replace it in place. The recovery is another
  Re-vote, which reopens the round for everyone, or a Clear.

  This follows from two deliberate decisions, which is why it is recorded rather
  than fixed. `reVote` keeps the values so that an estimation without a
  confirmation can mean a re-vote in progress, and the summary counts exactly the
  non-blank estimation cells the table beside it displays, which
  `docs/superpowers/specs/2026-08-31-protocol-target-architecture-design.md:1318-1331`
  argues for and `e2e/room.spec.js:338-340` asserts. It is the same failure class as
  the tie-break above, a headline decided by something other than this round's
  votes, and it is mitigated the same way but only halfway: the table renders a
  stale row with no check-circle (`index.html:318`), so anyone looking down from
  the headline can see who has not confirmed. The distribution itself carries no
  such mark, and it is the distribution that names the winner.
- **Resolution:** The durable fix is the roadmap's unchecked entry for showing the
  previous estimate beside the current one, which comes out of step 3a for this
  reason: once a revealed round refuses votes, a changed mind is a room-level act
  and the room's two answers are worth reading together. Neither scheduled step
  closes it. Step 6 is about a refusal reaching the client that cast it, not about
  which round an estimate belongs to. Step 4 keeps these semantics on purpose: the
  design's `:606-613` removes estimates only on `clear` or the round ending, with a
  `reVote` leaving the values in place and clearing `confirmed`, which is the state
  `Estimate` exists to express. Remove this entry once the previous estimate is
  rendered beside the current one, or once a rule is chosen that clears an
  estimation on `reVote`.

### A vote refused by a revealed round is silent, and can read as accepted

- **Where:** `src/main/scala/com/lunatech/pointingpoker/actors/Room.scala:80`
  (the refusal), `src/main/scala/com/lunatech/pointingpoker/API.scala:158-165`
  (`/vote` answering `NoContent` whatever happens) and
  `src/main/resources/pages/index.html:517-527` (`vote()`'s early return and its
  optimistic flag).
- **Issue:** Step 3a made a revealed round refuse every vote, and nothing tells
  the participant. The two things that should stop the click before it happens,
  the `disabled` binding on the cards and `vote()`'s early return, both read
  `votesRevealed`, which only refreshes over SSE. A client whose stream is dead
  therefore still has a live deck over a closed round, and `POST /vote` returns
  `204` either way.

  What makes it worse than a no-op is the optimistic assignment, and what step 3a
  changed there is not the display but what stands behind it. Take a
  participant with a re-vote pending, so `voted` is false, `estimation` is still
  `5`, and card 5 shows in the pale unconfirmed style. Their stream is cut and the
  "Connection to the room was lost" banner is up. Somebody else presses Show.
  They click 8: `vote()` sets `ownVoteConfirmed = true`, and because the
  selected-card branch keys on `e === user.estimation` it is **card 5** that turns
  the confirmed dark red, for a vote of 8 that never landed. No snapshot arrives
  to correct it, because the stream that would carry it is the one that is down.
  The false card is not new: before step 3a the same click painted the same card
  5, since the stale `user.estimation` was all the branch ever had to key on. What
  is new is that the vote of 8 no longer lands behind it, so what was a display
  error on a dead stream is now a lost vote as well.
- **Resolution:** Scheduled as step 6 of
  `docs/superpowers/specs/2026-08-31-protocol-target-architecture-design.md`,
  whose ask pattern gives `/vote` a real result and makes the refusal reportable
  when it happens, which is what section 5 already says the reply is for. The POST
  travels over HTTP and works when the SSE stream does not, so the answer reaches
  precisely the client that cannot see the state. What is left after that is
  general: a client with a dead stream is stale in every respect, which is the
  backlog's connection-liveness watchdog and not this entry. Remove this entry
  when step 6 lands.

### A reload during a revealed round locks the participant out of it

- **Where:** `src/main/scala/com/lunatech/pointingpoker/actors/RoomManager.scala`
  (`RequestSession`'s fresh `userId` per call) and
  `src/main/scala/com/lunatech/pointingpoker/actors/Room.scala:80`.
- **Issue:** `POST /join` mints a new `userId` on every call, so a reload arrives
  as a new member with no estimation. Since step 3a a revealed round refuses every
  vote, including a first one, so that member cannot vote at all until somebody
  presses Re-vote or Clear. The rule intends exactly this for someone who joins
  after the reveal, and a reloader is not that person: they were in the round a
  second earlier.

  It is reachable by following the app's own advice. A session that outlives its
  room, or a stream that fails terminally, produces "Your session has ended.
  Please reload the page to rejoin." (`index.html:447-460`), and the reload drops
  them into a round they can only watch.
- **Resolution:** Scheduled as step 6, whose idempotent `/join` resolves the
  existing cookie rather than minting over it, so a reload returns as the same
  member holding the same estimation instead of as a stranger with none. That
  leaves only the rule working as designed: somebody who genuinely had not voted
  when the round was revealed stays out of it until Re-vote. Remove this entry
  when step 6 lands.

### A reveal with votes still pushes the participants list down

- **Where:** `src/main/resources/pages/index.html:273` (the summary block, under
  `v-if="votesRevealed && votesSummary.length"`) sitting above the participants
  table at `:308`.
- **Issue:** Revealing a round with votes in it inserts the most-voted card and
  the distribution table between the buttons and the participants list, so the
  list a facilitator is reading jumps down by the height of that block. The
  neighbouring case is fixed rather than open: the frozen-round notice at `:244`
  used to appear under `v-if`, which resized the estimation card sharing its row
  (`.estimation-card` is `height: 100%` at `:51`) and shifted every row below it
  even in a room where nobody voted and no summary appeared. That notice now
  toggles `visibility` and holds its line at all times, pinned by "the reveal
  notice claims its space before the reveal" in `e2e/room.spec.js`.
- **Resolution:** Left to step 8's rewrite, and deliberately not fixed the same
  way. Reserving the summary block's space would put an empty card and an empty
  table on the page for the whole pre-reveal round, which is a worse page than
  one that grows when there is something to show: unlike the notice, this block
  is real content arriving, and the movement is honest feedback that the reveal
  landed. What the rewrite should carry over is that the shift is the block's
  position rather than its existence, so placing the participants list above the
  results would settle it without hiding anything. Remove this entry when step 8
  lands or decides otherwise.

### Only a real e2e failure exercises the artifact upload path

- **Where:** `.github/workflows/ci.yml`, the `actions/upload-artifact` step at the
  end of the `test` job, now guarded by `if: ${{ !cancelled() }}`.
- **Issue:** The step exists to hand back Playwright traces when the browser suite
  fails. Under its original `if: failure()` guard it never ran on a green job, so
  a Dependabot PR bumping it went green while proving nothing about the new
  version: the runner resolved and downloaded the action during `Set up job` and
  then skipped it. PR #396 bumped it from 4 to 7, three majors at once, and its
  run 34356638195 resolved `actions/upload-artifact@v7` to SHA `043fb46d` and
  passed without invoking it. The risk was bounded, since a step that only runs
  on failure can never turn a passing run red, but it landed where it is least
  welcome: the first real execution would be a failing e2e run, which is exactly
  when the traces matter. Every breaking change in that range was runtime-level
  rather than input-level (v5 added Node 24, v6 made `node24` the default and set
  a runner floor of 2.327.1, v7 moved the action to ESM), which is the class of
  failure that shows up the instant the action starts.
- **Resolution:** Half closed by the `!cancelled()` guard, which starts the action
  on every build for a few seconds: it boots the declared runtime, loads the
  bundle, validates the inputs, then globs an empty `test-results/` that
  `if-no-files-found: ignore` turns into a no-op uploading nothing. That is enough
  to fail a bump PR outright on any runtime-level break, which is the likely one.
  It does not reach the zip, the upload or the artifact API, so that half still
  first runs on a genuine failure and the probe below stays the way to check it.
  Branch off the Dependabot branch so the real action version is under test, add a
  spec that fails on purpose *after* reaching a real room so the retained trace has
  the shape of a genuine failure, open it as a **draft** PR against `main` (the
  head carries the bump, so the base does not affect which version runs), then read
  the artifact and delete the branch. The spec is the whole of it:

  ```js
  // e2e/artifact-probe.spec.js
  import { test, expect, nameInput, participantRow } from './fixtures.js'

  test('deliberate failure that leaves a trace behind', async ({ page, origin }) => {
    await page.goto(`${origin}/`)
    await nameInput(page).fill('Alice')
    await page.getByRole('button', { name: 'Create' }).click()

    await expect(participantRow(page, 'Alice')).toHaveCount(1)
    await expect(participantRow(page, 'Alice')).toHaveCount(2)
  })
  ```

  The signal is not the job status, which is red by design. It is whether
  `playwright-artifacts` appears on the run with a chromium and a firefox
  directory inside, and whether the traces survive a download. Run 34361420129 on
  2026-09-09 is the worked example for v7: the step succeeded on the failed job
  and returned 1,029,297 bytes holding `trace.zip` and `error-context.md` per
  project, both archives intact, with v7's new `archive` input defaulting to
  `true` and so matching v4's behaviour. Note that the guard carries a comment
  saying why it is not `failure()`, since reverting it to the obvious-looking
  thing would silently reopen the runtime half of this entry. Remove this entry
  when the step is retired, or when something exercises the upload path itself on
  an ordinary run.

## Traceability note

The original source for the phased roadmap was a planning conversation kept outside
this repository. It has been copied into `docs/roadmap.md` so it is versioned
alongside the code it describes and can be updated in the same PRs that make
progress on it.
