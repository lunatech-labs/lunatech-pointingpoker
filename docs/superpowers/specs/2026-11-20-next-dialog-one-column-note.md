# Change note: the Next issue dialog in one column

**Lane:** light. Judged by two layout cases, red without the change in both browsers.

**Defect.** On desktop the Next issue dialog leaves a link little room. Next issue
spec decision 7 sets its width to `min(36rem, 100% - 2 × --space-4)`, and at
65.75 rem and over the issue editor's grid puts Next issue and Cancel beside the
field. At 1280 by 800 the field is about 287 px wide, so a 57-character Jira link
(574 px at the field's size) takes three lines, where the issue panel's own
editor, about 680 px wide, shows it on one.

**Change.** The dialog takes one column at every width, as it already does on a
phone: the estimate row, the field, then the buttons under the field at its
start. Its width becomes `min(44rem, 100% - 2 × --space-4)`, replacing decision
7's `36rem`; this gives the field about the page editor's width at 1280.
In `next-issue-dialog.css`, the `@container page (width >= 65.75rem)` rule that
drops the editor's negative margins (Next issue plan, ruling 12) gives way to
unconditional `.next-dialog .issue-editor` rules: one `minmax(0, 1fr)` column,
`margin-block: 0` on the field and the actions, then, in a rule of its own after
it, `margin-top: var(--space-2)` on the actions; their comment cites this note.
Below about 740 px the width is unchanged, as `100% - 2 × --space-4` is the
narrower there.

In the mockup, `docs/design/room.html?next=modal`, `.next-dialog` becomes
`min(44rem, 100%)` (the backdrop's padding is its `2 × --space-4`), and its
`@media (width < 65.75rem)` one-column rule on `.next-dialog .issue-editor`
becomes unconditional, its "outside the page container" comment dropped.

Next issue spec decision 7 and the Next issue plan (ruling 12, Task 7's mutation
`width: 36rem`) stay as written, as the width note left them; this note replaces
their width and the buttons' place beside the field.

The mockups also drop `next=inline`, the form in the issue panel that the
dialog replaced: its branch and wording in `room.html`, its option in
`room-cells.html`. `next=modal`, which the specs cite, stays.

**Considered.** A dialog of about 60 rem with the buttons beside the field gives
the field the same width but covers most of the room. A dialog as wide as the
issue panel ties its rules to the room's columns.

**Tests.** In `layout.spec.js`:
- "the dialog takes the spec's width" also runs at 1280 by 800, its probe at
  `min(44rem, 100% - 2 * var(--space-4))`. Proved by restoring `36rem`.
- New, at 1280 by 800: the issue set to a 57-character link
  (`https://example-internal.atlassian.net/browse/PROJE-25123`), the dialog opened:
  the field is one line high (its height within 0.5 px of `--target-min`), and
  Next issue's top is below the field's bottom. Proved by dropping the
  one-column rule (the field narrows and wraps, the buttons sit beside it) and,
  separately, by restoring `36rem` (the field wraps).
- The mockups: `grep -n "inline" docs/design/room-cells.html` and
  `grep -n "next=inline\|'inline'\|inline or" docs/design/room.html` print
  nothing.

**Out of scope.** At 44 rem the estimate row splits as 12 numbers, then `?`,
Parked and Skip; that is a side effect of the width and scale, not a goal, so
nothing pins it (user, 2026-11-20). The mockup's field stays empty where the
app pre-fills it.

**Review:** one wave, 3 lenses (Sonnet). Failure modes 0 material, simplicity 0,
consistency 2 claimed, reclassified as wording (places to name, no decision);
wording accepted but for trimming the measurements and the Considered section.
