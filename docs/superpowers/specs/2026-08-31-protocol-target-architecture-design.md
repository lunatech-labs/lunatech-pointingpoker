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

**What it decides, and what it leaves alone.** In scope: the wire format, the
shape of room state, identity and the write path, what is persisted, and the order
the work lands in. Out of scope: which features this product should have, which
stays with `docs/roadmap.md`. A feature appears here only where it forced one of
those decisions. Round history is the case that does, because it is the
requirement a database was going to serve, so settling it settled whether there is
a store at all; the recorded round outcome came with it as a gap found on the way,
and is handed to the roadmap rather than argued for here.

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
`publish` path, the pure `applySnapshot`, Problems A, C, D and E, the pre-reveal
vote confidentiality fix, the vote-summary correction, retained sessions, and the
anti-buffering headers. Problem D appears twice in that list under two names: it
is 08-28's label for a disconnection outlasting the grace period being terminal
rather than a flicker, and retained sessions at step 5 are its fix.

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
4. **Reveal state on resync** closes as one stored flag carried as one snapshot
   field, ending an open known issue. It lands as a latch rather than as a
   derivation, for the reason in section 3, so it is a field on room state and
   not free. What snapshots add is that every connect answers with it, where the
   event protocol needs a `Show` synthesized into the replay beside the
   `EditIssue` one `setupNewUser` already fabricates.
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
participants and 2,112 at twenty (roughly double that late in a session once
`history` rides along, see section 2), and a few clicks per person per minute.
Both runtimes idle. To the extent performance ever mattered it would favour staying.

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

The second was never recorded anywhere. Under a cookie scoped to the room every
tab shares one slot and each `/join` overwrites it, so a second tab silently takes
over the first tab's identity and the first tab's clicks land as the second's. The
08-20 design examined two tabs on *different* rooms, where path scoping works
correctly, and the same-room case fell in the gap beside it. Section 4 closes it,
though not by restoring what WebSocket did: each socket minted its own `userId`,
so two tabs were two participants there, and section 4 argues that outcome was an
artifact of the transport rather than a behaviour worth keeping.

WebSocket would return one thing this design buys back by hand: instant leave
detection, paid for in section 4's explicit leave endpoint at roughly 25 lines.
It would also carry command ordering, which this design declines to guarantee at
all and defers instead, and a per-connection identity for free. That last one has
stopped being a benefit forgone: section 4 makes a person one participant however
many connections they hold, so a per-connection identity is the thing being
avoided.

Twenty-five lines is cheaper than reversing the transport, and the read side is
one-way fan-out while the write side wants ordinary HTTP semantics, which is what
the ask pattern needs. **Reverses if** we ever need low-latency bidirectional
interaction at many events per second, and that reversal is a real option rather
than a formality: the snapshot protocol is transport-agnostic, so `publish`,
`RoomSnapshot` and `applySnapshot` all survive it. What is SSE-specific is
`Source.actorRef` with `dropHead`, the anti-buffering headers and the
`EventSource` client code.

## Target architecture

### 0. Invariants

Seven rules the rest of this section applies. They are listed here rather than
left inside the paragraphs that argue them because a violation of any one is
silent, and because four of the eleven defects the last review found were
violations of one.

1. **No connection handle appears in the room's own state.** `connections` is the
   only place an `ActorRef` lives. Section 3.
2. **Everything that reaches the wire is built per recipient, and every estimate
   in it comes from the join over `members`.** That build is the only place room
   state is serialized, so it is the only place redaction has to happen;
   `round.estimates` outlives membership, so reading it directly publishes a
   departed participant's vote. The requirement is that no participant is
   influenced by another's estimate before the reveal, not that the value is
   secret, so the server's own logs are deliberately out of scope. Sections 2
   and 3.
3. **Only a revealed round enters `history`.** Its `distribution` is shared
   unredacted, so the gate is that every participant could already see every
   estimate. Section 3, "Round history".
4. **Reveal is a latch, never re-derived at publish time.** A standing predicate
   over a mutable member set lets a departure disclose the round. Section 3.
5. **A `members` entry is created by `ConnectToRoom` and by nothing else.** A
   member who holds no connection and never votes makes `everyMemberHasVoted`
   unsatisfiable for the rest of the meeting. Sections 3 and 4.
6. **Resolving a token and being allowed to act are two checks.** Sessions carry
   no TTL, so `sessions` alone would let anyone who ever joined act. Section 3.
7. **A field with no consumer does not travel, and none is added before it has
   one.** Section 2.

### 1. Transport

SSE for server-to-client push on `GET /rooms/:slug/events`, authorized by the
room-scoped session cookie described in section 4. A participant may hold more
than one connection at a time; section 3 says what that means for state. HTTP POST
for commands, on the ask pattern, returning real results rather than an
unconditional `204`, under `/rooms/:slug/` as `join`, `leave`, `vote`, `show`,
`clear`, `revote` and `edit-issue`. `POST /create-room` and the page route
`GET /:slug` read no cookie.

**Nothing in a path identifies a tab or a connection.** An earlier draft added a
`:tabId` segment so the cookie's path could be scoped per tab; section 4 records
why that was dropped. The consequence here is that every route keeps the shape it
has today, with the slug replacing the UUID at step 7 and nothing else moving.

The SSE response carries `Cache-Control: no-cache` and `X-Accel-Buffering: no`,
and `README.md` gains a deployment note on proxy buffering. This closes the
"SSE reverse-proxy buffering is undocumented" known issue and protects against
proxies other than the whitelisted one.

### 2. Wire format

One message type, complete state, built per recipient.

```scala
final case class RoomSnapshot(
    you: UUID, // the identity this snapshot was built and redacted for
    currentIssue: String,
    votesRevealed: Boolean,
    users: List[RoomSnapshot.Participant],
    history: List[RoundRecord] // added at step 9; not on the wire until then
)

object RoomSnapshot:
  final case class Participant(
      id: UUID,
      name: String,
      voted: Boolean,
      hasEstimation: Boolean, // added at step 2 with the redaction it exists for
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
of 418 to 2,112. Construction becomes O(N^2) per publish against O(N) today, N
being members rather than connections, since a snapshot is per identity. All
of it is noise at a team's size, and the O(N^2) term is the one that would grow
first if very large rooms ever arrived.

**`you` is on the wire because the server already knows it and the client would
otherwise guess.** It is the identity the snapshot was built and redacted for, so
carrying it makes "who this was redacted for" and "who the client thinks it is"
agree by construction rather than by both ends being careful. Without it the client
recovers itself from a different request over a different transport, `/join`'s
`userId`, and a divergence fails silently: `me` is `undefined`, so `userEstimation`
goes blank and `ownVoteConfirmed` goes true while the participant list, the votes
and the reveal all keep working, which is one person's own state being wrong in a
room that looks healthy. It also makes `applySnapshot` a function of the snapshot
alone, which is the same reason section 5 made it pure, and it gives the step 8
contract test a field that pins the per-recipient contract. Forty-odd bytes on the
frame sizes above, and unlike `version` it has a consumer on day one.

The client stops needing to remember its own id at all, and that has a
consequence on the other side of the wire worth following through. `/join`'s
`userId` has no reader left once the event handlers go, its only consumers being
`index.html:412` and `:431`, both inside the block step 1 deletes. So
`JoinResponse.userId` becomes a field with no consumer, which is the same rule
that dropped `version`. The **response body** goes at step 6, where tapir
describes the endpoint, because a response contract belongs to the step that
rewrites endpoints rather than to the one that changes the wire. Between step 1
and step 6 it is dead but harmless: nothing reads it, and what confirms the call
is the status, not the body. Note that `/join` is not waiting on the ask pattern
for a real result, having had one since 08-20; it is the five command endpoints
that are still unconditionally `204`.

**`history` is the one field that grows within a session**, so it is worth
sizing rather than waving through. A `RoundRecord` is about 165 bytes of JSON at a
45 character issue and four distinct estimates, 200 at a long issue. Sessions here
run 3 to 10 rounds, so the field tops out around 1.6KB, and a seven-person
snapshot goes from roughly 800 bytes at the first round to roughly 2.4KB at the
tenth. Across a whole meeting that is about 100KB more per participant, once. The
worst case worth naming is twenty participants and ten rounds, at roughly 4KB a
frame. Construction is unaffected, since the list is shared by reference across
every per-member snapshot and only serialization pays per recipient. That makes
`history` the one snapshot field not built per recipient, which is licensed by
section 3's invariant that only a revealed round enters it: once every
participant has seen every estimate there is nothing left to redact.

**Reverses if history ever outgrows the participant list**, which on these numbers
means somewhere past twenty rounds in one session. Then it moves to a
`GET /rooms/:slug/history` fetched when the view opens, which is a change at both
ends of code we own and nothing else. Until then it stays on the snapshot, because
one read path, one contract test and one invariant are worth more than the
bytes.

**`hasEstimation` exists because redaction would otherwise change what the table
renders.** `showUserEstimation` (`index.html:556-558`) reads the estimation
string to drive the hidden-value icon, and blanking other participants'
estimations makes that predicate false for everyone but the recipient. The field
is computed from the unredacted value so the table renders exactly as it does
today. Against the state model in section 3 that is the entry existing in
`round.estimates` at all, where `voted` is that entry's `confirmed` flag; the two
coincide except in the re-vote state, which is the whole reason both fields are
here.

**The wire name is `votesRevealed`, not `revealed`.** Under the latch in section 3
the two carry the same meaning, so the only reason for two names is that
`votesRevealed` is what the client already calls it and renaming that buys nothing.
Keep them in step: if the stored flag ever grows a second meaning, this is the
field access that would hide it.

Not on the wire: `version` (no live consumer, see above), `roomId` (the client
opened the connection, and unlike `you` it is not a value the server minted), and
voting `scale` or participant `role` (see "Demonstrated but not built").

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
strings today, so adding scale later is a field with a default, an additive
wire field, an optional `create-room` body field and a client render change, on
the order of 30 to 40 lines with no protocol break and nothing to backfill.

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
carry forward. It splits three ways, and the block below shows the whole of
`RoomData` around that split:

```
RoomState   slug, currentIssue, round: Round, history: List[RoundRecord]
            // slug holds the room's UUID until step 7 generates a name
            // history, and RoundRecord with it, arrives at step 9
