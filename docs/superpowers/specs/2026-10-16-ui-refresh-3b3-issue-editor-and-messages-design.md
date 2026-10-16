# UI Refresh, Step 3b3: The Issue Editor and the Messages

Date: 2026-10-16
Status: In discussion
Parent: `docs/superpowers/specs/2026-09-30-ui-refresh-design.md`, step 3

## Purpose

Step 3b3 draws the two message surfaces of the room page: the issue editor's
editing view and its messages (the reference's L7), and the banners' stacking,
Dismiss and mounting (L8). It builds on 3b1's page and 3b2's two switches
(`docs/superpowers/specs/2026-10-09-ui-refresh-3b1-wide-room-page-design.md`,
`docs/superpowers/specs/2026-10-15-ui-refresh-3b2-narrow-and-large-design.md`).
The product owner judges it on `docs/design/room.html`. It changes no app code:
step 4 builds the page, and the step 4a region contract it keeps stays.

## Terms

- **Banner**: a message in the room page's Messages section, full width under
  the header, each its own panel (3b1 decision 3, J6).
- **Problem**, **notice**: J6's tones. Today's banners: the connection lost and
  the session ended are problems (`role="alert"`); the moved link and the
  restart are notices (`role="status"`), both read from the URL on load. The
  session ended is set only while the page has not reached the room
  (`connection.ts`'s `check`), so it shows over the lobby; the room page shows
  the lost connection and the two notices. One `Alerts` serves both pages.
- **Messages section**: the `section` named "Messages" that holds the banners.
- **Editor panel**: the issue panel in its editing view.
- **Editor region**: step 4a's `issue-status`, the always-rendered
  `role="status"` region under the field that holds the editor's two messages.
- **Wide layout**, **phone layout**: 3b2's, switching at 51.75 rem.

## Decisions

**The scope**

1. **The lobby's join and create failures are 3b4's**: only the lobby shows
   them, and the product owner judges them on the lobby. 3b3 keeps the shared
   banner mechanics (decisions 2 to 5), which the lobby inherits, 3b4 being
   stacked on it. The parent spec's step lines and the reference's L7 to L9
   follow (The docs' changes).

**The banners (L8)**

2. **Dismiss is on notices only**: the moved link and the restart. A problem
   has none, since it ends with its cause and the fatal one would only lie
   hidden. Today's behaviour.
3. **The stack is fixed by tone**: the problem first, then the moved link, then
   the restart. Today's order; no arrival is tracked.
4. **The Messages section mounts only while a banner shows**: no empty
   landmark, no height. Each banner keeps 3b1's role. An alert is announced on
   insertion and both notices exist at load, so an always-rendered region would
   add nothing today; it is added if a notice ever arrives after load.
5. **Dismiss moves focus**: to the next banner's Dismiss, else to the page's
   `h1` (`tabindex="-1"`): the room id on the room page, the lobby's own being
   3b4's. It is not interactive, so a second Enter does nothing.
6. **Dismiss is an × icon alone**, named "Dismiss", at the panel's right, with
   a target of `--target-min`. In the phone layout the panels wrap at the
   page's edges and Dismiss stays at the right.

**The editing view (L7)**

7. **The field is a wrapping `<textarea>` that grows to fit**, role `textbox`
   named "Current issue". It wraps as the read view's heading does, so Edit
   changes no height; a longer issue costs what a long read view costs
   (principle 4). A newline typed or pasted becomes a space, so the read view
   never shows a break the old input would have stripped. Enter saves and
   Escape cancels; an input method's Enter is not a save (today's keys).
8. **Save and Cancel sit beside the field in the wide layout**, where Edit
   was, as an icon and its word, and **below it in the phone layout**, at the
   start of the row, the switch being 3b2's 51.75 rem. The DOM and tab order
   are Save then Cancel at every width, so the screen order never differs from
   the reading order (WCAG 2.4.3). While saving, the field is read-only and
   both buttons are disabled, in the app's existing disabled look.
9. **The editor's two messages are message panels inside the editor panel**,
   under the field, without the banners' shadow, in J6's tones, inside the
   editor region. When both show, the problem is above the notice (decision 3's
   rule); 4a had the notice first. A long "Changed by someone else to: …" quote
   wraps and is never cut (3b1 decision 4).

## States and events

The banner region. Rows are events, columns what shows.

| Event | Problem: none | Problem: lost | Problem: ended | Notice: shown | Notice: dismissed |
| --- | --- | --- | --- | --- | --- |
| The connection drops | lost | same | ended stays | n/a | n/a |
| A snapshot arrives | same | none | cannot happen (no stream after fatal) | n/a | n/a |
| The session ends (fatal, only before the room is reached) | ended | ended | same | n/a | n/a |
| Page load with the URL's flag | n/a | n/a | n/a | shown | n/a |
| Dismiss pressed | n/a | cannot happen (none offered) | cannot happen | dismissed, focus by decision 5 | cannot happen (unmounted) |
| Any other event | same | same | same | same | same |
| Leave | the room page goes (3b4's lobby shows what remains) | same | same | same | same |

The editor's messages need no matrix of their own: the editor's states and
events are 4a's (`frontend/src/room/issueEditor.ts`), unchanged, and 3b3 only
draws what `notice` and `failed` render (decision 9).

Accepted race: a connection that drops and returns between two paints shows
nothing.

## Accepted costs

- A long issue moves the table when editing, as it does when read.
- A banner arriving on a scrolled page shows above the view, a phone more often
  (3b1's accepted cost).
- Focus after Dismiss lands on the page's `h1`, which a screen reader reads as
  the room's id, not as an action.
- The editor's two messages swap order against 4a's, which changes the one
  case below.

## Contract

No e2e case changes in this step; it draws no app code. Step 4 changes one:
"the editor's notices are announced from one live region" in `room.spec.js`
reads the region's text with both messages shown as the conflict then the
failure, which decision 9 reverses. The new Messages section is a `section`
named "Messages", found by role and name; the existing text lookups for the
moved and restart banners stay.

## The docs' changes

- **Parent**: step 3's 3b3 and 3b4 lines (decision 1).
- **3b1**: its Status line points here for the banners' and the editor's
  deferred decisions.
- **Mockup**: `room.html` draws the editing view, its two messages and the
  Messages section; `room-cells.html` gains the editing cells.
- **Reference**: L7 and L8 leave Open for a section on the editing view and the
  banners; J6's "How they stack and their Dismiss are 3b3's" is replaced by
  them; L9 gains the lobby's two messages; the log gains a 3b3 entry.

## Branches and commits

One PR on `20260930.ui_refresh_3b3_issue_editor_and_messages`, stacked on
3b2's `20260930.ui_refresh_3b2_narrow_and_large` (#448): this document and the
parent's change first, then the mockup, then the reference.
