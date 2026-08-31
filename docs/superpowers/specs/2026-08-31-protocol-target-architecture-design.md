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
below that live state is not persisted: a config row in a single-writer process
has no contention to be optimistic about. No consumer remains, so the version,
the SSE `id:` field, the `Last-Event-ID` parsing and the four-case resolution
table are all dropped. This follows the same rule that kept `roomId` and
`issueLastEditBy` off the wire.

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
   it is cast; the client merely hides it. Under snapshots the fix is one
   redaction point rather than a per-event audit.
6. **It is net deletion.** `RoomEvent.scala` in full, `broadcast`,
   `setupNewUser` and 89 lines of client handlers go; about 15 lines of
   `applySnapshot` arrive. Since the protocol lands before the frontend rewrite,
   that is 89 lines of Vue 2 the rewrite never has to port.
7. **Every roadmap feature becomes a field.** Observer roles, latched reveal,
   idle flags and voting scale are all state. Under a snapshot each is a field
   and `applySnapshot` grows no branch. Under events each is a message type plus
   a replay slot plus a handler plus a row in a reset table. This is the
   strongest argument for settling the protocol first and the 08-28 design never
   had room to make it.

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
`RoomData`, and step 4 below sizes correcting it at roughly 140 lines changed
across handlers and tests rather than a reason to start over. The
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
enough that protocol drift becomes a build failure; the residual gap is
ADT-to-`oneOf` mapping, opaque-type schemas and the `Option`/nullable mismatch,
which is configuration rather than a wall. And the claim that Node's event loop
removes the need for per-room serialization holds only for synchronous
mutation: any `await` inside a room method reintroduces interleaving, which is
the exact hazard an actor prevents by construction.

**Elixir with Phoenix** was the strongest framework fit. Channels, Presence and
PubSub supply as primitives four things these specs build by hand, and Channels
ship a longpoll fallback transport with automatic downgrade, which is precisely
the mitigation the 08-28 design named as the right fallback and declined to
build for want of a server-side wait primitive. Rejected because it leans
hardest on the AI-assisted-maintenance premise while being the ecosystem that
premise supports least, and is the least recoverable position if that premise
proves optimistic.

**Chosen: Scala 3 and Pekko, rewritten in place.** The decisive property is that
this is a protocol-centric application and Scala 3's type system is the best
match for it: exhaustive matching on a command ADT is a compile error, and
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

SSE plus HTTP POST is kept. Worth recording that the roadmap's original reason
for leaving WebSocket does not survive scrutiny: it claimed the security fix
needed discrete HTTP calls, but the old `WS.handler` minted `userId` server-side
per connection and the client never sent it, which was stronger than what the
SSE swap arrived with. The 08-18 design's own post-implementation note records
that `userId` then travelled in the query string of every request into access
logs and browser history, and the cookie work fixed a problem the swap created.

WebSocket would also return the command-ordering guarantee for free and make
leave detection instant. Both are addressed independently inside step 6 below,
for about 30 lines between them, which is cheaper than reversing the transport
even though step 6 as a whole is larger. The read
side is one-way fan-out and the write side wants ordinary HTTP semantics, which
is what Phase 1's outstanding ask-pattern item needs. **Reverses if** we ever
need low-latency bidirectional interaction at many events per second.

## Target architecture

### 1. Transport

SSE for server-to-client push on `GET /rooms/:slug/events`, one connection per
participant, authorized by the room-scoped session cookie. HTTP POST for
commands, on the ask pattern, returning real results rather than an
unconditional `204`.

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
`ownVoteConfirmed` needs. Serialization cost is unchanged, since `asJson`
already runs once per connection. Construction becomes O(N^2) per publish
against O(N) today, which is noise at a team's size and is the term that would
grow first if very large rooms ever arrived.

**`hasEstimation` exists because redaction would otherwise change what the table
renders.** `showUserEstimation` (`index.html:556-558`) reads the estimation
string to drive the hidden-value icon, and blanking other participants'
estimations makes that predicate false for everyone but the recipient. The field
is computed from the unredacted value so the table renders exactly as it does
today.

