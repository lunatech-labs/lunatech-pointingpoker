# Protocol Target Architecture and Ordered Path

Date: 2026-08-31
Status: Proposed
Supersedes: `docs/superpowers/specs/2026-08-28-sse-snapshot-protocol-design.md`

## Purpose

The customer's connectivity failure that drove the 08-28 design has been
resolved by a whitelist on their Netskope appliance. The urgency is gone, so
this document does what a deadline made impossible: it re-derives the protocol
from the requirements instead of from the failure, decides the questions the
08-28 design had to take as given, and lays out an ordered path from today's
code to the result.

It answers two questions that were asked directly:

1. Should we still migrate to a snapshot protocol now that the proxy pressure
   is gone? **Yes**, and the case barely depends on the proxy. Roughly 40% of
   the 08-28 design survives, and the surviving part is the part that deletes
   code.
2. Would a from-scratch redesign, potentially on a new stack, be better than
   iterating? **No**, but the analysis was closer than expected and the
   reasoning is recorded below along with the conditions that would reverse it.

## What the whitelist changed

The whitelist removes the driver for the entire fallback half of the 08-28
design. Specifically dead: §6 bounded mode in full, the `Mode` ADT, the
`take(1)`/`takeWithin` stream shaping, retry jitter and its config invariants,
proxy detection and re-detection, the visibility guard, the proxy validation
ladder, and PRs 4 and 5 of its delivery plan.

Three consequences are easy to miss, and each one makes the surviving design
smaller:

**The `version` field loses every justification it had.** §3 of the 08-28
design justifies it explicitly by bounded mode: "a caught-up bounded connection
has to send *nothing* in order to stay open." With reconnects rare again,
answering every connect with a snapshot is correct and cheap. A second
justification appeared briefly while durability was under discussion (a
revision column for optimistic concurrency) and did not survive the decision
below that there is no store at all. No consumer remains, so the version,
the SSE `id:` field, the `Last-Event-ID` parsing and the four-case resolution
table are all dropped. This follows the same rule that keeps `roomId` off the
wire, and is a weaker statement than the one made about `issueLastEditBy` in
section 2, which is deleted from the model entirely rather than merely withheld.

One deferred consumer does exist, and it is recorded with the long-poll row
under "Deferred, with triggers" rather than here: a long poll needs a cursor, so
reaching that fallback means reintroducing a revision. It is live state
re-derived per session, which by the test in section 3 is exactly the kind of
field that is free to add on the day it is wanted and wrong to carry until then.

**The no-op publish guard goes with it.** That guard existed because under
bounded mode every version bump closed and reopened every client's connection,
so a `POST /show` loop became request amplification aimed at a scanning proxy.
Without bounded mode a redundant publish is N small messages over connections
that are already open. The guard cost a `visibleState` projection plus a
documented trap (stored `revealed` had to be compared even though it never
travels, or a Show pressed on an already-auto-revealed room was silently lost).
Dropping the guard removes the trap. The abuse concern it partly addressed
belongs to the rate-limiting entry in `docs/known-issues.md`, which is where it
is now recorded.

**Problem B was already unreachable and stays so.** Recorded here only so a
reader of the 08-28 design does not go looking for it.

What survives on independent merit: the snapshot wire format, the single
`publish` path, the pure `applySnapshot`, Problems A, C and E, the pre-reveal
vote confidentiality fix, the vote-summary correction, retained sessions with a
TTL, and the anti-buffering headers.

## Why the snapshot migration still stands

Every argument below was checked against the code rather than carried over.

1. **Two live bugs that only a snapshot makes unreachable.**
   `index.html:404` pushes on `init` unconditionally, and `:411-419` pushes on
   `join` for any id but your own. A transparent `EventSource` retry reuses the
   same JS object, so `ref.users` is never cleared while `setupNewUser` re-sends
   `init` plus one `join` per participant: every participant duplicates.
   Separately, that replay lists only present users and never says who left, so
   a participant who departed during the gap is never pruned. Applying complete
   state cannot duplicate, and an absent participant is absent.
2. **Reconnects did not go away.** Laptop sleep, wifi handoff, mobile networks,
   a deploy, and `OverflowStrategy.fail` at `SSE.scala:54`. The proxy was one
   cause among several.
3. **`OverflowStrategy.dropHead` becomes correct.** A superseded snapshot is
   safe to discard; a dropped event is unrecoverable. This retires the only
   reconnect the app inflicts on itself, which is what the 08-24 grace period
   exists to absorb.
4. **Reveal state on resync** closes as one derived Boolean, ending an open
   known issue.
5. **The pre-reveal vote leak is real and orthogonal to the proxy.**
   `Room.scala:144-148` broadcasts an estimation to every participant the moment
   it is cast; the client merely hides it. It reaches the wire in two places,
   there and `setupNewUser`'s replay, so the event protocol could fix it too.
   What snapshots add is that there is one place where state becomes wire, so
   redaction sits at a choke point a field added in a year cannot forget. Under
   events the audit is not two places once, it is two places per feature. See
   the projection argument in section 2, which is the same property applied to
   the session token.
6. **It is net deletion.** `RoomEvent.scala` in full, `broadcast`,
   `setupNewUser` and 89 lines of client handlers go; about 15 lines of
   `applySnapshot` arrive. Since the protocol lands before the frontend rewrite,
   that is 89 lines of Vue 2 the rewrite never has to port.
7. **Every roadmap feature becomes a field on the client.** Observer roles,
   latched reveal, a recorded outcome, an idle flag and voting scale are all
   state, so each is a field and `applySnapshot` grows no branch, without
   exception. Under events each is instead a message type plus a replay slot
   plus a handler plus a row in a reset table. Server-side most are a field plus
   a predicate, with two exceptions worth naming so the rule is credible: the
   idle indicator and the timer-based reveal also need a timer and publish on a
   transition nobody commanded. That does not favour events, which would need
   the timer as well as the message type. This is the strongest argument for
   settling the protocol first, and it holds in proportion to the roadmap it
   draws on, which is projections rather than commitments.

## Approaches considered

### Wire shape

The 08-28 design's comparison of snapshot-only against three event-based shapes
stands, including its measurement that a snapshot is roughly one third the size
of the replay burst it replaces, and its finding that the crossover favouring a
hybrid sits above roughly 20 to 30 participants. That analysis is not repeated
here. Snapshot-only remains the choice, and the escape hatch remains additive:
keeping the snapshot as the resync mechanism and adding incremental live pushes
later does not require touching the client's model.

### Rewrite versus iteration

Measured rather than assumed. Source excluding tests and the probe is about
1,600 lines, of which `index.html` is 577. The protocol layer specifically is
about 180 lines: `RoomEvent.scala` (65), `broadcast` plus `setupNewUser` (24),
two lines in `SSE.scala`, the client handler block (76) and the derivation
helpers (13). So the protocol is 11% of the source, and rewriting it does not
imply rewriting the application.

By the end of this path perhaps 200 to 300 lines of today's source survive, so
the honest framing is not iteration versus rewrite but **rewrite in place with a
working app at every step, versus rewrite greenfield**. Greenfield was rejected
because nothing in the current structure obstructs the target. One real
structural flaw exists, `User.ref` being a live connection handle inside
`RoomData`, and step 4 below sizes correcting it at roughly 140 lines of handlers
plus 100 of tests rather than a reason to start over. The
usual argument against rewrites (a long period with two codebases) is weak at
this size and was not the deciding factor.

