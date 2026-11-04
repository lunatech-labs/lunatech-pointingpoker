# UI Refresh Step 3b4: The Lobby, Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Draw the lobby (the root form, the pinned form and the not-a-room page) in `docs/design/lobby.html` and `lobby-cells.html`, and give the value source, the design reference and the known issues what step 3b4 decided.

**Architecture:**
- Step 3b4 changes no app code: its deliverables are docs and mockups, judged by the product owner on `lobby.html`. Step 4 builds the pages.
- The commits after the spec's, in the order its "Branches and commits" gives, with the value source before the mockup that reads it:
  1. corrections to the spec (Task 1), judged by reading;
  2. the value source (Task 2): `--lobby-width` added, `--font-serif` removed and the gate's serif allowance with it, judged by the gate's unit tests;
  3. the mockup (Task 3), judged by the product owner and by a script that can fail;
  4. the reference and the known issues (Task 4).
- The script `~/Documents/pointing-poker-3b4/scripts/checks.mjs` (outside the repo, like 3b3's) is written first and run with no mockup, where it must fail, then run again once the mockup is drawn. Its text below was run on a scratch copy of the mockup below before this plan was written: every check passed, and a deliberate breakage of each thing a check guards (the tabs' `aria-current`, the inert look's ground, the id's wrapping and its clipping, the typed name's `<bdi>`, the row's space, the header's edge, a name's wrapping, a message on the wrong form, a blank name) failed the check it belongs to.

**Tech Stack:** static HTML, CSS and JavaScript (the mockup); Playwright's Chromium from the repo's `node_modules/playwright` (the checks); vitest (`npm run test:unit`, the gate); Markdown.

**Spec:** `docs/superpowers/specs/2026-10-19-ui-refresh-3b4-lobby-design.md`. Read it first: its Terms (lobby, root form, pinned form, not-a-room page, header bar, brand lockup, room row), its decisions, its states tables and its Contract are what this plan carries out. The record of the options, with what was rejected, is `~/Documents/pointing-poker-3b4/DECISIONS.md`, outside the repo.

## Rulings this plan makes, for the user's review

- **R1. The inert look sits on `--paper-pale`, not `--track`.** Decision 11 extends 3b3 decision 10's saving look to the lobby's fields and radios and says the text stays at the 7:1 floor. The saving look puts `--grey` on `--track`, which is 6.47:1 (computed from `colours.css`); on `--paper-pale` it is 7.06:1, and the gate already holds grey on pale at 7:1. The lobby's inert controls keep the saving look's muted text and edge and take `--paper-pale` as their ground. Task 1 corrects decision 11 to say so; the mockup's check 9 measures the ratio. **Not touched here:** 3b3's own saving look (Save on `--track`) has the same 6.47:1. An inactive control is exempt (WCAG 1.4.3 and 1.4.6), but J8 sets 7:1 for all text, so Task 4 lists it in the reference's Open items, for the user to decide.
- **R2. The not-a-room page is built in React, with its entry shape left to step 4; the typed name is wrapped in a `<bdi>`.** The user's ruling, after asking how a React component could be shared with a pure-HTML page: the room row should be one component, not a look written twice. Whether the page is a second entry point of the build or a view of the room app is open, and **step 4's brainstorm raises it first**, after a spike of how the server hands over the typed name and the suggestion. The server keeps deciding (`PageRoutes.notARoom`, `Suggestion`) and answers 404, a status that must survive for crawlers and link previews. A visitor reaches the page through the lobby's Join or a mistyped link, so JavaScript is there and no fallback is planned. This reopens decisions 12 and 13, the Terms, the last Accepted cost and the Contract; Task 1 rewrites them (a new decision 15). With React drawing the sentence, `<bdi>` no longer collides with `APISpec`'s markup string, since that assertion moves to e2e. The mockup is unchanged by the choice.
- **R3. The mockup's parameters.** `page` (`root`, `pinned`, `notaroom`), `tab`, `name`, `remembered` (`slug`, `legacy`, `none`), `rejoin=chip`, `role`, `message` (`join-failed`, `create-failed`, `lost`, `ended`, `moved`, `restarted`), `room`, `typed`, `suggestion`, `stored`, `longest=1`, `probe=1`. `?tab=join` is the flag "Join a different room" follows (decision 14), so it is the flag the mockup reads. `ended` implies the inert panel. A form draws only the messages it can have: `lost` and `ended` on the pinned form, the only one with a stream, and `create-failed` on the root form, the only one with Create; the cells page dims a cell that cannot show the chosen message.
- **R4. The row's two lines are separated by a space in the markup.** The row's name is its content in visible order, `<id> <line 2>`; the two lines are block elements, which a browser may join without a space. The mockup puts a literal space between the spans, and check 4 reads the row's text (the accessible name alone cannot show it, since a browser adds a space between blocks). J13 asks step 4's component to keep the space.
- **R5a. A blank typed name reads like none.** On the root form the row's second line is "Rejoin" when the typed name is empty or only spaces, as decision 13 treats a blank stored name and as `doJoin`'s trim already does. `App.tsx`'s `rejoinLabel` does not trim today; J13 asks step 4 to.
- **R5. The cells page draws five cells:** the root form's two tabs, the pinned form, and the not-a-room page with and without a suggestion. Options follow the spec's mockup parameters: the name, the remembered room, the arrow variant, the longest id, the message, the width.

## Global Constraints