**The wire name is `votesRevealed`, not `revealed`.** The stored flag means
"Show was pressed"; the wire field is the derivation that also covers
auto-reveal. Naming both `revealed` would put two meanings one field access
apart. The wire name also matches what the client already calls it.

Not on the wire: `version` (no consumer, see above), `roomId` (the client opened
the connection), and voting `scale` or participant `role` (see "Demonstrated but
not built").

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

**Named as an extension point, not built:** a second SSE event type for
transient non-state notification, such as a toast or a typing indicator. Every
roadmap item checked turned out to be state, so nothing needs it yet.

### 3. Room state and the store

The structural rule: **no connection handle appears in state that is persisted
or persistable.** Today `RoomData.users` is a `List[User]` whose `ref` is the
live SSE connection, which is the one part of the current design that cannot
carry forward. It splits three ways:

```
RoomState   slug, createdAt, currentIssue   // the persisted part
            round: Round                    // live, never persisted
Round       id, estimates: Map[UUID, String], revealed
members     Map[UUID, Member]     // Member(name, token, lastSeq); lastSeq arrives at step 6
connections Map[UUID, ActorRef]   // the only place a connection handle lives
```

**"Persistable" is a property of fields, not of the whole record**, and saying
otherwise would contradict "Not stored" below. `RoomState` holds both: `slug`,
`createdAt` and `currentIssue` are written through to the row, while `round` is
live only. What the structural rule actually forbids is a connection handle
anywhere in this group, which is why `connections` is separate and why nothing
here is a `List[User]`.

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
`round.estimates`, so there is nothing to carry over and nothing to forget. The
participant-reordering problem the 08-28 design had to fix separately goes the
same way, since a map has no order to disturb.

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

**The store is small, and deliberately holds no live state.**

```sql
rooms (slug PK, created_at, last_seen_at, first_joined_at NULL, current_issue)
```

`rooms` is written on creation, on issue edit, and on room activation to move
`last_seen_at`. Activation granularity is deliberate: a TTL measured in days does
not need per-publish precision, and it keeps writes out of the vote path, which
is the point of a small store.

The `rounds` table is specified separately under "Round history" below, because
it is not settled.

**Not stored: members, connections, the in-flight round, reveal state.**
Participants are presence, and presence is defined by live connections. After a
restart every connection is dead, so a restored participant list would show
people present who are not connected, which is worse than an empty room that
refills as browsers reconnect. Votes and reveal state hang off that list and
inherit the answer. The cost of not persisting them is everyone clicking their
card again, about ten seconds, rarely.

This is a correction to an earlier draft that had the room's state row mirroring
the snapshot. It does not, and the roadmap's own Phase 2 wording (slug, scale,
created_at) always described a registry rather than a state mirror.

#### Three lifetimes, not one

Adding a durable row created a question that did not previously exist, since
today a room dies with its last member. Three lifetimes now need distinguishing,
and conflating them is the mistake to avoid:

1. **The connection**, ending when the SSE stream does, with the grace period
   covering transient drops.
2. **The actor**, which becomes only a working set. It stops after an idle
   period, on the order of two hours, and rehydrates from its row on next
   access. Stop-after-idle replaces today's stop-when-empty, which is what makes
   the abandoned-room GC issue go away and what stops a room losing its
   in-session history to a coffee break. This is worth doing whether or not
   there is a store to rehydrate from; see "If durable storage is unavailable".
3. **The row**, which is new.

**The `rooms` row expires on idle, not on a timer from creation and not on an
explicit destroy.** Expiry from creation is wrong, because a team room used every
sprint would die mid-life. Explicit destroy cannot be the mechanism, because
there is no room ownership model to authorize it and nobody performs housekeeping
on a tool like this; it is a reasonable convenience to add later, but not the
reclamation path. So idle expiry, keyed on `last_seen_at`, with a generous
configurable default. 90 days is proposed: a fortnightly team wants their room
and its history to survive between sprints.

`last_seen_at` moves on room activation, meaning the actor being created for that
slug, and not on every publish. Its staleness while a room is in use is therefore
bounded by how long an actor can live, which is the idle window above, so a room
in active use can never appear idle for days. That is worth stating because it is
what makes the two mechanisms safe to run independently of each other.

