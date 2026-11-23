# Clickable Link Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A link issue is a link, opening in a new tab, wherever the issue is shown.

**Architecture:** One predicate, `isLinkIssue`, moves out of `shortForm`; one wrapper component, `IssueLink`, puts its children in an `<a>` for a link issue and returns them alone otherwise. Each of the five places in spec decision 2 wraps its own rendering in it. The Next issue dialog's sending state keeps the submitted `{ issue, position }` instead of the legend's text, so the legend's text and link are derived together at render.

**Tech Stack:** React 19 + TypeScript (Vite), Vitest for pure logic, Playwright e2e in Chromium and Firefox.

**Spec:** `docs/superpowers/specs/2026-11-23-clickable-link-design.md`

## Global Constraints

- Link issue: trimmed, one `http://` or `https://` URL, any case, no space (spec, Terms).
- Every link: `href` = the full trimmed issue, `target="_blank"`, `rel="noopener noreferrer"` (decision 3).
- Look: ink and underlined, no icon (decision 4); the existing `a` and `.issue-panel-view h2 a` rules give that, so no CSS changes. If a place does not look as `docs/design/room.html` draws it, stop and report.
- Every e2e case runs in both browsers; a link issue in a test carries a query, so a short-form href fails.
- Code comments are one or two lines.
- Every new or changed test is proven able to fail: break the mechanism it names, see it red, revert, then `npm run build` before any manual run.
- Conventional Commits; no Claude Code attribution line.

## Rulings

Choices the spec left to the plan, each with the simpler alternative.

1. **The sending state's field shape.** One field, `legend: Legend` with `export type Legend = { issue: string; position: number }`, on the `sending` state and the `submit` event; `shows()` returns `legend: Legend | null`. Simpler alternative: two flat fields `issue` and `position`. Rejected: `shows()` would return two fields that are null together.
2. **The predicate's name and home.** `isLinkIssue(issue: string): boolean` in `frontend/src/room/history.ts`, named after the spec's Term. Simpler alternative: the regex inlined at each caller, which decision 1 rules out.
3. **The heading's segments apply to a link issue only**, as the mockup's `isLink(issue) ? segments : issue` draws it. Simpler alternative: keep today's prefix test, which also segments "https://… and words": that text would then be segmented but not a link, two rules for one kind. Consequence: such a text heading wraps as ordinary text.
4. **"Opens in a new tab" is checked by attributes**: `href`, `target`, `rel`, with no click. Simpler alternative: none; a click would load an outside host and test the browser, not the page.
5. **The text issue gets one short case per place**, with `T = 'PP-1234 Fix the login form'`, each in the task that makes that place a link. The history row is already covered by the front-cut case's text row. Simpler alternative: one case walking all five places. Rejected by the test budget: one behaviour per case unless a costly setup earns sharing, and these setups are a join and a step or two.
6. **The row gap check** lives in `a link row keeps its end, a text row its start`: rows `nth(1)` and `nth(2)` are neighbouring links. Focus the first and press Tab, since a script's `focus()` after a mouse click may not show the ring (precondition: the second matches `:focus-visible`), read its computed `outline-width` and `outline-offset`, and assert the second's top minus the first's bottom is at least their sum.

## Review Focus

Inputs the spec implies that no task's tests exercise. Per the lean test budget, these are flagged for the user rather than given tests:

1. A link issue ending in `/` or with no path (`https://example.com?x=1`): the heading's segments should still read the whole URL. The segment code splits on `/` and is unchanged apart from trimming.
2. Tab order in the Next issue dialog: the legend's link now comes before the chips. The field takes focus on opening, as before. Expected: Tab from the field goes on to the buttons, and Shift+Tab reaches the chips, then the link.
3. A press on the legend's link while the dialog is open: it should open a tab and leave the dialog, its draft and its choice as they were. `pressRules` touches only buttons.
4. A link issue that is right-to-left text after the host: the row's `<bdi dir="ltr">` is unchanged, as in the round history spec.
5. An issue changed to a link while the dialog is open (not sending): the legend reads the live `{ issue, position }`, so it becomes a link at once.

---

### Task 1: Predicate, wrapper and history rows

**Files:**
- Modify: `frontend/src/room/history.ts`, `frontend/src/room/history.test.ts`
- Create: `frontend/src/components/IssueLink.tsx`
- Modify: `frontend/src/components/RoundHistory.tsx` (`Row`)
- Test: `e2e/history.spec.js` (`a link row keeps its end, a text row its start`)

**Interfaces:**
- Produces: `isLinkIssue(issue: string): boolean` from `frontend/src/room/history.ts`; `IssueLink({ issue, className, children }: { issue: string; className?: string; children: ReactNode })` from `frontend/src/components/IssueLink.tsx`.

