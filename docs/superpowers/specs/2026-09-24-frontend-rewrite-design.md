# Frontend Rewrite (Steps 8 and 8a)

Date: 2026-09-24
Status: Proposed
Parent: `docs/superpowers/specs/2026-08-31-protocol-target-architecture-design.md`, "Step 8. Frontend rewrite."

## Purpose

The page is one hand-written `src/main/resources/pages/index.html`: Vue 2.6,
end of life since 2023, with Bootstrap 4, axios and feather-icons loaded from
three public CDNs and no build step. The parent design's step 8 replaces it
with TypeScript, build tooling, components, a connection module and client
types checked against the server contract, then adds a theme and a responsive
layout. This document settles how, and splits the work in two:

- **Step 8, technical migration.** A new stack behind a page that looks the
  same, followed by a small number of deliberate behaviour changes.
- **Step 8a, UI/UX.** The redesign, on code already known to be correct.

Both steps follow the parent design's branch naming:
`20260831.protocol_architecture_8_frontend_rewrite` now, and an `8a` branch
under the same prefix later.

## Decisions and their reasons

**Two steps, not one.** In one big change the page's behaviour and its tests
move together, so nothing independent says whether a difference is a bug or an
intended redesign. Holding the look still in step 8 keeps the Playwright suite
an honest judge of the migration, which matters because the connection logic
carries guarantees from steps 1 and 6. The cost is that step 8's markup is
restyled in 8a. A third step for the connection duties alone was considered and
declined: about 30 lines without the watchdog and under 200 with it, too small
for its own review and merge round when every merge to `main` restarts the
server. Those duties land instead as separate trailing commits in step 8, so its
review still sees "same behaviour, new stack" and "behaviour change" as distinct
diffs.

**React.** Vue 3, React and Angular were compared. None limits anything on the
roadmap, since every planned feature is snapshot fields, DOM events or browser
APIs. React won on four points specific to this app and its maintainers:

- The server sends whole immutable snapshots, which is React's model exactly,
  and `useSyncExternalStore` is built for subscribing to an outside store such
  as the connection module. Vue's fine-grained mutable tracking buys little when
  nothing is mutated in place.
- JSX is TypeScript, so plain `tsc` checks markup against the contract types.
  Vue templates need `vue-tsc` on top.
- The maintainers are Scala developers working with an AI assistant. React's
  "UI as a function of state" is close to how they already write code, and it
  has the deepest AI coverage, without Vue's trap of mixing 2.x and 3.x idioms
  in a repo whose history is Vue 2.
- Angular's strengths (enforced structure across many developers, forms, DI
  across many services) are weight a single page does not use, at the largest
  learning cost of the three.

The cost is that step 8 rewrites the markup instead of porting Vue templates,
about 240 lines.

**Framework-agnostic core.** Lock-in comes from logic written in a framework's
idioms and from the component library, not from the framework itself. So the
connection, the room state and the contract types are plain TypeScript with no
React import, and React is the view layer only. Replacing it later would mean
rewriting views and nothing else.

**Mobile is a responsive web page.** People join from a link during a meeting
and stay an hour or two, so needing nothing installed is the most valuable
property, and nothing planned needs native capabilities. React Native would not
have reused the web components anyway. A progressive web app (home-screen
install, web push) stays open as a cheap later addition for any framework.

**The repo owns the page path.** Clever Cloud's `INDEX_PATH` only overrode
`application.conf`'s identical default, so it is removed from the console
before step 8 merges. Step 8 then moves the default in the same commit as the
build that produces the file, with no console change to time against a deploy.

**sbt drives npm, only when packaging.** Clever runs sbt from source on each
push, then starts the app from the checkout. A `frontendBuild` task that `stage`
depends on keeps Clever's existing build working unchanged. `compile` and `test`
never need Node or a built page, because CI runs `sbt qa`, whose first command
is `clean`, before it sets Node up. `run` does not build the page either: in the
dev loop Vite serves it. A Clever build hook was declined because it would put
the build back in the console, and npm driving sbt because Clever calls sbt.

