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
6. **The browser remembers the role per room.** The server forgets a room after
   two hours without connections, and the session cookie ends with the browser,
   so a weekly meeting usually starts with a new identity. The page keeps
   `role:<roomId>` in step with the room's seat ("Remembering the role" in 2c),
   and `lastRole`, written only by the lobby. A one-off switch in one room
   changes neither another room's role nor the default for a new room.
7. **With no remembered role, the lobby comes first.** A room's own path joins
   at once only when a name and a role are remembered, a remembered role being
   `role:<roomId>`, else `lastRole`. Otherwise the lobby
   shows, with Voter pre-selected, so every role is confirmed by a person once.
   This is also where every existing user meets the feature.

Considered and not taken:

- Keeping a facilitator's estimate hidden and restoring it on a switch back: a
  value would reappear unasked, and the wire would carry a hidden state.
- Keeping and counting a facilitator's estimate: a vote could never be
  withdrawn, and a "Facilitator" row would carry a value in the results.
- Re-checking completion when a member is removed: it brings back the reload
  disclosure the latch exists to prevent.
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
- Passing the lobby's choice as `?role` in the URL: both redirects would have to
  keep the query, and a crafted link would switch a seat and drop a vote.
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
- The switch transition writes the seat: to `Facilitator` drops any estimate, to
  `Voter` from `Facilitator` gives `Voter(None)`, and the same role changes
  nothing.
- The latch step, one private step on `RoomData`: if the round is open and
  complete, set `revealed`. An applied vote and a `/role` that changes the seat
  run it. A refused vote, a same-role `/role` and a join never do, so none of
  them reveals a round a departure left complete.
- `vote` refuses a facilitator with a new `VoteRefusal.NotAVoter`, after the
  existing checks: a facilitator's vote in a revealed round gets
  `RoundRevealed`, and a blank one `BlankEstimation`. Like every refusal, it
  still publishes.
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
  transitions are the matrix's "A switches through `/role`" rows.
- `NotAVoter` answers **409**, as `RoundRevealed` does. Not 403: the conflict is
  with the room's state, and `api.ts` treats only 401 as a session refusal, so
  the page stays in the room. The two are indistinguishable on the wire, which
  is accepted, since the page handles both alike.
- The client's schema, `view.ts` and `api.ts` follow the new shape.

### States by events

For one identity, A. "Complete" means after the event. Every event still
publishes. A join may arrive while A is not present: a reload's beacon usually
removes A first.

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
  vote's 409 `NotAVoter`.
- `test/reproduction.test.js` sends `role` in its join body.
- The e2e suite passes unchanged.
- `docs/known-issues.md`, "No request payload is validated on any endpoint that
  takes one", gains a clause: `role` is validated by the schema.

## Step 2c. The UI

### Remembering the role

- `role:<roomId>` is written from the page's own seat in each snapshot, so it
  converges on the server's seat and a switch made in another tab is stored by
  every tab. A 204 from `/role` also writes it, so a switch survives a reload
  while the stream is stalled and no snapshot has come.
- `lastRole` is written on every lobby submit, and nowhere else, so neither a
  switch in the room nor an auto-join changes the default for a new room.
- A `role:<id>` key exists only for a room the page reached: only a snapshot
  creates one. A lobby submit overwrites `role:<trimmed id>` with its radio when
  that key exists, and otherwise writes only `lastRole`, so a choice made for a
  known room is the one the join sends, and a typo or an unreachable room
  leaves no key. The keys are the ids pages loaded, so an exact match needs
  none of the server's rewrite rules. Create writes no key: a new room's page
  joins with `lastRole`, which the same submit has just set.
- A remembered role is `role:<roomId>`, else `lastRole` (decision 7). It is
  what a join sends, except on the room's own lobby, which sends its radio.

### The lobby

Both the Create and the Join forms get a "Join as" choice under the name: a
`fieldset` with that legend and two radio buttons, Voter and Facilitator.
Enter still submits from the name field only (principle 8). The radio is
pre-selected:

- on a room's own path, from its remembered role, else Voter;
- on the root Join tab, from `role:<trimmed id>` when that key exists, else
  `lastRole`, else Voter;
- on the root Create tab, from `lastRole`, else Voter.

On the root tabs, `doCreate` and `doJoin` store the name and the role and
navigate, and the room's page then joins with its remembered role. On a room's
own path, the lobby's Join is `joinHere` in place, sending the radio's role and
storing it as above; `Connection.join` gains the role. The auto-join writes
neither key. The root lobby's "Rejoin …" link is navigation, not a submit: the
room's path joins at once with its remembered role, or shows its lobby when
there is none.

### The switch

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
parent's step 3 adds the phase line.

### Participants

A facilitator's row shows the text "Facilitator" in the Voted column. While
revealed it keeps the `participant-estimation` element, empty, as a voter who
did not vote has today. `view.ts` gives a facilitator's row no estimation, so
the tally leaves facilitators out without a rule of its own.

### The contract

Additions, each a decision under the parent's principle 9:

| What the suite reads | Contract |
| --- | --- |
| The lobby's role choice | `getByRole('group', { name: 'Join as' })`, radios `Voter` and `Facilitator` |
| The switch | `getByRole('button', { name: 'Switch to facilitator' })` and `'Switch to voter'` |
| A facilitator's row | the exact text `Facilitator` within `participantEntry(page, name)` |
| A facilitator's page has no deck | `deck(page)` has count 0 |

`revealedEstimation` and `expectSummaryMatchesParticipants` are unchanged. The
`join` fixture gains a `{ role }` option, defaulting to Voter. One existing
case changes: `slug.spec.js`, "a room remembered from before the cutover reopens
under its derived name", also seeds `lastRole`, so it keeps testing the legacy
redirect and the rejoin; a remembered name with no role has its own case below.
The others do not change.

### Pass condition

New e2e cases, each shown failing against 2b:

- a room with a facilitator auto-reveals when the voters finish;
- the last waiting voter switching to facilitator reveals the round;
- a switch to facilitator drops the vote from the results;
- a facilitator stays one across a reload;
- a facilitator's page has no deck, and keeps Show, Re-vote and Clear;
- a regular user from before roles, with a remembered name and no remembered
  role, gets the room's lobby on its path, Voter pre-selected;
- a lobby choice for a known room, after Leave, is the role the join sends;
- a switch survives a reload while the stream is frozen;
- a switch in one room changes neither another room's role nor the lobby's
  default for a new room.

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
  it waiting for a Show or another vote (decision 1).
- A product owner who switches to voter for one question and forgets to switch
  back stays a voter in that room, one click to undo.
- A switch whose 204 is lost while the stream is also stalled, followed by a
  reload, is undone by that reload's join, which sends the earlier role.
- A known room typed in the lobby with another case, or as its legacy id, does
  not match its stored key, so the join sends that room's remembered role, not
  the lobby's choice. Nothing switches, the switch line shows the role, and one
  click changes it.
- Switching moves the switcher's own page, since the deck appears or
  disappears. Step 3 lays out both pages.
- A facilitator loses the "The round is revealed" line with the deck until step
  3's phase line.

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
