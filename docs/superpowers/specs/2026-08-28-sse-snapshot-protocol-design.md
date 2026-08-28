# SSE Snapshot Protocol and Buffering-Proxy Fallback

Date: 2026-08-28
Status: Proposed
Supersedes: `docs/superpowers/specs/2026-08-26-sse-delta-resync-design.md`

## Purpose

Fixes SSE connectivity for a customer whose network path includes an
antivirus-scanning proxy that buffers the entire HTTP response before
releasing anything, times out after 45 seconds, and delivers nothing (not
even headers) to the browser for a stream that never completes. A whitelist
request is in progress with that customer's administrators but may take time
or be rejected, so this is a code-side mitigation to run in parallel.

It also replaces the app's incremental event protocol with a state-snapshot
protocol. That is not scope creep bolted onto a connectivity fix. The
connectivity fix requires a client to resynchronize often and cheaply, and
the event protocol is what made "cheaply" hard. Replacing it removes the
problem instead of building machinery to work around it.

## Problem

### The proxy issue

The proxy in front of this customer's network buffers the complete response
body before forwarding anything (this is how antivirus content scanning
generally works: it cannot clear partial content, it needs the whole file).
Since today's SSE stream never completes, the proxy never releases anything,
and kills the connection at its own 45-second timeout with zero bytes
delivered, no headers, no data, no heartbeats. The existing 15-second
`ServerSentEvent.heartbeat` (`sse/SSE.scala:29-34`) is irrelevant here, it
never reaches the browser either.

### Why the fallback needs cheap resynchronization

Ending the stream after a bounded duration (well under 45s) forces the proxy
to see a complete, finite response it can scan and release, which solves
connectivity. But because the proxy withholds everything until the response
completes, nothing is delivered live during an open window: an event sitting
in an otherwise-open connection only reaches the client once that connection
closes. The only way to keep per-event latency low is to close the connection
shortly after an event happens, rather than waiting out a fixed window
regardless of activity (see section 6). A connection may therefore cycle far
more often than once per 20-30s during an active stretch, close to once per
event in the worst case, so each cycle's resynchronization has to be cheap.

### Why the current protocol makes that expensive

The app reconstructs room state by replaying synthetic events.
`setupNewUser` (`Room.scala:262-274`) fabricates an `Init`, an `EditIssue`,
and a `Join` plus optional `Vote` per participant: a fake event stream that
describes current state. The client then spends 75 lines
(`index.html:396-471`) incrementally rebuilding that state from it.

This shape is an artifact of the WebSocket origin, where the connection was
long-lived and only the incremental stream ever mattered. Phase 1 swapped in
SSE, reconnects became real, and the replay approach was carried over without
being re-examined. Two facts make it the wrong shape now.

**Nothing on the client is event-shaped.** All eight message handlers are
`state = f(state, event)`. There is no animation, no toast, no sound, no
history. `updateSummary()` and `allVoted()` are pure re-derivations run after
each handler. The client wants state; the protocol gives it events.

**The replay is bigger than the state it describes.** Measured on realistic
rooms, with SSE framing included:

| participants | snapshot | today's resync burst | wire |
| --- | --- | --- | --- |
| 3 | 418 B | 1,156 B in 8 frames | 1,300 B -> 436 B (34%) |
| 10 | 1,111 B | 3,060 B in 22 frames | 3,456 B -> 1,129 B (33%) |
| 20 | 2,108 B | 5,787 B in 42 frames | 6,543 B -> 2,126 B (32%) |

Every synthetic event repeats both the `roomId` and the `userId` (72 bytes of
a ~140-byte event) and pays its own frame overhead. A snapshot is one third
the size of the burst it replaces.

The superseded design's central premise was that "a full room-state replay on
every such cycle is not viable at that frequency," which is what made a delta
mechanism a prerequisite rather than an enhancement. That premise was
asserted rather than measured, and measurement reverses it.

### Two live correctness gaps in the existing reconnect path

Both are already in production since the 08-24 backpressure fix, independent
of anything proposed here, and both are properties of the replay protocol
rather than bugs in any particular handler.

1. `index.html`'s `init`/`join` handlers (`index.html:403-419`) push
   unconditionally (`join` only guards against pushing the client's own id
   twice). A reconnecting client whose `EventSource` recovers transparently
   (the browser's native auto-reconnect on the same JS object, so `ref.users`
   is never reset) receives another full replay and duplicates every
   already-known participant.
2. The same replay never removes a participant who left during the gap, since
   `setupNewUser` only lists currently-present users, it never says who is
   gone. A client that missed a departure has no signal to prune it.

Both are rare today because they need an actual reconnect (currently only
buffer overflow) to trigger. Turning reconnects into a routine cycle would
make both routine. Under a snapshot protocol neither is reachable: applying a
complete state cannot duplicate, and an absent participant is absent.

## Relationship to the superseded design

`2026-08-26-sse-delta-resync-design.md` proposed a per-room event log,
monotonic sequence ids, `Last-Event-ID` delta resolution, a `Reset` message
type, retention windows with a count ceiling, and the config and invariants to
size all of it. It is kept in the repository unchanged, and its analysis of
the room-lifecycle bugs is where those bugs were actually found.

What carries over from it, essentially unaltered: Problems A, C, D part 1 and
D part 2 (section 5 here), the entire bounded-mode client design and its
config invariants (section 6), the proxy-model validation ladder, and the
`connection.js` extraction.

What this design removes, and why:

| Superseded | Here |
| --- | --- |
| §1 `SequencedRoomEvent` wrapper, id semantics | One `version: Long` on `RoomData` |
| §2 event log, retention window, count ceiling, prune boundaries, `logEvent`/`logNow`, two config knobs | Nothing to retain, prune, size or configure |
| §3 five-branch resolution rule | One equality comparison |
| §4 `Reset`, its six-field clearing table, burst ordering, the `MessageType` companion trap | A snapshot is a reset; `MessageType` is deleted outright |
| §5 Problem B (duplicate `Join` broadcasts) | Not reachable; re-publishing state is idempotent |
| §5 Problem D part 3 (`isResume` gates delta vs full) | No delta to get wrong |
| §5 Problem E (revealed not replayed) | One `Boolean` field, no synthesized frame |

Two known-issues entries change as a result. "Resync doesn't replay whether
votes are currently revealed" is closed by section 5's Problem E. The
event-log paragraph added to "No rate limiting on mutating room endpoints"
becomes obsolete, since there is no per-room log for an unthrottled endpoint
to grow; the broader rate-limiting gap stands unchanged.

## Approaches considered

The prior design asked where an event log should live, taking for granted
that there is one. The question that actually decides this design's size is
whether the wire should carry events or state.

**1. Snapshot-only (chosen).** Every push on every connection is the room's
complete state. One message type, one client handler, one publish path. The
correctness gaps above become unreachable rather than fixed, and the
resynchronization cost that motivates the whole delta apparatus disappears,
because a reconnecting client and a live client receive the same thing.

**2. Snapshots for resync, incremental events for live push.** Smaller
per-event pushes on healthy connections (148 B against 1,129 B at ten
participants). Rejected: it keeps both codepaths, so it keeps the 75-line
client handler block, keeps `RoomEvent`/`MessageType`, keeps two ways for
client and server state to disagree, and doubles the test surface, all to
save bandwidth that does not matter here. A ten-person room voting a full
round costs 113 KB across all clients under snapshot-only against 15 KB under
this option. The superseded design already dismissed a figure twenty times
larger as negligible at this scale.

**3. Keep the event protocol, add the event log (the superseded design).**
Rejected for the reasons in the table above. Its premise does not survive
measurement, and roughly a third of the code it proposed exists only to serve
that premise.

**4. Short polling instead of an SSE fallback.** A `GET /rooms/:roomId/state`
returning the snapshot, polled every second or so by detected clients, passes
a buffering proxy trivially. Still rejected, and for the reason the superseded
design gave: ten clients at one request per second is 36,000 fixed-interval
requests an hour to a single URL with small uniform responses, which is the
textbook signature of malware beaconing, aimed at the one network already
known to be running an inspecting appliance, while a whitelist request is open
with that same security team. Bounded mode runs at roughly a tenth the request
rate and its jitter keeps it from being interval-regular.

It is worth recording that this design makes polling a far cheaper fallback
than it was. Under snapshot-only the polled endpoint would return the same
serialized payload the SSE frame carries, so the two differ only in transport,
not in state handling or client code. If the proxy model in "Validating the
proxy model" turns out to be wrong, switching is a transport swap rather than
a redesign.

## Final design

### 1. Wire format: the snapshot

`RoomEvent.scala` is deleted in full: `RoomEvent`, the `MessageType` enum, its
hand-maintained `apply`/`unapply` companion, and the decoders. A new
`RoomSnapshot.scala` replaces it:

```scala
final case class RoomSnapshot(
    version: Long,
    roomId: UUID,
    currentIssue: String,
    revealed: Boolean,
    users: List[RoomSnapshot.Participant]
)

object RoomSnapshot:
  final case class Participant(id: UUID, name: String, voted: Boolean, estimation: String)

  def of(roomId: UUID, data: Room.RoomData): RoomSnapshot =
    RoomSnapshot(
      version = data.version,
      roomId = roomId,
      currentIssue = data.currentIssue,
      revealed = data.revealed,
      users = data.users.map(u => Participant(u.id, u.name, u.voted, u.estimation))
    )

  given Encoder[Participant]  = deriveEncoder[Participant]
  given Encoder[RoomSnapshot] = deriveEncoder[RoomSnapshot]
end RoomSnapshot
```

**`Participant` is a deliberate projection of `User`, not `User` itself.**
`Room.User` carries `ref` and `token`, and a derived encoder over it would put
every participant's session token on the wire to every other participant in
the room. Today's `RoomEvent` never carries a token, so this is a new way to
leak one that only exists once state is serialized directly. The projection
makes the leak unrepresentable rather than merely absent, which is why it is a
separate type rather than a hand-written `User` encoder.