### Stack

Considered seriously because in-house Scala expertise, while real, was described
as a soft rather than binding constraint given AI-assisted maintenance, and
because the CI turned out to be 50 lines of test-and-lint with no deployment
step at all. Clever Cloud takes `sbt`, `node` and `elixir` as first-class
runtimes with git-push deployment, so the platform does not constrain the
choice either.

**TypeScript end to end** was the leading alternative. Its case rests on one
shared protocol type across both halves, a single toolchain, and the deepest
ecosystem for AI-assisted work. Two of those weakened on inspection. tapir plus
`openapi-typescript` recovers most of the shared-types benefit from Scala,
enough that protocol drift becomes a build failure across the command endpoints;
the residual gaps are ADT-to-`oneOf` mapping, opaque-type schemas and the
`Option`/nullable mismatch, which are configuration rather than a wall, and
`RoomSnapshot` itself, which does not travel as an HTTP body at all and is
covered by the contract test in section 6 instead. And the claim that Node's
event loop removes the need for per-room serialization holds only for
synchronous mutation: any `await` inside a room method reintroduces
interleaving, which is the exact hazard an actor prevents by construction.

**Elixir with Phoenix** was the strongest framework fit. Channels, Presence and
PubSub supply as primitives four things these specs build by hand, and Channels
ship a longpoll fallback transport with automatic downgrade, which is precisely
the mitigation the 08-28 design named as the right fallback and declined to
build for want of a server-side wait primitive. Rejected because it leans
hardest on the AI-assisted-maintenance premise while being the ecosystem that
premise supports least, and is the least recoverable position if that premise
proves optimistic.

**Chosen: Scala 3 and Pekko, rewritten in place.** The decisive property is
where being wrong is silent. The protocol is 11% of the source, as measured
above, and close to all of the code whose defects do not announce themselves: a
missed command case, a credential reaching the wire, an unredacted estimate, a
field that means two things. The frontend is most of the lines and almost none
of that risk, because a mistake there is visible on the screen. So the type
system is bought for the small part, and Scala 3's is the better match for it:
exhaustive matching on a command ADT is a compile error, and
`opaque type SessionToken = UUID` (`Room.scala:14`) makes swapping a token for a
user id unrepresentable rather than merely unlikely. TypeScript's equivalents
are a discriminated union with an explicit `never` assertion people forget and a
branded type others cast through. Add no cutover, 1,434 lines of existing tests,
working CI and the deepest available expertise, against one toolchain and
ecosystem depth. Accepted costs: two toolchains once the frontend gains a build,
and the Clever Cloud runtime consequence recorded under "Accepted costs" below.

Performance did not enter the decision. The JVM remains the stronger runtime
under high load, but this workload is on the order of 200 concurrent SSE
connections, a heartbeat every 15 seconds, snapshots of 418 bytes at three
participants and 2,112 at twenty, and a few clicks per person per minute. Both
runtimes idle. To the extent performance ever mattered it would favour staying.

### Transport

SSE plus HTTP POST is kept. The roadmap's original reason for leaving WebSocket
holds up, and an earlier draft of this section wrongly said it did not, on the
strength of `WS.handler` minting a `userId` server-side per connection. It did,
but that value only ever reached `Join` and the teardown signals: every
client-originated command carried its own `userId` (`userId: this.user.id` on
each outgoing frame), `WS.sink` parsed the frame straight into
`IncomeWSMessage`, and `RoomManager` routed it to `Room` without comparing it to
the minted value. The two transports were equally spoofable, so the claim that
the security fix wanted discrete calls with per-request validation stands.

What is fair criticism is narrower: the swap created problems of its own, and
this design is still paying for two of them. The 08-18 note records the first,
that `userId` travelled in the query string of every request into access logs and
browser history, which the cookie work then fixed.

The second was never recorded anywhere. Under WebSocket each tab held its own
socket with its own server-minted `userId`, so two tabs on one room were two
participants. Under a cookie scoped to the room they collapse onto whichever
token was written last, so one tab's clicks are silently credited to the other.
The 08-20 design examined two tabs on *different* rooms, where path scoping works
correctly, and the same-room case fell in the gap beside it. Section 4 restores
the original behaviour.

WebSocket would return two things this design buys back by hand: command
ordering and instant leave detection, paid for in section 4's sequence number
and explicit leave endpoint, roughly 45 lines between them. A socket would also
carry a per-connection identity for free, where a cookie needs its path scoped to
get one; section 4's `:tabId` is that scoping, and it lands the same outcome,
including two tabs being two participants.

Forty-five lines is still cheaper than reversing the transport, and the read side
is one-way fan-out while the write side wants ordinary HTTP semantics, which is
what the ask pattern needs. **Reverses if** we ever need low-latency bidirectional
interaction at many events per second, and that reversal is a real option rather
than a formality: the snapshot protocol is transport-agnostic, so `publish`,
`RoomSnapshot` and `applySnapshot` all survive it. What is SSE-specific is
`Source.actorRef` with `dropHead`, the anti-buffering headers and the
`EventSource` client code.

## Target architecture

### 1. Transport

SSE for server-to-client push on `GET /rooms/:slug/:tabId/events`, one connection
per participant, authorized by the tab-scoped session cookie described in section
4. HTTP POST for commands, on the ask pattern, returning real results rather than
an unconditional `204`.

**The `tabId` in the path is not a return to the 08-20 exposure**, which is worth
saying because it looks like one. That was `userId`, the identity itself,
travelling in navigable URLs into browser history and access logs. A `tabId` is a
path discriminator with no authority: it never reaches the address bar, since the
page is served at `/:slug` and the id is generated after load, so only XHR and
`EventSource` requests carry it. Forge someone else's and you still lack their
cookie, so the answer is 401.

The SSE response carries `Cache-Control: no-cache` and `X-Accel-Buffering: no`,
and `README.md` gains a deployment note on proxy buffering. This closes the
"SSE reverse-proxy buffering is undocumented" known issue and protects against
proxies other than the whitelisted one.

### 2. Wire format

One message type, complete state, built per recipient.

```scala
final case class RoomSnapshot(
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
```

`Participant` is a deliberate projection rather than the domain member type. A
derived encoder over a type carrying the session token would put every
participant's credential on the wire to every other participant, which is a leak
the event protocol cannot express. The projection makes it unrepresentable.

**Built per recipient.** Another participant's `estimation` is `""` until the
room reveals; the recipient always sees their own, which is what
`ownVoteConfirmed` needs. The number of `asJson` calls is unchanged, since it
already runs once per connection, though each one now serializes a whole snapshot
rather than one event: a single vote goes from N frames of roughly 140 bytes to N
of 418 to 2,112. Construction becomes O(N^2) per publish against O(N) today. All
of it is noise at a team's size, and the O(N^2) term is the one that would grow
first if very large rooms ever arrived.

**`hasEstimation` exists because redaction would otherwise change what the table
renders.** `showUserEstimation` (`index.html:556-558`) reads the estimation
string to drive the hidden-value icon, and blanking other participants'
estimations makes that predicate false for everyone but the recipient. The field
is computed from the unredacted value so the table renders exactly as it does
today. Against the state model in section 3 that is the entry existing in
`round.estimates` at all, where `voted` is that entry's `confirmed` flag; the two
coincide except in the re-vote state, which is the whole reason both fields are
here.

