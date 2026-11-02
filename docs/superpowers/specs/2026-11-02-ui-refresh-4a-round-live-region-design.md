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
through a reconnect (checked, `connection.ts`, `App.tsx`). Nothing else
shares the line.

## Terms

The parent's Terms hold, **phase line** among them.

- **Flip**: `votesRevealed` changing between two snapshots within one mounted
  room page.
- **Seen word**: what the line shows, "Voting" or "Revealed", hidden from
  assistive technology.
- **Heard sentence**: what assistive technology gets instead, "Voting open" or
  "Votes revealed", visually hidden.

## Decisions

1. **The region is the phase line's wrapper**, `div.round-bar-phase`, with
   `role="status"` (polite; never `alert`, since a flip is routine news,
   often from someone else's Show). It is the same element from the room
   page's mount for its life, and never empty. On the wrapper, the `h2` keeps
   its heading role. The region holds the phase text alone: a later progress
   count on the line is a separate element outside it, or every vote, join
   and leave would be read aloud.
2. **Two separate texts, each complete** (product owner's ruling): inside the
   `h2`, the seen word in a span with `aria-hidden="true"` and the heard
   sentence in a span with the `visually-hidden` class. Both are picked by
   `votesRevealed` in the same render, so the line has no state of its own.
   The heading's name becomes the heard sentence, so heading navigation reads
   "Votes revealed, heading level 2", how a user arriving mid-round finds the
   phase until 4a-arrival. This is not step 1a's rejected hidden copy: that
   was a second element beside the line, kept in step with it; here the
   sentence is inside the one region, from the same render. Rejected: the
   bare word spoken (unclear out of context); a hidden word spliced onto the
   seen one, "Votes " + "Revealed" (two fragments joined by whitespace and
   casing); the two words shown on screen (reopens 3b2 decision 6, the
   one-row bar).
3. **`visually-hidden` is a shared class in `components/looks.css`**
   (unlayered; product owner's ruling): the Result's `.result-sr` rule
   (checked, `result.css`) moved and renamed, with `Result.tsx` and
   `docs/design/room.html` switched to it. It is absolutely positioned, so the
   phase line's box does not change, and adds `text-transform: none`, so
   hidden text is exposed as written: inside `.panel-label` it would inherit
   `uppercase` (checked, `looks.css`), which some readers spell out letter by
   letter (inferred). Rejected: a local copy in `round-bar.css`, the same rule
   twice; moving `.panel-label` onto the seen word, which leaves the `h2` on
   the browser's heading font and changes the line's box (checked: the reset
   does not restyle headings).
4. **The fixtures follow the Terms** (product owner's ruling): `phaseLine` is
   the phase line, the region, found by role and test id as `issueStatus` is;
   `phaseWord` is the seen word, a `data-testid="phase-word"` on its span, as
   `tally-count` is on the Result's hidden-from-readers spans. Every existing
   assertion on the phase line's text reads `phaseWord` instead
   (`roles.spec.js`, `room.spec.js`, `layout.spec.js`), and `phaseLine`'s
   comment, which says "phase word", is corrected. This is the step's contract
   change.
5. **Out of scope**: who flipped the round (the snapshot does not say); a
   spoken result, a step 5+ candidate; orientation on arriving in the room,
   step 4a-arrival; focus lost when a reveal unmounts the deck, step
   4a-reveal-focus.

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
| Session ended | Cannot happen: a page that reached the room reloads instead (the next row; checked, `connection.ts` `check`) | Likewise |
| Join, or a reload, including the one after a refusal or a restart | Appears holding it: not announced | Likewise |
| Leave | The page unloads | Likewise |

Accepted race: two flips in quick succession, such as a Show and then
another's Re-vote, render one after the other, but the reader may merge them
or drop the earlier polite message (inferred).

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

- Whoever has focus on the Show/Re-vote button, the presser or not, may hear
  its new name on a flip as well as the heard sentence, and the round guard's
  `aria-disabled` may be announced as unavailable (inferred; checked,
  `RoundBar.tsx`, `useRoundGuard.ts`). Accepted under the hand check's rule.

## Contract

**Changed**: decision 4. The layout cases measuring the phase line's box
(`readBoxes`) keep measuring the wrapper through `phaseLine`. 'an old UUID
link opens its derived room under a banner that covers no card'
(`slug.spec.js`) treats any `role="status"` as a banner, so it now also
checks the phase line covers no card; it passes unchanged (inferred: the bar
sits below the round panel).

**New**, both browsers, each shown to fail by the mutations named. If one
does not fail under its mutation, the plan stops and the case comes back
here. "Heard" is the `h2`'s accessible name, which leaves `aria-hidden`
content out; the region is found by its role, since `expectLiveRegion`
passes an element with no live attributes at all (checked).

- **'the phase line announces each flip from one region'** (`room.spec.js`):
  Alice and Bob join; Bob's phase line is marked (`markRegion`) and heard as
  "Voting open". After Alice's Show it is heard as "Votes revealed", after her
  Re-vote as "Voting open", and each time it is still the marked live region
  (`expectLiveRegion`). Its heard span has `clip-path: inset(50%)` and
  `text-transform: none` (`toHaveCSS`). Mutations: the wrapper keyed by
  `votesRevealed`; `role="status"` removed; `aria-hidden` removed from the
  seen word; the sentences swapped; the heard span's class misspelt; the
  shared class without `text-transform: none`.
- **'the phase line stays one region through a reconnect that finds the round
  changed'** (`room.spec.js`): Bob's phase line is marked, Bob is cut, Alice
  shows, Bob is restored; his line is heard as "Votes revealed" and is still
  the marked live region. Mutation: `RoomPage` keyed by the connection's lost
  flag.
- **The Result's hidden text**: an existing Result case, such as 'the tally
  counts only the votes that were cast' (`room.spec.js`), gains the same
  `clip-path` assertion on a column's hidden text. Mutation: the class
  misspelt in `Result.tsx`. It lands with decision 3's move, so that commit
  has a case that can fail.

Left without a case: Clear, auto-reveal and the facilitator switch (the same
render from `votesRevealed` as a Re-vote or a Show); the changed-and-back
reconnect (nothing changes to observe); join and reload, beyond the first
case's opening check. The seen word after a Show and a Re-vote stays pinned by
'a revealed round takes no more votes until Re-vote'.

**Hand check**, Orca on Firefox, before the PR is pushed. Pass rule: each
announcement speaks the heard sentence once and never the seen word. Runs:
another's Show and a Re-vote, focus elsewhere; another's Show, and an own vote
that auto-reveals, each with focus on a card (step 4a-reveal-focus's
question); an own Show; heading navigation to the phase line. Anything else
heard, the button's rename or focus loss included, is recorded in the PR's
Verified section. A failure of the pass rule stops the plan and comes back
here.

## The docs' changes

- **Parent, steps table**: 4a's row is judged by "Its cases, the hand check,
  and the existing cases unchanged but for its listed contract change". New
  rows after it, each waiting on 4a and judged by "Its cases":
  **4a-arrival**, "Arriving in the room: focus moves to a heading when the
  room appears (to be confirmed)"; **4a-reveal-focus**, "A reveal keeps the
  voter's focus".
- **Parent, step 4a's paragraph** gains this document's path; new paragraphs
  for 4a-arrival (its preferred solution, to be confirmed, and the
  alternatives weighed) and 4a-reveal-focus.
- **Parent, step 3's paragraph** points to this document, not Appendix B,
  for the progress staying outside the region.
- **Parent, Appendix B** gains a first line pointing to this document.
- **Parent, steps after 5** gains a candidate: a spoken result on a reveal.
- **`docs/known-issues.md`**: a reveal drops a voter's focus from the
  unmounted deck, closed by 4a-reveal-focus.

## Branches and commits

One PR on `20260930.ui_refresh_4a_round_live_region`, stacked on 4d's
`20260930.ui_refresh_4d_not_a_room` (#481): this document, the parent's
changes, the known issue and the plan first; then the shared
`visually-hidden` class with the Result's assertion (decision 3); then the
region with its cases and the fixtures (decision 4).
