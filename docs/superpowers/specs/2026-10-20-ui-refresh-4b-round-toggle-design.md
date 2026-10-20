# UI Refresh, Step 4b: The Round Bar's Toggle and Guard

Date: 2026-10-20
Status: In discussion
Parent: `docs/superpowers/specs/2026-09-30-ui-refresh-design.md`, step 4

## Purpose

Step 4 runs as five steps, sliced by how each is judged (the parent's Steps).
4b is the round bar's behaviour change: Show votes and Re-vote become one
button, guarded as 3b1 decision 6 and the reference's J5 define. It is built on
today's look, the toggle in Show's place; 4c1 restyles the bar and orders its
actions.

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
- **Press**: a click on a bar button, by mouse, touch, Enter or Space, judged
  when the click fires: at release for a mouse, a touch or Space.

## Decisions

Settled before this step: 3b1 decision 6, the guard's rule, and J5, the
actions per phase.

1. **A flip starts the guard, and only a flip.** The first snapshot mounts the
   bar unguarded: nobody has aimed at it yet. A reconnect whose first snapshot
   finds the phase changed is a flip; one that finds it changed and changed
   back is not. `snapshot` is never reset to `null` once set (`connection.ts`),
   so the comparison spans a lost stream. Set aside: guarding the first
   snapshot too, an inert first second that prevents no misfire.
2. **A flip while guarded restarts the 1 s.** One timer, cleared and restarted.
   Set aside: 1 s from the first flip, which needs an "unless running" rule.
   Every page is guarded after a flip, so a second flip within the 1 s comes
   from outside the bars: a vote that completes a reopened round, a switch to
   facilitator, a page that saw the first flip late, or a command sent
   directly.
3. **One hook, `useRoundGuard(revealed: boolean): boolean`, in
   `components/`, called by `Controls`.** Guarded is computed in the render
   that shows the flip; an effect would leave the new label pressable for a
   frame. It is safe under StrictMode by construction: the last phase is kept
   in state and compared during render, a flip counter is the timer effect's
   only dependency, and the effect's cleanup clears the timer; no ref is
   written during render. Tested by browser cases, whose risks are keys, focus
   and timing; the suite runs the production build, so StrictMode gets one hand
   check under `npm run dev`, recorded in the PR. Set aside: a pure
   `room/roundGuard.ts` with unit tests, which cannot reach those risks;
   `@testing-library/react` and `jsdom`, two dependencies for one hook.
4. **One rule on the bar, not per button.** A click-capture handler on the bar
   drops a click while guarded or whose `detail` is above 1; a key handler on
   the bar drops a repeated Enter, guarded or not; each button carries
   `aria-disabled="true"` while guarded, never `disabled`, which would drop
   focus. The toggle's label changes on the same element, so focus stays across
   a flip. A held Space fires once by itself (checked in both browsers), so the
   key rule is Enter's alone. The `detail` rule closes what 3b1 decision 6
   promises, a double-click's second click landing before the flip, which
   would repeat the command; after a flip the guard already covers it. The
   Enter rule covers every action: a held Enter on Clear while revealed would
   reopen the round, outlast the 1 s and clear the new round's votes. Step 5's
   Next issue inherits the rule. Set aside: the role line's per-button
   handlers, repeated on each action.
5. **The existing cases stay unchanged but for one wait.** Playwright's click
   waits while a button is `aria-disabled`, so a press right after a flip waits
   up to 1 s. A press can still be dropped when the pressing page flips between
   that check and the click: a case first waits on the pressing page's own
   phase, as every case does but 'a facilitator's page has no deck, and keeps
   Show, Re-vote and Clear', whose Clear follows a wait on Bob's page. That case
   gains a wait for Alice's toggle to read Re-vote, before its Clear. Step 5's
   cases follow the same rule.
6. **A case proves an effect, not an attribute.** A press acts when its request
   is sent and is dropped when none is, counted on
   `/rooms/{id}/(show|revote|clear)` after a later snapshot, as 'a double-clicked
   Save issue posts once' does; `click({ force: true })` makes a single press
   without Playwright's wait. A case shows the bar unguarded by a forced press
   that acts at once.
   A retrying read of `aria-disabled` would wait out the 1 s and pass whatever
   the code does.
7. **This reopens J5's "a separate step to hide Show"**, set aside because
   hiding Show is presentation. Show is now hidden by becoming the toggle, and
   the toggle needs the guard, a behaviour judged by its cases.

## States and events

| Event | Unguarded | Guarded |
| --- | --- | --- |
| Press on the toggle | sends Show (voting) or Re-vote (revealed); nothing changes until a snapshot | dropped; the guard moves no focus |
| Press on Clear | sends Clear | dropped; the guard moves no focus |
| A click with `detail` above 1 | dropped | dropped |
| A repeated Enter on any bar button | dropped | dropped |
| Snapshot with a flip: a Show, Re-vote, or Clear while revealed, from any page; the last vote's auto-reveal; a switch to facilitator completing the round | the label flips on the same element in the same render; becomes guarded | the label flips; the 1 s restarts |
| Snapshot without a flip: a vote, a join or leave, an issue edit, a Clear while voting | unchanged | unchanged; the timer runs on |
| The 1 s elapses | cannot happen | becomes unguarded |
| Stream lost | unchanged; a press is still sent over HTTP, and a flip it causes shows at the reconnect | unchanged; the timer runs on |
| Reconnect, the phase changed meanwhile | a flip | a flip |
| Reconnect, the phase changed and changed back | unchanged | unchanged |
| A command fails | today's error handling; no flip | today's error handling; the timer runs on |
| First snapshot: a join, a reload, the reload after a refusal | the bar mounts unguarded | cannot happen |
| Leave, a reload | the page unloads | the page unloads |

## Accepted costs

- A press that left before a flip reached the page acts on the phase it was
  aimed at: a Show on a revealed round changes nothing; a late Re-vote is the
  known issue "A late Re-vote unconfirms a vote cast in the round it
  reopened"; a Clear aimed at a revealed round that lands after someone's
  Re-vote clears the votes cast in between (known issues, new). Each needs two
  people within a round trip, and each is today's behaviour.
- Two quick Enters, not held, before the flip send the command twice, as a
  double-click would without the `detail` rule: keyboard clicks carry `detail`
  0. A fast double-tap a browser reports as two single clicks does the same
  (inferred for iOS), a phone risk held in known issues.
- A deliberate second click on the same spot within the double-click time is
  ignored, the role line's known issue extended to the bar.
- A press aimed at the old phase more than 1 s after the flip acts on the new
  one. The 1 s is 3b1 decision 6's bound.
- A background tab's throttled timers can stretch the guard towards 2 s, unseen
  (inferred).
- A screen reader may or may not speak the toggle's new name while it has
  focus. Step 4a's phase line is the announcement.
- The deck is not in the bar. A revealed round already disables its cards, and
  a card pressed right after a reopening is a vote for that round.

## The spike

Run on 2026-10-20 against a throwaway guard built as decisions 1 to 4, without
the `detail` rule, on today's page, then reverted.

| What | Result |
| --- | --- |
| The suite, three runs in Chromium and Firefox | every case passed in every run, none flaky |
| Run time | 3.8 min a run, against 4.0 on today's page: noise |
| Mutation: no guard | the forced press, someone else's Show and the restart fail |
| Mutation: no Enter rule | the held Enter fails |
| Mutation: no restart | the restart fails |
| A literal double-click with no guard, read by the round's state | passes: both clicks land before the flip |
| A held Space and a held Enter on a plain button | one click and one per repeat, in both browsers |

## Contract

Contract change: Show votes is absent while revealed, and no existing case
reads it there (step 1c), so `'Re-vote is offered only while the round is
revealed'` still holds. One case gains a wait (decision 5).

New cases, in `e2e/room.spec.js`, each shown to fail by the mutation beside it:

| Case | Mutation |
| --- | --- |
| A forced single press just after a flip sends nothing, and one after the 1 s acts | no guard; the drop removed, `aria-disabled` kept |
| A double-click sends one request | no `detail` rule |
| Someone else's Show guards my bar | the guard started only by this page's own press |
| A held Enter fires once, and focus stays on the toggle across the flip | no Enter rule; the toggle as two elements |
| A second flip restarts the guard, the second command sent to the API, on a paused clock | no restart; the guard at 500 ms; the guard at 1500 ms |
| A Clear while voting starts no guard | any snapshot starts the guard |
| The first snapshot mounts the bar unguarded | the guard started on mount |
| The guard lasts 1 s from the flip, on a paused clock | the guard at 500 ms; the guard at 1500 ms; the timer restarted by every render |

## The docs' changes

- **Parent**: the Steps table, the order, and step 4's and 4a's entries.
- **Reference**: J5's Show line points to 4b; the log gains a 4b entry for
  decision 7; Open's not-a-room line moves to step 4d's brainstorm.
- **Known issues**: a late Clear discards the votes cast in the round a Re-vote
  reopened, beside the late Re-vote entry; the role line's re-click entry
  extends to the bar; the double-tap phone risk.

## Branches and commits

One PR on `20260930.ui_refresh_4b_round_toggle`, stacked on 1c's
`20260930.ui_refresh_1c_test_contract_audit` (#455): this document and the
parent's change first, then the code and its cases, the reference and known
issues with them.
