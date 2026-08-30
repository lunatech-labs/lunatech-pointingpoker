# SSE Snapshot Protocol and Buffering-Proxy Fallback

Date: 2026-08-28
Status: Proposed
Supersedes: `docs/superpowers/specs/2026-08-26-sse-delta-resync-design.md`

## Purpose

Fixes SSE connectivity for a customer whose network path includes a Netskope
content-scanning appliance that buffers the entire HTTP response before
releasing anything, and delivers nothing (not even headers) to the browser for
a stream that never completes. Its kill deadline is not yet measured; see
"What is established about the path". A whitelist request is in progress with
that customer's administrators but may take time or be rejected, so this is a
code-side mitigation to run in parallel.

It also replaces the app's incremental event protocol with a state-snapshot
protocol. That is not scope creep bolted onto a connectivity fix. The
connectivity fix requires a client to resynchronize often and cheaply, and
the event protocol is what made "cheaply" hard. Replacing it removes the
problem instead of building machinery to work around it.

## Problem

### The proxy issue

The appliance in front of this customer's network buffers the complete response
body before forwarding anything (this is how content scanning generally works:
it cannot clear partial content, it needs the whole file). Since today's SSE
stream never completes, it never releases anything, and the browser sees zero
bytes: no headers, no data, no heartbeats. The existing 15-second
`ServerSentEvent.heartbeat` (`sse/SSE.scala:29-34`) is irrelevant here, it
never reaches the browser either.

### What is established about the path

A `curl -v` against `pointingpoker.lunatech.com` from inside that network
returns a certificate for the right host re-signed by the customer's own
Netskope tenant CA:

```
issuer: emailAddress=certadmin@netskope.com; CN=ca.darva.de.goskope.com;
        O=DARVA; L=NIORT; ST=FR; C=FR
```

So three things are facts rather than inferences. The vendor is Netskope. TLS
is terminated and the body inspected mid-path, which is the mechanism behind
the buffering rather than an analogy to how scanners usually behave. And the
same trace reports `ALPN: server did not agree on a protocol` followed by
`using HTTP/1.x` despite curl offering h2, so the appliance forces HTTP/1.1,
which makes the roughly six connections per origin a real ceiling.

**The 45-second figure that earlier drafts stated as the proxy's timeout is
withdrawn.** It came from a `curl --max-time 45` run, so it recorded when the
client gave up, not when the appliance did. No browser observation has ever
established the real deadline. Everything downstream that reads as a measured
constant is therefore a placeholder until probe B supplies a number, and the
places that depend on it say so.

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
each handler. The client wants state; the protocol gives it events. Note that
`allVoted()` being a derivation does not make it disposable: it is where
auto-reveal actually lives today, which section 5's Problem E moves to the
server rather than deletes.

**The replay is bigger than the state it describes.** Measured on realistic
rooms, with SSE framing included:

| participants | snapshot | today's resync burst | wire |
| --- | --- | --- | --- |
| 3 | 418 B | 1,156 B in 8 frames | 1,300 B -> 436 B (34%) |
| 10 | 1,111 B | 3,060 B in 22 frames | 3,456 B -> 1,129 B (33%) |
| 20 | 2,112 B | 5,787 B in 42 frames | 6,543 B -> 2,130 B (33%) |

Every synthetic event repeats both the `roomId` and the `userId` (72 bytes of
a ~140-byte event) and pays its own frame overhead. A snapshot is one third
the size of the burst it replaces. The snapshot figures are a revealed room,
which is the worst case: before reveal, section 1's redaction empties every
estimation but the recipient's, so the payload is smaller still.

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
D part 2 (section 5 here), the bounded-mode client design and its config
invariants (section 6), the proxy-model validation ladder, and the
`connection.js` extraction. The one part of section 6 not carried over is the
`localStorage` detection cache, dropped for the reasons in that section.

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

Four known-issues entries change as a result, three of them closed:

- "Resync doesn't replay whether votes are currently revealed" is closed by
  section 5's Problem E.
- "A `/join` with no follow-up `/events` leaks a pending session for the
  room's lifetime" is closed by Problem D part 1's session TTL.
- "SSE reverse-proxy buffering is undocumented" is closed by section 7, but
  only if section 7 grows the deployment note as well as the headers. That
  entry is filed against `README.md`, and its complaint is two-part: the code
  sets no anti-buffering headers, and nothing tells a deployer what to
  configure on the proxy in front. Headers alone close the first half. See
  section 7.
- "No rate limiting on mutating room endpoints" needed rewriting rather than
  either closing or leaving alone, and has already been rewritten. Its
  event-log paragraph was obsolete, since there is no per-room log for an
  unthrottled endpoint to grow, but the amplification did not disappear so much
  as change shape: under bounded mode a version bump costs a reconnect per
  client, so a `POST` loop becomes request amplification aimed at the
  customer's own scanning proxy. Section 2's no-op publish guard is the
  backstop for that specific form; the broader rate-limiting gap stands
  unchanged.

One entry gained material rather than losing it, also already applied: "A
deliberate tab close is as slow to announce as a transient reconnect" now
carries the reload case and the bounded 15s figure (Problem D part 2). Two new
entries land on ship, the room-recreation spawn race and the two-tab identity
collision, both under "What was deferred or rejected". The latched-reveal item
Problem E defers is likewise already filed under Phase 4 in
`docs/roadmap.md`. These three are recorded here as done rather than pending,
so a PR author does not go looking for work that is finished.

## Approaches considered

The prior design asked where an event log should live, taking for granted
that there is one. The question that actually decides this design's size is
whether the wire should carry events or state. Measurement disposes of the
superseded design's premise, but that is a reason to reject that particular
design rather than to abandon events, so the event-based family is broken into
the three shapes that are actually distinct instead of being treated as one.

**1. Snapshot-only (chosen).** Every push on every connection is the room's
complete state. One message type, one client handler, one publish path. The
correctness gaps above become unreachable rather than fixed, and the
resynchronization cost that motivates the whole delta apparatus disappears,
because a reconnecting client and a live client receive the same thing.

**2. Events for live push, plus `Reset` and a synthetic full replay on every
reconnect.** This is the minimal event-based fix, and it is what remains of the
superseded design once the event log, sequence ids and delta resolution are
deleted along with the premise that justified them. It is a real option and it
works: `Reset` makes duplication impossible and lets a departed participant
simply not be re-added, `RoomData.revealed` plus a synthesized `Show` frame
closes Problem E, and bounded mode rides on top paying a full replay per cycle
rather than a delta. Worth naming explicitly because it is what a reader who
accepts the measurement will propose next, and because the superseded design's
own machinery obscures how small it is.

Its specific weakness among the event options is resync cost, the one axis
where it is worse than both neighbours: roughly 3,600 B in 23 frames against
1,129 B in one, paid on every bounded cycle. That is affordable. It is rejected
on maintenance surface instead, see below.

**3. Events for live push, snapshot for resync.** The only option that is best
on both bandwidth axes: 148 B per live push, and the same single-frame resync
as snapshot-only. What it actually costs is being the largest of the three in
code, because it needs the event vocabulary and the snapshot, so it keeps the
75-line client handler block and `RoomEvent`/`MessageType` and adds
`RoomSnapshot` beside them, with two ways for client and server state to
disagree and both to test. Note this makes it larger than option 2, not
smaller: buying back the resync cost is what the extra vocabulary pays for.

**4. Keep the event protocol, add the event log (the superseded design).**
Rejected for the reasons in the table above. Its premise does not survive
measurement, and roughly a third of the code it proposed exists only to serve
that premise. What is left of it once that is removed is option 2.

**Why the state-shaped option wins, and why it is not a bandwidth argument.**
On bandwidth alone option 3 beats snapshot-only, so the case has to rest
elsewhere, and it does.

*Maintenance surface, which is decisive.* Under any event protocol the client
is a reducer kept in sync with a server it cannot see, and correctness depends
on three independent things all staying right: every handler, the completeness
of the `Reset` clearing table, and the ordering of the synthetic replay. All
three have already produced live bugs here. The superseded design needed a
six-row clearing table of which three rows required a paragraph of
justification each, and its Problem E fix turned on frame *position*, passing
in an all-voted room and failing in exactly the straggler room the fix existed
for. Options 2 and 3 inherit every one of those burdens. Snapshot-only has no
client state machine to get wrong, which is why the gaps in Problem become
unreachable rather than fixed.

*Two robustness properties only snapshots have.* `OverflowStrategy.dropHead`
becomes correct, since a superseded snapshot is safe to discard, which retires
the buffer-overflow reconnect path that is today's only reconnect trigger;
under events a dropped event is unrecoverable, so `fail` and its reconnect must
stay. And client state becomes self-correcting with respect to server state: a
dropped push, a gap, a handler bug, or an optimistic update the server rejected
all heal on the next publish. To be precise about the limit of that, it does
not make *server* state right, so it does nothing for the command-ordering
entry in `docs/known-issues.md`, which is about the server processing a user's
POSTs out of order.

*The asymmetry that makes this low-regret.* Snapshot-only to option 3 is
additive: keep the snapshot as the resync mechanism, add incremental pushes for
live updates, and the snapshot stays the source of truth. Going the other way,
option 2 or 3 to snapshot-only, is a client rewrite. So the escape is cheap if
live bandwidth ever bites, while starting event-based forecloses nothing and
pays the maintenance surface immediately.

*When this flips.* The live-push ratio is 8x at ten participants, 14.7x at
twenty and 35x at fifty, because aggregate cost per voting round is cubic in
room size for snapshots against quadratic for events. Above roughly 20 to 30
participants option 3 is the right answer. A planning poker room is a team, so
this sits outside the range by a comfortable margin, but it is the condition to
watch rather than a reason the question never arises.

**5. Short polling instead of an SSE fallback.** A `GET /rooms/:roomId/state`
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

**6. Long polling instead of a bounded SSE fallback.** Not the same option as
5, and the argument that disposes of 5 does not touch it.
`GET /rooms/:roomId/state?since=<version>` held open server-side until the
version changes or a cap elapses, then answering with the snapshot as
`application/json`, has the same request rate as bounded mode, the same
jitter, and the same version cursor. The beaconing signature that rejects
one-second short polling is a property of the interval, not of the transport,
so it does not apply here.

What it would buy is the one risk this design cannot hedge. Assumption 5's
fatal case under "Validating the proxy model" is an appliance that will not
release a streaming content type at all, completed or not; a long poll returns
a finite `application/json` body with a `Content-Length`, which is the shape
those appliances are built to pass. It also retires assumption 7 outright, and
it deletes the `Mode` ADT, the `take(1)`/`takeWithin` shaping, the
no-`.keepAlive` rule, the `retry:` and retry-jitter config with its invariant,
and the `Last-Event-ID` plumbing, since the cursor becomes an ordinary query
parameter.

Not chosen now, for two reasons. It needs a server-side wait primitive the
room actor does not have (a registration that completes a `Promise` on the
next publish, rather than a stream the connection already owns), where bounded
mode is `take(1).takeWithin(cap)` over the source that exists. And it gives up
the browser's native reconnect and cursor tracking, which is real code the
design currently gets for free, even granting that `connection.js` is already
a state machine and a `fetch` loop would not obviously be larger.

The reason to write it down rather than leave it implicit is that it is the
right fallback, not option 5. It is named again under "What each outcome
means" and in "What was deferred or rejected", because a probe C or D failure
is the moment to reach for it.

## Final design

### 1. Wire format: the snapshot

`RoomEvent.scala` is deleted in full: `RoomEvent`, the `MessageType` enum, its
hand-maintained `apply`/`unapply` companion, and the decoders. A new
`RoomSnapshot.scala` replaces it:

```scala
final case class RoomSnapshot(
    version: Long,
    currentIssue: String,
    votesRevealed: Boolean,
    users: List[RoomSnapshot.Participant]
)

object RoomSnapshot:
  final case class Participant(
      id: UUID,
      name: String,
      voted: Boolean,
      hasEstimation: Boolean,
      estimation: String
  )

  // One snapshot per recipient: another participant's estimation is withheld until reveal.
  def of(data: Room.RoomData, forUser: UUID): RoomSnapshot =
    val revealed = data.isRevealed
    RoomSnapshot(
      version = data.version,
      currentIssue = data.currentIssue,
      votesRevealed = revealed,
      users = data.users.map(u =>
        Participant(
          u.id,
          u.name,
          u.voted,
          u.estimation.nonEmpty,
          if revealed || u.id == forUser then u.estimation else ""
        )
      )
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

**The snapshot is built per recipient, and that closes a leak the event
protocol also has.** Today's `Vote` broadcast carries the estimation to every
participant the moment it is cast (`Room.scala:144-148`), so anyone with
devtools open sees the room's votes before reveal. The client hides them
(`showUserEstimation`, and `v-if="votesRevealed"` on the table), but the data
is already on the wire. Serializing state directly would carry that leak over
unchanged, and having just argued that a token must be unrepresentable rather
than merely unrendered, stopping short here would be inconsistent. Redaction
costs no extra serialization: `asJson` already runs once per connection in
`SSE.source`'s `.map`, so N recipient-specific snapshots serialize exactly as
many times as N identical ones would. It does cost N snapshot constructions per
publish where one would have done, which is O(N^2) allocation on the actor
thread against O(N) today. At a room's worth of participants that is noise, and
it is the term that would grow if the fifty-participant case in "Approaches
considered" ever arrived, so it is recorded rather than waved through.

The recipient always sees their own estimation, which is what section 4's
`ownVoteConfirmed` derivation needs, and once `revealed` is true every
estimation travels, which is what `votesSummary` needs.

**`hasEstimation` exists because redaction would otherwise silently change what
the participant table renders.** `showUserEstimation(u)`
(`index.html:556-558`) is `u.estimation && u.estimation !== "" &&
!votesRevealed`, and it drives the `shield-off` icon on `index.html:307`,
meaning "there is a value here and it is hidden". Blanking other participants'
estimations makes that predicate false for everyone but the recipient, so the
icon would quietly appear next to your own name only. Nothing in the diff says
so, which is what makes it worth a field: the redaction is a wire change and
this is a rendering change, and they land in the same PR. `hasEstimation` is
computed from the unredacted `estimation`, so section 4 re-points the method at
it and the table renders exactly as it does today.

Re-keying the icon on `u.voted` instead was the cheaper option and does not
reproduce today's rendering. `reVote()` clears `voted` and keeps `estimation`
(`Room.scala:85-89`), so the two differ in exactly one state: the window after
a re-vote, where today the icon marks who still holds a stale hidden value
while the check-circle correctly shows them as not voted. That window is the
icon's only distinct job, since everywhere else `voted` and `hasEstimation`
agree. Whether it earns its place is a product question; this design changes
where state is computed, not what the screen shows, so it keeps it. The bit is
not a leak worth weighing against that: `voted` already announces "this person
holds a hidden value" in every state except the one above, and in that one the
values concerned were revealed a moment earlier.

**The wire field is `votesRevealed`, not `revealed`, and the difference is not
cosmetic.** `RoomData.revealed` means "Show was pressed"; the snapshot carries
`isRevealed`, the disjunction that also covers auto-reveal (section 5's
Problem E). Those are different answers, and section 2's no-op guard exists
precisely because they can disagree. Naming them both `revealed` would put the
two meanings one field access apart in code a reader is following between two
files. `votesRevealed` also matches what the client already calls it
(`index.html:343`), so `applySnapshot` becomes an assignment with no rename in
the middle.

`roomId` is not in the snapshot. The client opened the connection and already
holds the id; nothing in the template or the handlers reads it back off a
message. It is dropped for the same reason `issueLastEditBy` is, below.

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
no log behind it. The cost of getting it for free is that the cursor is a
property of the network path rather than of this code, which is assumption 8
under "Validating the proxy model".

**Heartbeats carry no `id:`, and section 3 depends on it.** `.keepAlive` emits
`ServerSentEvent.heartbeat`, which has neither data nor an id. Per the SSE
specification, a frame that omits the `id:` field leaves the browser's
last-event-id buffer unmodified, rather than clearing it. That is what lets an
unbounded connection sit idle through many heartbeats and still reconnect
carrying the last snapshot's version, which is the precondition for section
3's "caught-up reconnect sends nothing" case and, through it, for the
re-detection window being sized at `heartbeatInterval + SSE_DETECTION_TIMEOUT`
rather than shorter. If heartbeats did carry an id, every idle reconnect would
resolve as behind and publish a redundant snapshot. Stated because it is a
property of the SSE specification the design relies on rather than anything
this code enforces, so it is invisible in the diff and easy to break by
"helpfully" stamping every frame with a version.

**The client must still ignore heartbeats**, as `index.html:398` does today
with `if (!event.data) return;`. That guard moves into `connection.js` with
the rest of the connection logic (section 6); without it `JSON.parse("")`
throws on every heartbeat on every idle unbounded connection.

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

`revealed` is section 5's Problem E, where it means "Show was pressed" and is
joined by a derived `isRevealed` that also covers auto-reveal. `sessions` is
section 5's Problem D part 1 (renamed from `pendingSessions`, and gaining a
`createdAt` for its TTL).

Both `broadcast` and `setupNewUser` are replaced by a single helper:

```scala
private def publish(prev: RoomData, next: RoomData, context: ActorContext[Command]): RoomData =
  // Nothing to say if no client would see a difference; see the no-op note below.
  if visibleState(next) == visibleState(prev) then prev
  else
    val bumped = next.copy(version = prev.version + 1)
    context.log.debug("Publishing version {} to {} users", bumped.version, bumped.users.size)
    bumped.users.foreach(u => u.ref ! RoomSnapshot.of(bumped, u.id))
    bumped
end publish

// Everything a snapshot can carry to anyone, minus the version publish is about to set,
// plus stored `revealed`, which is latent rather than visible; see below.
private def visibleState(data: RoomData) =
  (
    data.users.map(u => (u.id, u.name, u.voted, u.estimation)),
    data.currentIssue,
    data.isRevealed,
    data.revealed
  )
```

`visibleState` is written out rather than expressed as "the snapshot with the
version zeroed", and the difference matters. A snapshot is redacted for one
recipient, so comparing two redacted-for-nobody snapshots would call a room
where someone changed their vote from 3 to 5 before reveal unchanged, both
estimations having been blanked, and the voter's own client would never learn
its new value. The comparison has to be against what any recipient could see,
which is the unredacted state. `ref` and `token` are excluded because they are
per connection and never travel; `sessions` and `issueLastEditBy` because
nothing renders them.

**Stored `revealed` is in the tuple even though it never travels, and leaving
it out is a trap worth naming.** `isRevealed` is a disjunction (section 5's
Problem E), so a room where everyone has voted already reports revealed with
`revealed` still false. A facilitator pressing Show at that moment changes
`revealed` to true and changes nothing anyone can see, so a guard comparing
only what travels would discard the whole `RoomData` and lose the flag. The
loss is silent until the next participant joins, at which point `allVoted`
goes false, the disjunction collapses, and the votes hide even though Show was
pressed. Comparing the stored flag as well costs one redundant publish in that
one case and removes a bug that would surface minutes later somewhere
unrelated. The general rule, since this will recur: a change that is currently
invisible but can become visible without a further command is a change. This
term exists only because reveal is derived; the latched-reveal item in
`docs/roadmap.md` would make `revealed` the whole answer and let it go.

**A publish that changes nothing is skipped, and under bounded mode that is not
a micro-optimization.** `ShowVotes` on an already-revealed room, `ClearVotes`
on a cleared one, and a re-vote for the same estimation all reach `publish`
today and would all bump the version. Every version bump closes and reopens
every bounded client's connection (section 6), so one unthrottled `POST /show`
loop turns into N HTTP round trips per iteration through the customer's
scanning proxy. It would be easy to read this design as removing the event
log's amplification and therefore needing no backstop. The first half is true
and the second is not: the amplification changed shape from memory growth into
request amplification, aimed at the one network already known to be running an
inspecting appliance. This guard is the backstop for that shape, which is what
`docs/known-issues.md`'s "No rate limiting on mutating room endpoints" entry
already says. The broader rate-limiting gap still stands unchanged.

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
      receiveBehaviour(roomId, publish(data, data.vote(user.id, estimation), context), config, timers)
    case None => Behaviors.same

case ClearVotes(token) =>
  data.users.find(_.token == token) match
    case Some(user) => receiveBehaviour(roomId, publish(data, data.clear(), context), config, timers)
    case None       => Behaviors.same

case ShowVotes(token) =>
  data.users.find(_.token == token) match
    case Some(user) => receiveBehaviour(roomId, publish(data, data.reveal(), context), config, timers)
    case None       => Behaviors.same

case EditIssue(token, issue) =>
  data.users.find(_.token == token) match
    case Some(user) =>
      receiveBehaviour(roomId, publish(data, data.editIssue(issue, user.id), context), config, timers)
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
    val next = publish(data, data.leave(userId, ref), context)
    if next.users.isEmpty then
      replyTo ! Stopped(roomId)
      Behaviors.stopped
    else
      replyTo ! Running(roomId)
      receiveBehaviour(roomId, next, config, timers)
  else Behaviors.same
```

`publish` sends to the post-departure user list, which already excludes the
departing user, so the remaining participants see the departure and the
departing connection is not written to. When the room empties there is nobody
to publish to and the send is a no-op, which is correct rather than a special
case. A departure always changes the participant list, so the no-op guard
never suppresses it.

**No snapshot ever carries version 0, and section 3 depends on it.** `publish`
bumps before it sends, so the lowest version on the wire is 1. A room actor
that restarts, or one recreated under a bookmarked id, therefore sits at 0
holding state no client has ever been told about, and cannot be mistaken for
"caught up" by a client whose `Last-Event-ID` is necessarily 1 or higher.
Stated because it is what makes section 3's single equality comparison safe in
the restart case, and it would be quietly broken by anything that sends a
snapshot without going through `publish` on a room that has never published.

`RoomConfig` groups the timing values rather than widening every recursive
call:

```scala
final case class RoomConfig(
    gracePeriod: FiniteDuration,
    boundedGracePeriod: FiniteDuration,
    sessionTtl: FiniteDuration
)

object RoomConfig:
  val default: RoomConfig = RoomConfig(6.seconds, 15.seconds, 2.hours)
```

**`SseConfig` owns these values; `RoomConfig` only carries them.** All three
are loaded and validated in `SseConfig.load` from `application.conf`, which is
where the env vars and every invariant below already live, and `Main` projects
them into a `RoomConfig` when it spawns `RoomManager` exactly as it passes
`sseConfig.gracePeriod` today. `RoomConfig.default` exists for tests, which
construct rooms directly and should not need a `Config`. Worth stating because
the obvious reading is that `RoomConfig` owns the defaults, and then
`application.conf`, `Room.defaultGracePeriod` and `RoomConfig.default` are
three places a value can be changed in and two places it can drift. The
existing `Room.defaultGracePeriod` folds into `RoomConfig.default` rather than
sitting beside it.

`gracePeriod` is already threaded through every `receiveBehaviour` call and
through `RoomManager.apply`/`createRoom`/`receiveBehaviour` as its own
parameter with its own duplicated default. Replacing both with `RoomConfig`
closes that duplication as a side effect and keeps arity where it is when
`boundedGracePeriod` and `sessionTtl` arrive. Unlike the superseded design,
there are no event-log knobs to carry. `sessionTtl` lands with PR 2 and the
other two with PR 4, so the case class is introduced in PR 1 with only
`gracePeriod` in it and grows twice; that is the point of introducing it
before either of them needs it.

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
    receiveBehaviour(roomId, publish(data, joined, context), config, timers)
  else
    // A resume changes nothing others can see; send only if this client is behind.
    if !lastKnownVersion.contains(joined.version) then
      user.ref ! RoomSnapshot.of(joined, user.id)
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
  special-casing and nothing to verify separately. The converse, a restarted
  room at 0 that a client's stale 0 could match, is unreachable rather than
  guarded: no snapshot ever carries 0 (section 2), so no client can be holding
  it.

The version is not an optimization, and section 6 is why. A caught-up bounded
connection has to send *nothing* in order to stay open and wait for the next
real publish. Remove the version and every connect answers with a snapshot,
`take(1)` fires immediately, and bounded mode degrades into a reconnect every
`SSE_BOUNDED_RETRY`, which is the fixed-interval polling profile "Approaches
considered" rejects. Worth stating here because PR 1 ships the version without
bounded mode, so its justification arrives a PR later than the code.

The same degradation is reachable without touching the version, by the header
never arriving: a proxy that strips `Last-Event-ID` makes every reconnect
resolve as behind, and this line stops distinguishing the cases. That is
assumption 8 under "Validating the proxy model", where the detection and the
response live.

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
// prev is { userId, editing, currentIssue }; returns the next view state, mutating nothing.
export function applySnapshot(prev, s) {
  const me = s.users.find(u => u.id === prev.userId);
  const tally = {};
  for (const u of s.users) if (u.voted) tally[u.estimation] = (tally[u.estimation] || 0) + 1;
  return {
    inRoom: true,
    users: s.users,
    votesRevealed: s.votesRevealed,
    // Do not clobber the issue input while the user is typing in it.
    currentIssue: prev.editing ? prev.currentIssue : s.currentIssue,
    userEstimation: me ? me.estimation : "",
    ownVoteConfirmed: !me || me.voted || !me.estimation,
    votesSummary: Object.entries(tally).sort((a, b) => b[1] - a[1])
  };
}
```

**It returns state rather than assigning it, for the reason section 6 gives
about `onState`.** That section requires connection state to be reported as
immutable snapshots and never by mutating a caller-owned object, because
mutation-based reporting works under Vue's reactivity and needs rework under an
immutable model, and the target framework for Phase 3 is undecided. Room state
is the same artifact under the same constraint, tested by the same runner, so
the rule applies here too; an earlier shape took Vue's `data` object and
assigned into it, which was the same argument reaching opposite conclusions two
sections apart. Being pure also removes the fake `ref` its tests would
otherwise need: a case is now a `prev`, a snapshot, and a returned object to
assert on.

The page owns the mapping, which is the glue section 6 budgets for:

```js
const v = applySnapshot(
  { userId: this.user.id, editing: this.editing, currentIssue: this.currentIssue }, s);
