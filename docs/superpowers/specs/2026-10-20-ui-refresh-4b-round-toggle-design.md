# UI Refresh, Step 4b: The Round Bar's Toggle and Guard

Date: 2026-10-20
Status: In discussion
Parent: `docs/superpowers/specs/2026-09-30-ui-refresh-design.md`, step 4

## Purpose

Step 4 runs as four steps, sliced by how each is judged (the parent's Steps).
4b is its one behaviour change: Show votes and Re-vote become one button, and
the round bar ignores presses for 1 s after the phase changes. It builds 3b1
decision 6 and the reference's J5 on today's look, as step 2 built roles; 4c1
restyles it.

The toggle cannot ship without the guard. It puts Re-vote under the pointer
that pressed Show, so a double-click's second click, or a click meant for Show
landing after someone else's, would reopen the round.

## Terms

- **Phase**: voting or revealed, the `votesRevealed` of the snapshot the room
  shows.
- **Flip**: a change of phase between two snapshots the mounted room has
  rendered. The first snapshot is never a flip.
- **The bar**: the round's actions, `Controls.tsx`: the toggle and Clear votes,
  and from step 5 Next issue.
- **The toggle**: one button element, "Show votes" while voting and "Re-vote"
  while revealed.
- **Guarded**: the 1 s after the latest flip. While guarded every action in the
  bar is `aria-disabled` and a press on it is dropped.
- **Press**: a click on a bar button, by mouse, touch, Enter or Space.

## Decisions

Settled before this step (3b1 decision 6, J5): the toggle at the bar's edge
and Clear votes set apart; Show votes absent while revealed; the guard on the
bar, not on a button, for 1 s after a flip whoever caused it, the look kept and
focus left where it is; a Clear while voting starts no guard; a held Enter
fires once, as on the role line.

1. **A flip starts the guard, and only a flip.** The first snapshot mounts the
   bar unguarded: nobody has aimed at it yet. A reconnect whose first snapshot
   finds the phase changed is a flip; one that finds it changed and changed
   back is not. `snapshot` is never reset to `null` once set (`connection.ts`),
   so the comparison spans a lost stream. Set aside: guarding the first
   snapshot too, an inert first second that prevents no misfire.
2. **A flip while guarded restarts the 1 s.** The guard ends 1 s after the
   latest flip, one timer cleared and restarted, no extra state. Set aside:
   1 s from the first flip, which needs an "unless running" rule and ends the
   guard 1 s after a flip it ignored. A second flip within the 1 s needs pages
   that saw the first at very different times, or a command sent outside the
   bar, since every other page is guarded too.
3. **One hook, `useRoundGuard(revealed: boolean): boolean`, in
   `components/`, called by `Controls`.** It turns guarded in the same render
   that shows the flip, not in an effect after it, or the new label is
   pressable for a frame. Tested by browser cases only: the logic is a
   comparison and a timer, and its risks (the first render, StrictMode's
   double effects, the timer's cleanup, keys and focus) only a browser shows.
   Set aside: a pure `room/roundGuard.ts` with unit tests, which cannot reach
   those risks; `@testing-library/react`, a dependency for one hook, in jsdom.
4. **One rule on the bar, not per button.** A click-capture handler on the bar
   drops every click while guarded; a key handler on the bar drops every
   repeated Enter, guarded or not; each button carries `aria-disabled="true"`
   while guarded, never `disabled`, which would drop focus. The toggle's label
   changes on the same element, so focus stays across a flip. Step 5's Next
   issue inherits all of it. No double-click filter (`e.detail`): a second
   click after the flip meets the guard, and one before it repeats the same
   command (Accepted costs). The Enter filter covers every action: a held
   Enter on Clear while revealed would reopen the round, outlast the 1 s and
   clear the new round's votes. Set aside: the role line's per-button
   handlers, repeated on each action.
5. **The existing cases stay unchanged.** Playwright's click waits while a
   button is `aria-disabled`, so a case pressing the toggle right after a flip
   waits up to 1 s instead of failing; the spike found no flake and no cost.
6. **The double-click case is the forced press.** A double-click endangers the
   round only when the flip lands between its clicks. Playwright's two clicks
   land before the snapshot, so a literal `dblclick()` passes with the guard
   removed. The case presses, waits for the flip, and presses again at once.

## States and events

| Event | Unguarded | Guarded |
| --- | --- | --- |
| Press on the toggle | sends Show (voting) or Re-vote (revealed); nothing changes until a snapshot | dropped; focus stays |
| Press on Clear | sends Clear | dropped; focus stays |
| A repeated Enter on any bar button | dropped | dropped |
| A held Space | fires once, on release (native) | dropped |
| Snapshot with a flip: a Show, Re-vote, or Clear while revealed, from any page; the last vote's auto-reveal; a switch to facilitator completing the round | the label flips on the same element in the same render; becomes guarded | the label flips; the 1 s restarts |
| Snapshot without a flip: a vote, a join or leave, an issue edit, a Clear while voting | unchanged | unchanged; the timer runs on |
| The 1 s elapses | cannot happen | becomes unguarded |
| Stream lost | unchanged; a press takes today's error path | unchanged; the timer runs on |
| Reconnect, the phase changed meanwhile | a flip | a flip |
| Reconnect, the phase changed and changed back | unchanged | unchanged |
| A command fails | today's error handling; no flip | cannot happen: no press was sent |
| First snapshot: a join, a reload, the reload after a refusal | the bar mounts unguarded | cannot happen |
| Unmount: Leave, a reload | nothing to clear | the timer is cleared |

## Accepted costs

- A press that left before a flip reached the page acts on the phase it was
  aimed at: a Show on a revealed round changes nothing; a late Re-vote is the
  known issue "A late Re-vote unconfirms a vote cast in the round it
  reopened"; a Clear aimed at a revealed round that lands after someone's
  Re-vote clears the votes cast in between (known issues, new). Each needs two
  people within a round trip, and each is today's behaviour.
- A double-click whose second click lands before the snapshot repeats the same
  command, which changes nothing, or is that late Re-vote at its narrowest.
- A press aimed at the old phase more than 1 s after the flip acts on the new
  one. The 1 s is decision 6's bound.
- A screen reader may or may not speak the toggle's new name while it has
  focus. Step 4a's phase line is the announcement.
- The deck is not in the bar. A revealed round already disables its cards, and
  a card pressed right after a reopening is a vote for that round.

## The spike

Run on 2026-10-20 against a throwaway guard built as decisions 1 to 4, on
today's page, then reverted.

| What | Result |
| --- | --- |
| The suite, three runs in Chromium and Firefox | every case passed in every run, none flaky |
| Run time | 3.8 min a run, against 4.0 on today's page: noise |
| Draft guard cases, three runs in both browsers | all passed |
| Mutation: no guard | the forced press, someone else's Show and the restart fail |
| Mutation: no Enter filter | the held Enter fails |
| Mutation: no restart | the restart fails |
| A literal double-click, guard removed | passes (decision 6) |
| A held Space and a held Enter on a plain button | one click and one per repeat, in both browsers |

## Contract

Contract change: Show votes is absent while revealed. No existing case reads it
there (step 1c), so none changes, and `'Re-vote is offered only while the
round is revealed'` still holds: while voting the toggle is named "Show
votes".

New cases, in `e2e/room.spec.js`, each shown to fail by the mutation beside it:

| Case | Mutation |
| --- | --- |
| A press while guarded is dropped, and acts once the 1 s is over (a forced click) | no guard |
| A double-click's second click, landing after the flip, does nothing | no guard |
| Someone else's Show guards my bar | the guard started only by this page's own press |
| A held Enter fires once, and focus stays on the toggle across the flip | no Enter filter; the toggle as two elements |
| A second flip restarts the guard, the second command sent to the API | no restart |
| A Clear while voting starts no guard | any snapshot starts the guard |
| The first snapshot mounts the bar unguarded | the guard started on mount |

A case reads guarded as `aria-disabled="true"` on the bar's buttons, and proves
a press dropped with `click({ force: true })`, which skips Playwright's wait.

## The docs' changes

- **Parent**: the Steps table runs step 4 as 4b, 4c1 (the room page's look),
  4c2 (the lobby's look, Bootstrap and its Dependabot pin removed) and 4d (the
  not-a-room page in React, and `?tab=join`), each with its own spec; step 4's
  entry says so and points here for the toggle and the guard; its double-click
  guarantee becomes decision 6's case.
- **Reference**: Open's not-a-room line moves to step 4d's brainstorm.
- **Known issues**: a late Clear discards the votes cast in the round a Re-vote
  reopened, beside the late Re-vote entry.

## Branches and commits

One PR on `20260930.ui_refresh_4b_round_toggle`, stacked on 1c's
`20260930.ui_refresh_1c_test_contract_audit` (#455): this document and the
parent's change first, then the code and its cases, the reference and known
issues with them.