**Branch and commits:**
- Branch `20260930.ui_refresh_3b4_lobby`, stacked on `20260930.ui_refresh_3b3_issue_editor_and_messages` (#453). New commits only: no amend, rebase or force-push. Nothing is pushed until the user asks.
- Commit subjects, verbatim, in Conventional Commits:
  - Task 0: `docs: plan the lobby (ui refresh step 3b4)`
  - Task 1: `docs: correct the lobby spec's inert look and decide to build its not-a-room page in React (ui refresh step 3b4)`
  - Task 2: `feat: add the lobby's column to the value source and drop the unused serif (ui refresh step 3b4)`
  - Task 3: `docs: draw the lobby in a mockup (ui refresh step 3b4)`
  - Task 4: `docs: give the design reference the lobby and the known issues its costs (ui refresh step 3b4)`
- No "Generated with Claude Code" or co-author line.

**Values, verbatim from the spec:**
- `--lobby-width`: `24rem`, provisional; the narrow column is `min(--lobby-width, 100% - 2 × --page-edge)`. The longest valid id is 26 characters, `fearless-speckled-flamingo`.
- Names kept: "Create" and "Join" (the tabs), "Your name" (the field, was "User name"), "Your default role" (the group) with Voter and Facilitator, "Room id" (the root's Join field only), "Dismiss", the section "Messages".
- Visible words: "Create room", "Join room", "Rejoin as <name>" (just "Rejoin" without a name), "your last room" (a legacy id), "Did you mean", "Join as <name>" (just "Join" without one), "Join a different room", `<code>x</code> is not a room name.`.
- The messages: "Could not join the room. Please try again.", "Could not create a room. Please try again.", "Connection to the room was lost", "Your session has ended. Please reload the page to rejoin.", and 3b1's moved and restarted notices.
- Colours: `--burgundy` carries white text and is the page's one filled control; `--card-back` is for shapes without text; links, faces and the focus ring stay ink (J4); text at 7:1 and other indicators at 3:1 (J8).

**Writing:**
- Code and CSS comments are one or two lines.
- Cite symbols and section names, never line numbers; in docs, a PR number or a main commit, never a branch hash.
- No counts of commits, edits, items or lines in docs or PR bodies.
- A delivered spec is edited only where this plan says: this step's own spec (Task 1) is not delivered yet.
- Subagents run on Opus, Sonnet or Haiku, never Fable.
- Scripts run from the repository root.

## Review Focus

1. **The longest valid id at 320 px**, in the suggestion's row, the pinned badge and the rejoin row: whole, wrapped at its hyphens, never cut, no sideways scroll. Task 3, Step 4 (check 11).
2. **A hostile typed or stored name**: a pasted bidi override, a name with markup and a 70-character unbroken string, in the heading and in a row; none reorders the sentence, runs as markup or leaves the panel. Task 3, Step 4 (checks 10 and 12).
3. **No name typed or a blank one, and a stored name empty or blank**: the row reads "Rejoin" and "Join", never "Rejoin as" or "Join as ". Task 3, Step 4 (checks 4 and 10).
4. **Every message at once**: one problem at a time in the order ended, lost, failure; notices by tone; the last Dismiss unmounts the section and Dismiss lands on the `h1`; a form shows only the messages it can have. Task 3, Step 4 (check 8).
5. **One burgundy control per page** with the chip variant and with no suggestion, and the Tab order on the root form. Task 3, Step 4 (checks 5 and 13).

---

### Task 0: Commit this plan

- [ ] **Step 1:** after the user's review, commit only this file.

```bash
git add docs/superpowers/plans/2026-10-19-ui-refresh-3b4-lobby.md
git commit -m "docs: plan the lobby (ui refresh step 3b4)"
```

### Task 1: Correct the spec's inert look and its not-a-room page

**Files:**
- Modify: `docs/superpowers/specs/2026-10-19-ui-refresh-3b4-lobby-design.md` (decisions 11 to 13, the Terms, the Accepted costs, the Contract and a new decision 15)

**Interfaces:**
- Consumes: R1 and R2 above.
- Produces: the spec text Tasks 3 and 4 cite.

- [ ] **Step 1: Decision 11.** Replace

```
    decision 10's look (the saving look, extended to the fields and the
    radios, with no new token). An inert control's edge is exempt from J8's 3:1
    (WCAG 1.4.11 exempts inactive components); its text stays at the 7:1 floor.
```

with

```
    decision 10's muted text and edge, extended to the fields and the radios,
    on `--paper-pale`: `--grey` on `--track` is 6.47:1, under the 7:1 floor, and
    on `--paper-pale` 7.06:1. No new token. An inert control's edge is exempt
    from J8's 3:1 (WCAG 1.4.11 exempts inactive components).
```

- [ ] **Step 2: The Terms.** Replace

```
- **Not-a-room page**: the server's 404 for a name outside the slug vocabulary
  (`PageRoutes.notARoom`), with a suggestion when one name is nearest. It is
  server HTML, not the React app.
```

with

```
- **Not-a-room page**: the 404 for a name outside the slug vocabulary
  (`PageRoutes.notARoom`), with a suggestion when one name is nearest. The
  server decides and answers; the page is a React page (decision 15).
```

- [ ] **Step 3: Decisions 12 and 13.** In decision 12, replace

```
    same column. Its `h1` is the sentence, the typed name a `<bdi>` in
    monospace that wraps anywhere and is never cut, so a pasted bidi character
    cannot reorder it. `<code>x</code> is not a room name.` stays in the
    markup.
```

with

```
    same column. Its `h1` is the sentence, the typed name in a `<code>`, in
    monospace, wrapped in a `<bdi>`, wrapping anywhere and never cut, so a
    pasted bidi character cannot reorder it.
```

In decision 13, replace

```
    whole row a link to `/<suggestion>`. The name is the browser's stored name,
    which the pinned form prefills, set by a few lines of inline script with
    `textContent`; an empty stored name counts as none. With none, or without
    the script, the line reads "Join". The row is the page's primary (9).
```

with

```
    whole row a link to `/<suggestion>`. The name is the browser's stored name,
    which the pinned form prefills; an empty stored name counts as none. With
    none the line reads "Join". The row is the page's primary (9).
```

- [ ] **Step 4: Decision 15.** After decision 14 (before `## States and events`), add:

```
15. **The not-a-room page is built in React.** The lobby's room row is one
    component, so the page imports it with the lobby's tokens and fonts, and
    the row's markup is written once. The server keeps deciding
    (`PageRoutes.notARoom`, `Suggestion`) and answers 404, a status that must
    survive for crawlers and link previews. Set aside: the server writing the
    page's HTML, which keeps a second copy of the row's markup and styles and
    needs a script to read the stored name. Whether the page is an entry point
    of its own or a view of the room app, and how the server hands over the
    typed name and the suggestion, are open: step 4's brainstorm raises them
    first. A visitor reaches the page through the lobby's Join or a mistyped
    link, so JavaScript is there.
```

- [ ] **Step 5: The last Accepted cost.** Replace

```
  joins as Alice, as today.
- The not-a-room page is server HTML, so building it means getting the styles
  into a page the server writes, and a script into a page that has none. No
  content-security-policy header is set today; step 4 confirms an inline script
  still runs.
```

with

```
  joins as Alice, as today.
```

- [ ] **Step 6: The Contract.** Replace

```
- The not-a-room page: `APISpec.scala` changes its assertion on `Did you mean
  <a href="/x">x</a>?`, since "Did you mean" becomes plain text above a row,
  and its assertion on `<a href="/">Create a room</a>`, renamed "Join a
  different room". `<code>x</code> is not a room name.` stays, as
  `slug.spec.js` and `APISpec` read it, and "Did you mean" stays absent without
  a suggestion.
```

with

```
- The not-a-room page is React, so `APISpec.scala`'s assertions on its markup
  (`<code>x</code> is not a room name.`, `Did you mean <a href="/x">x</a>?`,
  `<a href="/">Create a room</a>`) move to e2e cases on the rendered page: the
  sentence with the typed name, "Did you mean" absent without a suggestion, and
  "Join a different room". `APISpec` keeps the 404 status and what the server
  hands over (the typed name and the suggestion), and its case "escape the
  refused name before echoing it" stays, rewritten for the hand-over: in
  whatever form the name travels, it cannot inject markup or script (a
  `</script>` in inline JSON included). `slug.spec.js` keeps reading "is not a
  room name".
```

- [ ] **Step 7: The docs' changes list.** In the same spec's "The docs' changes", under **Reference**, replace

```
  chip on the right, and with it in the square's place on the left.
```

with

```
  chip on the right, and with it in the square's place on the left. Open also
  gains the not-a-room page's React shape (15) and the saving look's text
  contrast (the inert look's correction).
```

- [ ] **Step 8: Check.**

```bash
grep -n "server HTML\|inline script\|bdi" docs/superpowers/specs/2026-10-19-ui-refresh-3b4-lobby-design.md
```

Expected: one line, `bdi` in decision 12; `server HTML` and `inline script` appear nowhere.

- [ ] **Step 9: Commit.**

```bash
git add docs/superpowers/specs/2026-10-19-ui-refresh-3b4-lobby-design.md
git commit -m "docs: correct the lobby spec's inert look and decide to build its not-a-room page in React (ui refresh step 3b4)"
```

### Task 2: The value source

**Files:**
- Modify: `frontend/src/tokens.css`
- Modify: `frontend/src/colours.css`
- Modify: `frontend/src/design/gate.ts` (`allowedWords`)
- Modify: `frontend/src/design/gate.test.ts`

**Interfaces:**
- Consumes: the gate's checks (`frontend/src/design/gate.ts`), which allow `rem` and hold no colour in `tokens.css`, and `allowedWords`, which Step 4 narrows.
- Produces, for Task 3: `--lobby-width`.

- [ ] **Step 1: Add the token.** In `tokens.css`, after the `--page-max` line add:

```css
  --lobby-width: 24rem; /* the lobby's column, provisional until its mockup is judged (3b4 decision 3) */
```

- [ ] **Step 2: Remove the dead token.** Delete the line

```css
  --font-serif: 'Instrument Serif', ui-serif, serif; /* at most the app's name in the lobby (J7) */
```

- [ ] **Step 3: The card back's purpose.** In `colours.css`, change the comment on `--card-back` to:

```css
  --card-back: #DC2F3C; /* shapes without text: the voted mark, the kept frame, the top bar, the header mark, the room row's square */
```

- [ ] **Step 4: Drop the serif allowance.** `allowedWords` lets `ui-serif` and `serif` through only for `--font-serif`'s value. In `gate.ts`, replace

```ts
const allowedWords = new Set(['system-ui', 'sans-serif', 'ui-monospace', 'monospace', 'ui-serif', 'serif'])
```

with

```ts
const allowedWords = new Set(['system-ui', 'sans-serif', 'ui-monospace', 'monospace'])
```

In `gate.test.ts`, change the `fine` string's `monospace, ui-serif, serif; --b` to `monospace; --b`, and after the row `['--a: --b;', '--a: the word --b in --b'],` add:

```ts
    ['--a: serif;', '--a: the word serif in serif'],
    ['--a: ui-serif;', '--a: the word ui-serif in ui-serif'],
```

- [ ] **Step 5: Check nothing reads the removed token.**

```bash
grep -rn "font-serif" frontend/src docs/design/*.html
```

Expected: no output. (`docs/design/ui-reference.md` J7 still mentions Instrument Serif; Task 4 repoints it.)

```bash
grep -rn "serif" frontend/src/design
```

Expected: only `sans-serif` in the allowed list and the tests, and the two new rejection rows.

- [ ] **Step 6: Run the gate.**

Run: `npm run test:unit`
Expected: PASS, all files. The new token is a `rem` length, so `tokenProblems` stays empty, and the two new rows fail as written. Both edits must land together: with the token still present, `tokens.css` would fail the gate on `ui-serif`.

- [ ] **Step 7: Commit.**

```bash
git add frontend/src/tokens.css frontend/src/colours.css frontend/src/design/gate.ts frontend/src/design/gate.test.ts
git commit -m "feat: add the lobby's column to the value source and drop the unused serif (ui refresh step 3b4)"
```

### Task 3: The mockup

**Files:**
- Create (outside the repo): `~/Documents/pointing-poker-3b4/scripts/checks.mjs`
- Create: `docs/design/lobby.html`
- Create: `docs/design/lobby-cells.html`

**Interfaces:**
- Consumes: the tokens in `frontend/src/tokens.css` and `colours.css`, `--lobby-width` among them (Task 2).
- Produces, for Task 4: the parameters R3 lists on `lobby.html`, and `lobby-cells.html`'s options (R5), which the reference's Mockups list names.

- [ ] **Step 1: Write the checks.** Create `~/Documents/pointing-poker-3b4/scripts/checks.mjs`:

```js
// Step 3b4's checks on the lobby mockup: the three pages, the room row, the messages, the inert panel, the not-a-room page, the longest id.
import { chromium } from '/home/lt/work/lunatech/internal/planning_poker/lunatech-pointingpoker/node_modules/playwright/index.mjs'
const base = process.env.PAGE || `file://${process.cwd()}/docs/design/lobby.html`
const failures = [], errors = []
const check = (ok, what) => { if (!ok) failures.push(what) }
const run = async (name, fn) => { try { await fn() } catch (e) { failures.push(`${name}: ${e.message.split('\n')[0]}`) } }
const open = async (b, w, h, params = {}, page = base) => {
  const p = await b.newPage({ viewport: { width: w, height: h } })
  p.setDefaultTimeout(1500)
  p.on('pageerror', e => errors.push(`${w}x${h} ${new URLSearchParams(params)}: ${e.message}`))
  await p.goto(`${page}?${new URLSearchParams(params)}`); await p.evaluate(() => document.fonts.ready); await p.waitForTimeout(150)
  return p
}
const BURGUNDY = 'rgb(155, 26, 36)'
const b = await chromium.launch()
const pages = [
  ['root create', { page: 'root', tab: 'create' }], ['root join', { page: 'root', tab: 'join' }], ['pinned', { page: 'pinned' }],
  ['not-a-room, a suggestion', { page: 'notaroom' }], ['not-a-room, none', { page: 'notaroom', suggestion: '' }]
]

// 1. The h1 names the form (decision 5); the not-a-room h1 keeps its sentence, the name in `<code><bdi>`.
await run('1 h1', async () => {
  for (const [name, params, want] of [['root create', pages[0][1], 'Create room'], ['root join', pages[1][1], 'Join room'], ['pinned', pages[2][1], 'Join room']]) {
    const p = await open(b, 1280, 800, params)
    check(await p.locator('h1').count() === 1 && await p.locator('h1').innerText() === want, `1: the ${name} h1 is not "${want}"`)
    await p.close()
  }
  const p = await open(b, 1280, 800, { page: 'notaroom' })
  check((await p.locator('h1').innerHTML()).includes('<code><bdi>brave-golden-oter</bdi></code> is not a room name.'), '1: the not-a-room h1 lost its markup')
  check(await p.locator('code bdi').evaluate(e => getComputedStyle(e).unicodeBidi) === 'isolate', '1: the typed name is not bidi-isolated')
  await p.close()
})

// 2. One centred column and one left edge: the header's content, the banners and the panel (decisions 2 and 3).
await run('2 column', async () => {
  for (const w of [1280, 800, 392, 320]) {
    const p = await open(b, w, 800, { page: 'root', message: 'join-failed,moved' })
    const r = await p.evaluate(() => {
      const px = parseFloat(getComputedStyle(document.documentElement).fontSize), left = s => document.querySelector(s).getBoundingClientRect()
      const edge = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--page-edge')) * px
      const logo = left('.logo'), lead = parseFloat(getComputedStyle(document.querySelector('.logo')).marginLeft)
      return { lockup: logo.left - lead, header: left('.header .col'), messages: left('.messages'), panel: left('.panel'), px, edge, width: document.body.getBoundingClientRect().width }
    })
    const cap = Math.min(24 * r.px, r.width - 2 * r.edge)
    check(Math.abs(r.header.left - r.panel.left) <= 0.5 && Math.abs(r.messages.left - r.panel.left) <= 0.5 && Math.abs(r.lockup - r.panel.left) <= 0.5, `2: the left edges differ at ${w}`)
    check(Math.abs(r.panel.width - cap) <= 1, `2: the column is ${r.panel.width}, not ${cap} at ${w}`)
    check(Math.abs((r.panel.left - 0) - (r.width - r.panel.right)) <= 1, `2: the column is not centred at ${w}`)
    await p.close()
  }
})

// 3. The tabs are links; the active one has aria-current="true"; none on the pinned form (decision 6).
await run('3 tabs', async () => {
  for (const [tab, name] of [['create', 'Create'], ['join', 'Join']]) {
    const p = await open(b, 1280, 800, { page: 'root', tab, remembered: 'none' })
    const links = p.getByRole('navigation').getByRole('link')
    check(await links.count() === 2, `3: not two tab links on ${tab}`)
    check(await p.locator('[aria-current="true"]').count() === 1 && await p.getByRole('link', { name, exact: true }).getAttribute('aria-current') === 'true', `3: ${name} is not the one aria-current tab`)
    await p.close()
  }
  const pinned = await open(b, 1280, 800, { page: 'pinned' })
  check(await pinned.locator('.tabs').count() === 0, '3: the pinned form draws tabs')
  await pinned.close()
  const p = await open(b, 1280, 800, { page: 'root', remembered: 'none' })
  await p.getByRole('link', { name: 'Join', exact: true }).click()
  check(await p.locator('h1').innerText() === 'Join room' && await p.getByLabel('Room id').count() === 1, '3: Join does not switch the form')
  await p.close()
})

// 4. The rejoin row: at / only, above the tabs, one link named "<id> Rejoin as <name>", line 2 underlined, a legacy id (decision 8).
await run('4 rejoin', async () => {
  const p = await open(b, 1280, 800, { page: 'root' })
  const link = p.getByRole('link', { name: 'caring-striped-hamster Rejoin as Alice', exact: true })
  check(await link.count() === 1, `4: no link named "caring-striped-hamster Rejoin as Alice": ${await p.locator('.row').getAttribute('aria-label')}`)
  check(await link.evaluate(e => e.textContent) === 'caring-striped-hamster Rejoin as Alice', '4: the id and line 2 are not joined by one literal space')
  const row = await link.boundingBox(), tabs = await p.locator('.tabs').boundingBox()
  check(row.y + row.height <= tabs.y, '4: the row is not above the tabs')
  check(await link.locator('.line2').evaluate(e => getComputedStyle(e).textDecorationLine) === 'underline', '4: line 2 is not underlined')
  check(await link.locator('.id').evaluate(e => getComputedStyle(e).textDecorationLine) === 'none', '4: the id is underlined')
  check(await link.evaluate(e => getComputedStyle(e).textDecorationLine) === 'none', '4: the row itself is underlined')
  await p.close()
  const j = await open(b, 1280, 800, { page: 'root', tab: 'join' })
  check(await j.locator('a.row').count() === 1, '4: the row is not on the Join tab')
  await j.close()
  const legacy = await open(b, 1280, 800, { page: 'root', remembered: 'legacy' })
  check(await legacy.getByRole('link', { name: 'your last room Rejoin as Alice', exact: true }).count() === 1, '4: the legacy row is not named "your last room Rejoin as Alice"')
  await legacy.close()
  const anon = await open(b, 1280, 800, { page: 'root', name: '' })
  check(await anon.getByRole('link', { name: 'caring-striped-hamster Rejoin', exact: true }).count() === 1, '4: with no name the row is not "<id> Rejoin"')
  await anon.close()
  const blank = await open(b, 1280, 800, { page: 'root', name: '   ' })
  check(await blank.getByRole('link', { name: 'caring-striped-hamster Rejoin', exact: true }).count() === 1, '4: a blank typed name does not read "<id> Rejoin"')
  await blank.close()
  const none = await open(b, 1280, 800, { page: 'root', remembered: 'none' })
  check(await none.locator('a.row').count() === 0, '4: a row shows with nothing remembered')
  await none.close()
  for (const params of [{ page: 'pinned' }, { page: 'notaroom', suggestion: '' }]) {
    const o = await open(b, 1280, 800, params)
    check(await o.getByText('Rejoin').count() === 0, `4: a Rejoin row shows on ${params.page}`)
    await o.close()
  }
  const pinned = await open(b, 1280, 800, { page: 'pinned' })
  check(await pinned.locator('.row').count() === 1 && await pinned.locator('a.row').count() === 0 && await pinned.locator('.row .line2, .row .go').count() === 0, '4: the pinned badge is not a plain row with no second line and no arrow')
  await pinned.close()
})

// 5. One burgundy-filled control per page (decision 9), the outlined chip variant included.
await run('5 burgundy', async () => {
  const fills = p => p.evaluate(c => [...document.querySelectorAll('body *')].filter(e => getComputedStyle(e).backgroundColor === c && e.getBoundingClientRect().width > 0).map(e => e.className), BURGUNDY)
  for (const [name, params] of [...pages, ['root with the chip', { page: 'root', rejoin: 'chip' }]]) {
    const p = await open(b, 1280, 800, params), f = await fills(p)
    check(f.length === 1, `5: ${name} has ${f.length} burgundy fills: ${JSON.stringify(f)}`)
    await p.close()
  }
  const chip = await open(b, 1280, 800, { page: 'root', rejoin: 'chip' })
  const go = await chip.locator('.go').evaluate(e => { const s = getComputedStyle(e); return `${s.backgroundColor}|${s.borderTopColor}|${s.borderTopWidth}` })
  check(go.startsWith('rgb(255, 255, 255)|rgb(28, 25, 23)|'), `5: rejoin=chip does not outline the arrow: ${go}`)
  await chip.close()
  const sug = await open(b, 1280, 800, { page: 'notaroom' })
  check(await sug.locator('.go').evaluate(e => getComputedStyle(e).backgroundColor) === BURGUNDY, '5: the suggestion arrow is not the burgundy chip')
  check(await sug.getByRole('link', { name: 'Join a different room' }).evaluate(e => getComputedStyle(e).backgroundColor) !== BURGUNDY, '5: with a suggestion the other action is burgundy')
  await sug.close()
  const none = await open(b, 1280, 800, { page: 'notaroom', suggestion: '' })
  check(await none.getByRole('link', { name: 'Join a different room' }).evaluate(e => getComputedStyle(e).backgroundColor) === BURGUNDY, '5: without a suggestion the other action is not the burgundy primary')
  await none.close()
})

// 6. Targets are 44 px: the links, the buttons, the fields, the radios' labels, Dismiss.
await run('6 targets', async () => {
  for (const [name, params] of [...pages, ['messages', { page: 'root', message: 'moved,restarted' }]]) for (const w of [1280, 320]) {
    const p = await open(b, w, 800, params)
    const small = await p.evaluate(() => [...document.querySelectorAll('a, button, input:not([type="radio"]), .radios label')]
      .filter(e => { const r = e.getBoundingClientRect(); return r.width > 0 && (r.height < 43.5 || r.width < 43.5) }).map(e => `${e.tagName}.${e.className} ${e.textContent.trim().slice(0, 20)}`))
    check(!small.length, `6: ${name} at ${w} has small targets: ${JSON.stringify(small)}`)
    await p.close()
  }
})

// 7. The role group keeps its name, its description and its radios (decision 7); the help line sits against the radios, the larger gap after.
await run('7 roles', async () => {
  const p = await open(b, 1280, 800, { page: 'pinned' })
  const group = p.getByRole('group', { name: 'Your default role' })
  check(await group.count() === 1, '7: no group named "Your default role"')
  check((await group.getAttribute('aria-describedby')) === 'help' && (await p.locator('#help').innerText()).startsWith('Used for rooms you have not joined before.'), '7: the help line does not describe the group')
  check(await group.getByRole('radio').count() === 2 && await group.getByRole('radio', { name: 'Voter' }).isChecked(), '7: the radios are not Voter (checked) and Facilitator')
  const r = await p.evaluate(() => ({ radios: document.querySelector('.radios').getBoundingClientRect(), help: document.querySelector('#help').getBoundingClientRect(), btn: document.querySelector('.btn').getBoundingClientRect() }))
  check(r.help.top - r.radios.bottom < r.btn.top - r.help.bottom, `7: the help line is not nearer the radios (${r.help.top - r.radios.bottom}) than the button (${r.btn.top - r.help.bottom})`)
  await p.close()
})

// 8. The messages: banners above the panel, one problem at a time (ended, lost, a failure), notices by tone, Dismiss to the h1, no empty section (decision 10).
await run('8 messages', async () => {
  const none = await open(b, 1280, 800, { page: 'root' })
  check(await none.locator('section[aria-label="Messages"]').count() === 0, '8: an empty Messages section is mounted')
  await none.close()
  for (const [page, flags, want] of [['pinned', 'join-failed', 'Could not join the room. Please try again.'], ['root', 'create-failed', 'Could not create a room. Please try again.'],
    ['pinned', 'lost,join-failed', 'Connection to the room was lost'], ['pinned', 'ended,lost,join-failed', 'Your session has ended. Please reload the page to rejoin.']]) {
    const p = await open(b, 1280, 800, { page, message: flags })
    const alerts = await p.locator('section[aria-label="Messages"] [role="alert"]').allInnerTexts()
    check(alerts.length === 1 && alerts[0] === want, `8: ${flags} shows ${JSON.stringify(alerts)}, not ${want}`)
    const m = await p.locator('.messages').boundingBox(), panel = await p.locator('.panel').boundingBox()
    check(m.y + m.height <= panel.y, `8: the banners are not above the panel for ${flags}`)
    await p.close()
  }
  const p = await open(b, 1280, 800, { page: 'root', message: 'restarted,moved,join-failed' })
  const order = await p.locator('.messages .msg').evaluateAll(es => es.map(e => e.className.replace('msg ', '')))
  check(JSON.stringify(order) === '["problem","notice","notice"]', `8: the stack is ${order}`)
  const texts = await p.locator('.messages .notice').allInnerTexts()
  check(/old link/.test(texts[0]) && /Reconnected/.test(texts[1]), '8: the notices are not moved, then restarted')
  await p.getByRole('button', { name: 'Dismiss' }).first().click()
  check(await p.evaluate(() => document.activeElement.tagName) === 'H1', '8: Dismiss does not move focus to the h1')
  await p.getByRole('button', { name: 'Dismiss' }).click()
  check(await p.locator('.notice').count() === 0 && await p.locator('.problem').count() === 1, '8: Dismiss removed more than its notice')
  await p.close()
  const last = await open(b, 1280, 800, { page: 'root', message: 'moved' })
  await last.getByRole('button', { name: 'Dismiss' }).click()
  check(await last.locator('section[aria-label="Messages"]').count() === 0, '8: the Messages section stays after the last banner')
  await last.close()
  for (const [page, flags] of [['root', 'lost,ended'], ['pinned', 'create-failed'], ['notaroom', 'join-failed']]) {   // a form shows only the messages it can have
    const o = await open(b, 1280, 800, { page, message: flags })
    check(await o.locator('.messages').count() === 0 && await o.locator('.inert').count() === 0 && await o.locator('button:disabled').count() === 0, `8: ${page} draws a message it cannot have (${flags})`)
    await o.close()
  }
})

// 9. After "session ended": the name, both radios and Join are disabled, in a look whose text keeps 7:1 (decision 11).
await run('9 inert', async () => {
  const p = await open(b, 1280, 800, { page: 'pinned', message: 'ended' })
  check(await p.locator('#name:disabled').count() === 1 && await p.locator('input[type="radio"]:disabled').count() === 2 && await p.getByRole('button', { name: 'Join' }).isDisabled(), '9: the name, the radios and Join are not all disabled')
  check(await p.getByRole('textbox', { name: 'Your name' }).count() === 1, '9: the name field lost its label')
  const [fg, bg] = await p.getByRole('button', { name: 'Join' }).evaluate(e => { const s = getComputedStyle(e); return [s.color, s.backgroundColor] })
  const lum = c => { const [r, g, bl] = c.match(/\d+/g).map(Number).map(v => v / 255).map(v => v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4); return 0.2126 * r + 0.7152 * g + 0.0722 * bl }
  const ratio = (a, c) => (Math.max(lum(a), lum(c)) + 0.05) / (Math.min(lum(a), lum(c)) + 0.05)
  check(ratio(fg, bg) >= 7, `9: the inert Join's text is ${ratio(fg, bg).toFixed(2)}:1`)
  const live = await open(b, 1280, 800, { page: 'pinned' })
  check(await live.getByRole('button', { name: 'Join' }).evaluate(e => getComputedStyle(e).backgroundColor) === BURGUNDY, '9: the live Join is not burgundy')
  await live.close(); await p.close()
})

// 10. The not-a-room page: "Did you mean" plain text over a row named "<id> Join as <name>"; an empty stored name reads "Join"; "Join a different room" opens the Join tab.
await run('10 not a room', async () => {
  const p = await open(b, 1280, 800, { page: 'notaroom' })
  check(await p.getByText('Did you mean', { exact: true }).evaluate(e => e.tagName) === 'P' && await p.locator('p a').count() === 0, '10: "Did you mean" is not plain text')
  check(await p.getByRole('link', { name: 'brave-golden-otter Join as Alice', exact: true }).count() === 1, '10: the row is not named "brave-golden-otter Join as Alice"')
  await p.close()
  for (const stored of ['', '   ']) {
    const q = await open(b, 1280, 800, { page: 'notaroom', stored })
    check(await q.getByRole('link', { name: 'brave-golden-otter Join', exact: true }).count() === 1, `10: stored ${JSON.stringify(stored)} does not read "Join"`)
    await q.close()
  }
  const hostile = await open(b, 1280, 800, { page: 'notaroom', stored: '<b>x</b>' })
  check(await hostile.locator('#join-line b').count() === 0 && (await hostile.locator('#join-line').innerText()) === 'Join as <b>x</b>', '10: the stored name is not set as text')
  await hostile.close()
  const none = await open(b, 1280, 800, { page: 'notaroom', suggestion: '' })
  check(!(await none.locator('body').innerText()).includes('Did you mean') && await none.locator('.row').count() === 0, '10: "Did you mean" or a row shows without a suggestion')
  await none.getByRole('link', { name: 'Join a different room' }).click()
  check(await none.locator('h1').innerText() === 'Join room' && await none.locator('[aria-current="true"]').innerText() === 'Join', '10: "Join a different room" does not open the Join tab')
  await none.close()
})

// 11. The longest valid id (26 characters), at phone width: whole in its row, wrapped at its hyphens and never cut, and the page does not scroll sideways (decision 3, 12).
await run('11 longest', async () => {
  for (const [name, params] of [['not-a-room', { page: 'notaroom', longest: '1' }], ['pinned', { page: 'pinned', longest: '1' }], ['root', { page: 'root', longest: '1' }]]) for (const w of [1280, 320]) {
    const p = await open(b, w, 800, params)
    const r = await p.evaluate(() => {
      const panel = document.querySelector('.panel').getBoundingClientRect()
      const out = [...document.querySelectorAll('.panel *')].filter(e => e.getBoundingClientRect().right > panel.right + 0.5).map(e => e.className)
      const id = [...document.querySelectorAll('.row .id')].map(el => {
        const t = el.firstChild, lines = new Map()
        for (let i = 0; i < t.length; i++) { const rg = document.createRange(); rg.setStart(t, i); rg.setEnd(t, i + 1); const top = Math.round(rg.getBoundingClientRect().top); lines.set(top, (lines.get(top) || '') + t.data[i]) }
        return [...lines.values()]
      })
      const cut = [...document.querySelectorAll('.row .id')].filter(e => e.scrollWidth > e.clientWidth).length
      return { out, id, cut, wide: document.documentElement.scrollWidth > document.documentElement.clientWidth }
    })
    check(!r.out.length && !r.wide && !r.cut, `11: ${name} at ${w} spills: ${JSON.stringify(r)}`)
    for (const lines of r.id) {
      check(lines.slice(0, -1).every(l => l.endsWith('-')), `11: ${name} at ${w} cuts an id mid-word: ${JSON.stringify(lines)}`)
      check(lines.join('') === 'fearless-speckled-flamingo', `11: ${name} at ${w} lost characters: ${JSON.stringify(lines)}`)
    }
    if (w === 1280 && name === 'not-a-room') check(r.id[0].length === 1, `11: the id wraps at 1280 in the suggestion's row: ${JSON.stringify(r.id)}`)
    await p.close()
  }
})

// 12. The typed name wraps anywhere and is never cut; a bidi override cannot reorder the sentence.
await run('12 typed', async () => {
  const typed = 'x'.repeat(70) + '‮txet'
  const p = await open(b, 320, 800, { page: 'notaroom', typed, suggestion: '' })
  const r = await p.evaluate(() => { const panel = document.querySelector('.panel').getBoundingClientRect(), code = document.querySelector('code').getBoundingClientRect()
    return { inside: code.right <= panel.right + 0.5, wide: document.documentElement.scrollWidth > document.documentElement.clientWidth, lines: Math.round(code.height / parseFloat(getComputedStyle(document.querySelector('code')).lineHeight)) } })
  check(r.inside && !r.wide && r.lines >= 2, `12: the typed name spills or does not wrap: ${JSON.stringify(r)}`)
  const words = await p.evaluate(() => {   // visual order: each word of the sentence must follow the one before (a bidi override flips them)
    const w = document.createTreeWalker(document.querySelector('h1'), NodeFilter.SHOW_TEXT); const out = []; let t
    while ((t = w.nextNode())) {
      if (t.parentElement.closest('code')) continue
      for (const m of t.data.matchAll(/\S+/g)) { const g = document.createRange(); g.setStart(t, m.index); g.setEnd(t, m.index + m[0].length); const r = g.getBoundingClientRect(); out.push([m[0], r.top, r.left]) }
    }
    return out
  })
  check(words.map(w => w[0]).join(' ') === 'is not a room name.' && words.every((w, i) => i === 0 || w[1] > words[i - 1][1] + 1 || w[2] > words[i - 1][2]), `12: the sentence was reordered: ${JSON.stringify(words)}`)
  await p.close()
  for (const [name, params] of [['a typed name in the row', { page: 'root', name: 'x'.repeat(70) }], ['a stored name in the row', { page: 'notaroom', stored: 'x'.repeat(70) }]]) {
    const o = await open(b, 320, 800, params)
    check(await o.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), `12: ${name} spills the page sideways at 320`)
    await o.close()
  }
})

// 13. The tab order on the root form: the row (its first 12 characters), Create, Join, the name, the checked role, Create.
await run('13 tab order', async () => {
  const p = await open(b, 1280, 800, { page: 'root' })
  const seen = []
  for (let i = 0; i < 6; i++) { await p.keyboard.press('Tab'); seen.push(await p.evaluate(() => document.activeElement.getAttribute('aria-current') !== null ? document.activeElement.textContent.trim() : document.activeElement.id || document.activeElement.value || document.activeElement.textContent.trim().slice(0, 12))) }
  check(JSON.stringify(seen) === '["caring-strip","Create","Join","name","Voter","Create"]', `13: Tab visits ${JSON.stringify(seen)}`)
  await p.close()
})

// 14. The mockup uses tokens, no literal colour or px, and no serif.
await run('14 tokens', async () => {
  const { readFileSync } = await import('node:fs')
  const file = new URL(base).pathname, text = readFileSync(file, 'utf8')
  const style = text.slice(text.indexOf('<style>'), text.indexOf('</style>'))
  check(!/#[0-9a-fA-F]{3,8}\b/.test(style), '14: a literal colour in the style')
  check(!/\d\s*px\b/.test(style), '14: a px value in the style')
  check(!/serif/i.test(text.replace(/sans-serif/gi, '')), '14: a serif in the page')
})

// 15. The cells page: every cell is the lobby, with the options passed on.
await run('15 cells', async () => {
  const p = await open(b, 1500, 900, {}, new URL('lobby-cells.html', base).href)
  check(await p.locator('iframe').count() >= 5, '15: fewer than five cells')
  await p.check('input[name="rejoin"][value="chip"]'); await p.check('input[name="longest"][value="1"]')
  const srcs = await p.locator('iframe').evaluateAll(fs => fs.map(f => f.getAttribute('src')))
  check(srcs.every(s => s.includes('rejoin=chip') && s.includes('longest=1')), `15: the cells do not pass rejoin and longest on: ${srcs[0]}`)
  check(srcs.some(s => s.includes('page=notaroom') && s.includes('suggestion=')) && srcs.some(s => s.includes('page=pinned')) && srcs.some(s => s.includes('tab=join')), '15: the cells lack a page')
  await p.close()
})

await b.close()
for (const e of errors) failures.push(`page error ${e}`)
console.log(failures.length ? failures.join('\n') : 'every check passes')
process.exit(failures.length ? 1 : 0)
```

- [ ] **Step 2: Run it with no mockup, to see it fail.**

Run: `node ~/Documents/pointing-poker-3b4/scripts/checks.mjs`
Expected: exit 1, with a failure from every check numbered 1 to 15 (the page does not exist).

- [ ] **Step 3: Draw the mockup.** Create `docs/design/lobby.html`:

```html
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Lobby mockup (ui refresh step 3b4)</title>
<link rel="stylesheet" href="../../frontend/src/colours.css">
<link rel="stylesheet" href="../../frontend/src/tokens.css">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=block">
<style>
  * { box-sizing: border-box; }
  html { font-size: var(--root-size); scrollbar-gutter: stable; }
  body { margin: 0; background: var(--paper-pale); color: var(--ink); font: var(--weight-regular) var(--text-md)/var(--leading-body) var(--font-sans); }
  a { color: var(--ink); }
  button, input { font: inherit; color: inherit; }
  svg { width: var(--icon); height: var(--icon); flex: none; }
  :focus-visible { outline: var(--focus-width) solid var(--ink); outline-offset: var(--focus-gap); }

  /* Decisions 2 and 3: the room page's header bar, then one centred column that the header's content, the banners and the panel share */
  .col { width: min(var(--lobby-width), 100% - 2 * var(--page-edge)); margin-inline: auto; }
  .header { height: var(--header-height); display: flex; align-items: center; background: var(--paper-warm); border-bottom: var(--line-hairline) solid var(--hairline-colour); }
  .header .col { display: flex; align-items: center; gap: var(--panel-gap); }
  .logo {
    height: var(--brand-height); aspect-ratio: 11 / 15; border-radius: var(--radius-mark); background: var(--card-back); color: var(--paper-warm);
    display: grid; place-items: center; box-shadow: calc(-1 * var(--space-1)) var(--space-1) 0 var(--mark-offset); margin-left: var(--space-1);
  }
  .logo svg { width: 62%; height: auto; }
  .app { font-weight: var(--weight-bold); font-size: var(--text-md); }
  main { padding-block: var(--panel-gap) var(--space-6); }

  /* J6's banners, as the room page draws them, in the column (decision 10) */
  .messages { display: flex; flex-direction: column; gap: var(--space-2); margin-bottom: var(--panel-gap); }
  .msg {
    display: flex; align-items: center; gap: var(--space-3); padding: var(--space-2) var(--space-2) var(--space-2) var(--space-4);
    background: var(--paper-warm); border: var(--line-hairline) solid var(--hairline-colour); border-left: var(--line-bar) solid var(--ink);
    border-radius: var(--radius); box-shadow: var(--shadow) var(--shadow-colour); font-weight: var(--weight-medium);
  }
  .msg p { flex: 1; min-width: 0; margin: 0; overflow-wrap: anywhere; }
  .msg .quiet { display: flex; align-items: center; justify-content: center; min-width: var(--target-min); min-height: var(--target-min); padding: var(--space-2); background: none; border: 0; cursor: pointer; }
  .msg.problem { background: var(--burgundy-tint); color: var(--burgundy-deep); border-left-color: var(--burgundy-deep); }
  .msg.notice { background: var(--notice-ground); color: var(--notice-ink); border-left-color: var(--notice-bar); }
  .msg.notice svg { color: var(--notice-bar); }

  .panel { background: var(--paper-warm); border-radius: var(--radius); box-shadow: var(--shadow) var(--shadow-colour); padding: var(--space-4) var(--panel-inline) var(--space-5); }
  h1 { margin: 0 0 var(--space-3); font: var(--weight-strong) var(--text-lg)/var(--leading-tight) var(--font-sans); }
  /* Decision 12: the typed name wraps anywhere; its bdi isolates it, so a pasted bidi character cannot reorder the sentence */
  h1 code { display: block; width: fit-content; max-width: 100%; margin-bottom: var(--space-1); padding: var(--space-1) var(--space-2); background: var(--paper-pale); border-radius: var(--radius-small); font: var(--weight-medium) var(--text-md)/var(--leading-body) var(--font-mono); overflow-wrap: anywhere; }

  /* The room row (Terms): the square, the id and a second line, the arrow; the whole row is the link */
  .row { display: flex; align-items: center; gap: var(--space-3); min-height: var(--target-min); margin-bottom: var(--space-4); padding: var(--space-2) var(--space-3); background: var(--paper-pale); border: var(--line-hairline) solid var(--hairline-colour); border-radius: var(--radius-card); color: var(--ink); text-decoration: none; }
  .square { width: var(--space-6); height: var(--space-6); flex: none; border-radius: var(--radius-mark); background: var(--card-back); }
  .row .text { flex: 1; min-width: 0; }
  .id { display: block; font: var(--weight-medium) var(--text-sm)/var(--leading-body) var(--font-mono); overflow-wrap: break-word; }
  .line2 { display: block; font-size: var(--text-sm); text-decoration: underline; overflow-wrap: anywhere; }
  .go { display: grid; place-items: center; width: var(--space-6); height: var(--space-6); flex: none; margin-left: auto; }
  /* Decision 9: the arrow is a burgundy chip only where the row is the page's primary; rejoin=chip outlines the root's arrow */
  .go.primary { background: var(--burgundy); color: var(--paper-warm); border-radius: var(--radius-card); }
  .go.chip { background: var(--paper-warm); border: var(--line-control) solid var(--ink); border-radius: var(--radius-card); }
  .lead { margin: 0 0 var(--space-2); font-weight: var(--weight-strong); }

  /* Decision 6: links; the active one is bold with a bar, the others underlined (J4) */
  .tabs { display: flex; gap: var(--space-1); margin: 0 0 var(--space-4); border-bottom: var(--line-hairline) solid var(--hairline-colour); }
  .tabs a { display: flex; align-items: center; min-height: var(--target-min); padding-inline: var(--space-3); }
  .tabs a[aria-current] { font-weight: var(--weight-strong); text-decoration: none; border-bottom: var(--line-bar) solid var(--ink); margin-bottom: calc(-1 * var(--line-hairline)); }

  label, legend { display: block; padding: 0; margin-bottom: var(--space-1); font-size: var(--text-sm); font-weight: var(--weight-strong); }
  .input { display: block; width: 100%; min-height: var(--target-min); margin-bottom: var(--space-4); padding-inline: var(--space-3); background: var(--paper-warm); border: var(--line-control) solid var(--mute-soft); border-radius: var(--radius-card); }
  .input.mono { font-family: var(--font-mono); }
  /* Decision 7: the help line stays against the radios, the larger gap after it */
  fieldset { min-width: 0; margin: 0 0 var(--space-5); padding: 0; border: 0; }
  .radios { display: flex; flex-wrap: wrap; gap: 0 var(--space-5); }
  .radios label { display: flex; align-items: center; gap: var(--space-2); min-height: var(--target-min); margin: 0; font-size: var(--text-md); font-weight: var(--weight-regular); }
  input[type="radio"] { width: var(--icon); height: var(--icon); margin: 0; accent-color: var(--ink); }
  .help { display: block; font-size: var(--text-sm); color: var(--grey); }

  .btn { display: flex; align-items: center; justify-content: center; width: 100%; min-height: var(--target-min); padding-inline: var(--space-4); border: var(--line-control) solid transparent; border-radius: var(--radius-control); font-weight: var(--weight-strong); text-decoration: none; cursor: pointer; }
  .btn.primary { background: var(--burgundy); color: var(--paper-warm); }
  .btn.outline { background: var(--paper-warm); border-color: var(--ink); color: var(--ink); }
  .btn + .btn { margin-top: var(--space-3); }

  /* Decision 11: inert after "session ended"; the muted look, on the pale ground since grey on the track is 6.47:1, below J8's 7:1 for text */
  .inert .input:disabled, .inert .btn:disabled { background: var(--paper-pale); color: var(--grey); border-color: var(--hairline-colour); cursor: default; }
  .inert .radios label, .inert label, .inert legend { color: var(--grey); }
  .inert input[type="radio"]:disabled { accent-color: var(--grey); }

  @media (forced-colors: active) {
    .square, .logo, .go.primary { forced-color-adjust: none; background: CanvasText; color: Canvas; }
    .inert .input:disabled, .inert .btn:disabled { color: GrayText; border-color: GrayText; }
  }
</style>
</head>
<body>
<div id="root"></div>
<script>
// Parameters: page (root | pinned | notaroom), tab, name, remembered (slug | legacy | none), rejoin=chip, role, message (comma list), room, typed, suggestion,
// stored, longest=1 (the 26-character id), probe=1; the lobby-cells page lists each with its meaning.
const q = new URLSearchParams(location.search)
const page = q.get('page') || 'root'
let tab = q.get('tab') === 'join' ? 'join' : 'create'
const longest = q.get('longest') === '1', longId = 'fearless-speckled-flamingo'
const id = fallback => longest ? longId : fallback
const typed = q.get('typed') ?? (longest ? `${longId}s` : 'brave-golden-oter')
const suggestion = q.has('suggestion') ? q.get('suggestion') : id('brave-golden-otter')
const room = q.get('room') || id('brave-golden-otter')
const stored = q.get('stored') ?? 'Alice'
const typedName = q.get('name') ?? 'Alice'
const typedLabel = typedName.trim()   // a blank typed name reads like none
const remembered = q.get('remembered') || 'slug'
const chip = q.get('rejoin') === 'chip'
const role = q.get('role') === 'facilitator' ? 'Facilitator' : 'Voter'
// Only the forms that can show a message draw it: a stream exists on the pinned form alone, Create on the root form alone
const shown = { root: ['join-failed', 'create-failed', 'moved', 'restarted'], pinned: ['join-failed', 'lost', 'ended', 'moved', 'restarted'] }[page] || []
const flags = (q.get('message') || '').split(',').filter(f => shown.includes(f))
const ended = flags.includes('ended')

const esc = s => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))
const icon = d => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="${d}"/></svg>`
const alertIcon = icon('M12 3l10 18H2zM12 10v5M12 18v.5'), infoIcon = icon('M12 3a9 9 0 1 0 0 18a9 9 0 1 0 0-18zM12 11v6M12 7.5v.5'), close = icon('M6 6l12 12M18 6L6 18')
const arrow = icon('M5 12h14M13 6l6 6-6 6')
const msg = (tone, text, dismiss) => `<div class="msg ${tone}" role="${tone === 'problem' ? 'alert' : 'status'}">${tone === 'problem' ? alertIcon : infoIcon}<p>${text}</p>${
  dismiss ? `<button class="quiet" type="button" aria-label="Dismiss">${close}</button>` : ''}</div>`
const texts = {
  ended: 'Your session has ended. Please reload the page to rejoin.', lost: 'Connection to the room was lost',
  'join-failed': 'Could not join the room. Please try again.', 'create-failed': 'Could not create a room. Please try again.'
}
const notices = {
  moved: 'The old link you followed now opens this address. Please update your invitation or bookmark to use it.',
  restarted: 'Reconnected. Please check your vote.'
}
// The problem slot shows one message: ended, then lost, then a failure (App.tsx's connectionMessage || error); the stack follows the tone
const problem = ['ended', 'lost', 'join-failed', 'create-failed'].find(f => flags.includes(f))
const dismissed = new Set()
const banners = () => [...(problem ? [msg('problem', texts[problem])] : []),
  ...['moved', 'restarted'].filter(f => flags.includes(f) && !dismissed.has(f)).map(f => `<div data-notice="${f}">${msg('notice', notices[f], true)}</div>`)].join('')

const logo = `<span class="logo" aria-hidden="true"><svg viewBox="30 31 51.2 39"><path fill="currentColor" fill-rule="evenodd" d="M34 31 H76 a5.2 5.2 0 0 1 0 10.4 H67 V66 a4 4 0 0 1 -4 4 H34 a4 4 0 0 1 -4 -4 V35 a4 4 0 0 1 4 -4 Z M40 41.4 H57 V59.6 H40 Z"/></svg></span>`
const header = `<header class="header"><div class="col">${logo}<span class="app">Pointing Poker</span></div></header>`

const rowLabel = remembered === 'legacy' ? 'your last room' : id('caring-striped-hamster')
const rejoinRow = () => remembered === 'none' ? '' :
  `<a class="row" href="#"><span class="square" aria-hidden="true"></span><span class="text"><span class="id">${esc(rowLabel)}</span> <span class="line2">${typedLabel ? `Rejoin as ${esc(typedLabel)}` : 'Rejoin'}</span></span><span class="go${chip ? ' chip' : ''}" aria-hidden="true">${arrow}</span></a>`
const badge = `<div class="row"><span class="square" aria-hidden="true"></span><span class="text"><span class="id">${esc(room)}</span></span></div>`

const dis = ended ? ' disabled' : ''
const nameField = `<label for="name">Your name</label><input class="input" id="name" type="text" value="${esc(typedName)}"${dis}>`
const roles = `<fieldset aria-describedby="help"><legend>Your default role</legend><div class="radios">${['Voter', 'Facilitator'].map(r =>
  `<label><input type="radio" name="role" value="${r}"${r === role ? ' checked' : ''}${dis}> ${r}</label>`).join('')}</div>
  <small class="help" id="help">Used for rooms you have not joined before. In a room you have joined before, you keep your previous role there.</small></fieldset>`
const form = (heading, extra, button) => `<h1 tabindex="-1">${heading}</h1>${extra}${nameField}${roles}<button type="button" class="btn primary"${dis}>${button}</button>`

function rootForm() {
  const tabs = `<nav class="tabs" aria-label="Create or join"><a href="#" ${tab === 'create' ? 'aria-current="true"' : ''} data-tab="create">Create</a><a href="#" ${tab === 'join' ? 'aria-current="true"' : ''} data-tab="join">Join</a></nav>`
  const roomField = `<label for="room">Room id</label><input class="input mono" id="room" type="text" value="">`
  return tab === 'create' ? `<h1 tabindex="-1">Create room</h1>${rejoinRow()}${tabs}${nameField}${roles}<button type="button" class="btn primary">Create</button>`
    : `<h1 tabindex="-1">Join room</h1>${rejoinRow()}${tabs}${roomField}${nameField}${roles}<button type="button" class="btn primary">Join</button>`
}
const pinnedForm = () => form('Join room', badge, 'Join')

function notARoom() {
  const row = suggestion ? `<p class="lead">Did you mean</p>
    <a class="row" href="#"><span class="square" aria-hidden="true"></span><span class="text"><span class="id">${esc(suggestion)}</span> <span class="line2" id="join-line">Join</span></span><span class="go primary" aria-hidden="true">${arrow}</span></a>` : ''
  const other = `<a class="btn ${suggestion ? 'outline' : 'primary'}" href="lobby.html?tab=join">Join a different room</a>`
  return `<h1><code><bdi>${esc(typed)}</bdi></code> is not a room name.</h1>${row}${other}`
}

function draw() {
  const body = page === 'notaroom' ? notARoom() : page === 'pinned' ? pinnedForm() : rootForm()
  const list = page === 'notaroom' ? '' : banners()
  document.getElementById('root').innerHTML = `${header}<main><div class="col">${list ? `<section class="messages" aria-label="Messages">${list}</section>` : ''}<div class="panel${ended ? ' inert' : ''}">${body}</div></div></main>`
  // Decision 13: "Join as <name>" from the stored name, textContent only; an empty stored name counts as none
  const line = document.getElementById('join-line')
  if (line && stored.trim()) line.textContent = 'Join as ' + stored.trim()
}
document.addEventListener('click', e => {
  const tabLink = e.target.closest('[data-tab]'), dismiss = e.target.closest('[aria-label="Dismiss"]')
  if (tabLink) { e.preventDefault(); tab = tabLink.dataset.tab; draw(); document.querySelector(`[data-tab="${tab}"]`).focus() }
  if (dismiss) { dismissed.add(dismiss.closest('[data-notice]').dataset.notice); draw(); document.querySelector('h1').focus() }   // 3b3 decision 5
  if (e.target.closest('a[href="#"]')) e.preventDefault()
})
draw()

if (q.get('probe') === '1') {
  const badgeOut = Object.assign(document.createElement('output'), { style: 'position:fixed;right:8px;bottom:8px;padding:4px 8px;background:var(--ink);color:var(--paper-warm);font:12px/1.4 var(--font-mono);z-index:9' })
  const show = () => { const px = parseFloat(getComputedStyle(document.documentElement).fontSize)
    badgeOut.textContent = `${innerWidth}×${innerHeight} · root ${px.toFixed(1)}px · ${(innerWidth / px).toFixed(1)} rem wide` }
  document.body.append(badgeOut); addEventListener('resize', show); show()
}
</script>
</body>
</html>
```

