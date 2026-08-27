# SSE Delta Resync and Buffering-Proxy Fallback

Date: 2026-08-26
Status: Proposed

## Purpose

Fixes SSE connectivity for a customer whose network path includes an
antivirus-scanning proxy that buffers the entire HTTP response before
releasing anything, times out after 45 seconds, and delivers nothing (not
even headers) to the browser for a stream that never completes. A whitelist
request is in progress with that customer's administrators but may take
time or be rejected, so this is a code-side mitigation to run in parallel.

This also pulls forward "Option 2" from
`docs/superpowers/specs/2026-08-24-sse-backpressure-design.md` (sequence
numbers + `Last-Event-ID` resumption), which that spec deliberately deferred
to Phase 4 ("the prerequisite for trustworthy server-authoritative
auto-reveal... revisit specifically when that work starts"). It is being
pulled forward now because the buffering-proxy fallback needs gapless,
precise resumption to work at all, not just as a nice-to-have; see
"Why bounded reconnects need this" below.

## Problem

### The proxy issue

The proxy in front of this customer's network buffers the complete response
body before forwarding anything (this is how antivirus content scanning
generally works: it can't clear partial content, it needs the whole file).
Since today's SSE stream never completes, the proxy never releases
anything, and kills the connection at its own 45-second timeout with zero
bytes delivered, no headers, no data, no heartbeats. The existing 15-second
`ServerSentEvent.heartbeat` (`sse/SSE.scala:29-34`) is irrelevant here, it
never reaches the browser either.

### Why bounded reconnects need this

Ending the stream after a bounded duration (well under 45s) forces the
proxy to see a complete, finite response it can scan and release, which
solves connectivity. But because the proxy withholds everything until the
response completes, *nothing* is delivered live during an open window,
an event sitting in an otherwise-open connection only reaches the client
once that connection closes. The only way to keep per-event latency low is
to close the connection again shortly after an event happens, rather than
waiting out a fixed window regardless of activity (see section 6). That
means a connection may need to cycle far more often than once per 20-30s
during an active stretch, close to once per event in the worst case, so
each cycle's resync cost has to be cheap and precise. A full room-state
replay on every such cycle is not viable at that frequency. That's what
makes delta resync (this spec) a prerequisite for the bounded fallback, not
an independent enhancement bolted on next to it.

### Why full-resync-on-every-reconnect isn't safe either

Investigating this surfaced two latent correctness gaps in the *existing*
reconnect path (already live in production since the 08-24 backpressure
fix, independent of anything proposed here):

1. `index.html`'s `init`/`join` handlers (`index.html:403-419`) push
   unconditionally (`join` only guards against pushing the client's own id
   twice). A reconnecting client whose `EventSource` recovers *transparently*
   (the browser's native auto-reconnect on the same JS object, no `doJoin()`
   rerun, so `ref.users` is never reset) receives another full
   `setupNewUser` replay and duplicates every already-known participant.
2. The same replay never removes a participant who left *during* the gap,
   since `setupNewUser` (`Room.scala:262-274`) only lists currently-present
   users, it never says who's gone. A client that missed a departure has no
   signal to prune it.

Both are latent today, rare because they need an actual reconnect
(currently only buffer overflow) to trigger. Turning reconnects into a
routine ~20-30s cycle for affected clients would make both routine instead
of rare.

## Approaches considered

**1. In-memory log embedded in `Room`'s existing state (chosen).** Extend
`RoomData` with a monotonic sequence counter and a time-windowed event log,
alongside the state it already owns (`users`, `currentIssue`,
`pendingSessions`). No new actor, no new dependency, consistent with the
existing pattern of `Room` owning all of its own state directly, and
consistent with today's in-memory-only room lifecycle (durability is
explicitly Phase 2, unscheduled, independent work).

**2. Durable/persisted event log (Pekko Persistence or a database table).**
Rejected for this spec. Would survive process restarts and could feed
Phase 2's durable-sessions work, but introduces an infrastructure
dependency that doesn't exist anywhere in this app today, and bundles this
proxy workaround with a larger, explicitly independent roadmap phase. If
Phase 2 durability lands later, the wire protocol here (sequence ids,
`Last-Event-ID`) doesn't need to change, only where the log physically
lives, so choosing option 1 now doesn't foreclose option 2 later.

**3. A separate per-room "EventLog" actor, decoupled from `Room`.**
Rejected. Adds an actor to spawn/watch/terminate per room and an extra
actor-hop on every broadcast and every replay query, to split out a small
amount of state from an actor that already centralizes everything else
about the room. No benefit at this app's scale (low event volume, short
sessions) to offset the added complexity.

## Final design

### 1. Wire format: sequence ids

`RoomEvent` itself is untouched: no new field, no change to its shape, no
change to its `roomEventEncoder`. Sequencing is carried by a separate
wrapper instead, `SequencedRoomEvent(id: Long, event: RoomEvent)`,
introduced alongside `RoomEvent` in `RoomEvent.scala`. This keeps "what
happened" (`RoomEvent`, the JSON `data:` payload, message shape/`extra`
and every existing `index.html` handler, all unchanged) separate from
"where this sits in the room's history" (`SequencedRoomEvent`, used only
server-side and to build the SSE frame). The alternative, adding `id`
directly to `RoomEvent`, was considered and rejected: it would need a
sentinel default for the many call sites that construct a `RoomEvent`
before any id is known (only `RoomData.logEvent`, see section 2, actually
assigns one), leaving a class of bug where an unstamped sentinel could in
principle reach the wire, and it would either leak into the JSON payload
via the derived encoder or need a hand-written encoder to exclude it, just
to preserve a shape that's simply unaffected under the wrapper.

The wire channel `Room` sends over changes accordingly: `SSE.source`
materializes `Source.actorRef[List[SequencedRoomEvent]]` (today,
`List[RoomEvent]`), and every push site in `Room` (`broadcast`, the
resync/`Reset` construction replacing `setupNewUser`, the delta reply)
sends `SequencedRoomEvent` values. SSE frames already carry
`data:`/`retry:`; the native SSE `id:` field is added by unwrapping the
pair in `SSE.scala`:

```scala
.map(seq => ServerSentEvent(
  data = seq.event.asJson.noSpaces,
  id = Some(seq.id.toString),
  retry = Some(retryMillis)
))
```

replacing today's
`.map(event => ServerSentEvent(data = event.asJson.noSpaces, retry = Some(retryMillis)))`.
Carrying `id:` is what makes the browser's `EventSource` automatically
send `Last-Event-ID` on any reconnect, no custom header or query param
needed for this part.

### 2. Room-side event log and retention

`RoomData` gains `sequence: Long` (starts at 0) and
`eventLog: Vector[(Instant, SequencedRoomEvent)]`, one entry per broadcast
event. No separate id slot is needed on the tuple, each entry's
`SequencedRoomEvent` already carries its own id (section 1); the `Instant`
exists purely for the age-based prune below and never travels over the
wire.