**A room that never had a member expires much sooner, and this is a requirement
rather than a refinement.** `POST /create-room` is unauthenticated and
unthrottled, so without a short TTL for never-joined rooms a `create-room` loop
inflates the table for the full idle period. `first_joined_at` being null after
roughly 24 hours is enough to reclaim the row, which bounds spam damage to a
day's worth. The broader gap, no rate limiting on room creation, stays open and
is now more pressing than before; this bounds one symptom and does not close it,
which is exactly how `docs/known-issues.md` already records the pattern.

**How expiry is enforced: as a query predicate first, a sweep second.** These are
two mechanisms with different jobs, and separating them is the point.

Expiry is *semantic*, expressed in every read:

```sql
-- A row is expired if it was never joined and is old, or has not been seen in the idle window.
(first_joined_at IS NULL AND created_at < now() - :unjoined_ttl)
  OR last_seen_at < now() - :idle_ttl
```

Slug lookup and slug-collision checking both apply it, so an expired room is
already absent (a truthful 404) and its slug is already back in the pool, without
anything having run. **Correctness therefore never depends on a background job**,
which is the property worth having: a sweeper that fails, is misconfigured or was
never deployed cannot cause a stale room to resolve or a slug to stay taken.

The sweep is *hygiene only*: a timer in a single sweeper actor, on the order of
hourly, issuing one `DELETE FROM rooms WHERE <the predicate above>` and logging
the count. `rounds` follows via `ON DELETE CASCADE`. Its only job is stopping the
table growing without bound, so its interval is a tuning question rather than a
correctness one.

Three alternatives were considered. **A Postgres-native TTL** does not exist;
approximating it needs `pg_cron` or table partitioning, neither of which is worth
assuming on a managed XXS_SML addon for one `DELETE`. **Sweeping only at server
start** is insufficient on its own, since a process that runs for months would
never reclaim anything, though the periodic sweep firing once immediately covers
that case anyway. **Sweeping without the predicate**, relying on deletion alone,
is the option to avoid: it makes room resolution and slug availability depend on
a job having run recently, which is how you get a bookmark that works on Tuesday
and not on Wednesday for reasons nobody can reproduce.

Four values become configuration, following the existing `SseConfig` pattern of
a typed config object loaded from `application.conf` with env overrides: the idle
TTL, the never-joined TTL, the sweep interval, and the actor idle timeout, which
is a different thing from the two row TTLs and should not be named as if it were
the same.

#### Slug allocation

Generated slugs are three words, for example `nice-brave-otter`, allocated
**unique among live rooms** by retrying generation on collision. "Live" means
not matching the expiry predicate above, so a slug returns to the pool the
moment its room expires rather than when the sweeper happens to delete the row.
Uniqueness is scoped to live rooms rather than to all rooms ever, which is what
keeps the namespace bounded by real usage instead of by total history.

The requirement driving this is not aesthetics. The slug exists so a person
working with two teams on the same project can tell at a glance which room to
join, which means live rooms must be mutually *memorable*, not merely distinct.
That rules out a numeric discriminator: `nice-otter-42` against `nice-otter-17`
recreates most of the problem that replacing UUIDs was meant to solve, because
the memorable part is identical and the distinguishing part is not memorable.
Three words over a few hundred each gives tens of millions of combinations,
which is where the namespace size comes from instead.

**Reuse is allowed, and the hazard is smaller than it first appears.** A
recycled slug could in principle let a stale bookmark open a different team's
room. For that to happen the bookmark must be older than the idle TTL, the exact
triple must be regenerated by chance out of tens of millions against a live-room
count in the tens, and the person must ignore an unfamiliar participant list and
issue. The third condition is doing most of the work: landing in the wrong room
is immediately visible rather than silent, which an earlier draft of this section
got wrong. A quarantine period before a slug returns to the pool was considered
and rejected as adding a column and a job for no measurable reduction in an
already negligible risk.

