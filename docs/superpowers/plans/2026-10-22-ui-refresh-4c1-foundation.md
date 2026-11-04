# UI Refresh Step 4c1-foundation: The Stylesheets and the Fonts, Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Layer Bootstrap and `styles.css` beneath Josh Comeau's reset, fence today's markup off from the reset, load the tokens, serve Inter and JetBrains Mono from the app with their licences, and gate literal colours and `px` out of the new stylesheets.

**Architecture:**
- `frontend/src/base.css` declares `@layer legacy, base;`, imports Bootstrap then `styles.css` into `legacy`, `reset.css` into `base`, then `colours.css` and `tokens.css` unlayered. It ends `base` with the fence and holds two unlayered rules: `body` in `--font-sans` and `.room-header-id` in `--font-mono`.
- `App.tsx` wraps today's tree in `<div className="container legacy-page">`; `index.html`'s root becomes a bare `<div id="root">`.
- `frontend/src/fonts.css` declares the fonts from the Fontsource packages and opens with the licence comment; `main.tsx` imports it first, then `base.css`. `index.html` preloads the latin Inter and the Mono files.
- A Vite plugin, `font-licences`, emits both `LICENSE` files into `assets/` at build and rewrites the preload hrefs to `/@fs/` in dev.
- The new cases are in `e2e/fonts.spec.js`; the gate's rule is `literalProblems` in `frontend/src/design/gate.ts`.

**Tech Stack:** React 19 and Vite 8.3.1 (Lightning CSS); Bootstrap 4.6.2; `@fontsource-variable/inter` and `@fontsource/jetbrains-mono` 5.3.0; Vitest, postcss and postcss-value-parser (the gate); Playwright 1.63 (Chromium and Firefox) against the testkit stub.

**Spec:** `docs/superpowers/specs/2026-10-21-ui-refresh-4c1-foundation-design.md` (approved 2026-10-22). Its parent is `docs/superpowers/specs/2026-09-30-ui-refresh-design.md`, step 4, whose rows for 4c1's steps are already committed.

## How this plan was verified

- **The spike, 2026-10-21** (the spec's table): the preload href Vite rewrites, `@import … layer()`, the `/*! */` comment, Pekko's content types, the fence against today's cascade, the held-back font under `swap` and `optional`.
- **Probes for this plan, 2026-10-22:**
  - Chromium's `CSS.getPlatformFontsForNode` names the Mono file "JetBrains Mono Medium" and the Inter file "Inter".
  - Firefox's `FontFace.family` keeps the quotes (`"JetBrains Mono"`); both browsers serialise `unicodeRange` as `U+0-FF, U+131`.
  - Today's lobby at 1280 by 720, in both browsers: the "Create Room" heading has 300 px on each side, and the role group starts 16 px below the name field.
- **Read, not run:** each RED below is reasoned from today's code and the spike. Task 5 runs every mutation of the spec's Contract.

## Rulings this plan makes, for the user's review

- **R1. Order: the layers and the fence, then the fonts, then the licences and dev, then the gate.** The fence lands with the case that proves it. The fonts are judged by their own cases. The gate's file check needs the new stylesheets to exist. The reference's J7 line goes with the fonts, and the two code comments go with the code they describe.
- **R2. `colours.css` and `tokens.css` are imported unlayered.** They hold only custom properties, which `all` does not touch, so the fence cannot revert them, and no layer competes for their names.
- **R3. The gate reads declaration values and the params of `@media`, `@container` and `@supports`.** It skips comments, strings and the inside of `url()`. A named colour is any of CSS Color 4's named colours, matched case-insensitively. The literal colour functions are `rgb`, `rgba`, `hsl`, `hsla`, `hwb`, `lab`, `lch`, `oklab`, `oklch` and `color`.
- **R4. How the font cases find faces and fonts.**
  - In Chromium, a node is found for the DevTools protocol by a probe attribute. The attribute is set and removed around each read, as `markRegion` tags a node.
  - In Firefox, a face is found by its family, without quotes, and by a character its `unicodeRange` covers.
  - The preload and licence cases read `link` elements in the head. These are page plumbing, outside the test contract's roles and names.
- **R5. The preload case joins in place, on the room's path.** Both preloaded files are then used in one document, so "each fetched once" covers the Mono file too.
- **R6. The computed-style diff runs twice.** The first run has every font forced to `monospace` on both sides, so any difference left is not the fonts'. The second run is as served, and may add only `font-family` and the sizes text drives. Both runs include each element's `::before` and `::after`, which the fence covers.
- **R7. The dev check is a scratch Playwright script against `npm run dev`,** run before and after the rewrite. The by-eye look is the user's, at the PR.
- **R8. The room's paint case joins as "Łukasz Дмитрий Νίκος Nguyễn"** (the user's choice, 2026-10-22). One name reaches the latin-ext, cyrillic, greek and vietnamese faces; no name length limit exists (checked). Cyrillic-ext and greek-ext stay unread.
- **R9. The dev rewrite builds its path with Vite's `normalizePath` and a leading `/`** (the user's choice, 2026-10-22), so Windows gets `/@fs/C:/…` rather than `/@fsC:\…`. Untested on Windows; on Linux and macOS the path is unchanged.

## Global Constraints