**The wire name is `votesRevealed`, not `revealed`.** The stored flag means
"Show was pressed"; the wire field is the derivation that also covers
auto-reveal. Naming both `revealed` would put two meanings one field access
apart. The wire name also matches what the client already calls it.

Not on the wire: `version` (no live consumer, see above), `roomId` (the client
opened the connection), and voting `scale` or participant `role` (see
"Demonstrated but not built").

`issueLastEditBy` is **deleted outright rather than merely withheld**, which is
a stronger statement than the 08-28 design made and worth being explicit about.
Its only consumer was `setupNewUser` deciding whether to synthesize an
`EditIssue` frame, and that replay goes at step 1, so the field has no reader
left anywhere. It is absent from `RoomState` below for that reason and not by
oversight.

The SSE source's element type becomes `RoomSnapshot`, so `.mapConcat(identity)`
(`SSE.scala:67`) is removed. A snapshot is atomic by construction, so there is
no batching discipline to state. `OverflowStrategy.fail` becomes `dropHead`.
Heartbeats stay data-free and the client keeps ignoring them, a guard that moves
into the connection module at step 8.

**`bufferSize` stays 1, and its justification is replaced rather than kept.**
Today's comment (`SSE.scala:19-27`) reasons entirely in terms of `fail`: 1 covers
two ordinary actions landing close together, and a larger coincidence falls
through to a failure that self-heals via reconnect and replay. Under snapshots a
superseded element is *meant* to be discarded, so the buffer holds one snapshot
that the next publish replaces, and anything larger only stores staler ones.

**The `bufferSize = 0` trap must survive that rewrite, because `dropHead` makes
it quieter.** A zero-size buffer special-cases to an unconditional silent drop
that never consults the strategy, which under `fail` meant a stream that never
failed when it should have, and under `dropHead` means a client that receives
nothing after the first in-flight element, with no failure and therefore no
reconnect. It is the one 08-24 finding whose consequence gets worse here, so it
is the last thing to delete alongside the strategy it currently explains.

One deletion follows: overflow no longer fails the stream, so
`ConnectionFailure`'s `BufferOverflowException` branch and its
self-healing-path rationale (`RoomManager.scala:147-155`) become unreachable and
go at step 1, leaving the generic error log as the whole handler.

**Demonstrated but not built: `scale` and `role`.** Both were checked against
this design and both fit as additive fields, `scale` as a pure rendering input
and `role` as a field plus one change to the auto-reveal predicate. The
demonstration is the point; shipping the fields is not. A field with no consumer
does not travel, which is the same rule that dropped `version`. Voting scale is
therefore deferred out of Phase 2 rather than delivered with it, on the
product owner's own second thoughts about whether the feature is wanted. Nothing
about waiting makes it harder: the server performs no validation on estimation
strings today, so adding scale later is a column with a default, an additive
wire field, an optional `create-room` body field and a client render change, on
the order of 30 to 40 lines with no protocol break and no data migration.

`scale` is not purely a rendering input in one respect worth noting, since it is
the only thing that gives an estimation an ordinal. Any feature that ranks votes
rather than tallying them, Phase 4's highlight-lowest-and-highest and a
by-vote participant ordering among them, needs that ordinal, and until `scale`
exists the client's hardcoded `estimationValues` order supplies it by index.
That is fine, and it is where those features draw from, so they move to the
scale field when it lands rather than acquiring a rule of their own.

**Named as an extension point, not built:** a second SSE event type for
transient non-state notification, such as a toast or a typing indicator. Every
roadmap item checked turned out to be state, so nothing needs it yet.

### 3. Room state

All state is in memory and nothing is persisted; the reasoning is under "No
durable storage" below. The structural rule: **no connection handle appears in
the room's own state.** Today `RoomData.users` is a `List[User]` whose `ref` is
the live SSE connection, which is the one part of the current design that cannot
carry forward. It splits three ways:

```
RoomState   slug, createdAt, currentIssue, round: Round, history: List[RoundRecord]
Round       id, estimates: Map[UUID, Estimate], revealed
Estimate    value: String, confirmed: Boolean
members     Map[UUID, Member]     // Member(name, token, lastSeq); lastSeq arrives at step 6
connections Map[UUID, ActorRef]   // the only place a connection handle lives
```

**`Estimate` carries `confirmed` because a bare `Map[UUID, String]` cannot
express the re-vote state.** `reVote()` clears `voted` and keeps `estimation`
while `clear()` clears both (`Room.scala:85-89`), so "has an estimation, is not
counted as voted" is a state the current code holds and the wire format
distinguishes as `voted` against `hasEstimation`. Collapsed into one predicate,
three things break at once: `ownVoteConfirmed` in section 5 is always true and
the unconfirmed-button styling never appears, `everyMemberHasVoted` stays true
through a re-vote so auto-reveal never switches off, and `showUserEstimation`
changes which rows show the shield icon. So `voted` on the wire is
`confirmed`, `hasEstimation` is the entry existing at all, `reVote` sets
`confirmed = false` across the map, and `clear` empties it.

`round.revealed` is cleared by both `clear` and `reVote`, which is the other
half of what the client does client-side today and has to move with the
derivation.

`history` is the within-session round record, specified under "Round history"
below. The rule forbids a connection handle anywhere in this group, which is why
`connections` is separate and why nothing here is a `List[User]`. It survives the
absence of a store: the reason to keep connection handles out of the room's state
is that they are the one thing that cannot be reconstructed or reasoned about
independently, not that something is going to be written to disk.

`members` is room membership and survives the grace period, so the participant
list does not flicker on a transient drop. `connections` exists solely to send
to. `round.estimates` is keyed by user id and is independent of both.

A snapshot is a join: a participant appears because they are a member, and their
estimate comes from the round.

**That join makes Problem A unrepresentable rather than fixed.** Vote loss on
reconnect exists today because `RoomManager.ConnectToRoom`
(`RoomManager.scala:82-84`) always builds a fresh `User` with
`InitialVoteState`, and `joinUser` replaces the entry wholesale. Under the split
a reconnect replaces a `connections` entry and touches neither `members` nor
`round.estimates`, so there is nothing to carry over and nothing to forget.

**Each of the three is removed at a different moment, and the differences are the
design rather than an accident.** A `connections` entry goes the instant its
stream terminates, on `ConnectionCompleted` or `ConnectionFailure`: sending to a
dead ref is a no-op anyway, and `emptySince` has to reflect reality. A `members`
entry goes at grace expiry, or immediately on the explicit leave in section 4.
Estimates are never removed by a departure at all, only by `clear`, `reVote` or
the round ending.

Two consequences follow. **A transient drop produces no wire traffic**, since
removing a `connections` entry changes no snapshot and there is nothing to
publish; only grace expiry does, and it publishes once. Today every reconnect is
instead a potential leave-then-rejoin broadcast that the grace period exists to
suppress. And **Problem A's guarantee holds without a time bound**: because
estimates are not membership-scoped, someone off wifi for ten minutes returns to
their own vote intact, not just someone back inside six seconds. A departed
user's estimate lingers until the round ends, invisibly, since every read joins
over `members`.

**The participant-reordering problem the 08-28 design fixed separately
dissolves, but not because a map has no order to disturb.** A map has no order
to offer either, and `users` is a JSON array, so something decides. **That order
is unspecified and clients must not depend on it.** Ordering is a display
decision: alphabetical, voted-first and by-vote are all client-side sorts over
`name`, `voted` and `estimation`, which the snapshot already carries, so the
client gains the freedom and the server takes on no rendering concern. The
server still emits a deterministic order, sorted by user id, purely so snapshots
stay comparable in tests and readable in logs. That determinism is not a
guarantee to build on.

