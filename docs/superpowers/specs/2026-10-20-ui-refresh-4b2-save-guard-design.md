# UI Refresh, Step 4b2: The Editor's Save Guard and Closing Focus

Date: 2026-10-20
Status: In discussion
Parent: `docs/superpowers/specs/2026-09-30-ui-refresh-design.md`, step 4

## Purpose

4b2 builds two decisions step 3b3 settled for the issue editor
(`docs/superpowers/specs/2026-10-16-ui-refresh-3b3-issue-editor-and-messages-design.md`):
decision 10, Save and Cancel keep focus while saving, and decision 9, focus
returns to Edit when the editing view closes. It is built on today's look; 4c1
restyles the editor.

Today Save and Cancel are `disabled` while saving, which drops focus, so the
editor moves it to the field, and Orca with Firefox then cuts off "Could not
save the issue" (the known issue "A screen reader does not hear a failed save
from the Save issue button"). Keeping focus on Save makes a successful save
unmount the focused button, the moment decision 9 is for, so the two ship
together.

## Terms

- **The editor**: `IssueEditor.tsx`'s outer element: the field, its buttons
  and the status region.
- **The modes**: viewing, editing and saving, `Mode` in `room/issueEditor.ts`.
- **A close**: a change of mode to viewing, from editing (Escape, Cancel) or
  from saving (the save succeeded). The mount is not a close.
- **Focus fell**: `document.activeElement` is the body or null.
- **Press**: as 4b defines it, judged when the click fires.

## Decisions

Settled before this step: 3b3 decisions 9 and 10.

1. **While saving, Save and Cancel are `aria-disabled="true"`, never
   `disabled`, and carry Bootstrap's `disabled` class.** The class fades them
   to .65 opacity as today's attribute does, so the look is unchanged; only
   focus differs. The hand test checks a hover keeps the fade. The field stays read-only, as `readOnly={!editing}` already
   makes it. A press on either while saving needs no drop of its own: `submit`
   ignores it outside editing and `step` ignores `cancel` while saving. Set
   aside: one `[aria-disabled]` rule in `styles.css`, which would also fade the
   round bar for 1 s after every flip, a look 4b did not decide. 4c1
   re-challenges the muted look, its contrast gate included.
2. **After a failed save the field takes focus only if focus fell.** The
   `editor.failed` effect narrows to what it was for. Focus on Save or Cancel
   stays, so the failure is read from there, and Enter or Space on Save
   retries; focus in the field stays in the field. `timed` (`api.ts`) still
   ends a hung save in a failure after `REQUEST_TIMEOUT_MS`, so no timer is
   added.
3. **On a close, Edit takes focus if focus was in the editor or fell.** This
   is 3b3 decision 9: Escape leaves focus in the field, Cancel and Save
   unmount, and each ends on Edit. Focus the user moved elsewhere is left
   alone. Only a close moves it: the mount, in StrictMode too, does not, so it
   gets one hand check under `npm run dev`, recorded in the PR. How the close
   is detected is the builder's call within that rule. Set aside: the success
   path alone, which splits one settled rule across two steps.
4. **4b's two press rules apply to the editor.** A click-capture handler on
   the editor drops a click on one of its buttons whose `detail` is above 1;
   a click in the field is untouched, so a double-click still selects a word.
   A key-capture handler on the editor drops a repeated Enter, the field's own
   Enter handler included. The spike (below) shows a double-click on Edit
   opening the editor and closing it, its second click landing on Cancel in
   Edit's place. Decision 3 without the Enter rule would let a held Enter
   cycle: save, focus on Edit, open, save the same text again. Set aside: the
   Enter rule alone, leaving the double-click to 4c1's layout.
5. **The known issue closes on a hand check.** In Orca with Firefox: a mouse
   click on Save with the request blocked is heard as "Could not save the
   issue", then Enter on Save after unblocking saves. Recorded in the PR; if
   Orca still cuts the message, the entry stays, narrowed to what was heard.
   Not a merge gate if Orca is not at hand.

## States and events

Focus is unchanged unless the cell says otherwise.