this.inRoom = v.inRoom;
this.users = v.users;
this.votesRevealed = v.votesRevealed;
this.currentIssue = v.currentIssue;
this.ownVoteConfirmed = v.ownVoteConfirmed;
this.votesSummary = v.votesSummary;
this.user.estimation = v.userEstimation;
```

Written out rather than `Object.assign`ed, because the one field that does not
map one-to-one is `userEstimation`, which lands inside `user`, and a spread
would silently add a stray reactive-in-name-only property beside it.

Every template consumer of room-derived state is reachable from the snapshot.
`users`, `currentIssue` and `votesRevealed` are carried directly;
`votesSummary` is derived as it already is today; `inRoom` is connection state
and is set here for the same reason `index.html:401` sets it today.
`showUserEstimation(u)` keeps deriving, but from a different field, below.

**`showUserEstimation` re-points at `hasEstimation`, and this is the one line
of client change that section 1's redaction forces.**

```js
showUserEstimation: function (u) {
  return u.hasEstimation && !this.votesRevealed;
}
```

Today's body reads the estimation string itself, which redaction empties for
every participant but the recipient, so leaving it alone would drop the
`shield-off` icon from everyone else's row without any line of the diff
appearing to touch the template. The reasoning for carrying the field rather
than re-keying on `u.voted` is in section 1. This is why the redaction PR is
not server-side only.

**The tally counts only participants who have voted, which is a deliberate
change, and it forces a one-line template guard.** Today `updateSummary`
(`index.html:546-552`) tallies `u.estimation` for every user, so a non-voter's
empty string becomes a summary row with its own count, and in a revealed room
with stragglers it can win the count and render as the "Most voted estimation"
(`index.html:262`). That is plainly unintended, and this design is rewriting
the function anyway, so it is fixed here rather than carried over. The
consequence is that the tally can now be empty where before it always had at
least the empty-string bucket, and `votesSummary[0][0]` would throw on an
empty array. `Show` pressed in a room where nobody has voted reaches exactly
that state, so the summary block's condition becomes
`v-if="votesRevealed && votesSummary.length"`. The guard is not optional and
is not defensive: it is reachable by two clicks.

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
now also self-corrects, though by a different route than the flag: if the vote
POST fails, the server holds no estimation for this user, so the next snapshot
sets `ref.user.estimation` back to `""` and no card is selected at all. The
derivation then reports `true` about a selection that no longer exists, which
is the correct answer to a question nobody asks, since `ownVoteConfirmed` only
ever discriminates when `e === user.estimation`. Today the same failed vote
leaves a card rendered as confirmed indefinitely.

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

**`applySnapshot` deliberately does not compare versions, and that is a
decision rather than an omission.** A protocol that puts a monotonic version
on every message and then ignores it on receipt invites the question, so the
reasoning belongs here rather than being inferred. Two guarantees make an
out-of-order snapshot unreachable. Within a connection, SSE delivers in order,
and a snapshot is one frame, so there is no interleaving. Across connections,
section 6 establishes that at most one is ever open per page instance: native
`EventSource` reconnection replaces the connection on the same object, and
both manual switches call `close()`, which takes effect synchronously, so the
old object is CLOSED before the new one is constructed. Server-side the same
holds from the other end, since `joinUser` replaces the entry and `publish`
then writes only to the new `ref`, leaving anything queued for the old one to
be read by nobody.

"Per page instance" rather than "per client" is deliberate. A second tab on
the same room shares the path-scoped session cookie, so it resumes as the same
`userId` and evicts the first tab's `ref`. That is pre-existing and is
recorded under "What was deferred or rejected", but it does not weaken the
argument here: each tab is its own JS context applying its own snapshots in
its own order, and neither can observe the other's.

Adding a `if (s.version < lastApplied) return;` guard would cost two lines and
is tempting, but it would assert a hazard the design says cannot occur, and a
reader would then reasonably conclude the ordering argument above is not
trusted. If that argument is ever weakened, most plausibly by something that
opens a second connection deliberately, the guard is the right response and
this paragraph is the thing to come back to. The version's purpose here is
server-side resolution (section 3) and the SSE `id:` cursor, not client-side
ordering.

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

The dropped branch also never answers `replyTo`, where today every `Leave`
eventually produces a `Running` or a `Stopped`. That is correct rather than a
leak: `RoomManager` handles `Running` as `Behaviors.same` and only acts on
`Stopped`, so no reply and `Running` are the same outcome, and the dropped
branch is by definition one where nothing was removed and no room could have
emptied. Stated because a silent `replyTo` is exactly what a reviewer stops
on, and re-deriving it costs more than reading it.

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
`pendingSessions` becomes `sessions`, retained past promotion instead of
consumed by it: `joinUser` no longer removes the entry. `PendingSession` is
renamed `Session`, since nothing about it is pending any more, and gains a
`createdAt`. A reconnect after removal then resolves normally and comes back
as an ordinary snapshot, instead of a dead end.

**Retention is bounded by a TTL, and `ValidateToken` keeps its `users`
fallback, which is what makes the TTL safe.** The obvious shape here is
"retain for the room actor's lifetime and resolve against `sessions` alone,
its `users` fallback becoming dead code." That shape is what turns the two
consequences below into open-ended ones rather than merely widened ones: the
map grows for as long as the room lives, and so does every token in it. Both
are avoidable in the same PR that creates them, rather than deferred to
whatever eventually gives `sessions` an idle expiry:

```scala
case ValidateToken(token, replyTo) =>
  val resolution = data.sessions.get(token).filter(_.isFresh(config.sessionTtl)) match
    case Some(session) => Resolved(session.userId, session.name)
    case None          =>
      // A present participant always resolves, whatever the TTL says.
      data.users.find(_.token == token) match
        case Some(user) => Resolved(user.id, user.name)
        case None       => Unresolved
