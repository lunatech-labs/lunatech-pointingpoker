# Round History

Date: 2026-11-16
Status: Approved
Parent: issue #528

## Purpose

After a reveal, the PO often says "we gave something similar 8 two tickets
ago", then hunts for that ticket and its stored estimate in the tracker, which
reopens the discussion. The history makes that a glance: each earlier ticket,
recognisable at sight, beside the estimate the team agreed. It is a memory aid
for the meeting; the team keeps its estimates in its own tracker, and corrects
a wrong one there.

It builds on #528's "Decided" section and on Next issue
(`docs/superpowers/specs/2026-11-09-next-issue-design.md`, delivered by PR
#565), whose decisions it does not repeat. Out of scope: copy and export (its
own step, which also settles how the last round is recorded), the round counter
and its start time (#538), a clickable entry (#540), a row's full issue
(#571), fetching anything from a tracker, editing an entry, and keeping the
history past the room's life.

## Terms

- **Entry**: one recorded round: the room's issue when it was recorded, in
  full, and its outcome.
- **Outcome**: an estimate (any deck value, `?` included: the team could not
  estimate) or **Unsettled** (the team could not agree; recorded, to revisit).
  **Skip** is a choice in the dialog, not an outcome: it records nothing.
- **History**: the room's entries, oldest first.
- **Position**: an entry's place in the history, from 1.
- **Short form**: what a row shows of an entry's issue, and the legend of the
  shown issue (decision 5).
- **Estimate row**: the dialog's choice of outcome or Skip (decision 3).
- **Single top value**: once revealed, the result's headline names one value
  (`resultHeadline`'s `tied` has one element), on the deck.

## Decisions

1. **Recording.** Only Next issue records. Its request gains an outcome:
   `{ "round", "issue", "outcome" }`, with `outcome` one of
   `{ "type": "Estimate", "value": "8" }`, `{ "type": "Unsettled" }`,
   `{ "type": "Skip" }`, tagged as the snapshot's `Estimation` encodes. The
   outcome needs its own decoder and schema (`Estimation` has only an
   encoder): an unknown type fails decoding, and a blank `value` fails a
   `Validator.custom`, as `VoteRequest`'s blank estimation does, both `400`.
   The server does not check
   the value against a deck (#535 may give rooms their own). Applying stays
   one state change (Next issue decision 1): Estimate and Unsettled append an
   entry holding the room's current issue, the one being left, not the
   request's; Skip appends nothing. A refused request (`409`, `401`, `403`)
   records nothing. The server records in either phase, as it applies Next
   issue in either (Next issue decision 3). A row shows a value as recorded,
   on or off today's deck.
2. **The room keeps it.** `RoomState.history`, oldest first, lives and dies
   with the room, as everything in it. The snapshot carries it whole, as
   `history: [{ "issue", "outcome" }]`, so a page that joins or reconnects
   gets all of it. No cap: real use grows it by one entry per round within a
   room's life (a meeting holds 3 to 15), and a client posting Next issue in a
   loop is #503's and #504's to bound. No round number or time per entry:
   copy/export or #538 adds a field if it needs one.
3. **The estimate row.** Above the dialog's field, as
   `docs/design/room.html?next=modal&phase=revealed&later=1`: a `fieldset`
   whose legend reads "Estimate for ‹short form of the shown issue›", an empty
   issue taking the position it would get (entries + 1); the legend wraps
   instead of cutting, one rule whatever the kind: `overflow-wrap: anywhere`
   on the legend, the short form in a `<bdi>`, as `.issue-panel-view h2`
   shows the full issue; then one native radio
   per deck value, then Unsettled and Skip, styled as the mockup's chips (my
   call: native radios give arrow keys and one tab stop with no script). The
   row is the dialog's first part; focus still opens on the field (Next issue
   decision 7).
4. **Pre-selection and the required choice.** When the dialog opens on a
   single top value, that value is checked; otherwise nothing is. The choice is
   worked out once, on the press, and a snapshot never changes it. Submitting
   with nothing checked sends nothing: the dialog shows *Choose an estimate,
   Unsettled or Skip* in its message slot and moves focus to the first radio.
   This also stops Next issue's accepted double Enter on a split vote. A
   failed request keeps the choice. Once moved on, the notice hides the
   missing-choice message as it hides the failure one (`shows`).
5. **The short form**: what a row shows of the full issue, one line, as much
   as the width allows (the user's rules).

   The issue is trimmed first, then:

   | Issue | Shown | Cut when too long |
   |---|---|---|
   | empty | "Round ‹position›" | never |
   | a link: `http://` or `https://`, any case, and no space | the link without its query and fragment | at the front: `…/acme/web/issues/412` |
   | anything else | the text, whitespace collapsed | at the end: `Fix the double-click b…` |

   The function returns the kind with the text, `{ kind: 'link' | 'text',
   text }`, and the row picks its markup by the kind, never by the text;
   "Round ‹position›" is of kind text.

   A link keeps its end because the host repeats and the id sits last; text
   keeps its start because it leads with what matters. The scheme stays: a
   front cut drops it first, and a link that fits has room for it. The front
   cut is CSS: the cell `direction: rtl` with `text-align: left`, so a link
   that fits starts at the left as text does, the link in an isolated
   left-to-right `<bdi>`, `text-overflow: ellipsis`. Text gets `dir="auto"`,
   so right-to-left text keeps its start too. Spiked in Chromium and Firefox,
   punctuation kept, a short link at the left; unchecked in WebKit, so it gets
   a phone hand check and an issue holds the risk, as #495 does. Known limit:
   a Jira board link keeps its key in the query (`?selectedIssue=PP-77`), so
   its row ends in `…/PP/boards/3`; Jira's "Copy link" gives
   `/browse/PP-1234`, which ends in its key. Rows that still look alike are
   #571's.
6. **The panel.** Labelled "Rounds · ‹number of entries›", as "Voters · 14",
   a `section` named by its label, the list an `<ol>`, a row's issue at the
   start and its outcome (the value, or the word Unsettled) at the end. The
   latest row is bold. No panel while the history is empty, in both layouts.
   No `title`: the short form is all a row shows, on both layouts (the
   hover-only lesson). Rows are centred as the roster's (`align-items:
   center`), and the list's last-row slack sits in the panel's padding.
   - **Desktop**: at the sidebar's top, above the roster, up to 5 rows tall,
     growing with the entries, the rest by scrolling, the list a focusable,
     named region, as the roster's panel.
   - **Phone**: between the issue and the table (`order: 1`, after the issue
     in source order). Closed, it shows the label and the latest row only
     (by CSS, not by scrolling, so its scroll position does not matter);
     opened, up to 3 rows tall, growing with the entries, scrolling. A quiet
     button at the label's end reads **Show more** or **Show less**
     (`aria-expanded`), hidden while the history holds one entry, its 44 px target reaching into the panel's padding as
     the issue panel's Edit does, so the label line keeps the label's height.
     Open or closed is the page's own state: kept across snapshots and
     rounds, closed again on a reload. The button is hidden on desktop.
7. **Scrolling.** The list is kept at its end whenever its height (a
   `ResizeObserver`) or its number of entries changes; nothing else moves it,
   a vote, an issue edit or a width change included. Someone reading an old
   row when another person moves on is taken to the end: that moment ends
   the round they were comparing against.

## States and events

**The dialog** keeps Next issue's three states. Open gains the choice (a value,
Unsettled, Skip, or none) and a second message, the missing choice; Sending
carries the choice. New and changed cells; the rest stand as in Next issue's
matrix.

| Event | Closed | Open | Sending |
|---|---|---|---|
| Next issue pressed | Open, choice per decision 4 | Open afresh, choice per decision 4 | Open afresh, choice per decision 4 |
| a radio checked | cannot happen | Open, that choice, the missing-choice message cleared | ignored: the row is read-only while sending |
| submit with a choice | cannot happen | Sending, both messages cleared | ignored |
| submit with none | cannot happen | Open with the missing-choice message, focus on the first radio, nothing sent | ignored |
| any other answer, network error, timeout | cannot happen | cannot happen | Open with the message, the choice kept |
| a snapshot | nothing | nothing: the choice stays; the legend follows the shown issue | nothing |

**The phone panel** has two states, the page's own; on desktop both look the
same.

| Event | Closed | Opened |
|---|---|---|
| Show more / Show less (shown from two entries) | Opened, scrolled to the end | Closed |
| entries grow | Closed, the new latest row shown; the button appears at the second entry | Opened, scrolled to the end |
| a snapshot without new entries, a reconnect included | nothing | nothing, the scroll kept |
| the history empties (cannot happen within a room's life) | cannot happen | cannot happen |
| the page crosses 51.75 rem | the desktop form, state kept, scrolled to the end | the same |
| reload, or leave and rejoin | Closed | Closed |

## Accepted races

- **Two people submit within a round trip.** The first wins and its outcome is
  recorded; the second sees the notice and its choice is lost. A wrong entry
  is corrected in the tracker, as any wrong estimate.
- **Re-vote or Clear while the dialog is open** (Next issue's accepted race):
  the choice made on the old reveal is still what gets recorded.
- **An issue edit landing between a page's open and its submit**: the entry
  holds the edited issue, the room's own, which is what the round ended on.
- **Reading an old row as someone moves on**: the list jumps to the end
  (decision 7).
- **A very long issue**: the legend wraps it whole, pushing the radios and the
  field down, as the issue panel shows it whole; #504 bounds the issue's length.

## Tests

- **Server.** Applying Next issue appends an Estimate and an Unsettled entry
  with the room's issue, not the request's; Skip appends none; a refused
  request appends none; decoding refuses a blank value and an unknown type;
  the contract test carries `history` and the request's `outcome`.
- **Pure logic.** The short form's scenarios; the pre-selection (each deck
  value alone on top is checked; a tie, a top value off the deck, nobody
  voted and a single value while voting check nothing); every changed cell of the dialog's `step`.
- **End to end, both browsers.** Recording a value, Unsettled and Skip shows
  the history, or none, on two pages; a tie opens with nothing checked, and
  submitting then shows the missing-choice message and sends nothing; the
  choice survives a failed request; no panel before the first entry; on the
  phone layout, no button at one entry; at two, the closed panel shows the
  latest row only, Show more opens and Show less closes it, kept across a
  round; with two entries the list is two rows tall, on desktop and in the
  opened phone panel. The scroll cases start with more
  entries than the list shows (6 on desktop) and the list scrolled up: a vote
  on another page leaves the scroll where it was; a new entry takes it to the
  end; switching from the phone layout to desktop shows the latest row.
- **Front cut, both browsers**: a row holding a link longer than its cell
  shows the link's end, the `<bdi>`'s right edge within the cell's; a short
  link starts at the cell's left edge; a long "link and words" row, of kind
  text, shows its start at the cell's left edge and is cut at the end.
- **Layout, both browsers** (the UI refresh spec's principle 11), outside
  `layout.spec.js`'s describes skipped outside Chromium (#499): the phone
  panel's label line keeps the label's height with the button, closed and
  opened, at 320 px and at 51.75 rem minus 1 px, the phone layout's ends,
  below 762 px tall so the root stays 16 px; at 320 px, a legend holding a
  link with one segment wider than the dialog wraps within it, and the dialog
  does not scroll sideways.

## Short form scenarios

What the short form's function returns; the cell's CSS then cuts it to the
width (decision 5), which the front-cut tests check.

| Case | Issue | Kind | Short form, before the cut |
|---|---|---|---|
| Jira | `https://lunatech.atlassian.net/browse/PP-1234` | link | the link |
| Jira with a query | `https://acme.atlassian.net/browse/PP-1234?atlOrigin=eyJpIjoi` | link | `https://acme.atlassian.net/browse/PP-1234` |
| Jira board | `https://acme.atlassian.net/jira/software/projects/PP/boards/3?selectedIssue=PP-77` | link | `https://acme.atlassian.net/jira/software/projects/PP/boards/3` |
| fragment | `https://github.com/acme/web/issues/412#issuecomment-1` | link | `https://github.com/acme/web/issues/412` |
| trailing space | `https://github.com/acme/web/issues/412 ` | link | `https://github.com/acme/web/issues/412` |
| upper-case scheme | `HTTPS://example.com/ticket` | link | the link |
| link and words | `https://github.com/acme/web/issues/412 and PP-9` | text | the text |
| key and title | `PP-1234 Fix the login form` | text | the text |
| sentence over lines | `Rework the login page\n  so that…` | text | `Rework the login page so that…` |
| empty, blank | `""`, `"   "` (third entry) | text | `Round 3` |

## Documents

The README's snapshot example and its text gain `history`; the `/next-issue`
row's body gains `outcome`, with its recording, and the `400` list a blank
value or unknown type. The
mockup `docs/design/room.html` follows decisions 3 and 6: its `?` chip kept, the
history oldest first, the panel growing up to its rows, the phone panel's two states and labels,
centred rows, no `title`.