- [ ] **Step 1: Add the two short form scenarios.** In `shortForm`'s `it.each`: `['ftp scheme', 'ftp://example.com/a', 1, 'text', 'ftp://example.com/a']` and `['javascript scheme', 'javascript:alert(1)', 1, 'text', 'javascript:alert(1)']`. Run `npm run test:unit -- history`: expected PASS (today's regex already rejects both). Prove they can fail: temporarily widen the regex to `/^\S+:\S+$/`, see both red, revert.
- [ ] **Step 2: Extract `isLinkIssue`** in `history.ts`: it trims and tests `/^https?:\/\/\S+$/i`; `shortForm` calls it. Run the unit tests: PASS.
- [ ] **Step 3: Extend the e2e case.** In `a link row keeps its end, a text row its start`: the long link row's first child is an `a` whose `href` attribute is `jira` in full, query included; the short link row's first child is an `a` too; the text row's (`nth(3)`) is not an `a`. Add ruling 6's gap check. Run `npm run e2e -- e2e/history.spec.js -g "a link row keeps"`: expected FAIL (the cell is a `span`).
- [ ] **Step 4: Write `IssueLink`** per spec decision 3 and the Global Constraints, with no CSS file. In `Row`, the link branch becomes `<IssueLink issue={entry.issue} className="round-history-issue round-history-link"><bdi dir="ltr">{short.text}</bdi></IssueLink>`; the text branch is unchanged, and the list keeps its `tabIndex={0}` (decision 7). Run the case: PASS in both browsers, with the existing front-cut assertions still green.
- [ ] **Step 5: Prove it.** Each mutation, separately, turns the case red: the href set to `short.text`; the link branch wrapping a `span` around the `a`; `.round-history li { height: 24px }`. Revert each, then `npm run build`.
- [ ] **Step 6:** `npm run typecheck && npm run lint && npm run test:unit`, all green. Commit `feat: make a history row's link issue a link`.

### Task 2: The issue panel's heading and conflict notice

**Files:**
- Modify: `frontend/src/components/IssuePanel.tsx` (`segments`, the heading, the conflict notice)
- Test: `e2e/room.spec.js`

**Interfaces:**
- Consumes: `isLinkIssue`, `IssueLink` from Task 1.

- [ ] **Step 1: New e2e case** `a link issue's heading links the whole issue in a new tab`: set the issue to `'  HTTPS://acme.atlassian.net/browse/PP-1240?atlOrigin=eyJpIjoi  '`. The heading's one link has `href` `HTTPS://acme.atlassian.net/browse/PP-1240?atlOrigin=eyJpIjoi`, `target` `_blank` and `rel` `noopener noreferrer`, and its `.issue-panel-seg` texts are `['HTTPS://acme.atlassian.net', '/browse', '/PP-1240?atlOrigin=eyJpIjoi']`.
- [ ] **Step 2: Change the conflict case** `a concurrent change shows the notice, and Use theirs takes it`: Bob sets `https://github.com/acme/web/issues/412?tab=comments`. The notice contains `Changed by someone else to: "‹that URL›"`, checked with `toContainText` and a plain string (the case's regex would read the URL's `?` and `.` as syntax), and its link's text and `href` are the bare URL. Use theirs puts the URL in the box. Add ruling 5's `the heading of a text issue holds no link` (Alice sets `T`; the heading holds no link) and `the conflict notice of a text issue holds no link` (Alice edits with `mine`, Bob sets `T`; the notice shows, holding no link). Run the four cases: expected the two link cases FAIL and the two text cases PASS, proven in Step 4.
- [ ] **Step 3: Implement.** `segments` returns the issue as is unless `isLinkIssue` (ruling 3), and otherwise reads the trimmed issue with the scheme matched by `/^https?:\/\//i`. Update its comment, which says "not a link yet (decision 11)". The heading wraps `segments(editor.text)` in `IssueLink`. The notice becomes `Changed by someone else to: "<IssueLink issue={editor.notice}>{editor.notice}</IssueLink>"`. Run both cases: PASS.
- [ ] **Step 4: Prove it.** Each turns a case red: a case-sensitive scheme regex in `segments`; `href={issue}` untrimmed in `IssueLink`; the notice's `IssueLink` removed; `IssueLink` always rendering an `a` (both text cases). Revert, then `npm run build`.
- [ ] **Step 5:** typecheck, lint, unit tests green. Commit `feat: make the issue panel's link issue a link`.

### Task 3: The moved-on notice

**Files:**
- Modify: `frontend/src/components/MovedOn.tsx`, `frontend/src/room/nextIssue.ts` (remove `movedOnText`), `frontend/src/room/nextIssue.test.ts` (remove its `describe`)
- Test: `e2e/next.spec.js`

**Interfaces:**
- Consumes: `IssueLink` from Task 1.

