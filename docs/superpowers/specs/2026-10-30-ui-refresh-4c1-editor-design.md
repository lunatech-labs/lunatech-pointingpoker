# UI Refresh, Step 4c1-editor: The Editing View's Look

Date: 2026-10-30
Status: In discussion
Parent: `docs/superpowers/specs/2026-09-30-ui-refresh-design.md`, step 4

## Purpose

4c1-wide built the room page at every width but left the editing view as
today's markup, a Bootstrap input group in a legacy wrapper inside the issue
panel. This step builds the editing view 3b3 designed
(`docs/superpowers/specs/2026-10-16-ui-refresh-3b3-issue-editor-and-messages-design.md`,
decisions 7, 8 and 11) and `docs/design/room.html` (`edit=1`, `edit=saving`,
`message=conflict,save-failed`) draws: the growing field, Save and Cancel with
their words, and the editor's two messages as message panels. It rules on what
4b2's final review and known issues left to it, and writes 3b3's owed cases.
No design is new but the rulings below.

## Terms

The parent's Terms hold: the **desktop layout** is the wide layout from
65.75 rem, the **middle layout** the wide layout below it, the **phone
layout** the narrow one.

- **The editor's messages**: "Could not save the issue" (the failure) and
  "Changed by someone else to: …" with Use theirs (the notice), rendered in
  the issue panel's status region (`.issue-panel-status`, `role="status"`).
- **Focus fell**: 4b2's term, `document.activeElement` is the body or null.
- **A line break**: LF or CR, the only characters that add a line to the
  field or the heading in Chromium and Firefox (checked; U+2028, U+2029 and
  NEL do not).

## Decisions