Round       estimates: Map[UUID, Estimate], revealed
Estimate    value: String, confirmed: Boolean
sessions    Map[SessionToken, Session]  // Session(userId, name); lives as long as the actor
members     Map[UUID, Member]          // Member(name)
connections Map[UUID, Set[ActorRef]]   // the only place a connection handle lives

emptySince    Option[Instant]  // empty since when; Some at creation, see "Two lifetimes"
sawMessage    Boolean          // any message since the previous idle tick
```

The last two are actor bookkeeping rather than a fifth group of state. They sit
beside `connections` rather than inside `RoomState`, because both are derived from
the connection layer: an `Instant` is not a handle, but putting either in the
room's own data would break the rule below in spirit while satisfying it in
letter. "Two lifetimes, not one" specifies what they mean.

**`connections` maps a member to a set because one person can hold several
connections at once**: a second tab, or a replacement opened because the first
froze. They are the same participant with the same vote, and the set is what makes
that expressible. Section 4 argues the requirement. A member's entry is dropped
from the map when its set empties rather than left holding an empty one, so
"`connections` is empty" below means what it says.

**`sessions` is the single authority for resolving a token to an identity**,
which is what lets `ValidateToken` become one map lookup. Today it takes two
(`Room.scala:236-243`): a lookup in `pendingSessions`, then a linear scan of
`users` by token, the scan existing only because `joinUser` consumes the pending
entry on promotion so the token's last record is on the `User`. Retaining
sessions past promotion removes that reason, so the scan goes and `Member` needs
no token. Retention is a precondition for this shape rather than a companion to
it, which is why step 4 waits on step 5.

The name is deliberately in both `Session` and `Member`: a session exists before
there is a member, which is why 08-20 put it on `PendingSession`.

**A `members` entry is created by `ConnectToRoom` and by nothing else.** `/join`
writes `sessions` only, and renames a `Member` if and only if one already exists,
which is all "updating both" amounts to. Letting `/join` create the member instead
manufactures somebody who holds no connection and never votes, so
`everyMemberHasVoted` can never fire and auto-reveal is dead for the rest of the
meeting. That is the same failure section 4 rejects the `tabId` design for, and a
`/join` whose `/events` never follows is reachable without malice: a failure
between the two requests, an abandoned page load, a probe.

**Resolving a token and being allowed to act are two checks, not one.** A command
resolves its token through `sessions` and then requires the resulting `userId` to
be in `members`, so a resolved identity that is no longer a member is a no-op,
which is what today's `data.users.find(_.token == token)` already produces
(`Room.scala:141`, `152`, `163`, `174`, `227`). Keeping the checks separate matters
because step 5 gives sessions no TTL: `sessions` alone would let anyone who joined
at any point in the actor's life clear a round they are not in. Nothing about this
weakens Problem A's guarantee, since `round.estimates` is keyed by user id and
survives a departure independently of membership.

`ValidateToken` and `/join` are deliberately not subject to the second check.
Their job is to authorize a connection that is *about* to create the membership,
and requiring membership first is what would break the outage recovery step 5
exists for.

**`Estimate` carries `confirmed` because a bare `Map[UUID, String]` cannot
express the re-vote state.** `reVote()` clears `voted` and keeps `estimation`
while `clear()` clears both (`Room.scala:85-89`), so "has an estimation, is not
counted as voted" is a state the current code holds and the wire format
distinguishes as `voted` against `hasEstimation`. Collapsed into one predicate,
three things break at once: `ownVoteConfirmed` in section 5 is always true and
the unconfirmed-button styling never appears, the first re-vote after a `reVote`
instantly re-reveals the room, and `showUserEstimation`
changes which rows show the shield icon. So `voted` on the wire is
`confirmed`, `hasEstimation` is the entry existing at all, `reVote` sets
`confirmed = false` across the map, and `clear` empties it.

`round.revealed` is cleared by both `clear` and `reVote`, which is the other
half of what the client does client-side today and has to move with the reveal
itself.

`RoomData` keeps its name as the actor's state container and holds all four
groups plus the idle bookkeeping; `RoomState` is the room's own data within it,
which is what the `publish` snippet below reaches through. `history` is the
within-session round record, specified under "Round history" below. The rule
forbids a connection handle anywhere in this group, which is why `connections` is
separate and why nothing here is a `List[User]`. It survives the
absence of a store: the reason to keep connection handles out of the room's state
is that they are the one thing that cannot be reconstructed or reasoned about
independently, not that something is going to be written to disk.

`members` is room membership and survives the grace period, so the participant
list does not flicker on a transient drop. `connections` exists solely to send
to. `round.estimates` is keyed by user id and is independent of both.

A snapshot is a join: a participant appears because they are a member, and their
estimate comes from the round. **Every aggregate over estimates is that same
join, not a read of `round.estimates`**, which is the rule any later summary
field inherits. It matters because the map outlives membership by design, so an
estimate keyed by a departed user is present in the map and has to be absent from
anything published.

**That join makes Problem A unrepresentable rather than fixed.** Vote loss on
reconnect exists today because `RoomManager.ConnectToRoom`
(`RoomManager.scala:82-84`) always builds a fresh `User` with
`InitialVoteState`, and `joinUser` replaces the entry wholesale. Under the split
a reconnect adds a ref to `connections` and touches neither `members` nor
`round.estimates`, so there is nothing to carry over and nothing to forget.

**Each of the three is removed at a different moment, and the differences are the
design rather than an accident.** A ref leaves its member's set the instant its
stream terminates, on `ConnectionCompleted` or `ConnectionFailure`: sending to a
dead ref is a no-op anyway, and `emptySince` has to reflect reality. A `members`
entry goes at grace expiry, or immediately on the explicit leave in section 4,
which removes no ref of its own. Estimates are never removed by a departure at
all, only by `clear` or the round ending; a `reVote` leaves the values in place
and clears `confirmed`, which is the state `Estimate` exists to express.

**The grace period stops making a delayed decision.** Today the timer is keyed on
`(userId, ref)` and `ConfirmLeave` decides after the delay whether it is still
relevant, scanning for a user still holding that exact ref and doing nothing if a
reconnect replaced it (`Room.scala:182-225`). With connections in their own map
the same question is answerable at the moment of the event: on `Leave(userId,
ref)` the ref is removed from that member's set, and a timer keyed on `userId`
alone starts only if the set is now empty **and that member still exists**. A
member still holding another connection schedules nothing, and neither does one
whom section 4's leave endpoint has already removed, which is what an ordinary
deliberate close looks like. `ConnectToRoom` adds a ref and cancels any pending
timer, so `ConfirmLeave` needs no staleness check of its own: it removes the
member if present.

That deletes the ref from the timer key, the post-delay staleness check and the
duplicate-`Leave` warning, and it makes **Problem C unrepresentable** rather than
fixed: there is no stale timer left to accumulate. The racing reconnect that
forced today's staleness check needs no special handling either. The new stream
is established before the old one's termination arrives, so the set briefly holds
two refs and removing the old one leaves a non-empty set, which is the ordinary
no-timer case rather than a distinguishable one.

**One ordering the conjunct does not cover** is a beacon arriving after its own
stream has already terminated, where the timer is pending before the member goes.
`ConfirmLeave` then fires, removes nobody, and publishes a snapshot identical to
the last. That is the redundant publish this design has already decided is cheap,
under "The no-op publish guard goes with it" above, and it is still nothing
accumulating: at most one timer per departure, and the tab that caused it is gone.

**What replaces the deleted check is `TimerScheduler`**, and the reliance is worth
naming since nothing else now holds the invariant. Pekko guarantees that a
cancelled or replaced timer's message is never received, even when it was already
enqueued, by checking a generation counter on dequeue. That belongs to
`Behaviors.withTimers`, which `Room` already uses (`Room.scala:111`, `202`);
`context.scheduleOnce` returns a `Cancellable` that only suppresses a future send,
so reaching for it instead would reintroduce exactly the race the check absorbed.

Two consequences follow. **A transient drop produces no wire traffic**, since
removing a ref from `connections` changes no snapshot and there is nothing to
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
server still emits a deterministic order, sorted by user id from step 1, purely
so snapshots stay comparable in tests and readable in logs. That determinism is
not a guarantee to build on.

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
  context.log.debug("Publishing to {} connected members", next.connections.size)
  next.connections.foreach { (id, refs) =>
    val snapshot = RoomSnapshot.of(next, id)
    refs.foreach(_ ! snapshot)
  }
  next
```

One snapshot is built per member and shared by that member's connections, since
redaction is per recipient identity rather than per connection.

