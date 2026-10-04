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
  completion. The default.
- **Facilitator**: an identity whose seat is `Facilitator`. Holds no estimate,
  gets no deck, and keeps every control.
- **Present**: holding a `Member` entry, as today. An identity removed at grace
  expiry or by the leave beacon keeps its session and its seat, but is not
  present.
- **Complete**: at least one present identity holds a `Voter` seat, and every
  present `Voter` seat holds a confirmed estimate.
- **Switch**: any change of an identity's role, whether from the room's switch
  or from a join that carries a role different from the seat's.

## Decisions

1. **The latch rule.** The round's `revealed` flag is set by Show, or by a vote
   or a switch to facilitator after which the round is complete. `clear` and
   `reVote` clear it. A change in presence never sets it. The principle is that
   only a deliberate act by someone present reveals; a departure is excluded
   because a reload and a close send the same beacon, and grace expiry also
   fires on a slept laptop or a locked phone. Departures are unchanged by this
   step.
2. **A switch to facilitator drops the estimate**, in either phase. "I am not
   here to vote" leaves nothing to bring back later. Switching back starts with
   no estimate.
3. **A switch to voter in a revealed round** behaves as a straggler joining: the
   round stays revealed and their votes are refused until Re-vote or Clear. No
   reveal is ever undone by a role change.
4. **One list.** Facilitators stay in the participant list, in the same name
   order as step 1b, marked "Facilitator" in words.
5. **The role is chosen in the lobby and switched in the room**, remembered in
   `localStorage` and sent on every join, so a reload or a rejoin after a deploy
   keeps it.

Considered and not taken:

- Keeping a facilitator's estimate hidden and restoring it on a switch back.
  It contradicts decision 2's intent.
- Keeping and counting a facilitator's estimate. A vote could then never be
  withdrawn, and a "Facilitator" row would carry a value in the results.
- Re-checking completion when a member is removed. It brings back the reload
  disclosure the latch exists to prevent; see decision 1.
- Absence from a sparse seat map meaning "a voter with no vote". Absence would
  encode a default role, which breaks once a second voting role or a different
  default exists.
- Holding the seat in `Session`. `rename` replaces the session on every join
  with a cookie, and `Join` compares whole sessions, so both would silently
  start erasing votes or refusing joins.

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
- `Session(userId, name)` stays pure identity. `Join`'s equality check and
  `rename` are untouched.
- `clear` sets `round = Round.fresh` and every `Voter(_)` to `Voter(None)`.
  This is the one place a seat's two lifetimes show: the role outlives the round
  and the estimate does not, and a one-line comment on `clear` says so.
- `reVote` unconfirms every `Voter(Some(e))` and clears `revealed`.
- `everyMemberHasVoted` becomes `isComplete`, implementing the Terms' definition
  over present members. In 2a every seat is a voter, so it answers as today.
- `RoomSnapshot.of` reads a present member's estimate from its seat. The wire
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
  - `clear` and `reVote` reach the seats of identities who are not present;
  - `RoomData.of` refuses a session without a seat, and a seat without a
    session.

## Step 2b. Roles on the server and the wire

Nothing visible changes: the page parses the new shape and always sends
`"Voter"`.

### Server

- `Seat.Facilitator` is added.
- `Role` is `Voter` or `Facilitator`, one type shared by both requests below.
- `registerSession` and `rename` take the requested role. `rename` with a
  different role is a switch.
- A switch is one transition on `RoomData`, used by the role endpoint and by
  `rename`. It writes the seat, then sets `revealed` if the role is
  `Facilitator`, the round is open, and `isComplete` holds.
- `vote` refuses a facilitator with a new `VoteRefusal.NotAVoter`. The existing
  checks run first, so a facilitator voting in a revealed round gets
  `RoundRevealed`. Like every refusal, it still publishes.
- `isComplete`'s non-empty guard becomes a live case: when the last voter
  switches to facilitator, nothing reveals. Its comment, which calls the guard
  "insurance rather than a live case", is rewritten.

### Wire

Each participant carries its seat as a tagged union:

```json
{ "id": "…", "name": "Ann", "seat": { "type": "Voter", "estimation": { "type": "ConfirmedHidden" } } }
{ "id": "…", "name": "Bob", "seat": { "type": "Facilitator" } }
```