and `docs/design/lobby-cells.html`:

```html
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Lobby mockup, layout cells (ui refresh step 3b4)</title>
<style>
  body { margin: 0; padding: 16px; background: #E7E2DC; font: 14px/1.4 system-ui, sans-serif; color: #1C1917; }
  .bar { display: flex; flex-wrap: wrap; gap: 16px; align-items: center; margin-bottom: 16px; position: sticky; top: 0; background: #E7E2DC; padding: 8px 0; z-index: 1; }
  .bar fieldset { border: 1px solid #B9AD9F; padding: 4px 8px; margin: 0; }
  .bar legend { font-weight: 600; }
  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(calc(var(--w) * var(--s)), 1fr)); gap: 24px; }
  figure { margin: 0; }
  figcaption { font-weight: 600; margin-bottom: 6px; }
  .frame { width: calc(var(--w) * var(--s)); height: calc(var(--h) * var(--s)); overflow: hidden; outline: 1px solid #8A7A70; background: #fff; }
  iframe { width: var(--w); height: var(--h); border: 0; transform: scale(var(--s)); transform-origin: 0 0; }
</style>
</head>
<body>
<p style="margin:0 0 8px;max-width:80rem"><b>Pointing Poker, the lobby.</b> The three pages of step 3b4 at the chosen width: the root form (Create and Join), the pinned form, and the not-a-room page with and without a suggestion. "Open alone" shows a cell at your window's size, with the probe.</p>
<div class="bar" id="bar"></div>
<div class="grid" id="grid"></div>
<script>
// Each cell is lobby.html at the chosen width; "open alone" shows one at the window's own size.
const cells = [
  ['Root form, Create tab', 'page=root&tab=create'], ['Root form, Join tab', 'page=root&tab=join'], ['Pinned form', 'page=pinned'],
  ['Not-a-room page, with a suggestion', 'page=notaroom'], ['Not-a-room page, without one', 'page=notaroom&suggestion=']
]
const options = {
  name: [['Alice', 'A name typed'], ['', 'No name']],
  remembered: [['slug', 'A remembered room'], ['legacy', 'A legacy id'], ['none', 'Nothing remembered']],
  rejoin: [['plain', 'Plain arrow (default)'], ['chip', 'Outlined chip']],
  longest: [['0', 'Ordinary ids'], ['1', 'The longest id, 26 characters']],
  message: [['', 'No message'], ['join-failed', 'Join failed'], ['create-failed', 'Create failed'], ['lost', 'Connection lost'], ['ended', 'Session ended (inert panel)'],
    ['moved', 'Moved link'], ['restarted', 'Reconnected'], ['join-failed,moved,restarted', 'Failure and both notices']],
  width: [['1280', '1280'], ['800', '800'], ['392', '392 (a phone)'], ['320', '320 (the narrowest)']],
  height: [['700', '700'], ['900', '900'], ['743', '743 (a phone)']],
  scale: [['0.5', '50%'], ['0.75', '75%'], ['1', 'Actual size']]
}
// The messages each form can show (a stream exists on the pinned form alone, Create on the root form alone); a cell that cannot show the chosen one is dimmed
const shown = { root: ['join-failed', 'create-failed', 'moved', 'restarted'], pinned: ['join-failed', 'lost', 'ended', 'moved', 'restarted'], notaroom: [] }
const state = { name: 'Alice', remembered: 'slug', rejoin: 'plain', longest: '0', message: '', width: '800', height: '700', scale: '0.5' }
const bar = document.getElementById('bar')
for (const [key, list] of Object.entries(options)) {
  const fs = document.createElement('fieldset')
  fs.innerHTML = `<legend>${key}</legend>` + list.map(([v, label]) => `<label><input type="radio" name="${key}" value="${v}" ${state[key] === v ? 'checked' : ''}> ${label}</label> `).join('')
  fs.addEventListener('change', () => { state[key] = fs.querySelector('input:checked').value; render() })
  bar.append(fs)
}
function render() {
  const grid = document.getElementById('grid')
  grid.style.setProperty('--s', state.scale); grid.style.setProperty('--w', `${state.width}px`)
  grid.innerHTML = cells.map(([title, cell]) => {
    const src = `lobby.html?${cell}&name=${encodeURIComponent(state.name)}&remembered=${state.remembered}&rejoin=${state.rejoin}&longest=${state.longest}&message=${state.message}`
    const page = new URLSearchParams(cell).get('page'), cannot = state.message.split(',').filter(Boolean).some(f => !shown[page].includes(f))
    return `<figure style="${cannot ? 'opacity:.45' : ''}"><figcaption>${title}${cannot ? ' (this message cannot show here)' : ''} — <a href="${src}&probe=1" target="_blank">open alone</a></figcaption>
      <div class="frame" style="--s:${state.scale};--w:${state.width}px;--h:${state.height}px"><iframe src="${src}" title="${title}"></iframe></div></figure>`
  }).join('')
}
render()
</script>
</body>
</html>
```