**Implementation shape: `RoomConfig` and `RoomData.logEvent`, not a
reshaped `broadcast`.** `broadcast` (`Room.scala:251-260`) keeps its shape
exactly as it is today, a `Unit`-returning send, taking an already-final
event and a `users` list, it only mutates state indirectly, it never did
and still doesn't. Its parameter type changes from `RoomEvent` to
`SequencedRoomEvent`, matching section 1's wire-channel type, but that's
the only change to it. The id-assignment/append/prune work that used to be
described as living inside `broadcast` instead becomes a new pure
`RoomData` method, mirroring every other state transition already in this
file (`joinUser`, `vote`, `clear`, `reVote`, `leave`, `editIssue`), rather
than making the one side-effecting function in the file also responsible
for mutating state:

```scala
def logEvent(event: RoomEvent, config: RoomConfig): (RoomData, SequencedRoomEvent) =
  val id      = this.sequence + 1
  val stamped = SequencedRoomEvent(id, event)
  val prunedByAge = (this.eventLog :+ (Instant.now(), stamped))
    .dropWhile { case (ts, _) => ts.isBefore(Instant.now().minus(config.eventLogRetention)) }
  val pruned = if prunedByAge.size > config.eventLogMaxEntries
    then prunedByAge.drop(prunedByAge.size - config.eventLogMaxEntries)
    else prunedByAge
  (this.copy(sequence = id, eventLog = pruned), stamped)
```

Each handler that broadcasts calls `logEvent` first, sends the stamped
event via `broadcast` unchanged, and threads the returned `RoomData` into
`receiveBehaviour`, e.g.:

```scala
case ShowVotes(token) =>
  data.users.find(_.token == token) match
    case Some(user) =>
      val (logged, event) = data.logEvent(RoomEvent(MessageType.Show, roomId, user.id, RoomEvent.NoExtra), config)
      broadcast(event, data.users, context)
      receiveBehaviour(roomId, logged, config, timers)
    case None => Behaviors.same
```

`EditIssue` needs one extra step of care, it's the one call site where
`broadcast`'s data and the handler's own state change both independently
touch `data` today: it broadcasts using the pre-edit `data.users`, then
separately applies `data.editIssue(issue, user.id)` to build what's passed
to `receiveBehaviour`. Now that `logEvent` also returns updated
`RoomData` (sequence/log), that update has to sit *underneath* `editIssue`,
not be overwritten by it:

```scala
case EditIssue(token, issue) =>
  data.users.find(_.token == token) match
    case Some(user) =>
      val (logged, event) = data.logEvent(RoomEvent(MessageType.EditIssue, roomId, user.id, issue), config)
      broadcast(event, data.users, context)
      receiveBehaviour(roomId, logged.editIssue(issue, user.id), config, timers)
    case None => Behaviors.same
```

`logged.editIssue(...)`, not `data.editIssue(...)`, so the sequence/log
update from `logEvent` isn't silently dropped.

`RoomConfig` groups `gracePeriod` with the two new knobs below, rather
than adding them as further loose parameters:

```scala
final case class RoomConfig(
  gracePeriod: FiniteDuration,
  eventLogRetention: FiniteDuration,
  eventLogMaxEntries: Int
)

object RoomConfig:
  val default: RoomConfig = RoomConfig(6.seconds, 5.minutes, 5000)
```

