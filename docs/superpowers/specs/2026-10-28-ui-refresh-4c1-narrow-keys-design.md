# UI Refresh, Step 4c1-narrow-keys: The Phone Layout's Keyboard

Date: 2026-10-28
Status: In discussion
Parent: `docs/superpowers/specs/2026-09-30-ui-refresh-design.md`, step 4

## Purpose

4c1-wide built the room page at every width, so the phone layout's look is in
the app. Two of its behaviours, which 3b2 settled
(`docs/superpowers/specs/2026-10-15-ui-refresh-3b2-narrow-and-large-design.md`)
and `docs/design/room.html`'s script draws, are not: Escape closing ☰'s row,
and Firefox's scroll of a keyboard focus out from behind the pinned sheet.
This step adds both, reverses 3b2's rule that a width change closes the row,
and gives the row and the scroll their cases. Step 4's other phone and zoom
guarantees are 4c1-narrow-cases', the step after this one.

## Terms

- **The row**: ☰'s second header row in the phone layout, holding the role
  sentence, its switch and Leave.
- **The sheet**: the round panel and the round bar, pinned to the viewport's
  bottom in the phone layout where the viewport is at least 39 rem tall (3b2
  decision 7); **its top** is the round panel's (`.round-panel`), or the
  round bar's on a facilitator's page while voting, where no round panel is
  drawn.
- **A keyboard focus**: a focus matching `:focus-visible`: a key's or a
  script's, and a text field's however it was focused, but not a tap's
  elsewhere.

## Decisions