- [ ] **Step 4: Run the checks.**

Run: `node ~/Documents/pointing-poker-3b4/scripts/checks.mjs`
Expected: `every check passes`, exit 0. If a check fails, fix the mockup, not the check, unless the check contradicts the spec.

- [ ] **Step 5: Prove a check can fail.** Change `aria-current="true"` to `aria-current="page"` in `lobby.html`, run the checks, expect checks 3 and 10 to fail, then restore it:

```bash
sed -i 's/aria-current="true"/aria-current="page"/g' docs/design/lobby.html
node ~/Documents/pointing-poker-3b4/scripts/checks.mjs; echo "exit $?"
git checkout -- docs/design/lobby.html 2>/dev/null || sed -i 's/aria-current="page"/aria-current="true"/g' docs/design/lobby.html
```

Expected: failures from checks 3 and 10 (its lookup of the active tab), `exit 1`. The file is untracked at this point, so the `sed` restore is the one that runs: run the checks once more and expect `every check passes`.

- [ ] **Step 6: Look at it.** Open `docs/design/lobby-cells.html` in a browser and at each width (1280, 800, 392, 320) look at the five cells with the longest id on and the message set to "Failure and both notices" and to "Session ended" (only the pinned cell draws that one; the others are dimmed). The product owner judges the look; this step only confirms nothing is broken by eye. Do not change the look to taste.