| Event | Viewing | Editing | Saving |
| --- | --- | --- | --- |
| Press on Edit | to editing; the field takes focus (today) | cannot happen: no Edit | cannot happen: no Edit |
| Press on Save, or Enter in the field | Enter ignored (today); no Save | to saving; Save and Cancel `aria-disabled` and faded | ignored |
| Press on Cancel, or Escape in the field | Escape ignored (today); no Cancel | a close: to viewing | ignored |
| Typing in the field | ignored: read-only | the draft changes | ignored: read-only |
| Press on Use theirs | cannot happen: no notice | the draft takes the room's issue; the field takes focus (today) | cannot happen: no notice while saving |
| A button click with `detail` above 1 | dropped | dropped | dropped |
| A repeated Enter | dropped | dropped | dropped |
| The save succeeds | cannot happen | cannot happen | a close: to viewing |
| The save fails, or `timed` ends it | cannot happen | cannot happen | to editing, the failure shown; the field takes focus only if focus fell |
| The save is refused by a different instance | cannot happen | cannot happen | today's recovery reloads the page |
| A snapshot | shows it (today) | the notice if it conflicts (today) | waits for the store to leave the old issue (today) |
| Stream lost, reconnect | unchanged | unchanged | unchanged; the save is HTTP and settles on its own |
| A close, focus in the editor or fallen | cannot happen: already viewing | Edit takes focus | Edit takes focus |
| A close, focus elsewhere | cannot happen: already viewing | left alone | left alone |
| The mount: a join, a reload | viewing; focus left alone | cannot happen | cannot happen |

## Accepted costs

- A deliberate second click on the same spot within the double-click time is
  ignored, the known issue for the role line and the round bar extended to the
  editor.
- Two quick Enters on Edit, not held, open the editor and save the unchanged
  text: keyboard clicks carry `detail` 0. Today's behaviour.
- A click on the page's background during a save leaves focus fallen, so the
  close puts it on Edit (decision 9's own rule).
- A hung save keeps Save and Cancel faded until `timed` ends it, as today's
  `disabled` does.

## The spike

Run on 2026-10-20 on today's page at the default desktop width, in Chromium
and Firefox, then removed.

| What | Result |
| --- | --- |
| Where the buttons sit | Edit and Cancel at the same spot, Save to its left |
| A double-click on Edit | the editor opens and closes; no request |
| A double-click on Save whose save lands between the clicks | the second click lands on the read-only field; nothing happens |

## Contract

Contract change: 'a save the network drops keeps the draft and says so'
expects focus on Save after the failure, not on the field, and retries with
Enter on Save; its comment changes with it. Every other case is unchanged.
'a double-clicked Save issue posts once' passes by decision 4 now, where it
passed by `submit`'s check.

New cases, in `e2e/room.spec.js`, each shown to fail by the mutation beside
it. A save is held mid-flight by a route that waits, as 'a failed save leaves
focus the user moved elsewhere' does; a press mid-save is forced, as
Playwright waits on `aria-disabled`.

| Case | Mutation |
| --- | --- |
| Save keeps focus while saving, and forced presses on Save and Cancel and an Escape mid-save send nothing and change nothing | `disabled` kept; `submit`'s check removed |
| The field is read-only while saving | the field read-only only while viewing |
| A failure read from Save leaves focus on Save (the changed case) | the effect's old rule |
| Escape, Cancel and a save each end with focus on Edit | no close rule |
| Focus moved elsewhere during a save stays there after it succeeds | the close rule ignoring where focus is |
| A page load leaves focus off Edit | the close rule run on mount |
| A double-click on Edit leaves the editor open | no `detail` rule |
| A held Enter in the field saves once | no Enter rule |

## The docs' changes

- **Parent**: the Steps table's 4b2 row and step 4's text name 3b3 decisions
  9 and 10, and carry the muted look to 4c1, to be re-challenged against the
  contrast gate.
- **Known issues**: the screen reader entry removed on the hand check
  (decision 5); the re-click entry extended to the editor.

## Branches and commits

One PR on `20260930.ui_refresh_4b2_save_guard`, stacked on 4b's
`20260930.ui_refresh_4b_round_toggle` (#456): this document and the parent's
change first, then the code and its cases, the known issues with them.
