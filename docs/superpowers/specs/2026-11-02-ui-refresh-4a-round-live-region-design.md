# UI Refresh, Step 4a: The Round's Live Region

Date: 2026-11-02
Status: In discussion
Parent: `docs/superpowers/specs/2026-09-30-ui-refresh-design.md`, step 4a and
Appendix B

## Purpose

A reveal or a reopened round is shown to sighted users by the whole page
changing at once; a screen reader user hears nothing. This step makes the
round bar's phase line a live region, so each flip is announced with a short
sentence that makes sense on its own, while the screen shows what it shows
today. Appendix B's constraints and matrix are its starting point; this
document supersedes them.

Today (checked, `RoundBar.tsx`): the line is `div.round-bar-phase >
h2.panel-label`, reading "Voting" or "Revealed", rendered unconditionally by
`RoomPage`. A lost stream keeps the snapshot, so `RoomPage` stays mounted
through a reconnect and after a session ends (checked, `connection.ts`,
`App.tsx`). Nothing else shares the line.

## Terms

The parent's Terms hold.

- **Flip**: `votesRevealed` changing between two snapshots within one mounted
  room page.
- **Seen word**: what the line shows, "Voting" or "Revealed", hidden from
  assistive technology.
- **Heard sentence**: what assistive technology gets instead, "Voting open" or
  "Votes revealed", visually hidden.

## Decisions