- [ ] **Step 7: Commit.**

```bash
git add docs/design/lobby.html docs/design/lobby-cells.html
git commit -m "docs: draw the lobby in a mockup (ui refresh step 3b4)"
```

### Task 4: The reference and the known issues

**Files:**
- Modify: `docs/design/ui-reference.md`
- Modify: `docs/known-issues.md`

**Interfaces:**
- Consumes: the spec's "The docs' changes", Task 3's parameters, R1.
- Produces: nothing later.

- [ ] **Step 1: The Mockups list.** In `ui-reference.md`, after the `room-cells.html` bullet (ending "the window's size."), add:

```markdown
- `lobby.html`, the lobby's three pages (J13). Its parameters, listed at the top
  of its script: `page` (`root`, `pinned`, `notaroom`), `tab` (`create`,
  `join`), `name`, `remembered` (`slug`, `legacy`, `none`), `rejoin` (`chip`
  outlines the row's arrow), `role`, `message` (the join and create failures,
  the lost connection, the ended session, the moved and restart notices),
  `room`, `typed`, `suggestion`, `stored`, `longest` (the longest valid id) and
  `probe`.
- `lobby-cells.html`, the lobby's pages side by side at a chosen width
  (1280, 800, 392 or 320 px), each with a link that opens it alone.
```

