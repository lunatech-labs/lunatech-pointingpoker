# Planning Poker Roadmap

This tracks the multi-PR modernization effort this app is going through. It exists
in the repo (rather than as a private note) so anyone looking at a given PR or spec
under `docs/superpowers/` can see where it fits in the larger plan, and so the plan
itself gets updated as work lands rather than drifting out of sync with reality.

Phases are ordered by dependency, not just importance: several later items only
make sense once an earlier one exists.

`docs/superpowers/specs/2026-08-31-protocol-target-architecture-design.md`
supersedes the phases below with a ten-step ordered path numbered from zero, and
each item here notes the step that absorbs it. Steps 0 to 6 close every
documented defect; 7 is a usability improvement and 8 and 9 are product work.
Items that stay in a phase are product decisions built on that target rather
than steps toward it.

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
      validation above, since both need the same request/response plumbing.
      **Becomes step 6**, alongside idempotent `/join` and the explicit leave
      endpoint.

## Phase 2: Room identity

Reduced to one item. The target design establishes that teams pin one room URL
for years and want blank state at the start of each meeting, so what was wanted
here was slug stability rather than durable state.

- [ ] Slug-based room ids replacing raw UUIDs, auto-generated three-word names
      (for example `nice-brave-otter`), unique among the rooms currently in
      memory. **Becomes step 7.**

Dropped from this phase, recorded so the reasoning is not re-derived:

- *Durable `sessions` store*, so a session survives a restart and weeks of
  inactivity. Dropped entirely. Nothing is persisted; the trigger that reopens it
  is someone wanting round history across sessions.
- *Reject unknown slugs (404)*. Dropped with the store, and reclassified: silent
  auto-create is what the pinned-URL usage actually wants. See
  `docs/known-issues.md`.
- *A `scale` concept in the domain model*. Moved to the end of the backlog below.
  Not customer-asked, and the target design demonstrates it fits as an additive
  field whenever it is wanted.

## Phase 3: Frontend framework rewrite

**Becomes step 8**, which waits on steps 1 and 6. Do this after the protocol is
proven on the current page, so a new framework and a new transport aren't being
debugged at the same time.

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
      become real backend logic. **Moves into step 1**, where `round.revealed` is
      set by `Show` and by the vote that completes the round, and every snapshot
      carries it. It lands as a latch rather than as a standing derivation, which
      takes the auto-reveal half of the item below with it; section 3 of that spec
      says why. Check this off when that lands.
- [ ] Latched reveal, narrowed. **The auto-reveal half moved into step 1 and is no
      longer a product decision.** An earlier version of this item kept reveal as a
      live derivation over the current participant set, so that a connectivity fix
      would not smuggle in a product change, which meant accepting two flips when
      that set changed mid-round: a joiner re-hiding an auto-revealed room, and the
      last non-voter leaving revealing it with no facilitator action. The second
      stopped being acceptable once step 2 made reveal the moment estimates reach
      the wire and step 6 made a reload a departure. Together those turn a display
      quirk into an unrecoverable disclosure that any participant can trigger by
      pressing F5, so `round.revealed` is now set by the vote that completes the
      round and cleared only by `clear()` or `reVote()`. The accidental un-reveal
      closes at step 1 with it. What the latch does not remove is a departure
      followed by a vote from someone still present, since the check still ranges
      over the live member set; that residual is accepted in section 3 of that
      spec, along with the option not taken.
      What is still a product question is whether a revealed round should survive a
      `reVote`. That part still synergizes with the observer role above, since an
      observer changes what "everyone has voted" means. **Ship what remains with the
      backlog's undo/re-hide**, since the exits that survive (`clear`, `reVote`)
      either destroy the round or make everyone vote again.
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
- [ ] A facilitator-recorded round outcome: teams often resolve a split by
      talking it out rather than re-voting, and the app has no concept of a
      settled estimate at all. A command plus a snapshot field. New here, and
      **step 9** pairs it with the item below. The interaction for selecting the
      estimate is not defined yet; what is fixed is that it acts on a round whose
      estimates every participant can already see.
- [ ] Round history within a session (running list of context to final estimate
      per round), held in memory on the room and gone when it stops. **Becomes
      step 9** together with the recorded outcome above, since a settled estimate
      you cannot look back at is half a feature. Only a revealed round enters it:
      the record travels to every participant unredacted, so a round nobody
      revealed would leak its own vote spread.