```

Keeping the `users` branch is the whole trick. It is what stops a TTL from
being able to lock out someone who is sitting in the room with an open
connection, so `SSE_SESSION_TTL` can be set from "how long after leaving
should a rejoin still be free" rather than from "how long might a meeting
run". A default of 2 hours follows the shape of the work: a planning runs one
to two hours, and a busy day is one in the morning and one in the afternoon,
so 2 hours covers a whole session's worth of leaving and coming back while
guaranteeing the morning's tokens are dead before the afternoon's meeting
starts. Expiry is evaluated at resolution rather than swept by a timer, so
there is no scheduled work and no second place for the two stores to disagree.

**Measured from when the session was minted, not from last use.** A sliding
window would be more forgiving, and it would also mean an entry that is
touched often never expires, which gives back the bound the TTL exists for. It
would buy nothing anyway: the case a sliding window protects, a participant
who has been active all along, is exactly the case the `users` branch already
resolves. Measuring from the mint keeps the security window an absolute
`SSE_SESSION_TTL` from the moment the cookie was issued, which is the property
worth being able to state plainly.

Reclaiming the memory needs one more thing than the snippet shows: a
`ValidateToken` that finds an expired entry drops it and threads the pruned
data, so the handler returns `receiveBehaviour(...)` instead of today's
`Behaviors.same` on that branch alone. Without it the TTL bounds token
validity but not map size, which is half the point. A room nobody ever
reconnects to keeps its expired entries until it stops, which is acceptable:
the entries are small, and a room with no traffic at all is the case the
room-level idle expiry in Phase 2/5 exists for.

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

**This residual and section 6's detection false positives are the same
scenario, not two.** A backgrounded tab is both the likeliest way to arrive in
bounded mode by mistake (its silence is indistinguishable from a buffering
path, so re-detection fires) and the trigger for this residual once there.
Left unguarded they compound: a healthy solo user backgrounds a tab, is
misdetected into bounded mode, and then loses the room to a reaping that could
only happen in the mode they should never have entered. Section 6 therefore
refuses to arm either detection timer while the document is hidden, which
severs the link and confines this residual to clients that are in bounded mode
for a real reason. It does not remove the residual for those clients, which is
what the end-to-end measurement is for.

Four consequences, stated rather than discovered later:

- *Memory.* One small entry per `POST /rooms/:roomId/join` per room, unchanged
  by reconnects (a bounded cycle re-enters through `/events`, which never
  mints a session), so growth is per page load, not per cycle, and the TTL
  bounds it at "page loads within `SSE_SESSION_TTL`" rather than "page loads
  for the room's lifetime". The `docs/known-issues.md` entry "A `/join` with
  no follow-up `/events` leaks a pending session for the room's lifetime" is
  closed by that TTL rather than rewritten: an unpromoted session now expires
  on its own. The room-level idle expiry it pointed at for Phase 2/5 is still
  wanted for rooms themselves, which is a separate entry.
- *Behavior.* The session cookie is path-scoped and `httpOnly` and `doLeave`
  (`index.html:511-518`) never clears it, so today "click Leave, then reload"
  produces a `401` and a misleading "your session has ended" banner. It will
  now silently rejoin the same room under the same identity. That is an
  improvement, and it is a change.
- *Security.* A token stays valid for `SSE_SESSION_TTL` past its presence
  rather than ending with it, widening the window in which a captured cookie
  is usable. Bounded rather than open-ended is the point of the TTL: without
  it the window is the room's whole lifetime. Accepted for an internal tool
  behind `SameSite=Strict`, `httpOnly`, path-scoped cookies, and recorded
  rather than accepted silently.
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

**What this is still worth once PR 4 lands, stated because the overlap is
easy to miss.** Section 6's one-shot automatic re-join already recovers a
terminal `401` with no user action, so after PR 4 a late reconnect is no
longer a dead end even without retained sessions. What retention adds on top
is that the returning participant keeps their `userId` and their place in the
room rather than arriving as a new person beside their own six-second ghost.
The vote is lost either way (see the fourth consequence above). Before PR 4 it
is the difference between recovering and not, which is why it ships on its own
and first; after PR 4 it is the difference between a seamless return and a
visibly disruptive one. Both are worth having, and the second is the one the
security consequence above is being traded against.

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

**That entry's most visible form is a reload, not a tab close, which it now
says.** `POST /rooms/:roomId/join` mints a fresh `userId` and token on every
call, so a page reload is a new participant to the room and the previous one
lingers for the grace period. The user therefore watches their own name sit in
the participant list twice, for 6 seconds today and 15 under bounded mode. That
is the case a user actually reports, and the `sendBeacon` fix the entry already
proposes covers it too, so the trade above is being made against a symptom
that is written down rather than one a reader has to reconstruct.

**A single 15s grace period for everyone was considered.** It would delete
`User.bounded` and its threading through `SSE.source`/`ConnectToRoom`/`Join`,
`Mode.bounded`, one config value, one invariant and several tests, which is a
real amount of surface for one number. Rejected because the trade is paid by
the wrong people: it would make every unbounded client's departure, meaning
everyone not behind the proxy, two and a half times slower to announce in
order to simplify a path only proxied clients take. Two periods keep the cost
where the benefit is.

**Problem D part 3 does not arise.** Under the superseded design, resolving a
removed-then-returning user as a delta would have replayed that client's own
`Leave` and made it prune itself from its own participant list. A snapshot
contains the returning user, so there is nothing to guard.

**Problem E, reveal state is client-derived, and one half of it is a feature
rather than a fallback.** `ShowVotes` broadcasts and changes nothing
(`Room.scala:173-181`), so "revealed" exists only as a client-side flag. The
client keeps it up to date with `allVoted()` (`index.html:553-555`), which
re-derives it as "everyone has voted".

`allVoted()` is easy to read as resync machinery and is not. It is called from
the `join`, `vote` and `leave` handlers, so it runs on every message on every
client, and the `vote` call is what makes votes reveal automatically once the
last participant has voted, with nobody pressing Show. That is a shipped
behaviour, and `docs/roadmap.md`'s Phase 4 entry names it as such: "Today
'everyone voted' is computed client-side only and never told to the server or
other clients; it needs to become real backend logic." Deleting the derivation
along with the handler block, and setting `votesRevealed` from a flag that
only `Show` sets, would silently remove auto-reveal from the product until
Phase 4 lands. This has to be a decision, not a side effect of the rewrite.

The client-side derivation is wrong in one way that a server-side one is not,
and surprising in two more that a server-side one reproduces:

1. Wrong: `Show` pressed while a straggler has not voted, a legitimate
   facilitator flow, does not survive a resync. The reconnecting client
   re-derives "not everyone voted" and hides votes everyone else can see. An
   observer-mode display would do so with no human in the loop to notice. This
   is the one the fix below closes.
2. Surprising: the `join` handler calls `allVoted()`, so a participant
   arriving in an auto-revealed room hides the votes for the whole room again.
3. Surprising: the `leave` handler calls it too, so the last non-voter leaving
   reveals the votes with no facilitator action.

2 and 3 are not bugs in the derivation, they are the derivation. "Revealed
means every present participant has voted" says exactly that the set changing
can flip the answer either way, and moving the rule to the server changes
where it is computed, not what it computes. They are recorded here so that the
fix below is not read as closing them, and because closing them is a product
change rather than a protocol one. Deliberately kept as they are, and filed in
`docs/roadmap.md` under Phase 4; see "Derived rather than latched" at the end
of this problem.

**Fix, and it delivers Phase 4's roadmap item as a side effect.** `RoomData`
gains `revealed: Boolean` (initially `false`) meaning "Show was pressed";
`reveal()` sets it and the existing `clear()`/`reVote()` clear it alongside
the vote fields they already touch. The answer clients actually get is derived
next to it:

```scala
def isRevealed: Boolean = revealed || (users.nonEmpty && users.forall(_.voted))
```

The `users.nonEmpty` term is the one divergence from `allVoted()`, which
reduces over an empty array with seed `true` and so calls an empty room
revealed. Unreachable on the client, which only derives while its own user is
in the list, and wrong on a server that also holds rooms mid-teardown.

`RoomSnapshot.of` carries `isRevealed` as `votesRevealed`, which section 4's
`applySnapshot` passes straight through, deriving nothing. Auto-reveal is
preserved exactly, the straggler case is fixed because the stored flag wins,
and every client now agrees because one place computes it. Deriving rather
than storing the union means there is no second flag to keep consistent with
`voted`: a `reVote()` clears `voted`, so `isRevealed` goes false with no extra
bookkeeping.

No extra publish is needed for the auto-reveal transition, since the vote that
completes the round already publishes. `docs/known-issues.md`'s "Resync
doesn't replay whether votes are currently revealed" is removed per that
file's convention, and Phase 4 inherits reveal as real backend state rather
than a client-only derivation it has to replace.

**Derived rather than latched, decided.** The disjunction above preserves
today's semantics exactly, points 2 and 3 included, the empty-room term above
being the only exception and unreachable. That is the point of it: this design
moves where the rule is computed without changing what it computes,
so nothing about reveal behaves differently after PR 1 except the straggler
case, which was the bug.

The alternative is to latch, having `vote()` set `revealed = true` once every
participant has voted, so reveal becomes a one-way door until `clear()` or
`reVote()` reopens it. That closes point 2 and changes point 3, and it is
probably the better product behaviour, since a departure silently exposing
votes is the more alarming of the two. It is also a change to what the product
does rather than to how state reaches the client, so it belongs with whoever
owns the voting workflow rather than on a connectivity fix. It is filed in
`docs/roadmap.md` under Phase 4, next to the auto-reveal item this design
closes, with the shape it would take and the two tests it would invert.

The cost of deferring is one term: section 2's `visibleState` has to compare
stored `revealed` as well, because under a disjunction a `Show` can change the
flag without changing anything visible. Latching would make that term
unnecessary, which is noted there rather than only here.

### 6. Bounded/long-poll fallback for proxy-detected clients

This section is carried over from the superseded design with its client-side
design intact. What changes is the server side, which gets simpler because
there is no delta to resolve and no batching to respect.

Client-side (`index.html`'s `doJoin`):

- **No detection cache: every page load detects afresh.** The superseded
  design cached a "this path buffers" verdict in `localStorage` under a TTL, so
  a proxied client paid the detection window once a day rather than once per
  join. That is dropped, deliberately and with the 5-second cost accepted, on
  the principle that this first version should be as simple as it can be while
  still working. It is the single largest simplification in this section:
  it removes a `localStorage` key, an env var, the write-time against read-time
  expiry argument the TTL needed, a change to `doLeave`, the `storage`
  injection in `connection.js`, and five test cases.

  What it buys back is a residual with no recovery path. A cached verdict is
  consulted *before* any unbounded connection is attempted, so a client inside
  the window never runs detection and nothing it receives can correct the
  entry: the "any message self-heals it" property that applies to a detecting
  client is unreachable for exactly the clients that are wrongly pinned, and
  the TTL is the only lever. It also removes the reason that lever existed. The
  scenario the TTL was justified by is the whitelist request landing and the
  operator wanting clients off the bounded path; with no cache they simply
  detect correctly on their next join, so there is nothing to expire and no
  knob to reach for.

  The cost is 5 seconds behind the connecting spinner on each join for a
  genuinely proxied client, including `created()`'s auto-join of a bookmarked
  room. That is paid by users who cannot connect at all today. Re-adding the
  cache later is purely additive if the wait turns out to grate, and the shape
  to re-add is the read-time-TTL one, for the reason above.
- Open `EventSource` unbounded, always.
- **Start a detection timer when the `EventSource` is constructed, not in its
  `onopen` handler**, duration delivered from the server, default 5s. This is
  the whole mechanism: the target proxy delivers no headers at all for a
  stream that never completes, so `onopen` never fires in exactly the case
  detection exists to catch, and a timer armed there would never start. Any
  message, including a heartbeat, clears it. A bounded connection is never
  timed, since it may legitimately wait out the wall-clock cap.
- **Neither detection timer is armed while the document is hidden, and this is
  the guard that keeps false positives rare enough to accept.** Both timers
  infer "the path is buffering" from "nothing arrived within a window", and
  that inference is only valid while the browser was actually willing to
  deliver. Browsers throttle timers and eventually suspend connections in
  background tabs, so a backgrounded tab produces the detection signal for a
  reason that has nothing to do with the network:

  ```js
  if (document.visibilityState === 'hidden') return;   // do not arm
  // Both directions: a tab backgrounded after arming would otherwise fire on a stale timer,
  // and one that arrives hidden would otherwise never detect at all.
  document.addEventListener('visibilitychange', () =>
    document.hidden ? clearDetection() : armIfNeeded());
  ```

  The re-arm on becoming visible is half the rule and the half a reader
  implements from the guard alone would miss. Without it a proxied user who
  opens a room link in a background tab never detects, because the only moment
  the timer would have been armed has passed. `armIfNeeded` re-applies whatever
  the connection's current state warrants, a first-connection window if nothing
  has arrived yet, a re-detection window if it is an unbounded connection
  currently failing, and nothing at all if the client is already bounded.

  This is not hypothetical on either timer. `created()` auto-joins a
  bookmarked room (`index.html:560-574`), so opening a room link in a
  background tab constructs the `EventSource` in a throttled tab and arms the
  5s timer against a browser that was never going to deliver promptly. And
  re-detection arms on any `onerror` while unbounded, which is exactly what a
  backgrounded tab produces when the browser drops its idle connection, after
  which the tab stays silent because it is backgrounded rather than because
  the path is broken.

  The second case is the one that compounds, and it is why this guard is worth
  more than its size suggests. Problem D part 1's solo residual is a lone
  participant whose backgrounded tab fails to reconnect inside
  `boundedGracePeriod` and has their room reaped, a failure that only exists
  in bounded mode, since an unbounded connection simply stays open and is
  heartbeated. Without this guard, the most likely false-positive trigger is a
  backgrounded tab, and it deposits the client into precisely the mode whose
  known residual is a backgrounded tab losing its room. Those two would
  otherwise be filed as independent open questions while being the same
  scenario.

  A genuinely proxied user who opens in a background tab simply detects when
  they focus it. That is the correct outcome rather than a missed detection:
  they cannot see the broken room until then anyway, and the cost of waiting
  is zero.
- If the timer fires with nothing received: close that connection, mark an
  in-memory `sseBounded = true` for this page instance, and manually open a new
  `EventSource` with `?bounded=1`. `sseBounded` is sticky for the page
  instance, so this switch happens at most once per page load, and nothing
  outlives the page instance. These are the only two manually-driven
  reconnects in this design, both needed because the URL itself changes.
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
  mints a fresh session. So run the recipe instead of asking for it, through
  the injected `rejoin` described under "Implementation shape", since the
  recipe is HTTP and identity and both stay on the page. Two properties make it
  compose: `sseBounded` is sticky, so the reopened connection stays on
  whichever path detection chose, and the new connection carries no
  `Last-Event-ID`, so it resolves as a fresh join. A third makes it safe to
  repeat: `config` is replaced by whatever `rejoin` returns rather than reused,
  so a server redeployed with different timings mid-session is picked up rather
  than ignored.
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

- The route accepts an optional `bounded` query parameter. It is
  client-asserted and deliberately unvalidated: a client that claims it gets
  bounded framing and `boundedGracePeriod` on departure, which is a slower
  announcement of its own leaving and nothing else. There is nothing to gain
  by lying and nothing to protect, so the parameter is taken at face value the
  way `Last-Event-ID` is.
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
    since a genuinely idle room must still self-close before the appliance's
    deadline, whatever probe B measures it to be, otherwise it is exactly
    today's failure.

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
// bounded is section 5's User.bounded, which must outlive the Join to be readable at Leave time.
enum Mode(val retryMillis: Int, val bounded: Boolean):
  case Unbounded(retry: Int, heartbeatInterval: FiniteDuration) extends Mode(retry, false)
  case Bounded(retry: Int, durationMillis: Int)                 extends Mode(retry, true)

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

Parameterising the enum itself, rather than adding `retryMillis`/`bounded`
accessors that `match` on the case, is what keeps this to four lines: an enum
case's own parameters are not visible on the parent type, but a parameterised
enum's are, so the two shared values are declared once and the cases only say
what they contribute.

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

  **The retry jitter is not the same anti-lockstep measure as the duration
  jitter, and its own reason is the stronger one.** `SSE_BOUNDED_DURATION_JITTER`
  spreads out clients that are idling to their wall-clock cap independently. The
  retry jitter covers the case that is not independent at all: a single publish
  closes every bounded connection in the room at once, so without it the whole
  room reconnects through the same proxy in the same tick, every tick, for the
  length of the meeting. Jitter is applied per connection at the route, so two
  clients closed by the same publish come back at different times.

  What it buys is precise, and worth not overstating: +/-100ms on a 500ms base
  spreads a ten-person room across a 200ms window, which breaks the exact
  simultaneity rather than the burst. That is the property that matters here.
  A repeating, precisely synchronized arrival pattern is a signature; ten
  requests inside 200ms is a room voting. Room sizes at this scale never make
  the burst itself the problem, which is why the jitter is sized to defeat the
  pattern and not to flatten the load.
- **`retry:` rides only on data frames, so the 500ms cadence depends on each
  new `EventSource` object's first cycle carrying a snapshot.** A bounded cycle
  that closes at its wall-clock cap with nothing to send emits no frame at all,
  and therefore no `retry:` hint; the browser keeps applying whatever value it
  last received. Every path does deliver one on the first cycle (a new
  `EventSource` sends no `Last-Event-ID`, which section 3 resolves as behind),
  so the only connection ever made at the browser's own default is the very
  first one after a manual switch. That is fine and it is also invisible, which
  is why it gets an `SSESpec` case rather than a note alone.
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
  `SSE_BOUNDED_GRACE_PERIOD` (15s), `SSE_SESSION_TTL` (2h, Problem D part 1),
  and `SSE_HEARTBEAT_INTERVAL` (15s, unchanged from today's hardcoded value;
  see the invariants for why it stops being a constant). These are judgment
  calls about a real proxy's behaviour and real users' tolerance for lag, to be
  revisited with production feedback.
- **`SSE_ASSUMED_PROXY_TIMEOUT`** (45s) sits in the same config but is not a
  tuning knob: it declares a fact about the deployment environment, the
  shortest response-completion deadline any proxy in front of this service is
  believed to enforce. Nothing reads it at runtime. It exists so the
  invariants can check the cap against the ceiling that actually matters. A
  deployment behind a stricter proxy lowers it; one behind no buffering proxy
  raises it. **The 45s default is a placeholder, not a measurement**, and must
  be set from probe B before PR 4 ships. Until then the invariants check the
  cap against a number no one has observed, which is a check that passes
  rather than a check that holds.
- **`SSE_DETECTION_TIMEOUT`** (5s) cannot reach the client on the SSE wire,
  since detection times the absence of any frame. It rides the existing
  `POST /rooms/:roomId/join` response (`JoinResponse`, `API.scala:76-95`),
  which already precedes `EventSource` creation and is a small finite response
  the proxy releases immediately. `JoinResponse` carries the derived
  re-detection window alongside it. Nothing else needs to reach the client
  before its first frame, and with no detection cache there is no client-side
  persistence at all: a wrongly detected client is corrected by its next page
  load rather than by an operator lowering a TTL.
- **`doLeave`'s `localStorage.clear()` stays as it is.** It wipes exactly
  `roomId` and `name`, which is what it is for. This is worth a line only
  because the superseded shape had to change it: a detection cache would have
  put a path-state key in the same store, making the Leave button silently
  reset detection. With no such key, the classification never comes up.
- **Logging at the decision points this design introduces**, plain SLF4J, no
  new dependency, since several constants are explicitly "revisit after
  production feedback" and that revisit is unactionable without observation: a
  line when a connection resolves with `?bounded=1`, carrying the session
  token, whether a `Last-Event-ID` arrived and whether it resolved as caught
  up; and a line at bounded-connection close noting which reason fired
  (publish-triggered against wall-clock cap), the signal for whether
  `SSE_BOUNDED_DURATION` is well-tuned. Together these are the only place
  assumptions 5 and 8 become visible in production, and the table under
  "Validating the proxy model" is how to read them: cursor, close reason and
  reconnect cadence separate a healthy idle client from a stripped cursor from
  a client receiving nothing at all. The session token is on the line so that
  repeated reconnects can be attributed to one client rather than counted as
  many. Deliberately not proposing a metrics library; this codebase has none
  and adopting one is a separate decision.

**Config invariants.** `SseConfig.load` already enforces
`gracePeriod >= 2 * retryMillis` so a routine reconnect beats the grace
period. This design adds a second grace period the same property depends on,
plus two proxy-facing values that can silently reintroduce the original
failure if misconfigured. All extend `SseConfig.load`, same file, same style:

```scala
require(boundedGracePeriod >= gracePeriod, "...a bounded connection cycles orders of " +
  "magnitude more often than an unbounded one, so it can never safely need less slack")
require(boundedGracePeriod.toMillis >= 4 * boundedRetryMillis, "...a bounded cycle's real " +
  "reconnect gap is a multiple of the retry value, not equal to it; this is a floor against " +
  "an obviously-too-small grace period, not a guarantee it outlasts the proxy")
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

Plus positivity checks for each new value, in the style the existing ones use,
with one deliberate exception: `SSE_BOUNDED_DURATION_JITTER` is checked
`>= 0`, not `> 0`, because zero is the meaningful "no jitter" setting rather
than a misconfiguration.

**The second is weaker than it looks, deliberately.** The quantity that
actually decides whether `boundedGracePeriod` is safe is the proxy's
scan-and-release latency, which is assumption 6 and does not appear in the
formula at all: `SSE_BOUNDED_RETRY=200ms` with `SSE_BOUNDED_GRACE_PERIOD=1s`
passes and is unsafe if that latency is seconds. Anchoring the check on a
third proxy-facing value would be guessing twice, since probe A is scoped to
give assumption 6 a number and this check would have to be rewritten around it
anyway. So it stays a floor against the obviously-wrong end of the range, the
comment says so rather than claiming coverage it does not have, and the real
answer is a probe result rather than a `require`.