**Strict snapshot contract.** The parent design's contract test let a new server
field pass, so that backend work could land ahead of its UI. This document makes
it strict, superseding that rule: a field the client schema does not list fails
the test. The concern is not production, where client and server always come
from one commit and a session never outlives its server, but development, where
an unacknowledged field is silent. Usually that only means "not rendered yet",
but a field that changes the meaning of existing ones leaves a client that
ignores it wrong, not just incomplete. The strict test forces every new field
into the client schema in the same PR, as a one-line acknowledgement a reviewer
can question, and backend-first work still fits by adding the field unrendered.
The runtime parse in the page stays lenient, since strictness there could only
break the page. One rule goes with it: **a new field never changes the meaning
of an existing one**; a changed meaning gets a new name, and the rename fails
the test.

## Scope and sequencing

Step 8's commits, in order:

1. **Tooling.** Vite, TypeScript, React, zod, the sbt `frontendBuild` task, the
   page served from `target/frontend/`, and `index-path` defaulting there.
   Today's page moves by `git mv` to `frontend/index.html`, so no copy survives
   to be served instead; Vite leaves its CDN tags alone. `testkit/app.js`'s
   `INDEX_PATH` moves to `target/frontend/index.html` in the same commit.
2. **Straight port.** Today's behaviour and markup, Bootstrap, icons and axios
   bundled instead of loaded from CDNs, `applySnapshot` carried over unchanged.
   axios comes from npm until commit 3 replaces it.
3. **Contracts.** The OpenAPI document, `openapi-typescript` and
   `openapi-fetch` replacing axios, the regenerate-and-diff gate, and the strict
   snapshot contract test.
4. **Behaviour changes, as separate commits:** close the old stream before
   opening a new one; the watchdog with self-healing reconnect; the issue
   editor's cancel and conflict notice.

The pass condition for commits 1 to 3 is the existing e2e suite green with at
most listed selector changes. Each commit in 4 brings a test shown failing
against the commit before it.

Step 8a: component library and look, light and dark theme, responsive layout,
the frozen-deck tooltip step 3a declined, restyling the editor, and placing the
participants list above the results. It restyles step 8's interactions and does
not redesign them; a different interaction there is a deliberate decision with
a known cost.

Known issues this closes:

| Entry in `docs/known-issues.md` | Closed by |
| --- | --- |
| The page and the browser suite depend on three public CDNs at runtime | Step 8, commit 2, together with the CDN notes in `playwright.config.js`. The `assets` fixture in `e2e/fixtures.js` becomes a guard that fails any case whose page requests a host other than `127.0.0.1` |
| The issue editor has no cancel, and an unfocused draft is replaced by any room activity | Step 8, commit 4 |
| A reveal with votes still pushes the participants list down | Step 8a, as a layout change |

## Frontend architecture

Three layers, with dependencies pointing only downward:

```
components (React)     App, Lobby, RoomHeader, Alerts, IssueEditor,
        |              Deck, Results, Participants, Controls
        v
room state (plain TS)  connection store, view derivation
        |
        v
protocol (plain TS)    zod snapshot schema, generated API types, typed client
```

**Protocol** (`frontend/src/protocol/`). `snapshot.ts` holds the zod schema for
`RoomSnapshot` and the type inferred from it. The schema is written once, as a
function of the object constructor that every nested object goes through, and
exported twice: `snapshotSchema` with `z.object` for the page and
`strictSnapshotSchema` with `z.strictObject` for the contract test. zod's
strictness is per object, so two hand-written schemas could drift apart
silently. `generated/openapi.json` and `generated/openapi.d.ts` are committed
outputs of tapir and `openapi-typescript`. `api.ts` is the `openapi-fetch`
client, so every command's path, body and responses are checked at compile time.

**Room state** (`frontend/src/room/`), with no React import. `connection.ts`
owns the stream: the page's connection id, the `EventSource`, close-before-open,
the watchdog, the leave beacon and the `pagehide`, `pageshow` and
`visibilitychange` listeners. It exposes a store of
`{ status: connecting | open | lost | ended, snapshot }` through `subscribe` and
`getSnapshot`, the shape `useSyncExternalStore` consumes. `getSnapshot` returns the same object until
something changes, since a fresh object per call makes React re-render forever.
`view.ts` is today's `applySnapshot`: the tally, the reader's own estimation and
whether it is confirmed. The editor commit removes its `issueFocused` input,
leaving a pure function of the snapshot.

