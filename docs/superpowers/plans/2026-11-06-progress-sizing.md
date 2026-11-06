# Progress Sizing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** After the hand test, the progress panel's text follows the table's scale and its bar is taller, with every segment the same length.

**Architecture:** The bar's marks become outlines inside the segment, and its sizes become tokens. `useFitEntries` copies the settled table scale to `--table-scale` on `.room-page-column`; `progress.css` clamps the panel's text of it.

**Tech Stack:** CSS, React 19 + TypeScript 5.9, Playwright (Chromium and Firefox).

**Spec:** `docs/superpowers/specs/2026-11-06-progress-design.md`, decisions 15 to 17; it amends the built `2026-11-06-progress.md` plan's work.

## Global Constraints

- Component CSS takes no px (the gate's `literalProblems`) and, by convention, no literal rem: lengths are tokens.
- Bar: `--progress-bar` 1 rem, `--progress-bar-narrow` 0.75 rem on the phone, `--progress-band` `max(2px, 0.25rem)`; dashes `--line-mark`.
- Names: `clamp(--text-md, --text-md × --table-scale, --text-lg)`; count: `clamp(--text-lg, --text-lg × --table-scale, --text-xl)`; 1 where no scale is written.
- Frame and dashes are outlines with `outline-offset` of minus their own width, never borders.
- The table's fit never reads the panel.
- Browser cases run through `npm run e2e` (`pree2e` builds and stages the app).
- Comments: one or two lines each. Never list counts of commits, edits or items in docs.

## Rulings

1. **The scale's name is read from `--s` on the list after the settled `fits` call**, not recomputed. The alternative, `largestFit`'s return value, is the same number but `fits` is called with it last, so the list's value is already the settled one.
2. **One custom property for the names' size.** `.progress` declares `--progress-name` (the names' clamp); the line's font-size and the held height of `.progress-lines` both read it. The alternative, repeating the clamp, lets the two drift.
3. **The phone's narrow bar uses the existing `@container page (width < 51.75rem)` query**, as `round-panel.css` does, not a new breakpoint.
4. **The mockup follows in the same task as the hook** (the spec's Docs list), since both copy `--table-scale`.

## Review Focus

- A wide window shrunk to the phone: the names and count return to their least sizes, no stale `--table-scale` (the follow case, Task 2).
- The scale at its cap in the wide layout: the panel's content still fits the slot (Task 2).
- A root larger than 16 px (1280 by 1000, about 18.5 px): segments still equal and the bar's frame still drawn (Task 1).
- A kept and a no-vote segment in one bar: same length as a voted one (Task 1).

---

### Task 1: The bar

**Files:**
- Modify: `frontend/src/tokens.css`, `frontend/src/components/progress.css`, `docs/design/ui-reference.md`, `e2e/progress.spec.js`

**Interfaces:**
- Produces: tokens `--progress-bar` (1rem), `--progress-bar-narrow` (0.75rem), `--progress-band` (`max(2px, 0.25rem)`).

- [ ] **Step 1: Write the failing case** in `progress.spec.js`, both browsers, 1280 by 800 (a sibling of 'the Progress region through a first round…'): 'every segment of the bar has the same width'. Alice and Bob's page, protocol voters, one Re-vote so the bar holds voted, kept and no-vote segments. Assert, from `.progress-bar > span` rects, that max width minus min width is at most 0.5 px; that each `.progress-segment-kept` and `.progress-segment-none` has `outline-offset` equal to minus its `outline-width` (computed style) and `border-top-width` `0px`; and that the bar's height is 1 rem, read from the root's `font-size`. Repeat the width assertion at 1280 by 1000 (root about 18.5 px).
- [ ] **Step 2: Run it to see it fail.** `npm run e2e -- progress -g "same width"` — FAIL on width (borders widen the kept and no-vote segments).
- [ ] **Step 3: Tokens.** In `tokens.css`, set `--progress-bar: 1rem` and `--progress-band: max(2px, 0.25rem)`, add `--progress-bar-narrow: 0.75rem`, each with a one-line comment; `--line-mark`'s comment names the bar's dashes.
- [ ] **Step 4: `progress.css`.** The kept segment: `outline: var(--progress-band) solid var(--card-back); outline-offset: calc(-1 * var(--progress-band))`. The no-vote segment: `outline: var(--line-mark) dashed var(--mute-soft); outline-offset: calc(-1 * var(--line-mark))`. Drop both borders and `box-sizing`. Inside `@container page (width < 51.75rem)`, `.progress-bar` is `--progress-bar-narrow` tall.
- [ ] **Step 5: Run it to see it pass,** then `npm run test:unit` (the token gates).
- [ ] **Step 6: Docs.** `ui-reference.md`'s Layout Tokens row ("from the progress step, its bar's height and band") gains "and the phone's narrower bar". Check the citations this task touched.
- [ ] **Step 7: Prove it can fail.** Put `border: var(--progress-band) solid` back on the kept segment: the width case goes red in both browsers; revert. Drop `outline-offset` from the no-vote segment: the offset assertion goes red; revert.
- [ ] **Step 8: Run everything.** `npm run typecheck && npm run lint && npm run test:unit && npm run e2e` — all pass.
- [ ] **Step 9: Commit.** `fix: draw the progress bar's marks inside every segment`

### Task 2: The panel follows the table

**Files:**
- Modify: `frontend/src/components/useFitEntries.ts`, `frontend/src/components/progress.css`, `docs/design/room.html`, `e2e/progress.spec.js`

**Interfaces:**
- Produces: `--table-scale` on `.room-page-column`, the table's settled scale (a unitless number); absent on the phone.
- Consumes: Task 1's bar (unchanged).

- [ ] **Step 1: Write the failing follow case** in `progress.spec.js`, both browsers: 'the panel's text follows the table's scale'. A facilitator with enough voters for a middle-layout window (51.75 to 65.75 rem) where the table's scale lies above 1 and below 1.25. Read `--table-scale` from `.room-page-column` and assert that range first, choosing the window's height per browser if their fonts differ. Then assert `font-size` of `.progress-line` equals `clamp(md, md × scale, lg)` and of `.progress-count` `clamp(lg, lg × scale, xl)`, from the root's token values, within 0.5 px, and `.progress-lines`' height is two lines of the names' size plus the gap (so it follows the names, not `--text-lg`). Resize to the phone (320 wide): both read their least sizes (`--text-md`, `--text-lg`) and `.room-page-column` has no `--table-scale`. Widen back: the clamps again. Wait for sizes to settle after each resize (fonts ready, two frames, as `spare` does).
- [ ] **Step 2: Write the cap case:** 'the panel fits the slot where the scale is at its cap'. A wide window (1280 by 800) with few voters, asserting `--table-scale` at its cap (`--deck-card` ÷ `--entry-mark`) first, then that the Progress region's content height is at most the slot's (`round-slot`), about 4 px to spare at a 16 px root.
- [ ] **Step 3: Run them to see them fail.** `npm run e2e -- progress -g "follows|at its cap"` — FAIL, no `--table-scale`.
- [ ] **Step 4: `useFitEntries.ts`.** In `fitEntries`, after the settled `fits(...)` call, write `list.style.getPropertyValue('--s')` as `--table-scale` on `box.closest<HTMLElement>('.room-page-column')?.style`; in the phone branch, remove it. A one-line comment says why a copy and not `--s`.
- [ ] **Step 5: `progress.css`.** Declare `--progress-name` on `.progress`; `.progress-line` takes it as `font-size`; `.progress-count` takes `clamp(var(--text-lg), calc(var(--text-lg) * var(--table-scale, 1)), var(--text-xl))` (and `--progress-name` the same shape on `--text-md` and `--text-lg`); `.progress-lines`' `min-height` holds two lines of `--progress-name`.
- [ ] **Step 6: Run the follow and cap cases to see them pass.**
- [ ] **Step 7: Re-choose the fit cases' names.** The cases 'the phone shows the count where no name fits' (`PAIR` at 320, and `MORE`'s height-only refit), 'a voter joining drops a line from every name' (`THREE`, `FOURTH`) and 'a name written as markup is measured as text' (`MARKUP`) chose names for 20 px lines. Run them, read which premise fails, and re-choose each case's names for the size drawn there; re-measure each premise (`spare`, the toHaveText premises) in both browsers, aiming at the 5 to 15 % spare band `MORE` uses where a case states a margin, and update the comments that quote it. `MORE`'s case keeps varying only the window's height.
- [ ] **Step 8: `docs/design/room.html`.** Its `fitEntries` writes and removes `--table-scale` as the app does, on `.room-page-column` (built in the `innerHTML` template of its render function). Open it in both browsers and check the panel follows (by hand, as the spec's Not tested says of forced colours).
- [ ] **Step 9: Check the citations** in each file this branch changed, the claim as well as the symbol, and fix any stale comment they find.
- [ ] **Step 10: Run everything.** `npm run typecheck && npm run lint && npm run test:unit && npm run e2e` — all pass.
- [ ] **Step 11: Prove the cases can fail.** Each goes red, then is reverted:
  - Drop the phone branch's `removeProperty`: the follow case's phone read.
  - Write the copy on the list instead of the column: the follow case.
  - Set `--progress-bar: 1.5rem`: the cap case (the panel outgrows the slot).
  - Hold the lines' height at `--text-lg`: the follow case's held-height read, where the scale is below the cap.
  - Drop the `ResizeObserver` from `useFitLine`: `MORE`'s height-only refit at 1000 tall.
  - Restore each fit case's old names: that case's premise.
- [ ] **Step 12: Commit.** `feat: size the progress panel's text by the table's scale`

### Task 3: Tighten the sizing cases

The final review's minors, folded into this branch. Test-only: no app or docs change.

**Files:**
- Modify: `e2e/progress.spec.js`

**Interfaces:**
- Consumes: Task 1's width case, Task 2's cap case and `panelSizes`, the phone case's slot read.

- [ ] **Step 1: Shared helpers, no behaviour change.** In `progress.spec.js`, `settle(page)` awaits the fonts and two frames; `spare`, the phone case's slot read and `panelSizes` call it instead of waiting inside their own `evaluate`. `slotFit(page)` returns the Progress region's slot height, content height (as the phone case measures them) and the drawn bar's height, with the root's font size; the phone case and the cap case both use it. `npm run e2e -- progress` — all pass.
- [ ] **Step 2: The phone's bar.** In the phone case's 320 step, assert the bar is `--progress-bar-narrow` tall (within 0.5 px, read through `slotFit`). The phone case, not the follow case, since it already reads the slot at 320.
- [ ] **Step 3: Marks at the larger root.** The width case checks the marks at 1000 as at 800 (a drawn outline, its offset within 0.5 px of minus its width, no border), through one local check used at both heights.
- [ ] **Step 4: Run them to see them pass.** `npm run e2e -- progress` — all pass.
- [ ] **Step 5: Prove they can fail.** Each goes red, then is reverted:
  - Delete the `@container page (width < 51.75rem)` rule in `progress.css`: the phone case's bar read.
  - Drop `outline-offset` from the no-vote segment, with the 800 marks check cut for the run: the 1000 marks check.
  - `--progress-bar: 1.5rem`: the cap case's full-height read, through `slotFit`.
- [ ] **Step 6: Run everything.** `npm run typecheck && npm run lint && npm run test:unit && npm run e2e` — all pass.
- [ ] **Step 7: Commit.** `test: tighten the progress panel's sizing cases`; then a re-review of this commit only (one `reviewer` subagent), and the push waits for the user's OK.

## Self-review

- Spec coverage: decision 15 (hook, clamps, held height, fit cases, follow and cap cases, mockup) → Task 2; decisions 16 and 17 (outlines, tokens, narrow bar, equal widths, tokens row) → Task 1. The spec's accepted 19-voter figure needs no code. Task 3 closes the final review's minors (Review Focus 3's frame at 1000, the phone's bar, duplicated test code). The spec's remaining Docs and Contract lines were built with the earlier plan.