**Never-reuse was considered and rejected**, having been the earlier proposal.
It fails on room-creation spam: it would turn the existing unthrottled
`create-room` endpoint into a way to permanently consume a finite,
human-meaningful namespace, which is the same amplification pattern the 08-28
design was caught by and documented. It also leaves someone who dislikes their
generated name with no recourse, since there is no destroy action.

**Custom chosen names stay deferred.** The moment a user can claim `team-alpha`,
"is this name taken forever" becomes unavoidable, and answering it requires
knowing who owns a name. That needs an authentication and ownership model this
app does not have, so it is out of scope for step 7 and should not be designed
before that exists.

#### Choosing the store

**Postgres rather than SQLite, and the reason is the platform, not the data.**
By workload SQLite wins easily: two tables, a handful of writes per meeting, one
process, one writer. It loses because Clever Cloud runs immutable disposable
VMs, so a redeploy discards the instance filesystem and any SQLite file on it.
The persistent alternative for file semantics, an FS Bucket, is documented as
the wrong place for a SQLite database, carries 24-hour backups with 72-hour
retention, and is unavailable to Docker applications, which is likely the
runtime this app needs (see "Accepted costs"). Postgres as a managed addon
sidesteps all of it: a deploy replacing the instance does not touch the data.
XXS_SML instances are routine across this company's projects, so this is a
provisioning request rather than a cost question.

**If the deployment target ever changes to a host with a real persistent volume,
SQLite becomes the better answer for this workload**, and the persistence layer
is deliberately thin enough that revisiting is about a day's work.

**Viable fallback: a whole-blob JSON snapshot in Cellar.** Read once at startup,
written by a periodic dump, with memory authoritative in between. An earlier
draft dismissed this and the dismissal was half wrong, so the reasoning is
recorded properly.

The corruption hazard that rules out SQLite over a network mount does not apply,
because it comes from POSIX advisory locking during concurrent in-place mutation
and this pattern has neither. The safety comes from the write pattern rather
than from JSON being a more robust format than a database file, which it is not:
Cellar is S3-compatible, so a PUT is atomic per object and a reader sees either
the whole previous blob or the whole new one, never a torn file. That is also
why Cellar rather than an FS Bucket, which offers file semantics over a network
mount where an in-place write can tear, and which Docker applications cannot use
anyway.

Crash exposure is bounded by dump frequency rather than left open. The blob is
kilobytes to low megabytes, so a dump every five minutes costs a few hundred
PUTs a day and caps loss at five minutes of issue text plus at most one
completed round. That matters because it removes any dependence on the shutdown
path: whether Clever Cloud's SIGTERM-to-SIGKILL window reliably leaves time for
a blocking PUT from a Pekko `CoordinatedShutdown` task is unmeasured, and with
periodic dumps it never needs measuring. A flush on shutdown stays worth
attempting, as best effort only.

Against Postgres it costs hand-rolled serialization, the dump scheduler, and
tolerance for reading an older blob shape. In exchange, schema evolution is free
where Postgres wants a migration tool, and timestamped keys give rotating
point-in-time snapshots more cheaply than anyone would bother configuring for a
database. Its one structural limit is that a blob must be loaded whole, so
history is bounded by memory and cannot be queried without holding all of it. At
this tool's volume that is fine for years, and it is the thing that would
eventually break.

**Not chosen because it does not solve the problem it appears to solve.** Cellar
is an addon too, so if addon provisioning is the blocker then both options are
blocked, and if it is not then Postgres is available and is the better fit for
the one table that grows. Its triggers are addon access being refused for a
database specifically, or the deployment target changing.

A room actor loads its row on first access for a slug, so an absent row is
finally distinguishable from a never-used slug. That closes the
"unrecognized `roomId` silently creates an empty room" known issue.

The abandoned-room GC issue closes in two halves rather than at one step, and
the halves are worth keeping apart: **accumulating actors** are fixed by the
stop-after-idle change at step 4, and **accumulating rows** by the never-joined
and idle TTLs at step 7. The first is useful with no store at all, which is why
it is not deferred to the second.

An auth `sessions` table is **not** in the target. It would only be needed if
the cookie outlived the browser, and since `localStorage` already remembers the
user's name, the payoff is thin. The cookie stays a session cookie exactly as
`docs/superpowers/specs/2026-08-20-session-identity-design.md` designed it.