nested in `object Room` alongside `RoomData`. `gracePeriod` is already
threaded as a parameter through every recursive `receiveBehaviour` call
in `Room.scala` today, and through `RoomManager.apply`/`createRoom`/
`receiveBehaviour` as its own separately-declared parameter (with its own
default referencing `Room.defaultGracePeriod`, a small existing
duplication of `Room.apply`'s own default). It's kept off `RoomData`
deliberately, same reasoning as before: it's config, invariant for the
room's lifetime, not evolving room state the way `users`/`sequence`/
`eventLog` are. Adding `eventLogRetention`/`eventLogMaxEntries` as two
more loose parameters would widen every one of those recursive calls, not
just the ones that call `logEvent`; `RoomConfig` keeps `receiveBehaviour`'s
arity exactly where it is today, and replacing `RoomManager`'s standalone
`gracePeriod` parameter with the same `RoomConfig` closes the small
existing duplication as a side effect, done once instead of twice.

**`sequence = 0` means "nothing logged yet", not "the first event is id
0".** Worth spelling out since it's easy to misread otherwise: `Room.Join`
(`Room.scala:124-133`) calls `setupNewUser` (the resync batch, using
`sequence` as-is) *before* `logEvent` (the only thing that increments
`sequence`), for every join, including a room's very first. So the first
person into an empty room gets `Reset(id=0)` + their own resync batch at
the pre-broadcast baseline, then separately receives their own ordinary
`Join` broadcast at `id=1`, the room's actual first log entry. This isn't
special-cased for the bootstrap case, it falls out of the existing call
order holding for every join, first or hundredth.

**Retention: a time window, plus a count-based ceiling as a pure safety
backstop, no ack-based compaction.** Considered and rejected as the
*primary* mechanism: pruning an event once every currently-connected
client has already passed it (tracking a live per-connection delivery
cursor). Correct in principle, but this app's event volume under realistic
use (a handful of participants, occasional votes/joins/leaves/edits, 30-60
minute sessions) means even a generous window holds at most a few dozen to
low hundreds of small events, genuinely negligible memory regardless of
eviction strategy. The added state (a live cursor per connected user,
updated on every send) and edge cases aren't justified by the memory it
would save.

The time window alone isn't sufficient by itself, though: no endpoint in
`API.scala` (`vote`, `show`, `clear`, `revote`, `edit-issue`) is
rate-limited, so a client (malicious, buggy, or a runaway script) looping
requests can grow a room's log without bound for the length of the window.
Worst-case-but-legitimate use and pathological use are separated by a wide
margin, worth pinning down concretely rather than arguing from vibes: a
fast, aggressive but entirely human-paced session, 20 participants each
voting/revoting on hesitation roughly 4 times per 30 seconds, produces
about 80 events/30s, roughly 800 events over a full 5-minute window, still
comfortably inside "negligible." A naive scripted loop hitting a bare POST
endpoint with no artificial delay operates one to three orders of
magnitude faster than that, tens of thousands of events in the same window
is easily reachable with no attacker sophistication at all. On each
append, after pruning entries older than the retention window, also cap
`eventLog.size` at `SSE_EVENT_LOG_MAX_ENTRIES` (default 5000, roughly 6x
the worst-case-legitimate figure above), dropping the oldest entries past
it regardless of age. This isn't sized to bound memory tightly, entries
are small enough that even the ceiling itself is only on the order of a
few MB per room, it exists purely to put a finite bound on runaway growth
(and on the cost of the per-append prune scan itself, which would
otherwise grow with the abuse). A client pruned past either bound falls
back to full resync, the same self-heal path as the time-based case, not a
new failure mode. See `docs/known-issues.md` ("No rate limiting on
mutating room endpoints") for the broader gap this backstop works around
but doesn't solve.

Both configurable via env var, same `SseConfig` pattern and same reasoning
as the bounded-mode timing knobs in section 6: `SSE_EVENT_LOG_RETENTION`
(default 5 minutes) and `SSE_EVENT_LOG_MAX_ENTRIES` (default 5000) are
judgment calls trading memory/CPU against full-resync fallback frequency,
not something this design can fully settle ahead of time. Unlike the
bounded knobs, both are consumed entirely server-side (the prune check in
`Room`), so no client-delivery mechanism is needed for either. Concretely,
`SseConfig` gains both fields (alongside its existing `gracePeriod`/
`retryMillis`), and `Main.scala`'s existing wiring, which already builds
`RoomManager.apply(gracePeriod = sseConfig.gracePeriod)`, constructs a
`RoomConfig` from the same loaded `SseConfig` instead:
`RoomConfig(sseConfig.gracePeriod, sseConfig.eventLogRetention, sseConfig.eventLogMaxEntries)`,
passed through in place of the standalone `gracePeriod` argument.

### 3. Connection-time resolution

On connect, the route reads the `Last-Event-ID` header (sent automatically
by `EventSource` on any reconnect once the server emits `id:` fields).
Three cases, resolved against the room's `eventLog`:

- **No `Last-Event-ID` (first-ever connection):** today's full resync
  (`setupNewUser`), unchanged, preceded by a `Reset` message (see 4) and
  tagged with the room's current `sequence` as the client's new baseline.
- **`Last-Event-ID` present and still within the log:** reply with exactly
  the events after that id, a precise delta. No `Reset`, no full roster
  replay, this is the common case for a bounded client's routine
  reconnects. **Sent as a single `user.ref ! events` push of one
  `List[SequencedRoomEvent]`** (`newData.eventLog.collect { case (_, seq)
  if seq.id > lastEventId => seq }`), never a loop of individual sends,
  exactly mirroring how `setupNewUser` already sends a multi-event resync
  burst as one list (`Room.scala:273`). This isn't just a style
  preference: section 6's bounded-mode close logic closes the connection
  right after a push is delivered, and it can only do that safely if a
  multi-event delta genuinely arrives as one push, since the stream's
  `.mapConcat(identity)` (`SSE.scala:67`) flattens either a single N-element
  list or N separate one-element sends into the same downstream sequence of
  individual events, indistinguishable to a reader once flattened. If the
  delta were instead sent as a loop of single-event pushes, a naive
  close-after-send implementation could close after the first flattened
  event and strand the rest of the backlog for the next cycle, silently
  reintroducing the per-event reconnect cost this design removed the flush
  window to avoid.
- **`Last-Event-ID` present but not resolvable to a valid position in the
  log** (older than retention, *or* beyond the room's current `sequence`,
  e.g. malformed, spoofed, or from a non-`EventSource` client): full
  resync, same as the first-connection case (with `Reset`), this is the
  existing self-heal fallback, not new.

**Precise resolution rule.** The three cases above are stated in prose;
the actual predicate matters, since "found in the log" and "not found"
aren't quite the same split as "delta" vs. "full resync." Given
`lastEventId: Option[Long]`, `currentSequence = newData.sequence`, and
`newData.eventLog`:

- `lastEventId.isEmpty` -> first-connection case.
- `lastEventId` contains `id` where `id == currentSequence` -> delta case,
  trivially empty (the client is already caught up; this is also what
  keeps a room's very first reconnect, `id = 0` against an empty
  `eventLog`, see section 2, from spuriously falling through to a full
  resync).
- `lastEventId` contains `id` where `id < currentSequence` and
  `newData.eventLog.exists(_._2.id == id)` -> delta case, reply with
  `eventLog.collect { case (_, seq) if seq.id > id => seq }`.
- Anything else, including `id > currentSequence` (never legitimately
  issued by this room, e.g. malformed or spoofed) and `id < currentSequence`
  with no matching entry (pruned) -> full resync case. Collapsing "too old"
  and "never valid" into one path is deliberate: the remedy is identical
  either way, and the alternative (silently returning an empty delta for an
  `id` the room never issued) would leave a client stuck believing it's
  caught up when it never validly resynced in the first place.

**Data path: `Last-Event-ID` reaches `Room` through the existing `Join`
message, not a new query.** The route reads the header the same way it
already reads `X-Forwarded-Proto` (`optionalHeaderValueByName`,
`API.scala:101`), parses it to `Option[Long]`, and treats anything absent
or unparseable as `None`, folding straight into the first case above rather
than a separate error path. That `Option[Long]` is threaded as a new
parameter through the same fire-and-forget chain the connection already
goes through: `SSE.source` takes it and passes it into the
`RoomManager.ConnectToRoom` message it sends from `mapMaterializedValue`,
`ConnectToRoom`'s handler passes it into `Room.Join`, and `Join`'s handler
(`Room.scala:124`) resolves it against `newData.eventLog`/`newData.sequence`
in place of today's unconditional `setupNewUser` call, sending either the
delta or the `Reset` + full-resync batch to `user.ref`, before `broadcast`,
same ordering as today.

This deliberately avoids a separate ask-based resolution step (e.g. a
`Room.ResolveResync(lastEventId, replyTo)` queried before subscribing).
Today, `Join` computes the resync content and registers the connection for
future broadcasts inside one actor message, so there's no window where an
event could be logged after the log is read but before this connection
starts receiving live broadcasts, or the reverse, causing a duplicate.
Resolving in a separate step ahead of `Join` would reopen exactly that
race. Piggybacking on `Join`, which already does the presence update and
the reply send atomically, avoids inventing a new failure mode.

### 4. Client fix, self: `Reset` before any full resync

A new `RoomEvent.MessageType` case, `Reset` (not `Clear`, that name is
taken by vote clearing and means something different), sent as the first
element of the batch immediately before any full-resync burst (both cases
in section 3 that aren't a delta). Client handler: on `Reset`, clear local
room-participant state (`ref.users = []`) before applying what follows.
Harmless on a first connection (clearing an empty list). This fixes both
latent gaps in "Why full-resync-on-every-reconnect isn't safe either"
above, by construction: starting from empty makes duplication impossible,
and a departed participant simply isn't re-added, no separate removal
signal needed. This is a full replacement for defensive/idempotent handler
guards, not an addition to them, the reconnecting client's own state is
always rebuilt from an authoritative snapshot, never patched.

**What id `Reset` carries.** The underlying `RoomEvent(MessageType.Reset,
roomId, ..., RoomEvent.NoExtra)` is not itself a room event in the log
sense: it's generated fresh per-connection at resolution time, never
passed to `logEvent`, so it never appends to `eventLog` and never consumes
a new sequence number. It's still wrapped as a `SequencedRoomEvent` like
everything else sent over the wire (section 1), but the id it's wrapped
with is a *read* of the room's current `sequence` (e.g.
`SequencedRoomEvent(12, resetEvent)` if 12 real events have been logged so
far), establishing the client's new baseline, not an increment of it.
Every frame in the resync burst that follows (`Reset`, `Init`, replayed
`Join`/`Vote`, `EditIssue`) is wrapped with that same id, `12`, repeated
rather than incrementing, since they're a reconstructed view of current
state, not new log entries. Repeating it on every frame, rather than
relying on the SSE spec's "the last-event-id buffer carries forward across
frames that omit `id:`" behavior, keeps the invariant locally obvious on
each frame instead of depending on that subtler spec detail. The client's
next reconnect then correctly requests everything after 12, a genuine
delta from exactly that point.

### 5. Server fix: resuming `Join` must merge, not replace, and must not
broadcast

Two distinct problems share one root cause and one fix, both stemming from
`Room.Join`'s handler treating every `Join` as a brand-new arrival
(`Room.scala:124-133`), never asking whether this `userId` was already
present:

**Problem A, vote state loss.** `RoomManager.ConnectToRoom` always builds
the `User` it sends with `RoomManager.InitialVoteState`/`InitialEstimation`
(`RoomManager.scala:82-84`), and `RoomData.joinUser` (`Room.scala:67-74`)
fully replaces the existing entry for that `userId`, `voted`/`estimation`
included, not just `ref`. Today this only matters on the rare reconnect
(buffer overflow). Under this design a bounded client reconnects on a
routine ~20-30s cycle for the whole session, so any vote cast is very
likely to be silently reset to "not voted" in the room's own state before
the round is ever revealed, well before the client would vote again. This
is invisible in the delta path (bystanders' own state is untouched, since
suppressing the broadcast, problem B below, means they never hear about
it) until something reads the room's actual state: a new client's full
resync would show this participant as not having voted, and it directly
undermines this spec's own stated motivation of enabling trustworthy
server-authoritative auto-reveal (see Purpose), which would need to check
exactly this state and would likely never see it go true for a room with
any bounded client in it.

**Problem B, duplicate `Join` broadcasts.** Bystanders (other
already-connected clients) receive `Join`/etc. via their own live/delta
stream, which never gets a `Reset` (deltas are pure incremental
application). Since every reconnect, resume or genuinely new, currently
triggers an unconditional broadcast, a resuming client's routine ~20-30s
cycle would otherwise broadcast a redundant `Join` to everyone else every
cycle, duplicating that participant in every bystander's list (their
`join` handler only guards against pushing the client's own id,
`index.html:412`).

**Fix:** `RoomData.joinUser` looks up the existing entry by `id` first. If
one exists (a resume), it carries over that entry's `voted`/`estimation`
onto the incoming `User`, only `ref` actually changes on a reconnect, name
doesn't change (no rename feature) and token doesn't change for any
reconnect path this design covers, native `EventSource` retry and the
manual bounded switch both reuse the existing session cookie, not a fresh
`/join`. `joinUser` also returns whether this was a resume, so `Join`'s
handler has one source of truth for both fixes instead of two separate
lookups that could drift:

```scala
def joinUser(user: User): (RoomData, Boolean) =
  this.users.find(_.id == user.id) match
    case Some(existing) =>
      val merged = user.copy(voted = existing.voted, estimation = existing.estimation)
      (this.copy(users = merged :: this.users.filterNot(_.id == user.id),
                  pendingSessions = this.pendingSessions - user.token),
       true)
    case None =>
      (this.copy(users = user :: this.users,
                  pendingSessions = this.pendingSessions - user.token),
       false)
```

```scala
case Join(user) =>
  val (newData, isResume) = data.joinUser(user)
  // resolve delta or Reset+full per section 3, send to user.ref, as before
  val finalData =
    if !isResume then
      val (logged, event) = newData.logEvent(RoomEvent(MessageType.Join, roomId, user.id, user.name), config)
      broadcast(event, logged.users, context)
      logged
    else newData
  receiveBehaviour(roomId, finalData, config, timers)
```

Only a genuinely new `userId` broadcasts and gets logged. Suppressing the
broadcast for a resume is safe in a way it wasn't when first considered
earlier in this design process: the resuming client's own correct state no
longer depends on receiving its own `Join` broadcast, that's entirely
owned by the delta/full-resync resolution in section 3, so suppressing it
can't cause the resuming client to miss anything about itself or others.

`joinUser` has exactly one call site (`Room.scala:130`), so this signature
change is contained. `RoomSpec`'s existing reconnect tests
(`RoomSpec.scala:184-186`) hand-construct the reconnecting `User` via
`user.copy(ref = ...)`, which preserves `voted`/`estimation` by
construction and so never exercised problem A against the real
`ConnectToRoom` path (`RoomManager.scala:82-84`), which always resets
them; those tests should be updated to go through `ConnectToRoom` (or
otherwise start from `InitialVoteState`/`InitialEstimation`) so they'd
actually catch a regression here.

**Problem C, stale grace-period timers piling up.** Every reconnect,
including the ordinary buffer-overflow reconnect the grace period already
exists for, arrives at the Room actor as a brand-new HTTP connection with a
brand-new materialized `ActorRef` (`SSE.scala:56-59`). `Room.Leave`'s
grace-period timer is keyed on `(userId, ref)` (`Room.scala:195-206`), so a
resume never actually cancels the old timer, it just sits scheduled for the
full `gracePeriod` and fires later as a no-op once `ConfirmLeave`'s
existing `data.users.exists(u => u.id == userId && u.ref == ref)` check
finds the old `ref` already replaced. Harmless today, since reconnects are
rare (only buffer overflow triggers one). Under this design, a bounded
client reconnects routinely, up to once per event in the worst case (see
section 6), so "schedule and let it fire uselessly" goes from a rare,
one-off cost to something that can leave several stale timers alive per
user at once, each occupying a slot in the Room actor's `TimerScheduler`
and each still producing a wasted `ConfirmLeave` message later.

**Fix:** re-key the timer on `userId` alone, and have `Join` cancel it
explicitly:

```scala
case Leave(userId, ref, replyTo) =>
  // unchanged reasoning, just the key:
  timers.startSingleTimer(key = userId, msg = ConfirmLeave(userId, ref, replyTo), delay = config.gracePeriod)
  Behaviors.same

case Join(user) =>
  timers.cancel(user.id)
  val (newData, isResume) = data.joinUser(user)
  // ... as above
```

(`gracePeriod` above is `config.gracePeriod`, `RoomConfig` from section 2,
`Room.apply`/`receiveBehaviour` take `config: RoomConfig` in place of the
standalone `gracePeriod` parameter throughout this section.)

`startSingleTimer` already cancels any existing timer under the same key,
so keying on `userId` alone means two `Leave` calls for the same user, the
same connection retrying or two different connections/refs racing, collapse
to at most one live timer rather than one per `ref`. `timers.cancel(user.id)`
in `Join` goes further: a fresh `Join` means this user is present again
right now, so any pending scheduled removal for them is stale immediately,
not just eventually. Net effect: bounded mode's routine reconnect cycling
holds at most one live grace timer per user at any instant, actively
cleared on every rejoin, instead of potentially several stacking up and
self-clearing only as each individually fires later.

This doesn't change `ConfirmLeave`'s existing ref-scoped safety check,
which stays exactly as-is and remains necessary: the unavoidable
out-of-order case, a `Leave` for an old connection's `ref` arriving *after*
the room has already processed the new `Join`, has nothing pending to
cancel at `Leave`-time (the `Join`'s cancel ran too early to catch it), so
a fresh timer gets scheduled and must still self-discover staleness at fire
time via that same check, exactly as today. Not a correctness change, only
a cost one: it changes *when* a stale timer's futility is discovered
(immediately at rejoin, the common case, vs. eventually at fire-time, the
residual race case), not what protects against it.

The existing `(userId, ref)`-key comment and its "relies on RoomManager
calling Leave at most once per connection" caveat (`Room.scala:189-193`)
go away with this change: keying on `userId` alone no longer depends on
that assumption, since any two `Leave`s for the same user now collapse via
the same mechanism regardless of whether they share a `ref`.

### 6. Bounded/long-poll fallback for proxy-detected clients

Client-side (`index.html`'s `doJoin`):

- **Detection cache check, before anything else opens.** Read
  `localStorage.getItem('sseBoundedUntil')`. If present and not expired
  (`Date.now() < sseBoundedUntil`), skip detection entirely and open
  directly with `?bounded=1`, same as the manually-driven switch below,
  no unbounded connection is even attempted. Otherwise, proceed as
  described next. Only the "detected true" outcome is ever cached, never
  "detected false", so the only way this cache can be wrong is by making a
  client wait out a redundant bounded-mode cycle it didn't need, never by
  silently leaving a client on an unbounded connection the proxy will kill,
  which is the failure this whole design exists to prevent. Reasoning:
  whether a given network path buffers responses isn't a fixed property of
  the browser/device, it can change (a laptop moving between office and
  home, VPN toggling, or the whitelist request from Purpose eventually
  succeeding), so this can't be cached forever without a way to notice
  when it stops being true; see the TTL and self-heal note below.
- Open `EventSource` unbounded, as today, by default, when no valid cache
  entry short-circuited the step above.
- Start a detection timer on open, duration sent from the server (see
  below), default 5s. This detection only ever runs on this first
  connection of a fresh page load, which always has no `Last-Event-ID` yet,
  so per section 3 it always gets an immediate `Reset` + full-resync burst,
  meaning the timer only has to detect "did the connection open at all,"
  not "did some arbitrary future event occur." A later bounded reconnect
  within the same page instance skips detection entirely (see below) and
  may legitimately wait out an empty delta, so this timer is never armed
  for those. Any message, including a heartbeat, clears it, and clears any
  stale `sseBoundedUntil` entry left over from a previous visit, this is
  the self-heal path: if the proxy situation genuinely changed since the
  cache was written (whitelisted, or this device is now on a different
  network), the very next detection that's allowed to run corrects it.
- If the timer fires with nothing received: close that connection, mark an
  in-memory `sseBounded = true` for this page instance, write
  `localStorage.setItem('sseBoundedUntil', Date.now() + SSE_DETECTION_CACHE_TTL)`,
  and manually open a new `EventSource` with `?bounded=1`. This is the
  *only* manually-driven reconnect in this design, needed because the URL
  itself changes.
- **Connecting spinner.** From the moment `doJoin` starts (whether
  triggered by submitting the join/create form, or by `created()` auto-
  joining a bookmarked room URL with a remembered name from `localStorage`,
  `index.html:560-574`) until the first real SSE message arrives (`inRoom`
  flips true, `index.html:401`) or the connection definitively fails, show
  a connecting spinner in place of the join/create form (`v-if="!inRoom &&
  !connecting"` on the existing form, a sibling `v-if="connecting"` block
  for the spinner). One flag (`connecting`), set at the top of `doJoin`,
  cleared alongside `inRoom` and on hard failure (existing `onerror`/
  `showError` path). Both entry points converge on the same `doJoin`, so
  this covers the bookmark case with no separate logic. Motivation: today
  there is no feedback at all between submitting the form (or auto-joining
  from a bookmark) and the first SSE message landing, the user just keeps
  looking at the static form; that gap is exactly what the detection timer
  above spans in the worst case, and it's fully unmasked. See "What was
  deferred or rejected" for the follow-up: the spinner is a stopgap, not
  a full fix for the perceived-lag problem the detection timer creates.
- **Error banner debounce.** The existing `onerror` handler
  (`index.html:472-485`) sets `showError = true` on any `error` event,
  including the CONNECTING case (an in-progress auto-reconnect), not just
  CLOSED. Per the SSE spec, `EventSource` fires `error` whenever the
  underlying connection closes for *any* reason, including a clean,
  complete HTTP response ending normally, which is exactly what every
  bounded cycle does by design (see the server-side adaptive close logic
  below). Left as-is, a bounded client would show "Connection to the room
  was lost" on every single cycle, every 20-30s in the idle case, more
  often in a busy room, defeating much of what the connecting-spinner work
  above is trying to achieve. Fix: track consecutive failures instead of
  reacting to the first one. `onopen` and `onmessage` reset a
  `consecutiveErrors` counter to 0; `onerror`'s non-CLOSED branch
  increments it and only sets `showError = true` once it crosses a small
  threshold (3). The CLOSED branch (session truly over, retries are
  futile) stays immediate and undebounced. This isn't bounded-mode-specific
  logic: `onopen` fires on every successful reconnect regardless of mode,
  so a routine bounded cycle (close, reopen, `onopen`) resets the counter
  every time and the banner never appears during normal operation, while a
  genuine outage produces consecutive errors with no intervening `onopen`
  and still escalates, just after a short, bounded delay (roughly 3x the
  retry interval, ~1.5-2s bounded, ~6s unbounded) instead of instantly.
  Side benefit: this also removes the existing minor banner-flash on
  today's ordinary unbounded reconnects (the buffer-overflow path from the
  08-24 design), which currently shows the banner then clears it on the
  next `onopen`.
- Every reconnect after that, every scheduled bounded close and any
  ordinary drop, is handled by the browser's own native `EventSource`
  auto-reconnect on that same object, not further custom JS: same URL, so
  `retry`/`Last-Event-ID` are applied automatically per the SSE spec. This
  matters beyond simplicity: it guarantees at most one connection open per
  client at any time, so there's never a window where an old,
  still-closing connection and a newly opened one could overlap and
  deliver events out of order. The one manual switch above is exempt from
  that concern for a different reason: by construction nothing was ever
  received on the unbounded connection it replaces (that's the detection
  signal itself), so there's no prior `Last-Event-ID` to lose or race
  against.

Server-side (`SSE.scala`/`API.scala`):

- The route accepts an optional `bounded` query param.
- When present, the connection resolves `Last-Event-ID` immediately per
  section 3, then behaves adaptively rather than on a fixed timer, since
  the proxy withholds everything until close regardless of when an event
  happened, so closing as soon as there's something to deliver directly
  lowers latency instead of paying any deliberate wait:
  - If the resolution is non-empty (a delta with content, or a
    first-connection/stale-cursor full resync with `Reset`): send it, then
    close immediately. No hold-open step. **"Close immediately" means after
    the complete push is written to the response, not after the first
    individual `SequencedRoomEvent` the stream happens to expose downstream
    of `.mapConcat(identity)`** (`SSE.scala:67`), which flattens a
    multi-event push into individual stream elements and so can't itself
    distinguish "one push of N" from "N separate pushes" once flattened,
    see section 3's note on why the delta query must be sent as a single
    `List[SequencedRoomEvent]` in the first place. Whatever a single push
    contains is what gets delivered together, and this app already has a
    mechanism for "more than one event at once": `setupNewUser`
    (`Room.scala:262-274`) builds a multi-event list and sends it as one
    push for a full resync, and the delta-resolution query does the same
    for whatever
    accumulated in `eventLog` since the client's `Last-Event-ID`. Both are
    exact, since the events genuinely originated together (the same resync
    computation, or the same accumulation window), not probabilistic like a
    timer would be. A future feature that generates more than one event
    from a single decision (e.g. an auto-reveal handler broadcasting a vote
    and a reveal together) gets the same benefit for free by sending them
    as one `List`, same pattern as `setupNewUser`, no timer involved.
    An earlier version of this design held the connection open for a fixed
    window after sending, to probabilistically catch independent events
    landing close together in time. Dropped: at a window short enough to
    not noticeably lag every isolated action (the common case, and the one
    that matters most once a passive observer-mode display exists with no
    participant to absorb the delay), the odds of two independently-timed
    human actions actually landing inside it are low, so it bought little
    batching benefit while taxing every single action and, worse, doubling
    that tax (wait for the window, miss it, wait the retry gap, wait a
    second window) for anything that missed it by a hair. Two genuinely
    independent events (e.g. two different users' `Vote` commands, each its
    own `logEvent` + `broadcast` pair, each `user.ref ! List(event)`)
    landing close together in wall-clock time remain two separate pushes
    and may land in two separate connection cycles instead of one; accepted
    rather than engineered around, at the cost of one extra, cheap round
    trip in the rare case it happens, not added latency worth avoiding.
  - If the resolution is empty (nothing missed, the common case for a
    client reconnecting promptly with nothing new): stay open, waiting for
    either a new push, which triggers the same send-then-close above, or
    the wall-clock cap (base 20s + 0-10s jitter, so clients don't cycle in
    lockstep) elapsing with nothing new, in which case it closes anyway
    with no data, purely to stay safely under the proxy's 45s limit, and
    the client reconnects with the same `Last-Event-ID` since nothing
    changed.
  - Note the wall-clock cap is still required even though every other
    cycle closes immediately on a push, since a genuinely idle room must
    still self-close before 45s, otherwise it's exactly today's failure,
    the proxy killing an open-ended stream with nothing delivered.
- **Bounded connections carry a distinct, smaller `retry:` hint than the
  unbounded default.** `SseConfig.retryMillis` (2000ms) keeps governing
  unbounded connections unchanged, but a bounded connection's frames carry
  a separate value: 500ms base with +/-100ms jitter per connection (same
  lockstep-avoidance reasoning as the wall-clock cap's jitter). This is
  what the browser's native `EventSource` reconnect delay uses after every
  close, scheduled or not. A single tuned constant was chosen over
  client-side exponential backoff on repeated failures, considered and
  rejected: backoff would require manually `close()`-ing and reopening the
  `EventSource` to control per-attempt delay (the native mechanism only
  ever replays the last-received `retry:` value, it can't be grown from
  script), which both adds real complexity and breaks native automatic
  `Last-Event-ID` tracking, reintroducing exactly the kind of resume
  bookkeeping this design otherwise avoids by staying on one `EventSource`
  object for every reconnect. The trade-off: a real sustained outage is met
  with a fixed ~500ms retry cadence rather than a growing one, judged
  acceptable at this app's scale (small rooms, not a large fleet hammering
  a shared backend during an incident).
- **The existing 15-second `.keepAlive` heartbeat (`SSE.scala:29-34,69`) is
  not applied to bounded connections.** Its only purpose is keeping a
  connection alive under Pekko's 60-second idle-timeout, and a bounded
  connection's own wall-clock cap (20-30s) already stays well under that,
  so the failure it exists to prevent can't happen here regardless. Applying
  it unchanged would actively break the intended timing: a heartbeat is not
  a `RoomEvent` and carries no `id:`, but if the adaptive close logic above
  treated its arrival as "something to send" (the natural default if this
  isn't handled deliberately), every idle bounded connection would close
  at a fixed ~15s, not the intended jittered 20-30s, silently defeating the
  jitter's purpose of keeping clients from cycling in lockstep. Unbounded
  connections keep `.keepAlive` exactly as today, unchanged, they still
  need it.
- When absent, behavior is unchanged, unbounded, exactly as today.
- The bounded-mode timing constants are configurable via env var following
  the existing `SseConfig` pattern, rather than hardcoded:
  `SSE_BOUNDED_DURATION` (wall-clock cap base, default 20s) and
  `SSE_BOUNDED_RETRY` / `SSE_BOUNDED_RETRY_JITTER` (default 500ms +/-
  100ms). Made tunable
  deliberately: these values are a judgment call about a real proxy's
  behavior and real users' tolerance for lag, which this design can't
  fully settle ahead of time. The intent is to revisit them with real
  feedback after the first production deployment, not treat the defaults
  above as final.
- The client-side detection timeout (above) is configurable the same way,
  `SSE_DETECTION_TIMEOUT`, default 5s, same "judgment call, revisit after
  production feedback" reasoning. It can't reach the client by riding the
  wire protocol the way `retry:` does, though, since detection is deciding
  *whether* an SSE connection is working at all, by timing the absence of
  any frame; there's no frame to carry it on. Instead it's threaded through
  the existing `POST /rooms/:roomId/join` response (`JoinResponse`,
  `API.scala:76-95`), which already precedes `EventSource` creation
  (`doJoin`, `index.html:380-388`) and is a small, finite response, so the
  buffering proxy this spec targets releases it almost immediately
  regardless (it only ever fails to release a response that never
  completes, see Problem).
- **`SSE_DETECTION_CACHE_TTL`** (default 24h), threaded the same way as
  `SSE_DETECTION_TIMEOUT` above (via `JoinResponse`, it governs client-side
  `localStorage` behavior, nothing that rides the SSE wire protocol), same
  "judgment call, revisit after production feedback" reasoning: short
  enough that a whitelist fix or a genuine network change (see the
  detection-cache-check bullet above) self-corrects within about a
  business day, long enough that a customer joining several rooms across a
  single day only pays the detection window once, on their first join.
- No `Room`/`RoomManager` structural changes needed beyond sections 1-5,
  the bounded path is just a client-driven reconnect cadence riding on the
  same delta-resync mechanism every client uses.

**Config invariants.** `SseConfig.load` already enforces
`gracePeriod >= 2 * retryMillis` specifically so a routine reconnect
reliably beats the grace period, or Problem C (section 5) reintroduces the
leave-then-rejoin flicker it exists to prevent. This design adds a second
retry cadence the same property depends on, `SSE_BOUNDED_RETRY`, without
extending that check to cover it, plus two proxy-facing values
(`SSE_BOUNDED_DURATION`, `SSE_DETECTION_TIMEOUT`) that can silently
reintroduce the exact failure this whole design exists to fix if
misconfigured. All of the following extend `SseConfig.load`, same file,
same style, alongside the existing checks:

```scala
require(
  gracePeriod.toMillis >= 2 * boundedRetryMillis,
  s"pointing-poker.sse.grace-period ($gracePeriod) must be at least twice " +
    s"pointing-poker.sse.bounded-retry ($boundedRetryMillis ms)"
)
require(
  boundedDurationMillis + boundedRetryJitterMillis < 60000,
  s"pointing-poker.sse.bounded-duration ($boundedDurationMillis ms) plus " +
    s"jitter must stay safely under Pekko's own 60s idle-timeout, or a " +
    s"bounded connection risks the framework itself killing it before the " +
    s"scheduled close"
)
require(
  detectionTimeoutMillis < boundedDurationMillis,
  s"pointing-poker.sse.detection-timeout ($detectionTimeoutMillis ms) must " +
    s"stay under pointing-poker.sse.bounded-duration ($boundedDurationMillis ms), " +
    s"or detection can't reliably fire before a slow-enough proxy kills the " +
    s"connection outright"
)
require(
  eventLogRetention.toMillis >= 2 * (boundedDurationMillis + boundedRetryJitterMillis),
  s"pointing-poker.sse.event-log-retention ($eventLogRetention) must be at " +
    s"least twice pointing-poker.sse.bounded-duration plus jitter " +
    s"($boundedDurationMillis + $boundedRetryJitterMillis ms), or a bounded " +
    s"client's routine reconnect cycle will regularly fall outside the " +
    s"retained window and be forced back to full resync on every cycle, " +
    s"defeating the point of delta resync"
)
require(eventLogRetention.toMillis > 0, "...")
require(eventLogMaxEntries > 0, "...")
require(boundedDurationMillis > 0, "...")
require(boundedRetryMillis > 0, "...")
require(detectionTimeoutMillis > 0, "...")
require(detectionCacheTtlMillis > 0, "...")
```

The first three are the important ones. The first is a direct analog of
the existing check, extended to cover the retry value it didn't
previously guard, without it a misconfigured `SSE_BOUNDED_RETRY` can
reintroduce Problem C's flicker for bounded clients specifically even
with the unbounded check still passing. The next two guard the
proxy-facing values: this codebase can't know any given customer's
actual proxy timeout (that's not information that exists here), but it
can and should catch a value that's unsafe against what it *does* know,
Pekko's own idle-timeout, and the relationship between the detection
window and the bounded duration. The fourth guards the delta-resync
mechanism's own reason for existing: retention is what makes the bounded
path cheap (see "Why bounded reconnects need this"), and nothing else in
this config would catch a value that quietly turns every bounded cycle
into a full resync instead of a delta, still functionally correct, just
silently paying the cost this design exists to avoid. The rest are the
same basic sanity checks the existing values already get.

### 7. Bundled fix: buffering-proxy headers

Add `Cache-Control: no-cache` and `X-Accel-Buffering: no` to the SSE
response, closing the existing `docs/known-issues.md` entry "SSE
reverse-proxy buffering is undocumented." This will not fix the specific
antivirus-scanning proxy this spec targets (it buffers by design,
irrespective of such hints), but it's a cheap, already-flagged, unrelated
gap worth closing alongside a deployment-relevant change to this same code
path.

## What was deferred or rejected

- **Shipping Problems A/B/C (section 5) as an isolated hotfix ahead of this
  design**: rejected. These are already-live correctness gaps independent
  of the proxy work, and the fix is small and self-contained, so splitting
  it out was considered. Rejected because their visibility and criticality
  are directly increased by this design (routine bounded reconnects turn a
  rare edge case into a routine one), the fix is cheap enough that bundling
  adds negligible risk to this delivery, and this design is the next
  priority for this project, splitting would mean a second review/release
  cycle for bugs that only became consequential because of the feature
  being shipped next anyway.
- **Ack-based log compaction** (section 2): rejected, negligible benefit at
  this app's scale versus the added per-connection cursor-tracking state.
- **Durable/persisted event log**: deferred to whenever Phase 2 durable
  sessions work begins; not needed for this problem, and the wire protocol
  here doesn't require revisiting when that happens.
- **A separate EventLog actor**: rejected, no benefit over embedding in
  `RoomData` at this scale.
- **Client-side idempotency guards on `init`/`join`**: superseded by the
  `Reset` design (section 4), which is strictly more correct (it also
  handles departed-participant removal, which pure idempotency would not)
  and simpler to reason about.
- **Room-skeleton loading experience**: not addressed here beyond the
  connecting spinner (section 6). The spinner is a stopgap: it gives
  feedback that something is happening, but the user still stares at an
  inert screen for the full detection window in the worst case. A fuller
  fix would render the room skeleton itself (participant list layout,
  voting area, etc.) before the `/events` connection succeeds, bounded or
  not, so the page feels loaded rather than pending, and separately revisit
  `SSE_DETECTION_TIMEOUT`'s default upward, since a skeleton removes most
  of the pressure to keep that window short. If this is built, the
  skeleton must stay non-interactive (no voting, no editing the issue,
  nothing that implies the room's actual state is known) until the real
  sync, delta or full, completes, exactly the same guarantee `inRoom`
  currently provides by gating the whole room view on it; a skeleton that
  looks ready but isn't would be worse than the current plain wait, not
  better. Deferred rather than done here because it's a UI redesign, not a
  resync-correctness change, and shouldn't block this delivery.
- **Distinguishing proxy buffering from transient server-side latency in
  detection** (section 6): accepted as a known limitation, not fixed. The
  5-second detection timer only measures "did anything arrive," not
  specifically "is a buffering proxy in the path." A GC pause, cold
  start, or load spike that happens to delay the first message past the
  timeout is indistinguishable from the target proxy, and gets the same
  outcome: `sseBoundedUntil` cached for up to `SSE_DETECTION_CACHE_TTL`
  (default 24h). This is judged acceptable because the cost of a false
  positive is bounded and non-critical, a client pays the bounded path's
  higher reconnect overhead for up to a day, the same category of
  tradeoff already accepted for the cache generally (see the
  detection-cache-check bullet in section 6), never a connectivity or
  correctness loss. Not worth a more precise signal (e.g. distinguishing
  "no bytes at all" from "slow but arriving") for a failure mode this
  narrow and this cheap.
- **Replaying "are votes currently revealed" state on resync**: not
  addressed here. `setupNewUser` today has no equivalent of a `Show` replay,
  a resyncing client has no way to know if votes are currently revealed.
  Pre-existing, unrelated to this design, not worsened by it. Logged in
  `docs/known-issues.md`. Worth flagging that this gap gets more
  consequential, not less, if a future passive "observer mode" (a
  meeting-room display showing room state with no participant driving it)
  is built on top of this resync mechanism: an active participant who
  reconnects into a stale "not revealed" view has some chance of noticing
  something's off from context; a passive display has no human in the loop
  to catch or correct it. Still out of scope for this design, but worth
  resolving before an observer-mode display is built on top of it.

## Testing

Extends the existing `RoomSpec`/`SSESpec`/`BackpressureReconnectSpec`
pattern (see `docs/superpowers/specs/2026-08-24-sse-backpressure-design.md`
for the established style):

- `RoomData.logEvent` assigns strictly increasing ids and returns the
  updated `RoomData` alongside the stamped `SequencedRoomEvent`; `RoomEvent`
  itself is unaffected (same content, same JSON shape, no `id` field) by
  wrapping. `EditIssue`'s handler applies its own state change on top of
  `logEvent`'s returned data, not `data` directly, a regression test for
  the ordering subtlety in section 2.
- Event log append and 5-minute pruning.
- Event log count-based ceiling (`SSE_EVENT_LOG_MAX_ENTRIES`): appending
  past the ceiling drops the oldest entries regardless of age, and a
  client whose `Last-Event-ID` falls before the retained range falls back
  to full resync, same as the time-based case.
- Delta replay for a valid `Last-Event-ID`.
- Full-resync fallback (with `Reset`) for a stale or absent `Last-Event-ID`.
- `Reset` followed by full replay produces no duplicates and correctly
  drops a participant who left during the gap.
- `Join` broadcast suppression on resume: a resuming client's reconnect
  produces no `Join` event for bystanders; a genuinely new participant
  still does.
- A resuming client's vote survives the reconnect: a user who has voted,
  then reconnects (built via `RoomManager.ConnectToRoom`, not a
  hand-constructed `User` that already carries the prior vote), still shows
  as voted with their prior estimation in the room's own state afterward,
  both when the reconnect resolves as a delta and when it resolves as a
  full resync (their own replayed `Vote` event is still present, not
  dropped).
- The bounded path's adaptive completion: closes immediately after sending
  whatever a single push contains (a delta, a full resync, or a live
  broadcast), and closes at the wall-clock cap when nothing happened.
- A multi-event push (a full resync burst, or a delta containing several
  events accumulated since the client's `Last-Event-ID`) is delivered as
  one connection cycle, not split across several.
- A bounded, idle connection does not receive `.keepAlive` heartbeats and
  closes at the jittered wall-clock cap (20-30s), not at a fixed ~15s; an
  unbounded connection still receives heartbeats unchanged.
- Bounded connections carry the smaller, jittered `SSE_BOUNDED_RETRY`
  value (not `SseConfig.retryMillis`) on their frames; unbounded
  connections are unaffected.
- An end-to-end case (mirroring `BackpressureReconnectSpec`) proving a vote
  landing exactly in a bounded client's reconnect gap is delivered via the
  next delta, not lost, closing the "vote4" question raised during this
  design's review.
- A `Last-Event-ID` beyond the room's current `sequence` (malformed,
  spoofed, or otherwise never issued by this room) resolves to a full
  resync with `Reset`, not a silently-empty delta, per the precise
  resolution rule in section 3.
- The connecting spinner (section 6) clears on both the success path
  (first real SSE message, `inRoom` becomes true) and the hard-failure
  path (`onerror` with a closed `readyState`), and is not shown for a
  bounded reconnect that legitimately waits out an empty delta.
- The error banner debounce (section 6): `showError` is not set on the
  first one or two consecutive `onerror` events (non-CLOSED), only once
  `consecutiveErrors` reaches the threshold; `onopen` and `onmessage` both
  reset the counter to 0, so a routine bounded cycle (close, reopen) never
  shows the banner; the CLOSED branch still shows it immediately, no
  debounce. Covers both bounded and unbounded reconnects.
- `SseConfig.load`'s new invariants (section 6): rejects a
  `SSE_BOUNDED_RETRY` that leaves `gracePeriod` under twice its value;
  rejects a `SSE_BOUNDED_DURATION` (plus max jitter) that doesn't stay
  safely under Pekko's 60s idle-timeout; rejects a `SSE_DETECTION_TIMEOUT`
  that isn't strictly under `SSE_BOUNDED_DURATION`; rejects a
  `SSE_EVENT_LOG_RETENTION` under twice `SSE_BOUNDED_DURATION` plus
  jitter; rejects non-positive values for `SSE_EVENT_LOG_RETENTION`,
  `SSE_EVENT_LOG_MAX_ENTRIES`, `SSE_BOUNDED_DURATION`, `SSE_BOUNDED_RETRY`,
  `SSE_DETECTION_TIMEOUT`, and `SSE_DETECTION_CACHE_TTL`.
- The detection cache (section 6): a valid, non-expired `sseBoundedUntil`
  entry skips detection entirely and opens directly with `?bounded=1`, no
  unbounded connection attempted; an expired or absent entry runs
  detection as today; a detection timer that clears (a message arrives,
  proxy absent or since whitelisted) clears any stale cache entry rather
  than leaving it in place, the self-heal path; only the "detected true"
  outcome is ever written to `localStorage`, a successful unbounded
  connection never writes a "detected false" entry.
