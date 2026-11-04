# UI Refresh Step 4d: The Not-a-Room Page, Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The not-a-room page becomes a React view drawn as 3b4's mockup draws it, handed the typed name and the suggestion by a meta element the server inserts into the shell.

**Architecture:** `main.tsx` looks for the hand-over first: with one it renders `NotARoom` in `LobbyPage` and creates no connection; without one it runs as today. `App` reads the join flag beside `moved` and `restarted`. `PageRoutes` answers a name outside the vocabulary with the shell, read as text, the meta inserted before `</head>` by `indexOf`.

**Tech Stack:** React 19, TypeScript; Scala 3, Pekko HTTP, OWASP encoder; ScalaTest; Playwright (Chromium and Firefox).

**Spec:** `docs/superpowers/specs/2026-10-31-ui-refresh-4d-not-a-room-design.md`

## How this plan was verified

- **Checked in the code:**
  - `main.tsx` creates the connection at module level, then renders `<App connection>` in `StrictMode`. `App.tsx`'s module code reads `moved` and `restarted` into `params` and calls `history.replaceState(null, '', window.location.pathname)` when either is set; `tab` starts as `pathRoom ? 'join' : 'create'`.
  - The page's look exists: `.lobby-page-title` (with its `code` rule), `.lobby-page-lead` and `.lobby-page-panel .button` in `lobby-page.css`, `.room-row-go-primary` in `room-row.css` (forced colours included), `.button-primary` and `.button-outline` in `frontend/src/components/looks.css`, imported by `base.css`. No stylesheet changes.
  - `RoomRow` takes `id`, `line2`, `href`, `onClick`; its arrow is `span.room-row-go`. `LobbyPage` takes `ended`, `banners: ReactNode`, `children`.
  - `PageRoutes.index` holds the per-request exists check and the 503 `notBuilt` response; the not-a-room branch is `revalidated(complete(notARoom(raw)))`, with no built check. `Suggestion.suggest(raw)` returns an `Option[Slug]`.
  - `APISpec`'s `fixtureIndex` is `<!DOCTYPE html><html><body>fixture index</body></html>`; `missingRoute` serves a missing index.
  - Playwright starts the staged launcher (`testkit/app.js`), so a server change needs `sbt "; coverageOff; Universal/stage"` before the browser cases; `npm run build` alone refreshes only the page.
  - The `visitor` fixture seeds storage by key (`{ name, defaultRole }`, as `roles.spec.js` does); `participantEntry` searches the Voters region. The join request is `POST /rooms/{roomId}/join`.
  - 'a name typed into the Join form is checked by the page route' looks up the link by `brave-golden-otter`, which the row's name "brave-golden-otter Join as Alice" still contains.

## Rulings this plan makes, for the user's review

- **R1. `main.tsx` reads the page's whole input at load** and hands it to `NotARoom` as props: `typed` (the meta's `content`), `suggestion` (its `data-suggestion`, `undefined` when absent) and `name` (the stored name, `''` when none). Set aside: `NotARoom` reading storage itself; props keep it pure, its input read once at load.
- **R2. Both branches render in `StrictMode`**, one `createRoot` before the branch. Set aside: `StrictMode` only around `App`, a difference with no reason.
- **R3. The row's href is `/${suggestion}`**, as decision 4 writes it. Set aside: `encodeURIComponent`, as `goTo` does for a typed id; the server writes only a slug here.
- **R4. `RoomRow` gains `primary?: boolean`**, adding `room-row-go-primary` to the arrow's span. Set aside: a `goClassName` prop, more open than the one use.
- **R5. `PageRoutes` gains `whenBuilt(route: => Route): Route`**, the exists check and the 503 moved out of `index`, which both pages wrap. Set aside: a second copy of the check in the not-a-room branch.
- **R6. `handOver(shell: String, raw: String): String` has no fallback for a shell without `</head>`**: the built shell always carries it (decision 3, checked), and a missing one answers 500. Set aside: appending the meta elsewhere, a path no build produces.

## Global Constraints