#### If durable storage is unavailable

Recorded because the answer is not obvious and would otherwise be re-derived
under time pressure. Nothing in steps 0 through 6 touches the store, so this
decides nothing until step 7: raise the provisioning request now and leave the
contingency unused unless it is refused.

**What is genuinely lost.** Bookmark continuity, and with it the truthful 404.
An absent map entry cannot distinguish "this slug never existed" from "this room
existed and everyone left", so the only way a bookmarked link appears to work is
today's silent auto-create, handing back the right name and none of the state.
That known issue then stays open by necessity rather than by choice. Also lost
is any history beyond the process lifetime.

**What is cheaper to recover than it looks.** History would otherwise be scoped
not to a session but to *continuous occupancy*, because `ConfirmLeave` stops the
actor when the last member's grace period expires and that period is six
seconds: a room emptying for a coffee break takes its history with it. Replacing
stop-when-empty with **stop-after-idle**, on the order of two hours, fixes that
using the timer machinery the grace period already uses. It buys survival across
temporary emptiness, history for a whole meeting, slug stability while idle, and
a proper resolution of the abandoned-room GC issue, losing only survival across a
process restart.

**That idle stop is worth doing regardless of storage.** With a store it is
exactly the working-set eviction the "three lifetimes" section describes; without
one it is the same idle stop with nothing to rehydrate from. It is therefore not
contingency work and should not be filed as such.

**What else follows.** A deploy becomes destructive rather than merely
disruptive, since presence, the round, the room and its history all go at once.
That promotes Phase 5's restart-warning and maintenance-mode item from a nicety
to the actual mitigation, alongside a deploy-window habit. Step 9 degrades
rather than dying, and the surviving half is the better one: the
facilitator-recorded outcome is a command plus a snapshot field and needs no
storage at all, while only the historical table does. Export then stops being a
convenience and becomes the durability mechanism, which for an internal tool puts
the data where people actually look for it afterwards.

**Two non-consequences worth knowing.** Slug allocation is unaffected, since
uniqueness is defined among live rooms and live rooms are in memory; after a
restart every slug is free, which is consistent rather than broken. And the
instance filesystem is not a partial answer, because it is discarded on exactly
the redeploy this protects against.

**Rejected even under this constraint:** having the facilitator's browser hold
the room's durable content and re-assert it on creation. It works, and it makes
durability depend on one person's `localStorage` surviving, which is not a
durability story worth adopting.

#### Round history: a starting point, not a settled design

Recorded here so the thinking is not lost, and explicitly **not** specified to
the level of the rest of this document. It lands at step 9 and wants its own
discussion first. The data shape below is expected to be roughly stable; the
trigger is open.

```sql
rounds (
  id PK, room_slug,
  issue text,
  recorded_value text NULL,   -- what the room settled on
  distribution jsonb,         -- [[score, count], ...] as the client already shapes it
  completed_at
)
```

Three properties make this preferable to storing per-participant estimates:

**No personal data.** Retention stays ordinary housekeeping rather than becoming
a data-protection question, and both step 7 and step 9 keep the store free of
personal data. Participant names are rarely the interesting part of a
retrospective view.

**`recorded_value` is a product gap, not just a storage choice.** Teams often
resolve a split by talking it out rather than by re-voting, and the app today has
no concept of a settled estimate at all: a round simply ends when someone clears.
So this implies a facilitator command and a snapshot field, which is a new
roadmap entry under Phase 4 rather than part of the history item. It also fits
the property this architecture is built on: a feature is a field plus a command,
and `applySnapshot` grows no branch.

**The distribution matches code that already exists.** `updateSummary` produces
`Object.entries(tally)`, which is exactly `[(score, count)]`, so the stored
distribution and the live vote summary are the same structure and a history view
can reuse the rendering. It is what separates "we settled on 5" from "we settled
on 5 despite a 3-to-8 spread", and it makes later views (highest and lowest,
majority, most voted) additive rather than requiring a migration.

