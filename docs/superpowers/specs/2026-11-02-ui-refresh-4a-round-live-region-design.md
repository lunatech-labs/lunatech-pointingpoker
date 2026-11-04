# UI Refresh, Step 4a: The Round's Live Region

Date: 2026-11-02
Status: Approved; amended after the hand check (decisions 1, 2 and 4)
Parent: `docs/superpowers/specs/2026-09-30-ui-refresh-design.md`, step 4a and
Appendix B

## Purpose

A reveal or a reopened round is shown to sighted users by the whole page
changing at once; a screen reader user hears nothing. This step gives the
round bar's phase line a live region inside it, so each flip is announced
with a short sentence that makes sense on its own, while the screen shows
what it shows today. Appendix B's constraints and matrix are its starting
point; this document supersedes them.

Today (checked, `RoundBar.tsx`): the line is `div.round-bar-phase >
h2.panel-label`, reading "Voting" or "Revealed", rendered unconditionally by
`RoomPage`. A lost stream keeps the snapshot, so `RoomPage` stays mounted
through a reconnect (checked, `connection.ts`, `App.tsx`). Nothing else
shares the line.

## Terms

The parent's Terms hold, **phase line** and **phase word** among them.

- **Flip**: `votesRevealed` changing between two snapshots within one mounted
  room page.
- **Seen word**: the phase word as shown, "Voting" or "Revealed", hidden from
  assistive technology.
- **Heard sentence**: what assistive technology gets instead, "Voting open" or
  "Votes revealed", visually hidden.
- **Region**: the span holding the heard sentence, with `role="status"`: the
  round's live region, inside the phase line.

## Decisions