1. **The region is the line's wrapper**, `div.round-bar-phase`, with
   `role="status"` (polite; never `alert`, since a flip is routine news,
   often from someone else's Show). It is the same element from the room
   page's mount for its life, and never empty. On the wrapper, the `h2` keeps
   its heading role.
2. **Two separate texts, each complete** (product owner's ruling): inside the
   `h2`, the seen word in a span with `aria-hidden="true"` and the heard
   sentence in a span with the visually hidden class. Both are picked by
   `votesRevealed` in the same render, so the line has no state of its own.
   Rejected: the bare word spoken (unclear out of context); a hidden word
   spliced onto the seen one, "Votes " + "Revealed" (two fragments joined by
   whitespace and casing); the two words shown on screen (reopens 3b2
   decision 6, the one-row bar).
3. **The heading's name becomes the heard sentence**, so heading navigation
   reads "Votes revealed, heading level 2". A user arriving mid-round finds
   the phase this way until 4a-arrival.
4. **`visually-hidden` is a shared class in `components/looks.css`**
   (unlayered; product owner's ruling): the Result's `.result-sr` rule
   (checked, `result.css`) moved and renamed, with `Result.tsx` switched to
   it, in a commit of its own judged by the existing cases unchanged. It is
   absolutely positioned, so the line's box does not change. Rejected: a
   local copy in `round-bar.css`, the same rule twice.
5. **Out of scope**: who flipped the round (the snapshot does not say); a
   spoken result, logged as a step 5+ candidate; orientation on arriving in
   the room, step 4a-arrival.

## States and events

States are what the line holds. "Announced" means its text changes within
the region; the heard sentence is what is spoken.

| Event \ line | Voting open | Votes revealed |
|---|---|---|
| Show (own or another's), or auto-reveal | Becomes revealed: announced | Show: unchanged. Auto-reveal: cannot happen, a revealed round takes no vote |
| Re-vote | Unchanged | Becomes open: announced |
| Clear | Unchanged | Becomes open: announced |
| A `/role` switch to facilitator that completes the round | Becomes revealed: announced | Unchanged |
| Any other snapshot (a vote that leaves the round open, a join, a leave, an issue edit) | Unchanged | Unchanged |
| Stream lost, or an invalid snapshot dropped | Unchanged | Unchanged |
| In-place reconnect, the round changed meanwhile | Becomes revealed: announced | Becomes open: announced |
| In-place reconnect, the round changed and changed back | Unchanged | Unchanged |
| Session ended (fatal) | Unchanged; the page stays mounted | Unchanged |
| Join, or a reload, including the one after a refusal | Appears holding it: not announced | Likewise |
| Leave | The page unloads | Likewise |

## Accepted costs

From Appendix B, unchanged but for the first's pointer:

- Joining or reloading into a revealed round is not announced; step
  4a-arrival addresses arriving. After a refusal, "Reconnected. Please check
  your vote." is the cue, found in reading order.
- A Clear while the round is open is not announced: the line does not
  change, and the voter's own card stops being pressed.
- A late Re-vote, landing after another or after a Clear, finds the round
  open and only unconfirms votes, unannounced.
- A round that changes and changes back during a connection gap is not
  announced; after a Re-vote, a vote silently becomes unconfirmed.

New:

- After their own Show or Re-vote, the presser may hear the focused button's
  new name as well as the heard sentence (inferred; the hand check records
  it). Accepted as long as the sentence is spoken once.

## Contract

**Changed**: every assertion on the phase line's text (`roles.spec.js`,
`room.spec.js`, `layout.spec.js`) reads the seen word, since the line's text
content now holds both texts. The layout cases measuring the line's box
(`readBoxes`) keep measuring the wrapper, unchanged. The plan names the
fixtures.

**New cases**, both browsers, each shown to fail by the mutations named. If
one does not fail under its mutation, the plan stops and the case comes back
here.

- **'the phase line announces each flip from one region'** (`room.spec.js`):
  Alice and Bob join; Bob's line is marked (`markRegion`) and heard as
  "Voting open". Alice's Show, Re-vote, Show and Clear each leave Bob's line
  heard as the matching sentence, seen as the matching word, and still the
  marked live region (`expectLiveRegion`). Mutations: the wrapper keyed by
  `votesRevealed`; `role="status"` removed; `aria-hidden` removed from the
  seen word; the sentences swapped.
- **'the phase line stays one region through a reconnect that finds the round
  changed'** (`room.spec.js`): Bob's line is marked, Bob is cut, Alice shows,
  Bob is restored; his line is heard as "Votes revealed" and is still the
  marked live region. Mutation: `RoomPage` keyed by the connection's lost
  flag.

"Heard" is the `h2`'s accessible name, which leaves `aria-hidden` content out.
The region is found by its role, as `issueStatus` is, since
`expectLiveRegion` passes an element with no live attributes at all (checked).

Left without a case: auto-reveal and the facilitator switch (the same render
from `votesRevealed` as a Show); the changed-and-back reconnect and session
ended (nothing changes to observe); join and reload, beyond the first
case's opening check.

**Hand check**, Orca on Firefox, before the PR is pushed: another's Show is
heard as "Votes revealed" and never "Revealed"; a Re-vote as "Voting open";
heading navigation reads the sentence; what the presser hears on their own
Show is recorded. A failure stops the plan and comes back here.

## The docs' changes

- **Parent, steps table**: 4a's row is judged by "Its cases, the hand check,
  and the existing cases unchanged but for its listed contract change". A new
  row after it, **4a-arrival**, "Arriving in the room: focus moves to a
  heading when the room appears (to be confirmed)", waits on 4a, judged by
  "Its cases".
- **Parent, step 4a's paragraph** gains this document's path; a new
  paragraph for 4a-arrival states its preferred solution, to be confirmed by
  its own spec, and the alternatives this brainstorm weighed (a stateful page
  title, a one-off spoken summary needing a delayed fill).
- **Parent, Appendix B** gains a first line pointing to this document as the
  one holding the rulings.
- **Parent, steps after 5** gains a candidate: a spoken result on a reveal.

## Branches and commits

One PR on `20260930.ui_refresh_4a_round_live_region`, stacked on 4d's
`20260930.ui_refresh_4d_not_a_room` (#481): this document, the parent's
changes and the plan first; then the shared `visually-hidden` class (decision
4); then the region with its cases.
