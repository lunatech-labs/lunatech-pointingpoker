# Planning Poker Roadmap

This tracks the multi-PR modernization effort this app is going through. It exists
in the repo (rather than as a private note) so anyone looking at a given PR or spec
under `docs/superpowers/` can see where it fits in the larger plan, and so the plan
itself gets updated as work lands rather than drifting out of sync with reality.

Phases are ordered by dependency, not just importance: several later items only
make sense once an earlier one exists.

## Phase 1: Transport + identity foundation

This unlocks everything else, since the security fix (item 2 below) only makes
sense once client actions are discrete HTTP calls rather than fields trusted
inside a long-lived socket payload.

- [x] Replace WebSocket with SSE (server to client push) + HTTP POST (client to
      server commands). See `docs/superpowers/specs/2026-08-18-sse-transport-design.md`
      and `docs/superpowers/plans/2026-08-18-sse-transport-implementation.md`.
- [x] Reconnect-aware `Join`: upsert an existing participant by id instead of
      always appending a new one. Landed alongside the transport swap once a
      connection's identity (its `ActorRef`) could be told apart from a stale one.
- [x] Session/identity mechanism: validate `userId` per request, closing the
      spoofing gap the transport swap deliberately left open. This was more urgent
      than originally scoped because the SSE migration made `userId` travel in the
      query string of every action and the SSE connect, landing repeatedly in
      server access logs, browser history, and proxy logs, instead of being minted
      once server-side per WebSocket connection as before.
- [ ] Switch command endpoints (`vote`, `show`, `clear`, `revote`, `edit-issue`)
      from fire-and-forget (`roomManager ! ...`) to the ask-pattern already used by
      `create-room`, so `Room`/`RoomManager` can reply with a real result (applied /
      room not found / not a member) instead of the API always answering `204`
      regardless of what happened. Natural to build alongside the identity
      validation above, since both need the same request/response plumbing. To be
      studied in its own follow-up PR rather than bundled into the identity work
      blindly.

## Phase 2: Durable session identity

Independent of Phase 1, can run in parallel.

- [ ] Durable `sessions` store (slug, scale, created_at) so a session survives a
      process restart and weeks of inactivity. Today a `Room` actor and all its
      state die the moment the last person leaves.
- [ ] Slug-based session ids replacing raw UUIDs (normalization, custom name, or
      auto-generated adjective-noun).
- [ ] Reject unknown slugs (404) instead of the current behavior of silently
      creating an empty room for any UUID.
- [ ] Add a `scale` concept to the domain model (fibonacci vs. t-shirt, fixed at
      creation). Doesn't exist today; everyone gets the same hardcoded client-side
      list.

## Phase 3: Frontend framework rewrite

Do this after Phase 1 is proven on the current page, so a new framework and a new
transport aren't being debugged at the same time.

- [ ] Migrate off Vue 2 (tentatively Vue 3, framework choice still open).
- [ ] Component structure, TypeScript, build tooling, automated tests.
- [ ] Appearance: light/dark theme (default to system preference), responsive/mobile
      layout.

## Phase 4: Voting workflow features

Backend logic can start earlier, but the UI is most efficient to build once,
directly in the new frontend.

- [ ] Roles: voting participant vs. observer, self-service switching, excluding
      observers from vote counts and status indicators.
- [ ] Server-authoritative auto-reveal. Today "everyone voted" is computed
      client-side only and never told to the server or other clients; it needs to
      become real backend logic. Scheduled as Problem E of
      `docs/superpowers/specs/2026-08-28-sse-snapshot-protocol-design.md` (PR 1),
      which moves the rule to `RoomData.isRevealed` and carries the result in the
      room snapshot. Check this off when that lands.
- [ ] Latched reveal, deliberately separated from the item above. That change
      moves "everyone voted" to the server without altering what it means, so
      reveal stays a live derivation over the current participant set and can flip
      either way when that set changes mid-round: a participant joining an
      auto-revealed room hides the votes again, and the last non-voter leaving
      reveals them with no facilitator action. Both are today's behaviour, kept
      deliberately so a connectivity fix does not smuggle in a product change.
      Latching means `vote()` setting `revealed = true` once every participant has
      voted, so reveal becomes a one-way door until `clear()` or `reVote()` reopens
      it. It is roughly one line plus dropping the stored-flag term from that
      spec's `visibleState`, and the two characterization tests it would invert are
      already named there. Worth doing on its own so the behaviour change is
      reviewed as one, and a natural companion to the re-vote refinement and
      timer-based fallback reveal items below, which both touch the same rule.