- The tags are explicit strings in a hand-written encoder, as `Estimation`'s
  are. A facilitator with an estimation cannot be expressed in Scala or in zod.
- Redaction is unchanged: a voter's `estimation` is computed as today.
- `JoinRequest(name, role)`. `role` is **required**: an optional one would need
  a meaning for its absence, and only a tab loaded before a deploy omits it.
- `POST /rooms/{id}/role`, body `{"role": "Voter"}` or `{"role": "Facilitator"}`,
  answers 204, with the 401 and 403 refusals of Show and Clear. It goes through
  `act`, the update-and-publish path. Any other value is a 400 from the schema.

| Body | Seat before | Seat after | Latch |
| --- | --- | --- | --- |
| `Voter` | `Facilitator` | `Voter(None)` | none; in a revealed round their votes are refused |
| `Voter` | `Voter(_)` | unchanged, estimate kept | none |
| `Facilitator` | `Voter(_)` | `Facilitator`, estimate dropped | set if the round is open and complete |
| `Facilitator` | `Facilitator` | unchanged | none |

- `NotAVoter` answers **409**, as `RoundRevealed` does. Not 403: the conflict is
  with the room's state, and `api.ts` treats only 401 as a session refusal, so
  the page stays in the room.
- The client's schema, `view.ts` and `api.ts` follow the new shape, and
  `api.join` sends `role: "Voter"`.

### States by events

For one identity, A. "Complete" means after the event; "others" are the
other present identities. Every event still publishes.

**Open round.**

| Event | A: `Voter(None)` | A: `Voter(confirmed)` | A: `Voter(unconfirmed)` | A: `Facilitator` |
| --- | --- | --- | --- | --- |
| A votes | estimate set; reveal if complete | replaced; reveal if complete | confirmed; reveal if complete | 409 `NotAVoter` |
| A switches to facilitator | `Facilitator`; reveal if complete | `Facilitator`, estimate dropped; reveal if complete | as confirmed | no-op |
| A switches to voter | no-op | no-op | no-op | `Voter(None)`; the round now waits for A |
| Anyone presses Show | revealed | revealed | revealed | revealed |
| Anyone presses Clear | `Voter(None)` | `Voter(None)` | `Voter(None)` | unchanged |
| Anyone presses Re-vote | unchanged | unconfirmed | unchanged | unchanged |
| A departs, by beacon or grace expiry | seat kept; never reveals | seat kept; never reveals | seat kept; never reveals | seat kept |
| A rejoins with the seat's role (a reload) | no-op | no-op | no-op | no-op |
| A rejoins with the other role | as A switches to facilitator | as A switches to facilitator | as A switches to facilitator | as A switches to voter |
| A's stream reconnects in place | seat unchanged | seat unchanged | seat unchanged | seat unchanged |
| Another voter's vote or switch completes the round | cannot happen while A is present: A is waited on | revealed | cannot happen while A is present: A is not confirmed | revealed |
| The server restarts | all lost; the rejoin creates the seat from the role sent | likewise | likewise | likewise |

**Revealed round.**

| Event | A: `Voter(None)` | A: `Voter(confirmed)` | A: `Voter(unconfirmed)` | A: `Facilitator` |
| --- | --- | --- | --- | --- |
| A votes | 409 `RoundRevealed` | 409 `RoundRevealed` | 409 `RoundRevealed` | 409 `RoundRevealed` |
| A switches to facilitator | `Facilitator` | `Facilitator`; A's value leaves the results | as confirmed | no-op |
| A switches to voter | no-op | no-op | no-op | `Voter(None)`; still revealed |
| Anyone presses Show | no-op | no-op | no-op | no-op |
| Anyone presses Clear | `Voter(None)`, round open | `Voter(None)`, round open | `Voter(None)`, round open | unchanged, round open |
| Anyone presses Re-vote | unchanged, round open | unconfirmed, round open | unchanged, round open | unchanged, round open |
| A departs, rejoins or reconnects | as in an open round, a rejoin with the other role being the switch above | likewise | likewise | likewise |