- [ ] **Step 2: J7.** Replace the line `- Instrument Serif at most for the app's name in the lobby (L9).` with:

```markdown
- The brand lockup, in the room header and the lobby (J13), is Inter bold; no
  serif is drawn, so the value source has no serif token.
```

- [ ] **Step 3: J13.** Insert before `## Tokens`:

```markdown
### J13. The lobby

Step 3b4's spec holds its rules,
`docs/superpowers/specs/2026-10-19-ui-refresh-3b4-lobby-design.md`, and
`lobby.html` draws them.

- **The regions** are the room page's: the header bar with the brand lockup,
  then one centred column that the header's content, the banners and the panel
  share a left edge with. The column is `--lobby-width`, 24 rem until judged,
  and `min(--lobby-width, 100% - 2 × --page-edge)` on a narrow screen; one
  column at every width, no breakpoint and no hero.
- **The `h1` names the form**: "Create room" or "Join room". Dismiss's focus
  lands on it. The tabs are links, the active one `aria-current="true"` and
  marked by weight and a bar, the others underlined (J4); the pinned form has
  none, its room fixed in a badge.
- **The room row** is a link as a whole: a plain `--card-back` square, the room
  id in monospace, a second line, an ink arrow. Its name is its content in
  visible order, `<id> <line 2>`, with no `aria-label`, a literal space between
  the two lines so the name reads the same in any layout. Line 2 reads "Rejoin"
  alone when the typed name is empty or only spaces. Line 2 is underlined, J4's
  cue; a link drawn as a button is not. An id wraps at its hyphens and is never
  cut, in a row and in the badge.
- **One burgundy-filled control per page**: the primary button, or, where the
  row is the page's primary, as on the not-a-room page, the row's arrow as a
  small burgundy chip.
- **The messages** are banners above the panel, one problem at a time (ended,
  then lost, then a failure) and the notices by tone. A form shows only the
  messages it can have: the lost connection and the ended session on the pinned
  form, the only one with a stream, and the create failure on the root form. After "Your session has
  ended" the panel stays, its name, roles and Join inert in the saving look's
  muted text on `--paper-pale`, since grey on `--track` is 6.47:1 and J8 asks
  7:1 for text; an inert control's edge is exempt from J8's 3:1.
- **The not-a-room page** is drawn in the same regions. Its `h1` reads
  `<code><bdi>x</bdi></code> is not a room name.`, the typed name wrapping
  anywhere and isolated by the `<bdi>`. A suggestion is a room row under the
  plain text "Did you mean", reading "Join as <name>" from the stored name; the
  secondary action is "Join a different room", which opens `/` on the Join tab.
```