**Open: what completes a round.** The candidate is that recording a value is
itself the commit point, so one action is both the product capability and the
trigger, and a round abandoned without a recorded value writes nothing. The
alternative is that every `clear` writes a row with a null outcome, which risks
filling the table with rounds nobody resolved. Not decided.

### 4. Identity and the write path

The 08-20 cookie design carries over unchanged: `HttpOnly`, `SameSite=Strict`,
`Path=/rooms/:slug`, `Secure` behind `apiConfig.secureCookies`, no `Max-Age`.

Four additions, each closing something documented:

- **Retained sessions with a TTL.** Sessions are kept past promotion rather than
  consumed, and bounded by a TTL evaluated at resolution, so an unpromoted
  session expires on its own. Closes the pending-session leak.
- **Ask-pattern commands**, so a client can distinguish rejected from lost.
  This is Phase 1's outstanding item and it is what makes real error handling
  possible in the rewritten frontend.
- **A per-user command sequence number.** The client sends a monotonic counter;
  the room ignores a command whose sequence is not greater than `Member.lastSeq`.
  Closes the HTTP command-ordering regression, which is one of the two reasons
  this design can recommend against returning to WebSocket.
- **An explicit leave endpoint** hit by `navigator.sendBeacon` on `pagehide`,
  mapping to an immediate departure that bypasses the grace period. That is the
  other reason, and it reduces the grace period to what it should be: cover for
  transient drops only. `sendBeacon` is the right primitive because a normal
  POST is not reliably delivered from an unload-adjacent handler.

Left known and unfixed: the two-tab identity collision, where a second tab on
the same room shares the path-scoped cookie and resumes as the same user. It
stays a per-browser-session accident as long as the cookie is a session cookie.

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
  `vote()` stays, and now self-corrects: a failed vote POST leaves the server
  holding no estimation, so the next snapshot clears the selection.

`showUserEstimation` re-points at `hasEstimation`. That is the one client change
the redaction forces, and it is why the confidentiality step is not server-side
only.

No client-side version comparison, because out-of-order snapshots are
unreachable: SSE delivers in order within a connection, a snapshot is one frame,
and at most one connection is open per page instance since native reconnection
replaces it on the same object and manual switches call `close()` synchronously.
Server-side the same holds from the other end, since a rejoin replaces the
connection entry and publishes only to the new ref.

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
  participant list on join and leave, and the issue-input guard.
- **A contract test** (step 8, when the client first has generated types to
  check) taking a real server-produced snapshot and validating it against the
  client's types. This is the cheap form of the drift gate; the fuller form is
  tapir's OpenAPI document, which exists from step 6, feeding
  `openapi-typescript` with a CI step that regenerates and fails on a diff.

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
  before assuming a pre-build hook suffices. This interacts with the storage
  decision above, since FS Buckets are unavailable to Docker applications.
- **Postgres in tests**, via a `services:` container in the CI job or an
  embedded Postgres for the JVM, where SQLite would have given an in-memory
  database for free.

## Deferred, with triggers

Recorded so nobody re-derives these, and so the trigger is recognizable when it
arrives.

