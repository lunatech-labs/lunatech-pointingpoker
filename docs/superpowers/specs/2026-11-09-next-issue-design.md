# Next Issue

Date: 2026-11-09
Status: Approved
Parent: issue #548

## Purpose

Moving on is probably the most frequent action of a session, and today it
takes two: Clear votes, then the pencil, type and save. Next issue does both in
one request, from a dialog that names the next issue.

It builds on #548's "Decided" section, whose group decisions this spec does not
repeat: what a round is, one request naming the round it closes, and a modal
form. Out of scope: the estimate row and the history (#528), the round counter
(#538), copy and export.

## Terms

- **Round number**: a count the room keeps, which only Next issue increments.
- **A room's life**: from a room's start to its stop (after `stop-after-idle`
  with no connection) or the server's restart. Sessions live in the room
  (`RoomData.sessions`), so they end with it.
- **Opening round**: the round number in the page's latest snapshot when the
  dialog or the issue editor opened.
- **Moved on**: the latest snapshot's round number differs from the opening
  round. Within a room's life the number only rises, so "differs" means
  "later".
- **Shown issue**: the issue in the page's latest snapshot.
- **The notice**: *The room moved on to: "‹shown issue›"*, or *The room moved
  on, with no issue yet* for an empty one, then an **OK** button. Neutral on
  purpose: it is true whoever moved on, including a request of the page's own
  whose answer was lost. Its text sits in an always-present `role="status"`
  region, as the issue panel's (`issue-status`), so it is announced. When what
  it replaces held focus (a form, or the conflict line's Use theirs), focus
  moves to its text, so a keystroke meant for the form presses nothing;
  otherwise focus stays where it is. That is recorded before the replacement,
  since by then focus has already fallen to the page.
- **The message**: *Could not move on to the next issue*, as the issue
  editor's *Could not save the issue*.
- **The toggle**: the round bar's one Show votes / Re-vote button
  (`RoundBar`).

## Decisions

1. **The request.** `POST /rooms/{roomId}/next-issue` with
   `{ "round": <opening round>, "issue": <text> }`. The room applies it only if
   `round` equals its round number, else refuses it with `409`: a refusal of
   this endpoint only, `NextIssueRefusal.RoundClosed`, with its own error list,
   as `VoteRefusal` is for `vote`, so no other endpoint's contract changes.
   #548 said such a request "is ignored"; a `409` lets the page tell its own
   move from a lost one.

   | Request's round vs the room's | Can it happen? | Answer |
   |---|---|---|
   | equal | yes | applied, `204` |
   | behind | yes: someone moved on first, or the page was away under the grace period | `409` |
   | ahead | cannot happen: a page learns numbers only from its room's life | `409`, the same path |

   The session checks come first, as for every command: `401` for a session
   from another room's life, `403` for a member dropped after the grace period.

   Applying is one state change: every seat cleared as Clear clears it, the
   phase back to voting, the issue replaced, the round number incremented. No
   snapshot shows a step between, and the auto-reveal re-arms as after Clear.
   The issue follows `edit-issue`'s rules, so an empty one is allowed and shows
   "No issue yet".

2. **The round number.** It sits in `RoomState` as `roundNumber`, not in
   `Room.Round` (which `RoomState.round` already names): Clear replaces `Round`
   whole (`Round.fresh`) and must not reset it. A room starts at 1 (my call:
   #538's counter can then show it as it is). The snapshot carries it as
   `round`.

3. **Who and when.** Anyone in the room, as for Clear, Show votes and Re-vote.
   The round bar shows Next issue only once revealed, in the place and with the
   guard 3b1's decision 6 gives it; Re-vote becomes secondary there. Showing it
   only once revealed is the user's provisional call, to check against feedback
   after delivery. The server accepts Next issue in either phase; reversing the
   call would also key the round bar's guard (`useRoundGuard`, on `revealed`
   today) on the round number. Skipping an issue mid-vote is Show votes then
   Next issue: a blank reveal is allowed.

4. **The compact round bar.** In the compact foot (below 65.75 rem, both
   layouts) Re-vote shows its icon alone, its name kept (3b2 decision 6;
   `round-bar.css` already hides the secondary button's word there). In the
   phone layout (below 51.75 rem, where Clear is already its icon) Next issue's
   visible word is "Next", its name staying "Next issue". This departs from
   3b2 decision 15, which shortened it only "where the round bar cannot hold it
   (about a 21 rem page)": "Next" now covers the whole phone layout, so no new
   breakpoint is measured. Clear keeps its words in the wide layout; the layout
   test checks the fit, and a width that does not fit comes back to this spec.

5. **Focus in the round bar.** The page moves focus itself rather than rely on
   the browser's return: when the dialog closes, focus goes to Next issue if
   the round bar shows it, else to the toggle; when Next issue leaves the round
   bar while it has focus, focus goes to the toggle. 3b1's "focus stays on the
   button that had it" cannot hold for a button that is gone. When the notice
   appears in the same render, it does not compete: it takes focus only from
   what it replaces.

6. **Clear votes stays; the issue editor belongs to its round.** Clear is a
   reset within the round and keeps its place in both phases, so the cases that
   click it keep their contract. The issue editor records its opening round on
   the pencil; its snapshot event carries the round as well as the issue, and
   fires when either changes, so `useIssueEditor` and `IssuePanel` take the
   round as an input. Once moved on, the notice replaces the editor's form, its
   conflict line and its failure message; OK closes it, dropping the draft,
   and focus goes to Edit as on any close (3b3 decision 9). While saving, the
   answer decides as before. The saved text, which the editor shows while the
   room catches up, belongs to its round too: a snapshot of a later round
   clears it, and a success once moved on does not set it. Within a round,
   *Changed by someone else to* with Use theirs stays as it is. The dialog
   never touches the editor.

7. **The dialog.** The app's first modal: a native `<dialog>`, rendered by
   `RoomPage` inside `.room-page` but outside `RoundBar`, so it survives the
   phase change, the round bar's capture handlers do not reach it, and the
   page's container rules apply. `keepClearOfSheet` skips focus inside it.
   Titled "Next issue", as `docs/design/room.html?next=modal` without its
   estimate row (#528's) and with the field pre-filled.
   - **The field**, labelled "Next issue", starts with the shown issue, one line
     (`oneLine`), all of it selected, focused. Typing replaces it; End or a tap
     keeps it to change a ticket number. The press on the round bar's Next
     issue calls `showModal()` and selects the field in its own handler, as the
     issue panel's `open` does, since iOS opens the keyboard only for a focus
     set during the tap.
   - **The buttons**: Next issue, which submits, and Cancel, as in the mockup.
   - **Keys and clicks**, as the issue panel and its field: a held Enter's
     repeats are dropped, by a capture on the dialog and in the field's own
     handler; the field drops an input method's composing Enter; a
     double-click's second press on a button is dropped, its mousedown and its
     click. A press on the backdrop or the dialog's own padding does nothing and
     leaves focus where it is.
   - **Sending**, as the issue editor's saving: the field read-only, both
     buttons `aria-disabled`, Escape's `cancel` prevented.
   - **Width**: `width: min(36rem, 100% - 2 × --space-4)`, a set width as in
     the mockup, not a cap, since the field sizes to its content; the
     browser's `margin: auto` centres it (`reset.css` exempts `dialog`). The
     field and buttons drop the issue editor's negative `margin-block`, as the
     mockup does, without overriding the container rule's `margin-top` that
     puts the buttons under the field below 65.75 rem (`issue-editor.css`).

## States and events

Three states: **Closed**, **Open** (with or without the message), **Sending**.
In Open, once moved on, the notice replaces the form and the message. Moved on
is worked out from the snapshot, as the issue editor's `shows` works out its
conflict; the message is a flag, as its `failed`. A pure `step` function holds
the matrix. Each submit takes the next value of a counter local to the page;
its answer carries that number, and only Sending awaits one.

| Event | Closed | Open | Sending |
|---|---|---|---|
| Next issue pressed | Open: the field per decision 7, the opening round from the page, no message | ignored | ignored |
| typed | cannot happen | Open | ignored |
| submit (Enter, button) | cannot happen | Sending, awaiting the next number, message cleared; cannot happen once moved on: the notice has no form | ignored |
| Cancel, or OK | cannot happen | the page closes the dialog | ignored (Cancel; Sending shows no OK) |
| Escape, or a back gesture | cannot happen | the browser closes the dialog | ignored |
| the dialog's `close` event | cannot happen | Closed | Closed: after a `204`, or the browser letting a repeated Escape through |
| backdrop press | cannot happen | nothing | nothing |
| a snapshot | nothing | nothing: the view follows it | nothing |
| `204` to the awaited request | cannot happen: only Sending awaits | cannot happen | the page closes the dialog |
| any other answer to it, network error, timeout | cannot happen | cannot happen | Open with the message |
| an answer no state awaits | ignored | ignored | ignored |
| connection lost, back | nothing | nothing | nothing |

Sending waits for the answer when the room moves on, because the move may be
its own request, arriving by the stream before its `204`. A request ends within
`REQUEST_TIMEOUT_MS`, so Sending cannot hang. Every `401` also reaches
`RoomPage`'s `report`, and so `onRefused`, whatever the state, as `saveIssue`
reports before the editor sees the answer. While the connection is lost the
banner sits behind the modal; a submit then fails with the message if its
request does.

## Accepted races

- **Two people submit within a round trip.** The first wins. The second may
  see the message for a moment before the snapshot turns it into the notice,
  when the `409` beats the snapshot.
- **Re-vote or Clear while the dialog is open.** The dialog stays; submitting
  moves on from a round back in voting, which the button itself would not
  offer. Show votes is then unguarded on the new round (no phase flip), and a
  vote cast just before the move can land in the new round.
- **A Clear or an issue save sent before a move and landing after it** applies
  to the new round, as such races do today; a late Re-vote does nothing once
  #515's guard lands.
- **A double Enter on Next issue**, two presses rather than a held key, opens
  the dialog and submits the pre-filled issue, clearing the revealed votes:
  4b2's accepted cost for Edit ("Accepted costs", two quick Enters save the
  unchanged text), heavier here. Once #528 lands, a split vote's required
  estimate stops it. A double Enter in the field: if the `204` closes the
  dialog first, the second Enter lands on Next issue and reopens it on the old
  round, which then shows the notice for the page's own move.
- **A repeated Escape while sending** closes the dialog but does not withdraw
  the request: the room may still move on, or its failure goes unseen.

## Tests

- **Server.** The room applies Next issue on its round and refuses one behind
  and one ahead; applying clears seats, returns to voting, replaces the issue
  and increments the number, in one snapshot; Clear leaves the number
  unchanged; the endpoint answers `204`, `409`, `401` and `403`; the snapshot
  carries `round`, in the contract test.
- **The matrices.** The dialog's `step` tests cover every cell that changes
  state, and an earlier request's answer. The issue editor's cover the notice
  once moved on, from editing and after a failed save; a move on that keeps
  the issue's text; a later round's snapshot while saving, which keeps the
  form; and the saved text cleared by a later round, and not set by a success
  once moved on.
- **End to end, both browsers**, locators scoped to the dialog or the issue
  panel, since both can show the notice and OK:
  - Open, the field pre-filled and selected, type, submit: the room shows the
    new issue, voting, no votes, focus on the toggle. With the `204` held
    (`page.route`, `route.fetch()`), the dialog shows the form, never the
    notice, until the answer is released.
  - Cancel and Escape close unchanged; one Escape while sending leaves the
    dialog open. A held Enter on Next issue opens the dialog and submits
    nothing; a double-click on it opens the dialog, submits nothing and leaves
    focus in the field.
  - Another page moving on with the issue unchanged shows the notice in the
    dialog, focus on its text, and OK puts focus on the toggle. In a separate
    case, with focus in an open issue editor, the editor shows the notice,
    focus on its text, and OK puts focus on Edit.
  - A failed request (`page.route` abort) shows the message with the text
    kept. A `401` reaches the restart notice when it arrives after the dialog
    closed: the route held, Escape repeated until the browser closes it, then a
    `401` fulfilled.
  - Next issue is absent while voting and present once revealed. With an issue
    editor open and focus on Next issue instead, another page moving on puts
    focus on the toggle, not on the editor's notice.
- **The existing layout case** "the phase line keeps its box through a reveal,
  a Re-vote and a vote" changes: Next issue appearing at the reveal narrows the
  phase line, so the case keeps its x, y and height, and its width only while
  the bar's buttons stay the same.
- **Layout, Chromium only**, in `e2e/layout.spec.js`'s narrow layouts, at
  heights below 762 px so the root stays 16 px, each width checked by the
  `.room-page` container's own width: once revealed, each round bar button's
  text holds one line at 320 px, at 51.75 rem and at 65.75 rem, and the phone
  layout shows "Next".
- **Browser checks for the plan**, before the cases that rely on them: one
  Escape while sending stays open in both browsers, and a repeated one closes
  the dialog; a press on the backdrop leaves focus in the field; whether Escape
  can close the dialog during an input method's composition. On an iPhone, by
  hand and not as a merge gate: the keyboard opens with the field selected.