**Branch and commits:**
- Branch `20260930.ui_refresh_4c1_foundation`, stacked on 4b2's `20260930.ui_refresh_4b2_save_guard` (#457).
- New commits only: no amend, rebase or force-push. Nothing is pushed until the user asks.
- Commit subjects, verbatim, in Conventional Commits:
  - Task 0: `docs: plan the stylesheets and the fonts (ui refresh step 4c1-foundation)`
  - Task 1: `feat: layer today's CSS beneath a reset and fence it off (ui refresh step 4c1-foundation)`
  - Task 2: `feat: serve Inter and JetBrains Mono from the app (ui refresh step 4c1-foundation)`
  - Task 3: `feat: ship the font licences beside the files and paint the fonts in dev (ui refresh step 4c1-foundation)`
  - Task 4: `test: keep literal colours and px out of the stylesheets (ui refresh step 4c1-foundation)`
- No "Generated with Claude Code" or co-author line.

**Code:**
- The layer statement is `@layer legacy, base;`. The wrapper is `<div className="container legacy-page">`. The fence, verbatim:
  `@layer base { .legacy-page, .legacy-page *, .legacy-page *::before, .legacy-page *::after { all: revert-layer } }`
- Rules in `base` stay at or below one class's specificity, or use `:where()`.
- Font families: `'Inter'` and `'JetBrains Mono'`, as `tokens.css`' `--font-sans` and `--font-mono` name them. `font-display: swap` on every face.
- Comments are one or two lines, in CSS as in code. No em dash.
- JavaScript style (the plan's e2e code is written to it; run `--write` with the same flags where `--check` disagrees): `npx prettier --check --single-quote --no-semi --print-width 100 --trailing-comma none --arrow-parens avoid e2e/*.js` passes. TypeScript: `npm run typecheck` and `npm run lint` pass.

**Running:**
- Once per session before any e2e run: `npm run pree2e`.
- After any change to `frontend/src/` or `frontend/index.html`: `npm run build`.
- Use `npx playwright test`, not `npm run e2e`. Green runs and mutation runs of `e2e/fonts.spec.js` are both browsers.
- `$W` is a scratch directory outside the repo, such as the session's scratchpad.

**Writing:**
- Cite symbols and case titles, never line numbers. No counts of commits, edits, items or lines in docs.
- The spec's Status line stays as it is.

## Review Focus

The spec's Contract fixes the cases, so these go to the final reviewer rather than becoming new cases.

1. **A name in cyrillic-ext or greek-ext characters,** such as "Ѣ" or "ἀ". Its face should be fetched on demand and drawn in Inter. The room's paint case reads the other subsets (R8), not these two.
2. **A font that fails (a 404, the network down).** The page should stay drawn in the fallback, usable, with no error beyond the failed request. No case blocks a font for good.
3. **Markup rendered outside the wrapper,** such as a portal or an element added to `body`. It gets the reset, not today's cascade. Nothing does this today; a slice that adds one should know.
4. **Firefox ESR 140.** `revert-layer` and `@import … layer()` are older than ESR 140, and `interpolate-size` is unsupported there and harmless. The suite runs a current Firefox, not the ESR.
5. **The dev rewrite with an unusual checkout path,** such as one holding a space, or Windows (R9). The `/@fs/` href should still name the file. Only Task 3's dev check runs it, on this machine.

---

### Task 0: Commit the plan

**Files:**
- Create: `docs/superpowers/plans/2026-10-22-ui-refresh-4c1-foundation.md`

- [ ] **Step 1: Commit**

```bash
git add docs/superpowers/plans/2026-10-22-ui-refresh-4c1-foundation.md
git commit -m "docs: plan the stylesheets and the fonts (ui refresh step 4c1-foundation)"
```

### Task 1: The layers, the reset and the fence (decisions 2 and 3)

**Files:**
- Create: `frontend/src/reset.css`, `frontend/src/base.css`, `e2e/fonts.spec.js`
- Modify: `frontend/src/main.tsx`, `frontend/index.html`, `frontend/src/components/App.tsx`, `.github/dependabot.yml`

**Interfaces:**
- Produces: `base.css`, which Task 2 adds the two unlayered rules to; `e2e/fonts.spec.js`, which Tasks 2 and 3 add cases to.

- [ ] **Step 1: Keep today's build for Task 5's diff**

Run: `npm run pree2e && rm -rf "$W/before-dist" && cp -r frontend/dist "$W/before-dist"`
Expected: the build and the stage succeed; `$W/before-dist/index.html` exists.

- [ ] **Step 2: Write the fence's case**

Create `e2e/fonts.spec.js`:

```js
import { test, expect, defaultRoleChoice, nameInput } from './fixtures.js'

// The reset sits above Bootstrap; the fence in base.css gives today's markup today's cascade back.
test("today's lobby stays centred and keeps Bootstrap's form spacing", async ({ page, origin }) => {
  await page.goto(`${origin}/`)
  const heading = await page.getByRole('heading', { name: 'Create Room' }).boundingBox()
  const right = page.viewportSize().width - heading.x - heading.width
  expect(Math.abs(heading.x - right)).toBeLessThan(1)
  const name = await nameInput(page).boundingBox()
  const role = await defaultRoleChoice(page).boundingBox()
  // The name row's form-group margin, 1rem.
  expect(role.y - name.y - name.height).toBeCloseTo(16, 0)
})
```

- [ ] **Step 3: Run it on today's code**

Run: `npx playwright test e2e/fonts.spec.js`
Expected: PASS in both browsers. It holds today's layout; Step 5 is its RED.

- [ ] **Step 4: Add the reset and the layers, without the fence**

- `frontend/src/reset.css`: the reset as published at https://www.joshwcomeau.com/css/custom-css-reset/ (last updated June 3rd, 2026), its numbered comments kept. Remove item 5, the `-webkit-font-smoothing: antialiased;` declaration and its comment. Keep `#root, #__next`. Open the file with one comment naming the source, the public-domain release and the removal.
- `frontend/src/base.css`: a one-line comment, then `@layer legacy, base;`, then these imports in order: `'bootstrap/dist/css/bootstrap.min.css' layer(legacy)`, `'./styles.css' layer(legacy)`, `'./reset.css' layer(base)`, `'./colours.css'`, `'./tokens.css'`.
- `frontend/src/main.tsx`: replace the Bootstrap and `styles.css` imports with `import './base.css'`, and read `document.getElementById('root')`.
- `frontend/index.html`: the root becomes `<div id="root"></div>`, with no class.
- `App.tsx`: the returned fragment becomes `<div className="container legacy-page">`, with a comment: "// Today's markup, fenced from the reset in base.css; each 4c1 slice moves what it replaces out."

- [ ] **Step 5: Watch the case fail**

Run: `npm run build && npx playwright test e2e/fonts.spec.js`
Expected: FAIL in both browsers on the centring. The reset's `margin: 0` removes `.container`'s auto margins and the column's offset.

- [ ] **Step 6: Add the fence**

Append the fence (Global Constraints) to `base.css`, after every import, formatted one selector per line. Put a comment above it: "/* From inside base, revert-layer falls back to legacy, today's cascade; keep this the last rule in base. */"

- [ ] **Step 7: Watch it pass, and check the fence is last in base**

Run: `npm run build && npx playwright test e2e/fonts.spec.js`
Expected: PASS in both browsers.

Run: `node -e "const d='frontend/dist/assets/',fs=require('fs'),c=fs.readFileSync(d+fs.readdirSync(d).find(n=>n.endsWith('.css')),'utf8'),i=c.indexOf('all:revert-layer');console.log(c.split('all:revert-layer').length-1,c.indexOf('@layer base',i),c.lastIndexOf('isolation:isolate')<i)"`
Expected: `1 -1 true`. That is one fence, no `base` block after it, and the reset's last rule before it.

- [ ] **Step 8: Reword the Dependabot comment**

In `.github/dependabot.yml`, the Bootstrap pin's comment becomes: `# Bootstrap 5 would break today's pages, which step 4c2 replaces, removing Bootstrap.`

- [ ] **Step 9: Run every check**

Run: `npx playwright test > "$W/t1-e2e.log" 2>&1; tail -5 "$W/t1-e2e.log"; npm run test:unit && npm run typecheck && npm run lint && npx prettier --check --single-quote --no-semi --print-width 100 --trailing-comma none --arrow-parens avoid e2e/*.js`
Expected: every e2e case passes in both browsers, the unit tests pass, and there is no typecheck, lint or prettier output beyond prettier's all-clear.

- [ ] **Step 10: Commit**

```bash
git add frontend/src/reset.css frontend/src/base.css frontend/src/main.tsx frontend/index.html \
  frontend/src/components/App.tsx e2e/fonts.spec.js .github/dependabot.yml
git commit -m "feat: layer today's CSS beneath a reset and fence it off (ui refresh step 4c1-foundation)"
```

### Task 2: The fonts (decisions 4, 5 and 8)

**Files:**
- Create: `frontend/src/fonts.css`
- Modify: `package.json`, `package-lock.json`, `frontend/src/main.tsx`, `frontend/index.html`, `frontend/src/base.css`, `frontend/src/components/RoomHeader.tsx`, `docs/design/ui-reference.md`
- Test: `e2e/fonts.spec.js`

**Interfaces:**
- Consumes: `base.css` (Task 1).
- Produces: `fonts.css`, which Task 3 opens with the licence comment. In `e2e/fonts.spec.js`, the helpers `settle(page)`, `painted(page, locator)`, `faceStatus(page, family, char)` and `expectPainted(page, browserName, locator, family, chars)`.

- [ ] **Step 1: Add the helpers and the three font cases**

Extend the import to `test, expect, defaultRoleChoice, defaultRoleRadio, inRoom, nameInput, participantEntry`. Add, above the fence's case:

```js
// Every font the page asked for has settled, and two frames have been drawn since.
const settle = page =>
  page.evaluate(() =>
    document.fonts.ready.then(
      () => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))
    )
  )

// Chromium only: the fonts that drew a node's text, found for the protocol by a probe attribute.
const painted = async (page, locator) => {
  await locator.evaluate(el => el.setAttribute('data-font-probe', ''))
  const cdp = await page.context().newCDPSession(page)
  try {
    await cdp.send('DOM.enable')
    await cdp.send('CSS.enable')
    const { root } = await cdp.send('DOM.getDocument')
    const selector = '[data-font-probe]'
    const { nodeId } = await cdp.send('DOM.querySelector', { nodeId: root.nodeId, selector })
    const { fonts } = await cdp.send('CSS.getPlatformFontsForNode', { nodeId })
    return fonts.map(({ familyName, isCustomFont }) => ({ familyName, isCustomFont }))
  } finally {
    await cdp.detach()
    await locator.evaluate(el => el.removeAttribute('data-font-probe'))
  }
}

// The status of the family's face whose unicode-range covers char; Firefox keeps the quotes.
const faceStatus = (page, family, char) =>
  page.evaluate(
    ([family, code]) => {
      const covers = range =>
        range.split(',').some(part => {
          const [from, to = from] = part.trim().slice(2).split('-').map(hex => parseInt(hex, 16))
          return code >= from && code <= to
        })
      const face = [...document.fonts].find(
        f => f.family.replace(/"/g, '') === family && covers(f.unicodeRange)
      )
      return face?.status ?? 'none'
    },
    [family, char.codePointAt(0)]
  )

// The name each file gives itself, as the protocol reports it (checked).
const fileName = { Inter: 'Inter', 'JetBrains Mono': 'JetBrains Mono Medium' }
// Every font that drew the node is the web font; in Firefox, the face for each of chars has loaded.
const expectPainted = async (page, browserName, locator, family, chars) => {
  if (browserName !== 'chromium') {
    for (const char of chars) expect(await faceStatus(page, family, char), char).toBe('loaded')
    return
  }
  const fonts = await painted(page, locator)
  expect(fonts).not.toEqual([])
  for (const font of fonts) expect(font).toEqual({ familyName: fileName[family], isCustomFont: true })
}

test('the lobby is drawn in Inter', async ({ page, origin, browserName }) => {
  await page.goto(`${origin}/`)
  await expect(nameInput(page)).toBeVisible()
  await settle(page)
  const heading = page.getByRole('heading', { name: 'Create Room' })
  await expectPainted(page, browserName, heading, 'Inter', 'a')
  await expectPainted(page, browserName, page.getByText('User name'), 'Inter', 'a')
})

test('the room is drawn in Inter, a name in other scripts too, and the room id in JetBrains Mono', async ({
  join,
  room,
  browserName
}) => {
  // Latin-ext, cyrillic, greek and vietnamese, each a face of its own.
  const name = 'Łukasz Дмитрий Νίκος Nguyễn'
  const { page } = await join(name)
  await settle(page)
  await expectPainted(page, browserName, page.getByRole('link', { name: 'Leave' }), 'Inter', 'a')
  const cell = participantEntry(page, name).getByRole('cell', { name, exact: true })
  await expectPainted(page, browserName, cell, 'Inter', 'ŁДΝễ')
  const id = page.getByRole('heading', { name: room, exact: true })
  await expectPainted(page, browserName, id, 'JetBrains Mono', 'a')
})

test("two preloads name the stylesheet's font files, each fetched once", async ({
  page,
  origin,
  room
}) => {
  const fetched = {}
  page.on('request', request => {
    const { pathname } = new URL(request.url())
    if (pathname.endsWith('.woff2')) fetched[pathname] = (fetched[pathname] ?? 0) + 1
  })
  // Joined in place, so both preloaded files are used in this one document.
  await page.goto(`${origin}/${room}`)
  await nameInput(page).fill('Alice')
  await defaultRoleRadio(page, 'Voter').check()
  await page.getByRole('button', { name: 'Join' }).click()
  await expect(inRoom(page)).toBeVisible()
  await settle(page)
  const preloads = await page.locator('link[rel=preload]').evaluateAll(links =>
    links.map(l => ({
      path: new URL(l.href).pathname,
      as: l.getAttribute('as'),
      type: l.getAttribute('type'),
      crossorigin: l.hasAttribute('crossorigin')
    }))
  )
  const faces = await page.evaluate(() =>
    [...document.styleSheets]
      .flatMap(sheet => [...sheet.cssRules])
      .filter(rule => rule instanceof CSSFontFaceRule)
      .map(rule => {
        const src = /url\("?([^")]+)"?\)/.exec(rule.style.getPropertyValue('src'))[1]
        return new URL(src, rule.parentStyleSheet.href).pathname
      })
  )
  expect(preloads).toHaveLength(2)
  for (const preload of preloads) {
    expect(preload).toMatchObject({ as: 'font', type: 'font/woff2', crossorigin: true })
    expect(faces).toContain(preload.path)
    const response = await page.request.get(`${origin}${preload.path}`)
    expect(response.headers()['content-type']).toBe('font/woff2')
  }
  expect(fetched).toEqual(Object.fromEntries(preloads.map(({ path }) => [path, 1])))
})

test('a held-back Inter draws the fallback, then Inter once it arrives', async ({
  page,
  origin,
  browserName
}) => {
  let release
  const held = new Promise(resolve => (release = resolve))
  await page.route('**/assets/inter-latin-wght-normal-*.woff2', async route => {
    await held
    await route.continue()
  })
  // fonts.ready never resolves while the font is held, so the fallback is read first.
  await page.goto(`${origin}/`, { waitUntil: 'commit' })
  await expect(nameInput(page)).toBeVisible()
  await expect.poll(() => faceStatus(page, 'Inter', 'a')).toBe('loading')
  const heading = page.getByRole('heading', { name: 'Create Room' })
  if (browserName === 'chromium') {
    for (const font of await painted(page, heading)) expect(font.isCustomFont).toBe(false)
  }
  release()
  await settle(page)
  await expectPainted(page, browserName, heading, 'Inter', 'a')
})
```

- [ ] **Step 2: Watch them fail**

Run: `npm run build && npx playwright test e2e/fonts.spec.js`
Expected: the four new cases FAIL in both browsers; the fence's case passes.
- The paint cases see the system font in Chromium, and the face status `none` in Firefox.
- The preload case finds no preload.
- The held-back case times out waiting for `loading`.

- [ ] **Step 3: Add the packages**

Run: `npm install @fontsource-variable/inter@5.3.0 @fontsource/jetbrains-mono@5.3.0`
Expected: both appear in `package.json`'s `dependencies` as `^5.3.0`, beside Bootstrap.

- [ ] **Step 4: Write `frontend/src/fonts.css`**

- **Inter:** one `@font-face` per subset, in the package's `wght.css` order: cyrillic-ext, cyrillic, greek-ext, greek, vietnamese, latin-ext, latin. Each face is:
  - `font-family: 'Inter'; font-style: normal; font-display: swap; font-weight: 100 900;`
  - `src: url(@fontsource-variable/inter/files/inter-<subset>-wght-normal.woff2) format('woff2');`
  - `unicode-range:` copied from that subset's face in `node_modules/@fontsource-variable/inter/wght.css`.
- **JetBrains Mono:** one face, `font-family: 'JetBrains Mono'; font-style: normal; font-display: swap; font-weight: 500;` with `src: url(@fontsource/jetbrains-mono/files/jetbrains-mono-latin-500-normal.woff2) format('woff2');`, and the latin `unicode-range` from `node_modules/@fontsource/jetbrains-mono/500.css`.
- Each subset's comment, as in the package (`/* inter-latin-wght-normal */`), may stay. No other rule.

- [ ] **Step 5: Import it, apply it, preload it**

- `main.tsx`: `import './fonts.css'` becomes the first line, before `import './base.css'`.
- `base.css`, after the fence:

```css
/* Unlayered, so the fence leaves them; they move to page.css and room-header.css in 4c1-wide. */
body { font-family: var(--font-sans); }
.room-header-id { font-family: var(--font-mono); }
```

- `RoomHeader.tsx`: the room id's `<h5>` becomes `className="card-title room-header-id"`.
- `index.html`, in `<head>` after the title:

```html
    <link rel="preload" href="../node_modules/@fontsource-variable/inter/files/inter-latin-wght-normal.woff2" as="font" type="font/woff2" crossorigin>
    <link rel="preload" href="../node_modules/@fontsource/jetbrains-mono/files/jetbrains-mono-latin-500-normal.woff2" as="font" type="font/woff2" crossorigin>
