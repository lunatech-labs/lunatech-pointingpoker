# UI Refresh Step 4c2-form: The Lobby's Page and Form, Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Draw the lobby as `docs/design/lobby.html` does (the header bar, one centred column, the panel), with 3b4's contract changes, the column at 26rem and the plain arrow, while `Alerts` keep Bootstrap's look in a fence of their own.

**Architecture:**
- `BrandLogo` draws the mark and the name, its rules moved from `looks.css` to `brand-logo.css`; `RoomHeader` and `LobbyPage` both use it.
- `LobbyPage` draws the header bar, the column, the banners' place and the panel; `LobbyForm` replaces `Lobby` and `DefaultRole`, drawing `RoomRow` and `LobbyTabs` inside the panel.
- `App` renders `LobbyPage` while the snapshot is null, passing `Alerts` as its banners; the `container legacy-page` wrapper goes.

**Tech Stack:** React 19, TypeScript, plain CSS, lucide-react; Playwright (Chromium and Firefox) for the cases.

**Spec:** `docs/superpowers/specs/2026-10-30-ui-refresh-4c2-form-design.md`, building 3b4's lobby (`docs/superpowers/specs/2026-10-19-ui-refresh-3b4-lobby-design.md`).

## How this plan was verified

- **Checked in the code:**
  - `looks.css` holds the mark's rules as `.brand-logo`, `.brand-logo svg`, `.brand-logo-name`, and a forced-colours block holding only `.brand-logo`. `room-header.css` overrides them only as `.room-header .brand-logo` and `.room-header .brand-logo-name`, so they win at any import order.
  - `RoomHeader.tsx` draws the mark inline: `span.brand-logo[aria-hidden]` holding the SVG, then `span.brand-logo-name` "Pointing Poker", as two flex children of the header.
  - `lobby.html` draws: `header.lobby-page-header > div.lobby-page-column` with the lockup; `main.lobby-page-main > div.lobby-page-column` holding the banners, then `div.panel.lobby-page-panel` (plus `lobby-page-inert` once ended). The root form's panel reads `h1.lobby-page-title[tabindex=-1]`, the rejoin row, `nav.lobby-tabs[aria-label="Create or join"]`, the Join tab's room field, the name, the roles, `button.button.button-primary`. The pinned form's reads the `h1`, the badge, the name, the roles, the button.
  - The `visitor` fixture takes a storage object (`{ roomId, name }`) and seeds `localStorage` before the first `goto`. `App` reads `roomId` and `name` at render and starts at `/` on Create.
  - `sideways` lives in `layout.spec.js`, inside the file, above 'the narrow layouts'. `fonts.spec.js` uses `defaultRoleChoice` only in the case this plan deletes.
  - `.room-row-go-chip` exists only in `lobby.html`'s `<style>`; `rejoin` appears in `lobby.html` (the parameter comment, `chip`, the row's class) and `lobby-cells.html` (options, `state`, the `src` template); `room-row.css`'s `.room-row-go-primary` comment names `rejoin=chip`.

## Rulings this plan makes, for the user's review

