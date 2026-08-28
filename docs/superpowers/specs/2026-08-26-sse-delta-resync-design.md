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

Options 1 to 3 ask where the event log lives, taking for granted that there
is one. Option 4 asks whether there should be, and is listed last because it
would replace this design rather than restructure it.

**1. In-memory log embedded in `Room`'s existing state (chosen).** Extend
`RoomData` with a monotonic sequence counter and a time-windowed event log,
alongside the state it already owns (`users`, `currentIssue`,
`pendingSessions`, renamed `sessions` by section 5's Problem D). No new
actor, no new dependency, consistent with the
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

**4. Short polling instead of an SSE fallback at all.** A
`GET /rooms/:roomId/state` returning the room's current snapshot, polled
every second or so by detected clients, passes a buffering proxy trivially:
a finite response completes, so it is scanned and released immediately, which
is the one thing this proxy reliably does (see Problem). It needs none of
this design's machinery. No sequence ids, no `Last-Event-ID`, no `Reset` id
semantics, no `Mode` ADT, no wall-clock cap, no jitter, no proxy-timeout
invariants, and no event log to retain, prune or size. It is genuinely the
smaller change, and it is written up here because options 1 to 3 all quietly
assume the fallback is SSE-shaped, which is the assumption most worth having
on the record.

Rejected, for one decisive reason and three supporting ones.

*Decisive: it puts beacon-shaped traffic on the one network already known to
be inspecting.* Ten clients at one request per second is 36,000 requests an
hour, at a fixed interval, to a single URL, with small uniform responses.
That is the textbook signature of malware beaconing, which is precisely what
an antivirus-scanning appliance exists to flag. Introducing it on this
customer's network, while a whitelist request is open with that customer's
security team (see Purpose), risks an automated block and the goodwill the
whitelist depends on, and the two failures compound: the traffic pattern
argues against the exemption being requested for it. Bounded mode runs at
roughly a tenth the request rate and, because `SSE_BOUNDED_DURATION_JITTER`
deliberately desynchronizes clients, is not interval-regular either.

*Latency, at its honest magnitude.* Polling at 1s costs a uniform 0 to 1s.
Bounded mode is not zero against it: the proxy withholds everything until the
response completes, so an event landing on an open bounded connection still
costs a close plus a full scan-and-release, typically a few hundred
milliseconds, and 1 to 2 seconds when the recipient happens to be inside its
reconnect gap. So bounded wins on the mean by perhaps two or three times,
with a comparable worst case. Worth having for a reveal, but not on its own a
reason to prefer one design over the other, and stated at this magnitude so
the rejection does not rest on a claim that would not survive measurement.

*Bandwidth, which is the weakest of these and is included in order to be
dismissed.* A 10-person snapshot is on the order of 900 bytes, so about 3 MB
per client per hour, against roughly an eighteenth of that for bounded
cycles. Densifying the snapshot helps less than it looks, since at that size
the HTTP headers are comparable to the body. Neither figure matters at this
app's scale, and neither should be cited as a reason.

*Reuse.* Sequence ids and `Last-Event-ID` are preparatory rather than
single-purpose. `docs/roadmap.md`'s Phase 4 server-authoritative auto-reveal
is what the 08-24 backpressure spec parked "Option 2" against; section 6's
detection and re-detection timers substantially deliver that file's backlog
item "client-side connection-liveness watchdog", which it notes was not
buildable at all under the old WebSocket transport; and the `connection.js`
extraction is what Phase 3's framework rewrite ports instead of
reimplementing. Polling delivers none of the three. Note "preparatory" and
not "prerequisite": the stronger word belongs to the 08-24 spec's own
framing, quoted in Purpose, and is more than this design needs. Problem A and
Problem E give auto-reveal trustworthy vote and reveal state by themselves,
and a full resync with `Reset` reports both correctly, so the delta mechanism
is an optimization for that phase rather than a gate on it.

*One point in polling's favour, recorded rather than argued away.* A poll is
itself a liveness signal, so presence would fall out of the polling endpoint
and Problems C and D would largely not arise for those clients. That is
genuinely simpler than the grace-period machinery this design extends. It
loses anyway, because it would mean two presence mechanisms running side by
side, one per client type, which is worse to hold in your head and worse to
test than the single complicated one this design already has.

*When this stops being the loser.* Every argument above assumes the proxy
model in Problem is accurate. If it turns out otherwise, most obviously a
proxy that also kills or buffers short-lived streaming responses, or one that
rate-limits rather than only scanning, then bounded mode's premise fails
outright and polling is the fallback to reach for. It is recorded in this
much detail so that it can be picked up rather than rediscovered.

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
def logEvent(event: RoomEvent, now: Instant, config: RoomConfig): (RoomData, SequencedRoomEvent) =
  val id      = this.sequence + 1
  val stamped = SequencedRoomEvent(id, event)
  val cutoff  = now.minus(config.eventLogRetention)
  val prunedByAge = (this.eventLog :+ (now, stamped))
    .dropWhile { case (ts, _) => ts.isBefore(cutoff) }
  val pruned = if prunedByAge.size > config.eventLogMaxEntries
    then prunedByAge.drop(prunedByAge.size - config.eventLogMaxEntries)
    else prunedByAge
  (this.copy(sequence = id, eventLog = pruned), stamped)
```

`dropWhile` tests `isBefore(cutoff)`, so an entry whose timestamp is exactly
`cutoff` is *retained*: its age is exactly the retention window, not past it.
Stated here because the boundary tests below assert it in both directions and
the predicate is the only thing that decides which way it falls.

**`now` is a parameter, not an `Instant.now()` call inside the method.**
Reading the clock in here would make `logEvent` the one impure method on
`RoomData` and make the "mirrors every other state transition in this file"
argument above merely nearly-true, which is the argument the whole
placement decision rests on. Taking the instant as input keeps `RoomData`
exactly as pure as it is today and puts the clock read in `Room`, which is
already the effectful layer, via a one-line private helper so the call
sites don't each repeat it:

```scala
private def logNow(data: RoomData, event: RoomEvent, config: RoomConfig) =
  data.logEvent(event, Instant.now(), config)
```

Three things fall out of that, beyond the naming being honest:

- The "one consistent instant for the whole pass" property becomes
  structural rather than a matter of discipline. An earlier version of this
  design had to argue that `now`/`cutoff` should each be captured once
  rather than calling `Instant.now()` again inside `dropWhile`'s predicate
  for every element scanned, which would recompute and let the cutoff drift
  across the scan. With `now` supplied from outside, there is no second
  clock to call and no way to write that bug.
- Retention becomes testable at its boundaries instead of approximately.
  A test can pass an explicit `now` and assert exactly what happens to an
  entry one millisecond inside the window, one exactly at the cutoff, and
  one outside it. None of that is reliably expressible against the real
  clock, and it avoids adding another `Thread.sleep` in the style of
  `RoomSpec.scala:208`.
- It's a better foundation for the durable event log named under
  "Approaches considered" as the eventual direction, since replaying
  persisted entries means supplying their recorded timestamps rather than
  whatever the clock says at replay time.

Each handler that broadcasts calls `logNow` first, sends the stamped event
via `broadcast` unchanged, and threads the returned `RoomData` into
`receiveBehaviour`, e.g.:

```scala
case ClearVotes(token) =>
  data.users.find(_.token == token) match
    case Some(user) =>
      val (logged, event) = logNow(data, RoomEvent(MessageType.Clear, roomId, user.id, RoomEvent.NoExtra), config)
      val newData         = logged.clear()
      broadcast(event, newData.users, context)
      receiveBehaviour(roomId, newData, config, timers)
    case None => Behaviors.same
```

`EditIssue` and `ShowVotes` need one extra step of care, they're the call
sites where `broadcast`'s data and the handler's own state change both
independently touch `data`: `EditIssue` broadcasts using the pre-edit
`data.users`, then separately applies `data.editIssue(issue, user.id)` to
build what's passed to `receiveBehaviour`, and `ShowVotes` gains the same
shape once it starts recording `revealed` (section 5's Problem E). Now that
`logEvent` also returns updated `RoomData` (sequence/log), that update has
to sit *underneath* the handler's own transition, not be overwritten by it:

```scala
case EditIssue(token, issue) =>
  data.users.find(_.token == token) match
    case Some(user) =>
      val (logged, event) = logNow(data, RoomEvent(MessageType.EditIssue, roomId, user.id, issue), config)
      broadcast(event, data.users, context)
      receiveBehaviour(roomId, logged.editIssue(issue, user.id), config, timers)
    case None => Behaviors.same

case ShowVotes(token) =>
  data.users.find(_.token == token) match
    case Some(user) =>
      val (logged, event) = logNow(data, RoomEvent(MessageType.Show, roomId, user.id, RoomEvent.NoExtra), config)
      broadcast(event, data.users, context)
      receiveBehaviour(roomId, logged.reveal(), config, timers)
    case None => Behaviors.same
```

`logged.editIssue(...)` and `logged.reveal()`, not `data.editIssue(...)` /
`data.reveal()`, so the sequence/log update from `logEvent` isn't silently
dropped. `ShowVotes` also stops being the file's one handler that returns
`Behaviors.same` after broadcasting (`Room.scala:173-181`), since it now has
state to thread; its `foreach` becomes a `match` like every other
token-resolving handler.

**`ConfirmLeave` logs too, and it is the broadcaster easiest to miss.** Every
broadcast site is a log site, which means all seven: `Join`, `Vote`,
`ClearVotes`, `ReVote`, `ShowVotes`, `EditIssue` and `ConfirmLeave`
(`Room.scala:208-225`). `ConfirmLeave` is the one reached from a timer rather
than from a client request, so an implementation that walks the client-facing
handlers skips it, and the omission is not cosmetic: a `Leave` that never
reaches `eventLog` never reaches a delta either, so a bounded client whose
reconnect gap spans a departure keeps that participant in its list forever.
That is the second of the two latent gaps under "Why
full-resync-on-every-reconnect isn't safe either", reintroduced through the
very path this design adds to close it. It carries the same overwrite trap as
`EditIssue`, so the removal applies on top of `logged`, not `data`:

```scala
case ConfirmLeave(userId, ref, replyTo) =>
  if data.users.exists(u => u.id == userId && u.ref == ref) then
    val (logged, event) =
      logNow(data, RoomEvent(MessageType.Leave, roomId, userId, RoomEvent.NoExtra), config)
    val newData = logged.leave(userId, ref)
    broadcast(event, newData.users, context)
    if newData.users.isEmpty then
      replyTo ! Stopped(roomId)
      Behaviors.stopped
    else
      replyTo ! Running(roomId)
      receiveBehaviour(roomId, newData, config, timers)
  else Behaviors.same
```

The `Behaviors.stopped` branch discards the entry it just appended. That is
correct rather than a leak: the room is going away and its log with it, and
nothing can request a delta from a stopped actor.

`RoomConfig` groups `gracePeriod` with the two new knobs below, rather
than adding them as further loose parameters:

```scala
final case class RoomConfig(
  gracePeriod: FiniteDuration,
  boundedGracePeriod: FiniteDuration,
  eventLogRetention: FiniteDuration,
  eventLogMaxEntries: Int
)

object RoomConfig:
  val default: RoomConfig = RoomConfig(6.seconds, 15.seconds, 5.minutes, 5000)
```

(`boundedGracePeriod` is section 5's Problem D part 2; it belongs on
`RoomConfig` for the same reason `gracePeriod` does.)

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
0".** The first `logEvent` in a room's life produces id `1`, so `0` is only
ever a room's pre-history baseline and is never carried by a real event.
`Room.Join` logs the arrival before building the resync (section 4's
ordering rule), so the first person into an empty room gets a baseline of
`1`, not `0`, and no client ever legitimately holds `0` as a
`Last-Event-ID`. Spelled out because the off-by-one is easy to misread the
other way.

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

**This is a shared-fate cost, not only a self-heal for the client causing
it.** `eventLog` is per-room state, so one client's abuse (or even a
legitimate burst that outruns the retention window) prunes entries every
*other* bounded client in that same room may still need. Each bystander's
next reconnect then also falls back to full resync with `Reset`,
repeatedly for as long as the pruning keeps outrunning their retention
window, producing a visible participant-list clear-and-rebuild on
innocent clients, not just on the one causing it. The rate-limiting gap
in `docs/known-issues.md` is the root cause; this backstop only bounds
memory and prune-scan cost, it does not prevent this cross-client
degradation.

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
`RoomConfig(sseConfig.gracePeriod, sseConfig.boundedGracePeriod, sseConfig.eventLogRetention, sseConfig.eventLogMaxEntries)`,
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
  `List[SequencedRoomEvent]`** (`finalData.eventLog.collect { case (_, seq)
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
`lastEventId: Option[Long]`, `currentSequence = finalData.sequence`, and
`finalData.eventLog`:

- `!isResume` (the `userId` was not already in `users`, so either a genuine
  first connection or a client whose grace period elapsed and whose entry
  `ConfirmLeave` removed) -> full resync case, ahead of every check below,
  whatever `lastEventId` says. See section 5's Problem D part 3 for why a
  delta is wrong here even when the id resolves cleanly.
- `lastEventId.isEmpty` -> first-connection case.
- `lastEventId` contains `id` where `id == currentSequence` -> delta case,
  trivially empty: the client is already caught up. This is the common
  bounded case, since a client that just resynced holds exactly the
  baseline and nothing has necessarily happened since.
- `lastEventId` contains `id` where `id < currentSequence` and
  `finalData.eventLog.exists(_._2.id == id)` -> delta case, reply with
  `eventLog.collect { case (_, seq) if seq.id > id => seq }`.
- Anything else, including `id > currentSequence` (never legitimately
  issued by this room, e.g. malformed or spoofed) and `id < currentSequence`
  with no matching entry (pruned) -> full resync case. Collapsing "too old"
  and "never valid" into one path is deliberate: the remedy is identical
  either way, and the alternative (silently returning an empty delta for an
  `id` the room never issued) would leave a client stuck believing it's
  caught up when it never validly resynced in the first place.

This same `id > currentSequence` branch is also what covers a room actor
restarting mid-session (a crash, a redeploy): `sequence`/`eventLog` are
in-memory only (see "Approaches considered"), so a restart resets
`sequence` to 0 while a still-connected browser may hold a much higher
`Last-Event-ID` from before the restart. That id is now greater than the
freshly-reset `currentSequence`, so it falls into the same full-resync
path as a malformed or spoofed id, no special-casing needed, the general
rule already covers it.

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
(`Room.scala:124`) resolves it against `finalData.eventLog`/
`finalData.sequence` in place of today's unconditional `setupNewUser` call,
sending either the delta or the `Reset` + full-resync batch to `user.ref`.
Unlike today, that send happens *after* the `Join` broadcast rather than
before it, so the resolution sees the arrival's own log entry; see section
4's ordering rule for why, and section 5 for the handler shape.

This deliberately avoids a separate ask-based resolution step (e.g. a
`Room.ResolveResync(lastEventId, replyTo)` queried before subscribing).
Today, `Join` computes the resync content and registers the connection for
future broadcasts inside one actor message, so there's no window where an
event could be logged after the log is read but before this connection
starts receiving live broadcasts, or the reverse, causing a duplicate.
Resolving in a separate step ahead of `Join` would reopen exactly that
race. Piggybacking on `Join`, which already does the presence update and
the reply send atomically, avoids inventing a new failure mode.

This preserves the actor-hop shape the existing "connection-establishment
race" comment on `Room.scala:125-129` depends on: `setupNewUser`'s
unconditional call is replaced by this section's delta/full/`Reset`
resolution, but it's still one direct `user.ref ! ...` push made
synchronously from inside the `Join` handler, not a new intermediate hop
or an ask-based round trip. That comment's caveat, the send racing the
new connection's downstream demand not yet being established, is about
this hop's existence and timing relative to stream materialization, not
about what content the push carries, so it applies unchanged here; there
is nothing new to re-verify from restructuring this design didn't do.

### 4. Client fix, self: `Reset` before any full resync

A new `RoomEvent.MessageType` case, `Reset` (not `Clear`, that name is
taken by vote clearing and means something different), sent as the first
element of the batch immediately before any full-resync burst (both cases
in section 3 that aren't a delta). Client handler: on `Reset`, restore every
piece of room-derived state to its initial value before applying what
follows. Harmless on a first connection (it is already at those values).
This fixes both latent gaps in "Why full-resync-on-every-reconnect isn't
safe either" above, by construction: starting from empty makes duplication
impossible, and a departed participant simply isn't re-added, no separate
removal signal needed. This is a full replacement for defensive/idempotent
handler guards, not an addition to them, the reconnecting client's own
state is always rebuilt from an authoritative snapshot, never patched.

**What `Reset` clears, exactly.** `ref.users = []` alone is not enough, and
naming only that would leave the "rebuilt, never patched" claim above
false: five other fields in the Vue `data` block (`index.html:335-356`) are
room-derived and would survive a full resync as stale values. The rule is
that `Reset` restores exactly the initial value of every field the resync
burst is authoritative over, which is the same thing as "what a
freshly-loaded page holds before its first message":

| Field | Reset to | Rebuilt by |
| --- | --- | --- |
| `users` | `[]` | `Init` + per-user `Join`/`Vote` |
| `user.estimation` | `""` | own replayed `Vote`, if `u.voted` |
| `votesSummary` | `[]` | `updateSummary()` from the `join`/`vote` handlers |
| `votesRevealed` | `false` | replayed `Show`, if `data.revealed` |
| `ownVoteConfirmed` | `true` | not replayed; see below |
| `currentIssue` | `""` | replayed `EditIssue`, if `issueLastEditBy` is set |

Connection and UI-local state is deliberately excluded: `inRoom`,
`showError`/`errorMessage`/`consecutiveErrors`, `connecting`, `creating`/
`joining`/`editing`, `eventSource`, `roomId`, `user.id`, `user.name`. None
of those is derived from the event stream, and `inRoom` in particular is set
`true` by the dispatcher (`index.html:401`) before any handler runs, so
resetting it would fight the very message carrying the `Reset`.

Three of these need their reasoning stated rather than assumed:

- `user.estimation` is the concrete case that makes this more than tidiness.
  A client that misses a `clear` during the gap and resolves to full resync
  gets a correct `users` list (nobody is marked voted) while continuing to
  display its own stale vote, because `setupNewUser` only emits a `Vote` for
  users who *are* voted (`Room.scala:267-270`) and so says nothing that
  would overwrite it. Clearing it is safe precisely because the resync is
  authoritative in the other direction too: if the server still holds the
  vote, the replayed own `Vote` restores it via `index.html:431-433`.
- `ownVoteConfirmed` resets to `true`, not `false`, and this is the one
  value that isn't simply "empty". It only selects between two styles of
  the already-selected estimation button (`index.html:231-232`) and only
  matters when `e === user.estimation`, so with `user.estimation` cleared it
  is invisible until either the replay restores a vote or the user votes
  again. If the replay does restore a vote, the server demonstrably holds
  it, which is exactly what "confirmed" means. `true` is also its initial
  value, so the "freshly-loaded page" rule and the semantics agree.
- `currentIssue` resets to `""` because that is genuinely the server's value
  when no `EditIssue` is replayed: `RoomData.editIssue` always sets
  `issueLastEditBy` alongside `currentIssue` (`Room.scala:96-97`), so
  "`issueLastEditBy` is empty" implies "the issue was never set." Not
  clearing it would preserve a stale issue string with nothing to correct
  it.

**One thing `Reset` does not fix, recorded so it isn't read as more than it
is.** `currentIssue` is `v-model`-bound
to the issue input (`index.html:192`), so a full resync landing while a user
has the edit form open discards their in-progress typing. That is already
true of any inbound `edit_issue` broadcast today, but a bounded client's
resyncs make it likelier. The real fix is to stop applying remote issue
updates while `editing` is true, which is a pre-existing UI gap and out of
scope here.

**A cosmetic risk this introduces.** The resync burst leaves `Room` as one
push, but `.mapConcat(identity)` (`SSE.scala:67`) flattens it into
individual SSE frames, so the client sees N separate `onmessage` calls, not
one. Vue batches DOM updates per tick, so a repaint between the `Reset`
frame and the frames that rebuild the list is possible, showing an empty
room for a frame. On a first connection this is invisible because `inRoom`
is still `false` and gates the whole room view; on a *resync* `inRoom` is
already `true`, so nothing gates it. Accepted rather than engineered around:
the frames arrive from a single proxy release and land within a fraction of
a millisecond of each other, there is no burst-end marker the client could
wait for without inventing one, and the deferred room-skeleton work under
"What was deferred or rejected" is where a real answer to "the room view
should not look authoritative while it is being rebuilt" belongs.

**Adding the enum case, and the trap in `MessageType`'s companion.**
`MessageType` (`RoomEvent.scala:21-55`) hand-maintains two mappings
alongside the enum itself: `apply(String)` with a throwing default, and
`unapply` matching every case. Adding `Reset` leaves both stale, and
neither omission is caught at compile time. `apply`'s `case _ => throw`
swallows the gap by construction, and `unapply`'s newly non-exhaustive
match is only a warning, because `build.sbt` sets no `scalacOptions` and
warnings are not fatal in this project. Both would surface at runtime
instead, as an `IllegalArgumentException` on `"reset"` and a `MatchError`
respectively.

Today that trap is latent rather than live, which is the reason to remove
it rather than carefully step around it: `unapply` has no call sites at all,
and `apply`'s only caller is `messageTypeDecoder`, which is itself unused
since nothing derives or invokes a `Decoder[RoomEvent]` anywhere and only
`roomEventEncoder` is wired up. So adding the case carelessly breaks
nothing now, and breaks whenever either is first used. Rather than adding
one more entry to two hand-maintained lists, derive both from the enum's
own `values`, which makes the entire class of omission unrepresentable:

```scala
def apply(messageType: String): MessageType =
  values
    .find(_.stringRep == messageType)
    .getOrElse(throw new IllegalArgumentException(s"$messageType is not a valid MessageType"))

def unapply(messageType: MessageType): Option[String] = Some(messageType.stringRep)
```

Identical behavior, including the exception type and message, in about four
lines replacing about twenty-four.

**What id `Reset` carries.** The underlying
`RoomEvent(MessageType.Reset, roomId, user.id, RoomEvent.NoExtra)`, where
`user.id` is the connecting user's own id for consistency with `Init`
(`Room.scala:263`) and so the frame is attributable in logs, is not itself
a room event in the log
sense: it's generated fresh per-connection at resolution time, never
passed to `logEvent`, so it never appends to `eventLog` and never consumes
a new sequence number. It's still wrapped as a `SequencedRoomEvent` like
everything else sent over the wire (section 1), but the id it's wrapped
with is a *read* of the room's `sequence` at resolution time (e.g.
`SequencedRoomEvent(12, resetEvent)` if 12 real events have been logged so
far), establishing the client's new baseline, not an increment of it.
Every frame in the resync burst that follows (`Reset`, `Init`, replayed
`Join`/`Vote`, `EditIssue`, `Show`) is wrapped with that same id, `12`,
repeated rather than incrementing, since they're a reconstructed view of
current state, not new log entries. Repeating it on every frame, rather
than relying on the SSE spec's "the last-event-id buffer carries forward
across frames that omit `id:`" behavior, keeps the invariant locally
obvious on each frame instead of depending on that subtler spec detail.
The client's next reconnect then correctly requests everything after 12, a
genuine delta from exactly that point.

**Which `sequence` gets read, and why the `Join` handler's internal order
matters.** "The room's `sequence` at resolution time" is ambiguous for a
genuinely new arrival, because that same `Join` produces a log entry of its
own. The rule is that the baseline is the sequence *after* any log entry
this `Join` itself produced, so the handler logs and broadcasts the `Join`
event first and builds the resync from the resulting `RoomData`, rather than
resolving at the pre-broadcast baseline and letting the client's own `Join`
arrive afterwards as a separate push. See section 5 for the resulting
handler shape.

Resolving pre-broadcast was the earlier design, and it costs a bounded
client a whole reconnect cycle on the join path. The resync push would carry
baseline 12, then `broadcast` would send the joining client its own `Join` at
13 as a *second* push, which `take(1)` discards (section 6). The client's
next cycle then exists purely to collect event 13, which its own handler
throws away anyway (`index.html:412` skips a `join` for its own id). So
joining costs an extra proxy round trip plus an extra `SSE_BOUNDED_RETRY`
gap, on precisely the path where the connecting spinner is already showing.

Logging first is not just cheaper, it's simpler in three ways:

- The resync burst is already authoritative about the joining user, since
  `setupNewUser`'s `perUser` list is built from `data.users`, which
  `joinUser` has already added them to (`Room.scala:267-270`). Delivering
  their own `Join` again as a live broadcast was always redundant, carried
  only by the client's own-id guard, which section 4 otherwise makes a point
  of not relying on.
- It makes one rule cover both resolution paths: the baseline is always
  `finalData.sequence` at the moment the resync is built, whether this was a
  new arrival (post-log) or a resume (no log entry, so unchanged). No
  ordering wrinkle to special-case.
- `logEvent` only touches `sequence`/`eventLog`, and `setupNewUser` reads
  `users`/`currentIssue`/`issueLastEditBy`/`revealed`, so building the
  resync from the post-log `RoomData` produces byte-identical content. Only
  the baseline id changes, which keeps the change low-risk.

It also retires a wrinkle this design previously had to explain at length.
Because the resync was computed before the increment, the first person into
an empty room received `Reset(id=0)` against an empty `eventLog` and then
their own `Join` at `id=1`, which needed a paragraph clarifying that
`sequence = 0` meant "nothing logged yet" rather than "the first event is id
0", plus a dedicated clause in section 3's resolution rule to stop
`id = 0` from falling through to a spurious full resync. Under this
ordering the first joiner's baseline is `1`, the log holds exactly that one
entry, and their next reconnect resolves as `id == currentSequence`, a
trivially empty delta, by the ordinary rule.

### 5. Server fixes on the reconnect path

Five problems, all latent today and all made routine by bounded mode's
reconnect cadence. The first two share one root cause and one fix, both
stemming from `Room.Join`'s handler treating every `Join` as a brand-new
arrival (`Room.scala:124-133`), never asking whether this `userId` was
already present:

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
      (this.copy(users = this.users.map(u => if u.id == user.id then merged else u)), true)
    case None =>
      (this.copy(users = user :: this.users), false)
```

**The resume branch replaces in place rather than removing and prepending.**
Today's `merged :: users.filterNot(_.id == user.id)` (`Room.scala:71-74`)
moves the reconnecting user to the head of the list on every resume. That
is invisible today because reconnects are rare, and invisible to existing
clients even under this design because a resume no longer broadcasts
(Problem B). But `setupNewUser` builds its `perUser` frames straight from
`data.users`, so a bounded client cycling every 20 seconds continuously
reshuffles the order that any *new* joiner then renders. Replacing in place
costs nothing, keeps participant order stable for the room's lifetime, and
reads as what it is. It relies on there being at most one entry per `id`,
which `joinUser` is itself the sole enforcer of, since it is the only
insertion point and now either replaces an existing entry or prepends when
absent.

`joinUser` no longer touches the session store at all, which is Problem D's
part 1 below, not an omission here. Note also that `merged` carries over
only `voted`/`estimation`: `bounded` (added in Problem D part 2) comes from
the incoming `user`, since it describes the new connection, not the old one.

```scala
case Join(user, lastEventId) =>
  val (newData, isResume) = data.joinUser(user)
  val finalData =
    if !isResume then
      val (logged, event) = logNow(newData, RoomEvent(MessageType.Join, roomId, user.id, user.name), config)
      // Bystanders only: the resync below already accounts for the joining user.
      broadcast(event, logged.users.filterNot(_.id == user.id), context)
      logged
    else newData
  // Resolve per section 3 against finalData, send to user.ref; !isResume forces
  // Reset + full resync (Problem D part 3), baseline finalData.sequence (section 4).
  resolveAndSend(user, roomId, finalData, lastEventId, isResume, context)
  receiveBehaviour(roomId, finalData, config, timers)
```

The resolve-and-send now sits *after* the log-and-broadcast rather than
before it, which is section 4's ordering rule, and the broadcast is scoped
to bystanders because the resync burst already represents the joining user.
Note this is still one direct `user.ref ! ...` push made synchronously from
inside the `Join` handler, so section 3's note on preserving the
`Room.scala:125-129` connection-establishment race shape still holds:
what moved is the order of two sends within one handler, not the number of
actor hops.

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

**Re-keying on `userId` alone is not sufficient on its own, and is a
correctness regression without the second half of this fix.** Keying the
timer on `userId` is required, because `Join` has to be able to cancel a
pending removal and `timers.cancel(userId)` cannot reach a
`(userId, ref)`-keyed timer. But `startSingleTimer` *replaces* the timer
under a key, and a replaced `ConfirmLeave` carries a different `ref` than
the one it displaced. Since `ConfirmLeave` decides whether to act by
comparing that `ref` against the currently-registered one, collapsing two
`Leave`s is not benign: only one `ref` survives into the fired message, and
it can be the wrong one.

```
refB is the currently-registered ref for this user.
Leave(userId, refB) -> timers[userId] = ConfirmLeave(userId, refB)   real final departure
Leave(userId, refA) -> replaces it:    ConfirmLeave(userId, refA)    stale, arriving late
fires -> data.users.exists(_.ref == refA) is false -> Behaviors.same
```

The user is never removed, `newData.users.isEmpty` is never reached, and
the room actor never stops: a phantom participant in everyone's list for
the life of the process. Under today's `(userId, ref)` keying the two
timers are independent and the `refB` one still fires correctly, so this
would be a regression introduced by the re-key, not a pre-existing gap.

The ordering it needs is reachable, and this design is what makes it so.
`Room.scala:68-70` already flags overlapping connections as a live concern,
and section 6 adds a specific instance: the abandoned unbounded detection
connection is closed client-side at `SSE_DETECTION_TIMEOUT` but the
buffering proxy holds it open, so the server may not observe its
termination until the proxy's own timeout, tens of seconds and many bounded
cycles later. A `Leave` for that long-dead `ref` landing within a grace
period of the user's real final `Leave` is all it takes.

**Fix:** key the timer on `userId`, have `Join` cancel it, and move the
staleness check from fire time to `Leave` time, so a superseded `Leave`
never creates a timer that could displace a live one:

```scala
case Leave(userId, ref, replyTo) =>
  data.users.find(u => u.id == userId && u.ref == ref) match
    case None =>
      // Superseded (this user is present under a newer ref) or already removed.
      // Either way there is nothing this Leave could ever remove.
      Behaviors.same
    case Some(user) =>
      if timers.isTimerActive(userId) then context.log.warn(...) // as today
      val delay = if user.bounded then config.boundedGracePeriod else config.gracePeriod
      timers.startSingleTimer(key = userId, msg = ConfirmLeave(userId, ref, replyTo), delay = delay)
      Behaviors.same

case Join(user, lastEventId) =>
  timers.cancel(user.id)
  val (newData, isResume) = data.joinUser(user)
  // ... as above
```

(`config` is `RoomConfig` from section 2; `Room.apply`/`receiveBehaviour`
take it in place of the standalone `gracePeriod` parameter throughout this
section. `boundedGracePeriod` and `user.bounded` are Problem D part 2.)

Dropping on `None` is equivalent-or-better than scheduling in both of the
cases it covers, which is why it's a safe simplification rather than a new
policy: if the user is present under a different `ref`, `ConfirmLeave`
would have compared and no-oped a grace period later anyway; if the user
isn't present at all, there is nothing to remove. Both outcomes are
identical, just reached immediately instead of eventually, and neither can
now displace a pending removal that would have acted.

This also subsumes the cost problem Problem C opened with, more completely
than re-keying alone would: a stale `Leave` no longer occupies a
`TimerScheduler` slot for a full grace period or produces a wasted
`ConfirmLeave` message, because it never schedules anything.
`timers.cancel(user.id)` in `Join` covers the remaining case, a genuine
removal pending for a user who has just come back. Net effect: at most one
live grace timer per user at any instant, created only by a `Leave` that
could actually act, and cleared on every rejoin.

`ConfirmLeave`'s ref-scoped check stays exactly as-is, but it is now
belt-and-braces rather than load-bearing, and the spec should say so rather
than repeat the old justification. With the `Leave`-time check in place,
the only way a scheduled `ConfirmLeave`'s `ref` stops being current before
it fires is a `Join`, which cancels the timer, and Pekko's
`TimerScheduler` discards an already-delivered message for a cancelled
timer via its generation counter, so the check should be unreachable. It is
kept because it costs one predicate and its absence would make correctness
depend on that generation-counter detail holding.

The existing `(userId, ref)`-key comment and its "relies on RoomManager
calling Leave at most once per connection" caveat (`Room.scala:189-193`)
are replaced, not simply dropped. The re-key does remove that dependency,
but on its own it substitutes a worse one, that `Leave`s arrive in `ref`
order; the `Leave`-time check is what removes both. The `isTimerActive`
warning it guarded stays meaningful and stays accurate under the new
shape: the different-`ref` case now returns before reaching it, so a live
timer at that point means a second `Leave` for the ref that is still
current with no intervening `Join`, which is exactly the
duplicate-`Leave`-per-connection condition the warning was written for.

**Problem D, a reconnect that outlives the grace period is terminal, not a
flicker.** Problem C above, and the 08-24 grace period it builds on, both
frame a too-late reconnect as a cosmetic leave-then-rejoin flicker. It
isn't. Token resolution is derived from presence: `ValidateToken`
(`Room.scala:236-243`) resolves against `pendingSessions` and then against
`users`, `joinUser` consumes the `pendingSessions` entry on the first
connect (`Room.scala:73`), and `ConfirmLeave` removes the `users` entry
(`Room.scala:209-210`). Once the grace period elapses both stores have
forgotten the token, so the next reconnect resolves `Unresolved` and
`/events` answers `401` (`API.scala:129-131`). `EventSource` does not retry
a non-2xx, so `onerror` takes the CLOSED branch (`index.html:479-480`) and
the participant is told to reload the page. If they were the room's only
member, `ConfirmLeave` also stopped the room actor, so even the `401` is
unavoidable.

This is already live, and it's a gap at the seam between two designs rather
than an oversight in either:
`docs/superpowers/specs/2026-08-20-session-identity-design.md:129-134`
deliberately resolves a reconnect against `users`, which is correct for a
reconnect arriving while the user is still present, and the 08-24 grace
period exists precisely to make a late arrival rare. It stays rare only
while reconnects themselves are rare.

Bounded mode removes that premise twice over. It opens the window hundreds
of times per session instead of once or twice, and it opens the window
earlier than the retry cadence suggests: `watchTermination` sits upstream of
`take(1)` in section 6's source, so `done` completes the instant `take(1)`
cancels, which is before Pekko has flushed the response and well before the
buffering proxy has scanned it and released it to the browser. The gap the
grace period actually has to cover is proxy-scan-and-release plus
`SSE_BOUNDED_RETRY` plus a fresh connect back through the proxy, not
`SSE_BOUNDED_RETRY` alone. An earlier version of section 6's config
invariants proposed `gracePeriod >= 2 * boundedRetryMillis` for this; it
measures the wrong quantity and would pass comfortably while the real gap
ran long.

**Fix, part 1: token resolution stops being derived from presence.**
`pendingSessions` becomes `sessions`, retained for the room actor's lifetime
instead of consumed on promotion: `joinUser` no longer removes the entry
(see its snippet above) and `ValidateToken` resolves against `sessions`
alone, its `users` fallback becoming dead code and going away.
`PendingSession` is renamed `Session`, since nothing about it is pending any
more. A reconnect after removal then resolves normally and comes back as a
full resync with `Reset` (part 3 below), the same self-heal path this design
already relies on everywhere else, instead of a dead end. `SseConfig` is
untouched by this part; it's purely a `Room`/`RoomData` change.

**This does not cover the solo case, and the difference is worth being exact
about.** Retained sessions live in the room actor, so they only outlive a
removal the actor itself outlives. When the departing user was the room's
only member, `ConfirmLeave` reaches `newData.users.isEmpty`, replies
`Stopped` and stops (`Room.scala:216-218`); `sessions` dies with it, and the
next `/events` resolves `Unresolved` against a room that no longer exists. A
lone participant whose reconnect outruns the grace period therefore still
gets the `401` this part removes for everyone else.

Two things make that a residual to state rather than a hole to engineer
around here. The exposure closes the moment a second participant is present,
since `users.isEmpty` is then unreachable for one client's slow reconnect, so
it is confined to the window where someone has opened a room and is waiting
for others. And room identity is bookmark-driven rather than
lifecycle-driven: `RequestSession` recreates a missing room under the URL's
own id (`RoomManager.scala:87-99`), so the next `POST /join` for that id
resurrects it, losing only what the actor held, which for a waiting solo user
is the issue string and nothing else.

What is not acceptable is the client's half of it, and that is fixed in
section 6 rather than here. A `401` puts `EventSource` in CLOSED with no
retry, so the user is parked on "please reload the page" at exactly the
moment they are least likely to be watching the screen. The reload is not a
diagnostic step, it is a fixed recipe that would work; see "Automatic
recovery from a terminal `401`" in section 6 for running it automatically.

The remaining trigger is worth naming because bounded mode creates it. On an
ordinary idle cycle the gap to cover is the proxy releasing a zero-byte
response, plus `SSE_BOUNDED_RETRY`, plus a fresh connect through the proxy,
on the order of a second or two against a 15s `boundedGracePeriod`. Nothing
about the normal cadence comes near it, so this is not an idle-timing
failure. What can burn 15s is the client being suspended rather than the
network being slow, and the ordinary form of that is a backgrounded tab,
which browsers throttle and eventually freeze. Today that costs nothing: an
unbounded connection simply stays open and gets heartbeated. Under bounded
mode a solo room's survival depends on its one occupant's tab reconnecting
every 20 to 30 seconds, so backgrounding it becomes sufficient to reap the
room. Whether `EventSource`'s own reconnect timer is throttled the same way
`setTimeout` is, is not something this design should assert either way; the
end-to-end case below measures it, and that measurement is the one input
that would justify revisiting room lifetime.

Four consequences, stated here rather than discovered later:

- *Memory.* One small entry per `POST /rooms/:roomId/join` per room,
  unchanged by reconnects (a bounded cycle re-enters through `/events`,
  which never mints a session), so growth is per page load, not per cycle.
  The `docs/known-issues.md` entry "A `/join` with no follow-up `/events`
  leaks a pending session for the room's lifetime" stops describing an
  accident and starts describing the deliberate retention policy: rewrite
  it, don't remove it, since the growth is now intended and still wants the
  same room-level idle-expiry resolution from Phase 2/5.
- *Behavior.* The session cookie is path-scoped and `httpOnly` and
  `doLeave` (`index.html:511-518`) never clears it, so today "click Leave,
  then reload" produces a `401` and the misleading "your session has ended"
  banner. It will now silently rejoin the same room under the same
  identity. That's an improvement, and it is a change.
- *Security.* A token stays valid for the room's lifetime rather than for
  the presence's, widening the window in which a captured cookie is usable.
  Accepted for an internal tool behind `SameSite=Strict`, `httpOnly`,
  path-scoped cookies, and recorded here rather than accepted silently.
- *A grace trip now loses the returning user's vote silently, where before it
  announced itself.* Problem A's fix carries `voted`/`estimation` across a
  *resume*, but a user whom `ConfirmLeave` already removed is not a resume:
  `joinUser` takes the `None` branch and inserts them fresh from
  `RoomManager.InitialVoteState`/`InitialEstimation`. Before this part, that
  path ended in a `401` and a visible "your session has ended" banner, so the
  loss was at least loud. It now ends in a successful rejoin that shows the
  participant as not having voted, with nothing on screen to say so. This is
  Problem A's failure reached through a second door, and it lands on exactly
  the state the Purpose says server-authoritative auto-reveal will have to
  trust. Not fixed here, because the vote genuinely no longer exists in room
  state by the time the reconnect arrives; part 2 below is what keeps the
  common case away from this path, and the residual belongs with whatever
  eventually gives `sessions` an idle expiry.

**Fix, part 2: bounded connections get their own, longer grace period.**
Part 1 makes a late reconnect recoverable but not free: every trip still
removes the user, broadcasts a `Leave` to bystanders (a participant visibly
vanishing and reappearing in every other client's list), forces the
returning client through a full resync's clear-and-rebuild, and, for a solo
participant, reaps the room. So the common case should not reach removal at
all. `RoomConfig` gains `boundedGracePeriod` (default 15s,
`SSE_BOUNDED_GRACE_PERIOD`), and `Leave` uses it for a connection that
arrived with `?bounded=1`, per the snippet above.

`Room` needs to know which it is. `User` gains `bounded: Boolean`, set from
the query param and threaded exactly the way section 3 threads
`lastEventId` (`SSE.source` -> `RoomManager.ConnectToRoom` -> `Room.Join`),
rather than hanging the flag off `ConnectionCompleted`/`ConnectionFailure`/
`Leave`: the property belongs to the connection, `User.ref` already *is* the
connection, and `Leave`'s handler is looking the user up by `(id, ref)`
anyway to pick the delay. It also gives section 6's "how many clients are
on the bounded path" log line its data for free. Note this differs
deliberately from `lastEventId`, which rides on the `Join` message rather
than on `User`: `lastEventId` is consumed once, during resolution, and is
meaningless afterwards, while `bounded` has to outlive the `Join` to be
readable at `Leave` time.

15s is not a measured figure, same as every other timing constant here. It
sits roughly an order of magnitude above the expected per-cycle gap, so a
whole session's worth of cycles still has a low expected number of trips,
while a genuine tab close is still announced inside a meeting's attention
span. It makes `docs/known-issues.md`'s "A deliberate tab close is as slow
to announce as a transient reconnect" entry worse for bounded clients
specifically, 6s to 15s, which is the deliberate trade: a slow departure
notice is cosmetic, and what it buys is not.

**Fix, part 3: `isResume` gates delta versus full resync, not just the
broadcast.** Once a reconnect after removal can succeed, resolving it as a
delta is wrong even when its `Last-Event-ID` is comfortably inside the
retained window. The delta would contain that client's own `Leave` event,
and `index.html:461-464` applies it by filtering the user out of
`ref.users`, with no `Init` in a delta to re-add them: the client would
prune itself from its own participant list and stay that way. So section 3's
resolution rule gains a guard ahead of every other case: if `joinUser`
reports this was not a resume, the connection resolves to `Reset` plus full
resync regardless of what `Last-Event-ID` says. `joinUser` already returns
that flag for Problem A/B's fix, so this is one more consumer of the same
single source of truth, not a second lookup that could drift.

**Problem E, a full resync can't say whether votes are currently
revealed.** `ShowVotes` broadcasts and changes nothing
(`Room.scala:173-181`), so "revealed" exists only as a client-side flag,
and `setupNewUser` has no `Show` equivalent to replay. A resyncing client
therefore falls back to `allVoted()` (`index.html:553-555`), which
re-derives `votesRevealed` as "everyone has voted". That is the app's own
auto-reveal rule, so it agrees with the server in every case but one:
`Show` pressed while a straggler hasn't voted, a legitimate facilitator
flow. The resyncing client then hides votes everyone else can see.

An earlier version of this design deferred that as pre-existing and "not
worsened." Worsened is the wrong word, since no state becomes more wrong
than today, but the frequency and the timing both change materially, which
amounts to the same thing in practice. Today the only full resync a client
takes is at join, when nothing is revealed and it has no expectations, since
buffer overflow is the sole reconnect trigger. Under this design a bounded
client takes the full-resync path mid-session routinely: first connect of
every page load, every prune, every grace trip. Mid-session the room may
well be revealed. Section 2 also makes `Show` a logged event, so the delta
path now replays it correctly, which leaves the two resolution paths
disagreeing about the same room rather than being uniformly wrong. Fixing
it is smaller than this paragraph.

**Fix:** make "revealed" server state and replay it, the same way
`currentIssue` already is. `RoomData` gains `revealed: Boolean` (initially
`false`), `reveal()` sets it, and the existing `clear()`/`reVote()` set it
back to `false` alongside the vote fields they already touch. `setupNewUser`
then synthesizes a `Show` frame when it's set, exactly as it already
synthesizes an `EditIssue` frame from `issueLastEditBy`/`currentIssue`
(`Room.scala:264-266`):

```scala
val revealed = if data.revealed then List(RoomEvent(MessageType.Show, roomId, user.id, RoomEvent.NoExtra)) else Nil
user.ref ! (init ++ editIssue.toList ++ perUser ++ revealed)
```

No client-side change at all: the `show` handler already exists
(`index.html:437-440`) and no new `MessageType` is needed, unlike `Reset`.

**The append position is the whole fix, not a detail.** The synthesized
`Show` must come *last*, after `perUser`, because every replayed `Join` and
`Vote` calls `allVoted()`, which overwrites `votesRevealed` from the derived
value. Placed with `init`/`editIssue` at the front, as would be the natural
symmetry with `editIssue`, it would be silently overwritten by the very next
frame and the fix would look applied while changing nothing. This is exactly
the kind of thing that passes a hand test in an all-voted room and fails in
the straggler room the fix exists for, so the test below pins the ordering
specifically.

Two consequences elsewhere in this design: section 4's `Reset` table entry
for `votesRevealed` becomes server-authoritative rather than re-derived,
though `Reset` still clears it to `false` and lets the burst re-establish
it; and `ShowVotes`'s handler shape changes as shown in section 2.

The `docs/known-issues.md` entry "Resync doesn't replay whether votes are
currently revealed" gets removed rather than updated, per that file's own
convention. It already proposed this shape ("presumably a
`votesRevealed`-equivalent flag on `RoomData`, included in the resync
burst") and pointed at Phase 4's server-authoritative auto-reveal in
`docs/roadmap.md` as the natural home, on the grounds that Phase 4 needs
reveal state to be real backend state rather than a client-only flag. It now
is, so Phase 4 inherits that prerequisite already met, which is the same
motivation this spec's Purpose gives for pulling sequence numbers forward.
It also removes the observer-mode caveat the entry carried: a passive
display resyncing into a stale "not revealed" view, with no human in the
loop to notice, was the sharpest form of this bug.

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
- Start a detection timer when the `EventSource` is *constructed*, not in
  its `onopen` handler, duration sent from the server (see below), default
  5s. The distinction is the whole mechanism: the proxy this spec targets
  delivers no headers at all for a stream that never completes (see
  Problem), so `onopen` never fires in exactly the case detection exists to
  catch, and a timer armed there would never start. Same for re-detection
  below, which arms in `onerror` rather than `onopen` for the same reason.
  On the *first* connection of a fresh page load this
  window can be short, because that connection always has no
  `Last-Event-ID` yet and so per section 3 always gets an immediate `Reset`
  + full-resync burst: the timer only has to detect "did the connection
  open at all," not "did some arbitrary future event occur." A bounded
  connection is never timed, since it may legitimately wait out an empty
  delta for the whole wall-clock cap. An unbounded *reconnect* is timed,
  but against a longer window, for the reason given under "re-detection"
  below. Any message, including a heartbeat, clears it, and clears any
  stale `sseBoundedUntil` entry left over from a previous visit, this is
  the self-heal path: if the proxy situation genuinely changed since the
  cache was written (whitelisted, or this device is now on a different
  network), the very next detection that's allowed to run corrects it.
- If the timer fires with nothing received: close that connection, mark an
  in-memory `sseBounded = true` for this page instance, write
  `localStorage.setItem('sseBoundedUntil', Date.now() + SSE_DETECTION_CACHE_TTL)`,
  and manually open a new `EventSource` with `?bounded=1`. `sseBounded`
  being sticky for the page instance means this switch happens at most once
  per page load, whether it was triggered by first-connection detection or
  by re-detection below. These are the only two manually-driven reconnects
  in this design, both needed because the URL itself changes.
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
- **Automatic recovery from a terminal `401`.** The CLOSED branch is a dead
  end by construction: `EventSource` does not retry a non-2xx, so today the
  handler tells the user to reload (`index.html:479-480`). But the reload is
  not a diagnostic step, it is a fixed recipe, `created()` re-runs `doJoin`
  from the remembered `roomId`/`name` and mints a fresh session. So run the
  recipe instead of asking for it: on the CLOSED branch, re-run `doJoin()`.
  The user lands back in the room with a new identity and, if the room had
  been reaped, an empty one, which is exactly what the reload would have
  produced. Two properties make this compose rather than special-case:
  `sseBounded` is sticky for the page instance, so the reopened connection
  stays on whichever path detection already chose, and the new connection
  carries no `Last-Event-ID`, so it resolves as `Reset` plus full resync and
  the client's state is rebuilt rather than patched.
- **Exactly one automatic attempt, then the banner.** A `401` has causes a
  re-join cannot fix, most obviously the `SECURE_COOKIES` misconfiguration
  `API.scala:106-110` already warns about, where the browser never returns
  the cookie at all. Retrying that in a loop would replace a clear
  instruction with a silent spin, and mint a session and possibly a room
  actor per attempt. One attempt, tracked by a flag that any successful
  message resets, then the existing banner unchanged. Note this is not
  bounded-mode-specific: the dead end it removes is live today for any client
  whose room was reaped while it was away, and it is what section 5's Problem
  D part 1 deliberately leaves standing for the solo case.
- **Re-detection: the timer is re-armed on every unbounded reconnect, not
  only on the first connection.** Detection as described so far runs once
  per page load and only ever caches a positive, which handles a path that
  stops being proxied (TTL expiry, plus the self-heal on any message) but
  not a path that *starts* being proxied. That direction is just as real,
  and the TTL's own rationale above already concedes it: a VPN toggling on,
  a laptop moving onto the corporate network, a proxy config being pushed
  mid-meeting. Without re-detection, a client that connected unbounded
  successfully and then lands behind the proxy is permanently broken.
  Native `EventSource` retry reopens the same unbounded URL, the proxy
  swallows it, and the only visible outcome is the error banner appearing
  after the debounce threshold and never clearing. So: whenever an
  unbounded connection enters CONNECTING (the non-CLOSED `onerror` branch,
  and only while `sseBounded` is false), arm the same kind of timer; any
  message clears it; if it fires, take the same switch as first-connection
  detection.
- **Arm only if one is not already armed.** `onerror` is not once-per-window:
  a connection refused outright fails in milliseconds, so a client in a real
  outage can produce several `onerror` events well inside a 20-second window.
  Re-arming on each would reset the timer indefinitely and detection would
  never conclude, which is the exact failure re-detection exists to prevent,
  reached by a different route. The rule is that the window measures "nothing
  has arrived since the connection started failing", not "nothing has arrived
  since the most recent failure", so the timer is armed on the first
  `onerror` of a failing stretch and cleared only by a message.
- **The re-detection window has to be longer than the first-connection one,
  and the reason pins the value.** A first connection is guaranteed an
  immediate `Reset` + full resync (section 3), so 5s is generous. An
  unbounded *reconnect* has no such guarantee: with a valid
  `Last-Event-ID` and nothing new it resolves to a trivially empty delta,
  which sends nothing at all to `user.ref` (see the `take(1)` note below),
  so the first frame it legitimately sees is the `.keepAlive` heartbeat.
  A 5s window would therefore false-positive on every reconnect into an
  idle room. The window is `heartbeatInterval + SSE_DETECTION_TIMEOUT`
  (15s + 5s = 20s), computed server-side and delivered in `JoinResponse`
  alongside the other client-side values. Deliberately derived rather than
  given its own env var: unlike the other constants here this isn't a free
  judgment call, it's "one heartbeat interval, plus the same margin a first
  connection gets", so it stays correct by construction if
  `heartbeatInterval` (moved to `SseConfig`, see the config invariants)
  ever changes and can't be
  misconfigured into a value that fights `.keepAlive`.
- A timer is the right signal here rather than a count of consecutive
  `onerror` events, for two reasons. Each failed unbounded attempt behind
  this proxy costs the proxy's own timeout (45s) before the browser even
  sees a failure, so a threshold of 3 would mean minutes of a visibly
  broken room; and a proxy variant that releases headers but buffers the
  body would fire `onopen` on every attempt, resetting any error counter
  forever while never delivering a message. "Nothing arrived within a
  window that `.keepAlive` guarantees a frame inside" catches both.
- The mid-session switch accepts a full resync, and that's the correct
  trade rather than a gap. A new `EventSource` object cannot inherit the
  old one's internal last-event-id, so the reopened bounded connection
  sends no `Last-Event-ID` and resolves as `Reset` + full resync
  (section 3). Reconstructing the cursor in script would mean tracking ids
  client-side, exactly the resume bookkeeping this design avoids by staying
  on one `EventSource` object, and the payoff would be saving one
  clear-and-rebuild on a transition that happens at most once per page
  load. `Reset` makes the full resync correct (section 4), so the cost is
  cosmetic.
- Every reconnect other than those two switches, every scheduled bounded
  close and any ordinary drop, is handled by the browser's own native
  `EventSource` auto-reconnect on that same object, not further custom JS:
  same URL, so `retry`/`Last-Event-ID` are applied automatically per the
  SSE spec. This matters beyond simplicity: it guarantees at most one
  connection open per client at any time, so there's never a window where
  an old, still-closing connection and a newly opened one could overlap and
  deliver events out of order. Both manual switches stay inside that
  guarantee, for different reasons. `close()` takes effect synchronously,
  so the old object is CLOSED before the new one is constructed and the
  browser never reads from both. For the first-connection switch nothing
  was ever received on the connection being replaced (that is the detection
  signal itself), so there's no cursor to lose or race against. For the
  mid-session switch there is a cursor, deliberately discarded per the
  bullet above, and no ordering hazard on the wire either: once `joinUser`
  replaces the entry, broadcasts go only to the new `ref`, and anything
  already queued for the old one is read by nobody. Server-side, the old
  connection's termination may be observed long after the new `Join`,
  because the proxy is still holding it; that is precisely the stale-`Leave`
  ordering section 5's Problem C now checks for at `Leave` time rather than
  at fire time.

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
    the wall-clock cap (`SSE_BOUNDED_DURATION` base 20s +
    `SSE_BOUNDED_DURATION_JITTER` 0-10s, so clients don't cycle in
    lockstep) elapsing with nothing new, in which case it closes anyway
    with no data, purely to stay safely under the proxy's 45s limit, and
    the client reconnects with the same `Last-Event-ID` since nothing
    changed.
  - Note the wall-clock cap is still required even though every other
    cycle closes immediately on a push, since a genuinely idle room must
    still self-close before 45s, otherwise it's exactly today's failure,
    the proxy killing an open-ended stream with nothing delivered.

**Implementation shape: one `Mode` parameter on `SSE.source`, not a
separate bounded-mode source and not a pair of parameters.** The retry
value, the no-`.keepAlive` rule, and the adaptive close all have to be
decided by the same caller (the `/events` route, once it knows whether
`bounded` is present), so they're carried together rather than threaded as
separate loose parameters the way section 1's plain `retryMillis: Int`
might suggest in isolation:

```scala
enum Mode:
  case Unbounded(retryMillis: Int, heartbeatInterval: FiniteDuration)
  case Bounded(retryMillis: Int, durationMillis: Int)

  // Section 5's User.bounded, which has to outlive the Join to be readable at Leave time.
  def bounded: Boolean = this match
    case _: Bounded => true
    case _          => false

def source(
    roomManager: ActorRef,
    roomId: UUID,
    userId: UUID,
    name: String,
    token: Room.SessionToken,
    lastEventId: Option[Long],
    mode: Mode
)(using ec: ExecutionContext): Source[ServerSentEvent, ActorRef] =
  val base =
    Source
      .actorRef[List[SequencedRoomEvent]](completionMatcher, failureMatcher, bufferSize, OverflowStrategy.fail)
      .mapMaterializedValue { user =>
        roomManager !
          RoomManager.ConnectToRoom(roomId, userId, name, token, lastEventId, mode.bounded, user)
        user
      }
      .watchTermination() { (user, done) =>
        done.onComplete {
          case Success(_) => roomManager ! RoomManager.ConnectionCompleted(roomId, userId, user)
          case Failure(t) => roomManager ! RoomManager.ConnectionFailure(roomId, userId, user, t)
        }
        user
      }

  mode match
    case Mode.Bounded(retryMillis, durationMillis) =>
      base
        .take(1) // close after the first pushed batch, whatever it contains
        .takeWithin(durationMillis.millis) // ...or the wall-clock cap, whichever is first
        .mapConcat(identity)
        .map(seq => ServerSentEvent(data = seq.event.asJson.noSpaces, id = Some(seq.id.toString), retry = Some(retryMillis)))
        // no .keepAlive: see below, the cap already stays under Pekko's idle-timeout
    case Mode.Unbounded(retryMillis, heartbeatInterval) =>
      base
        .mapConcat(identity)
        .map(seq => ServerSentEvent(data = seq.event.asJson.noSpaces, id = Some(seq.id.toString), retry = Some(retryMillis)))
        .keepAlive(heartbeatInterval, () => ServerSentEvent.heartbeat)
```

**Why a `Mode` ADT rather than `retryMillis` plus
`bounded: Option[BoundedConfig]`.** With both parameters present, a bounded
connection has two retry values in scope and only one of them is read: the
standalone `retryMillis` is dead whenever `bounded` is `Some`, since
`BoundedConfig` carries its own. Nothing prevents a caller passing a
sensible-looking value that is silently ignored, or omitting one that
matters. The ADT makes that state unrepresentable, and each case names
exactly the values its branch consumes. `heartbeatInterval` sits on
`Unbounded` alone for that reason, which turns the no-`.keepAlive`-for-
bounded rule from a convention the implementation has to remember into
something the types do not let it express.

`Mode` is also where `User.bounded` (section 5's Problem D part 2) comes
from, rather than a second parameter alongside it: the route has already
decided the mode by the time it calls `SSE.source`, and a separate `bounded`
argument would be a second copy of the same fact, free to disagree with the
one the stream branch actually uses. `mode.bounded` in `mapMaterializedValue`
keeps one source of truth, which is the same argument the ADT itself rests
on. Note this is the connection property `Leave` reads to pick its grace
period; it is distinct from the stream-shaping values in the same case.

Two smaller things this settles. It removes the default arguments, so the
positional break at the existing call site (`API.scala:120-127`, which
passes `sseConfig.retryMillis` positionally and now has to name a mode)
becomes a compile error rather than something that could bind wrongly if
the parameter order shifted again. And it puts jitter at the route:
`SSE.source` receives already-jittered values instead of computing them,
which keeps it deterministic given its input and lets `SSESpec` assert
exact `retry:` and cap values. That is the same seam as the `Instant.now()`
decision in section 2, applied to randomness rather than to time, and for
the same reason.

`take(1)` operates on the `List[SequencedRoomEvent]` batches, *before*
`.mapConcat(identity)` flattens them, so it closes after one complete
push regardless of how many events that push contained, the same
single-push discipline section 3 requires, not after the first
individual flattened event. Composing `take(1)` with `takeWithin` gives
"close on the first batch, or at the cap, whichever happens first";
confirmed with a standalone spike against a `Source.actorRef[List[Int]]`
wired the same way (`take(1).takeWithin(cap).mapConcat(identity)`): a
multi-element push flows through in full, in order, before the stream
completes (no truncation after the first flattened element); the stream
closes immediately on a push that arrives well before the cap rather
than waiting out the remainder; an idle source closes with nothing
delivered once the cap elapses; and a push arriving after `take(1)` has
already closed the stream is silently dropped (dead letters), not an
error, no extra guarding needed against it.

**`SSE.bufferSize` needs re-verifying against this shape rather than
inheriting its existing justification.** The comment sizing it at 1
(`SSE.scala:19-27`) reasons about a stream that consumes continuously, where
the buffer only has to absorb "two ordinary actions landing close together"
before demand returns. A bounded stream does not consume continuously: after
`take(1)` emits, it pulls no more, so any push landing between that emission
and the cancel propagating upstream sits in a buffer of 1 under
`OverflowStrategy.fail`. The spike above covers pushes arriving *after* the
stream has closed (dead letters, benign); it does not cover that window. The
window is short and the consequence is the existing self-heal path
(`ConnectionFailure` -> `Leave` -> reconnect -> delta), so this is a
measurement to take rather than a redesign to plan, but it must be taken:
the current value's stated rationale does not extend to this mode, and a
bounded client in a busy room hits the window on every cycle.

**Dead letters are routine in bounded mode, and that is by design.** A
bounded connection closes while its user remains in `data.users` for the
whole grace period, so every broadcast in that gap is sent to a stopped ref.
Those events are in `eventLog` and arrive on the next delta, which is the
mechanism working, not failing. Worth stating because Pekko logs dead
letters and `application.conf` runs at `DEBUG`: an operator reading logs
during rollout will see them and should not read them as an incident. The
bounded-close log line described below is the signal to correlate against.

This also tightens something section 3 left implicit: for this to work,
`Join`'s handler must send nothing to `user.ref` when the resolved delta
is empty (the "trivially empty" case in the precise resolution rule),
rather than pushing an empty `List`, otherwise `take(1)` would consume
that empty push and close the bounded connection immediately with
nothing delivered, turning the "stay open" case into an accidental
zero-content close every cycle. An empty resolution simply results in no
send at all, letting the connection sit open for `take(1)` to catch the
next real push, live broadcast or otherwise.

- **Bounded connections carry a distinct, smaller `retry:` hint than the
  unbounded default**, `Mode.Bounded.retryMillis` above.
  `SseConfig.retryMillis` (2000ms) keeps governing unbounded connections
  unchanged, but a bounded connection's frames carry a separate value:
  500ms base with +/-100ms jitter per connection (same
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
  `SSE_BOUNDED_DURATION` (wall-clock cap base, default 20s),
  `SSE_BOUNDED_DURATION_JITTER` (jitter added to that cap, default 10s,
  giving the "0-10s jitter" above a named, tunable value rather than an
  unconfigurable constant; distinct from the retry jitter below, this one
  randomizes when an idle connection force-closes, not how long the
  browser waits before reopening one), `SSE_BOUNDED_RETRY` /
  `SSE_BOUNDED_RETRY_JITTER` (default 500ms +/- 100ms), and
  `SSE_BOUNDED_GRACE_PERIOD` (default 15s, section 5's Problem D part 2;
  consumed server-side in `Room`'s `Leave` handler, so no client-delivery
  mechanism is needed for it), and `SSE_HEARTBEAT_INTERVAL` (default 15s,
  unchanged from today's hardcoded value; see the config invariants for why
  it stops being a constant). Made tunable
  deliberately: these values are a judgment call about a real proxy's
  behavior and real users' tolerance for lag, which this design can't
  fully settle ahead of time. The intent is to revisit them with real
  feedback after the first production deployment, not treat the defaults
  above as final.
- **`SSE_ASSUMED_PROXY_TIMEOUT`** (default 45s) sits in the same config but
  is not a tuning knob like those: it declares a fact about the deployment
  environment, the shortest response-completion deadline any proxy in front
  of this service is believed to enforce. Nothing reads it at runtime. It
  exists solely so the config invariants below can check the bounded
  wall-clock cap against the ceiling that actually matters, rather than
  only against the one the codebase happens to know for itself. 45s is this
  customer's proxy (see Problem); a deployment behind a stricter one lowers
  it, one behind no buffering proxy at all can raise it.
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
  completes, see Problem). `JoinResponse` carries the re-detection window
  alongside it, as `heartbeatInterval + SSE_DETECTION_TIMEOUT`, computed
  server-side rather than exposed as its own env var for the reason given
  in the re-detection bullet above: it is derived from an existing
  guarantee, not a free choice.
- **`SSE_DETECTION_CACHE_TTL`** (default 24h), threaded the same way as
  `SSE_DETECTION_TIMEOUT` above (via `JoinResponse`, it governs client-side
  `localStorage` behavior, nothing that rides the SSE wire protocol), same
  "judgment call, revisit after production feedback" reasoning: short
  enough that a whitelist fix or a genuine network change (see the
  detection-cache-check bullet above) self-corrects within about a
  business day, long enough that a customer joining several rooms across a
  single day only pays the detection window once, on their first join.
- **`doLeave`'s `localStorage.clear()` has to become targeted removals, or
  the TTL above doesn't do what it says.** `doLeave` (`index.html:511-518`)
  wipes all of `localStorage`, which today means exactly `roomId` and
  `name` (`index.html:336,353,382-383`, the only keys in use). Adding
  `sseBoundedUntil` to the same store means the Leave button silently
  resets detection, so a customer running several plannings in a day pays
  the detection window again after every Leave, which is precisely the flow
  the 24h TTL was justified by. Replace the bulk `clear()` with
  `removeItem("roomId")` and `removeItem("name")`: behavior-preserving
  today, since those are the only two keys, and correct going forward for
  the right reason rather than by luck. The detection result describes the
  network path between this browser and this origin, not the room or the
  session, so leaving a room is not an event that should invalidate it.
  That is the classification to apply to any future key as well: room and
  session state is swept by `doLeave`, path state is not.
- One consequence of fixing that, stated rather than left to be discovered:
  `doLeave` was an accidental escape hatch from a false-positive detection,
  and after this fix TTL expiry is the only reset. A client wrongly pinned
  to the bounded path therefore stays there for up to
  `SSE_DETECTION_CACHE_TTL`, where before it could be cleared by leaving
  and rejoining. This is the same cost already accepted for false positives
  generally (see the deferred entry on distinguishing proxy buffering from
  transient latency), it is bounded and non-critical, and the lever if it
  proves too long in practice is the TTL itself, which is already tunable.
  No separate revalidation mechanism is proposed for it.
- **Logging at the decision points this design introduces**, plain SLF4J
  log lines, no new dependency, since several constants above are
  explicitly framed as "revisit after production feedback" and that
  revisit is unactionable without a way to observe what actually
  happened: a debug/info line in `Room`'s `Join` handling when
  resolution falls back to full resync for a non-first-connection reason
  (section 3's "not resolvable" case), noting whether it was
  age/count-pruned or an id the room never issued, this is the signal for
  whether `SSE_EVENT_LOG_RETENTION`/`SSE_EVENT_LOG_MAX_ENTRIES` are sized
  correctly for real reconnect cadences; a line when a connection
  resolves with `?bounded=1` present, a rough count of how many clients
  are actually on the bounded path; and a line at bounded-connection
  close noting which of the two close reasons fired (push-triggered vs.
  wall-clock cap), the signal for whether `SSE_BOUNDED_DURATION` is
  well-tuned (mostly push-triggered closes means the cap is rarely the
  limiting factor; mostly cap-triggered closes in an active room may mean
  it's too short). Deliberately not proposing a metrics library or
  dashboard here, this codebase has none today and adopting one is a
  separate infrastructure decision; these are the minimum log lines
  needed so a later look at production logs can actually answer the
  tuning questions this spec defers, not a full observability solution.
- No `Room`/`RoomManager` structural changes needed beyond sections 1-5,
  the bounded path is just a client-driven reconnect cadence riding on the
  same delta-resync mechanism every client uses.

**Config invariants.** `SseConfig.load` already enforces
`gracePeriod >= 2 * retryMillis` specifically so a routine reconnect
reliably beats the grace period, or Problem C (section 5) reintroduces the
leave-then-rejoin flicker it exists to prevent (which section 5's Problem D
shows is actually a terminal `401`, not a flicker). This design adds a
second grace period the same property depends on,
`SSE_BOUNDED_GRACE_PERIOD`, plus two proxy-facing values
(`SSE_BOUNDED_DURATION`, `SSE_DETECTION_TIMEOUT`) that can silently
reintroduce the exact failure this whole design exists to fix if
misconfigured. All of the following extend `SseConfig.load`, same file,
same style, alongside the existing checks:

```scala
require(
  boundedGracePeriod >= gracePeriod,
  s"pointing-poker.sse.bounded-grace-period ($boundedGracePeriod) must be at " +
    s"least pointing-poker.sse.grace-period ($gracePeriod): a bounded connection " +
    s"cycles orders of magnitude more often than an unbounded one, so it can " +
    s"never safely need less slack"
)
require(
  boundedGracePeriod.toMillis >= 4 * boundedRetryMillis,
  s"pointing-poker.sse.bounded-grace-period ($boundedGracePeriod) must be at " +
    s"least four times pointing-poker.sse.bounded-retry ($boundedRetryMillis ms): " +
    s"a bounded cycle pays the proxy's scan-and-release latency before the " +
    s"browser's retry timer even starts, so the real reconnect gap is a multiple " +
    s"of the retry value, not equal to it"
)
require(
  boundedDurationMillis + boundedDurationJitterMillis
    <= assumedProxyTimeoutMillis * (1 - ProxyTimeoutMarginFraction),
  s"pointing-poker.sse.bounded-duration ($boundedDurationMillis ms) plus " +
    s"pointing-poker.sse.bounded-duration-jitter ($boundedDurationJitterMillis ms) " +
    s"must leave ${ProxyTimeoutMarginFraction * 100}% headroom under " +
    s"pointing-poker.sse.assumed-proxy-timeout ($assumedProxyTimeoutMillis ms), " +
    s"or a bounded connection can outlive the very proxy timeout this mode " +
    s"exists to stay under, reintroducing the original zero-bytes failure"
)
require(
  boundedDurationMillis + boundedDurationJitterMillis < 60000,
  s"pointing-poker.sse.bounded-duration ($boundedDurationMillis ms) plus " +
    s"pointing-poker.sse.bounded-duration-jitter ($boundedDurationJitterMillis ms) " +
    s"must stay safely under Pekko's own 60s idle-timeout, or a bounded " +
    s"connection risks the framework itself killing it before the " +
    s"scheduled close"
)
require(
  heartbeatInterval.toMillis + detectionTimeoutMillis
    <= assumedProxyTimeoutMillis * (1 - ProxyTimeoutMarginFraction),
  s"the re-detection window (pointing-poker.sse.heartbeat-interval " +
    s"($heartbeatInterval) plus pointing-poker.sse.detection-timeout " +
    s"($detectionTimeoutMillis ms)) must leave " +
    s"${ProxyTimeoutMarginFraction * 100}% headroom under " +
    s"pointing-poker.sse.assumed-proxy-timeout ($assumedProxyTimeoutMillis ms), " +
    s"or the proxy kills an unbounded connection before detection can " +
    s"conclude and the client never switches to bounded mode at all"
)
require(
  heartbeatInterval.toMillis < 60000,
  s"pointing-poker.sse.heartbeat-interval ($heartbeatInterval) must stay " +
    s"below Pekko's 60s idle-timeout, or an idle unbounded stream is killed " +
    s"by the server and read as the participant leaving the room"
)
require(
  eventLogRetention.toMillis >= 2 * (boundedDurationMillis + boundedDurationJitterMillis),
  s"pointing-poker.sse.event-log-retention ($eventLogRetention) must be at " +
    s"least twice pointing-poker.sse.bounded-duration plus " +
    s"pointing-poker.sse.bounded-duration-jitter " +
    s"($boundedDurationMillis + $boundedDurationJitterMillis ms), or a bounded " +
    s"client's routine reconnect cycle will regularly fall outside the " +
    s"retained window and be forced back to full resync on every cycle, " +
    s"defeating the point of delta resync"
)
require(
  boundedRetryJitterMillis >= 0 && boundedRetryJitterMillis < boundedRetryMillis,
  s"pointing-poker.sse.bounded-retry-jitter ($boundedRetryJitterMillis ms) must be " +
    s"non-negative and strictly smaller than pointing-poker.sse.bounded-retry " +
    s"($boundedRetryMillis ms): the jitter is subtracted as well as added, so one " +
    s"that meets or exceeds the base can put a zero or negative value in a frame's " +
    s"retry: hint, which the browser reads as an unspecified reconnect delay"
)
require(assumedProxyTimeoutMillis > 0, "...")
require(boundedGracePeriod.toMillis > 0, "...")
require(eventLogRetention.toMillis > 0, "...")
require(eventLogMaxEntries > 0, "...")
require(boundedDurationMillis > 0, "...")
require(boundedDurationJitterMillis >= 0, "...")
require(boundedRetryMillis > 0, "...")
require(detectionTimeoutMillis > 0, "...")
require(detectionCacheTtlMillis > 0, "...")
```

The first seven are the important ones. The first two are analogs of the
existing check, aimed at the bounded grace period rather than the
unbounded one: without them a misconfigured `SSE_BOUNDED_GRACE_PERIOD`
reintroduces Problem D's terminal `401` for bounded clients specifically,
hundreds of times per session, with the unbounded check still passing.
The next two guard the two independent ceilings a bounded connection's
wall-clock cap sits under, and neither implies the other.

The first of them is the one that actually bites. An earlier version of
this design checked only Pekko's 60s idle-timeout here, reasoning that the
codebase can't know any given customer's proxy timeout. That's true, and it
was the wrong conclusion: the codebase can't know it, but the operator
deploying behind that proxy can, and giving them nowhere to say it means
the check guards the ceiling that doesn't matter. Any cap safe against a
45s proxy is automatically safe against a 60s framework timeout, so the
Pekko check passes for every sane value and also passes for
`SSE_BOUNDED_DURATION=50s`, which silently reintroduces the exact
zero-bytes failure this whole design exists to fix. Hence
`SSE_ASSUMED_PROXY_TIMEOUT`: a declaration about the deployment
environment rather than a behavioral tuning knob, defaulting to the 45s
this customer's proxy uses, checked with a `ProxyTimeoutMarginFraction` of
25% headroom. The margin exists because the cap is not the only thing
inside the proxy's window: its clock may start at request receipt rather
than at response start, and establishing the connection through it isn't
free. A deployment behind a stricter proxy sets the value lower and the
check follows it down, which is the case nothing in the previous version
could express at all.

**The margin is a fraction, not the fixed 10s an earlier version of this
design used, and the reason is worth recording because reasoning alone got
it wrong.** A fixed margin was chosen to avoid the defaults saturating the
check, on the assumption that a fraction would leave no room: 30s of cap
against a 45s proxy is exactly two thirds. 25% turns out to be fine (the
bound is 33.75s, so the defaults pass with 3.75s to spare) while a fixed
10s breaks down at the other end of the range. Committing to the
end-to-end tests below is what exposed that: those tests need the whole
timing set scaled down by an order of magnitude so a suite doesn't take
minutes, and with a 10s floor no proxy timeout under about 13s admits any
valid cap at all. A fraction scales with the value it guards, so one
invariant covers both the production configuration and a test one.

The Pekko check stays alongside it rather than being replaced, because
`SSE_ASSUMED_PROXY_TIMEOUT` is operator-supplied and can legitimately be
set high (a lenient proxy, or none), at which point the framework ceiling
becomes the binding one again. `.keepAlive` is deliberately not applied to
bounded connections (see above), so an idle bounded connection sends
nothing and Pekko's idle-timeout is a real hard limit, not a theoretical
one.

The fifth guards detection's whole premise, and replaces a check that
guarded nothing. An earlier version required
`detectionTimeout < boundedDuration`, justified as making detection "fire
before a slow-enough proxy kills the connection outright." That reasoning
names the right hazard and the wrong quantity: the detection timer runs on
an *unbounded* connection, which has no wall-clock cap, so
`boundedDuration` has no bearing on it whatsoever. The quantity the hazard
is actually about is the proxy's timeout, which `SSE_ASSUMED_PROXY_TIMEOUT`
now makes available. If the detection window reaches past it, the proxy
kills the connection first, `onerror` fires, re-detection re-arms, and the
cycle repeats without detection ever concluding: the client stays unbounded
and permanently broken, which is the failure this mode exists to prevent.
The check is written against the *re-detection* window
(`heartbeatInterval + SSE_DETECTION_TIMEOUT`) rather than the raw
first-connection one, because that window is strictly the larger of the two
and so is the only one that can fail; one non-vacuous check beats two where
one is unreachable.

That check needs `heartbeatInterval`, which today is a hardcoded `val` in
`SSE.scala:29-34`. **Move it into `SseConfig` and make it env-driven,
`SSE_HEARTBEAT_INTERVAL`, default 15s** (unchanged from today, so
production behavior is identical). Moving it keeps `config` a leaf package
instead of making it import the transport module, puts every SSE timing
value in one place, and gives `SSE.source` and this invariant a single
source of truth rather than a constant duplicated across packages. Its
existing doc comment already states the property that it must stay below
Pekko's 60s idle-timeout, which becomes the sixth `require` for free, in
the same style as the rest.

Making it configurable rather than merely relocating it is the second thing
committing to the end-to-end tests forced, alongside the fractional margin
above. An earlier version of this design fixed the value on the grounds
that nothing needed to vary it. The re-detection window is derived from it
(`heartbeatInterval + SSE_DETECTION_TIMEOUT`), so a test configuration that
scales every other timing down to hundreds of milliseconds cannot satisfy
the check above while this one alone stays at 15s. The general lesson, and
the reason both of these are called out rather than quietly amended: a
value that is genuinely constant in production is not automatically
constant across every configuration the system has to support, and
"nothing needs to vary it" is a claim about the deployments you have
already thought of.

The seventh guards the delta-resync
mechanism's own reason for existing: retention is what makes the bounded
path cheap (see "Why bounded reconnects need this"), and nothing else in
this config would catch a value that quietly turns every bounded cycle
into a full resync instead of a delta, still functionally correct, just
silently paying the cost this design exists to avoid.

The eighth is a bound rather than a sanity check, and is easy to leave out
because its sibling `SSE_BOUNDED_DURATION_JITTER` needs only non-negativity.
The difference is that the duration jitter is added to its base and the retry
jitter is applied in both directions, so `SSE_BOUNDED_RETRY_JITTER` at or
above `SSE_BOUNDED_RETRY` can drive a frame's `retry:` to zero or below.
The rest are the same basic sanity checks the existing values already get.

**Implementation shape: the connection logic moves out of `index.html` into
a testable module.** Everything above turns what is today a flat sequence
of `messageType` checks assigning fields (`index.html:396-471`, 113 lines)
into a connection state machine: two modes, a construct-time detection
timer, a re-detection timer with a different window, a `localStorage` cache
with a TTL and a self-heal path, one manual URL switch, an error-debounce
counter, a one-shot re-join on a terminal `401`, a spinner flag, and `Reset`
semantics across six fields. That is
also precisely the code a future framework migration has to port. Leaving
it inline means it is untestable now and rewritten twice later, so it moves
to `src/main/resources/pages/connection.js` as an ES module with its
dependencies injected:

```js
export function createConnection({
  roomId, userId, config,        // config: the values JoinResponse carries
  eventSourceFactory, storage,   // injected so tests supply doubles
  setTimeout, clearTimeout,      // injected so tests control time
  onEvent, onState               // outward reporting, see below
}) { /* ... returns { start, stop } ... */ }
```

**`onState` emits immutable snapshots, it never mutates a caller-owned
object.** This is the constraint that decides whether the module survives
the framework migration or merely survives it under Vue: mutation-based
reporting works for Vue 2 and Vue 3 reactivity and needs rework for an
immutable model such as React's, and the target framework is undecided.
Emitting a snapshot costs nothing here and keeps the module portable to
whatever is chosen.

`index.html` becomes a `<script type="module">` that imports the module and
maps emitted state onto Vue's `data`, roughly 25 lines replacing the 113
that move out. Vue itself stays a CDN global read off `window.Vue`, since
module scripts are deferred and do not expose globals. Only the connection
logic moves: the unrelated 67 lines of `methods` (`vote`, `doCopy`,
`updateSummary`, `allVoted`, and friends) stay exactly where they are, so
this is not a rewrite of the page.

Serving it needs one small addition, because `API.scala` has no static
asset route today, only `getFromFile(apiConfig.indexPath)` for `/` and
`/{uuid}`. Add a route serving `indexPath`'s parent directory rather than
introducing another config knob, so it follows `INDEX_PATH` wherever
Docker points it, and `Universal / mappings ++= directory(...)` already
packages the whole `pages` directory unchanged.

Tests run under `node --test` with **zero dependencies**: Node's built-in
runner, its built-in timer mocking, and about 70 lines of test doubles (a
fake `EventSource` exposing `readyState`/`onopen`/`onmessage`/`onerror`
plus an `emit` helper, and a fake `storage`). `package.json` declares no
`dependencies` and no `devDependencies`. CI gains a `setup-node` step and a
gating `node --test` step alongside `sbt qa`. JS coverage is deliberately
not merged into the existing scoverage/Codecov stream for now; running the
tests is the point, unifying coverage reporting is not.

This is what moves the client-side cases in Testing from manual steps to
automated ones. It does not cover the rendered DOM, and deliberately so:
the assertion of record for the spinner is the `connecting` flag, not the
template conditional. See "Front-end test tooling" under "What was
deferred or rejected" for what remains out of scope and why.

### 7. Bundled fix: buffering-proxy headers

Add `Cache-Control: no-cache` and `X-Accel-Buffering: no` to the SSE
response, closing the existing `docs/known-issues.md` entry "SSE
reverse-proxy buffering is undocumented." This will not fix the specific
antivirus-scanning proxy this spec targets (it buffers by design,
irrespective of such hints), but it's a cheap, already-flagged, unrelated
gap worth closing alongside a deployment-relevant change to this same code
path.

## Validating the proxy model

Everything from section 3 onward rests on the description in Problem, which is
stated as fact and is not tested anywhere in this design. The end-to-end layer
does not close that gap: the stub proxy is built to this model, so a green
suite proves the implementation matches the assumption, not that the
assumption matches the customer. A stub built to a wrong model tests the wrong
thing very thoroughly.

**What is actually being assumed.** Problem reads as one fact but is four,
and the design leans on three more it never states:

1. The proxy buffers the complete response body before forwarding anything.
2. It delivers no headers either, not only no body.
3. It kills the connection at 45 seconds.
4. That deadline is measured against response completion, which is what
   `SSE_ASSUMED_PROXY_TIMEOUT` encodes.
5. A response that *does* complete is released promptly.
6. Scan-and-release latency for a tiny or empty body is small.
7. A completed chunked `text/event-stream` reaches the browser in a form
   `EventSource` still treats as a stream and still auto-reconnects from.

**Three of these are already hedged and need no test.** Assumption 2 does not
matter, because the detection timer arms at `EventSource` construction rather
than in `onopen` precisely so it works whether or not headers arrive, and
section 6 already names the headers-but-no-body variant as a reason to prefer
a timer over an error count. Assumptions 3 and 4 are expressible: a stricter
or differently-measured deadline is what `SSE_ASSUMED_PROXY_TIMEOUT` exists
for, and the fractional margin follows it down. But that hedge only works if
someone supplies the real number. If the true deadline is 20 seconds, the
defaults produce a 20 to 30 second cap, the `require` passes because the
assumed value still says 45, and bounded mode fails exactly as today does.
The knob exists; the input to it is the assumption.

**Assumption 5 is the one that is neither hedged nor recoverable.** Every
mechanism in sections 3 through 6 takes it for granted that ending the
response is sufficient to make the proxy release it, and the design states it
once, in passing, while justifying `JoinResponse` as the detection-config
channel. There is a plausible scanner behaviour that breaks it outright: an
appliance whose policy is written around file-like transfers and will not
release a streaming content type at all, completed or not. Under that
behaviour bounded mode delivers nothing at any cap, and all seven config
invariants pass while it does so. The softer failure is worse value rather
than breakage: an appliance that queues responses for scanning and adds
seconds of fixed inspection latency turns bounded mode's per-event cost from
"a few hundred milliseconds" into something worse than the polling option
rejected under "Approaches considered" partly on latency grounds, while
eating the grace budget from both ends. Assumption 6 feeds
`boundedGracePeriod` directly, which is currently a guess resting on a guess.

**The blast radius is PRs 3 to 5.** PRs 1 and 2 are live bug fixes plus
precise resumption and are justified without any of this. What rides on the
model is roughly 780 lines of source and 770 of tests, plus the stub, the
harness and the Playwright suite whose entire fidelity claim is that it
reproduces the customer's report.

**The ladder, cheapest first.** Each rung is worth taking on its own; the
later ones only exist if the earlier ones do not settle it.

- *Ask.* Get the appliance's make and model from the customer's
  administrators and read its documentation. Costs an email, no user time,
  and may settle 3, 4 and 5 outright. This is also information worth having
  for the whitelist conversation that is already open.
- *Probe.* One env-gated route plus one static page, deployed on the app's own
  origin so the request traverses the identical path, roughly 80 lines. The
  customer side is "open this URL, wait two minutes, send us the table."
  Nothing about it looks like probing their infrastructure, and it needs no
  contact with their security team.

| Probe | Server behaviour | What it answers |
| --- | --- | --- |
| A | Emit three SSE frames over 2s, then close | Is a completed stream released, and is time-to-first-byte equal to close time (buffered) or near zero (streamed)? Gives assumption 6 a number. |
| B | Heartbeat every 2s, never close | The real kill deadline, and whether zero bytes truly arrive. Replaces the assumed 45 with a measured value. |
| C | One frame at 1s, close at 20s | Bounded mode's exact shape, proven without building bounded mode. |
| D | Run C through a real `EventSource` for two minutes | Content type survives, the browser reconnects, and `retry:` is honoured. Assumption 7. |

The page records, per connection: time to first byte, time to close, bytes
received, frames received, and connection count. C and D together are a
direct proof or refutation of the premise.

**What each outcome means.** Confirmed, proceed and set
`SSE_ASSUMED_PROXY_TIMEOUT` from B rather than from the default. A shorter or
differently-measured deadline, set the value and let the invariants follow it
down, no design change. A large scan-and-release latency in A, revisit
`SSE_BOUNDED_GRACE_PERIOD` and re-run the latency comparison against polling.
C or D failing, bounded mode's premise is gone and the fallback is option 4
under "Approaches considered", which is written up in enough detail to be
picked up rather than rediscovered.

**Proceeding without it is a legitimate choice, and is recorded as one
rather than reached by drift.** The probe needs a person on that network for
two minutes, and if the customer cannot supply one in the time available,
waiting is not obviously better than shipping: the whitelist request may
land first and make all of this moot either way. If that call is made, four
things soften it and one does not.

- The timing values are all env-driven, so a wrong guess about 3, 4 or 6 is a
  configuration change on a running deployment, not a code change. This is
  the strongest of the consolations and it was already true for other reasons.
- `SSE_DETECTION_CACHE_TTL` bounds how long a client can be wrongly pinned to
  the bounded path to about a day, and any message self-heals it sooner.
- The failure mode is the one that already exists. A client for whom bounded
  mode does not work is a client that cannot connect today either, so an
  unvalidated model risks wasted effort rather than a regression for anyone.
- Polling stays available as the fallback, and the probe stays useful after
  ship, since it is also the diagnostic to reach for when a report comes in.

What none of that changes: assumption 5 stays unverified until it meets the
real proxy, and the first place that happens is the customer's own
deployment. The end-to-end suite cannot substitute, for the reason at the top
of this section. Take the *Ask* rung even when the probe is skipped; it costs
nothing and is the only other thing that can move assumption 5.

## What was deferred or rejected

- **Shipping section 5's already-live fixes separately from the proxy
  work**: originally rejected, now the plan. See "Delivery" below. The
  original reasoning was that the fixes were cheap enough to bundle at
  negligible risk, that they only became consequential because of the
  feature shipping alongside them, and that splitting would cost a second
  review and release cycle for no benefit. That was sound for the change as
  it stood then: three problems in section 5 and no front-end work. It no
  longer holds. Section 5 now carries five problems, the client side gained
  an extraction plus a test layer, and an end-to-end layer came into scope,
  so "cheap enough to bundle" stopped being true, and a single PR reviewable
  in one sitting stopped being achievable. The scope growth is justified on
  its own terms; the bundling argument is simply a casualty of it.
- **Ack-based log compaction** (section 2): rejected, negligible benefit at
  this app's scale versus the added per-connection cursor-tracking state.
- **Durable/persisted event log**: deferred to whenever Phase 2 durable
  sessions work begins; not needed for this problem, and the wire protocol
  here doesn't require revisiting when that happens.
- **A separate EventLog actor**: rejected, no benefit over embedding in
  `RoomData` at this scale.
- **Short polling instead of an SSE fallback**: rejected, see option 4 under
  "Approaches considered". Decisive reason is that fixed-interval polling
  from a dozen clients is beacon-shaped traffic aimed at the one network
  already running an inspecting appliance, with a whitelist request open with
  that same security team. Recorded there in full because it is the fallback
  if the proxy model in Problem turns out to be wrong.
- **Client-side idempotency guards on `init`/`join`**: superseded by the
  `Reset` design (section 4), which is strictly more correct (it also
  handles departed-participant removal, which pure idempotency would not)
  and simpler to reason about.
- **Handling an old cached client against a new server during rollout**:
  not addressed. `index.html`'s `onmessage` dispatch is a flat sequence
  of `messageType` checks with no fallback case, so an old page that
  doesn't yet know about `Reset` simply ignores it, harmless, but loses
  `Reset`'s de-dup guarantee for the duration of that stale page load.
  Judged not worth engineering around (a version-mismatch banner, forcing
  a hard refresh) for an internal tool with short-lived sessions and no
  long-tail of cached clients.
- **Front-end unit testing**: no longer deferred, pulled into this
  delivery. See the extraction described at the end of section 6. The
  reasoning that moved it: the logic worth testing here is state
  transitions over `EventSource` lifecycle, timers, `localStorage` and a
  handful of flags, none of which needs a DOM once the logic is extracted,
  and Node's built-in test runner and timer mocking mean the floor is zero
  dependencies rather than the runner-plus-DOM-plus-build-story this entry
  previously assumed. Doing it inside this delivery rather than after also
  costs less, because the extraction touches exactly the 113 lines this
  design already rewrites, and the resulting module is what a future
  framework migration ports instead of reimplementing.
- **A component-test layer (jsdom plus a framework test-utils library)**:
  rejected outright rather than deferred. It sits between the two layers
  that do earn their place and is squeezed out by both: the module tests
  above already cover the decision logic as flags, and an end-to-end layer
  would cover the rendered result. What is left is assertions against
  framework internals, using a library pinned to the framework line being
  replaced (`@vue/test-utils@1` is Vue 2 only), for roughly six template
  conditionals. Short shelf life, no unique coverage.
- **CI integration for the end-to-end suite**: the only piece of the
  end-to-end work left out of this delivery. The stub proxy, the harness
  and the Playwright suite are all in scope (see the end-to-end group in
  Testing); what is deferred is browser-binary caching, starting the app
  from the workflow, gating, and the flakiness budget that comes with
  running a browser in CI.

  The split is drawn here deliberately. The harness is the reusable part
  and it lands now, so the deferred work is: install browsers, then invoke
  the same documented command the suite already runs under locally. Section
  6's front-end unit tests also already add `setup-node` and a gating
  `node --test` step, so the Node toolchain is in CI regardless. That
  leaves roughly 15-25 lines of workflow plus caching, with the real
  remaining cost being flakiness tuning rather than plumbing, which is
  exactly the part that can block unrelated work while it settles.

  The risk this leaves, stated plainly because it is the failure mode of
  this kind of deferral: a suite nothing runs automatically rots, and it
  rots worse than a manual checklist, because "we have end-to-end
  coverage" is false confidence where a checklist is honestly manual. Two
  mitigations are part of the in-scope work rather than intentions: the
  suite is runnable by one documented command, and this gap gets its own
  `docs/known-issues.md` entry on ship so the deferral stays visible
  instead of quietly becoming permanent.

  Value note for scheduling it: the suite is independent of the framework
  decision, and its worth peaks immediately before the framework
  migration, where it becomes that migration's regression safety net. CI
  integration should land before then.
- **The room-recreation spawn race**: recorded, not fixed. `ConfirmLeave`
  replies `Stopped` and *then* stops (`Room.scala:216-218`), so `RoomManager`
  removes the room from its map while the child actor is still terminating. A
  `RequestSession` for that same id landing inside that window calls
  `context.spawn(..., name = roomId.toString)` (`RoomManager.scala:168-173`)
  on a name that is not yet free, and throws `InvalidActorNameException`.
  Pre-existing and microseconds wide, but this design makes solo-room reaping
  routine, and "reap, then immediately recreate from the same bookmark" is
  precisely the pattern that follows it (see Problem D part 1's solo
  residual), so it gets many more chances to fire. Out of scope because the
  fix is a `RoomManager` lifecycle change independent of everything else
  here: defer the map removal to the `Terminated` signal that already
  arrives, or spawn defensively. Gets a `docs/known-issues.md` entry on ship,
  same as the CI deferral above.
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
  narrow and this cheap. Re-detection widens the exposure slightly, since
  it gives the same imprecise signal more chances to fire over a session's
  life, but it is the more forgiving of the two: its window is 20s rather
  than 5s, and it only arms while a connection is failing anyway, so what
  it misreads is a 20-second stall on an already-broken-looking connection
  rather than a slow-but-healthy start.
- **Replaying "are votes currently revealed" state on resync**: considered
  for deferral, then pulled in. See section 5's Problem E. It was originally
  written up here as pre-existing and out of scope, on the reasoning that
  this design didn't worsen it. That reasoning was wrong in effect if not in
  letter: no state becomes more wrong, but a bounded client takes the
  full-resync path mid-session routinely rather than only at join, so the
  one case where the client's derived value disagrees with the server
  (`Show` pressed with a straggler) moves from theoretical to routine. The
  fix turned out to be a `Boolean` on `RoomData` and one synthesized frame
  in `setupNewUser`, with no client-side change at all, which is less work
  than the deferral was worth. It also removes the observer-mode caveat this
  entry used to carry: a passive display resyncing into a stale "not
  revealed" view was the sharpest form of the bug, and it's now closed
  rather than flagged for later.

## Testing

Extends the existing `RoomSpec`/`SSESpec`/`BackpressureReconnectSpec`
pattern (see `docs/superpowers/specs/2026-08-24-sse-backpressure-design.md`
for the established style):

- `RoomData.logEvent` assigns strictly increasing ids and returns the
  updated `RoomData` alongside the stamped `SequencedRoomEvent`; `RoomEvent`
  itself is unaffected (same content, same JSON shape, no `id` field) by
  wrapping. `EditIssue`'s handler applies its own state change on top of
  `logEvent`'s returned data, not `data` directly, a regression test for
  the ordering subtlety in section 2. Same for `ShowVotes` and
  `logged.reveal()` (section 5's Problem E).
- Event log append and age-based pruning, driven by an explicit `now`
  rather than the real clock, so the boundaries are asserted rather than
  approximated: an entry one millisecond inside the retention window
  survives, an entry exactly at the cutoff survives (its age is exactly the
  window, not past it, which is what `isBefore` decides), and one a
  millisecond outside it is dropped. No `Thread.sleep` needed. `logEvent`
  reads no clock of its own, which this test relies on and therefore also
  pins.
- `ConfirmLeave` logs its `Leave` like every other broadcaster, and applies
  the removal to `logEvent`'s returned data rather than to `data`, the same
  regression the `EditIssue` and `ShowVotes` tests cover. The case that
  matters end to end: a client whose `Last-Event-ID` predates a departure
  receives that `Leave` in its delta and prunes the participant, which is the
  gap full resync alone cannot close and which an unlogged `ConfirmLeave`
  would silently reopen through the delta path.
- Event log count-based ceiling (`SSE_EVENT_LOG_MAX_ENTRIES`): appending
  past the ceiling drops the oldest entries regardless of age, and a
  client whose `Last-Event-ID` falls before the retained range falls back
  to full resync, same as the time-based case.
- Delta replay for a valid `Last-Event-ID`.
- Full-resync fallback (with `Reset`) for a stale or absent `Last-Event-ID`.
- The full-resync burst's wire shape, which is the server-side half of the
  `Reset` cases below: it begins with a `Reset` frame, contains exactly one
  `Join` per currently-present user, and contains none for a participant who
  left during the gap.
- Section 4's ordering rule: a new arrival receives its resync burst and
  nothing else, one push, with a baseline of the room's sequence *after*
  its own `Join` log entry, and bystanders still receive the `Join`
  broadcast. The first joiner into an empty room gets baseline `1`, not
  `0`, and its immediate reconnect resolves as a trivially empty delta
  rather than a full resync. Correspondingly, `RoomSpec.scala:368`'s
  assertion that the joining user also receives a separate `Join` broadcast
  is removed, which strengthens the `expectNoMessage()` already on the next
  line into "the replay arrived as exactly one message and nothing else."
  The batched-replay assertion at `RoomSpec.scala:411-421` is unaffected,
  since it never asserted that second send.
- Problem E: `RoomData.revealed` is set by `ShowVotes` and cleared by
  `clear()`/`reVote()`; `setupNewUser` emits a `Show` frame when it's set
  and none when it isn't. **The ordering test is the important one:** in a
  room where `Show` was pressed while one participant hadn't voted, a full
  resync leaves the client revealed. That case fails if the synthesized
  frame is placed before `perUser` and passes if it's last, where an
  all-voted room passes either way because `allVoted()` happens to derive
  the same answer. Also that `ShowVotes` threads `logged.reveal()`, not
  `data.reveal()`, the same regression the `EditIssue` test covers.
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
- Problem D part 1: `ValidateToken` still resolves a token whose user has
  already been removed by `ConfirmLeave` (today's `Unresolved` -> `401`),
  and `joinUser` no longer consumes the session entry, so two successive
  connects with the same token both resolve. An `APISpec` case that a
  post-grace-period reconnect to `/events` gets a stream, not a `401`. Plus
  the residual, asserted rather than left implicit: when the removed user was
  the room's only member, `ConfirmLeave` still stops the actor and that same
  reconnect still gets a `401`, since `sessions` cannot outlive the actor
  holding it.
- Problem D part 3: a reconnect whose user was already removed resolves to
  `Reset` + full resync even when its `Last-Event-ID` is still inside the
  retained window, and the returning client's own entry survives (its own
  replayed `Leave` lands on an already-`Reset`-cleared list rather than
  pruning the entry `Init` just added). This is the case a delta would get
  wrong.
- Problem C, the ghost-user regression this fix exists to prevent: a real
  final `Leave(userId, refB)` followed, inside the grace period, by a late
  stale `Leave(userId, refA)` still removes the user when the timer fires,
  and still stops the room if that was its last member. Asserting removal
  here is the point; a test that only asserts "one live timer" would pass
  against the broken version.
- A `Leave` whose `ref` is not the user's currently-registered one, and a
  `Leave` for a `userId` no longer present at all, both schedule no timer
  and produce no `ConfirmLeave`. A `Join` cancels a pending removal for
  that `userId`.
- **Three existing `RoomSpec` tests assert expectations this design
  deliberately inverts, and need updating as part of it, not treating as
  failures to be worked around.** `"swallow a Leave entirely if the same
  user reconnects within the grace period"` (`RoomSpec.scala:191`) and
  `"ignore a stale leave from a ref that already got replaced by a
  reconnect"` (`RoomSpec.scala:288`) both assert that a reconnect produces
  a `Join` broadcast to bystanders, which Problem B suppresses: both
  assertions invert to `expectNoMessage`. The latter's comment ("wait past
  the grace period so `ConfirmLeave` actually fires and exercises the
  stale-ref guard") also stops being true, since the stale `Leave` is now
  dropped without scheduling; the observable outcome is unchanged, but the
  test no longer covers what it says it covers and should say so.
  `"reset the grace period if Leave is called twice for the same
  connection before it elapses"` (`RoomSpec.scala:201-206`) still passes,
  but its comment documents the `(userId, ref)` keying and the
  "RoomManager calls Leave at most once per connection" assumption, both
  of which this section replaces.
- Problem D part 2: `Leave` for a connection whose `User.bounded` is true
  schedules at `boundedGracePeriod`, an unbounded one at `gracePeriod`; a
  resume carries the incoming connection's `bounded` flag, not the replaced
  entry's, so switching to bounded mid-session takes effect on the next
  `Leave`.
- The bounded path's adaptive completion: closes immediately after sending
  whatever a single push contains (a delta, a full resync, or a live
  broadcast), and closes at the wall-clock cap when nothing happened.
- A trivially-empty delta resolution (client already caught up) sends
  nothing to `user.ref`, not an empty `List`, so a bounded connection's
  `take(1)` correctly stays open for the next real push instead of
  closing immediately with nothing delivered.
- A multi-event push (a full resync burst, or a delta containing several
  events accumulated since the client's `Last-Event-ID`) is delivered as
  one connection cycle, not split across several.
- `SSE.bufferSize` against the bounded shape, which is a measurement rather
  than an assertion of intended behaviour: pushes landing after `take(1)` has
  emitted but before its cancel reaches `Source.actorRef` must either be
  absorbed or fail into the existing self-heal path, never be silently lost.
  The existing buffer size was justified for a continuously-consuming stream
  and that justification does not carry over, so the number is confirmed here
  or adjusted, not assumed.
- A bounded, idle connection does not receive `.keepAlive` heartbeats and
  closes at the jittered wall-clock cap (20-30s), not at a fixed ~15s; an
  unbounded connection still receives heartbeats unchanged.
- Bounded connections carry the smaller, jittered `SSE_BOUNDED_RETRY`
  value (not `SseConfig.retryMillis`) on their frames; unbounded
  connections are unaffected. Asserted on exact values, since jitter is
  applied at the route and `SSE.source` receives a fully-determined
  `Mode`.
- `MessageType.apply`/`unapply` derived from `values` handle every case
  including `Reset`, and a round-trip over `MessageType.values` proves no
  case can go unmapped, which is what the previous hand-maintained lists
  could not guarantee at compile time.
- `joinUser` on a resume leaves participant order unchanged: a user who
  reconnects stays in the same position, and a subsequent full resync for a
  new joiner lists participants in that same stable order.
- An end-to-end case (mirroring `BackpressureReconnectSpec`) proving a vote
  landing exactly in a bounded client's reconnect gap is delivered via the
  next delta, not lost, closing the "vote4" question raised during this
  design's review.
- A `Last-Event-ID` beyond the room's current `sequence` (malformed,
  spoofed, or otherwise never issued by this room) resolves to a full
  resync with `Reset`, not a silently-empty delta, per the precise
  resolution rule in section 3.
- A `Last-Event-ID` from before a simulated room-actor restart (a fresh
  `RoomData` with `sequence` reset to 0, holding an id from the "prior"
  session) resolves to a full resync with `Reset` via the same
  `id > currentSequence` branch, not a distinct code path, confirming
  restart recovery falls out of the general rule rather than needing its
  own handling.

**Client-side cases, run under `node --test` against `connection.js`.**
Everything above runs in ScalaTest. Everything below is behavior extracted
out of `index.html` into the module described at the end of section 6, and
is automated: Node's built-in runner, injected timers, and fake
`EventSource`/`storage` doubles, with no new dependencies. Before that
extraction none of these were testable at all, since `index.html` is a
single CDN-loaded page with no runner, DOM environment, or build step
anywhere in the repo.

Two boundaries on what this layer covers. Where a client-side case has a
server-side half, that half belongs in ScalaTest rather than here, and
those splits are noted per case. And nothing here asserts rendered DOM: the
assertion of record for the spinner is the `connecting` flag, not the
template conditional it drives. Rendered behavior is what an end-to-end
layer would cover, which remains out of scope, see "Front-end test tooling"
under "What was deferred or rejected".

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
- The one-shot re-join (section 6): a CLOSED `onerror` re-runs `doJoin` once
  and shows no banner; a second CLOSED `onerror` with no successful message
  in between shows the banner and does **not** re-join again, which is the
  loop the `SECURE_COOKIES` case would otherwise produce; any successful
  message resets the flag, so a later unrelated terminal failure still gets
  its own single attempt. The reopened connection sends no `Last-Event-ID`
  and keeps whichever mode `sseBounded` already holds, so a client that had
  detected the proxy does not silently fall back to unbounded on recovery.
- `SseConfig.load`'s new invariants (section 6): rejects a
  `SSE_BOUNDED_GRACE_PERIOD` below `SSE_GRACE_PERIOD`, and one below four
  times `SSE_BOUNDED_RETRY`; rejects a `SSE_BOUNDED_DURATION` plus
  `SSE_BOUNDED_DURATION_JITTER` that doesn't leave `ProxyTimeoutMargin` of
  headroom under `SSE_ASSUMED_PROXY_TIMEOUT`, including the case that
  motivates it, a 50s cap that the Pekko-idle-timeout check alone would
  wave through; rejects the same pair when it doesn't stay under Pekko's
  60s idle-timeout, which is a distinct case reachable only by raising
  `SSE_ASSUMED_PROXY_TIMEOUT`, so both checks need their own test; rejects a
  `SSE_DETECTION_TIMEOUT` large enough that the derived re-detection window
  (`heartbeatInterval` plus it) reaches within `ProxyTimeoutMargin` of
  `SSE_ASSUMED_PROXY_TIMEOUT`, and accepts the defaults, which is the check
  replacing the removed `detectionTimeout < boundedDuration`; rejects a
  `SSE_HEARTBEAT_INTERVAL` at or above Pekko's 60s idle-timeout; accepts a
  fully scaled-down test configuration (every timing an order of magnitude
  smaller, as the end-to-end harness uses), which is the case a fixed
  rather than fractional proxy-timeout margin would have rejected;
  rejects a `SSE_EVENT_LOG_RETENTION` under twice `SSE_BOUNDED_DURATION`
  plus `SSE_BOUNDED_DURATION_JITTER`; rejects non-positive values for
  `SSE_EVENT_LOG_RETENTION`, `SSE_EVENT_LOG_MAX_ENTRIES`,
  `SSE_BOUNDED_DURATION`, `SSE_BOUNDED_RETRY`, `SSE_BOUNDED_GRACE_PERIOD`,
  `SSE_ASSUMED_PROXY_TIMEOUT`, `SSE_DETECTION_TIMEOUT`, and
  `SSE_DETECTION_CACHE_TTL`; rejects a negative
  `SSE_BOUNDED_DURATION_JITTER` (zero is a valid "no jitter" value,
  unlike the others); rejects a `SSE_BOUNDED_RETRY_JITTER` equal to or
  greater than `SSE_BOUNDED_RETRY` and accepts zero, the pair whose
  asymmetry with the duration jitter is what makes it easy to omit.
- The detection timer is armed at `EventSource` construction, not in
  `onopen`: a simulated connection that delivers no headers and no body at
  all (the target proxy's behavior) still triggers the switch to bounded
  mode. A timer armed in `onopen` would pass a test that merely withholds
  *messages* while allowing the connection to open, so the test has to
  withhold the open event too or it proves nothing. Server-side half,
  automatable: `JoinResponse` carries both the detection timeout and the
  derived re-detection window.
- Re-detection (section 6): an unbounded reconnect that receives nothing
  inside the re-detection window switches to `?bounded=1`, and the switch
  happens at most once per page load even across many failures. The case
  that pins the window: an unbounded reconnect into an idle room, whose
  first frame is the `.keepAlive` heartbeat, does **not** trigger a switch,
  which is what a 5s window would have got wrong. The second case that pins
  it: several `onerror` events inside one window (a connection refused
  outright, failing in milliseconds) still switch at the original window's
  expiry, proving the timer is armed once per failing stretch rather than
  re-armed per error, which would postpone the switch forever. A bounded
  connection is never armed, so waiting out the full jittered wall-clock cap
  with an empty delta never triggers one either. The reopened connection sends no
  `Last-Event-ID` and resolves as `Reset` + full resync. Server-side half,
  automatable, and the more valuable of the two since it is the premise the
  window size rests on: an unbounded reconnect resolving to an empty delta
  sends nothing at all, so its first frame really is the `.keepAlive`
  heartbeat rather than anything sooner.
- The detection cache (section 6): a valid, non-expired `sseBoundedUntil`
  entry skips detection entirely and opens directly with `?bounded=1`, no
  unbounded connection attempted; an expired or absent entry runs
  detection as today; a detection timer that clears (a message arrives,
  proxy absent or since whitelisted) clears any stale cache entry rather
  than leaving it in place, the self-heal path; only the "detected true"
  outcome is ever written to `localStorage`, a successful unbounded
  connection never writes a "detected false" entry.
- `doLeave` removes `roomId` and `name` but preserves `sseBoundedUntil`, so
  a leave-then-rejoin in the same browser skips detection while still not
  auto-rejoining the room it left (`created()`'s
  `if(this.roomId && this.user.name)` guard still sees both cleared).
- `Reset` followed by a full replay produces no duplicates and drops a
  participant who left during the gap. The wire-shape half of this is
  automated server-side (see above); what is manual is that applying the
  burst to a populated `ref.users` yields the same list as applying it to an
  empty one.
- `Reset` clears every field in section 4's table and none of the excluded
  ones. The case that motivates it: a client holding a vote, a `clear` it
  never received, then a full resync, ends with `user.estimation` empty
  rather than still displaying the stale vote. Plus the inverse, that a
  client whose vote the server still holds gets it restored from the
  replayed own `Vote` rather than lost to the clear, so the reset is not
  simply destructive. And that `inRoom` survives a `Reset`, since resetting
  it would blank the room view mid-resync.

**End-to-end cases, run in a real browser through a stub buffering
proxy.** This layer exists because nothing in ScalaTest or in the module
tests can reproduce the failure the whole design is built around: it needs
a proxy that withholds a response until it completes and then kills the
connection at its own deadline. Piece one is that stub plus a harness;
piece two is the Playwright suite over it. Both are in scope here. CI
integration is not, see "Front-end test tooling" under "What was deferred
or rejected".

The stub is a plain Node HTTP server, no TLS and no `CONNECT`, roughly
60-100 lines:

- Forwards every request upstream to the app and buffers the *complete*
  upstream response, headers included, releasing nothing downstream until
  the response ends.
- On completion, writes headers then body.
- If the upstream response has not completed within a configured deadline,
  destroys the downstream connection having sent nothing at all. Default
  matches the customer's 45s; tests set it to a couple of seconds.
- Buffers every method uniformly, `POST`s included. Simpler, and more
  faithful: a response that completes immediately is released immediately,
  which is exactly why `JoinResponse` works as a delivery channel for the
  detection windows and is worth exercising rather than assuming.
- Exposes a small control endpoint to switch buffering on and off at
  runtime. This is what makes re-detection testable end to end, since a
  browser cannot change origin mid-session: the stub starts in pass-through
  mode and the test flips it to buffering while a client is connected.

The harness starts app and stub together with a test-tuned `SseConfig`
(every timing scaled down an order of magnitude) and exposes one documented
command that runs the suite. That command is deliberately the same entry
point CI will later call, so deferring CI defers plumbing rather than
design.

- **Stub fidelity, asserted without the app's client at all.** Requesting
  `/rooms/:id/events` through the stub yields zero bytes for the full
  deadline and then a destroyed connection. This is the test that proves
  the stub reproduces the customer's report, and it has to come first:
  every case below is only meaningful if this one holds.
- **The premise.** Loading the page through the stub and joining a room
  reaches the room view: detection fires, bounded mode engages, the resync
  arrives. This single case is what bounded mode exists for, and it is
  currently verified by reasoning alone.
- Two browsers through the stub: one votes, the other sees the vote within
  a bounded cycle. Exercises delta resync and the adaptive close over a
  real buffered path.
- Reveal with a straggler still unvoted, then a third client joins and
  sees votes revealed. Section 5's Problem E through the real path, in the
  one configuration where `allVoted()` cannot mask the bug.
- A client left idle across several bounded cycles stays in the room, with
  no participant flicker in the other browsers. Problem D's grace period
  and Problem C's timer keying, observed rather than unit-asserted.
- Re-detection: a client connected while the stub is in pass-through mode
  recovers after buffering is switched on mid-session, without a reload.
- **A solo client backgrounded across several bounded cycles, which is a
  measurement rather than an assertion.** Whether the tab's reconnects are
  throttled past `SSE_BOUNDED_GRACE_PERIOD` is the open question behind
  Problem D part 1's solo residual, and reasoning cannot settle it. If they
  are, the room is reaped and the client recovers through the one-shot
  re-join with no user action, landing in a recreated room. If they are not,
  the client simply stays in the room. Both are passes; what the case exists
  for is to record which one happens, since that is the input that would
  justify revisiting room lifetime.

## Delivery

Five PRs, plus a small one ahead of them that is a gate rather than a step.
The split is drawn for reviewability, and the ordering is forced by two real
dependencies rather than chosen for convenience: `Reset` has to precede
Problem D part 1 (see the `Reset` note under PR 1), and Problem D part 3
cannot ship without part 1 (see PR 2). Nothing else in the split is
load-bearing, so a PR can be resized without breaking anything as long as
those two orderings survive.

**PR 0: proxy probe.** The env-gated route and page from "Validating the
proxy model", default off, roughly 80 lines and no tests beyond a smoke case.
It gates PR 3, not PR 1 or PR 2, which are justified without the proxy work
and keep the schedule busy while a result comes back. Deliberately its own PR
so that skipping the gate is a visible decision with a date on it rather than
something that quietly never happens.

If the customer cannot supply two minutes of one person's time in the window
available, PR 3 proceeds ungated. That is an accepted outcome, not a failure
of the plan, and the reasoning plus what it does and does not cost is under
"Proceeding without it" in that section. Take the *Ask* rung either way: it
needs no user at all and is the only other thing that can move the assumption
the probe exists for. Whichever way it goes, record the choice and the date in
the PR 3 description, since the value of a gate that can be waived is entirely
in the waiver being written down.

**PR 1: reconnect-path correctness.** Section 5's Problems A, B, C and E,
plus `Reset` as a plain event with its client handler, plus the
`MessageType.values` derivation, `joinUser`'s order stability, the one-shot
re-join on a terminal `401` (section 6), and section 7's proxy headers.
Roughly 220 lines of source and 220 of tests, all in ScalaTest apart from
about twenty lines in `index.html`. The re-join sits here rather than with
bounded mode because the dead end it removes is live today, and putting it
here keeps PR 3 a pure relocation: PR 3 moves it unchanged along with
everything else that leaves the page. Everything in this PR is an
already-live bug, independent of sequencing and of bounded mode, cheap, and
free of any behaviour or security change. That last property is the reason
Problem D part 1 is not here, and is worth protecting: this is the PR that
should be reviewable and releasable on its own merits with nothing to weigh
up.

`Reset` belongs in this PR rather than with delta resync, and it is the
ordering constraint the rest of the split has to respect. It fixes a live
gap by itself: a client whose `EventSource` recovers transparently gets a
second full `setupNewUser` replay against a `ref.users` that was never
reset, duplicating every participant (the first latent gap under "Why
full-resync-on-every-reconnect isn't safe either"). It also gates PR 2's
Problem D part 1, which makes a post-grace reconnect succeed where it
currently `401`s and lands it on exactly that unguarded replay; shipping
that without `Reset` already in place would trade a dead session for a
corrupted participant list. The constraint runs one way only, so `Reset`
ships here and part 1 ships behind it. `Reset` needs no sequencing to work,
being a plain event sent ahead of a full-resync burst, and only the *id* it
carries belongs to section 4's semantics, which ship in PR 2.

**PR 2: sequence ids and delta resync.** Sections 1, 2 and 3, section 4's
id semantics and `Join` ordering rule, Problem D parts 1 and 3, and the
event-log config values with their invariants. Roughly 330 and 330.
Server-side only, and it depends on `Reset` from PR 1 for the reason above.
It stands alone without bounded mode: any reconnect, including today's
buffer-overflow path, resumes precisely instead of replaying the whole
room, and a reconnect arriving after the grace period has elapsed comes back
cleanly instead of dying on a `401`.

Problem D parts 1 and 3 ship together here because part 3 is unreachable
without part 1. Part 3 fires when a connection arrives carrying a
`Last-Event-ID` for a `userId` no longer in `users`, which requires that
request to get past `ValidateToken`, which is precisely what part 1 enables.
Split across two PRs, part 3 would be dead code with a test that cannot
construct its own precondition. Reviewed together they are one behaviour with
two halves: part 1 lets a removed user back in, part 3 makes their resync
correct when they arrive. This is also the right place for part 1's costs to
be weighed, since the token-lifetime widening, the leave-then-reload
behaviour change and the silent vote loss on a grace trip are all recorded
under Problem D part 1 and all belong in front of the reviewer who is
approving that behaviour, rather than folded into a PR whose stated pitch is
that it carries no such thing.

**PR 3: extract the client connection logic.** Section 6's "Implementation
shape" subsection, `package.json`, the static asset route, the CI node
step, and module tests covering the behaviour that exists after PR 1.
Roughly 250 lines moved and 220 of tests, with no behaviour change at all.
This is the split worth protecting: its diff reads as a relocation and
reviews in minutes, and keeping it out of PR 4 means PR 4's diff is
entirely new logic rather than a mixture of moved and new code, which is
the quickest way to make a large PR unreviewable.

This is where PR 0's gate applies, since it is the first PR whose only
justification is the proxy work. Either the probe has run and its result is
cited here, or the waiver and its date are, per PR 0.

**PR 4: bounded mode.** The rest of section 6, server and client, plus
Problem D part 2, the `Mode` ADT, the remaining config invariants and the
logging. Roughly 350 and 350. If this still reads too large in practice it
has a clean internal seam: server-side bounded mode first, verifiable in
ScalaTest by requesting `?bounded=1` directly, then client detection and
mode switching over it.

**PR 5: end-to-end layer.** Stub buffering proxy, harness, and the
Playwright suite, per the end-to-end group in Testing. Roughly 180 and 200.
CI integration is deliberately not here, see "Front-end test tooling".

**PRs are not releases.** PRs 1 and 2 are independent of the proxy work and
can release as soon as they land. PRs 3, 4 and 5 release together, with the
Playwright suite passing before that release reaches the customer this spec
exists for, since that suite is the only thing that exercises the failure
being fixed.

One caveat on that last clause, so it is not read as more than it is: the
suite exercises the *modelled* failure. It runs against the stub, which is
built to Problem's description, so it is exactly as good as PR 0's result and
no better. Green with the probe run means the design works against the
customer's proxy. Green with the gate waived means the design works against
what this spec believes the customer's proxy to be, which is a weaker claim
and should be reported as one.