- [ ] Copy/export round history at end of session. Promoted from the backlog to
      sit with step 9: with history held only in memory this is the sole way to
      keep a session's rounds, which makes it part of the feature rather than a
      convenience beside it.
- [ ] Timer-based fallback reveal (auto-reveal after a configurable timeout
      regardless of stragglers). **The least settled item in this phase**, and
      unlike its neighbours not just a field plus a predicate: it needs a timer, a
      publish on a transition nobody commanded, and four open product decisions.
      Does it run for every round or not always; does the facilitator start it;
      what duration and is it fixed, per room or per round; and can a running
      countdown be cancelled when discussion breaks out. The countdown is also the
      first roadmap item wanting a UI surface of its own.

## Phase 5: Lower priority / hardening

- [ ] Idle indicator (flag a user inactive after roughly one minute of no input,
      broadcast to the room). A field on the wire, but not only a field: it needs
      server-side activity tracking, a timer, and a publish on a transition
      nobody commanded.
- [ ] Room-creation hardening (rate limiting, caps on unauthenticated room
      creation).
- [ ] Garbage collection for abandoned or never-joined rooms. Not in the original
      list; found during review of the SSE transport PR. A room is only removed
      from memory when its last joined participant leaves
      (`actors/RoomManager.scala`), but `POST /create-room` no longer requires a
      completed join to keep a room alive, so an abandoned tab, a network failure
      before `/join`, or stray traffic can accumulate rooms that live for the life
      of the process. **Absorbed by step 4**, which stops a room two to four hours
      after its last connection goes, joined or not. See `docs/known-issues.md`.
- [ ] Restart-warning / maintenance-mode UX and zero-downtime deploy orchestration.
      Explicitly deferred to a follow-up spec, out of scope until then by design,
      not by oversight. More load-bearing than it looks now that nothing is
      persisted: a restart takes presence, the round, the current issue and the
      session's history at once, so scheduling deploys outside meeting hours is
      the actual mitigation.

## Backlog: suggested, not yet prioritized

- [ ] Client-side connection-liveness watchdog: reset a timer on every SSE
      heartbeat/message and show the "connection lost" banner if none arrives
      within roughly 2x the heartbeat interval (~30-40s), instead of relying
      solely on `EventSource.onerror` (which only fires once the browser's
      networking stack itself gives up, and doesn't reliably or quickly catch
      a real client-side network drop, confirmed by manual testing: killing
      the server surfaces the banner promptly, but simulating offline via
      browser devtools does not). This is newly possible because SSE
      heartbeats arrive as actual `message` events visible to app code
      (`index.html`'s `onmessage`); the old WebSocket transport's ping/pong
      keepalive frames were invisible to JavaScript, so this watchdog wasn't
      buildable under the old transport at all. Not a migration regression,
      an improvement the transport swap unlocked. It is also the only thing that
      would catch a page restored from the back/forward cache holding a stream
      that is dead but silent, so step 8 should arm it on `pageshow`.
- [ ] Per-user command sequencing/idempotency to guard against HTTP POST
      reordering (see `docs/known-issues.md`). Stays here deliberately: under a
      snapshot protocol a reordering is visible rather than silently divergent,
      and one has never been observed. The trigger is someone seeing one.
- [ ] Presentation/TV-mode read-only view for screen sharing.
- [ ] Keyboard shortcuts for voting.
- [ ] Per-session auto-reveal toggle (some teams may want manual-only reveal).
- [ ] Undo/re-hide after an accidental reveal. Pairs with what remains of Phase
      4's latched reveal. The accidental un-reveal that exists today closes at
      step 1 instead, where reveal becomes a latch.

Deliberately at the end of the backlog, neither being customer-asked:

- [ ] A `scale` concept in the domain model (fibonacci vs. t-shirt, fixed at
      creation), and custom scales beyond those. Moved down from Phase 2 on the
      product owner's own second thoughts about whether it is wanted. Nothing
      about waiting makes it harder: an additive wire field, an optional
      `create-room` body field and a client render change. It is also what would
      give an estimation an ordinal, which Phase 4's highlight-lowest-and-highest
      needs and currently takes from the client's hardcoded card order.

## Considered and set aside

Given the current scope (small internal tool, self-hosted, one to two hour
sessions):

- Jira/ticketing integration (auto-pull ticket titles from links).
- Multi-item backlog queue (pre-loaded list of tickets to estimate in order).
- Participant avatars/colors, vote-confidence flags.
