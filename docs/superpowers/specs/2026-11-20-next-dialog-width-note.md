# Change note: the Next issue dialog's width

**Lane:** light. Judged by one new layout case, red without the change in both browsers.

**Defect.** Next issue spec decision 7 sets the dialog's width to
`min(36rem, 100% - 2 × --space-4)`, "a set width as in the mockup". A modal
`dialog` also gets the browser's `max-width: calc(100% - 6px - 2em)` (the HTML
standard's rendering section), which the app does not override; the mockup's
dialog is a `section`, which no such rule caps. While the dialog's font size is
the root's, the cap is 6 px under the formula and wins below about 38 rem. At
392 px wide the dialog is 339 px against 345 in Chromium (`page.css`'s
scrollbar gutter leaves a 377 px viewport) and 354 against 360 in Firefox,
where the gutter is 0; in Chromium its estimate chips wrap 5 per line
instead of the mockup's 6.

**Change.** `.next-dialog` gains `max-width: none`, so the spec's width is the
only rule. The browser's `max-height` stays, as decision 7 leaves it.

**Test.** In `layout.spec.js`, outside the Chromium-only describes: at 392 by
800 and 320 by 800, the open dialog is as wide as a probe with
`position: fixed; width: min(36rem, 100% - 2 * var(--space-4))` (±0.5),
appended to `document.body` and removed after. Outside `.room-page`'s
container, the probe resolves `100%` against the viewport, as the modal does,
so the case states the formula rather than a number. Proved by dropping
`max-width: none`: the dialog comes out 6 px narrower at both widths.

**Out of scope.** The dialog sits 15 px further from the right edge than the
left at 392 px, in the app and the mockup alike (measured in Chromium). The
browser's `max-height` stays, as decision 7 chose; the mockup's dialog,
capped at the backdrop's padded height, is 6 px taller where it scrolls.

**Review:** one wave, 3 lenses (Sonnet). Failure modes 2 material (probe
placement, accepted; Firefox unverified, measured and reclassified as wording),
simplicity 0, consistency 0; wording accepted.