- [ ] **Step 4: The Tokens table.** In the Layout row, after `the deck's width and the result's least heights (J11)`, add `; from 3b4, the lobby's column (J13)`.

- [ ] **Step 5: Open.** In the Open section (not J10, which has a similar line), replace the paragraph beginning `L1 to L4, L6, L5's card size` so its last words read `and L7 and L8 by 3b3 (J12), and L9 by 3b4 (J13).` Delete the whole **L9. The lobby** bullet and add, in its place:

```markdown
- **The lobby's column width**: `--lobby-width` is 24 rem until the product
  owner judges `lobby.html` (J13).
- **The rejoin row's arrow**: the plain ink arrow (the default) or the outlined
  chip (`rejoin=chip`), after the product owner and the designer have seen both.
- **Three rejoin-row variants, deferred for the designer and not rejected**:
  no square with an outlined "Rejoin" button on the right, with the outlined
  arrow chip on the right, and with it in the square's place on the left.
- **The lobby's open costs** (3b4's Accepted costs): a Reload button on "Your
  session has ended"; a "Joining…" look from a press to the first snapshot;
  accepting a full URL pasted into Join.
- **The not-a-room page's React shape** (3b4 decision 15), which step 4's
  brainstorm raises first: an entry point of its own or a view of the room app,
  and how the server hands over the typed name and the suggestion, keeping its
  404 status.
- **The saving look's text contrast**: Save in `--grey` on `--track` is 6.47:1
  (3b3 decision 10), under J8's 7:1 for text, though an inactive control is
  exempt (WCAG 1.4.3 and 1.4.6). The lobby's inert look uses `--paper-pale` (7.06:1);
  whether the editor follows it is for the product owner.
```

