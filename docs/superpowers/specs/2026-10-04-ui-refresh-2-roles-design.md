# UI Refresh, Step 2: Roles

Date: 2026-10-04
Status: In discussion
Parent: `docs/superpowers/specs/2026-09-30-ui-refresh-design.md`, step 2

## Purpose

Product owners who facilitate never vote, so a room with one or more of them
never completes and auto-reveal never fires (the parent's Appendix A, "How
sessions run"). This step gives each participant a role, leaves facilitators
out of the completion rule, and lets a participant choose a role in the lobby
and switch it in the room. A facilitator's page has no deck. Everything is built
in today's look; the parent's step 4 restyles it.

The parent's Terms and Principles apply here and are not repeated. Principle 7
matters most: controls stay open to everyone, and there is no observer mode
without controls.

## Terms

This section settles the parent's "Voter" and "Facilitator".

- **Seat**: what the room holds for one identity: a role, plus that role's
  state. `Seat.Voter(estimate: Option[Estimate])` or `Seat.Facilitator`.
- **Voter**: an identity whose seat is `Voter`. Votes, and counts toward
  completion.
- **Facilitator**: an identity whose seat is `Facilitator`. Holds no estimate,
  gets no deck, and keeps every control.
- **Present**: holding a `Member` entry, as today. An identity removed at grace
  expiry or by the leave beacon keeps its session and its seat, but is not
  present.
- **Complete**: at least one present identity holds a `Voter` seat, and every
  present `Voter` seat holds a confirmed estimate.
- **Switch**: a change of an identity's role, through `POST /role` or through a
  join whose role differs from the seat's.
- **Default role**: the role this browser falls back to when a join has
  nothing more specific. It is stored as `defaultRole` and set only in the
  lobby.
- **Remembered role**: a room's `role:<roomId>` key, this browser's role there
  as the server last accepted it. A room the server never accepted a join to
  has none.
- **Pick**: a click on a "Join as" radio button. A value only pre-selected is
  not a pick.
- **Join role**: the role a join sends: the pick handed over for that join,
  else the room's remembered role, else the default role. "The join role" in
  2c says which picks exist.

## Decisions

1. **The latch rule.** The round's `revealed` flag is set by Show, or by a vote
   or a switch through `/role` after which the round is complete. `clear` and
   `reVote` clear it. A join or a departure never sets it. Only a deliberate act
   by someone present reveals: `/role` and a vote require presence, while a
   join and a departure are changes in presence. A reload and a close send the
   same leave beacon, grace expiry also fires on a slept laptop or a locked
   phone, and a reload's join usually runs after its beacon has removed the
   identity. Departures are unchanged by this step.
2. **A switch to facilitator drops the estimate**, in either phase. "I am not
   here to vote" leaves nothing to bring back later. Switching back starts with
   no estimate.
3. **A switch to voter in a revealed round** behaves as a straggler joining: the
   round stays revealed and their votes are refused until Re-vote or Clear. No
   reveal is ever undone by a role change.
4. **One list.** Facilitators stay in the participant list, in the same name
   order as step 1b, marked "Facilitator" in words.
5. **Every join states a role, and the server always applies it.** `role` is
   required on `/join`, as `name` is. Whether a join creates an identity or
   resumes one depends on the session cookie, which the page cannot see, so a
   field read only on creation would mean different things for reasons hidden
   from its sender. A field's meaning must not depend on hidden state.
6. **The browser remembers the role per room, and a default role.** The server
   forgets a room after two hours without connections, and the session cookie
   ends with the browser, so a weekly meeting usually starts with a new
   identity. The page keeps each room's remembered role in step with its seat
   ("What the browser stores" in 2c). The default role is chosen explicitly in
   the lobby, on one lobby line, not the settings page the parent's Appendix A
   rules out. A product owner facilitates every room, so only the "Your
   default role" fieldset replaces a stored default ("What the browser stores"
   lists the writers).