**`publish` iterates `connections`, not `members`, so `RoomSnapshot.of` has to
tolerate a recipient who is not a member.** The two maps are momentarily out of
step in one direction: section 4's leave endpoint removes the member while that
tab's stream is still open, or while its replacement's is in the late-beacon
case section 4 records, since a ref only ever leaves where the ref is in hand.
The closing tab therefore receives one last snapshot whose `you` is absent from
`users`, and a replacement tab receives them until its rejoin lands, which is
correct rather than a case to special-case and is why the client's `me` lookup
has to cope with `undefined` at all. Section 5 makes that absence a signal
rather than only a state to survive. The opposite skew, a
member with no connections, is not a transient at all but the grace period doing
its job: they keep their row in everyone else's list and receive nothing until
they reconnect or expire. Neither map is derivable from the other, which is the
point of separating them.

**Reveal is a latch set on a vote, not a predicate re-derived per publish.**
`round.revealed` is set by `ShowVotes`, and by a `Vote` whose effect is that
`everyMemberHasVoted` holds; `clear` and `reVote` clear it. `votesRevealed` on the
wire is that flag. Auto-reveal therefore moves server-side, from its current
client-only home, as a transition rather than as a standing condition.

**A standing `round.revealed || everyMemberHasVoted` would let a departure reveal
the round, which is the one thing step 2 buys.** The predicate ranges over a
mutable set, so shrinking the set satisfies it as readily as a vote does: remove
the last member who has not voted and every estimate goes on the wire. Members are
removed at grace expiry and, once section 4's leave endpoint lands, the moment a
tab hits `pagehide` on a page that is being discarded, which a reload is and a
back/forward cache entry is not, section 4 gating the beacon on `persisted` for
the reason recorded there. So under a standing predicate one participant
pressing F5 discloses the room's votes, unrecoverably, and today's six-second
grace plus `ConfirmLeave`'s stale-ref branch (`Room.scala:208-225`) are what keep
that from happening at present. Latching removes the unilateral trigger: a
membership change on its own can no longer reveal anything, so the reload, the
app switch, the slept laptop and the deliberate close all stop being reveals in
their own right, and a later feature cannot bring that back.

**What survives is a departure plus a later vote**, and it is worth stating
rather than leaving to be found. `everyMemberHasVoted` still ranges over
`members`, so removing a non-voter shrinks the set the next `Vote` checks: a
participant whose connection drops past the grace period is removed, the
remaining members finish voting, and the round reveals without them. The same
holds after a `reVote` cast while someone is absent, and in the few hundred
milliseconds a reload costs. Accepted, because the disclosure now needs somebody
still present to cast a vote rather than one person pressing F5, and because the
fix costs more than the case does.

The option not taken is a Boolean on `Round`, set by any member removal and
cleared by `clear` or `reVote`, suppressing the auto-reveal path while set. It
would remove the residual and replace it with a room that silently stops
auto-revealing after any departure, a quieter form of the phantom-member failure
section 4 rejects the `tabId` design for, and the facilitator's Show already
covers the case. Reach for it if the residual is ever observed.

The cost of the latch is that it is the auto-reveal half of Phase 4's latched
reveal, landing early and deliberately. It is taken because the alternative is an
unrecoverable disclosure reachable by a keystroke, not because latching is wanted
for its own sake, and what remains genuinely undecided stays in Phase 4: whether reveal should
survive a `reVote`, and the paired undo and re-hide. It also settles today's
accidental un-reveal, where a joiner flips the room back, which the roadmap had
left to Phase 4 and which now closes at step 1.

`everyMemberHasVoted` reads the `confirmed` flag, not merely the presence of an
estimate. Without that, a `reVote` would leave every estimate in place, so the
first person to re-vote would satisfy the check and the room would re-reveal
instantly. Writing it `members.nonEmpty && ...` rather than as a bare `forall` is
insurance rather than a live case, and the latch is what makes it so: the check
only ever runs on a `Vote`, and a vote implies a member in whatever set the
predicate ranges over, including the voting-members-only set `role` will
introduce. Keep the guard anyway. It costs nothing, and the day somebody
re-derives the predicate somewhere else is the day it matters.

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
   issue and stops a room losing its in-session state, and from step 9 its round
   history, to a coffee break. It lands at step 4.

**Idle means `connections` has been empty continuously for the idle period, and
no message has arrived since the previous tick.** It is a duration rather than an
instantaneous check: `emptySince` is set when `connections` becomes empty and
cleared when it becomes non-empty, and the tick stops the actor once that stamp
is older than the timeout. Connections present means never idle, whether or not
anyone is clicking, and a short emptiness is survivable, which is the
coffee-break requirement above.

**`emptySince` starts as `Some(now)` at the actor's creation and not as `None`**,
which reads as a detail and is not one. A room whose `/events` never follows its
`/join` has connections that are empty without ever having *become* empty, and
that is exactly the never-joined half of the abandoned-room issue this step claims
to close. Written as a transition-only field it would leave such a room running
for the life of the process.

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
interval. The term costs one field, `sawMessage` above, set by any command and
cleared by each tick, and it lets a stray message defer an abandoned room's stop
by one interval, which costs a few kilobytes of memory for a couple of hours. A
message every interval defers it indefinitely, and nothing here bounds the rate,
so step 4 closes the abandoned-room issue against accidental abandonment rather
than against a loop. Bounding the loop is the rate-limiting entry in
`docs/known-issues.md`, which stays open.

**Its two siblings get nothing, deliberately.** `RoomManager` keeps a stopping
room in its map until `Terminated` arrives one hop later, so a `RequestSession`
from `/join`, or a `ValidateToken` from `/events`, can be routed to an actor that
has already stopped. Neither is covered by `sawMessage`, since each can be the
first message after a long idle and so has nothing prior to defer the tick with.
They are left alone because they fail loudly. `RequestSession` times out, the route
answers 500, the client says "Could not join the room. Please try again."
(`index.html:487-491`), and the retry lands on a freshly created room.
`ValidateToken` times out into a 500 on `/events`, which `EventSource` treats as
fatal, so the client shows "Your session has ended. Please reload the page to
rejoin." (`index.html:472-485`) and waits for a reload. That is worse than a
retry, but it is the same thing the client is told when the room legitimately
stopped and the token resolves to nothing, so the race adds no outcome the user
does not already meet. That is the same rule that decides the stack above, that
machinery is bought where being wrong is silent. `ConnectToRoom` earns a field
because it leaves a heartbeating stream that never says anything is wrong; these
two do not.

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

**An actor that may stop on its own owes an answer to whoever is still attached,
and today there is none.** `Source.actorRef`'s materialized ref has no lifecycle
link to the room in either direction, and `completionMatcher` is deliberately
`PartialFunction.empty` (`SSE.scala:71-75`), so a room that stops leaves every
attached stream heartbeating from the `keepAlive` stage with no snapshot ever
arriving again. That is the same symptom `sawMessage` above exists to prevent, from
a second cause, and it is cheaper to close: `Room` handles `PostStop` by sending a
completion message to every ref in `connections`, and `completionMatcher`
recognizes it. The comment quoted above therefore becomes the thing being changed
rather than a rule to preserve.

Idle stop is not the cause, since `connections` is empty whenever the tick fires.
The live cause is a crash, where Pekko typed's default supervision stops the actor,
and the future one is the deferred destroy-room action, which currently has no way
to evict anybody. What the client does next is the existing terminal path and an
improvement on silence: a completed stream is a transient close to `EventSource`,
so it retries, gets a 401 because the room is gone and its token resolves nowhere,
and shows "Your session has ended. Please reload the page to rejoin."
(`index.html:472-485`). Rejoining automatically under the remembered name belongs
to step 8's connection module.

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
additive. It is section 3's join taken at the moment of the append, so it counts
the participants the snapshot was showing and equals the client's own
`votesSummary` by construction rather than by both sides tallying carefully; a
voter who leaves between the reveal and the append drops out of the record, which
is the direction the participant list moves anyway. And **`recordedValue` is a
product gap rather than a storage choice**:
teams often resolve a split by talking it out rather than re-voting, and the app
has no concept of a settled estimate at all, so it implies a facilitator command
and a snapshot field. That is a new Phase 4 roadmap entry, and it fits the
property this architecture is built on, a feature being a field plus a command
with no new branch in `applySnapshot`.

**It travels on the snapshot rather than through an endpoint of its own**, so the
history view is a render over state the client already holds and step 9 stays a
field plus a command. Section 2 sizes that and names the round count at which the
trade would reverse.

**Only a revealed round can enter `history`, and that is an invariant rather
than a consequence of whichever commit point wins.** A `RoundRecord` carries no
personal data, but its `distribution` is the round's aggregate spread, and
unlike every other field on the snapshot it is shared by reference rather than
built per recipient, so it reaches everyone unredacted. Appending a round nobody
revealed would publish the shape of the votes step 2 exists to keep hidden, and
a room voting that issue again would be anchored by it in aggregate. So the gate
is that every participant could already see every estimate, reached either by a
plain `ShowVotes` or by the latch above. What makes that true of the aggregate
and not merely of the round is that `distribution` is the join: an estimate
belonging to somebody who left before the reveal sits in `round.estimates` and
never reaches the record.

**Open, and a product decision rather than a technical one: what completes a
revealed round.** Either the facilitator recording a value is the commit point,
or a `clear` of a revealed round appends with no outcome. Both sit behind the
reveal gate above, which is the part this design fixes; the choice follows the
selection UI and is specified when step 9 starts. Cheaper to change than it was
when this was a table, since the shape is in memory and lasts an hour.


### 4. Identity and the write path

The 08-20 cookie design carries over unchanged: `HttpOnly`, `SameSite=Strict`,
`Secure` behind `apiConfig.secureCookies`, no `Max-Age`, and `Path=/rooms/:slug`.