An unconfirmed voter in a revealed round is reachable: a Re-vote, then a Show
before everyone confirms again.

### Accepted races

- A vote and a switch to facilitator from two tabs of the same identity: the
  actor's order decides. The vote first means it is dropped; the switch first
  means a 409. Both end as a facilitator with no estimate.
- A switch to voter racing another voter's completing vote: one order reveals
  with A not counted, the other leaves the round waiting for A. Two humans
  within a round trip.
- A switch to facilitator that completes the round while another vote is in
  flight: that vote gets `RoundRevealed`, as it would after a Show.

### Pass condition

- The matrix is written first, as table-driven `RoomSpec` scenarios, and shown
  failing before the transitions exist.
- `SnapshotContractSpec` and `snapshot.contract.test.ts` pin the new shape.
- `APISpec` covers `POST /role` for both values, its 401, 403 and 400, and the
  vote's 409 `NotAVoter`.
- The e2e suite passes unchanged.

## Step 2c. The UI

### The lobby

Both the Create and the Join forms get a "Join as" choice under the name: a
`fieldset` with that legend and two radio buttons, Voter and Facilitator. It is
filled in from `localStorage` key `role`, and absent means Voter. Create, Join
and the auto-join on a room's own path all send the role. Enter still submits
from the name field only (principle 8).

The role is stored when the form is submitted, as the name already is. A failed
join leaves the choice in the form.

### The switch

A line under the room header, above the issue, in the same place on both pages:
"You are a voter." with a button "Switch to facilitator", or "You are a
facilitator." with "Switch to voter". One button element whose label changes, so
keyboard focus survives the switch. The role is stored in `localStorage` when
`POST /role` answers 204. A failed request is logged like other command
failures, and the line does not change.

### A facilitator's page

`Deck` is not rendered: no cards, no "Your estimation" and no reveal notice.
Controls, the issue editor, the results and the participants are as for a
voter. The results appearing is what shows a facilitator the reveal until the
parent's step 3 adds the phase line.

### Participants

A facilitator's row shows the text "Facilitator" in the Voted column and
nothing under Estimation. `view.ts` gives a facilitator's row no estimation, so
the tally leaves facilitators out without a rule of its own.

### The contract

Additions, each a decision under the parent's principle 9:

| What the suite reads | Contract |
| --- | --- |
| The lobby's role choice | `getByRole('radiogroup', { name: 'Join as' })`, radios `Voter` and `Facilitator` |
| The switch | `getByRole('button', { name: 'Switch to facilitator' })` and `'Switch to voter'` |
| A facilitator's row | the exact text `Facilitator` within `participantEntry(page, name)` |
| A facilitator's page has no deck | `deck(page)` has count 0 |

The `join` fixture gains a `{ role }` option, defaulting to Voter, so the
existing cases do not change.

### Pass condition

New e2e cases, each shown failing against 2b:

- a room with a facilitator auto-reveals when the voters finish;
- the last waiting voter switching to facilitator reveals the round;
- a switch to facilitator drops the vote from the results;
- a facilitator stays one across a reload;
- a facilitator's page has no deck, and keeps Show, Re-vote and Clear;
- the lobby's choice is filled in from the last one used.

## Accepted costs

- A tab loaded before a deploy that adds the required `role` gets a 400 on join
  and "Could not join the room". A deploy ends every room anyway, and a reload
  fixes it.
- A voter who switches to facilitator after a reveal takes their value out of
  the results the room is discussing. Switching at the next issue avoids it.
- A departure that completes the round still waits for a Show or another vote,
  as today.
- Two in-room switches whose 204s cross can leave `localStorage` holding the
  earlier role, and the next reload would join with it. It needs a click, the
  label changing, a second click and the responses crossing, within one round
  trip.
- Switching moves the switcher's own page, since the deck appears or
  disappears. Step 3 lays out both pages.
- A facilitator loses the "The round is revealed" line with the deck until step
  3's phase line.

## Branches and commits

`20260930.ui_refresh_2a_seats`, `20260930.ui_refresh_2b_roles_wire` and
`20260930.ui_refresh_2c_roles_ui`, stacked and merged in one window. This
document lands with 2a. Each step's commits are set by its plan.