**Branch and commits:**
- Branch `20260930.ui_refresh_4d_not_a_room`, stacked on `20260930.ui_refresh_4c2_focus_ring` (#480). The spec is committed (a000ceb). New commits only: no amend, rebase or force-push, and nothing pushed until the user asks.
- Commit subjects, verbatim:
  - Task 0: `docs: plan the not-a-room page (ui refresh step 4d)`
  - Task 1: `feat: add the not-a-room view and the Join tab's flag (ui refresh step 4d)`
  - Task 2: `feat: hand the not-a-room page to the app (ui refresh step 4d)`
- No "Generated with Claude Code" or co-author line.

**Code:**
- Comments are one or two lines, with no em dash. TypeScript: no semicolons, single quotes, two-space indent, lines under about 100 characters. Scala: `sbt scalafmtAll` before each commit.
- The texts, verbatim: the sentence ` is not a valid room name.` after the `code`; `Did you mean`; line 2 `Join as ${name}` or `Join`; `Join a different room`; the title `Not a room name`.
- The meta, verbatim: `<meta name="not-a-room" content="<typed>" data-suggestion="<slug>">`, both values through `Encode.forHtml`, ` data-suggestion="…"` left out with no suggestion.

**Mutations:** apply the mutation, rebuild what it touched, run the case, see it FAIL on the named assertion, then revert it with `git checkout -- <file>`. The task's report names the mutation and its failing line. If the case passes under it, **stop and report**: the case goes back to the spec.

**Running:**
- Client checks: `npm run typecheck && npm run lint && npm run test:unit`. Server checks: `sbt styleCheck` and `sbt "testOnly com.lunatech.pointingpoker.APISpec"`.
- Browser: `npm run build`, and after a server change `sbt "; coverageOff; Universal/stage"`, then `npx playwright test e2e/<file> -g "<title>" --workers=1`. The default worker count ran the workstation out of memory on 2026-10-28.

## Review Focus

- The longest name and a name with bidi characters at 320 wide, with and without a suggestion, in both browsers: the `code` wraps anywhere and the sentence keeps its order (spec, Contract's last paragraph). By eye on the built page under `sbt run`, against `lobby.html?page=notaroom`.
- A typed name holding `&`, `<`, `"` or an entity such as `%26amp;`: the `h1` shows it as typed, the parser having decoded the attribute once (decision 2). By hand.
- Back to the page after the row's click: the page shows again, from the server or a cache (spec, States, Reload row). By hand in both browsers.
- `/?tab=join&moved=1`: the Join tab and the moved notice, the URL clean (decision 5). By hand.
- Firefox: the new cases run in both projects; a Firefox-only failure is a finding, not a flake to retry past.

---

### Task 0: The docs' changes and the plan

- [ ] **Step 1: The docs' changes**, as the spec's "The docs' changes" lists them:
  - Parent: after "4d, the not-a-room page", the spec's path in parentheses, as 4c2-focus-ring's sentence gives its own.
  - `docs/design/lobby.html`: `notARoom()`'s sentence reads `is not a valid room name.`; the "Join as" line becomes `if (line && stored) line.textContent = 'Join as ' + stored`, its comment saying untrimmed, as the app (4d decision 4).
  - `docs/design/ui-reference.md`: J13's sentence likewise; Open's "The not-a-room page's React shape" entry removed; a **4d.** log entry after 4c2-focus-ring's, for decisions 1, 2 and 7 with their set-asides, in the neighbours' style.
  - `docs/known-issues.md`: the `ProbeRoutes` order entry's "the "not a room name" rejection page" becomes "the not-a-room page", and its Resolution's "not the rejection page" becomes "not the not-a-room page".
- [ ] **Step 2:** Open `lobby.html?page=notaroom`, `lobby.html?page=notaroom&suggestion=` and `lobby.html?page=notaroom&stored=%20`: the new sentence on each; the row's "Join as Alice" on the first; "Join as " on the third, untrimmed.
- [ ] **Step 3: Commit** the four docs and this plan with Task 0's subject.

### Task 1: The view and the join flag

Judged by the existing cases unchanged: the server still answers its own page, so nothing renders `NotARoom` yet (spec, Branches and commits).

**Files:**
- Create: `frontend/src/components/NotARoom.tsx`
- Modify: `frontend/src/main.tsx`, `frontend/src/components/RoomRow.tsx`, `frontend/src/components/App.tsx`

**Interfaces:**
- Produces: `NotARoom({ typed, suggestion, name }: { typed: string; suggestion?: string; name: string })`; `RoomRow`'s `primary?: boolean` (R4); the hand-over read as `document.querySelector<HTMLMetaElement>('meta[name="not-a-room"]')`.

- [ ] **Step 1: `RoomRow`'s `primary`** (R4).
- [ ] **Step 2: `NotARoom`.** Renders `<LobbyPage ended={false} banners={null}>` holding, in order: `<h1 className="lobby-page-title"><code><bdi>{typed}</bdi></code> is not a valid room name.</h1>`; with a suggestion, `<p className="lobby-page-lead">Did you mean</p>` and `<RoomRow id={suggestion} href={`/${suggestion}`} line2={name ? `Join as ${name}` : 'Join'} primary />`; then `<a className={`button ${suggestion ? 'button-outline' : 'button-primary'}`} href="/?tab=join">Join a different room</a>`. One comment above the function: the not-a-room page (4d decision 4), fixed at load, so it holds no state.
- [ ] **Step 3: `main.tsx` splits.** Reads the hand-over first. With one: `document.title = 'Not a room name'` and renders `NotARoom` with R1's props. Without one: creates the connection, its comment kept, and renders `App` as today. One `createRoot`, `StrictMode` in both (R2). The hand-over's comment: with one, no connection and no `App`, which would join the typed path on mount (4d decision 1).
- [ ] **Step 4: `App` reads the join flag.** `const joinTabOnLoad = params.get('tab') === 'join'`; it joins the `replaceState` condition; `tab` starts as `pathRoom || joinTabOnLoad ? 'join' : 'create'`. The flags' comment names the not-a-room page among their setters, in one or two lines.
- [ ] **Step 5: Run the checks and the cases.** Client checks; then `npm run build` and `sbt "; coverageOff; Universal/stage"` (the stage may predate this branch), and `e2e/slug.spec.js`, `e2e/lobby.spec.js` and `e2e/refusal.spec.js` whole in both projects. Expected: PASS, no case edited.
- [ ] **Step 6:** Under `sbt run`, open `/?tab=join`: the Join tab current and the URL `/`.
- [ ] **Step 7: Commit** the four files with Task 1's subject.

### Task 2: The server's hand-over and the cases

**Files:**
- Modify: `src/main/scala/com/lunatech/pointingpoker/PageRoutes.scala`, `src/test/scala/com/lunatech/pointingpoker/APISpec.scala`, `e2e/slug.spec.js`

**Interfaces:**
- Consumes: Task 1's hand-over reading and `NotARoom`.
- Produces: `PageRoutes`' `whenBuilt(route: => Route): Route` (R5), `notARoom(raw: String): HttpResponse` (404, `text/html(UTF-8)`, the shell from `Files.readString(indexFile)` through `handOver`), `handOver(shell: String, raw: String): String` (R6).

- [ ] **Step 1: The `APISpec` cases.** `fixtureIndex` becomes `<!DOCTYPE html><html><head></head><body>fixture index</body></html>`. The three not-a-room cases become, and one is added after 'answer 503 at the index and under a room name when the page is not built':

```scala
"refuse a name outside the vocabulary with a page suggesting the correction" in
  Get("/brave-golden-oter") ~> apiRoute ~> check {
    status mustBe StatusCodes.NotFound
    contentType mustBe ContentTypes.`text/html(UTF-8)`
    val handOver =
      """<meta name="not-a-room" content="brave-golden-oter" data-suggestion="brave-golden-otter">"""
    responseAs[String] mustBe
      s"<!DOCTYPE html><html><head>$handOver</head><body>fixture index</body></html>"
    header("Cache-Control").map(_.value) mustBe Some("no-cache")
  }
"refuse a name near no room name without a suggestion" in
  Get("/nothing-like-this") ~> apiRoute ~> check {
    status mustBe StatusCodes.NotFound
    responseAs[String] must include("""<meta name="not-a-room" content="nothing-like-this">""")
  }
"escape the refused name before echoing it" in
  Get("/%22%3E%3Cimg%20src=x%20onerror=alert(1)%3E$1%5C") ~> apiRoute ~> check {
    status mustBe StatusCodes.NotFound
    val page = responseAs[String]
    page must include("""content="&#34;&gt;&lt;img src=x onerror=alert(1)&gt;$1\"""")
    (page must not).include("<img")
  }
"answer 503 for a name outside the vocabulary when the page is not built" in
  Get("/brave-golden-oter") ~> missingRoute ~> check {
    status mustBe StatusCodes.ServiceUnavailable
    responseAs[String] mustBe "The page is not built: run `npm run build`"
  }
```

- [ ] **Step 2: Run them to see them fail.** `sbt "testOnly com.lunatech.pointingpoker.APISpec"`. Expected: the three changed cases FAIL on their page assertions; the 503 case FAILs on its status (404).
- [ ] **Step 3: The e2e cases.** In `slug.spec.js`, 'a mistyped room name is refused with a suggestion that reaches the room' replaces its `getByText` with the two lines below; the two new cases follow it. Import `participantEntry`.

```js
await expect(
  page.getByRole('heading', { name: 'brave-golden-oter is not a valid room name.' })
).toBeVisible()
await expect(page).toHaveTitle('Not a room name')
```

```js
test('a name near no room name offers only Join a different room, which opens the Join tab', async ({
  page,
  origin
}) => {
  const response = await page.goto(`${origin}/nothing-like-this`)
  expect(response.status()).toBe(404)
  await expect(
    page.getByRole('heading', { name: 'nothing-like-this is not a valid room name.' })
  ).toBeVisible()
  await expect(page.getByText('Did you mean')).toHaveCount(0)
  await page.getByRole('link', { name: 'Join a different room' }).click()
  await expect(page).toHaveURL(`${origin}/`)
  const join = page.getByRole('link', { name: 'Join', exact: true })
  await expect(join).toHaveAttribute('aria-current', 'true')
})

test('a mistyped name offers to join as the stored name, and opens no stream', async ({
  visitor
}) => {
  // Dana, not Alice: the earlier case's Alice stays listed in this room for the grace period.
  const page = await visitor({ name: 'Dana', defaultRole: 'Voter' })
  const requests = []
  page.on('request', request => requests.push(request.url()))
  await page.goto('/brave-golden-oter')
  const row = page.getByRole('link', { name: 'brave-golden-otter Join as Dana' })
  await expect(row).toBeVisible()
  await row.click()
  await expect(participantEntry(page, 'Dana')).toBeVisible()
  expect(requests.filter(url => url.includes('/rooms/brave-golden-oter/'))).toEqual([])
})
```

- [ ] **Step 4: Run them to see them fail.** `npm run build`, then the three titles in both projects against the current stage. Expected: each FAILs on its heading or row, the server still answering its own page.
- [ ] **Step 5: The hand-over.** In `PageRoutes`: `whenBuilt` (R5) takes `index`'s check, its "Checked per request" comment with it; `index` becomes `revalidated(whenBuilt(getFromFile(indexFile.toFile)))`; the not-a-room branch becomes `revalidated(whenBuilt(complete(notARoom(raw))))`; `notARoom` and `handOver` as Interfaces say, the old inline page deleted. `handOver` builds the meta (Global Constraints) and inserts it at `shell.indexOf("</head>")` by `substring`, under one comment: inserted by `indexOf`, as `replaceFirst` reads a typed `$` as a group (4d decision 2).
- [ ] **Step 6: Run the checks and the cases.** `sbt scalafmtAll`, server checks; `sbt "; coverageOff; Universal/stage"`, then the whole e2e suite, `npx playwright test --workers=1`, as the split runs on every page load. Expected: PASS.
- [ ] **Step 7:** Under `sbt run`, the Review Focus's by-eye and by-hand checks; report what each showed.
- [ ] **Step 8: Commit** the three files with Task 2's subject, so a mutation's revert cannot undo them.
- [ ] **Step 9: Prove the cases can fail.** Server mutations: `APISpec` alone. Client mutations: `npm run build`, the named case with `--project=chromium`. Revert each and check `git status` is clean.
  - No suggestion written: the first `APISpec` case FAILs on `mustBe`.
  - `revalidated` dropped from the not-a-room branch: the first case FAILs on `Cache-Control`.
  - ` data-suggestion` always written (empty without one): the second case FAILs on `include`.
  - `Encode.forHtml` removed, then swapped for `Encode.forHtmlContent`: the escape case FAILs on `include` each time.
  - The insertion by `shell.replaceFirst("</head>", meta + "</head>")`: the escape case FAILs on its status (500).
  - The not-a-room branch without `whenBuilt`: the 503 case FAILs on its status.
  - `main.tsx` ignores the hand-over: the mistyped case FAILs on the heading.
  - `App` ignores `tab=join` in `tab`'s start: the near-no-name case FAILs on `aria-current`.
  - `tab=join` left out of the `replaceState` condition: the near-no-name case FAILs on `toHaveURL`.
  - `NotARoom` draws "Did you mean" without a suggestion: the near-no-name case FAILs on `toHaveCount(0)`.
  - Line 2 always `Join`: the Dana case FAILs on the row.
  - `main.tsx` renders `App`, with a connection, beside `NotARoom`: the Dana case FAILs on `requests`.
  - The row's link gains `onClick={() => localStorage.setItem('name', '')}`: the Dana case FAILs on `participantEntry`.