7. **With no default role, the lobby comes first.** A room's own path joins at
   once only when a name and a default role are stored. Otherwise the lobby
   shows and asks for what is missing, so every browser's default is confirmed
   by a person once. This is also where every existing user meets the
   feature.

Considered and not taken:

- Keeping a facilitator's estimate hidden and restoring it on a switch back: a
  value would reappear unasked, and the wire would carry a hidden state.
- Keeping and counting a facilitator's estimate: a vote could never be
  withdrawn, and a "Facilitator" row would carry a value in the results.
- Re-checking completion when an identity stops being present: it brings back
  the reload disclosure the latch exists to prevent.
- Absence from a sparse seat map meaning "a voter with no vote": absence would
  encode a default role, which breaks once a second voting role or a different
  default exists.
- Holding the seat in `Session`: `rename` replaces the session on every join
  with a cookie, and `Join` compares whole sessions, so both would silently
  start erasing votes or refusing joins.
- Applying the join's role only when it creates the identity: the silent field
  decision 5 rules out.
- No role on `/join`, a 201 or 204 telling the page whether it created the
  identity, and a follow-up `/role`: two requests, and a facilitator's deck
  flashing once per meeting.
- One stored role for the whole site: a reload in one room would replay a role
  chosen in another, dropping an estimate and possibly revealing.
- `lastRole`, the role last chosen in the lobby for a room with no key: a
  one-off choice for someone else's room became the default for the next new
  room, and it needed three writers, each with a condition.
- A separate settings page, required before the lobby: two forms on a first
  visit, where the parent's Appendix A keeps "no settings, no navigation".
- Asking a first visit for the room's role as well as the default: the same
  answer twice, nearly always (see Accepted costs).
- Passing the lobby's choice as `?role` in the URL: a crafted link would switch
  a seat and drop a vote. `pendingJoin` lives in the tab, out of any link.
- Writing `role:<id>` from a typed id lowercased: a client copy of the server's
  rewrite rules, which a typed legacy id already escapes.
- A lobby submit always writing `role:<trimmed id>`: a typo or an unreachable
  room would then count as visited, and the step 5+ completion would offer it.
- A server endpoint that normalises a typed id: an endpoint and a request for
  what an exact match against the stored, canonical keys already gives.

## Step 2a. Seats, no behaviour change

### Model

`RoomState(currentIssue, round: Round(revealed), seats: Map[UUID, Seat])`. In
2a, `Seat` has one case, `Voter(estimate: Option[Estimate])`.

- `Round` keeps only what `clear` replaces whole, so `Round.fresh` stays a
  constant. It is the home for later per-round fields, such as the protocol
  architecture's step 9 recorded value.
- `seats` outlives the round. Its key set equals the session user ids, checked
  in `RoomData.of` beside the existing rules; it replaces the rule that every
  estimate resolves to a session.
- A seat is created in `registerSession`, the only place a session is created.
- `Session(userId, name)` stays pure identity. `Join`'s equality check is
  untouched.
- `clear` sets `round = Round.fresh` and every `Voter(_)` to `Voter(None)`:
  the one place a seat's two lifetimes show, since the role outlives the round
  and the estimate does not.
- `reVote` unconfirms every `Voter(Some(e))` and clears `revealed`.
- Completion is computed as the Terms define it. In 2a every seat is a voter, so
  it answers as `everyMemberHasVoted` does today.
- `RoomSnapshot.of` reads a present identity's estimate from its seat. The wire
  does not change.

### Pass condition

- The e2e suite, `SnapshotContractSpec`, `snapshot.contract.test.ts` and the
  generated OpenAPI document are unchanged.
- Unit fixtures are ported mechanically from `Round(estimates, _)` to seats.
- New unit cases pin today's behaviour, so the refactor has a net. Each is shown
  failing against a deliberately broken transition:
  - a departure that completes the round leaves it hidden, by the beacon and at
    grace expiry;
  - a rejoin through `rename` keeps the vote;
  - `clear` and `reVote` reach the seats of identities who are not present.
- New unit cases pin the new invariant: `RoomData.of` refuses a session without
  a seat, and a seat without a session.

