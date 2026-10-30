# UI Refresh Step 4c1-narrow-cases: The Narrow Layouts' Cases, Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Pin step 4's layout guarantees in the middle layout, the phone layout, at 320 px and across a width crossing, with no product change, and restate the parent rules that drifted.

**Architecture:**
- Four new cases in `e2e/layout.spec.js`, beside its helpers: a middle journey, a phone journey ending in the crossing, and the sideways case at two sizes.
- They sit in one `describe` skipped outside Chromium, each size its own inner `describe` with `test.use({ viewport })`.
- Each assertion is shown to fail by the spec's mutation, applied by hand and reverted.

**Tech Stack:** Playwright with Chromium; React 19 and plain CSS under test.

**Spec:** `docs/superpowers/specs/2026-10-30-ui-refresh-4c1-narrow-cases-design.md`. Its parent: `docs/superpowers/specs/2026-09-30-ui-refresh-design.md`.

## How this plan was verified

- **Checked in the code:**
  - A Re-vote keeps every value, unconfirmed (`Room.scala`, `reVote()`), and the page's tally counts any estimation (`view.ts`, `applySnapshot`). So the spec's first stop 5, a reveal after a Re-vote, showed the old result; the spec now reveals the fresh round first (Task 0).
  - The compact slot's height is `.round-panel-slot`'s `height: max(…)` in `round-panel.css`'s `@container page (width < 65.75rem)` block, which the phone layout inherits.
  - The table's least height is `.voters { min-height: var(--table-min) }`, and on the facilitator's page while voting `.voters-reserve`'s, in `voters.css`.
  - The phone hint is `.room-header-copy-note { grid-area: 1 / 2 }`, and the room id hides by `.room-header-copied .room-header-id { visibility: hidden }`, in `room-header.css`'s phone block.
  - `fitEntries` (`useFitEntries.ts`) removes the list's inline `--s` below 51.75 rem, so the phone's `--s` is the stylesheet's `var(--entry-scale-narrow)`, read as a computed value.
  - The roster draws the facilitators as a second `<ul>` after the voters' (`Roster.tsx`), each row an `li`, a facilitator's name carrying `data-testid="facilitator"`. The phone's "Facilitators: …" is a `<p>` after the entries' `<ul>` (`Voters.tsx`).
  - `App.tsx` reads `?moved=1&restarted=1` on load and strips it; `Alerts.tsx` draws both as `div.alert`.
  - The root is 16 px at 860 by 600, 392 by 800 and 320 by 640, so the switches sit at 828 and 1052 px.

## Rulings this plan makes, for the user's review

- **R1. The journeys' room is one helper, `journeyRoom(join, voters, count)`.** It joins Alice as a Voter and Bob as a Facilitator, then `OTHERS.slice(0, count - 1)` as protocol voters, where `OTHERS = NAMES.filter(name => name !== 'Bob')`. It waits for `count` entries on both pages. Stop 1 grows the rest with `joined.push(...(await voters(OTHERS.slice(1))))`. The simpler alternative, reusing `fill` and `grow`, cannot: both join one page and slice `NAMES`, Bob included.
- **R2. The middle's two-line issue is `TWO_LINES_MIDDLE = TWO_LINES.slice(0, 66)`**, "Rework the login page so that a returning user lands on their last", the spec's 66 characters. `setTwoLines` gains a `text` parameter defaulting to `TWO_LINES`, so the middle checks its premise and the existing cases do not change. The phone journey and the sideways case use the same text without the check, as the spec asks only for "the two-line issue" there.
- **R3. Each journey is one `test` driving both pages,** reading Alice's and Bob's pages at each stop. A failure names the case, and every `expect` carries a message naming its guarantee (spec decision 5).
- **R4. Stop 5's slot height is read on Alice's page alone,** voting against "Nobody voted". On Bob's page the stop checks "Nobody voted" shows (spec, middle stop 5).
- **R5. Stop 2's votes are 13 distinct values:** Alice votes `ESTIMATIONS[12]`, and `joined[i]` votes `ESTIMATIONS[i]` for the first 12 protocol voters. The last does not vote, so the round stays open, and Bob presses Show votes at stop 3. Set aside: `voteAllButOne`, which gives Alice `ESTIMATIONS[0]` here, a duplicate; and letting the last vote reveal the round, which is not the spec's "Bob presses Show votes".
- **R6. Stop 4 reads the roster's rows in order:** for each `li` in the `complementary` region named Participants, whether it holds a `facilitator` test id. The flags equal fourteen `false`s and one `true`. The simpler alternative, comparing Bob's row's `y` with the last voter's, passes on any drawing that puts him last by chance.
- **R7. The crossing reads through one local helper, `crossingRead(page)`.** It waits for 14 entries, scrolls to 0, and returns `readBoxes`' boxes for the header, the issue, the table, the slot and the round bar, plus the entries' list's computed `--s`, trimmed. It is compared with `moved` and `toBe`.
- **R8. The sideways case casts one vote:** Alice votes, then Bob presses Show votes, so the revealed read draws a result with a bar. A reveal with no vote would draw "Nobody voted" alone and test less.
- **R9. The 320 copy runs on Alice's page,** after the revealed read. The header is the same on both pages. The hint's text box is a `Range` over the hint's contents.
- **R10. No case beyond the spec's Contract.** The Review Focus lines are checked by the reviewer reading the code.