1. **The row keeps its state across width changes** (product owner's ruling),
   reversing 3b2's Disclosure row "Width crosses 51.75 rem: closes". The row
   is in the header's flow and covers nothing, so a disclosure's state belongs
   to the reader's presses alone; a reset suits an overlay. Nothing is built:
   `menuShown` already outlives a crossing, and the CSS hides the row in the
   wide layout. `room.html` drops its `ResizeObserver` close to match. Set
   aside: the close on a crossing, a `ResizeObserver` reusing
   `useFitEntries`'s `PHONE_BELOW` for a state the reader set.
2. **Escape closes the open row from ☰ or from inside it, and focus goes to
   ☰** (3b2's Disclosure). The handlers are React `onKeyDown`s on ☰ and on the
   row, which the switch's and Leave's keys reach by bubbling, and focus moves
   by a ref to ☰ (my call). Set aside: `room.html`'s document listener, which
   needs a target test the two handlers make by where they sit. Escape with
   the row closed, or with focus elsewhere, does nothing; the issue editor's
   own Escape is untouched.
3. **A keyboard focus outside the pinned sheet, not wholly in view above its
   top, scrolls to the top** (`scrollIntoView({ block: 'start' })`, 3b2
   decision 7). Measured on Chromium 153 and Firefox 155, the mockup at 392 by
   800 with its issue pushed behind the sheet: both browsers scroll to a focus
   before `focusin`, and both clear a link or Edit issue of the sheet by the
   scroll margins alone; Firefox leaves a focused voters table, taller than a
   margin clears, at 264 to 614 px behind a sheet from 442 px, and only the
   listener clears it. 3b2's "margin or not" thus holds today for the table
   alone. Ported from `room.html`'s `focusin` listener as an `onFocus` on
   `.room-page`, which React delegates as `focusin`, so no effect adds or
   removes it; it tests `:focus-visible`, the round bar's `sticky` position
   (no breakpoint of its own) and the sheet's ancestry before reading any box
   (my calls). The banners, outside the page, sit above the header. A tap on
   Edit issue thus scrolls a field the sheet hides to the top (product
   owner's ruling): the reader is about to type in it. Set aside (product
   owner's rulings): text fields excluded; no listener, a focused table left
   partly hidden in Firefox; the table not focusable on the phone, a
   width-dependent `tabIndex` in TS.
4. **The slot's reserve stays written twice** (product owner's ruling), in
   `voters.css`'s `.voters-reserve` and `useFitEntries`'s `held`, which
   4c1-wide's Accepted costs gave to 4c1-narrow to name once. The progress
   step fills the facilitator's slot while voting and removes the reserve
   with both copies, and every rework considered either changed the mockup's
   look or left code for that step to undo. Set aside: one custom property
   both read; an invisible spacer at the table's foot; the facilitator's slot
   rendered empty and hidden.
5. **The Leave link keeps its icon before the word** (product owner's
   ruling); the docs' changes give its known-issues entry. Set aside: the
   icon after the word now.

## The row

This table replaces 3b2's Disclosure table: its width row is reversed and the
rejoin row added.

| Event | Closed | Open |
| --- | --- | --- |
| Tap, Enter or Space on ☰ | open, focus stays on ☰ | close, focus stays on ☰ |
| Escape, focus on ☰ or in the row | nothing | close, focus to ☰ |
| Escape, focus elsewhere | nothing | stays open |
| Tap or Tab elsewhere | nothing | stays open |
| Switch | cannot happen | the role changes, stays open, focus stays on the switch |
| Leave | cannot happen | the lobby, as today |
| Role changed from another tab | the row follows, hidden | the sentence and switch follow |
| Banner, reconnect or phase change | nothing | stays open |
| Width crosses 51.75 rem | ☰ shows or hides | stays open, hidden in the wide layout |
| Leave, then a rejoin | closed | closed (the header remounted) |

Accepted (3b2): focus on ☰, in the row, or on the wide header's switch or
Leave falls to the page when the width crosses 51.75 rem, which needs a
resize.

## The listener

What decision 3's listener does.

| Focus lands, or the sheet changes | Sheet pinned | Sheet not pinned |
| --- | --- | --- |
| A keyboard focus outside the sheet, wholly in view above its top | nothing | nothing |
| A keyboard focus outside the sheet, partly or wholly behind it, or above the viewport | scrolls to the top | nothing |
| A keyboard focus inside the sheet | nothing | nothing |
| Not a keyboard focus (Terms) | nothing | nothing |
| The sheet grows at a reveal, or a resize pins it, focus resting | nothing | nothing |
| The window regains focus, focus resting | as if the focus landed again | nothing |

## Accepted costs

- After a crossing, focus that has fallen to the page (the row's Accepted
  line) leaves a row coming back open to a press of ☰, not Escape, until
  focus returns to ☰ or the row.
- A row left open keeps the phone's header at its open height, 143 px against
  61 (3b2's Measured), until closed.
- A focused table can end with its foot behind the sheet: taller than the
  view above the sheet, it scrolls to the top; a reveal can grow the sheet
  over it, as 3b2's Accepted costs allow. A small focusable keeps the 24 rem
  clearance its margin gave it, more than the tallest sheet (inferred from
  the measure).
- Returning to the tab fires `focusin` again, so a focused table, or a field
  the reader has since scrolled behind the sheet, scrolls back to the top
  (inferred; not testable headless).

## Contract

No existing case changes. Judged by its cases, in a new `e2e/narrow.spec.js`
run in Chromium and Firefox at 392 by 800 on the desktop devices, as
`phone.spec.js`'s `isMobile` does not run in Firefox (my call), each shown to
fail by the mutation named. If a case's setup does not fail under its
mutation, the plan stops and the case comes back here (my call).

The row:

- **☰ toggles**: ☰ opens the row and closes it again, `aria-expanded` with
  it (killed by a ☰ that only opens).
- **Escape from inside the row**: open the row, Tab until its switch has
  focus, Escape; the row is gone, ☰ has focus and `aria-expanded` is false
  (killed by no handler on the row; the focus part by a close that leaves
  focus).
- **Escape on ☰**: focus ☰, Enter to open, Escape; the row is gone; Escape
  again, it stays closed (killed by a handler on the row alone; the second
  part by a handler that toggles).
- **Escape elsewhere**: open, focus Copy link, Escape; the row stays (killed by
  a handler on the header that ignores where focus is).
- **A widen and a narrow**: open, resize to 1280 by 800, wait until the wide
  header's switch shows, resize back; the row is shown and `aria-expanded`
  true (killed by `room.html`'s observer ported).
- **The row's switch**: from the open row the role changes, the row stays and
  focus stays on the switch (killed by a switch that closes the row).
- **The row's Leave**: reaches the lobby (killed by the row's Leave unwired).
- **Another tab's switch**: with the row open, a second tab of the same
  participant (`newTab`) switches role; the first tab's row shows the new
  sentence and switch and stays open (killed by a row that closes on a role
  change, or draws the role it opened with). 4c1-wide's plan deferred it here.

Left without a case: the banner, reconnect, phase and rejoin rows, as nothing
here touches what keeps or resets the row's state; a close on a tap outside
the row.

The listener; Chromium's margins clear the table unaided, so the first two
kill in Firefox alone:

- **A keyboard focus behind the sheet**: a voter's page whose table's foot
  lies below the round panel's top and above the round bar's, at scroll 0;
  Tab onto the table; it ends wholly above the sheet's top (killed by
  removing the listener, and by a listener taking the round bar's top alone).
- **The round bar's top**: the same on a facilitator's page while voting, the
  table's foot behind the round bar (killed by a listener reading the round
  panel with no fallback).
- **A tap**: the first case's page, a mouse click at a point of the table in
  view above the sheet, not a click that first scrolls its target into view;
  the page does not scroll (killed in both browsers by dropping the
  `:focus-visible` test).
- **Inside the sheet**: the same click, then Tab into the deck; the page does
  not scroll (killed in both by dropping the outside-the-sheet test).
- **The wide layout**: at 1280 by 450, where the page scrolls, Tab onto the
  participants panel; the scroll position stays exactly the one read before
  the Tab (killed by dropping the `sticky` test).

## The docs' changes

- **Parent**: the steps table's 4c1-narrow row becomes two. 4c1-narrow-keys,
  ☰'s row and a keyboard focus on the phone, on 4c1-wide, judged by its new
  cases and the existing cases unchanged. 4c1-narrow-cases, step 4's
  remaining phone, zoom and width guarantees, on 4c1-narrow-keys, judged by
  eye, its new cases, and the existing cases unchanged but for its listed
  contract changes. 4c1-editor waits on the latter, and step 4's text names
  both. The guarantee "the table's scale and ☰'s row included" becomes the
  table's scale included, ☰'s row keeping its state (decision 1).
- **`docs/design/room.html`**: the `ResizeObserver` close goes, its comment
  saying the row keeps its state; the `focusin` listener's comment says
  Firefox leaves a tall focus, the table, behind the sheet (decision 3).
- **`docs/known-issues.md`**: the Leave link's icon, before the word with its
  arrow pointing at it, looks slightly off; the candidates are the icon after
  the word, the icon alone (the designer's Figma), or a mirrored or other
  icon, decided with Copy link's so both follow one rule, by mockup with the
  designer; the link's place and behaviour do not change. The virtual
  keyboard's entry gains that a field the sheet hides scrolls to the top when
  focused, unchecked on a phone.
- 3b2's, 4c1-voters' and 4c1-wide's specs, delivered, stay as written, their
  "4c1-narrow" now the two steps the parent names. This one supersedes 3b2's
  Disclosure table, its decision 7's "a tap scrolls nothing" for text fields
  and "margin or not" for small focusables, and 4c1-wide's Accepted costs on
  an open row coming back open and on the reserve.

## Branches and commits

One PR on `20260930.ui_refresh_4c1_narrow_keys`, stacked on 4c1-wide's
`20260930.ui_refresh_4c1_wide`: this document with the docs' changes first,
then the row's cases that pass today, then Escape with its cases, then the
listener with its cases.