Two things this replaces are worth recording. There is no cross-client order
today either: a joiner's list is built from `setupNewUser`'s replay, which walks
the server's newest-first list, while later arrivals are appended in arrival
order, so no two clients who joined at different times agree. Observed in a real
session, where a participant sharing their screen showed a different table from
everyone else's. The frontend rewrite's first stable, agreed order is therefore
a small improvement rather than a preserved invariant, and picking its default
(alphabetical, most likely) is a product decision step 8 should make knowingly.

Join order is the one ordering key a client cannot reconstruct, and it is
deliberately not carried. **The test for whether a field is safe to defer is
whether its state is re-derived per session or accumulated.** Members are not
persisted, so a `joinSeq` on `Member` added the day a display option wants it is
correct from the next session onward: an in-memory field, an additive wire
field, a client sort, nothing to backfill. Nothing in this design is the
opposite case, since nothing accumulates beyond the actor's life.

Publishing reduces to:

```scala
private def publish(next: RoomData, context: ActorContext[Command]): RoomData =
  context.log.debug("Publishing to {} connections", next.connections.size)
  next.connections.foreach((id, ref) => ref ! RoomSnapshot.of(next, id))
  next
```

Reveal stays a server-side derivation, `round.revealed || everyMemberHasVoted`,
which is where auto-reveal moves from its current client-only home. Latched
reveal remains a deliberate Phase 4 behaviour change rather than something this
design smuggles in.

`everyMemberHasVoted` reads the `confirmed` flag, not merely the presence of an
estimate, which is what makes a re-vote switch auto-reveal back off. It is also
written `members.nonEmpty && ...` rather than as a bare `forall`. The vacuous
case is unobservable today, since no members means no connections and therefore
no snapshot, but it stops being vacuous the moment `role` lands and the predicate
filters to voting members: a room of observers would otherwise auto-reveal an
empty round. The guard belongs where that change will land.

#### No durable storage

An earlier draft of this document specified a Postgres addon, a `rooms` table,
row TTLs, an expiry predicate and a sweeper actor. All of it is dropped. The
analysis is kept as a deferred entry rather than repeated here, and this section
records why the requirement it was built for turned out to be a different
requirement.

**The requirement is slug stability, not state durability.** Teams pin one room
URL in a recurring calendar invite and a channel message and reuse it for years;
one team's room in this company ran for close to two. What that demands is that
the URL always resolve to a working room. It does not demand that the room's
*state* survive, and the product owner's account is that fresh state is actively
preferred: a meeting starts on a blank issue, and last Thursday's issue would be
noise. Nobody has ever noticed that a stale link silently creates a new room,
because that behaviour is indistinguishable from the one they want.

So the known issue titled "an unrecognized `roomId` silently creates an empty
room, with no bookmark continuity" describes the primary use case working. It
stays open, reclassified rather than fixed.

**A store would have threatened that requirement rather than served it.** Any
row TTL short enough to reclaim abandoned rooms is short enough that a team
pausing for a reorg or a long holiday has its slug returned to the pool, and
finds its pinned link opening another team's room. Auto-create has no such
failure mode.

**Round history is within-session, so it needs no table.** Its value is
comparing an issue to the two before it during the same meeting, to see a trend
without reopening tickets. Between sessions the ticketing system is the source of
truth. So history is `RoomState.history`, alive as long as the actor is, which
stop-after-idle already guarantees for the length of a meeting. Copy-and-export,
promoted out of the backlog to sit with step 9, covers anyone who wants to keep
it.

**And the store never protected the thing anyone would miss.** Live state was
already excluded from it by design, so a deploy mid-meeting destroys the round
either way. What the table would have held is a slug, two timestamps and
`current_issue`, and the paragraphs above remove the case for each.

What is genuinely given up: cross-session round history, which nobody has asked
for, and the truthful 404, which retains a small residual value in telling
someone they mistyped a slug instead of leaving them alone in a phantom room.
Neither is worth a database. The trigger that would reopen this is in "Deferred,
with triggers".

#### Two lifetimes, not one

Today a room dies with its last member, which conflates two things worth keeping
apart:

1. **The connection**, ending when the SSE stream does, with the grace period
   covering transient drops.
2. **The actor**, which stops after an idle period on the order of two hours
   rather than when its last member leaves. That closes the abandoned-room GC
   issue and stops a room losing its in-session history, now including its round
   history, to a coffee break. It lands at step 4.

**Idle means `connections` has been empty continuously for the idle period, and
no message has arrived since the previous tick.** It is a duration rather than an
instantaneous check: `emptySince` is set when `connections` becomes empty and
cleared when it becomes non-empty, and the tick stops the actor once that stamp
is older than the timeout. Connections present means never idle, whether or not
anyone is clicking, and a short emptiness is survivable, which is the
coffee-break requirement above.

**The tick interval is the idle timeout itself.** A room emptying just after a
tick is therefore not seen as idle until the tick after next, so the actual stop
lands between one and two intervals after the last departure: **two to four
hours**, on the figures above. Nothing distinguishes those outcomes, and one
periodic timer is easier to test than a single-shot one that has to be cancelled
and rescheduled. The actor idle timeout is the only value this design makes
configurable, following the existing `SseConfig` pattern.

**The no-message term is what stops a join being lost.** `ConnectToRoom` is
fire-and-forget (`RoomManager.scala:80-86`) and is sent from
`mapMaterializedValue`, which is after the 200 and the `text/event-stream`
headers have gone out. A tick landing between that send and its delivery would
dead-letter it, leaving the client holding an open, heartbeating stream that
never receives a snapshot: no error, no `onerror`, no reconnect, a blank room
until reload. The ordering that prevents it is causal rather than lucky, since
`ConnectToRoom` is only ever sent after the same actor has answered
`ValidateToken` (`API.scala:121-135`), and a mailbox is sequential, so any tick
able to sit between them was itself preceded by that `ValidateToken` in the same
interval. The term costs one field, and it lets a stray message defer an
abandoned room's stop by one interval, which costs a few kilobytes of memory for
a couple of hours.

**Message silence alone is the wrong criterion, though, and it is what an
implementer reaches for.** Pekko's `setReceiveTimeout` fires on message silence,
and open SSE connections send the room actor nothing at all: heartbeats come from
the `keepAlive` stage inside the stream (`SSE.scala:69`), not from any message. A
room with five people connected, arguing about an estimate for two hours before
anyone clicks a card, would stop itself mid-meeting and leave every participant
holding an open connection to a dead actor. So silence is a veto on stopping, not
a reason to stop. Recorded as a rejected alternative because the reason it is
wrong lives two files away from the code that would do it.

A genuinely abandoned connection still resolves, so none of this depends on
clients being polite: a suspended client's stream eventually fails to write and
terminates into `ConnectionFailure`, which is already routed to `Leave`.

#### Slug allocation

Generated slugs are three words, for example `nice-brave-otter`, allocated
**unique among rooms currently in memory** by retrying generation on collision.
There is no record of rooms that have stopped, so uniqueness is scoped to what is
running rather than to all rooms ever, which keeps the namespace bounded by
concurrent usage rather than by total history.