1. **The region is the heard sentence's own span**, with `role="status"`
   (polite; never `alert`, since a flip is routine news, often from someone
   else's Show), holding the sentence as its only content, with no element
   inside it (product owner's ruling, after the hand check; the rules it
   follows are under "Checked in Firefox and Orca"). It is the same element
   from the room page's mount for its life, and never empty. It holds the
   phase text alone: a later progress count on the line is a separate element
   outside it, or every vote, join and leave would be read aloud. Rejected:
   the phase line's wrapper as the region, this decision's first version,
   which Orca does not announce (rule 1).
2. **Two separate texts, each complete** (product owner's ruling): inside the
   `h2`, the seen word in a span with `aria-hidden="true"` and the region,
   with the `visually-hidden` class. The `h2` takes `aria-label`, set to the
   heard sentence from the same value as the region's text. All three are
   picked by `votesRevealed` in the same render, so the line has no state of
   its own: one region, one render, unlike step 1a's rejected hidden copy
   beside the line. Heading navigation reads "Votes revealed, heading level
   2", how a user arriving mid-round finds the phase until 4a-arrival. The
   label copies the sentence, so a case pins both copies (decision 4).
   Rejected: the heading named from its content (rule 2); `aria-labelledby`
   to the region (rule 2) or to a span inside it (rule 3); the bare word
   spoken (unclear out of context); a hidden word spliced onto the seen one,
   "Votes " + "Revealed" (two fragments joined by whitespace and casing); the
   two words shown on screen (reopens 3b2 decision 6, the one-row bar).
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
   leaves headings' font alone).
4. **The fixtures follow the Terms** (product owner's ruling): `phaseLine` is
   the phase line, found by its test id alone as before this step, for the
   layout cases measuring its box; `phaseRegion` is the region, found by role
   and test id (`phase-heard`) as `issueStatus` is, since `expectLiveRegion`
   passes an element with no live attributes at all (checked); `phaseWord` is
   the seen word, a `data-testid="phase-word"` on its span, as `tally-count`
   is on the Result's hidden-from-readers spans. Every existing assertion on
   the phase line's text reads `phaseWord` instead (`roles.spec.js`,
   `room.spec.js`, `layout.spec.js`), and `phaseLine`'s comment, which says
   "phase word", is corrected. This is the step's contract change. The
   Result's hidden span gets a test id too, `tally-sr` (and `room.html`'s
   Result span, which mirrors the Result's test ids), so a case finds each
   hidden span by its own name, never by the class that hides it. What is
   heard is pinned as markup, the region's text and the `h2`'s `aria-label`,
   not as an accessible name: Playwright computes names in its own injected
   script, not from the browser's tree (checked, `toHaveAccessibleName`
   evaluates `getElementAccessibleNameText`), so a name check cannot see rule
   2 and would pass with the label removed (inferred). The region's having no
   element inside it is read as page structure (`locator('*')`), the step's
   one exception to the parent's test contract: rule 3 is about structure,
   which no role, name or test id can say. `room.html`'s phase line stays as
   it is: nothing seen changes.
5. **Out of scope**: who flipped the round (the snapshot does not say); a
   spoken result, a step 5+ candidate; orientation on arriving in the room,
   step 4a-arrival; focus lost when a reveal unmounts the deck, step
   4a-reveal-focus.

## Checked in Firefox and Orca

The first build's hand check failed: a flip was spoken only with focus on the
phase line. A spike then tried each markup below on the running app (Firefox
153.5.1esr, Orca 51.1), read through Firefox's accessibility tree, a log of
its text-change events and the hand check's ear.

1. **The sentence's text sits directly in the `role="status"` element.** Orca
   drops a text change arriving within 0.1 s of another from the same app,
   unless the changed object has focus, or has a live-region role and its own
   `live` attribute (checked in Orca's installed source, `event_manager.py`,
   `_ignore_by_focus_state` then `_ignore_by_spam_filter`). A flip changes
   the result, the button and the roster within a few milliseconds, and
   Firefox reports a text change on the nearest object of its own holding the
   text (checked, the event log). With the region on the wrapper, that was
   the hidden span, an object of its own in the tree (checked; that its
   absolute positioning makes it one is inferred), with no `live`: dropped.
2. **Firefox names nothing from a `role="status"` element's content**, even
   through `aria-labelledby`: the heading containing the region, or labelled
   by it, was nameless in the tree.
3. **An element named by an id reference is an object of its own**: a span
   inside the region, there for `aria-labelledby`, took the text change, and
   rule 1 dropped it again.

On the spike, the markup of decisions 1 and 2 passed by ear another's Show and
Re-vote with focus elsewhere, heading navigation and reading the line in
browse mode; an own Show was not run on it. On its first markup, the region
without the `h2`'s label, an own last vote auto-revealing was spoken with
focus on a card.

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
| Session ended | Cannot happen: a page that reached the room reloads onto `?restarted=1` instead (the next row; checked, `connection.ts` `check`) | Likewise |
| Join, or a reload, including the one after a refusal or a restart | Appears holding it: not announced | Likewise |
| Leave | The page unloads | Likewise |

Accepted race: two flips in quick succession, such as a Show and then
another's Re-vote, render one after the other (checked: `useSyncExternalStore`
in `useRoom.ts`), but the reader may merge them or drop the earlier polite
message (inferred).

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

- On a flip the Show/Re-vote button is renamed and both buttons take the
  round guard's `aria-disabled` (checked, `RoundBar.tsx`, `useRoundGuard.ts`).
  Whoever has focus there, the presser or not, may hear the new name or
  "unavailable" as well as the heard sentence (inferred). Accepted under the
  hand check's rule.

## Contract

**Changed**: decision 4. The layout cases measuring the phase line's box
(`readBoxes`) keep measuring the wrapper through `phaseLine`. The no-cover
check of 'an old UUID link opens its derived room under a banner that covers
no card' (`slug.spec.js`) matches any `role="status"` element at a card's
centre; the region is one, clipped to nothing, so the case passes unchanged
(inferred).

**New**, both browsers, each shown to fail by the mutations named. If one
does not fail under its mutation, the plan stops and the case comes back
here. The region is `phaseRegion`; "holds" is its text (decision 4).

