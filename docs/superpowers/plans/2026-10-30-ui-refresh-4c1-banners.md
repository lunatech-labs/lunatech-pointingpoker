# UI Refresh Step 4c1-banners: The Banners' Look and Place, Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Draw the room page's three banners (lost, moved, restarted) under the header as message panels, with a shared `Message` component, while the lobby keeps its legacy `Alerts`.

**Architecture:**
- `Message.tsx` draws one panel; `message.css` takes the `.message` rules from `looks.css`. `IssuePanel` uses it first, then `RoomPage`.
- `App` keeps the flags and passes them to `RoomPage`, which draws the Messages section between the header and `main`. `Alerts` renders only on the lobby.
- Dismiss focuses `RoomHeader`'s `h1`, reached through a ref `RoomPage` owns.

**Tech Stack:** React 19, TypeScript, plain CSS, lucide-react; Playwright (Chromium and Firefox) for the cases.

**Spec:** `docs/superpowers/specs/2026-10-30-ui-refresh-4c1-banners-design.md`, building 3b3's decisions 2 to 6 (`docs/superpowers/specs/2026-10-16-ui-refresh-3b3-issue-editor-and-messages-design.md`).

## How this plan was verified

- **Checked in the code:**
  - `looks.css` reaches the page through `base.css`'s `@import`; each component imports its own sheet (`import './room-page.css'`). The token gate reads every `.css` under `frontend/src`, so it checks `message.css` with no change.
  - `looks.css` holds the `.message` rules as one run: `.message`, its forced-colours block, `.message p`, `.message .button-quiet`, `.message-problem`, `.message-notice`, `.message-notice svg`.
  - `room.html` draws `section.room-page-banners[aria-label="Messages"]` holding `div.message.message-<tone>[role]`, each an icon, a `p`, then for a notice `button.button-quiet[type=button][aria-label="Dismiss"]` holding `x`. The order is lost, moved, restarted. `icons.js` already holds `triangle-alert`, `info` and `x`.
  - `room-page.css` pads `.room-page-banners` with `var(--panel-gap) var(--page-edge) 0`. Its phone query gives `.room-page-main` `padding-inline: var(--space-3)`, which is 0.75rem against `--page-edge`'s 1.25rem: the spec's 8 px.
  - The issue panel is a `section` with no name, in `IssuePanel.tsx` and in both of `room.html`'s views (`issueBlock`). No case reads a region by a name "Issue" would match.
  - The case's copy step already declares `boxes` (the hint's JSON for a message), so the new read takes another name.
  - 'no page scrolls sideways' loads both pages with `?moved=1&restarted=1` and ends, at 320 only, with the copy on Alice's page. `alice.cut()` then `connectionLost` is the route of `room.spec.js`'s reconnect cases.
  - `RoomHeader` is rendered by `RoomPage` alone, and no unit test renders either.
  - `ui-reference.md`'s log has no 4c1-wide entry; the new one follows 4c1-editor's.

## Rulings this plan makes, for the user's review