- [x] Guarantee SSE broadcast delivery before the above is trustworthy. Fixed the
      causes rather than compensating for them: a joining user's full catch-up
      replay now goes out as a single batched message instead of one send per
      event, removing the one systematic, room-size-scaling burst against the
      outbound buffer; the source switched to `OverflowStrategy.fail` with a small
      non-zero buffer, since a zero-size buffer turned out to bypass whichever
      overflow strategy is configured entirely rather than applying it at a
      zero-element threshold. A failed connection self-heals through the client's
      existing reconnect-and-replay path, now on an explicit `retry` interval this
      app controls instead of each browser's own unpinned default. A grace period
      before a disconnect is announced (`Room.Leave`/`ConfirmLeave`) keeps an
      ordinary reconnect invisible to the rest of the room instead of showing as a
      leave-then-rejoin flicker. See
      `docs/superpowers/specs/2026-08-24-sse-backpressure-design.md`.
- [ ] Re-vote refinement: prior-vote tracking, confirm-vs-change distinction, the
      pre/post-reveal visibility rules from the spec. The current `ReVote` command
      is a stub.
- [ ] Results display polish: pin `?`/`Infinity`, highlight lowest/highest
      estimate, group participants by estimate, tap-to-highlight interaction.
- [ ] Round history within a session (running list of context to final estimate
      per round).
- [ ] Timer-based fallback reveal (auto-reveal after a configurable timeout
      regardless of stragglers).

## Phase 5: Lower priority / hardening

- [ ] Idle indicator (flag a user inactive after roughly one minute of no input,
      broadcast to the room).
- [ ] Room-creation hardening (rate limiting, caps on unauthenticated room
      creation).
- [ ] Garbage collection for abandoned or never-joined rooms. Not in the original
      list; found during review of the SSE transport PR. A room is only removed
      from memory when its last joined participant leaves
      (`actors/RoomManager.scala`), but `POST /create-room` no longer requires a
      completed join to keep a room alive, so an abandoned tab, a network failure
      before `/join`, or stray traffic can accumulate rooms that live for the life
      of the process. Becomes more pressing once Phase 2 makes sessions durable
      across restarts, since an idle-expiry policy will be needed there too. See
      `docs/known-issues.md`.
- [ ] Restart-warning / maintenance-mode UX and zero-downtime deploy orchestration.
      Explicitly deferred to a follow-up spec, out of scope until then by design,
      not by oversight.

## Backlog: suggested, not yet prioritized

- [ ] Client-side connection-liveness watchdog: reset a timer on every SSE
      heartbeat/message and show the "connection lost" banner if none arrives
      within roughly 2x the heartbeat interval (~30-40s), instead of relying
      solely on `EventSource.onerror` (which only fires once the browser's
      networking stack itself gives up, and doesn't reliably or quickly catch
      a real client-side network drop — confirmed by manual testing: killing
      the server surfaces the banner promptly, but simulating offline via
      browser devtools does not). This is newly possible because SSE
      heartbeats arrive as actual `message` events visible to app code
      (`index.html`'s `onmessage`); the old WebSocket transport's ping/pong
      keepalive frames were invisible to JavaScript, so this watchdog wasn't
      buildable under the old transport at all. Not a migration regression,
      an improvement the transport swap unlocked.
- [ ] Per-user command sequencing/idempotency to guard against HTTP POST
      reordering (see `docs/known-issues.md`).
- [ ] Copy/export round history at end of session.
- [ ] Presentation/TV-mode read-only view for screen sharing.
- [ ] Custom voting scale beyond fibonacci/t-shirt.
- [ ] Keyboard shortcuts for voting.
- [ ] Per-session auto-reveal toggle (some teams may want manual-only reveal).
- [ ] Undo/re-hide after an accidental reveal.

## Considered and set aside

Given the current scope (small internal tool, self-hosted, one to two hour
sessions):

- Jira/ticketing integration (auto-pull ticket titles from links).
- Multi-item backlog queue (pre-loaded list of tickets to estimate in order).
- Participant avatars/colors, vote-confidence flags.