```

- [ ] **Step 6: Watch them pass**

Run: `npm run build && grep -o 'href="/assets/[^"]*woff2"' frontend/dist/index.html && npx playwright test e2e/fonts.spec.js`
Expected: two hrefs, `/assets/inter-latin-wght-normal-<hash>.woff2` and `/assets/jetbrains-mono-latin-500-normal-<hash>.woff2`. Every case passes in both browsers.

- [ ] **Step 7: Reword J7's last line and log the reopening**

In `docs/design/ui-reference.md`:
- J7's last bullet, "Step 4 keeps a late font load from shifting the page.", becomes: "A late font swaps in once; the latin file is preloaded, so a normal load draws Inter from the first paint."
- In the Decisions log, after the **4b.** entry, add:

```markdown
- **4c1-foundation.** The stylesheets and the fonts (the UI refresh design's
  step 4c1-foundation) reopened J7's "Step 4 keeps a late font load from
  shifting the page", which had no recorded reason. The room is one page view
  kept for a whole meeting, so `font-display: optional` would draw it in the
  fallback for all of that meeting after one slow load; a late font now swaps in
  once. Set aside: `optional`; `block`, which hides late text up to about 3 s
  and jumps just the same; a fallback scaled to Inter's size, which narrows the
  jump without removing it.