- **R1. The interfaces.** `LobbyPage({ ended, banners, children })`; `LobbyForm` takes today's `Lobby` props; `LobbyTabs({ tab, onTab })`, owning the `LobbyTab` type; `RoomRow({ id, line2, href })`. Set aside: `LobbyPage` taking the form's props, one component for two prefixes.
- **R2. `LobbyPage`'s prop is `ended`, not `inert`**, which React 19 renders as the native attribute.
- **R3. `Alerts` take the fence on their own root**, `div.legacy-page` replacing `row` and `col-md-8 offset-md-2`; `App` passes `<Alerts … />` as `banners`. Set aside: the fence in `LobbyPage`, a legacy class in a new component.
- **R4. `App` computes the rejoin row's two lines**: `rejoinLabel` becomes `rejoinId(id)`, the id or "your last room", and the line `name ? \`Rejoin as ${name}\` : 'Rejoin'` (spec decision 6). Set aside: `RoomRow` knowing the slug pattern.
- **R5. The layout case pins the rejoin row's name in visible order**, `<id> Rejoin as <name>` exactly (3b4 Terms). `RoomRow` also writes a literal space between the id and line 2 (`{' '}`), as the mockup does, for copy and paste; no case reads it, since the name puts a space between block children anyway (checked in Chromium). Set aside: `toHaveText` pinning the space, a check of text no user hears.
- **R6. The tabs are not rendered on a pinned form** (`!fixedRoom &&`), replacing `hidden`. Set aside: `hidden`, which passes the cases too but leaves dead markup.
- **R7. `fixtures.js` exports `LONGEST_ID`**, used by both new cases. Set aside: the literal in each file.
- **R8. The layout case measures the name field's gaps, not the panel's**: the contract reads roles, names and text, the panel has none, and the field spans the panel's content box. Set aside: a test id on the panel.
- **R9. Task 1 carries its mockup links and the reference's stylesheet list**, so no commit leaves a mockup's mark unstyled (as 4c1-banners' R2).

## Global Constraints

**Branch and commits:**
- Branch `20260930.ui_refresh_4c2_form`, stacked on `20260930.ui_refresh_4c1_banners` (#475). The spec is committed (6f8164b). New commits only: no amend, rebase or force-push, and nothing pushed until the user asks.
- Commit subjects, verbatim:
  - Task 0: `docs: plan the lobby's page and form (ui refresh step 4c2-form)`
  - Task 1: `refactor: extract the brand lockup into BrandLogo (ui refresh step 4c2-form)`
  - Task 2: `feat: draw the lobby's page and form (ui refresh step 4c2-form)`
- No "Generated with Claude Code" or co-author line.

**Code:**
- Comments are one or two lines, with no em dash. No semicolons, single quotes, two-space indent, lines under about 100 characters.
- The lobby's words are verbatim: "Create room", "Join room", "Your name", "Room id", "Your default role", the help line in `DefaultRole.tsx`, "Create", "Join", "Rejoin as <name>", "Rejoin", "your last room".
- No Bootstrap class in any new component; `Alerts` keeps its classes inside its fence.
- Each component imports its own sheet, as `Message.tsx` imports `message.css`.

**Mutations:** apply each mutation, run the case, see it FAIL on the named assertion, then revert it with `git checkout -- <file>` before the next one. The task's report lists each mutation and its failing line. If a case passes under its mutation, **stop and report**: the case goes back to the spec.

**Running:**
- Unit: `npm run test:unit`. Checks: `npm run typecheck && npm run lint`.
- Browser: `npm run build && npx playwright test e2e/<file> -g "<title>" --workers=1`, adding `--project=chromium` for `layout.spec.js`. The default worker count ran the workstation out of memory on 2026-10-28.

## Review Focus

- The mark after the move: no case reads its look. Compare the room page's header, and `room.html` with forced colours emulated, before and after Task 1.
- The rejoin row's lines out of order: the existing lookups match by substring, so only R5's exact name catches it.
- The ended pinned form: `refusal.spec.js` checks Join disabled; the name, the radios and the inert colours are by eye on `lobby.html?page=pinned&message=ended` against the app.
- Firefox: the layout case runs in Chromium only, so the lobby's markup in Firefox rests on the existing cases passing there.
- A Bootstrap class left in the new markup: `grep -nE 'form-|btn|col-|card|nav-|row"' frontend/src/components/{Lobby*,RoomRow,BrandLogo}.tsx` returns nothing.

---

### Task 0: Commit the plan

- [ ] **Step 1:** Commit this plan with Task 0's subject.

### Task 1: `BrandLogo` and `brand-logo.css`

Judged by the existing cases unchanged; no case is written.

**Files:**
- Create: `frontend/src/components/BrandLogo.tsx`, `frontend/src/components/brand-logo.css`
- Modify: `frontend/src/components/looks.css`, `frontend/src/components/RoomHeader.tsx`, `docs/design/room.html`, `docs/design/lobby.html`, `docs/design/ui-reference.md`

**Interfaces:**
- Produces: `export function BrandLogo()`, a fragment of `span.brand-logo[aria-hidden="true"]` holding today's SVG, then `span.brand-logo-name` "Pointing Poker".

- [ ] **Step 1: Move the mark's rules** (verified above) from `looks.css` to `brand-logo.css`, unchanged and in order, the forced-colours block whole. Its comment becomes `/* J3's opt-out: the mark keeps its fill in system colours */`. `looks.css` keeps no forced-colours block if none is left.
- [ ] **Step 2: Write `BrandLogo`**, starting `import './brand-logo.css'`, with a one-line header comment naming the brand lockup (3b4 Terms). `RoomHeader` draws `<BrandLogo />` in place of the two spans.
- [ ] **Step 3: The mockups (R9).** `room.html` and `lobby.html` link `../../frontend/src/components/brand-logo.css` on the line after `looks.css`. In `ui-reference.md`'s Mockups section, "the value source, `looks.css`, `message.css` and their area files" becomes "the value source, `looks.css`, `message.css`, `brand-logo.css` and their area files".
- [ ] **Step 4: Run** `npm run test:unit && npm run typecheck && npm run lint` (the token gate reads the new file), then `room.spec.js`, `fonts.spec.js` and `narrow.spec.js` whole in both browsers, and `layout.spec.js` in Chromium. Expected: PASS, no case changed.
- [ ] **Step 5: Commit** the files above with Task 1's subject.

### Task 2: The lobby's page and form

**Files:**
- Create: `frontend/src/components/LobbyPage.tsx`, `LobbyForm.tsx`, `LobbyTabs.tsx`, `RoomRow.tsx`
- Delete: `frontend/src/components/Lobby.tsx`, `DefaultRole.tsx`
- Modify: `frontend/src/components/App.tsx`, `Alerts.tsx`, `room-row.css`, `frontend/src/tokens.css`
- Modify: `docs/design/lobby.html`, `docs/design/lobby-cells.html`, `docs/design/ui-reference.md`, `docs/known-issues.md`
- Test: `e2e/fixtures.js`, `e2e/fonts.spec.js`, `e2e/lobby.spec.js`, `e2e/layout.spec.js`

**Interfaces:**
- Consumes: Task 1's `BrandLogo`.
- Produces:
  - `LobbyPage({ ended: boolean; banners: ReactNode; children: ReactNode })`, importing `lobby-page.css`: the `header.lobby-page-header` with `BrandLogo` in a column, then `main.lobby-page-main > div.lobby-page-column` holding `banners`, then `div.panel.lobby-page-panel` (with `lobby-page-inert` when `ended`) holding `children`.
  - `LobbyTabs({ tab: LobbyTab; onTab: (tab: LobbyTab) => void })`, importing `lobby-tabs.css`, exporting `type LobbyTab = 'create' | 'join'`: `nav.lobby-tabs[aria-label="Create or join"]` with links Create and Join (`href="#"`, `preventDefault`), the active one `aria-current="true"`, the other with no attribute.
  - `RoomRow({ id: string; line2?: string; href?: string })`, importing `room-row.css`: given `href`, `a.room-row` holding `span.room-row-square[aria-hidden]`, `span.room-row-text` (`span.room-row-id`, a space, `span.room-row-line2`) and `span.room-row-go[aria-hidden]` holding `<ArrowRight />`; without, `div.room-row` with the square and the id only.
  - `LobbyForm` with today's `Lobby` props, `rejoin` becoming `{ href: string; id: string; line2: string } | null` (R4), importing `lobby-form.css`.
  - `fixtures.js`: `nameInput` reads `getByLabel('Your name')`; `export const LONGEST_ID = 'fearless-speckled-flamingo'` with a one-line comment (R7).

- [ ] **Step 1: The fixtures and the existing cases.** `nameInput` and `LONGEST_ID` per the Interfaces block. In `fonts.spec.js`, 'the lobby is drawn in Inter' reads `getByText('Your name')`; delete 'today's lobby stays centred and keeps Bootstrap's form spacing' with its comment line, and `defaultRoleChoice` from the imports.
- [ ] **Step 2: Write 'the h1 names the form and the active tab is marked'** at the end of `lobby.spec.js`, importing `LONGEST_ID`:

```js
test('the h1 names the form and the active tab is marked', async ({ page, origin }) => {
  await page.goto(`${origin}/`)
  const h1 = page.getByRole('heading', { level: 1 })
  const create = page.getByRole('link', { name: 'Create', exact: true })
  const join = page.getByRole('link', { name: 'Join', exact: true })
  await expect(h1).toHaveText('Create room')
  await expect(create).toHaveAttribute('aria-current', 'true')
  await expect(join).not.toHaveAttribute('aria-current')
  await join.click()
  await expect(h1).toHaveText('Join room')
  await expect(join).toHaveAttribute('aria-current', 'true')
  await expect(create).not.toHaveAttribute('aria-current')
  // A room's own path with nothing stored: the pinned form, waiting for a name.
  await page.goto(`${origin}/${LONGEST_ID}`)
  await expect(h1).toHaveText('Join room')
  await expect(page.getByText(LONGEST_ID, { exact: true })).toBeVisible()
  await expect(create).toHaveCount(0)
  await expect(join).toHaveCount(0)
  await expect(roomIdInput(page)).toHaveCount(0)
})
```

- [ ] **Step 3: Write 'the lobby scrolls no page sideways, 320 by 640'** in `layout.spec.js`, inside 'the narrow layouts' (Chromium), in a `test.describe` of its own with `test.use({ viewport: { width: 320, height: 640 } })`, importing `LONGEST_ID`, `nameInput` and `roomIdInput`:

```js
test('the lobby scrolls no page sideways, 320 by 640', async ({ visitor }) => {
  const page = await visitor({ roomId: LONGEST_ID, name: 'Alice' })
  await page.goto('/')
  await page.getByRole('link', { name: 'Join', exact: true }).click()
  await expect(roomIdInput(page), 'the Join tab').toBeVisible()
  const row = page.getByRole('link', { name: `${LONGEST_ID} Rejoin as Alice`, exact: true })
  await expect(row, 'the rejoin row, named in visible order').toBeVisible()
  expect(await sideways(page), 'no sideways scroll').toBeLessThanOrEqual(0)
  // Against the body: page.css's scrollbar gutter narrows it in Chromium (R8).
  const gaps = await nameInput(page).evaluate(field => {
    const { left, right } = field.getBoundingClientRect()
    return [left, document.body.clientWidth - right]
  })
  expect(Math.abs(gaps[0] - gaps[1]), `the column centred, ${gaps}`).toBeLessThan(1)
})
```

- [ ] **Step 4: Run** both new cases and 'the lobby is drawn in Inter'. Expected: FAIL. The first on `toHaveText('Create room')` (today's `h5` reads "Create Room" and no `h1` exists); the second on the `exact` row name; the fonts case on the "Your name" text.
- [ ] **Step 5: Implement** per the Interfaces block and `lobby.html`'s markup:
  - `RoomRow`, `LobbyTabs`, `LobbyPage` (R1, R2).
  - `LobbyForm`: the `h1` (`h1.lobby-page-title`, `tabIndex={-1}`) reads "Create room" or "Join room" by `tab`; then `RoomRow` (the rejoin row at `/`, or the badge `<RoomRow id={roomId} />` when `fixedRoom`); then `LobbyTabs` unless `fixedRoom` (R6); then the Join tab's room field at `/` only (`lobby-form-input lobby-form-input-mono`, label "Room id"); the name (label "Your name"); `DefaultRole`'s group folded in (`fieldset.lobby-form-roles` named by its `legend`, described by the help line, radios `input.lobby-form-radio` inside `label.lobby-form-label`, all `disabled` when ended); the primary button (Join `disabled` when ended). Enter on the name field keeps today's keyUp rule (spec decision 7).
  - `App`: R3, R4; while the snapshot is null, `<LobbyPage ended={room.fatal} banners={<Alerts … />}><LobbyForm … /></LobbyPage>`; its return comment says the banners keep their fence until 4c2-banners.
  - `Alerts`: R3.
  - `tokens.css`: `--lobby-width: 26rem; /* the lobby's column, judged on its mockup (4c2-form decision 1) */`.
- [ ] **Step 6: Run** the two new cases and the fonts case, then `lobby.spec.js`, `roles.spec.js`, `slug.spec.js`, `refusal.spec.js`, `session.spec.js`, `fonts.spec.js` and `smoke.spec.js` whole in both browsers, `layout.spec.js` whole in Chromium, then `npm run typecheck && npm run lint`. Expected: PASS.
- [ ] **Step 7: Mutations.** The h1 case, in Chromium:
  - The `h1` fixed at "Create room": `toHaveText('Join room')` fails.
  - `aria-current={tab === which}`: `join` `not.toHaveAttribute` fails.
  - `LobbyTabs` drawn when `fixedRoom`: `create` `toHaveCount(0)` fails.
  - The room field drawn when `fixedRoom`: `roomIdInput` `toHaveCount(0)` fails.

  The layout case:
  - `lobby-page.css`'s column `width: var(--lobby-width)`, without `min()`: the sideways check fails.
  - The column without `margin-inline: auto`: the centring check fails.
  - `RoomRow` writing line 2 before the id: the row's exact name fails.
- [ ] **Step 8: The docs' changes** (spec, "The docs' changes"):
  - `lobby.html`: the `.room-row-go-chip` rule, `rejoin=chip, ` in the parameter comment, `const chip` and the row's chip class go; `typedLabel` goes, the row reading `typedName` as typed (spec decision 6). `lobby-cells.html`: the `rejoin` options row, `rejoin: 'plain', ` in `state`, and `&rejoin=${state.rejoin}` in `src` go.
  - `room-row.css`: the `.room-row-go-primary` comment ends at "the page's primary".
  - `ui-reference.md`: J13's "24 rem until judged" becomes "26 rem, judged by 4c2-form"; Open's entries "The lobby's column width" and "The rejoin row's arrow" go; the Mockups section's `lobby.html` parameters drop "`rejoin` (`chip` outlines the row's arrow), "; the log gains, after 4c1-banners' entry:

```markdown
- **4c2-form.** The lobby's page and form (the UI refresh design's step
  4c2-form) took the column at 26 rem, judged on `lobby.html` at 1280 by 700:
  the longest id keeps a fifth of its line, the help line takes two lines, and
  every form stays taller than wide but the pinned one, about square. The room
  row's arrow stays plain: the outlined chip, a box with no role of its own,
  mirrored the square. The brand lockup became one component, `BrandLogo`,
  its rules moved from `looks.css` to `brand-logo.css`. Set aside: 24 rem,
  which the longest id nearly fills; 28 rem, which turns the pinned panel
  landscape; the outlined chip.
```

  - `known-issues.md`: the title becomes "On a phone, the lobby's banners now lay out at the phone's width, unchecked". Where: the viewport meta, and the lobby's banners, `Alerts` in their own `legacy-page` fence. Issue: the first two sentences stay; the rest becomes: the lobby's banners, still Bootstrap's look inside their fence, lay out at the phone's width too. The lobby's root form is pinned at 320 px by 'the lobby scrolls no page sideways, 320 by 640', the pinned form sharing its column and row, and the room page's banners by 'no page scrolls sideways, 320 by 640' (both `e2e/layout.spec.js`); the editing view is drawn since 4c1-editor. 'an old UUID link opens its derived room under a banner that covers no card' (`e2e/slug.spec.js`) shows a lobby banner at 390 px, and no hand test has seen them there. Resolution unchanged.
- [ ] **Step 9: Run** `npm run test:unit && npm run typecheck && npm run lint`, then `npm run build && npx playwright test --workers=2`. Expected: PASS.
- [ ] **Step 10: Commit** the files above with Task 2's subject.