`issueLastEditBy` is not in the snapshot. It exists only so `setupNewUser` can
decide whether to synthesize an `EditIssue` frame, and nothing on the client
reads it. It stays on `RoomData` for now (section 5's Problem E note) but does
not travel.

The SSE frame carries the version as the native `id:` field:

```scala
.map(s => ServerSentEvent(
  data = s.asJson.noSpaces,
  id = Some(s.version.toString),
  retry = Some(retryMillis)
))
```

That is what makes the browser's `EventSource` send `Last-Event-ID`
automatically on any reconnect, with no custom header, no query parameter, and
no log behind it.

The stream's element type becomes `RoomSnapshot` rather than
`List[RoomEvent]`, so `.mapConcat(identity)` (`SSE.scala:67`) is removed. A
snapshot is atomic by construction: there is nothing to batch, so there is no
batching discipline to state, no way for a multi-element push to be split
across connection cycles, and no distinction between "one push of N" and "N
pushes" for section 6's close logic to have to respect.

### 2. Room-side: one version, one publish

`RoomData` gains two fields:

```scala
final case class RoomData(
    users: List[User],
    currentIssue: String,
    issueLastEditBy: Option[UUID],
    revealed: Boolean = false,
    version: Long = 0,
    sessions: Map[SessionToken, Session] = Map.empty
)
```

`revealed` is section 5's Problem E. `sessions` is section 5's Problem D part
1 (renamed from `pendingSessions`).

Both `broadcast` and `setupNewUser` are replaced by a single helper:

```scala
private def publish(
    roomId: UUID,
    data: RoomData,
    context: ActorContext[Command]
): RoomData =
  val next = data.copy(version = data.version + 1)
  val snapshot = RoomSnapshot.of(roomId, next)
  context.log.debug("Publishing version {} to {} users", next.version, next.users.size)
  next.users.foreach(_.ref ! snapshot)
  next
end publish
```

**One place increments the version, so no call site can forget to.** This is
worth stating because the superseded design had the opposite property and had
to warn about it three separate times: `EditIssue`, `ShowVotes` and
`ConfirmLeave` each had to apply their own state transition on top of the
value returned by `logEvent` rather than on `data`, and getting it wrong
silently dropped the sequence update. Here there is nothing to thread, so the
whole class of mistake is gone. Handlers reduce to one line each:

```scala
case Vote(token, estimation) =>
  data.users.find(_.token == token) match
    case Some(user) =>
      receiveBehaviour(roomId, publish(roomId, data.vote(user.id, estimation), context), config, timers)
    case None => Behaviors.same

case ClearVotes(token) =>
  data.users.find(_.token == token) match
    case Some(user) => receiveBehaviour(roomId, publish(roomId, data.clear(), context), config, timers)
    case None       => Behaviors.same

case ShowVotes(token) =>
  data.users.find(_.token == token) match
    case Some(user) => receiveBehaviour(roomId, publish(roomId, data.reveal(), context), config, timers)
    case None       => Behaviors.same

case EditIssue(token, issue) =>
  data.users.find(_.token == token) match
    case Some(user) =>
      receiveBehaviour(roomId, publish(roomId, data.editIssue(issue, user.id), context), config, timers)
    case None => Behaviors.same
```

`ReVote` follows `ClearVotes`. `ShowVotes` stops being the file's one handler
that returns `Behaviors.same` after broadcasting (`Room.scala:173-181`), since
it now has state to thread.

`ConfirmLeave` needs its ordering stated, since it both publishes and may
stop:

```scala
case ConfirmLeave(userId, ref, replyTo) =>
  if data.users.exists(u => u.id == userId && u.ref == ref) then
    val next = publish(roomId, data.leave(userId, ref), context)
    if next.users.isEmpty then
      replyTo ! Stopped(roomId)
      Behaviors.stopped
    else
      replyTo ! Running(roomId)
      receiveBehaviour(roomId, next, config, timers)
  else Behaviors.same
```

`publish` sends to `next.users`, which already excludes the departing user, so
the remaining participants see the departure and the departing connection is
not written to. When the room empties there is nobody to publish to and the
send is a no-op, which is correct rather than a special case.

`RoomConfig` groups the timing values rather than widening every recursive
call:

```scala
final case class RoomConfig(
    gracePeriod: FiniteDuration,
    boundedGracePeriod: FiniteDuration
)

object RoomConfig:
  val default: RoomConfig = RoomConfig(6.seconds, 15.seconds)
```

`gracePeriod` is already threaded through every `receiveBehaviour` call and
through `RoomManager.apply`/`createRoom`/`receiveBehaviour` as its own
parameter with its own duplicated default. Replacing both with `RoomConfig`
closes that duplication as a side effect and keeps arity where it is when
`boundedGracePeriod` arrives. Unlike the superseded design, there are no
event-log knobs to carry.

### 3. Connection-time resolution

The route reads the `Last-Event-ID` header the same way it already reads
`X-Forwarded-Proto` (`optionalHeaderValueByName`, `API.scala:101`), parses it
to `Option[Long]`, and treats anything absent or unparseable as `None`. That
value is threaded through the existing fire-and-forget chain, `SSE.source` ->
`RoomManager.ConnectToRoom` -> `Room.Join`, exactly as `gracePeriod` is
threaded today. No new query message and no ask-based step, which preserves
the property that `Join` computes the reply and registers the connection for
future publishes inside one actor message, with no window where a publish
could land between the two.

The whole of the resolution is:

```scala
case Join(user, lastKnownVersion) =>
  timers.cancel(user.id)
  val (joined, isResume) = data.joinUser(user)
  if !isResume then
    // A new participant changes room state, so everyone including them gets the publish.
    receiveBehaviour(roomId, publish(roomId, joined, context), config, timers)
  else
    // A resume changes nothing others can see; send only if this client is behind.
    if !lastKnownVersion.contains(joined.version) then
      user.ref ! RoomSnapshot.of(roomId, joined)
    receiveBehaviour(roomId, joined, config, timers)
```

Four cases the superseded design handled with five explicit branches and a
paragraph each now fall out of that one condition:

- **First-ever connection.** No `Last-Event-ID`, and `!isResume`, so the
  arrival is published to the whole room and the new client receives it as
  part of that publish. It needs no separate send.
- **Caught-up reconnect (the common bounded case).** `isResume` and the
  version matches, so nothing is sent and the connection is left open for
  section 6's `take(1)` to catch the next real publish.
- **Behind reconnect.** `isResume` and the version differs, so the current
  snapshot goes to that one client. How far behind it was does not matter,
  which is why there is no retention window to fall outside of.
- **Malformed, spoofed, or pre-restart id.** Any value that is not the current
  version is treated as behind, and the client gets the current snapshot. A
  room actor restart resets `version` to 0 while a browser may hold a much
  higher value; that is simply a mismatch, handled by the same line, with no
  special-casing and nothing to verify separately.

**A resume deliberately does not publish.** Room state genuinely has not
changed, so `version` is not bumped and bystanders are not written to. Under
the superseded design suppressing this was a correctness fix (Problem B: a
duplicate `Join` broadcast corrupted every bystander's participant list).
Here it is only a cost saving, because re-publishing identical state is
idempotent, but the saving is real: a bounded client reconnecting every 20 to
30 seconds would otherwise push a full snapshot to every participant on every
cycle.

`joinUser` returning `isResume` is the single source of truth for this and for
Problem A's carry-over, rather than two lookups that could drift.

This keeps the actor-hop shape that the existing "connection-establishment
race" comment on `Room.scala:125-129` depends on: still one direct
`user.ref ! ...` push made synchronously from inside the `Join` handler, no
new intermediate hop and no ask round trip. That comment's caveat is about the
hop's timing against stream materialization, not about what the push carries,
so it applies unchanged.

### 4. Client: applying a snapshot

The 75-line handler block (`index.html:396-471`) and the two derivation
helpers (`updateSummary`/`allVoted`, `index.html:546-555`) are replaced by:

```js
function applySnapshot(ref, s) {
  ref.inRoom = true;
  ref.users = s.users;
  ref.votesRevealed = s.revealed;
  // Do not clobber the issue input while the user is typing in it.
  if (!ref.editing) ref.currentIssue = s.currentIssue;

  const me = s.users.find(u => u.id === ref.user.id);
  ref.user.estimation = me ? me.estimation : "";
  ref.ownVoteConfirmed = !me || me.voted || !me.estimation;

  const tally = {};
  for (const u of s.users) tally[u.estimation] = (tally[u.estimation] || 0) + 1;
  ref.votesSummary = Object.entries(tally).sort((a, b) => b[1] - a[1]);
}
```

Every template consumer of room-derived state is reachable from the snapshot.
`users`, `currentIssue` and `votesRevealed` are carried directly;
`votesSummary` and `showUserEstimation(u)` are derived as they already are
today; `inRoom` is connection state and is set here for the same reason
`index.html:401` sets it today.

**`ownVoteConfirmed` is derived, not carried.** It is the one field whose
value is not simply "what the server holds", so its derivation needs
justifying. It selects between two styles of the already-selected estimation
button (`index.html:231-232`) and only matters when `e === user.estimation`.
The four transitions the old handlers encoded are: initially `true`, `true` on
your own vote, `true` on `clear`, `false` on `revote`. The line above
reproduces all four, because `RoomData.reVote` clears `voted` but keeps
`estimation` while `clear()` clears both (`Room.scala:85-89`). So "I have an
estimation showing but the server does not consider me voted" is exactly the
revote state, and nothing else.

The optimistic `this.ownVoteConfirmed = true` in `vote()` (`index.html:540`)
stays as it is, so clicking a card still confirms immediately rather than
after a round trip, which matters more behind the proxy than it does today. It
now also self-corrects: if the vote POST fails, the next snapshot derives
`false` again, where today an optimistically-confirmed failed vote stays
wrongly confirmed indefinitely.

**The `editing` guard is required here, not optional.** `currentIssue` is
`v-model`-bound to the issue input (`index.html:192`). Today only an
`edit_issue` broadcast can clobber in-progress typing. Under snapshot-only
every publish carries the issue, so any vote by anyone would wipe the edit box
mid-keystroke. The superseded design names this gap and calls it pre-existing
and out of scope; that judgement was correct for a protocol where the issue
only travels when it changes, and does not survive this one. The one-line
guard above is in scope and is tested.

**Two things the superseded design needed and this does not.** There is no
`Reset` message, because a snapshot is a reset: the six-field clearing table,
its exclusion list, and the reasoning about which fields are
server-authoritative all collapse into "assign what arrived, derive the rest."
And there is no repaint risk. That design flagged that its resync burst
flattens into N separate `onmessage` calls, so Vue could repaint an empty room
between the `Reset` frame and the frames rebuilding the list. One message
means one handler call and one Vue tick, so no intermediate state is
observable. This is better than today as well as better than that design.

### 5. Server fixes on the reconnect path

Four problems, all live today, all made routine by bounded mode's reconnect
cadence, and all independent of the wire protocol. They were found by the
superseded design's analysis and are carried over from it.

**Problem A, vote state loss on reconnect.** `RoomManager.ConnectToRoom`
always builds the `User` it sends with `RoomManager.InitialVoteState`/
`InitialEstimation` (`RoomManager.scala:82-84`), and `RoomData.joinUser`
(`Room.scala:67-74`) fully replaces the existing entry for that `userId`,
`voted`/`estimation` included, not just `ref`. Today this only matters on the
rare buffer-overflow reconnect. Under bounded mode a client reconnects on a
routine cycle for the whole session, so any vote cast is very likely to be
silently reset to "not voted" in the room's own state before the round is
revealed. It also directly undermines Phase 4's server-authoritative
auto-reveal, which would need to trust exactly this state.

**Fix:**

```scala
def joinUser(user: User): (RoomData, Boolean) =
  this.users.find(_.id == user.id) match
    case Some(existing) =>
      val merged = user.copy(voted = existing.voted, estimation = existing.estimation)
      (this.copy(users = this.users.map(u => if u.id == user.id then merged else u)), true)
    case None =>
      (this.copy(users = user :: this.users), false)
```

Only `ref` actually changes on a reconnect: there is no rename feature, and
the token does not change for any reconnect path here, since native
`EventSource` retry and the manual bounded switch both reuse the existing
session cookie rather than a fresh `/join`. `merged` carries over only
`voted`/`estimation`; `bounded` (Problem D part 2) comes from the incoming
`user`, since it describes the new connection.

**The resume branch replaces in place rather than removing and prepending.**
Today's `merged :: users.filterNot(_.id == user.id)` (`Room.scala:71-74`)
moves the reconnecting user to the head of the list on every resume. That is
invisible today because reconnects are rare, but a bounded client cycling
every 20 seconds would continuously reshuffle the order every client renders,
and under snapshots that reshuffle is now visible to everyone on every
publish rather than only to the next joiner. Replacing in place costs nothing
and keeps participant order stable for the room's lifetime. It relies on there
being at most one entry per `id`, which `joinUser` is the sole enforcer of.

`joinUser` no longer consumes the session entry, which is Problem D part 1
below, not an omission here. It has exactly one call site
(`Room.scala:130`), so the signature change is contained. `RoomSpec`'s
existing reconnect tests (`RoomSpec.scala:184-186`) hand-construct the
reconnecting `User` via `user.copy(ref = ...)`, which preserves
`voted`/`estimation` by construction and so never exercised this against the
real `ConnectToRoom` path; they should go through `ConnectToRoom` so they
would actually catch a regression.

**Problem B is not reachable under this protocol.** Recorded because the
superseded design treats it as one of two problems sharing a root cause with
Problem A. A resume that published would send bystanders a snapshot identical
to the one they hold, which is idempotent. Section 3 still suppresses it, for
cost.

**Problem C, stale grace-period timers and a ghost-user regression.** Every
reconnect arrives at the Room actor as a new HTTP connection with a new
materialized `ActorRef` (`SSE.scala:56-59`). `Room.Leave`'s grace-period timer
is keyed on `(userId, ref)` (`Room.scala:195-206`), so a resume never cancels
the old timer; it sits scheduled for the full `gracePeriod` and fires later as
a no-op. Harmless today, but under bounded mode a client reconnects routinely,
so several stale timers can be alive per user at once, each occupying a
`TimerScheduler` slot and each producing a wasted `ConfirmLeave`.

**Re-keying on `userId` alone is a correctness regression without the second
half of this fix.** Keying on `userId` is required, because `Join` must be
able to cancel a pending removal and `timers.cancel(userId)` cannot reach a
`(userId, ref)`-keyed timer. But `startSingleTimer` replaces the timer under a
key, and a replaced `ConfirmLeave` carries a different `ref` than the one it
displaced:

```
refB is the currently-registered ref for this user.
Leave(userId, refB) -> timers[userId] = ConfirmLeave(userId, refB)   real final departure
Leave(userId, refA) -> replaces it:    ConfirmLeave(userId, refA)    stale, arriving late
fires -> data.users.exists(_.ref == refA) is false -> Behaviors.same
```

The user is never removed, `next.users.isEmpty` is never reached, and the room
actor never stops: a phantom participant in everyone's list for the life of
the process. Under today's `(userId, ref)` keying the two timers are
independent and the `refB` one still fires correctly, so this would be a
regression introduced by the re-key.

The ordering it needs is reachable, and this design creates an instance of it:
section 6's abandoned unbounded detection connection is closed client-side at
`SSE_DETECTION_TIMEOUT`, but the buffering proxy holds it open, so the server
may not observe its termination until the proxy's own timeout, tens of seconds
and many bounded cycles later.

**Fix:** key on `userId`, have `Join` cancel it, and move the staleness check
from fire time to `Leave` time, so a superseded `Leave` never creates a timer
that could displace a live one:

```scala
case Leave(userId, ref, replyTo) =>
  data.users.find(u => u.id == userId && u.ref == ref) match
    case None =>
      // Superseded (present under a newer ref) or already gone: nothing this Leave can remove.
      Behaviors.same
    case Some(user) =>
      if timers.isTimerActive(userId) then context.log.warn(...) // as today
      val delay = if user.bounded then config.boundedGracePeriod else config.gracePeriod
      timers.startSingleTimer(key = userId, msg = ConfirmLeave(userId, ref, replyTo), delay = delay)
      Behaviors.same
```

Dropping on `None` is equivalent-or-better than scheduling in both cases it
covers: if the user is present under a different `ref`, `ConfirmLeave` would
have compared and no-oped a grace period later anyway; if the user is not
present, there is nothing to remove. Both outcomes are identical, reached
immediately rather than eventually, and neither can now displace a pending
removal that would have acted. Net effect: at most one live grace timer per
user, created only by a `Leave` that could act, cleared on every rejoin.

`ConfirmLeave`'s ref-scoped check stays, but is now belt-and-braces rather
than load-bearing: with the `Leave`-time check in place, the only way a
scheduled `ConfirmLeave`'s `ref` stops being current is a `Join`, which
cancels the timer. It is kept because it costs one predicate and its absence
would make correctness depend on Pekko's timer generation-counter behaviour.
The existing `(userId, ref)` comment and its "relies on RoomManager calling
Leave at most once per connection" caveat (`Room.scala:189-193`) are replaced
rather than dropped: the re-key removes that dependency but on its own
substitutes a worse one, that `Leave`s arrive in `ref` order, and the
`Leave`-time check is what removes both.

**Problem D, a reconnect that outlives the grace period is terminal, not a
flicker.** Token resolution is derived from presence: `ValidateToken`
(`Room.scala:236-243`) resolves against `pendingSessions` and then against
`users`, `joinUser` consumes the `pendingSessions` entry on first connect
(`Room.scala:73`), and `ConfirmLeave` removes the `users` entry. Once the
grace period elapses both stores have forgotten the token, the next reconnect
resolves `Unresolved`, and `/events` answers `401` (`API.scala:129-131`).
`EventSource` does not retry a non-2xx, so the participant is told to reload.

This is a gap at the seam between two designs rather than an oversight in
either: `2026-08-20-session-identity-design.md:129-134` deliberately resolves
a reconnect against `users`, which is right for a reconnect arriving while the
user is still present, and the 08-24 grace period exists to make a late
arrival rare. It stays rare only while reconnects are rare.

Bounded mode removes that premise twice over. It opens the window hundreds of
times per session, and it opens it earlier than the retry cadence suggests:
`watchTermination` sits upstream of `take(1)` in section 6's source, so `done`
completes the instant `take(1)` cancels, before Pekko has flushed the response
and well before the proxy has scanned and released it. The gap the grace
period must cover is proxy-scan-and-release plus `SSE_BOUNDED_RETRY` plus a
fresh connect back through the proxy, not `SSE_BOUNDED_RETRY` alone.

**Fix, part 1: token resolution stops being derived from presence.**
`pendingSessions` becomes `sessions`, retained for the room actor's lifetime
instead of consumed on promotion: `joinUser` no longer removes the entry, and
`ValidateToken` resolves against `sessions` alone, its `users` fallback
becoming dead code. `PendingSession` is renamed `Session`, since nothing about
it is pending any more. A reconnect after removal then resolves normally and
comes back as an ordinary snapshot, instead of a dead end.

**This does not cover the solo case.** Retained sessions live in the room
actor, so they only outlive a removal the actor itself outlives. When the
departing user was the room's only member, `ConfirmLeave` reaches
`users.isEmpty`, replies `Stopped` and stops; `sessions` dies with it, and the
next `/events` resolves against a room that no longer exists. A lone
participant whose reconnect outruns the grace period still gets a `401`.

Two things make that a residual rather than a hole. The exposure closes the
moment a second participant is present, so it is confined to the window where
someone has opened a room and is waiting for others. And room identity is
bookmark-driven: `RequestSession` recreates a missing room under the URL's own
id (`RoomManager.scala:87-99`), so the next `POST /join` resurrects it, losing
only the issue string. The client half is fixed in section 6's automatic
recovery from a terminal `401`.

The remaining trigger is worth naming because bounded mode creates it. On an
ordinary idle cycle the gap is a second or two against a 15s
`boundedGracePeriod`, so this is not an idle-timing failure. What can burn 15s
is the client being suspended rather than the network being slow, and the
ordinary form of that is a backgrounded tab. Today an unbounded connection
simply stays open and is heartbeated; under bounded mode a solo room's
survival depends on its one occupant's tab reconnecting every 20 to 30
seconds. Whether `EventSource`'s reconnect timer is throttled the way
`setTimeout` is, is not something this design should assert; the end-to-end
case in Testing measures it, and that measurement is the one input that would
justify revisiting room lifetime.

Four consequences, stated rather than discovered later:

- *Memory.* One small entry per `POST /rooms/:roomId/join` per room, unchanged
  by reconnects (a bounded cycle re-enters through `/events`, which never
  mints a session), so growth is per page load, not per cycle. The
  `docs/known-issues.md` entry "A `/join` with no follow-up `/events` leaks a
  pending session for the room's lifetime" stops describing an accident and
  starts describing a deliberate retention policy: rewrite it rather than
  remove it, since it still wants the same room-level idle expiry from Phase
  2/5.
- *Behavior.* The session cookie is path-scoped and `httpOnly` and `doLeave`
  (`index.html:511-518`) never clears it, so today "click Leave, then reload"
  produces a `401` and a misleading "your session has ended" banner. It will
  now silently rejoin the same room under the same identity. That is an
  improvement, and it is a change.
- *Security.* A token stays valid for the room's lifetime rather than for the
  presence's, widening the window in which a captured cookie is usable.
  Accepted for an internal tool behind `SameSite=Strict`, `httpOnly`,
  path-scoped cookies, and recorded rather than accepted silently.
- *A grace trip loses the returning user's vote silently, where before it
  announced itself.* Problem A carries `voted`/`estimation` across a resume,
  but a user whom `ConfirmLeave` already removed is not a resume: `joinUser`
  takes the `None` branch and inserts them fresh from
  `InitialVoteState`/`InitialEstimation`. Before this part, that path ended in
  a `401` and a visible banner, so the loss was at least loud. It now ends in
  a successful rejoin showing the participant as not having voted, with
  nothing on screen to say so. Not fixed here, because the vote genuinely no
  longer exists in room state by then; part 2 keeps the common case away from
  this path, and the residual belongs with whatever gives `sessions` an idle
  expiry.

**Fix, part 2: bounded connections get their own, longer grace period.** Part
1 makes a late reconnect recoverable but not free: every trip still removes
the user, publishes their departure to everyone, and for a solo participant
reaps the room. `RoomConfig` gains `boundedGracePeriod` (default 15s,
`SSE_BOUNDED_GRACE_PERIOD`), used for a connection that arrived with
`?bounded=1`.

`User` gains `bounded: Boolean`, set from the query parameter and threaded the
way section 3 threads the last-known version (`SSE.source` ->
`ConnectToRoom` -> `Join`), rather than hanging off
`ConnectionCompleted`/`ConnectionFailure`/`Leave`: the property belongs to the
connection, `User.ref` already is the connection, and `Leave` is looking the
user up by `(id, ref)` anyway to pick the delay. Note this differs
deliberately from the version, which rides on the `Join` message: the version
is consumed once during resolution and is meaningless afterwards, while
`bounded` has to outlive the `Join` to be readable at `Leave` time.

15s is not a measured figure, same as every other timing constant here. It
sits roughly an order of magnitude above the expected per-cycle gap, so a
whole session's cycles still have a low expected number of trips, while a
genuine tab close is still announced inside a meeting's attention span. It
makes `docs/known-issues.md`'s "A deliberate tab close is as slow to announce
as a transient reconnect" worse for bounded clients specifically, 6s to 15s,
which is the deliberate trade.

**Problem D part 3 does not arise.** Under the superseded design, resolving a
removed-then-returning user as a delta would have replayed that client's own
`Leave` and made it prune itself from its own participant list. A snapshot
contains the returning user, so there is nothing to guard.

**Problem E, reveal state is client-derived.** `ShowVotes` broadcasts and
changes nothing (`Room.scala:173-181`), so "revealed" exists only as a
client-side flag, and a resyncing client falls back to `allVoted()`
(`index.html:553-555`), re-deriving it as "everyone has voted". That agrees
with the server in every case but one: `Show` pressed while a straggler has
not voted, a legitimate facilitator flow. The resyncing client then hides
votes everyone else can see, and an observer-mode display would do so with no
human in the loop to notice.

**Fix:** `RoomData` gains `revealed: Boolean` (initially `false`), `reveal()`
sets it, and the existing `clear()`/`reVote()` set it back alongside the vote
fields they already touch. It is a field in the snapshot, so there is nothing
further to do: no synthesized frame, and none of the superseded design's
reasoning about where in a replay burst that frame has to sit in order not to
be overwritten by the next one. `docs/known-issues.md`'s "Resync doesn't
replay whether votes are currently revealed" is removed per that file's
convention, and Phase 4 inherits reveal state as real backend state.

### 6. Bounded/long-poll fallback for proxy-detected clients

This section is carried over from the superseded design with its client-side
design intact. What changes is the server side, which gets simpler because
there is no delta to resolve and no batching to respect.

Client-side (`index.html`'s `doJoin`):

- **Detection cache check, before anything else opens.** Read
  `localStorage.getItem('sseBoundedUntil')`. If present and not expired, skip
  detection entirely and open directly with `?bounded=1`. Only the "detected
  true" outcome is ever cached, never "detected false", so the only way this
  cache can be wrong is by making a client wait out a redundant bounded cycle
  it did not need, never by leaving a client on an unbounded connection the
  proxy will kill. Whether a network path buffers is not a fixed property of
  the device (a laptop moving between office and home, a VPN toggling, the
  whitelist request succeeding), hence the TTL and self-heal below.
- Open `EventSource` unbounded by default when no valid cache entry
  short-circuited that step.
- **Start a detection timer when the `EventSource` is constructed, not in its
  `onopen` handler**, duration delivered from the server, default 5s. This is
  the whole mechanism: the target proxy delivers no headers at all for a
  stream that never completes, so `onopen` never fires in exactly the case
  detection exists to catch, and a timer armed there would never start. Any
  message, including a heartbeat, clears it, and clears any stale
  `sseBoundedUntil` entry, which is the self-heal path. A bounded connection
  is never timed, since it may legitimately wait out the wall-clock cap.
- If the timer fires with nothing received: close that connection, mark an
  in-memory `sseBounded = true` for this page instance, write
  `sseBoundedUntil = Date.now() + SSE_DETECTION_CACHE_TTL`, and manually open
  a new `EventSource` with `?bounded=1`. `sseBounded` is sticky for the page
  instance, so this switch happens at most once per page load. These are the
  only two manually-driven reconnects in this design, both needed because the
  URL itself changes.
- **Connecting spinner.** From the moment `doJoin` starts (form submission, or
  `created()` auto-joining a bookmarked room, `index.html:560-574`) until the
  first snapshot arrives or the connection definitively fails, show a spinner
  in place of the join/create form. One flag (`connecting`), set at the top of
  `doJoin`, cleared alongside `inRoom` and on hard failure. Today there is no
  feedback at all between submitting and the first message, which is exactly
  the gap the detection window spans in the worst case. See "What was deferred
  or rejected" for why this is a stopgap.
- **Error banner debounce.** The existing `onerror` handler
  (`index.html:472-485`) sets `showError = true` on any `error` event,
  including the CONNECTING case. Per the SSE spec, `EventSource` fires `error`
  whenever the connection closes for any reason, including a clean response
  ending normally, which is what every bounded cycle does by design. Left
  as-is, a bounded client would show "Connection to the room was lost" every
  20-30s. Fix: `onopen` and `onmessage` reset a `consecutiveErrors` counter to
  0; `onerror`'s non-CLOSED branch increments it and only sets `showError`
  once it crosses a threshold (3). The CLOSED branch stays immediate. This is
  not bounded-specific: it also removes the existing banner flash on today's
  ordinary unbounded reconnects.
- **Automatic recovery from a terminal `401`.** The CLOSED branch is a dead
  end by construction, so today the handler tells the user to reload
  (`index.html:479-480`). The reload is not a diagnostic step, it is a fixed
  recipe: `created()` re-runs `doJoin` from the remembered `roomId`/`name` and
  mints a fresh session. So run the recipe instead of asking for it. Two
  properties make it compose: `sseBounded` is sticky, so the reopened
  connection stays on whichever path detection chose, and the new connection
  carries no `Last-Event-ID`, so it resolves as a fresh join.
- **Exactly one automatic attempt, then the banner.** A `401` has causes a
  re-join cannot fix, most obviously the `SECURE_COOKIES` misconfiguration
  `API.scala:106-110` already warns about, where the browser never returns the
  cookie. Retrying in a loop would replace a clear instruction with a silent
  spin and mint a session per attempt. One attempt, tracked by a flag any
  successful message resets, then the existing banner. Not bounded-specific:
  the dead end is live today for any client whose room was reaped.
- **Re-detection on every unbounded reconnect, not only the first
  connection.** Detection as described handles a path that stops being proxied
  but not one that starts being proxied, and that direction is just as real (a
  VPN toggling on, a proxy config pushed mid-meeting). Without it, a client
  that connected successfully and then lands behind the proxy is permanently
  broken: native retry reopens the same URL, the proxy swallows it, and the
  only visible outcome is a banner that never clears. So whenever an unbounded
  connection enters CONNECTING (the non-CLOSED `onerror` branch, and only
  while `sseBounded` is false), arm the same kind of timer.
- **Arm only if one is not already armed.** `onerror` is not once-per-window:
  a connection refused outright fails in milliseconds, so a client in a real
  outage can produce several `onerror` events inside one window. Re-arming on
  each would reset the timer indefinitely and detection would never conclude,
  which is the exact failure re-detection exists to prevent, reached by
  another route. The window measures "nothing has arrived since the connection
  started failing", not "since the most recent failure".
- **The re-detection window is longer than the first-connection one, and the
  reason pins the value.** A first connection is guaranteed an immediate
  snapshot (section 3), so 5s is generous. An unbounded reconnect that is
  already caught up sends nothing at all, so the first frame it legitimately
  sees is the `.keepAlive` heartbeat, and a 5s window would false-positive on
  every reconnect into an idle room. The window is
  `heartbeatInterval + SSE_DETECTION_TIMEOUT` (15s + 5s = 20s), computed
  server-side and delivered in `JoinResponse`. Derived rather than given its
  own env var: it is "one heartbeat interval plus the same margin a first
  connection gets", so it stays correct by construction if `heartbeatInterval`
  changes and cannot be misconfigured into fighting `.keepAlive`.
- A timer is the right signal rather than a count of consecutive `onerror`
  events, for two reasons. Each failed unbounded attempt behind this proxy
  costs the proxy's own 45s timeout before the browser sees a failure, so a
  threshold of 3 would mean minutes of a visibly broken room; and a proxy
  variant that releases headers but buffers the body would fire `onopen` every
  attempt, resetting any error counter forever while never delivering a
  message. "Nothing arrived within a window `.keepAlive` guarantees a frame
  inside" catches both.
- The mid-session switch accepts a fresh snapshot rather than resuming, and
  that is the correct trade. A new `EventSource` object cannot inherit the old
  one's internal last-event-id, so the reopened bounded connection sends no
  `Last-Event-ID` and gets the current snapshot. Reconstructing the cursor in
  script would mean tracking versions client-side, exactly the bookkeeping
  this design avoids by staying on one `EventSource` object, to save one
  snapshot on a transition that happens at most once per page load.
- Every other reconnect, every scheduled bounded close and any ordinary drop,
  is handled by the browser's native auto-reconnect on that same object: same
  URL, so `retry:`/`Last-Event-ID` are applied automatically. This guarantees
  at most one connection open per client, so there is never a window where an
  old, still-closing connection and a new one overlap. Both manual switches
  stay inside that guarantee: `close()` takes effect synchronously, so the old
  object is CLOSED before the new one is constructed. Server-side, the old
  connection's termination may be observed long after the new `Join`, because
  the proxy is still holding it; that is precisely the stale-`Leave` ordering
  Problem C now checks for at `Leave` time.

Server-side (`SSE.scala`/`API.scala`):

- The route accepts an optional `bounded` query parameter.
- When present, the connection resolves per section 3 immediately, then
  behaves adaptively rather than on a fixed timer, since the proxy withholds
  everything until close regardless of when an event happened, so closing as
  soon as there is something to deliver lowers latency instead of paying a
  deliberate wait:
  - If a snapshot was sent (the client was behind, or is a new arrival): close
    immediately. No hold-open step.
  - If nothing was sent (the client is already caught up, the common case for
    a promptly reconnecting client): stay open, waiting for either the next
    publish, which triggers the same close, or the wall-clock cap
    (`SSE_BOUNDED_DURATION` base 20s plus `SSE_BOUNDED_DURATION_JITTER` 0-10s,
    so clients do not cycle in lockstep) elapsing with nothing new, in which
    case it closes with no data and the client reconnects with the same
    version.
  - The cap is required even though every other cycle closes on a publish,
    since a genuinely idle room must still self-close before 45s, otherwise it
    is exactly today's failure.

An earlier design held the connection open for a fixed window after sending,
to probabilistically catch independent events landing close together.
Dropped: at a window short enough not to lag every isolated action, the odds
of two independently-timed human actions landing inside it are low, so it
bought little while taxing every action and doubling that tax for anything
that missed the window by a hair.

**Implementation shape: one `Mode` parameter on `SSE.source`.** The retry
value, the no-`.keepAlive` rule, and the close behaviour are all decided by
the same caller once it knows whether `bounded` is present, so they travel
together:

```scala
enum Mode:
  case Unbounded(retryMillis: Int, heartbeatInterval: FiniteDuration)
  case Bounded(retryMillis: Int, durationMillis: Int)

  // Both accessors are explicit: an enum case's parameters are not exposed on the parent type.
  def retryMillis: Int = this match
    case Unbounded(r, _) => r
    case Bounded(r, _)   => r

  // Section 5's User.bounded, which must outlive the Join to be readable at Leave time.
  def bounded: Boolean = this match
    case _: Bounded => true
    case _          => false

def source(
    roomManager: ActorRef,
    roomId: UUID,
    userId: UUID,
    name: String,
    token: Room.SessionToken,
    lastKnownVersion: Option[Long],
    mode: Mode
)(using ec: ExecutionContext): Source[ServerSentEvent, ActorRef] =
  val base =
    Source
      .actorRef[RoomSnapshot](completionMatcher, failureMatcher, bufferSize, OverflowStrategy.dropHead)
      .mapMaterializedValue { user =>
        roomManager !
          RoomManager.ConnectToRoom(roomId, userId, name, token, lastKnownVersion, mode.bounded, user)
        user
      }
      .watchTermination() { (user, done) =>
        done.onComplete {
          case Success(_) => roomManager ! RoomManager.ConnectionCompleted(roomId, userId, user)
          case Failure(t) => roomManager ! RoomManager.ConnectionFailure(roomId, userId, user, t)
        }
        user
      }
      .map(s => ServerSentEvent(data = s.asJson.noSpaces, id = Some(s.version.toString), retry = Some(mode.retryMillis)))

  mode match
    case Mode.Bounded(_, durationMillis) =>
      base.take(1).takeWithin(durationMillis.millis)
    case Mode.Unbounded(_, heartbeatInterval) =>
      base.keepAlive(heartbeatInterval, () => ServerSentEvent.heartbeat)
```

**Why a `Mode` ADT rather than `retryMillis` plus `bounded: Option[...]`.**
With both present, a bounded connection has two retry values in scope and only
one is read, so nothing prevents a caller passing a sensible-looking value
that is silently ignored. The ADT makes that unrepresentable, and
`heartbeatInterval` sitting on `Unbounded` alone turns the
no-`.keepAlive`-for-bounded rule from a convention the implementation has to
remember into something the types do not let it express. It is also where
`User.bounded` comes from, rather than a second parameter free to disagree
with the branch the stream actually takes. And it puts jitter at the route:
`SSE.source` receives already-jittered values, so it stays deterministic given
its input and `SSESpec` can assert exact `retry:` and cap values.

**`take(1)` is unambiguous here, and that is a direct consequence of the
protocol.** Under the superseded design, `take(1)` sat before a
`.mapConcat(identity)` that flattened `List[SequencedRoomEvent]` pushes, so
whether it closed after one complete push or one flattened event depended on
operator order, and the design had to require that deltas be sent as a single
`List` and never as a loop of sends. A snapshot is one element, so there is no
flattening step, no batching discipline to state, and no way to strand part of
an update.

**`OverflowStrategy.dropHead`, not `fail`, and this removes a failure mode
rather than tuning one.** The 08-24 backpressure design chose
`OverflowStrategy.fail` with a small non-zero buffer because a dropped event
was unrecoverable: losing one `RoomEvent` desynchronizes a client
permanently, so failing the connection and forcing a reconnect was the only
safe response. That reasoning does not carry over. Each snapshot supersedes
every earlier one, so discarding a buffered snapshot in favour of a newer one
is lossless with respect to final state, and a slow consumer simply receives
the latest state instead of a queue of stale ones. The buffer-overflow
reconnect path, which is today's only reconnect trigger, therefore stops
existing for unbounded connections.

This must be verified rather than assumed, for a specific reason: the 08-24
design found that a zero-size buffer bypasses whichever overflow strategy is
configured entirely rather than applying it at a zero-element threshold. The
same class of surprise could apply here, and the bounded shape adds a second
question, since after `take(1)` emits the stream pulls no more and a publish
landing before the cancel propagates upstream sits in the buffer. Both are
measurements in Testing, not assertions of intended behaviour.

Remaining server-side points, unchanged from the superseded design:

- **Bounded connections carry a smaller, jittered `retry:` than the unbounded
  default.** `SseConfig.retryMillis` (2000ms) keeps governing unbounded
  connections; bounded frames carry 500ms base with +/-100ms jitter. A single
  tuned constant was chosen over client-side exponential backoff, which would
  require manually closing and reopening the `EventSource` to control
  per-attempt delay (the native mechanism only replays the last received
  `retry:` value) and would break native `Last-Event-ID` tracking. The
  trade-off is that a sustained outage is met with a fixed ~500ms cadence
  rather than a growing one, acceptable at this app's scale.
- **The 15-second `.keepAlive` heartbeat is not applied to bounded
  connections.** Its only purpose is keeping a connection alive under Pekko's
  60-second idle timeout, and a bounded connection's own cap (20-30s) stays
  well under that. Applying it would also break the intended timing, since a
  heartbeat is not a snapshot and carries no version, but treating its arrival
  as "something to send" would close every idle bounded connection at a fixed
  ~15s rather than the jittered 20-30s, defeating the jitter's purpose.
- When `bounded` is absent, behavior is unchanged.
- The timing constants are configurable via env var following the existing
  `SseConfig` pattern: `SSE_BOUNDED_DURATION` (20s), `SSE_BOUNDED_DURATION_JITTER`
  (10s), `SSE_BOUNDED_RETRY`/`SSE_BOUNDED_RETRY_JITTER` (500ms +/-100ms),
  `SSE_BOUNDED_GRACE_PERIOD` (15s), and `SSE_HEARTBEAT_INTERVAL` (15s,
  unchanged from today's hardcoded value; see the invariants for why it stops
  being a constant). These are judgment calls about a real proxy's behaviour
  and real users' tolerance for lag, to be revisited with production feedback.
- **`SSE_ASSUMED_PROXY_TIMEOUT`** (45s) sits in the same config but is not a
  tuning knob: it declares a fact about the deployment environment, the
  shortest response-completion deadline any proxy in front of this service is
  believed to enforce. Nothing reads it at runtime. It exists so the
  invariants can check the cap against the ceiling that actually matters. A
  deployment behind a stricter proxy lowers it; one behind no buffering proxy
  raises it.
- **`SSE_DETECTION_TIMEOUT`** (5s) and **`SSE_DETECTION_CACHE_TTL`** (24h)
  cannot reach the client on the SSE wire, since detection times the absence
  of any frame. They ride the existing `POST /rooms/:roomId/join` response
  (`JoinResponse`, `API.scala:76-95`), which already precedes `EventSource`
  creation and is a small finite response the proxy releases immediately.
  `JoinResponse` carries the derived re-detection window alongside them. The
  TTL is short enough that a whitelist fix self-corrects within a business
  day, long enough that a customer joining several rooms in a day pays the
  detection window once.
- **`doLeave`'s `localStorage.clear()` becomes targeted removals, or the TTL
  does not do what it says.** `doLeave` (`index.html:511-518`) wipes all of
  `localStorage`, which today means exactly `roomId` and `name`. Adding
  `sseBoundedUntil` to the same store means the Leave button silently resets
  detection, so a customer running several plannings a day pays the detection
  window after every Leave, which is the flow the TTL was justified by.
  Replace it with `removeItem("roomId")` and `removeItem("name")`:
  behavior-preserving today and correct going forward. The classification to
  apply to any future key is that room and session state is swept by
  `doLeave`, path state is not. One consequence: `doLeave` was an accidental
  escape hatch from a false-positive detection, and afterwards TTL expiry is
  the only reset, so a wrongly-pinned client stays bounded for up to 24h. That
  is the cost already accepted for false positives generally, and the lever is
  the TTL, which is tunable.
- **Logging at the decision points this design introduces**, plain SLF4J, no
  new dependency, since several constants are explicitly "revisit after
  production feedback" and that revisit is unactionable without observation: a
  line when a connection resolves with `?bounded=1`, giving a rough count of
  clients on the bounded path; and a line at bounded-connection close noting
  which reason fired (publish-triggered against wall-clock cap), the signal
  for whether `SSE_BOUNDED_DURATION` is well-tuned. Deliberately not proposing
  a metrics library; this codebase has none and adopting one is a separate
  decision.

**Config invariants.** `SseConfig.load` already enforces
`gracePeriod >= 2 * retryMillis` so a routine reconnect beats the grace
period. This design adds a second grace period the same property depends on,
plus two proxy-facing values that can silently reintroduce the original
failure if misconfigured. All extend `SseConfig.load`, same file, same style:

```scala
require(boundedGracePeriod >= gracePeriod, "...a bounded connection cycles orders of " +
  "magnitude more often than an unbounded one, so it can never safely need less slack")
require(boundedGracePeriod.toMillis >= 4 * boundedRetryMillis, "...a bounded cycle pays the " +
  "proxy's scan-and-release latency before the browser's retry timer even starts, so the " +
  "real reconnect gap is a multiple of the retry value, not equal to it")
require(boundedDurationMillis + boundedDurationJitterMillis
          <= assumedProxyTimeoutMillis * (1 - ProxyTimeoutMarginFraction),
  "...or a bounded connection can outlive the very proxy timeout this mode exists to stay " +
  "under, reintroducing the original zero-bytes failure")
require(boundedDurationMillis + boundedDurationJitterMillis < 60000,
  "...must stay safely under Pekko's own 60s idle-timeout")
require(heartbeatInterval.toMillis + detectionTimeoutMillis
          <= assumedProxyTimeoutMillis * (1 - ProxyTimeoutMarginFraction),
  "...or the proxy kills an unbounded connection before detection can conclude and the " +
  "client never switches to bounded mode at all")
require(heartbeatInterval.toMillis < 60000,
  "...or an idle unbounded stream is killed by the server and read as the participant leaving")
require(boundedRetryJitterMillis >= 0 && boundedRetryJitterMillis < boundedRetryMillis,
  "...the jitter is subtracted as well as added, so one that meets or exceeds the base can " +
  "put a zero or negative value in a frame's retry: hint")
```

Plus positivity checks for each new value, in the style the existing ones use.

The third is the one that actually bites. An earlier version checked only
Pekko's 60s idle timeout, reasoning that the codebase cannot know a customer's
proxy timeout. That is true and was the wrong conclusion: the codebase cannot
know it, but the operator deploying behind that proxy can, and giving them
nowhere to say it means the check guards the ceiling that does not matter. Any
cap safe against a 45s proxy is automatically safe against a 60s framework
timeout, so the Pekko check passes for every sane value and also passes for
`SSE_BOUNDED_DURATION=50s`, which silently reintroduces the exact failure this
design exists to fix. The Pekko check stays alongside it, because
`SSE_ASSUMED_PROXY_TIMEOUT` is operator-supplied and can legitimately be set
high, at which point the framework ceiling binds again.

**The margin is a fraction, not a fixed number of seconds.** A fixed 10s
margin was chosen initially to avoid the defaults saturating the check, on the
assumption that a fraction would leave no room. 25% turns out to be fine (the
bound is 33.75s, so the defaults pass with 3.75s to spare) while a fixed 10s
breaks down at the other end of the range: the end-to-end tests need the whole
timing set scaled down by an order of magnitude, and with a 10s floor no proxy
timeout under about 13s admits any valid cap at all. A fraction scales with
the value it guards, so one invariant covers production and test
configurations.

The fifth guards detection's whole premise. The detection timer runs on an
unbounded connection, which has no wall-clock cap, so an earlier
`detectionTimeout < boundedDuration` check named the right hazard and the
wrong quantity. If the detection window reaches past the proxy's timeout, the
proxy kills the connection first, `onerror` fires, re-detection re-arms, and
the cycle repeats without ever concluding: the client stays unbounded and
permanently broken. It is written against the re-detection window, which is
strictly the larger of the two and so the only one that can fail.

That check needs `heartbeatInterval`, today a hardcoded `val` in
`SSE.scala:29-34`. **Move it into `SseConfig` as `SSE_HEARTBEAT_INTERVAL`,
default 15s**, unchanged in production. Moving it keeps `config` a leaf
package rather than importing the transport module, and gives `SSE.source` and
this invariant one source of truth. Making it configurable rather than merely
relocating it is what the end-to-end tests force: the re-detection window is
derived from it, so a test configuration scaling every other timing down to
hundreds of milliseconds cannot satisfy the check while this one stays at 15s.
A value that is genuinely constant in production is not automatically constant
across every configuration the system has to support.

**Implementation shape: the connection logic moves out of `index.html` into a
testable module.** Everything above turns what is today a flat sequence of
handlers into a connection state machine: two modes, a construct-time
detection timer, a re-detection timer with a different window, a
`localStorage` cache with a TTL and a self-heal path, one manual URL switch,
an error-debounce counter, a one-shot re-join on a terminal `401`, and a
spinner flag. That is also precisely the code a future framework migration has
to port. Leaving it inline means it is untestable now and rewritten twice
later, so it moves to `src/main/resources/pages/connection.js` as an ES module
with its dependencies injected:

```js
export function createConnection({
  roomId, userId, config,        // config: the values JoinResponse carries
  eventSourceFactory, storage,   // injected so tests supply doubles
  setTimeout, clearTimeout,      // injected so tests control time
  onSnapshot, onState            // outward reporting, see below
}) { /* ... returns { start, stop } ... */ }
```

`onState` emits immutable snapshots of connection state, it never mutates a
caller-owned object. This decides whether the module survives the framework
migration or merely survives it under Vue: mutation-based reporting works for
Vue 2 and Vue 3 reactivity and needs rework for an immutable model such as
React's, and the target framework is undecided.

`index.html` becomes a `<script type="module">` importing the module and
mapping emitted state onto Vue's `data`. Because section 4 already collapsed
the 75-line handler block to `applySnapshot`, the page keeps roughly 20 lines
of glue. Vue stays a CDN global read off `window.Vue`, since module scripts
are deferred and do not expose globals. Only connection logic moves; the
unrelated `methods` (`vote`, `doCopy`, `showUserEstimation`, and friends) stay
where they are.

Serving it needs one small addition, since `API.scala` has no static asset
route today, only `getFromFile(apiConfig.indexPath)`. Add a route serving
`indexPath`'s parent directory rather than another config knob, so it follows
`INDEX_PATH` wherever Docker points it; `Universal / mappings ++= directory(...)`
already packages the whole `pages` directory.

Tests run under `node --test` with zero dependencies: Node's built-in runner,
its built-in timer mocking, and about 70 lines of test doubles (a fake
`EventSource` exposing `readyState`/`onopen`/`onmessage`/`onerror` plus an
`emit` helper, and a fake `storage`). `package.json` declares no dependencies.
CI gains a `setup-node` step and a gating `node --test` step alongside
`sbt qa`. JS coverage is deliberately not merged into the existing
scoverage/Codecov stream for now.

### 7. Bundled fix: buffering-proxy headers

Add `Cache-Control: no-cache` and `X-Accel-Buffering: no` to the SSE response,
closing the `docs/known-issues.md` entry "SSE reverse-proxy buffering is
undocumented." This will not fix the antivirus-scanning proxy this spec
targets (it buffers by design, irrespective of such hints), but it is a cheap,
already-flagged gap worth closing alongside a deployment-relevant change to
this code path.

## Validating the proxy model

Everything from section 6 rests on the description in Problem, which is stated
as fact and is not tested anywhere. The end-to-end layer does not close that
gap: the stub proxy is built to this model, so a green suite proves the
implementation matches the assumption, not that the assumption matches the
customer. A stub built to a wrong model tests the wrong thing thoroughly.

**What is actually being assumed.** Problem reads as one fact but is four, and
the design leans on three more it never states:

1. The proxy buffers the complete response body before forwarding anything.
2. It delivers no headers either, not only no body.
3. It kills the connection at 45 seconds.
4. That deadline is measured against response completion, which is what
   `SSE_ASSUMED_PROXY_TIMEOUT` encodes.
5. A response that does complete is released promptly.
6. Scan-and-release latency for a tiny or empty body is small.
7. A completed chunked `text/event-stream` reaches the browser in a form
   `EventSource` still treats as a stream and still auto-reconnects from.

**Three are already hedged and need no test.** Assumption 2 does not matter,
because the detection timer arms at construction rather than in `onopen`
precisely so it works whether or not headers arrive. Assumptions 3 and 4 are
expressible: a stricter or differently-measured deadline is what
`SSE_ASSUMED_PROXY_TIMEOUT` exists for, and the fractional margin follows it
down. But that hedge only works if someone supplies the real number. If the
true deadline is 20 seconds, the defaults produce a 20 to 30 second cap, the
`require` passes because the assumed value still says 45, and bounded mode
fails exactly as today does. The knob exists; the input to it is the
assumption.

**Assumption 5 is neither hedged nor recoverable.** Every mechanism in section
6 takes for granted that ending the response makes the proxy release it. There
is a plausible scanner behaviour that breaks it outright: an appliance whose
policy is written around file-like transfers and will not release a streaming
content type at all, completed or not. Under that behaviour bounded mode
delivers nothing at any cap, and every config invariant passes while it does
so. The softer failure is worse value rather than breakage: an appliance that
queues responses and adds seconds of fixed inspection latency turns bounded
mode's per-event cost into something worse than the polling option, while
eating the grace budget from both ends. Assumption 6 feeds
`boundedGracePeriod` directly, which is currently a guess resting on a guess.

**The blast radius is PRs 3 to 5.** PRs 1 and 2 are live bug fixes plus the
protocol replacement, and are justified without any of this.

**The ladder, cheapest first.**

- *Ask.* Get the appliance's make and model from the customer's administrators
  and read its documentation. Costs an email, no user time, may settle 3, 4
  and 5 outright, and is information worth having for the whitelist
  conversation that is already open.
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
| D | Run C through a real `EventSource` for two minutes | Content type survives, the browser reconnects, `retry:` is honoured. Assumption 7. |

The page records, per connection: time to first byte, time to close, bytes
received, frames received, and connection count. C and D together are a direct
proof or refutation of the premise.

**What each outcome means.** Confirmed, proceed and set
`SSE_ASSUMED_PROXY_TIMEOUT` from B rather than from the default. A shorter or
differently-measured deadline, set the value and let the invariants follow it
down, no design change. A large scan-and-release latency in A, revisit
`SSE_BOUNDED_GRACE_PERIOD` and re-run the latency comparison against polling.
C or D failing, bounded mode's premise is gone and the fallback is option 4
under "Approaches considered", which under this design is a transport swap
over the same snapshot payload rather than a redesign.

**Proceeding without it is a legitimate choice, recorded as one rather than
reached by drift.** The probe needs a person on that network for two minutes,
and if the customer cannot supply one in the time available, waiting is not
obviously better than shipping: the whitelist request may land first and make
all of this moot. Four things soften that and one does not.

- The timing values are all env-driven, so a wrong guess about 3, 4 or 6 is a
  configuration change on a running deployment, not a code change.
- `SSE_DETECTION_CACHE_TTL` bounds how long a client can be wrongly pinned to
  the bounded path to about a day, and any message self-heals it sooner.
- The failure mode is the one that already exists. A client for whom bounded
  mode does not work is a client that cannot connect today either, so an
  unvalidated model risks wasted effort rather than a regression for anyone.
- Polling stays available as the fallback, and is cheaper under this design
  than it was under the superseded one.

What none of that changes: assumption 5 stays unverified until it meets the
real proxy, and the first place that happens is the customer's own deployment.
Take the *Ask* rung even when the probe is skipped.

## What was deferred or rejected

- **Snapshots for resync plus incremental events for live push**: rejected,
  see approach 2. Keeps both codepaths to save bandwidth that does not matter
  at this scale.
- **A `since` parameter or any form of partial snapshot**: rejected. It is the
  event log by another name, and the measurement in Problem shows the full
  snapshot is already smaller than what the app sends today.
- **Carrying `issueLastEditBy` in the snapshot**: rejected. Nothing on the
  client reads it; it exists only to drive today's synthesized `EditIssue`
  frame. It stays on `RoomData` in case Phase 4 wants it.
- **Durable/persisted room state**: deferred to Phase 2. The wire protocol
  here does not need revisiting when that lands, and `version` is a natural
  fit for an optimistic-concurrency column if it ever becomes one.
- **Short polling instead of an SSE fallback**: rejected, see approach 4.
  Recorded in full because it is the fallback if the proxy model is wrong, and
  because this design makes it much cheaper to reach for.
- **Handling an old cached client against a new server during rollout**: not
  addressed, and it is worse here than under the superseded design. An old
  page dispatches on `message.messageType`, which a snapshot does not carry,
  so a stale page load would silently render nothing rather than degrade. For
  an internal tool with short sessions this is judged acceptable, but PR 1's
  release notes should say to reload. If that proves annoying in practice, the
  cheap fix is a `version`-less sentinel field the old dispatcher ignores
  gracefully, not a version-negotiation mechanism.
- **A component-test layer (jsdom plus a framework test-utils library)**:
  rejected outright. It sits between the two layers that do earn their place
  and is squeezed out by both: the module tests cover the decision logic as
  flags, and the end-to-end layer covers the rendered result. What is left is
  assertions against framework internals, using a library pinned to the
  framework line being replaced (`@vue/test-utils@1` is Vue 2 only), for
  roughly six template conditionals.
- **CI integration for the end-to-end suite**: the only piece of the
  end-to-end work left out. The stub proxy, harness and Playwright suite are
  in scope; what is deferred is browser-binary caching, starting the app from
  the workflow, gating, and the flakiness budget. The harness is the reusable
  part and lands now, so the deferred work is "install browsers, then invoke
  the same documented command." The risk this leaves, stated plainly: a suite
  nothing runs automatically rots, and it rots worse than a manual checklist,
  because "we have end-to-end coverage" is false confidence where a checklist
  is honestly manual. Two mitigations are in scope rather than intentions: one
  documented command runs it, and this gap gets its own
  `docs/known-issues.md` entry on ship. Its worth peaks immediately before the
  Phase 3 framework migration, where it becomes that migration's regression
  net, so CI integration should land before then.
- **The room-recreation spawn race**: recorded, not fixed. `ConfirmLeave`
  replies `Stopped` and then stops (`Room.scala:216-218`), so `RoomManager`
  removes the room from its map while the child is still terminating. A
  `RequestSession` for that id landing inside that window calls
  `context.spawn(..., name = roomId.toString)` (`RoomManager.scala:168-173`)
  on a name that is not yet free, and throws `InvalidActorNameException`.
  Pre-existing and microseconds wide, but this design makes solo-room reaping
  routine and "reap, then immediately recreate from the same bookmark" is
  precisely the pattern that follows it. Out of scope because the fix is a
  `RoomManager` lifecycle change independent of everything here: defer the map
  removal to the `Terminated` signal that already arrives, or spawn
  defensively. Gets a `docs/known-issues.md` entry on ship.
- **Room-skeleton loading experience**: not addressed beyond the connecting
  spinner. The spinner gives feedback that something is happening, but the
  user still stares at an inert screen for the full detection window in the
  worst case. A fuller fix would render the room skeleton before `/events`
  succeeds, and separately revisit `SSE_DETECTION_TIMEOUT` upward, since a
  skeleton removes most of the pressure to keep that window short. If built,
  the skeleton must stay non-interactive until the first snapshot lands, the
  same guarantee `inRoom` provides today; a skeleton that looks ready but is
  not would be worse than the current plain wait.
- **Distinguishing proxy buffering from transient server-side latency in
  detection**: accepted as a known limitation. The detection timer measures
  "did anything arrive", not "is a buffering proxy in the path", so a GC
  pause, cold start or load spike that delays the first message past the
  timeout is indistinguishable and gets the same outcome. Acceptable because
  the cost of a false positive is bounded and non-critical (a client pays the
  bounded path's overhead for up to a day) and never a connectivity or
  correctness loss. Re-detection widens the exposure slightly but is the more
  forgiving of the two: its window is 20s rather than 5s, and it only arms
  while a connection is already failing.
- **Rate limiting on mutating endpoints**: still unaddressed, and no longer
  has an event-log-specific symptom to work around. See
  `docs/known-issues.md`.

## Testing

Extends the existing `RoomSpec`/`SSESpec`/`BackpressureReconnectSpec` pattern
(see `2026-08-24-sse-backpressure-design.md` for the established style).

**Server, in ScalaTest:**

- `publish` increments `version` exactly once per state change and sends to
  every current user. Successive publishes produce strictly increasing
  versions.
- `RoomSnapshot.of` never serializes a session token or an `ActorRef`. Asserted
  against the encoded JSON rather than the case class, since the risk is a
  future `deriveEncoder[User]`, and this is the test that catches it.
- Each of the seven state transitions (`Join`, `Vote`, `ClearVotes`, `ReVote`,
  `ShowVotes`, `EditIssue`, `ConfirmLeave`) publishes exactly one snapshot
  reflecting the transition, and no handler returns without threading the
  published data.
- `ConfirmLeave` publishes the departure to the remaining users before
  stopping, and stops when the last user leaves without attempting a send.
- Section 3's resolution, all four cases from one condition: a first
  connection receives the room-wide publish and no separate send; a resume at
  the current version receives nothing at all; a resume behind the current
  version receives exactly one snapshot; a resume carrying a version the room
  never issued (higher than current, or from a simulated actor restart where
  `version` reset to 0) receives the current snapshot by the same path, not a
  distinct branch.
- A resume publishes nothing to bystanders, and a genuinely new participant
  does.
- Problem A: a user who has voted, then reconnects (built via
  `RoomManager.ConnectToRoom`, not a hand-constructed `User` that already
  carries the prior vote), still shows as voted with their prior estimation in
  the room's own state afterward.
- Problem A ordering: a user who reconnects stays in the same position in
  `users`, and subsequent snapshots list participants in that stable order.
- Problem C, the ghost-user regression this fix exists to prevent: a real
  final `Leave(userId, refB)` followed, inside the grace period, by a late
  stale `Leave(userId, refA)` still removes the user when the timer fires, and
  still stops the room if that was its last member. Asserting removal is the
  point; a test that only asserts "one live timer" would pass against the
  broken version.
- A `Leave` whose `ref` is not the user's currently-registered one, and a
  `Leave` for a `userId` no longer present, both schedule no timer and produce
  no `ConfirmLeave`. A `Join` cancels a pending removal for that `userId`.
- Problem D part 1: `ValidateToken` still resolves a token whose user has been
  removed by `ConfirmLeave`, and `joinUser` no longer consumes the session
  entry, so two successive connects with the same token both resolve. An
  `APISpec` case that a post-grace-period reconnect to `/events` gets a
  stream, not a `401`. Plus the residual, asserted rather than left implicit:
  when the removed user was the room's only member, `ConfirmLeave` still stops
  the actor and that reconnect still gets a `401`.
- Problem D part 2: `Leave` for a connection whose `User.bounded` is true
  schedules at `boundedGracePeriod`, an unbounded one at `gracePeriod`; a
  resume carries the incoming connection's flag, not the replaced entry's.
- Problem E: `revealed` is set by `ShowVotes` and cleared by `clear()` and
  `reVote()`, and appears in the snapshot. The case that matters: a room where
  `Show` was pressed while one participant had not voted reports
  `revealed: true`, which is the case a client-side `allVoted()` derivation
  gets wrong.
- **Three existing `RoomSpec` tests assert expectations this design
  deliberately inverts** and need updating as part of it, not treating as
  failures to work around. `"swallow a Leave entirely if the same user
  reconnects within the grace period"` (`RoomSpec.scala:191`) and `"ignore a
  stale leave from a ref that already got replaced by a reconnect"`
  (`RoomSpec.scala:288`) both assert that a reconnect produces a `Join`
  broadcast to bystanders, which section 3 suppresses; both invert. The
  latter's comment about exercising the stale-ref guard also stops being true,
  since the stale `Leave` is now dropped without scheduling. `"reset the grace
  period if Leave is called twice for the same connection before it elapses"`
  (`RoomSpec.scala:201-206`) still passes, but its comment documents the
  `(userId, ref)` keying and the "RoomManager calls Leave at most once per
  connection" assumption, both replaced.
- The bounded path's adaptive completion: closes immediately after sending a
  snapshot, and closes at the jittered wall-clock cap when nothing was sent.
- A caught-up bounded connection sends nothing rather than an empty payload,
  so `take(1)` correctly stays open for the next real publish instead of
  closing immediately with nothing delivered.
- A bounded, idle connection receives no `.keepAlive` heartbeats and closes at
  the jittered cap (20-30s), not at a fixed ~15s; an unbounded connection
  still receives heartbeats unchanged.
- Bounded connections carry the smaller, jittered `SSE_BOUNDED_RETRY` value on
  their frames; unbounded connections are unaffected. Asserted on exact
  values, since jitter is applied at the route.
- **`OverflowStrategy.dropHead` and `bufferSize`, as measurements rather than
  assertions of intended behaviour.** A slow unbounded consumer receiving
  several publishes must end up with the newest state and must not fail the
  connection, which is the property that retires today's buffer-overflow
  reconnect path. Separately, publishes landing after `take(1)` has emitted but
  before its cancel reaches `Source.actorRef` must either be absorbed or fail
  into the existing self-heal path, never be silently misdelivered. The 08-24
  design found that a zero-size buffer bypasses the configured overflow
  strategy entirely, so the number and the strategy are confirmed here, not
  assumed. `BackpressureReconnectSpec` is the natural home and needs revisiting
  wholesale, since its premise (a dropped event is unrecoverable) no longer
  holds.
- `SseConfig.load`'s new invariants: rejects a `SSE_BOUNDED_GRACE_PERIOD`
  below `SSE_GRACE_PERIOD` and one below four times `SSE_BOUNDED_RETRY`;
  rejects a `SSE_BOUNDED_DURATION` plus jitter that does not leave the margin
  under `SSE_ASSUMED_PROXY_TIMEOUT`, including the 50s cap the Pekko check
  alone would wave through; rejects the same pair when it does not stay under
  Pekko's 60s idle timeout, which is a distinct case reachable only by raising
  `SSE_ASSUMED_PROXY_TIMEOUT`, so both need their own test; rejects a
  `SSE_DETECTION_TIMEOUT` large enough that the derived re-detection window
  reaches within the margin; rejects a `SSE_HEARTBEAT_INTERVAL` at or above
  60s; accepts a fully scaled-down test configuration, which is the case a
  fixed rather than fractional margin would have rejected; rejects a
  `SSE_BOUNDED_RETRY_JITTER` equal to or greater than `SSE_BOUNDED_RETRY` and
  accepts zero; plus positivity checks.

**Client, under `node --test` against `connection.js` and `applySnapshot`,**
with injected timers and fake `EventSource`/`storage` doubles, no
dependencies. Before the section 6 extraction none of this was testable, since
`index.html` is a single CDN-loaded page with no runner or build step.

- `ownVoteConfirmed` reproduces all four transitions the old handlers encoded:
  `true` initially, `true` after own vote, `false` after a revote (where the
  server clears `voted` but keeps `estimation`), `true` after a clear. This is
  the derivation's correctness proof and the case most likely to regress if
  `reVote()` is ever changed to clear estimation too.
- Applying the same snapshot repeatedly produces no duplicate participants,
  and a participant absent from a later snapshot is dropped. These are the two
  live gaps in Problem, asserted against the mechanism that makes them
  unreachable.
- A client holding a vote, then a snapshot in which the server no longer holds
  it, ends with `user.estimation` empty rather than displaying a stale vote;
  and the inverse, a client whose vote the server still holds keeps it.
- `votesSummary` is derived and ordered by descending count; `votesRevealed`
  comes from the snapshot rather than from an `allVoted()` derivation, so a
  revealed room with an unvoted straggler renders revealed.
- **The `editing` guard**: a snapshot arriving while `editing` is true leaves
  `currentIssue` untouched, and one arriving while it is false applies it.
  This is the regression that snapshot-only introduces and the test that pins
  the fix.
- `inRoom` is set by the first snapshot and is not reset by later ones.
- The connecting spinner clears on both the success path (first snapshot) and
  the hard-failure path (`onerror` with a closed `readyState`), and is not
  shown for a bounded reconnect legitimately waiting out its cap.
- The error banner debounce: `showError` is not set on the first one or two
  consecutive non-CLOSED `onerror` events, only at the threshold; `onopen` and
  `onmessage` both reset the counter, so a routine bounded cycle never shows
  the banner; the CLOSED branch is immediate and undebounced.
- The one-shot re-join: a CLOSED `onerror` re-runs `doJoin` once and shows no
  banner; a second with no successful message in between shows the banner and
  does not re-join, which is the loop the `SECURE_COOKIES` case would
  otherwise produce; any successful message resets the flag. The reopened
  connection sends no `Last-Event-ID` and keeps whichever mode `sseBounded`
  holds.
- The detection timer is armed at `EventSource` construction, not in `onopen`:
  a simulated connection delivering no headers and no body still triggers the
  switch. A timer armed in `onopen` would pass a test that merely withholds
  messages, so the test must withhold the open event too or it proves nothing.
- Re-detection: an unbounded reconnect receiving nothing inside the window
  switches to `?bounded=1`, at most once per page load across many failures.
  The case that pins the window: an unbounded reconnect into an idle room,
  whose first frame is the `.keepAlive` heartbeat, does not trigger a switch,
  which a 5s window would have got wrong. The case that pins the arming rule:
  several `onerror` events inside one window still switch at the original
  window's expiry, proving the timer is armed once per failing stretch rather
  than re-armed per error.
- The detection cache: a valid non-expired entry skips detection entirely and
  opens directly bounded; an expired or absent entry runs detection; a
  detection timer that clears also clears a stale cache entry; only "detected
  true" is ever written.
- `doLeave` removes `roomId` and `name` but preserves `sseBoundedUntil`, and
  `created()`'s `if(this.roomId && this.user.name)` guard still sees both
  cleared so it does not auto-rejoin.

**End-to-end, in a real browser through a stub buffering proxy.** This layer
exists because nothing above can reproduce the failure the design is built
around: it needs a proxy that withholds a response until it completes and then
kills the connection at its own deadline. The stub, the harness and the
Playwright suite are all in scope; CI integration is not.

The stub is a plain Node HTTP server, no TLS and no `CONNECT`, roughly 60-100
lines: forwards every request upstream and buffers the complete response,
headers included, releasing nothing until it ends; on completion writes
headers then body; if the upstream response has not completed within a
configured deadline, destroys the downstream connection having sent nothing.
It buffers every method uniformly, `POST`s included, which is simpler and more
faithful, and is worth exercising rather than assuming since `JoinResponse` is
the delivery channel for the detection windows. It exposes a small control
endpoint to switch buffering on and off at runtime, which is what makes
re-detection testable end to end, since a browser cannot change origin
mid-session. The harness starts app and stub together with a test-tuned
`SseConfig` (every timing scaled down an order of magnitude) and exposes one
documented command, deliberately the same entry point CI will later call.

- **Stub fidelity, asserted without the app's client at all.** Requesting
  `/rooms/:id/events` through the stub yields zero bytes for the full deadline
  and then a destroyed connection. This proves the stub reproduces the
  customer's report, and it has to come first: every case below is only
  meaningful if it holds.
- **The premise.** Loading the page through the stub and joining a room
  reaches the room view: detection fires, bounded mode engages, the snapshot
  arrives. This single case is what bounded mode exists for, and it is
  currently verified by reasoning alone.
- Two browsers through the stub: one votes, the other sees the vote within a
  bounded cycle.
- Reveal with a straggler still unvoted, then a third client joins and sees
  votes revealed. Problem E through the real path, in the one configuration
  where a client-side derivation cannot mask the bug.
- A client left idle across several bounded cycles stays in the room, with no
  participant flicker in the other browsers. Problem D's grace period and
  Problem C's timer keying, observed rather than unit-asserted.
- Re-detection: a client connected while the stub is in pass-through mode
  recovers after buffering is switched on mid-session, without a reload.
- **A solo client backgrounded across several bounded cycles, a measurement
  rather than an assertion.** Whether the tab's reconnects are throttled past
  `SSE_BOUNDED_GRACE_PERIOD` is the open question behind Problem D part 1's
  solo residual, and reasoning cannot settle it. If they are, the room is
  reaped and the client recovers through the one-shot re-join with no user
  action. If they are not, the client simply stays. Both are passes; the case
  exists to record which happens, since that is the input that would justify
  revisiting room lifetime.

## Delivery

Five PRs, plus a small one ahead of them that is a gate rather than a step.
Unlike the superseded design, there is no internal ordering constraint beyond
PR 1 coming first, since `Reset` and Problem D part 3, the two things that
forced an ordering there, no longer exist.

**PR 0: proxy probe.** The env-gated route and page from "Validating the proxy
model", default off, roughly 80 lines and no tests beyond a smoke case. It
gates PR 3, not PR 1 or PR 2, which are justified without the proxy work and
keep the schedule busy while a result comes back. Deliberately its own PR so
that skipping the gate is a visible decision with a date on it rather than
something that quietly never happens.

If the customer cannot supply two minutes of one person's time in the window
available, PR 3 proceeds ungated. That is an accepted outcome, not a failure
of the plan; the reasoning is under "Proceeding without it". Take the *Ask*
rung either way. Whichever way it goes, record the choice and the date in the
PR 3 description, since the value of a gate that can be waived is entirely in
the waiver being written down.

**PR 1: the snapshot protocol, plus Problems A, C and E.** Sections 1, 2, 3, 4
and 7, and the three `RoomSpec` updates. Roughly 190 lines of source added and
about 150 deleted (`RoomEvent.scala` in full, `setupNewUser`, and the 75-line
client handler block), with roughly 200 of tests. This is the PR that replaces
the protocol, so it is the largest behavioural change in the set and the one
worth reviewing most carefully, but its diff is unusually readable for its
size because most of it is deletion. It is independent of bounded mode and
releasable on its own: it fixes two live correctness gaps, removes the
`MessageType` companion trap, and gives Phase 4 real reveal state.

**PR 2: retained sessions.** Problem D part 1. Roughly 40 lines of source and
80 of tests. Server-side only, and deliberately its own PR: the token-lifetime
widening, the leave-then-reload behaviour change and the silent vote loss on a
grace trip all belong in front of the reviewer approving that behaviour,
rather than folded into a PR whose pitch is that it carries no such thing.

**PR 3: extract the client connection logic.** Section 6's "Implementation
shape", `package.json`, the static asset route, the CI node step, and module
tests covering the behaviour that exists after PRs 1 and 2. Roughly 200 lines
moved and 180 of tests, with no behaviour change. Worth protecting as its own
PR: its diff reads as a relocation and reviews in minutes, and keeping it out
of PR 4 means PR 4 is entirely new logic rather than a mixture of moved and
new code. This is where PR 0's gate applies, since it is the first PR whose
only justification is the proxy work.

**PR 4: bounded mode.** The rest of section 6, server and client, plus Problem
D part 2, the `Mode` ADT, the config invariants and the logging. Roughly 290
and 300. If this reads too large in practice it has a clean internal seam:
server-side bounded mode first, verifiable in ScalaTest by requesting
`?bounded=1` directly, then client detection and mode switching over it.

**PR 5: end-to-end layer.** Stub buffering proxy, harness, and the Playwright
suite. Roughly 180 and 200. CI integration is deliberately not here.

**PRs are not releases.** PRs 1 and 2 are independent of the proxy work and
can release as soon as they land. PRs 3, 4 and 5 release together, with the
Playwright suite passing before that release reaches the customer this spec
exists for, since that suite is the only thing exercising the failure being
fixed.

One caveat on that last clause, so it is not read as more than it is: the
suite exercises the modelled failure. It runs against the stub, which is built
to Problem's description, so it is exactly as good as PR 0's result and no
better. Green with the probe run means the design works against the customer's
proxy. Green with the gate waived means it works against what this spec
believes the customer's proxy to be, which is a weaker claim and should be
reported as one.