## Step 2b. Roles on the server and the wire

Nothing visible changes: the page parses the new shape and always sends
`"Voter"`.

### Server

- `Seat.Facilitator` is added.
- `Role` is `Voter` or `Facilitator`, one type shared by both requests below.
- `registerSession` creates the seat from the join's role. `rename` writes the
  join's role to the seat by the switch transition, without the latch step.
  `RequestSession` carries the role to both.
- The switch transition writes the seat: to `Facilitator` drops any estimate, to
  `Voter` from `Facilitator` gives `Voter(None)`, and the same role changes
  nothing.
- The latch step, one private step on `RoomData`: if the round is open and
  complete, set `revealed`. An applied vote and a `/role` that changes the seat
  run it. A refused vote, a same-role `/role` and a join never do, so none of
  them reveals a round a departure left complete.
- `vote` refuses a facilitator with a new `VoteRefusal.NotAVoter`, checked
  after the existing two, which keep precedence. Like every vote refusal, it
  still publishes. A facilitator's vote gets:

  | Round | Estimation | Refusal | Status |
  | --- | --- | --- | --- |
  | revealed | any | `RoundRevealed` | 409 |
  | open | blank | `BlankEstimation` | 400 |
  | open | non-blank | `NotAVoter` | 409 |
- Completion's non-empty clause becomes a live case: when the last voter
  switches to facilitator, nothing reveals.

### Wire

Each participant carries its seat as a tagged union:

```json
{ "id": "…", "name": "Ann", "seat": { "type": "Voter", "estimation": { "type": "ConfirmedHidden" } } }
{ "id": "…", "name": "Bob", "seat": { "type": "Facilitator" } }
```

- The tags are explicit strings in a hand-written encoder, as `Estimation`'s
  are. A facilitator with an estimation cannot be expressed in Scala or in zod.
- Redaction is unchanged: a voter's `estimation` is computed as today.
- `JoinRequest(name, role)`, `role` required (decision 5).
- `POST /rooms/{id}/role`, body `{"role": "Voter"}` or `{"role": "Facilitator"}`:
  204 when applied, 401 and 403 as Show and Clear, 400 for any other value. Its
  transitions are the matrix's "A switches to … through `/role`"
  rows. The OpenAPI document and its types are regenerated (`genOpenApi`,
  `gen:api`).
- `NotAVoter` answers **409**, as `RoundRevealed` does. Not 403: the conflict is
  with the room's state, and `api.ts` treats only 401 as a session refusal, so
  the page stays in the room. The two are indistinguishable on the wire, which
  is accepted, since the page handles both alike.
- The client's schema, `view.ts` and `api.ts` follow the new shape.

### States by events

For one identity, A. "Complete" means after the event. Every event still
publishes. A join may arrive while A is not present: a reload's beacon usually
removes A first: the reload gap.

**Open round.**

| Event | A: `Voter(None)` | A: `Voter(confirmed)` | A: `Voter(unconfirmed)` | A: `Facilitator` |
| --- | --- | --- | --- | --- |
| A votes, non-blank | estimate set; reveal if complete | replaced; reveal if complete | confirmed; reveal if complete | 409 `NotAVoter` |
| A switches to facilitator through `/role` | `Facilitator`; reveal if complete | `Facilitator`, estimate dropped; reveal if complete | as confirmed | no-op |
| A switches to voter through `/role` | no-op | no-op | no-op | `Voter(None)`; the round now waits for A |
| A joins with the seat's role (a reload) | no-op | no-op | no-op | no-op |
| A joins with the other role | `Facilitator`; never reveals | `Facilitator`, estimate dropped; never reveals | as confirmed | `Voter(None)` |
| Anyone presses Show | revealed | revealed | revealed | revealed |
| Anyone presses Clear | `Voter(None)` | `Voter(None)` | `Voter(None)` | unchanged |
| Anyone presses Re-vote | unchanged | unconfirmed | unchanged | unchanged |
| A departs, by beacon or grace expiry | seat kept; never reveals | seat kept; never reveals | seat kept; never reveals | seat kept |
| A's stream reconnects in place | seat unchanged | seat unchanged | seat unchanged | seat unchanged |
| Another identity's vote or `/role` switch completes the round | cannot happen while A is present: A is waited on; A absent is the reload-gap race | revealed | as `Voter(None)`: A is not confirmed | revealed |
| The server restarts | all lost; the rejoin creates the seat from the role sent | likewise | likewise | likewise |