The requirement driving this is not aesthetics. The slug exists so a person
working with two teams on the same project can tell at a glance which room to
join, which means live rooms must be mutually *memorable*, not merely distinct.
That rules out a numeric discriminator: `nice-otter-42` against `nice-otter-17`
recreates most of the problem that replacing UUIDs was meant to solve, because
the memorable part is identical and the distinguishing part is not memorable.
Three words over a few hundred each gives tens of millions of combinations,
which is where the namespace size comes from instead.

**A pinned slug is not reserved while its room is stopped, and that is the one
hazard worth naming.** A team's room stops two to four hours after their meeting,
so for most of the fortnight their slug is free and `create-room` could draw it
for someone else. Their pinned link would then open a room another team is in.
The chance is negligible, one specific triple out of tens of millions against a
few hundred rooms generated a year, and landing in the wrong room announces
itself immediately through an unfamiliar participant list. It is nonetheless a
hazard that raw UUIDs did not have, and it is the price of memorable names.

Reserving slugs against it would need exactly the durable record this design
declines to keep, which is the trade rather than an oversight.

**Custom chosen names stay deferred.** The moment a user can claim `team-alpha`,
"is this name taken forever" becomes unavoidable, and answering it requires
knowing who owns a name. That needs an authentication and ownership model this
app does not have, so it should not be designed before that exists.

#### What a restart costs

Nothing is persisted, so a deploy or a crash takes every room with it: presence,
the round, the current issue and the session's round history. Meetings here run
30 to 60 minutes and deploys are manual, so the mitigation is scheduling rather
than engineering, which promotes Phase 5's restart-warning and maintenance-mode
item from a nicety to the actual answer. Room URLs are unaffected, since the next
visit recreates the room.

An auth `sessions` table is **not** in the target either, for a separate reason.
It would only be needed if the cookie outlived the browser, and since
`localStorage` already remembers the user's name, the payoff is thin. The cookie
stays a session cookie exactly as
`docs/superpowers/specs/2026-08-20-session-identity-design.md` designed it.


#### Round history, within the session

`RoomState.history` is a list of completed rounds, held in memory for as long as
the actor lives and gone when it stops. That is the whole of it, and it is enough
because the value is comparing an issue to the two before it during the same
meeting: seeing a trend, or checking what the room settled on for something of
similar size, without reopening tickets. Across sessions the ticketing system is
the source of truth.

```
RoundRecord   issue, recordedValue: Option[String], distribution: List[(String, Int)], completedAt
```

Three things about the shape. **No personal data**, since per-participant
estimates are rarely the interesting part of a retrospective view and their
absence keeps retention an ordinary question. **The distribution matches code
that already exists**, because `updateSummary` produces `Object.entries(tally)`,
which is exactly `[(score, count)]`, so a history view reuses the live summary's
rendering, and later views (highest and lowest, majority, most voted) are
additive. And **`recordedValue` is a product gap rather than a storage choice**:
teams often resolve a split by talking it out rather than re-voting, and the app
has no concept of a settled estimate at all, so it implies a facilitator command
and a snapshot field. That is a new Phase 4 roadmap entry, and it fits the
property this architecture is built on, a feature being a field plus a command
with no new branch in `applySnapshot`.

**Open: what completes a round.** The candidate is that recording a value is the
commit point, so one action is both the product capability and the trigger, and a
round abandoned without a recorded value appends nothing. The alternative is that
every `clear` appends an entry with no outcome. Cheaper to change than it was
when this was a table, since the shape is in memory and lasts an hour, but still
worth deciding before step 9 rather than during it.


### 4. Identity and the write path

The 08-20 cookie design carries over with one change: `HttpOnly`,
`SameSite=Strict`, `Secure` behind `apiConfig.secureCookies`, no `Max-Age`, and
**`Path=/rooms/:slug/:tabId`** rather than `/rooms/:slug`.

**One cookie per tab, and the browser does the enforcing.** The `tabId` comes
from `sessionStorage`, which is the native per-tab primitive: unique per tab,
surviving reload within that tab, gone when the tab closes. Because the cookie's
path carries it, tab A's cookie is simply never sent to tab B's endpoints. A
token therefore identifies a tab by construction rather than by convention, which
is the same move as `Participant` being a projection: the thing that could go
wrong stops being expressible rather than being checked for.

That removes a shared mutable slot which would otherwise have needed guarding on
every write. Two failure modes go with it, both silent: a leave beacon carrying
whichever token was written last would evict the *other* tab's participant while
it sat there connected, and two tabs' independent command counters would race
against one `Member.lastSeq`, dropping votes unpredictably as each overtook the
other. Neither is reachable when the tabs cannot share a token.

Four additions, each closing something documented:

- **Retained sessions with a TTL.** Sessions are kept past promotion rather than
  consumed, and bounded by a TTL evaluated at resolution, so an unpromoted
  session expires on its own. Closes the pending-session leak, and it is also
  what keeps a tab's token resolvable for the idempotent `/join` below.
- **Ask-pattern commands**, so a client can distinguish rejected from lost.
  This is Phase 1's outstanding item and it is what makes real error handling
  possible in the rewritten frontend.
- **A per-tab command sequence number.** The client sends a counter, starting at
  1 and incremented per command; the room ignores one whose sequence is not
  strictly greater than `Member.lastSeq`, which starts at 0. A member is a tab,
  so there is exactly one counter per member and no cross-tab interference to
  guard against. An ignored command answers with a distinct superseded result
  rather than silence, since the whole point of the ask pattern here is that a
  client can tell rejected from lost, and a dropped-as-stale command that times
  out reports the one thing that did not happen. Closes the HTTP
  command-ordering regression, which is one of the two reasons this design can
  recommend against returning to WebSocket.
- **An explicit leave endpoint** hit by `navigator.sendBeacon` on `pagehide`,
  mapping to an immediate departure that bypasses the grace period. That is the
  other reason, and it reduces the grace period to what it should be: cover for
  transient drops only. `sendBeacon` is the right primitive because a normal
  POST is not reliably delivered from an unload-adjacent handler. Its response
  also carries `Set-Cookie: …; Max-Age=0` for that tab's path, so the message
  that announces a departure also clears the cookie behind it. Without that a
  long-lived browser accumulates one session cookie per tab ever opened; with
  it, only tabs that die without firing a beacon leak one.

**`/join` becomes idempotent per tab**, which is what closes the reload symptom.
If the tab's cookie already resolves to a live session it returns that `userId`
instead of minting a new one. Tab scoping is what makes this safe: the cookie
unambiguously belongs to the tab asking, so there is no question of resuming
somebody else. A reload therefore keeps its `tabId` from `sessionStorage`, its
cookie, its token and its `userId`, the member entry is replaced rather than
duplicated, and the old connection's ref-scoped teardown cannot evict the new
one.

It does take the `name` from the request rather than ignoring it, so a reload
with a different name renames the participant instead of silently keeping the old
one. That is today's effective behaviour, which reaches the same place by
creating a second participant, and it is the nearest this app has to a rename.

That matters because the reload, not the tab close, is the form users actually
report: today `/join` mints a fresh identity on every call, so someone reloading
watches their own name sit in the participant list twice until the old entry's
grace period expires. This closes it structurally, rather than by hoping a
`sendBeacon` wins a race against the new page's join.