**A person is one participant in a room, however many connections they hold.**
The cookie is the identity, it is shared by every tab on that room, and that
sharing is the design rather than the defect. What was broken is narrower: `/join`
mints a fresh `userId` and overwrites the cookie on every call, so a second tab
does not join the first tab's identity, it *replaces* it, and the first tab's
clicks then land as the second participant's. Idempotent `/join` below fixes that
by resolving the existing cookie instead of minting over it.

**An earlier draft made two tabs two participants**, via a `tabId` from
`sessionStorage` carried in the cookie's path so the browser would keep them
apart. It is dropped, for three reasons in increasing order of weight.

It does not work. `sessionStorage` is per browsing context, and the HTML standard
makes a context cloned from another start with a copy of it, which is what Chrome
and Edge do on "Duplicate tab". Two tabs can therefore hold one `tabId`, one
cookie and one token, and the mechanism's central claim, that a collision is
unrepresentable rather than merely unlikely, is false. A guaranteed per-tab id is
still reachable through the Web Locks API, so this alone would be an argument for
repair rather than removal.

It is not the requirement. Nobody is expected to open two tabs on a room. The one
case that occurs is a tab freezing and the user opening a replacement, and two
participants is the wrong answer to it: the replacement arrives with no vote and
the frozen one lingers as a phantom. One participant with two connections gives
that user their identity, their vote and their state back, and the frozen
connection costs only a few wasted sends until its stream fails to write and drops
out, which "Two lifetimes" covers.

And it is actively harmful once reveal moves server-side at step 1. Auto-reveal
asks whether `everyMemberHasVoted` over `members`, so an extra tab is a
member who never votes, and one person opening a second view would block
auto-reveal for the whole room until they voted in both. The earlier text called
two votes for one person "harmless"; the blocked reveal is not, and it postdates
that sentence.

The cost accepted in exchange is that two tabs on a room share one vote and see
each other's, which is what a second view of the same participant should do.

Three additions, each closing something documented:

- **Retained sessions**, kept past promotion rather than consumed. **What this
  mainly fixes is recovery from an outage longer than the grace period**, which
  today forces a manual reload. The member is removed at grace expiry, and because `joinUser`
  consumes the session on promotion the token's only record went with it, so
  `EventSource`'s retry gets a 401 and the client shows "Your session has ended.
  Please reload the page to rejoin." (`index.html:472-485`). The retry interval
  is 2 seconds, so a blip inside the grace period recovers silently and a slept
  laptop does not. With retention the token still resolves, the retry succeeds,
  and the same identity comes back. It is also what keeps a tab's token
  resolvable for the idempotent `/join` below, and what lets `sessions` be the
  single authority for resolution in section 3.

  **They carry no TTL of their own**, and the earlier draft's one is dropped. A
  session lives as long as the actor, which step 4 already bounds at two to four
  hours after a room empties, so a TTL would bound something already bounded: its
  useful range is squeezed below by needing to outlast a realistic in-meeting
  outage and above by the idle stop, leaving about an hour, to reclaim a hundred
  bytes per abandoned session. That is the same test this design applies to
  `version` and `scale`. What it leaves is a room occupied for many hours with
  heavy tab churn, which is abuse-shaped and belongs to the rate-limiting entry
  in `docs/known-issues.md` rather than here. The pending-session leak therefore
  closes at step 4 rather than step 5.
- **Ask-pattern commands**, so a client can distinguish rejected from lost.
  This is Phase 1's outstanding item and it is what makes real error handling
  possible in the rewritten frontend.
- **An explicit leave endpoint** hit by `navigator.sendBeacon` on `pagehide`. It
  removes the member at once, rather than waiting out the grace period, if that
  member holds at most one connection; if they hold two or more it does nothing.
  That is the other reason, and it reduces the grace period to what it should be:
  cover for transient drops only. `sendBeacon` is the right primitive because a
  normal POST is not reliably delivered from an unload-adjacent handler.

  **The beacon fires only on a page that is being discarded**, gated on
  `pagehide`'s `persisted` being false. A page entering the back/forward cache,
  which is what a mobile app switch and a same-tab navigation away produce, can
  be restored without a page load, so nothing would call `/join` again and the
  member would stay removed under a live page. If the freeze did not kill its
  stream, that page keeps receiving snapshots whose `you` is absent from `users`
  and renders a healthy room in which its own commands are silent no-ops, since
  a resolved non-member is section 3's no-op case. Gating on `persisted` removes
  that case instead of recovering from it, and it leaves the two triggers this
  endpoint is for untouched, a close and a reload both being discarded pages.
  It does not distinguish a reload from a close, which is the separate question
  the cookie paragraph below answers.

  **The test is cardinality rather than identity, because the request cannot name
  a connection.** All it carries is the room-scoped cookie, which resolves to a
  `userId`, and section 1 keeps tabs and connections out of every path, so nothing
  selects one ref out of that member's set. A ref is only ever removed where the
  ref is in hand, on `ConnectionCompleted` or `ConnectionFailure`. So the endpoint
  answers the one question it can: is this member down to their last connection,
  in which case removing the member is what the beacon is for, or do they hold
  another, in which case the closing tab's own ref drops through stream
  termination a moment later and membership was never in question. Zero refs and
  one ref take the same branch, which absorbs a beacon arriving after its own
  stream has already torn down.

  A client-minted connection id carried on `/events` would make the test exact,
  and it is the same per-connection slot the command-cursor row under "Deferred,
  with triggers" says a cursor would have to live in. It is not worth a wire field
  for a case this section argues does not occur, and the late beacon below, which
  does occur, is answered by section 5's rejoin more cheaply than a wire field
  would answer it. Reach for it on the day the cursor does.

  **The case cardinality does not cover** is two tabs closed near-simultaneously:
  both beacons see a set of two, both do nothing, and that departure falls back to
  the grace period. Rare, and the outcome is today's behaviour.

  **It clears no cookie, and that is deliberate.** `pagehide` fires on reload as
  well as on close and nothing on the event tells the two apart, so a leave
  response carrying `Set-Cookie: …; Max-Age=0` would delete the identity of a tab
  that is about to come back. `sendBeacon` is fire-and-forget besides, so that
  response could land after the reloaded page had already called `/join`,
  deleting the cookie it just received and dropping the tab into the terminal
  "Your session has ended" state (`index.html:472-485`). What clearing would buy
  is a session cookie of roughly fifty bytes per tab ever opened, discarded when
  the browser closes, which does not pay for the reload path.

  **A late beacon can outlive the reload it belongs to**, and the consequence for
  membership is worth following through as well as the one for the cookie.
  Arriving after the new page's `/join` and `/events` have recreated the member
  with a single connection, it meets exactly the cardinality this endpoint acts
  on, so the removal lands on a page that is up and connected and left holding an
  open stream as a non-member. The ordering is unlikely, the beacon leaving
  before the new document starts loading, and it is not something to rely on:
  section 5's rejoin on a snapshot that does not name the client as a member is
  what recovers it, which is why that rule lands with this step rather than with
  step 8's module.

  **The cost is a brief flicker on reload**, since the beacon fires there too and
  a reload's tab is usually the member's last connection: the member is removed
  and comes back across a page load, so the room sees a departure and a return a
  few hundred milliseconds apart. Accepted deliberately. The user loses nothing,
  keeping their identity through the cookie and their vote through
  `round.estimates`, and the alternative is a short grace period of the endpoint's
  own, which puts a second duration constant on the one path built to avoid a
  timer. Reconsider that if the flicker turns out to annoy anyone.

  **The flicker is cosmetic almost entirely because reveal is a latch.**
  `pagehide` fires on a reload, so without section 3's latch this endpoint would
  hand any participant a one-keystroke way to reveal the room's votes by removing
  themselves as its last non-voter. That is the dependency to keep in mind if
  anyone ever reopens the reveal derivation. What the latch leaves is the residual
  section 3 records, a vote from somebody still present landing inside the gap and
  completing the shrunken member set, which needs another participant to act and
  is accepted there.

**`/join` becomes idempotent**, and it is the whole of the fix above. If the
request's cookie already resolves to a live session it resolves to that `userId`
instead of minting a new one and overwriting the cookie; nothing of it reaches the
response body, which section 2 empties at this step. A reload therefore keeps
its cookie, its token, its `userId` and its vote, and a second tab joins the
existing participant rather than displacing it. There is no question of resuming
somebody else, since the cookie is path-scoped to the room and arrives only from
a browser that was already given it.

It does take the `name` from the request rather than ignoring it, so joining again
under a different name renames the participant instead of silently keeping the old
one. That is today's effective behaviour, which reaches the same place by creating
a second participant, and it is the nearest this app has to a rename. It writes
that name to the `Session`, and to the `Member` only where one already exists;
section 3 says why `/join` never creates a member. The consequence to know is that
a second tab opened with a different name renames the person in both.

That matters because the reload, not the tab close, is the form users actually
report: today `/join` mints a fresh identity on every call, so someone reloading
watches their own name sit in the participant list twice until the old entry's
grace period expires. Idempotence removes the second entry structurally, rather
than by hoping a `sendBeacon` wins a race against the new page's join. What is
left is the brief gap recorded with the leave endpoint above.

### 5. Client