| Deferred | Trigger that reopens it |
| --- | --- |
| Long-poll fallback transport (analysed as option 6 under 08-28's "Approaches considered") | Proxy-hostile networks recurring at more than one customer. This is the right fallback, not short polling. |
| Elixir and Phoenix | The same trigger. If automatic transport downgrade becomes a product requirement, Channels supply it and hand-building it three times is worse than learning Elixir once. |
| WebSocket | Needing low-latency bidirectional interaction at many events per second. |
| Voting scale | Someone asking for a non-fibonacci scale. |
| Custom chosen room names | An authentication and ownership model existing, without which "is this name taken forever" has no answer. |
| An explicit destroy-room action | Wanted as a convenience, never as the reclamation mechanism. Idle expiry is that. |
| A whole-blob JSON snapshot in Cellar instead of Postgres | Addon access being refused for a database specifically, or the deployment target changing. Sound but solves nothing Postgres does not, since Cellar is an addon too. |
| Observer roles, latched reveal, idle indicator | Phase 4, unchanged. Each is a field plus a predicate. |
| Persisting live round state | A zero-downtime deploy requirement, already deferred to its own spec under Phase 5. Until then, a restart warning and deploying outside meeting hours. |
| Client-assisted round recovery | Someone complaining about a restart mid-meeting. Each client re-asserts its own vote on reconnect and the round rebuilds from whoever returns. Needs a round identity on the snapshot so a stale vote cannot land in a new round. |
| Durable auth sessions | Wanting identity to survive a browser close. `localStorage` already covers name pre-fill. |
| Multi-instance operation | Out of scope by decision; single process throughout. |
| Event-sourcing the room | Never, on the same grounds that pick snapshots for the wire. Round history is a product feature with its own schema, not a projection anyone needs to rebuild. |
| Rate limiting | Unscheduled and broader than any one symptom. |

## The ordered path

Nine steps. The numbers are labels rather than a queue; each states what it
actually waits on. Line counts are rough.

**Step 0. Characterization harness.** The stub buffering proxy, the browser
harness, and Playwright cases pinning today's behaviour. Waits on nothing.
About 220 lines and 200 of tests.

Front-loaded for a different reason than the 08-30 design gave. Its original
justification was reproducing the proxy failure; the surviving one is that there
are no end-to-end tests today and step 1 is the largest behavioural change in
the set. Two caveats belong in it: cases covering behaviour that is currently
buggy (the non-voter tally, the duplicate participants) characterize the
*intended* behaviour and are expected to go red until step 1 or 3 fixes them;
and step 8 will revisit selectors, so prefer accessible ones.

**Step 1. Snapshot protocol.** The wire format, `publish`, pure
`applySnapshot`, `dropHead`, the anti-buffering headers and README note, plus
Problems A, C and E. Deletes `RoomEvent.scala`, `broadcast`, `setupNewUser` and
89 client lines. Waits on nothing, though much safer after step 0. About 170
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
change in this step** and is here rather than at step 7 because it is worth
having with no store at all: it stops a room losing its in-session history when
everyone steps out for six seconds, and it closes the actor half of the
abandoned-room GC issue. Section 3 has the reasoning.

Flag for its reviewer rather than let them find it: this **deletes** step 1's
Problem A fix, because the split makes vote loss on reconnect unrepresentable.
Writing a fix and then removing it is deliberate. Folding the split into step 1
would produce one PR changing both the wire format and the shape of state, and
step 1's diff is readable at its size only because most of it is deletion.

**Step 5. Retained sessions with a TTL.** Waits on step 1 only, so it can land
any time after. About 55 and 100. Closes the pending-session leak.

**Step 6. The write path becomes real.** Endpoints described with tapir, the
ask pattern replacing the unconditional `204`, per-user command sequence
numbers, and the explicit leave endpoint. Wants step 4 first so handlers are not
rewritten twice. About 200 and 180.

tapir lands here rather than at step 8, and that is a dependency rather than a
preference: this step already rewrites all five command endpoints, so describing
them once with tapir costs less than describing them twice. Closes Phase 1's
outstanding item, the command-ordering regression and the slow-departure issue.

**Step 7. Durable room registry.** The Postgres addon, the `rooms` table, slug
ids replacing raw UUIDs, a real 404 for an unknown slug, and rooms loading their
row on first access, with expiry as a query predicate plus a sweeper actor.
Waits on step 4. About 180 and 150. This is Phase 2 with scale removed. Closes
the unrecognized-`roomId` issue and the row half of abandoned-room GC, the actor
half having closed at step 4.

**Step 8. Frontend rewrite.** Phase 3: TypeScript, build tooling, components,
light and dark theme, responsive layout, the connection logic as its own module,
and client types checked against the server contract. Waits on steps 1 and 6.
Absorbs the `connection.js` extraction the 08-28 design scheduled separately,
whose standalone justification was bounded mode's state machine.

**Step 9. Recorded value and round history.** The facilitator command that
records what the room settled on, its snapshot field, the `rounds` table, and the
history view. Waits on step 7 for the store and step 8 for the UI. **Designed
only to the "starting point" level in section 3 and wanting its own discussion
before implementation**, principally over what completes a round.

The two halves stay in one step because the recorded value is the candidate
commit point for the table, and because a settled estimate you cannot look back
at afterwards is half a feature.

The remaining Phase 4 items are deliberately **not** steps here: latched reveal,
observer roles, re-vote refinement, results polish and the idle indicator are
product work built on the target rather than steps toward it. They stay in
`docs/roadmap.md`, where what this design contributes is that each becomes a
field plus a predicate rather than a protocol change.

## Disposition of existing specs

| Spec | Disposition |
| --- | --- |
| 08-18 SSE transport | Historical. Its post-implementation note stays valuable as the record of why `userId` exposure widened, and this design cites it against returning to WebSocket. |
| 08-20 session identity | Current and implemented. The cookie-lifetime question is reaffirmed rather than reopened: it stays a session cookie, since no durable auth session is in the target. |
| 08-24 backpressure | Decisions superseded (`fail` becomes `dropHead`, and the grace period stops being load-bearing once step 6 lands explicit leave), findings retained. Its empirical discoveries must survive the edit: `Source.actorRef` with `bufferSize = 0` silently bypassing the overflow strategy, and the connection-establishment race. Nothing else records either. |
| 08-26 delta resync | Already superseded, now doubly so. Kept as history. |
| 08-28 snapshot protocol | Superseded by this document, and kept for three things worth reading: the long-polling analysis at option 6 of its "Approaches considered", which is the standing fallback design; the measurement table behind the snapshot-versus-replay comparison; and the Netskope investigation. Superseded rather than amended because §6's bounded mode, the proxy validation ladder and their scaffolding account for more of its 3,001 lines than everything that survives. |
| 08-30 e2e testkit | Amended, not superseded. The stub and harness survive, the bounded-mode cases go, the characterization cases arrive. |

## Roadmap changes

- Phase 1's fourth item (ask-pattern command endpoints) becomes step 6.
- Phase 2 loses voting scale, deferred with the reasoning recorded above, and
  the rest becomes step 7.
- Phase 3 becomes step 8.
- Phase 4's server-authoritative auto-reveal moves into step 1. Latched reveal
  stays in Phase 4 as a deliberate behaviour change reviewed on its own.
- Phase 5's abandoned-room GC is absorbed by step 4's actor idle timeout and
  step 7's never-joined and idle TTLs.
- Phase 4 gains an entry for the facilitator-recorded round outcome, which does
  not exist there today and which step 9 pairs with round history.
- The backlog's per-user command sequencing item becomes step 6.
- The backlog's client-side connection-liveness watchdog stays in the backlog.

## Known issues disposition

Seven of the eight open entries close on this path.

| Entry | Closed by |
| --- | --- |
| Unrecognized `roomId` silently creates an empty room | Step 7 |
| No GC for abandoned or never-joined rooms | Steps 4 and 7 (actors, then rows) |
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

Three issues need **adding** to `docs/known-issues.md`, since they are currently
recorded only inside a spec about to be marked superseded:

- A transparently reconnecting client duplicates every known participant.
  Closed by step 1.
- A participant who departs during a reconnect gap is never pruned. Closed by
  step 1.
- Pre-reveal estimations are broadcast to every participant and only hidden
  client-side. Closed by step 2.

## Open questions

1. **Clever Cloud's sbt build image.** Whether it can run a node build via a
   pre-build hook, or whether step 8 forces the Docker runtime. Answer before
   step 8, not before step 1.
2. **Provisioning a Postgres addon**, which needs someone with administrative
   credentials on the Clever Cloud organization. No longer a design question:
   XXS_SML instances are already routine across this company's projects and the
   data volume here is trivial. Raise the request early, since a refusal is what
   activates "If durable storage is unavailable".
3. **Whether the probe earns its 682 lines** over the longer term. Retained
   deliberately for now on option-value grounds. Revisit if a year passes with
   no second incident.
4. **What completes a round**, and therefore what writes a `rounds` row. The
   candidate and its alternative are in section 3. Answer before step 9; it does
   not block anything earlier.
5. **Wordlist size and source for slug generation**, and the fallback when
   generation cannot find a free triple. Answer at step 7. The fallback should
   log loudly, since exhaustion means either genuine scale or an unthrottled
   `create-room` being abused.