**One coupling comes with it, and it is the kind that bites silently.** A member
now survives a reload, so `Member.lastSeq` survives with it, while the tab's
JavaScript counter restarts at 1. Every command from the reloaded tab would then
be below the stored value and be dropped as stale. So **`/join` resets
`Member.lastSeq` to 0**. A reload is a fresh heap and restarting the count is
correct; the only commands this could re-admit are in flight from a page that no
longer exists.

**Two tabs on one room are two participants**, each with its own cookie, member
entry and vote. That is a restoration rather than a change: it is what the
WebSocket transport did, since each socket minted its own `userId`, and the SSE
swap silently replaced it with the shared-cookie collision. One person can hold
two votes this way, which is visible in the participant list and harmless for a
team tool, where the honour system already covers voting twice from two
browsers.

### 5. Client

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

Pure rather than assigning into a framework object, because the Phase 3
framework is undecided and mutation-based reporting works under Vue's
reactivity but needs rework under an immutable model. Being pure also removes
the fake ref its tests would otherwise need.

Three details are load-bearing rather than polish:

- **The `editing` guard is mandatory here.** `currentIssue` is `v-model`-bound
  to the issue input. Under the event protocol only an `edit_issue` broadcast
  could clobber in-progress typing; under snapshots every publish carries the
  issue, so any vote by anyone would wipe the edit box mid-keystroke. The 08-28
  design correctly called this out of scope for an event protocol and correctly
  in scope for this one.
- **The tally counts only participants who have voted.** Today
  `updateSummary` tallies every user, so a non-voter's empty string becomes a
  summary row and in a revealed room with stragglers can win the count and
  render as the "Most voted estimation". Fixing it makes the tally able to be
  empty, so the summary block's condition becomes
  `v-if="votesRevealed && votesSummary.length"`. That guard is reachable by two
  clicks (Show in a room where nobody voted), not defensive.

  Note that once redaction lands, the tally is meaningless before reveal: every
  other participant's `estimation` is `""`, so voted participants all collapse
  into one bucket. That is harmless because the summary is only rendered when
  `votesRevealed`, but it is the kind of thing a reader spots and mistakes for a
  bug, so it is stated rather than left to be rediscovered.
- **`ownVoteConfirmed` is derived, not carried.** `reVote()` clears `voted` and
  keeps `estimation` while `clear()` clears both (`Room.scala:85-89`), so "I
  have an estimation showing but the server does not consider me voted" is
  exactly the revote state and nothing else. The optimistic assignment in
  `vote()` stays, and corrects itself on the next publish rather than promptly:
  a failed vote POST leaves the server holding the old estimation, so the
  selection stays visibly confirmed until somebody else acts, which in an idle
  room can be a while. Step 6's ask-pattern reply is what makes a failed vote
  reportable at the time it fails; this derivation only stops it persisting.

`showUserEstimation` re-points at `hasEstimation`. That is the one client change
the redaction forces, and it is why the confidentiality step is not server-side
only.

No client-side version comparison, because out-of-order snapshots are
unreachable: SSE delivers in order within a connection, and a snapshot is one
frame. The stronger claim, that at most one connection is open per page instance,
rests on the server rather than the client: a rejoin replaces the `connections`
entry and publishes only to the new ref, so a superseded stream receives nothing
further. It is not true of today's client, where `doJoin` assigns a new
`EventSource` without closing the previous one (`index.html:388`) and only
`doLeave` closes; step 8's connection module is where that becomes true on both
ends.

### 6. Testing

`RoomSpec`'s existing cases remain the behaviour specification. Its reconnect
tests hand-construct the reconnecting user via `user.copy(ref = ...)`, which
preserves vote state by construction and therefore never exercised the real
`ConnectToRoom` path; they should go through `ConnectToRoom` so they would catch
a regression.

Added, each with the step it lands at so nothing here is unassigned:

- **The stub buffering proxy and browser harness** (step 0) from
  `docs/superpowers/specs/2026-08-30-e2e-testkit-design.md`, built and kept
  permanently. This is the piece that turns a future customer's report into a
  locally failing test without needing their cooperation, and it is the
  strongest form of the proxy insurance we want to retain.
- **The probe**, kept as-is (no work), env-gated and off by default. Its route
  and page cost nothing while idle and its value is entirely in being available
  on the day a new customer reports the same symptom.
- **Playwright end-to-end cases** (step 0, extended at each later step): two
  browsers exchanging votes, reveal with a straggler, reconnect survival,
  participant list on join and leave, and the issue-input guard. Step 6 adds two
  that need one browser context rather than two, since they are about cookie
  scoping: two tabs on the same room staying independent, and a reload keeping
  its identity instead of duplicating its participant.
- **A contract test** (step 8, when the client first has generated types to
  check) taking a real server-produced snapshot and validating it against the
  client's types. **This is the drift gate for `RoomSnapshot`, not a cheap stand-in
  for one.** tapir describes HTTP endpoints, and the snapshot is not one: it
  travels as JSON inside a `text/event-stream` body, where tapir sees a stream of
  `ServerSentEvent` whose `data` is a `String`, so the generated document covers
  the five command bodies and omits the one type the client models. Getting it in
  there deliberately, by attaching a schema to the SSE endpoint or registering it
  in components, is possible and fiddly, and worth doing only if drift actually
  bites. Parsing a real payload against the client's types is also the better
  gate here: a removed or renamed field fails as a missing required property,
  while a newly added server field passes, which is the direction the additive
  field strategy depends on being safe and which a schema diff would flag as
  noise.
- **`openapi-typescript` over tapir's OpenAPI document** (step 6 onward) with a
  CI step that regenerates and fails on a diff, covering the command endpoints.

## Accepted costs

- **Two toolchains** once the frontend gains a build at step 8. The node
  toolchain arrives regardless (Phase 3 needs a build, and the e2e harness needs
  Playwright), so the marginal cost is keeping an sbt setup that already works
  and is already maintained by Scala Steward.
- **A slower test fixture for anything spanning both halves.** A Playwright or
  integration test must boot a packaged server rather than importing it, which
  the 08-30 harness already designs, at roughly 80 lines written once.
- **Probably the Docker runtime on Clever Cloud rather than the `sbt` runtime**,
  because the node build must run before sbt packages the assets that
  `build.sbt` already ships via `Universal / mappings`. `DockerPlugin` is
  already enabled. Verify what is available in Clever Cloud's sbt build image
  before assuming a pre-build hook suffices.
- **A restart is destructive**, since nothing is persisted. Deploy outside
  meeting hours and see "What a restart costs".

## Deferred, with triggers

Recorded so nobody re-derives these, and so the trigger is recognizable when it
arrives.