- **R1. Task 1 extracts `Message` with `tone` and `children` only.** `role` and `onDismiss` join in Task 2, beside their first user and its cases. Set aside: the whole interface in Task 1, two props no case reaches there.
- **R2. The mockups' `message.css` links and the Mockups line move in Task 1**, with the rules, so no commit leaves the mockups' panels unstyled. The spec's other docs' changes go in Task 2. Set aside: every doc in Task 2, as the spec's "Branches and commits" reads.
- **R3. `RoomHeader` takes `idRef: RefObject<HTMLHeadingElement | null>`**, which `RoomPage` owns, as `IssueEditor` takes `boxRef` (spec decision 4's open choice). Set aside: `RoomPage` querying the header's markup.
- **R4. `App` renders the legacy wrapper (`Alerts`, `Lobby`) while the snapshot is null, else `RoomPage`: one ternary.** Set aside: the wrapper always rendered, an empty Bootstrap `container` above the room page.
- **R5. Decision 3's rule is `.room-page-banners { padding-inline: var(--space-3) }`**, in the phone query after `.room-page-main`.
- **R6. The layout case reads the issue panel through `fixtures.js`'s `issuePanel`**, the region "Issue" (spec decision 5). Set aside: `issueText(page).locator('../..')`, a read of the markup's nesting.
- **R7. The edges compare through `moved(…, ['x', 'width'])`**, half a pixel's tolerance. The order compares the three panels' `y`. Set aside: a child locator on the region, structure the contract does not read.

## Global Constraints

**Branch and commits:**
- Branch `20260930.ui_refresh_4c1_banners`, stacked on `20260930.ui_refresh_4c1_editor` (#474). New commits only: no amend, rebase or force-push, and nothing pushed until the user asks.
- Commit subjects, verbatim:
  - Task 0: `docs: approve and plan the banners (ui refresh step 4c1-banners)`
  - Task 1: `refactor: extract the message panel into Message (ui refresh step 4c1-banners)`
  - Task 2: `feat: draw the room page's banners under the header (ui refresh step 4c1-banners)`
- No "Generated with Claude Code" or co-author line.

**Code:**
- Comments are one or two lines, with no em dash. No semicolons, single quotes, two-space indent, lines under about 100 characters.
- The banners' words are `Alerts.tsx`'s and `App`'s lost text, verbatim. `Alerts.tsx` is unchanged.
- No Bootstrap class in `Message.tsx` or `RoomPage.tsx`.
- Existing cases only gain checks; the spec's one contract change is the region "Issue", an addition.

**Mutations:** apply each mutation, run the case, see it FAIL on the named assertion, then revert it with `git checkout -- <file>` before the next one. The task's report lists each mutation and its failing line. If a case passes under its mutation, **stop and report**: the case goes back to the spec.

**Running:**
- Unit: `npm run test:unit`.
- Checks: `npm run typecheck && npm run lint`.
- Browser: `npm run build && npx playwright test e2e/<file> -g "<title>" --workers=1`, adding `--project=chromium` for `layout.spec.js`. The default worker count ran the workstation out of memory on 2026-10-28.

## Review Focus

- A lost banner arriving on a scrolled phone page: scroll anchoring keeps it above the view (3b1 decision 3), with no case.
- R5's rule written outside the phone query: the wide page shows banners 8 px past the panels, by eye only (spec, Contract).
- The editor's two panels after the move to `message.css`: no case reads their look, so the reviewer compares `room.html?message=conflict,save-failed` before and after Task 1.
- Dismiss within 2 s of Copy link on the phone: focus stays on the page, the hint hiding the `h1` (spec, Accepted costs).
- A screen reader hearing the lost alert as its section mounts with it: a `role="alert"` inserted with its parent, untested (3b3).

---

### Task 0: Approve the spec and commit the plan

- [ ] **Step 1:** The spec's Status line already reads `Status: Approved`. Commit it with this plan.

```bash
git add docs/superpowers/specs/2026-10-30-ui-refresh-4c1-banners-design.md docs/superpowers/plans/2026-10-30-ui-refresh-4c1-banners.md
git commit -m "docs: approve and plan the banners (ui refresh step 4c1-banners)"
```

### Task 1: `Message` and `message.css`

Judged by the existing cases unchanged; no case is written.

**Files:**
- Create: `frontend/src/components/Message.tsx`, `frontend/src/components/message.css`
- Modify: `frontend/src/components/looks.css`, `frontend/src/components/IssuePanel.tsx`, `docs/design/room.html`, `docs/design/lobby.html`, `docs/design/ui-reference.md`

**Interfaces:**
- Produces: `export function Message({ tone, children }: { tone: 'problem' | 'notice'; children: ReactNode })`, rendering `div.message.message-<tone>` holding `<TriangleAlert />` (problem) or `<Info />` (notice), then `<p>{children}</p>`.

- [ ] **Step 1: Move the `.message` run** (verified above) from `looks.css` to the new `message.css`, unchanged and in order. `Message.tsx` starts with `import './message.css'`.
- [ ] **Step 2: Write `Message`** per the Interfaces block, with a one-line header comment naming 3b3's message panel.
- [ ] **Step 3: Use it in `IssuePanel`'s status region.** The failure becomes `<Message tone="problem">Could not save the issue</Message>`. The notice becomes a `Message tone="notice"` whose children are today's `p` contents, Use theirs button included. Drop `Info` and `TriangleAlert` from its lucide import.
- [ ] **Step 4: The mockups (R2).** In `room.html` and `lobby.html`, link `../../frontend/src/components/message.css` on the line after `looks.css`. In `ui-reference.md`'s Mockups section, "the value source, `looks.css` and their area files" becomes "the value source, `looks.css`, `message.css` and their area files".
- [ ] **Step 5: Run** `npm run test:unit && npm run typecheck && npm run lint`, then `room.spec.js` and `refusal.spec.js` whole in both browsers. Expected: PASS, no case changed.
- [ ] **Step 6: Commit** the files listed above with Task 1's subject.

### Task 2: The banners under the header

**Files:**
- Modify: `frontend/src/components/Message.tsx`, `RoomHeader.tsx`, `RoomPage.tsx`, `App.tsx`, `IssuePanel.tsx`, `room-page.css` (all under `frontend/src/components/`)
- Modify: `docs/design/room.html`, `docs/design/ui-reference.md`, `docs/known-issues.md`
- Test: `e2e/fixtures.js`, `e2e/layout.spec.js`, `e2e/room.spec.js`

**Interfaces:**
- Consumes: Task 1's `Message`.
- Produces:
  - `Message` gains `role?: 'alert' | 'status'` on its `div`, and `onDismiss?: () => void`. Given `onDismiss`, it ends with `button.button-quiet[type=button][aria-label="Dismiss"]` holding `<X />`.
  - `RoomHeader` gains `idRef: RefObject<HTMLHeadingElement | null>` (R3). Its `h1` takes `ref={idRef}` and `tabIndex={-1}`.
  - `RoomPage` gains `lost: boolean`, `moved: boolean`, `restarted: boolean`, `onDismissMoved: () => void`, `onDismissRestarted: () => void`.
  - `fixtures.js` gains `export const messages = page => page.getByRole('region', { name: 'Messages' })`, beside `movedBanner`, and `export const issuePanel = page => page.getByRole('region', { name: 'Issue' })`, beside `issueText`, each with a one-line comment.

- [ ] **Step 1: Add `messages` and `issuePanel`** to `fixtures.js`.
- [ ] **Step 2: Grow 'no page scrolls sideways'** in `layout.spec.js`. Import `connectionLost`, `issuePanel` and `messages` (R6). At the case's end, after the copy's checks:

```js
// Left cut: a restore could reload onto ?restarted=1, and cleanStub restores at teardown.
await alice.cut()
await expect(connectionLost(page), 'the lost banner').toBeVisible()
const shown = (await readBoxes(page, {
  header: page.getByRole('banner'), region: messages(page), issue: issuePanel(page),
  lost: connectionLost(page), old: movedBanner(page), back: restartNotice(page)
})).boxes
const { header, region, issue, lost, old, back } = shown
expect(lost.y < old.y && old.y < back.y, 'the panels read lost, moved, restarted').toBe(true)
const below = header.y + header.height - 0.5
expect(region.y, 'the region below the header').toBeGreaterThanOrEqual(below)
const bottom = region.y + region.height
expect(bottom, 'the region above the issue panel').toBeLessThanOrEqual(issue.y + 0.5)
const sides = moved({ lost: issue, old: issue, back: issue }, { lost, old, back }, ['x', 'width'])
expect(sides, "each panel on the issue panel's edges").toEqual([])
expect(await sideways(page), 'no sideways scroll with all three shown').toBeLessThanOrEqual(0)
```

- [ ] **Step 3: Write the Dismiss case** at the end of `room.spec.js`, importing `messages` and `movedBanner`:

```js
test('Dismiss focuses the room id, and the Messages section leaves with the last notice', async ({
  join,
  room
}) => {
  const { page } = await join('Alice')
  await page.goto(`/${room}?moved=1&restarted=1`)
  await expect(inRoom(page)).toBeVisible()
  const id = page.getByRole('heading', { name: room, exact: true })
  await movedBanner(page).getByRole('button', { name: 'Dismiss' }).click()
  await expect(movedBanner(page)).toHaveCount(0)
  await expect(id).toBeFocused()
  await restartNotice(page).getByRole('button', { name: 'Dismiss' }).click()
  await expect(restartNotice(page)).toHaveCount(0)
  await expect(id).toBeFocused()
  await expect(messages(page)).toHaveCount(0)
})
```

- [ ] **Step 4: Run both cases.** Expected: FAIL. The layout case waits in `readBoxes` for the regions "Messages" and "Issue" until the test's timeout. The Dismiss case presses the legacy Dismiss above the header and fails on the first `toBeFocused`.
- [ ] **Step 5: Implement**:
  - `Message`: the Interfaces block's `role` and `onDismiss`.
  - `RoomHeader`: R3.
  - `RoomPage`: own `const id = useRef<HTMLHeadingElement>(null)` and pass it as `idRef`. A Dismiss calls `id.current?.focus()`, then its handler. Between `RoomHeader` and `main`, while `lost || moved || restarted`, render `section.room-page-banners` with `aria-label="Messages"`, holding, in order:
    - lost: `tone="problem"`, `role="alert"`;
    - moved: `tone="notice"`, `role="status"`, with Dismiss;
    - restarted: the same.
  - `App`: R4. Pass `lost={room.lost}`, the two flags and the two dismiss setters to `RoomPage`. The return's comment becomes one line: the lobby keeps today's markup, fenced from `base.css`'s reset, until 4c2.
  - `room-page.css`: R5, with the comment `/* 4c1-banners decision 3: the banners take the column's edges, as the header does */`.
  - `IssuePanel`'s `section` and both of `room.html`'s issue `section`s take `aria-label="Issue"` (spec decision 5).
- [ ] **Step 6: Run** both cases, then `room.spec.js`, `refusal.spec.js` and `slug.spec.js` whole in both browsers, `layout.spec.js` whole in Chromium, then `npm run typecheck && npm run lint`. Expected: PASS.
- [ ] **Step 7: Mutations.** The layout case, in Chromium:
  - The section before `RoomHeader` in `RoomPage`: "the region below the header" fails.
  - The section after `main`: "the region above the issue panel" fails.
  - The lost `Message` after the notices: the order check fails.
  - R5's rule dropped: the edges check fails.

  The Dismiss case, in Chromium:
  - The `focus()` call dropped: the first `toBeFocused` fails.
  - `tabIndex={-1}` dropped: the first `toBeFocused` fails.
  - The section rendered whatever the flags: `messages` `toHaveCount(0)` fails.
- [ ] **Step 8: The docs' changes** (spec, "The docs' changes"):
  - `ui-reference.md`, J11's cap bullet: "in the phone layout the header shares the column's edges" becomes "in the phone layout the header and the banners share the column's edges".
  - `ui-reference.md`, Contract reads: "The banners' region "Messages" waits for 4c1-banners." becomes "Step 4c1-banners made the banners' region "Messages" and named the issue panel the region "Issue"."
  - `ui-reference.md`, the log, after 4c1-editor's entry:

```markdown
- **4c1-banners.** The banners (the UI refresh design's step 4c1-banners) drew
  the message panel as one component, `Message`, its rules moved from
  `looks.css` to `message.css`, so each component's prefix names its file and
  `Figure` stays the one exception. In the phone layout the banners take the
  column's edges, `--space-3`, as the panels and the header do. The issue
  panel became the region "Issue", as the table and the round bar are. Set
  aside: `.message` left in `looks.css`; `--page-edge` on the phone, which
  lines the banners up with nothing; the issue panel named by its heading,
  which changes each round.
```

  - `known-issues.md`: the title becomes "On a phone, the lobby and its banners now lay out at the phone's width, unchecked". Where: the viewport meta, and the lobby and its banners in `App`'s `legacy-page` wrapper. Issue: the first two sentences stay (the viewport meta since 4c1-wide, and `phone.spec.js`'s pin); the rest becomes: the lobby and its banners, still Bootstrap's look inside the fence, lay out at the phone's width too. The room page's banners are pinned at 320 px by 'no page scrolls sideways, 320 by 640' (`e2e/layout.spec.js`), and the editing view is drawn since 4c1-editor. 'an old UUID link opens its derived room under a banner that covers no card' (`e2e/slug.spec.js`) shows a lobby banner at 390 px, and no hand test has seen them there. Resolution unchanged.
- [ ] **Step 9: Run** `npm run test:unit && npm run typecheck && npm run lint`, then `npm run build && npx playwright test --workers=2`. Expected: PASS.
- [ ] **Step 10: Commit** the files listed above with Task 2's subject.