## Global Constraints

**Branch and commits:**
- Branch `20260930.ui_refresh_4c1_narrow_cases`, stacked on `20260930.ui_refresh_4c1_narrow_keys` (#471). The spec's first commit exists; Task 0 commits its fix.
- New commits only: no amend, rebase or force-push. Nothing is pushed until the user asks.
- Commit subjects, verbatim:
  - Task 0: `docs: reveal the fresh round first in the journeys (ui refresh step 4c1-narrow-cases)`, then `docs: plan the narrow layouts' cases (ui refresh step 4c1-narrow-cases)`
  - Task 1: `docs: state the guarantees by effective viewport, with a test budget (ui refresh step 4c1-narrow-cases)`
  - Task 2: `test(e2e): walk the middle layout's guarantees (ui refresh step 4c1-narrow-cases)`
  - Task 3: `test(e2e): walk the phone layout's guarantees and a width crossing (ui refresh step 4c1-narrow-cases)`
  - Task 4: `test(e2e): pin no sideways scroll at 320 px and at 200% (ui refresh step 4c1-narrow-cases)`
- No "Generated with Claude Code" or co-author line.

**Code:**
- No product file changes. Mutations are applied in the working tree and reverted.
- Comments are one or two lines, with no em dash. No semicolons, single quotes, two-space indent, lines under about 100 characters.
- The existing cases stay unchanged (spec decision 7); `setTwoLines`' default keeps them so.
- The new cases are plain `test`s, not `cases()`, inside `test.describe('the narrow layouts', …)`, which opens with `test.skip(({ browserName }) => browserName !== 'chromium')`.

**Mutations:** a mutation is applied, run in Chromium, seen to FAIL on the named assertion, and reverted with `git checkout -- <file>` before the next. The task's report lists each mutation and its failing line. If a case passes under its mutation, or a premise check fails: **stop and report**; the case goes back to the spec.

**Running:** `npm run build && npx playwright test e2e/layout.spec.js -g "<title>" --project=chromium --workers=1`. The default worker count ran the workstation out of memory on 2026-10-28.

## Review Focus

- A crossing below the floor, where the sheet does not pin: no case, the crossing runs at 800 tall.
- A banner shown in the middle layout: principle 4 lets the page scroll there, and no case pins that it cuts nothing.
- The facilitators' line with a long unbroken name: `reset.css` gives `p` `overflow-wrap: break-word`, untested.
- A layout break in Firefox alone: accepted (spec, Accepted costs).
- A 7-column deck's compact slot, a phone page above about 430 px: its least height goes untested (spec, Accepted costs).

---

### Task 0: Commit the spec's fix and this plan

- [ ] **Step 1: Commit**

```bash
git add docs/superpowers/specs/2026-10-30-ui-refresh-4c1-narrow-cases-design.md
git commit -m "docs: reveal the fresh round first in the journeys (ui refresh step 4c1-narrow-cases)"
git add docs/superpowers/plans/2026-10-30-ui-refresh-4c1-narrow-cases.md
git commit -m "docs: plan the narrow layouts' cases (ui refresh step 4c1-narrow-cases)"
```

### Task 1: The docs' changes

**Files:**
- Modify: `docs/superpowers/specs/2026-09-30-ui-refresh-design.md`

Each change is the spec's "The docs' changes", item by item, in the parent's style.

- [ ] **Step 1: Terms.** After "Progress", add **Desktop layout**, the wide layout from 65.75 rem, the laptop target's, and **Middle layout**, the wide layout below 65.75 rem with its compact foot, both citing 3b2's Terms for the wide and phone layouts.
- [ ] **Step 2: Principle 4's table.**
  - The first row becomes the desktop layout's: "The desktop layout at or above the height floor, …: the laptop target, a monitor, a zoomed screen". "A zoomed screen" is this plan's wording for the deleted shared-screen row, which the effective viewport folds in.
  - A new row after it: the middle layout at or above the floor, with the same issue and notice conditions. The page "never scrolls, as a goal: a step may give it up by weighing it in its spec and listing the contract change (4c1-narrow-cases decision 2)".
  - "The narrow layout, a phone among them" becomes "The phone layout".
  - The shared-screen row is deleted.
  - The lead-in's "the viewport, zoom included" gains "(the effective viewport)".
- [ ] **Step 3: Principle 5's zoom bullet** becomes, verbatim: "Browser zoom is the facilitator's own lever; a zoom gives the layout of its effective viewport (principle 4)."
- [ ] **Step 4: Principle 11**, after 10: "**A test budget** (settled 2026-10-30, 4c1-narrow-cases decision 1)." Then the rule: layout cases run in Chromium alone, and in both browsers only where they are known to differ, such as Firefox's focus scroll. One setup checks several guarantees, each still failed by its own mutation. One width stands for each layout.
- [ ] **Step 5: Step 4's guarantees.** The zoom bullet (150% and 200%) becomes decision 3's uses. Guarantees are stated by effective viewport. A laptop at 100% is 1280 by 600 to 700. A 1920 by 1080 screen is shown at 100% or 150%, about 1280 by 630 at 150%. A 4K screen is shown at 100 to 200%. Each is the desktop layout at or above the floor. At 200% of the laptop, 640 by 300, the page scrolls only vertically. Its 150% clause goes whole, the issue, the result in view and the progress part, which waits for the progress step; its 200% clause stays, as written here.
- [ ] **Step 6: The phase line.** Appendix C's "reserved by sizing" bullet ends: outside the desktop layout the reserve waits for the progress step (4c1-narrow-cases decision 4). The progress candidate among the steps after 5 gains one sentence: it adds that reserve and the phase line's cases outside the desktop layout.
- [ ] **Step 7: The steps table.** The `4c1-narrow-cases` row's "Judged by" drops "but for its listed contract changes". The `4c1-editor` row's step becomes "The issue editor's and the messages' look (J12), the field as 3b3 decision 7's wrapping `<textarea>`".
- [ ] **Step 8: Check** that `grep -n "shared screen\|170%" docs/superpowers/specs/2026-09-30-ui-refresh-design.md` shows no zoom rule left contradicting principle 4. Principle 2's target-screen list stays.
- [ ] **Step 9: Commit** the file with Task 1's subject.

### Task 2: The middle journey

**Files:**
- Modify: `e2e/layout.spec.js`

**Interfaces:**
- Produces, local to `e2e/layout.spec.js`: `OTHERS`, `TWO_LINES_MIDDLE`, `journeyRoom(join, voters, count)` resolving `{ alice, bob, joined }` (two participants and the protocol voters), `setTwoLines(page, text = TWO_LINES)`, and the outer `describe` with its skip. Tasks 3 and 4 add theirs inside that `describe`.
- Consumes: `parts`, `expectInView`, `within`, `moved`, `scrollsAndCutsNothing`, `LONG`, and from `fixtures.js` `readBoxes`, `roundSlot`, `roundBar`, `phaseLine`, `tallyEntries`, `table`, `participantEntries`, `votedMark`, `deck`, `issueText`, `setIssue`, `vote`, `ESTIMATIONS`, `NAMES`, `deck` added to the file's imports.
- Produces, also local: `nobodyVoted(alice, bob)`, Step 3's stop, which Task 3 reuses.

Case `'the middle layout, 860 by 600, on both pages'`, viewport `{ width: 860, height: 600 }`. Each step below is a stop, run in this order, both pages read unless it says otherwise.

- [ ] **Step 1: Setup.** `journeyRoom(join, voters, 2)`, then `setTwoLines(alice.page, TWO_LINES_MIDDLE)`. Every issue change on Alice's page is followed by `expect(issueText(bob.page)).toHaveText(text)`, as `setIssue` waits only on the editing page.
- [ ] **Step 2: Stop 1, a room of 2 grows to 14.** Read, on each page, the header, the issue, the round bar, and the slot (Alice) or the table (Bob). Append `await voters(OTHERS.slice(1))` to `joined` and wait for 14 entries on both. Expect `moved` empty for each page, Bob's table on `['y']` alone.
- [ ] **Step 3: Stop 5, nobody voted, as `nobodyVoted(alice, bob)`.** Read Alice's slot. Bob presses Show votes. On both pages, expect the phase line `Revealed` and the slot to contain "Nobody voted". Expect Alice's slot `moved` empty on `['height']`. Then Bob presses Re-vote, and both phase lines show `Voting`.
- [ ] **Step 4: Stop 2, voting at 14.** Votes as R5, then expect 13 voted marks on Bob's table. On each page, `readBoxes(page, parts(page, slotShown))`: `scrolls` is 0 and `expectInView` holds for every part. On Alice's page, each of the deck's 13 buttons, read as `nth(i)` in the same `readBoxes` call, lies `within` the slot's box.
- [ ] **Step 5: Stop 3, a reveal.** Bob presses Show votes, and both pages show 13 tally entries. Expect `scrolls` 0 on both, and `getByRole('button', { name: 'Show votes' })` to have count 0 on both.
- [ ] **Step 6: Stop 4, the roster** (R6), on both pages.
- [ ] **Step 7: Stop 6, `LONG`.** `setIssue(alice.page, LONG)`, Bob's issue awaited as in Step 1, then `scrollsAndCutsNothing(page, viewport, true)` on both pages; the round is revealed.
- [ ] **Step 8: Run it.** Expected: PASS in Chromium; listed as skipped with `--project=firefox`.
- [ ] **Step 9: Show each stop fails under its mutation.**
  - Stop 1: `.voters` in `voters.css` gets `flex: none; overflow: visible`.
  - Stop 2: every `@container page (width < 65.75rem)` block removed from the components' stylesheets; the deck-within-slot check fails (measured: the last card ends at 707 px, the slot at 502).
  - Stop 3: `RoundBar.tsx` renders a "Show votes" button beside Re-vote while revealed.
  - Stop 4: `Roster.tsx` draws `view.users` in one list, each with its role's end.
  - Stop 5: `.round-panel-slot`'s compact `height: max(…)` becomes `height: auto`.
  - Stop 6: `.voters`' and `.voters-reserve`'s `min-height` removed.
- [ ] **Step 10: Run the existing cases.** `npx playwright test e2e/layout.spec.js --workers=1`: everything passes, the new case in Chromium only.
- [ ] **Step 11: Commit** with Task 2's subject.

### Task 3: The phone journey and the crossing

**Files:**
- Modify: `e2e/layout.spec.js`

**Interfaces:**
- Consumes: `journeyRoom`, `nobodyVoted`, `TWO_LINES_MIDDLE`, the outer `describe` (Task 2); `moved`, `LONG`; `inRoom`, `readBoxes`, `setIssue`, `issueText`, `table`, `participantEntries`, `phaseLine`, `roundSlot`, `roundBar` from `fixtures.js`.
- Produces, local: `crossingRead(page)` resolving `{ boxes, scale }` (R7).

Case `'the phone layout, 392 by 800, on both pages, then a crossing'`, viewport `{ width: 392, height: 800 }`. Boxes are read at scroll 0.

- [ ] **Step 1: Setup.** `journeyRoom(join, voters, 14)`, then `setIssue(alice.page, TWO_LINES_MIDDLE)` and Bob's issue awaited.
- [ ] **Step 2: Stop 1, the facilitators' line.** On each page, read `table(page).getByText('Facilitators: Bob')` and the 14th entry. Expect the line's `y` at least the entry's `y + height - 0.5`.
- [ ] **Step 3: Stop 2, nobody voted.** `nobodyVoted(alice, bob)` (Task 2). No vote is cast.
- [ ] **Step 4: Stop 3, the crossing.** On Alice's page, for each of `[860, 1280, 860, 392]` at height 800: `setViewportSize`, then `const before = await crossingRead(page)`. `page.reload()`, then expect `inRoom` visible, then `const after = await crossingRead(page)`. Expect `moved(before.boxes, after.boxes)` empty and `after.scale` to be `before.scale`, each message naming the width. At 1280, after that comparison: `setIssue(page, LONG)`, Bob's issue awaited, then the same read, its `scale` expected to differ from the two-line read's (the premise), the reload and the comparison, messages naming "an issue change at 1280"; then `setIssue(page, TWO_LINES_MIDDLE)`, Bob's awaited.
- [ ] **Step 5: Run it.** Expected: PASS.
- [ ] **Step 6: Show each stop fails under its mutation.**
  - Stop 1: in `Voters.tsx`, the facilitators' `<p>` drawn before the `<ul>`.
  - Stop 2: Task 2's stop 5 mutation.
  - Stop 3, mutation 1: `useFitEntries`' `fit` calls `watched.disconnect()` after its first run. It fails at the issue change at 1280 (measured); the crossing's resizes alone pass.
  - Stop 3, mutation 3: the observer swapped for a window `resize` listener. It fails at the issue change at 1280, and `'a shorter window refits the entries'` passes (measured).
  - Stop 3, mutation 2: `fitEntries`' phone branch keeps `--s`, losing `list.style.removeProperty('--s')`. It should fail at 392.

  If the crossing fails with no mutation, the fit depends on its history: stop and report (spec).
- [ ] **Step 7: Commit** with Task 3's subject.

### Task 4: The sideways case

**Files:**
- Modify: `e2e/layout.spec.js`

**Interfaces:**
- Consumes: the outer `describe`, `TWO_LINES_MIDDLE` (Task 2); `overlap`, `moved`; `movedBanner`, `restartNotice`, `copyHint`, `participantEntry`, `inRoom`, `vote`, `setIssue`, `issueText`, `phaseLine`, `readBoxes` from `fixtures.js`, the first two added to the file's imports.
- Produces, local: `LONG_NAME = 'W'.repeat(60)`, and `sideways(page)` resolving `scrollWidth - clientWidth` of `document.documentElement` after the fonts and two frames.

One case per viewport, `{ width: 320, height: 640 }` and `{ width: 640, height: 300 }`, each in its own `describe` with `test.use`. Title: `'no page scrolls sideways, ${width} by ${height}'`.

- [ ] **Step 1: Setup.** Alice joins as a Voter, Bob as a Facilitator, and `voters([LONG_NAME])`. `setIssue(alice.page, TWO_LINES_MIDDLE)`. Both pages `goto(`/${room}?moved=1&restarted=1`)`, then expect `inRoom`, `movedBanner` and `restartNotice` visible, and `participantEntry(page, LONG_NAME)` visible, which a capped name fails.
- [ ] **Step 2: Voting, then revealed.** Expect `sideways` at most 0 on both pages. Alice votes `'13'`, and Bob presses Show votes; expect the phase line `Revealed`. Expect `sideways` at most 0 again on both.
- [ ] **Step 3: At 320 only, the copy** (R9).
  - Before: expect `getByRole('heading', { name: room, exact: true })` visible. Read the header (`getByRole('banner')`), the issue, Copy link and ☰ (`getByRole('button', { name: 'Menu' })`).
  - Click Copy link; expect `copyHint` `Link copied` and the room id heading hidden.
  - Read the same boxes, and the hint's text through a `Range`. Then expect `copyHint` still `Link copied`.
  - Expect `moved` empty, and the text's box overlapping neither Copy link nor ☰.
- [ ] **Step 4: Run it.** Expected: both PASS.
- [ ] **Step 5: Show each fails under its mutation.**
  - `.voters-name`'s `overflow-wrap: anywhere` removed: Step 2 fails, at least at 320.
  - `.alert { white-space: nowrap }` added to `looks.css`: Step 2 fails.
  - `.room-header-copy-note`'s `grid-area: 1 / 2` removed: Step 3's `moved` fails.
  - `.room-header-copied .room-header-id`'s rule removed: Step 3's hidden check fails.
  - `letter-spacing: 1em` on the phone block's `.room-header-copy-note`: Step 3's overlap check fails (measured).
- [ ] **Step 6: Run everything.** `npm run test:unit && npm run typecheck && npm run lint && npm test && npm run e2e -- --workers=1`. Expected: all pass, with no existing case changed.
- [ ] **Step 7: Commit** with Task 4's subject.