**Revealed round.**

| Event | A: `Voter(None)` | A: `Voter(confirmed)` | A: `Voter(unconfirmed)` | A: `Facilitator` |
| --- | --- | --- | --- | --- |
| A votes, non-blank | 409 `RoundRevealed` | 409 `RoundRevealed` | 409 `RoundRevealed` | 409 `RoundRevealed` |
| A switches to facilitator, by `/role` or a join | `Facilitator` | `Facilitator`; A's value leaves the results | as confirmed | no-op |
| A switches to voter, by `/role` or a join | no-op | no-op | no-op | `Voter(None)`; still revealed |
| Anyone presses Show | no-op | no-op | no-op | no-op |
| Anyone presses Clear | `Voter(None)`, round open | `Voter(None)`, round open | `Voter(None)`, round open | unchanged, round open |
| Anyone presses Re-vote | unchanged, round open | unconfirmed, round open | unchanged, round open | unchanged, round open |
| A departs or reconnects | as in an open round | likewise | likewise | likewise |
| Another identity votes or switches | nothing reveals: already revealed | likewise | likewise | likewise |
| The server restarts | as in an open round | likewise | likewise | likewise |

An unconfirmed voter in a revealed round is reachable: a Re-vote, then a Show
before everyone confirms again.

### Accepted races

- A vote and a `/role` switch to facilitator from two tabs of the same identity:
  the actor's order decides. The vote first means it is dropped; the switch
  first means a 409. Both end as a facilitator with no estimate.
- A switch to voter racing another voter's completing vote: one order reveals
  with A not counted, the other leaves the round waiting for A. Two humans
  within a round trip.
- A `/role` switch to facilitator that completes the round while another vote is
  in flight: that vote gets `RoundRevealed`, as it would after a Show.
- During A's reload gap, another voter's `/role` switch to facilitator can
  complete the round without A and reveal it. It is the protocol architecture's
  "departure plus a later vote" residual, reached by a switch instead of a vote.

### Pass condition

- The matrix is written first, as table-driven `RoomSpec` scenarios, and shown
  failing before the transitions exist. They include a same-role `/role` and a
  refused vote on a round a departure left complete, both leaving it hidden.
- `SnapshotContractSpec` and `snapshot.contract.test.ts` pin the new shape.
- `APISpec` covers `POST /role` for both values, its 401, 403 and 400, and the
  vote's 409 `NotAVoter`. It also covers a `/join` without `role`, and one
  with another value, both answering 400 (decision 5).
- `test/reproduction.test.js` sends `role` in its join body.
- The e2e suite passes unchanged.
- `docs/known-issues.md`, "No request payload is validated on any endpoint that
  takes one", gains a clause: `role` is validated by the schema.

## Step 2c. Roles in the page

### What the browser stores

- `role:<roomId>` is written from the page's own seat in each snapshot that
  holds it, so it converges on the server's seat and a switch made in another
  tab is stored by every tab. A 204 from `/role` also writes it, so a switch
  survives a reload while the stream is stalled and no snapshot has come. A
  successful join writes it with the role it sent, for the same stall. Nothing
  else writes one, so a key exists only for a room the server accepted, and a
  typo it refuses leaves none. The keys are the ids pages loaded,
  so an exact match needs none of the server's rewrite rules.
- `defaultRole` is written by each choice in the "Your default role" fieldset,
  at once and without a submit, so a change of mind overwrites it. A lobby
  submit writes it only when none is stored, so a first visit that kept the
  pre-selected Voter stores it. Nothing else writes it, so a lobby tab opened
  before a choice cannot undo it.
