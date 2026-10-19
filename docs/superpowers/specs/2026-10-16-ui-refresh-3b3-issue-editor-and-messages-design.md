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
step 4 builds the page, and step 1a's editor region contract stays (parent,
"Step 1a. The editor's live region").

## Terms

- **Banner**: the reference's term, a message in the room page's Messages
  section, each its own panel (3b1 decision 3, J6).
- **Problem**, **notice**: J6's tones. The room page's banners are the lost
  connection (a problem, `role="alert"`) and the moved link and the restart
  (notices, `role="status"`), both read from the URL on load. The copy hint
  leaves the banners for beside Copy link in step 4 (3b1 decision 7).
- **Messages section**: the `section` named "Messages" (3b1's contract changes).
- **Message panel**: a J6-toned box, a banner or one in the editor panel.
- **Editor panel**: the issue panel in its editing view.
- **Editor region**: step 1a's `issue-status`, the always-rendered
  `role="status"` region that holds the editor's two messages.
- **Wide layout**, **phone layout**: 3b2's, switching at 51.75 rem.

## Decisions

**The scope**

1. **The lobby's messages are 3b4's**: the join and create failures and "Your
   session has ended". Each shows only over the lobby (`fatal` is set only
   while the page has not reached the room, in `connection.ts`'s `check`), and
   the product owner judges the lobby there. 3b3 keeps the shared banner
   mechanics (decisions 2 to 6), which the lobby inherits, 3b4 being stacked on
   it. The parent's step lines and the reference's L7 to L9 follow (The docs'
   changes).

**The banners (L8)**

2. **Dismiss is on notices only**: the moved link and the restart. A problem
   has none, since it ends with its cause.
3. **The stack is fixed by tone**: the problem first, then the moved link, then
   the restart. Today's order; no arrival is tracked.
4. **The Messages section mounts only while a banner shows**: no empty
   landmark, no height. Each banner keeps 3b1's role. An alert is announced on
   insertion and both notices exist at load, so an always-rendered region would
   add nothing today; it is added if a notice ever arrives after load.
5. **Dismiss moves focus to the page's `h1`** (`tabindex="-1"`): the room id on
   the room page, the lobby's own being 3b4's. It is not interactive, so a
   second Enter does nothing. Two notices show together only from a typed
   `?moved=1&restarted=1`, so no search for another Dismiss.
6. **Dismiss is an × icon alone**, named "Dismiss", at the panel's right, with
   a target of `--target-min`. In the phone layout the text wraps and Dismiss
   stays at the right.

**The editing view (L7)**

7. **The field is a wrapping `<textarea>` that grows to fit**, at `--text-lg`,
   role `textbox` named "Current issue". The whole issue stays visible while it
   is edited. It grows by `field-sizing: content`, with a script fit where that
   is unsupported (Firefox ESR 140; Safari unchecked). It wraps at spaces as the read view does, but a link issue wraps
   differently once edited: a textarea cannot take the heading's breaks before
   a slash and after a dot (3b1 decision 4, 3b2 decision 12).
   - **One line only.** `oneLine`, a pure function in `room/issueEditor.ts`,
     takes every text entering the draft: typed or pasted, seeded by Edit, and
     seeded by Use theirs. Line breaks at either end are removed, an inner run
     becomes one space, typed spaces are never trimmed. Only the draft is
     normalised: `start` keeps the room's issue, so an issue holding a line
     break (the server stores it raw) raises no conflict notice. The editor's
     states and events are otherwise unchanged.
   - **Keys.** Enter saves and never inserts a line break, Escape cancels, and
     an input method's Enter is not a save (today's keys). The field sets
     `enterkeyhint="done"`.
8. **Save and Cancel sit beside the field at and above 65.75 rem**, where Edit
   was, as an icon and its word, and **below it under 65.75 rem, in both
   layouts**, at the start of the row, as icon and word, the switch being 3b2's
   compact one, the one the foot follows: a wider column for the text where
   width is scarce. Checked at 360, 390 and 430 px, where beside the buttons
   the field got 178 to 248 px, and in the band from 51.75 to 65.75 rem, where
   the wide layout's issue panel is 484 to 692 px and the field beside them
   gets 232 px at 51.75 rem (349 at 960 px, 426 at 1067 px), the same short
   lines. In the band between the two switches a panel with a distinct narrow
   arrangement uses it, unless a measurement shows the wide one fits (the
   header's wide form holds from 51.75 rem because 3b2 measured the longest
   room id fitting there; the banners have one arrangement).
   The names "Edit issue", "Save issue" and "Cancel editing" stay, the visible
   words being "Save" and "Cancel" (WCAG 2.5.3). The DOM and tab order are Save
   then Cancel at every width, so the screen order never differs from the
   reading order (WCAG 2.4.3). Beside the field, the buttons align to its first
   line while it grows.
9. **When the editing view closes** (Escape, Cancel, a save that succeeded),
   focus returns to Edit, if it was inside the editor panel or had dropped (on
   the body or nowhere); focus the user moved elsewhere is left alone.
10. **While saving**, Save and Cancel are `aria-disabled` and keep focus, with
    a muted look so a save in flight shows; the field is read-only. The
    existing guards in `submit` and `step` already ignore presses outside
    editing, and `timed` ends a hung save in `failed`, so no timer is added.
    The `editor.failed` effect narrows to what it was for, a focus that fell:
    after a failure the field takes focus only if focus is on the body or
    nowhere; focus on Save or Cancel stays, so the failure is read, and Enter
    or Space on Save retries. This is the short spec the known issue "A screen
    reader does not hear a failed save from the Save issue button" asked for;
    step 4 builds it.