```js
// prev is { issueFocused, currentIssue }; returns the next view state, mutating nothing.
export function applySnapshot(prev, s) {
  const me = s.users.find(u => u.id === s.you);
  const tally = {};
  // The `u.voted` filter arrives at step 3, with the template guard it requires.
  for (const u of s.users) if (u.voted) tally[u.estimation] = (tally[u.estimation] || 0) + 1;
  return {
    inRoom: true,
    users: s.users,
    votesRevealed: s.votesRevealed,
    // Do not clobber the issue input while the user is typing in it.
    currentIssue: prev.issueFocused ? prev.currentIssue : s.currentIssue,
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

**The returned object is the shape the rewritten client will hold**, not today's.
Six of its seven keys already match a top-level entry in the Vue 2 `data` block
(`index.html:335-356`), so the step 1 call site assigns it wholesale and adapts
the one that does not: `userEstimation` onto `user.estimation`, which the template
binds (`index.html:222`, `231-233`). Step 8 flattens that and the adapter goes.

Three details are load-bearing rather than polish:

- **The issue-input guard is mandatory here.** `currentIssue` is `v-model`-bound
  to the issue input. Under the event protocol only an `edit_issue` broadcast
  could clobber in-progress typing; under snapshots every publish carries the
  issue, so any vote by anyone would wipe the edit box mid-keystroke. The 08-28
  design correctly called this out of scope for an event protocol and correctly
  in scope for this one.

  **What the guard keys on is focus, and that has to be a flag of its own.**
  `editing` cannot be it. It swaps the readonly input for the editable one and its
  commit button (`index.html:191-207`), and its only writers are `showEdit`
  (`:366-368`) and `doEdit` (`:519-520`), so as a guard it lasts until the user
  presses the check rather than until they stop typing. Someone who opens the
  editor and clicks away then stops applying `currentIssue` from every later
  snapshot for the rest of the session, estimating against a ticket the room has
  moved on from while their participant list and votes keep updating normally. That
  is worse than the behaviour it replaces, where `edit_issue` clobbered the box:
  the user lost their typing but stayed in sync.

  So step 1 adds `issueFocused`, set by `v-on:focus` and `v-on:blur` on the
  editable input, and the guard reads that. **The two flags must stay separate,
  and this is the part not to simplify later.** Resetting `editing` on blur would
  tear out the subtree holding the commit button on the very blur that pressing it
  causes, so the click could never land and the edit would be dropped in silence.
  `issueFocused` drives no `v-if` and appears nowhere in the template, so nothing
  re-renders when it changes and the button behaves exactly as it does today; it
  does not even need to be reactive. The readonly input gets no handlers, so
  focusing it does not arm the guard. What the user sees, parked in edit mode, is
  the box resyncing to the room's value, which is the right outcome for an edit
  they have not committed. An explicit cancel belongs with step 8's component, as
  does any affordance for "someone else changed the issue while you were editing".

  Two windows stay open, both narrow. The blur precedes the commit click, so a
  snapshot landing in that event-loop gap would have `doEdit` post the room's value
  rather than the user's; deferring the blur reset by a tick closes it if it ever
  bites. And `doEdit` clears `editing` before its POST, so a snapshot arriving
  during that round trip reverts the displayed text until their own edit lands.
  Step 6's ask-pattern reply is what makes the second reportable, the same way it is
  for a failed vote.
- **The tally counts only participants who have voted.** Today
  `updateSummary` tallies every user, so a non-voter's empty string becomes a
  summary row and in a revealed room with stragglers can win the count and
  render as the "Most voted estimation". Fixing it makes the tally able to be
  empty, so the summary block's condition becomes
  `v-if="votesRevealed && votesSummary.length"`. That guard is reachable by two
  clicks (Show in a room where nobody voted), not defensive.

  **The two must land in the same step, and the reason is stronger than
  tidiness.** The block renders `{{ votesSummary[0][0] }}` (`index.html:268`)
  under `v-if="votesRevealed"` alone, so an empty tally is a render error rather
  than an empty box. Today that is unreachable only because the buggy all-user
  tally is never empty while anyone is in the room, and the one path that empties
  `votesSummary` (`clear`) also clears `votesRevealed`. So the voted-only filter
  without the guard is a regression this design would introduce, not a
  pre-existing bug left standing, which is why the filter is annotated in the
  `applySnapshot` block above as arriving at step 3 rather than with the rest of
  that function at step 1.

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

**A snapshot whose `you` is absent from `users` means the server no longer holds
this identity as a member**, and the client treats it as a signal to rejoin
rather than as a room to render. It lands at step 6, in today's client, because
that is the step whose leave endpoint makes it reachable: a beacon outliving its
own reload removes a member whose replacement page is already connected, which
section 4 records. In the Vue page it is a few lines in the message handler
calling the existing join path, and step 8's module inherits the rule rather
than introducing it. **It has to close the current `EventSource` before
reopening**, since `doJoin` does not, and a rejoin that left its old stream
running would manufacture the interleaving hazard described below.

**The rule needs no "unless I am the one leaving" guard, and adding one would
hurt.** A tab that asked to leave cannot reach the rejoin: `doLeave` closes its
own stream as its last act (`index.html:511-518`), so no snapshot follows, and a
beacon fires only on a page being discarded, which has no live document to rejoin
from. The one path that does deliver a snapshot naming its recipient as a
non-member is the replacement page in section 4's late-beacon race, and there
rejoining is the point. A `leaving` flag would also have to be cleared on
`pageshow`, since `pagehide` fires into the back/forward cache too, and getting
that wrong leaves a restored page never rejoining, which is a quieter form of the
failure section 4's `persisted` gate removes.

`applySnapshot` still copes with `me` being `undefined`, since it stays pure and
the teardown window can deliver one such snapshot to a page on its way out. This
is the consumer the `you` field's own argument in section 2 implies: the field
exists so that who a snapshot was redacted for and who the client thinks it is
cannot silently disagree, and this is the one disagreement the design can still
produce. Section 4's `persisted` gate closes the other route to it, a page
restored from the back/forward cache, and the rejoin also covers whatever later
feature removes a member while a stream is open. What neither covers is a
restored page whose stream is dead but silent, which is the backlog's
connection-liveness watchdog rather than this field.

No client-side version comparison, because out-of-order snapshots are
unreachable: SSE delivers in order within a connection, and a snapshot is one
frame. What that argument needs is one connection per page instance, and **that
guarantee now rests on the client alone.** The server used to supply it as a side
effect of `connections` being keyed by user, where a rejoin replaced the entry and
the superseded stream received nothing further. With a set of refs per member both
streams are fed, which is the point when the second is another tab and a hazard
when it is the same page instance holding a stream it forgot to close: two live
streams can interleave, so a delayed frame from the older one may apply after a
newer frame from the other and leave the view stale until the next publish.
Today's client does forget, since `doJoin` assigns a new `EventSource` without
closing the previous one (`index.html:388`) and only `doLeave` closes. Step 8's
connection module closing the old stream before opening a new one is therefore
load-bearing rather than tidy. Nothing in today's flow reaches `doJoin` twice
without a reload, so the exposure is nil until step 6, whose rejoin is the first
path that does and which closes the stream itself for that reason. This is the
one guarantee the design moves from the server to the client and it should not be
lost on the way.

### 6. Testing

`RoomSpec`'s existing cases remain the behaviour specification. Its reconnect
tests hand-construct the reconnecting user via `user.copy(ref = ...)`
(`RoomSpec.scala:185`, `:280`), which preserves vote state by construction and
therefore never exercised the real `ConnectToRoom` path; they should go through
`ConnectToRoom` so they would catch a regression. That lands at step 1, beside
Problem A's fix, since vote loss on reconnect is the regression they would have
caught.

**`BackpressureReconnectSpec` is retired at step 1, not ported.** Its single case
asserts that a stalled client's stream fails and silently reconnects, which is the
`OverflowStrategy.fail` behaviour `dropHead` deletes: under snapshots the stall
resolves by discarding a superseded element and no reconnect happens. Its
replacement is the opposite assertion, that a stalled client's stream stays open
and receives the newest snapshot rather than a queued stale one, which is the
property `dropHead` is chosen for and which nothing else covers. The 124 lines go
with the case.

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
  participant list on join and leave, and the issue-input guard.

  **"Reconnect survival" at step 0 is the two list assertions**, no duplicates
  and a departed participant pruned, which are the pair marked `test.fail()`.
  It is deliberately not the vote-survival assertion: today a reconnecting
  browser keeps its own `user.estimation` and every other browser keeps its stale
  `users` entry, so a case asserting that a vote outlives a reconnect passes on
  stale client state while the room has already reset that participant, and it
  would stay green through the very change it looks like it guards. That
  assertion arrives at step 1 with Problem A's fix, alongside the `RoomSpec`
  cases moved onto `ConnectToRoom` for the same reason.

  Step 1 adds two on the issue input, cheap and guarding a trap: the box resyncing
  to the room once the editor loses focus, and an edit committed with the check
  button reaching the other browser, since a guard scoped to the flag that renders
  that button would break it in silence. Step 2 adds the one case that protects the
  confidentiality property, a straggler departing while everyone else has voted
  leaving the votes hidden, run for both a deliberate close and a reload, those
  being the two triggers the reveal latch exists to neutralize. The reload variant
  only turns hostile at step 6, where the beacon makes a reload a departure, which
  is the argument for writing it at step 2 rather than beside the change that would
  otherwise break it unwatched. There is deliberately no case for the grace timer
  the leave endpoint makes redundant: a timer that fires into a no-op has nothing
  observable to assert on, and `RoomSpec` is where it would belong if anywhere.

  Step 6 adds two that need one browser context rather than two, since they are
  about the shared
  room cookie: two tabs on the same room resolving to one participant, with a vote
  in either showing in both and closing one leaving the other connected and
  present; and a reload keeping its identity and its vote instead of duplicating
  its participant. The rejoin on a snapshot that does not name the client as a
  member is not one of these, since the race that produces it cannot be forced in
  a browser; it is a unit test over a snapshot fixture instead.
- **A contract test** (step 8, when the client first has generated types to
  check) taking a real server-produced snapshot and validating it against the
  client's types. **This is the drift gate for `RoomSnapshot`, not a cheap stand-in
  for one.** tapir describes HTTP endpoints, and the snapshot is not one: it
  travels as JSON inside a `text/event-stream` body, where tapir sees a stream of
  `ServerSentEvent` whose `data` is a `String`, so the generated document covers
  the command endpoints and omits the one type the client models. Getting it in
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

- **Two toolchains**, from step 0 rather than step 8, since gating the e2e
  suite puts `npm ci` and a browser install on CI before any protocol work
  lands. The node toolchain arrives regardless (Phase 3 needs a build, and the
  harness needs Playwright), so the marginal cost is keeping an sbt setup that
  already works and is already maintained by Scala Steward.
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
| An explicit destroy-room action | Wanted as a convenience. Nothing needs reclaiming now that rooms are memory-only. Step 4's stop-time stream completion gives it the one mechanism it would otherwise have to invent, a way to evict whoever is still attached. |
| Durable storage of any kind (a Postgres `rooms` table, or a whole-blob JSON snapshot in Cellar) | Someone wanting round history across sessions, or a truthful 404 becoming worth a database. See "No durable storage". A prior draft specified the Postgres version in full, including row TTLs, an expiry predicate and a sweeper; that analysis is in this file's history if it is ever needed. Between the two, Cellar is the simpler starting point on complexity grounds, since it needs no migration tool, no SQL and no database in CI. |
| Observer roles | Phase 4, unchanged. A field plus one change to what "everyone has voted" means. |
| Latched reveal, the part that is left | Phase 4. The auto-reveal half lands at step 1, because a re-derived predicate lets a departure disclose the round: see section 3. What stays deferred is whether a revealed round should survive a `reVote`, and it should ship with the backlog's undo and re-hide. Today's accidental un-reveal, where a joiner flips the room back, closes at step 1 rather than here. |
| Idle indicator | Phase 5. Unlike the two above it is not only a field: it needs server-side activity tracking and a timer, and it publishes on a transition nobody commanded. |
| Timer-based fallback reveal | Phase 4, but the least settled thing in it. Four open product and UI decisions, not a field: whether it runs for every round, whether the facilitator starts it, the duration and whether it is fixed or per room, and whether a running countdown can be cancelled when discussion breaks out. The countdown is also the first roadmap item needing a UI surface of its own. |
| Persisting live round state | A zero-downtime deploy requirement, already deferred to its own spec under Phase 5. Until then, a restart warning and deploying outside meeting hours. |
| Client-assisted round recovery | Someone complaining about a restart mid-meeting. Each client re-asserts its own vote on reconnect and the round rebuilds from whoever returns. Needs a round identity on the snapshot so a stale vote cannot land in a new round. |
| Durable auth sessions | Wanting identity to survive a browser close. `localStorage` already covers name pre-fill. |
| Multi-instance operation | Out of scope by decision; single process throughout. |
| Event-sourcing the room | Never, on the same grounds that pick snapshots for the wire. Round history is a product feature with its own shape, not a projection anyone needs to rebuild. |
| Per-command sequence numbers | Someone actually observing a reordered command. Under snapshots a reordering is visible rather than silent, since the client converges on what the server holds: the wrong card stays highlighted, or a vote outlives a clear, in front of everyone. `lastSeq` is live state re-derived per session, so it is free to add then and would otherwise need `/join` to reset it, a coupling that bites silently. If it is ever added, note that a member can hold several connections, so a cursor kept per user is wrong: one connection would suppress sends the other still needed. It belongs on the connection. |
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

Ten steps, numbered from zero. The numbers are labels rather than a queue; each
states what it actually waits on. Line counts are rough.

| Step | Waits on |
| --- | --- |
| 0 Characterization harness | nothing |
| 1 Snapshot protocol | nothing, though safer after 0 |
| 2 Pre-reveal vote confidentiality | 1 |
| 3 Vote summary correction | 1 |
| 4 State split, plus stop-after-idle | 1 and 5 |
| 5 Retained sessions | 1 |
| 6 The write path becomes real | 4 |
| 7 Slug room ids | 4 and 6 |
| 8 Frontend rewrite | 1 and 6 |
| 9 Recorded value and round history | 8 |

One landing sequence that satisfies all of it: **0, 1, 2, 3, 5, 4, 6, 7, 8, 9**.
Steps 2, 3 and 5 are mutually independent, as are 7 and 8; what is fixed beyond
the table is that 2 and 3 precede 4, for the reason under step 3.

**Steps 0 to 6 close every documented defect this path closes at all.** Step 7 is
a usability improvement, and 8 and 9 are product work whose case is the
roadmap's rather than this document's. That matters because the roadmap is
projections under an agile process rather than commitments, so argument 7 above
carries exactly as much weight as the roadmap does on the day someone reads it.
Stopping after step 6 leaves a correct app whose only open defects are the three
recorded as staying open: HTTP command ordering, rate limiting, and the page's
runtime dependency on three public CDNs. A fourth entry
stays open as well, the silent auto-create on an unrecognized room id, which the
table below reclassifies as the primary use case working rather than as a
defect.

**Step 0. Characterization harness.** The stub buffering proxy, the browser
harness, and Playwright cases pinning today's behaviour. Waits on nothing.
About 220 lines and 200 of tests.

Front-loaded for a different reason than the 08-30 design gave. Its original
justification was reproducing the proxy failure; the surviving one is that there
are no end-to-end tests today and step 1 is the largest behavioural change in
the set. Three caveats belong in it.

**Cases covering behaviour that is currently buggy** (the non-voter tally, the
duplicate participants, a participant who departed during the gap going unpruned,
a Show surviving someone joining, and an auto-revealed room staying revealed when
a straggler arrives) characterize the *intended* behaviour, so they would arrive
red, and a suite red on arrival cannot answer "did I break something" during
exactly the steps it was built for. They are marked `test.fail()` instead,
annotated with the step that fixes each. Playwright fails
the run when such a test *passes*, so the suite is green from step 0, a
regression during steps 1 to 3 still shows, and the moment a fix lands CI reports
the stale annotation rather than leaving anyone to notice. Those annotations are
a small ledger of known-broken-until-step-N that will drift from the known-issues
table; the annotation is the authority, being the one that fails the build when
it goes stale.

**The browser suite is gated in CI from this step**, which is a change to the
08-30 design rather than a restatement of it, and the sentence above depends on
it: an annotation nobody's build reads is a note, not a ledger. The 08-30 design
deferred CI integration on 08-28's schedule, where the suite's worth "peaks
immediately before the Phase 3 framework migration". Phase 3 is step 8 here,
while the suite is the regression net for steps 1 to 3, so the deferral is seven
steps too late for the job it was front-loaded to do, against 08-28's own
warning that a suite nothing runs automatically rots worse than a manual
checklist. The cost is `npm ci` and a `playwright install --with-deps
chromium firefox` on the job that already stages the app, both engines because
08-30 measured them disagreeing on exactly this streaming edge and runs the
reconnect case in both. Its app and stub fixtures are worker-scoped, so the
suite parallelizes rather than paying a JVM per case. The
`docs/known-issues.md` entry 08-30 promised for the ungated gap is therefore
never written.

**Step 8 will revisit selectors**, so prefer accessible ones.

**Step 1. Snapshot protocol.** The wire format, `publish`, pure
`applySnapshot`, `dropHead`, the anti-buffering headers and README note, plus
Problems A and E. Deletes `RoomEvent.scala`, `broadcast`, `setupNewUser`, 89
client lines, `ConnectionFailure`'s now-unreachable `BufferOverflowException`
branch, and `issueLastEditBy` with the `userId` argument `RoomData.editIssue`
takes only to write it (`Room.scala:96-97`, `:234`), section 2 having no reader
left for it once the replay goes. Waits on nothing, though much safer after
step 0. About 170 added, 190 deleted, 200 of tests. Independently releasable, and it closes four
things: both reconnect bugs, the reveal-on-resync issue and the
proxy-buffering documentation issue.

**Everything in this step is built against today's `RoomData`**, since
`RoomState`, `Round`, `members` and `connections` arrive at step 4 and section 3
is written entirely in their terms. `publish` is one pass over `users`, sending
`RoomSnapshot.of(data, u.id)` to that user's own `ref`; the per-member set of
refs, and one snapshot shared across a member's connections, arrive with step 4.
Here a user has exactly one ref, since `joinUser` replaces the whole entry on a
reconnect rather than accumulating. `voted` on the wire is `User.voted`,
already the confirmed flag since `reVote()` keeps `estimation`
(`Room.scala:85-89`), and step 2's `hasEstimation` is `estimation.nonEmpty`
rather than an entry existing in a map.

**`applySnapshot`'s tally keeps counting every participant here**, matching
today's `updateSummary`, and the voted-only filter waits for step 3 to land it
together with the template guard. Do not move it forward: the summary block
dereferences `votesSummary[0][0]` under `v-if="votesRevealed"` alone, so a
voted-only tally without that guard turns Show in a room where nobody voted into
a render error. Section 5 has the detail. Every key of the returned object is
already its target shape; this one line of the body is not.

**The stored `revealed` flag does not exist today and this step adds it**, which
is the mapping worth stating outright. `ShowVotes` broadcasts and returns
`Behaviors.same` (`Room.scala:173-181`), so reveal lives only as a client-side
flag, and a Show pressed while a straggler has not voted is silently dropped on
resync. `RoomData` gains `revealed: Boolean`, `ShowVotes` sets it, `Vote` sets it
when every user in `users` is then voted, and `clear()`/`reVote()` clear it beside
the vote fields they already touch. That flag is Problem E.

**The flag is a latch and not a per-publish derivation, from this step onward.**
Section 3 has the reasoning; the part that matters here is that writing it as
`revealed || everyUserHasVoted` at publish time would make a departure reveal the
round, which step 2 then turns into a disclosure rather than a display toggle. So
`Vote` is the only thing besides `ShowVotes` that may set it. It retires today's
client-side `allVoted()` (`index.html:553-554`), which is what makes the two
reveal cases step 0 marked `test.fail()` intended rather than regressions.

**Problem A is fixed here too.** `RoomManager.ConnectToRoom` builds the `User`
it sends with `InitialVoteState`/`InitialEstimation` (`RoomManager.scala:81-84`)
and `RoomData.joinUser` (`Room.scala:66-74`) replaces the existing entry
wholesale, so a reconnect resets that participant's vote in the room's own
state. Under events the loss was quiet; under snapshots it is immediately
republished to everyone. The fix is one method, `RoomData.joinUser`
(`Room.scala:67-74`), whose only call site is `Room.scala:130`: it keeps `voted`
and `estimation` from the existing entry and takes
everything else from the incoming user. Taking the rest is safe because only
`ref` actually differs on a reconnect, there being no rename feature and
`EventSource`'s retry reusing the existing session cookie rather than calling
`/join`.

**Problem C is not in this step**, and moves to step 4, which makes it
unrepresentable. Its urgency was bounded mode's reconnect cadence; without that,
a superseded timer is one wasted `ConfirmLeave` per reconnect, which is today's
behaviour and has never been observed to hurt. Fixing it here means re-keying the
timer on `userId` alone plus moving the staleness check to `Leave` time, where
getting only the first half produces a phantom participant for the life of the
process, and step 4 deletes all of it anyway.

The deterministic sort by user id lands here, as part of the wire format. That
is also what keeps participant order stable across the reconnect above, so
`joinUser` may keep prepending and order stops depending on it at all.

One caveat to carry rather than delete with the code it annotates. The comment
at `Room.scala:125-130` is the code's only pointer to 08-24's empirical finding
on the connection-establishment race, and that finding asks for a re-check if
the hop chain is ever restructured. Deleting `setupNewUser` takes the pointer
with it. The chain is unchanged here and the send gets smaller, one snapshot in
place of a batched replay, so restate the caveat on `publish` rather than
re-running the trials.

**The anti-buffering headers need an assertion and not only an implementation.**
`APISpec`'s "open an SSE events stream for a resolved session" is where it
belongs, beside a route test that already exists. Step 0's stub cannot stand in
for it: the stub buffers on its own flag and never reads the upstream response
headers, so `test/reproduction.test.js` passes identically before and after this
step. Whether a stub mode that honours the hint is also worth having is a
question about the stub's fidelity to nginx rather than about this app, and it is
better answered here, against a header that exists, than assumed at step 0.

**Step 2. Pre-reveal vote confidentiality.** Per-recipient redaction,
`hasEstimation`, and the `showUserEstimation` change. Waits on step 1. About 20
and 50. Separate because it wants a reviewer thinking about what is on the wire
rather than how state is shaped.

**Step 3. Vote summary correction.** Voted-only tally plus the template guard.
Waits on step 1, independent of step 2. About 5 and 25. Separate because it is
the one change a user notices as a different answer rather than better plumbing.
**Its two halves are atomic**, and this is the one place in the path where
shipping half a step breaks the app rather than leaving it unimproved: section 5
says why the filter without the guard is a render error.

**Steps 2 and 3 should land before step 4, not merely after step 1.** Both are
specified in terms of today's `RoomData`, as step 1 is: `hasEstimation` is
`estimation.nonEmpty` and the tally reads `User.voted`. Taking step 4 first does
not break them, but it re-expresses both against `round.estimates` and costs the
translation twice. Step 2 in particular wants to be early on its own merit, being
the confidentiality fix.

**Step 4. Transport and state split, plus stop-after-idle.** `RoomState`,
`Round`, `members` and `connections`, replacing the room actor's
stop-when-empty with an idle timeout, completing attached streams on stop, and
Problem C. Waits on steps 1 and 5. About 150 changed and 110 of tests.

**It waits on step 5 because `Member` carries no token.** Resolution moves
entirely to `sessions`, and sessions are only resolvable past promotion once step
5 retains them, so landing this first would leave a connected client's token
resolving to nothing and turn every reconnect into an immediate 401.

**It waits on step 1 for cost rather than correctness, and that is the one
dependency here worth arguing with.** Landing the split first means porting
`broadcast` and `setupNewUser` onto `members`, `round.estimates` and
`connections`, keeping `issueLastEditBy` alive to do it, and deleting all of it
one step later; the larger half of that bill is tests, since `RoomSpec` is 510 of
the project's 1,434 test lines and is written in event assertions throughout, so
they would be rewritten for the new state model and again for snapshots. Against
that, the current order pays for stating every rule in steps 1 to 3 in two
vocabularies, today's and section 3's, and for the throwaway Problem A fix below.
The only structural constraint is narrow and does not favour either order:
`Round.revealed` has no consumer until
something carries it, so the latch belongs to whichever step brings the wire
format.

The split itself is a pure refactor; **the idle timeout is the only behaviour
change a working room can observe in this step**. Completing attached streams on
stop changes only what happens to a room that has already stopped or failed, which
section 3 covers. `connections` is a set per member from the start, but
until step 6 makes `/join` idempotent it holds a second ref only transiently,
across the racing reconnect section 3 describes, so nothing observable turns on
it here. The timeout stops a room dying the moment its last member's grace
period expires, six seconds into a coffee break, taking the session's round
history with it, and it closes the abandoned-room GC issue. Section 3 has the
reasoning, including what "idle" means and why message silence is not it.

The idle timeout also deletes the stop path it replaces, which is worth claiming
because this step's diff is otherwise additive. `ConfirmLeave` no longer stops
the actor, so it always answers `Running`; `Room.Stopped`, the `Stopped` case of
the `Response` ADT, and `RoomManager`'s `removeRoom` call site all become
unreachable.

**Take the whole reply channel with them, not just the `Stopped` half.** A
`Running` whose only handler is `case Room.Running(_) => Behaviors.same`
(`RoomManager.scala:107`) is the no-consumer case this design applies to
`version` and `scale`, so `Response` and `Running` go, `replyTo` leaves `Leave`
and `ConfirmLeave`, and with them go `RoomResponseWrapper` (`:27`), its handler
(`:105-110`), the `roomResponseActor` adapter (`:59-60`) and the
`roomResponseWrapper` parameter threaded through `receiveBehaviour` and its seven
recursive calls. That takes `RoomManager.receiveBehaviour` from three parameters
to two. Most of the test churn is mechanical probe wiring, only
`RoomSpec.scala:231` and `:257` asserting on a value, and step 4 is rewriting
those cases for the split regardless. **Step 6's leave endpoint does not revive
this**: its reply is an ask answered to the HTTP route, carrying the
applied / not-a-member results the ask pattern is for, so a `Response` ADT
reappearing there is a new type under an old name rather than this one returning.

`Terminated` (`RoomManager.scala:163-165`) becomes the single
deregistration path, which it has to be anyway, since it is the only one that can
observe a self-initiated stop.

Flag for its reviewer rather than let them find it: this **deletes** step 1's
fix for Problem A, because the split makes vote loss on reconnect
unrepresentable. Writing a fix and then removing it is deliberate, and it is
also why Problem C is closed here for the first time rather than fixed twice:
step 1 says why. Folding the split into step 1
would produce one PR changing both the wire format and the shape of state, and
step 1's diff is readable at its size only because most of it is deletion.

**Step 5. Retained sessions.** Waits on step 1 only, and step 4 waits on it.
About 40 and 90, having lost the TTL and its expiry check. Closes the
outage-recovery reload; the pending-session leak closes at step 4 instead, once a
room's lifetime is bounded.

**Step 6. The write path becomes real.** Endpoints described with tapir, the ask
pattern replacing the unconditional `204`, idempotent `/join`, the explicit
leave endpoint with its beacon gated on a discarded page, and the client rejoin
on a snapshot that does not name it as a member. Wants step 4 first, both so
handlers are not rewritten twice and because the leave endpoint's rule reads the
size of a member's connection set. About 190 and 175.

tapir lands here rather than later because this step already rewrites all five
command endpoints plus `/join`, `/events` and the leave endpoint it adds, so
describing them once costs less than describing them twice. Closes Phase 1's outstanding item, the slow-departure
issue and the same-room two-tab collision, and it closes the reload duplicate
structurally rather than by beacon timing. The routes themselves do not move:
there is no `:tabId` segment, and the cookie keeps the `/rooms/:slug` path 08-20
gave it.

**Step 7. Slug room ids.** Three-word slugs replacing raw UUIDs, generated on
`create-room` and unique among the rooms currently in memory. Waits on steps 4
and 6. About 60 and 50. This is what remains of Phase 2 once voting scale moves
to the backlog and durable storage is dropped.

**It waits on step 6 for the same reason tapir lands there.** Slugs change every
route matcher from `path("rooms" / JavaUUID / ...)` to a segment, so landing this
first means step 6 re-describes endpoints this step just re-typed, where the
other order changes a path type in a tapir description and nothing else.

One consequence worth stating: **the cookie path becomes `/rooms/:slug`** with a
slug where a UUID was, which orphans any cookie minted before the cutover, at no
cost since they are session cookies.

A second one is a route hazard rather than a cookie one. **The page route stops
being self-limiting.** `path(JavaUUID)` (`API.scala:66`) matches only a UUID, so
it can sit anywhere in the `concat`; `path(Segment)` matches every single-segment
path there will ever be, so from this step on it must come last, after
`create-room` and after whatever static route step 8's bundled assets need. Today
there is nothing to shadow, since every asset comes from a CDN, which is exactly
why the trap is invisible until step 8 adds the first local one.

**Step 8. Frontend rewrite.** Phase 3: TypeScript, build tooling, components,
light and dark theme, responsive layout, the connection logic as its own module,
inheriting step 6's rejoin on a snapshot that does not name the client as a
member, and client types checked against the server contract. Waits on steps 1 and 6.
Absorbs the `connection.js` extraction the 08-28 design scheduled separately,
whose standalone justification was bounded mode's state machine.

**Step 9. Recorded value and round history.** The facilitator command that
records what the room settled on, its snapshot field, `RoomState.history` and the
`history` field that carries it to the client, and the history view. Waits on
step 8 for the UI. Wants its own discussion first over what completes a round,
though the shape is in memory and lasts an hour, so that question is cheaper to
get wrong than it was when it decided a schema.

The two halves stay in one step because the recorded value is the candidate
commit point for appending an entry, and because a settled estimate you cannot
look back at afterwards is half a feature.

The remaining Phase 4 items are deliberately **not** steps here: what is left of
latched reveal, observer roles, re-vote refinement, results polish, the
timer-based reveal and the idle indicator are product work built on the target
rather than steps toward it. They stay in `docs/roadmap.md`, where what this
design contributes is that
most of them become a field plus a predicate rather than a protocol change. The
timer reveal and the idle indicator are the exceptions, and the deferred table
says why.

## Disposition of existing specs

| Spec | Disposition |
| --- | --- |
| 08-18 SSE transport | Historical. Its post-implementation note stays valuable as the record of why `userId` exposure widened, which the "Transport" section above reads as self-inflicted by the swap rather than inherited from WebSocket. |
| 08-20 session identity | Current and implemented. The cookie-lifetime question is reaffirmed rather than reopened: it stays a session cookie, since no durable auth session is in the target. Its scope is unchanged as well, `Path=/rooms/:slug` and one slot per room, an earlier draft's per-tab path having been dropped for the reasons in section 4. The same-room two-tab collision that design did not examine closes at step 6 through idempotent `/join`, which makes the shared slot resolve to one participant instead of displacing the first tab. |
| 08-24 backpressure | Decisions superseded (`fail` becomes `dropHead`, and the grace period narrows to transient drops only once step 6 lands explicit leave, rather than delaying every departure), findings retained. Its empirical discoveries must survive the edit: `Source.actorRef` with `bufferSize = 0` silently bypassing the overflow strategy, and the connection-establishment race. Nothing else records either. |
| 08-26 delta resync | Already superseded, now doubly so. Kept as history. |
| 08-28 snapshot protocol | Superseded by this document, and kept for three things worth reading: the long-polling analysis at option 6 of its "Approaches considered", which is still the standing fallback design though it assumes a version cursor this design drops (see the caveats under "Deferred, with triggers"); the measurement table behind the snapshot-versus-replay comparison; and the Netskope investigation. Superseded rather than amended because §6's bounded mode, the proxy validation ladder and their scaffolding account for more of its 3,001 lines than everything that survives. |
| 08-30 e2e testkit | Amended, not superseded. The stub and harness survive, the bounded-mode cases go, the characterization cases arrive. |

## Roadmap changes

`docs/roadmap.md` is already written to match this list; it is kept here as the
reasoning behind each move rather than as work outstanding.

- Phase 1's fourth item (ask-pattern command endpoints) becomes step 6.
- Phase 2 loses voting scale to the end of the backlog and its durable store
  entirely, so what remains is slug ids, which become step 7. The "reject
  unknown slugs (404)" item goes with the store: see "No durable storage".
- Phase 3 becomes step 8.
- Phase 4's server-authoritative auto-reveal moves into step 1, and it lands as a
  latch rather than a standing predicate, which takes the auto-reveal half of
  latched reveal with it: section 3 says why a re-derived predicate would let a
  departure disclose the round.
- Phase 5's abandoned-room GC is absorbed by step 4's idle timeout.
- Phase 4 gains an entry for the facilitator-recorded round outcome, which does
  not exist there today and which step 9 pairs with round history. Its
  interaction is left undefined there, being a UI decision step 9 makes.
- Phase 4's existing round-history item becomes step 9, paired with that new
  entry rather than sitting alongside it. Without this the roadmap ends up
  carrying two round-history entries. It carries the reveal gate as well, since
  only a revealed round enters history.
- The backlog's "copy/export round history at end of session" is promoted to
  Phase 4 alongside step 9. With history held only in memory it is the sole way
  to keep a session's rounds, which makes it part of the feature rather than a
  convenience beside it.
- Latched reveal is narrowed rather than moved. What stays in Phase 4 is whether a
  revealed round should survive a `reVote`, and it gains a note that it should ship
  with the backlog's undo/re-hide. Today's accidental un-reveal closes at step 1.
- The backlog's per-user command sequencing item stays in the backlog, with the
  reasoning under "Deferred, with triggers".
- The backlog's client-side connection-liveness watchdog stays in the backlog,
  with a note that step 8 should arm it on `pageshow`: a page restored holding a
  stream that is dead but silent is the one case section 5's rejoin cannot see.

## Known issues disposition

Ten of the fourteen open entries close on this path. `docs/known-issues.md` is
already written to match this table. Five of the rows are marked **new**: they
were surfaced by this design work rather than inherited, three having been
recorded only inside the 08-28 spec now marked superseded and two recorded nowhere
at all. That ratio is the honest measure of how much of this was discovery rather
than execution.

| Entry | Closed by |
| --- | --- |
| Unrecognized `roomId` silently creates an empty room | Stays open, reclassified. See "No durable storage": auto-create is what the pinned-URL usage actually wants, so this is the primary use case working rather than a defect. What it costs is telling someone they mistyped a slug. |
| No GC for abandoned or never-joined rooms | Step 4, against accidental abandonment. A client looping requests at a stopped-but-idle room defers its stop indefinitely; bounding that belongs to the rate-limiting entry, which stays open. |
| A `/join` with no follow-up `/events` leaks a pending session | Step 4, which bounds a room's lifetime. Step 5's retained sessions remove the pending/promoted distinction the entry is phrased around, and deliberately add no TTL. |
| SSE reverse-proxy buffering is undocumented | Step 1 |
| A deliberate tab close is as slow to announce as a transient reconnect | Step 6 |
| HTTP command ordering is not guaranteed | Stays open. Snapshots downgrade it from silent divergence to a visible wrong-but-true state, and it has never been observed; see "Deferred, with triggers". |
| Resync doesn't replay whether votes are revealed | Step 1 |
| No rate limiting on mutating room endpoints | Stays open |
| **new** A transparently reconnecting client duplicates every known participant | Step 1. Applying complete state cannot duplicate. |
| **new** A participant who departs during a reconnect gap is never pruned | Step 1. Under a snapshot an absent participant is absent. |
| **new** Pre-reveal estimations are broadcast to every participant and only hidden client-side | Step 2 |
| **new** A disconnection outlasting the grace period forces a page reload | Step 5. The member is removed, the consumed session leaves nothing to resolve the token, and the retry gets a 401; sleeping a laptop for more than six seconds in an occupied room is enough. Live today and unrelated to this design. |
| **new** A second tab on the same room displaces the first tab's identity, so its clicks are silently credited to the other | Step 6, by making `/join` resolve the existing cookie rather than mint over it, so a second tab joins the same participant instead of displacing it. Sharing the identity is the intended outcome; displacing it was the defect. The 08-20 design examined two tabs on *different* rooms, where path scoping works, and this case fell in the gap beside it. |
| The page and the browser suite depend on three public CDNs at runtime | Stays open. Step 8's build tooling would bundle the four assets and close it structurally, but nothing schedules it as a fix. Surfaced reviewing step 0 as shipped, so it is not part of this design's own discovery; vendoring for the suite alone was declined there. |

The rate-limiting entry was rewritten rather than left alone: its bounded-mode
request-amplification paragraph described a mode this design cancels, and the
no-op publish guard it named as the backstop is also dropped. The underlying gap
is unchanged.

## Open questions

1. **Clever Cloud's sbt build image.** Whether it can run a node build via a
   pre-build hook, or whether step 8 forces the Docker runtime. Answer before
   step 8, not before step 1.
2. **Whether the probe earns its 682 lines** over the longer term. Retained
   deliberately for now on option-value grounds, and on one concrete unanswered
   question: probes F and G are what would establish whether the deferred
   long-poll fallback works at all, and they have never run against a hostile
   appliance. Revisit if a year passes with no second incident.
3. **What completes a revealed round**, and therefore what appends to
   `RoomState.history`. Settled here: only a revealed round enters history at
   all. Left open as a product decision, since it follows the selection UI
   rather than any technical constraint: whether the append needs a recorded
   value, or whether a `clear` of a revealed round appends one without an
   outcome. Specified when step 9 starts; it blocks nothing earlier.
4. **Wordlist size and source for slug generation**, and the fallback when
   generation cannot find a free triple. Answer at step 7. The fallback should
   log loudly, since exhaustion means either genuine scale or an unthrottled
   `create-room` being abused.