```

- [ ] **Step 8: Run every check**

Run: as Task 1, Step 9, with the log at `$W/t2-e2e.log`.
Expected: as Task 1, Step 9.

- [ ] **Step 9: Commit**

```bash
git add package.json package-lock.json frontend/src/fonts.css frontend/src/main.tsx frontend/index.html \
  frontend/src/base.css frontend/src/components/RoomHeader.tsx e2e/fonts.spec.js docs/design/ui-reference.md
git commit -m "feat: serve Inter and JetBrains Mono from the app (ui refresh step 4c1-foundation)"
```

### Task 3: The licences and dev (decisions 6 and 7)

**Files:**
- Modify: `frontend/vite.config.ts`, `frontend/src/fonts.css`, `src/main/scala/com/lunatech/pointingpoker/PageRoutes.scala`
- Test: `e2e/fonts.spec.js`; a scratch `$W/devcheck.mjs`

**Interfaces:**
- Consumes: `fonts.css` and the preloads (Task 2).
- Produces: `/assets/inter-OFL.txt` and `/assets/jetbrains-mono-OFL.txt` in the build.

- [ ] **Step 1: Write the licence case**

Add to `e2e/fonts.spec.js`:

```js
test('the stylesheet opens with the licence comment, and its files are served', async ({
  page,
  origin
}) => {
  await page.goto(`${origin}/`)
  const href = await page.locator('link[rel=stylesheet]').getAttribute('href')
  const css = await (await page.request.get(new URL(href, origin).href)).text()
  expect(css.startsWith('/*!')).toBe(true)
  const named = css.slice(0, css.indexOf('*/')).match(/\/assets\/[a-z-]+-OFL\.txt/g)
  expect(named).toEqual(['/assets/inter-OFL.txt', '/assets/jetbrains-mono-OFL.txt'])
  for (const path of named) {
    const response = await page.request.get(`${origin}${path}`)
    expect(response.status()).toBe(200)
    expect(response.headers()['content-type']).toMatch(/^text\/plain/)
    expect(await response.text()).toContain('SIL Open Font License')
  }
})
```

- [ ] **Step 2: Watch it fail**

Run: `npm run build && npx playwright test e2e/fonts.spec.js -g "licence comment"`
Expected: FAIL in both browsers. The built CSS opens with no `/*!` comment, since Bootstrap's banner is dropped once it is layered.

- [ ] **Step 3: The comment and the plugin**

- `fonts.css` opens with this line, verbatim:
  `/*! Inter and JetBrains Mono, SIL Open Font License 1.1: /assets/inter-OFL.txt, /assets/jetbrains-mono-OFL.txt */`
- `vite.config.ts`: add a plugin after `react()`, `{ name: 'font-licences', generateBundle, transformIndexHtml }`, with a one-line comment.
  - `generateBundle()` calls `this.emitFile({ type: 'asset', fileName: 'assets/<name>', source })` for `inter-OFL.txt` from `../node_modules/@fontsource-variable/inter/LICENSE` and `jetbrains-mono-OFL.txt` from `../node_modules/@fontsource/jetbrains-mono/LICENSE`. Each path is read with `readFileSync(new URL(path, import.meta.url))`.
  - `transformIndexHtml` comes in Step 6.

- [ ] **Step 4: Watch it pass**

Run: `npm run build && head -c 120 frontend/dist/assets/index-*.css && npx playwright test e2e/fonts.spec.js`
Expected: the CSS opens with the comment, and every case passes in both browsers.

- [ ] **Step 5: Watch dev paint the fallback**

Start, in the background, `sbt run` (port 8080) and `node node_modules/vite/bin/vite.js frontend --port 5173 --strictPort`. Note both PIDs.

Write `$W/devcheck.mjs`, a scratch Chromium script against `http://localhost:5173`:
- Read the lobby's "Create Room" heading with `painted`'s protocol read.
- Fill the name "Łukasz" and press Create, then wait for the `room` test id.
- Read the room id heading (named by the URL's last segment) and the "Łukasz" cell the same way.
- Log each node's `[familyName, isCustomFont]` pairs and any console error.

Run: `node "$W/devcheck.mjs"`
Expected (the spike): every entry has `isCustomFont` false, the preload left as `../node_modules/…`.

- [ ] **Step 6: The dev rewrite**

In the plugin: `transformIndexHtml(html, ctx)` returns `html` unchanged when `ctx.server` is undefined. Otherwise it replaces every `href="../node_modules/` with `href="/@fs<modules>`. `<modules>` is `normalizePath(fileURLToPath(new URL('../node_modules/', import.meta.url)))`, with `normalizePath` imported from `vite`, and a `/` put before it when it does not start with one (R9). The comment says Vite's dev server does not rewrite a preload href.

Restart the Vite process (kill it by its PID, start it again), then run: `node "$W/devcheck.mjs"`
Expected: the heading and the cell `Inter`/true only; the room id `JetBrains Mono Medium`/true only; no console error. Kill both processes by PID; never `pkill -f`. Keep the log for the PR body.

- [ ] **Step 7: Reword `PageRoutes`' `immutable` comment**

```scala
  // Asset names carry a content hash, so a cached copy never goes stale. The font licences keep
  // fixed names, so a changed licence reaches a cached browser late (ui refresh step 4c1-foundation).
```

- [ ] **Step 8: Run every check**

Run: `npm run pree2e`, then as Task 1, Step 9, with the log at `$W/t3-e2e.log`.
Expected: as Task 1, Step 9.

- [ ] **Step 9: Commit**

```bash
git add frontend/vite.config.ts frontend/src/fonts.css e2e/fonts.spec.js \
  src/main/scala/com/lunatech/pointingpoker/PageRoutes.scala
git commit -m "feat: ship the font licences beside the files and paint the fonts in dev (ui refresh step 4c1-foundation)"
```

### Task 4: The gate's rule (decision 9)

**Files:**
- Modify: `frontend/src/design/gate.ts`, `frontend/src/design/gate.test.ts`, `frontend/src/design/tokens.gate.test.ts`

**Interfaces:**
- Produces, in `gate.ts`: `literalProblems(css: string): string[]`. Each problem reads `<what> in <where>`. `<what>` is `a px`, `a hex colour`, `the colour <word>` (as written) or `<function>()`. `<where>` is `<prop>: <value>` or `@<name> <params>`.

- [ ] **Step 1: Write the unit cases**

In `gate.test.ts`, import `literalProblems` and add:

```ts
describe('keeping literals out of the stylesheets', () => {
  it('passes tokens, rem and the colours a theme cannot set', () => {
    const css = '.a { color: var(--ink); margin: 1rem; background: transparent; border-color: currentColor; outline-color: CanvasText }'
    expect(literalProblems(css)).toEqual([])
  })

  it('ignores comments, strings and url()', () => {
    const css = "/* 1px red */ .a { content: 'red 1px'; background: url(red-1px.png); font-family: 'Inter' }"
    expect(literalProblems(css)).toEqual([])
  })

  it.each([
    ['.a { margin: 1px }', 'a px in margin: 1px'],
    ['.a { margin: 1PX }', 'a px in margin: 1PX'],
    ['@media (max-width: 600px) { }', 'a px in @media (max-width: 600px)'],
    ['.a { color: #fff }', 'a hex colour in color: #fff'],
    ['.a { color: Red }', 'the colour Red in color: Red'],
    ['.a { --x: rgb(0 0 0) }', 'rgb() in --x: rgb(0 0 0)'],
    ...['rgba', 'hsl', 'hsla', 'hwb', 'lab', 'lch', 'oklab', 'oklch', 'color'].map((f): [string, string] => [
      `.a { color: ${f}(0 0 0) }`,
      `${f}() in color: ${f}(0 0 0)`
    ])
  ])('reports %s', (css, problem) => {
    expect(literalProblems(css)).toEqual([problem])
  })
})
```

- [ ] **Step 2: Watch them fail**

Run: `npm run test:unit -- gate.test`
Expected: FAIL, `literalProblems` is not exported.

- [ ] **Step 3: Implement `literalProblems` in `gate.ts`**

- Use `postcss.parse` with `walkDecls` and `walkAtRules`; the at-rules read are `media`, `container` and `supports` (R3).
- Walk each value with `valueParser(...).walk`, returning `false` on a `url` function so its inside is skipped. String nodes are never words.
- Match units with `valueParser.unit`, lower-cased.
- The named colours are a `Set` of CSS Color 4's named colours, lower-case, with a one-line comment citing the list. `transparent` and `currentcolor` are not in it, and no system colour is.
- Problems are de-duplicated, as in `tokenProblems`.
- Above the function, a comment: "// Every stylesheet but the token files and styles.css: no literal colour and no px (4c1-foundation)."

- [ ] **Step 4: Watch them pass**

Run: `npm run test:unit -- gate.test`
Expected: PASS.

- [ ] **Step 5: The real files' cases**

In `tokens.gate.test.ts`, add `readdirSync` and `literalProblems`. List every `.css` under `frontend/src` (`readdirSync(<src>, { recursive: true })`), except the root's `colours.css`, `tokens.css` and `styles.css`. Then add:

```ts
  it("reads the foundation's stylesheets", () => {
    expect(stylesheets).toEqual(expect.arrayContaining(['base.css', 'fonts.css', 'reset.css']))
  })

  it.each(stylesheets)('keeps literal colours and px out of %s', file => {
    expect(literalProblems(read(file))).toEqual([])
  })
```

The comment on the list: "// Every stylesheet but the token files and today's styles.css, which each slice replaces."

- [ ] **Step 6: Run every check**

Run: `npm run test:unit && npm run typecheck && npm run lint`
Expected: every unit case passes, the three real files among them; no typecheck or lint output.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/design/gate.ts frontend/src/design/gate.test.ts frontend/src/design/tokens.gate.test.ts
git commit -m "test: keep literal colours and px out of the stylesheets (ui refresh step 4c1-foundation)"
```

### Task 5: The mutations and the computed-style diff (the spec's Contract)

**Files:** none committed. Each mutation is reverted with `git checkout -- <file>` before the next.

- [ ] **Step 1: Run each mutation**

For each row: make the change, run `npm run build` (except the gate's rows), then run the command. Read the failing cases, revert, and write one ledger line.

| Mutation | Command | Must fail |
| --- | --- | --- |
| `main.tsx` without `import './fonts.css'` | `npx playwright test e2e/fonts.spec.js` | the two paint cases, the preload case, the held-back case, the licence case; both browsers |
| `base.css` without the `body` rule | same | the two paint cases; both browsers |
| `RoomHeader.tsx` without `room-header-id` | same | the room's paint case; both browsers |
| `fonts.css` without the latin-ext face | same | the room's paint case; both browsers |
| `fonts.css` without the cyrillic face | same | the room's paint case; both browsers |
| `fonts.css` with the vietnamese face's `unicode-range` cut to its first range | same | the room's paint case; both browsers |
| both preload hrefs without `../node_modules/` | same | the preload case |
| the Mono preload removed | same | the preload case |
| `crossorigin` removed from both preloads | same | the preload case |
| `font-display: optional` on the latin Inter face | same | the held-back case; both browsers |
| `main.tsx` importing `base.css` before `fonts.css` | same | the licence case |
| the `font-licences` plugin removed from `vite.config.ts` | same | the licence case |
| the fence removed | same | the fence's case; both browsers |
| the fence's `@layer base` renamed `@layer fence` | same | the fence's case; both browsers |
| `margin: 1px` planted in `reset.css` | `npm run test:unit` | 'keeps literal colours and px out of reset.css' |
| `color: #fff` planted in `reset.css` | same | same |
| `color: red` planted in `reset.css` | same | same |

Then rebuild the unmutated tree: `git status --short` shows nothing, and `npm run build` succeeds.

- [ ] **Step 2: Write the computed-style diff**

Write `$W/stylediff.mjs`:

```js
import { chromium } from '<repo>/node_modules/playwright/index.mjs'
import { startApp } from '<repo>/testkit/app.js'
// Today's pages before and after, each element and its ::before and ::after, at rest, hovered and focused.
const [beforeIndex, afterIndex, neutral] = process.argv.slice(2)
const browser = await chromium.launch()
const snapshot = page => page.evaluate(() => {
  const root = document.getElementById('root') ?? document.getElementById('app')
  // Before, the root is the box; after, the wrapper is, and the paths below it drop its level.
  const box = root.id === 'root' ? root.firstElementChild : root
  const read = (el, pseudo) => { const cs = getComputedStyle(el, pseudo), o = {}
    for (const p of cs) if (!p.startsWith('--')) o[p] = cs.getPropertyValue(p); return o }
  const out = {}
  const add = (key, el) => { out[key] = read(el); out[`${key}::before`] = read(el, '::before'); out[`${key}::after`] = read(el, '::after') }
  add('html', document.documentElement); add('body', document.body); add('root', root); add('box', box)
  const walk = (el, path) => [...el.children].forEach((c, i) => { const k = `${path}>${c.localName}:${i}`; add(k, c); walk(c, k) })
  walk(box, 'box')
  return out
})
const capture = async (index, visit) => {
  const app = await startApp({ env: { INDEX_PATH: index } })
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } })
  const shots = {}
  const shoot = async name => { await page.mouse.move(0, 0); shots[name] = await snapshot(page) }
  const states = async prefix => {
    if (neutral) await page.addStyleTag({ content: '*, *::before, *::after { font-family: monospace !important }' })
    await page.evaluate(() => document.fonts.ready)
    await shoot(`${prefix} rest`)
    for (const [i, button] of (await page.getByRole('button').all()).entries()) {
      const b = await button.boundingBox(); if (!b) continue
      await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2); shots[`${prefix} hover ${i}`] = await snapshot(page)
      await button.focus(); await shoot(`${prefix} focus ${i}`); await button.evaluate(el => el.blur())
    }
  }
  await visit(page, app.baseUrl, states)
  await page.close(); await app.stop()
  return shots
}
const visit = async (page, base, states) => {
  await page.goto(`${base}/`); await page.getByLabel('User name').waitFor(); await states('create')
  await page.getByRole('link', { name: 'Join' }).click(); await states('join')
  const room = (await (await fetch(`${base}/create-room`, { method: 'POST' })).text()).trim()
  await page.goto(`${base}/${room}`); await page.getByLabel('User name').fill('Alice')
  await page.getByRole('radio', { name: 'Voter', exact: true }).check()
  await page.getByRole('button', { name: 'Join' }).click(); await page.getByTestId('room').waitFor(); await states('room')
}
const [a, b] = [await capture(beforeIndex, visit), await capture(afterIndex, visit)]
const tally = {}
for (const state of new Set([...Object.keys(a), ...Object.keys(b)])) {
  const [sa, sb] = [a[state] ?? {}, b[state] ?? {}]
  for (const key of new Set([...Object.keys(sa), ...Object.keys(sb)])) {
    if (!sa[key] || !sb[key]) { tally[`unpaired ${key}`] = 1; continue }
    for (const p in sa[key]) if (sa[key][p] !== sb[key][p]) {
      const k = `${key.startsWith('box>') ? 'element' : key} ${p}: ${sa[key][p]}  →  ${sb[key][p]}`
      tally[k] = (tally[k] ?? 0) + 1
    }
  }
}
for (const [k, n] of Object.entries(tally).sort()) console.log(n, k)
await browser.close()
```

(`<repo>` is the checkout's absolute path. A line is labelled `html`, `body`, `root`, `box` or one of their pseudo-elements, or `element` for anything inside the box. The room id differs between the two runs only in text, which no computed style holds.)

- [ ] **Step 3: Run it with the fonts neutralised**

Run: `node "$W/stylediff.mjs" "$W/before-dist/index.html" "$PWD/frontend/dist/index.html" neutral`
Expected, counts aside, and nothing else:
- `root isolation: auto → isolate`;
- `root` lines for `width`, `max-width`, the margins and the paddings, physical and logical, and `perspective-origin` and `transform-origin`, which follow the width. These are the root losing `.container` to the wrapper;
- `interpolate-size: numeric-only → allow-keywords`, on any label, from the reset's `html` rule, which every element inherits;
- no `box` line and no `unpaired` line.

- [ ] **Step 4: Run it as served**

Run: `node "$W/stylediff.mjs" "$W/before-dist/index.html" "$PWD/frontend/dist/index.html"`
Expected: Step 3's lines, plus only `font-family` lines, Inter's and the room id's Mono, and size lines (`width`, `height`, `inline-size`, `block-size`, `perspective-origin`, `transform-origin`) on elements whose text the font change re-measures.

A line outside these is a finding: stop and rule on it against decision 3 before the final review. Keep both outputs for the PR body.

- [ ] **Step 5: Ledger**

One line per mutation, the dev check's two logs (Task 3) and both diffs' summaries.