**Components** (`frontend/src/components/`) follow today's page regions and
read room state through one hook, `useRoom`. Purely local UI state (the lobby
tab, the clipboard hint, the editor's draft through `useIssueEditor`) stays in
the component that owns it.

**Data flow.** Snapshot frame, parsed by the connection, into the store, out to
components. User actions go through `api.ts` as POSTs and their effect returns
as the next snapshot. Nothing updates optimistically except the editor showing
its own text while a save settles.

**Not added:** a router library (the path is read once at startup, as today:
`/<slug>` and `?moved=1`), a state library, CSS-in-JS.

**Layout.** `frontend/` at the repo root holds `index.html`, `src/`,
`vite.config.ts` and `tsconfig.json`. There is one root `package.json`, shared
with Playwright, so Clever, CI and a laptop run one `npm ci` against one
lockfile. Playwright's browsers are a separate download, which keeps Clever's
install light.

**Keeping the look in step 8.** Bootstrap from npm at 4.6.2, the last 4.x
release, in place of the CDN's 4.4.1; the e2e suite and a side-by-side look
confirm the two render alike. feather-icons becomes `lucide-react`, Feather's
maintained continuation, with Lucide's equivalents of the five icons in use
(`check`, `check-circle`, `edit-2`, `lock`, `shield-off`).

## Build, serving and the dev loop

**`frontendBuild`.** Runs `npm run build`; Vite writes to `target/frontend/`,
which is gitignored and cleared by `sbt clean`. `stage` depends on it. Before
building it runs `npm ci --include=dev --prefer-offline --no-audit --no-fund
--fetch-timeout=60000`, but only when `node_modules/.frontend-install-stamp`,
a hash of `package-lock.json` written after a successful install, is missing or
stale. Otherwise every `npm test` and `npm run e2e` would reinstall through
their `stage` pre-hooks, and `npm ci` deletes `node_modules` under a running
Vite dev server. The flags are CI's, whose comment records the 300 s audit
stall, and `--include=dev` keeps the build working if `NODE_ENV=production` is
ever set. The stamp lives in `node_modules`, so `sbt clean` does not force a
reinstall. `Universal / mappings` includes `target/frontend` so a zip or
Docker build stays complete. `probe.html` and its mapping are untouched.

**Node guard.** `package.json` declares `"engines": { "node": ">=22.12" }` and
a committed `.npmrc` sets `engine-strict=true`, so `npm ci` refuses an older
Node with its own message. A missing `node` makes the sbt task fail with
"Node >= 22.12 is needed to package the frontend". Clever's image had Node
24.21.0 and npm 11.19.0 on 2026-09-24, matching CI's Node 24; the guard is there
because Clever updates its image on its own schedule.

**Serving.** `ApiConfig.indexPath` defaults to `target/frontend/index.html`
and keeps `PageRoutes`' `no-cache` revalidation. A new `/assets/` route serves
Vite's content-hashed files with `Cache-Control: public, max-age=31536000,
immutable`; a file's name changes with its content, and the revalidated page
names the new files after a deploy. It reads the `assets/` directory beside
`index-path`, so the one setting locates both and an override such as testkit's
or Docker's `INDEX_PATH` cannot serve a page without its scripts. Step 7's
route hazard is closed three ways: Vite emits everything under `/assets/`, two
segments deep where `PageRoutes`' `path(Segment)` cannot match; nothing is
emitted at the root; and the route sits before `PageRoutes` in `API.route`.

**Startup check.** The server refuses to start when the `index-path` file does
not exist, logging why. Clever's health check accepts any status from 200 to
500, so a missing page would otherwise deploy successfully and answer `404` to
everyone. Failing at startup leaves no listening port, which fails the deploy
and keeps the previous instance serving. The check is `require-index`, `true` in
`application.conf`, and `build.sbt` sets it `false` through `run / javaOptions`
(`run` forks): the dev loop's `sbt run` needs no built page, and a fresh
checkout or an `sbt clean` would otherwise stop it from starting. Under `run` a
missing page logs a warning and `/` answers `404`. Everything started through
the staged launcher (Clever, Docker, the zip, testkit) keeps the check.

**Generated API types.** An sbt task writes tapir's OpenAPI document to
`frontend/src/protocol/generated/openapi.json`, adding `tapir-openapi-docs`;
`npm run gen:api` runs `openapi-typescript` into `openapi.d.ts`. Both are
committed, so Clever's build needs no generation step, and CI regenerates them
and fails on `git diff`.

**Snapshot contract test.** A Scala test builds snapshots through
`RoomSnapshot.of` and the production encoder for representative states (before
the reveal with the reader's own estimate, after the reveal, an empty issue)
and writes them to `target/contract/`. A Vitest test parses each with the strict
schema, and fails with "run sbt test first" when the files are absent rather
than passing on nothing. CI's `sbt qa` already runs before it.

**CI additions.** `tsc` in strict mode, ESLint with the React hooks rule,
Vitest as `npm run test:unit`, and the regenerate-and-diff check. Vitest gets
its own script because `npm test` stays `node --test` behind a `stage`
pre-hook that unit tests do not need. This edits
`.github/workflows/ci.yml`, which the `gh` token cannot merge, so the PR is
merged in GitHub's interface.

**Dev loop.** `npm run dev` starts Vite's dev server with hot reload and
forwards `/rooms` and `/create-room` to `sbt run` on port 8080, SSE included.
`/<slug>` works because Vite serves the page for unknown paths. The server-side
page logic (the not-a-room page, the UUID redirect) is not reproduced there;
the e2e suite covers it against the staged app.

## Connection behaviour

| Event | Result |
| --- | --- |
| `open()` | Closes any existing stream, opens one with the page's connection id. Status `connecting`, watchdog armed |
| `onopen` | Status `open`; any connection banner clears |
| Heartbeat (empty frame) | Records "last heard from" |
| Snapshot frame | Parsed with zod. Valid: the store updates. Invalid: logged and dropped. Either way, records "last heard from" |
| `onerror`, `readyState` CLOSED | Status `ended`: "Your session has ended. Please reload the page to rejoin." No reconnect, since the session is gone |
| `onerror`, `readyState` CONNECTING | Status `lost`: "Connection to the room was lost". The browser retries on the server's `retry` interval |
| 35 s without hearing anything | Status `lost`, then close and reopen with the same connection id |
| `visibilitychange` to visible | Reconnect at once if "last heard from" is older than 35 s. Tab switches are frequent and each reconnect is a Join published to the room |
| `pageshow` with `persisted` | Reconnect at once, always: a restored page may hold a stream closed while it was cached, and its member may be gone after the grace period |
| `leave()` | Closes the stream, then sends the leave beacon |
| `pagehide`, not entering the back/forward cache, while in a room | Sends the leave beacon |

`ended` and `leave()` are terminal: the watchdog is disarmed and the resume
rows do nothing until the next `open()`. Otherwise an ended page would retry
into a `401` every 35 s, and a page that left would rejoin, since sessions are
retained and a Join re-adds the member.

**Why the watchdog reconnects rather than only warning.** A stream that dies
silently (a network drop, a sleeping laptop, a phone suspending the tab) often
fires no `onerror`, so the browser believes it is open and never retries, and
the page freezes on a stale room. The roadmap's backlog recorded this from
manual testing with devtools' offline mode. Reopening with the same connection
id is the path the browser's own retry takes, and the server already supports
it: `RoomData.connect` replaces by id and `RoomData.disconnect` removes by
value, so a live replacement survives.

**Why timestamps.** Browsers throttle timers in background tabs, so the
watchdog compares "last heard from" against the clock instead of trusting a
timer to fire on time, which is also what makes the resume check work. The
35 s is twice `SSE.heartbeatInterval` (15 s) plus a margin; the constant in
`connection.ts` and `SSE.heartbeatInterval` each name the other.

## Issue editor behaviour

Today the only protection for a draft is keyboard focus: every snapshot writes
the room's issue into the box unless the editable input is focused. Losing
focus, including alt-tabbing to copy a ticket title, lets the next room activity
replace the draft, and the only exit from edit mode is the check, which posts
whatever the box holds. Guarding the whole of edit mode was rejected at step 1
because, without a cancel, a user who opened the editor and clicked away would
silently stop receiving issue updates. A cancel and a conflict notice remove
that objection, so step 8 guards the whole of edit mode.

`useIssueEditor` holds the logic and `IssueEditor` the markup; step 8a
rewrites only the markup.

| State | Shows | Transitions |
| --- | --- | --- |
| viewing | The room's issue, read-only, with a pencil | Pencil: to editing, with draft and starting point both set to the room's issue |
| editing | The draft, editable | Enter or check: to saving. Escape or cancel: to viewing, draft dropped |
| editing, conflict | The draft, plus "Changed by someone else to: X" and "Use theirs" | Shown while the room's issue differs from the starting point. "Use theirs" sets draft and starting point to X. Saving overwrites X knowingly |
| saving | The draft, read-only | POST fails: to editing, draft kept, "Could not save the issue". POST succeeds: to settling |
| settling | The saved text | To viewing when a snapshot carries the saved text, on a reconnect, or after 5 s |

**Why settling exists.** `Room` replies `Applied` and publishes while handling
the same message, so a completed POST means the room holds the value, but the
SSE frame carrying it can reach the browser after the HTTP response. Returning
to snapshots at once would flash the old text. Each connection receives the
room's snapshots in order, so the one carrying the edit precedes any later
edit's, and waiting for the saved text cannot hide someone else's later change.
The reconnect and the timeout cover the one case where that snapshot never
arrives: a slow client whose queue dropped it on overflow.

This also removes both narrow windows the parent design recorded for the focus
guard, the blur landing before the commit click and the revert during the save
round trip, along with `issueFocused` itself.

## Error handling

Join, create and the not-a-room redirect keep today's messages and behaviour.
Show, clear, re-vote and vote failures keep today's console-only logging: a
refused command changes nothing visible, and the next snapshot is the truth.

## Testing

- **The existing e2e suite, in Chromium and Firefox, is the judge of commits 1
  to 3.** The port keeps Bootstrap's markup and class names, so the suite
  should pass unchanged, CSS-class selectors included (`tbody tr`,
  `.estimation-button-selected`, `#join-roomId`). Any selector change is listed
  in the PR with its reason. Moving those to role-based selectors belongs to
  step 8a, where the markup changes.
- **The off-origin guard.** From commit 2, `context` routes every request:
  `127.0.0.1`, the stub and the app, continues, anything else is aborted and
  recorded, and the fixture fails the case if anything was. It fails against
  commit 1, whose page still loads the CDNs, and keeps "no CDN request" true
  after later dependency changes.
- **New e2e cases**, each shown failing against the commit before it: going
  offline with `context.setOffline(true)`, returning, and seeing the room
  update; a draft surviving blur and room activity; cancel restoring the room's
  issue; a concurrent change showing the notice; "Use theirs"; saving over a
  concurrent change. The editor cases find elements by role and name, so step
  8a's restyle does not break them.
- **The Scala specs need no built page.** `APISpec`'s index cases write a
  fixture page to a temp file and build `ApiConfig` with it, since `sbt qa`
  starts with `clean`. `ApiConfigSpec` asserts the new default.
- **Vitest unit tests** in `frontend/src/**/*.test.ts`: `connection.ts` with a
  fake `EventSource` and fake timers, covering every row of the connection table
  and the terminal rule under it; `view.ts`; every `useIssueEditor` transition,
  including the three ways settling ends; the strict contract test. They do not
  overlap `node --test`'s `test/` folder, and CI runs both.

## Docs in the same PR

- `README.md`: Node 22.12 or newer to stage; the dev loop; `npm run test:unit`;
  asset caching; the page path now owned by `application.conf`.
- `docs/known-issues.md`: remove the CDN entry and the editor entry.
- `docs/roadmap.md`: tick Phase 3's migration items, leaving appearance to 8a,
  and reword "tentatively Vue 3, framework choice still open" to React; tick
  the backlog's connection-liveness watchdog, which step 8 delivers.
- The parent design: step 8's "Landed" paragraph. The pointers from its step 8
  section and its contract test to this document land with this document.

## Rollout

1. Remove `INDEX_PATH` from the Clever console, any time before the merge.
2. Merge in GitHub's interface, because of the `ci.yml` change.
3. The merge restarts the server and ends every live room, so it waits for a
   confirmation that no rooms are in use.
4. After the first deploy, read the deploy log for the `npm ci` and Vite lines
   and open a room.

## Done when

The e2e suite is green, unchanged or with listed selector changes; the new e2e
and unit tests pass and were shown failing first; `tsc`, ESLint and the
regenerate-and-diff gate are green; the off-origin guard is in place; and the
docs above are updated.