The third is the one that actually bites. An earlier version checked only
Pekko's 60s idle timeout, reasoning that the codebase cannot know a customer's
proxy timeout. That is true and was the wrong conclusion: the codebase cannot
know it, but the operator deploying behind that proxy can, and giving them
nowhere to say it means the check guards the ceiling that does not matter. Any
cap safe against a proxy stricter than 60s is automatically safe against a 60s
framework timeout, so the Pekko check passes for every sane value and also passes for
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
detection timer, a re-detection timer with a different window, a visibility
guard on both, one manual URL switch, an error-debounce counter, a one-shot
re-join on a terminal `401`, and a spinner flag. That is also precisely the
code a future framework migration has to port. Leaving it inline means it is
untestable now and rewritten twice later, so it moves to
`src/main/resources/pages/connection.js` as an ES module with its dependencies
injected:

```js
export function createConnection({
  roomId,                        // stable for the page instance
  config,                        // JoinResponse's timings; replaced by whatever rejoin returns
  eventSourceFactory,            // injected so tests supply doubles
  setTimeout, clearTimeout,      // injected so tests control time
  rejoin,                        // async () => config. The page's doJoin; see below
  onSnapshot, onState            // outward reporting, see below
}) { /* ... returns { start, stop } ... */ }
```

**`userId` is not a parameter, which is what makes the rest of this simple.**
Nothing in the connection state machine reads it: the URL is
`/rooms/:roomId/events` with no user in it, and authentication is the cookie.
Its only consumer is `applySnapshot`, which section 4 keeps on the page and
which takes it as an argument. So the module never learns that a `userId`
exists, and a re-join minting a new one is not its problem.

**The terminal-`401` recovery needs a way out of the module, and `rejoin` is
it.** Recovery means re-running `doJoin`: a `POST /rooms/:roomId/join` that
mints a fresh session, returns a new `userId`, and returns a fresh
`JoinResponse`. Two of the three data arguments this module was constructed
with are invalidated by that, and it needs a `name` it was never given, so
without an injected escape the interface simply cannot express its own recovery
rule. `rejoin` is an async function the page supplies, closing over `name` and
over axios, doing exactly what `doJoin` does today including assigning the new
`userId` into Vue's `data`, and resolving with the fresh config. Identity never
crosses the boundary because it travels in the cookie and lands on the page as
a side effect of the page's own code.