- **'the phase line announces each flip from one region'** (`room.spec.js`):
  Alice and Bob join; Bob's region, found inside his phase line's heading, is
  marked (`markRegion`), holds "Voting open" and has no element inside it;
  that heading has `aria-label` "Voting open", the phase line's wrapper has no
  `role`, and the seen word has `aria-hidden="true"`. After Alice's Show
  the region holds, and the label is, "Votes revealed"; after her Re-vote,
  "Voting open"; each time the region is still the marked live region
  (`expectLiveRegion`). The region has `clip-path: inset(50%)` and
  `text-transform: none` (`toHaveCSS`). Mutations: the region keyed by
  `votesRevealed`; `role="status"` moved back to the wrapper; `role="status"`
  kept on the wrapper as well; the region moved beside the `h2`; the sentence
  wrapped in a span inside the region; the `h2`'s `aria-label` removed; the
  label's sentences swapped; the region's sentences swapped; `aria-hidden`
  removed from the seen word; the region's class misspelt; `clip-path`
  dropped from the shared rule; the shared rule without `text-transform:
  none`.
- **'the phase line stays one region through a reconnect that finds the round
  changed'** (`room.spec.js`): Bob's region is marked, Bob is cut, Alice
  shows, Bob is restored; his region holds "Votes revealed" and is still the
  marked live region. Mutation: `RoomPage` keyed by the connection's lost
  flag.
- **The Result's hidden text**: an existing Result case, such as 'the tally
  counts only the votes that were cast' (`room.spec.js`), gains the same
  `clip-path` assertion on a column's `tally-sr` span. Mutations: the class
  misspelt in `Result.tsx`; `clip-path` dropped from the shared rule.

Left without a case: Clear, auto-reveal and the facilitator switch (the same
render from `votesRevealed` as a Re-vote or a Show); the changed-and-back
reconnect (nothing changes to observe); join and reload, beyond the first
case's opening check. The seen word after a Show and a Re-vote stays pinned by
'a revealed round takes no more votes until Re-vote'.

**Hand check**, Orca on Firefox, before the PR is pushed.

- **Judged runs**: another's Show and a Re-vote, focus elsewhere; an own
  Show; heading navigation to the phase line, and reading that line in
  browse mode. In each, the flip is announced (heading navigation and
  reading: the sentence is read), speaking the heard sentence once and never
  the seen word. A failure stops the plan and comes back here.
- **Recorded runs**: another's Show, and an own vote that auto-reveals, each
  with focus on a card (step 4a-reveal-focus's question). They cannot stop
  this step.

Anything else heard, the button's rename or a focus loss included, is
recorded in the PR's Verified section.

## The docs' changes

- **Parent**: the steps table's 4a row (its judging), and its 4a-arrival and
  4a-reveal-focus rows; step 4a's paragraph points here, with new paragraphs
  for both follow-ups; step 3's paragraph points here for the progress staying
  outside the region; Appendix B points here; the Terms gain **Phase line**;
  steps after 5 gain a spoken result on a reveal. After the hand check, the
  Phase line term and step 4a's paragraph say the line holds the region.
- **`docs/known-issues.md`**: "A reveal drops a voter's focus", closed by
  4a-reveal-focus. After the hand check: the app's other regions may lose a
  change to Orca's filter (rule 1), and Firefox's heading names keep
  `text-transform`.

## Branches and commits

One PR on `20260930.ui_refresh_4a_round_live_region`, on `main` once 4d (#481)
merged: this document, the parent's changes, the known issue and the plan
first; then the shared `visually-hidden` class with the `tally-sr` test ids
and the Result's assertion (decision 3), so that commit has a case that can
fail; then the region with its cases and the fixtures (decision 4); then this
document's correction after the hand check and its fix, the region moved onto
the heard span and the heading labelled, as new commits on top.