- Once `createRoom()` succeeds, Create removes any key under the id it gets.
  A slug is reused once the server forgets its room, and nobody remembers one
  from months ago, so an old role for a room just created would read as a bug.
  A Create with no pick sets no `pendingJoin`, so the removal is what keeps
  the old role out; with a pick, `pendingJoin` outranks the key. A failed
  create changes no role key.
- The root lobby navigates, so a later visit's submit hands its pick over in
  `pendingJoin`, a sessionStorage entry `{roomId, role}`, where `roomId` is
  the trimmed typed id or the minted one. A submit with no pick sets none, so
  a pre-selected value never outranks the room's remembered role. Every page
  load, the root's included, reads and removes it. It **matches** when its
  `roomId` equals the path's id or the `moved` value, since a pasted legacy id
  arrives under its slug. So a stale entry, left by a submit whose page never
  loaded the app (a 404, a server down), can only match the room it named.
- 2c changes the server's legacy redirect from `?moved=1` to `?moved=<the id
  as requested>`, the raw path segment, not the lowercased UUID, so it compares
  equal to the typed id. The banner shows when `moved` is present. The second
  clause of the match goes with the redirect, and 2c says so in the roadmap's
  entry that removes it.
- Every read decodes the stored string, so a value other than the two roles
  counts as none: a bad default reaches the lobby, and a bad remembered role
  is skipped, rather than sending a refused join. A `pendingJoin` that does not
  parse, or lacks a `roomId` or one of the two roles, counts as none.

### The join role

Every join sends the join role (Terms). The pick handed over is:

- for the lobby's Join on a room's own path, its pick, if any ("Join as"
  shows on a later visit only);
- for the auto-join, a `pendingJoin` that matches.

A successful join stores the join role as the room's remembered role, and the
snapshots that follow keep it in step with the seat. The join role, the match
and "Join as"'s pre-selection live in one pure module, `room/joinRole.ts`,
under the parent's principle 8, so step 4 cannot change them.

### The lobby

The Create and the Join forms show the same role controls, under the name.
Enter still submits from the name field only (principle 8). What they show
depends on whether a default role is stored when the page loads (decision 7).
A default stored later, in this tab or another, changes the shape only at the
next load, so a first visit's form stays as the user is filling it.

**A first visit**, with no default role, gets one `fieldset`, "Your default
role", with two radio buttons, Voter and Facilitator, Voter pre-selected, and
the line "Used to join new rooms. You can change it here later." There is no
"Join as", so no pick: the join role (Terms) is the room's remembered role,
else this new default.

**A later visit** gets:

- the line "Default role: Voter" or "Default role: Facilitator", with a button
  "Change" that replaces the line with the "Your default role" fieldset,
  holding the stored value. A choice there is stored at once, as above.
- a `fieldset` "Join as", with the same two radio buttons. It shows the user's
  pick once they make one, shared by both tabs, so typing or pasting an id, or
  changing the default, never overrides it. On a room's own path, a
  `pendingJoin` that matched counts as that pick, so a failed join or a missing
  name keeps the root's pick. A reload loses it, since the load removed
  `pendingJoin`. Until then it shows the remembered role of
  the room it names, else the default role. A room's own path names its room,
  the root Join tab the trimmed id, and the root Create tab none.
- under "Join as", the hint "Your role last time in this room" while it shows
  a remembered role that differs from the default role. A pick hides it, since
  the value is then the user's own.

On the root tabs, `doCreate` and `doJoin` store the name and, as "What the
browser stores" says, the default role, set `pendingJoin` when there is a pick,
and navigate, and the room's page then auto-joins. On a room's own path, the
lobby's Join is `joinHere` in place, storing the name and the default role
likewise, without `pendingJoin`, and sending the join role. `Connection.join`
gains the role, and `joinHere` takes it as a parameter, since the auto-join
and the lobby send different ones. The root lobby's "Rejoin …" link is
navigation, not a submit: it sets no `pendingJoin`, so the room's path joins at
once with its join role, or shows its lobby when no name or no default role is
stored (decision 7).

### The role line

A line under the room header, above the issue, in the same place on both pages:
"You are a voter." with a button "Switch to facilitator", or "You are a
facilitator." with "Switch to voter". It renders from the page's own seat in the
snapshot. One button element whose label changes, so keyboard focus survives
the switch. A failed request is logged like other command failures, and the line
does not change, since the snapshot did not.

### A facilitator's page

`Deck` is not rendered: no cards, no "Your estimation" and no reveal notice.
Controls, the issue editor, the results and the participants are as for a
voter. The results appearing is what shows a facilitator the reveal until the
parent's step 4 builds step 3's phase line.

### Participants

A facilitator's row shows the text "Facilitator" in the Voted column. While
revealed it keeps the `participant-estimation` element, empty, as a voter who
did not vote has today. `view.ts` gives a facilitator's row no estimation, so
the tally leaves facilitators out without a rule of its own.

### The contract

Additions, each a decision under the parent's principle 9:

| What the suite reads | Contract |
| --- | --- |
| The lobby's default role | `getByRole('group', { name: 'Your default role' })`, radios `Voter` and `Facilitator`; on a later visit, the exact text `Default role: Voter` or `Default role: Facilitator`, in an element without the button, and `getByRole('button', { name: 'Change' })` |
| The lobby's role for this join | `getByRole('group', { name: 'Join as' })`, the same radios, on a later visit only |
| The hint | the exact text `Your role last time in this room` |
| The switch | `getByRole('button', { name: 'Switch to facilitator' })` and `'Switch to voter'` |
| A facilitator's row | the exact text `Facilitator` within `participantEntry(page, name)` |
| A facilitator's page has no deck | `deck(page)` has count 0 |

`revealedEstimation` and `expectSummaryMatchesParticipants` are unchanged. The
`join` fixture gains a `{ role }` option, defaulting to Voter, which it
chooses as the default role, since each case starts from a first visit. One
existing case changes: `slug.spec.js`, "a room remembered from before the cutover reopens
under its derived name", also seeds `defaultRole`, so it keeps testing the
legacy redirect and the rejoin; a remembered name with no default role has its
own case below.
The others do not change. The suite may also seed `localStorage` `name`,
`roomId`, `defaultRole` and `role:<roomId>`, and never reads storage.

### Pass condition

`room/joinRole.test.ts` has scenario cases, each shown failing against a
broken rule:

- a stored role other than the two roles, or a malformed `pendingJoin`, reads
  as none;
- the join role takes the pick, else the remembered role, else the default;
- a first visit has no pick, so a remembered role outranks the default it
  just set;
- a submit with no pick sets no `pendingJoin`;
- `pendingJoin` matches on an id equal to the path's or to the `moved` value,
  and on nothing else;
- "Join as" pre-selects the pick, else the named room's remembered role, else
  the default, and the root Create tab names no room;
- the hint shows only while "Join as" shows a remembered role differing from
  the default.

`APISpec`'s two legacy-redirect cases expect `?moved=` followed by the id
as requested; the upper-case one shows the segment is not normalised.

New e2e cases, each shown failing against 2b:

- a room with a facilitator auto-reveals when the voters finish;
- the last waiting voter switching to facilitator reveals the round;
- a switch to facilitator drops the vote from the results;
- a facilitator stays one across a reload;
- a facilitator's page has no deck, and keeps Show, Re-vote and Clear;
- a regular user from before roles, with a remembered name and no default
  role, gets the room's lobby on its path, asking for the default role alone,
  Voter pre-selected;
- a legacy link, with a remembered name and no default role, reaches the
  first-visit lobby on its slug; the chosen default is the role the join
  sends, and the next visit to the link auto-joins with it;
- a pick at the root differing from the default role is the role
  the join sends, and a later lobby still shows the same `Default role: X`;
- after that join, a switch and a reload keep the switched role, so
  `pendingJoin` was not reused;
- a pick at the root for a pasted legacy id, which the server redirects to
  its slug, is the role the join sends, and a switch and a reload keep the
  switched role;
- a legacy id pasted at the root with no pick, for a room whose key differs
  from the default, joins with that room's remembered role;
- a root pick differing from the default, with the first `/join`
  routed to fail, is still picked in the room's lobby, and its Join sends it;
- a choice after Change is stored without a submit, and a new room's "Join
  as" then pre-selects it;
- on two first-visit tabs, choosing Facilitator in one keeps its first-visit
  form, and after a submit from the other, showing Voter, a later lobby shows
  `Default role: Facilitator`;
- the hint shows while "Join as" holds a remembered role that differs from
  the default role, and hides on a pick;
- at the root, typing a known room's id pre-selects its role, and a role picked
  before typing the id, differing from that room's key, stays picked and is the
  one the join sends;
- a role picked on one root tab is still picked on the other;
- Create, with `/create-room` routed to a slug whose key holds the other role
  and the first `/join` routed to fail, shows that room's lobby with "Join as"
  on the default role and no hint;
- a switch survives a reload while the stream is frozen;
- a root pick differing from the default survives a reload while
  the stream is frozen after the join;
- a switch in one room, then a reload of that room, changes neither another
  room's role nor the default role.

## Accepted costs

- A tab loaded before the deploy that adds the required `role` gets a 400 on
  join and "Could not join the room". A deploy ends every room anyway, and a
  reload fixes it.
- Every browser passes the lobby once after 2c deploys, one click for a voter.
  A private window or cleared storage repeats it, as it already does for the
  name.
- A voter who switches to facilitator after a reveal takes their value out of
  the results the room is discussing. Switching at the next issue avoids it.
- A departure, or a join with a different role, that completes the round leaves
  it waiting for a Show, a vote or a `/role` that changes a
  seat (decision 1).
- A product owner who switches to voter for one question and forgets to switch
  back stays a voter in that room, one click to undo.
- A switch whose 204 is lost while the stream is also stalled, followed by a
  reload, is undone by that reload's join, which sends the earlier role.
- A link to a new room whose slug this browser visited before joins with that
  old room's role, since only Create removes a key. The role line shows
  it, and one click changes it.
- A room id typed at the root with another case is redirected by the server
  without `moved`, and the 404's "Did you mean" link names another id, so
  `pendingJoin` does not match and the join role has no pick. Only a pick
  differing from the room's role is lost. The role line shows the role,
  and one click changes it for that room.
- At the root, a pasted legacy id has no key, since keys are slugs, so "Join
  as" shows the default even when the room remembers the other role. With no
  pick, the join sends the remembered role, not the one shown. The role line
  shows it right after the join, and the gap goes with the legacy redirect.
- A lobby tab opened before a default role choice made in another tab still
  shows the old default. With no pick, its join sends the room's remembered
  role, else the stored default, not the one it shows, on a later visit as on
  a first. It cannot change the default, and a reload shows the new one.
- A first visit cannot choose a role for its room apart from its remembered
  role or the default. The role line switches in one click, and a wrong
  default changes at the next lobby.
- Switching moves the switcher's own page, since the deck appears or
  disappears. Step 3 lays out both pages.
- A facilitator loses the "The round is revealed" line with the deck until step
  4's phase line.

## Relation to other documents

The protocol architecture's section 3 (`2026-08-31-protocol-target-architecture-design.md`)
is extended, not edited: its latch "set by `ShowVotes`, and by a `Vote`" gains
the `/role` switch; its `members.nonEmpty` guard, "insurance rather than a live
case", becomes live; and its `Round` holding `estimates` becomes `Round` beside
`seats`.

## Branches and commits

`20260930.ui_refresh_2a_seats`, `20260930.ui_refresh_2b_roles_wire` and
`20260930.ui_refresh_2c_roles_ui`, stacked and merged in one window. This
document lands with 2a. Each step's commits are set by its plan.