1. **The banners leave this step** (product owner's ruling). 4c1-editor is
   the editing view; 4c1-banners, after it, moves the room's banners under the
   header as 3b3 decisions 2 to 6 and 4c1-wide's Accepted costs say, the
   lobby's staying legacy until 4c2. Each is judged its own way: this one by
   the field's unit table and the editor's cases, that one by the layout
   journeys showing a banner.
2. **While saving, both buttons take the lobby's inert look** (product
   owner's ruling, by mockup): `--grey` words on a `--paper-pale` fill with
   the hairline edge, 7.06:1, as 3b4 decision 11 greys the lobby's Join, so
   the app has one inert look. The mockup's muted Save, `--grey` on
   `--track`, is 6.47:1 and fails principle 10's 7:1 for text; the change
   from the burgundy fill is the "not now" signal, and Save keeps its place
   first. The gate already holds `--grey` on `--paper-pale`
   (`design/gate.ts`), so it gains no pair. Revisited, by mockup with the
   designer, once the UI refresh stack is deployed and users have given
   feedback. Set aside: a white fill (7.68:1, a second inert look), ink words
   on `--track` (reads as active), a new token.
3. **400% text zoom below 400 px is accepted** (product owner's ruling): the
   product caters for up to 200% zoom at the largest viewport, so 400% on a
   400 px window is out of range. Known issues' entry closes as accepted; the
   buttons get no wrapping or word-only rule.
4. **A double-click on Edit in the middle and phone layouts selects a word**
   (product owner's ruling, accepted). Below 65.75 rem Save and Cancel sit
   under the field, so Edit's spot falls on the field once it opens; in the
   desktop layout it falls on Cancel, which 4b2's press rules drop. The second
   press lands in the field, which 4b2 decision 4 exempts so a word can be
   double-clicked; one word of the issue is selected, nothing is sent. Set
   aside: remembering that a click opened the editor to drop that sequence's
   second press, a state for a visible, harmless misfire.
5. **The status region stays the issue panel's child**, after the read view or
   the editor: re-parenting it remounts the live region, which "the editor's
   notices are announced from one live region" forbids. `room.html` draws it
   there too, which leaves every box in place (checked at 1280, 1000 and
   392 px), and `issue-panel.css` drops its `grid-column`, which only served
   the mockup's old placement.
6. **The field grows by `field-sizing: content` alone, with no script fit**
   (product owner's ruling), reversing 3b3 decision 7's fit. Every current
   browser has it (caniuse, checked 2026-10-30): Chrome and Edge from 123,
   Firefox from 152 (ESR 153; ESR 140, without it, ended on 2026-09-29),
   Safari from 26.2, Samsung Internet from 27, Firefox for Android from 159;
   so do both CI browsers (checked). Elsewhere the field stays one line tall
   and shows the caret's line, its `overflow` hidden. Set aside: a fallback
   script only those browsers would run, untested in CI; an always-on script,
   a second mechanism for the few.
7. **`oneLine` runs inside `step`**, on `typed`, `pencil` (Edit's seed) and
   `theirs` (Use theirs' seed), the three ways text enters the draft (3b3
   decision 7); `start` stays the room's issue, unnormalised. So the reducer's
   unit table pins each, without a browser.
8. **Three guards keep a line break out of the field, and no new one is
   added**: the first Enter saves and the field turns read-only before the
   key's default action (inferred; the plan's spike checks it); a held Enter's
   repeats are dropped by the panel's capture rule (4b2's, in `IssuePanel`),
   including after a fast failure makes the field editable again; `oneLine` is
   the backstop. If the spike finds a single Enter mid-text leaving a break,
   the field gains a `preventDefault` with a case of its own. Set aside: a
   `preventDefault` in the field as belt and braces, which no mutation could
   fail while the other guards stand.

## Built from 3b3

3b3 decisions 7, 8 and 11 as written, but the script fit (decision 6), with
`oneLine` placed by decision 7 and the Enter guards by decision 8 here. The
field is `rows="1"`. Decisions 9 and 10's behaviour is 4b2's and stays; only
the look changes. The editor drops every Bootstrap class and both
`legacy-page` wrappers, in `IssueEditor.tsx` and the status region.

## Accepted costs

3b3's Accepted costs for the editing view hold. Added:

- Decision 4's selected word: typing then replaces that word, not the issue.
- A browser without `field-sizing` (an iPhone before iOS 26.2, an old ESR)
  shows a long issue one line at a time while edited (decision 6).

## Contract

Contract change: "the editor's notices are announced from one live region"
(`room.spec.js`) expects the failure before the notice, `failure + conflict`
(3b3 decision 11). Otherwise existing cases only gain checks; `fixtures.js`
finds the field, Save and Cancel by role and name, which hold.

New and grown cases, each shown to fail by the mutation named. If a case's
setup does not fail under its mutation, the plan stops and the case comes back
here (my call).

- **`oneLine`'s unit table** (`room/issueEditor.test.ts`): a line break at
  either end removed, an inner run to one space, a CRLF run, a trailing typed
  space kept (killed by a trim, and by a `replace` of single breaks only).
- **`step`'s rows** (decision 7), each killed by `oneLine` dropped from its
  event: `typed` "a\nb" gives the draft "a b"; Edit on a stored "a\nb" gives
  the draft "a b" and no notice (the notice part also killed by normalising
  `start`); a conflicting "x\ny" then Use theirs gives the draft "x y" and no
  notice.
- **A held Enter mid-text**: "a held Enter in the field while saves fail sends
  one request" puts the caret mid-text before Enter and also expects the
  draft unchanged (killed by the panel's capture rule narrowed to buttons).
- **A failed save with focus fallen**: the stall-then-abort route of "a failed
  save leaves focus the user moved elsewhere", focus blurred to the body before
  the release; the field has focus (killed by an `editor.failed` effect that
  never focuses). 4b2's final review deferred it here.
- **A double-click on a word in the field**: "a double-click on Edit issue
  leaves the editor open, focus in the field" goes on to fill the field and
  double-click a word; the word is selected and the editor open (killed by
  4b2's mousedown rule extended to the field). 4b2's final review deferred it
  here.
- **A long issue shows whole**, in `layout.spec.js`, Chromium only as its
  layout cases are: an issue wrapping to three lines in the desktop layout;
  the field's `scrollHeight` equals its `clientHeight` (killed by dropping
  `field-sizing`).
- **The inert look**: "a mouse save keeps focus on Save issue, …" checks that
  mid-save Save's computed colour, background and border colour are Cancel's,
  and its background `--paper-pale`'s, read from the page's custom property
  (killed by the mockup's `--track` rule on Save, and by one moving both).

Left without a case: decision 4's selection, an accepted cost; decision 6's
one-line fallback, which no CI browser shows.

## The docs' changes

- **Parent**: the steps table gains 4c1-banners, the banners' look and place
  under the header, on 4c1-editor, judged by eye, its new cases, and the
  existing cases unchanged but for its listed contract changes; 4c2 waits on
  4c1-banners; 4c1-editor's row reads the editing view's look; 4a and 5 keep
  waiting on 4c1-editor, needing the editing view, not the banners (my call).
  Step 4's text names 4c1-banners, and that the muted look is revisited after
  deployment (decision 2).
- **`docs/design/room.html`**: both muted buttons take the lobby's inert look
  (decision 2), through `issue-editor.css`, which the app shares; the status
  region moves after the editor (decision 5); the script fit goes
  (decision 6).
- **`docs/design/ui-reference.md`**: the editing view's script fit goes, the
  saving look's open contrast question closes on decision 2, the lobby's
  inert look is named the app's, the Messages region waits for 4c1-banners,
  and the log gains a 4c1-editor entry for decisions 2 and 6.
- **`docs/known-issues.md`**: the 400% entry closes as accepted (decision 3);
  the script-fit entry goes (decision 6).
- 3b3's, 4b2's and 4c1-wide's specs, delivered, stay as written; this one
  supersedes 3b3's muted Save look and script fit, 4c1-wide's hand-off of the
  banners to this step (its decision 1 and its Contract's Messages line), and
  rules on 4b2's double-click.

## Branches and commits

One PR on `20260930.ui_refresh_4c1_editor`, stacked on 4c1-narrow-cases'
`20260930.ui_refresh_4c1_narrow_cases` (#473): this document with the docs'
changes first, then `oneLine` with its table, then the field and buttons, then
the messages with the contract change, then the remaining cases.