- [ ] **Step 6: The log.** Insert before the `- **Review.**` entry:

```markdown
- **3b4.** The lobby came with its own spec,
  `docs/superpowers/specs/2026-10-19-ui-refresh-3b4-lobby-design.md`, and folded
  in the not-a-room page, which is the same user's next screen. The
  lobby takes the room page's regions in one centred column of `--lobby-width`,
  a token added to the value source; `--card-back`'s comment names the row's
  square, a shape without text, which is why the square is not `--burgundy`;
  `--font-serif` left it with the gate's serif allowance, since J7 draws no
  serif and nothing used it. The tabs stay: nobody reaches `/` often, so
  restructuring them is its own step. The messages are banners, since a message
  inside the panel needs a second mechanism and "session ended" does not fit
  one; after it the panel stays and is inert, on `--paper-pale`, because the
  saving look's `--track` ground leaves grey text at 6.47:1. The rejoin row's
  name is its content, which keeps Label in Name with two lines; its arrow is
  ink, and burgundy only where the row is the page's one primary, so J4 and J8
  hold. The not-a-room page is built in React, so the row is one component and
  the lobby's tokens and fonts are shared, its entry shape left to step 4; the
  typed name is wrapped in a `<bdi>`. Set aside: a hero panel; restructured
  tabs; a segmented role bar; messages inside the panel; removing the form
  after "session ended"; burgundy links and arrows; a Reload button, a
  "Joining…" look and an accepted pasted URL (each its own decision); the
  rejoin row without its square (the three deferred variants, Open).
```

- [ ] **Step 7: Known issues.** In `docs/known-issues.md`, before `## Traceability note`, add:

```markdown
### A failure that repeats unchanged is not announced twice by a screen reader

- **Where:** `frontend/src/components/Alerts.tsx` (the error slot) and
  `frontend/src/components/App.tsx` (`joinError`, `joinHere`, `doCreate`).
- **Issue:** The join and create failures show in a `role="alert"`. When a second
  attempt fails with the same text, the text does not change, so a screen reader
  may not announce it again and the user hears nothing for the second failure.
  Inferred from how live regions announce changes, not heard.
- **Resolution:** Stays open until a user asks for it. The fix is app code, such
  as clearing the message when a new attempt starts; step 3b4's spec lists it
  under Accepted costs.

### A full URL pasted into the Join field gets the not-a-room page

- **Where:** `frontend/src/components/App.tsx` (`doJoin`, which only trims).
- **Issue:** Pasting `https://host/brave-golden-otter` into Room id and pressing
  Join goes to `/https%3A...`, which the server answers with the not-a-room page,
  though the room is in the text.
- **Resolution:** Stays open. Accepting a pasted URL is a behaviour change with
  its own decisions, such as which hosts and forms to take; step 3b4's spec lists
  it under Accepted costs.

### Create pressed twice in flight makes two rooms

- **Where:** `frontend/src/components/App.tsx` (`doCreate`, which has no
  in-flight guard).
- **Issue:** Pressing Create again before the first request answers sends a
  second request and creates a second room, and the page goes to whichever
  answers last. The first room is empty and ends by the idle stop.
- **Resolution:** Stays open since the cost is an empty room that expires. A
  guard that ignores a press while a create is in flight is a small app change
  for step 4 or later.
```

- [ ] **Step 8: Check.**

```bash
grep -n "font-serif\|Instrument Serif" docs/design/ui-reference.md
grep -n "^### J13\|^- \*\*3b4\.\*\*" docs/design/ui-reference.md
npm run test:unit
```

Expected: the first prints only history, the Brand source's description of lunatech.com's own fonts and J7's decisions-log line on Instrument Serif's light weight; the second prints J13 and the 3b4 log entry; the unit tests pass.

- [ ] **Step 9: Commit.**

```bash
git add docs/design/ui-reference.md docs/known-issues.md
git commit -m "docs: give the design reference the lobby and the known issues its costs (ui refresh step 3b4)"
```
