# Step 8a: Connection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the URL alone decide what the page shows, and let a room page recover on its own: reopen a stream that went silent, and reload onto the running app after a refusal.

**Architecture:** The server ends the stream a `Join` replaces. On the client, `frontend/src/room/connection.ts` owns the whole connection: the first join and the first `open` win, a 5 s tick runs the pure `decide()` watchdog, a closed stream gets a liveness fetch before any reload, and Stopping (clear the tick, abort the fetch, detach and close the stream) is what Leave, a reload and `fatal` do first. `App.tsx` reads the path once, and every change of room is a page load.

**Tech Stack:** Scala 3 with `-Werror`, Pekko typed actors, ScalaTest; React 19, TypeScript 5.9, zod 4, Vitest 5 with fake timers; Playwright 1.63 against the testkit stub; `node --test` for the stub.

**Spec:** `docs/superpowers/specs/2026-09-24-frontend-rewrite-design.md`: "Scope and sequencing" (step 8a's five commits and the e2e cases they change), "Pages and navigation", "Connection behaviour" (the states and events matrix is the reference for every connection change), "Testing" (the cases that name step 8a), "Docs in the same PR" (step 8a) and "Done when". Steps 8b and 8c are out of scope.

## How the code in this plan was verified

Every patch below was applied and run in a scratch worktree on 2026-09-29, one commit at a time, on `main` at `484f989`:

- **Green at the end.** `npm run typecheck`, `npm run lint`, `npm run test:unit` (47 tests), `npm test` (17 node tests), `sbt scalafmtCheckAll "testOnly *RoomSpec"` (73 tests), and the whole e2e suite, 86 of 86 in Chromium and Firefox.
- **Each commit's tests failed first.** Task 1's `RoomSpec` case timed out waiting for `StreamCompleted` against step 8's `Room`. Task 2's three unit tests and three e2e cases, Task 3's three unit tests, Task 4's eight unit tests and its frozen-stream e2e case, and Task 5's nine unit tests and two of its three e2e cases each failed against the commit before. The failure each step expects is quoted in that step.
- **Teeth, by mutation.** Task 5's third e2e case, "a page refused before it reached the room stops at the message", passes against Task 4 too, since Task 4 still stops at the message on every refusal. It failed once the reach rule was broken (`if (reached || true)`). The grace-period case failed on its new mark, `window.sameLoad`, once `Room` dropped the session at grace expiry, the spec's "`ValidateToken` made to refuse". A first attempt that refused every token not held by a member also refused the first join, so the narrower mutation is the one to use.
- **Formatting.** The project has no Prettier config; the touched files pass `npx prettier --check --single-quote --no-semi --print-width 100 --trailing-comma none --arrow-parens avoid`, and every added line is at most 100 columns.

## Decisions this plan takes that the spec does not settle

Each is implemented as written unless review changes it.

- **P1. The spec lands first, as its own commit (Task 0).** It is the uncommitted change on this branch. Code commits then cite a committed design.
- **P2. The join moves into `connection.ts`.** `createConnection` takes `join: (roomId, name) => Promise<JoinOutcome>` (`api.join` in `main.tsx`), and `connection.join` returns `'joined' | 'failed' | 'ignored'`. The single-flight rule of note h then lives beside the first-`open` rule and is unit-tested with a fake. A join that failed lets the next one through, so the user can retry.
- **P3. Navigation is injected.** `createConnection` takes `location: Pick<Location, 'assign' | 'reload' | 'replace'>` (`window.location`). Leave uses `assign('/')`, so Back returns to the room as "Pages and navigation" says. The reload on a refusal uses `replace`, so Back does not stop on the `?restarted=1` page it left.
- **P4. The 10 s bound is an `AbortController` and a `setTimeout`, not `AbortSignal.timeout(10_000)`.** Stopping must abort the same fetch, and Vitest's fake timers drive a `setTimeout` but not `AbortSignal.timeout`. The bound is the same 10 s.
- **P5. `decide` grows with the commits.** Task 4's is `decide(readyState, heardAt, now)` returning `'reopen' | 'nothing'`, with a closed stream doing nothing, as step 8 does. Task 5 adds `fetching` and `'fetch'`, reaching the spec's signature.
- **P6. `api.ts`'s `join` comment is refreshed in Task 2**, where `joinAction` is deleted, rather than in Task 3 as the spec's commit list says, since Task 2 is where it goes stale. `main.tsx`'s StrictMode comment is refreshed in Task 3 as listed.
- **P7. The frozen-stream e2e case records the banner as it happens.** The banner lasts only from the reopen until the reopened stream's `onopen`, a round trip, so a polling `toBeVisible` can miss it, and Playwright no longer supports `polling: 'mutation'`. An init script's `MutationObserver` sets `window.bannerSeen`, which the case polls.
- **P8. On `/<slug>` the lobby hides its tabs and makes the room field read-only**, which is "the join form with the slug fixed". Step 8c restyles it.
- **P9. The rejoin link drops "as Alice" when no name is stored.** In practice a name is always stored before a room is remembered.
- **P10. The e2e `app` fixture becomes a handle with `restart(whileDown)`**, keeping the port so the worker's stub goes on pointing at it. The three refusal cases go in a new `e2e/refusal.spec.js`.
- **P11. Each docs edit lands in the commit whose behaviour it describes**, following the rule that docs travel with their code. Task 5 also moves the spec's status line and extends the parent design's step 8 "Landed" paragraph.

## Global Constraints

- No em dash anywhere, in code, comments, docs or commit messages.
- Code comments are one or two lines, never more.
- Conventional Commits, and no generated-with or co-authored-by attribution line.
- Scala: `scalafmt` with `maxColumn = 100`, and `-Werror`.
- TypeScript and JavaScript: single quotes, no semicolons, print width 100, no trailing commas, `arrow-parens avoid`; lines at most 100 columns.
- The e2e suite must never contact a host other than `127.0.0.1` (the off-origin guard fails the case otherwise).
- Every commit brings a test shown failing against the commit before it (spec, "Scope and sequencing").
- `STALE_MS = 35_000`, `TICK_MS = 5_000`, `FETCH_TIMEOUT_MS = 10_000`; `SSE.heartbeatInterval` is 15 s, and each names the other.
- Copy, verbatim: "Connection to the room was lost"; "Your session has ended. Please reload the page to rejoin."; "Reconnected. Please check your vote."; "Could not join the room. Please try again."; "Rejoin brave-golden-otter as Alice"; "Rejoin your last room as Alice".
- Do not merge: merging `main` auto-deploys and ends every live room, and 8a merges with 8b in a window with no live rooms (spec, "Rollout").

## Review Focus

The inputs most likely to bite a person that no automated case here exercises, most likely first. Each has a manual check in the task that owns it, since the e2e suite runs neither Safari, a real phone, nor Vite's dev server.

1. **Safari restoring a room from the back/forward cache.** Expected: the page reloads and rejoins rather than showing a frozen room. Checked by hand in Task 2, Step 9.
2. **A phone that suspends the tab for a minute.** Expected: on return, the overdue tick fires and the room is current within one tick, with no reload. Checked by hand in Task 4, Step 10.
3. **`npm run dev` under StrictMode on a first visit.** Expected: exactly one `POST /rooms/<slug>/join`, since the second effect is ignored. Checked by hand in Task 3, Step 7.
4. **Firefox taken offline in devtools on an open room.** Expected: the banner, then recovery on its own once back online, by a reopen or by the refusal path's reload. Checked by hand in Task 5, Step 11.
5. **Leave double-clicked, or clicked while a reload is pending.** Expected: one beacon, one navigation, the pending reload undisturbed. Pinned by Task 2's leave unit test and Task 5's "aborts a fetch in flight on leave".

---

### Task 0: Commit the step 8a design

**Files:**
- Commit: `docs/superpowers/specs/2026-09-24-frontend-rewrite-design.md` (already modified on this branch)

- [ ] **Step 1: Check the branch and the diff**

Run: `git status --short && git branch --show-current`
Expected: ` M docs/superpowers/specs/2026-09-24-frontend-rewrite-design.md` on `20260831.protocol_architecture_8a_connection`.

- [ ] **Step 2: Check it has no em dash**

Run: `grep -c $'\u2014' docs/superpowers/specs/2026-09-24-frontend-rewrite-design.md`
Expected: `0`

- [ ] **Step 3: Commit**

```bash
git add docs/superpowers/specs/2026-09-24-frontend-rewrite-design.md
git commit -m "docs(spec): design step 8a, the connection" -m "A states and events matrix for the connection, the path deciding the page, the watchdog's reopen and the reload on a refusal, reviewed in one wave and a targeted re-review."
```

---

### Task 1: The server ends the stream a `Join` replaces

Judged by `RoomSpec` alone. Without it, a reopen whose old request lands second parks a dead ref in the connection slot, and the live stream keeps its heartbeats but gets no snapshot (spec, "Why the watchdog reconnects").

**Files:**
- Modify: `src/main/scala/com/lunatech/pointingpoker/actors/Room.scala` (the `Join` case in `receiveBehaviour`)
- Test: `src/test/scala/com/lunatech/pointingpoker/actors/RoomSpec.scala` (the case "replace a connection's ref when the same id reconnects, and feed only the new one", renamed)

**Interfaces:**
- Consumes: `RoomData.connections: Map[UUID, Map[ConnectionId, UntypedRef]]`, `Room.StreamCompleted`.
- Produces: nothing new; a displaced ref now receives `StreamCompleted`.

- [ ] **Step 1: Write the failing test**

Apply this patch (`git apply`, from the repository root):

```diff
diff --git a/src/test/scala/com/lunatech/pointingpoker/actors/RoomSpec.scala b/src/test/scala/com/lunatech/pointingpoker/actors/RoomSpec.scala
index db8bd60..44d13eb 100644
--- a/src/test/scala/com/lunatech/pointingpoker/actors/RoomSpec.scala
+++ b/src/test/scala/com/lunatech/pointingpoker/actors/RoomSpec.scala
@@ -1066,19 +1066,21 @@ class RoomSpec extends AnyWordSpec with must.Matchers with BeforeAndAfterAll:
         Map(user.connectionId -> user.ref, replacementId -> replacement.ref)
     }
 
-    "replace a connection's ref when the same id reconnects, and feed only the new one" in {
+    "end the replaced stream when the same id reconnects, and feed only the new one" in {
       val (user, userProbe) = createUser(UUID.randomUUID(), "user1", false, "")
       val replacementProbe  = TestProbe()(using testKit.system.classicSystem)
       val dataProbe         = testKit.createTestProbe[Room.DataStatus]()
       val (_, roomRef)      = createRoom(aSlug(), withUsers(user))
 
-      // Same id, new ref: an EventSource retry reuses the id its page was given.
+      // Same id, new ref: a browser retry, or a reopen whose old request landed second.
       roomRef ! Room.Join(user.id, user.name, user.token, user.connectionId, replacementProbe.ref)
       roomRef ! Room.GetData(dataProbe.ref)
       val data = dataProbe.expectMessageType[Room.DataStatus].data
 
       data.connections(user.id) mustBe Map(user.connectionId -> replacementProbe.ref)
       expectSnapshot(replacementProbe)
+      // Left open, it would keep its heartbeats and get no snapshot: a silent freeze.
+      userProbe.expectMsg(Room.StreamCompleted)
       userProbe.expectNoMessage(300.millis)
     }
 
```

- [ ] **Step 2: Run it to verify it fails**

Run: `sbt "testOnly *RoomSpec -- -z \"same id reconnects\""`
Expected: FAIL with `assertion failed: timeout (3 seconds) during expectMsg while waiting for StreamCompleted`.

- [ ] **Step 3: Implement**

```diff
diff --git a/src/main/scala/com/lunatech/pointingpoker/actors/Room.scala b/src/main/scala/com/lunatech/pointingpoker/actors/Room.scala
index b7c05fa..db47fe0 100644
--- a/src/main/scala/com/lunatech/pointingpoker/actors/Room.scala
+++ b/src/main/scala/com/lunatech/pointingpoker/actors/Room.scala
@@ -278,6 +278,8 @@ object Room:
               // The arriving connection cancels any pending removal, so ConfirmLeave needs no
               // staleness check of its own.
               timers.cancel(userId)
+              // Ended, not parked: a displaced live stream would get heartbeats but no snapshot.
+              data.connections.get(userId).flatMap(_.get(connectionId)).foreach(_ ! StreamCompleted)
               val newData = publish(data.connect(userId, name, connectionId, ref), context)
               receiveBehaviour(roomId, newData, gracePeriod, stopAfterIdle, timers)
             else
```

- [ ] **Step 4: Run the suite and the formatter check**

Run: `sbt scalafmtCheckAll "testOnly *RoomSpec"`
Expected: `Tests: succeeded 73, failed 0`, and no formatting error.

- [ ] **Step 5: Commit**

```bash
git add src/main/scala/com/lunatech/pointingpoker/actors/Room.scala src/test/scala/com/lunatech/pointingpoker/actors/RoomSpec.scala
git commit -m "fix(rooms): end the stream a Join replaces (step 8a)" -m "Left open, a displaced live stream keeps its heartbeats but gets no snapshot, so a reopen whose old request lands second freezes the page with no banner."
```

---

### Task 2: The path decides the page

The URL is the only thing that decides what the page shows, and every change of room is a page load. Leave keeps the name, `joinAction` is deleted, a page restored from the back/forward cache reloads, and `pagehide` always sends the beacon while a stream is open (spec, "Pages and navigation" and the matrix's `pagehide`, `pageshow` and Leave rows).

**Files:**
- Modify: `frontend/src/room/connection.ts` (Stopping, `leave`, the `pagehide` and `pageshow` listeners, `location` in `ConnectionDeps`)
- Modify: `frontend/src/components/App.tsx` (rewritten: path-decided startup, lobby navigation, join in place, remember once reached)
- Modify: `frontend/src/components/Lobby.tsx` (`fixedRoom` and `rejoin` props)
- Modify: `frontend/src/main.tsx` (passes `location: window.location`)
- Modify: `frontend/src/protocol/api.ts` (the `join` comment, see P6)
- Delete: `frontend/src/room/joinAction.ts`, `frontend/src/room/joinAction.test.ts`
- Modify: `docs/known-issues.md` ("An unrecognized `roomId` silently creates an empty room")
- Test: `frontend/src/room/connection.test.ts`, `e2e/lobby.spec.js`, `e2e/slug.spec.js`, and comments in `e2e/fixtures.js` and `e2e/room.spec.js`

**Interfaces:**
- Consumes: `api.join(roomId, name): Promise<'joined' | 'not-a-room'>` (rejects on any other failure), `api.createRoom(): Promise<string>`.
- Produces: `ConnectionDeps.location: Pick<Location, 'assign' | 'reload'>`; `Connection.leave(): void` now stops, sends the beacon and calls `location.assign('/')`, and does nothing once stopped; the store is no longer reset on leave. `Lobby` gains `fixedRoom: boolean` and `rejoin: { href: string; label: string } | null`.

- [ ] **Step 1: Write the failing unit tests**

```diff
diff --git a/frontend/src/room/connection.test.ts b/frontend/src/room/connection.test.ts
index 3a5422a..e563d44 100644
--- a/frontend/src/room/connection.test.ts
+++ b/frontend/src/room/connection.test.ts
@@ -1,4 +1,4 @@
-import { beforeEach, describe, expect, it, vi } from 'vitest'
+import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
 import { createConnection, type Stream } from './connection'
 
 class FakeStream implements Stream {
@@ -28,6 +28,7 @@ describe('createConnection', () => {
   let streams: FakeStream[]
   let beacons: string[]
   let events: EventTarget
+  let location: { assign: Mock<(url: string | URL) => void>; reload: Mock<() => void> }
   const connect = () =>
     createConnection({
       connectionId: 'c-1',
@@ -37,16 +38,20 @@ describe('createConnection', () => {
         return s
       },
       sendBeacon: url => void beacons.push(url),
-      events
+      events,
+      location
     })
   // Node has no PageTransitionEvent, so persisted rides a plain Event.
   const pageHide = (persisted: boolean) =>
     events.dispatchEvent(Object.assign(new Event('pagehide'), { persisted }))
+  const pageShow = (persisted: boolean) =>
+    events.dispatchEvent(Object.assign(new Event('pageshow'), { persisted }))
 
   beforeEach(() => {
     streams = []
     beacons = []
     events = new EventTarget()
+    location = { assign: vi.fn(), reload: vi.fn() }
     vi.spyOn(console, 'error').mockImplementation(() => {})
   })
 
@@ -91,26 +96,42 @@ describe('createConnection', () => {
     expect(c.getSnapshot()).toMatchObject({ lost: false, fatal: true })
   })
 
-  it('closes the stream, then sends the leave beacon and forgets the room, on leave', () => {
+  it('closes and detaches the stream, sends the beacon and goes to the lobby, on leave', () => {
     const c = connect()
     c.open('r')
     streams[0].message(frame)
     c.leave()
     expect(streams[0].closed).toBe(true)
+    expect(streams[0].onmessage).toBeNull()
     expect(beacons).toEqual(['/rooms/r/leave?connectionId=c-1'])
-    expect(c.getSnapshot()).toEqual({ lost: false, fatal: false, snapshot: null })
+    expect(location.assign).toHaveBeenCalledWith('/')
+    // Left on screen until the lobby loads, so a double-clicked Leave arrives here.
+    c.leave()
+    pageHide(false)
+    expect(beacons).toHaveLength(1)
+    expect(location.assign).toHaveBeenCalledTimes(1)
   })
 
-  it('sends the beacon on pagehide only for a discarded page that reached the room', () => {
+  it('sends the beacon on pagehide while a stream is open, cached or not', () => {
     const c = connect()
-    c.open('r')
     pageHide(false)
     expect(beacons).toEqual([])
-    streams[0].message(frame)
+    c.open('r')
     pageHide(true)
-    expect(beacons).toEqual([])
+    streams[0].message(frame)
     pageHide(false)
-    expect(beacons).toEqual(['/rooms/r/leave?connectionId=c-1'])
+    expect(beacons).toEqual(['/rooms/r/leave?connectionId=c-1', '/rooms/r/leave?connectionId=c-1'])
+    streams[0].readyState = 2
+    pageHide(false)
+    expect(beacons).toHaveLength(2)
+  })
+
+  it('reloads a page restored from the back/forward cache, and only that', () => {
+    connect()
+    pageShow(false)
+    expect(location.reload).not.toHaveBeenCalled()
+    pageShow(true)
+    expect(location.reload).toHaveBeenCalledTimes(1)
   })
 
   it('notifies subscribers on a change and stops after unsubscribing', () => {
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run --root frontend src/room/connection.test.ts`
Expected: 3 failed, 6 passed: "closes and detaches the stream, sends the beacon and goes to the lobby, on leave", "sends the beacon on pagehide while a stream is open, cached or not", "reloads a page restored from the back/forward cache, and only that".

- [ ] **Step 3: Write the failing e2e changes**

```diff
diff --git a/e2e/fixtures.js b/e2e/fixtures.js
index f2b2158..b176312 100644
--- a/e2e/fixtures.js
+++ b/e2e/fixtures.js
@@ -86,7 +86,7 @@ export const test = base.extend({
         return cookie.value
       }
       // A second page in the same context shares the room cookie, which is what makes two tabs
-      // one participant. localStorage already holds the name and room, so created() rejoins.
+      // one participant. localStorage already holds the name, so the room's path joins at once.
       const newTab = async () => {
         const tab = await context.newPage()
         await tab.goto(`/${room}`)
diff --git a/e2e/lobby.spec.js b/e2e/lobby.spec.js
index a5eede3..af7611f 100644
--- a/e2e/lobby.spec.js
+++ b/e2e/lobby.spec.js
@@ -1,5 +1,7 @@
 import { test, expect, nameInput } from './fixtures.js'
 
+const ROOM_URL = /\/[a-z]+-[a-z]+-[a-z]+$/
+
 // The join fixture clicks the buttons, so these are the keyboard and paste paths nothing else takes.
 test('Enter in the name field creates a room', async ({ page, origin }) => {
   await page.goto(`${origin}/`)
@@ -21,3 +23,36 @@ test('a room name pasted with spaces into the Join form still joins', async ({
   await expect(page.getByRole('button', { name: 'Show votes' })).toBeVisible()
   await expect(page.getByRole('heading', { name: room, exact: true })).toBeVisible()
 })
+
+test('the lobby offers the remembered room rather than joining it', async ({ join, room }) => {
+  const alice = await join('Alice')
+  await alice.page.goto('/')
+  const rejoin = alice.page.getByRole('link', { name: `Rejoin ${room} as Alice` })
+  await expect(rejoin).toBeVisible()
+  await expect(alice.page.getByRole('button', { name: 'Show votes' })).toBeHidden()
+  await rejoin.click()
+  await expect(alice.page).toHaveURL(new RegExp(`/${room}$`))
+  await expect(alice.page.getByRole('button', { name: 'Show votes' })).toBeVisible()
+})
+
+test('Create, Leave and Join change the address, and Leave keeps the name', async ({
+  page,
+  origin,
+  room
+}) => {
+  await page.goto(`${origin}/`)
+  await nameInput(page).fill('Alice')
+  await page.getByRole('button', { name: 'Create' }).click()
+  await expect(page).toHaveURL(ROOM_URL)
+  await expect(page.getByRole('button', { name: 'Show votes' })).toBeVisible()
+
+  await page.getByRole('link', { name: 'Leave' }).click()
+  await expect(page).toHaveURL(`${origin}/`)
+  await expect(nameInput(page)).toHaveValue('Alice')
+
+  await page.getByRole('link', { name: 'Join' }).click()
+  await page.locator('#join-roomId').fill(room)
+  await page.getByRole('button', { name: 'Join' }).click()
+  await expect(page).toHaveURL(`${origin}/${room}`)
+  await expect(page.getByRole('button', { name: 'Show votes' })).toBeVisible()
+})
diff --git a/e2e/room.spec.js b/e2e/room.spec.js
index 13ff3a4..ba01826 100644
--- a/e2e/room.spec.js
+++ b/e2e/room.spec.js
@@ -300,8 +300,8 @@ test('a straggler reloading leaves the votes hidden', async ({ join }) => {
   // keeping the round shut until she returns.
   await stragglerDepartsWithVotesHidden(
     join,
-    // created() rejoins from localStorage, and /join resolves the cookie rather than minting,
-    // so the reload returns the same Carol instead of a second one.
+    // The room's path joins with the remembered name, and /join resolves the cookie rather than
+    // minting, so the reload returns the same Carol instead of a second one.
     async (carol, alice) => {
       await carol.page.reload()
       // Her own table is empty until the snapshot lands, so this is what proves the rejoin
diff --git a/e2e/slug.spec.js b/e2e/slug.spec.js
index ebf7437..5ad9b3d 100644
--- a/e2e/slug.spec.js
+++ b/e2e/slug.spec.js
@@ -70,6 +70,8 @@ test('a room remembered from before the cutover reopens under its derived name',
     }
   }, crypto.randomUUID())
   await page.goto(`${origin}/`)
+  // The lobby offers it rather than joining it: only a room's own path joins.
+  await page.getByRole('link', { name: 'Rejoin your last room as Alice' }).click()
   await expect(page).toHaveURL(ROOM_URL)
   await expect(page.getByRole('button', { name: 'Show votes' })).toBeVisible()
 })
```

- [ ] **Step 4: Run them to verify they fail**

Run: `npm run build && npm run stage && npx playwright test e2e/lobby.spec.js e2e/slug.spec.js --project=chromium`
Expected: 3 failed: "the lobby offers the remembered room rather than joining it" (the rejoin link is not visible), "Create, Leave and Join change the address, and Leave keeps the name" (`toHaveURL` fails after Create), "a room remembered from before the cutover reopens under its derived name" (no rejoin link).

- [ ] **Step 5: Implement**

```diff
diff --git a/frontend/src/components/App.tsx b/frontend/src/components/App.tsx
index 380a3fd..7701fcc 100644
--- a/frontend/src/components/App.tsx
+++ b/frontend/src/components/App.tsx
@@ -1,49 +1,42 @@
 import { useEffect, useState } from 'react'
 import * as api from '../protocol/api'
 import type { Connection } from '../room/connection'
-import { joinAction } from '../room/joinAction'
 import { Alerts } from './Alerts'
 import { Lobby, type LobbyTab } from './Lobby'
 import { Room } from './Room'
 import { useRoom } from './useRoom'
 
-// Read once at startup: the path wins over the remembered room, and the name persists.
+// Read once at startup: the path alone decides the page, and every change of room is a page load.
 const pathRoom = window.location.pathname.split('/')[1] ?? ''
 // Set by the legacy-link redirect; cleared from the address so a copied link is clean.
 const movedOnLoad = new URLSearchParams(window.location.search).get('moved') === '1'
 if (movedOnLoad) history.replaceState(null, '', window.location.pathname)
 const joinError = 'Could not join the room. Please try again.'
+// A room remembered from before the cutover is a UUID, which the server's page route redirects.
+const rejoinLabel = (id: string, name: string) =>
+  `Rejoin ${/^[a-z]+-[a-z]+-[a-z]+$/.test(id) ? id : 'your last room'}${name ? ` as ${name}` : ''}`
+const goTo = (id: string) => window.location.assign('/' + encodeURIComponent(id))
 
 export function App({ connection }: { connection: Connection }) {
   const room = useRoom(connection)
-  const [roomId, setRoomId] = useState(pathRoom || localStorage.getItem('roomId') || '')
+  const [roomId, setRoomId] = useState(pathRoom)
   const [name, setName] = useState(localStorage.getItem('name') ?? '')
   const [tab, setTab] = useState<LobbyTab>(pathRoom ? 'join' : 'create')
   const [error, setError] = useState('')
   const [moved, setMoved] = useState(movedOnLoad)
   const [copied, setCopied] = useState(false)
+  const remembered = localStorage.getItem('roomId')
+  const reached = room.snapshot !== null
 
-  const doJoin = (id: string) => {
-    localStorage.setItem('roomId', id)
+  // In place, so a ?moved=1 banner survives joining.
+  const joinHere = () => {
     localStorage.setItem('name', name)
     api
-      .join(id, name)
+      .join(pathRoom, name)
       .then(outcome => {
-        const action = joinAction(outcome, id, pathRoom)
-        switch (action.kind) {
-          case 'enter':
-            setError('')
-            connection.open(id)
-            break
-          case 'retarget':
-            localStorage.removeItem('roomId')
-            window.location.assign(action.path)
-            break
-          case 'show-error':
-            localStorage.removeItem('roomId')
-            setError(joinError)
-            break
-        }
+        if (outcome !== 'joined') return setError(joinError)
+        setError('')
+        connection.open(pathRoom)
       })
       .catch(reason => {
         setError(joinError)
@@ -52,33 +45,45 @@ export function App({ connection }: { connection: Connection }) {
   }
 
   const doCreate = () => {
+    localStorage.setItem('name', name)
     api
       .createRoom()
-      .then(created => {
-        setRoomId(created)
-        doJoin(created)
-      })
+      .then(goTo)
       .catch(reason => {
         console.log(reason)
         setError('Could not create a room. Please try again.')
       })
   }
 
+  // As the Vue page's v-model.trim: a pasted name with a trailing space is not refused.
+  const doJoin = () => {
+    const id = roomId.trim()
+    if (!id) return setError(joinError)
+    localStorage.setItem('name', name)
+    goTo(id)
+  }
+
   // The Vue page's doCopy: one bare timeout, so a second copy does not extend the hint.
   const onCopied = () => {
     setCopied(true)
     window.setTimeout(() => setCopied(false), 2000)
   }
 
+  // Forgets the room but keeps the name, which the lobby prefills.
   const doLeave = () => {
+    localStorage.removeItem('roomId')
     connection.leave()
-    localStorage.clear()
   }
 
-  // The Vue page's startup rejoin: a room and a name, from the path or from before, join at once.
+  // Remembered only once reached, so an unreachable typed name is never offered back.
+  useEffect(() => {
+    if (reached) localStorage.setItem('roomId', pathRoom)
+  }, [reached])
+
+  // A room's own path with a remembered name joins at once.
   useEffect(() => {
-    if (roomId && name) doJoin(roomId)
-    // Once, on mount, as the Vue page's created() ran once.
+    if (pathRoom && name) joinHere()
+    // Once, on mount.
     // eslint-disable-next-line react-hooks/exhaustive-deps
   }, [])
 
@@ -87,6 +92,10 @@ export function App({ connection }: { connection: Connection }) {
     : room.lost
       ? 'Connection to the room was lost'
       : ''
+  const rejoin =
+    !pathRoom && remembered
+      ? { href: '/' + encodeURIComponent(remembered), label: rejoinLabel(remembered, name) }
+      : null
 
   return (
     <>
@@ -101,19 +110,16 @@ export function App({ connection }: { connection: Connection }) {
           tab={tab}
           onTab={setTab}
           roomId={roomId}
+          fixedRoom={pathRoom !== ''}
           onRoomId={setRoomId}
           name={name}
           onName={setName}
+          rejoin={rejoin}
           onCreate={doCreate}
-          onJoin={() => {
-            // As the Vue page's v-model.trim: a pasted name with a trailing space is not refused.
-            const id = roomId.trim()
-            setRoomId(id)
-            doJoin(id)
-          }}
+          onJoin={pathRoom ? joinHere : doJoin}
         />
       ) : (
-        <Room roomId={roomId} snapshot={room.snapshot} onCopied={onCopied} onLeave={doLeave} />
+        <Room roomId={pathRoom} snapshot={room.snapshot} onCopied={onCopied} onLeave={doLeave} />
       )}
     </>
   )
diff --git a/frontend/src/components/Lobby.tsx b/frontend/src/components/Lobby.tsx
index becd0b0..534cb3b 100644
--- a/frontend/src/components/Lobby.tsx
+++ b/frontend/src/components/Lobby.tsx
@@ -6,9 +6,12 @@ type Props = {
   tab: LobbyTab
   onTab: (tab: LobbyTab) => void
   roomId: string
+  // On a room's own path, where the room is the path's and only the name is asked.
+  fixedRoom: boolean
   onRoomId: (roomId: string) => void
   name: string
   onName: (name: string) => void
+  rejoin: { href: string; label: string } | null
   onCreate: () => void
   onJoin: () => void
 }
@@ -18,7 +21,7 @@ const onEnter = (action: () => void) => (event: KeyboardEvent) => {
 }
 
 export function Lobby(props: Props) {
-  const { tab, onTab, roomId, onRoomId, name, onName, onCreate, onJoin } = props
+  const { tab, onTab, roomId, fixedRoom, onRoomId, name, onName, rejoin, onCreate, onJoin } = props
   const select = (next: LobbyTab) => (event: MouseEvent) => {
     event.preventDefault()
     onTab(next)
@@ -44,7 +47,7 @@ export function Lobby(props: Props) {
         <div className="card text-center shadow-sm m-1">
           <div className="card-header">
             Pointing Poker
-            <ul className="nav nav-tabs card-header-tabs">
+            <ul className="nav nav-tabs card-header-tabs" hidden={fixedRoom}>
               <li className="nav-item">
                 <a className={tabClass('create')} href="#" onClick={select('create')}>
                   Create
@@ -57,6 +60,11 @@ export function Lobby(props: Props) {
               </li>
             </ul>
           </div>
+          {rejoin && (
+            <div className="card-body pb-0">
+              <a href={rejoin.href}>{rejoin.label}</a>
+            </div>
+          )}
           {tab === 'create' && (
             <div className="card-body">
               <h5 className="card-title">Create Room</h5>
@@ -83,6 +91,7 @@ export function Lobby(props: Props) {
                     className="form-control"
                     id="join-roomId"
                     value={roomId}
+                    readOnly={fixedRoom}
                     onChange={e => onRoomId(e.target.value)}
                   />
                 </div>
diff --git a/frontend/src/main.tsx b/frontend/src/main.tsx
index 24d932d..95f95e9 100644
--- a/frontend/src/main.tsx
+++ b/frontend/src/main.tsx
@@ -11,7 +11,8 @@ const connection = createConnection({
   connectionId: mintConnectionId(),
   openStream: url => new EventSource(url),
   sendBeacon: url => void navigator.sendBeacon(url),
-  events: window
+  events: window,
+  location: window.location
 })
 
 // No StrictMode: its double effect would join twice, and 8a's close-before-open is not here yet.
diff --git a/frontend/src/protocol/api.ts b/frontend/src/protocol/api.ts
index 20e0f32..f8db0a0 100644
--- a/frontend/src/protocol/api.ts
+++ b/frontend/src/protocol/api.ts
@@ -20,7 +20,7 @@ export async function join(roomId: string, name: string): Promise<JoinOutcome> {
     params: { path: { roomId } },
     body: { name }
   })
-  // Only a typed or remembered id reaches /join unchecked; joinAction decides what follows.
+  // The page route has already judged the path, so a 404 here is a room refused after load.
   if (response.status === 404) return 'not-a-room'
   if (!response.ok) throw refused('join', response)
   return 'joined'
diff --git a/frontend/src/room/connection.ts b/frontend/src/room/connection.ts
index 086c91f..8954467 100644
--- a/frontend/src/room/connection.ts
+++ b/frontend/src/room/connection.ts
@@ -17,6 +17,7 @@ export type ConnectionDeps = {
   sendBeacon: (url: string) => void
   // The page's window in the browser; the page listeners live here, not in main.tsx.
   events: EventTarget
+  location: Pick<Location, 'assign' | 'reload'>
 }
 
 export type Connection = {
@@ -33,6 +34,7 @@ export function createConnection(deps: ConnectionDeps): Connection {
   let store = initial
   let roomId: string | null = null
   let stream: Stream | null = null
+  let stopped = false
   const listeners = new Set<() => void>()
 
   // The same object between updates, since useSyncExternalStore re-renders on every new one.
@@ -45,11 +47,21 @@ export function createConnection(deps: ConnectionDeps): Connection {
   const postLeave = (id: string) =>
     deps.sendBeacon(`/rooms/${id}/leave?connectionId=${deps.connectionId}`)
 
-  // Only a page being discarded: a cached page can be restored with no load.
-  deps.events.addEventListener('pagehide', event => {
-    const persisted = (event as PageTransitionEvent).persisted
-    if (persisted || store.snapshot === null || roomId === null) return
-    postLeave(roomId)
+  // What Leave, a reload and fatal do first, so nothing is left to run against a page load.
+  const stop = () => {
+    stopped = true
+    if (stream === null) return
+    stream.onopen = stream.onmessage = stream.onerror = null
+    stream.close()
+  }
+
+  // Cached or not: a restored page reloads and rejoins, so the member must go either way.
+  deps.events.addEventListener('pagehide', () => {
+    if (stream !== null && stream.readyState !== CLOSED && roomId !== null) postLeave(roomId)
+  })
+  // A restore keeps the page's script state, so a fresh load is the one way back into a room.
+  deps.events.addEventListener('pageshow', event => {
+    if ((event as PageTransitionEvent).persisted) deps.location.reload()
   })
 
   return {
@@ -84,13 +96,12 @@ export function createConnection(deps: ConnectionDeps): Connection {
       }
     },
 
-    // Closed before the beacon: the server ends a departed stream, and an open one reconnects.
+    // Closed before the beacon, so pagehide cannot send it twice; a stopped page is already going.
     leave() {
-      stream?.close()
-      stream = null
-      if (roomId !== null) postLeave(roomId)
-      roomId = null
-      update(initial)
+      if (stopped || roomId === null) return
+      stop()
+      postLeave(roomId)
+      deps.location.assign('/')
     }
   }
 }
diff --git a/frontend/src/room/joinAction.test.ts b/frontend/src/room/joinAction.test.ts
deleted file mode 100644
index 2e86f34..0000000
--- a/frontend/src/room/joinAction.test.ts
+++ /dev/null
@@ -1,23 +0,0 @@
-import { describe, expect, it } from 'vitest'
-import { joinAction } from './joinAction'
-
-describe('joinAction', () => {
-  it('enters the room on a successful join', () => {
-    expect(joinAction('joined', 'my-room', '')).toEqual({ kind: 'enter' })
-  })
-
-  it('retargets to a room typed in the join form, different from the current path', () => {
-    expect(joinAction('not-a-room', 'other-room', 'my-room')).toEqual({
-      kind: 'retarget',
-      path: '/other-room'
-    })
-  })
-
-  it('shows an error instead of looping when already on the failed room\'s own path', () => {
-    expect(joinAction('not-a-room', 'my-room', 'my-room')).toEqual({ kind: 'show-error' })
-  })
-
-  it('shows an error for an empty id on the lobby rather than reloading it', () => {
-    expect(joinAction('not-a-room', '', '')).toEqual({ kind: 'show-error' })
-  })
-})
diff --git a/frontend/src/room/joinAction.ts b/frontend/src/room/joinAction.ts
deleted file mode 100644
index 288bf24..0000000
--- a/frontend/src/room/joinAction.ts
+++ /dev/null
@@ -1,14 +0,0 @@
-import type { JoinOutcome } from '../protocol/api'
-
-export type JoinAction =
-  | { kind: 'enter' }
-  | { kind: 'retarget'; path: string }
-  | { kind: 'show-error' }
-
-// Retargeting to the path we are already on only reloads it: under Vite that loops, and on
-// the server it is the empty id on `/`, which reloads the same lobby.
-export function joinAction(outcome: JoinOutcome, id: string, pathRoom: string): JoinAction {
-  if (outcome === 'joined') return { kind: 'enter' }
-  if (id === pathRoom) return { kind: 'show-error' }
-  return { kind: 'retarget', path: '/' + encodeURIComponent(id) }
-}
```

- [ ] **Step 6: Amend the known issue for the lobby**

In `docs/known-issues.md`, entry "An unrecognized `roomId` silently creates an empty room, with no bookmark continuity", append to the end of its **Resolution** paragraph (after "The design's "Slug allocation" section owns the rules."):

```markdown
  From step 8a the lobby's Join goes to the typed name's path, so a mistyped
  name that is still a valid slug opens a new empty room there rather than an
  error.
```

- [ ] **Step 7: Run everything this commit touches**

Run: `npm run typecheck && npm run lint && npm run test:unit`
Expected: no errors; the unit suite passes (26 tests once the four `joinAction` tests are gone).

Run: `npm run build && npm run stage && npx playwright test`
Expected: 78 passed.

- [ ] **Step 8: Check formatting and line length**

Run: `npx prettier --check --single-quote --no-semi --print-width 100 --trailing-comma none --arrow-parens avoid frontend/src/components/App.tsx frontend/src/components/Lobby.tsx frontend/src/room/connection.ts frontend/src/room/connection.test.ts frontend/src/main.tsx frontend/src/protocol/api.ts e2e/lobby.spec.js e2e/slug.spec.js e2e/fixtures.js e2e/room.spec.js`
Expected: `All matched files use Prettier code style!`

- [ ] **Step 9: Manual check, Review Focus 1**

With `npm run build` and `sbt run` on 8080, open a room in Safari, go to another site and press Back. Expected: the page reloads (the network panel shows a new `/join`) and shows the room, not a stale copy. Record the result in the PR.

- [ ] **Step 10: Commit**

```bash
git add -A frontend/src e2e docs/known-issues.md
git commit -m "feat(frontend): the path decides the page (step 8a)" -m "The lobby offers the remembered room instead of joining it, Create and Join go to the room's path, a room's path joins in place, and Leave forgets the room but keeps the name. A page restored from the back/forward cache reloads, and pagehide always sends the beacon while a stream is open. joinAction goes, since no join happens outside its own path."
```

---

### Task 3: The first join and the first `open` win, with StrictMode on

Two cookieless `/join`s from one page each mint a session, and the second cookie replaces the first, so the stream's member and the POSTs' member differ (spec, note h). A double-clicked Join and StrictMode's development double effect both do it.

**Files:**
- Modify: `frontend/src/room/connection.ts` (rewritten below: `join`, `open` as a local function, `JoinResult`)
- Modify: `frontend/src/main.tsx` (`join: api.join`, `StrictMode`, the comment)
- Modify: `frontend/src/components/App.tsx` (`joinHere` calls `connection.join`)
- Modify: `docs/known-issues.md` (delete "A double open can put the page back into a room the user left")
- Test: `frontend/src/room/connection.test.ts`

**Interfaces:**
- Consumes: Task 2's `ConnectionDeps` and `Connection`.
- Produces: `ConnectionDeps.join: (roomId: string, name: string) => Promise<JoinOutcome>`; `export type JoinResult = 'joined' | 'failed' | 'ignored'`; `Connection.join(roomId: string, name: string): Promise<JoinResult>`; `Connection.open` does nothing after the first call or once stopped.

- [ ] **Step 1: Write the failing tests**

```diff
diff --git a/frontend/src/room/connection.test.ts b/frontend/src/room/connection.test.ts
index e563d44..a38411f 100644
--- a/frontend/src/room/connection.test.ts
+++ b/frontend/src/room/connection.test.ts
@@ -1,4 +1,5 @@
 import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
+import type { JoinOutcome } from '../protocol/api'
 import { createConnection, type Stream } from './connection'
 
 class FakeStream implements Stream {
@@ -29,9 +30,11 @@ describe('createConnection', () => {
   let beacons: string[]
   let events: EventTarget
   let location: { assign: Mock<(url: string | URL) => void>; reload: Mock<() => void> }
+  let join: Mock<(roomId: string, name: string) => Promise<JoinOutcome>>
   const connect = () =>
     createConnection({
       connectionId: 'c-1',
+      join,
       openStream: url => {
         const s = new FakeStream(url)
         streams.push(s)
@@ -52,6 +55,7 @@ describe('createConnection', () => {
     beacons = []
     events = new EventTarget()
     location = { assign: vi.fn(), reload: vi.fn() }
+    join = vi.fn(() => Promise.resolve<JoinOutcome>('joined'))
     vi.spyOn(console, 'error').mockImplementation(() => {})
   })
 
@@ -60,6 +64,37 @@ describe('createConnection', () => {
     expect(streams.map(s => s.url)).toEqual(['/rooms/brave-golden-otter/events?connectionId=c-1'])
   })
 
+  it('lets only the first join through, and opens the stream once it succeeds', async () => {
+    let answer: (outcome: JoinOutcome) => void = () => {}
+    join.mockReturnValueOnce(new Promise(resolve => (answer = resolve)))
+    const c = connect()
+    const first = c.join('r', 'Alice')
+    // A double-clicked Join, or StrictMode's second effect, while the first is in flight.
+    expect(await c.join('r', 'Alice')).toBe('ignored')
+    answer('joined')
+    expect(await first).toBe('joined')
+    expect(await c.join('r', 'Alice')).toBe('ignored')
+    expect(join).toHaveBeenCalledTimes(1)
+    expect(streams).toHaveLength(1)
+  })
+
+  it('lets a join through again after a failed one', async () => {
+    join.mockResolvedValueOnce('not-a-room').mockRejectedValueOnce(new Error('join answered 500'))
+    const c = connect()
+    expect(await c.join('r', 'Alice')).toBe('failed')
+    expect(await c.join('r', 'Alice')).toBe('failed')
+    expect(streams).toHaveLength(0)
+    expect(await c.join('r', 'Alice')).toBe('joined')
+    expect(streams).toHaveLength(1)
+  })
+
+  it('lets only the first open through', () => {
+    const c = connect()
+    c.open('r')
+    c.open('r')
+    expect(streams).toHaveLength(1)
+  })
+
   it('stores a parsed snapshot, and ignores a heartbeat and an invalid frame', () => {
     const c = connect()
     c.open('r')
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run --root frontend src/room/connection.test.ts`
Expected: 3 failed: "lets only the first join through, and opens the stream once it succeeds", "lets a join through again after a failed one", "lets only the first open through".

- [ ] **Step 3: Implement**

```diff
diff --git a/frontend/src/components/App.tsx b/frontend/src/components/App.tsx
index 7701fcc..6ab6c3e 100644
--- a/frontend/src/components/App.tsx
+++ b/frontend/src/components/App.tsx
@@ -31,17 +31,10 @@ export function App({ connection }: { connection: Connection }) {
   // In place, so a ?moved=1 banner survives joining.
   const joinHere = () => {
     localStorage.setItem('name', name)
-    api
-      .join(pathRoom, name)
-      .then(outcome => {
-        if (outcome !== 'joined') return setError(joinError)
-        setError('')
-        connection.open(pathRoom)
-      })
-      .catch(reason => {
-        setError(joinError)
-        console.error('Failed to join room:', reason)
-      })
+    void connection.join(pathRoom, name).then(result => {
+      if (result === 'failed') setError(joinError)
+      else if (result === 'joined') setError('')
+    })
   }
 
   const doCreate = () => {
diff --git a/frontend/src/main.tsx b/frontend/src/main.tsx
index 95f95e9..c7838d3 100644
--- a/frontend/src/main.tsx
+++ b/frontend/src/main.tsx
@@ -1,7 +1,9 @@
 import 'bootstrap/dist/css/bootstrap.min.css'
 import './styles.css'
 import { createRoot } from 'react-dom/client'
+import { StrictMode } from 'react'
 import { App } from './components/App'
+import * as api from './protocol/api'
 import { createConnection } from './room/connection'
 import { mintConnectionId } from './room/connectionId'
 
@@ -9,11 +11,16 @@ import { mintConnectionId } from './room/connectionId'
 // beacon would name the id the replacement page is now using.
 const connection = createConnection({
   connectionId: mintConnectionId(),
+  join: api.join,
   openStream: url => new EventSource(url),
   sendBeacon: url => void navigator.sendBeacon(url),
   events: window,
   location: window.location
 })
 
-// No StrictMode: its double effect would join twice, and 8a's close-before-open is not here yet.
-createRoot(document.getElementById('app')!).render(<App connection={connection} />)
+// StrictMode's double effect is safe: the connection lets only the first join and open through.
+createRoot(document.getElementById('app')!).render(
+  <StrictMode>
+    <App connection={connection} />
+  </StrictMode>
+)
diff --git a/frontend/src/room/connection.ts b/frontend/src/room/connection.ts
index 8954467..bb21c57 100644
--- a/frontend/src/room/connection.ts
+++ b/frontend/src/room/connection.ts
@@ -1,3 +1,4 @@
+import type { JoinOutcome } from '../protocol/api'
 import { snapshotSchema, type RoomSnapshot } from '../protocol/snapshot'
 
 export type RoomStore = { lost: boolean; fatal: boolean; snapshot: RoomSnapshot | null }
@@ -13,6 +14,7 @@ export type Stream = {
 
 export type ConnectionDeps = {
   connectionId: string
+  join: (roomId: string, name: string) => Promise<JoinOutcome>
   openStream: (url: string) => Stream
   sendBeacon: (url: string) => void
   // The page's window in the browser; the page listeners live here, not in main.tsx.
@@ -20,9 +22,13 @@ export type ConnectionDeps = {
   location: Pick<Location, 'assign' | 'reload'>
 }
 
+// 'ignored': a join was already in flight or has succeeded, so the caller has nothing to show.
+export type JoinResult = 'joined' | 'failed' | 'ignored'
+
 export type Connection = {
   subscribe(listener: () => void): () => void
   getSnapshot(): RoomStore
+  join(roomId: string, name: string): Promise<JoinResult>
   open(roomId: string): void
   leave(): void
 }
@@ -35,6 +41,7 @@ export function createConnection(deps: ConnectionDeps): Connection {
   let roomId: string | null = null
   let stream: Stream | null = null
   let stopped = false
+  let joining = false
   const listeners = new Set<() => void>()
 
   // The same object between updates, since useSyncExternalStore re-renders on every new one.
@@ -55,6 +62,32 @@ export function createConnection(deps: ConnectionDeps): Connection {
     stream.close()
   }
 
+  // The first open on a page load wins, so nothing can open a second stream.
+  const open = (id: string) => {
+    if (roomId !== null || stopped) return
+    roomId = id
+    const opened = deps.openStream(`/rooms/${id}/events?connectionId=${deps.connectionId}`)
+    stream = opened
+    // A successful (re)connection means any earlier banner from onerror is stale.
+    opened.onopen = () => update({ lost: false, fatal: false })
+    opened.onmessage = event => {
+      // Keep-alive heartbeats arrive as an event with an empty data payload.
+      if (!event.data) return
+      const parsed = snapshotSchema.safeParse(JSON.parse(event.data))
+      if (!parsed.success) {
+        console.error('Dropped an invalid snapshot:', parsed.error)
+        return
+      }
+      update({ snapshot: parsed.data })
+    }
+    // CLOSED means a non-2xx answer the browser will not retry; anything else it is retrying.
+    opened.onerror = event => {
+      if (opened.readyState === CLOSED) update({ lost: false, fatal: true })
+      else update({ lost: true, fatal: false })
+      console.error('EventSource error observed:', event)
+    }
+  }
+
   // Cached or not: a restored page reloads and rejoins, so the member must go either way.
   deps.events.addEventListener('pagehide', () => {
     if (stream !== null && stream.readyState !== CLOSED && roomId !== null) postLeave(roomId)
@@ -71,30 +104,22 @@ export function createConnection(deps: ConnectionDeps): Connection {
     },
     getSnapshot: () => store,
 
-    // Step 8a closes the previous stream first; this port does not yet.
-    open(id) {
-      roomId = id
-      const opened = deps.openStream(`/rooms/${id}/events?connectionId=${deps.connectionId}`)
-      stream = opened
-      // A successful (re)connection means any earlier banner from onerror is stale.
-      opened.onopen = () => update({ lost: false, fatal: false })
-      opened.onmessage = event => {
-        // Keep-alive heartbeats arrive as an event with an empty data payload.
-        if (!event.data) return
-        const parsed = snapshotSchema.safeParse(JSON.parse(event.data))
-        if (!parsed.success) {
-          console.error('Dropped an invalid snapshot:', parsed.error)
-          return
-        }
-        update({ snapshot: parsed.data })
-      }
-      // CLOSED means a non-2xx answer the browser will not retry; anything else it is retrying.
-      opened.onerror = event => {
-        if (opened.readyState === CLOSED) update({ lost: false, fatal: true })
-        else update({ lost: true, fatal: false })
-        console.error('EventSource error observed:', event)
+    // Two cookieless joins would each mint a session, and the second cookie replaces the first.
+    async join(id, name) {
+      if (joining || roomId !== null) return 'ignored'
+      joining = true
+      try {
+        if ((await deps.join(id, name)) !== 'joined') return 'failed'
+        open(id)
+        return 'joined'
+      } catch (reason) {
+        console.error('Failed to join room:', reason)
+        return 'failed'
+      } finally {
+        joining = false
       }
     },
+    open,
 
     // Closed before the beacon, so pagehide cannot send it twice; a stopped page is already going.
     leave() {
```

- [ ] **Step 4: Delete the known issue this closes**

In `docs/known-issues.md`, delete the whole entry "A double open can put the page back into a room the user left", from its `###` heading up to, not including, the next heading.

- [ ] **Step 5: Run the checks**

Run: `npm run typecheck && npm run lint && npm run test:unit`
Expected: no errors; 29 tests pass.

- [ ] **Step 6: Check formatting**

Run: `npx prettier --check --single-quote --no-semi --print-width 100 --trailing-comma none --arrow-parens avoid frontend/src/room/connection.ts frontend/src/room/connection.test.ts frontend/src/main.tsx frontend/src/components/App.tsx`
Expected: `All matched files use Prettier code style!`

- [ ] **Step 7: Manual check, Review Focus 3**

Run `sbt run` in one terminal and `npm run dev` in another, open `http://localhost:5173/<a fresh slug>` in a private window, type a name and click Join twice quickly; then reload with the name remembered. Expected: the network panel shows exactly one `POST /rooms/<slug>/join` each time, and the room renders. Record the result in the PR.

- [ ] **Step 8: Commit**

```bash
git add frontend/src docs/known-issues.md
git commit -m "feat(frontend): the first join and the first open win (step 8a)" -m "Two cookieless joins from one page each mint a session, and the second cookie replaces the first. StrictMode is on now that its double effect is harmless."
```

---

### Task 4: The watchdog, with a self-healing reconnect

A stream that dies silently fires no `onerror`, so the browser never retries and the page freezes on a stale room. A 5 s tick reopens a stream silent for 35 s, closing and detaching the old one first (spec, "One watchdog", "Heard", "Stale", and the matrix's tick rows).

**Files:**
- Modify: `frontend/src/room/connection.ts` (`STALE_MS`, `TICK_MS`, `decide`, `closeStream`, `connect`, `watch`, the tick)
- Modify: `src/main/scala/com/lunatech/pointingpoker/sse/SSE.scala` (`heartbeatInterval`'s doc names `STALE_MS`)
- Modify: `testkit/stub.js` (`freeze(match)`)
- Modify: `docs/roadmap.md` (tick the backlog's connection-liveness watchdog)
- Test: `frontend/src/room/connection.test.ts`, `test/stub.test.js`, `e2e/room.spec.js`, `e2e/fixtures.js` (`participant.freeze`)

**Interfaces:**
- Consumes: Task 3's `connection.ts`.
- Produces: `export const STALE_MS = 35_000`, `export const TICK_MS = 5_000`, `export function decide(readyState: number, heardAt: number, now: number): 'reopen' | 'nothing'`; the stub's `freeze(match: string): void`; the `join` fixture's participant gains `freeze(): Promise<void>`.

- [ ] **Step 1: Write the failing stub tests**

```diff
diff --git a/test/stub.test.js b/test/stub.test.js
index 680a502..613806d 100644
--- a/test/stub.test.js
+++ b/test/stub.test.js
@@ -283,6 +283,41 @@ test('cut refuses an empty match rather than cutting every connection', async t
   assert.throws(() => stub.cut(''), /non-empty cookie match/)
 })
 
+test('a freeze starves the matching live streams and lets new requests through', async t => {
+  const up = await upstream((req, res) => {
+    res.writeHead(200, { 'content-type': 'text/event-stream' })
+    res.write('data: first\n\n')
+    setTimeout(() => res.write('data: second\n\n'), 300)
+  })
+  t.after(() => up.close())
+  const stub = await createStub({ upstream: up.url })
+  t.after(() => stub.close())
+
+  const bob = get(`${stub.baseUrl}/rooms/r/events`, { headers: { cookie: 'session=bob' } })
+  const alice = get(`${stub.baseUrl}/rooms/r/events`, { headers: { cookie: 'session=alice' } })
+  t.after(() => bob.req.destroy())
+  t.after(() => alice.req.destroy())
+  await opened(bob)
+  await opened(alice)
+
+  stub.freeze('bob')
+  const again = get(`${stub.baseUrl}/rooms/r/events`, { headers: { cookie: 'session=bob' } })
+  t.after(() => again.req.destroy())
+  await new Promise(resolve => setTimeout(resolve, 600))
+
+  assert.equal(Buffer.concat(bob.result.chunks).toString(), 'data: first\n\n')
+  assert.equal(bob.result.error, null, 'the frozen socket stays open')
+  assert.equal(bob.result.endedAt, null)
+  assert.match(Buffer.concat(alice.result.chunks).toString(), /second/)
+  assert.match(Buffer.concat(again.result.chunks).toString(), /second/)
+})
+
+test('freeze refuses an empty match rather than freezing every connection', async t => {
+  const stub = await createStub({ upstream: 'http://127.0.0.1:9' })
+  t.after(() => stub.close())
+  assert.throws(() => stub.freeze(''), /non-empty cookie match/)
+})
+
 test('restore lets a cut cookie through again', async t => {
   const up = await upstream((req, res) => {
     res.writeHead(200, { 'content-type': 'text/plain' })
```

- [ ] **Step 2: Run them to verify they fail**

Run: `node --test --test-name-pattern=freeze test/stub.test.js`
Expected: 2 failed with `stub.freeze is not a function`.

- [ ] **Step 3: Implement the stub's freeze**

```diff
diff --git a/testkit/stub.js b/testkit/stub.js
index 5fce496..fc83b70 100644
--- a/testkit/stub.js
+++ b/testkit/stub.js
@@ -38,7 +38,7 @@ export async function createStub({ upstream, deadlineMs = DEADLINE_MS, buffering
     res.on('close', () => state.live.delete(entry))
     // Read once per request: a toggle affects later requests, never one already in flight.
     if (state.buffering) forwardBuffered(req, res, target, deadlineMs)
-    else forwardStreaming(req, res, target)
+    else forwardStreaming(req, res, target, entry)
   })
 
   server.listen(0, '127.0.0.1')
@@ -63,6 +63,14 @@ export async function createStub({ upstream, deadlineMs = DEADLINE_MS, buffering
       state.cuts.add(match)
       for (const entry of state.live) if (entry.cookie.includes(match)) entry.res.destroy()
     },
+    // Stands in for a link that died silently: the live streams carrying this cookie value stay
+    // open and get nothing more, while new requests pass as usual.
+    freeze(match) {
+      if (!match) {
+        throw new Error(`freeze() expected a non-empty cookie match, got ${JSON.stringify(match)}`)
+      }
+      for (const entry of state.live) if (entry.cookie.includes(match)) entry.freeze?.()
+    },
     restore(match) {
       if (match === undefined) state.cuts.clear()
       else state.cuts.delete(match)
@@ -110,13 +118,14 @@ function isCut(state, cookie) {
   return false
 }
 
-function forwardStreaming(req, res, target) {
+function forwardStreaming(req, res, target, entry) {
   const up = openUpstream(req, target)
   up.on('response', upRes => {
     res.writeHead(upRes.statusCode, relayHeaders(upRes.headers))
     // pipe does not forward source errors, and fail502 cannot help once headers are out.
     upRes.on('error', () => res.destroy())
     upRes.pipe(res)
+    entry.freeze = () => upRes.unpipe(res)
   })
   up.on('error', () => fail502(res))
   res.on('close', () => up.destroy())
```

Run: `node --test test/stub.test.js`
Expected: every test passes, the two new ones included.

- [ ] **Step 4: Write the failing unit tests**

```diff
diff --git a/frontend/src/room/connection.test.ts b/frontend/src/room/connection.test.ts
index a38411f..b13b6dc 100644
--- a/frontend/src/room/connection.test.ts
+++ b/frontend/src/room/connection.test.ts
@@ -1,6 +1,6 @@
-import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
+import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
 import type { JoinOutcome } from '../protocol/api'
-import { createConnection, type Stream } from './connection'
+import { createConnection, decide, STALE_MS, type Stream } from './connection'
 
 class FakeStream implements Stream {
   readyState = 0
@@ -25,8 +25,26 @@ const frame = JSON.stringify({
   users: [{ id: 'a', name: 'Alice', estimation: { type: 'NoEstimation' } }]
 })
 
+describe('decide', () => {
+  const CONNECTING = 0
+  const OPEN = 1
+  const CLOSED = 2
+  it.each([
+    [CONNECTING, STALE_MS - 1, 'nothing'],
+    [CONNECTING, STALE_MS, 'reopen'],
+    [OPEN, STALE_MS - 1, 'nothing'],
+    [OPEN, STALE_MS, 'reopen'],
+    [CLOSED, 0, 'nothing'],
+    [CLOSED, STALE_MS, 'nothing']
+  ])('readyState %i, silent for %i ms: %s', (readyState, silence, expected) => {
+    expect(decide(readyState, 1_000, 1_000 + silence)).toBe(expected)
+  })
+})
+
 describe('createConnection', () => {
   let streams: FakeStream[]
+  // Whether another stream was still open as each one opened.
+  let overlapped: boolean[]
   let beacons: string[]
   let events: EventTarget
   let location: { assign: Mock<(url: string | URL) => void>; reload: Mock<() => void> }
@@ -37,6 +55,7 @@ describe('createConnection', () => {
       join,
       openStream: url => {
         const s = new FakeStream(url)
+        overlapped.push(streams.some(other => !other.closed))
         streams.push(s)
         return s
       },
@@ -52,11 +71,17 @@ describe('createConnection', () => {
 
   beforeEach(() => {
     streams = []
+    overlapped = []
     beacons = []
     events = new EventTarget()
     location = { assign: vi.fn(), reload: vi.fn() }
     join = vi.fn(() => Promise.resolve<JoinOutcome>('joined'))
     vi.spyOn(console, 'error').mockImplementation(() => {})
+    vi.useFakeTimers()
+  })
+
+  afterEach(() => {
+    vi.useRealTimers()
   })
 
   it('opens the room stream under the page connection id', () => {
@@ -180,4 +205,55 @@ describe('createConnection', () => {
     streams[0].error()
     expect(listener).toHaveBeenCalledTimes(1)
   })
+
+  it('reopens a stream silent for 35 s, closing and detaching the old one first', () => {
+    const c = connect()
+    c.open('r')
+    streams[0].open()
+    streams[0].message(frame)
+    vi.advanceTimersByTime(STALE_MS - 1)
+    expect(streams).toHaveLength(1)
+    vi.advanceTimersByTime(5_000)
+    expect(streams).toHaveLength(2)
+    expect(overlapped).toEqual([false, false])
+    expect(streams[0].onmessage).toBeNull()
+    expect(streams[1].url).toBe(streams[0].url)
+    expect(c.getSnapshot().lost).toBe(true)
+    streams[1].open()
+    expect(c.getSnapshot().lost).toBe(false)
+  })
+
+  it('keeps a stream fresh past 35 s on heartbeats alone', () => {
+    const c = connect()
+    c.open('r')
+    streams[0].open()
+    for (let i = 0; i < 6; i++) {
+      vi.advanceTimersByTime(15_000)
+      streams[0].message('')
+    }
+    expect(streams).toHaveLength(1)
+  })
+
+  it('gives a reopened stream a full 35 s before judging it again', () => {
+    connect().open('r')
+    vi.advanceTimersByTime(STALE_MS)
+    expect(streams).toHaveLength(2)
+    vi.advanceTimersByTime(STALE_MS - 5_000)
+    expect(streams).toHaveLength(2)
+    vi.advanceTimersByTime(5_000)
+    expect(streams).toHaveLength(3)
+  })
+
+  it('never reopens a closed stream, nor any stream once left', () => {
+    const c = connect()
+    c.open('r')
+    streams[0].readyState = 2
+    vi.advanceTimersByTime(2 * STALE_MS)
+    expect(streams).toHaveLength(1)
+    const d = connect()
+    d.open('s')
+    d.leave()
+    vi.advanceTimersByTime(2 * STALE_MS)
+    expect(streams).toHaveLength(2)
+  })
 })
```

- [ ] **Step 5: Run them to verify they fail**

Run: `npx vitest run --root frontend src/room/connection.test.ts`
Expected: 8 failed: the six `decide` rows, "reopens a stream silent for 35 s, closing and detaching the old one first" and "gives a reopened stream a full 35 s before judging it again".

- [ ] **Step 6: Write the failing e2e case**

```diff
diff --git a/e2e/fixtures.js b/e2e/fixtures.js
index b176312..a5b2efb 100644
--- a/e2e/fixtures.js
+++ b/e2e/fixtures.js
@@ -99,6 +99,7 @@ export const test = base.extend({
         close: () => context.close(),
         cut: async () => stub.cut(await token()),
         restore: async () => stub.restore(await token()),
+        freeze: async () => stub.freeze(await token()),
         newTab
       }
       await page.goto(`/${room}`)
diff --git a/e2e/room.spec.js b/e2e/room.spec.js
index ba01826..39a7a2a 100644
--- a/e2e/room.spec.js
+++ b/e2e/room.spec.js
@@ -494,6 +494,32 @@ test('a disconnection outlasting the grace period comes back without a reload',
   await expect(votedMark(participantRow(bob.page, 'Alice'))).toHaveCount(1, { timeout: 10_000 })
 })
 
+test('a stream frozen without an error is noticed and reopened on its own', async ({ join }) => {
+  // The heartbeat is fixed at 15 s, so noticing takes 35 to 40 s of silence.
+  test.setTimeout(90_000)
+  const alice = await join('Alice')
+  // Recorded as it happens, since the banner lasts only until the reopened stream's onopen.
+  const bob = await join('Bob', {
+    initScript: () =>
+      new MutationObserver(() => {
+        const alert = document.querySelector('[role="alert"]')
+        if (alert?.textContent?.includes('was lost')) window.bannerSeen = true
+      }).observe(document, { childList: true, subtree: true, characterData: true })
+  })
+
+  await bob.freeze()
+  await vote(alice.page, '5')
+  await expect(votedMark(participantRow(alice.page, 'Alice'))).toHaveCount(1)
+  await expect
+    .poll(() => bob.page.evaluate(() => window.bannerSeen === true), { timeout: 45_000 })
+    .toBe(true)
+
+  // The reopened stream's first snapshot, then a frame sent after it.
+  await expect(votedMark(participantRow(bob.page, 'Alice'))).toHaveCount(1)
+  await alice.page.getByRole('button', { name: 'Clear votes' }).click()
+  await expect(votedMark(participantRow(bob.page, 'Alice'))).toHaveCount(0)
+})
+
 test('the issue box resyncs once the editor loses focus', async ({ join }) => {
   const alice = await join('Alice')
   const bob = await join('Bob')
```

Run: `npm run build && npm run stage && npx playwright test -g "frozen without an error" --project=chromium`
Expected: FAIL at the `expect.poll` on `window.bannerSeen` after 45 s, since nothing reopens.

- [ ] **Step 7: Implement the watchdog**

```diff
diff --git a/frontend/src/room/connection.ts b/frontend/src/room/connection.ts
index bb21c57..8e67153 100644
--- a/frontend/src/room/connection.ts
+++ b/frontend/src/room/connection.ts
@@ -34,14 +34,27 @@ export type Connection = {
 }
 
 const CLOSED = 2
+// Twice SSE.heartbeatInterval (15 s) plus a margin, so one late heartbeat is not silence.
+export const STALE_MS = 35_000
+// The tick only samples the clock, so a throttled background tab delays a check but never skews it.
+export const TICK_MS = 5_000
 const initial: RoomStore = { lost: false, fatal: false, snapshot: null }
 
+// The whole watchdog: a closed stream is never reopened, and a silent one is.
+export function decide(readyState: number, heardAt: number, now: number): 'reopen' | 'nothing' {
+  if (readyState === CLOSED) return 'nothing'
+  return now - heardAt >= STALE_MS ? 'reopen' : 'nothing'
+}
+
 export function createConnection(deps: ConnectionDeps): Connection {
   let store = initial
   let roomId: string | null = null
   let stream: Stream | null = null
   let stopped = false
   let joining = false
+  // Date.now rather than performance.now, which can pause while the system sleeps.
+  let heardAt = 0
+  let tick: ReturnType<typeof setInterval> | undefined
   const listeners = new Set<() => void>()
 
   // The same object between updates, since useSyncExternalStore re-renders on every new one.
@@ -54,23 +67,31 @@ export function createConnection(deps: ConnectionDeps): Connection {
   const postLeave = (id: string) =>
     deps.sendBeacon(`/rooms/${id}/leave?connectionId=${deps.connectionId}`)
 
-  // What Leave, a reload and fatal do first, so nothing is left to run against a page load.
-  const stop = () => {
-    stopped = true
+  // Detached as well as closed, so a late event from an old stream can change nothing.
+  const closeStream = () => {
     if (stream === null) return
     stream.onopen = stream.onmessage = stream.onerror = null
     stream.close()
   }
 
-  // The first open on a page load wins, so nothing can open a second stream.
-  const open = (id: string) => {
-    if (roomId !== null || stopped) return
-    roomId = id
+  // What Leave, a reload and fatal do first, so nothing is left to run against a page load.
+  const stop = () => {
+    stopped = true
+    clearInterval(tick)
+    closeStream()
+  }
+
+  const connect = (id: string) => {
     const opened = deps.openStream(`/rooms/${id}/events?connectionId=${deps.connectionId}`)
     stream = opened
+    heardAt = Date.now()
     // A successful (re)connection means any earlier banner from onerror is stale.
-    opened.onopen = () => update({ lost: false, fatal: false })
+    opened.onopen = () => {
+      heardAt = Date.now()
+      update({ lost: false, fatal: false })
+    }
     opened.onmessage = event => {
+      heardAt = Date.now()
       // Keep-alive heartbeats arrive as an event with an empty data payload.
       if (!event.data) return
       const parsed = snapshotSchema.safeParse(JSON.parse(event.data))
@@ -88,6 +109,22 @@ export function createConnection(deps: ConnectionDeps): Connection {
     }
   }
 
+  // Same connection id, so the server replaces the old stream, and a Join lands for each reopen.
+  const watch = (id: string) => {
+    if (decide(stream!.readyState, heardAt, Date.now()) !== 'reopen') return
+    closeStream()
+    connect(id)
+    update({ lost: true })
+  }
+
+  // The first open on a page load wins, so nothing can open a second stream.
+  const open = (id: string) => {
+    if (roomId !== null || stopped) return
+    roomId = id
+    connect(id)
+    tick = setInterval(() => watch(id), TICK_MS)
+  }
+
   // Cached or not: a restored page reloads and rejoins, so the member must go either way.
   deps.events.addEventListener('pagehide', () => {
     if (stream !== null && stream.readyState !== CLOSED && roomId !== null) postLeave(roomId)
diff --git a/src/main/scala/com/lunatech/pointingpoker/sse/SSE.scala b/src/main/scala/com/lunatech/pointingpoker/sse/SSE.scala
index d38448b..a5fc03b 100644
--- a/src/main/scala/com/lunatech/pointingpoker/sse/SSE.scala
+++ b/src/main/scala/com/lunatech/pointingpoker/sse/SSE.scala
@@ -23,8 +23,8 @@ object SSE:
 
   /** Interval between SSE heartbeats. Must stay comfortably below Pekko HTTP's default
     * `pekko.http.server.idle-timeout` (60 seconds), otherwise an idle stream is killed by the
-    * server and read as the participant leaving the room. Pekko renders `ServerSentEvent.heartbeat`
-    * as an event with an empty `data` payload, which the frontend ignores.
+    * server and read as the participant leaving the room. It arrives as an empty `data` event,
+    * which the page counts as heard: `STALE_MS` in `connection.ts` is twice this plus a margin.
     */
   val heartbeatInterval = 15.seconds
 
```

- [ ] **Step 8: Tick the roadmap item**

In `docs/roadmap.md`, under "Backlog: suggested, not yet prioritized", change the first item's `- [ ]` to `- [x]` and append to the end of its text (after "so step 8 should arm it on `pageshow`."):

```markdown
      Done in step 8a, which reopens a silent stream rather than only warning;
      a page restored from the back/forward cache reloads instead of arming it.
```

- [ ] **Step 9: Run the checks**

Run: `npm run typecheck && npm run lint && npm run test:unit && node --test test/stub.test.js`
Expected: no errors; the unit suite passes 39 tests.

Run: `sbt scalafmtCheckAll compile`
Expected: success.

Run: `npm run build && npm run stage && npx playwright test -g "frozen without an error"`
Expected: 2 passed, in about 45 s each.

- [ ] **Step 10: Manual check, Review Focus 2**

On the Android phone, join a room, switch to another app for a minute while someone else votes, and come back. Expected: the vote shows within about 5 s, with no reload (the address never gains `?restarted=1`). Record the result in the PR.

- [ ] **Step 11: Commit**

```bash
git add frontend/src src/main testkit/stub.js test/stub.test.js e2e docs/roadmap.md
git commit -m "feat(frontend): reopen a stream that went silent (step 8a)" -m "A 5 s tick reopens a stream nothing has been heard from for 35 s, twice the heartbeat plus a margin, under the same connection id, closing and detaching the old one first. The stub's freeze starves a live stream without an error, which neither cut nor setOffline does."
```

---

### Task 5: The liveness fetch and the reload on a refusal

A closed stream means a refusal, usually a room gone with a deploy. It gets `GET /<slug>` on the next tick; a `200` reloads to `/<slug>?restarted=1` on a page that reached the room, and shows the ended-session message on one that never did. An invalid snapshot takes the same path (spec, "A closed stream gets a liveness fetch", "An invalid snapshot is a refusal", "Reload only after reaching the room", and the matrix's Closed column).

**Files:**
- Modify: `frontend/src/room/connection.ts` (`FETCH_TIMEOUT_MS`, `decide` with `fetching`, `parse`, `check`, `onerror` and `onmessage`)
- Modify: `frontend/src/main.tsx` (`fetchPage`)
- Modify: `frontend/src/components/App.tsx` (`?restarted=1`), `frontend/src/components/Alerts.tsx` (the restart notice)
- Modify: `docs/known-issues.md`, `docs/superpowers/specs/2026-09-24-frontend-rewrite-design.md` (status line), `docs/superpowers/specs/2026-08-31-protocol-target-architecture-design.md` (step 8's "Landed" paragraph)
- Create: `e2e/refusal.spec.js`
- Test: `frontend/src/room/connection.test.ts`, `e2e/room.spec.js` (the grace-period case), `e2e/fixtures.js` (`app.restart`, `restartNotice`, two comments)

**Interfaces:**
- Consumes: Task 4's `connection.ts`.
- Produces: `ConnectionDeps.fetchPage: (url: string, init: RequestInit) => Promise<Response>`; `ConnectionDeps.location` gains `'replace'`; `export const FETCH_TIMEOUT_MS = 10_000`; `decide(readyState, heardAt, now, fetching: boolean): 'fetch' | 'reopen' | 'nothing'`. `Alerts` gains `restarted: boolean` and `onDismissRestarted: () => void`. The `app` fixture becomes `{ baseUrl, output(), restart(whileDown?: () => Promise<void>) }`; `restartNotice(page)` is exported from `e2e/fixtures.js`.

- [ ] **Step 1: Write the failing unit tests**

```diff
diff --git a/frontend/src/room/connection.test.ts b/frontend/src/room/connection.test.ts
index b13b6dc..826c312 100644
--- a/frontend/src/room/connection.test.ts
+++ b/frontend/src/room/connection.test.ts
@@ -1,6 +1,13 @@
 import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
 import type { JoinOutcome } from '../protocol/api'
-import { createConnection, decide, STALE_MS, type Stream } from './connection'
+import {
+  createConnection,
+  decide,
+  FETCH_TIMEOUT_MS,
+  STALE_MS,
+  TICK_MS,
+  type Stream
+} from './connection'
 
 class FakeStream implements Stream {
   readyState = 0
@@ -30,15 +37,20 @@ describe('decide', () => {
   const OPEN = 1
   const CLOSED = 2
   it.each([
-    [CONNECTING, STALE_MS - 1, 'nothing'],
-    [CONNECTING, STALE_MS, 'reopen'],
-    [OPEN, STALE_MS - 1, 'nothing'],
-    [OPEN, STALE_MS, 'reopen'],
-    [CLOSED, 0, 'nothing'],
-    [CLOSED, STALE_MS, 'nothing']
-  ])('readyState %i, silent for %i ms: %s', (readyState, silence, expected) => {
-    expect(decide(readyState, 1_000, 1_000 + silence)).toBe(expected)
-  })
+    [CONNECTING, STALE_MS - 1, false, 'nothing'],
+    [CONNECTING, STALE_MS, false, 'reopen'],
+    [OPEN, STALE_MS - 1, false, 'nothing'],
+    [OPEN, STALE_MS, false, 'reopen'],
+    [CLOSED, 0, false, 'fetch'],
+    [CLOSED, STALE_MS, false, 'fetch'],
+    [CLOSED, 0, true, 'nothing'],
+    [CLOSED, STALE_MS, true, 'nothing']
+  ])(
+    'readyState %i, silent for %i ms, fetching %s: %s',
+    (readyState, silence, fetching, expected) => {
+      expect(decide(readyState, 1_000, 1_000 + silence, fetching)).toBe(expected)
+    }
+  )
 })
 
 describe('createConnection', () => {
@@ -47,7 +59,12 @@ describe('createConnection', () => {
   let overlapped: boolean[]
   let beacons: string[]
   let events: EventTarget
-  let location: { assign: Mock<(url: string | URL) => void>; reload: Mock<() => void> }
+  let location: {
+    assign: Mock<(url: string | URL) => void>
+    reload: Mock<() => void>
+    replace: Mock<(url: string | URL) => void>
+  }
+  let fetchPage: Mock<(url: string, init: RequestInit) => Promise<Response>>
   let join: Mock<(roomId: string, name: string) => Promise<JoinOutcome>>
   const connect = () =>
     createConnection({
@@ -60,6 +77,7 @@ describe('createConnection', () => {
         return s
       },
       sendBeacon: url => void beacons.push(url),
+      fetchPage,
       events,
       location
     })
@@ -74,7 +92,8 @@ describe('createConnection', () => {
     overlapped = []
     beacons = []
     events = new EventTarget()
-    location = { assign: vi.fn(), reload: vi.fn() }
+    location = { assign: vi.fn(), reload: vi.fn(), replace: vi.fn() }
+    fetchPage = vi.fn(() => Promise.resolve(new Response(null, { status: 502 })))
     join = vi.fn(() => Promise.resolve<JoinOutcome>('joined'))
     vi.spyOn(console, 'error').mockImplementation(() => {})
     vi.useFakeTimers()
@@ -120,14 +139,13 @@ describe('createConnection', () => {
     expect(streams).toHaveLength(1)
   })
 
-  it('stores a parsed snapshot, and ignores a heartbeat and an invalid frame', () => {
+  it('stores a parsed snapshot, and ignores a heartbeat', () => {
     const c = connect()
     c.open('r')
     streams[0].message(frame)
     const stored = c.getSnapshot()
     expect(stored.snapshot?.currentIssue).toBe('PP-1')
     streams[0].message('')
-    streams[0].message('{"you":1}')
     expect(c.getSnapshot()).toBe(stored)
   })
 
@@ -144,16 +162,19 @@ describe('createConnection', () => {
     expect(c.getSnapshot()).toBe(c.getSnapshot())
   })
 
-  it('marks a retrying stream lost and a closed one fatal, and clears both on open', () => {
+  it('shows the banner on any error, and clears it on open or a valid snapshot', () => {
     const c = connect()
     c.open('r')
     streams[0].error()
     expect(c.getSnapshot()).toMatchObject({ lost: true, fatal: false })
     streams[0].open()
-    expect(c.getSnapshot()).toMatchObject({ lost: false, fatal: false })
+    expect(c.getSnapshot().lost).toBe(false)
+    streams[0].error()
+    streams[0].message(frame)
+    expect(c.getSnapshot().lost).toBe(false)
     streams[0].readyState = 2
     streams[0].error()
-    expect(c.getSnapshot()).toMatchObject({ lost: false, fatal: true })
+    expect(c.getSnapshot()).toMatchObject({ lost: true, fatal: false })
   })
 
   it('closes and detaches the stream, sends the beacon and goes to the lobby, on leave', () => {
@@ -256,4 +277,100 @@ describe('createConnection', () => {
     vi.advanceTimersByTime(2 * STALE_MS)
     expect(streams).toHaveLength(2)
   })
+
+  describe('a closed stream', () => {
+    const answer = (status: number) => Promise.resolve(new Response(null, { status }))
+    const refused = (c: ReturnType<typeof connect>, reached: boolean) => {
+      c.open('r')
+      streams[0].open()
+      if (reached) streams[0].message(frame)
+      streams[0].readyState = 2
+      streams[0].error()
+    }
+
+    it('reloads to the restart notice on a 200, having reached the room', async () => {
+      fetchPage.mockReturnValueOnce(answer(200))
+      const c = connect()
+      refused(c, true)
+      await vi.advanceTimersByTimeAsync(TICK_MS)
+      expect(fetchPage).toHaveBeenCalledWith('/r', expect.objectContaining({ redirect: 'manual' }))
+      expect(location.replace).toHaveBeenCalledWith('/r?restarted=1')
+      await vi.advanceTimersByTimeAsync(4 * TICK_MS)
+      expect(fetchPage).toHaveBeenCalledTimes(1)
+      expect(streams).toHaveLength(1)
+    })
+
+    it('shows the ended-session message instead, never having reached the room', async () => {
+      fetchPage.mockReturnValueOnce(answer(200))
+      const c = connect()
+      refused(c, false)
+      await vi.advanceTimersByTimeAsync(TICK_MS)
+      expect(location.replace).not.toHaveBeenCalled()
+      expect(c.getSnapshot()).toMatchObject({ lost: false, fatal: true })
+      await vi.advanceTimersByTimeAsync(4 * TICK_MS)
+      expect(fetchPage).toHaveBeenCalledTimes(1)
+    })
+
+    it('fetches again on each tick, without reloading, while the app is down', async () => {
+      fetchPage
+        .mockReturnValueOnce(answer(502))
+        .mockImplementationOnce(() => Promise.reject(new TypeError('Failed to fetch')))
+        .mockReturnValueOnce(Promise.resolve(Response.error()))
+      const c = connect()
+      refused(c, true)
+      await vi.advanceTimersByTimeAsync(3 * TICK_MS)
+      expect(fetchPage).toHaveBeenCalledTimes(3)
+      expect(location.replace).not.toHaveBeenCalled()
+      expect(c.getSnapshot()).toMatchObject({ lost: true, fatal: false })
+    })
+
+    it('runs one fetch at a time, and abandons a hung one after 10 s', async () => {
+      const signals: AbortSignal[] = []
+      fetchPage.mockImplementation((_url, init) => {
+        signals.push(init.signal!)
+        return new Promise((_resolve, reject) =>
+          init.signal!.addEventListener('abort', () => reject(new DOMException('', 'AbortError')))
+        )
+      })
+      refused(connect(), true)
+      await vi.advanceTimersByTimeAsync(TICK_MS + FETCH_TIMEOUT_MS - 1)
+      expect(signals).toHaveLength(1)
+      await vi.advanceTimersByTimeAsync(TICK_MS)
+      expect(signals[0].aborted).toBe(true)
+      expect(signals).toHaveLength(2)
+    })
+
+    it('takes the refusal path, banner on, for a frame failing to parse or validate', async () => {
+      for (const bad of ['{"you":1}', 'not json']) {
+        fetchPage.mockReturnValueOnce(answer(200))
+        location.replace.mockClear()
+        const c = connect()
+        c.open('r')
+        streams.at(-1)!.message(frame)
+        streams.at(-1)!.message(bad)
+        expect(streams.at(-1)!.closed).toBe(true)
+        expect(c.getSnapshot().lost).toBe(true)
+        await vi.advanceTimersByTimeAsync(TICK_MS)
+        expect(location.replace).toHaveBeenCalledWith('/r?restarted=1')
+      }
+    })
+
+    it('aborts a fetch in flight on leave, and ignores its answer', async () => {
+      let answered: (response: Response) => void = () => {}
+      const signals: AbortSignal[] = []
+      fetchPage.mockImplementationOnce((_url, init) => {
+        signals.push(init.signal!)
+        return new Promise(resolve => (answered = resolve))
+      })
+      const c = connect()
+      refused(c, true)
+      await vi.advanceTimersByTimeAsync(TICK_MS)
+      c.leave()
+      expect(signals[0].aborted).toBe(true)
+      answered(new Response(null, { status: 200 }))
+      await vi.advanceTimersByTimeAsync(TICK_MS)
+      expect(location.replace).not.toHaveBeenCalled()
+      expect(location.assign).toHaveBeenCalledWith('/')
+    })
+  })
 })
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run --root frontend src/room/connection.test.ts`
Expected: 9 failed: the two `decide` rows for a closed stream not fetching, "shows the banner on any error, and clears it on open or a valid snapshot", and all six under "a closed stream".

- [ ] **Step 3: Write the failing e2e cases**

```diff
diff --git a/e2e/fixtures.js b/e2e/fixtures.js
index a5b2efb..2ce08df 100644
--- a/e2e/fixtures.js
+++ b/e2e/fixtures.js
@@ -13,11 +13,20 @@ const guard = async (context, blocked) => {
 }
 
 export const test = base.extend({
+  // restart() keeps the port, so the worker's stub goes on pointing at the new process.
   app: [
     async ({}, use) => {
-      const app = await startApp()
-      await use(app)
-      await app.stop()
+      let current = await startApp()
+      await use({
+        baseUrl: current.baseUrl,
+        output: () => current.output(),
+        restart: async (whileDown = async () => {}) => {
+          await current.stop()
+          await whileDown()
+          current = await startApp({ port: current.port })
+        }
+      })
+      await current.stop()
     },
     { scope: 'worker' }
   ],
@@ -154,9 +163,9 @@ export const hiddenMark = row => row.locator('td').nth(2).locator('svg, i')
 // signal a reveal landed in a room where nobody has voted and the value is empty.
 export const revealedCell = row => row.locator('td').nth(2).locator('div')
 // Any alert, for asserting a reconnect cleared the banner: filtering by text would report
-// hidden when it merely switched to the terminal "session has ended" message.
+// hidden when it merely switched to the "session has ended" message a refused page shows.
 export const connectionAlert = page => page.getByRole('alert')
-// The transient banner specifically, so a terminally dead session is not read as a blip.
+// The banner specifically, so a page that stopped at the ended-session message is not a blip.
 export const connectionLost = page =>
   page.getByRole('alert').filter({ hasText: 'Connection to the room was lost' })
 // Two renderings of one set, so a revealed round shows the same estimations in both. Compared as
@@ -191,5 +200,7 @@ export const ownEstimation = page => page.locator('.estimation-card .estimation-
 
 // The legacy-link banner, a status rather than an alert so connectionAlert never sees it.
 export const movedBanner = page => page.getByRole('status').filter({ hasText: 'old link' })
+// Shown after the reload on a refusal; a status for the same reason as movedBanner.
+export const restartNotice = page => page.getByRole('status').filter({ hasText: 'Reconnected' })
 
 export { expect }
diff --git a/e2e/refusal.spec.js b/e2e/refusal.spec.js
new file mode 100644
index 0000000..441a05a
--- /dev/null
+++ b/e2e/refusal.spec.js
@@ -0,0 +1,70 @@
+import {
+  test,
+  expect,
+  connectionLost,
+  nameInput,
+  participantRow,
+  restartNotice
+} from './fixtures.js'
+
+// Two watchdog ticks, long enough for a reload or a second stream to have happened.
+const TWO_TICKS_MS = 10_000
+
+test('a session ended by restarting the app rejoins under its name with the restart notice', async ({
+  join,
+  app,
+  room
+}) => {
+  const alice = await join('Alice')
+  await join('Bob')
+  await app.restart()
+
+  await expect(restartNotice(alice.page)).toBeVisible({ timeout: 20_000 })
+  await expect(alice.page).toHaveURL(new RegExp(`/${room}$`))
+  await expect(participantRow(alice.page, 'Alice')).toHaveCount(1)
+  await expect(participantRow(alice.page, 'Bob')).toHaveCount(1, { timeout: 20_000 })
+  await restartNotice(alice.page).getByRole('button', { name: 'Dismiss' }).click()
+  await expect(restartNotice(alice.page)).toBeHidden()
+})
+
+test('a page waits under the banner while the app is down, rather than reloading', async ({
+  join,
+  app
+}) => {
+  const alice = await join('Alice')
+  await alice.page.evaluate(() => (window.sameLoad = true))
+
+  await app.restart(async () => {
+    await expect(connectionLost(alice.page)).toBeVisible()
+    // The stub answers 502 meanwhile, which a reload would have landed on.
+    await alice.page.waitForTimeout(TWO_TICKS_MS)
+    expect(await alice.page.evaluate(() => window.sameLoad)).toBe(true)
+  })
+
+  await expect(restartNotice(alice.page)).toBeVisible({ timeout: 20_000 })
+})
+
+test('a page refused before it reached the room stops at the message', async ({
+  page,
+  origin,
+  room
+}) => {
+  const streams = []
+  page.on('request', request => {
+    if (request.url().includes('/events?')) streams.push(request.url())
+  })
+  // Every load would be refused alike, as with a SECURE_COOKIES mismatch, so a reload would loop.
+  await page.route(/\/events\?/, route => route.fulfill({ status: 401 }))
+  await page.goto(`${origin}/${room}`)
+  await page.evaluate(() => (window.sameLoad = true))
+  await nameInput(page).fill('Alice')
+  await page.getByRole('button', { name: 'Join' }).click()
+
+  await expect(page.getByRole('alert')).toHaveText(
+    'Your session has ended. Please reload the page to rejoin.',
+    { timeout: 10_000 }
+  )
+  await page.waitForTimeout(TWO_TICKS_MS)
+  expect(streams).toHaveLength(1)
+  expect(await page.evaluate(() => window.sameLoad)).toBe(true)
+})
diff --git a/e2e/room.spec.js b/e2e/room.spec.js
index 39a7a2a..3764d21 100644
--- a/e2e/room.spec.js
+++ b/e2e/room.spec.js
@@ -15,7 +15,8 @@ import {
   votedMark,
   hiddenMark,
   vote,
-  ownEstimation
+  ownEstimation,
+  restartNotice
 } from './fixtures.js'
 
 test('two browsers exchange votes', async ({ join }) => {
@@ -465,6 +466,8 @@ test('a disconnection outlasting the grace period comes back without a reload',
 }) => {
   const alice = await join('Alice')
   const bob = await join('Bob')
+  // A refused stream would also come back, through the reload, so this mark is what fails it.
+  await bob.page.evaluate(() => (window.sameLoad = true))
 
   await bob.cut()
   await expect(connectionLost(bob.page)).toBeVisible()
@@ -480,8 +483,8 @@ test('a disconnection outlasting the grace period comes back without a reload',
   await expect(participantRow(alice.page, 'Bob')).toHaveCount(0, { timeout: 20_000 })
 
   await bob.restore()
-  // Any alert, not just the transient one: a consumed session ends here on the terminal
-  // "session has ended" banner, which is also an alert and would pass a filtered assertion.
+  // Any alert, not just the banner: a page that stopped at the "session has ended" message
+  // shows an alert too, and would pass a filtered assertion.
   await expect(connectionAlert(bob.page)).toBeHidden({ timeout: 10_000 })
 
   // Bob is back and not duplicated. Identity reuse is not observable here, since his row
@@ -492,6 +495,8 @@ test('a disconnection outlasting the grace period comes back without a reload',
   // A frame arriving after the reconnect, since the alert clearing is only onopen firing.
   await vote(alice.page, '5')
   await expect(votedMark(participantRow(bob.page, 'Alice'))).toHaveCount(1, { timeout: 10_000 })
+  expect(await bob.page.evaluate(() => window.sameLoad)).toBe(true)
+  await expect(restartNotice(bob.page)).toHaveCount(0)
 })
 
 test('a stream frozen without an error is noticed and reopened on its own', async ({ join }) => {
```

Run: `npm run build && npm run stage && npx playwright test e2e/refusal.spec.js --project=chromium`
Expected: 2 failed ("a session ended by restarting the app rejoins under its name with the restart notice" and "a page waits under the banner while the app is down, rather than reloading", both at the restart notice), 1 passed ("a page refused before it reached the room stops at the message", see "Teeth, by mutation" above).

- [ ] **Step 4: Implement**

```diff
diff --git a/frontend/src/components/Alerts.tsx b/frontend/src/components/Alerts.tsx
index b826eb3..b40ea87 100644
--- a/frontend/src/components/Alerts.tsx
+++ b/frontend/src/components/Alerts.tsx
@@ -1,6 +1,14 @@
-type Props = { error: string; copied: boolean; moved: boolean; onDismissMoved: () => void }
+type Props = {
+  error: string
+  copied: boolean
+  moved: boolean
+  onDismissMoved: () => void
+  restarted: boolean
+  onDismissRestarted: () => void
+}
 
-export function Alerts({ error, copied, moved, onDismissMoved }: Props) {
+export function Alerts(props: Props) {
+  const { error, copied, moved, onDismissMoved, restarted, onDismissRestarted } = props
   return (
     <div className="row">
       <div className="col-md-8 offset-md-2">
@@ -23,6 +31,19 @@ export function Alerts({ error, copied, moved, onDismissMoved }: Props) {
             </button>
           </div>
         )}
+        {restarted && (
+          <div className="alert alert-info m-1" role="status">
+            Reconnected. Please check your vote.
+            <button
+              type="button"
+              className="close"
+              aria-label="Dismiss"
+              onClick={onDismissRestarted}
+            >
+              <span aria-hidden="true">&times;</span>
+            </button>
+          </div>
+        )}
       </div>
     </div>
   )
diff --git a/frontend/src/components/App.tsx b/frontend/src/components/App.tsx
index 6ab6c3e..92fc7d4 100644
--- a/frontend/src/components/App.tsx
+++ b/frontend/src/components/App.tsx
@@ -8,9 +8,11 @@ import { useRoom } from './useRoom'
 
 // Read once at startup: the path alone decides the page, and every change of room is a page load.
 const pathRoom = window.location.pathname.split('/')[1] ?? ''
-// Set by the legacy-link redirect; cleared from the address so a copied link is clean.
-const movedOnLoad = new URLSearchParams(window.location.search).get('moved') === '1'
-if (movedOnLoad) history.replaceState(null, '', window.location.pathname)
+// Set by the legacy-link redirect and the reload on a refusal; cleared so a copied link is clean.
+const params = new URLSearchParams(window.location.search)
+const movedOnLoad = params.get('moved') === '1'
+const restartedOnLoad = params.get('restarted') === '1'
+if (movedOnLoad || restartedOnLoad) history.replaceState(null, '', window.location.pathname)
 const joinError = 'Could not join the room. Please try again.'
 // A room remembered from before the cutover is a UUID, which the server's page route redirects.
 const rejoinLabel = (id: string, name: string) =>
@@ -24,6 +26,7 @@ export function App({ connection }: { connection: Connection }) {
   const [tab, setTab] = useState<LobbyTab>(pathRoom ? 'join' : 'create')
   const [error, setError] = useState('')
   const [moved, setMoved] = useState(movedOnLoad)
+  const [restarted, setRestarted] = useState(restartedOnLoad)
   const [copied, setCopied] = useState(false)
   const remembered = localStorage.getItem('roomId')
   const reached = room.snapshot !== null
@@ -97,6 +100,8 @@ export function App({ connection }: { connection: Connection }) {
         copied={copied}
         moved={moved}
         onDismissMoved={() => setMoved(false)}
+        restarted={restarted}
+        onDismissRestarted={() => setRestarted(false)}
       />
       {room.snapshot === null ? (
         <Lobby
diff --git a/frontend/src/main.tsx b/frontend/src/main.tsx
index c7838d3..4923c6d 100644
--- a/frontend/src/main.tsx
+++ b/frontend/src/main.tsx
@@ -14,6 +14,7 @@ const connection = createConnection({
   join: api.join,
   openStream: url => new EventSource(url),
   sendBeacon: url => void navigator.sendBeacon(url),
+  fetchPage: (url, init) => fetch(url, init),
   events: window,
   location: window.location
 })
diff --git a/frontend/src/room/connection.ts b/frontend/src/room/connection.ts
index 8e67153..f61fb0c 100644
--- a/frontend/src/room/connection.ts
+++ b/frontend/src/room/connection.ts
@@ -17,9 +17,10 @@ export type ConnectionDeps = {
   join: (roomId: string, name: string) => Promise<JoinOutcome>
   openStream: (url: string) => Stream
   sendBeacon: (url: string) => void
+  fetchPage: (url: string, init: RequestInit) => Promise<Response>
   // The page's window in the browser; the page listeners live here, not in main.tsx.
   events: EventTarget
-  location: Pick<Location, 'assign' | 'reload'>
+  location: Pick<Location, 'assign' | 'reload' | 'replace'>
 }
 
 // 'ignored': a join was already in flight or has succeeded, so the caller has nothing to show.
@@ -38,14 +39,33 @@ const CLOSED = 2
 export const STALE_MS = 35_000
 // The tick only samples the clock, so a throttled background tab delays a check but never skews it.
 export const TICK_MS = 5_000
+// Longer than a tick, so a slow link can still answer; a fetch hung on a proxy is abandoned.
+export const FETCH_TIMEOUT_MS = 10_000
 const initial: RoomStore = { lost: false, fatal: false, snapshot: null }
 
-// The whole watchdog: a closed stream is never reopened, and a silent one is.
-export function decide(readyState: number, heardAt: number, now: number): 'reopen' | 'nothing' {
-  if (readyState === CLOSED) return 'nothing'
+// The whole watchdog: a closed stream is never reopened but checked, and a silent one is reopened.
+export function decide(
+  readyState: number,
+  heardAt: number,
+  now: number,
+  fetching: boolean
+): 'fetch' | 'reopen' | 'nothing' {
+  if (readyState === CLOSED) return fetching ? 'nothing' : 'fetch'
   return now - heardAt >= STALE_MS ? 'reopen' : 'nothing'
 }
 
+// Null for a frame that is not JSON or fails the schema, which the page treats alike.
+function parse(data: string): RoomSnapshot | null {
+  try {
+    const parsed = snapshotSchema.safeParse(JSON.parse(data))
+    if (parsed.success) return parsed.data
+    console.error('Refused an invalid snapshot:', parsed.error)
+  } catch (reason) {
+    console.error('Refused a frame that is not JSON:', reason)
+  }
+  return null
+}
+
 export function createConnection(deps: ConnectionDeps): Connection {
   let store = initial
   let roomId: string | null = null
@@ -55,6 +75,7 @@ export function createConnection(deps: ConnectionDeps): Connection {
   // Date.now rather than performance.now, which can pause while the system sleeps.
   let heardAt = 0
   let tick: ReturnType<typeof setInterval> | undefined
+  let fetching: AbortController | null = null
   const listeners = new Set<() => void>()
 
   // The same object between updates, since useSyncExternalStore re-renders on every new one.
@@ -78,6 +99,7 @@ export function createConnection(deps: ConnectionDeps): Connection {
   const stop = () => {
     stopped = true
     clearInterval(tick)
+    fetching?.abort()
     closeStream()
   }
 
@@ -94,24 +116,52 @@ export function createConnection(deps: ConnectionDeps): Connection {
       heardAt = Date.now()
       // Keep-alive heartbeats arrive as an event with an empty data payload.
       if (!event.data) return
-      const parsed = snapshotSchema.safeParse(JSON.parse(event.data))
-      if (!parsed.success) {
-        console.error('Dropped an invalid snapshot:', parsed.error)
+      const parsed = parse(event.data)
+      if (parsed === null) {
+        // A refusal: a page open across a wire change reloads onto the new build.
+        closeStream()
+        update({ lost: true })
         return
       }
-      update({ snapshot: parsed.data })
+      update({ snapshot: parsed, lost: false })
     }
-    // CLOSED means a non-2xx answer the browser will not retry; anything else it is retrying.
+    // CLOSED means an error answer the browser will not retry; the next tick checks the app.
     opened.onerror = event => {
-      if (opened.readyState === CLOSED) update({ lost: false, fatal: true })
-      else update({ lost: true, fatal: false })
+      update({ lost: true })
       console.error('EventSource error observed:', event)
     }
   }
 
+  // A 200 comes only from the running app, since a portal's redirect answers status 0 here.
+  const check = async (id: string) => {
+    const controller = new AbortController()
+    fetching = controller
+    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
+    try {
+      const response = await deps.fetchPage(`/${id}`, {
+        redirect: 'manual',
+        signal: controller.signal
+      })
+      void response.body?.cancel()
+      if (stopped || response.status !== 200) return
+      // Reloading a page that never reached the room could loop on a refusal every load repeats.
+      const reached = store.snapshot !== null
+      stop()
+      if (reached) deps.location.replace(`/${id}?restarted=1`)
+      else update({ lost: false, fatal: true })
+    } catch {
+      // Down, offline or abandoned: the next tick fetches again.
+    } finally {
+      clearTimeout(timeout)
+      fetching = null
+    }
+  }
+
   // Same connection id, so the server replaces the old stream, and a Join lands for each reopen.
   const watch = (id: string) => {
-    if (decide(stream!.readyState, heardAt, Date.now()) !== 'reopen') return
+    const decision = decide(stream!.readyState, heardAt, Date.now(), fetching !== null)
+    if (decision === 'fetch') void check(id)
+    if (decision !== 'reopen') return
     closeStream()
     connect(id)
     update({ lost: true })
```

- [ ] **Step 5: Run the new cases green**

Run: `npm run build && npx playwright test e2e/refusal.spec.js`
Expected: 6 passed, in Chromium and Firefox.

Run: `npx playwright test -g "outlasting the grace period"`
Expected: 2 passed.

- [ ] **Step 6: Show the grace-period case failing with `ValidateToken` made to refuse**

Temporarily change `RoomData.removeMember` in `src/main/scala/com/lunatech/pointingpoker/actors/Room.scala` to drop the member's sessions too:

```scala
      this.copy(members = this.members - userId, sessions = this.sessions.filterNot(_._2.userId == userId))
```

Run: `npm run stage && npx playwright test -g "outlasting the grace period" --project=chromium`
Expected: FAIL at `expect(await bob.page.evaluate(() => window.sameLoad)).toBe(true)`, every earlier assertion having passed through the reload.

Then revert it: `git checkout src/main/scala/com/lunatech/pointingpoker/actors/Room.scala && npm run stage`

- [ ] **Step 7: Show the reach rule has a test with teeth**

Temporarily change `if (reached) deps.location.replace` to `if (reached || true) deps.location.replace` in `frontend/src/room/connection.ts`.

Run: `npm run build && npx playwright test e2e/refusal.spec.js -g "stops at the message" --project=chromium`
Expected: FAIL at the `toHaveText` of the ended-session message.

Then undo that one edit by hand (the rest of Step 4 is not committed yet, so `git checkout` would lose it) and run `npm run build`.

- [ ] **Step 8: Docs**

In `docs/known-issues.md`:

1. Delete the whole entry "A page left open across a deploy misreads a changed snapshot", from its `###` heading up to, not including, the next heading.
2. In "A second tab on the same room displaces the first tab's identity", append to the end of its **Issue** paragraph (after "fell in the gap beside it."):

```markdown
  Step 8a's reload on a refusal makes this race routine at every restart:
  every tab on a room reloads within a tick of the app answering, and both
  POST `/join` with a cookie the new process does not know, so each mints a
  session.
```

In `docs/superpowers/specs/2026-09-24-frontend-rewrite-design.md`, change the status line to:

```markdown
Status: Steps 8 and 8a landed; steps 8b and 8c proposed
```

In `docs/superpowers/specs/2026-08-31-protocol-target-architecture-design.md`, step 8's "Landed." paragraph: replace its last sentence, "Steps 8a to 8c extend this paragraph.", with:

```markdown
Step 8a, the connection, in five commits: `Room` ends the stream a `Join`
replaces; the path decides the page, so `/` is always the lobby and Leave keeps
the name; the first join and the first `open` on a page load win, with
StrictMode on; a watchdog reopens a stream silent for 35 s; and a closed stream
gets a liveness fetch, then reloads to `?restarted=1`, or stops at the
ended-session message on a page that never reached the room. Steps 8b and 8c
extend this paragraph.
```

Run: `grep -c $'\u2014' docs/known-issues.md docs/superpowers/specs/2026-09-24-frontend-rewrite-design.md docs/superpowers/specs/2026-08-31-protocol-target-architecture-design.md`
Expected: each file `0`.

- [ ] **Step 9: Run everything**

Run: `npm run typecheck && npm run lint && npm run test:unit`
Expected: no errors; 47 tests pass.

Run: `npm test`
Expected: 17 pass, 0 fail (its `pretest` builds and stages).

Run: `sbt scalafmtCheckAll test`
Expected: all green. `npm run test:unit`'s contract test reads `target/contract/`, which `sbt test` writes.

Run: `npx playwright test`
Expected: 86 passed.

- [ ] **Step 10: Check formatting and line length**

Run: `npx prettier --check --single-quote --no-semi --print-width 100 --trailing-comma none --arrow-parens avoid frontend/src/room/connection.ts frontend/src/room/connection.test.ts frontend/src/main.tsx frontend/src/components/App.tsx frontend/src/components/Alerts.tsx e2e/refusal.spec.js e2e/fixtures.js e2e/room.spec.js`
Expected: `All matched files use Prettier code style!`

- [ ] **Step 11: Manual check, Review Focus 4**

In Firefox on an open room, tick devtools' offline box for a minute, then untick it. Expected: the banner shows, and once online the room comes back on its own, by a reopen (same address) or through the reload (the restart notice). Record which one in the PR.

- [ ] **Step 12: Commit**

```bash
git add frontend/src e2e docs
git commit -m "feat(frontend): reload onto the running app after a refusal (step 8a)" -m "A closed stream gets GET /<slug> on the next tick, one fetch at a time and bounded at 10 s. A 200 reloads to ?restarted=1 on a page that reached the room, whose notice asks the user to check their vote, and stops at the ended-session message on one that never did, so a refusal every load repeats cannot loop. An invalid snapshot takes the same path."
```

---

### Task 6: The whole branch

- [ ] **Step 1: The spec's "Done when" for 8a**

Run: `npm run typecheck && npm run lint && npm run test:unit && npm test && npx playwright test && sbt scalafmtCheckAll test`
Expected: all green; the regenerate-and-diff gate is unaffected, since no endpoint changed.

- [ ] **Step 2: No em dash, no long comment**

Run: `git diff main --unified=0 | grep '^+' | grep -c $'\u2014'`
Expected: `0`.

Run: `git diff main --unified=0 -- '*.ts' '*.tsx' '*.js' '*.scala' | grep -E '^\+\s*//' | wc -l` and read the added comments.
Expected: none runs past two lines.

- [ ] **Step 3: Hand over**

Report the commit list, the manual checks' results, and that nothing is pushed or merged. The user drives the PR and the merge window.