11. **The editor's two messages are message panels inside the editor panel**,
    under the field, without the banners' shadow, in J6's tones. The editor
    region is one element, rendered in the read and the editing views alike
    (1a's contract), and only its panels sit under the field. The order is the
    field, then Save and Cancel, then the panels, on screen and in the DOM at
    every width, so the tab order is the screen order. When both panels show,
    the problem is above the notice, as for the banners; 1a's code had the
    notice first, by no rule. The panels' icons add no text (`aria-hidden`).
    A long "Changed by someone else to: …" quote wraps and is never cut (3b1
    decision 4).

## States and events

The banner region. Rows are events, columns what shows.

| Event | Problem: none | Problem: lost | Notice: absent | Notice: shown | Notice: dismissed |
| --- | --- | --- | --- | --- | --- |
| `connection.ts` sets lost (a drop, a stale stream reopened, a refused frame or command) | lost | same | n/a | n/a | n/a |
| The stream opens, or a snapshot arrives | same | none | n/a | n/a | n/a |
| A page load (the restart reload, the legacy redirect, Leave, the user's reload, a page restored from cache) | starts over: none | starts over: none | shown if the URL carries its flag, which the page then strips | starts over | starts over |
| Dismiss pressed | n/a | cannot happen (none offered) | n/a | dismissed, focus by decision 5 | cannot happen (unmounted) |
| Any other event (a heartbeat included) | same | same | same | same | same |

The notice columns stand for each notice on its own. A drop the browser
recovers from in place is no page load; one it stops retrying, or a refused
command, answered by a 200 once the room was reached is: `connection.ts`
reloads onto `?restarted=1`. The editor's messages need no
table of their own: the editor's states and events are step 8b's (the frontend
rewrite spec's "Issue editor behaviour", `frontend/src/room/issueEditor.ts`),
and 3b3 draws what `notice` and `failed` render (decision 11).

Accepted race: a connection that drops and returns between two paints shows
nothing.

## Accepted costs

- A link issue wraps differently in the editor than in the heading, and the
  browsers differ on where: Chromium may break it mid-word where Firefox breaks
  after a slash. A long issue moves the table when edited, as it does when read.
- With both editor messages shown, the region is read whole, so a failure that
  is stale by then is read before a fresh conflict, and the other way round
  under the old order; neither order avoids a stale case.
- A paste with a line break in the middle of the draft moves the caret to the
  end and loses native undo.
- A swallowed Gboard Enter (known issues, "The issue editor's phone keyboard
  behaviour is unverified") at the end of the draft does nothing, as today;
  inside the text it becomes a space and the caret moves to the end.
- The muted saving look flashes on a fast save; no delay is added.
- If the conflict ends while focus is on "Use theirs" (someone else edits the
  issue again), the button unmounts and focus drops to the page.
- On a phone, the virtual keyboard and the pinned sheet may leave the editing
  view little room (inferred, held in known issues, never a merge gate).
- Focus after Dismiss lands on the page's `h1`, which a screen reader reads as
  the room's id.
- A screen reader announces the field as multi-line while Enter saves; the hand
  check names it.

## Contract

No e2e case changes in this step; it draws no app code. Step 4 lists these
contract changes, as principle 9 asks:

- "the editor's notices are announced from one live region" (`room.spec.js`)
  changes one expected string: the failure before the conflict (decision 11).
- "a save the network drops keeps the draft and says so" (`room.spec.js`) no
  longer expects the field focused after a click on Save, where focus stays
  (decision 10); step 1a's accepted cost for the mouse save goes with it.
- New cases: focus on the page's `h1` after Dismiss (decision 5), focus on Edit
  after the editing view closes (decision 9), Enter saving and never inserting
  a line break, `aria-disabled` and focus kept while saving (decision 10;
  Playwright treats `aria-disabled` as disabled, so a press mid-save needs
  `force` or `dispatchEvent`).
- A unit table for `oneLine` (decision 7): each end, an inner run, a CRLF run,
  and a trailing space left alone; and for `step`, Edit on an issue holding a
  line break shows no notice.
- The Messages section is found by role and name, as 3b1's contract already
  says; the moved and restart lookups by role and text stay.

## The docs' changes

- **Parent**: step 3's 3b3 and 3b4 lines (decision 1), and principle 4's table
  cell "the banners (L8), the issue editor's messages (L7)", which close here.
- **3b1**: its Status line points here for the banners' and the editor's
  deferred decisions.
- **Mockup**: `room.html` draws the editing view, both editor messages together
  and the muted saving look; `room.html` and `room-cells.html` drop the `ended`
  option (decision 1); `room-cells.html` gains the editing cells.
- **Reference**: L7 and L8 leave Open for a section on the editing view and the
  banners; J6's "How they stack and their Dismiss are 3b3's" is replaced by
  them; L9 gains the lobby's three messages; the log gains a 3b3 entry.
- **Known issues**: "A screen reader does not hear a failed save from the Save
  issue button" is decided here and built in step 4; the phone keyboard entry
  gains decision 7's Enter sentence and the planned narrowing of the Enter
  guard (a `beforeinput` of `insertLineBreak`, inferred, never a merge gate);
  a phone risk for the keyboard and the pinned sheet is added.

## Branches and commits

One PR on `20260930.ui_refresh_3b3_issue_editor_and_messages`, stacked on
3b2's `20260930.ui_refresh_3b2_narrow_and_large` (#448): this document and the
parent's change first, then the mockup, then the reference and known issues.