| Deferred | Trigger that reopens it |
| --- | --- |
| Long-poll fallback transport (analysed as option 6 under 08-28's "Approaches considered") | Proxy-hostile networks recurring at more than one customer. Still the first thing to try, ahead of short polling, subject to the two caveats below the table. |
| Elixir and Phoenix | The same trigger. If automatic transport downgrade becomes a product requirement, Channels supply it and hand-building it three times is worse than learning Elixir once. |
| WebSocket | Needing low-latency bidirectional interaction at many events per second. |
| Voting scale | Someone asking for a non-fibonacci scale. Moved to the end of the backlog: it was a nice-to-have nobody requested. |
| Custom chosen room names | An authentication and ownership model existing, without which "is this name taken forever" has no answer. |
| An explicit destroy-room action | Wanted as a convenience. Nothing needs reclaiming now that rooms are memory-only. |
| Durable storage of any kind (a Postgres `rooms` table, or a whole-blob JSON snapshot in Cellar) | Someone wanting round history across sessions, or a truthful 404 becoming worth a database. See "No durable storage". A prior draft specified the Postgres version in full, including row TTLs, an expiry predicate and a sweeper; that analysis is in this file's history if it is ever needed. Between the two, Cellar is the simpler starting point on complexity grounds, since it needs no migration tool, no SQL and no database in CI. |
| Observer roles, latched reveal | Phase 4, unchanged. Both are a field plus a predicate, and they share one: an observer changes what "everyone has voted" means. Latching also removes today's accidental un-reveal, when a joiner flips the derivation back, so pair it with the backlog's undo/re-hide. |
| Idle indicator | Phase 5. Unlike the two above it is not only a field: it needs server-side activity tracking and a timer, and it publishes on a transition nobody commanded. |
| Timer-based fallback reveal | Phase 4, but the least settled thing in it. Four open product and UI decisions, not a field: whether it runs for every round, whether the facilitator starts it, the duration and whether it is fixed or per room, and whether a running countdown can be cancelled when discussion breaks out. The countdown is also the first roadmap item needing a UI surface of its own. |
| Persisting live round state | A zero-downtime deploy requirement, already deferred to its own spec under Phase 5. Until then, a restart warning and deploying outside meeting hours. |
| Client-assisted round recovery | Someone complaining about a restart mid-meeting. Each client re-asserts its own vote on reconnect and the round rebuilds from whoever returns. Needs a round identity on the snapshot so a stale vote cannot land in a new round. |
| Durable auth sessions | Wanting identity to survive a browser close. `localStorage` already covers name pre-fill. |
| Multi-instance operation | Out of scope by decision; single process throughout. |
| Event-sourcing the room | Never, on the same grounds that pick snapshots for the wire. Round history is a product feature with its own shape, not a projection anyone needs to rebuild. |
| Rate limiting | Unscheduled and broader than any one symptom. |

**Two caveats on the long-poll row**, since it is the only deferred item this
design has made more expensive rather than merely postponed.

It needs **a room revision reintroduced as its cursor**. Without one the server
cannot tell that a client is behind, so a poll arriving just after a change would
block rather than return immediately, and a client would sit stale through a
reveal. Dropping `version` from the wire was still right, and by the test in
section 3 a revision is live state re-derived per session, so it is free to add
on the day it is needed rather than carried until then.

And **its premise is unmeasured against a hostile appliance.** Probes F and G
exist to establish whether a finite `application/json` body is released where a
stream is not, which is the entire basis for preferring long polling to short
polling. Both only ever ran against the local baseline and our own edge, because
the whitelist landed before the customer's run. Settling that is a concrete part
of what the probe is being kept for.

## The ordered path

Nine steps. The numbers are labels rather than a queue; each states what it
actually waits on. Line counts are rough.

**Steps 0 to 6 close every documented defect this path closes at all.** Step 7 is
a usability improvement, and 8 and 9 are product work whose case is the
roadmap's rather than this document's. That matters because the roadmap is
projections under an agile process rather than commitments, so argument 7 above
carries exactly as much weight as the roadmap does on the day someone reads it.
Stopping after step 6 leaves a correct app with no open defect except the two
recorded as staying open.

**Step 0. Characterization harness.** The stub buffering proxy, the browser
harness, and Playwright cases pinning today's behaviour. Waits on nothing.
About 220 lines and 200 of tests.

Front-loaded for a different reason than the 08-30 design gave. Its original
justification was reproducing the proxy failure; the surviving one is that there
are no end-to-end tests today and step 1 is the largest behavioural change in
the set. Two caveats belong in it.

**Cases covering behaviour that is currently buggy** (the non-voter tally, the
duplicate participants) characterize the *intended* behaviour, so they would
arrive red, and a suite that is red on arrival cannot answer "did I break
something" during exactly the steps it was built for. They are marked
`test.fail()` instead, annotated with the step that fixes each. Playwright fails
the run when such a test *passes*, so the suite is green from step 0, a
regression during steps 1 to 3 still shows, and the moment a fix lands CI reports
the stale annotation rather than leaving anyone to notice. Those annotations are
a small ledger of known-broken-until-step-N that will drift from the known-issues
table; the annotation is the authority, being the one that fails the build when
it goes stale.

**Step 8 will revisit selectors**, so prefer accessible ones.

**Step 1. Snapshot protocol.** The wire format, `publish`, pure
`applySnapshot`, `dropHead`, the anti-buffering headers and README note, plus
Problems A, C and E. Deletes `RoomEvent.scala`, `broadcast`, `setupNewUser`, 89
client lines, and `ConnectionFailure`'s now-unreachable `BufferOverflowException`
branch. Waits on nothing, though much safer after step 0. About 170
added, 190 deleted, 200 of tests. Independently releasable, and it closes four
things: both reconnect bugs, the reveal-on-resync issue and the
proxy-buffering documentation issue.

**Step 2. Pre-reveal vote confidentiality.** Per-recipient redaction,
`hasEstimation`, and the `showUserEstimation` change. Waits on step 1. About 20
and 50. Separate because it wants a reviewer thinking about what is on the wire
rather than how state is shaped.

**Step 3. Vote summary correction.** Voted-only tally plus the template guard.
Waits on step 1, independent of step 2. About 5 and 25. Separate because it is
the one change a user notices as a different answer rather than better plumbing.

**Step 4. Transport and state split, plus stop-after-idle.** `RoomState`,
`Round`, `members` and `connections`, and replacing the room actor's
stop-when-empty with an idle timeout. Waits on step 1. About 140 changed and 100
of tests.

The split itself is a pure refactor; **the idle timeout is the one behaviour
change in this step**. It stops a room dying the moment its last member's grace
period expires, six seconds into a coffee break, taking the session's round
history with it, and it closes the abandoned-room GC issue. Section 3 has the
reasoning, including what "idle" means and why message silence is not it.

The idle timeout also deletes the stop path it replaces, which is worth claiming
because this step's diff is otherwise additive. `ConfirmLeave` no longer stops
the actor, so it always answers `Running`; `Room.Stopped`, the `Stopped` case of
the `Response` ADT, and `RoomManager`'s `removeRoom` call site all become
unreachable. `Terminated` (`RoomManager.scala:163-165`) becomes the single
deregistration path, which it has to be anyway, since it is the only one that can
observe a self-initiated stop.

Flag for its reviewer rather than let them find it: this **deletes** step 1's
Problem A fix, because the split makes vote loss on reconnect unrepresentable.
Writing a fix and then removing it is deliberate. Folding the split into step 1
would produce one PR changing both the wire format and the shape of state, and
step 1's diff is readable at its size only because most of it is deletion.

**Step 5. Retained sessions with a TTL.** Waits on step 1 only, so it can land
any time after. About 55 and 100. Closes the pending-session leak.

**Step 6. The write path becomes real.** Endpoints described with tapir, the
ask pattern replacing the unconditional `204`, tab-scoped cookies with the
`:tabId` path segment, idempotent `/join`, per-tab command sequence numbers, and
the explicit leave endpoint. Wants step 4 first so handlers are not rewritten
twice. About 225 and 200.

tapir and the `:tabId` segment both land here rather than later, and for the same
reason: this step already rewrites all five command endpoints plus `/join` and
`/events`, so describing them once with tapir and adding a path segment once
costs less than doing either twice. Closes Phase 1's outstanding item, the
command-ordering regression, the slow-departure issue and the same-room two-tab
regression, and it closes the reload duplicate structurally rather than by
beacon timing.

**Step 7. Slug room ids.** Three-word slugs replacing raw UUIDs, generated on
`create-room` and unique among the rooms currently in memory. Waits on steps 4
and 6. About 60 and 50. This is what remains of Phase 2 once voting scale moves
to the backlog and durable storage is dropped.

**It waits on step 6 for the same reason tapir lands there.** Slugs change every
route matcher from `path("rooms" / JavaUUID / ...)` to a segment, so landing this
first means step 6 re-describes endpoints this step just re-typed, where the
other order changes a path type in a tapir description and nothing else.

One consequence worth stating: **the cookie path becomes
`/rooms/:slug/:tabId`**, which orphans any cookie minted before the cutover, at
no cost since they are session cookies.

**Step 8. Frontend rewrite.** Phase 3: TypeScript, build tooling, components,
light and dark theme, responsive layout, the connection logic as its own module,
and client types checked against the server contract. Waits on steps 1 and 6.
Absorbs the `connection.js` extraction the 08-28 design scheduled separately,
whose standalone justification was bounded mode's state machine.

**Step 9. Recorded value and round history.** The facilitator command that
records what the room settled on, its snapshot field, `RoomState.history`, and
the history view. Waits on step 8 for the UI. Wants its own discussion first over
what completes a round, though the shape is in memory and lasts an hour, so that
question is cheaper to get wrong than it was when it decided a schema.

The two halves stay in one step because the recorded value is the candidate
commit point for appending an entry, and because a settled estimate you cannot
look back at afterwards is half a feature.

The remaining Phase 4 items are deliberately **not** steps here: latched reveal,
observer roles, re-vote refinement, results polish, the timer-based reveal and
the idle indicator are product work built on the target rather than steps toward
it. They stay in `docs/roadmap.md`, where what this design contributes is that
most of them become a field plus a predicate rather than a protocol change. The
timer reveal and the idle indicator are the exceptions, and the deferred table
says why.

## Disposition of existing specs

| Spec | Disposition |
| --- | --- |
| 08-18 SSE transport | Historical. Its post-implementation note stays valuable as the record of why `userId` exposure widened, which the "Transport" section above reads as self-inflicted by the swap rather than inherited from WebSocket. |
| 08-20 session identity | Current and implemented. The cookie-lifetime question is reaffirmed rather than reopened: it stays a session cookie, since no durable auth session is in the target. |
| 08-24 backpressure | Decisions superseded (`fail` becomes `dropHead`, and the grace period stops being load-bearing once step 6 lands explicit leave), findings retained. Its empirical discoveries must survive the edit: `Source.actorRef` with `bufferSize = 0` silently bypassing the overflow strategy, and the connection-establishment race. Nothing else records either. |
| 08-26 delta resync | Already superseded, now doubly so. Kept as history. |
| 08-28 snapshot protocol | Superseded by this document, and kept for three things worth reading: the long-polling analysis at option 6 of its "Approaches considered", which is still the standing fallback design though it assumes a version cursor this design drops (see the caveats under "Deferred, with triggers"); the measurement table behind the snapshot-versus-replay comparison; and the Netskope investigation. Superseded rather than amended because §6's bounded mode, the proxy validation ladder and their scaffolding account for more of its 3,001 lines than everything that survives. |
| 08-30 e2e testkit | Amended, not superseded. The stub and harness survive, the bounded-mode cases go, the characterization cases arrive. |

## Roadmap changes

- Phase 1's fourth item (ask-pattern command endpoints) becomes step 6.
- Phase 2 loses voting scale to the end of the backlog and its durable store
  entirely, so what remains is slug ids, which become step 7. The "reject
  unknown slugs (404)" item goes with the store: see "No durable storage".
- Phase 3 becomes step 8.
- Phase 4's server-authoritative auto-reveal moves into step 1. Latched reveal
  stays in Phase 4 as a deliberate behaviour change reviewed on its own.
- Phase 5's abandoned-room GC is absorbed by step 4's idle timeout.
- Phase 4 gains an entry for the facilitator-recorded round outcome, which does
  not exist there today and which step 9 pairs with round history.
- Phase 4's existing round-history item becomes step 9, paired with that new
  entry rather than sitting alongside it. Without this the roadmap ends up
  carrying two round-history entries.
- The backlog's "copy/export round history at end of session" is promoted to
  Phase 4 alongside step 9. With history held only in memory it is the sole way
  to keep a session's rounds, which makes it part of the feature rather than a
  convenience beside it.
- Latched reveal stays where it is and gains a note that it should ship with the
  backlog's undo/re-hide, since latching removes today's accidental un-reveal.
- The backlog's per-user command sequencing item becomes step 6.
- The backlog's client-side connection-liveness watchdog stays in the backlog.

## Known issues disposition

Six of the eight open entries close on this path.

| Entry | Closed by |
| --- | --- |
| Unrecognized `roomId` silently creates an empty room | Stays open, reclassified. See "No durable storage": auto-create is what the pinned-URL usage actually wants, so this is the primary use case working rather than a defect. What it costs is telling someone they mistyped a slug. |
| No GC for abandoned or never-joined rooms | Step 4 |
| A `/join` with no follow-up `/events` leaks a pending session | Step 5 |
| SSE reverse-proxy buffering is undocumented | Step 1 |
| A deliberate tab close is as slow to announce as a transient reconnect | Step 6 |
| HTTP command ordering is not guaranteed | Step 6 |
| Resync doesn't replay whether votes are revealed | Step 1 |
| No rate limiting on mutating room endpoints | Stays open |

The rate-limiting entry needs rewriting rather than leaving alone: its
bounded-mode request-amplification paragraph describes a mode this design
cancels, and the no-op publish guard it names as the backstop is also dropped.
The underlying gap is unchanged.

Four issues need **adding** to `docs/known-issues.md`. Three are recorded only
inside a spec about to be marked superseded; the fourth is recorded nowhere at
all:

- A transparently reconnecting client duplicates every known participant.
  Closed by step 1.
- A participant who departs during a reconnect gap is never pruned. Closed by
  step 1.
- Pre-reveal estimations are broadcast to every participant and only hidden
  client-side. Closed by step 2.
- Two tabs on the same room share one identity, so one tab's clicks are silently
  credited to the other. A regression from the WebSocket swap that was never
  recorded: the 08-20 design examined two tabs on *different* rooms, where path
  scoping works, and this case fell in the gap beside it. Closed by step 6.

## Open questions

1. **Clever Cloud's sbt build image.** Whether it can run a node build via a
   pre-build hook, or whether step 8 forces the Docker runtime. Answer before
   step 8, not before step 1.
2. **Whether the probe earns its 682 lines** over the longer term. Retained
   deliberately for now on option-value grounds, and on one concrete unanswered
   question: probes F and G are what would establish whether the deferred
   long-poll fallback works at all, and they have never run against a hostile
   appliance. Revisit if a year passes with no second incident.
3. **What completes a round**, and therefore what appends to
   `RoomState.history`. The candidate and its alternative are in section 3.
   Answer before step 9; it does not block anything earlier.
4. **Wordlist size and source for slug generation**, and the fallback when
   generation cannot find a free triple. Answer at step 7. The fallback should
   log loudly, since exhaustion means either genuine scale or an unthrottled
   `create-room` being abused.