- [ ] **Step 1: Change two e2e cases.** In `an open issue editor shows the notice once the room moves on, and OK puts focus on Edit`, Bob posts `L = 'https://acme.atlassian.net/browse/PP-2?atlOrigin=eyJpIjoi'` instead of `PP-2`. The status reads `The room moved on to: "${L}" OK`; the status's link has text `L` (no quotes) and `href` `L`. The sentence still takes focus, and the heading reads `L` after OK. In `a page that finds the room moved on shows the notice`, the post moves on to `L` instead of `PP-1b`, with the same checks in `nextStatus`. After OK: `reveal(alice.page)`, open the dialog again, and Bob posts `{ round: 2, issue: '', outcome: { type: 'Skip' } }`. The status reads `The room moved on, with no issue yet OK`, with no link. Add ruling 5's `the moved-on notice of a text issue holds no link`: with the dialog open, Bob (Facilitator) posts `{ round: 1, issue: T, outcome: { type: 'Skip' } }`; the status reads `The room moved on to: "${T}" OK` and holds no link. Run the three: expected the two changed cases FAIL and the new one PASS, proven in Step 3.
- [ ] **Step 2: Implement.** `MovedOn`'s focusable span holds `The room moved on to: "<IssueLink issue={issue}>{issue}</IssueLink>"` for a non-empty issue, and `The room moved on, with no issue yet` otherwise. Delete `movedOnText` and its two unit cases. Run both cases and the unit tests: PASS.
- [ ] **Step 3: Prove it.** Each turns a case red: the quotes moved inside `IssueLink`; `IssueLink` removed from `MovedOn`; `IssueLink` always rendering an `a` (the text case). Revert, then `npm run build`.
- [ ] **Step 4:** typecheck, lint, unit tests green. Commit `feat: make the moved-on notice's link issue a link`.

### Task 4: The legend, its sending state, and the text issue

**Files:**
- Modify: `frontend/src/room/nextIssue.ts`, `frontend/src/room/nextIssue.test.ts`, `frontend/src/components/useNextIssue.ts` (`submit`), `frontend/src/components/NextIssueDialog.tsx`
- Test: `e2e/next.spec.js`

**Interfaces:**
- Consumes: `isLinkIssue`, `IssueLink`, `shortForm`.
- Produces: `Legend` (ruling 1); `submit(legend: Legend)` from `useNextIssue`.

- [ ] **Step 1: Reshape the unit tests** to ruling 1: the `sending` fixture's `legend` becomes `{ issue: '', position: 3 }`; each `submit` event's `legend: 'Round 3'` becomes `{ issue: '', position: 3 }` and `'PP-1'` becomes `{ issue: 'PP-1', position: 1 }`. `keeps the submitted legend while sending, in its round and the next` and `never shows moved on while sending` expect `{ issue: '', position: 3 }` with `toEqual`, not `toBe`; the `legend: null` expectations stay. Run `npm run test:unit -- nextIssue`: expected FAIL (type and value).
- [ ] **Step 2: Implement ruling 1** in `nextIssue.ts` and `useNextIssue.ts`. Run: PASS.
- [ ] **Step 3: Change the e2e case** `Next issue moves the room on`: the first move types `L = 'https://acme.atlassian.net/browse/PP-2?atlOrigin=eyJpIjoi'` instead of `PP-2`, and the loop expects the heading to read `L`. While held, `estimateRow` has the accessible name `Estimate for https://acme.atlassian.net/browse/PP-2`, and its link's `href` is `L`.
- [ ] **Step 4: New e2e case** `the legend of a text issue holds no link` (ruling 5): Alice sets `T`, reveals and opens the dialog; `estimateRow` is named `Estimate for ${T}` and holds no link. Run both e2e cases: expected the first FAIL and the second PASS.
- [ ] **Step 5: Implement the dialog.** `const legend = next.legend ?? { issue, position }` and `short = shortForm(legend.issue, legend.position)`. The legend renders `Estimate for <IssueLink issue={legend.issue}><bdi className="next-form-issue">{short.text}</bdi></IssueLink>`, and both submit calls pass `legend`. Run both cases: PASS.
- [ ] **Step 6: Prove it.** Each turns a case red: the legend's `IssueLink` given the live `issue` prop (`Next issue moves the room on`); `IssueLink` always rendering an `a` (`the legend of a text issue holds no link`). Revert, then `npm run build`.
- [ ] **Step 7:** typecheck, lint, unit tests and the full e2e suite green. Commit `feat: make the Next issue dialog's legend a link`.

### Finish

- [ ] Re-check citations in every file the branch changed (`git diff --name-only main...HEAD`): each cited decision, section and case name says what the citing text claims (repo CLAUDE.md lesson). Commit any fix as `docs: correct citations for the clickable link`.