The alternatives were reporting a terminal state and having the page construct
a *new* `createConnection`, or having it restart the same instance. The first
is the one that looks cleanest and is worst: a fresh instance loses
`sseBounded`, which this design requires to survive precisely this transition,
and loses the one-shot flag, whose reset rule ("any successful message resets
it") only the module can observe. That splits one state machine across two
files along the seam most likely to break, in the file this extraction exists
to shrink. Restarting the same instance keeps that state but inverts control
for one branch alone, leaving a reader of `connection.js` looking at a machine
with a hole in it and tests that drive the hole by hand. An injected `rejoin`
keeps the whole machine in the module and keeps HTTP, `localStorage` and `name`
on the page, which is the boundary drawn below.

The cost is one async dependency and a `rejoin` that can reject, which is not
new work: today's `doJoin` already has a `.catch` setting "Could not join the
room", and that becomes a state the module emits like any other. In tests
`rejoin` is a fake resolving or rejecting, which is easier to drive than a
manual restart. The `SECURE_COOKIES` loop still terminates: `/join` succeeds,
sets a cookie the browser will not return, `/events` answers `401` again, the
one-shot flag is spent, banner.

No `storage` is injected: with the detection cache dropped, the module holds
no persistent state, and `localStorage` stays entirely in `index.html`'s
`doJoin`/`doLeave` where `roomId` and `name` already live.

`onState` emits immutable snapshots of connection state, it never mutates a
caller-owned object. This decides whether the module survives the framework
migration or merely survives it under Vue: mutation-based reporting works for
Vue 2 and Vue 3 reactivity and needs rework for an immutable model such as
React's, and the target framework is undecided. Section 4's `applySnapshot`
follows the same rule for the same reason.

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
its built-in timer mocking, and about 60 lines of test doubles (a fake
`EventSource` exposing `readyState`/`onopen`/`onmessage`/`onerror` plus an
`emit` helper, and a settable `document.visibilityState`). They join PR 0b's
`test/` directory, which the e2e testkit design keeps free of dependencies for
exactly this reason: `package.json` carries only `@playwright/test`, as a
devDependency the browser suite installs and the gating path never does. The
`setup-node` step and the gating `node --test` step land with PR 0b, so this
work adds cases to a runner that already exists. JS coverage is deliberately
not merged into the existing scoverage/Codecov stream for now.

### 7. Bundled fix: buffering-proxy headers

Add `Cache-Control: no-cache` and `X-Accel-Buffering: no` to the SSE response.
This will not fix the antivirus-scanning proxy this spec targets (it buffers by
design, irrespective of such hints), but it is a cheap, already-flagged gap
worth closing alongside a deployment-relevant change to this code path. An
`APISpec` case asserts both headers are on the `/events` response, because
nothing else would notice their removal.

**The headers are half of the entry they close.** `docs/known-issues.md`'s "SSE
reverse-proxy buffering is undocumented" is filed against `README.md`, and its
complaint is that the code sets no such headers *and* that nothing tells a
deployer what to configure on the proxy in front. So this section also fills in
the `README.md` `### Deployment` heading, which exists today with nothing under
it: that `/rooms/{roomId}/events` is a long-lived stream that must not be
buffered, that nginx honours the `X-Accel-Buffering` header this now sends
while anything else fronting the service needs response buffering and gzip
turned off on that route by hand, and that a content-scanning proxy is a
different failure with its own spec. Fifteen lines or so. Without it the entry
would have to be narrowed rather than removed, which is a worse outcome for
about the same effort.

## Validating the proxy model

Everything from section 6 rests on the description in Problem, which is stated
as fact and is not tested anywhere. The end-to-end layer does not close that
gap: the stub proxy is built to this model, so a green suite proves the
implementation matches the assumption, not that the assumption matches the
customer. A stub built to a wrong model tests the wrong thing thoroughly.

**What is actually being assumed.** Problem reads as one fact but is four, and
the design leans on four more it never states:

1. The proxy buffers the complete response body before forwarding anything.
2. It delivers no headers either, not only no body.
3. It kills the connection at some deadline, currently unmeasured. The 45
   seconds earlier drafts asserted was a `curl --max-time 45` artifact.
4. That deadline is measured against response completion, which is what
   `SSE_ASSUMED_PROXY_TIMEOUT` encodes.
5. A response that does complete is released promptly.
6. Scan-and-release latency for a tiny or empty body is small.
7. A completed chunked `text/event-stream` reaches the browser in a form
   `EventSource` still treats as a stream and still auto-reconnects from.
8. The `Last-Event-ID` request header the browser sends on that reconnect
   reaches the server, rather than being stripped on the way through.

**One is already hedged and needs no test.** Assumption 2 does not matter,
because the detection timer arms at construction rather than in `onopen`
precisely so it works whether or not headers arrive. It is also the one
assumption the curl trace above supports directly, since no response headers
arrived there either.

**Assumptions 3 and 4 are expressible but currently unfed.** A stricter or
differently-measured deadline is what `SSE_ASSUMED_PROXY_TIMEOUT` exists for,
and the fractional margin follows it down. But that hedge only works if
someone supplies the real number, and nobody has: the 45 was the client's own
timeout read back as the appliance's. If the true deadline is 20 seconds, the
defaults produce a 20 to 30 second cap, the `require` passes because the
assumed value still says 45, and bounded mode fails exactly as today does.
The knob exists; nothing has ever fed it.

Note which direction is dangerous. A deadline longer than assumed, or no
deadline at all, costs nothing: bounded mode closes first by design. Only a
deadline shorter than the cap breaks it. That is why probe B's 75-second
give-up is sufficient even though it may return a lower bound rather than a
value, and why a B result of "still open at 75s" is a pass rather than an
inconclusive run.

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

**What it looks like from the user's seat if assumption 5 is false**, recorded
so it is recognisable in the field rather than debugged from first principles.
Detection concludes normally, since detection only measures that nothing
arrived, and the client switches to bounded mode. The bounded connection is
then never timed (section 6), so the user watches the connecting spinner for
the proxy's full deadline, roughly 45 seconds, before the first `onerror`.
That error is debounced, so it takes three failing cycles, another minute and
a half or so, before the banner appears. The signature is therefore a long
silent spinner followed by a late banner, rather than the immediate failure
today's unbounded path produces.

**It is also visible from the server, which matters more than the user-seat
description.** The request reaches the server normally; only the response is
withheld, so nothing about this is server-side silent. Section 6's
bounded-connection log line carries the discriminator, and it reads three ways:

| Cursor | Close reason | Reconnect cadence | Reading |
| --- | --- | --- | --- |
| present | wall-clock cap | 20-30s | healthy idle client |
| absent | on send | ~500ms | `Last-Event-ID` stripped (assumption 8) |
| absent | on send | ~45s, same session token | nothing is reaching the client (assumption 5) |

The cadence is what separates the two failures, and it separates them for a
reason rather than by luck. A client whose cursor is stripped is still
receiving frames, so it has applied the `retry:` hint and comes back in half a
second. A client receiving nothing has never seen a frame, so it has never seen
a `retry:` value either, and falls back to the browser's own default after the
proxy's deadline. Both look identical in the product and are one log query
apart in production. Worth stating because assumption 5 is otherwise the risk
with no detection story at all, diagnosed from a user describing a spinner.

**Assumption 8 fails silently into the exact profile approach 5 was rejected
for, and nothing in the design notices.** An appliance that forwards only
whitelisted request headers strips `Last-Event-ID`, and section 3 then resolves
every bounded reconnect as behind: a snapshot is sent, `take(1)` fires, the
connection closes, the browser retries at `SSE_BOUNDED_RETRY`. The wall-clock
cap is never reached, because it only governs a cycle with nothing to send, so
there is no floor at all. That is a full snapshot every 500ms plus one scan and
release, per client, up to 7,200 requests an hour each, at small near-uniform
intervals, against the appliance whose operators are being asked for a
whitelist. Approach 5 is rejected at half that rate, and it is twenty times
what bounded mode is costed at when the cursor works.

Nothing breaks. Every client stays correct and current, every config invariant
passes, and the only symptom is the request rate, which is why this is worth
stating rather than leaving to be noticed. Section 3 already describes the
identical degradation reached from the other direction, by removing the version
rather than by losing the header; the difference is that removing the version
is a code change a reviewer would see.

Two responses, neither of which is a code change to bounded mode itself. Probe
D settles it for free, see below. And the bounded-close log line in section 6
is already the detector once someone knows to read it: on an idle room, every
close reporting publish-triggered rather than wall-clock cap means the cursor is
not arriving. If it turns out to be a live condition rather than a hypothetical,
the proportionate fix is a minimum dwell before a bounded connection may close
on send, which is a floor rather than the fixed hold-open window section 6
rejects, so that rejection does not carry to it.

**The blast radius is PRs 3 to 5.** PRs 1 and 2 are live bug fixes plus the
protocol replacement, and are justified without any of this.

**The ladder, cheapest first.**

- *Ask.* Get the appliance's make and model from the customer's administrators
  and read its documentation. Costs an email, no user time, may settle 3, 4
  and 5 outright, and is information worth having for the whitelist
  conversation that is already open. Whoever agrees to run the probe is usually
  the cheapest route to this too, so ask in the same message rather than
  treating the two rungs as sequential.
- *Probe.* One env-gated route plus one static page, roughly 80 lines, shipped
  inside the ordinary Pekko server and the ordinary binary, default off. There
  is nothing to host and nothing to deploy separately: it goes out with a
  normal release of this service, and running it is turning an env var on for
  the deployment the customer already points at and off again afterwards. That
  is what makes the measurement worth anything, since the request has to
  traverse the identical network path to say anything about that path. The
  customer side is "open this URL, leave it running for about eight minutes,
  send us the table." Nothing about it looks like probing their
  infrastructure, and it needs no contact with their security team.

| Probe | Server behaviour | Budget | What it answers |
| --- | --- | --- | --- |
| E | Five small `POST`s, timed individually | ~5s | Does a tiny finite response cross cheaply in both directions? `JoinResponse` carries the detection windows, and every command is a `POST`, so this is detection's delivery channel and command latency in one row. A second, independent number for assumption 6. |
| A | Emit three SSE frames over 2s, then close. Run twice | ~10s | Is a completed stream released, and is time-to-first-byte equal to close time (buffered) or near zero (streamed)? Gives assumption 6 a number. Twice, because an appliance that caches a scan verdict per URL makes the second request much cheaper, which would change the latency model in bounded mode's favour and is invisible in a single sample. |
| I | Same as A but with a realistic snapshot-sized body, roughly 2KB. Run twice | ~10s | Whether scan-and-release latency scales with body size. Assumption 6 is stated for "a tiny or empty body", but every bounded cycle that delivers carries a snapshot, 1.1KB at ten participants and 2.1KB at twenty, so this is the per-cycle cost of the actual design rather than of its idle case. |
| C | One frame at 1s carrying an `id:`, close at 20s | ~25s | Bounded mode's exact shape, proven without building bounded mode. |
| F | `application/json`, held open, completed at 20s | ~25s | Option 6's premise: is a finite, `Content-Length`-delimited body released on completion where a stream is not? |
| B | SSE heartbeat every 2s, never close; client gives up at 75s. Run twice | ~150s | The kill deadline, measured for the first time, and whether zero bytes truly arrive. There is no prior value to replace: the 45 was a curl artifact. A run still open at 75s is a pass, not a failure, since only a deadline shorter than the cap threatens the design. Twice, because this number sizes every cap and invariant in section 6, and a single sample cannot tell a fixed deadline from a variable one. |
| H | Never close and send *nothing*, not even heartbeats; client gives up at 75s | ~75s | Assumption 4: is the deadline absolute from request start, or an idle timeout upstream? B is killed while actively receiving; H is killed while silent. The same figure from both means absolute, which is what `SSE_ASSUMED_PROXY_TIMEOUT` encodes. A shorter figure from H means an idle timeout, at which point the heartbeat interval becomes load-bearing in a way this design does not currently model. |
| G | `application/json`, held open, never completed; client gives up at 75s | ~75s | Whether the deadline is a property of the connection or of the content type, which is what sizes a long poll's hold if option 6 is ever reached. |
| D | Run C through a real `EventSource` for 90s | ~90s | Content type survives, the browser reconnects, `retry:` is honoured, and `Last-Event-ID` arrives upstream. Assumptions 7 and 8. |

**They run one at a time, and that is the point of the budget rather than a
limitation of it.** Several long-lived connections opened together would hit
the HTTP/1.1 per-origin limit, and an appliance that buffers whole responses is
also an appliance that may queue them, so a parallel run risks measuring its
concurrency behaviour and reporting it as latency. Serial keeps each row
answering the question it was written for. The total is about eight minutes, so
the page shows which probe is running, what it is for, and how long is left,
because a blank screen for eight minutes is a tab that gets closed. It should
also be resumable at the row level, since one interruption should not cost the
whole run.

**Why eight minutes and not four.** The rows that repeat, and H, are not
padding. Everything section 6 is sized from descends from one measured number,
and the difference between "45s, absolute" and "45s, idle" or "45s once, 30s
under load" is the difference between invariants that hold and invariants that
pass while the original failure comes back. That distinction cannot be drawn
from one sample of one probe, and the marginal cost of drawing it is four
minutes of a colleague's time on a run he is already sitting through. The
expensive resource here is his attention once, not the seconds inside it.

The page records, per connection: time to first byte, time to close, bytes
received, frames received, connection count, HTTP status and content type as
received, and the `Last-Event-ID` value the server saw. C and D together are a
direct proof or refutation of the premise. C's frame carries an `id:` for no
reason other than to give D something to echo, which is the whole cost of
settling assumption 8.

**E, F and G are there because the round trip is the expensive part, not the
code.** None of them is needed to decide whether bounded mode works; A, B, C
and D do that. They are here because the scarce resource is a person on that
network, and each answers a question that is cheap to ask now and expensive to
ask later. E covers the one path the design assumes is free and never checks,
which would surface after ship as "voting feels slow" rather than as a
connectivity bug. F and G de-risk the fallback rather than the design: option 6
is the only answer to assumption 5's fatal case, and its premise is currently
reasoning alone, so without them the moment you need long polling measured is
the moment you have just spent your credibility on bounded mode failing.

**The direct-connection baseline**, measured locally on 2026-08-30 with no proxy
in the path, so the customer's table is read against a known-good run rather
than against expectations. Firefox 140, localhost.

| Row | Baseline | What a departure means |
| --- | --- | --- |
| E1 to E5 | TTFB 4-23ms, 2 bytes | Seconds here is command latency, not event delivery |
| A1, A2 | close ~2020ms, browser wait <60ms, body over ~2015ms | Wait rising to the close time means buffered |
| I1, I2 | as A, 6,234 bytes | Materially worse than A means scan cost scales with body |
| C | close ~20020ms, body over ~20018ms | Body collapsing to ~0ms is the buffered signature |
| F | close ~20040ms, `application/json` | A withheld JSON body kills the option 6 fallback too |
| B1, B2 | close 75000ms, 38 frames, still open | Closing earlier is the deadline, and is the number to take |
| H | close 75002ms, 0 bytes, gave up | Closing earlier than B means an idle timeout, not an absolute one |
| G | close 75000ms, 34 bytes | Closing while F succeeds makes the deadline content-type-specific |
| D | 5 connections, gaps ~20529ms | Gaps at 20s + browser default rather than + 500ms means `retry:` is ignored |

The discriminator that matters is the timing shape: every streaming row shows a
short wait followed by a body delivered over the full duration, which is what
"streamed" looks like, and buffered inverts that into a long wait and a body
over roughly zero. That reading holds in any browser.

A second signal is present but must not be leaned on. The response headers
group into two sets, the five POSTs without `transfer-encoding: chunked` and
the nine streaming rows with it, which would show a rewritten transfer encoding
without reading a timing at all. It is browser-dependent: this baseline is
Firefox 140, and Chrome and Edge strip hop-by-hop headers from `fetch` more
aggressively, so the split may be absent there with nothing wrong. Its absence
is therefore not evidence of anything.

**The baseline is Firefox and the customer's desktop probably is not.** A
corporate machine behind this appliance is most likely Edge or Chrome, and
three of the things recorded here differ by engine: the default `EventSource`
reconnect delay when `retry:` is absent, whether an aborted request produces a
Resource Timing entry at all, and the hop-by-hop header question above. The run
records the user agent for exactly this reason. Comparing a Chrome result
against these Firefox numbers requires a Chrome baseline first, which costs one
local run and is worth taking before the customer's run rather than after.

D's baseline gaps of ~20529ms are 20s of stream plus the 500ms `retry:` the
probe now sends, which is the direct evidence that the hint is honoured.

**The same run against production, on 2026-08-30 and without the customer's
network in the path, reproduces the baseline**: streamed on every row, B, G and
H holding their full 75s, D reconnecting at ~20548ms. So nothing in our own
hosting buffers, and a departure in the customer's run is theirs rather than
ours. That is worth having measured rather than assumed, since otherwise the
first buffered result would have two candidate causes.

It also fixes our own edge's fingerprint, which the customer's result has to be
read against. Clever Cloud's Sozu proxy stamps `sozu-id` on every response,
with a different value each time, and adds `forwarded`, `x-forwarded-for`,
`x-forwarded-port`, `x-forwarded-proto` and its own `sozu-id` to the request.
Everything in that list is ours. Any header beyond it in the customer's run
came from their side, which is the whole discriminator for identifying the
appliance from the table alone.

The per-request `sozu-id` is also why the page groups response headers by name
rather than by name and value: grouped by value, that one header put all
fifteen connections in separate blocks and buried the only real difference,
which is `transfer-encoding: chunked` on the streaming rows and not on the
POSTs.

Rows B, G and H carry no browser timing and no protocol in the baseline, and
will not in the customer's run either: browsers record no Resource Timing entry
for a request the client aborted, and those three are aborted by design. Their
time to first byte, close time and byte count are measured directly and are
unaffected, which are the figures those rows exist for. A missing detail line
on exactly those three is the expected shape, not a failed probe.

**What each outcome means.** Confirmed, proceed and set
`SSE_ASSUMED_PROXY_TIMEOUT` from B rather than from the default, taking the
smaller of B's two runs. A shorter or differently-measured deadline, set the
value and let the invariants follow it down, no design change. B's two runs
disagreeing, size from the smaller and treat the spread as a reason to widen
the fractional margin rather than to average. H coming back materially shorter
than B, the deadline is an idle timeout rather than an absolute one, and
`SSE_HEARTBEAT_INTERVAL` stops being a Pekko-driven value and becomes the
thing that keeps an unbounded connection alive through the appliance; that is
a design change, in the one direction none of the invariants currently guard.
A large scan-and-release latency in A or I, revisit
`SSE_BOUNDED_GRACE_PERIOD` and re-run the latency comparison against polling.
I materially worse than A, per-cycle cost scales with the snapshot, which is
the condition under which approach 3's incremental live push stops being a
scale question and becomes a latency one, well below the 20-to-30 participant
threshold recorded there. A's second run much faster than its first, the
appliance caches a verdict per URL, which makes bounded mode cheaper than
modelled and is the one result that would argue for a shorter
`SSE_BOUNDED_DURATION`. E showing seconds of `POST` latency, command
responsiveness is the user-visible problem rather than event delivery, and the
detection windows delivered by `JoinResponse` need re-sizing before PR 4.
D reporting no `Last-Event-ID` upstream, bounded mode still works but at the
request rate described above, so add the minimum dwell before PR 4 ships rather
than after; this is the one outcome that changes code rather than
configuration, and it is cheap precisely because it is known in advance.
F failing while C succeeds would be surprising and is worth knowing anyway: it
would mean option 6 is not the escape hatch this design believes it is, and the
fallback becomes approach 5 after all, at whatever request rate the whitelist
conversation can be made to tolerate.
C or D failing, bounded mode's premise is gone and the fallback is option 6
under "Approaches considered", long polling over the same snapshot payload,
which is a transport swap rather than a redesign. Option 6 rather than option
5 specifically: a C or D failure is most likely an appliance that will not
release a streaming content type, and a finite `application/json` response is
what answers that, whereas short polling would answer it at a request rate the
same security team is likely to flag.

**Proceeding without it is a legitimate choice, recorded as one rather than
reached by drift.** The probe needs a person on that network for about eight
minutes, and if the customer cannot supply one in the time available, waiting
is not obviously better than shipping: the whitelist request may land first
and make all of this moot. Four things soften that and one does not.

- The timing values are all env-driven, so a wrong guess about 3, 4 or 6 is a
  configuration change on a running deployment, not a code change.
- A wrongly detected client is wrong for one page load, not for a cached
  window. With no detection cache, `sseBounded` dies with the page instance,
  so the blast radius of a false positive is bounded by a reload rather than
  by an operator noticing and turning a knob.
- The failure mode is the one that already exists. A client for whom bounded
  mode does not work is a client that cannot connect today either, so an
  unvalidated model risks wasted effort rather than a regression for anyone.
- Long polling stays available as the fallback (option 6), and is cheaper
  under this design than it was under the superseded one, since it reuses the
  snapshot payload and the version cursor unchanged. It also happens to be
  immune to assumption 8, since it carries the cursor as a query parameter
  rather than as a header nothing obliges a proxy to forward.

What none of that changes: assumption 5 stays unverified until it meets the
real proxy, and the first place that happens is the customer's own deployment.
Assumption 8 stays unverified too, with the difference that it announces itself
in the logs rather than in the product, so it is discoverable after the fact
where assumption 5 is not. Take the *Ask* rung even when the probe is skipped.

## What was deferred or rejected

- **Snapshots for resync plus incremental events for live push**: rejected,
  see approach 3. It is the best of the options on bandwidth and the largest of
  them in code, needing the event vocabulary and the snapshot side by side. It
  is also the option to revisit first if room sizes ever grow, since reaching
  it from snapshot-only is additive rather than a rewrite.
- **Events with `Reset` and a synthetic full replay, no log**: rejected, see
  approach 2. The minimal event-based fix and a genuine option, rejected on the
  maintenance surface every event protocol carries rather than on cost.
- **A `since` parameter or any form of partial snapshot**: rejected. It is the
  event log by another name, and the measurement in Problem shows the full
  snapshot is already smaller than what the app sends today.
- **Carrying `issueLastEditBy` in the snapshot**: rejected. Nothing on the
  client reads it; it exists only to drive today's synthesized `EditIssue`
  frame. It stays on `RoomData` in case Phase 4 wants it.
- **Durable/persisted room state**: deferred to Phase 2. The wire protocol
  here does not need revisiting when that lands, and `version` is a natural
  fit for an optimistic-concurrency column if it ever becomes one.
- **Short polling instead of an SSE fallback**: rejected, see approach 5. Its
  request rate is the objection, and that objection is specific to the
  interval rather than to polling as such.
- **Long polling instead of a bounded SSE fallback**: deferred, not rejected,
  see approach 6. This is the fallback if the proxy model turns out to be
  wrong, replacing short polling in that role, and it is the one option that
  answers assumption 5's fatal case rather than hedging it. This design makes
  it cheap to reach for: same snapshot payload, same version cursor, different
  transport.
- **The detection cache** (`sseBoundedAt` in `localStorage` under
  `SSE_DETECTION_CACHE_TTL`): dropped from the superseded design, see section
  6. It saved a proxied client 5 seconds per join and cost a residual with no
  recovery path, since a cached verdict is consulted before any connection is
  attempted and therefore cannot be corrected by anything received. Re-adding
  it is additive if the wait grates in practice; the shape to re-add is
  read-time TTL evaluation against a stored conclusion time, not a stored
  expiry, so that lowering the knob takes effect on entries already written.
- **Two tabs on the same room resume as the same participant**: recorded, not
  fixed. The session cookie is path-scoped to the room, so a second tab sends
  the same token, resolves to the same `userId`, and `joinUser` replaces the
  first tab's `ref`. Today the displaced tab goes silently stale for good;
  under bounded mode the two alternate, each showing state up to one cycle
  old, because every reconnect re-registers and displaces the other. Neither
  is caused by this design and neither weakens section 4's ordering argument
  (each tab is its own JS context), but bounded mode changes the symptom
  enough to be worth an entry. The fix is identity per connection rather than
  per session token, which is a session-model change well outside this scope.
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
- **A kill switch for bounded mode** (`SSE_BOUNDED_ENABLED`, surfaced to the
  client so it skips detection): considered and rejected, recorded because it
  is the obvious thing to reach for and the reasoning against it is not
  obvious. A flag would protect against two things. The first, bounded mode
  failing for the customers it targets, is not a risk at all: those clients
  cannot connect today either, so a bounded mode that does not work leaves
  them exactly where they are. Spending a config value and a `JoinResponse`
  field to be able to revert to an identical outcome buys nothing. The second,
  a healthy client misdetected into bounded mode, is real but small and
  self-limiting: with no detection cache the misdetection lasts one page load.
  A feature-wide switch is the wrong instrument for it anyway, since it can
  only be thrown by an operator who has noticed, it disables the fix for
  everyone including the clients that need it, and it does nothing about the
  trigger. The visibility guard in section 6 addresses that trigger directly
  and at the source, which is where the effort belongs. If bounded mode ever
  does need disabling wholesale, reverting PR 4 is the honest way to do it.
- **A minimum dwell before a bounded connection may close on send**: designed
  but not built, and the trigger for building it is named rather than left to
  judgment. It is the response to assumption 8 under "Validating the proxy
  model": a path that strips `Last-Event-ID` makes every bounded reconnect
  resolve as behind, and bounded mode then runs at `SSE_BOUNDED_RETRY` instead
  of at the room's event rate, correctly and invisibly. A floor of a few
  hundred milliseconds between opening a bounded connection and closing it on a
  send caps that, and it is not the fixed hold-open window section 6 rejects,
  which was a deliberate wait applied to every cycle. Not built now because the
  condition is either present or absent for a given deployment and probe D
  answers which for the deployment that matters, so building it first would be
  paying latency on every cycle everywhere to hedge a question that is about to
  be settled. Worth knowing that no test can reach this: the stub proxy is a
  faithful reverse proxy and forwards the header, so the end-to-end suite
  exercises assumption 8 holding, exactly as it exercises assumption 5 holding.
  The logging in section 6 is the only thing that would show it in production.
- **Rate limiting on mutating endpoints**: still unaddressed, and no longer
  has an event-log-specific symptom to work around. See
  `docs/known-issues.md`.

## Testing

Extends the existing `RoomSpec`/`SSESpec`/`BackpressureReconnectSpec` pattern
(see `2026-08-24-sse-backpressure-design.md` for the established style).

**Server, in ScalaTest:**

- `publish` increments `version` exactly once per state change and sends to
  every current user. Successive publishes produce strictly increasing
  versions. No snapshot ever carries version 0, on any path.
- The no-op guard: `ShowVotes` on an already-revealed room, `ClearVotes` on a
  cleared one, and a `Vote` repeating the voter's current estimation each
  leave `version` untouched and send nothing, while the same commands against
  a room they do change publish normally. This is the property bounded mode's
  request amplification depends on, so it is asserted on the version rather
  than only on the absence of a message.
- The no-op guard's own failure case, which is the one an implementation is
  most likely to get wrong: a participant changing their vote from one value
  to another *before* reveal does publish. `voted` is already true and both
  estimations are redacted out of every other participant's snapshot, so a
  guard comparing redacted snapshots would call this unchanged and the voter's
  own client would never see its new value.
- `RoomSnapshot.of` never serializes a session token or an `ActorRef`. Asserted
  against the encoded JSON rather than the case class, since the risk is a
  future `deriveEncoder[User]`, and this is the test that catches it.
- Redaction: in an unrevealed room, each recipient's snapshot carries their own
  estimation and an empty string for everyone else, while `voted` stays true
  for all of them; once revealed, every estimation travels to everyone. The
  negative case is the one worth writing carefully, since a snapshot built for
  the wrong recipient would still look plausible: assert against the encoded
  JSON that another participant's estimation string does not appear anywhere in
  it.
- `hasEstimation` survives redaction, which is what keeps the participant
  table's `shield-off` icon rendering: in an unrevealed room every voter's
  entry reports `hasEstimation: true` alongside its blanked `estimation`. Its
  pair is the state where `hasEstimation` and `voted` disagree, which is the
  only reason the field exists: after `reVote()`, every previously-voting
  participant reports `voted: false` and `hasEstimation: true`. A test asserting
  only the first case would pass against an implementation that derived the
  field from `voted`.
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
  distinct branch. Its fifth case is a resume carrying no `Last-Event-ID` at
  all, which also receives a snapshot: correct, and worth pinning as its own
  case rather than folding into "behind", because it is the state a path that
  strips the header puts every reconnect into (assumption 8), and a reader
  finding this test later should find it named.
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
- Problem D part 1's TTL, and specifically the interaction that makes it safe:
  a session past `SSE_SESSION_TTL` whose user has been removed resolves
  `Unresolved` and is dropped from the map, while a session past the TTL whose
  user is still present resolves through the `users` branch. The second case is
  the point of keeping that branch and is the one a "resolve against `sessions`
  alone" implementation would fail, so it needs to be written as its own case
  rather than folded into the first.
- Problem D part 2: `Leave` for a connection whose `User.bounded` is true
  schedules at `boundedGracePeriod`, an unbounded one at `gracePeriod`; a
  resume carries the incoming connection's flag, not the replaced entry's.
- Problem E: `revealed` is set by `ShowVotes` and cleared by `clear()` and
  `reVote()`, and `isRevealed` appears in the snapshot. Four cases, and the
  first two are the ones that would otherwise be lost silently:
  - Auto-reveal is preserved: the last participant to vote makes the snapshot
    report `votesRevealed: true` with nobody having pressed Show, and every
    estimation travels on that same snapshot because redaction keys off the
    same value.
  - A participant joining a room revealed by `Show` does not un-reveal it,
    which is the case the stored flag exists for. Its neighbour is a
    characterization test rather than an assertion of desirable behaviour and
    should say so in its name: a participant joining an *auto*-revealed room
    does un-reveal it, and the last non-voter leaving does reveal, both
    preserving today's semantics. These are the two cases the latched-reveal
    item in `docs/roadmap.md` would change, so they are the tests that are
    meant to fail and be rewritten when it is picked up, and their names
    should point at it.
  - A `Show` pressed while the room is already auto-revealed still publishes
    and still records the flag, so a later joiner does not hide the votes.
    This is the case section 2's `visibleState` carries its stored-flag term
    for, and it fails against a guard that compares only what travels.
  - `Show` pressed while one participant had not voted reports
    `votesRevealed: true`, which is the case a client-side `allVoted()` derivation
    gets wrong.
  - `reVote()` on a room that auto-revealed reports `votesRevealed: false` again,
    since `voted` is cleared and nothing stored says otherwise.
- **Three existing `RoomSpec` tests assert expectations this design
  deliberately inverts** and need updating as part of it, not treating as
  failures to work around. `"swallow a Leave entirely if the same user
  reconnects within the grace period"` (`RoomSpec.scala:170`) and `"ignore a
  stale leave from a ref that already got replaced by a reconnect"`
  (`RoomSpec.scala:265`) both assert that a reconnect produces a `Join`
  broadcast to bystanders, which section 3 suppresses; both invert. The
  latter's comment about exercising the stale-ref guard also stops being true,
  since the stale `Leave` is now dropped without scheduling. `"reset the grace
  period if Leave is called twice for the same connection before it elapses"`
  (`RoomSpec.scala:201-206`) still passes, but its comment documents the
  `(userId, ref)` keying and the "RoomManager calls Leave at most once per
  connection" assumption, both replaced.
- **`RoomManagerSpec` needs updating too, and it is the easiest of these to
  miss because nothing about it is behavioural.** `ConnectToRoom` gains
  `lastKnownVersion` and `bounded` (sections 3 and 5), and that message has six
  references in `RoomManagerSpec`: two direct sends
  (`RoomManagerSpec.scala:49-50`), one more at line 70, and two `expectMsgPF`
  patterns that destructure it positionally
  (`RoomManagerSpec.scala:159,184`, e.g.
  `case RoomManager.ConnectToRoom(rId, uId, name, tok, _)`). All of them stop
  compiling. The two patterns should assert the new fields rather than widen
  to `_`, since `SSE.source` passing the parsed `Last-Event-ID` and the mode's
  `bounded` flag through to `ConnectToRoom` is exactly the wiring section 3
  and Problem D part 2 depend on, and nothing else covers it end to end.
- A heartbeat carries no `id:`, so an unbounded connection idle across several
  heartbeats still reconnects with the last snapshot's version and resolves as
  caught up rather than being published a redundant snapshot. This is the SSE
  specification's behaviour rather than this code's, which is precisely why it
  is worth pinning: nothing in the diff would show it breaking.
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
- A bounded cycle that closes at its wall-clock cap with nothing to send emits
  no frame at all, and therefore carries no `retry:` hint. Paired with the
  case that makes that harmless: a connection carrying no `Last-Event-ID`
  always receives a snapshot, so every new `EventSource` object gets the
  `retry:` value on its first cycle. Two cases rather than one, because the
  first alone reads as a defect and the second is what makes it not one.
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
  accepts zero; plus positivity checks, including that
  `SSE_BOUNDED_DURATION_JITTER` accepts zero where the rest, `SSE_SESSION_TTL`
  included, reject it.

**Client, under `node --test` against `connection.js` and `applySnapshot`,**
with injected timers, a fake `EventSource`, a fake `rejoin`, and a settable
`document.visibilityState`, no dependencies. `applySnapshot` needs no doubles
at all, since it takes a plain `prev` and returns a plain object. Before the
section 6 extraction none of this was testable, since `index.html` is a single
CDN-loaded page with no runner or build step.

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
- `votesSummary` is derived and ordered by descending count, and counts only
  participants the server reports as having voted, so a room revealed with two
  stragglers has no empty-string bucket and cannot report `""` as the most
  voted estimation. Paired with the case that makes the change safe: a room
  revealed with nobody having voted produces an empty `votesSummary` and the
  template's `votesRevealed && votesSummary.length` guard keeps
  `votesSummary[0][0]` from being evaluated.
- `votesRevealed` comes from the snapshot rather than from an `allVoted()`
  derivation, so a revealed room with an unvoted straggler renders revealed,
  and a room where the last participant has just voted renders revealed
  without anyone having pressed Show. The second is auto-reveal end to end
  through the client and is the case that would silently disappear if the
  server-side derivation were dropped.
- **The `editing` guard**: a snapshot arriving with `prev.editing` true
  returns `prev.currentIssue` unchanged, and one arriving with it false returns
  the snapshot's. This is the regression that snapshot-only introduces and the
  test that pins the fix.
- `inRoom` is set by the first snapshot and is not reset by later ones.
- `applySnapshot` mutates neither of its arguments. Worth one assertion rather
  than being left to the absence of other tests, since the pure shape is what
  section 6's immutability rule requires and the natural thing to write while
  editing it is an assignment into `prev`. Freeze both arguments in the case
  and the violation throws.
- A heartbeat frame (empty `data`) is ignored rather than parsed, so an idle
  unbounded connection does not throw on `JSON.parse("")` every
  `heartbeatInterval`. This replaces `index.html:398`'s guard, which moves
  into the module, and it is worth its own case because the failure is silent
  in the sense that matters: it happens only when nothing is going on, so it
  would not show up in any test that exercises the room.
- Applying a snapshot with a lower version than one already applied still
  overwrites, confirming there is no version guard. This is a
  characterization test, pinning the decision recorded in section 4 rather
  than asserting desirable behaviour, so it should say so in its name; if a
  guard is ever added, this is the test that is meant to fail and be replaced.
- The connecting spinner clears on both the success path (first snapshot) and
  the hard-failure path (`onerror` with a closed `readyState`), and is not
  shown for a bounded reconnect legitimately waiting out its cap.
- The error banner debounce: `showError` is not set on the first one or two
  consecutive non-CLOSED `onerror` events, only at the threshold; `onopen` and
  `onmessage` both reset the counter, so a routine bounded cycle never shows
  the banner; the CLOSED branch is immediate and undebounced.
- The one-shot re-join, driven through an injected `rejoin` double: a CLOSED
  `onerror` calls it once and shows no banner; a second with no successful
  message in between shows the banner and does not call it again, which is the
  loop the `SECURE_COOKIES` case would otherwise produce; any successful
  message resets the flag. The reopened connection sends no `Last-Event-ID`,
  keeps whichever mode `sseBounded` holds, and adopts the config `rejoin`
  resolved with rather than the one the module was constructed with. Its
  failure case is its own: a `rejoin` that rejects surfaces the join-failed
  state and does not leave the client waiting on a connection that will never
  be opened.
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
- **The visibility guard, on both timers.** A first connection constructed
  while `document.visibilityState` is `hidden` arms no timer and never
  switches, however long it receives nothing; the same connection arms
  normally once the document becomes visible. An unbounded `onerror` while
  hidden arms no re-detection timer. And a timer already armed on a visible
  document is cleared when the document becomes hidden, rather than left to
  fire against a browser that stopped delivering. That third case is the one
  a naive implementation misses, since guarding only at arming time still
  lets a tab backgrounded one second later switch on a stale timer.
- The module writes nothing to `localStorage` and reads nothing from it, so
  `createConnection` runs with no `storage` at all. Worth one assertion rather
  than being left to the absence of other tests, since it is what keeps
  `doLeave`'s `localStorage.clear()` correct without a classification rule.

**End-to-end, in a real browser through a stub buffering proxy.** This layer
exists because nothing above can reproduce the failure the design is built
around: it needs a proxy that withholds a response until it completes and then
kills the connection at its own deadline. The stub, the harness and the
Playwright suite are all in scope; CI integration is not.

**The stub and the harness land first, in PR 0b, ahead of the design work
rather than after it.** Neither depends on anything this spec changes: the stub
forwards and buffers HTTP, and today's unbounded SSE stream is already what
makes it fail. So the first case below can be written and run against the
current code, which turns the customer's report into a local reproduction
before any fix exists. The remaining cases assert behaviour that does not exist
yet and stay in PR 5.

The stub, the harness and the fixtures are designed in
`docs/superpowers/specs/2026-08-30-e2e-testkit-design.md` and delivered by
PR 0b. In outline: the stub is a plain Node reverse proxy, no TLS and no
`CONNECT`, that forwards every request upstream and buffers the complete
response, headers included, releasing nothing until it ends, and destroys the
downstream connection having sent nothing if the response has not completed
within a deadline read from `SSE_ASSUMED_PROXY_TIMEOUT`. A control endpoint
switches buffering at runtime, which is what makes re-detection testable end
to end, since a browser cannot change origin mid-session. The harness runs the
staged app under a test profile whose timings are scaled roughly seven times
down, not the order of magnitude assumed here, because
`SSE_DETECTION_TIMEOUT` at 500ms would false-positive on machine jitter.

Two corrections to what this section previously said, both made there. The
reusable piece is the *harness*, not the stub: "start this app with a known
configuration and drive it in a real browser" is what the Phase 3 migration
inherits, while the stub simulates one hostile network condition that only
bounded mode cares about and has no second use if bounded mode is ever
removed. So the stub is a fixture a case opts into rather than something the
harness assumes. And the reproduction needs no browser at all: it is an
`http.request` through the stub, so it runs under `node --test` in about a
second and gates every CI push, while only the browser cases need Playwright.

- **Stub fidelity, asserted without the app's client at all.** Requesting
  `/rooms/:id/events` through the stub yields zero bytes for the full deadline
  and then a destroyed connection. This proves the stub reproduces the
  customer's report, and it has to come first: every case below is only
  meaningful if it holds. It is also the only case here that passes against
  today's code, which is why it ships in PR 0b as a reproduction rather than in
  PR 5 as a test.
- **The premise.** Loading the page through the stub and joining a room
  reaches the room view: detection fires, bounded mode engages, the snapshot
  arrives. This single case is what bounded mode exists for, and it is
  currently verified by reasoning alone.
- **Two browsers exchanging a vote, run in both stub modes.** Through the stub,
  one votes and the other sees it within a bounded cycle. In pass-through, the
  same case on the unbounded path. Both matter, and the second is the one this
  suite would otherwise be missing: PR 1 changes what *every* client receives,
  proxied or not, so the largest regression surface in the plan belongs to
  users who will never see bounded mode. Without a pass-through variant the
  end-to-end evidence for them is a smoke case, while the minority the design
  exists for gets seven. The stub already starts in pass-through and its mode
  is a per-test fixture, so this is a parameter rather than new machinery, and
  the same applies to the auto-reveal case below.
- Reveal with a straggler still unvoted, then a third client joins and sees
  votes revealed. Problem E through the real path, in the one configuration
  where a client-side derivation cannot mask the bug. The joiner arriving
  without un-revealing the room for the other two is the second half of the
  same case and is asserted in the same test, and it holds because `Show` was
  pressed rather than because the room auto-revealed.
- Two browsers, both vote, and both see the votes reveal with neither pressing
  Show. Auto-reveal through the real path, which is the behaviour most at risk
  of being lost in this rewrite and the one no unit test can confirm is still
  wired to the screen. Run in both stub modes for the reason above; a rewrite
  that silently drops auto-reveal drops it for everyone, not only for clients
  behind the proxy.
- A client left idle across several bounded cycles stays in the room, with no
  participant flicker in the other browsers. Problem D's grace period and
  Problem C's timer keying, observed rather than unit-asserted.
- Re-detection: a client connected while the stub is in pass-through mode
  recovers after buffering is switched on mid-session, without a reload.
- **A healthy client backgrounded through a connection drop stays unbounded**,
  which is the visibility guard end to end and an assertion rather than a
  measurement. With the stub in pass-through mode, backgrounding the tab and
  dropping its connection must not produce a `?bounded=1` request, however
  long the tab stays hidden. This is the false positive that would otherwise
  feed the residual measured in the next case, so it is worth proving through
  a real browser's own throttling rather than against injected timers alone.
- **A solo client backgrounded across several bounded cycles, a measurement
  rather than an assertion.** This one puts the client in bounded mode
  deliberately (stub buffering on) rather than by misdetection. Whether the
  tab's reconnects are throttled past `SSE_BOUNDED_GRACE_PERIOD` is the open
  question behind Problem D part 1's solo residual, and reasoning cannot
  settle it. If they are, the room is
  reaped and the client recovers through the one-shot re-join with no user
  action. If they are not, the client simply stays. Both are passes; the case
  exists to record which happens, since that is the input that would justify
  revisiting room lifetime.

## Delivery

Seven PRs, two of which come ahead of the design work: one is a gate rather
than a step, the other is a reproduction rather than a fix. Unlike the
superseded design, no PR here is ordered by the *protocol*: `Reset` and Problem
D part 3, the two things that forced an ordering there, no longer exist. What
ordering remains is structural rather than semantic. One chain,
0b -> 3 -> 4 -> 5, where each link supplies infrastructure the next one builds
on (the node runner, then the extracted module, then bounded mode); PR 1 before
1b and 1c, which extend the snapshot it introduces, and before 4; and PR 3
after 2, since its module tests cover the behaviour that exists once retained
sessions land. Everything else is free: 1b, 1c and 2 are independent of each
other, and PR 0 is independent of all of it.

**PR 0: proxy probe.** The env-gated route and page from "Validating the proxy
model", default off, roughly 140 lines and no tests beyond a smoke case. It
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

**PR 0b: the stub buffering proxy and the end-to-end harness, with the
customer's failure reproduced and nothing else.** Designed in full in
`docs/superpowers/specs/2026-08-30-e2e-testkit-design.md`: the stub, the
harness, the Playwright fixtures, `package.json`, the `node --test` plumbing
and the CI node step (all of which PR 3 previously carried), plus the stub's
own unit tests, the browser-free reproduction of the customer's failure, and
one pass-through browser smoke case. Roughly 220 lines and 110 of tests.

This is carved out of PR 5 and moved to the front deliberately. Today the
customer's failure exists only as a report; the first case above turns it into
something that fails locally on demand, which is the thing you normally want
before writing a fix rather than after. It also has no dependency on any of
the work below: the stub forwards and buffers HTTP, and today's unbounded SSE
stream is already the input that makes it fail. Leaving it inside PR 5 puts
the only reproduction of the target bug in the last PR of the set, which is
also the one most likely to be squeezed.

It does not substitute for PR 0 and does not weaken it. The stub is built to
Problem's description, so it demonstrates that the design answers the modelled
failure, not that the model matches the customer. The two are complementary in
a specific way: PR 0's measurements are the stub's parameters, so a probe
result lands as a configuration change here rather than a rewrite.

**PR 1: the snapshot protocol, plus Problems A, C and E.** Sections 1, 2, 3, 4
and 7, and the three `RoomSpec` updates. Roughly 185 lines of source added and
about 150 deleted (`RoomEvent.scala` in full, `setupNewUser`, and the 75-line
client handler block), with roughly 210 of tests. Two pieces inside it are
easy to mistake for polish and are not: the server-side `isRevealed`
derivation, without which auto-reveal silently disappears from the product,
and the no-op publish guard, which stays here rather than moving to PR 4
because it is a property of `publish` itself and deferring it would mean
editing all seven call sites twice for three lines. This is the PR that
replaces the protocol, so it is the largest behavioural change in the set and
the one worth reviewing most carefully, but its diff is unusually readable for
its size because most of it is deletion. It is independent of bounded mode and
releasable on its own: it fixes two live correctness gaps, removes the
`MessageType` companion trap, and gives Phase 4 real reveal state.

**Sections 1 and 4 show the finished code, and PR 1 ships neither block
verbatim.** Both are split across this PR and its two followers, so
implementing either as printed produces a broken intermediate commit. Here
`RoomSnapshot.of` takes only `data`, with no `forUser` and no `hasEstimation`
(PR 1b adds both), and `applySnapshot`'s tally keeps today's count-every-user
shape rather than section 4's voted-only one (PR 1c changes it). The tally is
the one that actually bites: counting every user is exactly what guarantees a
non-empty `votesSummary`, so shipping the voted-only tally here without PR 1c's
`votesRevealed && votesSummary.length` guard makes `votesSummary[0][0]` throw
on a room revealed with nobody having voted. The two changes are a pair and 1c
carries both.

**PR 1b: pre-reveal vote confidentiality.** Section 1's per-recipient
redaction: `RoomSnapshot.of(data, forUser)` withholding other participants'
estimations until the room reveals, and `publish` building one snapshot per
recipient. Roughly 20 lines of source and 50 of tests. Split out of PR 1
because it is a confidentiality fix rather than a protocol change, it is
pre-existing rather than introduced here (today's `Vote` broadcast leaks the
same way), and it wants a reviewer thinking about what is on the wire rather
than about how state is shaped.

Almost server-side, and the exception is the point of listing it: redaction
empties the field `showUserEstimation` reads, so this PR also carries
`Participant.hasEstimation` and the one-line method change in section 4. That
is the whole client half, and it is here rather than deferred because a PR that
blanks a field has to carry every renderer of that field with it. PR 1 ships
`RoomSnapshot.of(data)` with no `forUser` and no `hasEstimation`, since neither
has a consumer until redaction lands.

**PR 1c: vote summary correction.** Section 4's voted-only tally and the
`votesRevealed && votesSummary.length` template guard. Roughly 5 lines of
source and 25 of tests. Client-side only, independent of 1b, and its own PR
because it is the one change in this set a user would notice as a *different
answer* rather than as better plumbing: the summary stops counting people who
have not voted, so a revealed room with stragglers no longer offers an empty
estimation as its most voted one.

**PR 2: retained sessions.** Problem D part 1, including its TTL and the
retained `users` fallback in `ValidateToken`. Roughly 55 lines of source and
100 of tests. Server-side only, and deliberately its own PR: the token-lifetime
widening, the leave-then-reload behaviour change and the silent vote loss on a
grace trip all belong in front of the reviewer approving that behaviour,
rather than folded into a PR whose pitch is that it carries no such thing.

**PR 3: extract the client connection logic.** Section 6's "Implementation
shape", the static asset route, and module tests covering the behaviour that
exists after PRs 1 and 2. Roughly 200 lines moved and 180 of tests, with no
behaviour change. Two of those lines are not a move: the injected `rejoin`
replaces a direct `doJoin` call, and section 4's `applySnapshot` becomes pure
with the page taking over the assignment. Both are shape rather than
behaviour, and both are here rather than in PR 1 because the module boundary
is what forces them. `package.json` and the CI node step are no longer here:
PR 0b needs them for the harness and introduces them, so this PR adds
`node --test` cases to a runner that already exists. Worth protecting as its own
PR: its diff reads as a relocation and reviews in minutes, and keeping it out
of PR 4 means PR 4 is entirely new logic rather than a mixture of moved and
new code. This is where PR 0's gate applies, since it is the first PR whose
only justification is the proxy work.

**PR 4: bounded mode.** The rest of section 6, server and client, plus Problem
D part 2, the `Mode` ADT, the config invariants and the logging. Roughly 250
and 260, down from the superseded design's shape because the detection cache
and its TTL are gone. If this reads too large in practice it has a clean
internal seam:
server-side bounded mode first, verifiable in ScalaTest by requesting
`?bounded=1` directly, then client detection and mode switching over it.

**PR 5: end-to-end behaviour cases.** The rest of the Playwright suite, on the
stub and harness PR 0b already delivered: bounded mode engaging, two browsers
exchanging votes across cycles, reveal with a straggler, auto-reveal, idle
survival across cycles, re-detection after buffering is switched on
mid-session, the visibility guard, and the backgrounded-solo measurement.
Roughly 60 lines and 170 of tests, down from the original shape because the
infrastructure landed first. CI integration is deliberately not here.

**PRs are not releases, and PR 0 is the one that has to release on its own.**
Its whole value is being run through the customer's network, so landing it is
not the deliverable: it has to reach the deployment that customer already
points at, alone and before anything else here, with the probe env var turned
on for as long as the measurement takes and off again afterwards. Nothing needs
hosting for this. The probe is a route in the ordinary Pekko server, in the
ordinary binary, default off everywhere, which is what makes the request
traverse the identical path.

PRs 0b, 1, 1b, 1c and 2 are independent of the proxy work and can release as
soon as they land. PRs 3, 4 and 5 release together, with the Playwright suite
passing before that release reaches the customer this spec exists for, since
that suite is the only thing exercising the failure being fixed.

**That release has a verification step, and it is the same person as the
probe.** Whoever runs PR 0's probe from inside that network opens the app
afterwards and joins a room, which is the only evidence that exists for the
thing this whole spec is for. Ask for both in the same conversation rather than
returning months apart: the probe is the measurement and this is the
confirmation, and the second is worth nothing to schedule if the first
established the contact. Record the result the same way the probe's is
recorded, since "we shipped it" and "it works there" are different claims and
only the second closes this work.

One caveat on that last clause, so it is not read as more than it is: the
suite exercises the modelled failure. It runs against the stub, which is built
to Problem's description, so it is exactly as good as PR 0's result and no
better. Green with the probe run means the design works against the customer's
proxy. Green with the gate waived means it works against what this spec
believes the customer's proxy to be, which is a weaker claim and should be
reported as one.
